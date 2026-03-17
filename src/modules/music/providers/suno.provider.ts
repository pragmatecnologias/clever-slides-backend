import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';

export type SunoTrackOption = {
  trackId: string;
  audioUrl: string;
  streamAudioUrl?: string;
  imageUrl?: string;
  title?: string;
  durationSeconds?: number;
};

@Injectable()
export class SunoProvider {
  private readonly logger = new Logger(SunoProvider.name);
  private apiKey: string;
  private storagePath: string;
  private apiBaseUrl: string;
  private readonly pollIntervalMs: number;
  private readonly maxPollAttempts: number;
  private readonly requestTimeoutMs: number;
  private readonly model: string;
  private readonly callbackUrl: string;
  private readonly mockMode: boolean;
  private readonly mockDelayMs: number;

  constructor(private configService: ConfigService) {
    this.apiKey = this.configService.get('SUNO_API_KEY');
    this.storagePath = this.configService.get('STORAGE_PATH') || './uploads';
    this.apiBaseUrl = (this.configService.get('SUNO_API_BASE_URL') || 'https://api.sunoapi.org').replace(/\/+$/, '');
    this.pollIntervalMs = Number(this.configService.get('SUNO_POLL_INTERVAL_MS') || 4000);
    this.maxPollAttempts = Number(this.configService.get('SUNO_MAX_POLL_ATTEMPTS') || 75);
    this.requestTimeoutMs = Number(this.configService.get('SUNO_TIMEOUT_MS') || 60000);
    this.model = this.configService.get('SUNO_MODEL') || 'V4_5ALL';
    this.callbackUrl = this.resolveCallbackUrl();
    this.mockMode = String(this.configService.get('SUNO_MOCK_MODE') || '').trim().toLowerCase() === 'true';
    this.mockDelayMs = Number(this.configService.get('SUNO_MOCK_DELAY_MS') || 1000);
    this.logger.log(
      `Suno provider initialized: apiBaseUrl=${this.apiBaseUrl}, model=${this.model}, callbackUrl=${this.callbackUrl}, pollIntervalMs=${this.pollIntervalMs}, maxPollAttempts=${this.maxPollAttempts}, mockMode=${this.mockMode}`,
    );
    const musicPath = path.join(this.storagePath, 'music');
    if (!fs.existsSync(musicPath)) {
      fs.mkdirSync(musicPath, { recursive: true });
    }
  }

