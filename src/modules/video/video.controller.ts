import { Controller, Post, Get, Delete, Param, Body, UseGuards, Request, Res } from '@nestjs/common';
import { VideoService } from './video.service';
import { CreateVideoDto } from './dto/create-video.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { Response } from 'express';

@Controller('video')
@UseGuards(JwtAuthGuard)
export class VideoController {
  constructor(private readonly videoService: VideoService) {}

  @Post('generate')
  generate(@Body() createDto: CreateVideoDto, @Request() req) {
    return this.videoService.requestVideo(createDto, req.user.churchId);
  }

  @Get(':id')
  getVideo(@Param('id') id: string, @Request() req) {
    return this.videoService.getVideo(id, req.user.churchId);
  }

  @Get(':id/download')
  async downloadVideo(@Param('id') id: string, @Request() req, @Res() res: Response) {
    const filepath = await this.videoService.getVideoPath(id, req.user.churchId);
    return res.sendFile(filepath, { root: '.' });
  }

  @Get('list/:workspaceId')
  listByWorkspace(@Param('workspaceId') workspaceId: string) {
    return this.videoService.listVideo(workspaceId);
  }

  @Delete(':id')
  deleteVideo(@Param('id') id: string, @Request() req) {
    return this.videoService.deleteVideo(id, req.user.churchId);
  }
}
