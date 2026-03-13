import { Injectable, BadRequestException, HttpException } from '@nestjs/common';
import { promises as fs } from 'fs';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Slide, SlideImageStatus } from '../../entities/slide.entity';
import { ImageMedia, ImageMediaStatus } from '../../entities/image-media.entity';
import { ImagesEventsService } from './images-events.service';
import { LocalImageProvider } from './providers/local-image.provider';
import { OpenAiImageProvider } from './providers/openai-image.provider';

export type ImageProvider = 'local' | 'openai';

@Injectable()
export class ImagesService {
  constructor(
    @InjectRepository(Slide)
    private slideRepository: Repository<Slide>,
    @InjectRepository(ImageMedia)
    private imageMediaRepository: Repository<ImageMedia>,
    @InjectQueue('image-generation')
    private imageQueue: Queue,
    private imagesEventsService: ImagesEventsService,
    private localProvider: LocalImageProvider,
    private openAiProvider: OpenAiImageProvider,
  ) {}

  async requestImage(
    slideId: string,
    provider: ImageProvider,
    prompt: string | undefined,
    preset: string | undefined,
    churchId: string,
    target: 'background' | 'content' = 'background',
  ) {
    const slide = await this.slideRepository.findOne({
      where: { id: slideId },
      relations: ['deck', 'deck.sermon'],
    });
    if (!slide) {
      throw new BadRequestException('Slide not found');
    }

    if (slide.deck?.churchId !== churchId) {
      throw new BadRequestException('Slide not found');
    }

    const baseImagePrompt =
      prompt ||
      (target === 'content' ? slide.contentImagePrompt : slide.imagePrompt) ||
      (target === 'content' ? this.buildContentImagePrompt(slide) : this.buildImagePrompt(slide));
    const imagePrompt = this.applyPresetToPrompt(baseImagePrompt, preset);
    if (!imagePrompt) {
      throw new BadRequestException('Image prompt is required');
    }

    if (target === 'content') {
      slide.contentImagePrompt = baseImagePrompt;
      slide.contentImageProvider = provider;
      slide.contentImageStatus = SlideImageStatus.PENDING;
    } else {
      slide.imagePrompt = baseImagePrompt;
      slide.imageProvider = provider;
      slide.imageStatus = SlideImageStatus.PENDING;
    }
    await this.slideRepository.save(slide);

    this.imagesEventsService.emit({
      slideId: slide.id,
      status: SlideImageStatus.PENDING,
      imageUrl: target === 'content' ? slide.contentImageUrl || null : slide.imageUrl || null,
      churchId: slide.deck?.churchId,
      target,
    });

    await this.imageQueue.add('generate', {
      slideId,
      provider,
      prompt: imagePrompt,
      preset,
      target,
    });

    return { status: 'queued' };
  }

  private buildImagePrompt(slide: Slide): string {
    const content = slide.content || {};
    const segments: string[] = [];

    if (content.title) segments.push(`Title: ${content.title}`);
    if (content.subtitle) segments.push(`Subtitle: ${content.subtitle}`);
    if (Array.isArray(content.bullets)) segments.push(`Key points: ${content.bullets.join(' ')}`);
    if (content.left) segments.push(`Left: ${content.left}`);
    if (content.right) segments.push(`Right: ${content.right}`);
    if (content.caption) segments.push(`Caption: ${content.caption}`);

    const sermon = slide.deck?.sermon;
    if (sermon?.title) segments.push(`Sermon: ${sermon.title}`);
    if (sermon?.bigIdea) segments.push(`Big idea: ${sermon.bigIdea}`);
    if (sermon?.mainScriptureRef) segments.push(`Scripture: ${sermon.mainScriptureRef}`);

    const base = segments.length ? segments.join('. ') : 'Sermon slide background.';
    return `Create a cinematic church-themed background. ${base}. No text on the image.`;
  }

