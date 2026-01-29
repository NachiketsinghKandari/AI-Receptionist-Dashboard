/**
 * Shared AI report generation logic
 * Can be called from API route for success/failure report generation
 */

import { generateContent, type GeminiConfig, type LLMModel, type LLMProvider } from '@/lib/llm';
import { getSupabaseClient } from '@/lib/supabase/client';
import type { Environment } from '@/lib/constants';
import type { EODRawData, EODReportType, EODCallRawData } from '@/types/api';

interface AIResponse {
  ai_response: string;
}

export interface GenerateAIReportResult {
  success: boolean;
  reportType?: EODReportType;
  error?: string;
}

interface PromptRow {
  prompt: string;
  llm_provider: string;
  llm_model: string;
}

// Map report type to prompt type in database
const PROMPT_TYPE_MAP: Record<EODReportType, string> = {
  success: 'eod_success_report_prompt',
  failure: 'eod_failure_report_prompt',
  full: 'eod_report_prompt',
};

// Map report type to database column
const COLUMN_MAP: Record<EODReportType, string> = {
  success: 'success_report',
  failure: 'failure_report',
  full: 'full_report',
};

/**
 * Generate AI report for an EOD report
 * @param reportId - The ID of the EOD report
 * @param rawData - The raw data containing success/failure call arrays
 * @param environment - The environment (production/staging)
 * @param reportType - Whether to generate success or failure report
 */
export async function generateAIReportForEOD(
  reportId: string,
  rawData: EODRawData,
  environment: Environment,
  reportType: EODReportType
): Promise<GenerateAIReportResult> {
  try {
    const supabase = getSupabaseClient(environment);

    // Get the relevant calls array based on report type
    let calls: EODCallRawData[];
    if (reportType === 'full') {
      // Combine both success and failure calls for full report
      calls = [...(rawData.success || []), ...(rawData.failure || [])];
    } else if (reportType === 'success') {
      calls = rawData.success || [];
    } else {
      calls = rawData.failure || [];
    }

    // Check if there are calls to analyze
    if (!calls || calls.length === 0) {
      // No calls to analyze - update with empty message
      const emptyMessage = reportType === 'success'
        ? 'No successful calls to analyze for this period.'
        : reportType === 'failure'
        ? 'No failed calls to analyze for this period.'
        : 'No calls to analyze for this period.';

      const { error: updateError } = await supabase
        .from('eod_reports')
        .update({ [COLUMN_MAP[reportType]]: emptyMessage })
        .eq('id', reportId);

      if (updateError) {
        console.error('Error updating EOD report:', updateError);
        return { success: false, error: 'Failed to save empty report' };
      }

      console.log(`No ${reportType} calls for report ${reportId}, saved empty message`);
      return { success: true, reportType };
    }

    // Fetch prompt and LLM configuration from prompts table
    const promptType = PROMPT_TYPE_MAP[reportType];
    const { data: promptData, error: promptError } = await supabase
      .from('prompts')
      .select('prompt, llm_provider, llm_model')
      .eq('type', promptType)
      .single<PromptRow>();

    if (promptError || !promptData) {
      console.error(`Error fetching prompt for ${promptType}:`, promptError);
      return { success: false, error: `Prompt not found for ${reportType} report` };
    }

    // Validate provider and model from database
    const provider = promptData.llm_provider as LLMProvider;
    const model = promptData.llm_model as LLMModel;

    // Build input data with only the relevant calls
    const inputData = {
      count: calls.length,
      total: rawData.total,
      report_type: reportType,
      calls,
      generated_at: rawData.generated_at,
      environment: rawData.environment,
    };

    // Replace placeholder with actual JSON data
    const fullPrompt = promptData.prompt.replace(
      '{input_json}',
      JSON.stringify(inputData, null, 2)
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

    // Update the appropriate column based on report type
    const { error: updateError } = await supabase
      .from('eod_reports')
      .update({ [COLUMN_MAP[reportType]]: aiResult.ai_response })
      .eq('id', reportId);

    if (updateError) {
      console.error('Error updating EOD report with AI results:', updateError);
      return { success: false, error: 'Failed to save AI results' };
    }

    console.log(
      `AI ${reportType} report generation completed for report ${reportId} using ${provider}/${model}`
    );
    return { success: true, reportType };
  } catch (error) {
    console.error('AI generation error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
