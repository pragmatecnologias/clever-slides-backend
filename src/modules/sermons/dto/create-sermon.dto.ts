import { IsString, IsOptional, IsArray, IsEnum, IsDateString } from 'class-validator';
import { SermonTone, CtaStyle } from '../../../entities/sermon.entity';

export class CreateSermonDto {
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  seriesTitle?: string;

  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsString()
  mainScriptureRef?: string;

  @IsString()
  bigIdea: string;

  @IsArray()
  @IsString({ each: true })
  mainPoints: string[];

  @IsOptional()
  @IsString()
  audienceContext?: string;

  @IsEnum(SermonTone)
  tone: SermonTone;

  @IsEnum(CtaStyle)
  ctaStyle: CtaStyle;

  @IsOptional()
  @IsString()
  notes?: string;
}
