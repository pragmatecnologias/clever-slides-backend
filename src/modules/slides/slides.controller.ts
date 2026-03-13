import { Controller, Put, Post, Delete, Patch, Body, Param, UseGuards, Request } from '@nestjs/common';
import { SlidesService } from './slides.service';
import { UpdateSlideDto } from './dto/update-slide.dto';
import { CreateSlideDto } from './dto/create-slide.dto';
import { ReorderSlidesDto } from './dto/reorder-slides.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller()
@UseGuards(JwtAuthGuard)
export class SlidesController {
  constructor(private readonly slidesService: SlidesService) {}

  @Put('slides/:id')
  update(@Param('id') id: string, @Body() updateSlideDto: UpdateSlideDto, @Request() req) {
    return this.slidesService.update(id, updateSlideDto, req.user.churchId);
  }

  @Patch('slides/:id/template')
  updateTemplate(@Param('id') id: string, @Body('templateId') templateId: string, @Request() req) {
    return this.slidesService.updateTemplate(id, templateId, req.user.churchId);
  }

  @Post('decks/:deckId/slides')
  create(@Param('deckId') deckId: string, @Body() createSlideDto: CreateSlideDto, @Request() req) {
    return this.slidesService.create(deckId, createSlideDto, req.user.churchId);
  }

  @Delete('slides/:id')
  remove(@Param('id') id: string, @Request() req) {
    return this.slidesService.remove(id, req.user.churchId);
  }

  @Post('decks/:deckId/slides/reorder')
  reorder(@Param('deckId') deckId: string, @Body() reorderDto: ReorderSlidesDto, @Request() req) {
    return this.slidesService.reorder(deckId, reorderDto, req.user.churchId);
  }

  @Post('slides/:id/regenerate')
  regenerate(@Param('id') id: string, @Request() req) {
    return this.slidesService.regenerateContent(id, req.user.churchId);
  }
}
