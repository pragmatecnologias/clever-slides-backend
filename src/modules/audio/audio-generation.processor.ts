import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AudioMedia, AudioStatus } from '../../entities/audio-media.entity';
import { ElevenLabsProvider } from './providers/elevenlabs.provider';

@Processor('audio-generation')
export class AudioGenerationProcessor {
  constructor(
    @InjectRepository(AudioMedia)
    private audioRepository: Repository<AudioMedia>,
    private elevenLabsProvider: ElevenLabsProvider,
  ) {}

  @Process('generate')
  async handleGeneration(job: Job) {
    const { audioId, text, voiceId, provider } = job.data;

    const audio = await this.audioRepository.findOne({ where: { id: audioId } });
    if (!audio) {
      throw new Error('Audio not found');
    }

    try {
      audio.status = AudioStatus.PROCESSING;
      await this.audioRepository.save(audio);

      let result: { filePath: string; durationSeconds: number };

      if (provider === 'elevenlabs') {
        result = await this.elevenLabsProvider.generate(text, voiceId);
      } else {
        throw new Error(`Unknown audio provider: ${provider}`);
      }

      audio.filePath = result.filePath;
      audio.durationSeconds = result.durationSeconds;
      audio.status = AudioStatus.COMPLETED;
      await this.audioRepository.save(audio);

      return { success: true, audioId: audio.id };
    } catch (error) {
      audio.status = AudioStatus.FAILED;
      audio.errorMessage = error.message;
      await this.audioRepository.save(audio);
      throw error;
    }
  }
}
