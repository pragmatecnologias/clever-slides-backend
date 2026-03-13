import { BadRequestException, Controller, Post, Get, Delete, Param, Body, UseGuards, Request, Res } from '@nestjs/common';
import { MusicService } from './music.service';
import { CreateMusicDto } from './dto/create-music.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { Response } from 'express';
import { SunoProvider } from './providers/suno.provider';
import { SermonSongGeneratorService } from './sermon-song-generator.service';
import { GenerateSermonLyricsDto, GenerateSermonSongDto, PreviewSermonSongDto, SongMode } from './dto/generate-sermon-song.dto';
import { SermonsService } from '../sermons/sermons.service';

@Controller('music')
@UseGuards(JwtAuthGuard)
export class MusicController {
  constructor(
    private readonly musicService: MusicService,
    private readonly sunoProvider: SunoProvider,
    private readonly sermonSongGenerator: SermonSongGeneratorService,
    private readonly sermonsService: SermonsService,
  ) {}

  @Post('generate')
  generate(@Body() createDto: CreateMusicDto, @Request() req) {
    return this.musicService.requestMusic(createDto, req.user.churchId);
  }

  @Get('genres')
  async getGenres() {
    return this.sunoProvider.getGenres();
  }

  @Get(':id')
  getMusic(@Param('id') id: string, @Request() req) {
    return this.musicService.getMusic(id, req.user.churchId);
  }

  @Get(':id/download')
  async downloadMusic(@Param('id') id: string, @Request() req, @Res() res: Response) {
    const filepath = await this.musicService.getMusicPath(id, req.user.churchId);
    return res.sendFile(filepath, { root: '.' });
  }

  @Get('list/:workspaceId')
  listByWorkspace(@Param('workspaceId') workspaceId: string) {
    return this.musicService.listMusic(workspaceId);
  }

  @Delete(':id')
  deleteMusic(@Param('id') id: string, @Request() req) {
    return this.musicService.deleteMusic(id, req.user.churchId);
  }

  @Post('sermon-song/preview')
  async previewSermonSong(@Body() dto: PreviewSermonSongDto, @Request() req) {
    const sermon = await this.sermonsService.findOne(dto.sermonId, req.user.churchId);
    const elements = await this.sermonSongGenerator.extractSermonElements(sermon);
    const requestedLanguage = this.resolveLanguage(dto.language, elements.language);
    const effectiveElements = { ...elements, language: requestedLanguage };

    if (dto.mode === 'ambient_only' || dto.mode === 'background_bed') {
      const ambientPrompt = await this.sermonSongGenerator.generateAmbientPrompt(
        effectiveElements,
        dto.useCase || 'sermon-intro',
        180,
        dto.studyPrompt,
      );
      return {
        type: 'ambient',
        elements: effectiveElements,
        prompt: ambientPrompt,
      };
    } else {
      const lyrics = await this.sermonSongGenerator.generateLyrics(
        effectiveElements,
        dto.style || 'worship',
        dto.mode,
        dto.studyPrompt,
      );
      return {
        type: 'lyrics',
        elements: effectiveElements,
        lyrics,
      };
    }
  }

  @Post('sermon-song/generate')
  async generateSermonSong(@Body() dto: GenerateSermonSongDto, @Request() req) {
    const sermon = await this.sermonsService.findOne(dto.sermonId, req.user.churchId);
    const elements = await this.sermonSongGenerator.extractSermonElements(sermon);
    const requestedLanguage = this.resolveLanguage(dto.language, elements.language);
    const effectiveElements = { ...elements, language: requestedLanguage };

    let prompt: string;
    let metadata: any = {};

    if (dto.mode === 'ambient_only' || dto.mode === 'background_bed') {
      const ambientPrompt = await this.sermonSongGenerator.generateAmbientPrompt(
        effectiveElements,
        dto.useCase || 'sermon-intro',
        dto.duration || 180,
        dto.studyPrompt,
      );
      prompt = ambientPrompt.sunoPrompt;
      metadata = {
        type: 'ambient',
        useCase: dto.useCase,
        mood: ambientPrompt.mood,
        instruments: ambientPrompt.instruments,
      };
    } else {
      const lyricsDraft = this.requireLyricsDraft(sermon, dto, effectiveElements.language);
      const lyrics = lyricsDraft.lyrics;

      prompt = lyrics.sunoPrompt;
      metadata = {
        type: 'lyrics',
        title: lyrics.title,
        themeStatement: lyrics.themeStatement,
        mode: lyricsDraft.mode,
        style: lyricsDraft.style,
        useCase: lyricsDraft.useCase,
        language: lyricsDraft.language,
        lyrics: {
          verse1: lyrics.verse1,
          chorus: lyrics.chorus,
          verse2: lyrics.verse2,
          bridge: lyrics.bridge,
          outro: lyrics.outro,
          sunoPrompt: lyrics.sunoPrompt,
        },
        keyPhrases: lyrics.keyPhrases,
        scriptureAnchors: lyrics.scriptureAnchors,
      };
    }

    // Create music generation request
    const createDto: CreateMusicDto = {
      sermonId: dto.sermonId,
      workspaceId: dto.workspaceId,
      prompt,
      genre: dto.style || 'worship',
      durationSeconds: dto.duration || 180,
      provider: 'suno',
    };

    const music = await this.musicService.requestMusic(createDto, req.user.churchId);

    return {
      ...music,
      metadata,
      sermonElements: effectiveElements,
    };
  }

