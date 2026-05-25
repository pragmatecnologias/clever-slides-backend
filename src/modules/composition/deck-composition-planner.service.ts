import { Injectable } from '@nestjs/common';
import { Sermon } from '../../entities/sermon.entity';
import {
  DeckComposition,
  DeckCompositionSlide,
  DeckIntentKey,
  DeckSizeKey,
  SermonUnderstanding,
  VisualStyleKey,
} from '../../../../../shared/deck-composition.contract';
import { VisualStyleProfile } from './visual-style.service';
import { cleanText, formatPresentationSentence, shortenText, normalizeBulletList } from '../llm/slide-content-formatting';

@Injectable()
export class DeckCompositionPlanner {
  plan(
    sermon: Sermon,
    deckIntent: DeckIntentKey,
    understanding: SermonUnderstanding,
    visualStyle: VisualStyleProfile,
    deckSize: DeckSizeKey,
    source?: { sermonId?: string; workspaceId?: string; themeId?: string },
  ): DeckComposition {
    const slides = deckIntent === 'social_summary'
      ? this.buildSocialComposition(sermon, understanding, visualStyle)
      : this.buildSermonComposition(sermon, deckIntent, understanding, visualStyle, deckSize);

    return {
      deckIntent,
      targetLength: deckSize,
      slideCountTarget: slides.length,
      visualStyle: visualStyle.key,
      understanding,
      slides,
      qualityWarnings: [],
      generatedAt: new Date().toISOString(),
      source,
    };
  }

  private buildSermonComposition(
    sermon: Sermon,
    deckIntent: DeckIntentKey,
    understanding: SermonUnderstanding,
    visualStyle: VisualStyleProfile,
    deckSize: DeckSizeKey,
  ): DeckCompositionSlide[] {
    const points = this.extractPointRecords(sermon);
    const sourceText = `${sermon.mainScriptureRef || ''} ${sermon.bigIdea || ''} ${sermon.title || ''}`.toLowerCase();
    const isNarrative = understanding.sermonMovement === 'narrative' || /luke\s*15|story|homecoming|return/.test(sourceText);
    const isProphetic = understanding.sermonMovement === 'prophetic';
    const isEvangelistic = understanding.sermonMovement === 'evangelistic' || deckIntent === 'evangelistic_appeal';

    const slides: DeckCompositionSlide[] = [];
    slides.push(this.titleSlide(sermon, understanding));
    if (sermon.mainScriptureRef) slides.push(this.scriptureSlide(sermon, understanding));
    slides.push(this.bigIdeaSlide(sermon, understanding));

    if (isNarrative) {
      if (points[0]) slides.push(this.storyMomentSlide(sermon, understanding, this.storyMomentTitle(sermon, understanding, 0), points[0], 0));
      if (points[1]) slides.push(this.storyMomentSlide(sermon, understanding, this.storyMomentTitle(sermon, understanding, 1), points[1], 1));
      if (points[2]) slides.push(this.storyMomentSlide(sermon, understanding, this.storyMomentTitle(sermon, understanding, 2), points[2], 2));
      slides.push(this.applicationSlide(sermon, understanding, points));
      slides.push(this.reflectionSlide(sermon, understanding));
      slides.push(this.appealSlide(sermon, understanding));
      slides.push(this.closingSlide(sermon, understanding));
      return this.trimToTarget(slides, deckSize, 8, 12);
    }

    if (isProphetic) {
      slides.push(this.bigIdeaSlide(sermon, understanding, 'The everlasting gospel'));
      if (points[0]) slides.push(this.sermonPointSlide(sermon, understanding, points[0], 0));
      if (points[1]) slides.push(this.sermonPointSlide(sermon, understanding, points[1], 1));
      slides.push(this.egwSupportSlide(sermon, understanding));
      slides.push(this.applicationSlide(sermon, understanding, points, 'Live the message with hope and fidelity.'));
      slides.push(this.appealSlide(sermon, understanding, 'Respond to God’s call with trust and worship.'));
      slides.push(this.closingSlide(sermon, understanding, 'The Lamb leads His people faithfully.'));
      return this.trimToTarget(slides, deckSize, 8, 12);
    }

    if (isEvangelistic) {
      if (points[0]) slides.push(this.sermonPointSlide(sermon, understanding, points[0], 0));
      if (points[1]) slides.push(this.sermonPointSlide(sermon, understanding, points[1], 1));
      if (points[2]) slides.push(this.sermonPointSlide(sermon, understanding, points[2], 2));
      slides.push(this.applicationSlide(sermon, understanding, points, 'Receive the gift of life today.'));
      slides.push(this.reflectionSlide(sermon, understanding, 'What keeps you from receiving Christ’s gift?'));
      slides.push(this.appealSlide(sermon, understanding));
      slides.push(this.closingSlide(sermon, understanding));
      return this.trimToTarget(slides, deckSize, 8, 11);
    }

    if (points[0]) slides.push(this.sermonPointSlide(sermon, understanding, points[0], 0));
    if (points[1]) slides.push(this.sermonPointSlide(sermon, understanding, points[1], 1));
    if (points[2]) slides.push(this.sermonPointSlide(sermon, understanding, points[2], 2));
    slides.push(this.applicationSlide(sermon, understanding, points));
    slides.push(this.reflectionSlide(sermon, understanding));
    slides.push(this.appealSlide(sermon, understanding));
    slides.push(this.closingSlide(sermon, understanding));
    return this.trimToTarget(slides, deckSize, 8, 12);
  }

