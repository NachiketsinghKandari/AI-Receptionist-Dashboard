/**
 * Gemini LLM provider implementation
 */

import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { BaseLLMProvider } from './base';
import type {
  GeminiConfig,
  GeminiModel,
  LLMRequest,
  LLMResponse,
} from '../types';
import { LLMAPIError } from '../errors';

// Map thinking level string to Gemini SDK enum
const THINKING_LEVEL_MAP: Record<
  NonNullable<GeminiConfig['thinkingLevel']>,
  ThinkingLevel
> = {
  minimal: ThinkingLevel.MINIMAL,
  low: ThinkingLevel.LOW,
  medium: ThinkingLevel.MEDIUM,
  high: ThinkingLevel.HIGH,
};

export class GeminiProvider extends BaseLLMProvider {
  readonly provider = 'gemini' as const;
  readonly model: GeminiModel;
  private readonly client: GoogleGenAI;
  private readonly config: GeminiConfig;

  constructor(apiKey: string, model: GeminiModel, config: GeminiConfig = {}) {
    super(apiKey);
    this.model = model;
    this.config = config;
    this.client = new GoogleGenAI({ apiKey });
  }

  async generateContent(request: LLMRequest): Promise<LLMResponse> {
    try {
      const response = await this.client.models.generateContent({
        model: this.model,
        contents: request.prompt,
        config: {
          thinkingConfig: {
            thinkingLevel:
              THINKING_LEVEL_MAP[this.config.thinkingLevel ?? 'medium'],
          },
          ...(request.responseFormat === 'json' && {
            responseMimeType: 'application/json',
          }),
        },
      });

      return {
        text: response.text || '',
        provider: this.provider,
        model: this.model,
      };
    } catch (error) {
      throw new LLMAPIError(
        `Gemini API error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        this.provider,
        undefined,
        error instanceof Error ? error : undefined
      );
    }
  }
}
