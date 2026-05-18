import { Injectable, Logger } from '@nestjs/common';
import { Sermon } from '../../entities/sermon.entity';
import { BrandTheme } from '../../entities/brand-theme.entity';
import { SlideType } from '../../entities/slide-types';
import { SlideTemplate } from '../../entities/slide-template.entity';
import {
  buildSlideStyleDefaults,
  cleanText,
  formatPresentationSentence,
  normalizeBulletList,
  shortenText,
  splitPassageText,
  splitTextIntoLines,
} from './slide-content-formatting';

interface SlideContent {
  type: SlideType;
  layoutKey: string;
  content: Record<string, any>;
  speakerNotes?: string;
  templateId?: string;
  imagePrompt?: string;
}

interface PointRecord {
  title: string;
  slideTitle?: string;
  summary?: string;
  subpoints: string[];
  supportingVerses: string[];
  applications: string[];
  questions: string[];
  illustrations: string[];
  mediaSuggestions: string[];
}

type DeckIntensity = 'short' | 'standard' | 'long';
type DeckIntentMode =
  | 'sermon_presentation'
  | 'social_summary'
  | 'teaching_study'
  | 'youth_message'
  | 'evangelistic_appeal';

@Injectable()
export class SimpleDeckGenerationService {
  private logger = new Logger(SimpleDeckGenerationService.name);

  /**
   * Generate deck directly from sermon data without LLM calls
   * Uses outline, manuscript, applications, and questions from sermon app
   */
  async generateDeck(
    sermon: Sermon,
    theme: BrandTheme,
    deckSize: string,
    templates: SlideTemplate[] = [],
    deckIntent: string = 'sermon_presentation',
    progressCallback?: (progress: number, message: string) => void,
  ): Promise<SlideContent[]> {
    const slides: SlideContent[] = [];
    let currentProgress = 0;
    const intensity = this.normalizeDeckIntensity(deckSize);

    // Build layoutKey → templateId lookup so every slide gets a templateId
    const layoutToTemplateId = new Map<string, string>();
    for (const t of templates) {
      if (t.layoutKey) layoutToTemplateId.set(t.layoutKey, t.id);
    }
    // Fallback: if no template matches, use first template of same slideType
    const typeToFirstTemplateId = new Map<string, string>();
    for (const t of templates) {
      if (t.slideType && !typeToFirstTemplateId.has(t.slideType)) {
        typeToFirstTemplateId.set(t.slideType, t.id);
      }
    }
    const resolveTemplateId = (layoutKey: string, slideType: SlideType): string | undefined => {
      return layoutToTemplateId.get(layoutKey) ?? typeToFirstTemplateId.get(slideType);
    };

    const updateProgress = (increment: number, message: string) => {
      currentProgress += increment;
      progressCallback?.(currentProgress, message);
    };

    const intent = this.normalizeDeckIntent(deckIntent);
    const generated =
      intent === 'social_summary'
        ? this.generateSocialSummaryDeck(sermon, intensity, resolveTemplateId, updateProgress)
        : this.generateSermonPresentationDeck(sermon, intensity, resolveTemplateId, updateProgress, intent);

    updateProgress(0, 'Deck generation complete!');
    return generated;
  }

  private generateTitleSlide(
    sermon: Sermon,
    resolveTemplateId: (layoutKey: string, slideType: SlideType) => string | undefined,
  ): SlideContent {
    return {
      type: SlideType.TITLE,
      layoutKey: 'title_centered_v1',
      templateId: resolveTemplateId('title_centered_v1', SlideType.TITLE),
      content: {
        title: sermon.title || 'Untitled Sermon',
        subtitle: sermon.seriesTitle || sermon.bigIdea,
      },
      speakerNotes: this.t(
        sermon,
        `Welcome and introduction. ${sermon.bigIdea}`,
        `Bienvenida e introducción. ${sermon.bigIdea}`,
      ),
      imagePrompt: `Cinematic church background for sermon titled "${sermon.title}"`,
    };
  }

  private generateScriptureSlide(
    sermon: Sermon,
    resolveTemplateId: (layoutKey: string, slideType: SlideType) => string | undefined,
  ): SlideContent {
    const scriptureBody = this.buildScriptureBodyText(sermon);
    const scriptureLines = this.toDisplayLines(scriptureBody, 3);
    return {
      type: SlideType.SCRIPTURE,
      layoutKey: 'scripture_centered_v1',
      templateId: resolveTemplateId('scripture_centered_v1', SlideType.SCRIPTURE),
      content: {
        reference: sermon.mainScriptureRef,
        lines: scriptureLines,
        text: scriptureBody,
      },
      speakerNotes: this.t(
        sermon,
        `Read the scripture passage: ${sermon.mainScriptureRef}`,
        `Lea el pasaje bíblico: ${sermon.mainScriptureRef}`,
      ),
      imagePrompt: `Biblical scene representing ${sermon.mainScriptureRef}`,
    };
  }

  private generateBigIdeaSlide(
    sermon: Sermon,
    resolveTemplateId: (layoutKey: string, slideType: SlideType) => string | undefined,
  ): SlideContent {
    const bigIdea = this.limitText(this.asString(sermon.bigIdea || sermon.title), 120);
    return {
      type: SlideType.TRANSITION,
      layoutKey: 'section_header_v1',
      templateId: resolveTemplateId('section_header_v1', SlideType.TRANSITION),
      content: {
        title: this.t(sermon, 'Big Idea', 'Gran idea'),
        subtitle: bigIdea,
      },
      speakerNotes: this.t(
        sermon,
        `State the sermon center clearly: ${bigIdea}`,
        `Enuncia el centro del sermón con claridad: ${bigIdea}`,
      ),
      imagePrompt: `Hopeful church background for sermon big idea: ${bigIdea}`,
    };
  }

  private generateReflectionSlide(
    sermon: Sermon,
    question: string,
    resolveTemplateId: (layoutKey: string, slideType: SlideType) => string | undefined,
  ): SlideContent {
    return {
      type: SlideType.TRANSITION,
      layoutKey: 'section_header_v1',
      templateId: resolveTemplateId('section_header_v1', SlideType.TRANSITION),
      content: {
        title: this.t(sermon, 'Reflection', 'Reflexión'),
        subtitle: this.limitText(question, 120),
      },
      speakerNotes: this.t(
        sermon,
        `Ask the congregation to reflect on: ${question}`,
        `Invita a la iglesia a reflexionar sobre: ${question}`,
      ),
      imagePrompt: 'Quiet reflective church atmosphere',
    };
  }

  private generateClosingSlide(
    sermon: Sermon,
    closingText: string,
    resolveTemplateId: (layoutKey: string, slideType: SlideType) => string | undefined,
  ): SlideContent {
    return {
      type: SlideType.TRANSITION,
      layoutKey: 'section_header_v1',
      templateId: resolveTemplateId('section_header_v1', SlideType.TRANSITION),
      content: {
        title: this.t(sermon, 'Closing', 'Cierre'),
        subtitle: this.limitText(closingText, 120),
      },
      speakerNotes: this.t(
        sermon,
        `End with a pastoral summary: ${closingText}`,
        `Cierra con un resumen pastoral: ${closingText}`,
      ),
      imagePrompt: 'Warm closing church background',
    };
  }

