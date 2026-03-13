import { IsString, IsOptional, IsNumber } from 'class-validator';

export class CreateAudioDto {
  @IsOptional()
  @IsString()
  sermonId?: string;

  @IsOptional()
  @IsString()
  workspaceId?: string;

  @IsString()
  text: string;

  @IsOptional()
  @IsString()
  voiceId?: string;

  @IsOptional()
  @IsString()
  provider?: string;
}
