import { Injectable } from '@nestjs/common';
import { Sermon } from '../../entities/sermon.entity';
import { cleanText, shortenText } from '../llm/slide-content-formatting';
import { SermonUnderstanding, VisualStyleKey } from '../../../../../shared/deck-composition.contract';

const PROPHETIC_PASSAGE_RE = /(revelation\s*(14|13|12|18)|apocalipsis\s*(14|13|12|18)|daniel\s*(7|8)|matthew\s*24|exodus\s*20)/i;
const NARRATIVE_PASSAGE_RE = /(luke\s*15|lucas\s*15|genesis|genesis\s*\d+|mark\s*\d+|matthew\s*\d+|\bstory\b|\bjourney\b|\bhomecoming\b)/i;
const EVANGELISTIC_RE = /(john\s*3:16|salvation|grace|believe|invitation|repent|respond|accept jesus)/i;
const TEACHING_RE = /(study|teaching|doctrinal|expository|bible study|lesson|explanation)/i;
const YOUTH_RE = /(youth|young adult|student|next gen)/i;
const SPANISH_RE = /^es\b|spanish|español/i;

@Injectable()
export class SermonUnderstandingService {
  analyze(sermon: Sermon, requestedVisualStyle: VisualStyleKey = 'auto'): SermonUnderstanding {
    const planning = this.getPlanning(sermon);
    const sermonText = cleanText([
      sermon.title,
      sermon.seriesTitle,
      sermon.mainScriptureRef,
      sermon.bigIdea,
      sermon.audienceContext,
      sermon.notes,
      planning.style,
      planning.storyArc,
      planning.ministryMode,
      planning.appealStyle,
      planning.bilingualMode,
    ]
      .filter(Boolean)
      .join(' '));
    const isSpanish = SPANISH_RE.test(String((sermon as any).language || planning.language || ''));

    const movement = this.inferMovement(sermonText, planning);
    const recommendedVisualStyle = this.resolveVisualStyle(sermonText, planning, isSpanish, requestedVisualStyle);

    return {
      centralMessage: this.pickCentralMessage(sermon, movement),
      emotionalTone: this.pickTone(sermon, planning),
      sermonMovement: movement,
      audienceNeed: this.pickAudienceNeed(sermon),
      pastoralGoal: this.pickPastoralGoal(sermon, planning),
      appealDirection: this.pickAppealDirection(sermon, planning),
      visualMotifs: this.pickVisualMotifs(sermon, movement),
      avoidVisuals: this.pickAvoidVisuals(sermonText, movement),
      recommendedVisualStyle,
    };
  }

  private getPlanning(sermon: Sermon): Record<string, any> {
    return sermon?.planning && typeof sermon.planning === 'object' ? sermon.planning : {};
  }

  private inferMovement(sermonText: string, planning: Record<string, any>): SermonUnderstanding['sermonMovement'] {
    const style = String(planning.style || '').toLowerCase();
    const storyArc = String(planning.storyArc || '').toLowerCase();
    const ministryMode = String(planning.ministryMode || '').toLowerCase();
    const appealStyle = String(planning.appealStyle || '').toLowerCase();

    if (PROPHETIC_PASSAGE_RE.test(sermonText) || ministryMode.includes('prophetic') || style.includes('prophetic') || storyArc.includes('prophetic')) {
      return 'prophetic';
    }
    if (NARRATIVE_PASSAGE_RE.test(sermonText) || style.includes('narrative') || storyArc.includes('tension') || storyArc.includes('story')) {
      return 'narrative';
    }
    if (TEACHING_RE.test(sermonText) || ministryMode.includes('teaching') || ministryMode.includes('doctrinal') || style.includes('expository') || style.includes('teaching')) {
      return 'teaching';
    }
    if (EVANGELISTIC_RE.test(sermonText) || ministryMode.includes('evangelistic') || appealStyle.includes('invitation') || appealStyle.includes('commit')) {
      return 'evangelistic';
    }
    return 'mixed';
  }

  private resolveVisualStyle(
    sermonText: string,
    planning: Record<string, any>,
    isSpanish: boolean,
    requestedVisualStyle: VisualStyleKey,
  ): VisualStyleKey {
    if (requestedVisualStyle && requestedVisualStyle !== 'auto') {
      return requestedVisualStyle;
    }

    const ministryMode = String(planning.ministryMode || '').toLowerCase();
    const style = String(planning.style || '').toLowerCase();
    const storyArc = String(planning.storyArc || '').toLowerCase();
    const guardrailMode = String(planning.guardrailMode || '').toLowerCase();

    if (PROPHETIC_PASSAGE_RE.test(sermonText) || ministryMode.includes('prophetic') || guardrailMode.includes('prophetic') || style.includes('prophetic')) {
      return 'hopeful_prophecy';
    }
    if (isSpanish) {
      return 'spanish_church_warm';
    }
    if (style.includes('narrative') || storyArc.includes('narrative') || NARRATIVE_PASSAGE_RE.test(sermonText)) {
      return 'warm_pastoral';
    }
    if (ministryMode.includes('evangelistic') || EVANGELISTIC_RE.test(sermonText) || /invitation|commit|repent|return/.test(storyArc)) {
      return 'evangelistic_invitation';
    }
    if (ministryMode.includes('teaching') || ministryMode.includes('doctrinal') || TEACHING_RE.test(sermonText)) {
      return 'bible_study_clean';
    }
    if (YOUTH_RE.test(sermonText) || style.includes('youth')) {
      return 'youth_modern';
    }
    return 'reverent_worship';
  }

