import { IsNotEmpty, IsString } from 'class-validator';

export class SelectTrackDto {
  @IsString()
  @IsNotEmpty()
  trackId: string;
}
