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

  private getLyricsGenerationOptions(style: string): {
    temperature: number;
    topP: number;
    presencePenalty: number;
    frequencyPenalty: number;
  } {
    const defaults = {
      temperature: 0.95,
      topP: 0.9,
      presencePenalty: 0.35,
      frequencyPenalty: 0.25,
    };

    const byStyle: Record<string, typeof defaults> = {
      worship: { temperature: 0.88, topP: 0.9, presencePenalty: 0.25, frequencyPenalty: 0.2 },
      acoustic: { temperature: 0.9, topP: 0.9, presencePenalty: 0.3, frequencyPenalty: 0.2 },
      cinematic: { temperature: 0.92, topP: 0.92, presencePenalty: 0.35, frequencyPenalty: 0.25 },
      orchestral: { temperature: 0.9, topP: 0.9, presencePenalty: 0.28, frequencyPenalty: 0.2 },
      piano_prayer: { temperature: 0.86, topP: 0.88, presencePenalty: 0.22, frequencyPenalty: 0.18 },
      youth_contemporary: { temperature: 1.05, topP: 0.95, presencePenalty: 0.55, frequencyPenalty: 0.35 },
      choir_inspired: { temperature: 0.9, topP: 0.9, presencePenalty: 0.3, frequencyPenalty: 0.22 },
      instrumental_ambient: { temperature: 0.82, topP: 0.88, presencePenalty: 0.2, frequencyPenalty: 0.15 },
    };

    return byStyle[style] || defaults;
  }

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
    useCase: string = 'theme-song',
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
8. Written as SONG lyrics (hook + repetition + rhythm), not spoken-word poetry
9. Easy for a congregation to sing on first listen

${theologyGuardrail}`;

    const styleProfiles: Record<string, string> = {
      worship: 'modern worship; anthemic chorus; warm pads, piano, guitars; congregational lift',
      acoustic: 'acoustic worship; intimate and organic; guitar/piano-driven; soft percussion',
      cinematic: 'cinematic worship; wide dynamics; atmospheric textures; emotional build',
      orchestral: 'orchestral worship; strings and brass swells; dramatic and majestic',
      piano_prayer: 'piano-centered prayer style; sparse arrangement; contemplative and tender',
      youth_contemporary: 'youth contemporary worship; punchy rhythm; modern hooks; conversational language; high-energy chorus',
      choir_inspired: 'choir-inspired worship; call-and-response feel; layered harmonies',
      instrumental_ambient: 'ambient instrumental language; minimal lyric density; spacious mood',
    };
    const useCaseProfiles: Record<string, string> = {
      'theme-song': 'main thematic anchor; memorable, repeatable chorus',
      'sermon-intro': 'opening momentum; anticipatory and inviting',
      'prayer-reflection': 'prayerful reflection; softer and contemplative',
      'recap-video': 'summary flow; reflective with hopeful lift',
      'youth-promo': 'high engagement; energetic rhythmic pulse',
      'closing-appeal': 'response-focused; invitational and heartfelt',
      offertory: 'reverent giving moment; warm and worshipful',
      meditation: 'peaceful meditation; gentle and spacious',
    };
    const styleProfile = styleProfiles[style] || styleProfiles.worship;
    const useCaseProfile = useCaseProfiles[useCase] || useCaseProfiles['theme-song'];
    const styleLyricRules: Record<string, string> = {
      worship:
        '- Chorus should feel congregational and easy to repeat.\n- Keep emotional lift and reverence balanced.\n- Use warm, devotional vocabulary without cliché stacking.',
      acoustic:
        '- Keep language intimate and personal.\n- Use simple imagery and gentle phrasing.\n- Prioritize closeness over epic declarations.',
      cinematic:
        '- Build clear tension-to-release arc between verses and chorus.\n- Use vivid imagery with broad emotional sweep.\n- Keep lines singable, not verbose.',
      orchestral:
        '- Use majestic but clear wording.\n- Emphasize theological weight with concise lines.\n- Avoid overwrought or archaic diction.',
      piano_prayer:
        '- Keep lines prayerful and honest.\n- Favor quiet surrender language over grand statements.\n- Leave breathing room in each line.',
      youth_contemporary:
        '- Use present-day, conversational wording that youth actually sing.\n- Chorus must contain one short hook line repeated verbatim at least twice.\n- Keep momentum: short punchy lines with active verbs.\n- Avoid churchy/formulaic phrases unless freshly reworded.\n- For Spanish output, avoid archaic/religious jargon tone; keep it natural and current.',
      choir_inspired:
        '- Favor communal “we/us” language and call-response energy.\n- Keep refrain lines very repeatable.\n- Use declarative, uplifting phrasing.',
      instrumental_ambient:
        '- If lyrics are requested in this style, keep lines minimal and spacious.\n- Prefer fewer words with clear emotional focus.\n- Avoid dense theology wording in every line.',
    };
    const selectedStyleRules = styleLyricRules[style] || styleLyricRules.worship;

    const userPrompt = `
SERMON CONTEXT:
- Title: ${elements.title}
- Passage: ${elements.passage}
- Theme: ${elements.theme}
- Main Idea: ${elements.bigIdea}
- Tone: ${elements.tone}
- Mode: ${mode}
- Style: ${style} (${styleProfile})
- Use Case: ${useCase} (${useCaseProfile})
- Key Phrases: ${elements.keyPhrases.join(', ')}
- Imagery: ${elements.imagery.join(', ')}
- Theological Claims: ${elements.theologicalClaims.join(', ')}
- Emotional Burden: ${elements.emotionalBurden}
- Core Application: ${elements.coreApplication}
- Creative Direction: ${studyPrompt || 'none'}

