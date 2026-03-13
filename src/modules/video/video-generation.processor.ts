import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { VideoMedia, VideoStatus } from '../../entities/video-media.entity';
import { VideoComposerService } from './video-composer.service';
import { Deck } from '../../entities/deck.entity';
import { AudioMedia } from '../../entities/audio-media.entity';

@Processor('video-generation')
export class VideoGenerationProcessor {
  constructor(
    @InjectRepository(VideoMedia)
    private videoRepository: Repository<VideoMedia>,
    @InjectRepository(Deck)
    private deckRepository: Repository<Deck>,
    @InjectRepository(AudioMedia)
    private audioRepository: Repository<AudioMedia>,
    private videoComposerService: VideoComposerService,
  ) {}

  @Process('generate')
  async handleGeneration(job: Job) {
    const { videoId, deckId, audioId, resolution } = job.data;

    const video = await this.videoRepository.findOne({ where: { id: videoId } });
    if (!video) {
      throw new Error('Video not found');
    }

    try {
      video.status = VideoStatus.PROCESSING;
      await this.videoRepository.save(video);

      let audioPath: string | undefined;
      if (audioId) {
        const audio = await this.audioRepository.findOne({ where: { id: audioId } });
        audioPath = audio?.filePath;
      }

      const result = await this.videoComposerService.compose(deckId, audioPath, resolution);

      video.filePath = result.filePath;
      video.durationSeconds = result.durationSeconds;
      video.status = VideoStatus.COMPLETED;
      await this.videoRepository.save(video);

      return { success: true, videoId: video.id };
    } catch (error) {
      video.status = VideoStatus.FAILED;
      video.errorMessage = error.message;
      await this.videoRepository.save(video);
      throw error;
    }
  }
}
