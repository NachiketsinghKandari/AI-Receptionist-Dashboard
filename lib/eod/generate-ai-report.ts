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
  success: 'eod_success_report',
  failure: 'eod_failure_report',
  full: 'eod_full_report',
};

// Map report type to database column
const COLUMN_MAP: Record<EODReportType, string> = {
  success: 'success_report',
  failure: 'failure_report',
  full: 'full_report',
};

// Dashboard base URL for correlation ID links
const DASHBOARD_URL = 'https://hellocounsel-dashboard.vercel.app/calls';

/**
 * Post-process the AI-generated markdown to convert correlation IDs into clickable dashboard links.
 * Matches UUID format correlation IDs and wraps them in markdown links.
 * Skips IDs that are already inside markdown links or URLs.
 */
function convertCorrelationIdsToLinks(markdown: string, validIds: Set<string>, environment: Environment): string {
  // First, temporarily replace existing markdown links to protect them
  const linkPlaceholders: string[] = [];
  const protectedMarkdown = markdown.replace(/\[([^\]]+)\]\([^)]+\)/g, (match) => {
    linkPlaceholders.push(match);
    return `__LINK_PLACEHOLDER_${linkPlaceholders.length - 1}__`;
  });

  // Also protect URLs (http/https)
  const urlPlaceholders: string[] = [];
  const doubleProtected = protectedMarkdown.replace(/https?:\/\/[^\s)]+/g, (match) => {
    urlPlaceholders.push(match);
    return `__URL_PLACEHOLDER_${urlPlaceholders.length - 1}__`;
  });

  // Replace UUIDs that are valid correlation IDs (including backtick-wrapped ones)
  // Matches optional surrounding backticks so `uuid` becomes a proper link instead of inline code
  const uuidPattern = /`?([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})`?/gi;
  const withLinks = doubleProtected.replace(uuidPattern, (match, uuid) => {
    if (!validIds.has(uuid.toLowerCase())) {
      return match;
    }
    return `[${uuid}](${DASHBOARD_URL}?f=0&e=${environment}&c=${uuid})`;
  });

  // Restore URL placeholders
  let restored = withLinks.replace(/__URL_PLACEHOLDER_(\d+)__/g, (_, index) => {
    return urlPlaceholders[parseInt(index, 10)];
  });

  // Restore link placeholders
  restored = restored.replace(/__LINK_PLACEHOLDER_(\d+)__/g, (_, index) => {
    return linkPlaceholders[parseInt(index, 10)];
  });

  return restored;
}

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
    // Handle backward compatibility: old reports have 'calls' array, new reports have 'success'/'failure'
    const hasNewStructure = rawData.success !== undefined || rawData.failure !== undefined;
    const oldCalls = (rawData as unknown as { calls?: EODCallRawData[] }).calls ?? [];

    let calls: EODCallRawData[];
    if (reportType === 'full') {
      if (hasNewStructure) {
        // New structure: combine both success and failure calls
        calls = [...(rawData.success || []), ...(rawData.failure || [])];
      } else {
        // Old structure: use the calls array directly
        calls = oldCalls;
      }
    } else if (reportType === 'success') {
      if (hasNewStructure) {
        calls = rawData.success || [];
      } else {
        // Old structure: filter calls where status contains 'success'
        calls = oldCalls.filter(call => call.cekura?.status?.toLowerCase().includes('success'));
      }
    } else {
      if (hasNewStructure) {
        calls = rawData.failure || [];
      } else {
        // Old structure: filter calls where status does not contain 'success'
        calls = oldCalls.filter(call => !call.cekura?.status?.toLowerCase().includes('success'));
      }
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

    // Build input data with relevant calls and pre-computed aggregates
    const inputData = {
      count: calls.length,
      total: rawData.count,
      report_type: reportType,
      time_saved: rawData.time_saved,
      total_call_time: rawData.total_call_time,
      messages_taken: rawData.messages_taken,
      disconnection_rate: rawData.disconnection_rate,
      failure_count: rawData.failure_count,
      cs_escalation_count: rawData.cs_escalation_count,
      cs_escalation_map: rawData.cs_escalation_map,
      transfers_report: rawData.transfers_report,
      calls,
      report_date: rawData.report_date,
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

    // Parse the response - handle LLM returning literal newlines instead of escaped \n
    let aiResult: AIResponse;
    try {
      aiResult = JSON.parse(response.text);
    } catch (parseError) {
      // Try to extract ai_response from malformed JSON
      // LLMs sometimes return literal newlines inside JSON strings
      const match = response.text.match(/"ai_response"\s*:\s*"([\s\S]*)"[\s\S]*$/);
      if (match) {
        // Found the ai_response content - use it directly
        // The content might have literal newlines which is fine for markdown
        const markdownContent = match[1]
          .replace(/\\n/g, '\n')  // Convert escaped newlines to actual newlines
          .replace(/\\"/g, '"')   // Unescape quotes
          .replace(/\\\\/g, '\\'); // Unescape backslashes
        aiResult = { ai_response: markdownContent };
        console.log('Recovered ai_response from malformed JSON');
      } else {
        console.error('Failed to parse AI response:', parseError);
        console.error('Raw response:', response.text.substring(0, 500));
        return { success: false, error: 'Failed to parse AI response' };
      }
    }

    // Post-process: Convert correlation IDs to clickable dashboard links
    // Collect all valid correlation IDs from the calls data
    const validCorrelationIds = new Set(
      calls.map(call => call.correlation_id.toLowerCase())
    );
    const processedMarkdown = convertCorrelationIdsToLinks(
      aiResult.ai_response,
      validCorrelationIds,
      environment
    );
    aiResult.ai_response = processedMarkdown;

    // Calculate error count from raw data (for updating errors column)
    // Use rawData.failure_count if available, otherwise count from failure array or filter old calls
    let errorCount: number;
    if (typeof rawData.failure_count === 'number') {
      errorCount = rawData.failure_count;
    } else if (hasNewStructure) {
      errorCount = (rawData.failure || []).length;
    } else {
      errorCount = oldCalls.filter(call => !call.cekura?.status?.toLowerCase().includes('success')).length;
    }

    // Update the appropriate column based on report type, and also update errors count
    const { error: updateError } = await supabase
      .from('eod_reports')
      .update({
        [COLUMN_MAP[reportType]]: aiResult.ai_response,
        errors: errorCount,
      })
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
