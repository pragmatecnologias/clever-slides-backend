import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MusicMedia, MusicStatus } from '../../entities/music-media.entity';
import { SunoProvider } from './providers/suno.provider';

@Processor('music-generation')
export class MusicGenerationProcessor {
  constructor(
    @InjectRepository(MusicMedia)
    private musicRepository: Repository<MusicMedia>,
    private sunoProvider: SunoProvider,
  ) {}

  @Process('generate')
  async handleGeneration(job: Job) {
    const { musicId, prompt, genre, durationSeconds, provider } = job.data;

    const music = await this.musicRepository.findOne({ where: { id: musicId } });
    if (!music) {
      throw new Error('Music not found');
    }

    try {
      music.status = MusicStatus.PROCESSING;
      await this.musicRepository.save(music);

      let result: { filePath: string; durationSeconds: number };

      if (provider === 'suno') {
        result = await this.sunoProvider.generate(prompt, genre, durationSeconds);
      } else {
        throw new Error(`Unknown music provider: ${provider}`);
      }

      music.filePath = result.filePath;
      music.durationSeconds = result.durationSeconds;
      music.status = MusicStatus.COMPLETED;
      await this.musicRepository.save(music);

      return { success: true, musicId: music.id };
    } catch (error) {
      music.status = MusicStatus.FAILED;
      music.errorMessage = error.message;
      await this.musicRepository.save(music);
      throw error;
    }
  }
}
