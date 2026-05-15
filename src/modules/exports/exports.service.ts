import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Export, ExportType, ExportStatus } from '../../entities/export.entity';
import { Deck } from '../../entities/deck.entity';
import { PptxExportService } from './pptx-export.service';

@Injectable()
export class ExportsService {
  private logger = new Logger(ExportsService.name);

  constructor(
    @InjectRepository(Export)
    private exportRepository: Repository<Export>,
    @InjectRepository(Deck)
    private deckRepository: Repository<Deck>,
    private pptxExportService: PptxExportService,
  ) {}

  /**
   * Generate an export synchronously (no Redis/Bull queue needed).
   * Returns immediately with status=ready or throws on failure.
   */
  async create(deckId: string, type: ExportType, churchId: string) {
    const deck = await this.deckRepository.findOne({
      where: { id: deckId, churchId },
      relations: ['slides', 'theme'],
    });

    if (!deck) {
      throw new NotFoundException('Deck not found');
    }

    const exportEntity = this.exportRepository.create({
      deckId,
      type,
      status: ExportStatus.RENDERING,
    });
    const savedExport = await this.exportRepository.save(exportEntity);

    try {
      let fileUrl: string;

      if (type === ExportType.PPTX) {
        fileUrl = await this.pptxExportService.generatePptx(deck);
      } else {
        throw new Error(`Unsupported export type: ${type}`);
      }

      savedExport.status = ExportStatus.READY;
      savedExport.fileUrl = fileUrl;
      await this.exportRepository.save(savedExport);

      this.logger.log(`Export ${savedExport.id} ready: ${fileUrl}`);
      return savedExport;
    } catch (err) {
      savedExport.status = ExportStatus.FAILED;
      await this.exportRepository.save(savedExport);
      this.logger.error(`Export ${savedExport.id} failed: ${err.message}`);
      throw err;
    }
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