REQUIREMENTS:
1. Create a ${style} song for use case ${useCase} that belongs to THIS specific sermon
2. Incorporate key phrases naturally into the chorus
3. Use scripture imagery from the passage
4. Match the ${elements.tone} emotional tone
5. Make it singable and memorable
6. ${languageInstruction}
7. Follow style and use-case profiles so arrangement, pacing, and phrasing feel audibly different when those change.
8. If Creative Direction is provided, honor it as strong art direction while keeping biblical coherence.
9. Keep lines short and singable (target ~5-9 words per line; avoid long run-on lines).
10. Build a clear chorus hook and repeat it naturally within the chorus.
11. Prefer concrete, direct language over abstract poetic phrasing.
12. Avoid dense metaphor chains and overly literary sentence structure.
13. Each section should feel rhythmic enough to be placed over a 4/4 worship groove.
14. Avoid generic filler lines that could fit any sermon; this song must feel tied to this exact sermon context.

STYLE-SPECIFIC WRITING RULES:
${selectedStyleRules}

STRUCTURE:
- Title (sermon-derived, creative)
- Theme Statement (1 sentence)
- Verse 1 (exactly 4 lines, simple and singable)
- Chorus (3-4 lines, strong repeated hook, congregational)
- Verse 2 (exactly 4 lines, develop the theme with same lyrical simplicity)
- Bridge (2-4 lines, theological climax/application, still singable)
- Optional Outro (1-2 lines)

QUALITY CHECK BEFORE FINAL OUTPUT:
- Reject your draft if it reads like a poem or devotional paragraph instead of a singable song.
- Reject your draft if the chorus hook is weak or not clearly repeatable.
- Reject your draft if more than 2 lines feel generic enough to fit any random sermon.

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
      const generationOptions = this.getLyricsGenerationOptions(style);
      const lyrics = await this.llmClient.generateJson<SongLyrics>(
        systemPrompt,
        userPrompt,
        undefined,
        generationOptions,
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
    style: string = 'instrumental_ambient',
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
    const styleProfiles: Record<string, { mood: string; tempo: string; instruments: string[] }> = {
      worship: { mood: 'uplifting reverence', tempo: '70-82 BPM', instruments: ['piano', 'pads', 'soft drums', 'electric guitar'] },
      acoustic: { mood: 'organic warmth', tempo: '68-84 BPM', instruments: ['acoustic guitar', 'piano', 'light percussion'] },
      cinematic: { mood: 'expansive and emotional', tempo: '65-80 BPM', instruments: ['strings', 'piano', 'cinematic pads', 'taiko accents'] },
      orchestral: { mood: 'majestic and dramatic', tempo: '62-78 BPM', instruments: ['strings', 'brass swells', 'timpani', 'choir pad'] },
      piano_prayer: { mood: 'intimate and contemplative', tempo: '58-74 BPM', instruments: ['solo piano', 'subtle strings', 'air pad'] },
      youth_contemporary: { mood: 'energetic and forward', tempo: '88-108 BPM', instruments: ['rhythmic guitar', 'modern drums', 'synth bass', 'pads'] },
      choir_inspired: { mood: 'reverent and communal', tempo: '66-84 BPM', instruments: ['piano', 'choir pad', 'strings', 'soft percussion'] },
      instrumental_ambient: { mood: 'calm and atmospheric', tempo: '55-72 BPM', instruments: ['ambient pads', 'soft piano', 'textural strings'] },
    };
    const styleProfile = styleProfiles[style] || styleProfiles.instrumental_ambient;

    const systemPrompt = `You are a music producer creating ambient worship music prompts for sermon contexts.
Your prompts must capture the sermon's theological mood and emotional atmosphere.`;

    const userPrompt = `
Create a detailed Suno music generation prompt for instrumental worship music.

SERMON CONTEXT:
- Title: ${elements.title}
- Passage: ${elements.passage}
- Tone: ${elements.tone}
- Theme: ${elements.theme}
- Imagery: ${elements.imagery.join(', ')}
- Style: ${style}
- Style Mood: ${styleProfile.mood}
- Tempo Band: ${styleProfile.tempo}
- Preferred Instruments: ${styleProfile.instruments.join(', ')}
- Use Case: ${useCase} (${useCaseDesc})
- Duration: ${duration} seconds
- Creative Direction: ${studyPrompt || 'none'}

REQUIREMENTS:
1. Match the sermon's ${elements.tone} emotional tone and the selected style profile
2. Incorporate atmospheric elements from the passage imagery
3. Suitable for ${useCaseDesc}
4. No vocals, instrumental only
5. Worship/ministry appropriate
6. Enforce clear style/use-case differences in tempo, rhythmic density, and instrumentation.
7. If Creative Direction is provided, use it as directional input.

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

      this.logger.log(`Generated ambient prompt for ${useCase} in style ${style}`);
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
      const fallbackInstruments = styleProfile.instruments;

      return {
        description: `Instrumental ${style} worship music for ${elements.title}`,
        mood: `${mood}, ${styleProfile.mood}`,
        instruments: fallbackInstruments,
        duration,
        useCase,
        sunoPrompt: `Instrumental ${style} worship music, mood ${mood}, ${styleProfile.mood}, tempo ${styleProfile.tempo}, instruments ${fallbackInstruments.join(', ')}, suitable for ${useCaseDesc}, ${duration} seconds, no vocals`,
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
    const fullLyrics = await this.generateLyrics(elements, 'worship', 'chorus', 'theme-song');
    
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