  private generateSocialSummaryDeck(
    sermon: Sermon,
    intensity: DeckIntensity,
    resolveTemplateId: (layoutKey: string, slideType: SlideType) => string | undefined,
    updateProgress: (increment: number, message: string) => void,
  ): SlideContent[] {
    const slides: SlideContent[] = [];
    const pointRecords = this.buildPresentationPointRecords(sermon, 'social_summary').slice(0, 3);
    updateProgress(15, 'Creating social summary title...');
    slides.push(this.decorateSlide(this.generateTitleSlide(sermon, resolveTemplateId), sermon));

    updateProgress(15, 'Creating social summary scripture slide...');
    slides.push(this.decorateSlide(this.generateScriptureSlide(sermon, resolveTemplateId), sermon));

    updateProgress(15, 'Creating social summary hook...');
    slides.push(this.decorateSlide(this.generateBigIdeaSlide(sermon, resolveTemplateId), sermon));

    const socialBullets = this.uniqueClean([
      ...this.getApplicationBullets(sermon, pointRecords),
      ...this.getQuestionBullets(sermon, pointRecords),
    ]).slice(0, intensity === 'short' ? 3 : 4);
    if (socialBullets.length > 0) {
      updateProgress(20, 'Adding social summary response...');
      slides.push(this.decorateSlide(this.generateApplicationSlide(sermon, socialBullets, 0, 1, resolveTemplateId), sermon));
    }

    if (sermon.ctaStyle !== 'none') {
      updateProgress(15, 'Adding social summary invitation...');
      slides.push(this.decorateSlide(this.generateInvitationSlide(sermon, resolveTemplateId), sermon));
    } else {
      slides.push(this.decorateSlide(this.generateClosingSlide(
        sermon,
        this.t(sermon, 'Share this message with someone who needs hope.', 'Comparte este mensaje con alguien que necesita esperanza.'),
        resolveTemplateId,
      ), sermon));
    }

    updateProgress(0, 'Deck generation complete!');
    return slides.slice(0, 5);
  }

  private generateSermonPresentationDeck(
    sermon: Sermon,
    intensity: DeckIntensity,
    resolveTemplateId: (layoutKey: string, slideType: SlideType) => string | undefined,
    updateProgress: (increment: number, message: string) => void,
    intent: DeckIntentMode,
  ): SlideContent[] {
    const slides: SlideContent[] = [];
    const pointRecords = this.buildPresentationPointRecords(sermon, intent).slice(0, 3);
    const sermonTitle = this.buildPresentationDeckTitle(sermon, intent);

    updateProgress(10, 'Creating sermon presentation title...');
    slides.push(this.decorateSlide(this.generateTitleSlide({ ...sermon, title: sermonTitle }, resolveTemplateId), sermon));

    if (sermon.mainScriptureRef) {
      updateProgress(10, 'Adding scripture passage...');
      slides.push(this.decorateSlide(this.generateScriptureSlide(sermon, resolveTemplateId), sermon));
    }

    updateProgress(8, 'Clarifying the big idea...');
    slides.push(this.decorateSlide(this.generateBigIdeaSlide(sermon, resolveTemplateId), sermon));

    const pointsProgress = pointRecords.length > 0 ? 36 / pointRecords.length : 0;
    for (let i = 0; i < pointRecords.length; i++) {
      updateProgress(pointsProgress, `Creating sermon point ${i + 1}...`);
      const point = pointRecords[i];
      slides.push(this.decorateSlide(this.generatePointSlide(sermon, point, i, resolveTemplateId), sermon));

      const shouldIncludeSupport =
        intensity === 'long' ||
        (intensity === 'standard' && i < 2) ||
        point.supportingVerses.length > 0 ||
        point.illustrations.length > 0 ||
        point.mediaSuggestions.length > 0;
      if (shouldIncludeSupport) {
        slides.push(this.decorateSlide(this.generatePointSupportSlide(point, i, resolveTemplateId), sermon));
      }
    }

    const applicationBullets = this.getApplicationBullets(sermon, pointRecords);
    if (applicationBullets.length > 0) {
      updateProgress(10, 'Adding practical application...');
      slides.push(this.decorateSlide(this.generateApplicationSlide(sermon, applicationBullets.slice(0, 4), 0, 1, resolveTemplateId), sermon));
    }

    const questionBullets = this.getQuestionBullets(sermon, pointRecords);
    const reflectionQuestion =
      questionBullets[0] ||
      this.t(
        sermon,
        `Where do you need to trust ${this.asString(sermon.mainScriptureRef || sermon.bigIdea)} today?`,
        `¿En qué necesitas confiar en ${this.asString(sermon.mainScriptureRef || sermon.bigIdea)} hoy?`,
      );
    updateProgress(8, 'Adding reflection slide...');
    slides.push(this.decorateSlide(this.generateReflectionSlide(sermon, reflectionQuestion, resolveTemplateId), sermon));

    if (sermon.ctaStyle !== 'none') {
      updateProgress(12, 'Adding appeal...');
      slides.push(this.decorateSlide(this.generateInvitationSlide(sermon, resolveTemplateId), sermon));
    }

    updateProgress(7, 'Adding closing slide...');
    slides.push(
      this.decorateSlide(
        this.generateClosingSlide(
          sermon,
          this.buildClosingLine(sermon, intent),
          resolveTemplateId,
        ),
        sermon,
      ),
    );

    updateProgress(0, 'Deck generation complete!');
    return slides;
  }

  private generateIntroductionSlide(
    sermon: Sermon,
    intro: string,
    resolveTemplateId: (layoutKey: string, slideType: SlideType) => string | undefined,
  ): SlideContent {
    return {
      type: SlideType.TRANSITION,
      layoutKey: 'section_header_v1',
      templateId: resolveTemplateId('section_header_v1', SlideType.TRANSITION),
      content: {
        title: this.t(sermon, 'Introduction', 'Introducción'),
        subtitle: typeof intro === 'string' ? this.asString(intro) : '',
      },
      speakerNotes: typeof intro === 'string' ? this.asString(intro) : '',
      imagePrompt: `Opening scene for sermon about ${sermon.bigIdea}`,
    };
  }

  private generatePointSlide(
    sermon: Sermon,
    pointRecord: PointRecord,
    index: number,
    resolveTemplateId: (layoutKey: string, slideType: SlideType) => string | undefined,
  ): SlideContent {
    const fullTitle = pointRecord.title || sermon.mainPoints[index] || `Point ${index + 1}`;
    const bullets = this.buildPointBullets(pointRecord);
    const speakerNotes = this.buildPointSpeakerNotes(sermon, pointRecord, index, fullTitle);

    // Use slideTitle from LLM if available, otherwise fall back to extractShortTitle
    const slideTitle = pointRecord.slideTitle || this.extractShortTitle(fullTitle);
    const titleWithNumber = `${index + 1}. ${slideTitle}`;

    // Always include the full point as first bullet if slideTitle differs
    let finalBullets = [...bullets];
    if (slideTitle !== fullTitle) {
      // Add full point description as first bullet only when not already represented.
      const fullTitleBullet = this.limitText(fullTitle, 80);
      if (!this.hasEquivalentBullet(finalBullets, fullTitleBullet)) {
        finalBullets = [fullTitleBullet, ...bullets];
      }
    }
    if (finalBullets.length < 2) {
      finalBullets = this.uniqueClean([
        ...finalBullets,
        ...this.buildFallbackPointBullets(sermon, pointRecord, fullTitle),
      ]).slice(0, 4);
    }
    finalBullets = this.dedupeSemanticBullets(finalBullets).slice(0, 4);

    return {
      type: SlideType.POINT,
      layoutKey: 'point_bullets_v1',
      templateId: resolveTemplateId('point_bullets_v1', SlideType.POINT),
      content: {
        title: titleWithNumber,
        bullets: finalBullets.length > 0 ? finalBullets.slice(0, 4) : [this.limitText(fullTitle, 80)],
      },
      speakerNotes,
      imagePrompt: `Visual representation of: ${fullTitle}`,
    };
  }

