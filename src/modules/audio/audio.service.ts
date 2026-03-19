import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AudioMedia, AudioStatus } from '../../entities/audio-media.entity';
import { CreateAudioDto } from './dto/create-audio.dto';
import { GenerateNarrationDto } from './dto/generate-narration.dto';
import { LlmClient } from '../llm/llm-client.service';

@Injectable()
export class AudioService {
  constructor(
    @InjectRepository(AudioMedia)
    private audioRepository: Repository<AudioMedia>,
    @InjectQueue('audio-generation')
    private audioQueue: Queue,
    private llmClient: LlmClient,
  ) {}

  async generateNarrationScript(input: GenerateNarrationDto) {
    const maxChars = this.normalizeMaxChars(input.maxChars);
    const schemaHint = {
      text: this.buildFallbackNarration(input, maxChars),
    };

    const system = `You are a sermon narration writer. Produce one natural spoken script for text-to-speech.
Rules:
- Return JSON only with shape: {"text":"..."}
- No headings, labels, numbered lists, markdown, or stage directions
- Keep language aligned with input language
- Keep pacing conversational, clear, pastoral, and concise
- Keep text under ${maxChars} characters`;

    const user = [
      `language: ${String(input.language || 'en')}`,
      `title: ${String(input.title || '').trim()}`,
      `passage: ${String(input.passage || '').trim()}`,
      `theme: ${String(input.theme || '').trim()}`,
      `narrationPrompt: ${String(input.narrationPrompt || '').trim()}`,
      `keyPoints: ${this.sanitizeItems(input.keyPoints).join(' | ')}`,
      `applications: ${this.sanitizeItems(input.applications).join(' | ')}`,
      `manuscript:\n${String(input.manuscript || '').trim()}`,
    ].join('\n\n');

    const response = await this.llmClient.generateJson<{ text?: string }>(
      system,
      user,
      schemaHint,
      {
        temperature: 0.65,
        maxTokens: 2200,
      },
    );

    const sanitized = this.sanitizeNarrationText(String(response?.text || ''));
    const fallback = this.sanitizeNarrationText(schemaHint.text);
    const text = this.clampNarrationText(sanitized || fallback, maxChars);

    return {
      text,
      characterCount: text.length,
      maxChars,
    };
  }

  async requestAudio(createDto: CreateAudioDto, churchId: string) {
    // Validate input to prevent wasting API calls
    if (!createDto.text || createDto.text.trim().length === 0) {
      throw new Error('Text is required for audio generation');
    }

    const sanitizedText = this.sanitizeNarrationText(createDto.text);
    if (sanitizedText.length > 5000) {
      throw new Error('Text is too long (max 5000 characters)');
    }
    if (!sanitizedText) {
      throw new Error('Text is required for audio generation');
    }

    const provider = this.resolveProvider(createDto.provider);

    const audio = this.audioRepository.create({
      ...createDto,
      text: sanitizedText,
      provider,
      status: AudioStatus.PENDING,
    });

    await this.audioRepository.save(audio);

    await this.audioQueue.add('generate', {
      audioId: audio.id,
      text: sanitizedText,
      voiceId: createDto.voiceId,
      provider: audio.provider,
      narrationPrompt: String(createDto.narrationPrompt || '').trim() || undefined,
    });

    return { id: audio.id, status: 'queued' };
  }

  async getAudio(id: string, churchId: string) {
    const audio = await this.audioRepository.findOne({
      where: { id },
      relations: ['sermon'],
    });

    if (!audio) {
      throw new BadRequestException('Audio not found');
    }

    // Authorization check - ensure audio belongs to user's church
    if (audio.sermon && audio.sermon['churchId'] !== churchId) {
      throw new BadRequestException('Audio not found');
    }

    return audio;
  }

  async getAudioPath(id: string, churchId: string): Promise<string> {
    const audio = await this.getAudio(id, churchId);

    if (!audio.filePath) {
      throw new BadRequestException('Audio file not generated yet');
    }

    return audio.filePath;
  }

  async listAudio(workspaceId?: string, sermonId?: string) {
    const where: any = {};
    if (workspaceId) where.workspaceId = workspaceId;
    if (sermonId) where.sermonId = sermonId;

    return this.audioRepository.find({
      where,
      order: { createdAt: 'DESC' },
    });
  }

  async deleteAudio(id: string, churchId: string) {
    const audio = await this.getAudio(id, churchId);
    await this.audioRepository.remove(audio);
    return { deleted: true };
  }

  private resolveProvider(provider?: string): 'local' | 'elevenlabs' {
    const normalized = String(provider || '').trim().toLowerCase();
    if (normalized === 'elevenlabs') return 'elevenlabs';
    return 'local';
  }

  private normalizeMaxChars(value?: number): number {
    if (!Number.isFinite(value)) return 5000;
    const parsed = Math.floor(Number(value));
    return Math.max(500, Math.min(5000, parsed));
  }

  private sanitizeItems(items?: string[]): string[] {
    if (!Array.isArray(items)) return [];
    return items
      .map((item) => this.sanitizeNarrationText(String(item || '')))
      .filter(Boolean)
      .slice(0, 8);
  }

  private buildFallbackNarration(input: GenerateNarrationDto, maxChars: number): string {
    const isSpanish = String(input.language || '').toLowerCase().startsWith('es');
    const parts = [
      input.passage
        ? isSpanish
          ? `Hoy meditamos en ${input.passage}.`
          : `Today we reflect on ${input.passage}.`
        : '',
      input.title ? `${input.title}.` : '',
      input.theme
        ? isSpanish
          ? `La idea central es ${input.theme}.`
          : `The central idea is ${input.theme}.`
        : '',
      ...this.sanitizeItems(input.keyPoints),
      this.sanitizeNarrationText(String(input.manuscript || '')),
      ...this.sanitizeItems(input.applications),
      input.narrationPrompt ? this.sanitizeNarrationText(input.narrationPrompt) : '',
    ]
      .map((item) => this.sanitizeNarrationText(String(item || '')))
      .filter(Boolean)
      .join(' ');

    return this.clampNarrationText(parts, maxChars);
  }

  private clampNarrationText(value: string, maxChars: number): string {
    const cleaned = this.sanitizeNarrationText(value);
    if (!cleaned) return '';
    if (cleaned.length <= maxChars) return cleaned;

    const window = cleaned.slice(0, maxChars);
    const breakIndex = Math.max(
      window.lastIndexOf('. '),
      window.lastIndexOf('! '),
      window.lastIndexOf('? '),
    );
    if (breakIndex >= Math.floor(maxChars * 0.6)) {
      return window.slice(0, breakIndex + 1).trim();
    }
    return window.trim();
  }

  private sanitizeNarrationText(value: string): string {
    return String(value || '')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<\/?[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/\s+/g, ' ')
      .trim();
  }
}
