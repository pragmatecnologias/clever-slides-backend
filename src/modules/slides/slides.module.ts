import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Slide } from '../../entities/slide.entity';
import { Deck } from '../../entities/deck.entity';
import { Sermon } from '../../entities/sermon.entity';
import { SlideTemplate } from '../../entities/slide-template.entity';
import { SlidesController } from './slides.controller';
import { SlidesService } from './slides.service';
import { LlmModule } from '../llm/llm.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Slide, Deck, Sermon, SlideTemplate]),
    LlmModule,
  ],
  controllers: [SlidesController],
  providers: [SlidesService],
  exports: [SlidesService],
})
export class SlidesModule {}
