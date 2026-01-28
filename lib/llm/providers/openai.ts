/**
 * OpenAI LLM provider implementation
 */

import OpenAI from 'openai';
import { BaseLLMProvider } from './base';
import type { LLMRequest, LLMResponse, OpenAIConfig, OpenAIModel } from '../types';
import { LLMAPIError } from '../errors';

export class OpenAIProvider extends BaseLLMProvider {
  readonly provider = 'openai' as const;
  readonly model: OpenAIModel;
  private readonly client: OpenAI;
  private readonly config: OpenAIConfig;

  constructor(apiKey: string, model: OpenAIModel, config: OpenAIConfig = {}) {
    super(apiKey);
    this.model = model;
    this.config = config;
    this.client = new OpenAI({ apiKey });
  }

  async generateContent(request: LLMRequest): Promise<LLMResponse> {
    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [{ role: 'user', content: request.prompt }],
        ...(this.config.temperature !== undefined && {
          temperature: this.config.temperature,
        }),
        ...(this.config.maxTokens !== undefined && {
          max_tokens: this.config.maxTokens,
        }),
        ...(request.responseFormat === 'json' && {
          response_format: { type: 'json_object' as const },
        }),
      });

      const text = response.choices[0]?.message?.content || '';

      return {
        text,
        provider: this.provider,
        model: this.model,
      };
    } catch (error) {
      const statusCode =
        error instanceof OpenAI.APIError ? error.status : undefined;

      throw new LLMAPIError(
        `OpenAI API error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        this.provider,
        statusCode,
        error instanceof Error ? error : undefined
      );
    }
  }
}
