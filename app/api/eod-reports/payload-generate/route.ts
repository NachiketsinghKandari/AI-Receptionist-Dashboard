/**
 * EOD Report generation API route
 * Fetches data from Cekura, Sentry, and local database (calls, webhooks)
 * Merges by correlation_id
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/api/auth';
import { errorResponse, decodeBase64Payload } from '@/lib/api/utils';
import { getSupabaseClient } from '@/lib/supabase/client';
import type { Environment } from '@/lib/constants';
import type {
  EODRawData,
  EODCallRawData,
  CekuraCallRawData,
  CekuraEvaluationFiltered,
  CekuraMetricFiltered,
  SentryErrorRawData,
  EODTransferData,
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

interface CekuraApiMetric {
  id: number;
  name: string;
  type: string;
  score?: number | null;
  enum?: string | null;
}

interface CekuraApiResult {
  id: number;
  call_id: string;
  call_ended_reason: string | null;
  status: string;
  is_reviewed: boolean;
  feedback: string | null;
  duration: string | null;
  agent: string | null;
  dropoff_point: string | null;
  error_message: string | null;
  critical_categories: string[];
  evaluation: { metrics: CekuraApiMetric[] } | null;
}

interface CekuraApiResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: CekuraApiResult[];
}

interface SentryDiscoverEvent {
  id: string;
  correlation_id: string;
  title: string;
  message: string;
  level: string;
  timestamp: string;
  environment: string;
}

interface SentryDiscoverResponse {
  data: SentryDiscoverEvent[];
}

/**
 * Extract transfer details from webhook artifact
 * Implements the Python logic provided for transfer extraction
 */
