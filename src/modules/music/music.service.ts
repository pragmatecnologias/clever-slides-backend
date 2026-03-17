import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MusicMedia, MusicStatus } from '../../entities/music-media.entity';
import { CreateMusicDto } from './dto/create-music.dto';
import { SunoProvider } from './providers/suno.provider';

@Injectable()
export class MusicService {
  constructor(
    @InjectRepository(MusicMedia)
    private musicRepository: Repository<MusicMedia>,
    @InjectQueue('music-generation')
    private musicQueue: Queue,
    private readonly sunoProvider: SunoProvider,
  ) {}

  async requestMusic(createDto: CreateMusicDto, churchId: string) {
    const music = this.musicRepository.create({
      ...createDto,
      provider: createDto.provider || 'suno',
      status: MusicStatus.PENDING,
    });

    await this.musicRepository.save(music);

    await this.musicQueue.add('generate', {
      musicId: music.id,
      prompt: createDto.prompt,
      genre: createDto.genre,
      durationSeconds: createDto.durationSeconds,
      provider: music.provider,
      title: createDto.title,
      instrumental: createDto.instrumental,
    });

    return { id: music.id, status: 'queued' };
  }

  async getMusic(id: string, churchId: string) {
    const music = await this.musicRepository.findOne({
      where: { id },
      relations: ['sermon'],
    });

    if (!music) {
      throw new BadRequestException('Music not found');
    }

    if (music.sermon && music.sermon['churchId'] !== churchId) {
      throw new BadRequestException('Music not found');
    }

    return music;
  }

  async getMusicPath(id: string, churchId: string): Promise<string> {
    const music = await this.getMusic(id, churchId);

    if (!music.filePath) {
      throw new BadRequestException('Music file not generated yet');
    }

    return music.filePath;
  }

  async listMusic(workspaceId?: string, sermonId?: string) {
    const where: any = {};
    if (workspaceId) where.workspaceId = workspaceId;
    if (sermonId) where.sermonId = sermonId;

    return this.musicRepository.find({
      where,
      order: { createdAt: 'DESC' },
    });
  }

  async selectTrack(id: string, trackId: string, churchId: string) {
    const music = await this.getMusic(id, churchId);
    const tracks = Array.isArray(music.tracks) ? music.tracks : [];
    const selected = tracks.find((track) => String(track?.trackId || '') === String(trackId || ''));

    if (!selected) {
      throw new BadRequestException('Track not found for this music item');
    }

    if (!selected.audioUrl) {
      throw new BadRequestException('Selected track has no downloadable audio URL');
    }

    if (music.provider !== 'suno') {
      throw new BadRequestException(`Track selection is not supported for provider: ${music.provider}`);
    }

    const result = await this.sunoProvider.selectTrack(selected as any);
    music.filePath = result.filePath;
    music.durationSeconds = result.durationSeconds;
    music.selectedTrackId = result.selectedTrackId;
    music.status = MusicStatus.COMPLETED;
    music.errorMessage = null;
    await this.musicRepository.save(music);

    return {
      id: music.id,
      selectedTrackId: music.selectedTrackId,
      filePath: music.filePath,
      durationSeconds: music.durationSeconds,
    };
  }

  async deleteMusic(id: string, churchId: string) {
    const music = await this.getMusic(id, churchId);
    await this.musicRepository.remove(music);
    return { deleted: true };
  }
}
