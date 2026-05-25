import { Injectable } from '@nestjs/common';
import {
  DeckComposition,
  DeckQualityWarning,
  DeckCompositionSlide,
  SermonUnderstanding,
} from '../../../../../shared/deck-composition.contract';
import { cleanText, normalizeBulletList, shortenText, splitTextIntoLines } from '../llm/slide-content-formatting';
import { VisualStyleProfile } from './visual-style.service';
import { TypographyService, TypographyTokens } from './typography.service';
import { SlideCopyQualityValidator } from './slide-copy-quality-validator.service';

export interface DeckQualityScore {
  overall: number;
  slideCopyQuality: number;
  layoutContentFit: number;
  typographyReadability: number;
  visualRhythm: number;
  speakerNotes: number;
  exportFidelity: number;
  passed: boolean;
  categoryFailures: string[];
}

@Injectable()
export class DeckQualityValidator {
  constructor(
    private readonly typographyService: TypographyService,
    private readonly slideCopyQualityValidator: SlideCopyQualityValidator,
  ) {}

  validate(composition: DeckComposition, understanding: SermonUnderstanding, style: VisualStyleProfile): DeckComposition {
    const warnings: DeckQualityWarning[] = [];
    const slides = composition.slides.map((slide, index) => this.validateSlide(slide, index, warnings, understanding, style));

    const slideCount = slides.length;
    const expectedRange = composition.deckIntent === 'social_summary' ? [3, 5] : [8, 14];
    if (slideCount < expectedRange[0] || slideCount > expectedRange[1]) {
      warnings.push({
        code: 'slide-count-out-of-range',
        severity: 'warning',
        message: `Deck slide count (${slideCount}) is outside the recommended range ${expectedRange[0]}-${expectedRange[1]}.`,
        suggestion: composition.deckIntent === 'social_summary'
          ? 'Keep the social deck short and punchy.'
          : 'Trim or expand the sermon deck to fit a readable preaching flow.',
      });
    }

    const tokens = this.typographyService.buildTypographyTokens(style.key);
    const score = this.computeQualityScore(slides, warnings, understanding, style, tokens);

    const validated = {
      ...composition,
      slides,
      qualityWarnings: [...(composition.qualityWarnings || []), ...warnings],
      qualityScore: score,
    } as DeckComposition & { qualityScore: DeckQualityScore };

    return validated;
  }

  computeQualityScore(
    slides: DeckCompositionSlide[],
    warnings: DeckQualityWarning[],
    understanding: SermonUnderstanding,
    style: VisualStyleProfile,
    tokens: TypographyTokens,
  ): DeckQualityScore {
    const categories: Omit<DeckQualityScore, 'overall' | 'passed' | 'categoryFailures'> = {
      slideCopyQuality: this.scoreSlideCopyQuality(slides, warnings),
      layoutContentFit: this.scoreLayoutContentFit(slides),
      typographyReadability: Math.round((this.scoreTypography(slides, style, tokens) + this.scoreProjectionReadability(slides, tokens)) / 2),
      visualRhythm: Math.round((this.scoreLayoutRhythm(slides) + this.scoreVisualStyle(slides, style, understanding) + this.scoreBackgroundUsage(slides)) / 3),
      speakerNotes: this.scoreSpeakerNotes(slides),
      exportFidelity: this.scoreExportFidelity(slides, style),
    };

    const weights = {
      slideCopyQuality: 25,
      layoutContentFit: 20,
      typographyReadability: 15,
      visualRhythm: 15,
      speakerNotes: 15,
      exportFidelity: 10,
    };
    let overall = 0;
    for (const [key, weight] of Object.entries(weights)) {
      overall += (categories[key as keyof typeof categories] / 100) * weight;
    }
    overall = Math.round(overall);

    const categoryFailures = Object.entries(categories)
      .filter(([key, score]) => (weights as any)[key] >= 10 && score < (key === 'layoutContentFit' || key === 'speakerNotes' ? 80 : 75))
      .map(([key]) => key);

    return {
      ...categories,
      overall,
      passed: overall >= 85 && categories.slideCopyQuality >= 85 && categories.layoutContentFit >= 80 && categories.speakerNotes >= 80 && !categoryFailures.length,
      categoryFailures,
    };
  }

  // ─── Scoring Methods ──────────────────────────────────────

