/**
 * Flagged calls count API route
 * Returns lightweight count of all flagged calls with breakdown by flag type
 * Applies default 7-day filter to match the flagged page defaults
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase/client';
import { getSentryClient } from '@/lib/sentry/client';
import { authenticateRequest } from '@/lib/api/auth';
import { errorResponse, decodeBase64Payload, parseEnvironment } from '@/lib/api/utils';
import { extractTransfersFromMessages } from '@/lib/webhook-utils';
import type { Environment } from '@/lib/constants';
import { DEFAULT_DAYS_BACK } from '@/lib/constants';
import type { FlaggedCountResponse } from '@/types/api';

const LONG_CALL_THRESHOLD_SECONDS = 300; // 5 minutes

/**
 * Get the default date range (7 days back to today)
 * Uses start of day for startDate and end of day for endDate to match page behavior
 */
function getDefaultDateRange(): { startDate: string; endDate: string } {
  const now = new Date();

  // End date: today at 23:59:59
  const endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

  // Start date: 7 days ago at 00:00:00
  const startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - DEFAULT_DAYS_BACK, 0, 0, 0);

  return {
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
  };
}

/**
 * Check if a webhook transfer result indicates failure/cancellation
 */
function isFailedTransferResult(result: string): boolean {
  const lower = result.toLowerCase();
  return (
    lower.includes('cancel') ||
    lower.includes('fail') ||
    lower.includes('error') ||
    lower.includes('timeout') ||
    lower.includes('busy') ||
    lower.includes('no answer') ||
    lower.includes('declined') ||
    lower.includes('rejected')
  );
}

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth.authenticated) {
      return errorResponse(auth.error || 'Unauthorized', 401, 'UNAUTHORIZED');
    }

    const { searchParams } = new URL(request.url);
    const env = parseEnvironment(searchParams.get('env'));

    const client = getSupabaseClient(env);
    const sentryClient = getSentryClient();

    // Apply default 7-day date filter to match the page defaults
    const { startDate, endDate } = getDefaultDateRange();

    // First, get all call IDs within the date range to filter other queries
    const { data: callsInRange } = await client
      .from('calls')
      .select('id')
      .gte('started_at', startDate)
      .lte('started_at', endDate);

    const callIdsInRange = new Set((callsInRange || []).map(c => c.id));

    if (callIdsInRange.size === 0) {
      return NextResponse.json({
        count: 0,
        breakdown: {
          sentry: 0,
          duration: 0,
          important: 0,
          transferMismatch: 0,
        },
      } as FlaggedCountResponse);
    }

    const callIdsArray = [...callIdsInRange];

    // Fetch all 4 sources in parallel
    const [importantResult, longDurationResult, mismatchResult, sentryResult] = await Promise.all([
      // 1. Important emails (filtered by calls in date range)
      client
        .from('email_logs')
        .select('call_id')
        .ilike('subject', '%[Important]%')
        .in('call_id', callIdsArray),

      // 2. Long duration calls (>5 minutes, filtered by date)
      client
        .from('calls')
        .select('id')
        .gt('call_duration', LONG_CALL_THRESHOLD_SECONDS)
        .gte('started_at', startDate)
        .lte('started_at', endDate),

      // 3. Transfer-email mismatches (filtered by calls in date range)
      fetchTransferEmailMismatchIds(client, callIdsArray),

      // 4. Sentry errors - get correlation IDs and map to call IDs (filtered by date)
      fetchSentryFlaggedCallIds(sentryClient, client, env, startDate, endDate),
    ]);

    // Extract unique call IDs from each source
    const importantCallIds = new Set(
      (importantResult.data || [])
        .map(row => row.call_id)
        .filter((id): id is number => id !== null)
    );

    const longDurationCallIds = new Set(
      (longDurationResult.data || [])
        .map(row => row.id)
        .filter((id): id is number => id !== null)
    );

    const mismatchCallIds = new Set(mismatchResult);

    const sentryCallIds = new Set(sentryResult);

    // Combine all unique call IDs
    const allFlaggedIds = new Set([
      ...importantCallIds,
      ...longDurationCallIds,
      ...mismatchCallIds,
      ...sentryCallIds,
    ]);

    const response: FlaggedCountResponse = {
      count: allFlaggedIds.size,
      breakdown: {
        sentry: sentryCallIds.size,
        duration: longDurationCallIds.size,
        important: importantCallIds.size,
        transferMismatch: mismatchCallIds.size,
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Flagged calls count API error:', error);
    return errorResponse('Internal server error', 500, 'INTERNAL_ERROR');
  }
}

/**
 * Fetch call IDs with transfer-email mismatches
 */
async function fetchTransferEmailMismatchIds(
  client: ReturnType<typeof getSupabaseClient>,
  callIdsInRange: number[]
): Promise<number[]> {
  // Get emails with "no action" in subject, filtered by calls in date range
  const { data: noActionEmails } = await client
    .from('email_logs')
    .select('call_id')
    .ilike('subject', '%no action%')
    .in('call_id', callIdsInRange);

  const noActionCallIds = [...new Set(
    (noActionEmails || [])
      .map(row => row.call_id)
      .filter((id): id is number => id !== null)
  )];

  if (noActionCallIds.length === 0) return [];

  // Get webhooks for these call IDs
  const { data: webhooks } = await client
    .from('webhook_dumps')
    .select('call_id, payload')
    .in('call_id', noActionCallIds)
    .eq('webhook_type', 'end-of-call-report');

  const mismatchedCallIds: number[] = [];

  for (const webhook of webhooks || []) {
    if (!webhook.call_id) continue;

    try {
      const decodedPayload = decodeBase64Payload(webhook.payload) as Record<string, unknown>;
      const message = decodedPayload?.message as Record<string, unknown> | undefined;
      const artifact = message?.artifact as Record<string, unknown> | undefined;
      const messages = artifact?.messages as Array<Record<string, unknown>> | undefined;

      if (messages) {
        const transfers = extractTransfersFromMessages(messages);
        const hasFailedTransfer = transfers.some(t => isFailedTransferResult(t.result));

        if (hasFailedTransfer) {
          mismatchedCallIds.push(webhook.call_id);
        }
      }
    } catch {
      // Skip webhooks with parsing errors
    }
  }

  return [...new Set(mismatchedCallIds)];
}

/**
 * Fetch call IDs with Sentry errors by mapping correlation IDs to call IDs
 */
async function fetchSentryFlaggedCallIds(
  sentryClient: ReturnType<typeof getSentryClient>,
  supabaseClient: ReturnType<typeof getSupabaseClient>,
  env: Environment,
  startDate: string,
  endDate: string
): Promise<number[]> {
  if (!sentryClient.isConfigured) return [];

  try {
    // Get correlation IDs with errors
    const sentryEnv = env === 'production' ? 'pre-prod' : 'stage';
    const correlationIds = await sentryClient.fetchErrorCorrelationIds(sentryEnv, '7d');

    if (correlationIds.length === 0) return [];

    // Map correlation IDs to call IDs, filtered by date range
    const { data } = await supabaseClient
      .from('calls')
      .select('id')
      .in('platform_call_id', correlationIds)
      .gte('started_at', startDate)
      .lte('started_at', endDate);

    return (data || []).map(row => row.id);
  } catch (error) {
    console.error('Error fetching Sentry flagged calls:', error);
    return [];
  }
}
