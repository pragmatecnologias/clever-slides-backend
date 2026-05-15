import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Export } from '../../entities/export.entity';
import { Deck } from '../../entities/deck.entity';
import { Slide } from '../../entities/slide.entity';
import { BrandTheme } from '../../entities/brand-theme.entity';
import { ExportsController } from './exports.controller';
import { ExportsService } from './exports.service';
import { PptxExportService } from './pptx-export.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Export, Deck, Slide, BrandTheme]),
  ],
  controllers: [ExportsController],
  providers: [ExportsService, PptxExportService],
  exports: [ExportsService],
})
export class ExportsModule {}