  private decorateSlide(slide: SlideContent, sermon: Sermon): SlideContent {
    const content = { ...(slide.content || {}) };

    if (slide.type === SlideType.TITLE) {
      content.title = shortenText(content.title || sermon.title || 'Untitled Sermon', 48);
      content.subtitle = shortenText(content.subtitle || sermon.seriesTitle || sermon.bigIdea || '', 88);
    }

    if (slide.type === SlideType.SCRIPTURE) {
      const ref = shortenText(content.reference || sermon.mainScriptureRef || 'Scripture', 42);
      const text = Array.isArray(content.lines) ? content.lines.join(' ') : cleanText(content.lines || content.text || '');
      const lines = splitPassageText(text || sermon.outline?.structure?.scriptureText || sermon.bigIdea || ref, 3);
      content.reference = ref;
      content.lines = lines.length ? lines : splitTextIntoLines(text || ref, 3, 42);
    }

    if (slide.type === SlideType.POINT) {
      content.title = shortenText(content.title || sermon.bigIdea || 'Point', 52);
      const bullets = Array.isArray(content.bullets) ? content.bullets : [];
      content.bullets = normalizeBulletList(bullets, { maxBullets: 4, maxChars: 68 });
      if (!content.bullets.length && content.title) {
        content.bullets = [shortenText(content.title, 68)];
      }
    }

    if (slide.type === SlideType.APPLICATION) {
      content.title = shortenText(content.title || 'Application', 40);
      const bullets = Array.isArray(content.bullets) ? content.bullets : [];
      content.bullets = normalizeBulletList(bullets, { maxBullets: 3, maxChars: 56 });
    }

    if (slide.type === SlideType.INVITATION) {
      content.title = shortenText(content.title || 'Respond', 42);
      content.message = shortenText(content.message || sermon.ctaStyle || 'Respond in faith.', 140);
    }

    if (slide.type === SlideType.SUPPORT) {
      if (content.title) content.title = shortenText(content.title, 46);
      if (Array.isArray(content.left)) content.left = normalizeBulletList(content.left, { maxBullets: 4, maxChars: 64 });
      if (Array.isArray(content.right)) content.right = normalizeBulletList(content.right, { maxBullets: 4, maxChars: 64 });
    }

    if (slide.type === SlideType.TRANSITION || slide.type === SlideType.ANNOUNCEMENT || slide.type === SlideType.PRAYER) {
      if (content.title) content.title = shortenText(content.title, 44);
      if (content.subtitle) content.subtitle = shortenText(content.subtitle, 72);
      if (content.body) content.body = shortenText(content.body, 160);
      if (content.caption) content.caption = shortenText(content.caption, 120);
      if (Array.isArray(content.lines)) content.lines = splitTextIntoLines(content.lines.join(' '), 3, 46);
    }

    content.__styles = {
      ...(content.__styles || {}),
      ...buildSlideStyleDefaults(slide.type, content),
    };

    return {
      ...slide,
      content,
      speakerNotes: shortenText(slide.speakerNotes || '', 800),
      imagePrompt: shortenText(slide.imagePrompt || '', 240),
    };
  }

  private buildFallbackPointBullets(sermon: Sermon, point: PointRecord, fullTitle: string): string[] {
    const isSpanish = this.isSpanishWorkspace(sermon);
    const candidates = this.uniqueClean([
      point.summary && !this.hasEquivalentBullet([fullTitle], point.summary)
        ? this.limitText(this.asString(point.summary), 70)
        : '',
      point.subpoints[0] ? this.limitText(this.asString(point.subpoints[0]), 70) : '',
      this.asString(sermon.bigIdea)
        ? this.limitText(
            `${isSpanish ? 'Idea central' : 'Big idea'}: ${this.asString(sermon.bigIdea)}`,
            70,
          )
        : '',
      point.supportingVerses[0]
        ? this.limitText(`${isSpanish ? 'Texto clave' : 'Key text'}: ${point.supportingVerses[0]}`, 70)
        : '',
      point.applications[0]
        ? this.limitText(`${isSpanish ? 'Aplicación' : 'Application'}: ${this.asString(point.applications[0])}`, 70)
        : '',
      point.questions[0]
        ? this.limitText(`${isSpanish ? 'Pregunta' : 'Question'}: ${this.asString(point.questions[0])}`, 70)
        : '',
      point.illustrations[0]
        ? this.limitText(`${isSpanish ? 'Ilustración' : 'Illustration'}: ${this.asString(point.illustrations[0])}`, 70)
        : '',
      this.limitText(
        isSpanish
          ? `Responder con fe a la verdad de ${sermon.mainScriptureRef || 'este pasaje'}`
          : `Respond in faith to the truth of ${sermon.mainScriptureRef || 'this passage'}`,
        70,
      ),
    ]);

    return this.dedupeSemanticBullets(candidates).slice(0, 3);
  }

  private shortenTitle(text: string, maxLength: number): string {
    const clean = this.asString(text);
    if (clean.length <= maxLength) return clean;

    // Try to find a natural break point (colon, dash, comma)
    const breakChars = [':', '–', '-', ','];
    for (const char of breakChars) {
      const idx = clean.indexOf(char);
      if (idx > 0 && idx <= maxLength) {
        return clean.slice(0, idx).trim();
      }
    }

    // Otherwise truncate at word boundary
    const truncated = clean.slice(0, maxLength);
    const lastSpace = truncated.lastIndexOf(' ');
    if (lastSpace > maxLength * 0.5) {
      return truncated.slice(0, lastSpace).trim();
    }

    return truncated.trim();
  }

  // Extract a short, punchy title from a longer point description
  private extractShortTitle(fullPoint: string): string {
    const clean = this.asString(fullPoint)
      .replace(/^[\d\.\-\)\s]+/, '')
      .replace(/[,:;]+$/g, '')
      .trim();
    if (!clean) return 'Point';
    if (clean.length <= 25) return clean;

    const lowered = clean.toLowerCase();
    const isSpanish = this.isLikelySpanish(clean);

    const phraseRules: Array<{ test: RegExp; value: string }> = isSpanish
      ? [
          { test: /muerte espiritual/, value: 'Muerte espiritual' },
          { test: /separaci[oó]n del padre/, value: 'Lejos del Padre' },
          { test: /antes de cristo|sin cristo/, value: 'Sin Cristo' },
          { test: /gracia divina|gracia de dios|gracia de cristo/, value: 'Gracia divina' },
          { test: /nueva vida|vida nueva/, value: 'Nueva vida' },
          { test: /santidad.*testig|testig.*santidad/, value: 'Santidad y testimonio' },
          { test: /vivir con santidad/, value: 'Vida en santidad' },
          { test: /testigos? de la gracia|testimonio/, value: 'Testigos de gracia' },
          { test: /obedien/, value: 'Obediencia viva' },
          { test: /esperanza/, value: 'Esperanza viva' },
          { test: /restauraci[oó]n|transformaci[oó]n/, value: 'Vida transformada' },
        ]
      : [
          { test: /spiritual death/, value: 'Spiritual Death' },
          { test: /separated from the father|far from god/, value: 'Far From God' },
          { test: /before christ|without christ/, value: 'Without Christ' },
          { test: /divine grace|grace of god|grace of christ/, value: 'Divine Grace' },
          { test: /new life/, value: 'New Life' },
          { test: /holiness.*witness|witness.*holiness/, value: 'Holiness and Witness' },
          { test: /live in holiness/, value: 'Life in Holiness' },
          { test: /witness/, value: 'Faithful Witness' },
          { test: /obedien/, value: 'Living Obedience' },
          { test: /hope/, value: 'Living Hope' },
          { test: /restoration|transformation/, value: 'Transformed Life' },
        ];

    const matched = phraseRules.find((rule) => rule.test.test(lowered));
    if (matched) {
      return matched.value;
    }

    const compact = clean
      .replace(/\b(?:esta|este|estos|estas|that|this)\b/gi, '')
      .replace(/\b(?:transformaci[oó]n|llama a|nos llama a|we are called to|called to)\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();

    const phraseMatches = compact.match(
      isSpanish
        ? /\b([A-Za-zÁÉÍÓÚÑáéíóúñ]+(?:\s+(?:de|del|y)\s+[A-Za-zÁÉÍÓÚÑáéíóúñ]+){0,2})\b/g
        : /\b([A-Za-z]+(?:\s+(?:of|and)\s+[A-Za-z]+){0,2})\b/g,
    ) || [];

    const stopwords = new Set(
      (isSpanish
        ? ['la', 'el', 'los', 'las', 'un', 'una', 'unos', 'unas', 'de', 'del', 'en', 'a', 'y', 'o', 'que', 'se', 'nos', 'como', 'para', 'con', 'sin', 'por', 'esta', 'este', 'estas', 'estos', 'vivir', 'sirve', 'servir', 'llama']
        : ['the', 'a', 'an', 'of', 'in', 'to', 'and', 'or', 'that', 'we', 'are', 'for', 'with', 'without', 'this', 'these', 'those', 'called', 'live', 'living', 'serve']) as string[],
    );

    const candidate = phraseMatches
      .map((item) => item.trim())
      .find((item) => {
        const words = item.split(/\s+/).filter(Boolean);
        const contentWords = words.filter((word) => !stopwords.has(word.toLowerCase()));
        return contentWords.length >= 2 && item.length <= 28;
      });

    if (candidate) {
      return candidate.replace(/[,:;]+$/g, '').trim();
    }

    return this.shortenTitle(clean, 25).replace(/[,:;]+$/g, '').trim();
  }

