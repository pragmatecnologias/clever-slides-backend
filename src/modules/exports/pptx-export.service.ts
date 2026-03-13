import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import PptxGenJS from 'pptxgenjs';
import { Deck } from '../../entities/deck.entity';
import { SlideType } from '../../entities/slide-types';
import * as path from 'path';
import * as fs from 'fs';

@Injectable()
export class PptxExportService {
  private storagePath: string;

  constructor(private configService: ConfigService) {
    this.storagePath = this.configService.get('STORAGE_PATH') || './uploads';
    if (!fs.existsSync(this.storagePath)) {
      fs.mkdirSync(this.storagePath, { recursive: true });
    }
  }

  private normalizeColor(color?: string, fallback?: string) {
    if (!color) return fallback;
    return color.replace('#', '').toUpperCase();
  }

  private getStyle(content: any, field: string, fallback: Record<string, any> = {}) {
    return content?.__styles?.[field] || fallback;
  }

  async generatePptx(deck: Deck): Promise<string> {
    const pptx = new PptxGenJS();

    pptx.layout = 'LAYOUT_16x9';
    pptx.author = 'Pastor Decks';
    pptx.title = deck.sermon?.title || 'Sermon Deck';

    const primaryColor = deck.theme?.primaryColor || '4472C4';
    const secondaryColor = deck.theme?.secondaryColor || '70AD47';

    const sortedSlides = deck.slides.sort((a, b) => a.orderIndex - b.orderIndex);

    for (const slide of sortedSlides) {
      const pptxSlide = pptx.addSlide();

      if (slide.imageUrl && fs.existsSync(slide.imageUrl)) {
        pptxSlide.addImage({
          path: slide.imageUrl,
          x: 0,
          y: 0,
          w: 13.333,
          h: 7.5,
        });
      }

      switch (slide.type) {
        case SlideType.TITLE:
          this.addTitleSlide(pptxSlide, slide.content, primaryColor);
          break;
        case SlideType.SCRIPTURE:
          this.addScriptureSlide(pptxSlide, slide.content, primaryColor);
          break;
        case SlideType.POINT:
          this.addPointSlide(pptxSlide, slide.content, primaryColor, secondaryColor);
          break;
        case SlideType.APPLICATION:
          this.addApplicationSlide(pptxSlide, slide.content, primaryColor);
          break;
        case SlideType.INVITATION:
          this.addInvitationSlide(pptxSlide, slide.content, primaryColor);
          break;
        default:
          this.addGenericSlide(pptxSlide, slide.content, primaryColor);
      }
    }

    const filename = `deck-${deck.id}-${Date.now()}.pptx`;
    const filepath = path.join(this.storagePath, filename);

    await pptx.writeFile({ fileName: filepath });

    return filepath;
  }

  private addTitleSlide(slide: any, content: any, color: string) {
    slide.background = { color: 'FFFFFF' };

    const titleStyle = this.getStyle(content, 'title', {
      fontSize: 54,
      bold: true,
      color,
      align: 'center',
    });

    slide.addText(content.title || 'Untitled', {
      x: 0.5,
      y: 2.5,
      w: 9,
      h: 1.5,
      fontSize: titleStyle.fontSize || 54,
      bold: titleStyle.bold ?? true,
      italic: titleStyle.italic,
      underline: titleStyle.underline,
      color: this.normalizeColor(titleStyle.color, this.normalizeColor(color)),
      align: titleStyle.align || 'center',
      fontFace: titleStyle.fontFamily,
    });

    if (content.subtitle) {
      const subtitleStyle = this.getStyle(content, 'subtitle', {
        fontSize: 28,
        color: '666666',
        align: 'center',
      });
      slide.addText(content.subtitle, {
        x: 0.5,
        y: 4.2,
        w: 9,
        h: 0.8,
        fontSize: subtitleStyle.fontSize || 28,
        bold: subtitleStyle.bold,
        italic: subtitleStyle.italic,
        underline: subtitleStyle.underline,
        color: this.normalizeColor(subtitleStyle.color, '666666'),
        align: subtitleStyle.align || 'center',
        fontFace: subtitleStyle.fontFamily,
      });
    }
  }

  private addScriptureSlide(slide: any, content: any, color: string) {
    slide.background = { color: 'F5F5F5' };

    const referenceStyle = this.getStyle(content, 'reference', {
      fontSize: 24,
      bold: true,
      color,
      align: 'center',
    });

    slide.addText(content.reference || '', {
      x: 0.5,
      y: 1,
      w: 9,
      h: 0.6,
      fontSize: referenceStyle.fontSize || 24,
      bold: referenceStyle.bold ?? true,
      italic: referenceStyle.italic,
      underline: referenceStyle.underline,
      color: this.normalizeColor(referenceStyle.color, this.normalizeColor(color)),
      align: referenceStyle.align || 'center',
      fontFace: referenceStyle.fontFamily,
    });

    const lines = content.lines || [];
    const startY = 2.5;

    const lineStyle = this.getStyle(content, 'lines', {
      fontSize: 32,
      color: '333333',
      align: 'center',
    });

    lines.forEach((line: string, index: number) => {
      slide.addText(line, {
        x: 1,
        y: startY + index * 0.8,
        w: 8,
        h: 0.7,
        fontSize: lineStyle.fontSize || 32,
        bold: lineStyle.bold,
        italic: lineStyle.italic,
        underline: lineStyle.underline,
        color: this.normalizeColor(lineStyle.color, '333333'),
        align: lineStyle.align || 'center',
        fontFace: lineStyle.fontFamily,
      });
    });
  }

