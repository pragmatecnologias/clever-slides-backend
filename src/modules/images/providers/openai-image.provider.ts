import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class OpenAiImageProvider {
  private apiKey: string;
  private storagePath: string;

  constructor(private configService: ConfigService) {
    this.apiKey = this.configService.get('OPENAI_API_KEY');
    this.storagePath = this.configService.get('STORAGE_PATH') || './uploads';
    if (!fs.existsSync(this.storagePath)) {
      fs.mkdirSync(this.storagePath, { recursive: true });
    }
  }

  async generate(prompt: string): Promise<string> {
    if (!this.apiKey) {
      throw new BadRequestException(
        'OpenAI image provider is not configured (OPENAI_API_KEY is missing). Use Stable Diffusion or set OPENAI_API_KEY.',
      );
    }

    try {
      const response = await axios.post(
        'https://api.openai.com/v1/images/generations',
        {
          model: 'dall-e-3',
          prompt,
          size: '1792x1024',
          quality: 'standard',
          n: 1,
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 60_000,
        },
      );

      const imageUrl = response.data?.data?.[0]?.url;
      if (!imageUrl) {
        throw new BadRequestException('OpenAI image generation returned no image URL.');
      }

      const imageResponse = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 60_000 });
      const filename = `openai-${Date.now()}-${Math.random().toString(36).slice(2)}.png`;
      const filepath = path.join(this.storagePath, filename);
      fs.writeFileSync(filepath, Buffer.from(imageResponse.data));
      return filepath;
    } catch (error: any) {
      const providerMessage =
        error?.response?.data?.error?.message ||
        error?.response?.data?.message ||
        error?.message ||
        'OpenAI image generation failed';
      throw new BadRequestException(`OpenAI image generation failed: ${providerMessage}`);
    }
  }
}