  private generateApplicationSlide(
    sermon: Sermon,
    bullets: string[],
    chunkIndex = 0,
    totalChunks = 1,
    resolveTemplateId: (layoutKey: string, slideType: SlideType) => string | undefined,
  ): SlideContent {
    const base = this.t(sermon, 'Application', 'Aplicación');
    const title = totalChunks > 1 ? `${base} (${chunkIndex + 1}/${totalChunks})` : base;
    return {
      type: SlideType.APPLICATION,
      layoutKey: 'application_bullets_v1',
      templateId: resolveTemplateId('application_bullets_v1', SlideType.APPLICATION),
      content: {
        title,
        bullets: bullets.slice(0, 5),
      },
      speakerNotes: this.t(
        sermon,
        `Practical applications: ${bullets.join('. ')}`,
        `Aplicaciones prácticas: ${bullets.join('. ')}`,
      ),
      imagePrompt: 'People applying biblical truth in daily life',
    };
  }

  private generateQuestionsSlide(
    sermon: Sermon,
    bullets: string[],
    chunkIndex = 0,
    totalChunks = 1,
    resolveTemplateId: (layoutKey: string, slideType: SlideType) => string | undefined,
  ): SlideContent {
    const base = this.t(sermon, 'Reflection Questions', 'Preguntas de reflexión');
    const title = totalChunks > 1 ? `${base} (${chunkIndex + 1}/${totalChunks})` : base;
    return {
      type: SlideType.APPLICATION,
      layoutKey: 'application_bullets_v1',
      templateId: resolveTemplateId('application_bullets_v1', SlideType.APPLICATION),
      content: {
        title,
        bullets: bullets.slice(0, 4),
      },
      speakerNotes: this.t(
        sermon,
        'Discussion questions for small groups or personal reflection',
        'Preguntas para grupos pequeños o reflexión personal',
      ),
      imagePrompt: 'People in thoughtful discussion',
    };
  }

  private generateInvitationSlide(
    sermon: Sermon,
    resolveTemplateId: (layoutKey: string, slideType: SlideType) => string | undefined,
  ): SlideContent {
    const isEs = this.isSpanishWorkspace(sermon);
    const ctaTitles = isEs
      ? {
          salvation: 'Acepta a Cristo hoy',
          prayer: 'Oremos juntos',
          discipleship: 'Da el siguiente paso',
          invitation: 'Responde al llamado de Dios',
          none: '',
        }
      : {
          salvation: 'Accept Jesus Christ as your Lord and Savior',
          prayer: 'Let us pray together',
          discipleship: 'Take the next step in your faith journey',
          invitation: "Respond to God's call today",
          none: '',
        };

    const ctaMessageBody = isEs
      ? {
          salvation: 'Hoy es el momento para entregar tu vida a Cristo.',
          prayer: 'Presentemos nuestras cargas y decisiones delante de Dios.',
          discipleship: 'Comprométete a obedecer a Jesús en esta semana.',
          invitation: 'Responde con fe a lo que Dios te ha hablado hoy.',
          none: '',
        }
      : {
          salvation: 'Today is the day to surrender your life to Christ.',
          prayer: 'Bring your burdens and decisions before God in prayer.',
          discipleship: 'Commit to follow Jesus with concrete obedience this week.',
          invitation: 'Respond in faith to what God has spoken today.',
          none: '',
        };

    return {
      type: SlideType.INVITATION,
      layoutKey: 'invitation_centered_v1',
      templateId: resolveTemplateId('invitation_centered_v1', SlideType.INVITATION),
      content: {
        title: ctaTitles[sermon.ctaStyle] || this.t(sermon, "Respond to God's Call", 'Responde al llamado de Dios'),
        message: ctaMessageBody[sermon.ctaStyle] || this.t(sermon, 'Respond to what God is saying.', 'Responde a lo que Dios está diciendo.'),
      },
      speakerNotes: this.t(
        sermon,
        `Call to action: ${sermon.ctaStyle}. Invite people to respond.`,
        `Llamado final: ${sermon.ctaStyle}. Invita a la iglesia a responder.`,
      ),
      imagePrompt: 'Invitation to respond, people raising hands in worship',
    };
  }

  /**
   * Generate music prompt based on sermon content
   */
  generateMusicPrompt(sermon: Sermon): string {
    const toneDescriptions = {
      hopeful: 'uplifting and inspiring',
      urgent: 'powerful and compelling',
      reflective: 'contemplative and peaceful',
      challenging: 'bold and motivating',
      encouraging: 'warm and comforting',
    };

    const toneDesc = toneDescriptions[sermon.tone] || 'worshipful';
    
    return `${toneDesc} worship background music for a sermon about ${sermon.bigIdea}. Genre: contemporary worship with piano and strings. Mood: ${sermon.tone}.`;
  }

  private buildPointRecords(sermon: Sermon): PointRecord[] {
    const outlineStructure = sermon.outline?.structure || {};
    const pointNodes = Array.isArray(outlineStructure.pointNodes) ? outlineStructure.pointNodes : [];
    const legacyPoints = Array.isArray(outlineStructure.points) ? outlineStructure.points : [];
    const pointsSource = legacyPoints.length ? legacyPoints : pointNodes;

    // Debug: log slideTitle presence
    this.logger.log(`Building point records from ${pointNodes.length} pointNodes`);
    pointNodes.forEach((node: any, i: number) => {
      this.logger.log(`Point ${i}: title="${node?.title?.substring(0, 40)}", slideTitle="${node?.slideTitle || 'MISSING'}"`);
    });

    const records = pointsSource.map((rawPoint: any, index: number) => {
      const alignedNode = pointNodes[index];
      const mergedPoint =
        alignedNode && typeof alignedNode === 'object'
          ? {
              ...alignedNode,
              title:
                (typeof rawPoint === 'string' ? rawPoint : (rawPoint?.title || rawPoint?.content || rawPoint?.name)) ||
                alignedNode?.title,
            }
          : rawPoint;
      return this.normalizePointRecord(mergedPoint, index, sermon.mainPoints?.[index]);
    });

    if (records.length > 0) return records;

    return (Array.isArray(sermon.mainPoints) ? sermon.mainPoints : [])
      .filter(Boolean)
      .map((point, index) =>
        this.normalizePointRecord({ title: point }, index, point),
      );
  }

  private buildPresentationPointRecords(sermon: Sermon, intent: DeckIntentMode): PointRecord[] {
    const records = this.buildPointRecords(sermon);
    const normalized = records.slice(0, 3);
    while (normalized.length < 3) {
      normalized.push(this.buildSyntheticPresentationPoint(sermon, normalized.length, intent));
    }

    return normalized.map((record, index) => {
      if (record.supportingVerses.length > 0 || record.applications.length > 0 || record.questions.length > 0) {
        return record;
      }
      const fallback = this.buildSyntheticPresentationPoint(sermon, index, intent);
      return {
        ...record,
        summary: record.summary || fallback.summary,
        subpoints: record.subpoints.length ? record.subpoints : fallback.subpoints,
        supportingVerses: record.supportingVerses.length ? record.supportingVerses : fallback.supportingVerses,
        applications: record.applications.length ? record.applications : fallback.applications,
        questions: record.questions.length ? record.questions : fallback.questions,
        illustrations: record.illustrations.length ? record.illustrations : fallback.illustrations,
        mediaSuggestions: record.mediaSuggestions.length ? record.mediaSuggestions : fallback.mediaSuggestions,
      };
    });
  }

