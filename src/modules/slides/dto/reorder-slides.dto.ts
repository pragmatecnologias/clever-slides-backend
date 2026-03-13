import { IsArray, IsString } from 'class-validator';

export class ReorderSlidesDto {
  @IsArray()
  @IsString({ each: true })
  slideIdsInOrder: string[];
}
