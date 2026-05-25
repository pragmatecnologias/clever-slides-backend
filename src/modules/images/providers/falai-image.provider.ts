import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class FalAiImageProvider {
  private apiKey: string;
  private storagePath: string;
  private model: string;

  constructor(private configService: ConfigService) {
    this.apiKey = this.configService.get('FAL_KEY') || '';
    this.storagePath = this.configService.get('STORAGE_PATH') || './uploads';
    this.model = 'fal-ai/flux/schnell';
    if (!fs.existsSync(this.storagePath)) {
      fs.mkdirSync(this.storagePath, { recursive: true });
    }
  }

  async generate(prompt: string): Promise<string> {
    if (!this.apiKey) {
      throw new BadRequestException(
        'fal.ai image provider is not configured (FAL_KEY is missing). Set FAL_KEY in environment.',
      );
    }

    try {
      const response = await axios.post(
        `https://fal.run/${this.model}`,
        {
          prompt,
          image_size: 'landscape_16_9',
          num_inference_steps: 4,
        },
        {
          headers: {
            Authorization: `Key ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 120_000,
        },
      );

      const imageUrl = response.data?.images?.[0]?.url;
      if (!imageUrl) {
        throw new BadRequestException('fal.ai image generation returned no image URL.');
      }

      const imageResponse = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 60_000 });
      const filename = `falai-${Date.now()}-${Math.random().toString(36).slice(2)}.png`;
      const filepath = path.join(this.storagePath, filename);
      fs.writeFileSync(filepath, Buffer.from(imageResponse.data));
      return filepath;
    } catch (error: any) {
      const providerMessage =
        error?.response?.data?.detail ||
        error?.response?.data?.message ||
        error?.message ||
        'Unknown fal.ai error';
      throw new BadRequestException(`fal.ai image generation failed: ${providerMessage}`);
    }
  }
}