  private buildSyntheticPresentationPoint(sermon: Sermon, index: number, intent: DeckIntentMode): PointRecord {
    const ref = this.asString(sermon.mainScriptureRef);
    const title = this.buildSyntheticPointTitle(ref, intent, index, sermon);
    const summary = this.buildSyntheticPointSummary(ref, intent, index, sermon);
    const supportingVerses = ref ? [ref] : [];
    const applications = [this.buildSyntheticPointApplication(ref, intent, index, sermon)];
    const questions = [this.buildSyntheticPointQuestion(ref, intent, index, sermon)];
    const illustrations = [this.buildSyntheticPointIllustration(ref, intent, index, sermon)];
    const mediaSuggestions = [this.buildSyntheticPointMedia(ref, intent, index, sermon)];

    return {
      title,
      slideTitle: this.extractShortTitle(title),
      summary,
      subpoints: this.buildSyntheticPointBullets(ref, intent, index, sermon),
      supportingVerses,
      applications,
      questions,
      illustrations,
      mediaSuggestions,
    };
  }

  private buildSyntheticPointTitle(
    ref: string,
    intent: DeckIntentMode,
    index: number,
    sermon: Sermon,
  ): string {
    const source = `${ref} ${this.asString(sermon.title)} ${this.asString(sermon.bigIdea)} ${this.asString(sermon.notes)}`.toLowerCase();
    if (/john\s*3:16|juan\s*3:16/.test(source)) {
      return [
        'God loved first',
        'God gave His Son',
        'Faith receives life',
      ][index] || `Point ${index + 1}`;
    }
    if (/revelation\s*14:6-12|apocalipsis\s*14:6-12|three angels|tres a[nñ]geles|everlasting gospel|evangelio eterno/.test(source)) {
      return [
        'The everlasting gospel',
        'Worship the Creator',
        'Faithfulness follows Jesus',
      ][index] || `Point ${index + 1}`;
    }
    if (/daniel\s*7|daniel\s*8|revelation\s*12|revelation\s*18|matthew\s*24|exodus\s*20/.test(source)) {
      return [
        'Stay text-bound',
        'Keep Christ central',
        'Call for faithful response',
      ][index] || `Point ${index + 1}`;
    }

    if (intent === 'social_summary') {
      return [
        this.asString(sermon.bigIdea || sermon.title || 'The message'),
        this.asString(sermon.mainScriptureRef || 'Scripture'),
        'Respond in faith',
      ][index] || `Point ${index + 1}`;
    }

    return [
      this.extractShortTitle(this.asString(sermon.bigIdea || sermon.title || 'God speaks')),
      'What God gives',
      'How we respond',
    ][index] || `Point ${index + 1}`;
  }

  private buildSyntheticPointSummary(
    ref: string,
    intent: DeckIntentMode,
    index: number,
    sermon: Sermon,
  ): string {
    const source = `${ref} ${this.asString(sermon.title)} ${this.asString(sermon.bigIdea)} ${this.asString(sermon.notes)}`.toLowerCase();
    if (/john\s*3:16|juan\s*3:16/.test(source)) {
      return [
        'God takes the first step in love.',
        'The gift reveals the Father’s heart.',
        'Belief is trust that receives life.',
      ][index] || this.asString(sermon.bigIdea);
    }
    if (/revelation\s*14:6-12|apocalipsis\s*14:6-12|three angels|tres a[nñ]geles|everlasting gospel|evangelio eterno/.test(source)) {
      return [
        'The gospel is still the starting point.',
        'True worship answers the Creator’s call.',
        'Faithfulness belongs with faith in Jesus.',
      ][index] || this.asString(sermon.bigIdea);
    }
    if (/daniel\s*7|daniel\s*8|revelation\s*12|revelation\s*18|matthew\s*24|exodus\s*20/.test(source)) {
      return [
        'Keep every claim text-bound and Christ-centered.',
        'Show the prophetic pattern without fear.',
        'Invite faithful response, not speculation.',
      ][index] || this.asString(sermon.bigIdea);
    }

    if (intent === 'social_summary') {
      return [
        this.asString(sermon.bigIdea || sermon.title || 'A clear message'),
        this.asString(ref || sermon.mainScriptureRef || 'A key passage'),
        'A warm invitation to respond.',
      ][index] || this.asString(sermon.bigIdea || sermon.title);
    }

    return [
      this.asString(sermon.bigIdea || sermon.title || 'God speaks'),
      this.asString(ref || 'The passage'),
      'A practical response to God’s word.',
    ][index] || this.asString(sermon.bigIdea || sermon.title);
  }

  private buildSyntheticPointBullets(
    ref: string,
    intent: DeckIntentMode,
    index: number,
    sermon: Sermon,
  ): string[] {
    const source = `${ref} ${this.asString(sermon.title)} ${this.asString(sermon.bigIdea)} ${this.asString(sermon.notes)}`.toLowerCase();
    if (/john\s*3:16|juan\s*3:16/.test(source)) {
      return [
        ['God loved before we responded.', 'Grace begins with His initiative.'],
        ['The Son was given for us.', 'The gift reveals the Father’s heart.'],
        ['Faith receives what grace offers.', 'Trust is the door to eternal life.'],
      ][index] || ['Receive the gift of life.'];
    }
    if (/revelation\s*14:6-12|apocalipsis\s*14:6-12|three angels|tres a[nñ]geles|everlasting gospel|evangelio eterno/.test(source)) {
      return [
        ['The everlasting gospel still leads.', 'Grace comes before judgment.'],
        ['True worship belongs to the Creator.', 'Loyalty is a faith response.'],
        ['Faithful people follow Jesus.', 'Commandments and faith belong together.'],
      ][index] || ['Respond with worship and trust.'];
    }
    if (/daniel\s*7|daniel\s*8|revelation\s*12|revelation\s*18|matthew\s*24|exodus\s*20/.test(source)) {
      return [
        ['Stay close to the text.', 'Do not force speculative claims.'],
        ['Keep Christ at the center.', 'Let the passage point to hope.'],
        ['Call for faithful response.', 'Hope should shape the appeal.'],
      ][index] || ['Keep the message text-bound.'];
    }

    if (intent === 'social_summary') {
      return [
        ['One clear takeaway for today.'],
        ['A passage worth sharing.'],
        ['Invite someone to listen.'],
      ][index] || ['Use this as a teaser.'];
    }

    return [
      ['Let the passage shape the message.', 'Keep the main idea simple.'],
      ['Point the congregation to Christ.', 'Show how grace works.'],
      ['End with a clear response.', 'Invite trust, not pressure.'],
    ][index] || ['Keep it simple and clear.'];
  }

  private buildSyntheticPointApplication(
    ref: string,
    intent: DeckIntentMode,
    index: number,
    sermon: Sermon,
  ): string {
    const source = `${ref} ${this.asString(sermon.title)} ${this.asString(sermon.bigIdea)} ${this.asString(sermon.notes)}`.toLowerCase();
    if (/john\s*3:16|juan\s*3:16/.test(source)) {
      return [
        'Receive God’s love personally.',
        'Speak about the Son’s gift clearly.',
        'Trust Christ for eternal life today.',
      ][index] || 'Respond in faith today.';
    }
    if (/revelation\s*14:6-12|apocalipsis\s*14:6-12|three angels|tres a[nñ]geles|everlasting gospel|evangelio eterno/.test(source)) {
      return [
        'Keep the gospel first.',
        'Practice worship that is loyal and hopeful.',
        'Follow Jesus with steady faithfulness.',
      ][index] || 'Respond with faithful worship.';
    }

    if (intent === 'social_summary') {
      return 'Share the invitation with someone this week.';
    }

    return 'Live the message in a concrete way this week.';
  }

