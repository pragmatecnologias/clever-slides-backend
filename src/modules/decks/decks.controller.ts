import { Controller, Get, Post, Body, Param, UseGuards, Request, Sse, MessageEvent, Query, UnauthorizedException, SetMetadata } from '@nestjs/common';
import { Observable, interval, map, takeWhile, switchMap, from } from 'rxjs';
import { DecksService } from './decks.service';
import { CreateDeckDto } from './dto/create-deck.dto';
import { RegenerateDeckDto } from './dto/regenerate-deck.dto';
import { JwtAuthGuard, IS_PUBLIC_KEY } from '../auth/guards/jwt-auth.guard';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { JwtService } from '@nestjs/jwt';

export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

@Controller()
@UseGuards(JwtAuthGuard)
export class DecksController {
  constructor(
    private readonly decksService: DecksService,
    @InjectQueue('deck-generation') private deckGenerationQueue: Queue,
    private readonly jwtService: JwtService,
  ) {}

  @Post('sermons/:sermonId/decks')
  create(
    @Param('sermonId') sermonId: string,
    @Body() createDeckDto: CreateDeckDto,
    @Request() req,
  ) {
    return this.decksService.create(sermonId, createDeckDto, req.user.churchId);
  }

  @Get('decks')
  findAll(@Request() req) {
    return this.decksService.findAll(req.user.churchId);
  }

  @Get('decks/:id')
  findOne(@Param('id') id: string, @Request() req) {
    return this.decksService.findOne(id, req.user.churchId);
  }

  @Get('decks/:id/slides')
  getSlides(@Param('id') id: string, @Request() req) {
    return this.decksService.getSlides(id, req.user.churchId);
  }

  @Post('decks/:id/regenerate')
  regenerate(@Param('id') id: string, @Body() regenerateDto: RegenerateDeckDto, @Request() req) {
    return this.decksService.regenerate(id, regenerateDto, req.user.churchId);
  }

  @Get('decks/:id/status')
  async getStatus(@Param('id') id: string, @Request() req) {
    const deck = await this.decksService.findOne(id, req.user.churchId);
    return { status: deck.status };
  }

  @Public()
  @Sse('decks/:id/progress')
  deckProgress(@Param('id') id: string, @Query('token') token?: string): Observable<MessageEvent> {
    if (!token) {
      throw new UnauthorizedException('Missing token');
    }
    
    try {
      this.jwtService.verify(token);
    } catch (error) {
      throw new UnauthorizedException('Invalid token');
    }

    return interval(500).pipe(
      switchMap(async () => {
        const jobs = await this.deckGenerationQueue.getJobs(['active', 'waiting', 'completed', 'failed']);
        const job = jobs.find(j => j.data.deckId === id);
        if (!job) {
          return { data: { progress: 0, status: 'not_found' } };
        }
        const status = await job.getState();
        return {
          data: {
            progress: job.progress() || 0,
            status,
            message: `Generating deck...`,
          },
        };
      }),
      takeWhile((event: any) => {
        const status = event.data.status;
        return status !== 'completed' && status !== 'failed';
      }, true),
    );
  }
}
