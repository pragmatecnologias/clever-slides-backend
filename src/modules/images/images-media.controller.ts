import { Body, Controller, Delete, Get, Param, Post, Request, Res, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ImagesService, ImageProvider } from './images.service';
import type { Response } from 'express';

@Controller('images')
@UseGuards(JwtAuthGuard)
export class ImagesMediaController {
  constructor(private readonly imagesService: ImagesService) {}

  @Post('generate')
  generate(
    @Body()
    body: {
      sermonId?: string;
      workspaceId?: string;
      prompt: string;
      provider: ImageProvider;
      preset?: string;
    },
    @Request() req,
  ) {
    return this.imagesService.generateStandaloneImage(body, req.user.churchId);
  }

  @Get('list/:workspaceId')
  listByWorkspace(@Param('workspaceId') workspaceId: string, @Request() req) {
    return this.imagesService.listStandaloneImages(workspaceId, req.user.churchId);
  }

  @Get(':id')
  getOne(@Param('id') id: string, @Request() req) {
    return this.imagesService.getStandaloneImage(id, req.user.churchId);
  }

  @Get(':id/download')
  async download(@Param('id') id: string, @Request() req, @Res() res: Response) {
    const filepath = await this.imagesService.getStandaloneImagePath(id, req.user.churchId);
    return res.sendFile(filepath, { root: '.' });
  }

  @Delete(':id')
  async deleteStandalone(@Param('id') id: string, @Request() req) {
    return this.imagesService.deleteStandaloneImage(id, req.user.churchId);
  }
}
