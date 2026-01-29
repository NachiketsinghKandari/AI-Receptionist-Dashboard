/**
 * EOD Report generation API route
 * Fetches data from Cekura and Sentry, merges by correlation_id
 */

import { NextRequest, NextResponse } from 'next/server';
import { errorResponse } from '@/lib/api/utils';
import type { Environment } from '@/lib/constants';
import type {
  EODRawData,
  EODCallRawData,
  CekuraCallRawData,
  CekuraEvaluationFiltered,
  CekuraMetricFiltered,
  SentryErrorRawData,
} from '@/types/api';

// Cekura agent IDs by environment
const CEKURA_AGENT_IDS: Record<Environment, number> = {
  production: 10779,
  staging: 11005,
};

// Sentry environment mapping
const SENTRY_ENV_MAP: Record<Environment, string> = {
  production: 'production',
  staging: 'stage',
};

interface CekuraApiResult {
  id: number;
  call_id: string;
  call_ended_reason: string | null;
  status: string;
  success: boolean;
  agent: string | null;
  dropoff_point: string | null;
  error_message: string | null;
  critical_categories: string[];
  evaluation: Record<string, unknown> | null;
  duration: number | null;
}

interface CekuraApiResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: CekuraApiResult[];
}

interface SentryDiscoverEvent {
  id: string;
  title: string;
  message: string;
  level: string;
  timestamp: string;
  correlation_id: string;
  environment: string;
}

interface SentryDiscoverResponse {
  data: SentryDiscoverEvent[];
}

/**
 * Fetch all calls from Cekura API for a given date range
 */
async function fetchCekuraCalls(
  startDate: string,
  endDate: string,
  environment: Environment
): Promise<{ count: number; calls: Map<string, CekuraCallRawData> }> {
  const apiKey = process.env.CEKURA_API_KEY;
  if (!apiKey) {
    throw new Error('CEKURA_API_KEY not configured');
  }

  const agentId = CEKURA_AGENT_IDS[environment];
  const allResults: CekuraApiResult[] = [];

  let nextUrl: string | null = `https://api.cekura.ai/observability/v1/call-logs/?timestamp_from=${encodeURIComponent(startDate)}&timestamp_to=${encodeURIComponent(endDate)}&agent_id=${agentId}`;

  while (nextUrl) {
    const response = await fetch(nextUrl, {
      method: 'GET',
      headers: {
        'X-CEKURA-API-KEY': apiKey,
      },
    });

    if (!response.ok) {
      throw new Error(`Cekura API error: ${response.status} ${response.statusText}`);
    }

    const data: CekuraApiResponse = await response.json();
    allResults.push(...data.results);
    nextUrl = data.next;
  }

  // Build mapping: correlation_id -> call data
  const calls = new Map<string, CekuraCallRawData>();
  for (const result of allResults) {
    if (result.call_id) {
      // Filter evaluation metrics to reduce JSON bloat
      // Only keep essential fields: id, name, type, score, explanation, function_name
      // Excludes: extra, vocera_defined_metric_code (not needed for EOD reports)
      let filteredEvaluation: CekuraEvaluationFiltered | null = null;
      if (result.evaluation?.metrics) {
        const rawMetrics = result.evaluation.metrics as Array<Record<string, unknown>>;
        const filteredMetrics: CekuraMetricFiltered[] = rawMetrics.map((metric) => ({
          id: metric.id as number,
          name: metric.name as string,
          type: metric.type as string,
          score: (metric.score as number) ?? null,
          score_normalized: (metric.score_normalized as number) ?? null,
          explanation: (metric.explanation as string) ?? null,
          function_name: (metric.function_name as string) ?? null,
        }));
        filteredEvaluation = { metrics: filteredMetrics };
      }

      calls.set(result.call_id, {
        id: result.id,
        call_id: result.call_id,
        call_ended_reason: result.call_ended_reason,
        status: result.status || 'unknown',
        success: result.success ?? false,
        agent: result.agent,
        dropoff_point: result.dropoff_point,
        error_message: result.error_message,
        critical_categories: result.critical_categories || [],
        evaluation: filteredEvaluation,
        duration: result.duration,
      });
    }
  }

  return { count: allResults.length, calls };
}

/**
 * Fetch error events from Sentry Discover API
 */
