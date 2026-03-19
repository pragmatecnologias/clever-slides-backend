import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class ElevenLabsProvider {
  private apiKey: string;
  private storagePath: string;
  private apiUrl = 'https://api.elevenlabs.io/v1';
  private localApiUrl: string;
  private localGeneratePath: string;
  private localVoicesPath: string;
  private localDefaultVoice: string;
  private localModel: string;
  private localTimeoutMs: number;

  constructor(private configService: ConfigService) {
    this.apiKey = this.configService.get('ELEVENLABS_API_KEY');
    this.storagePath = this.configService.get('STORAGE_PATH') || './uploads';
    this.localApiUrl = this.configService.get('LOCAL_TTS_API_URL') || 'http://localhost:5500';
    this.localGeneratePath = this.configService.get('LOCAL_TTS_GENERATE_PATH') || '/api/tts';
    this.localVoicesPath = this.configService.get('LOCAL_TTS_VOICES_PATH') || '/api/voices';
    this.localDefaultVoice = this.configService.get('LOCAL_TTS_DEFAULT_VOICE') || 'alloy';
    this.localModel = this.configService.get('LOCAL_TTS_MODEL') || 'kokoro';
    this.localTimeoutMs = Number(this.configService.get('LOCAL_TTS_TIMEOUT_MS') || 60000);
    const audioPath = path.join(this.storagePath, 'audio');
    if (!fs.existsSync(audioPath)) {
      fs.mkdirSync(audioPath, { recursive: true });
    }
  }

  async generate(
    provider: string,
    text: string,
    voiceId?: string,
    narrationPrompt?: string,
  ): Promise<{ filePath: string; durationSeconds: number }> {
    if (provider === 'local') {
      return this.generateLocal(text, voiceId, narrationPrompt);
    }
    if (provider === 'elevenlabs') {
      return this.generateElevenLabs(text, voiceId, narrationPrompt);
    }
    throw new BadRequestException(`Unknown audio provider: ${provider}`);
  }

  private async generateElevenLabs(
    text: string,
    voiceId?: string,
    narrationPrompt?: string,
  ): Promise<{ filePath: string; durationSeconds: number }> {
    if (!this.apiKey) {
      throw new BadRequestException('ELEVENLABS_API_KEY is not configured');
    }

    const selectedVoiceId = voiceId || 'EXAVITQu4vr4xnSDxMaL'; // Default voice (Sarah)

    try {
      const response = await axios.post(
        `${this.apiUrl}/text-to-speech/${selectedVoiceId}`,
        {
          text,
          model_id: 'eleven_monolingual_v1',
          voice_settings: this.resolveVoiceSettings(narrationPrompt),
        },
        {
          headers: {
            'xi-api-key': this.apiKey,
            'Content-Type': 'application/json',
          },
          responseType: 'arraybuffer',
        },
      );

      const filepath = this.writeAudioFile(Buffer.from(response.data), 'elevenlabs');
      return { filePath: filepath, durationSeconds: this.estimateDurationSeconds(text) };
    } catch (error) {
      console.error('ElevenLabs API error:', error.response?.data || error.message);
      throw new BadRequestException('Failed to generate audio with ElevenLabs');
    }
  }

  private async generateLocal(
    text: string,
    voiceId?: string,
    narrationPrompt?: string,
  ): Promise<{ filePath: string; durationSeconds: number }> {
    const baseUrls = this.buildLocalBaseUrls();
    const normalizedGeneratePath = String(this.localGeneratePath || '/v1/audio/speech').startsWith('/')
      ? String(this.localGeneratePath || '/v1/audio/speech')
      : `/${String(this.localGeneratePath || '/v1/audio/speech')}`;
    const url = `${baseUrls[0]}${normalizedGeneratePath}`;
    const selectedVoiceId = voiceId || this.localDefaultVoice;
    const openTtsVoiceCandidates = this.buildOpenTtsVoiceCandidates(selectedVoiceId, text);
    const compactText = String(text || '').trim();
    const compactPrompt = String(narrationPrompt || '').trim();
    const attempts: Array<{
      method: 'post' | 'get';
      url: string;
      payload?: Record<string, any>;
      params?: Record<string, any>;
    }> = [];
    for (const baseUrl of baseUrls) {
      attempts.push(
        {
          method: 'post',
          url: `${baseUrl}${normalizedGeneratePath}`,
          payload: {
            model: this.localModel,
            input: compactText,
            text: compactText,
            voice: selectedVoiceId,
            voice_id: selectedVoiceId,
            response_format: 'mp3',
            format: 'mp3',
            prompt: compactPrompt || undefined,
            instruction: compactPrompt || undefined,
          },
        },
        {
          method: 'post',
          url: `${baseUrl}${normalizedGeneratePath}`,
          payload: {
            model: this.localModel,
            input: compactText,
            voice: selectedVoiceId,
            response_format: 'mp3',
          },
        },
        {
          method: 'post',
          url: `${baseUrl}/tts`,
          payload: {
            model: this.localModel,
            text: compactText,
            voice: selectedVoiceId,
          },
        },
        {
          method: 'post',
          url: `${baseUrl}/tts`,
          payload: {
            text: compactText,
          },
        },
        {
          method: 'get',
          url: `${baseUrl}/api/tts`,
          params: {
            text: compactText,
          },
        },
      );
      for (const openTtsVoice of openTtsVoiceCandidates) {
        attempts.push({
          method: 'get',
          url: `${baseUrl}/api/tts`,
          params: {
            text: compactText,
            voice: openTtsVoice,
          },
        });
      }
    }

    const errors: string[] = [];
    try {
      for (const attempt of attempts) {
        try {
          const response = await axios.request({
            method: attempt.method,
            url: attempt.url,
            data: attempt.payload,
            params: attempt.params,
            responseType: 'arraybuffer',
            timeout: this.localTimeoutMs,
            headers: {
              Accept: 'audio/mpeg,audio/wav,application/json',
            },
          });
          const contentType = String(response.headers?.['content-type'] || '');
          const audioBuffer = this.extractAudioBuffer(response.data, contentType);
          const filepath = this.writeAudioFile(audioBuffer, 'local');
          return { filePath: filepath, durationSeconds: this.estimateDurationSeconds(compactText) };
        } catch (attemptError) {
          errors.push(this.formatAxiosError(attemptError, attempt.url));
        }
      }
    } catch (error) {
      errors.push(this.formatAxiosError(error, url));
    }
    const diagnostic = errors.filter(Boolean).slice(-2).join(' | ');
    const connectivityIssue = errors.some((entry) =>
      /(request failed|econnrefused|enotfound|network error|timed out|timeout)/i.test(String(entry || '')),
    );

    if (connectivityIssue && this.apiKey) {
      console.warn(
        `Local TTS unavailable, falling back to ElevenLabs. Local diagnostic: ${diagnostic || 'unknown'}`,
      );
      return this.generateElevenLabs(text, voiceId, narrationPrompt);
    }

    console.error('Local TTS API error:', diagnostic || 'Unknown local TTS error');
    throw new BadRequestException(
      `Failed to generate audio with local TTS${diagnostic ? ` (${diagnostic})` : ''}. ` +
        `Verify LOCAL_TTS_API_URL (${this.localApiUrl}) is running or switch provider to ElevenLabs.`,
    );
  }

  async getVoices(provider = 'local'): Promise<any[]> {
    if (provider === 'local') {
      return this.getLocalVoices();
    }
    if (provider !== 'elevenlabs') {
      return [];
    }
    if (!this.apiKey) {
      return [{
        voice_id: this.localDefaultVoice,
        name: this.localDefaultVoice,
        provider: 'local',
        labels: { gender: 'neutral' },
      }];
    }

    try {
      const response = await axios.get(`${this.apiUrl}/voices`, {
        headers: {
          'xi-api-key': this.apiKey,
        },
      });

      return response.data.voices || [];
    } catch (error) {
      console.error('Failed to fetch ElevenLabs voices:', error.message);
      return [];
    }
  }

  private async getLocalVoices(): Promise<any[]> {
    const baseUrls = this.buildLocalBaseUrls();
    const configuredVoicesPath = String(this.localVoicesPath || '/api/voices').startsWith('/')
      ? String(this.localVoicesPath || '/api/voices')
      : `/${String(this.localVoicesPath || '/api/voices')}`;
    const errors: string[] = [];
    for (const baseUrl of baseUrls) {
      const isOpenTtsBase = /:5500$/i.test(baseUrl);
      const voicesPaths = Array.from(
        new Set(
          isOpenTtsBase
            ? ['/api/voices', '/voices', configuredVoicesPath]
            : [configuredVoicesPath, '/api/voices', '/voices'],
        ),
      );
      for (const voicesPath of voicesPaths) {
        const url = `${baseUrl}${voicesPath}`;
        try {
          const response = await axios.get(url, { timeout: Math.min(this.localTimeoutMs, 10000) });
          const payload = response.data;
          const rawVoices = Array.isArray(payload?.voices)
            ? payload.voices
            : Array.isArray(payload)
            ? payload
            : payload && typeof payload === 'object'
            ? Object.entries(payload).map(([id, voice]: [string, any]) => ({
                ...(voice || {}),
                id: voice?.id || id,
                voice_id: voice?.voice_id || voice?.id || id,
                name: voice?.name || voice?.id || id,
              }))
            : [];
          if (rawVoices.length > 0) {
            return rawVoices.map((voice: any) => ({
              voice_id: String(voice.voice_id || voice.id || voice.name || this.localDefaultVoice),
              name: String(voice.name || voice.id || voice.voice_id || this.localDefaultVoice),
              labels: voice.labels || { gender: voice.gender || 'neutral' },
              id: String(voice.id || voice.voice_id || voice.name || this.localDefaultVoice),
              language: String(voice.language || voice.lang || '').toLowerCase(),
              locale: String(voice.locale || '').toLowerCase(),
              provider: 'local',
            }));
          }
        } catch (error) {
          errors.push(this.formatAxiosError(error, url));
        }
      }
    }
    if (errors.length > 0) {
      console.warn(
        `Failed to fetch local voices from configured endpoints: ${errors.slice(0, 2).join(' | ')}`,
      );
    }
    return [{
      voice_id: this.localDefaultVoice,
      name: this.localDefaultVoice,
      provider: 'local',
      labels: { gender: 'neutral' },
    }];
  }

  private resolveVoiceSettings(narrationPrompt?: string) {
    const hint = String(narrationPrompt || '').toLowerCase();
    const slowHint = hint.includes('pausado') || hint.includes('slow');
    const warmHint = hint.includes('cálid') || hint.includes('warm');
    return {
      stability: slowHint ? 0.72 : 0.5,
      similarity_boost: warmHint ? 0.85 : 0.75,
    };
  }

  private writeAudioFile(buffer: Buffer, source: string): string {
    const filename = `${source}-audio-${Date.now()}-${Math.random().toString(36).slice(2)}.mp3`;
    const filepath = path.join(this.storagePath, 'audio', filename);
    fs.writeFileSync(filepath, buffer);
    return filepath;
  }

  private estimateDurationSeconds(text: string): number {
    const estimatedWords = String(text || '').length / 5;
    return Math.max(1, Math.ceil((estimatedWords / 150) * 60));
  }

  private extractAudioBuffer(data: any, contentType: string): Buffer {
    const normalizedType = String(contentType || '').toLowerCase();
    const rawBuffer = Buffer.isBuffer(data) ? data : Buffer.from(data || []);
    if (normalizedType.includes('application/json') || normalizedType.includes('text/json')) {
      const payload = JSON.parse(rawBuffer.toString('utf8'));
      const b64 =
        payload?.audio_base64 ||
        payload?.audio ||
        payload?.data?.audio_base64 ||
        payload?.data?.audio ||
        '';
      const normalized = String(b64 || '').replace(/^data:audio\/[^;]+;base64,/, '');
      if (!normalized) {
        throw new Error('Local TTS returned JSON without audio payload');
      }
      return Buffer.from(normalized, 'base64');
    }
    if (!rawBuffer || rawBuffer.length < 64) {
      throw new Error('Local TTS returned empty audio payload');
    }
    return rawBuffer;
  }

  private formatAxiosError(error: any, url: string): string {
    const status = error?.response?.status;
    const body = error?.response?.data;
    const bodyText = Buffer.isBuffer(body)
      ? body.toString('utf8').slice(0, 180)
      : String(body?.message || body || error?.message || '').slice(0, 180);
    if (status) {
      return `${url} -> HTTP ${status}${bodyText ? `: ${bodyText}` : ''}`;
    }
    return `${url} -> ${bodyText || 'request failed'}`;
  }

  private buildLocalBaseUrls(): string[] {
    const configured = String(this.localApiUrl || 'http://localhost:5500').replace(/\/+$/, '');
    const urls: string[] = [];
    const isLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(configured);
    if (isLocalhost && configured.endsWith(':8020')) {
      urls.push('http://localhost:5500', 'http://127.0.0.1:5500', configured);
    } else {
      urls.push(configured);
      if (isLocalhost && !configured.endsWith(':5500')) {
        urls.push('http://localhost:5500', 'http://127.0.0.1:5500');
      }
    }
    return Array.from(new Set(urls));
  }

  private buildOpenTtsVoiceCandidates(voiceId: string, text: string): string[] {
    const requested = String(voiceId || '').trim();
    const normalizedText = String(text || '');
    const looksSpanish =
      /[áéíóúñü¿¡]/i.test(normalizedText) ||
      /\b(el|la|los|las|de|que|para|con|por|una|uno|este|esta|cristo|dios|gracia)\b/i.test(normalizedText);
    const spanishDefaults = ['coqui-tts:es_css10', 'coqui-tts:es-css10'];
    const englishDefaults = ['en-US', 'coqui-tts:en_ljspeech'];
    const normalizedRequested = requested.toLowerCase();
    const requestedLooksEnglish =
      /\ben[_-]/i.test(normalizedRequested) ||
      normalizedRequested.includes('ljspeech') ||
      ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'].includes(normalizedRequested);

    const candidates: string[] = [];
    const pushCandidate = (candidate: string) => {
      const normalizedCandidate = String(candidate || '').trim();
      if (!normalizedCandidate) return;
      if (!candidates.includes(normalizedCandidate)) {
        candidates.push(normalizedCandidate);
      }
    };

    if (looksSpanish && (!requested || requestedLooksEnglish)) {
      for (const candidate of spanishDefaults) {
        pushCandidate(candidate);
      }
    }

    if (requested) {
      pushCandidate(requested);
      if (!requested.includes(':')) {
        pushCandidate(`coqui-tts:${requested}`);
      }

      if (['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'].includes(normalizedRequested)) {
        pushCandidate(looksSpanish ? 'es-ES' : 'en-US');
      }

      if (normalizedRequested === 'es' || normalizedRequested.startsWith('es-')) {
        pushCandidate('es-ES');
      }
      if (normalizedRequested === 'en' || normalizedRequested.startsWith('en-')) {
        pushCandidate('en-US');
      }
    }

    for (const candidate of looksSpanish ? spanishDefaults : englishDefaults) {
      pushCandidate(candidate);
    }

    pushCandidate('es-ES');
    pushCandidate('en-US');

    return candidates;
  }
}
