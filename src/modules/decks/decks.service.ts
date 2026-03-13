import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { Deck, DeckStatus } from '../../entities/deck.entity';
import { Sermon } from '../../entities/sermon.entity';
import { BrandTheme } from '../../entities/brand-theme.entity';
import { CreateDeckDto } from './dto/create-deck.dto';
import { RegenerateDeckDto } from './dto/regenerate-deck.dto';

@Injectable()
export class DecksService {
  constructor(
    @InjectRepository(Deck)
    private deckRepository: Repository<Deck>,
    @InjectRepository(Sermon)
    private sermonRepository: Repository<Sermon>,
    @InjectRepository(BrandTheme)
    private themeRepository: Repository<BrandTheme>,
    @InjectQueue('deck-generation')
    private deckGenerationQueue: Queue,
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

    const deck = this.deckRepository.create({
      sermonId,
      themeId: theme.id,
      churchId,
      status: DeckStatus.GENERATING,
      generationProvider: 'lmstudio',
      templatePackId: createDeckDto.templatePackId || theme.defaultTemplatePackId,
      templatePlan: createDeckDto.templatePlan,
    });

    const savedDeck = await this.deckRepository.save(deck);

    await this.deckGenerationQueue.add('generate', {
      deckId: savedDeck.id,
      deckSize: createDeckDto.deckSize || 'standard',
      templatePlan: createDeckDto.templatePlan,
      templatePackId: createDeckDto.templatePackId || theme.defaultTemplatePackId,
      backgroundProvider: createDeckDto.backgroundProvider || 'local',
      backgroundPreset: createDeckDto.backgroundPreset || 'modern',
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

    deck.status = DeckStatus.GENERATING;
    await this.deckRepository.save(deck);

    await this.deckGenerationQueue.add('generate', {
      deckId: deck.id,
      deckSize: 'standard',
      templatePlan: deck.templatePlan,
      templatePackId: deck.templatePackId,
    });

    return deck;
  }
}
