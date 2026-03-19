import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AudioService } from './audio.service';
import { AudioController } from './audio.controller';
import { AudioGenerationProcessor } from './audio-generation.processor';
import { AudioMedia } from '../../entities/audio-media.entity';
import { ElevenLabsProvider } from './providers/elevenlabs.provider';
import { LlmModule } from '../llm/llm.module';

@Module({
  imports: [
    LlmModule,
    TypeOrmModule.forFeature([AudioMedia]),
    BullModule.registerQueue({
      name: 'audio-generation',
      defaultJobOptions: {
        attempts: 2, // Only retry once to avoid wasting API calls
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
        removeOnComplete: 100, // Keep only last 100 completed jobs
        removeOnFail: 500, // Keep last 500 failed jobs for debugging
      },
    }),
  ],
  controllers: [AudioController],
  providers: [AudioService, AudioGenerationProcessor, ElevenLabsProvider],
  exports: [AudioService],
})
export class AudioModule {}
