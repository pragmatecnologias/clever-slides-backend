import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MusicMedia, MusicStatus } from '../../entities/music-media.entity';
import { CreateMusicDto } from './dto/create-music.dto';

@Injectable()
export class MusicService {
  constructor(
    @InjectRepository(MusicMedia)
    private musicRepository: Repository<MusicMedia>,
    @InjectQueue('music-generation')
    private musicQueue: Queue,
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

  async deleteMusic(id: string, churchId: string) {
    const music = await this.getMusic(id, churchId);
    await this.musicRepository.remove(music);
    return { deleted: true };
  }
}
