import { Injectable } from '@nestjs/common';

export type FontPackKey = 'warm_pastoral' | 'modern_church' | 'hopeful_prophecy' | 'scripture_elegant' | 'youth_contemporary';

export interface FontPack {
  key: FontPackKey;
  label: string;
  headingFont: string;
  bodyFont: string;
  scriptureFont: string;
  headingWeight: number;
  bodyWeight: number;
  lineHeight: number;
  letterSpacing: string;
  pptxFallbackHeading: string;
  pptxFallbackBody: string;
  projectionSizes: ProjectionFontSizes;
}

export interface ProjectionFontSizes {
  titleSlideTitle: string;    // 54–72 px equivalent
  mainPoint: string;           // 42–56 px
  scripture: string;           // 34–44 px
  body: string;                // 30–36 px
  footer: string;              // 18–22 px
  subtitle: string;            // 28–36 px
  bigIdea: string;             // 48–60 px
}

export interface TypographyTokens {
  fontPack: FontPackKey;
  headingFont: string;
  bodyFont: string;
  scriptureFont: string;
  headingWeight: number;
  bodyWeight: number;
  lineHeight: number;
  letterSpacing: string;
  projectionSizes: ProjectionFontSizes;
}

const FONT_PACKS: Record<FontPackKey, FontPack> = {
  warm_pastoral: {
    key: 'warm_pastoral',
    label: 'Warm Pastoral',
    headingFont: 'Playfair Display',
    bodyFont: 'Inter',
    scriptureFont: 'Lora',
    headingWeight: 700,
    bodyWeight: 400,
    lineHeight: 1.4,
    letterSpacing: '-0.01em',
    pptxFallbackHeading: 'Georgia',
    pptxFallbackBody: 'Calibri',
    projectionSizes: {
      titleSlideTitle: '64px',
      mainPoint: '48px',
      scripture: '38px',
      body: '32px',
      footer: '20px',
      subtitle: '30px',
      bigIdea: '52px',
    },
  },
  modern_church: {
    key: 'modern_church',
    label: 'Modern Church',
    headingFont: 'Montserrat',
    bodyFont: 'Inter',
    scriptureFont: 'Inter',
    headingWeight: 700,
    bodyWeight: 400,
    lineHeight: 1.3,
    letterSpacing: '-0.02em',
    pptxFallbackHeading: 'Arial',
    pptxFallbackBody: 'Calibri',
    projectionSizes: {
      titleSlideTitle: '68px',
      mainPoint: '50px',
      scripture: '36px',
      body: '32px',
      footer: '18px',
      subtitle: '28px',
      bigIdea: '54px',
    },
  },
  hopeful_prophecy: {
    key: 'hopeful_prophecy',
    label: 'Hopeful Prophecy',
    headingFont: 'Merriweather',
    bodyFont: 'Source Sans 3',
    scriptureFont: 'Merriweather',
    headingWeight: 700,
    bodyWeight: 400,
    lineHeight: 1.35,
    letterSpacing: '0em',
    pptxFallbackHeading: 'Georgia',
    pptxFallbackBody: 'Calibri',
    projectionSizes: {
      titleSlideTitle: '62px',
      mainPoint: '46px',
      scripture: '38px',
      body: '30px',
      footer: '20px',
      subtitle: '28px',
      bigIdea: '50px',
    },
  },
  scripture_elegant: {
    key: 'scripture_elegant',
    label: 'Elegant Scripture',
    headingFont: 'Cormorant Garamond',
    bodyFont: 'Lato',
    scriptureFont: 'Libre Baskerville',
    headingWeight: 600,
    bodyWeight: 400,
    lineHeight: 1.5,
    letterSpacing: '0em',
    pptxFallbackHeading: 'Georgia',
    pptxFallbackBody: 'Calibri',
    projectionSizes: {
      titleSlideTitle: '60px',
      mainPoint: '44px',
      scripture: '40px',
      body: '30px',
      footer: '20px',
      subtitle: '28px',
      bigIdea: '48px',
    },
  },
  youth_contemporary: {
    key: 'youth_contemporary',
    label: 'Youth Contemporary',
    headingFont: 'Poppins',
    bodyFont: 'Inter',
    scriptureFont: 'Inter',
    headingWeight: 600,
    bodyWeight: 400,
    lineHeight: 1.25,
    letterSpacing: '-0.03em',
    pptxFallbackHeading: 'Arial',
    pptxFallbackBody: 'Calibri',
    projectionSizes: {
      titleSlideTitle: '72px',
      mainPoint: '52px',
      scripture: '36px',
      body: '34px',
      footer: '18px',
      subtitle: '30px',
      bigIdea: '56px',
    },
  },
};

