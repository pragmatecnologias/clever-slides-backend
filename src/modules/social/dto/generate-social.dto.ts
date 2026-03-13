import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class SocialOverlayDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  eventTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  eventSubtitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  serviceDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  serviceTime?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  timezone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  locationOverride?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  churchName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  website?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  logoUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  ctaText?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  hashtags?: string;

  @IsOptional()
  @IsBoolean()
  showLogo?: boolean;

  @IsOptional()
  @IsBoolean()
  showAddress?: boolean;

  @IsOptional()
  @IsBoolean()
  showWebsite?: boolean;

  @IsOptional()
  @IsBoolean()
  showPhone?: boolean;

  @IsOptional()
  @IsBoolean()
  showServiceTime?: boolean;

  @IsOptional()
  @IsIn(['minimal', 'bold', 'announcement'])
  preset?: 'minimal' | 'bold' | 'announcement';

  @IsOptional()
  @IsString()
  @MaxLength(64)
  layoutVariant?: string;

  @IsOptional()
  @IsIn(['auto', 'full', 'minimal'])
  densityMode?: 'auto' | 'full' | 'minimal';

  @IsOptional()
  @IsIn(['local', 'openai'])
  imageProvider?: 'local' | 'openai';

  @IsOptional()
  @IsString()
  @MaxLength(64)
  imagePreset?: string;

  @IsOptional()
  @IsIn(['es', 'en'])
  language?: 'es' | 'en';
}

export class GenerateSocialDto {
  @IsOptional()
  @IsString()
  sermonId?: string;

  @IsOptional()
  @IsString()
  workspaceId?: string;

  @IsOptional()
  @IsIn(['auto_multi_network', 'core4', 'manual'])
  mode?: 'auto_multi_network' | 'core4' | 'manual';

  @IsString()
  quote: string;

  @IsString()
  caption: string;

  @IsString()
  title: string;

  @IsString()
  passage: string;

  @IsOptional()
  @IsString()
  prompt?: string;

  @IsOptional()
  @IsString()
  useCase?: string;

  @IsOptional()
  overlay?: SocialOverlayDto;
}
