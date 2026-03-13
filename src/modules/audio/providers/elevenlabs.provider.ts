import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class ElevenLabsProvider {
  private apiKey: string;
  private storagePath: string;
  private apiUrl = 'https://api.elevenlabs.io/v1';

  constructor(private configService: ConfigService) {
    this.apiKey = this.configService.get('ELEVENLABS_API_KEY');
    this.storagePath = this.configService.get('STORAGE_PATH') || './uploads';
    const audioPath = path.join(this.storagePath, 'audio');
    if (!fs.existsSync(audioPath)) {
      fs.mkdirSync(audioPath, { recursive: true });
    }
  }

  async generate(text: string, voiceId?: string): Promise<{ filePath: string; durationSeconds: number }> {
    if (!this.apiKey) {
      throw new BadRequestException('ELEVENLABS_API_KEY is not configured');
    }

    const selectedVoiceId = voiceId || 'EXAVITQu4vr4xnSDxMaL'; // Default voice (Sarah)

    try {
      const response = await axios.post(
        `${this.apiUrl}/text-to-speech/${selectedVoiceId}`,
        {
          text,
          model_id: 'eleven_monolingual_v1',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
          },
        },
        {
          headers: {
            'xi-api-key': this.apiKey,
            'Content-Type': 'application/json',
          },
          responseType: 'arraybuffer',
        },
      );

      const filename = `audio-${Date.now()}-${Math.random().toString(36).slice(2)}.mp3`;
      const filepath = path.join(this.storagePath, 'audio', filename);
      fs.writeFileSync(filepath, Buffer.from(response.data));

      // Estimate duration (rough calculation: ~150 words per minute, ~5 chars per word)
      const estimatedWords = text.length / 5;
      const durationSeconds = Math.ceil((estimatedWords / 150) * 60);

      return { filePath: filepath, durationSeconds };
    } catch (error) {
      console.error('ElevenLabs API error:', error.response?.data || error.message);
      throw new BadRequestException('Failed to generate audio with ElevenLabs');
    }
  }

  async getVoices(): Promise<any[]> {
    if (!this.apiKey) {
      return [];
    }

    try {
      const response = await axios.get(`${this.apiUrl}/voices`, {
        headers: {
          'xi-api-key': this.apiKey,
        },
      });

      return response.data.voices || [];
    } catch (error) {
      console.error('Failed to fetch ElevenLabs voices:', error.message);
      return [];
    }
  }
}
