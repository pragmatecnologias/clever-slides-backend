import { BadRequestException, Controller, Post, Get, Delete, Param, Body, UseGuards, Request, Res } from '@nestjs/common';
import { MusicService } from './music.service';
import { CreateMusicDto } from './dto/create-music.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { Response } from 'express';
import { SunoProvider } from './providers/suno.provider';
import { SermonSongGeneratorService } from './sermon-song-generator.service';
import { GenerateSermonLyricsDto, GenerateSermonSongDto, PreviewSermonSongDto, SongMode } from './dto/generate-sermon-song.dto';
import { SelectTrackDto } from './dto/select-track.dto';
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

  @Post(':id/select-track')
  selectTrack(@Param('id') id: string, @Body() dto: SelectTrackDto, @Request() req) {
    return this.musicService.selectTrack(id, dto.trackId, req.user.churchId);
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
        dto.style || 'instrumental_ambient',
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
        dto.useCase || 'theme-song',
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
    let genre: string = dto.style || 'worship';
    let metadata: any = {};
    let title: string | undefined;
    let instrumental = true;

    if (dto.mode === 'ambient_only' || dto.mode === 'background_bed') {
      const ambientPrompt = await this.sermonSongGenerator.generateAmbientPrompt(
        effectiveElements,
        dto.style || 'instrumental_ambient',
        dto.useCase || 'sermon-intro',
        dto.duration || 180,
        dto.studyPrompt,
      );
      prompt = ambientPrompt.sunoPrompt;
      genre = this.buildSunoStyleField(
        dto.style || 'instrumental_ambient',
        dto.useCase || 'sermon-intro',
        dto.studyPrompt,
      );
      title = sermon.title;
      instrumental = true;
      metadata = {
        type: 'ambient',
        useCase: dto.useCase,
        mood: ambientPrompt.mood,
        instruments: ambientPrompt.instruments,
      };
    } else {
      const lyricsDraft = this.requireLyricsDraft(sermon, dto, effectiveElements.language);
      const lyrics = lyricsDraft.lyrics;

      prompt = this.buildSunoLyricsPrompt(lyrics);
      genre = this.buildSunoStyleField(
        lyricsDraft.style || dto.style || 'worship',
        lyricsDraft.useCase || dto.useCase || 'theme-song',
        lyricsDraft.studyPrompt || dto.studyPrompt,
      );
      title = lyrics.title;
      instrumental = false;
      metadata = {
        type: 'lyrics',
        title: lyrics.title,
        themeStatement: lyrics.themeStatement,
        mode: lyricsDraft.mode,
        style: lyricsDraft.style,
        useCase: lyricsDraft.useCase,
        studyPrompt: lyricsDraft.studyPrompt || null,
        language: lyricsDraft.language,
        lyrics: {
          verse1: lyrics.verse1,
          chorus: lyrics.chorus,
          verse2: lyrics.verse2,
          bridge: lyrics.bridge,
          outro: lyrics.outro,
          plainTextPrompt: prompt,
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
      genre,
      durationSeconds: dto.duration || 180,
      provider: 'suno',
      title,
      instrumental,
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
      dto.useCase || 'theme-song',
      dto.studyPrompt,
    );
    await this.persistLyricsDraft(sermon, req.user.churchId, {
      mode,
      style: dto.style || 'worship',
      useCase: dto.useCase || null,
      studyPrompt: dto.studyPrompt || null,
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

  @Post('sermon-song/lyrics-draft')
  async updateSermonLyricsDraft(@Body() dto: any, @Request() req) {
    const sermon = await this.sermonsService.findOne(dto.sermonId, req.user.churchId);
    const existingDraft = sermon?.manuscript?.songLyricsDraft;
    if (!existingDraft?.lyrics) {
      throw new BadRequestException('No saved lyrics draft found. Generate lyrics first.');
    }

    const language = this.resolveLanguage(dto.language, existingDraft.language);
    const mode = (dto.mode || existingDraft.mode || SongMode.WITH_LYRICS) === SongMode.CHORUS_ONLY
      ? SongMode.CHORUS_ONLY
      : SongMode.WITH_LYRICS;
    const style = String(dto.style || existingDraft.style || 'worship').trim();
    const useCase = String(dto.useCase || existingDraft.useCase || 'theme-song').trim();
    const studyPrompt = String(dto.studyPrompt ?? existingDraft.studyPrompt ?? '').trim();
    const elements = dto.elements && typeof dto.elements === 'object'
      ? dto.elements
      : (existingDraft.elements || null);

    const nextLyrics = this.sanitizeLyricsPayload({
      ...(existingDraft.lyrics || {}),
      ...(dto?.lyrics && typeof dto.lyrics === 'object' ? dto.lyrics : {}),
    });
    nextLyrics.sunoPrompt = this.buildSunoLyricsPrompt(nextLyrics);

    await this.persistLyricsDraft(sermon, req.user.churchId, {
      mode,
      style,
      useCase,
      studyPrompt: studyPrompt || null,
      language,
      elements,
      lyrics: nextLyrics,
    });

    return {
      type: 'lyrics',
      elements,
      lyrics: nextLyrics,
      draft: {
        mode,
        style,
        useCase,
        studyPrompt: studyPrompt || null,
        language,
      },
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
      studyPrompt: string | null;
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

    const requestedStyle = String(dto.style || 'worship').trim();
    const draftStyle = String(draft?.style || 'worship').trim();
    if (requestedStyle !== draftStyle) {
      throw new BadRequestException(
        resolvedLanguage === 'es'
          ? 'La letra guardada no coincide con el estilo seleccionado. Genera la letra nuevamente para este estilo.'
          : 'The saved lyrics draft does not match the selected style. Generate lyrics again for this style.',
      );
    }

    const requestedUseCase = String(dto.useCase || 'theme-song').trim();
    const draftUseCase = String(draft?.useCase || 'theme-song').trim();
    if (requestedUseCase !== draftUseCase) {
      throw new BadRequestException(
        resolvedLanguage === 'es'
          ? 'La letra guardada no coincide con el caso de uso seleccionado. Genera la letra nuevamente para este caso de uso.'
          : 'The saved lyrics draft does not match the selected use case. Generate lyrics again for this use case.',
      );
    }

    const requestedStudyPrompt = String(dto.studyPrompt || '').trim();
    const draftStudyPrompt = String(draft?.studyPrompt || '').trim();
    if (requestedStudyPrompt !== draftStudyPrompt) {
      throw new BadRequestException(
        resolvedLanguage === 'es'
          ? 'La letra guardada no coincide con la dirección creativa actual. Genera la letra nuevamente antes de crear música.'
          : 'The saved lyrics draft does not match the current creative direction. Generate lyrics again before generating music.',
      );
    }

    return draft;
  }

  private buildSunoLyricsPrompt(lyrics: any): string {
    const sections: Array<[string, string[]]> = [
      ['Verse 1', Array.isArray(lyrics?.verse1) ? lyrics.verse1 : []],
      ['Chorus', Array.isArray(lyrics?.chorus) ? lyrics.chorus : []],
      ['Verse 2', Array.isArray(lyrics?.verse2) ? lyrics.verse2 : []],
      ['Bridge', Array.isArray(lyrics?.bridge) ? lyrics.bridge : []],
      ['Outro', Array.isArray(lyrics?.outro) ? lyrics.outro : []],
    ];

    const lyricsBody = sections
      .filter(([, lines]) => lines.length > 0)
      .map(([label, lines]) => `[${label}]\n${lines.join('\n')}`)
      .join('\n\n')
      .trim();
    return lyricsBody;
  }

  private buildSunoStyleField(style?: string, useCase?: string, studyPrompt?: string): string {
    const compactDirection = String(studyPrompt || '')
      .replace(/\s+/g, ' ')
      .trim();
    const pieces = [
      String(style || 'worship').trim(),
      useCase ? `use-case:${String(useCase).trim()}` : null,
      compactDirection ? `direction:${compactDirection}` : null,
    ].filter(Boolean) as string[];
    return pieces.join(' | ').slice(0, 120);
  }

  private sanitizeLyricsPayload(lyrics: any) {
    const toLines = (value: any): string[] =>
      Array.isArray(value)
        ? value.map((line) => String(line || '').trim()).filter(Boolean)
        : [];

    return {
      title: String(lyrics?.title || '').trim(),
      themeStatement: String(lyrics?.themeStatement || '').trim(),
      verse1: toLines(lyrics?.verse1),
      chorus: toLines(lyrics?.chorus),
      verse2: toLines(lyrics?.verse2),
      bridge: toLines(lyrics?.bridge),
      outro: toLines(lyrics?.outro),
      keyPhrases: toLines(lyrics?.keyPhrases),
      scriptureAnchors: toLines(lyrics?.scriptureAnchors),
      sunoPrompt: String(lyrics?.sunoPrompt || '').trim(),
    };
  }
}
