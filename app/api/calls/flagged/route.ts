/**
 * Flagged calls API route
 * Returns paginated calls that are flagged by: sentry errors, transfer-email mismatches,
 * long duration (>5min), or important emails
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase/client';
import { getSentryClient } from '@/lib/sentry/client';
import { DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT, type Environment } from '@/lib/constants';
import { authenticateRequest } from '@/lib/api/auth';
import {
  errorResponse,
  parseIntOrNull,
  parseIntOrDefault,
  validatePagination,
  buildSearchOrCondition,
  isValidInt4,
  decodeBase64Payload,
} from '@/lib/api/utils';
import { extractTransfersFromMessages } from '@/lib/webhook-utils';
import type { FlagType, FlagReasons, FlaggedCallListItem } from '@/types/api';
import type { CallListItem } from '@/types/database';

const LONG_CALL_THRESHOLD_SECONDS = 300; // 5 minutes

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
    const env = (searchParams.get('env') || 'production') as Environment;

    // Parse parameters
    const firmId = parseIntOrNull(searchParams.get('firmId'));
    const flagType = searchParams.get('flagType') as FlagType | null;
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const search = searchParams.get('search')?.trim() || null;

    const { limit, offset } = validatePagination(
      parseIntOrDefault(searchParams.get('limit'), DEFAULT_PAGE_LIMIT),
      parseIntOrDefault(searchParams.get('offset'), 0),
      MAX_PAGE_LIMIT
    );

    const sortBy = searchParams.get('sortBy') || 'started_at';
    const sortOrder = searchParams.get('sortOrder') || 'desc';
    const validSortColumns = ['id', 'started_at', 'call_duration'];
    const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'started_at';

    const client = getSupabaseClient(env);
    const sentryClient = getSentryClient();

    // First, get all call IDs within the date range to filter flagged sources
    // This ensures consistency with the count endpoint
    let callsInRangeQuery = client.from('calls').select('id');
    if (startDate) {
      callsInRangeQuery = callsInRangeQuery.gte('started_at', startDate);
    }
    if (endDate) {
      callsInRangeQuery = callsInRangeQuery.lte('started_at', endDate);
    }
    const { data: callsInRange } = await callsInRangeQuery;
    const callIdsInRange = (callsInRange || []).map(c => c.id);

    if (callIdsInRange.length === 0) {
      return NextResponse.json({
        data: [],
        total: 0,
        limit,
        offset,
      });
    }

    // Fetch all flagged call IDs and their reasons in parallel (filtered by date range)
    const [importantIds, longDurationIds, mismatchIds, sentryIds] = await Promise.all([
      fetchImportantCallIds(client, callIdsInRange),
      fetchLongDurationCallIds(client, startDate, endDate),
      fetchTransferEmailMismatchIds(client, callIdsInRange),
      fetchSentryFlaggedCallIds(sentryClient, client, env, startDate, endDate),
    ]);

    // Build a map of call ID -> flag reasons
    const flagReasonsMap = new Map<number, FlagReasons>();

    const initFlagReasons = (): FlagReasons => ({
      sentry: false,
      duration: false,
      important: false,
      transferMismatch: false,
    });

    for (const id of importantIds) {
      const reasons = flagReasonsMap.get(id) || initFlagReasons();
      reasons.important = true;
      flagReasonsMap.set(id, reasons);
    }

    for (const id of longDurationIds) {
      const reasons = flagReasonsMap.get(id) || initFlagReasons();
      reasons.duration = true;
      flagReasonsMap.set(id, reasons);
    }

    for (const id of mismatchIds) {
      const reasons = flagReasonsMap.get(id) || initFlagReasons();
      reasons.transferMismatch = true;
      flagReasonsMap.set(id, reasons);
    }

    for (const id of sentryIds) {
      const reasons = flagReasonsMap.get(id) || initFlagReasons();
      reasons.sentry = true;
      flagReasonsMap.set(id, reasons);
    }

    // Filter by flag type if specified
    let filteredCallIds = [...flagReasonsMap.keys()];
    if (flagType) {
      filteredCallIds = filteredCallIds.filter(id => {
        const reasons = flagReasonsMap.get(id)!;
        return reasons[flagType];
      });
    }

    if (filteredCallIds.length === 0) {
      return NextResponse.json({
        data: [],
        total: 0,
        limit,
        offset,
      });
    }

    // Build query for flagged calls
    let query = client
      .from('calls')
      .select(
        'id, platform_call_id, caller_name, phone_number, call_type, status, started_at, call_duration, firm_id, platform',
        { count: 'exact' }
      )
      .in('id', filteredCallIds);

    // Apply additional filters (date already filtered via callIdsInRange)
    if (firmId !== null) {
      query = query.eq('firm_id', firmId);
    }

    // Search across multiple columns
    if (search) {
      const searchColumns = ['caller_name', 'phone_number', 'summary', 'platform_call_id'];
      let orCondition = buildSearchOrCondition(searchColumns, search);

      if (isValidInt4(search)) {
        orCondition += `,id.eq.${search}`;
      }

      query = query.or(orCondition);
    }

    // Execute with sorting and pagination
    query = query.order(sortColumn, { ascending: sortOrder === 'asc' }).range(offset, offset + limit - 1);

    const response = await query;

    if (response.error) {
      console.error('Error fetching flagged calls:', response.error);
      return errorResponse('Failed to fetch flagged calls', 500, 'FLAGGED_CALLS_FETCH_ERROR');
    }

    // Attach flag reasons to each call
    const flaggedCalls: FlaggedCallListItem[] = (response.data || []).map((call: CallListItem) => ({
      ...call,
      flagReasons: flagReasonsMap.get(call.id) || initFlagReasons(),
    }));

    return NextResponse.json({
      data: flaggedCalls,
      total: response.count || 0,
      limit,
      offset,
    });
  } catch (error) {
    console.error('Flagged calls API error:', error);
    return errorResponse('Internal server error', 500, 'INTERNAL_ERROR');
  }
}

/**
 * Fetch call IDs with important emails (filtered by calls in date range)
 */