  private addPointSlide(slide: any, content: any, primaryColor: string, secondaryColor: string) {
    slide.background = { color: 'FFFFFF' };

    const titleStyle = this.getStyle(content, 'title', {
      fontSize: 40,
      bold: true,
      color: primaryColor,
      align: 'left',
    });

    slide.addText(content.title || '', {
      x: 0.5,
      y: 1,
      w: 9,
      h: 1,
      fontSize: titleStyle.fontSize || 40,
      bold: titleStyle.bold ?? true,
      italic: titleStyle.italic,
      underline: titleStyle.underline,
      color: this.normalizeColor(titleStyle.color, this.normalizeColor(primaryColor)),
      align: titleStyle.align || 'left',
      fontFace: titleStyle.fontFamily,
    });

    const bullets = content.bullets || [];
    const startY = 2.5;

    const bulletStyle = this.getStyle(content, 'bullets', {
      fontSize: 28,
      color: '333333',
      align: 'left',
    });

    bullets.forEach((bullet: string, index: number) => {
      slide.addText(bullet, {
        x: 1.5,
        y: startY + index * 0.9,
        w: 7.5,
        h: 0.7,
        fontSize: bulletStyle.fontSize || 28,
        bullet: { code: '2022', color: secondaryColor },
        bold: bulletStyle.bold,
        italic: bulletStyle.italic,
        underline: bulletStyle.underline,
        color: this.normalizeColor(bulletStyle.color, '333333'),
        align: bulletStyle.align || 'left',
        fontFace: bulletStyle.fontFamily,
      });
    });
  }

  private addApplicationSlide(slide: any, content: any, color: string) {
    slide.background = { color: 'F8F8F8' };

    const titleStyle = this.getStyle(content, 'title', {
      fontSize: 36,
      bold: true,
      color,
      align: 'center',
    });

    slide.addText(content.title || 'This Week', {
      x: 0.5,
      y: 1,
      w: 9,
      h: 0.8,
      fontSize: titleStyle.fontSize || 36,
      bold: titleStyle.bold ?? true,
      italic: titleStyle.italic,
      underline: titleStyle.underline,
      color: this.normalizeColor(titleStyle.color, this.normalizeColor(color)),
      align: titleStyle.align || 'center',
      fontFace: titleStyle.fontFamily,
    });

    const bullets = content.bullets || [];
    const startY = 2.5;

    const bulletStyle = this.getStyle(content, 'bullets', {
      fontSize: 28,
      color: '333333',
      align: 'left',
    });

    bullets.forEach((bullet: string, index: number) => {
      slide.addText(bullet, {
        x: 1.5,
        y: startY + index * 0.9,
        w: 7,
        h: 0.7,
        fontSize: bulletStyle.fontSize || 28,
        bullet: true,
        bold: bulletStyle.bold,
        italic: bulletStyle.italic,
        underline: bulletStyle.underline,
        color: this.normalizeColor(bulletStyle.color, '333333'),
        align: bulletStyle.align || 'left',
        fontFace: bulletStyle.fontFamily,
      });
    });
  }

  private addInvitationSlide(slide: any, content: any, color: string) {
    slide.background = { color };

    const titleStyle = this.getStyle(content, 'title', {
      fontSize: 48,
      bold: true,
      color: 'FFFFFF',
      align: 'center',
    });

    slide.addText(content.title || 'Respond', {
      x: 0.5,
      y: 2.5,
      w: 9,
      h: 1,
      fontSize: titleStyle.fontSize || 48,
      bold: titleStyle.bold ?? true,
      italic: titleStyle.italic,
      underline: titleStyle.underline,
      color: this.normalizeColor(titleStyle.color, 'FFFFFF'),
      align: titleStyle.align || 'center',
      fontFace: titleStyle.fontFamily,
    });

    if (content.message) {
      const messageStyle = this.getStyle(content, 'message', {
        fontSize: 24,
        color: 'FFFFFF',
        align: 'center',
      });
      slide.addText(content.message, {
        x: 1,
        y: 4,
        w: 8,
        h: 1,
        fontSize: messageStyle.fontSize || 24,
        bold: messageStyle.bold,
        italic: messageStyle.italic,
        underline: messageStyle.underline,
        color: this.normalizeColor(messageStyle.color, 'FFFFFF'),
        align: messageStyle.align || 'center',
        fontFace: messageStyle.fontFamily,
      });
    }
  }

  private addGenericSlide(slide: any, content: any, color: string) {
    slide.background = { color: 'FFFFFF' };

    const text = JSON.stringify(content, null, 2);
    slide.addText(text, {
      x: 0.5,
      y: 0.5,
      w: 9,
      h: 5,
      fontSize: 18,
      color: '333333',
    });
  }
}