async function fetchSentryErrors(
  environment: Environment
): Promise<Map<string, SentryErrorRawData[]>> {
  const org = process.env.SENTRY_ORG;
  const token = process.env.SENTRY_AUTH_TOKEN;

  if (!org || !token) {
    console.warn('Sentry not configured, skipping error fetch');
    return new Map();
  }

  const sentryEnv = SENTRY_ENV_MAP[environment];
  const url = 'https://sentry.io/api/0/organizations/' + org + '/events/';

  const params = new URLSearchParams();
  params.append('field', 'id');
  params.append('field', 'title');
  params.append('field', 'message');
  params.append('field', 'level');
  params.append('field', 'timestamp');
  params.append('field', 'correlation_id');
  params.append('field', 'environment');
  params.set('query', 'level:error');
  params.set('environment', sentryEnv);
  params.set('statsPeriod', '1d');
  params.set('per_page', '100');

  const errorsMap = new Map<string, SentryErrorRawData[]>();

  try {
    let cursor: string | null = null;
    let pageCount = 0;
    const maxPages = 10;

    do {
      if (cursor) {
        params.set('cursor', cursor);
      }

      const response = await fetch(`${url}?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        console.error('Sentry API error:', response.status);
        break;
      }

      const data: SentryDiscoverResponse = await response.json();
      const events = data.data || [];

      if (events.length === 0) break;

      // Group errors by correlation_id
      for (const event of events) {
        const correlationId = event.correlation_id;
        if (correlationId) {
          const existing = errorsMap.get(correlationId) || [];
          existing.push({
            id: event.id,
            title: event.title,
            message: event.message,
            level: event.level,
            timestamp: event.timestamp,
            environment: event.environment,
          });
          errorsMap.set(correlationId, existing);
        }
      }

      pageCount++;

      // Parse Link header for next cursor
      cursor = null;
      const linkHeader = response.headers.get('link') || '';
      if (linkHeader) {
        const links = linkHeader.split(',');
        for (const link of links) {
          const parts = link.split(';');
          let isNext = false;
          let resultsTrue = false;
          let cursorVal: string | null = null;

          for (const part of parts) {
            const trimmed = part.trim();
            if (trimmed.includes('rel="next"')) isNext = true;
            if (trimmed.includes('results="true"')) resultsTrue = true;
            const cursorMatch = trimmed.match(/cursor="([^"]+)"/);
            if (cursorMatch) {
              cursorVal = cursorMatch[1];
            }
          }

          if (isNext && resultsTrue && cursorVal) {
            cursor = cursorVal;
            break;
          }
        }
      }
    } while (cursor && pageCount < maxPages);
  } catch (error) {
    console.error('Error fetching Sentry errors:', error);
  }

  return errorsMap;
}

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const environment = (searchParams.get('env') || 'production') as Environment;

    const body = await request.json();
    const reportDate = body.reportDate as string;

    if (!reportDate || !/^\d{4}-\d{2}-\d{2}$/.test(reportDate)) {
      return errorResponse('Invalid reportDate format. Use YYYY-MM-DD', 400, 'INVALID_DATE');
    }

    // Calculate date range for Cekura
    // Start: reportDate at 00:00:00 UTC
    // End: next day at 00:00:00 UTC (to capture full day)
    const startDate = `${reportDate}T00:00:00Z`;
    const nextDay = new Date(reportDate);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    const endDate = `${nextDay.toISOString().split('T')[0]}T00:00:00Z`;

    // Fetch data from both sources in parallel
    const [cekuraResult, sentryErrors] = await Promise.all([
      fetchCekuraCalls(startDate, endDate, environment),
      fetchSentryErrors(environment),
    ]);

    // Merge data by correlation_id and separate by status
    const successCalls: EODCallRawData[] = [];
    const failureCalls: EODCallRawData[] = [];

    for (const [correlationId, cekuraData] of cekuraResult.calls) {
      const sentryErrorsForCall = sentryErrors.get(correlationId) || [];

      const callData: EODCallRawData = {
        correlation_id: correlationId,
        cekura: cekuraData,
        sentry: {
          errors: sentryErrorsForCall,
        },
      };

      // Separate calls by cekura status
      if (cekuraData.status === 'success') {
        successCalls.push(callData);
      } else {
        failureCalls.push(callData);
      }
    }

    // Sort by Cekura ID (most recent first)
    successCalls.sort((a, b) => b.cekura.id - a.cekura.id);
    failureCalls.sort((a, b) => b.cekura.id - a.cekura.id);

    const rawData: EODRawData = {
      count: cekuraResult.count,
      total: cekuraResult.count,
      errors: failureCalls.length,
      success: successCalls,
      failure: failureCalls,
      generated_at: new Date().toISOString(),
      environment,
    };

    return NextResponse.json({ raw_data: rawData });
  } catch (error) {
    console.error('EOD report generation error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return errorResponse(message, 500, 'GENERATION_ERROR');
  }
}
