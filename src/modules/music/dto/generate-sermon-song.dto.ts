import { IsString, IsOptional, IsEnum, IsNumber, IsArray } from 'class-validator';

export enum SongMode {
  AMBIENT_ONLY = 'ambient_only',
  WITH_LYRICS = 'with_lyrics',
  CHORUS_ONLY = 'chorus_only',
  BACKGROUND_BED = 'background_bed',
}

export enum MusicStyle {
  WORSHIP = 'worship',
  ACOUSTIC = 'acoustic',
  CINEMATIC = 'cinematic',
  ORCHESTRAL = 'orchestral',
  PIANO_PRAYER = 'piano_prayer',
  YOUTH_CONTEMPORARY = 'youth_contemporary',
  CHOIR_INSPIRED = 'choir_inspired',
  INSTRUMENTAL_AMBIENT = 'instrumental_ambient',
}

export enum UseCase {
  SERMON_INTRO = 'sermon-intro',
  PRAYER_REFLECTION = 'prayer-reflection',
  RECAP_VIDEO = 'recap-video',
  YOUTH_PROMO = 'youth-promo',
  CLOSING_APPEAL = 'closing-appeal',
  OFFERTORY = 'offertory',
  MEDITATION = 'meditation',
  THEME_SONG = 'theme-song',
}

export class GenerateSermonSongDto {
  @IsString()
  sermonId: string;

  @IsOptional()
  @IsString()
  workspaceId?: string;

  @IsEnum(SongMode)
  mode: SongMode;

  @IsOptional()
  @IsEnum(MusicStyle)
  style?: MusicStyle;

  @IsOptional()
  @IsEnum(UseCase)
  useCase?: UseCase;

  @IsOptional()
  @IsNumber()
  duration?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  selectedKeyPhrases?: string[];

  @IsOptional()
  @IsString()
  customLyrics?: string;

  @IsOptional()
  @IsString()
  studyPrompt?: string;

  @IsOptional()
  @IsString()
  language?: string;
}

export class PreviewSermonSongDto {
  @IsString()
  sermonId: string;

  @IsEnum(SongMode)
  mode: SongMode;

  @IsOptional()
  @IsEnum(MusicStyle)
  style?: MusicStyle;

  @IsOptional()
  @IsEnum(UseCase)
  useCase?: UseCase;

  @IsOptional()
  @IsString()
  studyPrompt?: string;

  @IsOptional()
  @IsString()
  language?: string;
}

export class GenerateSermonLyricsDto {
  @IsString()
  sermonId: string;

  @IsOptional()
  @IsEnum(SongMode)
  mode?: SongMode;

  @IsOptional()
  @IsEnum(MusicStyle)
  style?: MusicStyle;

  @IsOptional()
  @IsEnum(UseCase)
  useCase?: UseCase;

  @IsOptional()
  @IsString()
  studyPrompt?: string;

  @IsOptional()
  @IsString()
  language?: string;
}
