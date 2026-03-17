import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MusicService } from './music.service';
import { MusicController } from './music.controller';
import { MusicCallbackController } from './music-callback.controller';
import { MusicGenerationProcessor } from './music-generation.processor';
import { MusicMedia } from '../../entities/music-media.entity';
import { SunoProvider } from './providers/suno.provider';
import { SermonSongGeneratorService } from './sermon-song-generator.service';
import { LlmModule } from '../llm/llm.module';
import { SermonsModule } from '../sermons/sermons.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([MusicMedia]),
    BullModule.registerQueue({
      name: 'music-generation',
      defaultJobOptions: {
        attempts: 1,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: 100,
        removeOnFail: 500,
      },
    }),
    LlmModule,
    SermonsModule,
  ],
  controllers: [MusicController, MusicCallbackController],
  providers: [MusicService, MusicGenerationProcessor, SunoProvider, SermonSongGeneratorService],
  exports: [MusicService, SermonSongGeneratorService],
})
export class MusicModule {}
