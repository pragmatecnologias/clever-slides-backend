import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { VideoMedia, VideoStatus } from '../../entities/video-media.entity';
import { CreateVideoDto } from './dto/create-video.dto';

@Injectable()
export class VideoService {
  constructor(
    @InjectRepository(VideoMedia)
    private videoRepository: Repository<VideoMedia>,
    @InjectQueue('video-generation')
    private videoQueue: Queue,
  ) {}

  async requestVideo(createDto: CreateVideoDto, churchId: string) {
    const video = this.videoRepository.create({
      ...createDto,
      resolution: createDto.resolution || '1920x1080',
      status: VideoStatus.PENDING,
    });

    await this.videoRepository.save(video);

    await this.videoQueue.add('generate', {
      videoId: video.id,
      deckId: createDto.deckId,
      audioId: createDto.audioId,
      resolution: video.resolution,
    });

    return { id: video.id, status: 'queued' };
  }

  async getVideo(id: string, churchId: string) {
    const video = await this.videoRepository.findOne({
      where: { id },
      relations: ['deck', 'audio', 'sermon'],
    });

    if (!video) {
      throw new BadRequestException('Video not found');
    }

    if (video.deck && video.deck['churchId'] !== churchId) {
      throw new BadRequestException('Video not found');
    }

    return video;
  }

  async getVideoPath(id: string, churchId: string): Promise<string> {
    const video = await this.getVideo(id, churchId);

    if (!video.filePath) {
      throw new BadRequestException('Video file not generated yet');
    }

    return video.filePath;
  }

  async listVideo(workspaceId?: string, sermonId?: string) {
    const where: any = {};
    if (workspaceId) where.workspaceId = workspaceId;
    if (sermonId) where.sermonId = sermonId;

    return this.videoRepository.find({
      where,
      order: { createdAt: 'DESC' },
    });
  }

  async deleteVideo(id: string, churchId: string) {
    const video = await this.getVideo(id, churchId);
    await this.videoRepository.remove(video);
    return { deleted: true };
  }
}
