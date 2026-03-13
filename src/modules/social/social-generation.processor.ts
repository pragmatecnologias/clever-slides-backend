import { Processor, Process } from '@nestjs/bull';
import { Job } from 'bull';
import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import { SocialService } from './social.service';
import { SocialMediaStatus } from '../../entities/social-media.entity';
import { LocalImageProvider } from '../images/providers/local-image.provider';
import { OpenAiImageProvider } from '../images/providers/openai-image.provider';
import { SocialHtmlRendererService } from './social-html-renderer.service';
import { LlmClient } from '../llm/llm-client.service';

@Processor('social-generation')
@Injectable()
export class SocialGenerationProcessor {
  private readonly logger = new Logger(SocialGenerationProcessor.name);

  constructor(
    private readonly socialService: SocialService,
    private readonly localImageProvider: LocalImageProvider,
    private readonly openAiImageProvider: OpenAiImageProvider,
    private readonly socialHtmlRenderer: SocialHtmlRendererService,
    private readonly llmClient: LlmClient,
  ) {}

  @Process('generate-social-asset')
  async handleSocialAssetGeneration(job: Job) {
    const { socialMediaId } = job.data;
    this.logger.log(`Generating social asset for ${socialMediaId}`);

    let baseImagePath: string | null = null;
    try {
      const social = await this.socialService.getSocialMedia(socialMediaId);
      if (!social) {
        throw new Error('Social media not found');
      }

      await this.socialService.updateStatus(socialMediaId, SocialMediaStatus.GENERATING);

      const overlay = social.overlayData || {};
      const visualPrompt = this.resolveVisualPrompt(social.prompt || '', overlay, social.title || '', social.passage || '');
      baseImagePath = await this.generateBaseImage(visualPrompt, overlay);
      if (!baseImagePath) {
        throw new Error('Base image generation returned empty result');
      }

      const locale = this.resolveLocale(social, overlay);
      const dateTimeText = this.buildHumanDateTimeText(overlay, locale);
      const invitation = await this.generateInvitationCopy({
        social,
        overlay,
        locale,
        dateTimeText,
      });
      const enrichedOverlay = {
        ...overlay,
        resolvedDateTimeText: dateTimeText,
        resolvedInvitationText: invitation,
      };

      const uploadsDir = path.join(process.cwd(), 'uploads', 'social');
      await fs.mkdir(uploadsDir, { recursive: true });
      const format = String(social.format || 'png').toLowerCase() === 'jpg' ? 'jpg' : 'png';
      const filename = `${social.platform || 'social'}-${social.variant || 'asset'}-${socialMediaId}.${format}`;
      const filePath = path.join(uploadsDir, filename);

      const renderInfo = await this.socialHtmlRenderer.renderToFile({
        social: {
          ...social,
          overlayData: enrichedOverlay,
        },
        baseImagePath,
        outputPath: filePath,
      });

      await this.socialService.updateOverlayMetadata(socialMediaId, {
        templateEngine: 'puppeteer-v1',
        templateVersion: renderInfo.templateVersion,
        templateKey: renderInfo.templateKey,
        resolvedDateTimeText: dateTimeText,
        resolvedInvitationText: invitation,
      });

      await this.socialService.updateStatus(socialMediaId, SocialMediaStatus.READY, filePath);
      this.logger.log(`Social asset generated: ${filename}`);
    } catch (error: any) {
      this.logger.error(`Failed to generate social asset: ${error?.message || error}`);
      await this.socialService.updateStatus(
        socialMediaId,
        SocialMediaStatus.FAILED,
        null,
        error?.message || 'Social render failed',
      );
      throw error;
    } finally {
      if (baseImagePath) {
        await fs.unlink(baseImagePath).catch(() => undefined);
      }
    }
  }

  private async generateBaseImage(prompt: string, overlay: Record<string, any>): Promise<string> {
    const provider = String(overlay?.imageProvider || 'local').toLowerCase();
    const preset = String(overlay?.imagePreset || 'modern');
    const cleanPrompt = this.sanitizeVisualPrompt(prompt);
    if (!cleanPrompt) {
      throw new Error('Visual prompt is empty after sanitization');
    }
    if (provider === 'openai') {
      return this.openAiImageProvider.generate(cleanPrompt);
    }
    return this.localImageProvider.generate(cleanPrompt, preset);
  }

  private resolveVisualPrompt(
    inputPrompt: string,
    overlay: Record<string, any>,
    title: string,
    passage: string,
  ): string {
    const prompt = this.sanitizeVisualPrompt(inputPrompt);
    if (prompt) return prompt;

    const locale = String(overlay?.language || 'es').toLowerCase();
    const merged = [title, passage].filter(Boolean).join(' · ');
    if (locale.startsWith('es')) {
      return `${merged}. Fondo visual cinematográfico para iglesia, sin texto, sin tipografía, sin letras.`;
    }
    return `${merged}. Cinematic church background, no text, no typography, no letters.`;
  }

