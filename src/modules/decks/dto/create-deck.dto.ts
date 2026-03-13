import { IsString, IsOptional, IsEnum, IsArray } from 'class-validator';

export enum DeckSize {
  SHORT = 'short',
  STANDARD = 'standard',
  LONG = 'long',
}

export enum DeckBackgroundProvider {
  LOCAL = 'local',
  OPENAI = 'openai',
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
  @IsEnum(DeckBackgroundProvider)
  backgroundProvider?: DeckBackgroundProvider;

  @IsOptional()
  @IsString()
  backgroundPreset?: string;
}
