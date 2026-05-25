import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Deck, DeckStatus } from '../../entities/deck.entity';
import { Slide, SlideImageStatus } from '../../entities/slide.entity';
import { SlideType } from '../../entities/slide-types';
import { Sermon } from '../../entities/sermon.entity';
import { BrandTheme } from '../../entities/brand-theme.entity';
import { SlideTemplate } from '../../entities/slide-template.entity';
import { SimpleDeckGenerationService } from '../llm/simple-deck-generation.service';
import { SermonDeckComposerService } from '../composition/sermon-deck-composer.service';
import { DeckSizeKey, VisualStyleKey, resolveDeckBackgroundPreset } from '../../../../../shared/deck-composition.contract';

@Processor('deck-generation')
export class DeckGenerationProcessor {
  private logger = new Logger(DeckGenerationProcessor.name);

  constructor(
    @InjectRepository(Deck)
    private deckRepository: Repository<Deck>,
    @InjectRepository(Slide)
    private slideRepository: Repository<Slide>,
    @InjectRepository(Sermon)
    private sermonRepository: Repository<Sermon>,
    @InjectRepository(BrandTheme)
    private themeRepository: Repository<BrandTheme>,
    @InjectRepository(SlideTemplate)
    private templateRepository: Repository<SlideTemplate>,
    private simpleDeckGenerationService: SimpleDeckGenerationService,
    @InjectQueue('image-generation')
    private imageGenerationQueue: Queue,
    private readonly sermonDeckComposerService: SermonDeckComposerService,
  ) {}

  @Process('generate')
  async handleGeneration(job: Job) {
    const {
      deckId,
      deckSize,
      deckIntent = 'sermon_presentation',
      templatePlan,
      templatePackId,
      backgroundProvider = 'local',
      backgroundPreset = 'modern',
    } = job.data;

    try {
      this.logger.log(`Starting deck generation for deck ${deckId}`);

      const deck = await this.deckRepository.findOne({
        where: { id: deckId },
        relations: ['sermon', 'theme'],
      });

      if (!deck) {
        throw new Error('Deck not found');
      }

      const requestedVisualStyle = String((job.data as any)?.visualStyle || deck.composition?.visualStyle || 'auto') as VisualStyleKey;
      const composition = deck.composition || this.sermonDeckComposerService.composeDeck(
        deck.sermon,
        deck.deckIntent as any,
        (deckSize as DeckSizeKey) || 'standard',
        requestedVisualStyle,
        {
          sermonId: deck.sermon?.id,
          themeId: deck.theme?.id,
        },
      );
      if (!deck.composition) {
        deck.composition = composition;
        await this.deckRepository.save(deck);
      }

      // resolveTemplates respects templatePlan (for LLM-based curation).
      // For SimpleDeckGenerationService, pass ALL templates from the pack so every
      // slide type can be assigned a templateId for regenerate support.
      const allTemplates = templatePackId || deck.theme?.defaultTemplatePackId
        ? await this.templateRepository.find({
            where: { packId: templatePackId || deck.theme.defaultTemplatePackId },
            order: { sortOrder: 'ASC', name: 'ASC' },
          })
        : [];
      this.logger.log(`Resolved ${allTemplates.length} templates for slide generation`);

      // Use simple deck generation service that uses sermon data directly (no LLM calls)
      const slides = await this.simpleDeckGenerationService.generateDeck(
        deck.sermon,
        deck.theme,
        deckSize,
        allTemplates,
        deckIntent,
        composition as any,
        (progress, message) => {
          this.logger.log(`Deck ${deckId} progress: ${progress}% - ${message}`);
          job.progress(progress);
        },
      );

      this.logger.log(`Generated ${slides.length} slides for deck ${deckId}`);

      await this.slideRepository.delete({ deckId });

      const slideEntities = slides.map((slide, index) =>
        this.slideRepository.create({
          deckId: deck.id,
          orderIndex: index,
          type: slide.type,
          layoutKey: slide.layoutKey,
          content: slide.content,
          speakerNotes: slide.speakerNotes,
          templateId: slide.templateId,
          imagePrompt: slide.imagePrompt,
          contentImagePrompt: slide.contentImagePrompt,
          imageProvider: slide.imagePrompt ? backgroundProvider : null,
          imageStatus: slide.imagePrompt ? SlideImageStatus.PENDING : null,
        }),
      );

      const savedSlides = await this.slideRepository.save(slideEntities);
      this.logger.log(`Saved ${slideEntities.length} slides to database for deck ${deckId}`);

      // Auto-generate background images from prompts so deck preview/PPT look complete without manual steps.
      const imageJobs = savedSlides
        .filter((slide) => slide.imagePrompt)
        .map((slide) =>
          this.imageGenerationQueue.add('generate', {
            slideId: slide.id,
            provider: backgroundProvider,
            prompt: slide.imagePrompt,
            preset: resolveDeckBackgroundPreset(
              requestedVisualStyle,
              deckIntent as any,
              backgroundPreset || null,
            ),
            target: 'background',
          }),
        );
      await Promise.all(imageJobs);
      this.logger.log(`Queued ${imageJobs.length} background image jobs for deck ${deckId}`);

      const imageReady = await this.waitForImageReadiness(deckId, savedSlides.filter((slide) => slide.imagePrompt).map((slide) => slide.id));
      if (!imageReady.ready) {
        this.logger.warn(
          `Deck ${deckId} finished with ${imageReady.pendingCount} background image(s) still pending after ${imageReady.elapsedMs}ms`,
        );
      } else {
        this.logger.log(`Deck ${deckId} background images ready after ${imageReady.elapsedMs}ms`);
      }

      deck.status = DeckStatus.READY;
      await this.deckRepository.save(deck);
      this.logger.log(`Deck ${deckId} generation completed successfully - status set to READY`);

      return { success: true };
    } catch (error) {
      this.logger.error(`Deck generation failed for deck ${deckId}:`, error);
      await this.deckRepository.update(deckId, { status: DeckStatus.FAILED });
      throw error;
    }
  }

