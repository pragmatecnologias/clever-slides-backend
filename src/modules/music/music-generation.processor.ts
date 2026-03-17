import { Logger } from '@nestjs/common';
import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { MusicMedia, MusicStatus } from '../../entities/music-media.entity';
import { SunoProvider } from './providers/suno.provider';

@Processor('music-generation')
export class MusicGenerationProcessor {
  private readonly logger = new Logger(MusicGenerationProcessor.name);

  constructor(
    @InjectRepository(MusicMedia)
    private musicRepository: Repository<MusicMedia>,
    private sunoProvider: SunoProvider,
  ) {}

  @Process('generate')
  async handleGeneration(job: Job) {
    const { musicId, prompt, genre, durationSeconds, provider, title, instrumental } = job.data;
    this.logger.log(
      `Music generation job started: jobId=${String(job.id)}, musicId=${musicId}, provider=${provider}, promptLength=${String(prompt || '').length}, genre=${String(genre || 'n/a')}`,
    );

    const music = await this.musicRepository.findOne({ where: { id: musicId } });
    if (!music) {
      throw new Error('Music not found');
    }
    if (music.status === MusicStatus.COMPLETED && music.filePath) {
      this.logger.warn(
        `Music generation skipped: musicId=${music.id} already completed with filePath=${music.filePath}`,
      );
      return { success: true, musicId: music.id, skipped: true };
    }

    try {
      music.status = MusicStatus.PROCESSING;
      music.errorMessage = 'Music task queued for provider processing...';
      await this.musicRepository.save(music);

      let result: { filePath: string; durationSeconds: number; tracks?: any[]; selectedTrackId?: string };

      if (provider === 'suno') {
        result = await this.sunoProvider.generate(
          prompt,
          genre,
          durationSeconds,
          {
            title,
            instrumental: typeof instrumental === 'boolean' ? instrumental : true,
          },
          async (progress) => {
            const attemptText =
              typeof progress.attempt === 'number' ? ` (attempt ${progress.attempt})` : '';
            const taskText = progress.taskId ? ` taskId=${progress.taskId}` : '';
            const statusLine = `[Suno ${progress.status}]${attemptText}${taskText} ${progress.message}`;

            this.logger.log(`Music progress: musicId=${music.id} ${statusLine}`);
            await this.musicRepository.update(music.id, {
              errorMessage: statusLine.slice(0, 1000),
              status: MusicStatus.PROCESSING,
            });
          },
        );
      } else {
        throw new Error(`Unknown music provider: ${provider}`);
      }

      this.logger.log(
        `Music finalize started: musicId=${music.id}, hasTracks=${Array.isArray(result.tracks) ? result.tracks.length : 0}, selectedTrackId=${String(result.selectedTrackId || 'n/a')}`,
      );
      await this.persistCompletion(music, result);
      this.logger.log(
        `Music generation completed: musicId=${music.id}, filePath=${result.filePath}, durationSeconds=${result.durationSeconds}`,
      );

      return { success: true, musicId: music.id };
    } catch (error) {
      music.status = MusicStatus.FAILED;
      music.errorMessage = error.message;
      await this.musicRepository.save(music);
      this.logger.error(
        `Music generation failed: musicId=${music.id}, provider=${provider}, error=${error.message}`,
      );
      throw error;
    }
  }

  private async persistCompletion(
    music: MusicMedia,
    result: { filePath: string; durationSeconds: number; tracks?: any[]; selectedTrackId?: string },
  ) {
    const normalizedDuration = this.normalizeDurationSeconds(result.durationSeconds);
    music.filePath = result.filePath;
    music.durationSeconds = normalizedDuration;
    music.tracks = Array.isArray(result.tracks) ? result.tracks : null;
    music.selectedTrackId = result.selectedTrackId || null;
    music.status = MusicStatus.COMPLETED;
    music.errorMessage = null;

    try {
      await this.musicRepository.save(music);
      return;
    } catch (error) {
      const message = (error as Error)?.message || 'unknown error';
      const isQueryFailure = error instanceof QueryFailedError;
      this.logger.error(
        `Music finalize save failed: musicId=${music.id}, queryFailure=${isQueryFailure}, error=${message}`,
      );
      if (!isQueryFailure) {
        throw error;
      }
    }

    await this.musicRepository.update(music.id, {
      filePath: result.filePath,
      durationSeconds: normalizedDuration,
      status: MusicStatus.COMPLETED,
      errorMessage: null,
    });
    this.logger.warn(
      `Music finalize fallback used (without tracks columns): musicId=${music.id}`,
    );
  }

  private normalizeDurationSeconds(value: number): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return 180;
    }
    return Math.max(1, Math.round(parsed));
  }
}