  async generate(
    prompt: string,
    genre?: string,
    durationSeconds?: number,
    options?: { title?: string; instrumental?: boolean },
    onProgress?: (progress: { taskId?: string; status: string; attempt?: number; message: string }) => Promise<void> | void,
  ): Promise<{ filePath: string; durationSeconds: number; tracks: SunoTrackOption[]; selectedTrackId?: string }> {
    if (this.mockMode) {
      return this.generateMockTracks(durationSeconds, onProgress);
    }
    if (!this.apiKey) {
      throw new BadRequestException('SUNO_API_KEY is not configured');
    }
    const cleanedPrompt = String(prompt || '').trim();
    if (!cleanedPrompt) {
      throw new BadRequestException('Music prompt is required');
    }

    try {
      const instrumental = typeof options?.instrumental === 'boolean' ? options.instrumental : true;
      const requestedTitle = this.deriveTitle(options?.title || cleanedPrompt);
      this.logger.log(
        `Starting Suno generation: promptLength=${cleanedPrompt.length}, genre=${String(genre || 'Worship')}, requestedDuration=${Number(durationSeconds) || 0}, instrumental=${instrumental}, callbackUrl=${this.callbackUrl}`,
      );
      const createBody: Record<string, any> = {
        customMode: true,
        instrumental,
        model: this.model,
        prompt: cleanedPrompt,
        style: String(genre || 'Worship').slice(0, 120),
        title: requestedTitle,
        callBackUrl: this.callbackUrl,
      };

      const createResponse = await axios.post(
        `${this.apiBaseUrl}/api/v1/generate`,
        createBody,
        {
          headers: this.authHeaders(),
          timeout: this.requestTimeoutMs,
        },
      );

      const createData = createResponse?.data;
      this.logger.log(
        `Suno create response: code=${createData?.code}, msg=${createData?.msg || 'n/a'}, hasTaskId=${Boolean(createData?.data?.taskId)}`,
      );
      if (Number(createData?.code) !== 200 || !createData?.data?.taskId) {
        throw new Error(`Suno task creation failed: ${createData?.msg || 'unknown error'}`);
      }
      const taskId = String(createData.data.taskId);
      this.logger.log(`Suno task created: taskId=${taskId}`);
      await onProgress?.({
        taskId,
        status: 'TASK_CREATED',
        message: 'Suno task created. Waiting for generation...',
      });

      const details = await this.waitForCompletion(taskId, onProgress);
      const sunoData = Array.isArray(details?.response?.sunoData) ? details.response.sunoData : [];
      const tracksWithAudio = sunoData
        .map((item: any) => this.normalizeTrack(item))
        .filter((item: SunoTrackOption) => Boolean(item.audioUrl));
      this.logger.log(`Suno task completed: taskId=${taskId}, returnedTracks=${sunoData.length}, tracksWithAudio=${tracksWithAudio.length}`);
      if (tracksWithAudio.length > 1) {
        this.logger.log(
          `Suno returned multiple tracks: taskId=${taskId}, trackIds=${tracksWithAudio.map((item: SunoTrackOption) => item.trackId || 'unknown').join(',')}`,
        );
      }
      const selectedTrack = tracksWithAudio
        .slice()
        .sort((a: SunoTrackOption, b: SunoTrackOption) => Number(b?.durationSeconds || 0) - Number(a?.durationSeconds || 0))[0];
      if (!selectedTrack?.audioUrl) {
        this.logger.error(`Suno task has no downloadable audio URL: taskId=${taskId}`);
        throw new Error('Suno task completed but no downloadable audioUrl was returned');
      }
      this.logger.log(
        `Selected Suno track: taskId=${taskId}, trackId=${String(selectedTrack?.trackId || 'unknown')}, duration=${Number(selectedTrack?.durationSeconds) || 0}, audioUrl=${String(selectedTrack.audioUrl).slice(0, 120)}`,
      );

      const downloadResult = await this.downloadTrackToFile(selectedTrack.audioUrl, taskId);
      const filepath = downloadResult.filePath;
      const savedBytes = downloadResult.bytes;
      this.logger.log(`Saved Suno audio file: taskId=${taskId}, path=${filepath}, savedBytes=${savedBytes}`);
      await onProgress?.({
        taskId,
        status: 'SAVED',
        message: `Audio saved (${savedBytes} bytes)`,
      });

      const duration =
        Number(selectedTrack?.durationSeconds) ||
        Number(durationSeconds) ||
        180;

      return {
        filePath: filepath,
        durationSeconds: duration,
        tracks: tracksWithAudio,
        selectedTrackId: selectedTrack.trackId,
      };
    } catch (error) {
      const message = axios.isAxiosError(error)
        ? `${error.response?.status || 'ERR'} ${error.response?.data?.msg || error.message}`
        : (error as Error)?.message || 'unknown error';
      this.logger.error(`Suno generation failed: ${message}`);
      throw new BadRequestException(`Failed to generate music with Suno: ${message}`);
    }
  }

  async selectTrack(track: SunoTrackOption): Promise<{ filePath: string; durationSeconds: number; selectedTrackId: string }> {
    if (!track?.audioUrl) {
      throw new BadRequestException('Track audio URL is required');
    }
    if (track.audioUrl.startsWith('local://')) {
      const relativePath = track.audioUrl.replace('local://', '');
      const absolutePath = path.join(this.storagePath, relativePath);
      if (!fs.existsSync(absolutePath)) {
        throw new BadRequestException('Mock local track file not found');
      }
      return {
        filePath: absolutePath,
        durationSeconds: Number(track.durationSeconds) || 180,
        selectedTrackId: track.trackId,
      };
    }
    const downloadResult = await this.downloadTrackToFile(track.audioUrl, `select-${track.trackId || 'unknown'}`);
    return {
      filePath: downloadResult.filePath,
      durationSeconds: Number(track.durationSeconds) || 180,
      selectedTrackId: track.trackId,
    };
  }

