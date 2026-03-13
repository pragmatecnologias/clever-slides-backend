import { Controller, Get, Query, UseGuards, Request, Patch, Param, Body } from '@nestjs/common';
import { TemplatesService } from './templates.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UpdateTemplateDto } from './dto/update-template.dto';

@Controller('templates')
@UseGuards(JwtAuthGuard)
export class TemplatesController {
  constructor(private readonly templatesService: TemplatesService) {}

  @Get('packs')
  listPacks() {
    return this.templatesService.listPacks();
  }

  @Get()
  list(@Query('packId') packId: string, @Query('themeId') themeId: string, @Request() req) {
    if (packId) {
      return this.templatesService.listTemplatesByPack(packId);
    }
    if (themeId) {
      return this.templatesService.listTemplatesByTheme(themeId, req.user.churchId);
    }
    return this.templatesService.listPacks();
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateData: UpdateTemplateDto, @Request() req) {
    return this.templatesService.updateTemplate(id, updateData, req.user);
  }
}
