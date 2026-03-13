import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Slide } from '../../entities/slide.entity';
import { Deck } from '../../entities/deck.entity';
import { Sermon } from '../../entities/sermon.entity';
import { SlideTemplate } from '../../entities/slide-template.entity';
import { UpdateSlideDto } from './dto/update-slide.dto';
import { CreateSlideDto } from './dto/create-slide.dto';
import { ReorderSlidesDto } from './dto/reorder-slides.dto';
import { DeckGenerationService } from '../llm/deck-generation.service';

@Injectable()
export class SlidesService {
  private logger = new Logger(SlidesService.name);

  constructor(
    @InjectRepository(Slide)
    private slideRepository: Repository<Slide>,
    @InjectRepository(Deck)
    private deckRepository: Repository<Deck>,
    @InjectRepository(Sermon)
    private sermonRepository: Repository<Sermon>,
    @InjectRepository(SlideTemplate)
    private templateRepository: Repository<SlideTemplate>,
    private deckGenerationService: DeckGenerationService,
  ) {}

  async update(id: string, updateSlideDto: UpdateSlideDto, churchId: string) {
    const slide = await this.slideRepository.findOne({
      where: { id },
      relations: ['deck'],
    });

    if (!slide || slide.deck.churchId !== churchId) {
      throw new NotFoundException('Slide not found');
    }

    Object.assign(slide, updateSlideDto);
    return this.slideRepository.save(slide);
  }

  async updateTemplate(id: string, templateId: string, churchId: string) {
    const slide = await this.slideRepository.findOne({
      where: { id },
      relations: ['deck'],
    });

    if (!slide || slide.deck.churchId !== churchId) {
      throw new NotFoundException('Slide not found');
    }

    slide.templateId = templateId || null;
    return this.slideRepository.save(slide);
  }

  async create(deckId: string, createSlideDto: CreateSlideDto, churchId: string) {
    const deck = await this.deckRepository.findOne({
      where: { id: deckId, churchId },
      relations: ['slides'],
    });

    if (!deck) {
      throw new NotFoundException('Deck not found');
    }

    const maxOrder = deck.slides.length > 0
      ? Math.max(...deck.slides.map(s => s.orderIndex))
      : -1;

    const slide = this.slideRepository.create({
      deckId,
      orderIndex: createSlideDto.orderIndex ?? maxOrder + 1,
      type: createSlideDto.type,
      layoutKey: createSlideDto.layoutKey,
      content: createSlideDto.content,
      speakerNotes: createSlideDto.speakerNotes,
      templateId: createSlideDto.templateId,
      imagePrompt: createSlideDto.imagePrompt,
    });

    return this.slideRepository.save(slide);
  }

  async remove(id: string, churchId: string) {
    const slide = await this.slideRepository.findOne({
      where: { id },
      relations: ['deck'],
    });

    if (!slide || slide.deck.churchId !== churchId) {
      throw new NotFoundException('Slide not found');
    }

    await this.slideRepository.remove(slide);
    return { deleted: true };
  }

  async reorder(deckId: string, reorderDto: ReorderSlidesDto, churchId: string) {
    const deck = await this.deckRepository.findOne({
      where: { id: deckId, churchId },
    });

    if (!deck) {
      throw new NotFoundException('Deck not found');
    }

    const updates = reorderDto.slideIdsInOrder.map((slideId, index) =>
      this.slideRepository.update(slideId, { orderIndex: index }),
    );

    await Promise.all(updates);

    return { success: true };
  }

  async regenerateContent(id: string, churchId: string) {
    const slide = await this.slideRepository.findOne({
      where: { id },
      relations: ['deck', 'deck.sermon', 'template'],
    });

    if (!slide || slide.deck.churchId !== churchId) {
      throw new NotFoundException('Slide not found');
    }

    const sermon = slide.deck.sermon;
    if (!sermon) {
      throw new NotFoundException('Sermon not found for this slide');
    }

    // Get template if available
    let template = slide.template;
    if (!template && slide.templateId) {
      template = await this.templateRepository.findOne({
        where: { id: slide.templateId },
      });
    }

    if (!template) {
      throw new NotFoundException('Template not found for this slide');
    }

    this.logger.log(`Regenerating content for slide ${id} (${slide.layoutKey})`);

    // Find the point index for this slide if it's a point slide
    const allSlides = await this.slideRepository.find({
      where: { deckId: slide.deckId },
      order: { orderIndex: 'ASC' },
    });
    
    const pointSlidesBefore = allSlides
      .filter(s => s.orderIndex < slide.orderIndex && (s.type === 'point' || s.type === 'support'))
      .length;

    // Generate new content using the deck generation service
    const generatedSlide = await (this.deckGenerationService as any).generateFromTemplate(
      sermon,
      template,
      pointSlidesBefore,
    );

    // Update slide content
    slide.content = generatedSlide.content;
    slide.speakerNotes = generatedSlide.speakerNotes;
    if (generatedSlide.imagePrompt) {
      slide.imagePrompt = generatedSlide.imagePrompt;
    }

    await this.slideRepository.save(slide);
    this.logger.log(`Slide ${id} content regenerated successfully`);

    return slide;
  }
}
