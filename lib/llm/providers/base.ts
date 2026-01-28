/**
 * Abstract base class for LLM providers
 */

import type {
  ILLMProvider,
  LLMModel,
  LLMProvider,
  LLMRequest,
  LLMResponse,
} from '../types';
import { LLMConfigError } from '../errors';

export abstract class BaseLLMProvider implements ILLMProvider {
  abstract readonly provider: LLMProvider;
  abstract readonly model: LLMModel;

  constructor(protected readonly apiKey: string) {
    this.validateApiKey(apiKey);
  }

  abstract generateContent(request: LLMRequest): Promise<LLMResponse>;

  protected validateApiKey(apiKey: string): void {
    if (!apiKey || apiKey.trim() === '') {
      throw new LLMConfigError(
        `API key is required for ${this.provider} provider`,
        this.provider
      );
    }
  }
}