  private buildSocialComposition(
    sermon: Sermon,
    understanding: SermonUnderstanding,
    visualStyle: VisualStyleProfile,
  ): DeckCompositionSlide[] {
    const slides: DeckCompositionSlide[] = [];
    slides.push(this.titleSlide(sermon, understanding, 'social_hook'));
    slides.push(this.scriptureSlide(sermon, understanding, true));
    slides.push(this.bigIdeaSlide(sermon, understanding, 'A message worth sharing'));
    slides.push(this.appealSlide(sermon, understanding, 'Invite someone to listen this week.', 'social_cta'));
    if (sermon.ctaStyle !== 'none') {
      slides.push(this.closingSlide(sermon, understanding, 'Join us in worship and response.', 'social_cta'));
    }
    return slides.slice(0, 5);
  }

  private trimToTarget(slides: DeckCompositionSlide[], deckSize: DeckSizeKey, minSlides: number, maxSlides: number) {
    const target = deckSize === 'short' ? Math.max(minSlides, Math.min(8, slides.length)) : deckSize === 'long' ? Math.min(maxSlides, Math.max(slides.length, 12)) : Math.min(maxSlides, Math.max(slides.length, 10));
    return slides.slice(0, target);
  }

  private titleSlide(sermon: Sermon, understanding: SermonUnderstanding, type: DeckCompositionSlide['type'] = 'title'): DeckCompositionSlide {
    const title = shortenText(sermon.title || understanding.centralMessage || 'Sermon', 52);
    const subtitle = shortenText(sermon.seriesTitle || understanding.emotionalTone || understanding.pastoralGoal, 72);
    return {
      id: `${type}-0`,
      type,
      layoutKey: type === 'social_hook' ? 'social_story' : 'cinematic_title',
      title,
      subtitle,
      speakerNotes: `Open with warmth. ${understanding.pastoralGoal}`,
      content: { title, subtitle },
    };
  }

  private scriptureSlide(sermon: Sermon, understanding: SermonUnderstanding, social = false): DeckCompositionSlide {
    const reference = shortenText(sermon.mainScriptureRef || 'Scripture', 42);
    const body = sermon.mainScriptureRef ? `${reference} — ${understanding.centralMessage}` : understanding.centralMessage;
    return {
      id: `scripture-${reference || 'passage'}`,
      type: social ? 'social_hook' : 'scripture',
      layoutKey: social ? 'social_square' : 'scripture_focus',
      reference,
      body: shortenText(body, 120),
      speakerNotes: `Read the passage clearly. ${understanding.audienceNeed}`,
      content: { reference, lines: [shortenText(body, 60)], body },
    };
  }

  private bigIdeaSlide(sermon: Sermon, understanding: SermonUnderstanding, titleOverride?: string): DeckCompositionSlide {
    const title = shortenText(titleOverride || understanding.centralMessage || 'Big Idea', 44);
    const subtitle = shortenText(understanding.pastoralGoal || understanding.audienceNeed || understanding.centralMessage, 96);
    return {
      id: `big-idea-${title.replace(/\s+/g, '-').toLowerCase()}`,
      type: 'big_idea',
      layoutKey: 'big_idea_center',
      title,
      subtitle,
      speakerNotes: `Clarify the message center: ${understanding.centralMessage}`,
      content: { title, subtitle },
    };
  }

