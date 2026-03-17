import { IsString, IsOptional, IsNumber } from 'class-validator';

export class CreateMusicDto {
  @IsOptional()
  @IsString()
  sermonId?: string;

  @IsOptional()
  @IsString()
  workspaceId?: string;

  @IsString()
  prompt: string;

  @IsOptional()
  @IsString()
  genre?: string;

  @IsOptional()
  @IsNumber()
  durationSeconds?: number;

  @IsOptional()
  @IsString()
  provider?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  instrumental?: boolean;
}
