import { IsString, IsOptional, IsNumber, IsBoolean } from 'class-validator';

export class CreateThemeDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  logoUrl?: string;

  @IsOptional()
  @IsString()
  primaryColor?: string;

  @IsOptional()
  @IsString()
  secondaryColor?: string;

  @IsOptional()
  @IsString()
  backgroundStyle?: string;

  @IsOptional()
  @IsString()
  fontHeading?: string;

  @IsOptional()
  @IsString()
  fontBody?: string;

  @IsOptional()
  @IsNumber()
  headingFontSize?: number;

  @IsOptional()
  @IsNumber()
  bodyFontSize?: number;

  @IsOptional()
  @IsNumber()
  titleFontSize?: number;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @IsString()
  defaultTemplatePackId?: string;
}