  private async resolveTemplates(
    templatePlan?: string[],
    templatePackId?: string,
    fallbackPackId?: string,
  ) {
    if (templatePlan && templatePlan.length > 0) {
      const templates = await this.templateRepository.find({
        where: templatePlan.map(id => ({ id })),
      });
      const templateMap = new Map(templates.map(template => [template.id, template]));
      return templatePlan.map(id => templateMap.get(id)).filter(Boolean);
    }

    const packId = templatePackId || fallbackPackId;
    if (!packId) {
      return [];
    }

    return this.templateRepository.find({
      where: { packId },
      order: { sortOrder: 'ASC', name: 'ASC' },
    });
  }

  private async waitForImageReadiness(deckId: string, slideIds: string[], timeoutMs = 90000) {
    const start = Date.now();
    const targetIds = new Set(slideIds.filter(Boolean));
    if (!targetIds.size) {
      return { ready: true, pendingCount: 0, elapsedMs: 0 };
    }

    while (Date.now() - start < timeoutMs) {
      const slides = await this.slideRepository.find({
        where: { deckId },
        order: { orderIndex: 'ASC' },
      });
      const pendingCount = slides.filter((slide) => targetIds.has(slide.id) && String(slide.imageStatus || '').toLowerCase() === 'pending').length;
      if (pendingCount === 0) {
        return { ready: true, pendingCount: 0, elapsedMs: Date.now() - start };
      }
      await new Promise((resolve) => setTimeout(resolve, 2500));
    }

    const finalSlides = await this.slideRepository.find({
      where: { deckId },
      order: { orderIndex: 'ASC' },
    });
    const pendingCount = finalSlides.filter((slide) => targetIds.has(slide.id) && String(slide.imageStatus || '').toLowerCase() === 'pending').length;
    return { ready: pendingCount === 0, pendingCount, elapsedMs: Date.now() - start };
  }
}
