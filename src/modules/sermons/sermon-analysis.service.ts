import { Injectable, Logger } from '@nestjs/common';
import { LlmClient } from '../llm/llm-client.service';

interface SermonAnalysis {
  mainPoints: string[];
  enhancedBigIdea?: string;
}

@Injectable()
export class SermonAnalysisService {
  private logger = new Logger(SermonAnalysisService.name);

  constructor(private llmClient: LlmClient) {}

  async analyzeSermon(
    title: string,
    bigIdea: string,
    notes?: string,
    mainScriptureRef?: string,
    existingPoints?: string[],
  ): Promise<SermonAnalysis> {
    const system = `You are a sermon content analyst. Your job is to extract or enhance the main points of a sermon.
Return ONLY valid JSON with no additional text.`;

    const hasExistingPoints = existingPoints && existingPoints.length > 0;
    const pointsContext = hasExistingPoints
      ? `\nExisting Points (enhance these if needed):\n${existingPoints.map((p, i) => `${i + 1}. ${p}`).join('\n')}`
      : '';

    const user = `Analyze this sermon and extract 3-5 clear, actionable main points:

Title: ${title}
Big Idea: ${bigIdea}
${mainScriptureRef ? `Scripture Reference: ${mainScriptureRef}` : ''}
${notes ? `\nSermon Notes:\n${notes.substring(0, 1000)}` : ''}${pointsContext}

Return JSON: { "mainPoints": ["point 1", "point 2", "point 3"] }

Requirements:
- Extract 3-5 main points that support the big idea
- Each point should be clear, concise (under 60 characters)
- Points should be actionable and memorable
- Points should flow logically and build on each other
${hasExistingPoints ? '- Enhance or refine the existing points if they are vague or too long' : '- If sermon notes are minimal, derive points from the big idea and scripture'}`;

    try {
      const result = await this.llmClient.generateJson<SermonAnalysis>(system, user);
      this.logger.log(`Analyzed sermon "${title}" - extracted ${result.mainPoints?.length || 0} main points`);
      
      // Ensure we have at least 3 points
      if (!result.mainPoints || result.mainPoints.length < 3) {
        this.logger.warn(`Insufficient points extracted, using fallback`);
        return this.getFallbackPoints(bigIdea, existingPoints);
      }

      return {
        mainPoints: result.mainPoints.slice(0, 5), // Max 5 points
      };
    } catch (error) {
      this.logger.error(`Sermon analysis failed: ${error.message}`);
      return this.getFallbackPoints(bigIdea, existingPoints);
    }
  }

  private getFallbackPoints(bigIdea: string, existingPoints?: string[]): SermonAnalysis {
    if (existingPoints && existingPoints.length >= 3) {
      return { mainPoints: existingPoints };
    }

    // Generate basic points from big idea
    const words = bigIdea.split(' ');
    const chunk = Math.ceil(words.length / 3);
    
    return {
      mainPoints: [
        words.slice(0, chunk).join(' ').substring(0, 60),
        words.slice(chunk, chunk * 2).join(' ').substring(0, 60),
        words.slice(chunk * 2).join(' ').substring(0, 60),
      ].filter(p => p.length > 0),
    };
  }
}
