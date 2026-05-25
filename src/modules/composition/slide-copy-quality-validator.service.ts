import { Injectable } from '@nestjs/common';
import { DeckCompositionSlideType, SermonUnderstanding } from '../../../../../shared/deck-composition.contract';
import { cleanText, formatPresentationSentence, normalizeBulletList, shortenText } from '../llm/slide-content-formatting';
import { SermonSlideCopyPlan } from './sermon-slide-copywriter.service';

const INTERNAL_LABELS = new Set([
  'point 1',
  'point 2',
  'point 3',
  'biblical support',
  'support',
  'application',
  'reflection',
  'closing',
  'big idea',
  'sermon core',
  'generated point',
  'gospel restoration',
  'biblical tension',
]);

@Injectable()
export class SlideCopyQualityValidator {
  validateAndRepair(
    plans: SermonSlideCopyPlan[],
    understanding: SermonUnderstanding,
  ): SermonSlideCopyPlan[] {
    return plans.map((plan, index) => this.validateSingle(plan, plans[index - 1], understanding));
  }

  private validateSingle(
    plan: SermonSlideCopyPlan,
    previous: SermonSlideCopyPlan | undefined,
    understanding: SermonUnderstanding,
  ): SermonSlideCopyPlan {
    const headline = this.repairHeadline(plan.headline, plan, understanding);
    const subheadline = cleanText(plan.subheadline);
    const bodyLines = this.repairBodyLines(plan.bodyLines || [], plan.slideType, understanding);
    const speakerNotes = this.repairSpeakerNotes(plan.speakerNotes, plan, understanding);
    const repeatedHeadline = previous && this.normalize(headline) === this.normalize(previous.headline);

    return {
      ...plan,
      headline: repeatedHeadline ? this.addVariation(headline, plan.slideType, understanding) : headline,
      subheadline: subheadline || undefined,
      bodyLines,
      speakerNotes,
    };
  }

  private repairHeadline(value: string, plan: SermonSlideCopyPlan, understanding: SermonUnderstanding): string {
    const headline = cleanText(value);
    const normalized = this.normalize(headline);
    const words = normalized.split(/\s+/).filter(Boolean);
    const hasVerb = /\b(is|are|was|were|keeps|holds|calls|orders|upholds|restores|receives|runs|worship|reject|endure|come|trust|believe|walk|rise|return|endures|gives|begins|moves)\b/i.test(headline);

    if (!headline || INTERNAL_LABELS.has(normalized)) {
      return this.defaultHeadline(plan.slideType, understanding);
    }
    if (plan.slideType === 'application' && words.length < 2) {
      return this.defaultHeadline(plan.slideType, understanding);
    }
    if (plan.slideType === 'sermon_point' && (!hasVerb || words.length < 4)) {
      return this.semanticizeFragment(headline, understanding);
    }
    if ((plan.slideType === 'big_idea' || plan.slideType === 'appeal' || plan.slideType === 'reflection') && words.length < 4 && !hasVerb) {
      return this.semanticizeFragment(headline, understanding);
    }
    return shortenText(headline, 96);
  }

  private repairBodyLines(lines: string[], slideType: DeckCompositionSlideType, understanding: SermonUnderstanding): string[] {
    const normalized = normalizeBulletList(lines, { maxBullets: slideType === 'application' ? 3 : 3, maxChars: 72 });
    if (slideType === 'application') {
      return normalized.map((line) => this.ensureActionVerb(line));
    }
    return normalized.filter((line) => cleanText(line).split(/\s+/).length >= 3 || slideType === 'scripture');
  }

  private repairSpeakerNotes(value: string, plan: SermonSlideCopyPlan, understanding: SermonUnderstanding): string {
    const notes = cleanText(value);
    const minimum = ['title', 'scripture', 'reflection', 'appeal', 'closing'].includes(plan.slideType) ? 40 : 80;
    if (notes.length >= minimum && !/^(say|mention|note|transition slide)\b/i.test(notes)) {
      return shortenText(notes, 1200);
    }

    const fallback = `${plan.headline}. ${plan.transitionPurpose} Connect this slide to ${understanding.centralMessage.toLowerCase()} and keep the pastoral tone clear for the congregation.`;
    return shortenText(fallback, 1200);
  }

  private semanticizeFragment(headline: string, understanding: SermonUnderstanding): string {
    const text = this.normalize(headline);
    if (/distance|longing/.test(text)) return 'Distance grows when the heart leaves home.';
    if (/road back|return/.test(text)) return 'Coming home begins when we come to ourselves.';
    if (/welcome home|welcome/.test(text)) return 'The Father restores before the son can repay.';
    if (/guidance|steps|path/.test(text)) return 'God orders the steps we cannot see.';
    if (/worship|creator/.test(text)) return 'Judgment calls the world back to worship the Creator.';
    if (/babylon/.test(text)) return 'Babylon falls because false worship cannot stand.';
    return this.defaultHeadline('sermon_point', understanding);
  }

  private defaultHeadline(slideType: DeckCompositionSlideType, understanding: SermonUnderstanding): string {
    const defaults: Record<DeckCompositionSlideType, string> = {
      title: understanding.centralMessage,
      scripture: understanding.centralMessage,
      big_idea: understanding.centralMessage,
      sermon_point: 'God’s word speaks with clear pastoral force.',
      supporting_verse: 'Scripture supports the truth being preached.',
      story_moment: 'Grace moves through the story with purpose.',
      application: 'Hear it. Trust it. Live it.',
      reflection: 'Where is God asking for your response today?',
      appeal: 'Respond to the word while it is speaking to you.',
      closing: 'God’s word remains steady and true.',
      egw_support: 'A supporting witness reinforces the message.',
      social_hook: understanding.centralMessage,
      social_cta: 'Take the next faithful step today.',
    };
    return defaults[slideType];
  }

  private ensureActionVerb(line: string): string {
    const cleaned = cleanText(line);
    if (/^(ask|stop|let|come|receive|celebrate|worship|reject|endure|believe|walk|hear|hold|live|trust|obey|continue)\b/i.test(cleaned)) {
      return formatPresentationSentence(cleaned, 68);
    }
    return formatPresentationSentence(`Choose to ${cleaned.replace(/[.]$/, '')}`, 68);
  }

  private addVariation(headline: string, slideType: DeckCompositionSlideType, understanding: SermonUnderstanding): string {
    if (slideType === 'sermon_point') return this.defaultHeadline(slideType, understanding);
    return `${headline} Today`;
  }

  private normalize(value: string): string {
    return cleanText(value).toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim();
  }
}