  private buildSyntheticPointQuestion(
    ref: string,
    intent: DeckIntentMode,
    index: number,
    sermon: Sermon,
  ): string {
    const source = `${ref} ${this.asString(sermon.title)} ${this.asString(sermon.bigIdea)} ${this.asString(sermon.notes)}`.toLowerCase();
    if (/john\s*3:16|juan\s*3:16/.test(source)) {
      return [
        'Where do I need to trust God’s love first?',
        'How am I receiving the Son’s gift?',
        'Who needs to hear this good news from me?',
      ][index] || 'Where do I need to trust His love?';
    }
    if (/revelation\s*14:6-12|apocalipsis\s*14:6-12|three angels|tres a[nñ]geles|everlasting gospel|evangelio eterno/.test(source)) {
      return [
        'Am I keeping the gospel first?',
        'What competes for my worship?',
        'How will I follow Jesus this week?',
      ][index] || 'What does faithful response look like?';
    }
    if (/daniel\s*7|daniel\s*8|revelation\s*12|revelation\s*18|matthew\s*24|exodus\s*20/.test(source)) {
      return [
        'What must stay text-bound here?',
        'How does this point to Christ?',
        'What faithful response is needed?',
      ][index] || 'What does the passage require from me?';
    }

    if (intent === 'social_summary') {
      return 'Who should I invite to hear this message?';
    }

    return 'Where is God calling for response?';
  }

  private buildSyntheticPointIllustration(
    ref: string,
    intent: DeckIntentMode,
    index: number,
    sermon: Sermon,
  ): string {
    const source = `${ref} ${this.asString(sermon.title)} ${this.asString(sermon.bigIdea)} ${this.asString(sermon.notes)}`.toLowerCase();
    if (/john\s*3:16|juan\s*3:16/.test(source)) {
      return [
        'A parent reaching out first in love.',
        'A costly gift placed into open hands.',
        'A person trusting a promise they can receive.',
      ][index] || 'A hopeful response to grace.';
    }
    if (/revelation\s*14:6-12|apocalipsis\s*14:6-12|three angels|tres a[nñ]geles|everlasting gospel|evangelio eterno/.test(source)) {
      return [
        'A global invitation announced with grace.',
        'A worship service centered on God the Creator.',
        'A believer walking faithfully behind Jesus.',
      ][index] || 'A faithful response to God’s call.';
    }
    if (/daniel\s*7|daniel\s*8|revelation\s*12|revelation\s*18|matthew\s*24|exodus\s*20/.test(source)) {
      return [
        'A map that keeps the traveler on the road.',
        'A compass that points to the true King.',
        'A church choosing hope over fear.',
      ][index] || 'A clear response to the text.';
    }

    return 'A clear picture that helps the church remember the point.';
  }

  private buildSyntheticPointMedia(
    ref: string,
    intent: DeckIntentMode,
    index: number,
    sermon: Sermon,
  ): string {
    const source = `${ref} ${this.asString(sermon.title)} ${this.asString(sermon.bigIdea)} ${this.asString(sermon.notes)}`.toLowerCase();
    if (/john\s*3:16|juan\s*3:16/.test(source)) {
      return [
        'Warm sunrise background with open hands.',
        'Gift and light imagery with ample negative space.',
        'Open path toward light and hope.',
      ][index] || 'Peaceful church-themed background.';
    }
    if (/revelation\s*14:6-12|apocalipsis\s*14:6-12|three angels|tres a[nñ]geles|everlasting gospel|evangelio eterno/.test(source)) {
      return [
        'Hopeful horizon with a gentle gospel light.',
        'Creator-focused imagery with calm reverence.',
        'Faithful path imagery, not fear-based symbolism.',
      ][index] || 'Reverent, hope-filled prophetic background.';
    }
    if (intent === 'social_summary') {
      return 'Clean social promo background with strong contrast.';
    }
    return 'Church-ready visual support with simple symbolism.';
  }

  private buildPresentationDeckTitle(sermon: Sermon, intent: DeckIntentMode): string {
    const title = this.asString(sermon.title || sermon.bigIdea || 'Untitled Sermon');
    const source = `${title} ${this.asString(sermon.mainScriptureRef)} ${this.asString(sermon.bigIdea)}`.toLowerCase();
    if (/john\s*3:16|juan\s*3:16/.test(source)) {
      return 'The Love That Gives';
    }
    if (/revelation\s*14:6-12|apocalipsis\s*14:6-12|three angels|tres a[nñ]geles|everlasting gospel|evangelio eterno/.test(source)) {
      return 'The Everlasting Gospel Still Calls';
    }
    if (intent === 'evangelistic_appeal') {
      return 'A Clear Call to Respond';
    }
    if (intent === 'teaching_study') {
      return 'Study the Word Together';
    }
    if (intent === 'youth_message') {
      return 'Follow Jesus with Confidence';
    }
    return title;
  }

  private buildClosingLine(sermon: Sermon, intent: DeckIntentMode): string {
    const source = `${this.asString(sermon.mainScriptureRef)} ${this.asString(sermon.title)} ${this.asString(sermon.bigIdea)}`.toLowerCase();
    if (/john\s*3:16|juan\s*3:16/.test(source)) {
      return 'God’s love still gives eternal life.';
    }
    if (/revelation\s*14:6-12|apocalipsis\s*14:6-12|three angels|tres a[nñ]geles|everlasting gospel|evangelio eterno/.test(source)) {
      return 'The Lamb leads His people faithfully.';
    }
    if (intent === 'social_summary') {
      return 'Share the message and invite someone in.';
    }
    return 'Close with hope, prayer, and trust in God’s word.';
  }

  private normalizeDeckIntent(value: string): DeckIntentMode {
    const normalized = String(value || '').toLowerCase().trim();
    if (
      normalized === 'social_summary' ||
      normalized === 'teaching_study' ||
      normalized === 'youth_message' ||
      normalized === 'evangelistic_appeal'
    ) {
      return normalized;
    }
    return 'sermon_presentation';
  }

  private normalizePointRecord(point: any, index: number, fallbackTitle?: string): PointRecord {
    const title =
      this.asString(point?.title) ||
      this.asString(point?.content) ||
      this.asString(point?.name) ||
      this.asString(fallbackTitle) ||
      `Point ${index + 1}`;

    return {
      title,
      slideTitle: this.asString(point?.slideTitle),
      summary: this.asString(point?.summary) || this.asString(point?.preachingInsight),
      subpoints: this.toStringArray(point?.subpoints || point?.bullets),
      supportingVerses: this.toStringArray(point?.supportingVerses || point?.crossReferences),
      applications: this.toStringArray(point?.applications),
      questions: this.toStringArray(point?.discussionQuestions || point?.questions),
      illustrations: this.toStringArray(point?.illustrationIdeas || point?.illustrations),
      mediaSuggestions: this.toStringArray(point?.mediaSuggestions),
    };
  }

  private buildPointBullets(point: PointRecord): string[] {
    const isSpanish = this.isLikelySpanish(
      [point.title, point.summary, ...point.subpoints, ...point.applications].filter(Boolean).join(' ')
    );
    const bullets: string[] = [];
    
    // Limit each bullet to 70 chars for readability
    const maxBulletLen = 70;
    
    if (point.summary && !this.hasEquivalentBullet([point.title], point.summary)) {
      bullets.push(formatPresentationSentence(this.limitText(this.asString(point.summary), maxBulletLen), maxBulletLen));
    }
    bullets.push(
      ...point.subpoints
        .map((item) => formatPresentationSentence(this.limitText(this.asString(item), maxBulletLen), maxBulletLen))
        .filter((item) => !this.hasEquivalentBullet([point.title, point.summary || ''], item)),
    );
    if (point.supportingVerses.length > 0) {
      const versesText = point.supportingVerses.slice(0, 2).join(', ');
      bullets.push(formatPresentationSentence(`${isSpanish ? 'Textos clave' : 'Key texts'}: ${versesText}`, maxBulletLen));
    }
    if (point.applications.length > 0) {
      const appText = this.asString(point.applications[0]);
      bullets.push(formatPresentationSentence(`${isSpanish ? 'Aplicación' : 'Application'}: ${appText}`, maxBulletLen));
    }

    return this.dedupeSemanticBullets(this.uniqueClean(bullets)).slice(0, 4);
  }

