import { IsOptional, IsObject, IsString } from 'class-validator';

export class UpdateSlideDto {
  @IsOptional()
  @IsString()
  layoutKey?: string;

  @IsOptional()
  @IsObject()
  content?: Record<string, any>;

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
  @IsString()
  imageProvider?: string;
}