  @Post('sermon-song/lyrics')
  async generateSermonLyrics(@Body() dto: GenerateSermonLyricsDto, @Request() req) {
    const sermon = await this.sermonsService.findOne(dto.sermonId, req.user.churchId);
    const elements = await this.sermonSongGenerator.extractSermonElements(sermon);
    const requestedLanguage = this.resolveLanguage(dto.language, elements.language);
    const effectiveElements = { ...elements, language: requestedLanguage };
    const mode = dto.mode === SongMode.CHORUS_ONLY ? SongMode.CHORUS_ONLY : SongMode.WITH_LYRICS;
    const lyrics = await this.sermonSongGenerator.generateLyrics(
      effectiveElements,
      dto.style || 'worship',
      mode,
      dto.studyPrompt,
    );
    await this.persistLyricsDraft(sermon, req.user.churchId, {
      mode,
      style: dto.style || 'worship',
      useCase: dto.useCase || null,
      language: effectiveElements.language,
      elements: effectiveElements,
      lyrics,
    });
    return {
      type: 'lyrics',
      elements: effectiveElements,
      lyrics,
    };
  }

  private resolveLanguage(requestedLanguage?: string, fallbackLanguage?: string): 'es' | 'en' {
    const source = String(requestedLanguage || fallbackLanguage || 'en').trim().toLowerCase();
    return source.startsWith('es') ? 'es' : 'en';
  }

  private async persistLyricsDraft(
    sermon: any,
    churchId: string,
    payload: {
      mode: string;
      style: string;
      useCase: string | null;
      language: string;
      elements: any;
      lyrics: any;
    },
  ) {
    const nextManuscript = {
      ...(sermon?.manuscript && typeof sermon.manuscript === 'object' ? sermon.manuscript : {}),
      songLyricsDraft: {
        ...payload,
        updatedAt: new Date().toISOString(),
      },
    };
    await this.sermonsService.update(sermon.id, { manuscript: nextManuscript } as any, churchId);
  }

  private requireLyricsDraft(
    sermon: any,
    dto: GenerateSermonSongDto,
    resolvedLanguage: 'es' | 'en',
  ) {
    const draft = sermon?.manuscript?.songLyricsDraft;
    if (!draft?.lyrics?.sunoPrompt) {
      throw new BadRequestException(
        resolvedLanguage === 'es'
          ? 'Debes generar la letra antes de generar la música con letra.'
          : 'You must generate lyrics before generating music with lyrics.',
      );
    }

    const requestedMode = dto.mode === SongMode.CHORUS_ONLY ? SongMode.CHORUS_ONLY : SongMode.WITH_LYRICS;
    const draftMode = draft?.mode === SongMode.CHORUS_ONLY ? SongMode.CHORUS_ONLY : SongMode.WITH_LYRICS;
    if (draftMode !== requestedMode) {
      throw new BadRequestException(
        resolvedLanguage === 'es'
          ? 'La letra guardada no coincide con el modo seleccionado. Genera la letra nuevamente para este modo.'
          : 'The saved lyrics draft does not match the selected mode. Generate lyrics again for this mode.',
      );
    }

    const draftLanguage = this.resolveLanguage(draft?.language, resolvedLanguage);
    if (draftLanguage !== resolvedLanguage) {
      throw new BadRequestException(
        resolvedLanguage === 'es'
          ? 'La letra guardada está en otro idioma. Genera la letra nuevamente en el idioma actual del sermón.'
          : 'The saved lyrics draft is in a different language. Generate lyrics again in the sermon language.',
      );
    }

    return draft;
  }
}
