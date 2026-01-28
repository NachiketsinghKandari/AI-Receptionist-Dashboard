/**
 * Custom error classes for LLM operations
 */

import type { LLMProvider } from './types';

/**
 * Base error class for all LLM-related errors
 */
export class LLMError extends Error {
  constructor(
    message: string,
    public readonly provider?: LLMProvider,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'LLMError';
  }
}

/**
 * Configuration errors - missing API keys, invalid provider/model combinations
 */
export class LLMConfigError extends LLMError {
  constructor(message: string, provider?: LLMProvider) {
    super(message, provider);
    this.name = 'LLMConfigError';
  }
}

/**
 * API errors from provider calls - rate limits, network errors, etc.
 */
export class LLMAPIError extends LLMError {
  constructor(
    message: string,
    provider: LLMProvider,
    public readonly statusCode?: number,
    cause?: Error
  ) {
    super(message, provider, cause);
    this.name = 'LLMAPIError';
  }
}