  private buildPointSpeakerNotes(
    sermon: Sermon,
    point: PointRecord,
    index: number,
    pointTitle: string,
  ): string {
    const isEs = this.isSpanishWorkspace(sermon);
    const noteParts: string[] = [];
    if (point.summary) noteParts.push(`${isEs ? 'Enfoque' : 'Focus'}: ${point.summary}`);
    if (point.subpoints.length > 0) noteParts.push(`${isEs ? 'Subpuntos' : 'Subpoints'}: ${point.subpoints.slice(0, 4).join(' | ')}`);
    if (point.supportingVerses.length > 0) noteParts.push(`${isEs ? 'Apoyo bíblico' : 'Biblical support'}: ${point.supportingVerses.slice(0, 4).join(', ')}`);
    if (point.applications.length > 0) noteParts.push(`${isEs ? 'Aplicación pastoral' : 'Pastoral application'}: ${point.applications.slice(0, 2).join(' | ')}`);
    if (point.questions.length > 0) noteParts.push(`${isEs ? 'Pregunta para la iglesia' : 'Question for the church'}: ${point.questions[0]}`);
    if (point.illustrations.length > 0) noteParts.push(`${isEs ? 'Ilustración sugerida' : 'Suggested illustration'}: ${point.illustrations[0]}`);

    const manuscriptSection = this.extractManuscriptSection(sermon, index);
    if (manuscriptSection) {
      noteParts.push(`${isEs ? 'Guion' : 'Manuscript'}: ${this.asString(manuscriptSection)}`);
    }

    if (noteParts.length === 0) {
      noteParts.push(this.t(sermon, `Expand on: ${pointTitle}`, `Desarrollar: ${pointTitle}`));
    }

    return noteParts.join('\n\n');
  }

  private generatePointSupportSlide(
    point: PointRecord,
    index: number,
    resolveTemplateId: (layoutKey: string, slideType: SlideType) => string | undefined,
  ): SlideContent {
    const isSpanish = this.isLikelySpanish(
      [point.title, point.summary, ...point.subpoints, ...point.applications].filter(Boolean).join(' ')
    );
    const verses = point.supportingVerses.slice(0, 4);
    const illustrations = point.illustrations.slice(0, 2);
    const bullets = this.uniqueClean([
      ...verses.map((verse) => formatPresentationSentence(`${isSpanish ? 'Texto clave' : 'Key text'}: ${verse}`, 72)),
      ...illustrations.map((item) => formatPresentationSentence(`${isSpanish ? 'Ilustración' : 'Illustration'}: ${this.asString(item)}`, 72)),
      ...point.mediaSuggestions.slice(0, 1).map((item) => formatPresentationSentence(`${isSpanish ? 'Apoyo visual' : 'Visual support'}: ${this.asString(item)}`, 72)),
    ]).slice(0, 5);

    return {
      type: SlideType.SUPPORT,
      layoutKey: 'point_bullets_v1',
      templateId: resolveTemplateId('point_bullets_v1', SlideType.SUPPORT),
      content: {
        title: `${index + 1}. ${isSpanish ? 'Soporte bíblico' : 'Biblical support'}`,
        bullets: bullets.length > 0 ? bullets : [isSpanish ? 'Conectar el punto con el texto bíblico principal' : 'Connect this point to the primary biblical text'],
      },
      speakerNotes: isSpanish
        ? `Use esta diapositiva para reforzar el fundamento bíblico y la ilustración del punto ${index + 1}.`
        : `Use this slide to reinforce biblical grounding and illustration for point ${index + 1}.`,
      imagePrompt: `Biblical support scene for sermon point: ${point.title}`,
    };
  }

  private generatePointApplicationSlide(
    point: PointRecord,
    index: number,
    resolveTemplateId: (layoutKey: string, slideType: SlideType) => string | undefined,
  ): SlideContent {
    const isSpanish = this.isLikelySpanish(
      [point.title, point.summary, ...point.subpoints, ...point.applications].filter(Boolean).join(' ')
    );
    const bullets = this.uniqueClean([
      ...point.applications.map((item) => formatPresentationSentence(this.asString(item), 72)),
      ...point.questions.slice(0, 2).map((item) => formatPresentationSentence(`${isSpanish ? 'Pregunta' : 'Question'}: ${this.asString(item)}`, 72)),
    ]).slice(0, 5);

    return {
      type: SlideType.APPLICATION,
      layoutKey: 'application_bullets_v1',
      templateId: resolveTemplateId('application_bullets_v1', SlideType.APPLICATION),
      content: {
        title: `${index + 1}. ${isSpanish ? 'Respuesta práctica' : 'Practical response'}`,
        bullets: bullets.length > 0 ? bullets : [isSpanish ? `Aplicar "${point.title}" de forma concreta esta semana` : `Apply "${point.title}" in a concrete way this week`],
      },
      speakerNotes: isSpanish
        ? `Guiar una respuesta concreta para el punto ${index + 1}: ${point.title}`
        : `Drive concrete response for point ${index + 1}: ${point.title}`,
      imagePrompt: `Congregation responding in practical faith to: ${point.title}`,
    };
  }

  private generateSummarySlide(
    sermon: Sermon,
    pointRecords: PointRecord[],
    resolveTemplateId: (layoutKey: string, slideType: SlideType) => string | undefined,
  ): SlideContent {
    const bullets = pointRecords
      .slice(0, 5)
      .map((point, index) => formatPresentationSentence(`${index + 1}. ${this.limitText(point.title, 90)}`, 96));

    return {
      type: SlideType.TRANSITION,
      layoutKey: 'application_bullets_v1',
      templateId: resolveTemplateId('application_bullets_v1', SlideType.TRANSITION),
      content: {
        title: this.t(sermon, 'Summary and Response', 'Resumen y Llamado'),
        bullets,
      },
      speakerNotes: this.t(
        sermon,
        `Recap the full flow and tie every point back to the big idea: ${sermon.bigIdea}.`,
        `Recapitula todo el flujo y conecta cada punto con la gran idea: ${sermon.bigIdea}.`,
      ),
      imagePrompt: `Sermon recap moment with hopeful church atmosphere`,
    };
  }

  private getApplicationBullets(sermon: Sermon, pointRecords: PointRecord[]): string[] {
    const outlineApplications = pointRecords.flatMap((point) => point.applications);
    const topLevelApplications = (Array.isArray(sermon.applications) ? sermon.applications : [])
      .map((app: any) => this.asString(app?.content || app?.text || app?.application || app))
      .filter(Boolean);

    return this.uniqueClean([...outlineApplications, ...topLevelApplications]).slice(0, 6);
  }

  private getQuestionBullets(sermon: Sermon, pointRecords: PointRecord[]): string[] {
    const outlineQuestions = pointRecords.flatMap((point) => point.questions);
    const topLevelQuestions = (Array.isArray(sermon.questions) ? sermon.questions : [])
      .map((q: any) => this.asString(q?.question || q?.text || q))
      .filter(Boolean);

    return this.uniqueClean([...outlineQuestions, ...topLevelQuestions]).slice(0, 6);
  }

  private shouldAddSupportSlide(
    point: PointRecord,
    index: number,
    total: number,
    intensity: DeckIntensity,
  ): boolean {
    if (!point.supportingVerses.length && !point.illustrations.length && !point.mediaSuggestions.length) return false;
    if (intensity === 'long') return true;
    if (intensity === 'standard') return index % 2 === 0 || total <= 3;
    return index === 0;
  }

  private shouldAddPointApplicationSlide(point: PointRecord, intensity: DeckIntensity): boolean {
    if (!point.applications.length && !point.questions.length) return false;
    if (intensity === 'long') return true;
    if (intensity === 'standard') return point.applications.length > 0;
    return false;
  }

