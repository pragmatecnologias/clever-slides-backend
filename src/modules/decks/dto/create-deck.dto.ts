import { IsString, IsOptional, IsEnum, IsArray } from 'class-validator';

export enum DeckSize {
  SHORT = 'short',
  STANDARD = 'standard',
  LONG = 'long',
}

export enum DeckIntent {
  SERMON_PRESENTATION = 'sermon_presentation',
  SOCIAL_SUMMARY = 'social_summary',
  TEACHING_STUDY = 'teaching_study',
  YOUTH_MESSAGE = 'youth_message',
  EVANGELISTIC_APPEAL = 'evangelistic_appeal',
}

export enum DeckBackgroundProvider {
  LOCAL = 'local',
  OPENAI = 'openai',
}

export enum VisualStyleKey {
  AUTO = 'auto',
  REVERENT_WORSHIP = 'reverent_worship',
  WARM_PASTORAL = 'warm_pastoral',
  EVANGELISTIC_INVITATION = 'evangelistic_invitation',
  HOPEFUL_PROPHECY = 'hopeful_prophecy',
  BIBLE_STUDY_CLEAN = 'bible_study_clean',
  YOUTH_MODERN = 'youth_modern',
  SPANISH_CHURCH_WARM = 'spanish_church_warm',
}

export class CreateDeckDto {
  @IsOptional()
  @IsString()
  themeId?: string;

  @IsOptional()
  @IsString()
  templatePackId?: string;

  @IsOptional()
  @IsArray()
  templatePlan?: string[];

  @IsOptional()
  @IsEnum(DeckSize)
  deckSize?: DeckSize;

  @IsOptional()
  @IsEnum(DeckIntent)
  deckIntent?: DeckIntent;

  @IsOptional()
  @IsEnum(DeckBackgroundProvider)
  backgroundProvider?: DeckBackgroundProvider;

  @IsOptional()
  @IsString()
  backgroundPreset?: string;

  @IsOptional()
  @IsEnum(VisualStyleKey)
  visualStyle?: VisualStyleKey;
}