  private scoreTypography(slides: DeckCompositionSlide[], style: VisualStyleProfile, tokens: TypographyTokens): number {
    let score = 80;
    // Font consistency across slides
    const headingSizes = new Set<string>();
    for (const slide of slides) {
      const cs = (slide.content as any)?.__styles || {};
      if (cs.title?.fontSize) headingSizes.add(cs.title.fontSize);
    }
    if (headingSizes.size > 3) score -= 10; // inconsistent heading sizes
    if (!tokens.fontPack) score -= 10;
    if (!style.fontPack) score -= 5;
    return Math.max(0, Math.min(100, score));
  }

  private scoreVisualStyle(slides: DeckCompositionSlide[], style: VisualStyleProfile, understanding: SermonUnderstanding): number {
    let score = 80;
    // Has a defined visual style
    if (!style.key || style.key === 'auto') score -= 15;
    // Style matches sermon content
    if (understanding.avoidVisuals?.length > 0) score += 5;
    // Too many generic gradients
    const genericCount = slides.filter(s => !s.imagePrompt).length;
    if (genericCount > slides.length * 0.6) score -= 10;
    return Math.max(0, Math.min(100, score));
  }

  private scoreLayoutRhythm(slides: DeckCompositionSlide[]): number {
    let score = 85;
    // Detect layout repetition
    const layouts = slides.map(s => s.layoutKey || s.type);
    let maxRun = 1;
    let currentRun = 1;
    for (let i = 1; i < layouts.length; i++) {
      if (layouts[i] === layouts[i - 1]) {
        currentRun++;
        maxRun = Math.max(maxRun, currentRun);
      } else {
        currentRun = 1;
      }
    }
    if (maxRun > 3) score -= 15;
    if (maxRun > 2) score -= 8;
    // Layout variety
    const uniqueLayouts = new Set(layouts);
    if (uniqueLayouts.size < 3) score -= 10;
    if (uniqueLayouts.size < 5 && slides.length >= 8) score -= 5;
    return Math.max(0, Math.min(100, score));
  }

  private scoreSlideCopyQuality(slides: DeckCompositionSlide[], warnings: DeckQualityWarning[]): number {
    let score = 85;
    // Title presence
    const missingTitles = slides.filter(s => !s.title).length;
    if (missingTitles > 0) score -= missingTitles * 3;
    // Speaker notes
    const missingNotes = slides.filter(s => !s.speakerNotes || s.speakerNotes.length < 30).length;
    if (missingNotes > 0) score -= missingNotes * 2;
    // Content brevity
    const tooBrief = slides.filter(s => {
      const text = [s.title, s.body, ...(s.bullets || [])].filter(Boolean).join(' ');
      return text.length < 20 && s.type !== 'title' && s.type !== 'closing';
    }).length;
    if (tooBrief > 0) score -= tooBrief * 5;
    // Generic titles
    const genericTitles = slides.filter(s => s.title && /^(point\s*\d|slide\s*\d|introduction|conclusion)$/i.test(s.title)).length;
    if (genericTitles > 0) score -= genericTitles * 3;
    // Transition purpose
    const missingTransition = slides.filter(s => !(s as any).transitionPurpose).length;
    if (missingTransition > slides.length * 0.3) score -= 5;
    return Math.max(0, Math.min(100, score));
  }

  private scoreLayoutContentFit(slides: DeckCompositionSlide[]): number {
    let score = 86;
    let repeatedFamilies = 0;
    let missingReferenceOnScripture = 0;
    for (let index = 0; index < slides.length; index += 1) {
      const slide = slides[index];
      const family = slide.layoutKey || slide.type;
      if (index >= 2 && family === (slides[index - 1].layoutKey || slides[index - 1].type) && family === (slides[index - 2].layoutKey || slides[index - 2].type)) {
        repeatedFamilies += 1;
      }
      if (slide.type === 'scripture' && !slide.reference) missingReferenceOnScripture += 1;
      if (slide.type === 'sermon_point' && !(slide.subtitle || slide.body || slide.bullets?.length)) score -= 6;
      if (slide.type === 'application' && (!slide.bullets || slide.bullets.length < 2)) score -= 8;
    }
    score -= repeatedFamilies * 8;
    score -= missingReferenceOnScripture * 5;
    const uniqueLayouts = new Set(slides.map((slide) => slide.layoutKey));
    if (slides.length >= 10 && uniqueLayouts.size < 5) score -= 12;
    return Math.max(0, Math.min(100, score));
  }

  private scoreSpeakerNotes(slides: DeckCompositionSlide[]): number {
    let score = 88;
    const pointSlides = slides.filter((slide) => slide.type === 'sermon_point' || slide.type === 'story_moment');
    const shortPointNotes = pointSlides.filter((slide) => cleanText(slide.speakerNotes).length < 80).length;
    const genericNotes = slides.filter((slide) => /^(transition slide|open with warmth|close with hope and clarity)/i.test(cleanText(slide.speakerNotes))).length;
    score -= shortPointNotes * 6;
    score -= genericNotes * 4;
    return Math.max(0, Math.min(100, score));
  }

