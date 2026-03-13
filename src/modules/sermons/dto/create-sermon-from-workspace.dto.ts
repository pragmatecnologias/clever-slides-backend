import { IsString, IsArray, IsOptional } from 'class-validator';

export class CreateSermonFromWorkspaceDto {
  @IsString()
  workspaceId: string;

  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  seriesTitle?: string;

  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsString()
  mainScriptureRef?: string;

  @IsOptional()
  @IsString()
  scripture?: string;

  @IsString()
  bigIdea: string;

  @IsArray()
  mainPoints: string[];

  @IsOptional()
  @IsString()
  audienceContext?: string;

  @IsOptional()
  @IsString()
  tone?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  outline?: any;

  @IsOptional()
  manuscript?: any;

  @IsOptional()
  applications?: any[];

  @IsOptional()
  questions?: any[];
}
