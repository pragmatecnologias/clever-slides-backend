import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import * as fs from 'fs/promises';
import * as path from 'path';
import puppeteer from 'puppeteer';

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
    const templateVersion = 'v2';

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

  private resolveTemplateKey(overlay: Record<string, any>, width: number, height: number): string {
    const explicit = String(overlay.layoutVariant || '').toLowerCase().trim();
    if (explicit) {
      const legacyMap: Record<string, string> = {
        story_focus: 'ig-story-v2',
        story_split: 'wa-status-v2',
        feed_balanced: 'ig-feed-v2',
        wide_banner: 'facebook-v2',
        wide_banner_x: 'x-v2',
        promo_card: 'square-v2',
      };
      return legacyMap[explicit] || explicit;
    }

    const platform = String(overlay.platform || '').toLowerCase();
    const variant = String(overlay.variant || '').toLowerCase();
    const ratio = width / Math.max(1, height);

    if (platform === 'instagram' && variant === 'post') return 'ig-feed-v2';
    if (platform === 'instagram' && variant === 'story') return 'ig-story-v2';
    if (platform === 'whatsapp' && variant === 'status') return 'wa-status-v2';
    if (platform === 'facebook' && variant === 'post') return 'facebook-v2';
    if (platform === 'youtube' && variant === 'thumbnail') return 'youtube-v2';
    if (platform === 'x' && variant === 'post') return 'x-v2';
    if (ratio >= 1.6) return 'wide-v2';
    if (ratio <= 0.62) return 'story-v2';
    return 'square-v2';
  }

  private buildMetaLines(overlay: Record<string, any>, templateKey: string): string[] {
    const lines: string[] = [];
    if (overlay.showServiceTime) {
      const dateTime = String(overlay.resolvedDateTimeText || '').trim()
        || [overlay.serviceDate, overlay.serviceTime, overlay.timezone].filter(Boolean).join(' · ');
      if (dateTime) lines.push(dateTime);
    }
    if (overlay.showAddress && overlay.location) lines.push(String(overlay.location));
    if (overlay.showWebsite && overlay.website) lines.push(String(overlay.website));
    if (overlay.showPhone && overlay.phone) lines.push(String(overlay.phone));
    if (overlay.hashtags) lines.push(String(overlay.hashtags));

    const compact = ['ig-feed-v2', 'ig-story-v2', 'wa-status-v2'];
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
    const {
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
    } = input;

    const metaHtml = metaLines
      .map((line) => `<div class="meta-line">${this.escapeHtml(line)}</div>`)
      .join('');
    const logoHtml = logoDataUrl
      ? `<img class="brand-logo" src="${logoDataUrl}" alt="logo" />`
      : `<div class="brand-logo brand-logo--empty"></div>`;

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <style>
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      width: ${width}px;
      height: ${height}px;
      overflow: hidden;
      font-family: Inter, "Segoe UI", Roboto, Arial, sans-serif;
    }
    body {
      background-image:
        linear-gradient(180deg, rgba(2,8,20,.10) 0%, rgba(2,8,20,.54) 100%),
        url('${backgroundDataUrl}');
      background-size: cover;
      background-position: center center;
      color: #f8fafc;
    }
    .root {
      width: 100%;
      height: 100%;
      padding: clamp(20px, 3.4vw, 50px);
      display: flex;
      flex-direction: column;
      gap: clamp(10px, 1.4vh, 20px);
    }
    .brand {
      display: flex;
      align-items: center;
      gap: clamp(8px, 1.2vw, 14px);
      min-height: clamp(34px, 5vh, 68px);
      z-index: 2;
    }
    .brand-logo {
      width: clamp(34px, 6vw, 78px);
      height: clamp(34px, 6vw, 78px);
      object-fit: contain;
      opacity: .95;
      flex: 0 0 auto;
    }
    .brand-logo--empty { display: none; }
    .brand-name {
      font-weight: 600;
      font-size: clamp(15px, 1.65vw, 28px);
      letter-spacing: .01em;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 95%;
      text-shadow: 0 2px 8px rgba(0,0,0,.35);
    }

    .card {
      width: 100%;
      border-radius: clamp(12px, 1.3vw, 20px);
      border: 1px solid rgba(255,255,255,.10);
      background: rgba(2, 8, 20, 0.62);
      overflow: hidden;
      display: grid;
      grid-template-rows: auto auto;
      align-self: center;
    }
    .main {
      padding: clamp(14px, 1.9vw, 28px);
      display: flex;
      flex-direction: column;
      gap: clamp(8px, 1vh, 14px);
      background: linear-gradient(180deg, rgba(30,64,175,.20) 0%, rgba(2,8,20,.08) 100%);
      min-height: 0;
    }
    .text-stack {
      display: flex;
      flex-direction: column;
      gap: clamp(8px, 1vh, 14px);
      min-height: 0;
    }
    .title {
      margin: 0;
      font-size: clamp(24px, 3.8vw, 56px);
      line-height: 1.08;
      font-weight: 800;
      letter-spacing: -.01em;
      overflow-wrap: anywhere;
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 3;
      overflow: hidden;
    }
    .subtitle {
      margin: 0;
      font-size: clamp(17px, 2vw, 30px);
      line-height: 1.12;
      font-weight: 700;
      color: #fbbf24;
      overflow-wrap: anywhere;
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
      overflow: hidden;
    }
    .body {
      font-size: clamp(18px, 2.2vw, 34px);
      line-height: 1.18;
      font-weight: 500;
      color: #e2e8f0;
      overflow-wrap: anywhere;
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 5;
      overflow: hidden;
    }
    .invitation {
      font-size: clamp(15px, 1.65vw, 24px);
      line-height: 1.28;
      font-weight: 500;
      color: #d1d5db;
      overflow-wrap: anywhere;
      word-break: break-word;
      white-space: pre-wrap;
    }
    .meta {
      padding: clamp(10px, 1.2vw, 18px) clamp(14px, 1.7vw, 24px);
      border-top: 1px solid rgba(255,255,255,.08);
      background: rgba(2,8,20,.54);
      display: grid;
      gap: clamp(2px, .45vw, 8px);
      font-size: clamp(13px, 1.15vw, 18px);
      line-height: 1.25;
      color: #cbd5e1;
    }
    .meta-line {
      white-space: normal;
      overflow-wrap: anywhere;
      word-break: break-word;
      display: block;
    }

    .card.ig-feed-v2 {
      width: min(94%, 1020px);
      margin-top: clamp(8px, 1.4vh, 18px);
      height: min(84%, 1460px);
      grid-template-rows: 1fr auto;
    }
    .card.ig-feed-v2 .title { -webkit-line-clamp: 2; font-size: clamp(26px, 3.7vw, 56px); }
    .card.ig-feed-v2 .body { -webkit-line-clamp: 5; }
    .card.ig-feed-v2 .main {
      justify-content: space-between;
    }
    .card.ig-feed-v2 .invitation {
      font-size: clamp(17px, 2vw, 30px);
    }

    .card.ig-story-v2,
    .card.wa-status-v2 {
      width: min(92%, 980px);
      margin-top: clamp(14px, 2.5vh, 26px);
      height: min(86%, 1820px);
      grid-template-rows: 1fr auto;
    }
    .card.ig-story-v2 .title,
    .card.wa-status-v2 .title {
      font-size: clamp(32px, 5.2vw, 68px);
      -webkit-line-clamp: 3;
    }
    .card.ig-story-v2 .body,
    .card.wa-status-v2 .body {
      font-size: clamp(21px, 3vw, 40px);
      -webkit-line-clamp: 6;
    }
    .card.ig-story-v2 .main,
    .card.wa-status-v2 .main {
      justify-content: space-between;
    }
    .card.ig-story-v2 .invitation,
    .card.wa-status-v2 .invitation {
      font-size: clamp(18px, 2.2vw, 32px);
      line-height: 1.33;
    }
    .card.wa-status-v2 .main {
      background: linear-gradient(180deg, rgba(22,163,74,.18) 0%, rgba(2,8,20,.10) 100%);
    }

    .card.facebook-v2,
    .card.x-v2,
    .card.youtube-v2,
    .card.wide-v2 {
      width: min(96%, 1550px);
      margin-top: clamp(4px, .8vh, 12px);
    }

    .card.facebook-v2 {
      grid-template-rows: 1fr auto;
      height: min(82%, 620px);
    }
    .card.facebook-v2 .title {
      font-size: clamp(24px, 2.95vw, 44px);
      -webkit-line-clamp: 2;
    }
    .card.facebook-v2 .body {
      font-size: clamp(18px, 1.9vw, 28px);
      -webkit-line-clamp: 4;
    }
    .card.facebook-v2 .main {
      justify-content: space-between;
    }
    .card.facebook-v2 .invitation {
      font-size: clamp(17px, 1.7vw, 25px);
    }
    .card.facebook-v2 .meta {
      background: rgba(2,8,20,.46);
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: clamp(2px, .5vw, 8px) clamp(12px, 1.3vw, 20px);
    }

    .card.x-v2 {
      grid-template-columns: minmax(0, 1.35fr) minmax(260px, .9fr);
      grid-template-rows: auto;
      min-height: min(78%, 540px);
    }
    .card.x-v2 .main {
      border-right: 1px solid rgba(255,255,255,.10);
      background: linear-gradient(180deg, rgba(56,189,248,.15) 0%, rgba(2,8,20,.10) 100%);
    }
    .card.x-v2 .title {
      font-size: clamp(23px, 2.6vw, 40px);
      -webkit-line-clamp: 2;
    }
    .card.x-v2 .body {
      font-size: clamp(17px, 1.6vw, 24px);
      -webkit-line-clamp: 3;
    }
    .card.x-v2 .invitation {
      font-size: clamp(15px, 1.3vw, 20px);
      line-height: 1.28;
    }
    .card.x-v2 .meta {
      border-top: none;
      background: rgba(2,8,20,.62);
      align-content: start;
      font-size: clamp(14px, 1.1vw, 16px);
    }

    .card.youtube-v2 .title {
      font-size: clamp(25px, 3.2vw, 52px);
      -webkit-line-clamp: 2;
    }
    .card.youtube-v2 .body {
      font-size: clamp(15px, 1.7vw, 26px);
      -webkit-line-clamp: 3;
    }
    .card.youtube-v2 .main {
      justify-content: space-between;
    }

    .card.story-v2 {
      width: min(92%, 980px);
      height: min(86%, 1820px);
      grid-template-rows: 1fr auto;
    }
    .card.story-v2 .main {
      justify-content: space-between;
    }

    .card.square-v2 {
      width: min(94%, 1040px);
      height: min(84%, 1040px);
      grid-template-rows: 1fr auto;
    }
    .card.square-v2 .main {
      justify-content: space-between;
    }

    .card.wide-v2 {
      height: min(82%, 620px);
      grid-template-rows: 1fr auto;
    }
    .card.wide-v2 .main {
      justify-content: space-between;
    }
  </style>
</head>
<body>
  <div class="root">
    <div class="brand">
      ${logoHtml}
      <div class="brand-name">${this.escapeHtml(churchName)}</div>
    </div>

    <section class="card ${templateKey}">
      <div class="main">
        <div class="text-stack">
          <h1 class="title">${this.escapeHtml(title)}</h1>
          ${subtitle ? `<div class="subtitle">${this.escapeHtml(subtitle)}</div>` : ''}
          ${body ? `<div class="body">${this.escapeHtml(body)}</div>` : ''}
        </div>
        ${invitation ? `<div class="invitation">${this.escapeHtml(invitation)}</div>` : ''}
      </div>
      <div class="meta">${metaHtml}</div>
    </section>
  </div>
</body>
</html>`;
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
