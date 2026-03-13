import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { Export, ExportType, ExportStatus } from '../../entities/export.entity';
import { Deck } from '../../entities/deck.entity';

@Injectable()
export class ExportsService {
  constructor(
    @InjectRepository(Export)
    private exportRepository: Repository<Export>,
    @InjectRepository(Deck)
    private deckRepository: Repository<Deck>,
    @InjectQueue('exports')
    private exportsQueue: Queue,
  ) {}

  async create(deckId: string, type: ExportType, churchId: string) {
    const deck = await this.deckRepository.findOne({
      where: { id: deckId, churchId },
    });

    if (!deck) {
      throw new NotFoundException('Deck not found');
    }

    const exportEntity = this.exportRepository.create({
      deckId,
      type,
      status: ExportStatus.QUEUED,
    });

    const savedExport = await this.exportRepository.save(exportEntity);

    await this.exportsQueue.add('generate', {
      exportId: savedExport.id,
    });

    return savedExport;
  }

  async findByDeck(deckId: string, churchId: string) {
    const deck = await this.deckRepository.findOne({
      where: { id: deckId, churchId },
    });

    if (!deck) {
      throw new NotFoundException('Deck not found');
    }

    return this.exportRepository.find({
      where: { deckId },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string) {
    const exportEntity = await this.exportRepository.findOne({
      where: { id },
      relations: ['deck'],
    });

    if (!exportEntity) {
      throw new NotFoundException('Export not found');
    }

    return exportEntity;
  }
}
