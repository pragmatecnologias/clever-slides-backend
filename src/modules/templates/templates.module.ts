import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TemplatePack } from '../../entities/template-pack.entity';
import { SlideTemplate } from '../../entities/slide-template.entity';
import { BrandTheme } from '../../entities/brand-theme.entity';
import { TemplatesService } from './templates.service';
import { TemplatesController } from './templates.controller';

@Module({
  imports: [TypeOrmModule.forFeature([TemplatePack, SlideTemplate, BrandTheme])],
  controllers: [TemplatesController],
  providers: [TemplatesService],
  exports: [TemplatesService],
})
export class TemplatesModule {}