  private buildContentImagePrompt(slide: Slide): string {
    const content = slide.content || {};
    const segments: string[] = [];

    if (content.title) segments.push(`Title: ${content.title}`);
    if (content.caption) segments.push(`Caption: ${content.caption}`);

    const sermon = slide.deck?.sermon;
    if (sermon?.title) segments.push(`Sermon: ${sermon.title}`);
    if (sermon?.bigIdea) segments.push(`Big idea: ${sermon.bigIdea}`);

    const base = segments.length ? segments.join('. ') : 'Sermon slide image.';
    return `Create a cinematic photo-style image. ${base}. No text in the image.`;
  }

  async getImagePath(slideId: string, churchId: string) {
    const slide = await this.slideRepository.findOne({
      where: { id: slideId },
      relations: ['deck'],
    });

    if (!slide || slide.deck?.churchId !== churchId) {
      throw new BadRequestException('Slide not found');
    }

    if (!slide.imageUrl) {
      throw new BadRequestException('Image not generated');
    }

    return slide.imageUrl;
  }

  async getContentImagePath(slideId: string, churchId: string) {
    const slide = await this.slideRepository.findOne({
      where: { id: slideId },
      relations: ['deck'],
    });

    if (!slide || slide.deck?.churchId !== churchId) {
      throw new BadRequestException('Slide not found');
    }

    if (!slide.contentImageUrl) {
      throw new BadRequestException('Content image not generated');
    }

    return slide.contentImageUrl;
  }

  async generateStandaloneImage(
    createDto: {
      sermonId?: string;
      workspaceId?: string;
      prompt: string;
      provider: ImageProvider;
      preset?: string;
    },
    churchId: string,
  ) {
    if (!createDto?.prompt?.trim()) {
      throw new BadRequestException('Image prompt is required');
    }

    const image = this.imageMediaRepository.create({
      churchId,
      sermonId: createDto.sermonId || null,
      workspaceId: createDto.workspaceId || null,
      prompt: createDto.prompt.trim(),
      provider: createDto.provider || 'local',
      preset: createDto.preset || null,
      status: ImageMediaStatus.PROCESSING,
    });
    await this.imageMediaRepository.save(image);

    try {
      const finalPrompt = this.applyPresetToPrompt(createDto.prompt.trim(), createDto.preset);
      const filePath =
        createDto.provider === 'openai'
          ? await this.openAiProvider.generate(finalPrompt)
          : await this.localProvider.generate(finalPrompt, createDto.preset);

      image.filePath = filePath;
      image.status = ImageMediaStatus.COMPLETED;
      await this.imageMediaRepository.save(image);
      return { id: image.id, status: 'completed' };
    } catch (error: any) {
      image.status = ImageMediaStatus.FAILED;
      const extractedMessage =
        error instanceof HttpException
          ? (error.getResponse() as any)?.message || error.message
          : error?.response?.data?.message || error?.message;
      image.errorMessage = Array.isArray(extractedMessage)
        ? extractedMessage.join('; ')
        : extractedMessage || 'Image generation failed';
      await this.imageMediaRepository.save(image);
      throw new BadRequestException(image.errorMessage);
    }
  }

  async listStandaloneImages(workspaceId: string, churchId: string) {
    return this.imageMediaRepository.find({
      where: { workspaceId, churchId },
      order: { createdAt: 'DESC' },
    });
  }

  async getStandaloneImage(id: string, churchId: string) {
    const image = await this.imageMediaRepository.findOne({ where: { id, churchId } });
    if (!image) {
      throw new BadRequestException('Image not found');
    }
    return image;
  }

  async getStandaloneImagePath(id: string, churchId: string) {
    const image = await this.getStandaloneImage(id, churchId);
    if (!image.filePath) {
      throw new BadRequestException('Image file not generated yet');
    }
    return image.filePath;
  }

  async deleteStandaloneImage(id: string, churchId: string) {
    const image = await this.getStandaloneImage(id, churchId);
    const filePath = image.filePath;
    await this.imageMediaRepository.remove(image);
    if (filePath) {
      try {
        await fs.unlink(filePath);
      } catch {
        // Ignore missing files; DB record removal is authoritative.
      }
    }
    return { deleted: true };
  }

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
}
