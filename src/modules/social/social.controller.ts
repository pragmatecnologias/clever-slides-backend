import { Controller, Post, Get, Delete, Body, Param, UseGuards, Request, Res } from '@nestjs/common';
import { SocialService } from './social.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { Response } from 'express';
import { GenerateSocialDto } from './dto/generate-social.dto';

@Controller('social')
@UseGuards(JwtAuthGuard)
export class SocialController {
  constructor(private readonly socialService: SocialService) {}

  @Post('generate')
  async generateSocialKit(@Body() dto: GenerateSocialDto, @Request() req) {
    return this.socialService.generateSocialKit(dto, req.user.churchId);
  }

  @Get('list/:workspaceId')
  async listByWorkspace(@Param('workspaceId') workspaceId: string) {
    return this.socialService.listByWorkspace(workspaceId);
  }

  @Get(':id')
  async getSocialMedia(@Param('id') id: string) {
    return this.socialService.getSocialMedia(id);
  }

  @Get(':id/download')
  async downloadSocialMedia(@Param('id') id: string, @Request() req, @Res() res: Response) {
    const filepath = await this.socialService.getSocialPath(id);
    return res.sendFile(filepath);
  }

  @Delete(':id')
  async deleteSocialMedia(@Param('id') id: string, @Request() req) {
    return this.socialService.deleteSocialMedia(id, req.user.churchId);
  }
}
