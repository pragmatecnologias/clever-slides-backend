import { IsOptional, IsString, IsArray, IsEnum } from 'class-validator';
import { DeckIntent, VisualStyleKey } from './create-deck.dto';

export class RegenerateDeckDto {
  @IsOptional()
  @IsString()
  templatePackId?: string;

  @IsOptional()
  @IsArray()
  templatePlan?: string[];

  @IsOptional()
  @IsEnum(DeckIntent)
  deckIntent?: DeckIntent;

  @IsOptional()
  @IsEnum(VisualStyleKey)
  visualStyle?: VisualStyleKey;
}