  private sermonPointSlide(sermon: Sermon, understanding: SermonUnderstanding, point: any, index = 0): DeckCompositionSlide {
    const title = shortenText(this.publicPointTitle(sermon, understanding, point, index), 52);
    const bulletSources = [point.summary, ...(Array.isArray(point.subpoints) ? point.subpoints : []), ...(Array.isArray(point.supportingVerses) ? point.supportingVerses : [])]
      .filter(Boolean)
      .filter((item) => !this.shouldRewritePointBody(this.asText(item), understanding));
    const bullets = normalizeBulletList(
      bulletSources,
      { maxBullets: 4, maxChars: 70 },
    );
    return {
      id: `point-${title.replace(/\s+/g, '-').toLowerCase()}`,
      type: 'sermon_point',
      layoutKey: 'point_with_support',
      title,
      bullets: bullets.length ? bullets : [shortenText(this.pointBody(sermon, understanding, point, index), 72)],
      speakerNotes: this.asText(point.summary || understanding.audienceNeed),
      content: {
        title,
        bullets: bullets.length ? bullets : [shortenText(this.pointBody(sermon, understanding, point, index), 72)],
      },
    };
  }

  private storyMomentSlide(sermon: Sermon, understanding: SermonUnderstanding, title: string, point: any, index = 0): DeckCompositionSlide {
    return {
      id: `story-${title.replace(/\s+/g, '-').toLowerCase()}`,
      type: 'story_moment',
      layoutKey: 'story_moment',
      title,
      body: shortenText(this.pointBody(sermon, understanding, point, index), 140),
      speakerNotes: this.asText(point.summary || understanding.pastoralGoal),
      content: { title, body: shortenText(this.pointBody(sermon, understanding, point, index), 140) },
    };
  }

  private applicationSlide(sermon: Sermon, understanding: SermonUnderstanding, points: any[], override?: string): DeckCompositionSlide {
    const bullets = this.unique([
      override || '',
      ...points.flatMap((point) => Array.isArray(point.applications) ? point.applications : []),
      understanding.pastoralGoal,
      understanding.audienceNeed,
      understanding.appealDirection,
    ].filter(Boolean)).slice(0, 4);
    const title = this.applicationTitle(sermon, understanding);
    return {
      id: 'application',
      type: 'application',
      layoutKey: 'application_steps',
      title,
      bullets: bullets.length ? bullets.map((item) => formatPresentationSentence(item, 72)) : [
        formatPresentationSentence(understanding.pastoralGoal, 72),
        formatPresentationSentence(understanding.audienceNeed, 72),
      ].filter(Boolean),
      speakerNotes: `Bring the message home: ${understanding.pastoralGoal}`,
      content: { title, bullets: bullets.length ? bullets : [understanding.pastoralGoal, understanding.audienceNeed] },
    };
  }

  private reflectionSlide(sermon: Sermon, understanding: SermonUnderstanding, question?: string): DeckCompositionSlide {
    const reflection = question || `Where is God calling you to respond to ${understanding.centralMessage}?`;
    return {
      id: 'reflection',
      type: 'reflection',
      layoutKey: 'reflection_question',
      title: 'Reflection',
      body: shortenText(reflection, 120),
      speakerNotes: `Pause and reflect: ${reflection}`,
      content: { title: 'Reflection', body: shortenText(reflection, 120) },
    };
  }

  private appealSlide(sermon: Sermon, understanding: SermonUnderstanding, override?: string, type: DeckCompositionSlide['type'] = 'appeal'): DeckCompositionSlide {
    const message = override || understanding.appealDirection;
    return {
      id: 'appeal',
      type,
      layoutKey: 'appeal_minimal',
      title: 'Appeal',
      message: shortenText(message, 120),
      speakerNotes: `Extend the appeal: ${message}`,
      content: { title: 'Appeal', message: shortenText(message, 120) },
    };
  }

