import { Injectable, Logger } from '@nestjs/common';
import { Sermon } from '../../entities/sermon.entity';
import { BrandTheme } from '../../entities/brand-theme.entity';
import { SlideType } from '../../entities/slide-types';
import { SlideTemplate } from '../../entities/slide-template.entity';
import { LlmClient } from './llm-client.service';

interface SlideContent {
  type: SlideType;
  layoutKey: string;
  content: Record<string, any>;
  speakerNotes?: string;
  templateId?: string;
  imagePrompt?: string;
}

@Injectable()
export class DeckGenerationService {
  private logger = new Logger(DeckGenerationService.name);

  constructor(private llmClient: LlmClient) {}

  async generateDeck(
    sermon: Sermon,
    theme: BrandTheme,
    deckSize: string,
    templates: SlideTemplate[] = [],
  ): Promise<SlideContent[]> {
    if (templates.length > 0) {
      const slidesFromTemplates: SlideContent[] = [];
      let pointIndex = 0;

      for (const template of templates) {
        const generated = await this.generateFromTemplate(sermon, template, pointIndex);
        if (generated.type === SlideType.POINT) {
          pointIndex += 1;
        }
        slidesFromTemplates.push(generated);
      }

      return slidesFromTemplates;
    }

    const slides: SlideContent[] = [];

    slides.push(await this.generateTitleSlide(sermon));

    if (sermon.mainScriptureRef) {
      slides.push(await this.generateScriptureSlide(sermon));
    }

    for (let i = 0; i < sermon.mainPoints.length; i++) {
      slides.push(await this.generatePointSlide(sermon, i));
    }

    slides.push(await this.generateApplicationSlide(sermon));

    if (sermon.ctaStyle !== 'none') {
      slides.push(await this.generateInvitationSlide(sermon));
    }

    return slides;
  }

  private async generateFromTemplate(
    sermon: Sermon,
    template: SlideTemplate,
    pointIndex: number,
  ): Promise<SlideContent> {
    let slide: SlideContent;

    // Check for specific layout keys that need custom content generation
    switch (template.layoutKey) {
      case 'section_header_v1':
        slide = await this.generateTransitionSlide(sermon, pointIndex, true);
        break;
      case 'transition_title_v1':
        slide = await this.generateTransitionSlide(sermon, pointIndex, false);
        break;
      case 'two_content_v1':
        slide = await this.generateTwoContentSlide(sermon, pointIndex);
        break;
      case 'comparison_v1':
        slide = await this.generateComparisonSlide(sermon, pointIndex);
        break;
      case 'title_only_v1':
        slide = await this.generateTitleOnlySlide(sermon, pointIndex);
        break;
      case 'picture_caption_v1':
        slide = await this.generatePictureCaptionSlide(sermon, pointIndex);
        break;
      case 'blank_v1':
        slide = {
          type: template.slideType,
          layoutKey: template.layoutKey,
          content: {},
          speakerNotes: `Transition slide`,
        };
        break;
      default:
        // Use standard slide type generation
        switch (template.slideType) {
          case SlideType.TITLE:
            slide = await this.generateTitleSlide(sermon);
            break;
          case SlideType.SCRIPTURE:
            slide = await this.generateScriptureSlide(sermon);
            break;
          case SlideType.POINT:
            slide = await this.generatePointSlide(sermon, pointIndex);
            break;
          case SlideType.TRANSITION:
            slide = await this.generateTransitionSlide(sermon, pointIndex, true);
            break;
          case SlideType.APPLICATION:
            slide = await this.generateApplicationSlide(sermon);
            break;
          case SlideType.INVITATION:
            slide = await this.generateInvitationSlide(sermon);
            break;
          default:
            slide = await this.generatePointSlide(sermon, pointIndex);
            break;
        }
    }

    const imagePrompt = template.supportsImage
      ? `A cinematic church-themed background for "${sermon.title}". ${sermon.bigIdea}`
      : undefined;

    return {
      ...slide,
      layoutKey: template.layoutKey || slide.layoutKey,
      templateId: template.id,
      imagePrompt,
    };
  }

