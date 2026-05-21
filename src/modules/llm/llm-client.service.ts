import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

export type LlmProvider = 'minimax' | 'local';

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
      provider?: LlmProvider;
    },
  ): Promise<T> {
    const provider = options?.provider || this.getDefaultProvider();

    try {
      if (provider === 'minimax') {
        return await this.callMiniMax(system, user, schemaHint, options);
      } else {
        return await this.callLocalLlm(system, user, schemaHint, options);
      }
    } catch (error) {
      if (this.isRecoverableProviderError(error)) {
        this.logger.warn('LLM provider fallback used: provider unavailable or model unsupported');
      } else {
        this.logger.error(`LLM generation error: ${this.getErrorMessage(error)}`);
      }
      if (schemaHint) {
        this.logger.log('Returning schema hint as fallback');
        return schemaHint as T;
      }
      throw error;
    }
  }

  private getDefaultProvider(): LlmProvider {
    const defaultProvider = this.configService.get('LLM_PROVIDER') || 'minimax';
    return defaultProvider.toLowerCase() === 'local' ? 'local' : 'minimax';
  }

  private async callMiniMax<T>(
    system: string,
    user: string,
    schemaHint?: any,
    options?: {
      temperature?: number;
      maxTokens?: number;
      model?: string;
      timeoutMs?: number;
    },
  ): Promise<T> {
    const apiKey = this.configService.get('MINIMAX_API_KEY');
    if (!apiKey) {
      throw new Error('MINIMAX_API_KEY is not configured. Set it in your .env file.');
    }
    const model = options?.model || 'MiniMax-Text-01';

    this.logger.log(`LLM request → MiniMax API (model=${model})`);

    const response = await axios.post(
      'https://api.minimax.io/v1/text/chatcompletion_v2',
      {
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature: options?.temperature ?? 0.7,
        max_completion_tokens: options?.maxTokens ?? 3000,
      },
      {
        timeout: options?.timeoutMs || 120000,
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      },
    );

    if (response.data?.base_resp?.status_code !== 0) {
      throw new Error(
        `MiniMax API error: ${response.data.base_resp.status_msg} (code ${response.data.base_resp.status_code})`,
      );
    }

    const content = response.data.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from MiniMax');
    }

    this.logger.debug(`LLM response length: ${content.length}`);
    return this.parseJsonResponse(content, schemaHint);
  }

  private async callLocalLlm<T>(
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
    return this.parseJsonResponse(content, schemaHint);
  }

  private parseJsonResponse<T>(content: string, schemaHint?: any): T {
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
  }

  private isRecoverableProviderError(error: unknown): boolean {
    const message = this.getErrorMessage(error).toLowerCase();
    const responseText = this.getAxiosResponseText(error).toLowerCase();
    return [
      'miniMax api error',
      'not support model',
      'unsupported model',
      'code 2061',
      'no response from minimax',
      'llm provider unavailable',
    ].some((needle) => message.includes(needle.toLowerCase()) || responseText.includes(needle.toLowerCase()));
  }

  private getAxiosResponseText(error: unknown): string {
    if (!axios.isAxiosError(error)) return '';
    const data = error.response?.data;
    if (!data) return '';
    if (typeof data === 'string') return data;
    try {
      return JSON.stringify(data);
    } catch {
      return '';
    }
  }

  private getErrorMessage(error: unknown): string {
    if (error instanceof Error && error.message) return error.message;
    if (typeof error === 'string') return error;
    try {
      return JSON.stringify(error);
    } catch {
      return 'unknown error';
    }
  }
}
