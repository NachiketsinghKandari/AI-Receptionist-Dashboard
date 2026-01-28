/**
 * Factory function to create LLM providers
 */

import type {
  GeminiConfig,
  GeminiModel,
  ILLMProvider,
  LLMModel,
  LLMProvider,
  OpenAIConfig,
  OpenAIModel,
  ProviderConfig,
} from '../types';
import {
  isGeminiModel,
  isOpenAIModel,
  isValidModel,
  isValidProvider,
} from '../types';
import { LLMConfigError } from '../errors';
import { GeminiProvider } from './gemini';
import { OpenAIProvider } from './openai';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

/**
 * Create an LLM provider instance based on the provider and model
 *
 * @param provider - The LLM provider ('openai' or 'gemini')
 * @param model - The model to use
 * @param config - Optional provider-specific configuration
 * @returns An ILLMProvider instance
 * @throws LLMConfigError if provider/model is invalid or API key is missing
 */
export function createLLMProvider(
  provider: LLMProvider,
  model: LLMModel,
  config?: ProviderConfig
): ILLMProvider {
  // Validate provider
  if (!isValidProvider(provider)) {
    throw new LLMConfigError(`Invalid LLM provider: ${provider}`);
  }

  // Validate model
  if (!isValidModel(model)) {
    throw new LLMConfigError(`Invalid LLM model: ${model}`);
  }

  // Create provider based on type
  switch (provider) {
    case 'gemini': {
      if (!isGeminiModel(model)) {
        throw new LLMConfigError(
          `Model ${model} is not a valid Gemini model`,
          'gemini'
        );
      }
      if (!GEMINI_API_KEY) {
        throw new LLMConfigError('GEMINI_API_KEY is not configured', 'gemini');
      }
      return new GeminiProvider(
        GEMINI_API_KEY,
        model as GeminiModel,
        config as GeminiConfig
      );
    }

    case 'openai': {
      if (!isOpenAIModel(model)) {
        throw new LLMConfigError(
          `Model ${model} is not a valid OpenAI model`,
          'openai'
        );
      }
      if (!OPENAI_API_KEY) {
        throw new LLMConfigError('OPENAI_API_KEY is not configured', 'openai');
      }
      return new OpenAIProvider(
        OPENAI_API_KEY,
        model as OpenAIModel,
        config as OpenAIConfig
      );
    }

    default:
      throw new LLMConfigError(`Unsupported provider: ${provider}`);
  }
}

export { GeminiProvider } from './gemini';
export { OpenAIProvider } from './openai';
export { BaseLLMProvider } from './base';