  private async waitForCompletion(
    taskId: string,
    onProgress?: (progress: { taskId?: string; status: string; attempt?: number; message: string }) => Promise<void> | void,
  ): Promise<any> {
    const failedStatuses = new Set([
      'CREATE_TASK_FAILED',
      'GENERATE_AUDIO_FAILED',
      'SENSITIVE_WORD_ERROR',
    ]);
    let firstSuccessDetails: any = null;

    for (let attempt = 0; attempt < this.maxPollAttempts; attempt += 1) {
      const details = await this.fetchTaskDetails(taskId);
      const status = String(details?.status || '').toUpperCase();
      this.logger.log(
        `Suno poll: taskId=${taskId}, attempt=${attempt + 1}/${this.maxPollAttempts}, status=${status || 'UNKNOWN'}`,
      );
      await onProgress?.({
        taskId,
        status: status || 'UNKNOWN',
        attempt: attempt + 1,
        message: `Suno status: ${status || 'UNKNOWN'} (${attempt + 1}/${this.maxPollAttempts})`,
      });
      if (status === 'SUCCESS') {
        return details;
      }
      if (status === 'FIRST_SUCCESS') {
        firstSuccessDetails = details;
        await this.sleep(this.pollIntervalMs);
        continue;
      }
      if (status === 'CALLBACK_EXCEPTION') {
        const callbackTracks = Array.isArray(details?.response?.sunoData) ? details.response.sunoData : [];
        this.logger.warn(
          `Suno callback exception: taskId=${taskId}, callbackTracks=${callbackTracks.length}`,
        );
        if (callbackTracks.some((item: any) => String(item?.audioUrl || '').startsWith('http'))) {
          return details;
        }
      }
      if (failedStatuses.has(status)) {
        const errorCode = details?.errorCode ? ` (${details.errorCode})` : '';
        this.logger.error(
          `Suno failed status: taskId=${taskId}, status=${status}, errorCode=${details?.errorCode || 'n/a'}, errorMessage=${details?.errorMessage || 'no details'}`,
        );
        throw new Error(`Suno task failed with status ${status}${errorCode}: ${details?.errorMessage || 'no details'}`);
      }

      await this.sleep(this.pollIntervalMs);
    }

    if (firstSuccessDetails) {
      this.logger.warn(`Suno task timed out waiting for SUCCESS; using FIRST_SUCCESS result: taskId=${taskId}`);
      const detailsAfterDelay = await this.refreshFirstSuccessDetails(taskId);
      return detailsAfterDelay || firstSuccessDetails;
    }

    throw new Error(`Timed out waiting for Suno task ${taskId} completion`);
  }

