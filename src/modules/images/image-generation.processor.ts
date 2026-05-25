import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Slide, SlideImageStatus } from '../../entities/slide.entity';
import { LocalImageProvider } from './providers/local-image.provider';
import { OpenAiImageProvider } from './providers/openai-image.provider';
import { FalAiImageProvider } from './providers/falai-image.provider';
import { ImagesEventsService } from './images-events.service';

@Processor('image-generation')
export class ImageGenerationProcessor {
  constructor(
    @InjectRepository(Slide)
    private slideRepository: Repository<Slide>,
    private localProvider: LocalImageProvider,
    private openAiProvider: OpenAiImageProvider,
    private falAiProvider: FalAiImageProvider,
    private imagesEventsService: ImagesEventsService,
  ) {}

  private buildPresetDirective(preset?: string): string {
    const key = String(preset || '').trim().toLowerCase();
    if (!key) return '';
    const directives: Record<string, string> = {
      worship: 'Style direction: reverent worship atmosphere, warm light, sacred architectural cues, no text.',
      biblical: 'Style direction: biblical-era environment, historical texture, cinematic realism, no text.',
      modern: 'Style direction: modern clean composition, geometric balance, cinematic contrast, no text.',
      minimal: 'Style direction: minimalist composition, negative space, subtle tonal palette, no text.',
      nature: 'Style direction: natural landscapes, organic textures, calm color harmony, no text.',
      abstract: 'Style direction: abstract symbolic forms, expressive color gradients, high visual impact, no text.',
      cyberpunk: 'Style direction: neon accents, high contrast, futuristic composition, no text.',
      aurora: 'Style direction: atmospheric aurora light bands, soft glow gradients, no text.',
    };
    return directives[key] || `Style direction: ${key}.`;
  }

  private applyPresetToPrompt(prompt: string, preset?: string): string {
    const base = (prompt || '').trim();
    const directive = this.buildPresetDirective(preset);
    if (!directive) return base;
    if (!base) return directive;
    return `${directive}\n${base}`;
  }

  @Process('generate')
  async handle(job: Job) {
    const { slideId, provider, prompt, preset, target } = job.data;
    const slide = await this.slideRepository.findOne({ where: { id: slideId }, relations: ['deck'] });
    if (!slide) {
      return { status: 'missing' };
    }
    const churchId = slide.deck?.churchId || '';
    const imageTarget = target === 'content' ? 'content' : 'background';

    try {
      const finalPrompt = this.applyPresetToPrompt(prompt, preset);
      const imageUrl = provider === 'openai'
        ? await this.openAiProvider.generate(finalPrompt)
        : provider === 'falai'
        ? await this.falAiProvider.generate(finalPrompt)
        : await this.localProvider.generate(finalPrompt, preset);

      if (imageTarget === 'content') {
        slide.contentImageUrl = imageUrl;
        slide.contentImageStatus = SlideImageStatus.READY;
      } else {
        slide.imageUrl = imageUrl;
        slide.imageStatus = SlideImageStatus.READY;
      }
      await this.slideRepository.save(slide);
      this.imagesEventsService.emit({
        slideId: slide.id,
        status: SlideImageStatus.READY,
        imageUrl,
        churchId,
        target: imageTarget,
      });
      return { status: 'ready', imageUrl };
    } catch (error) {
      if (imageTarget === 'content') {
        slide.contentImageStatus = SlideImageStatus.FAILED;
      } else {
        slide.imageStatus = SlideImageStatus.FAILED;
      }
      await this.slideRepository.save(slide);
      this.imagesEventsService.emit({
        slideId: slide.id,
        status: SlideImageStatus.FAILED,
        imageUrl: imageTarget === 'content' ? slide.contentImageUrl || null : slide.imageUrl || null,
        churchId,
        target: imageTarget,
      });
      throw error;
    }
  }
}
