import { Injectable, Logger } from '@nestjs/common';
import { LlmClient } from '../llm/llm-client.service';

export interface SermonElements {
  title: string;
  passage: string;
  theme: string;
  bigIdea: string;
  tone: string;
  keyPhrases: string[];
  imagery: string[];
  theologicalClaims: string[];
  emotionalBurden: string;
  coreApplication: string;
  language: string;
  doctrinalLens?: string;
}

export interface SongLyrics {
  title: string;
  themeStatement: string;
  verse1: string[];
  chorus: string[];
  verse2: string[];
  bridge: string[];
  outro?: string[];
  keyPhrases: string[];
  scriptureAnchors: string[];
  sunoPrompt: string;
}

export interface AmbientPrompt {
  description: string;
  mood: string;
  instruments: string[];
  duration: number;
  useCase: string;
  sunoPrompt: string;
}

@Injectable()
export class SermonSongGeneratorService {
  private readonly logger = new Logger(SermonSongGeneratorService.name);

  constructor(private readonly llmClient: LlmClient) {}

  /**
   * Extract sermon elements for song generation
   */
  async extractSermonElements(sermon: any): Promise<SermonElements> {
    const manuscript = sermon.manuscript?.content?.text || sermon.notes || '';
    const outline = sermon.outline?.structure || {};
    const applications = sermon.applications || [];

    // Extract key phrases using LLM
    const keyPhrasesPrompt = `
Extract the 5-7 most powerful, repeated theological phrases from this sermon content.
Focus on phrases that are:
- Theologically significant
- Emotionally resonant
- Repeatable/singable
- Scripture-connected
- Not generic worship language

Sermon Title: ${sermon.title}
Passage: ${sermon.mainScriptureRef}
Theme: ${sermon.bigIdea}
Content: ${manuscript.substring(0, 2000)}

Return JSON:
{
  "keyPhrases": ["phrase1", "phrase2", ...],
  "imagery": ["image1", "image2", ...],
  "theologicalClaims": ["claim1", "claim2", ...],
  "emotionalBurden": "description",
  "coreApplication": "main application"
}
`;

    try {
      const extracted = await this.llmClient.generateJson<any>(
        'You are a worship songwriter analyzing sermon content to extract singable theological phrases.',
        keyPhrasesPrompt,
      );

      return {
        title: sermon.title,
        passage: sermon.mainScriptureRef,
        theme: sermon.bigIdea,
        bigIdea: sermon.bigIdea,
        tone: sermon.tone || 'encouraging',
        keyPhrases: extracted.keyPhrases || [],
        imagery: extracted.imagery || [],
        theologicalClaims: extracted.theologicalClaims || [],
        emotionalBurden: extracted.emotionalBurden || '',
        coreApplication: extracted.coreApplication || '',
        language: sermon.language || 'en',
        doctrinalLens: sermon.doctrinalLens,
      };
    } catch (error) {
      this.logger.error(`Failed to extract sermon elements: ${error.message}`);
      // Fallback to basic extraction
      return {
        title: sermon.title,
        passage: sermon.mainScriptureRef,
        theme: sermon.bigIdea,
        bigIdea: sermon.bigIdea,
        tone: sermon.tone || 'encouraging',
        keyPhrases: [],
        imagery: [],
        theologicalClaims: [],
        emotionalBurden: '',
        coreApplication: '',
        language: sermon.language || 'en',
        doctrinalLens: sermon.doctrinalLens,
      };
    }
  }

  /**
   * Generate song lyrics from sermon elements
   */
  async generateLyrics(
    elements: SermonElements,
    style: string = 'worship',
    mode: string = 'full',
    studyPrompt?: string,
  ): Promise<SongLyrics> {
    const isSpanish = String(elements.language || 'en').toLowerCase().startsWith('es');
    const languageInstruction = isSpanish
      ? 'Write all lyrics and all text fields in Spanish only. Do not output English words or phrases.'
      : 'Write all lyrics and all text fields in English only.';

    const theologyGuardrail = elements.doctrinalLens
      ? `Ensure lyrics align with ${elements.doctrinalLens} theology. Avoid generic prosperity language or doctrinally careless phrases.`
      : 'Ensure lyrics are biblically grounded and theologically sound.';

    const systemPrompt = `You are a worship songwriter creating a theme song for a sermon.
Your lyrics must be:
1. Poetic, singable, and emotionally resonant
2. Theologically grounded and biblically accurate
3. NOT just sermon outline restatements
4. Using natural incorporation of key sermon phrases
5. Matching the sermon's emotional tone
6. Avoiding generic worship filler
7. Matching the requested output language exactly

${theologyGuardrail}`;

    const userPrompt = `
SERMON CONTEXT:
- Title: ${elements.title}
- Passage: ${elements.passage}
- Theme: ${elements.theme}
- Main Idea: ${elements.bigIdea}
- Tone: ${elements.tone}
- Key Phrases: ${elements.keyPhrases.join(', ')}
- Imagery: ${elements.imagery.join(', ')}
- Theological Claims: ${elements.theologicalClaims.join(', ')}
- Emotional Burden: ${elements.emotionalBurden}
- Core Application: ${elements.coreApplication}
- Study Music Prompt: ${studyPrompt || 'none'}

REQUIREMENTS:
1. Create a ${style} song that belongs to THIS specific sermon
2. Incorporate key phrases naturally into the chorus
3. Use scripture imagery from the passage
4. Match the ${elements.tone} emotional tone
5. Make it singable and memorable
6. ${languageInstruction}
7. If Study Music Prompt is provided, honor it as strong art direction while keeping biblical coherence.

STRUCTURE:
- Title (sermon-derived, creative)
- Theme Statement (1 sentence)
- Verse 1 (4-6 lines, set up the theological context)
- Chorus (3-4 lines, repeatable, uses key phrases)
- Verse 2 (4-6 lines, develop the theme)
- Bridge (2-4 lines, theological climax or application)
- Optional Outro (1-2 lines)

Also provide:
- List of key phrases used
- Scripture anchors (which verses inspired which lines)
- Suno prompt (detailed music generation prompt for ${style} style)

Return JSON format:
{
  "title": "song title",
  "themeStatement": "one sentence theme",
  "verse1": ["line1", "line2", ...],
  "chorus": ["line1", "line2", ...],
  "verse2": ["line1", "line2", ...],
  "bridge": ["line1", "line2", ...],
  "outro": ["line1", "line2"],
  "keyPhrases": ["phrase1", "phrase2"],
  "scriptureAnchors": ["verse:line connection"],
  "sunoPrompt": "detailed Suno generation prompt"
}
`;

    try {
      const lyrics = await this.llmClient.generateJson<SongLyrics>(
        systemPrompt,
        userPrompt,
      );

      this.logger.log(`Generated lyrics for "${lyrics.title}"`);
      return lyrics;
    } catch (error) {
      this.logger.error(`Failed to generate lyrics: ${error.message}`);
      throw error;
    }
  }

