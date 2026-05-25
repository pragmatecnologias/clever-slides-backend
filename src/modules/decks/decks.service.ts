import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { Deck, DeckStatus } from '../../entities/deck.entity';
import { Sermon } from '../../entities/sermon.entity';
import { BrandTheme } from '../../entities/brand-theme.entity';
import { Export } from '../../entities/export.entity';
import { CreateDeckDto } from './dto/create-deck.dto';
import { RegenerateDeckDto } from './dto/regenerate-deck.dto';
import { DeckIntent } from './dto/create-deck.dto';
import { SermonDeckComposerService } from '../composition/sermon-deck-composer.service';
import { resolveDeckBackgroundPreset } from '../../../../../shared/deck-composition.contract';

@Injectable()
export class DecksService {
  constructor(
    @InjectRepository(Deck)
    private deckRepository: Repository<Deck>,
    @InjectRepository(Sermon)
    private sermonRepository: Repository<Sermon>,
    @InjectRepository(BrandTheme)
    private themeRepository: Repository<BrandTheme>,
    @InjectRepository(Export)
    private exportRepository: Repository<Export>,
    @InjectQueue('deck-generation')
    private deckGenerationQueue: Queue,
    private readonly sermonDeckComposerService: SermonDeckComposerService,
  ) {}

  async create(sermonId: string, createDeckDto: CreateDeckDto, churchId: string) {
    const sermon = await this.sermonRepository.findOne({
      where: { id: sermonId, churchId },
    });

    if (!sermon) {
      throw new NotFoundException('Sermon not found');
    }

    // Handle empty string or missing themeId
    let themeId = createDeckDto.themeId;
    if (!themeId || themeId.trim() === '') {
      // Find or create default theme for this church
      let defaultTheme = await this.themeRepository.findOne({
        where: { churchId, name: 'Default Theme' },
      });

      if (!defaultTheme) {
        defaultTheme = this.themeRepository.create({
          churchId,
          name: 'Default Theme',
          primaryColor: '#3B82F6',
          secondaryColor: '#1E40AF',
          backgroundStyle: 'gradient',
          fontHeading: 'Inter',
          fontBody: 'Inter',
        });
        await this.themeRepository.save(defaultTheme);
      }
      themeId = defaultTheme.id;
    }

    const theme = await this.themeRepository.findOne({
      where: { id: themeId, churchId },
    });

    if (!theme) {
      throw new NotFoundException('Theme not found');
    }

    const composition = this.sermonDeckComposerService.composeDeck(
      sermon,
      createDeckDto.deckIntent || DeckIntent.SERMON_PRESENTATION,
      createDeckDto.deckSize || 'standard',
      (createDeckDto as any).visualStyle || 'auto',
      {
        sermonId: sermon.id,
        themeId: theme.id,
      },
    );

    const deck = this.deckRepository.create({
      sermonId,
      themeId: theme.id,
      churchId,
      status: DeckStatus.GENERATING,
      generationProvider: 'lmstudio',
      templatePackId: createDeckDto.templatePackId || theme.defaultTemplatePackId,
      templatePlan: createDeckDto.templatePlan,
      deckIntent: createDeckDto.deckIntent || DeckIntent.SERMON_PRESENTATION,
      composition,
    });

    const savedDeck = await this.deckRepository.save(deck);

    await this.deckGenerationQueue.add('generate', {
      deckId: savedDeck.id,
      deckSize: createDeckDto.deckSize || 'standard',
      deckIntent: createDeckDto.deckIntent || DeckIntent.SERMON_PRESENTATION,
      templatePlan: createDeckDto.templatePlan,
      templatePackId: createDeckDto.templatePackId || theme.defaultTemplatePackId,
      backgroundProvider: createDeckDto.backgroundProvider || 'local',
      backgroundPreset: resolveDeckBackgroundPreset(
        (createDeckDto as any).visualStyle || 'auto',
        createDeckDto.deckIntent || DeckIntent.SERMON_PRESENTATION,
        createDeckDto.backgroundPreset || null,
      ),
      visualStyle: (createDeckDto as any).visualStyle || 'auto',
    });

    return savedDeck;
  }

  async findAll(churchId: string) {
    return this.deckRepository.find({
      where: { churchId },
      relations: ['sermon', 'theme', 'slides'],
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string, churchId: string) {
    const deck = await this.deckRepository.findOne({
      where: { id, churchId },
      relations: ['sermon', 'theme', 'slides'],
    });

    if (!deck) {
      throw new NotFoundException('Deck not found');
    }

    return deck;
  }

  async findOneForProgress(id: string) {
    const deck = await this.deckRepository.findOne({
      where: { id },
      relations: ['sermon', 'theme', 'slides'],
    });

    if (!deck) {
      throw new NotFoundException('Deck not found');
    }

    return deck;
  }

  async getSlides(id: string, churchId: string) {
    const deck = await this.findOne(id, churchId);
    return deck.slides.sort((a, b) => a.orderIndex - b.orderIndex);
  }

  async updateStatus(id: string, status: DeckStatus) {
    await this.deckRepository.update(id, { status });
  }

  async regenerate(id: string, regenerateDto: RegenerateDeckDto, churchId: string) {
    const deck = await this.findOne(id, churchId);

    if (regenerateDto?.templatePackId) {
      deck.templatePackId = regenerateDto.templatePackId;
    }

    if (regenerateDto?.templatePlan) {
      deck.templatePlan = regenerateDto.templatePlan;
    }

    if (regenerateDto?.deckIntent) {
      deck.deckIntent = regenerateDto.deckIntent;
    }

    deck.composition = this.sermonDeckComposerService.composeDeck(
      deck.sermon,
      deck.deckIntent || DeckIntent.SERMON_PRESENTATION,
      'standard',
      regenerateDto?.visualStyle || deck.composition?.visualStyle || 'auto',
      {
        sermonId: deck.sermon?.id,
        themeId: deck.themeId,
      },
    );

    deck.status = DeckStatus.GENERATING;
    await this.deckRepository.save(deck);

    await this.deckGenerationQueue.add('generate', {
      deckId: deck.id,
      deckSize: 'standard',
      deckIntent: deck.deckIntent || DeckIntent.SERMON_PRESENTATION,
      templatePlan: deck.templatePlan,
      templatePackId: deck.templatePackId,
      backgroundPreset: resolveDeckBackgroundPreset(
        (regenerateDto?.visualStyle || deck.composition?.visualStyle || 'auto') as any,
        deck.deckIntent || DeckIntent.SERMON_PRESENTATION,
        null,
      ),
      visualStyle: deck.composition?.visualStyle || 'auto',
    });

    return deck;
  }

  async remove(id: string, churchId: string) {
    const deck = await this.findOne(id, churchId);

    const jobs = await this.deckGenerationQueue.getJobs(['waiting', 'active', 'delayed']);
    const deckJobs = jobs.filter((job) => job?.data?.deckId === deck.id);
    await Promise.all(deckJobs.map((job) => job.remove().catch(() => undefined)));

    await this.exportRepository.delete({ deckId: deck.id });
    await this.deckRepository.remove(deck);

    return { deleted: true };
  }
}
