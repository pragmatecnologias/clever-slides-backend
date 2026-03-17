import { Controller, Post, Get, Delete, Param, Body, UseGuards, Request, Res, Query } from '@nestjs/common';
import { AudioService } from './audio.service';
import { CreateAudioDto } from './dto/create-audio.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { Response } from 'express';
import { ElevenLabsProvider } from './providers/elevenlabs.provider';

@Controller('audio')
@UseGuards(JwtAuthGuard)
export class AudioController {
  constructor(
    private readonly audioService: AudioService,
    private readonly elevenLabsProvider: ElevenLabsProvider,
  ) {}

  @Post('generate')
  generate(@Body() createDto: CreateAudioDto, @Request() req) {
    return this.audioService.requestAudio(createDto, req.user.churchId);
  }

  @Get('voices')
  async getVoices(@Query('provider') provider?: string) {
    return this.elevenLabsProvider.getVoices(String(provider || 'local'));
  }

  @Get(':id')
  getAudio(@Param('id') id: string, @Request() req) {
    return this.audioService.getAudio(id, req.user.churchId);
  }

  @Get(':id/download')
  async downloadAudio(@Param('id') id: string, @Request() req, @Res() res: Response) {
    const filepath = await this.audioService.getAudioPath(id, req.user.churchId);
    return res.sendFile(filepath, { root: '.' });
  }

  @Get('list/:workspaceId')
  listByWorkspace(@Param('workspaceId') workspaceId: string) {
    return this.audioService.listAudio(workspaceId);
  }

  @Delete(':id')
  deleteAudio(@Param('id') id: string, @Request() req) {
    return this.audioService.deleteAudio(id, req.user.churchId);
  }
}
