import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Export, ExportStatus } from '../../entities/export.entity';
import { Deck } from '../../entities/deck.entity';
import { PptxExportService } from './pptx-export.service';

@Processor('exports')
export class ExportProcessor {
  constructor(
    @InjectRepository(Export)
    private exportRepository: Repository<Export>,
    @InjectRepository(Deck)
    private deckRepository: Repository<Deck>,
    private pptxExportService: PptxExportService,
  ) {}

  @Process('generate')
  async handleExport(job: Job) {
    const { exportId } = job.data;

    try {
      const exportEntity = await this.exportRepository.findOne({
        where: { id: exportId },
        relations: ['deck', 'deck.slides', 'deck.theme'],
      });

      if (!exportEntity) {
        throw new Error('Export not found');
      }

      exportEntity.status = ExportStatus.RENDERING;
      await this.exportRepository.save(exportEntity);

      let fileUrl: string;

      if (exportEntity.type === 'pptx') {
        fileUrl = await this.pptxExportService.generatePptx(exportEntity.deck);
      } else {
        throw new Error('Unsupported export type');
      }

      exportEntity.status = ExportStatus.READY;
      exportEntity.fileUrl = fileUrl;
      await this.exportRepository.save(exportEntity);

      return { success: true };
    } catch (error) {
      await this.exportRepository.update(exportId, { status: ExportStatus.FAILED });
      throw error;
    }
  }
}