  private pickCentralMessage(sermon: Sermon, movement: SermonUnderstanding['sermonMovement']): string {
    const candidate = shortenText(sermon.bigIdea || sermon.title || 'God speaks to us today', 120);
    const normalized = candidate.toLowerCase();
    const looksGeneric =
      /^(big idea|sermon core|outline option|outline|message|theme)$/i.test(normalized) ||
      /(love and salvation|biblical tension|gospel restoration|call to response|god speaks to us today)/i.test(normalized) ||
      (candidate.split(/\s+/).length <= 4 && !/(jesus|christ|god|father|son|creator|lamb|cross|grace|truth|hope|life|home|return)/i.test(candidate));

    if (!looksGeneric) {
      return candidate;
    }

    const mapping: Record<SermonUnderstanding['sermonMovement'], string> = {
      narrative: 'Grace welcomes the returning heart.',
      prophetic: 'The everlasting gospel still calls.',
      expository: 'Scripture makes the truth clear.',
      evangelistic: 'God’s love gives eternal life.',
      teaching: 'Scripture makes the truth clear.',
      mixed: 'God speaks first and invites response.',
    };

    return shortenText(mapping[movement] || candidate, 120);
  }

  private pickTone(sermon: Sermon, planning: Record<string, any>): string {
    const fromPlanning = this.asString(planning.tone);
    return shortenText(fromPlanning || sermon.tone || 'encouraging', 48);
  }

  private pickAudienceNeed(sermon: Sermon): string {
    const planning = this.getPlanning(sermon);
    return shortenText(
      sermon.audienceContext || sermon.notes || planning.audienceProfile || planning.sermonGoals || 'People need a clear, hopeful response to God’s word.',
      140,
    );
  }

  private pickPastoralGoal(sermon: Sermon, planning: Record<string, any>): string {
    const goal = this.asString(planning.sermonGoal || planning.goal || planning.sermonGoals || sermon.bigIdea || sermon.notes);
    return shortenText(goal || 'Help people respond faithfully to God.', 150);
  }

  private pickAppealDirection(sermon: Sermon, planning: Record<string, any>): string {
    const appealStyle = this.asString(planning.appealStyle || sermon.ctaStyle || 'invitation');
    const mappings: Record<string, string> = {
      invitation: 'Invite a clear faith response.',
      commitment: 'Call for a concrete commitment.',
      reflection: 'Invite prayerful reflection.',
      doctrinal_clarity: 'Anchor the appeal in truth and trust.',
      pastoral_encouragement: 'Offer hope and encouragement.',
      repentance_return: 'Call people home to the Father.',
      mission_service: 'Invite the church into mission and service.',
      salvation: 'Call for salvation in Christ.',
      prayer: 'Lead the room into prayer.',
      discipleship: 'Call for everyday obedience.',
      none: 'Leave room for response without pressure.',
    };
    return mappings[appealStyle] || mappings.invitation;
  }

  private pickVisualMotifs(sermon: Sermon, movement: SermonUnderstanding['sermonMovement']): string[] {
    const source = `${sermon.title || ''} ${sermon.mainScriptureRef || ''} ${sermon.bigIdea || ''}`.toLowerCase();
    if (/john\s*3:16|love|grace|salvation|eternal life/.test(source)) {
      return ['light breaking through darkness', 'open hands receiving a gift', 'fatherly welcome', 'path toward hope'];
    }
    if (/luke\s*15|lucas\s*15|prodigal|return home|homecoming/.test(source) || movement === 'narrative') {
      return ['warm homecoming light', 'road back home', 'open door', 'restored dignity'];
    }
    if (/revelation\s*14|apocalipsis\s*14|everlasting gospel/.test(source) || movement === 'prophetic') {
      return ['global gospel light', 'worshipful horizon', 'faithful witness', 'creator-centered hope'];
    }
    if (movement === 'evangelistic') {
      return ['invitation to respond', 'hopeful worship gathering', 'open path', 'personal decision'];
    }
    if (movement === 'teaching') {
      return ['open Bible', 'clear study notes', 'clean lines', 'focused learning'];
    }
    return ['reverent worship', 'soft light', 'clear biblical focus', 'hopeful atmosphere'];
  }

  private pickAvoidVisuals(sermonText: string, movement: SermonUnderstanding['sermonMovement']): string[] {
    if (PROPHETIC_PASSAGE_RE.test(sermonText) || movement === 'prophetic') {
      return ['doom-only imagery', 'fear-based apocalypse visuals', 'sensational beasts', 'flames as default'];
    }
    return ['text embedded into the image', 'watermarks', 'low-contrast busy scenes', 'distorted hands or faces'];
  }

  private asString(value: unknown): string {
    return cleanText(value);
  }
}
