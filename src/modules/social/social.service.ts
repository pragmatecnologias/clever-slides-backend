import { Injectable } from '@nestjs/common';
import { BadRequestException } from '@nestjs/common';
import { promises as fs } from 'fs';
import * as path from 'path';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { SocialMedia, SocialMediaStatus, SocialMediaType } from '../../entities/social-media.entity';
import { GenerateSocialDto } from './dto/generate-social.dto';

export type CreateSocialMediaDto = GenerateSocialDto;

type SocialVariant = {
  type: SocialMediaType;
  platform: string;
  variant: string;
  width: number;
  height: number;
  format: 'png' | 'jpg';
};

type LayoutVariant = 'story_focus' | 'story_split' | 'feed_balanced' | 'wide_banner' | 'wide_banner_x' | 'promo_card';

@Injectable()
export class SocialService {
  constructor(
    @InjectRepository(SocialMedia)
    private socialRepository: Repository<SocialMedia>,
    @InjectQueue('social-generation')
    private socialQueue: Queue,
  ) {}

  private resolveLayoutVariant(variant: SocialVariant): LayoutVariant {
    if (variant.platform === 'instagram' && variant.variant === 'story') return 'story_focus';
    if (variant.platform === 'whatsapp' && variant.variant === 'status') return 'story_split';
    if (variant.platform === 'instagram' && variant.variant === 'post') return 'feed_balanced';
    if (variant.platform === 'youtube' && variant.variant === 'thumbnail') return 'wide_banner';
    if (variant.platform === 'x' && variant.variant === 'post') return 'wide_banner_x';
    if (variant.platform === 'facebook' && variant.variant === 'post') return 'wide_banner';
    return 'promo_card';
  }

  async generateSocialKit(dto: CreateSocialMediaDto, _churchId: string) {
    const packMode = dto.mode || 'auto_multi_network';
    const core4Variants: SocialVariant[] = [
      {
        type: SocialMediaType.INSTAGRAM_POST,
        platform: 'instagram',
        variant: 'post',
        width: 1080,
        height: 1350,
        format: 'jpg',
      },
      {
        type: SocialMediaType.INSTAGRAM_STORY,
        platform: 'instagram',
        variant: 'story',
        width: 1080,
        height: 1920,
        format: 'jpg',
      },
      {
        type: SocialMediaType.FACEBOOK_POST,
        platform: 'facebook',
        variant: 'post',
        width: 1200,
        height: 630,
        format: 'jpg',
      },
      {
        type: SocialMediaType.WHATSAPP_STATUS,
        platform: 'whatsapp',
        variant: 'status',
        width: 1080,
        height: 1920,
        format: 'jpg',
      },
    ];
    const autoVariants: SocialVariant[] = [
      ...core4Variants,
      {
        type: SocialMediaType.YOUTUBE_THUMBNAIL,
        platform: 'youtube',
        variant: 'thumbnail',
        width: 1280,
        height: 720,
        format: 'jpg',
      },
      {
        type: SocialMediaType.X_POST,
        platform: 'x',
        variant: 'post',
        width: 1600,
        height: 900,
        format: 'png',
      },
    ];
    const variants = packMode === 'core4' ? core4Variants : autoVariants;

    const resolvedOverlay = this.resolveOverlay(dto);
    const records = variants.map((variant) =>
      this.socialRepository.create({
        sermonId: dto.sermonId,
        workspaceId: dto.workspaceId,
        type: variant.type,
        quote: dto.quote,
        caption: dto.caption,
        title: dto.title,
        passage: dto.passage,
        status: SocialMediaStatus.PENDING,
        platform: variant.platform,
        variant: variant.variant,
        width: variant.width,
        height: variant.height,
        format: variant.format,
        prompt: dto.prompt || null,
        useCase: dto.useCase || 'social-promotion',
        overlayData: {
          ...resolvedOverlay,
          layoutVariant: resolvedOverlay.layoutVariant || this.resolveLayoutVariant(variant),
          width: variant.width,
          height: variant.height,
          platform: variant.platform,
          variant: variant.variant,
        },
      }),
    );

    const saved = await this.socialRepository.save(records);
    await Promise.all(saved.map((item) => this.socialQueue.add('generate-social-asset', { socialMediaId: item.id })));

    return {
      mode: packMode,
      assets: saved.map((item) => ({
        id: item.id,
        type: item.type,
        platform: item.platform,
        variant: item.variant,
        width: item.width,
        height: item.height,
        format: item.format || 'png',
        status: 'queued',
      })),
    };
  }