const VISUAL_STYLE_TO_FONT_PACK: Record<string, FontPackKey> = {
  warm_pastoral: 'warm_pastoral',
  warm_pastoral_light: 'warm_pastoral',
  reverent_worship: 'scripture_elegant',
  modern_church: 'modern_church',
  modern_church_dark: 'modern_church',
  hopeful_prophecy: 'hopeful_prophecy',
  bible_study_clean: 'scripture_elegant',
  scripture_elegant: 'scripture_elegant',
  evangelistic_invitation: 'warm_pastoral',
  youth_modern: 'youth_contemporary',
  youth_contemporary: 'youth_contemporary',
  spanish_church_warm: 'warm_pastoral',
};

const PPTX_FALLBACK_MAP: Record<string, string> = {
  'Playfair Display': 'Georgia',
  Lora: 'Georgia',
  Merriweather: 'Georgia',
  'Cormorant Garamond': 'Georgia',
  'Libre Baskerville': 'Georgia',
  Montserrat: 'Arial',
  Poppins: 'Arial',
  Inter: 'Calibri',
  'Source Sans 3': 'Calibri',
  Lato: 'Calibri',
};

@Injectable()
export class TypographyService {
  private packs: Record<string, FontPack> = { ...FONT_PACKS };

  getFontPack(key: FontPackKey): FontPack {
    return this.packs[key] || this.packs.warm_pastoral;
  }

  getFontPackForVisualStyle(visualStyle: string): FontPack {
    const key = VISUAL_STYLE_TO_FONT_PACK[visualStyle] || 'modern_church';
    return this.getFontPack(key);
  }

  buildTypographyTokens(visualStyle: string): TypographyTokens {
    const pack = this.getFontPackForVisualStyle(visualStyle);
    return {
      fontPack: pack.key,
      headingFont: pack.headingFont,
      bodyFont: pack.bodyFont,
      scriptureFont: pack.scriptureFont,
      headingWeight: pack.headingWeight,
      bodyWeight: pack.bodyWeight,
      lineHeight: pack.lineHeight,
      letterSpacing: pack.letterSpacing,
      projectionSizes: { ...pack.projectionSizes },
    };
  }

  getPptxFallback(googleFont: string): string {
    return PPTX_FALLBACK_MAP[googleFont] || 'Calibri';
  }

  validateFontSizes(tokens: TypographyTokens, sizes: Record<string, number | string>): string[] {
    const warnings: string[] = [];
    const px = (val: string | number) => parseInt(String(val).replace('px', ''), 10);

    const proj = tokens.projectionSizes;
    const checks: Array<[string, number, number]> = [
      ['titleSlideTitle', px(sizes.titleSize || sizes.titleSlideTitle || proj.titleSlideTitle), 48],
      ['mainPoint', px(sizes.pointSize || sizes.mainPoint || proj.mainPoint), 36],
      ['scripture', px(sizes.scriptureSize || sizes.scripture || proj.scripture), 28],
      ['body', px(sizes.bodySize || sizes.body || proj.body), 24],
      ['footer', px(sizes.footerSize || sizes.footer || proj.footer), 14],
    ];

    for (const [label, size, min] of checks) {
      if (size < min) {
        warnings.push(`${label} font size (${size}px) is below projection-safe minimum (${min}px)`);
      }
    }

    return warnings;
  }
}