  private async generateTitleSlide(sermon: Sermon): Promise<SlideContent> {
    const system = `You are a sermon slide designer and pastoral coach. Generate slide content and detailed speaker notes.
Return ONLY valid JSON with no additional text.`;

    const user = `Create a title slide for:
Title: ${sermon.title}
Series: ${sermon.seriesTitle || 'N/A'}
Big Idea: ${sermon.bigIdea}
Tone: ${sermon.tone}

Return JSON: { "title": "main title", "subtitle": "series or tagline", "speakerNotes": "detailed notes" }
Keep title under 50 characters. Make it punchy and memorable.
Speaker notes should include: warm welcome, series context if applicable, brief hook to engage audience, and transition to main message. Be specific and practical (100-150 words).`;

    const fallback = {
      title: sermon.title,
      subtitle: sermon.seriesTitle || '',
      speakerNotes: `Welcome everyone warmly. ${sermon.seriesTitle ? `Remind them this is part of the "${sermon.seriesTitle}" series.` : ''} Set the tone for today's message about ${sermon.bigIdea}. Create anticipation for what God wants to say today.`,
    };

    const content = await this.llmClient.generateJson<any>(system, user, fallback);
    this.logger.log(`LLM content (title slide): ${JSON.stringify(content)}`);

    return {
      type: SlideType.TITLE,
      layoutKey: 'title_centered_v1',
      content: { title: content.title, subtitle: content.subtitle },
      speakerNotes: content.speakerNotes || fallback.speakerNotes,
    };
  }

  private async generateScriptureSlide(sermon: Sermon): Promise<SlideContent> {
    const system = `You are a sermon slide designer and pastoral coach. Create scripture slides with detailed speaker notes.
Return ONLY valid JSON with no additional text.`;

    const user = `Create a scripture slide for:
Reference: ${sermon.mainScriptureRef}
Big Idea: ${sermon.bigIdea}
Tone: ${sermon.tone}

Return JSON: { "reference": "scripture ref", "lines": ["line 1", "line 2"], "speakerNotes": "detailed notes" }
Keep each line under 60 characters. Maximum 3 lines. Make it memorable.
Speaker notes should include: how to read the passage (tone, emphasis), brief context about the scripture, why this passage matters for today's message, and how to transition to the main points. Be specific and practical (100-150 words).`;

    const fallback = {
      reference: sermon.mainScriptureRef,
      lines: [sermon.bigIdea.substring(0, 60)],
      speakerNotes: `Read ${sermon.mainScriptureRef} with conviction. Provide brief context about when/why this was written. Emphasize how this passage connects to ${sermon.bigIdea}. Let the words sink in before moving forward.`,
    };

    const content = await this.llmClient.generateJson<any>(system, user, fallback);
    this.logger.log(`LLM content (scripture slide): ${JSON.stringify(content)}`);

    return {
      type: SlideType.SCRIPTURE,
      layoutKey: 'scripture_centered_v1',
      content: { reference: content.reference, lines: content.lines },
      speakerNotes: content.speakerNotes || fallback.speakerNotes,
    };
  }

  private async generatePointSlide(sermon: Sermon, index: number): Promise<SlideContent> {
    const point = sermon.mainPoints[index] || sermon.bigIdea || `Point ${index + 1}`;
    const references = this.getScriptureReferences(sermon);
    const primaryReference = references[0];
    const system = `You are a sermon slide designer and pastoral coach. Create point slides with detailed speaker notes.
Return ONLY valid JSON with no additional text.`;

    const user = `Create a sermon point slide:
Point ${index + 1}: ${point}
Context: ${sermon.bigIdea}
Tone: ${sermon.tone}
Audience: ${sermon.audienceContext || 'general congregation'}
${references.length ? `Scripture References: ${references.join(', ')}` : ''}

Return JSON: { "title": "point title", "bullets": ["bullet 1", "bullet 2"], "speakerNotes": "detailed notes" }
Title should be the point number and main idea (under 50 chars).
2-3 bullets max, each under 70 characters. Make them practical and memorable.
If a bullet is grounded in a specific scripture, include the reference inline like "... (Joshua 1:9)".
Split multi-sentence ideas into separate bullets.
Speaker notes should include: personal story or illustration suggestion, biblical support, practical application, potential objections to address, and transition to next point. Be specific and actionable (150-200 words).`;

    const fallback = {
      title: `${index + 1}. ${point.substring(0, 40)}`,
      bullets: [primaryReference ? `${point} (${primaryReference})` : point],
      speakerNotes: `Unpack "${point}" with a personal story or relevant illustration. Connect this to ${sermon.bigIdea}. Give practical examples of what this looks like in daily life. Address common questions or doubts. Transition smoothly to the next point.`,
    };

    const content = await this.llmClient.generateJson<any>(system, user, fallback);
    const normalizedBullets = this.normalizeBulletLines(content.bullets);
    this.logger.log(`LLM content (point slide ${index + 1}): ${JSON.stringify(content)}`);

    return {
      type: SlideType.POINT,
      layoutKey: 'point_bullets_v1',
      content: { title: content.title, bullets: normalizedBullets },
      speakerNotes: content.speakerNotes || fallback.speakerNotes,
    };
  }