  private closingSlide(sermon: Sermon, understanding: SermonUnderstanding, closing?: string, type: DeckCompositionSlide['type'] = 'closing'): DeckCompositionSlide {
    const body = closing || `Close with hope, prayer, and the reminder that ${understanding.centralMessage}.`;
    return {
      id: 'closing',
      type,
      layoutKey: 'closing_blessing',
      title: 'Closing',
      body: shortenText(body, 140),
      speakerNotes: `Close with hope and clarity: ${body}`,
      content: { title: 'Closing', body: shortenText(body, 140) },
    };
  }

  private egwSupportSlide(sermon: Sermon, understanding: SermonUnderstanding): DeckCompositionSlide {
    const body = this.asText((sermon.notes || sermon.manuscript || '')).slice(0, 220) || `Spirit of Prophecy support reinforces ${understanding.centralMessage}.`;
    return {
      id: 'egw-support',
      type: 'egw_support',
      layoutKey: 'point_with_support',
      title: 'Spirit of Prophecy',
      body: shortenText(body, 160),
      speakerNotes: 'Use Spirit of Prophecy support as a secondary witness.',
      content: { title: 'Spirit of Prophecy', body: shortenText(body, 160) },
    };
  }

  private extractPointRecords(sermon: Sermon) {
    const outlineStructure = (sermon.outline && typeof sermon.outline === 'object') ? sermon.outline?.structure || {} : {};
    const pointNodes = Array.isArray(outlineStructure.pointNodes) ? outlineStructure.pointNodes : [];
    const legacyPoints = Array.isArray(outlineStructure.points) ? outlineStructure.points : [];
    const source = pointNodes.length ? pointNodes : legacyPoints;
    const normalized = source.map((point: any, index: number) => ({
      title: this.asText(point?.title || point?.content || point?.name || point || `Point ${index + 1}`),
      slideTitle: this.asText(point?.slideTitle),
      summary: this.asText(point?.summary || point?.preachingInsight),
      subpoints: Array.isArray(point?.subpoints) ? point.subpoints : Array.isArray(point?.bullets) ? point.bullets : [],
      supportingVerses: Array.isArray(point?.supportingVerses) ? point.supportingVerses : Array.isArray(point?.crossReferences) ? point.crossReferences : [],
      applications: Array.isArray(point?.applications) ? point.applications : [],
    }));
    if (normalized.length) return normalized.slice(0, 3);
    return (Array.isArray(sermon.mainPoints) ? sermon.mainPoints : []).slice(0, 3).map((point, index) => ({
      title: this.asText(point || `Point ${index + 1}`),
      slideTitle: '',
      summary: this.asText(point || sermon.bigIdea),
      subpoints: [this.asText(point || sermon.bigIdea)],
      supportingVerses: sermon.mainScriptureRef ? [sermon.mainScriptureRef] : [],
      applications: [this.asText(point || sermon.bigIdea)],
    }));
  }

  private unique(values: string[]) {
    return Array.from(new Set(values.map((item) => cleanText(item)).filter(Boolean)));
  }

  private publicPointTitle(sermon: Sermon, understanding: SermonUnderstanding, point: any, index: number): string {
    const language = String((sermon as any).language || sermon.planning?.language || '').toLowerCase();
    const candidate = this.asText(point?.slideTitle || point?.title || point?.summary);
    if (candidate && !this.shouldRewritePointTitle(candidate, understanding)) {
      return shortenText(candidate, 52);
    }

    const titlesByMovement: Record<string, string[]> = language.startsWith('es')
      ? {
          evangelistic: ['Dios amó primero', 'El regalo revela al Padre', 'Cree y recibe vida'],
          narrative: ['Distancia y deseo', 'El camino de regreso', 'El hogar recibe'],
          prophetic: ['El evangelio eterno', 'Adora al Creador', 'Sigue a Jesús'],
          teaching: ['La verdad clara', 'La esperanza bíblica', 'La respuesta fiel'],
          mixed: ['El llamado de Dios', 'La gracia al centro', 'La respuesta hoy'],
        }
      : {
          evangelistic: ['God loved first', 'The gift reveals the Father', 'Believe and receive life'],
          narrative: ['Distance and longing', 'The road back', 'The welcome home'],
          prophetic: ['The everlasting gospel', 'Worship the Creator', 'Hold fast to Jesus'],
          teaching: ['The truth made clear', 'Scripture in focus', 'Faithful response'],
          mixed: ['God speaks first', 'Grace at the center', 'The response today'],
        };

    return titlesByMovement[understanding.sermonMovement]?.[index]
      || titlesByMovement[understanding.sermonMovement]?.[0]
      || shortenText(understanding.centralMessage || 'Point', 52);
  }