  private scoreBackgroundUsage(slides: DeckCompositionSlide[]): number {
    let score = 80;
    const keySlides = slides.filter(s => ['title', 'appeal', 'closing', 'scripture'].includes(s.type));
    const keyWithImages = keySlides.filter(s => s.imagePrompt).length;
    if (keyWithImages < keySlides.length * 0.5) score -= 15;
    // Overall image coverage
    const withImages = slides.filter(s => s.imagePrompt).length;
    const coverage = withImages / Math.max(slides.length, 1);
    if (coverage < 0.3) score -= 10;
    if (coverage < 0.2) score -= 10;
    return Math.max(0, Math.min(100, score));
  }

  private scoreProjectionReadability(slides: DeckCompositionSlide[], tokens: TypographyTokens): number {
    let score = 85;
    const sizes = tokens.projectionSizes;
    const minPx = (val: string) => parseInt(val.replace('px', ''), 10);
    for (const slide of slides) {
      const cs = (slide.content as any)?.__styles || {};
      const bodySize = cs.body?.fontSize ? parseInt(cs.body.fontSize, 10) : 0;
      if (bodySize > 0 && bodySize < minPx(sizes.body)) score -= 3;
      if (slide.bullets && slide.bullets.length > 4) score -= 5;
    }
    return Math.max(0, Math.min(100, score));
  }

  private scoreExportFidelity(slides: DeckCompositionSlide[], style: VisualStyleProfile): number {
    let score = 85;
    if (!style.fontPack) score -= 5;
    // Check font availability warnings
    const nonStandardFonts = slides.some(s => {
      const cs = (s.content as any)?.__styles || {};
      return cs.title?.fontFamily && !['Arial', 'Calibri', 'Georgia', 'Times New Roman'].includes(cs.title.fontFamily);
    });
    if (nonStandardFonts) score -= 5;
    return Math.max(0, Math.min(100, score));
  }

  // ─── Per-Slide Validation ──────────────────────────────────

