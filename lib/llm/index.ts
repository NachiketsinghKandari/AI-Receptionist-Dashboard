/**
 * Unified LLM provider abstraction
 *
 * This module provides a unified interface for generating content
 * from different LLM providers (OpenAI, Gemini).
 */

import { createLLMProvider } from './providers';
import type {
  LLMModel,
  LLMProvider,
  LLMResponse,
  ProviderConfig,
} from './types';

export interface GenerateContentOptions {
  responseFormat?: 'text' | 'json';
  providerConfig?: ProviderConfig;
}

/**
 * Generate content using the specified LLM provider and model
 *
 * @param provider - The LLM provider ('openai' or 'gemini')
 * @param model - The model to use
 * @param prompt - The prompt to send to the model
 * @param options - Optional configuration (response format, provider-specific config)
 * @returns LLMResponse with the generated text
 *
 * @example
 * ```ts
 * // Using Gemini with JSON response
 * const response = await generateContent(
 *   'gemini',
 *   'gemini-3-flash-preview',
 *   'Generate a JSON object with name and age',
 *   { responseFormat: 'json', providerConfig: { thinkingLevel: 'high' } }
 * );
 *
 * // Using OpenAI
 * const response = await generateContent(
 *   'openai',
 *   'gpt-4o',
 *   'Hello, how are you?'
 * );
 * ```
 */
export async function generateContent(
  provider: LLMProvider,
  model: LLMModel,
  prompt: string,
  options?: GenerateContentOptions
): Promise<LLMResponse> {
  const llmProvider = createLLMProvider(
    provider,
    model,
    options?.providerConfig
  );

  return llmProvider.generateContent({
    prompt,
    responseFormat: options?.responseFormat,
  });
}

// Re-export types and utilities
export * from './types';
export * from './errors';
export { createLLMProvider } from './providers';