  private async generateApplicationSlide(sermon: Sermon): Promise<SlideContent> {
    const system = `You are a sermon slide designer and pastoral coach. Create application slides with detailed speaker notes.
Return ONLY valid JSON with no additional text.`;

    const user = `Create an application slide:
Big Idea: ${sermon.bigIdea}
Tone: ${sermon.tone}
Audience: ${sermon.audienceContext || 'general congregation'}

Return JSON: { "title": "This Week", "bullets": ["action 1", "action 2", "action 3"], "speakerNotes": "detailed notes" }
3 practical, specific actions. Each under 50 characters. Make them doable this week.
Speaker notes should include: why these actions matter, how to overcome common obstacles, encouragement for taking first steps, accountability suggestions, and reminder that small steps count. Be motivating and practical (150-200 words).`;

    const fallback = {
      title: 'This Week',
      bullets: [
        'Reflect on this message',
        'Share with someone',
        'Put it into practice',
      ],
      speakerNotes: `Challenge the congregation to take concrete action this week. Emphasize that transformation happens through small, consistent steps. Encourage them to share their journey with someone for accountability. Remind them that God's grace empowers their obedience. These aren't burdens but invitations to experience ${sermon.bigIdea} in real life.`,
    };

    const content = await this.llmClient.generateJson<any>(system, user, fallback);
    this.logger.log(`LLM content (application slide): ${JSON.stringify(content)}`);

    return {
      type: SlideType.APPLICATION,
      layoutKey: 'application_bullets_v1',
      content: { title: content.title, bullets: content.bullets },
      speakerNotes: content.speakerNotes || fallback.speakerNotes,
    };
  }

  private async generateTwoContentSlide(sermon: Sermon, index: number): Promise<SlideContent> {
    const point = sermon.mainPoints[index] || sermon.bigIdea || `Point ${index + 1}`;
    const references = this.getScriptureReferences(sermon);
    const primaryReference = references[0];
    const system = `You are a sermon slide designer. Create two-column content slides.
Return ONLY valid JSON with no additional text.`;

    const user = `Create a two-column slide:
Point ${index + 1}: ${point}
Context: ${sermon.bigIdea}
Tone: ${sermon.tone}
${references.length ? `Scripture References: ${references.join(', ')}` : ''}

Return JSON: { "title": "point title", "left": ["left item 1", "left item 2"], "right": ["right item 1", "right item 2"] }
Title under 50 chars. 2-3 items per column. Make them practical.
If an item is grounded in scripture, include the reference inline like "... (Hebrews 13:5)".`;

    const fallback = {
      title: `${index + 1}. ${point.substring(0, 40)}`,
      left: [point],
      right: ['Apply this truth'],
    };

    const content = await this.llmClient.generateJson<any>(system, user, fallback);
    const normalizedLeft = this.normalizeBulletLines(content.left);
    const normalizedRight = this.normalizeBulletLines(content.right);
    this.logger.log(`LLM content (two content slide ${index + 1}): ${JSON.stringify(content)}`);

    return {
      type: SlideType.SUPPORT,
      layoutKey: 'two_content_v1',
      content: { title: content.title, left: normalizedLeft, right: normalizedRight },
      speakerNotes: `Expand on: ${point}`,
    };
  }