  /**
   * Generate ambient music prompt
   */
  async generateAmbientPrompt(
    elements: SermonElements,
    useCase: string = 'sermon-intro',
    duration: number = 180,
    studyPrompt?: string,
  ): Promise<AmbientPrompt> {
    const useCaseDescriptions = {
      'sermon-intro': 'anticipatory, sets the stage for the message',
      'prayer-reflection': 'contemplative, creates space for prayer',
      'recap-video': 'uplifting, summarizes the message',
      'youth-promo': 'energetic, engaging for younger audience',
      'closing-appeal': 'invitational, calls for response',
      'offertory': 'worshipful, reverent',
      'meditation': 'peaceful, reflective',
    };

    const useCaseDesc = useCaseDescriptions[useCase] || 'general worship background';

    const systemPrompt = `You are a music producer creating ambient worship music prompts for sermon contexts.
Your prompts must capture the sermon's theological mood and emotional atmosphere.`;

    const userPrompt = `
Create a detailed Suno music generation prompt for ambient instrumental worship music.

SERMON CONTEXT:
- Title: ${elements.title}
- Passage: ${elements.passage}
- Tone: ${elements.tone}
- Theme: ${elements.theme}
- Imagery: ${elements.imagery.join(', ')}
- Use Case: ${useCase} (${useCaseDesc})
- Duration: ${duration} seconds
- Study Music Prompt: ${studyPrompt || 'none'}

REQUIREMENTS:
1. Match the sermon's ${elements.tone} emotional tone
2. Incorporate atmospheric elements from the passage imagery
3. Suitable for ${useCaseDesc}
4. No vocals, instrumental only
5. Worship/ministry appropriate
6. If Study Music Prompt is provided, use it as directional input.

Return JSON:
{
  "description": "brief description of the music",
  "mood": "primary mood",
  "instruments": ["instrument1", "instrument2", ...],
  "duration": ${duration},
  "useCase": "${useCase}",
  "sunoPrompt": "detailed Suno prompt with style, instruments, mood, tempo, and atmosphere"
}
`;

    try {
      const prompt = await this.llmClient.generateJson<AmbientPrompt>(
        systemPrompt,
        userPrompt,
      );

      this.logger.log(`Generated ambient prompt for ${useCase}`);
      return prompt;
    } catch (error) {
      this.logger.error(`Failed to generate ambient prompt: ${error.message}`);
      
      // Fallback to simple prompt
      const toneToMood = {
        encouraging: 'uplifting and hopeful',
        reflective: 'contemplative and peaceful',
        prophetic: 'mysterious and reverent',
        celebratory: 'joyful and triumphant',
        repentant: 'somber and introspective',
      };

      const mood = toneToMood[elements.tone] || 'peaceful worship';

      return {
        description: `Ambient worship music for ${elements.title}`,
        mood,
        instruments: ['piano', 'strings', 'pads'],
        duration,
        useCase,
        sunoPrompt: `Ambient instrumental worship music, ${mood}, suitable for ${useCaseDesc}, ${duration} seconds, no vocals`,
      };
    }
  }

  /**
   * Validate theology in lyrics
   */
  validateTheology(lyrics: SongLyrics, doctrinalLens?: string): boolean {
    // Basic validation - can be enhanced with more sophisticated checks
    const problematicPhrases = [
      'prosperity gospel',
      'name it claim it',
      'health and wealth',
    ];

    const lyricsText = [
      ...lyrics.verse1,
      ...lyrics.chorus,
      ...lyrics.verse2,
      ...lyrics.bridge,
    ].join(' ').toLowerCase();

    for (const phrase of problematicPhrases) {
      if (lyricsText.includes(phrase)) {
        this.logger.warn(`Theology validation failed: found "${phrase}"`);
        return false;
      }
    }

    return true;
  }

  /**
   * Generate short chorus-only version
   */
  async generateChorus(elements: SermonElements): Promise<SongLyrics> {
    const fullLyrics = await this.generateLyrics(elements, 'worship', 'chorus');
    
    // Return only chorus and title
    return {
      ...fullLyrics,
      verse1: [],
      verse2: [],
      bridge: [],
      outro: [],
    };
  }
}