  private pointBody(sermon: Sermon, understanding: SermonUnderstanding, point: any, index: number): string {
    const candidate = this.asText(point?.summary || point?.title || point?.slideTitle);
    if (candidate && !this.shouldRewritePointBody(candidate, understanding)) {
      return candidate;
    }

    const language = String((sermon as any).language || sermon.planning?.language || '').toLowerCase();
    const fallbackByMovement: Record<string, string[]> = language.startsWith('es')
      ? {
          evangelistic: [
            'Dios nos amó primero y tomó la iniciativa para salvarnos.',
            'El don de Cristo revela el corazón del Padre.',
            'Creer es recibir vida eterna y respuesta hoy.',
          ],
          narrative: [
            'La distancia crea el dolor de la historia.',
            'El regreso abre la puerta al perdón.',
            'El Padre corre a recibir al que vuelve.',
          ],
          prophetic: [
            'El evangelio eterno llama a adorar al Creador.',
            'Jesús sigue siendo el centro de la esperanza profética.',
            'La fidelidad nace de confiar en su palabra.',
          ],
          teaching: [
            'La verdad se entiende mejor cuando se escucha con cuidado.',
            'La Escritura guía una respuesta clara y fiel.',
            'La fe se traduce en obediencia práctica.',
          ],
          mixed: [
            'Dios toma la iniciativa y llama a responder.',
            'La gracia se ve en el regalo que Cristo ofrece.',
            'La respuesta apropiada nace de confiar en él.',
          ],
        }
      : {
          evangelistic: [
            'God loved first and took the first step toward us.',
            'The gift reveals the heart of the Father.',
            'Believing means receiving eternal life today.',
          ],
          narrative: [
            'Distance shapes the story before grace steps in.',
            'Repentance opens the road back home.',
            'The Father welcomes the returning child.',
          ],
          prophetic: [
            'The everlasting gospel keeps Jesus at the center.',
            'Worship the Creator without fear or sensationalism.',
            'Faithfulness grows from trusting God’s word.',
          ],
          teaching: [
            'Scripture gives clear light for the journey.',
            'The truth becomes practical when it is applied.',
            'Faith shows up in lived obedience.',
          ],
          mixed: [
            'God initiates grace before we respond.',
            'The gift of Christ shows the Father’s heart.',
            'Our response is trust, worship, and obedience.',
          ],
        };

    return fallbackByMovement[understanding.sermonMovement]?.[index]
      || fallbackByMovement[understanding.sermonMovement]?.[0]
      || this.asText(understanding.centralMessage);
  }

  private storyMomentTitle(sermon: Sermon, understanding: SermonUnderstanding, index: number): string {
    const language = String((sermon as any).language || sermon.planning?.language || '').toLowerCase();
    if (language.startsWith('es')) {
      const titlesByMovement: Record<string, string[]> = {
        narrative: ['Distancia y deseo', 'El camino de regreso', 'El hogar recibe'],
        evangelistic: ['Dios amó primero', 'El regalo revela al Padre', 'Cree y recibe vida'],
        prophetic: ['El evangelio eterno', 'Adora al Creador', 'Sigue a Jesús'],
        teaching: ['La verdad clara', 'La esperanza bíblica', 'La respuesta fiel'],
        mixed: ['El llamado de Dios', 'La gracia al centro', 'La respuesta hoy'],
      };
      return titlesByMovement[understanding.sermonMovement]?.[index]
        || titlesByMovement[understanding.sermonMovement]?.[0]
        || 'Historia';
    }
    const titlesByMovement: Record<string, string[]> = {
      narrative: ['Distance and longing', 'The road back', 'The welcome home'],
      evangelistic: ['God loved first', 'The gift reveals the Father', 'Believe and receive life'],
      prophetic: ['The everlasting gospel', 'Worship the Creator', 'Hold fast to Jesus'],
      teaching: ['The truth made clear', 'Scripture in focus', 'Faithful response'],
      mixed: ['God speaks first', 'Grace at the center', 'The response today'],
    };
    return titlesByMovement[understanding.sermonMovement]?.[index]
      || titlesByMovement[understanding.sermonMovement]?.[0]
      || 'Story moment';
  }