  private async generateComparisonSlide(sermon: Sermon, index: number): Promise<SlideContent> {
    const point = sermon.mainPoints[index] || sermon.bigIdea || `Point ${index + 1}`;
    const references = this.getScriptureReferences(sermon);
    const system = `You are a sermon slide designer. Create comparison slides.
Return ONLY valid JSON with no additional text.`;

    const user = `Create a comparison slide:
Point ${index + 1}: ${point}
Context: ${sermon.bigIdea}
Tone: ${sermon.tone}
${references.length ? `Scripture References: ${references.join(', ')}` : ''}

Return JSON: { "title": "main title", "leftTitle": "Before/Without", "rightTitle": "After/With", "left": ["item 1", "item 2"], "right": ["item 1", "item 2"] }
Title under 50 chars. 2-3 items per side. Show contrast.
If an item is grounded in scripture, include the reference inline like "... (2 Corinthians 5:7)".`;

    const fallback = {
      title: `${index + 1}. ${point.substring(0, 40)}`,
      leftTitle: 'Before',
      rightTitle: 'After',
      left: ['Without faith'],
      right: ['With faith'],
    };

    const content = await this.llmClient.generateJson<any>(system, user, fallback);
    const normalizedLeft = this.normalizeBulletLines(content.left);
    const normalizedRight = this.normalizeBulletLines(content.right);
    this.logger.log(`LLM content (comparison slide ${index + 1}): ${JSON.stringify(content)}`);

    return {
      type: SlideType.SUPPORT,
      layoutKey: 'comparison_v1',
      content: {
        title: content.title,
        leftTitle: content.leftTitle,
        rightTitle: content.rightTitle,
        left: normalizedLeft,
        right: normalizedRight,
      },
      speakerNotes: `Expand on: ${point}`,
    };
  }

  private async generateTransitionSlide(
    sermon: Sermon,
    index: number,
    includeSubtitle: boolean,
  ): Promise<SlideContent> {
    const point = sermon.mainPoints[index] || sermon.bigIdea || `Point ${index + 1}`;
    const system = `You are a sermon slide designer. Create transition slides that introduce the next section.
Return ONLY valid JSON with no additional text.`;

    const user = `Create a transition slide for:
Point ${index + 1}: ${point}
Big Idea: ${sermon.bigIdea}
Tone: ${sermon.tone}

Return JSON: { "title": "section title"${includeSubtitle ? ', "subtitle": "short subtitle"' : ''} }
Title under 60 chars. Make it feel like a section heading.
${includeSubtitle ? 'Subtitle under 50 chars, clarifying the point.' : 'No subtitle needed.'}`;

    const fallback = {
      title: point.substring(0, 60),
      subtitle: includeSubtitle ? 'Transition to the next section' : undefined,
    };

    const content = await this.llmClient.generateJson<any>(system, user, fallback);
    this.logger.log(`LLM content (transition slide ${index + 1}): ${JSON.stringify(content)}`);

    return {
      type: SlideType.TRANSITION,
      layoutKey: includeSubtitle ? 'section_header_v1' : 'transition_title_v1',
      content: includeSubtitle
        ? { title: content.title, subtitle: content.subtitle || fallback.subtitle }
        : { title: content.title },
      speakerNotes: `Transition to point ${index + 1}`,
    };
  }