async function fetchImportantCallIds(
  client: ReturnType<typeof getSupabaseClient>,
  callIdsInRange: number[]
): Promise<number[]> {
  const { data } = await client
    .from('email_logs')
    .select('call_id')
    .ilike('subject', '%[Important]%')
    .in('call_id', callIdsInRange);

  return [...new Set(
    (data || [])
      .map(row => row.call_id)
      .filter((id): id is number => id !== null)
  )];
}

/**
 * Fetch call IDs with long duration (>5 minutes, filtered by date)
 */
async function fetchLongDurationCallIds(
  client: ReturnType<typeof getSupabaseClient>,
  startDate: string | null,
  endDate: string | null
): Promise<number[]> {
  let query = client
    .from('calls')
    .select('id')
    .gt('call_duration', LONG_CALL_THRESHOLD_SECONDS);

  if (startDate) {
    query = query.gte('started_at', startDate);
  }
  if (endDate) {
    query = query.lte('started_at', endDate);
  }

  const { data } = await query;
  return (data || []).map(row => row.id);
}

/**
 * Fetch call IDs with transfer-email mismatches (filtered by calls in date range)
 */
async function fetchTransferEmailMismatchIds(
  client: ReturnType<typeof getSupabaseClient>,
  callIdsInRange: number[]
): Promise<number[]> {
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
 * Fetch call IDs with Sentry errors (filtered by date)
 */
async function fetchSentryFlaggedCallIds(
  sentryClient: ReturnType<typeof getSentryClient>,
  supabaseClient: ReturnType<typeof getSupabaseClient>,
  env: Environment,
  startDate: string | null,
  endDate: string | null
): Promise<number[]> {
  if (!sentryClient.isConfigured) return [];

  try {
    const sentryEnv = env === 'production' ? 'pre-prod' : 'stage';
    const correlationIds = await sentryClient.fetchErrorCorrelationIds(sentryEnv, '7d');

    if (correlationIds.length === 0) return [];

    let query = supabaseClient
      .from('calls')
      .select('id')
      .in('platform_call_id', correlationIds);

    if (startDate) {
      query = query.gte('started_at', startDate);
    }
    if (endDate) {
      query = query.lte('started_at', endDate);
    }

    const { data } = await query;
    return (data || []).map(row => row.id);
  } catch (error) {
    console.error('Error fetching Sentry flagged calls:', error);
    return [];
  }
}