  private validateSlide(
    slide: DeckCompositionSlide,
    index: number,
    warnings: DeckQualityWarning[],
    understanding: SermonUnderstanding,
    style: VisualStyleProfile,
  ): DeckCompositionSlide {
    const slideWarnings: DeckQualityWarning[] = [];
    const repairedPlan = this.slideCopyQualityValidator.validateAndRepair([
      {
        id: slide.id,
        slidePurpose: String((slide.content as any)?.slidePurpose || slide.type),
        slideType: slide.type,
        audienceMoment: String((slide.content as any)?.audienceMoment || ''),
        headline: slide.title || '',
        subheadline: slide.subtitle || slide.body || slide.message || '',
        bodyLines: Array.isArray(slide.bullets) ? slide.bullets : [],
        scriptureReference: slide.reference,
        speakerNotes: slide.speakerNotes || '',
        layoutIntent: slide.layoutKey,
        visualIntent: String((slide.content as any)?.visualIntent || ''),
        emotionalTone: String((slide.content as any)?.emotionalTone || understanding.emotionalTone || ''),
        transitionPurpose: String((slide.content as any)?.transitionPurpose || ''),
      },
    ], understanding)[0];
    const normalized: DeckCompositionSlide = {
      ...slide,
      title: repairedPlan?.headline ? shortenText(cleanText(repairedPlan.headline), 58) : slide.title,
      subtitle: repairedPlan?.subheadline ? shortenText(cleanText(repairedPlan.subheadline), 96) : slide.subtitle,
      body: slide.body ? shortenText(cleanText(slide.body), 180) : slide.body,
      message: slide.message ? shortenText(cleanText(slide.message), 140) : slide.message,
      bullets: repairedPlan?.bodyLines?.length
        ? normalizeBulletList(repairedPlan.bodyLines, { maxBullets: 4, maxChars: 72 })
        : Array.isArray(slide.bullets) ? normalizeBulletList(slide.bullets, { maxBullets: 4, maxChars: 72 }) : slide.bullets,
      speakerNotes: repairedPlan?.speakerNotes ? shortenText(cleanText(repairedPlan.speakerNotes), 900) : slide.speakerNotes ? shortenText(cleanText(slide.speakerNotes), 700) : this.defaultNotes(slide, understanding),
      qualityWarnings: slide.qualityWarnings || [],
    };

    const textDensity = [
      normalized.title, normalized.subtitle, normalized.reference,
      normalized.body, normalized.message, ...(normalized.bullets || []),
    ].filter(Boolean).map(v => String(v)).join(' ').length;

    if (textDensity > 280 && slide.type !== 'scripture') {
      slideWarnings.push({
        code: 'text-density-high', severity: 'warning',
        message: `Slide ${index + 1} has dense text and may feel crowded.`,
        suggestion: 'Move detail to speaker notes or split the slide.',
        slideIndex: index, slideType: slide.type, autoFixed: true,
      });
    }

    if (!normalized.speakerNotes || normalized.speakerNotes.length < 30) {
      slideWarnings.push({
        code: 'missing-speaker-notes', severity: 'info',
        message: `Slide ${index + 1} is missing speaker notes.`,
        suggestion: 'Add a short pastoral note for the speaker.',
        slideIndex: index, slideType: slide.type, autoFixed: true,
      });
      normalized.speakerNotes = this.defaultNotes(slide, understanding);
    }

    if (!normalized.title && slide.type !== 'closing' && slide.type !== 'social_cta' && slide.type !== 'social_hook') {
      slideWarnings.push({
        code: 'missing-title', severity: 'warning',
        message: `Slide ${index + 1} has no title.`,
        suggestion: 'Add a clear title for projection.',
        slideIndex: index, slideType: slide.type,
      });
    }

    if (slide.type === 'sermon_point' && (!normalized.title || normalized.title.split(/\s+/).length < 4)) {
      slideWarnings.push({
        code: 'point-headline-weak', severity: 'warning',
        message: `Slide ${index + 1} point headline is too thin for projection.`,
        suggestion: 'Use a complete, congregation-facing thought.',
        slideIndex: index, slideType: slide.type, autoFixed: true,
      });
    }

    if (slide.type === 'application' && Array.isArray(normalized.bullets)) {
      const invalidApplication = normalized.bullets.some((line) => !/^(ask|stop|let|come|receive|celebrate|worship|reject|endure|believe|walk|hear|hold|live|trust|obey|continue|choose)\b/i.test(line));
      if (invalidApplication) {
        slideWarnings.push({
          code: 'application-actions-weak', severity: 'warning',
          message: `Slide ${index + 1} application needs stronger action language.`,
          suggestion: 'Lead each line with a verb.',
          slideIndex: index, slideType: slide.type, autoFixed: true,
        });
      }
    }

    if (/(distance and longing|the road back|the welcome home|god's guidance|biblical support)/i.test(normalized.title || '')) {
      slideWarnings.push({
        code: 'headline-too-generic', severity: 'warning',
        message: `Slide ${index + 1} headline still reads like a fragment.`,
        suggestion: 'Rewrite it as a complete sermonic sentence.',
        slideIndex: index, slideType: slide.type, autoFixed: true,
      });
    }

    // Content too brief check
    const briefText = [normalized.title, normalized.body].filter(Boolean).join(' ');
    if (briefText.length < 20 && slide.type !== 'title' && slide.type !== 'closing') {
      slideWarnings.push({
        code: 'content-too-brief', severity: 'info',
        message: `Slide ${index + 1} content is very short.`,
        suggestion: 'Add a meaningful support line or pastoral note.',
        slideIndex: index, slideType: slide.type,
      });
    }

    if (style.key === 'hopeful_prophecy' && /doom|fear|terror|beast|flame/i.test([normalized.title, normalized.body, normalized.message, ...(normalized.bullets || [])].join(' '))) {
      slideWarnings.push({
        code: 'prophecy-language-too-sensational', severity: 'warning',
        message: `Slide ${index + 1} sounds sensational for prophetic imagery.`,
        suggestion: 'Soft-lean toward hope, worship, and faithful witness.',
        slideIndex: index, slideType: slide.type, autoFixed: true,
      });
    }

    if (slide.type === 'egw_support' && !normalized.reference && !normalized.title) {
      normalized.title = 'Spirit of Prophecy';
    }

    normalized.content = { ...(normalized.content || {}), __quality: slideWarnings };
    normalized.qualityWarnings = slideWarnings;
    warnings.push(...slideWarnings);
    return normalized;
  }

  private defaultNotes(slide: DeckCompositionSlide, understanding: SermonUnderstanding) {
    const base = [
      slide.title || slide.reference || slide.message || slide.body || understanding.centralMessage,
      understanding.pastoralGoal,
    ].filter(Boolean).join('. ');
    return shortenText(`${base}. Connect this slide to the previous moment in the sermon and show the congregation why this truth matters now.`, 360);
  }
}
