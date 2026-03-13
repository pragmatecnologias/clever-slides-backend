import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Request } from '@nestjs/common';
import { SermonsService } from './sermons.service';
import { CreateSermonDto } from './dto/create-sermon.dto';
import { UpdateSermonDto } from './dto/update-sermon.dto';
import { CreateSermonFromWorkspaceDto } from './dto/create-sermon-from-workspace.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('sermons')
@UseGuards(JwtAuthGuard)
export class SermonsController {
  constructor(private readonly sermonsService: SermonsService) {}

  @Post()
  create(@Body() createSermonDto: CreateSermonDto, @Request() req) {
    return this.sermonsService.create(createSermonDto, req.user.userId, req.user.churchId);
  }

  @Get()
  findAll(@Request() req) {
    return this.sermonsService.findAll(req.user.churchId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req) {
    return this.sermonsService.findOne(id, req.user.churchId);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateSermonDto: UpdateSermonDto, @Request() req) {
    return this.sermonsService.update(id, updateSermonDto, req.user.churchId);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req) {
    return this.sermonsService.remove(id, req.user.churchId);
  }

  @Post('from-workspace')
  createFromWorkspace(@Body() createDto: CreateSermonFromWorkspaceDto, @Request() req) {
    return this.sermonsService.createFromWorkspace(createDto, req.user.userId, req.user.churchId);
  }
}