function extractTransferDetails(
  artifact: Record<string, unknown>
): EODTransferData[] {
  const messages = (artifact.messages as Array<Record<string, unknown>>) || [];
  const transfers = (artifact.transfers as Array<Record<string, unknown>>) || [];

  // Find all transfer_call tool calls
  const transferToolCalls: Array<{ id: string; arguments: Record<string, unknown> }> = [];
  const toolCallResults: Record<string, string> = {};

  for (const msg of messages) {
    if (msg.role === 'tool_calls' && msg.toolCalls) {
      const toolCalls = msg.toolCalls as Array<Record<string, unknown>>;
      for (const tc of toolCalls) {
        const func = tc.function as Record<string, unknown> | undefined;
        if (func?.name === 'transfer_call') {
          const argsRaw = func.arguments as string | Record<string, unknown>;
          let args: Record<string, unknown>;
          try {
            args = typeof argsRaw === 'string' ? JSON.parse(argsRaw) : argsRaw;
          } catch {
            args = {};
          }
          transferToolCalls.push({ id: tc.id as string, arguments: args });
        }
      }
    }

    if (msg.role === 'tool_call_result') {
      toolCallResults[msg.toolCallId as string] = (msg.result as string) || '';
    }
  }

  if (transferToolCalls.length === 0) {
    return [];
  }

  // Build destination string from arguments
  function buildDestination(args: Record<string, unknown>): string {
    // If staff_name exists, use it
    if (args.staff_name) {
      return args.staff_name as string;
    }
    // If caller_type is "customer_success", return "Customer Success"
    if (args.caller_type === 'customer_success') {
      return 'Customer Success';
    }
    return 'Unknown';
  }

  const results: EODTransferData[] = [];

  if (transfers.length === 0) {
    // No artifact.transfers - use tool call results
    for (const tc of transferToolCalls) {
      const rawResult = toolCallResults[tc.id] || '';
      const resultLower = rawResult.toLowerCase();

      let transferResult: string;
      if (resultLower.includes('executed')) {
        transferResult = 'completed';
      } else if (resultLower.includes('cancel')) {
        transferResult = 'cancelled';
      } else {
        transferResult = rawResult.trim().replace(/\.$/, '') || 'unknown';
      }

      results.push({
        destination: buildDestination(tc.arguments),
        mode: 'transfer_direct',
        transfer_result: transferResult,
      });
    }
  } else {
    // Have artifact.transfers - match with tool calls
    for (let i = 0; i < transferToolCalls.length; i++) {
      const tc = transferToolCalls[i];
      const transferEntry = i < transfers.length ? transfers[i] : null;

      let mode: EODTransferData['mode'];
      let transferResult: string;

      if (transferEntry) {
        const transcript = ((transferEntry.transcript as string) || '').toLowerCase();
        const status = (transferEntry.status as string) || 'unknown';

        if (transcript.includes('voicemail') || transcript.includes('voice mail')) {
          mode = 'transfer_experimental_voicemail';
        } else {
          mode = 'transfer_experimental_pickup';
        }
        transferResult = status;
      } else {
        const rawResult = toolCallResults[tc.id] || '';
        mode = 'transfer_direct';
        const resultLower = rawResult.toLowerCase();

        if (resultLower.includes('executed')) {
          transferResult = 'completed';
        } else if (resultLower.includes('cancel')) {
          transferResult = 'cancelled';
        } else {
          transferResult = rawResult.trim().replace(/\.$/, '') || 'unknown';
        }
      }

      results.push({
        destination: buildDestination(tc.arguments),
        mode,
        transfer_result: transferResult,
      });
    }
  }

  return results;
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
      // Filter evaluation metrics to only keep: id, name, score OR enum
      let filteredEvaluation: CekuraEvaluationFiltered | null = null;
      if (result.evaluation?.metrics) {
        const filteredMetrics: CekuraMetricFiltered[] = result.evaluation.metrics.map((metric) => {
          // For enum type metrics, include enum instead of score
          if (metric.type === 'enum') {
            return {
              id: metric.id,
              name: metric.name,
              enum: metric.enum ?? null,
            };
          }
          // For all other types, include score
          return {
            id: metric.id,
            name: metric.name,
            score: metric.score ?? null,
          };
        });
        filteredEvaluation = { metrics: filteredMetrics };
      }

      calls.set(result.call_id, {
        id: result.id,
        call_id: result.call_id,
        call_ended_reason: result.call_ended_reason,
        status: result.status || 'unknown',
        is_reviewed: result.is_reviewed ?? false,
        feedback: result.feedback ?? null,
        duration: result.duration,
        agent: result.agent,
        dropoff_point: result.dropoff_point,
        error_message: result.error_message,
        critical_categories: result.critical_categories || [],
        evaluation: filteredEvaluation,
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

/**
 * Fetch caller_type (call_type) from calls table for given correlation IDs
 */
async function fetchCallerTypes(
  correlationIds: string[],
  environment: Environment
): Promise<Map<string, string>> {
  if (correlationIds.length === 0) {
    return new Map();
  }

  const supabase = getSupabaseClient(environment);
  const callerTypeMap = new Map<string, string>();

  // Fetch in batches of 100 to avoid query size limits
  const batchSize = 100;
  for (let i = 0; i < correlationIds.length; i += batchSize) {
    const batch = correlationIds.slice(i, i + batchSize);
    const { data, error } = await supabase
      .from('calls')
      .select('platform_call_id, call_type')
      .in('platform_call_id', batch);

    if (error) {
      console.error('Error fetching caller types:', error);
      continue;
    }

    for (const row of data || []) {
      if (row.platform_call_id && row.call_type) {
        callerTypeMap.set(row.platform_call_id, row.call_type);
      }
    }
  }

  return callerTypeMap;
}

/**
 * Fetch end-of-call webhooks and extract transfer data for given correlation IDs
 */
async function fetchTransfers(
  correlationIds: string[],
  environment: Environment
): Promise<Map<string, EODTransferData[]>> {
  if (correlationIds.length === 0) {
    return new Map();
  }

  const supabase = getSupabaseClient(environment);
  const transfersMap = new Map<string, EODTransferData[]>();

  // Fetch in batches of 100
  const batchSize = 100;
  for (let i = 0; i < correlationIds.length; i += batchSize) {
    const batch = correlationIds.slice(i, i + batchSize);
    const { data, error } = await supabase
      .from('webhook_dumps')
      .select('platform_call_id, payload')
      .in('platform_call_id', batch)
      .eq('webhook_type', 'end-of-call-report');

    if (error) {
      console.error('Error fetching webhooks:', error);
      continue;
    }

    for (const row of data || []) {
      if (!row.platform_call_id) continue;

      try {
        const decodedPayload = decodeBase64Payload(row.payload);
        const message = decodedPayload?.message as Record<string, unknown> | undefined;
        const artifact = message?.artifact as Record<string, unknown> | undefined;

        if (artifact) {
          const transfers = extractTransferDetails(artifact);
          transfersMap.set(row.platform_call_id, transfers);
        }
      } catch {
        // Skip webhooks with parsing errors
        transfersMap.set(row.platform_call_id, []);
      }
    }
  }

  return transfersMap;
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth.authenticated) {
      return errorResponse(auth.error || 'Unauthorized', 401, 'UNAUTHORIZED');
    }

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

    // Fetch Cekura and Sentry data in parallel
    const [cekuraResult, sentryErrors] = await Promise.all([
      fetchCekuraCalls(startDate, endDate, environment),
      fetchSentryErrors(environment),
    ]);

    // Get all correlation IDs for additional data fetches
    const correlationIds = [...cekuraResult.calls.keys()];

    // Fetch caller_type and transfers from database in parallel
    const [callerTypeMap, transfersMap] = await Promise.all([
      fetchCallerTypes(correlationIds, environment),
      fetchTransfers(correlationIds, environment),
    ]);

    // Merge all data by correlation_id and separate by status
    const successCalls: EODCallRawData[] = [];
    const failureCalls: EODCallRawData[] = [];

    for (const [correlationId, cekuraData] of cekuraResult.calls) {
      const sentryErrorsForCall = sentryErrors.get(correlationId) || [];
      const callerType = callerTypeMap.get(correlationId) || null;
      const transfers = transfersMap.get(correlationId) || [];

      const callData: EODCallRawData = {
        correlation_id: correlationId,
        cekura: cekuraData,
        sentry: {
          errors: sentryErrorsForCall,
        },
        caller_type: callerType,
        transfers,
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