  private normalizeDeckIntensity(value: string): DeckIntensity {
    const normalized = String(value || '').toLowerCase().trim();
    if (normalized === 'short' || normalized === 'long') return normalized;
    return 'standard';
  }

  private chunkBySize<T>(items: T[], size: number): T[][] {
    if (!Array.isArray(items) || items.length === 0) return [];
    const chunkSize = Math.max(1, size);
    const chunks: T[][] = [];
    for (let i = 0; i < items.length; i += chunkSize) {
      chunks.push(items.slice(i, i + chunkSize));
    }
    return chunks;
  }

  private extractIntroductionText(sermon: Sermon): string {
    const directIntro = this.asString(sermon.outline?.structure?.introduction);
    if (directIntro) return directIntro;

    const firstPointSummary = this.asString(sermon.outline?.structure?.pointNodes?.[0]?.summary);
    if (firstPointSummary) return firstPointSummary;

    const manuscriptText = this.asString(sermon.manuscript?.content?.text || sermon.notes);
    if (manuscriptText) {
      return manuscriptText;
    }

    return '';
  }

  private extractManuscriptSection(sermon: Sermon, index: number): string {
    const section = sermon.manuscript?.sections?.[index];
    const sectionContent =
      this.asString(section?.content?.text) ||
      this.asString(section?.content) ||
      this.asString(section?.body);
    if (sectionContent) return sectionContent;

    return '';
  }

  private toStringArray(value: any): string[] {
    if (!Array.isArray(value)) return [];
    return value
      .map((item) => this.asString(item?.text || item?.content || item?.question || item))
      .filter(Boolean);
  }

  private asString(value: any): string {
    if (typeof value !== 'string') return '';
    // Strip HTML tags and clean up whitespace
    return this.stripHtml(value).replace(/\s+/g, ' ').trim();
  }

  /**
   * Strip HTML tags from text content
   * Handles common HTML elements and data attributes from sermon editor
   */
  private stripHtml(text: string): string {
    if (!text || typeof text !== 'string') return '';
    
    // Remove HTML tags completely
    const clean = text
      // Remove script/style tags and their content
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      // Remove all HTML tags
      .replace(/<[^>]+>/g, ' ')
      // Decode common HTML entities
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/&apos;/gi, "'")
      // Clean up multiple spaces
      .replace(/\s+/g, ' ')
      .trim();
    
    return clean;
  }

  private uniqueClean(lines: string[]): string[] {
    const seen = new Set<string>();
    const output: string[] = [];
    for (const line of lines) {
      const normalized = this.asString(line);
      if (!normalized) continue;
      const key = normalized.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      output.push(normalized);
    }
    return output;
  }

  private hasEquivalentBullet(lines: string[], candidate: string): boolean {
    const candidateKey = this.semanticKey(candidate);
    if (!candidateKey) return false;
    return lines.some((line) => this.semanticKey(line) === candidateKey);
  }

  private dedupeSemanticBullets(lines: string[]): string[] {
    const output: string[] = [];
    const keys: string[] = [];
    for (const line of lines) {
      const normalized = this.asString(line);
      if (!normalized) continue;
      const key = this.semanticKey(normalized);
      if (!key) continue;

      let duplicateIndex = -1;
      for (let i = 0; i < keys.length; i += 1) {
        const existing = keys[i];
        if (existing === key) {
          duplicateIndex = i;
          break;
        }
      }

      if (duplicateIndex >= 0) {
        if (normalized.length > output[duplicateIndex].length) {
          output[duplicateIndex] = normalized;
          keys[duplicateIndex] = key;
        }
        continue;
      }

      output.push(normalized);
      keys.push(key);
    }
    return output;
  }

  private semanticKey(value: string): string {
    return this.asString(value)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/^(textos?\s+clave|key\s+texts?|aplicacion|application|pregunta|question|ilustracion|illustration)\s*:\s*/i, '')
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private limitText(value: string, maxLength: number): string {
    const clean = this.asString(value);
    if (clean.length <= maxLength) return clean;
    return `${clean.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
  }

  private toDisplayLines(text: string, maxLines: number): string[] {
    const clean = this.asString(text);
    if (!clean) return [];

    const sentenceParts = clean
      .split(/(?<=[.!?])\s+/)
      .map((part) => part.trim())
      .filter(Boolean);

    if (sentenceParts.length >= 2) {
      return sentenceParts.slice(0, Math.max(1, maxLines));
    }

    const words = clean.split(/\s+/);
    const lines: string[] = [];
    let current = '';

    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (candidate.length > 85 && current) {
        lines.push(current);
        current = word;
      } else {
        current = candidate;
      }
      if (lines.length >= maxLines) break;
    }

    if (current && lines.length < maxLines) {
      lines.push(current);
    }

    return lines.map((line) => this.asString(line)).slice(0, Math.max(1, maxLines));
  }

  private buildScriptureBodyText(sermon: Sermon): string {
    const directText = this.asString(sermon.outline?.structure?.scriptureText);
    if (directText) return this.limitText(directText, 540);

    const intro = this.extractIntroductionText(sermon);
    const passageFocus = this.buildPassageFocusSentence(sermon);
    if (intro) {
      const introFocus = this.limitText(intro, 220);
      return this.t(
        sermon,
        `Read this passage with the congregation. ${introFocus}`,
        `Lea este pasaje con la congregación. ${introFocus}`,
      );
    }

    return this.t(
      sermon,
      `Read this passage with the congregation. ${passageFocus}`,
      `Lea este pasaje con la congregación. ${passageFocus}`,
    );
  }

  private buildPassageFocusSentence(sermon: Sermon): string {
    const source = `${this.asString(sermon.mainScriptureRef)} ${this.asString(sermon.title)} ${this.asString(sermon.bigIdea)} ${this.asString(sermon.notes)}`.toLowerCase();
    const isSpanish = this.isSpanishWorkspace(sermon);

    if (/john\s*3:16|juan\s*3:16/.test(source)) {
      return isSpanish
        ? 'Resalte que el amor de Dios tomó la iniciativa y ofrece vida eterna.'
        : 'Emphasize that God’s love takes the first step and offers eternal life.';
    }

    if (/revelation\s*14:6-12|apocalipsis\s*14:6-12|three angels|tres a[nñ]geles|everlasting gospel|evangelio eterno/.test(source)) {
      return isSpanish
        ? 'Resalte el evangelio eterno, la adoración al Creador y la fidelidad a Jesús.'
        : 'Emphasize the everlasting gospel, worship of the Creator, and faithfulness to Jesus.';
    }

    if (/daniel\s*7|daniel\s*8|revelation\s*12|revelation\s*18|matthew\s*24|exodus\s*20/.test(source)) {
      return isSpanish
        ? 'Mantenga el texto en su contexto profético y apunte siempre a Cristo.'
        : 'Keep the text in its prophetic context and point always to Christ.';
    }

    return isSpanish
      ? 'Enfatice el mensaje central y la respuesta de fe que este pasaje llama.'
      : 'Emphasize the central message and the faith response this passage calls for.';
  }

  private isSpanishWorkspace(sermon: Sermon): boolean {
    const lang = this.asString(
      sermon?.outline?._workspaceLanguage ||
      sermon?.manuscript?.language ||
      sermon?.outline?.language,
    ).toLowerCase();
    if (lang.startsWith('es')) return true;
    if (lang.startsWith('en')) return false;
    return this.isLikelySpanish(
      [
        sermon?.title,
        sermon?.bigIdea,
        sermon?.mainScriptureRef,
        sermon?.notes,
        sermon?.outline?.structure?.introduction,
      ]
        .map((item) => this.asString(item))
        .join(' '),
    );
  }

  private isLikelySpanish(text: string): boolean {
    const sample = this.asString(text).toLowerCase();
    if (!sample) return false;
    return /[áéíóúñ¿¡]/.test(sample) || /\b(el|la|los|las|de|que|para|con|gracia|cristo|iglesia)\b/.test(sample);
  }

  private t(sermon: Sermon, en: string, es: string): string {
    return this.isSpanishWorkspace(sermon) ? es : en;
  }
}
