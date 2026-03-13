import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SocialService } from './social.service';
import { SocialController } from './social.controller';
import { SocialGenerationProcessor } from './social-generation.processor';
import { SocialHtmlRendererService } from './social-html-renderer.service';
import { SocialMedia } from '../../entities/social-media.entity';
import { ImagesModule } from '../images/images.module';
import { LlmModule } from '../llm/llm.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([SocialMedia]),
    ImagesModule,
    LlmModule,
    BullModule.registerQueue({
      name: 'social-generation',
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: 100,
        removeOnFail: 500,
      },
    }),
  ],
  controllers: [SocialController],
  providers: [SocialService, SocialGenerationProcessor, SocialHtmlRendererService],
  exports: [SocialService],
})
export class SocialModule {}