  private sanitizeVisualPrompt(input: string): string {
    const raw = String(input || '').trim();
    if (!raw) return '';
    const patternList = [
      /text in (spanish|english)\s*:\s*["“”']?.*$/i,
      /texto en (espanol|español|ingles|inglés)\s*:\s*["“”']?.*$/i,
      /text overlay\s*:\s*["“”']?.*$/i,
      /incluye texto\s*:\s*["“”']?.*$/i,
      /include\s+logo\s+and\s+date.*$/i,
      /incluir\s+logo\s+y\s+fecha.*$/i,
      /caption in (spanish|english)\s*:\s*["“”']?.*$/i,
      /incluir?\s+enlace.*$/i,
      /include\s+link.*$/i,
    ];

    let value = raw;
    for (const pattern of patternList) {
      value = value.replace(pattern, '').trim();
    }
    value = value.replace(/^(image|imagen)\s*:\s*/i, '').trim();
    value = value.replace(/[,\-–:\s]+$/g, '').trim();
    return value;
  }

  private resolveLocale(social: any, overlay: Record<string, any>): 'es' | 'en' {
    const explicit = String(overlay?.language || '').toLowerCase();
    if (explicit.startsWith('es')) return 'es';
    if (explicit.startsWith('en')) return 'en';

    const source = `${social?.title || ''} ${social?.passage || ''} ${social?.caption || ''} ${social?.quote || ''}`.toLowerCase();
    const spanishHints = /( dios |gracia|serm[oó]n|iglesia|cristo|efesios|vida|muerte|te esperamos|acompa[nñ]anos )/;
    return spanishHints.test(` ${source} `) ? 'es' : 'en';
  }

  private buildHumanDateTimeText(overlay: Record<string, any>, locale: 'es' | 'en'): string {
    const serviceDate = String(overlay?.serviceDate || '').trim();
    const serviceTime = String(overlay?.serviceTime || '').trim();
    const timezone = String(overlay?.timezone || 'America/New_York').trim();

    const dateText = serviceDate ? this.formatDate(serviceDate, timezone, locale) : '';
    const timeText = serviceTime ? this.formatTime(serviceTime, locale) : '';
    return [dateText, timeText].filter(Boolean).join(' · ');
  }

  private formatDate(serviceDate: string, timezone: string, locale: 'es' | 'en'): string {
    const match = serviceDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return serviceDate;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const safeDate = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
    const formatter = new Intl.DateTimeFormat(locale === 'es' ? 'es-US' : 'en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: timezone || 'America/New_York',
    });
    return formatter.format(safeDate);
  }

  private formatTime(serviceTime: string, locale: 'es' | 'en'): string {
    const match = serviceTime.match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return serviceTime;
    const hours24 = Math.max(0, Math.min(23, Number(match[1])));
    const minutes = Math.max(0, Math.min(59, Number(match[2])));
    const period = hours24 >= 12 ? (locale === 'es' ? 'p. m.' : 'PM') : (locale === 'es' ? 'a. m.' : 'AM');
    const hours12 = hours24 % 12 || 12;
    if (locale === 'es') {
      return `${hours12}:${String(minutes).padStart(2, '0')} ${period}`;
    }
    return `${hours12}:${String(minutes).padStart(2, '0')} ${period}`;
  }

  private async generateInvitationCopy(input: {
    social: any;
    overlay: Record<string, any>;
    locale: 'es' | 'en';
    dateTimeText: string;
  }): Promise<string> {
    const { social, overlay, locale, dateTimeText } = input;
    const churchName = String(overlay?.churchName || '').trim();
    const eventTitle = String(overlay?.eventTitle || social?.title || '').trim();
    const eventSubtitle = String(overlay?.eventSubtitle || social?.passage || '').trim();
    const socialCaption = String(social?.caption || '').trim();
    const platform = String(overlay?.platform || social?.platform || 'social').trim();
    const variant = String(overlay?.variant || social?.variant || 'post').trim();

    const schemaHint = {
      invitation: locale === 'es'
        ? `Te esperamos este próximo ${dateTimeText || 'servicio'} en ${churchName || 'nuestra iglesia'} para disfrutar de nuestro programa "${eventTitle}".`
        : `Join us on ${dateTimeText || 'our next service'} at ${churchName || 'our church'} for "${eventTitle}".`,
    };

    try {
      const system = locale === 'es'
        ? 'Eres un redactor pastoral. Devuelve solo JSON válido.'
        : 'You are a pastoral copywriter. Return valid JSON only.';
      const user = locale === 'es'
        ? `Genera una invitación breve, cálida y específica para pieza social cristiana.
Devuelve JSON: {"invitation":"..."}.
Reglas:
- 1 sola oración, máximo 180 caracteres.
- Debe ser contextual al sermón y plataforma.
- No inventes fecha/hora. Usa solo los datos dados.
- Si el texto de apoyo menciona un día/hora distinto, ignóralo y prioriza la fecha/hora estructurada.
- Incluye llamado a asistir.

Datos:
Iglesia: ${churchName || 'n/a'}
Evento: ${eventTitle || 'n/a'}
Pasaje/subtítulo: ${eventSubtitle || 'n/a'}
Fecha y hora legible: ${dateTimeText || 'n/a'}
Plataforma: ${platform}
Variante: ${variant}
Texto de apoyo del usuario: ${socialCaption || 'n/a'}`
        : `Generate one short, warm, context-aware invitation line for a Christian social asset.
Return JSON only: {"invitation":"..."}.
Rules:
- One sentence, max 180 chars.
- Context-aware to sermon and platform.
- Do not invent date/time.
- If support text conflicts with structured date/time, ignore the support text day/time.
- Include attendance call-to-action.

Data:
Church: ${churchName || 'n/a'}
Event: ${eventTitle || 'n/a'}
Passage/subtitle: ${eventSubtitle || 'n/a'}
Readable date/time: ${dateTimeText || 'n/a'}
Platform: ${platform}
Variant: ${variant}
User support text: ${socialCaption || 'n/a'}`;

      const response = await this.llmClient.generateJson<{ invitation?: string }>(system, user, schemaHint);
      const invitation = String(response?.invitation || '').trim();
      if (!invitation) return schemaHint.invitation;
      return invitation.slice(0, 220);
    } catch {
      // User-chosen behavior: keep generation moving with a temporary draft.
      return schemaHint.invitation;
    }
  }
}
