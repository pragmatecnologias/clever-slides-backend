import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import * as fs from 'fs/promises';
import * as path from 'path';
import puppeteer from 'puppeteer';
import { cleanText, estimateFontSize, splitTextIntoLines } from '../llm/slide-content-formatting';

type SocialLike = {
  prompt?: string | null;
  caption?: string | null;
  quote?: string | null;
  title?: string | null;
  passage?: string | null;
  platform?: string | null;
  variant?: string | null;
  width?: number | null;
  height?: number | null;
  format?: string | null;
  overlayData?: Record<string, any> | null;
};

@Injectable()
export class SocialHtmlRendererService {
  private readonly logger = new Logger(SocialHtmlRendererService.name);

  constructor(private readonly configService: ConfigService) {}

  async renderToFile(input: {
    social: SocialLike;
    baseImagePath: string;
    outputPath: string;
  }): Promise<{ templateKey: string; templateVersion: string }> {
    const social = input.social;
    const overlay = social.overlayData || {};
    const width = Math.max(320, Number(social.width || 1080));
    const height = Math.max(320, Number(social.height || 1080));
    const templateKey = this.resolveTemplateKey(overlay, width, height);
    const templateVersion = 'v3';

    const [backgroundDataUrl, logoDataUrl] = await Promise.all([
      this.fileToDataUrl(input.baseImagePath, this.mimeFromExt(input.baseImagePath)),
      this.resolveLogoDataUrl(String(overlay.logoUrl || '').trim()),
    ]);

    const title = this.clean(String(overlay.eventTitle || social.title || 'Sermon Event'));
    const subtitle = this.clean(String(overlay.eventSubtitle || social.passage || ''));
    const body = this.clean(String(social.quote || ''));
    const invitation = this.clean(
      String(overlay.resolvedInvitationText || social.caption || overlay.ctaText || ''),
    );
    const churchName = this.clean(String(overlay.churchName || ''));
    const metaLines = this.buildMetaLines(overlay, templateKey).map((line) => this.clean(line));

    const html = this.buildHtml({
      width,
      height,
      templateKey,
      backgroundDataUrl,
      logoDataUrl,
      title,
      subtitle,
      body,
      invitation,
      churchName,
      metaLines,
    });

    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--font-render-hinting=none'],
      executablePath: this.configService.get<string>('PUPPETEER_EXECUTABLE_PATH') || undefined,
    });

    try {
      const page = await browser.newPage();
      await page.setViewport({ width, height, deviceScaleFactor: 1 });
      await page.setContent(html, { waitUntil: 'networkidle0', timeout: 20000 });
      await page.evaluate(() => (document as any).fonts?.ready ?? Promise.resolve());

      const type = String(social.format || 'png').toLowerCase() === 'jpg' ? 'jpeg' : 'png';
      const screenshot = (await page.screenshot({
        type: type as 'png' | 'jpeg',
        quality: type === 'jpeg' ? 90 : undefined,
      })) as Buffer;

      await fs.mkdir(path.dirname(input.outputPath), { recursive: true });
      await fs.writeFile(input.outputPath, screenshot);
      return { templateKey, templateVersion };
    } finally {
      await browser.close();
    }
  }

  private scaleText(text: string, base: number, min: number, maxCharsPerLine: number, maxLines: number) {
    const safe = cleanText(text);
    return estimateFontSize(safe, base, min, maxCharsPerLine, maxLines);
  }

  private renderLines(text: string, maxLines: number, maxCharsPerLine: number) {
    return splitTextIntoLines(text, maxLines, maxCharsPerLine)
      .map((line) => this.escapeHtml(line))
      .join('<br/>');
  }

  private renderInline(text: string, maxCharsPerLine: number) {
    return this.renderLines(text, 1, maxCharsPerLine);
  }

  private resolveTemplateKey(overlay: Record<string, any>, width: number, height: number): string {
    const explicit = String(overlay.layoutVariant || '').toLowerCase().trim();
    if (explicit) {
      const legacyMap: Record<string, string> = {
        story_focus: 'ig-story-v3',
        story_split: 'wa-status-v3',
        feed_balanced: 'ig-feed-v3',
        wide_banner: 'facebook-v3',
        wide_banner_x: 'x-v3',
        promo_card: 'square-v3',
      };
      return legacyMap[explicit] || explicit;
    }

    const platform = String(overlay.platform || '').toLowerCase();
    const variant = String(overlay.variant || '').toLowerCase();
    const ratio = width / Math.max(1, height);

    if (platform === 'instagram' && variant === 'post') return 'ig-feed-v3';
    if (platform === 'instagram' && variant === 'story') return 'ig-story-v3';
    if (platform === 'whatsapp' && variant === 'status') return 'wa-status-v3';
    if (platform === 'facebook' && variant === 'post') return 'facebook-v3';
    if (platform === 'youtube' && variant === 'thumbnail') return 'youtube-v3';
    if (platform === 'x' && variant === 'post') return 'x-v3';
    if (ratio >= 1.6) return 'wide-v3';
    if (ratio <= 0.62) return 'story-v3';
    return 'square-v3';
  }

  private buildMetaLines(overlay: Record<string, any>, templateKey: string): string[] {
    const lines: string[] = [];
    const dateTime = String(overlay.resolvedDateTimeText || '').trim()
      || [overlay.serviceDate, overlay.serviceTime, overlay.timezone].filter(Boolean).join(' · ');
    if (dateTime) lines.push(dateTime);
    if (overlay.locationOverride) lines.push(String(overlay.locationOverride));
    else if (overlay.location) lines.push(String(overlay.location));
    if (overlay.website) lines.push(String(overlay.website));
    if (overlay.hashtags) lines.push(String(overlay.hashtags));

    const compact = ['ig-feed-v3', 'ig-story-v3', 'wa-status-v3'];
    const max = compact.includes(templateKey) ? 4 : 6;
    return lines
      .map((line) => line.replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .slice(0, max);
  }

  private buildHtml(input: {
    width: number;
    height: number;
    templateKey: string;
    backgroundDataUrl: string;
    logoDataUrl: string;
    title: string;
    subtitle: string;
    body: string;
    invitation: string;
    churchName: string;
    metaLines: string[];
  }): string {
    const { templateKey } = input;
    if (templateKey.startsWith('ig-feed')) return this.buildInstagramFeed(input);
    if (templateKey.startsWith('ig-story')) return this.buildInstagramStory(input);
    if (templateKey.startsWith('youtube')) return this.buildYouTubeThumbnail(input);
    if (templateKey.startsWith('facebook')) return this.buildFacebookPost(input);
    if (templateKey.startsWith('wa-status')) return this.buildWhatsAppStatus(input);
    if (templateKey.startsWith('x-')) return this.buildXPost(input);
    return this.buildGenericTemplate(input);
  }

  private getBaseStyles(width: number, height: number, backgroundDataUrl: string): string {
    return `
    @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@600;700;800;900&family=Inter:wght@400;500;600;700&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      width: ${width}px;
      height: ${height}px;
      overflow: hidden;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    }
    body {
      background: url('${backgroundDataUrl}') center/cover no-repeat;
      color: #ffffff;
      position: relative;
    }
    body::before {
      content: '';
      position: absolute;
      inset: 0;
      background: linear-gradient(135deg, rgba(0,0,0,0.4) 0%, rgba(0,0,0,0.7) 100%);
      z-index: 1;
    }
    .noise {
      position: absolute;
      inset: 0;
      opacity: 0.03;
      background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E");
      z-index: 2;
      pointer-events: none;
    }
    .container {
      position: relative;
      z-index: 10;
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
    }
    .title-text {
      font-family: 'Montserrat', sans-serif;
      font-weight: 800;
      line-height: 1.05;
      letter-spacing: -0.02em;
      text-shadow: 0 4px 30px rgba(0,0,0,0.5);
    }
    .subtitle-text {
      font-family: 'Montserrat', sans-serif;
      font-weight: 700;
      line-height: 1.15;
    }
    .body-text {
      font-family: 'Inter', sans-serif;
      font-weight: 500;
      line-height: 1.4;
      color: rgba(255,255,255,0.9);
    }
    .meta-text {
      font-family: 'Inter', sans-serif;
      font-weight: 500;
      color: rgba(255,255,255,0.75);
    }
    `;
  }

  private buildInstagramFeed(input: {
    width: number;
    height: number;
    backgroundDataUrl: string;
    logoDataUrl: string;
    title: string;
    subtitle: string;
    body: string;
    invitation: string;
    churchName: string;
    metaLines: string[];
  }): string {
    const { width, height, backgroundDataUrl, logoDataUrl, title, subtitle, body, invitation, churchName, metaLines } = input;
    const logoHtml = logoDataUrl ? `<img class="logo" src="${logoDataUrl}" alt="" />` : '';
    const hashtagsLine = metaLines.find(l => l.includes('#')) || '';
    const otherMeta = metaLines.filter(l => !l.includes('#')).slice(0, 2);
    const titleSize = this.scaleText(title, 74, 38, 18, 2);
    const subtitleSize = this.scaleText(subtitle, 34, 22, 18, 2);
    const bodySize = this.scaleText(body, 28, 20, 20, 3);
    const inviteSize = this.scaleText(invitation, 24, 18, 22, 2);
    const metaSize = this.scaleText(otherMeta.join(' '), 18, 14, 22, 2);

    return `<!DOCTYPE html><html><head><meta charset="UTF-8"/><style>
    ${this.getBaseStyles(width, height, backgroundDataUrl)}
    body::before {
      background: linear-gradient(180deg, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.4) 50%, rgba(0,0,0,0.88) 100%);
    }
    .ig-accent {
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 6px;
      background: linear-gradient(90deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888);
      z-index: 20;
    }
    .decorative-line {
      position: absolute;
      left: 55px;
      top: 180px;
      bottom: 280px;
      width: 4px;
      background: linear-gradient(180deg, rgba(251,191,36,0.8) 0%, rgba(251,191,36,0.1) 100%);
      border-radius: 2px;
      z-index: 15;
    }
    .brand-row {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 45px 55px 0;
    }
    .logo {
      width: 60px;
      height: 60px;
      object-fit: contain;
      border-radius: 50%;
      border: 2px solid rgba(255,255,255,0.3);
    }
    .brand-name {
      font-family: 'Montserrat', sans-serif;
      font-weight: 600;
      font-size: 22px;
      color: rgba(255,255,255,0.9);
      letter-spacing: 0.02em;
    }
    .main-content {
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: center;
      padding: 60px 55px 60px 80px;
    }
    .title-text {
      font-size: ${titleSize}px;
      margin-bottom: 24px;
      line-height: 1.0;
    }
    .subtitle-text {
      font-size: ${subtitleSize}px;
      color: #fbbf24;
      margin-bottom: 32px;
      font-weight: 700;
      letter-spacing: 0.02em;
    }
    .body-text {
      font-size: ${bodySize}px;
      line-height: 1.45;
      color: rgba(255,255,255,0.92);
      max-width: 95%;
    }
    .bottom-section {
      padding: 40px 55px 50px 80px;
      background: linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.4) 100%);
    }
    .invitation-text {
      font-size: ${inviteSize}px;
      font-weight: 600;
      margin-bottom: 20px;
      line-height: 1.4;
      color: rgba(255,255,255,0.95);
    }
    .meta-row {
      display: flex;
      flex-wrap: wrap;
      gap: 8px 24px;
      font-size: ${metaSize}px;
      color: rgba(255,255,255,0.7);
    }
    .meta-row span {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .meta-row span::before {
      content: '';
      width: 6px;
      height: 6px;
      background: #fbbf24;
      border-radius: 50%;
    }
    .hashtags {
      margin-top: 16px;
      font-size: 18px;
      color: rgba(255,255,255,0.5);
    }
    </style></head><body>
    <div class="noise"></div>
    <div class="ig-accent"></div>
    <div class="decorative-line"></div>
    <div class="container">
      <div class="brand-row">${logoHtml}<span class="brand-name">${this.escapeHtml(churchName)}</span></div>
      <div class="main-content">
        <h1 class="title-text">${this.renderLines(title, 2, 18)}</h1>
        ${subtitle ? `<div class="subtitle-text">${this.renderLines(subtitle, 2, 20)}</div>` : ''}
        ${body ? `<p class="body-text">${this.renderLines(body, 3, 22)}</p>` : ''}
      </div>
      <div class="bottom-section">
        ${invitation ? `<div class="invitation-text">${this.renderLines(invitation, 2, 24)}</div>` : ''}
        <div class="meta-row">${otherMeta.map(l => `<span>${this.renderInline(l, 24)}</span>`).join('')}</div>
        ${hashtagsLine ? `<div class="hashtags">${this.escapeHtml(hashtagsLine)}</div>` : ''}
      </div>
    </div>
    </body></html>`;
  }

  private buildInstagramStory(input: {
    width: number;
    height: number;
    backgroundDataUrl: string;
    logoDataUrl: string;
    title: string;
    subtitle: string;
    body: string;
    invitation: string;
    churchName: string;
    metaLines: string[];
  }): string {
    const { width, height, backgroundDataUrl, logoDataUrl, title, subtitle, body, invitation, churchName, metaLines } = input;
    const logoHtml = logoDataUrl ? `<img class="logo" src="${logoDataUrl}" alt="" />` : '';
    const titleSize = this.scaleText(title, 96, 44, 14, 2);
    const subtitleSize = this.scaleText(subtitle, 52, 28, 16, 2);
    const bodySize = this.scaleText(body, 40, 24, 18, 3);
    const inviteSize = this.scaleText(invitation, 36, 22, 20, 2);

    return `<!DOCTYPE html><html><head><meta charset="UTF-8"/><style>
    ${this.getBaseStyles(width, height, backgroundDataUrl)}
    body::before {
      background: linear-gradient(180deg, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0.1) 30%, rgba(0,0,0,0.5) 70%, rgba(0,0,0,0.88) 100%);
    }
    .top-section {
      padding: 80px 55px 0;
      display: flex;
      align-items: center;
      gap: 18px;
    }
    .logo {
      width: 65px;
      height: 65px;
      object-fit: contain;
      border-radius: 50%;
      border: 2px solid rgba(255,255,255,0.4);
    }
    .brand-name {
      font-family: 'Montserrat', sans-serif;
      font-weight: 600;
      font-size: 28px;
      color: rgba(255,255,255,0.95);
    }
    .center-content {
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      text-align: center;
      padding: 80px 55px;
    }
    .title-text {
      font-size: ${titleSize}px;
      margin-bottom: 40px;
      line-height: 1.0;
    }
    .divider {
      width: 80px;
      height: 4px;
      background: linear-gradient(90deg, transparent, #fbbf24, transparent);
      margin-bottom: 45px;
    }
    .subtitle-text {
      font-size: ${subtitleSize}px;
      color: #fbbf24;
      margin-bottom: 50px;
      font-weight: 700;
    }
    .body-text {
      font-size: ${bodySize}px;
      line-height: 1.5;
      max-width: 92%;
      color: rgba(255,255,255,0.92);
    }
    .bottom-section {
      padding: 60px 55px 90px;
      text-align: center;
      background: linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.5) 100%);
    }
    .invitation-text {
      font-size: ${inviteSize}px;
      font-weight: 600;
      margin-bottom: 35px;
      line-height: 1.4;
      color: rgba(255,255,255,0.95);
    }
    .meta-row {
      font-size: 28px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 18px;
      color: rgba(255,255,255,0.75);
    }
    </style></head><body>
    <div class="noise"></div>
    <div class="container">
      <div class="top-section">${logoHtml}<span class="brand-name">${this.escapeHtml(churchName)}</span></div>
      <div class="center-content">
        <h1 class="title-text">${this.renderLines(title, 2, 14)}</h1>
        <div class="divider"></div>
        ${subtitle ? `<div class="subtitle-text">${this.renderLines(subtitle, 2, 16)}</div>` : ''}
        ${body ? `<p class="body-text">${this.renderLines(body, 3, 18)}</p>` : ''}
      </div>
      <div class="bottom-section">
        ${invitation ? `<div class="invitation-text">${this.renderLines(invitation, 2, 18)}</div>` : ''}
        <div class="meta-row">${metaLines.slice(0, 3).map(l => `<span>${this.escapeHtml(l)}</span>`).join('')}</div>
      </div>
    </div>
    </body></html>`;
  }

  private buildYouTubeThumbnail(input: {
    width: number;
    height: number;
    backgroundDataUrl: string;
    logoDataUrl: string;
    title: string;
    subtitle: string;
    body: string;
    invitation: string;
    churchName: string;
    metaLines: string[];
  }): string {
    const { width, height, backgroundDataUrl, logoDataUrl, title, subtitle, churchName } = input;
    const logoHtml = logoDataUrl ? `<img class="logo" src="${logoDataUrl}" alt="" />` : '';
    const titleSize = this.scaleText(title, 68, 40, 18, 2);
    const subtitleSize = this.scaleText(subtitle, 32, 22, 18, 2);

    return `<!DOCTYPE html><html><head><meta charset="UTF-8"/><style>
    ${this.getBaseStyles(width, height, backgroundDataUrl)}
    body::before {
      background: linear-gradient(90deg, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.5) 60%, rgba(0,0,0,0.2) 100%);
    }
    .yt-accent {
      position: absolute;
      left: 0; top: 0; bottom: 0;
      width: 8px;
      background: #FF0000;
      z-index: 20;
    }
    .content-wrapper {
      position: absolute;
      inset: 0;
      padding: 45px 50px 45px 55px;
      display: flex;
      flex-direction: column;
      justify-content: center;
      z-index: 10;
    }
    .brand-row {
      display: flex;
      align-items: center;
      gap: 16px;
      margin-bottom: 24px;
    }
    .logo {
      width: 55px;
      height: 55px;
      object-fit: contain;
      border-radius: 8px;
    }
    .brand-name {
      font-family: 'Montserrat', sans-serif;
      font-weight: 600;
      font-size: 24px;
      color: rgba(255,255,255,0.9);
    }
    .title-text {
      font-size: ${titleSize}px;
      line-height: 1.05;
      margin-bottom: 20px;
      max-width: 85%;
    }
    .subtitle-text {
      font-size: ${subtitleSize}px;
      color: #fbbf24;
      display: inline-block;
      padding: 10px 24px;
      background: rgba(0,0,0,0.5);
      border-left: 4px solid #FF0000;
      font-weight: 700;
    }
    </style></head><body>
    <div class="noise"></div>
    <div class="yt-accent"></div>
    <div class="content-wrapper">
      <div class="brand-row">${logoHtml}<span class="brand-name">${this.escapeHtml(churchName)}</span></div>
      <h1 class="title-text">${this.renderLines(title, 2, 18)}</h1>
      ${subtitle ? `<div class="subtitle-text">${this.renderLines(subtitle, 2, 18)}</div>` : ''}
    </div>
    </body></html>`;
  }

  private buildFacebookPost(input: {
    width: number;
    height: number;
    backgroundDataUrl: string;
    logoDataUrl: string;
    title: string;
    subtitle: string;
    body: string;
    invitation: string;
    churchName: string;
    metaLines: string[];
  }): string {
    const { width, height, backgroundDataUrl, logoDataUrl, title, subtitle, body, invitation, churchName, metaLines } = input;
    const logoHtml = logoDataUrl ? `<img class="logo" src="${logoDataUrl}" alt="" />` : '';
    const titleSize = this.scaleText(title, 68, 34, 18, 2);
    const subtitleSize = this.scaleText(subtitle, 36, 22, 20, 2);
    const bodySize = this.scaleText(body, 28, 18, 22, 3);
    const inviteSize = this.scaleText(invitation, 24, 18, 24, 2);

    return `<!DOCTYPE html><html><head><meta charset="UTF-8"/><style>
    ${this.getBaseStyles(width, height, backgroundDataUrl)}
    body::before {
      background: linear-gradient(135deg, rgba(24,119,242,0.15) 0%, rgba(0,0,0,0.75) 60%, rgba(0,0,0,0.9) 100%);
    }
    .fb-accent {
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 8px;
      background: #1877F2;
      z-index: 20;
    }
    .content-wrapper {
      position: absolute;
      inset: 0;
      padding: 55px;
      display: flex;
      flex-direction: column;
      justify-content: center;
      z-index: 10;
    }
    .brand-row {
      display: flex;
      align-items: center;
      gap: 18px;
      margin-bottom: 32px;
    }
    .logo {
      width: 68px;
      height: 68px;
      object-fit: contain;
      border-radius: 50%;
      border: 3px solid rgba(255,255,255,0.3);
      box-shadow: 0 4px 20px rgba(0,0,0,0.4);
    }
    .brand-name {
      font-family: 'Montserrat', sans-serif;
      font-weight: 700;
      font-size: 28px;
      color: #fff;
    }
    .title-text {
      font-size: ${titleSize}px;
      line-height: 1.05;
      margin-bottom: 22px;
    }
    .subtitle-text {
      font-size: ${subtitleSize}px;
      color: #60a5fa;
      margin-bottom: 24px;
      text-shadow: 0 2px 15px rgba(96,165,250,0.4);
    }
    .body-text {
      font-size: ${bodySize}px;
      line-height: 1.4;
      max-width: 85%;
      margin-bottom: 28px;
    }
    .meta-row {
      display: flex;
      flex-wrap: wrap;
      gap: 12px 32px;
      font-size: 22px;
      color: rgba(255,255,255,0.8);
    }
    .invitation-text {
      margin-top: 24px;
      font-size: ${inviteSize}px;
      font-weight: 600;
      color: #fff;
      line-height: 1.4;
    }
    </style></head><body>
    <div class="noise"></div>
    <div class="fb-accent"></div>
    <div class="content-wrapper">
      <div class="brand-row">${logoHtml}<span class="brand-name">${this.escapeHtml(churchName)}</span></div>
      <h1 class="title-text">${this.renderLines(title, 2, 18)}</h1>
      ${subtitle ? `<div class="subtitle-text">${this.renderLines(subtitle, 2, 20)}</div>` : ''}
      ${body ? `<p class="body-text">${this.renderLines(body, 3, 22)}</p>` : ''}
      <div class="meta-row">${metaLines.slice(0, 3).map(l => `<span>${this.renderInline(l, 24)}</span>`).join('')}</div>
      ${invitation ? `<div class="invitation-text">${this.renderLines(invitation, 2, 24)}</div>` : ''}
    </div>
    </body></html>`;
  }

  private buildWhatsAppStatus(input: {
    width: number;
    height: number;
    backgroundDataUrl: string;
    logoDataUrl: string;
    title: string;
    subtitle: string;
    body: string;
    invitation: string;
    churchName: string;
    metaLines: string[];
  }): string {
    const { width, height, backgroundDataUrl, logoDataUrl, title, subtitle, body, invitation, churchName, metaLines } = input;
    const logoHtml = logoDataUrl ? `<img class="logo" src="${logoDataUrl}" alt="" />` : '';
    const titleSize = this.scaleText(title, 88, 42, 16, 2);
    const subtitleSize = this.scaleText(subtitle, 44, 24, 18, 2);
    const bodySize = this.scaleText(body, 36, 22, 20, 3);
    const inviteSize = this.scaleText(invitation, 32, 20, 22, 2);

    return `<!DOCTYPE html><html><head><meta charset="UTF-8"/><style>
    ${this.getBaseStyles(width, height, backgroundDataUrl)}
    body::before {
      background: linear-gradient(180deg, rgba(7,94,84,0.3) 0%, rgba(0,0,0,0.2) 30%, rgba(0,0,0,0.6) 70%, rgba(7,94,84,0.4) 100%);
    }
    .top-section {
      padding: 60px 50px 40px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 20px;
    }
    .logo {
      width: 80px;
      height: 80px;
      object-fit: contain;
      border-radius: 50%;
      border: 3px solid #25D366;
      box-shadow: 0 6px 25px rgba(37,211,102,0.3);
    }
    .brand-name {
      font-family: 'Montserrat', sans-serif;
      font-weight: 700;
      font-size: 32px;
      text-shadow: 0 3px 20px rgba(0,0,0,0.5);
    }
    .center-content {
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      text-align: center;
      padding: 50px;
    }
    .title-text {
      font-size: ${titleSize}px;
      margin-bottom: 30px;
      line-height: 1.0;
    }
    .subtitle-text {
      font-size: ${subtitleSize}px;
      color: #25D366;
      margin-bottom: 40px;
      text-shadow: 0 3px 25px rgba(37,211,102,0.5);
    }
    .body-text {
      font-size: ${bodySize}px;
      line-height: 1.4;
      max-width: 90%;
    }
    .bottom-section {
      padding: 50px;
      text-align: center;
      background: linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.5) 100%);
    }
    .invitation-text {
      font-size: ${inviteSize}px;
      font-weight: 600;
      margin-bottom: 28px;
      line-height: 1.35;
    }
    .meta-row {
      font-size: 24px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      color: rgba(255,255,255,0.8);
    }
    </style></head><body>
    <div class="noise"></div>
    <div class="container">
      <div class="top-section">${logoHtml}<span class="brand-name">${this.escapeHtml(churchName)}</span></div>
      <div class="center-content">
        <h1 class="title-text">${this.renderLines(title, 2, 16)}</h1>
        ${subtitle ? `<div class="subtitle-text">${this.renderLines(subtitle, 2, 18)}</div>` : ''}
        ${body ? `<p class="body-text">${this.renderLines(body, 3, 20)}</p>` : ''}
      </div>
      <div class="bottom-section">
        ${invitation ? `<div class="invitation-text">${this.renderLines(invitation, 2, 22)}</div>` : ''}
        <div class="meta-row">${metaLines.slice(0, 3).map(l => `<span>${this.escapeHtml(l)}</span>`).join('')}</div>
      </div>
    </div>
    </body></html>`;
  }

  private buildXPost(input: {
    width: number;
    height: number;
    backgroundDataUrl: string;
    logoDataUrl: string;
    title: string;
    subtitle: string;
    body: string;
    invitation: string;
    churchName: string;
    metaLines: string[];
  }): string {
    const { width, height, backgroundDataUrl, logoDataUrl, title, subtitle, body, invitation, churchName, metaLines } = input;
    const logoHtml = logoDataUrl ? `<img class="logo" src="${logoDataUrl}" alt="" />` : '';
    const titleSize = this.scaleText(title, 64, 34, 18, 2);
    const subtitleSize = this.scaleText(subtitle, 34, 20, 18, 2);
    const bodySize = this.scaleText(body, 26, 18, 22, 3);
    const inviteSize = this.scaleText(invitation, 22, 16, 22, 2);

    return `<!DOCTYPE html><html><head><meta charset="UTF-8"/><style>
    ${this.getBaseStyles(width, height, backgroundDataUrl)}
    body::before {
      background: linear-gradient(135deg, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.6) 60%, rgba(0,0,0,0.4) 100%);
    }
    .x-accent {
      position: absolute;
      left: 0; top: 0; bottom: 0;
      width: 8px;
      background: linear-gradient(180deg, #1DA1F2 0%, rgba(29,161,242,0.4) 100%);
      z-index: 20;
    }
    .content-wrapper {
      position: absolute;
      inset: 0;
      padding: 50px 55px 50px 55px;
      display: flex;
      flex-direction: column;
      justify-content: center;
      z-index: 10;
    }
    .brand-row {
      display: flex;
      align-items: center;
      gap: 18px;
      margin-bottom: 32px;
    }
    .logo {
      width: 64px;
      height: 64px;
      object-fit: contain;
      border-radius: 50%;
      border: 3px solid rgba(255,255,255,0.3);
      box-shadow: 0 4px 20px rgba(0,0,0,0.4);
    }
    .brand-name {
      font-family: 'Montserrat', sans-serif;
      font-weight: 700;
      font-size: 26px;
      color: #fff;
    }
    .title-text {
      font-size: ${titleSize}px;
      line-height: 1.05;
      margin-bottom: 22px;
    }
    .subtitle-text {
      font-size: ${subtitleSize}px;
      color: #1DA1F2;
      margin-bottom: 24px;
      text-shadow: 0 2px 15px rgba(29,161,242,0.4);
    }
    .body-text {
      font-size: ${bodySize}px;
      line-height: 1.4;
      max-width: 85%;
      margin-bottom: 28px;
    }
    .meta-row {
      display: flex;
      flex-wrap: wrap;
      gap: 10px 28px;
      font-size: 20px;
      color: rgba(255,255,255,0.8);
    }
    .invitation-text {
      margin-top: 24px;
      font-size: ${inviteSize}px;
      font-weight: 600;
      color: #fff;
      line-height: 1.4;
    }
    </style></head><body>
    <div class="noise"></div>
    <div class="x-accent"></div>
    <div class="content-wrapper">
      <div class="brand-row">${logoHtml}<span class="brand-name">${this.escapeHtml(churchName)}</span></div>
      <h1 class="title-text">${this.renderLines(title, 2, 18)}</h1>
      ${subtitle ? `<div class="subtitle-text">${this.renderLines(subtitle, 2, 18)}</div>` : ''}
      ${body ? `<p class="body-text">${this.renderLines(body, 3, 22)}</p>` : ''}
      <div class="meta-row">${metaLines.slice(0, 3).map(l => `<span>${this.renderInline(l, 24)}</span>`).join('')}</div>
      ${invitation ? `<div class="invitation-text">${this.renderLines(invitation, 2, 22)}</div>` : ''}
    </div>
    </body></html>`;
  }

  private buildGenericTemplate(input: {
    width: number;
    height: number;
    templateKey: string;
    backgroundDataUrl: string;
    logoDataUrl: string;
    title: string;
    subtitle: string;
    body: string;
    invitation: string;
    churchName: string;
    metaLines: string[];
  }): string {
    const { width, height, backgroundDataUrl, logoDataUrl, title, subtitle, body, invitation, churchName, metaLines } = input;
    const logoHtml = logoDataUrl ? `<img class="logo" src="${logoDataUrl}" alt="" />` : '';
    const isVertical = height > width;
    const titleSize = this.scaleText(title, isVertical ? 72 : 58, isVertical ? 52 : 42, isVertical ? 14 : 18, 2);
    const subtitleSize = this.scaleText(subtitle, isVertical ? 36 : 30, isVertical ? 28 : 24, isVertical ? 18 : 22, 2);
    const bodySize = this.scaleText(body, isVertical ? 30 : 24, isVertical ? 24 : 20, isVertical ? 18 : 24, 3);
    const inviteSize = this.scaleText(invitation, isVertical ? 28 : 22, isVertical ? 22 : 18, isVertical ? 18 : 22, 2);
    const metaSize = this.scaleText(metaLines.join(' '), isVertical ? 20 : 18, 16, isVertical ? 20 : 24, 3);

    return `<!DOCTYPE html><html><head><meta charset="UTF-8"/><style>
    ${this.getBaseStyles(width, height, backgroundDataUrl)}
    body::before {
      background: linear-gradient(180deg, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0.5) 50%, rgba(0,0,0,0.9) 100%);
    }
    .container {
      padding: ${isVertical ? '55px 50px' : '50px 55px'};
      justify-content: ${isVertical ? 'space-between' : 'center'};
    }
    .brand-row {
      display: flex;
      align-items: center;
      gap: 18px;
      ${isVertical ? '' : 'margin-bottom: 35px;'}
    }
    .logo {
      width: ${isVertical ? '75px' : '65px'};
      height: ${isVertical ? '75px' : '65px'};
      object-fit: contain;
      border-radius: 50%;
      border: 3px solid rgba(255,255,255,0.4);
      box-shadow: 0 4px 20px rgba(0,0,0,0.4);
    }
    .brand-name {
      font-family: 'Montserrat', sans-serif;
      font-weight: 700;
      font-size: ${isVertical ? '30px' : '26px'};
      color: #fff;
    }
    .content-area {
      ${isVertical ? 'flex: 1; display: flex; flex-direction: column; justify-content: center;' : ''}
      text-align: ${isVertical ? 'center' : 'left'};
      ${isVertical ? 'padding: 40px 0;' : ''}
    }
    .title-text {
      font-size: ${titleSize}px;
      margin-bottom: 22px;
      line-height: 1.05;
    }
    .subtitle-text {
      font-size: ${subtitleSize}px;
      color: #fbbf24;
      margin-bottom: 28px;
      text-shadow: 0 2px 20px rgba(251,191,36,0.5);
    }
    .body-text {
      font-size: ${bodySize}px;
      line-height: 1.4;
      ${isVertical ? 'max-width: 92%; margin: 0 auto;' : 'max-width: 90%;'}
    }
    .bottom-section {
      ${isVertical ? 'text-align: center;' : 'margin-top: 35px;'}
      background: linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.4) 100%);
      padding: ${isVertical ? '40px 0 0' : '30px 0 0'};
    }
    .invitation-text {
      font-size: ${inviteSize}px;
      font-weight: 600;
      margin-bottom: 22px;
      line-height: 1.35;
    }
    .meta-row {
      font-size: ${metaSize}px;
      display: flex;
      ${isVertical ? 'flex-direction: column; gap: 10px;' : 'flex-wrap: wrap; gap: 10px 28px;'}
      color: rgba(255,255,255,0.8);
    }
    </style></head><body>
    <div class="noise"></div>
    <div class="container">
      <div class="brand-row">${logoHtml}<span class="brand-name">${this.escapeHtml(churchName)}</span></div>
      <div class="content-area">
        <h1 class="title-text">${this.renderLines(title, isVertical ? 2 : 2, isVertical ? 16 : 20)}</h1>
        ${subtitle ? `<div class="subtitle-text">${this.renderLines(subtitle, 2, isVertical ? 18 : 22)}</div>` : ''}
        ${body ? `<p class="body-text">${this.renderLines(body, 3, isVertical ? 20 : 24)}</p>` : ''}
      </div>
      <div class="bottom-section">
        ${invitation ? `<div class="invitation-text">${this.renderLines(invitation, 2, isVertical ? 20 : 22)}</div>` : ''}
        <div class="meta-row">${metaLines.slice(0, 4).map(l => `<span>${this.renderInline(l, 24)}</span>`).join('')}</div>
      </div>
    </div>
    </body></html>`;
  }

  private async fileToDataUrl(filePath: string, mime: string): Promise<string> {
    const bytes = await fs.readFile(filePath);
    return `data:${mime};base64,${bytes.toString('base64')}`;
  }

  private async resolveLogoDataUrl(logoUrl: string): Promise<string> {
    if (!logoUrl) return '';
    try {
      if (logoUrl.startsWith('data:image/')) return logoUrl;
      if (/^https?:\/\//i.test(logoUrl)) {
        const response = await axios.get<ArrayBuffer>(logoUrl, { responseType: 'arraybuffer', timeout: 10000 });
        const contentType = String(response.headers['content-type'] || 'image/png');
        return `data:${contentType};base64,${Buffer.from(response.data).toString('base64')}`;
      }
      const absolute = path.isAbsolute(logoUrl) ? logoUrl : path.resolve(process.cwd(), logoUrl);
      return await this.fileToDataUrl(absolute, this.mimeFromExt(absolute));
    } catch (error: any) {
      this.logger.warn(`Failed to load logo for social render: ${error?.message || error}`);
      return '';
    }
  }

  private mimeFromExt(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
    if (ext === '.webp') return 'image/webp';
    if (ext === '.gif') return 'image/gif';
    return 'image/png';
  }

  private clean(value: string): string {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  private escapeHtml(value: string): string {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