  private applicationTitle(sermon: Sermon, understanding: SermonUnderstanding): string {
    const language = String((sermon as any).language || sermon.planning?.language || '').toLowerCase();
    if (language.startsWith('es')) {
      const titles: Record<string, string> = {
        evangelistic: 'Vivir la respuesta',
        narrative: 'Volver al Padre',
        prophetic: 'Responder con fidelidad',
        teaching: 'Vivir la verdad',
        mixed: '¿Qué significa esto?',
      };
      return titles[understanding.sermonMovement] || titles.mixed;
    }
    const titles: Record<string, string> = {
      evangelistic: 'Receive the Gift',
      narrative: 'Coming Home',
      prophetic: 'Faithful Response',
      teaching: 'Living the Truth',
      mixed: 'What This Means',
    };
    return titles[understanding.sermonMovement] || titles.mixed;
  }

  private isFrameworkLabel(text: string): boolean {
    const normalized = cleanText(text).toLowerCase();
    return [
      'big idea',
      'application',
      'reflection',
      'closing',
      'biblical support',
      'biblical tension',
      'gospel restoration',
      'application cue',
      'sermon core',
      'point',
      'point 1',
      'point 2',
      'point 3',
      'the setting',
      'the tension',
      'the turning point',
    ].includes(normalized) || /^(point|support|reflection|closing|application)(\b|\s*\d+)/i.test(normalized);
  }

  private shouldRewritePointTitle(text: string, understanding: SermonUnderstanding): boolean {
    const normalized = cleanText(text).toLowerCase();
    const wordCount = normalized ? normalized.split(/\s+/).length : 0;
    if (this.isFrameworkLabel(text)) return true;
    if (/:/.test(normalized) && wordCount > 4) return true;
    if (/(diagnosis|intervention|restoration|condition|response|support|setting|tension|turning point|summary|outline|movement|section|framework)/.test(normalized)) return true;
    if (normalized.length < 22 && /^(god|jesus|christ|faith|grace|hope|truth|life|love)\b/.test(normalized)) return true;
    if (/love and salvation|biblical tension|gospel restoration|call to response|sermon core|big idea|message|theme/.test(normalized)) return true;
    if (understanding.sermonMovement === 'evangelistic' && /(love|salvation|gift|believe|response)/.test(normalized) && normalized.length < 34) return true;
    if (understanding.sermonMovement === 'prophetic' && /(worship|creator|gospel|call|response)/.test(normalized) && normalized.length < 34) return true;
    if (understanding.sermonMovement === 'narrative' && /(distance|tension|setting|turning|restoration|home|return)/.test(normalized) && normalized.length < 34) return true;
    if (understanding.sermonMovement === 'teaching' && /(truth|study|explain|clarity|lesson|doctrine)/.test(normalized) && normalized.length < 34) return true;
    return false;
  }

  private shouldRewritePointBody(text: string, understanding: SermonUnderstanding): boolean {
    const normalized = cleanText(text).toLowerCase();
    const wordCount = normalized ? normalized.split(/\s+/).length : 0;
    if (this.isFrameworkLabel(text)) return true;
    if (/:/.test(normalized) && wordCount > 6) return true;
    if (/(diagnosis|intervention|restoration|condition|response|support|setting|tension|turning point|summary|outline|movement|section|framework)/.test(normalized)) return true;
    if (/love and salvation|biblical tension|gospel restoration|call to response|sermon core|big idea|message|theme/.test(normalized)) return true;
    if (understanding.sermonMovement === 'evangelistic' && /(love|salvation|gift|believe|response)/.test(normalized) && normalized.length < 60) return true;
    if (understanding.sermonMovement === 'prophetic' && /(worship|creator|gospel|call|response)/.test(normalized) && normalized.length < 60) return true;
    if (understanding.sermonMovement === 'narrative' && /(distance|tension|setting|turning|restoration|home|return)/.test(normalized) && normalized.length < 60) return true;
    if (understanding.sermonMovement === 'teaching' && /(truth|study|explain|clarity|lesson|doctrine)/.test(normalized) && normalized.length < 60) return true;
    return false;
  }

  private asText(value: unknown): string {
    return cleanText(value);
  }
}
