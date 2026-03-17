import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class LlmClient {
  private baseUrl: string;
  private modelName: string;
  private logger = new Logger(LlmClient.name);

  constructor(private configService: ConfigService) {
    this.baseUrl = this.configService.get('LM_STUDIO_URL') || 'http://localhost:1234/v1';
    this.modelName = this.configService.get('LLM_MODEL_NAME') || 'local-model';
  }

  async generateJson<T>(
    system: string,
    user: string,
    schemaHint?: any,
    options?: {
      temperature?: number;
      maxTokens?: number;
      topP?: number;
      presencePenalty?: number;
      frequencyPenalty?: number;
    },
  ): Promise<T> {
    try {
      this.logger.log(`LLM request → ${this.baseUrl}/chat/completions (model=${this.modelName})`);
      const response = await axios.post(
        `${this.baseUrl}/chat/completions`,
        {
          model: this.modelName,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          temperature: options?.temperature ?? 0.7,
          max_tokens: options?.maxTokens ?? 3000,
          top_p: options?.topP,
          presence_penalty: options?.presencePenalty,
          frequency_penalty: options?.frequencyPenalty,
        },
        {
          timeout: 60000,
        }
      );

      const content = response.data.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response from LLM');
      }

      this.logger.debug(`LLM response length: ${content.length}`);

      // Try to extract JSON from the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        let jsonStr = jsonMatch[0];

        // Fix common JSON issues
        // 1. Remove trailing commas before closing braces
        jsonStr = jsonStr.replace(/,\s*([}\]])/g, '$1');

        try {
          return JSON.parse(jsonStr);
        } catch (parseError) {
          this.logger.warn(`Initial JSON parse failed, attempting repair: ${parseError.message}`);
          this.logger.debug(`Problematic JSON: ${jsonStr.substring(0, 500)}...`);

          // Attempt to repair by trimming to last complete JSON object
          const firstBrace = jsonStr.indexOf('{');
          const lastBrace = jsonStr.lastIndexOf('}');
          if (firstBrace >= 0 && lastBrace > firstBrace) {
            const trimmed = jsonStr.substring(firstBrace, lastBrace + 1);
            try {
              return JSON.parse(trimmed);
            } catch (trimError) {
              this.logger.warn('Trimmed JSON parse failed, attempting balance repair');
            }
          }

          // Balance braces by counting, then truncate after last complete brace
          let depth = 0;
          let lastCompleteIndex = -1;
          for (let i = 0; i < jsonStr.length; i += 1) {
            const char = jsonStr[i];
            if (char === '{') depth += 1;
            if (char === '}') {
              depth -= 1;
              if (depth === 0) {
                lastCompleteIndex = i;
              }
            }
          }
          if (lastCompleteIndex > 0) {
            const balanced = jsonStr.substring(0, lastCompleteIndex + 1);
            try {
              return JSON.parse(balanced);
            } catch (balanceError) {
              this.logger.warn('Balanced JSON parse failed');
            }
          }

          throw parseError;
        }
      }

      // Try parsing the whole content as JSON
      return JSON.parse(content);
    } catch (error) {
      this.logger.error(`LLM generation error: ${error.message}`);
      if (schemaHint) {
        this.logger.log('Returning schema hint as fallback');
        return schemaHint as T;
      }
      throw error;
    }
  }
}