  private normalizeBulletLines(lines?: string[]): string[] {
    if (!Array.isArray(lines)) return [];

    const splitLines = lines
      .flatMap((line) =>
        line
          .split(/\r?\n/)
          .flatMap((segment) => segment.split(/(?<=[.!?])\s+(?=[A-Z"“])/))
          .map((segment) => segment.trim())
          .filter(Boolean),
      )
      .map((line) => line.replace(/\s+/g, ' '));

    return splitLines.length ? splitLines : lines;
  }

  private getScriptureReferences(sermon: Sermon): string[] {
    if (!sermon.mainScriptureRef) return [];

    const raw = sermon.mainScriptureRef
      .split(/[;,|]/)
      .map((ref) => ref.trim())
      .filter(Boolean);

    return Array.from(new Set(raw));
  }

  private async generateTitleOnlySlide(sermon: Sermon, index: number): Promise<SlideContent> {
    const point = sermon.mainPoints[index] || sermon.bigIdea || `Point ${index + 1}`;
    const system = `You are a sermon slide designer. Create title-only slides with impactful statements.
Return ONLY valid JSON with no additional text.`;

    const user = `Create a title-only slide:
Point ${index + 1}: ${point}
Context: ${sermon.bigIdea}
Tone: ${sermon.tone}

Return JSON: { "title": "powerful statement" }
Title under 60 chars. Make it memorable and impactful.`;

    const fallback = {
      title: point.substring(0, 60),
    };

    const content = await this.llmClient.generateJson<any>(system, user, fallback);
    this.logger.log(`LLM content (title only slide ${index + 1}): ${JSON.stringify(content)}`);

    return {
      type: SlideType.POINT,
      layoutKey: 'title_only_v1',
      content,
      speakerNotes: `Expand on: ${point}`,
    };
  }

  private async generatePictureCaptionSlide(sermon: Sermon, index: number): Promise<SlideContent> {
    const point = sermon.mainPoints[index] || sermon.bigIdea || `Point ${index + 1}`;
    const system = `You are a sermon slide designer. Create picture slides with captions.
Return ONLY valid JSON with no additional text.`;

    const user = `Create a picture caption slide:
Point ${index + 1}: ${point}
Context: ${sermon.bigIdea}
Tone: ${sermon.tone}

Return JSON: { "title": "slide title", "caption": "brief caption" }
Title under 50 chars. Caption under 80 chars. Caption should describe the visual.`;

    const fallback = {
      title: `${index + 1}. ${point.substring(0, 40)}`,
      caption: sermon.bigIdea.substring(0, 80),
    };

    const content = await this.llmClient.generateJson<any>(system, user, fallback);
    this.logger.log(`LLM content (picture caption slide ${index + 1}): ${JSON.stringify(content)}`);

    return {
      type: SlideType.ANNOUNCEMENT,
      layoutKey: 'picture_caption_v1',
      content,
      speakerNotes: `Expand on: ${point}`,
    };
  }

  private async generateInvitationSlide(sermon: Sermon): Promise<SlideContent> {
    const system = `You are a sermon slide designer and pastoral coach. Create invitation slides with detailed speaker notes.
Return ONLY valid JSON with no additional text.`;

    const user = `Create an invitation slide:
CTA Style: ${sermon.ctaStyle}
Big Idea: ${sermon.bigIdea}
Tone: ${sermon.tone}

Return JSON: { "title": "invitation title", "message": "brief invitation message", "speakerNotes": "detailed notes" }
Title under 40 chars. Message under 100 chars. Match the ${sermon.ctaStyle} style.
Speaker notes should include: how to extend the invitation warmly, what response looks like, how to make people feel safe responding, next steps for responders, and closing prayer guidance. Be compassionate and clear (150-200 words).`;

    const ctaTitles = {
      salvation: 'Respond Today',
      prayer: 'Let Us Pray',
      discipleship: 'Take the Next Step',
      invitation: 'Come Forward',
      none: 'Thank You',
    };

    const fallback = {
      title: ctaTitles[sermon.ctaStyle] || 'Respond',
      message: 'We invite you to respond to what God is saying to you today.',
      speakerNotes: `Extend a warm, non-pressuring invitation for people to respond to ${sermon.bigIdea}. Make it clear what response looks like (prayer, coming forward, decision card, etc.). Assure people that wherever they are in their journey is okay. Provide clear next steps for those responding. ${sermon.ctaStyle === 'salvation' ? 'Offer a simple salvation prayer.' : sermon.ctaStyle === 'prayer' ? 'Lead in a closing prayer that applies the message.' : 'Guide them toward deeper commitment.'} Close with encouragement and blessing.`,
    };

    const content = await this.llmClient.generateJson<any>(system, user, fallback);
    this.logger.log(`LLM content (invitation slide): ${JSON.stringify(content)}`);

    return {
      type: SlideType.INVITATION,
      layoutKey: 'invitation_centered_v1',
      content: { title: content.title, message: content.message },
      speakerNotes: content.speakerNotes || fallback.speakerNotes,
    };
  }
}
