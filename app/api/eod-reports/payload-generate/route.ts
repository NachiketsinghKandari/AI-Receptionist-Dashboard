/**
 * EOD Report generation API route
 * Fetches data from Cekura, Sentry, and local database (calls, transfers_details)
 * Merges by correlation_id
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/api/auth';
import { decodeBase64Payload, errorResponse } from '@/lib/api/utils';
import { getSupabaseClient } from '@/lib/supabase/client';
import type { Environment } from '@/lib/constants';
import type {
  EODRawData,
  EODCallRawData,
  EODStructuredOutput,
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
 * Map DB transfer_type to EODTransferData mode
 */
function mapTransferType(transferType: string | null): EODTransferData['mode'] {
  switch (transferType) {
    case 'voicemail':
      return 'transfer_experimental_voicemail';
    case 'has_conversation':
    case 'two_way_opt_in':
      return 'transfer_experimental_pickup';
    default:
      return 'transfer_direct';
  }
}

/**
 * Derive transfer result from DB status and error message.
 * "failed due to user hangup" in error_message → cancelled.
 */
function deriveTransferResult(
  transferStatus: string | null,
  errorMessage: string | null
): string {
  if (errorMessage?.toLowerCase().includes('failed due to user hangup')) {
    return 'cancelled';
  }
  return transferStatus || 'unknown';
}

/**
 * Check if a structured output result indicates a tool call failure.
 * Failure cases:
 * - result === "failure" (string)
 * - result === false (boolean)
 * - result is an object with a "failure" key whose value is not "0"
 * Ignored: result === "no_search" (not a failure)
 */
function isStructuredOutputFailure(result: unknown): boolean {
  if (result === 'no_search') return false;
  if (result === 'failure') return true;
  if (result === false) return true;
  if (typeof result === 'object' && result !== null && 'failure' in result) {
    const failureVal = (result as Record<string, unknown>).failure;
    return failureVal !== '0' && failureVal !== 0;
  }
  return false;
}

/**
 * Parse structuredOutputs from a webhook payload into EODStructuredOutput array.
 * structuredOutputs is a Record of UUID keys, each containing { name, result }.
 * Returns the parsed outputs and whether any indicate failure.
 */
function parseStructuredOutputs(
  structuredOutputs: Record<string, unknown> | undefined
): { outputs: EODStructuredOutput[]; hasFailure: boolean } {
  if (!structuredOutputs) return { outputs: [], hasFailure: false };

  const outputs: EODStructuredOutput[] = [];
  let hasFailure = false;

  for (const value of Object.values(structuredOutputs)) {
    if (typeof value !== 'object' || value === null) continue;
    const entry = value as Record<string, unknown>;
    const name = entry.name;
    const result = entry.result;
    if (typeof name !== 'string') continue;

    outputs.push({ name, result });

    if (result !== 'no_search' && isStructuredOutputFailure(result)) {
      hasFailure = true;
    }
  }

  return { outputs, hasFailure };
}

/**
 * Fetch webhook payloads (end-of-call-report) for given correlation IDs
 * and extract structuredOutputs from each.
 */
