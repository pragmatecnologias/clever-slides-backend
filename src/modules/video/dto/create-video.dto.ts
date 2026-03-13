import { IsString, IsOptional } from 'class-validator';

export class CreateVideoDto {
  @IsOptional()
  @IsString()
  deckId?: string;

  @IsOptional()
  @IsString()
  audioId?: string;

  @IsOptional()
  @IsString()
  sermonId?: string;

  @IsOptional()
  @IsString()
  workspaceId?: string;

  @IsOptional()
  @IsString()
  resolution?: string;
}
