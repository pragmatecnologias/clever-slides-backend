import { IsEnum, IsString, IsObject, IsOptional, IsNumber } from 'class-validator';
import { SlideType } from '../../../entities/slide-types';

export class CreateSlideDto {
  @IsEnum(SlideType)
  type: SlideType;

  @IsString()
  layoutKey: string;

  @IsObject()
  content: Record<string, any>;

  @IsOptional()
  @IsString()
  speakerNotes?: string;

  @IsOptional()
  @IsString()
  templateId?: string;

  @IsOptional()
  @IsString()
  imagePrompt?: string;

  @IsOptional()
  @IsNumber()
  orderIndex?: number;
}
