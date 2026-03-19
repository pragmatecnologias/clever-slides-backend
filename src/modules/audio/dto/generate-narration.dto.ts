import { IsArray, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class GenerateNarrationDto {
  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  passage?: string;

  @IsOptional()
  @IsString()
  theme?: string;

  @IsOptional()
  @IsString()
  manuscript?: string;

  @IsOptional()
  @IsArray()
  keyPoints?: string[];

  @IsOptional()
  @IsArray()
  applications?: string[];

  @IsOptional()
  @IsString()
  narrationPrompt?: string;

  @IsOptional()
  @IsNumber()
  @Min(500)
  @Max(5000)
  maxChars?: number;
}