  private resolveOverlay(dto: CreateSocialMediaDto) {
    const overlay = dto.overlay || {};
    const language = String(overlay.language || 'en').toLowerCase();
    const fallbackTitle = this.buildHeadlineFromSermon(dto.title, dto.passage, dto.caption, dto.quote, language);
    return {
      eventTitle: this.isGenericTitle(overlay.eventTitle) ? fallbackTitle : overlay.eventTitle || fallbackTitle,
      eventSubtitle: overlay.eventSubtitle || dto.passage || '',
      serviceDate: overlay.serviceDate || '',
      serviceTime: overlay.serviceTime || '',
      timezone: overlay.timezone || 'America/New_York',
      location: overlay.locationOverride || overlay.churchName || '',
      ctaText: overlay.ctaText || '',
      hashtags: overlay.hashtags || '',
      showLogo: overlay.showLogo ?? true,
      showAddress: overlay.showAddress ?? true,
      showWebsite: overlay.showWebsite ?? true,
      showPhone: overlay.showPhone ?? false,
      showServiceTime: overlay.showServiceTime ?? true,
      logoUrl: overlay.logoUrl || '',
      website: overlay.website || '',
      phone: overlay.phone || '',
      churchName: overlay.churchName || '',
      preset: overlay.preset || 'minimal',
      layoutVariant: overlay.layoutVariant || '',
      densityMode: overlay.densityMode || 'auto',
      imageProvider: overlay.imageProvider || 'local',
      imagePreset: overlay.imagePreset || 'modern',
      language: overlay.language || 'en',
    };
  }

  private isGenericTitle(value: unknown): boolean {
    const text = String(value || '').trim().toLowerCase();
    if (!text) return true;
    return (
      /^(sermon event|demo sermon|test sermon|workspace|final|validation|e2e|untitled|presentation)$/.test(text) ||
      /\b(workspace|test|demo|validation|final|event)\b/.test(text)
    );
  }

  private buildHeadlineFromSermon(
    title?: string,
    passage?: string,
    caption?: string,
    quote?: string,
    language = 'en',
  ): string {
    const source = `${title || ''} ${passage || ''} ${caption || ''} ${quote || ''}`.toLowerCase();
    const isSpanish = language.startsWith('es');

    if (/john\s*3:16|juan\s*3:16/.test(source) || /love|grace|salvat|salvaci[oó]n|eternal life|vida eterna/.test(source)) {
      return isSpanish ? 'El amor de Dios da vida eterna' : 'God’s love gives eternal life';
    }

    if (/revelation\s*14:6-12|apocalipsis\s*14:6-12|three angels|tres a[nñ]geles|everlasting gospel|evangelio eterno/.test(source)) {
      return isSpanish ? 'El evangelio eterno sigue llamando' : 'The everlasting gospel still calls';
    }

    if (/daniel\s*7|revelation\s*12|revelation\s*18|matthew\s*24|exodus\s*20/.test(source)) {
      return isSpanish ? 'Dios llama a la fidelidad' : 'God calls His people to faithfulness';
    }

    const cleanTitle = String(title || passage || (isSpanish ? 'Mensaje del sermón' : 'Sermon message'))
      .replace(/[“”"]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    return cleanTitle.length > 48 ? `${cleanTitle.slice(0, 45).trimEnd()}…` : cleanTitle;
  }

  async getSocialMedia(id: string) {
    return this.socialRepository.findOne({ where: { id } });
  }

  async getSocialMediaForChurch(id: string, churchId: string) {
    const social = await this.socialRepository.findOne({ where: { id } });
    if (!social || !social.sermonId) {
      return social;
    }
    const sameChurchRecord = await this.socialRepository
      .createQueryBuilder('social')
      .leftJoin('social.sermon', 'sermon')
      .where('social.id = :id', { id })
      .andWhere('sermon.churchId = :churchId', { churchId })
      .getOne();
    if (!sameChurchRecord) {
      throw new BadRequestException('Social media not found');
    }
    return social;
  }

  async listByWorkspace(workspaceId: string) {
    return this.socialRepository.find({
      where: { workspaceId },
      order: { createdAt: 'DESC' },
    });
  }

  async updateStatus(id: string, status: SocialMediaStatus, filePath?: string, errorMessage?: string) {
    await this.socialRepository.update(id, {
      status,
      filePath,
      errorMessage,
    });
  }

  async updateOverlayMetadata(id: string, metadata: Record<string, any>) {
    const social = await this.getSocialMedia(id);
    if (!social) return;
    const current = social.overlayData || {};
    await this.socialRepository.update(id, {
      overlayData: {
        ...current,
        ...metadata,
      },
    });
  }

  async getSocialPath(id: string) {
    const social = await this.getSocialMedia(id);
    if (!social?.filePath) {
      throw new Error('Social media file not generated yet');
    }
    const rawPath = String(social.filePath).trim();
    if (!rawPath) {
      throw new Error('Social media file path is empty');
    }

    const normalizedRaw = rawPath.startsWith('Users/') ? `/${rawPath}` : rawPath;
    const resolvedPath = path.isAbsolute(normalizedRaw)
      ? normalizedRaw
      : path.resolve(process.cwd(), normalizedRaw);

    return resolvedPath;
  }

  async deleteSocialMedia(id: string, churchId: string) {
    const social = await this.getSocialMediaForChurch(id, churchId);
    if (!social) {
      throw new BadRequestException('Social media not found');
    }
    const filePath = social.filePath;
    await this.socialRepository.remove(social);
    if (filePath) {
      try {
        const rawPath = String(filePath).trim();
        const normalizedRaw = rawPath.startsWith('Users/') ? `/${rawPath}` : rawPath;
        const resolvedPath = path.isAbsolute(normalizedRaw)
          ? normalizedRaw
          : path.resolve(process.cwd(), normalizedRaw);
        await fs.unlink(resolvedPath);
      } catch {
        // Ignore missing files.
      }
    }
    return { deleted: true };
  }
}
