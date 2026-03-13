import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class VideoComposerService {
  private storagePath: string;

  constructor(private configService: ConfigService) {
    this.storagePath = this.configService.get('STORAGE_PATH') || './uploads';
    const videoPath = path.join(this.storagePath, 'video');
    if (!fs.existsSync(videoPath)) {
      fs.mkdirSync(videoPath, { recursive: true });
    }
  }

  async compose(deckId: string, audioPath?: string, resolution: string = '1920x1080'): Promise<{ filePath: string; durationSeconds: number }> {
    try {
      // Placeholder implementation
      // In production, this would use FFmpeg to combine slides + audio into video
      // Example: ffmpeg -loop 1 -i slide1.png -i audio.mp3 -c:v libx264 -c:a aac -shortest output.mp4
      
      const filename = `video-${Date.now()}-${Math.random().toString(36).slice(2)}.mp4`;
      const filepath = path.join(this.storagePath, 'video', filename);
      
      // Create placeholder file
      const placeholderContent = Buffer.from('Placeholder video file');
      fs.writeFileSync(filepath, placeholderContent);

      // Estimate duration (placeholder)
      const durationSeconds = 300; // 5 minutes default

      return { filePath: filepath, durationSeconds };
    } catch (error) {
      console.error('Video composition error:', error.message);
      throw new BadRequestException('Failed to compose video');
    }
  }

  async composeFromSlides(slidePaths: string[], audioPath?: string, resolution: string = '1920x1080'): Promise<{ filePath: string; durationSeconds: number }> {
    // This would use FFmpeg to create a video from individual slide images
    // Each slide shown for a few seconds, with optional audio overlay
    
    const filename = `video-${Date.now()}-${Math.random().toString(36).slice(2)}.mp4`;
    const filepath = path.join(this.storagePath, 'video', filename);
    
    // Placeholder implementation
    const placeholderContent = Buffer.from('Placeholder video from slides');
    fs.writeFileSync(filepath, placeholderContent);

    const durationSeconds = slidePaths.length * 5; // 5 seconds per slide

    return { filePath: filepath, durationSeconds };
  }
}
