import { Controller, Post, Param, Body, UseGuards, Request, Get, Res, Delete } from '@nestjs/common';
import { ImagesService, ImageProvider } from './images.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { Response } from 'express';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';

@Controller('slides')
@UseGuards(JwtAuthGuard)
export class ImagesController {
  constructor(
    private readonly imagesService: ImagesService,
    @InjectQueue('image-generation') private imageQueue: Queue,
  ) {}

  @Post(':id/image')
  generate(
    @Param('id') id: string,
    @Body()
    body: { provider: ImageProvider; prompt?: string; preset?: string; target?: 'background' | 'content' },
    @Request() req,
  ) {
    return this.imagesService.requestImage(
      id,
      body.provider,
      body.prompt,
      body.preset,
      req.user.churchId,
      body.target,
    );
  }


  @Get(':id/image')
  async getImage(@Param('id') id: string, @Request() req, @Res() res: Response) {
    const filepath = await this.imagesService.getImagePath(id, req.user.churchId);
    return res.sendFile(filepath, { root: '.' });
  }

  @Get(':id/content-image')
  async getContentImage(@Param('id') id: string, @Request() req, @Res() res: Response) {
    const filepath = await this.imagesService.getContentImagePath(id, req.user.churchId);
    return res.sendFile(filepath, { root: '.' });
  }

  @Get(':id/image/status')
  async getImageJobStatus(@Param('id') id: string, @Request() req) {
    const jobs = await this.imageQueue.getJobs(['waiting', 'active', 'completed', 'failed']);
    const slideJobs = jobs.filter((job) => job.data.slideId === id);
    const jobDetails = await Promise.all(
      slideJobs.map(async (job) => ({ id: job.id, state: await job.getState(), data: job.data })),
    );
    return { jobs: jobDetails };
  }

  @Delete(':id/image/jobs')
  async clearImageJobs(@Param('id') id: string, @Request() req) {
    const jobs = await this.imageQueue.getJobs(['waiting', 'active', 'failed']);
    const slideJobs = jobs.filter((job) => job.data.slideId === id);
    await Promise.all(slideJobs.map((job) => job.remove()));
    return { cleared: slideJobs.length };
  }

}
