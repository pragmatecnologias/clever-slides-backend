import { IsOptional, IsString, IsArray } from 'class-validator';

export class RegenerateDeckDto {
  @IsOptional()
  @IsString()
  templatePackId?: string;

  @IsOptional()
  @IsArray()
  templatePlan?: string[];
}
