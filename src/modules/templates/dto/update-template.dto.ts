import { IsBoolean, IsInt, IsObject, IsOptional, IsString, Min } from 'class-validator';

export class UpdateTemplateDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  layoutKey?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  supportsImage?: boolean;

  @IsOptional()
  @IsObject()
  fields?: Record<string, any>;

  @IsOptional()
  @IsObject()
  styleDefaults?: Record<string, any>;

  @IsOptional()
  @IsObject()
  fieldStyleDefaults?: Record<string, any>;
}
