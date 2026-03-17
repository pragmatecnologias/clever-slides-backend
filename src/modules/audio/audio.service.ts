import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AudioMedia, AudioStatus } from '../../entities/audio-media.entity';
import { CreateAudioDto } from './dto/create-audio.dto';

@Injectable()
export class AudioService {
  constructor(
    @InjectRepository(AudioMedia)
    private audioRepository: Repository<AudioMedia>,
    @InjectQueue('audio-generation')
    private audioQueue: Queue,
  ) {}

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
