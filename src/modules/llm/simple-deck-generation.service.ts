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

    const updateProgress = (increment: number, message: string) => {
      currentProgress += increment;
      progressCallback?.(currentProgress, message);
    };

    // Title Slide
    updateProgress(10, 'Creating title slide...');
    slides.push(this.generateTitleSlide(sermon));

    // Scripture Slide
    if (sermon.mainScriptureRef) {
      updateProgress(10, 'Adding scripture reference...');
      slides.push(this.generateScriptureSlide(sermon));
    }

    // Introduction from outline
    const introductionText = this.extractIntroductionText(sermon);
    if (introductionText) {
      updateProgress(10, 'Adding introduction...');
      slides.push(this.generateIntroductionSlide(sermon, introductionText));
    }

    // Main Points with rich content from outline pointNodes + study assets
    const pointRecords = this.buildPointRecords(sermon);
    const pointsProgress = 40 / Math.max(pointRecords.length, 1);
    for (let i = 0; i < pointRecords.length; i++) {
      updateProgress(pointsProgress, `Creating point ${i + 1}...`);
      const point = pointRecords[i];
      slides.push(this.generatePointSlide(sermon, point, i));

      if (this.shouldAddSupportSlide(point, i, pointRecords.length, intensity)) {
        slides.push(this.generatePointSupportSlide(point, i));
      }

      if (this.shouldAddPointApplicationSlide(point, intensity)) {
        slides.push(this.generatePointApplicationSlide(point, i));
      }
    }

    // Applications
    const applicationBullets = this.getApplicationBullets(sermon, pointRecords);
    if (applicationBullets.length > 0) {
      updateProgress(10, 'Adding applications...');
      this.chunkBySize(applicationBullets, intensity === 'short' ? 4 : 5).forEach((chunk, index, allChunks) => {
        slides.push(this.generateApplicationSlide(sermon, chunk, index, allChunks.length));
      });
    }

    // Questions for reflection
    const questionBullets = this.getQuestionBullets(sermon, pointRecords);
    if (questionBullets.length > 0) {
      updateProgress(10, 'Adding reflection questions...');
      this.chunkBySize(questionBullets, 4).forEach((chunk, index, allChunks) => {
        slides.push(this.generateQuestionsSlide(sermon, chunk, index, allChunks.length));
      });
    }

    // Closing summary before invitation
    if (pointRecords.length > 0) {
      slides.push(this.generateSummarySlide(sermon, pointRecords));
    }

    // Call to Action
    if (sermon.ctaStyle !== 'none') {
      updateProgress(10, 'Adding call to action...');
      slides.push(this.generateInvitationSlide(sermon));
    }

    updateProgress(0, 'Deck generation complete!');
    return slides;
  }

  private generateTitleSlide(sermon: Sermon): SlideContent {
    return {
      type: SlideType.TITLE,
      layoutKey: 'title_centered_v1',
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

  private generateScriptureSlide(sermon: Sermon): SlideContent {
    const scriptureBody = this.buildScriptureBodyText(sermon);
    const scriptureLines = this.toDisplayLines(scriptureBody, 3);
    return {
      type: SlideType.SCRIPTURE,
      layoutKey: 'scripture_centered_v1',
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

  private generateIntroductionSlide(sermon: Sermon, intro: string): SlideContent {
    return {
      type: SlideType.TRANSITION,
      layoutKey: 'section_header_v1',
      content: {
        title: this.t(sermon, 'Introduction', 'Introducción'),
        subtitle: typeof intro === 'string' ? this.asString(intro) : '',
      },
      speakerNotes: typeof intro === 'string' ? intro : JSON.stringify(intro),
      imagePrompt: `Opening scene for sermon about ${sermon.bigIdea}`,
    };
  }

  private generatePointSlide(sermon: Sermon, pointRecord: PointRecord, index: number): SlideContent {
    const point = pointRecord.title || sermon.mainPoints[index] || `Point ${index + 1}`;
    const bullets = this.buildPointBullets(pointRecord);
    const speakerNotes = this.buildPointSpeakerNotes(sermon, pointRecord, index, point);

    return {
      type: SlideType.POINT,
      layoutKey: 'point_bullets_v1',
      content: {
        title: `${index + 1}. ${this.limitText(point, 68)}`,
        bullets: bullets.length > 0 ? bullets : [this.limitText(point, 100)],
      },
      speakerNotes,
      imagePrompt: `Visual representation of: ${point}`,
    };
  }

  private generateApplicationSlide(
    sermon: Sermon,
    bullets: string[],
    chunkIndex = 0,
    totalChunks = 1,
  ): SlideContent {
    const base = this.t(sermon, 'Application', 'Aplicación');
    const title = totalChunks > 1 ? `${base} (${chunkIndex + 1}/${totalChunks})` : base;
    return {
      type: SlideType.APPLICATION,
      layoutKey: 'application_bullets_v1',
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
  ): SlideContent {
    const base = this.t(sermon, 'Reflection Questions', 'Preguntas de reflexión');
    const title = totalChunks > 1 ? `${base} (${chunkIndex + 1}/${totalChunks})` : base;
    return {
      type: SlideType.APPLICATION,
      layoutKey: 'application_bullets_v1',
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

  private generateInvitationSlide(sermon: Sermon): SlideContent {
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
    const pointsSource = pointNodes.length ? pointNodes : legacyPoints;

    const records = pointsSource.map((rawPoint: any, index: number) =>
      this.normalizePointRecord(rawPoint, index, sermon.mainPoints?.[index]),
    );

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
    if (point.summary) bullets.push(this.asString(point.summary));
    bullets.push(...point.subpoints.map((item) => this.asString(item)));
    if (point.supportingVerses.length > 0) {
      bullets.push(`${isSpanish ? 'Textos clave' : 'Key texts'}: ${point.supportingVerses.slice(0, 2).join(', ')}`);
    }
    if (point.applications.length > 0) {
      bullets.push(`${isSpanish ? 'Aplicación' : 'Application'}: ${this.asString(point.applications[0])}`);
    }

    return this.uniqueClean(bullets).slice(0, 5);
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

  private generatePointSupportSlide(point: PointRecord, index: number): SlideContent {
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

  private generatePointApplicationSlide(point: PointRecord, index: number): SlideContent {
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

  private generateSummarySlide(sermon: Sermon, pointRecords: PointRecord[]): SlideContent {
    const bullets = pointRecords
      .slice(0, 5)
      .map((point, index) => `${index + 1}) ${this.limitText(point.title, 90)}`);

    return {
      type: SlideType.TRANSITION,
      layoutKey: 'application_bullets_v1',
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
    return value.replace(/\s+/g, ' ').trim();
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
