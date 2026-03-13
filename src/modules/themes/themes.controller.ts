import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Request } from '@nestjs/common';
import { ThemesService } from './themes.service';
import { CreateThemeDto } from './dto/create-theme.dto';
import { UpdateThemeDto } from './dto/update-theme.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('themes')
@UseGuards(JwtAuthGuard)
export class ThemesController {
  constructor(private readonly themesService: ThemesService) {}

  @Post()
  create(@Body() createThemeDto: CreateThemeDto, @Request() req) {
    return this.themesService.create(createThemeDto, req.user.churchId);
  }

  @Get()
  findAll(@Request() req) {
    return this.themesService.findAll(req.user.churchId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req) {
    return this.themesService.findOne(id, req.user.churchId);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateThemeDto: UpdateThemeDto, @Request() req) {
    return this.themesService.update(id, updateThemeDto, req.user.churchId);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req) {
    return this.themesService.remove(id, req.user.churchId);
  }
}
