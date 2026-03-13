import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { Export } from '../../entities/export.entity';
import { Deck } from '../../entities/deck.entity';
import { Slide } from '../../entities/slide.entity';
import { BrandTheme } from '../../entities/brand-theme.entity';
import { ExportsController } from './exports.controller';
import { ExportsService } from './exports.service';
import { ExportProcessor } from './export.processor';
import { PptxExportService } from './pptx-export.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Export, Deck, Slide, BrandTheme]),
    BullModule.registerQueue({
      name: 'exports',
    }),
  ],
  controllers: [ExportsController],
  providers: [ExportsService, ExportProcessor, PptxExportService],
  exports: [ExportsService],
})
export class ExportsModule {}
