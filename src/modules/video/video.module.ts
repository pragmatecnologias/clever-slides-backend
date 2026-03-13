import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VideoService } from './video.service';
import { VideoController } from './video.controller';
import { VideoGenerationProcessor } from './video-generation.processor';
import { VideoMedia } from '../../entities/video-media.entity';
import { VideoComposerService } from './video-composer.service';
import { Deck } from '../../entities/deck.entity';
import { AudioMedia } from '../../entities/audio-media.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([VideoMedia, Deck, AudioMedia]),
    BullModule.registerQueue({
      name: 'video-generation',
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: 100,
        removeOnFail: 500,
      },
    }),
  ],
  controllers: [VideoController],
  providers: [VideoService, VideoGenerationProcessor, VideoComposerService],
  exports: [VideoService],
})
export class VideoModule {}
