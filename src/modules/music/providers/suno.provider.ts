import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class SunoProvider {
  private apiKey: string;
  private storagePath: string;
  private apiBaseUrl: string;
  private readonly pollIntervalMs: number;
  private readonly maxPollAttempts: number;
  private readonly requestTimeoutMs: number;
  private readonly model: string;

  constructor(private configService: ConfigService) {
    this.apiKey = this.configService.get('SUNO_API_KEY');
    this.storagePath = this.configService.get('STORAGE_PATH') || './uploads';
    this.apiBaseUrl = (this.configService.get('SUNO_API_BASE_URL') || 'https://api.sunoapi.org').replace(/\/+$/, '');
    this.pollIntervalMs = Number(this.configService.get('SUNO_POLL_INTERVAL_MS') || 4000);
    this.maxPollAttempts = Number(this.configService.get('SUNO_MAX_POLL_ATTEMPTS') || 75);
    this.requestTimeoutMs = Number(this.configService.get('SUNO_TIMEOUT_MS') || 60000);
    this.model = this.configService.get('SUNO_MODEL') || 'V4_5ALL';
    const musicPath = path.join(this.storagePath, 'music');
    if (!fs.existsSync(musicPath)) {
      fs.mkdirSync(musicPath, { recursive: true });
    }
  }

  async generate(prompt: string, genre?: string, durationSeconds?: number): Promise<{ filePath: string; durationSeconds: number }> {
    if (!this.apiKey) {
      throw new BadRequestException('SUNO_API_KEY is not configured');
    }
    const cleanedPrompt = String(prompt || '').trim();
    if (!cleanedPrompt) {
      throw new BadRequestException('Music prompt is required');
    }

    try {
      const callbackUrl = this.configService.get('SUNO_CALLBACK_URL');
      const createBody: Record<string, any> = {
        customMode: true,
        instrumental: true,
        model: this.model,
        prompt: cleanedPrompt,
        style: String(genre || 'Worship').slice(0, 120),
        title: this.deriveTitle(cleanedPrompt),
      };
      if (callbackUrl) {
        createBody.callBackUrl = callbackUrl;
      }

      const createResponse = await axios.post(
        `${this.apiBaseUrl}/api/v1/generate`,
        createBody,
        {
          headers: this.authHeaders(),
          timeout: this.requestTimeoutMs,
        },
      );

      const createData = createResponse?.data;
      if (Number(createData?.code) !== 200 || !createData?.data?.taskId) {
        throw new Error(`Suno task creation failed: ${createData?.msg || 'unknown error'}`);
      }
      const taskId = String(createData.data.taskId);

      const details = await this.waitForCompletion(taskId);
      const sunoData = Array.isArray(details?.response?.sunoData) ? details.response.sunoData : [];
      const selectedTrack = sunoData.find((item: any) => String(item?.audioUrl || '').startsWith('http'));
      if (!selectedTrack?.audioUrl) {
        throw new Error('Suno task completed but no downloadable audioUrl was returned');
      }

      const audioResponse = await axios.get(selectedTrack.audioUrl, {
        responseType: 'arraybuffer',
        timeout: this.requestTimeoutMs,
      });
      const audioBuffer = Buffer.from(audioResponse.data);
      if (!audioBuffer.length) {
        throw new Error('Downloaded Suno audio is empty');
      }

      const filename = `music-${Date.now()}-${Math.random().toString(36).slice(2)}.mp3`;
      const filepath = path.join(this.storagePath, 'music', filename);
      fs.writeFileSync(filepath, audioBuffer);

      const duration =
        Number(selectedTrack?.duration) ||
        Number(durationSeconds) ||
        180;

      return { filePath: filepath, durationSeconds: duration };
    } catch (error) {
      const message = axios.isAxiosError(error)
        ? `${error.response?.status || 'ERR'} ${error.response?.data?.msg || error.message}`
        : (error as Error)?.message || 'unknown error';
      console.error('Suno API error:', message);
      throw new BadRequestException(`Failed to generate music with Suno: ${message}`);
    }
  }

  private async waitForCompletion(taskId: string): Promise<any> {
    const failedStatuses = new Set([
      'CREATE_TASK_FAILED',
      'GENERATE_AUDIO_FAILED',
      'CALLBACK_EXCEPTION',
      'SENSITIVE_WORD_ERROR',
    ]);

    for (let attempt = 0; attempt < this.maxPollAttempts; attempt += 1) {
      const detailsResponse = await axios.get(
        `${this.apiBaseUrl}/api/v1/generate/record-info`,
        {
          headers: this.authHeaders(),
          params: { taskId },
          timeout: this.requestTimeoutMs,
        },
      );
      const details = detailsResponse?.data?.data;
      const status = String(details?.status || '').toUpperCase();
      if (status === 'SUCCESS' || status === 'FIRST_SUCCESS') {
        return details;
      }
      if (failedStatuses.has(status)) {
        const errorCode = details?.errorCode ? ` (${details.errorCode})` : '';
        throw new Error(`Suno task failed with status ${status}${errorCode}: ${details?.errorMessage || 'no details'}`);
      }

      await this.sleep(this.pollIntervalMs);
    }

    throw new Error(`Timed out waiting for Suno task ${taskId} completion`);
  }

  private authHeaders() {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };
  }

  private deriveTitle(prompt: string): string {
    const compact = String(prompt || '')
      .replace(/\s+/g, ' ')
      .replace(/[^\w\s\-\u00C0-\u017F]/g, '')
      .trim();
    const base = compact || 'Sermon Worship Track';
    return base.length > 70 ? base.slice(0, 70).trim() : base;
  }

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async getGenres(): Promise<string[]> {
    return [
      'worship',
      'ambient',
      'cinematic',
      'uplifting',
      'peaceful',
      'reflective',
      'contemporary',
      'classical',
    ];
  }
}
