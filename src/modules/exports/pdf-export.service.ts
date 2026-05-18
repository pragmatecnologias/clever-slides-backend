import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const PDFKitModule = require('pdfkit');
const PDFDocument = (PDFKitModule as any).default?.default ?? (PDFKitModule as any).default ?? PDFKitModule;
import { Deck } from '../../entities/deck.entity';
import { SlideType } from '../../entities/slide-types';
import * as path from 'path';
import * as fs from 'fs';
import { cleanText, estimateFontSize, splitTextIntoLines } from '../llm/slide-content-formatting';

@Injectable()
export class PdfExportService {
  private storagePath: string;

  constructor(private configService: ConfigService) {
    this.storagePath = this.configService.get('STORAGE_PATH') || './uploads';
    if (!fs.existsSync(this.storagePath)) {
      fs.mkdirSync(this.storagePath, { recursive: true });
    }
  }

  private normalizeColor(color?: string, fallback = 'FFFFFF') {
    const value = String(color || fallback).trim();
    return value.replace('#', '').toUpperCase() || fallback;
  }

  async generatePdf(deck: Deck): Promise<string> {
    const filename = `deck-${deck.id}-${Date.now()}.pdf`;
    const filepath = path.join(this.storagePath, filename);

    const doc = new PDFDocument({
      size: [960, 540],
      margin: 0,
      autoFirstPage: false,
      bufferPages: true,
    });

    const writeStream = fs.createWriteStream(filepath);
    doc.pipe(writeStream);

    const primaryColor = this.normalizeColor(deck.theme?.primaryColor, '4472C4');
    const secondaryColor = this.normalizeColor(deck.theme?.secondaryColor, '70AD47');
    const sortedSlides = [...(deck.slides || [])].sort((a, b) => a.orderIndex - b.orderIndex);

    for (const slide of sortedSlides) {
      doc.addPage({ size: [960, 540], margin: 0 });
      this.renderSlide(doc, slide, primaryColor, secondaryColor);
    }

    doc.end();

    await new Promise<void>((resolve, reject) => {
      writeStream.on('finish', () => resolve());
      writeStream.on('error', reject);
      doc.on('error', reject);
    });

    return filepath;
  }

  private renderSlide(doc: any, slide: any, primaryColor: string, secondaryColor: string) {
    const background = this.backgroundForType(slide.type, primaryColor);
    doc.rect(0, 0, 960, 540).fillColor(background).fill();

    if (slide.imageUrl && fs.existsSync(slide.imageUrl)) {
      try {
        doc.image(slide.imageUrl, 0, 0, { fit: [960, 540] });
      } catch {
        // Image is optional; fall back to text-only rendering.
      }
    }

    const content = slide.content || {};
    const title = this.titleForSlide(slide.type, content);
    const body = this.bodyForSlide(slide.type, content);
    const accent = slide.type === SlideType.INVITATION ? 'FFFFFF' : secondaryColor;

    doc.fillColor(slide.type === SlideType.INVITATION ? 'FFFFFF' : '1F2937');
    const titleFont = estimateFontSize(title, 30, 20, 24, 2);
    doc.font('Helvetica-Bold').fontSize(titleFont).text(title, 56, 54, {
      width: 848,
      align: 'left',
    });

    if (body.length) {
      doc.moveDown(0.8);
      const bodyPreview = body.join(' ');
      const bodyFont = estimateFontSize(bodyPreview, 20, 15, 34, 4);
      doc.font('Helvetica').fontSize(bodyFont).fillColor(slide.type === SlideType.INVITATION ? 'FFFFFF' : '374151');
      body.forEach((line: string, index: number) => {
        const y = 132 + index * 30;
        if (slide.type === SlideType.POINT || slide.type === SlideType.APPLICATION) {
          doc.circle(70, y + 8, 4).fillColor(accent).fill();
          doc.fillColor(slide.type === SlideType.INVITATION ? 'FFFFFF' : '374151');
          doc.text(line, 86, y, { width: 800, align: 'left' });
        } else {
          doc.text(line, 56, y, { width: 840, align: 'left' });
        }
      });
    }

    const footer = `${String(slide.type || 'slide').toUpperCase()} · ${slide.orderIndex + 1}`;
    doc.font('Helvetica-Bold').fontSize(12).fillColor(slide.type === SlideType.INVITATION ? 'FFFFFF' : '6B7280');
    doc.text(footer, 56, 500, { width: 848, align: 'right' });
  }

  private titleForSlide(type: SlideType, content: Record<string, any>) {
    switch (type) {
      case SlideType.TITLE:
        return content.title || 'Untitled Sermon';
      case SlideType.SCRIPTURE:
        return content.reference || 'Scripture';
      case SlideType.POINT:
        return content.title || 'Sermon Point';
      case SlideType.APPLICATION:
        return content.title || 'Application';
      case SlideType.INVITATION:
        return content.title || 'Respond';
      case SlideType.TRANSITION:
        return content.title || 'Transition';
      case SlideType.PRAYER:
        return content.title || 'Prayer';
      case SlideType.ANNOUNCEMENT:
        return content.title || 'Announcement';
      case SlideType.SUPPORT:
        return content.title || 'Support';
      default:
        return content.title || 'Slide';
    }
  }

  private bodyForSlide(type: SlideType, content: Record<string, any>): string[] {
    const lines: string[] = [];
    const add = (value?: any) => {
      if (Array.isArray(value)) {
        value.forEach((item) => add(item));
        return;
      }
      const text = String(value ?? '').trim();
      if (text) lines.push(text);
    };

    switch (type) {
      case SlideType.TITLE:
        add(splitTextIntoLines(cleanText(content.subtitle || content.body), 2, 44));
        break;
      case SlideType.SCRIPTURE:
        add(content.reference);
        add((Array.isArray(content.lines) ? content.lines : [content.lines]).flatMap((line) => splitTextIntoLines(line, 1, 44)));
        break;
      case SlideType.POINT:
      case SlideType.APPLICATION:
        add((content.bullets || content.points || content.lines || []).flatMap((line: string) => splitTextIntoLines(line, 2, 44)));
        break;
      case SlideType.INVITATION:
        add(splitTextIntoLines(cleanText(content.message || content.body), 3, 36));
        break;
      case SlideType.TRANSITION:
      case SlideType.PRAYER:
      case SlideType.ANNOUNCEMENT:
      case SlideType.SUPPORT:
        add(splitTextIntoLines(cleanText(content.body), 3, 42));
        add((content.lines || []).flatMap((line: string) => splitTextIntoLines(line, 1, 42)));
        add((content.bullets || []).flatMap((line: string) => splitTextIntoLines(line, 1, 42)));
        break;
      default:
        add(splitTextIntoLines(cleanText(content.body), 4, 42));
        add(JSON.stringify(content, null, 2));
        break;
    }

    return lines.slice(0, 10);
  }

  private backgroundForType(type: SlideType, primaryColor: string) {
    switch (type) {
      case SlideType.INVITATION:
        return primaryColor;
      case SlideType.TITLE:
        return 'F8FAFC';
      case SlideType.SCRIPTURE:
        return 'EEF2FF';
      case SlideType.APPLICATION:
        return 'F0FDF4';
      case SlideType.PRAYER:
        return 'FFF7ED';
      case SlideType.ANNOUNCEMENT:
        return 'FDF2F8';
      default:
        return 'FFFFFF';
    }
  }
}