  private authHeaders() {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };
  }

  private async fetchTaskDetails(taskId: string): Promise<any> {
    const detailsResponse = await axios.get(
      `${this.apiBaseUrl}/api/v1/generate/record-info`,
      {
        headers: this.authHeaders(),
        params: { taskId },
        timeout: this.requestTimeoutMs,
      },
    );
    return detailsResponse?.data?.data;
  }

  private async refreshFirstSuccessDetails(taskId: string): Promise<any | null> {
    const maxRefreshAttempts = 3;
    for (let attempt = 1; attempt <= maxRefreshAttempts; attempt += 1) {
      await this.sleep(this.pollIntervalMs);
      try {
        const details = await this.fetchTaskDetails(taskId);
        const status = String(details?.status || '').toUpperCase();
        const tracks = Array.isArray(details?.response?.sunoData) ? details.response.sunoData : [];
        const tracksWithAudio = tracks.filter((item: any) => String(item?.audioUrl || '').startsWith('http')).length;

        this.logger.log(
          `Suno FIRST_SUCCESS refresh: taskId=${taskId}, refreshAttempt=${attempt}/${maxRefreshAttempts}, status=${status || 'UNKNOWN'}, tracks=${tracks.length}, tracksWithAudio=${tracksWithAudio}`,
        );

        if (status === 'SUCCESS' || tracksWithAudio > 1) {
          this.logger.log(
            `Suno FIRST_SUCCESS refresh accepted: taskId=${taskId}, status=${status || 'UNKNOWN'}, tracksWithAudio=${tracksWithAudio}`,
          );
          return details;
        }
      } catch (error) {
        const message = axios.isAxiosError(error)
          ? `${error.response?.status || 'ERR'} ${error.response?.data?.msg || error.message}`
          : (error as Error)?.message || 'unknown error';
        this.logger.warn(
          `Suno FIRST_SUCCESS refresh failed: taskId=${taskId}, refreshAttempt=${attempt}/${maxRefreshAttempts}, error=${message}`,
        );
      }
    }

    return null;
  }

  private deriveTitle(prompt: string): string {
    const compact = String(prompt || '')
      .replace(/\s+/g, ' ')
      .replace(/[^\w\s\-\u00C0-\u017F]/g, '')
      .trim();
    const base = compact || 'Sermon Worship Track';
    return base.length > 70 ? base.slice(0, 70).trim() : base;
  }

  private normalizeTrack(raw: any): SunoTrackOption {
    return {
      trackId: String(raw?.id || '').trim(),
      audioUrl: String(raw?.audioUrl || '').trim(),
      streamAudioUrl: String(raw?.streamAudioUrl || '').trim() || undefined,
      imageUrl: String(raw?.imageUrl || '').trim() || undefined,
      title: String(raw?.title || '').trim() || undefined,
      durationSeconds: Number(raw?.duration) || undefined,
    };
  }

  private async generateMockTracks(
    durationSeconds?: number,
    onProgress?: (progress: { taskId?: string; status: string; attempt?: number; message: string }) => Promise<void> | void,
  ): Promise<{ filePath: string; durationSeconds: number; tracks: SunoTrackOption[]; selectedTrackId?: string }> {
    const mockTaskId = `mock-${Date.now()}`;
    await onProgress?.({
      taskId: mockTaskId,
      status: 'TASK_CREATED',
      message: 'Mock Suno task created.',
    });
    await this.sleep(Math.max(0, this.mockDelayMs));
    await onProgress?.({
      taskId: mockTaskId,
      status: 'SUCCESS',
      attempt: 1,
      message: 'Mock Suno generation completed.',
    });

    const targetDuration = Number(durationSeconds) || 180;
    const trackA = this.createMockTrack('A', targetDuration + 2);
    const trackB = this.createMockTrack('B', Math.max(30, targetDuration - 3));
    const selected = trackA;
    await onProgress?.({
      taskId: mockTaskId,
      status: 'SAVED',
      message: 'Mock audio files saved.',
    });

    return {
      filePath: selected.absolutePath,
      durationSeconds: Number(selected.durationSeconds) || targetDuration,
      tracks: [
        {
          trackId: trackA.trackId,
          audioUrl: `local://${trackA.relativePath}`,
          title: trackA.title,
          durationSeconds: trackA.durationSeconds,
        },
        {
          trackId: trackB.trackId,
          audioUrl: `local://${trackB.relativePath}`,
          title: trackB.title,
          durationSeconds: trackB.durationSeconds,
        },
      ],
      selectedTrackId: selected.trackId,
    };
  }

  private createMockTrack(
    label: string,
    durationSeconds: number,
  ): {
    trackId: string;
    title: string;
    durationSeconds: number;
    relativePath: string;
    absolutePath: string;
  } {
    const filename = `music/mock-track-${Date.now()}-${label.toLowerCase()}.mp3`;
    const absolutePath = path.join(this.storagePath, filename);
    const fakeAudio = Buffer.from(`MOCK_MP3_${label}_${Date.now()}`);
    fs.writeFileSync(absolutePath, fakeAudio);
    return {
      trackId: `mock-track-${label.toLowerCase()}`,
      title: `Mock Track ${label}`,
      durationSeconds,
      relativePath: filename,
      absolutePath,
    };
  }

  private async downloadTrackToFile(audioUrl: string, contextId: string): Promise<{ filePath: string; bytes: number }> {
    const audioResponse = await axios.get(audioUrl, {
      responseType: 'arraybuffer',
      timeout: this.requestTimeoutMs,
    });
    const audioBuffer = Buffer.from(audioResponse.data);
    this.logger.log(
      `Downloaded Suno audio: contextId=${contextId}, status=${audioResponse.status}, contentType=${String(audioResponse.headers?.['content-type'] || 'unknown')}, bytes=${audioBuffer.length}`,
    );
    if (!audioBuffer.length) {
      this.logger.error(`Downloaded Suno audio is empty: contextId=${contextId}, audioUrl=${String(audioUrl).slice(0, 120)}`);
      throw new Error('Downloaded Suno audio is empty');
    }

    const filename = `music-${Date.now()}-${Math.random().toString(36).slice(2)}.mp3`;
    const filepath = path.join(this.storagePath, 'music', filename);
    fs.writeFileSync(filepath, audioBuffer);
    const savedBytes = fs.statSync(filepath).size;
    return { filePath: filepath, bytes: savedBytes };
  }

  private resolveCallbackUrl(): string {
    const explicit = String(this.configService.get('SUNO_CALLBACK_URL') || '').trim();
    if (explicit) return explicit;

    const apiBase =
      String(
        this.configService.get('API_BASE_URL') ||
        this.configService.get('APP_BASE_URL') ||
        this.configService.get('PUBLIC_API_URL') ||
        this.configService.get('RAILWAY_PUBLIC_DOMAIN') ||
        '',
      ).trim();

    if (apiBase) {
      const normalized = apiBase.replace(/\/+$/, '');
      return `${normalized}/api/v1/music/suno/callback`;
    }

    const port = String(this.configService.get('PORT') || 3001).trim();
    return `http://localhost:${port}/api/v1/music/suno/callback`;
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
