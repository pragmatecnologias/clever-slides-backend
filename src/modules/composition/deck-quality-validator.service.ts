import { Injectable } from '@nestjs/common';
import {
  DeckComposition,
  DeckQualityWarning,
  DeckCompositionSlide,
  SermonUnderstanding,
} from '../../../../../shared/deck-composition.contract';
import { cleanText, normalizeBulletList, shortenText, splitTextIntoLines } from '../llm/slide-content-formatting';
import { VisualStyleProfile } from './visual-style.service';

@Injectable()
export class DeckQualityValidator {
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

    const validated = {
      ...composition,
      slides,
      qualityWarnings: [...(composition.qualityWarnings || []), ...warnings],
    };

    return validated;
  }

  private validateSlide(
    slide: DeckCompositionSlide,
    index: number,
    warnings: DeckQualityWarning[],
    understanding: SermonUnderstanding,
    style: VisualStyleProfile,
  ): DeckCompositionSlide {
    const slideWarnings: DeckQualityWarning[] = [];
    const normalized: DeckCompositionSlide = {
      ...slide,
      title: slide.title ? shortenText(cleanText(slide.title), 58) : slide.title,
      subtitle: slide.subtitle ? shortenText(cleanText(slide.subtitle), 80) : slide.subtitle,
      body: slide.body ? shortenText(cleanText(slide.body), 180) : slide.body,
      message: slide.message ? shortenText(cleanText(slide.message), 140) : slide.message,
      bullets: Array.isArray(slide.bullets) ? normalizeBulletList(slide.bullets, { maxBullets: 4, maxChars: 72 }) : slide.bullets,
      speakerNotes: slide.speakerNotes ? shortenText(cleanText(slide.speakerNotes), 700) : this.defaultNotes(slide, understanding),
      qualityWarnings: slide.qualityWarnings || [],
    };

    const textDensity = [
      normalized.title,
      normalized.subtitle,
      normalized.reference,
      normalized.body,
      normalized.message,
      ...(normalized.bullets || []),
    ]
      .filter(Boolean)
      .map((value) => String(value))
      .join(' ').length;

    if (textDensity > 280 && slide.type !== 'scripture') {
      slideWarnings.push({
        code: 'text-density-high',
        severity: 'warning',
        message: `Slide ${index + 1} has dense text and may feel crowded.`,
        suggestion: 'Move detail to speaker notes or split the slide.',
        slideIndex: index,
        slideType: slide.type,
        autoFixed: true,
      });
    }

    if (!normalized.speakerNotes) {
      slideWarnings.push({
        code: 'missing-speaker-notes',
        severity: 'info',
        message: `Slide ${index + 1} is missing speaker notes.`,
        suggestion: 'Add a short pastoral note for the speaker.',
        slideIndex: index,
        slideType: slide.type,
        autoFixed: true,
      });
      normalized.speakerNotes = this.defaultNotes(slide, understanding);
    }

    if (slide.type === 'egw_support' && !normalized.reference && !normalized.title) {
      normalized.title = 'Spirit of Prophecy';
    }

    if (style.key === 'hopeful_prophecy' && /doom|fear|terror|beast|flame/i.test([normalized.title, normalized.body, normalized.message, ...(normalized.bullets || [])].join(' '))) {
      slideWarnings.push({
        code: 'prophecy-language-too-sensational',
        severity: 'warning',
        message: `Slide ${index + 1} sounds sensational for prophetic imagery.`,
        suggestion: 'Soft-lean toward hope, worship, and faithful witness.',
        slideIndex: index,
        slideType: slide.type,
        autoFixed: true,
      });
    }

    if (slide.type === 'scripture') {
      const lines = Array.isArray((normalized.content as any)?.lines) ? (normalized.content as any).lines : [];
      if (lines.length > 3) {
        (normalized.content as any).lines = splitTextIntoLines(lines.join(' '), 3, 42);
      }
    }

    normalized.content = {
      ...(normalized.content || {}),
      __quality: slideWarnings,
    };
    normalized.qualityWarnings = slideWarnings;
    warnings.push(...slideWarnings);
    return normalized;
  }

  private defaultNotes(slide: DeckCompositionSlide, understanding: SermonUnderstanding) {
    const base = [
      slide.title || slide.reference || slide.message || slide.body || understanding.centralMessage,
      understanding.pastoralGoal,
    ]
      .filter(Boolean)
      .join('. ');
    return shortenText(base, 240);
  }
}

