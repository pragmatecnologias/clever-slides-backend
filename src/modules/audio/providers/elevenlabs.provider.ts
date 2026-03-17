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

  constructor(private configService: ConfigService) {
    this.apiKey = this.configService.get('ELEVENLABS_API_KEY');
    this.storagePath = this.configService.get('STORAGE_PATH') || './uploads';
    this.localApiUrl = this.configService.get('LOCAL_TTS_API_URL') || 'http://localhost:8020';
    this.localGeneratePath = this.configService.get('LOCAL_TTS_GENERATE_PATH') || '/v1/audio/speech';
    this.localVoicesPath = this.configService.get('LOCAL_TTS_VOICES_PATH') || '/v1/voices';
    this.localDefaultVoice = this.configService.get('LOCAL_TTS_DEFAULT_VOICE') || 'alloy';
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
    const url = `${this.localApiUrl}${this.localGeneratePath}`;
    const selectedVoiceId = voiceId || this.localDefaultVoice;
    try {
      const response = await axios.post(
        url,
        {
          input: text,
          text,
          voice: selectedVoiceId,
          voice_id: selectedVoiceId,
          response_format: 'mp3',
          format: 'mp3',
          prompt: narrationPrompt || undefined,
          instruction: narrationPrompt || undefined,
        },
        {
          responseType: 'arraybuffer',
        },
      );

      const filepath = this.writeAudioFile(Buffer.from(response.data), 'local');
      return { filePath: filepath, durationSeconds: this.estimateDurationSeconds(text) };
    } catch (error) {
      console.error('Local TTS API error:', error.response?.data || error.message);
      throw new BadRequestException('Failed to generate audio with local TTS');
    }
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
    const url = `${this.localApiUrl}${this.localVoicesPath}`;
    try {
      const response = await axios.get(url);
      const rawVoices = Array.isArray(response.data?.voices)
        ? response.data.voices
        : Array.isArray(response.data)
        ? response.data
        : [];
      if (rawVoices.length > 0) {
        return rawVoices.map((voice: any) => ({
          voice_id: String(voice.voice_id || voice.id || voice.name || this.localDefaultVoice),
          name: String(voice.name || voice.id || voice.voice_id || this.localDefaultVoice),
          labels: voice.labels || { gender: voice.gender || 'neutral' },
          provider: 'local',
        }));
      }
    } catch (error) {
      console.warn('Failed to fetch local voices:', error.message);
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
}
