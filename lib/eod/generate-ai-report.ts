/**
 * Shared AI report generation logic
 * Can be called from API route or directly from after() hook
 */

import { generateContent, type GeminiConfig, type LLMModel, type LLMProvider } from '@/lib/llm';
import { getSupabaseClient } from '@/lib/supabase/client';
import type { Environment } from '@/lib/constants';
import type { EODRawData } from '@/types/api';

interface AIResponse {
  error_count: number;
  ai_response: string;
}

export interface GenerateAIReportResult {
  success: boolean;
  error_count?: number;
  error?: string;
}

interface PromptRow {
  prompt: string;
  llm_provider: string;
  llm_model: string;
}

/**
 * Generate AI report for an EOD report
 * This function can be called directly (not via HTTP) for background processing
 */
export async function generateAIReportForEOD(
  reportId: string,
  rawData: EODRawData,
  environment: Environment
): Promise<GenerateAIReportResult> {
  try {
    const supabase = getSupabaseClient(environment);

    // Fetch prompt and LLM configuration from prompts table
    const { data: promptData, error: promptError } = await supabase
      .from('prompts')
      .select('prompt, llm_provider, llm_model')
      .eq('type', 'eod_report_prompt')
      .single<PromptRow>();

    if (promptError || !promptData) {
      console.error('Error fetching prompt:', promptError);
      return { success: false, error: 'Prompt not found' };
    }

    // Validate provider and model from database
    const provider = promptData.llm_provider as LLMProvider;
    const model = promptData.llm_model as LLMModel;

    // Replace placeholder with actual JSON data
    const fullPrompt = promptData.prompt.replace(
      '{input_json}',
      JSON.stringify(rawData, null, 2)
    );

    // Build provider config (Gemini-specific: use high thinking level)
    const providerConfig: GeminiConfig | undefined =
      provider === 'gemini' ? { thinkingLevel: 'high' } : undefined;

    // Call LLM using unified abstraction
    const response = await generateContent(provider, model, fullPrompt, {
      responseFormat: 'json',
      providerConfig,
    });

    // Parse the response
    let aiResult: AIResponse;
    try {
      aiResult = JSON.parse(response.text);
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError);
      console.error('Raw response:', response.text);
      return { success: false, error: 'Failed to parse AI response' };
    }

    // Update the eod_reports row with AI results
    const { error: updateError } = await supabase
      .from('eod_reports')
      .update({
        report: aiResult.ai_response,
        errors: aiResult.error_count,
      })
      .eq('id', reportId);

    if (updateError) {
      console.error('Error updating EOD report with AI results:', updateError);
      return { success: false, error: 'Failed to save AI results' };
    }

    console.log(
      `AI generation completed for report ${reportId} using ${provider}/${model}`
    );
    return { success: true, error_count: aiResult.error_count };
  } catch (error) {
    console.error('AI generation error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
