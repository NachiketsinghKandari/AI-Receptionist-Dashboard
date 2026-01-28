/**
 * Type definitions for unified LLM provider abstraction
 */

// Supported LLM providers
export const LLM_PROVIDERS = ['openai', 'gemini'] as const;
export type LLMProvider = (typeof LLM_PROVIDERS)[number];

// Supported OpenAI models
export const OPENAI_MODELS = ['gpt-4o', 'gpt-4.1'] as const;
export type OpenAIModel = (typeof OPENAI_MODELS)[number];

// Supported Gemini models
export const GEMINI_MODELS = [
  'gemini-2.5-flash',
  'gemini-3.0-pro',
  'gemini-3-flash-preview',
] as const;
export type GeminiModel = (typeof GEMINI_MODELS)[number];

// Union of all supported models
export type LLMModel = OpenAIModel | GeminiModel;

// Request interface for LLM calls
export interface LLMRequest {
  prompt: string;
  responseFormat?: 'text' | 'json';
}

// Response interface from LLM calls
export interface LLMResponse {
  text: string;
  provider: LLMProvider;
  model: LLMModel;
}

// Gemini-specific configuration
// thinkingLevel controls reasoning depth for Gemini 3 models:
// - 'minimal': Very minimal reasoning, lowest latency (Gemini 3 Flash only)
// - 'low': Minimizes latency/cost, straightforward instruction following
// - 'medium': Balanced thinking for typical tasks (Gemini 3 Flash only)
// - 'high': Maximum reasoning depth (default)
export interface GeminiConfig {
  thinkingLevel?: 'minimal' | 'low' | 'medium' | 'high';
}

// OpenAI-specific configuration
export interface OpenAIConfig {
  temperature?: number;
  maxTokens?: number;
}

// Union of provider-specific configs
export type ProviderConfig = GeminiConfig | OpenAIConfig;

// Provider interface that all providers must implement
export interface ILLMProvider {
  readonly provider: LLMProvider;
  readonly model: LLMModel;

  generateContent(request: LLMRequest): Promise<LLMResponse>;
}

// Helper to check if a model belongs to a provider
export function isOpenAIModel(model: string): model is OpenAIModel {
  return OPENAI_MODELS.includes(model as OpenAIModel);
}

export function isGeminiModel(model: string): model is GeminiModel {
  return GEMINI_MODELS.includes(model as GeminiModel);
}

export function isValidProvider(provider: string): provider is LLMProvider {
  return LLM_PROVIDERS.includes(provider as LLMProvider);
}

export function isValidModel(model: string): model is LLMModel {
  return isOpenAIModel(model) || isGeminiModel(model);
}
