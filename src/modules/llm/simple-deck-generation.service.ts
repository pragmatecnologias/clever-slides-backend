import { Injectable, Logger } from '@nestjs/common';
import { Sermon } from '../../entities/sermon.entity';
import { BrandTheme } from '../../entities/brand-theme.entity';
import { SlideType } from '../../entities/slide-types';
import { SlideTemplate } from '../../entities/slide-template.entity';

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

    // Title Slide
    updateProgress(10, 'Creating title slide...');
    slides.push(this.generateTitleSlide(sermon, resolveTemplateId));

    // Scripture Slide
    if (sermon.mainScriptureRef) {
      updateProgress(10, 'Adding scripture reference...');
      slides.push(this.generateScriptureSlide(sermon, resolveTemplateId));
    }

    // Introduction from outline
    const introductionText = this.extractIntroductionText(sermon);
    if (introductionText) {
      updateProgress(10, 'Adding introduction...');
      slides.push(this.generateIntroductionSlide(sermon, introductionText, resolveTemplateId));
    }

    // Main Points with rich content from outline pointNodes + study assets
    const pointRecords = this.buildPointRecords(sermon);
    const pointsProgress = 40 / Math.max(pointRecords.length, 1);
    for (let i = 0; i < pointRecords.length; i++) {
      updateProgress(pointsProgress, `Creating point ${i + 1}...`);
      const point = pointRecords[i];
      slides.push(this.generatePointSlide(sermon, point, i, resolveTemplateId));

      if (this.shouldAddSupportSlide(point, i, pointRecords.length, intensity)) {
        slides.push(this.generatePointSupportSlide(point, i, resolveTemplateId));
      }

      if (this.shouldAddPointApplicationSlide(point, intensity)) {
        slides.push(this.generatePointApplicationSlide(point, i, resolveTemplateId));
      }
    }

    // Applications
    const applicationBullets = this.getApplicationBullets(sermon, pointRecords);
    if (applicationBullets.length > 0) {
      updateProgress(10, 'Adding applications...');
      this.chunkBySize(applicationBullets, intensity === 'short' ? 4 : 5).forEach((chunk, index, allChunks) => {
        slides.push(this.generateApplicationSlide(sermon, chunk, index, allChunks.length, resolveTemplateId));
      });
    }

    // Questions for reflection
    const questionBullets = this.getQuestionBullets(sermon, pointRecords);
    if (questionBullets.length > 0) {
      updateProgress(10, 'Adding reflection questions...');
      this.chunkBySize(questionBullets, 4).forEach((chunk, index, allChunks) => {
        slides.push(this.generateQuestionsSlide(sermon, chunk, index, allChunks.length, resolveTemplateId));
      });
    }

    // Closing summary before invitation
    if (pointRecords.length > 0) {
      slides.push(this.generateSummarySlide(sermon, pointRecords, resolveTemplateId));
    }

    // Call to Action
    if (sermon.ctaStyle !== 'none') {
      updateProgress(10, 'Adding call to action...');
      slides.push(this.generateInvitationSlide(sermon, resolveTemplateId));
    }

    updateProgress(0, 'Deck generation complete!');
    return slides;
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
      bullets.push(this.limitText(this.asString(point.summary), maxBulletLen));
    }
    bullets.push(
      ...point.subpoints
        .map((item) => this.limitText(this.asString(item), maxBulletLen))
        .filter((item) => !this.hasEquivalentBullet([point.title, point.summary || ''], item)),
    );
    if (point.supportingVerses.length > 0) {
      const versesText = point.supportingVerses.slice(0, 2).join(', ');
      bullets.push(this.limitText(`${isSpanish ? 'Textos clave' : 'Key texts'}: ${versesText}`, maxBulletLen));
    }
    if (point.applications.length > 0) {
      const appText = this.asString(point.applications[0]);
      bullets.push(this.limitText(`${isSpanish ? 'Aplicación' : 'Application'}: ${appText}`, maxBulletLen));
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
      ...verses.map((verse) => `${isSpanish ? 'Texto clave' : 'Key text'}: ${verse}`),
      ...illustrations.map((item) => `${isSpanish ? 'Ilustración' : 'Illustration'}: ${this.asString(item)}`),
      ...point.mediaSuggestions.slice(0, 1).map((item) => `${isSpanish ? 'Apoyo visual' : 'Visual support'}: ${this.asString(item)}`),
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
      ...point.applications.map((item) => this.asString(item)),
      ...point.questions.slice(0, 2).map((item) => `${isSpanish ? 'Pregunta' : 'Question'}: ${this.asString(item)}`),
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
      .map((point, index) => `${index + 1}) ${this.limitText(point.title, 90)}`);

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
    let clean = text
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
    if (intro) {
      return this.t(
        sermon,
        `Main passage focus: ${this.limitText(intro, 220)}`,
        `Enfoque del pasaje principal: ${this.limitText(intro, 220)}`,
      );
    }

    return this.t(
      sermon,
      'Read this passage with the congregation and emphasize the central message before moving to the outline points.',
      'Lea este pasaje con la congregación y enfatice el mensaje central antes de pasar a los puntos del bosquejo.',
    );
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
