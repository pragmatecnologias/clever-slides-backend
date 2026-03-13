import { Controller, Post, Get, Param, Body, UseGuards, Request, Res } from '@nestjs/common';
import { Response } from 'express';
import { ExportsService } from './exports.service';
import { ExportType, ExportStatus } from '../../entities/export.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import * as fs from 'fs';

@Controller()
@UseGuards(JwtAuthGuard)
export class ExportsController {
  constructor(private readonly exportsService: ExportsService) {}

  @Post('decks/:deckId/exports')
  create(
    @Param('deckId') deckId: string,
    @Body('type') type: ExportType,
    @Request() req,
  ) {
    return this.exportsService.create(deckId, type, req.user.churchId);
  }

  @Get('decks/:deckId/exports')
  findByDeck(@Param('deckId') deckId: string, @Request() req) {
    return this.exportsService.findByDeck(deckId, req.user.churchId);
  }

  @Get('exports/:id/download')
  async download(@Param('id') id: string, @Res() res: Response) {
    const exportEntity = await this.exportsService.findOne(id);

    if (!exportEntity.fileUrl || exportEntity.status !== ExportStatus.READY) {
      return res.status(400).json({ error: 'Export not ready' });
    }

    if (fs.existsSync(exportEntity.fileUrl)) {
      res.download(exportEntity.fileUrl);
    } else {
      res.status(404).json({ error: 'File not found' });
    }
  }
}