async function fetchStructuredOutputs(
  correlationIds: string[],
  environment: Environment
): Promise<Map<string, { outputs: EODStructuredOutput[]; hasFailure: boolean }>> {
  const result = new Map<string, { outputs: EODStructuredOutput[]; hasFailure: boolean }>();
  if (correlationIds.length === 0) return result;

  const supabase = getSupabaseClient(environment);
  const batchSize = 100;

  for (let i = 0; i < correlationIds.length; i += batchSize) {
    const batch = correlationIds.slice(i, i + batchSize);
    const { data, error } = await supabase
      .from('webhook_dumps')
      .select('platform_call_id, payload')
      .in('platform_call_id', batch)
      .eq('webhook_type', 'end-of-call-report');

    if (error) {
      console.error('Error fetching webhook payloads:', error);
      continue;
    }

    for (const row of data || []) {
      if (!row.platform_call_id) continue;
      const decoded = decodeBase64Payload(row.payload);
      const message = decoded?.message as Record<string, unknown> | undefined;
      const artifact = message?.artifact as Record<string, unknown> | undefined;
      const structuredOutputs = artifact?.structuredOutputs as Record<string, unknown> | undefined;
      const parsed = parseStructuredOutputs(structuredOutputs);
      result.set(row.platform_call_id, parsed);
    }
  }

  return result;
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

  let nextUrl: string | null = `https://api.cekura.ai/observability/v1/call-logs/?timestamp_from=${encodeURIComponent(startDate)}&timestamp_to=${encodeURIComponent(endDate)}&agent_id=${agentId}&page_size=100`;

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
  startDate: string,
  endDate: string,
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
  params.set('start', startDate);
  params.set('end', endDate);
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
 * Parse duration string "MM:SS" or "HH:MM:SS" to seconds
 */
function parseDurationToSeconds(duration: string | null): number {
  if (!duration) return 0;
  const parts = duration.split(':').map(Number);
  if (parts.length === 2) {
    // MM:SS
    return parts[0] * 60 + parts[1];
  } else if (parts.length === 3) {
    // HH:MM:SS
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  return 0;
}

/**
 * Check if cekura evaluation indicates disconnection
 * Disconnection rate metric: score = 5 means NOT disconnected, anything else means disconnected
 */
function checkIsDisconnected(cekura: CekuraCallRawData): boolean {
  if (!cekura.evaluation?.metrics) return false;
  const metric = cekura.evaluation.metrics.find(m => m.name === 'Disconnection rate');
  if (!metric || metric.score === undefined || metric.score === null) return false;
  return metric.score !== 5;
}

interface EmailInfo {
  no_action_needed: boolean;
  message_taken: boolean;
}

/**
 * Fetch caller_type and email info from calls + email_logs tables
 * Combined into one function to avoid duplicate calls table queries
 */
async function fetchCallsInfo(
  correlationIds: string[],
  environment: Environment
): Promise<{ callerTypes: Map<string, string>; emailInfo: Map<string, EmailInfo> }> {
  const callerTypes = new Map<string, string>();
  const emailInfo = new Map<string, EmailInfo>();

  if (correlationIds.length === 0) {
    return { callerTypes, emailInfo };
  }

  const supabase = getSupabaseClient(environment);

  // Initialize all email info as false
  for (const id of correlationIds) {
    emailInfo.set(id, { no_action_needed: false, message_taken: false });
  }

  // Single query to calls table for both caller_type AND call IDs (for email_logs join)
  const batchSize = 100;
  const callIdToCorrelationId = new Map<number, string>();

  for (let i = 0; i < correlationIds.length; i += batchSize) {
    const batch = correlationIds.slice(i, i + batchSize);
    const { data, error } = await supabase
      .from('calls')
      .select('id, platform_call_id, call_type')
      .in('platform_call_id', batch);

    if (error) {
      console.error('Error fetching calls info:', error);
      continue;
    }

    for (const row of data || []) {
      if (row.platform_call_id) {
        if (row.id) {
          callIdToCorrelationId.set(row.id, row.platform_call_id);
        }
        if (row.call_type) {
          callerTypes.set(row.platform_call_id, row.call_type);
        }
      }
    }
  }

  if (callIdToCorrelationId.size === 0) {
    return { callerTypes, emailInfo };
  }

  // Fetch email_logs for these call_ids
  const callIds = [...callIdToCorrelationId.keys()];
  for (let i = 0; i < callIds.length; i += batchSize) {
    const batch = callIds.slice(i, i + batchSize);
    const { data, error } = await supabase
      .from('email_logs')
      .select('call_id, subject, body')
      .in('call_id', batch);

    if (error) {
      console.error('Error fetching email logs:', error);
      continue;
    }

    for (const row of data || []) {
      if (!row.call_id) continue;
      const correlationId = callIdToCorrelationId.get(row.call_id);
      if (!correlationId) continue;

      const current = emailInfo.get(correlationId) || { no_action_needed: false, message_taken: false };

      // Check subject for "No action needed" (case insensitive)
      if (row.subject && row.subject.toLowerCase().includes('no action needed')) {
        current.no_action_needed = true;
      }

      // Check body for "took a message" (case insensitive)
      if (row.body && row.body.toLowerCase().includes('took a message')) {
        current.message_taken = true;
      }

      emailInfo.set(correlationId, current);
    }
  }

  return { callerTypes, emailInfo };
}

/**
 * Fetch transfer data from the transfers_details table for given correlation IDs.
 * Uses transferred_to_name as the destination instead of parsing webhook payloads.
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

  const batchSize = 100;
  for (let i = 0; i < correlationIds.length; i += batchSize) {
    const batch = correlationIds.slice(i, i + batchSize);
    const { data, error } = await supabase
      .from('transfers_details')
      .select('transferred_to_name, transfer_type, transfer_status, error_message, calls!inner(platform_call_id)')
      .in('calls.platform_call_id', batch);

    if (error) {
      console.error('Error fetching transfers:', error);
      continue;
    }

    for (const row of data || []) {
      const calls = row.calls as unknown as { platform_call_id: string } | null;
      const correlationId = calls?.platform_call_id;
      if (!correlationId) continue;

      const existing = transfersMap.get(correlationId) || [];
      existing.push({
        destination: row.transferred_to_name || 'Unknown',
        mode: mapTransferType(row.transfer_type),
        result: deriveTransferResult(row.transfer_status, row.error_message),
      });
      transfersMap.set(correlationId, existing);
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
      fetchSentryErrors(startDate, endDate, environment),
    ]);

    // Get all correlation IDs for additional data fetches
    const correlationIds = [...cekuraResult.calls.keys()];

    // Fetch calls info (caller_type + email info), transfers, and structured outputs in parallel
    const [callsInfo, transfersMap, structuredOutputsMap] = await Promise.all([
      fetchCallsInfo(correlationIds, environment),
      fetchTransfers(correlationIds, environment),
      fetchStructuredOutputs(correlationIds, environment),
    ]);
    const { callerTypes: callerTypeMap, emailInfo: emailInfoMap } = callsInfo;

    // Merge all data by correlation_id and separate by status
    const successCalls: EODCallRawData[] = [];
    const failureCalls: EODCallRawData[] = [];

    // Aggregate counters
    let timeSavedSeconds = 0;
    let totalCallTimeSeconds = 0;
    let messagesTakenCount = 0;
    let disconnectedCount = 0;
    let csEscalationCount = 0;

    // Transfer report counters
    let transferAttemptCount = 0;
    let transferSuccessCount = 0;
    const transferDestinationStats = new Map<string, { attempts: number; failed: number }>();

    for (const [correlationId, cekuraData] of cekuraResult.calls) {
      const sentryErrorsForCall = sentryErrors.get(correlationId) || [];
      const callerType = callerTypeMap.get(correlationId) || null;
      const transfers = transfersMap.get(correlationId) || [];
      const emailInfo = emailInfoMap.get(correlationId) || { no_action_needed: false, message_taken: false };
      const isDisconnected = checkIsDisconnected(cekuraData);
      const structuredOutputData = structuredOutputsMap.get(correlationId) || { outputs: [], hasFailure: false };

      const callData: EODCallRawData = {
        correlation_id: correlationId,
        caller_type: callerType,
        no_action_needed: emailInfo.no_action_needed,
        message_taken: emailInfo.message_taken,
        is_disconnected: isDisconnected,
        structured_outputs: structuredOutputData.outputs,
        structured_output_failure: structuredOutputData.hasFailure,
        cekura: cekuraData,
        sentry: {
          errors: sentryErrorsForCall,
        },
        transfers,
      };

      // Calculate aggregates
      const callDuration = parseDurationToSeconds(cekuraData.duration);
      totalCallTimeSeconds += callDuration;
      if (emailInfo.no_action_needed) {
        timeSavedSeconds += callDuration;
      }
      if (emailInfo.message_taken) {
        messagesTakenCount++;
      }
      if (isDisconnected) {
        disconnectedCount++;
      }

      // Calculate transfer report aggregates
      for (const transfer of transfers) {
        transferAttemptCount++;
        if (transfer.result === 'completed') {
          transferSuccessCount++;
        }
        const current = transferDestinationStats.get(transfer.destination) || { attempts: 0, failed: 0 };
        current.attempts++;
        if (transfer.result !== 'completed') {
          current.failed++;
        }
        transferDestinationStats.set(transfer.destination, current);
      }

      // Count CS escalations: transferred to "Customer Success" AND has structured output failure
      if (structuredOutputData.hasFailure) {
        const hasCSTransfer = transfers.some(
          t => t.destination.toLowerCase() === 'customer success'
        );
        if (hasCSTransfer) {
          csEscalationCount++;
        }
      }

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

    // Calculate disconnection rate as percentage
    const totalCalls = cekuraResult.count;
    const disconnectionRate = totalCalls > 0 ? (disconnectedCount / totalCalls) * 100 : 0;

    // Build transfer_map sorted by count descending
    const sortedTransferEntries = [...transferDestinationStats.entries()]
      .sort((a, b) => b[1].attempts - a[1].attempts);
    const transferMap: Record<string, { attempts: number; failed: number }> = {};
    for (const [destination, stats] of sortedTransferEntries) {
      transferMap[destination] = stats;
    }

    const rawData: EODRawData = {
      count: cekuraResult.count,
      time_saved: timeSavedSeconds,
      total_call_time: totalCallTimeSeconds,
      messages_taken: messagesTakenCount,
      disconnection_rate: Math.round(disconnectionRate * 100) / 100, // Round to 2 decimal places
      failure_count: failureCalls.length,
      cs_escalation_count: csEscalationCount,
      transfers_report: {
        attempt_count: transferAttemptCount,
        success_count: transferSuccessCount,
        transfer_map: transferMap,
      },
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
