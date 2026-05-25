import { Injectable } from '@nestjs/common';
import { DeckComposition, DeckCompositionSlide } from '../../../../../shared/deck-composition.contract';
import { SermonUnderstanding } from '../../../../../shared/deck-composition.contract';
import { VisualStyleProfile } from './visual-style.service';
import { shortenText } from '../llm/slide-content-formatting';

@Injectable()
export class ImagePromptAssignmentService {
  assign(
    composition: DeckComposition,
    understanding: SermonUnderstanding,
    style: VisualStyleProfile,
  ): DeckComposition {
    const slides = composition.slides.map((slide, index) => this.assignForSlide(slide, index, understanding, style));
    return {
      ...composition,
      slides,
    };
  }

  private assignForSlide(
    slide: DeckCompositionSlide,
    index: number,
    understanding: SermonUnderstanding,
    style: VisualStyleProfile,
  ): DeckCompositionSlide {
    const motifs = understanding.visualMotifs.join(', ');
    const avoid = understanding.avoidVisuals.join(', ');
    const basePrompt = `${style.imageStyle}. ${motifs}. Keep ${style.backgroundPolicy.toLowerCase()}`;
    const guardrails = avoid ? `Avoid: ${avoid}.` : '';

    switch (slide.type) {
      case 'title':
      case 'social_hook':
        return {
          ...slide,
          imagePrompt: shortenText(`${basePrompt} Strong sermon title background for "${slide.title || understanding.centralMessage}". ${guardrails}`, 240),
          contentImagePrompt: shortenText(`Clean title art for "${slide.title || understanding.centralMessage}". No text in image. ${guardrails}`, 220),
        };
      case 'scripture':
        return {
          ...slide,
          imagePrompt: shortenText(`${basePrompt} Scripture focus with ample negative space. ${guardrails}`, 240),
          contentImagePrompt: shortenText(`Quiet readable scripture backdrop for ${slide.reference || 'the passage'}. ${guardrails}`, 220),
        };
      case 'application':
      case 'reflection':
      case 'appeal':
      case 'closing':
      case 'social_cta':
        return {
          ...slide,
          imagePrompt: shortenText(`${basePrompt} Clean, hopeful, uncluttered worship background. ${guardrails}`, 240),
        };
      case 'story_moment':
      case 'big_idea':
      case 'sermon_point':
      case 'supporting_verse':
      case 'egw_support':
      default:
        return {
          ...slide,
          imagePrompt: shortenText(`${basePrompt} Subtle background supporting the message without competing with text. ${guardrails}`, 240),
        };
    }
  }
}

