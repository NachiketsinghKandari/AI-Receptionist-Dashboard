/**
 * Transfers API route - ported from shared.py:get_transfers()
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase/client';
import { DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT, type Environment } from '@/lib/constants';
import { authenticateRequest } from '@/lib/api/auth';
import {
  errorResponse,
  parseIntOrNull,
  parseIntOrDefault,
  validatePagination,
  buildSearchOrCondition,
  isValidInt4,
  escapeLikePattern,
  decodeBase64Payload,
} from '@/lib/api/utils';
import type { DynamicFilter } from '@/types/api';
import { hasConversationTransfer, hasVoicemailTransfer, lastTransferMatchesCategory, type ToolCallResultCategory } from '@/lib/webhook-utils';

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth.authenticated) {
      return errorResponse(auth.error || 'Unauthorized', 401, 'UNAUTHORIZED');
    }

    const { searchParams } = new URL(request.url);
    const env = (searchParams.get('env') || 'production') as Environment;

    // Parse and validate parameters
    const callId = parseIntOrNull(searchParams.get('callId'));
    const firmId = parseIntOrNull(searchParams.get('firmId'));
    const status = searchParams.get('status');
    const transferType = searchParams.get('transferType');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const search = searchParams.get('search')?.trim() || null;
    // Tool call result filter (last transfer result: transfer_executed, transfer_cancelled, other)
    const toolCallResult = searchParams.get('toolCallResult') as ToolCallResultCategory | null;

    // Parse dynamic filters (JSON array)
    let dynamicFilters: DynamicFilter[] = [];
    const dynamicFiltersParam = searchParams.get('dynamicFilters');
    if (dynamicFiltersParam) {
      try {
        dynamicFilters = JSON.parse(dynamicFiltersParam);
      } catch (e) {
        console.error('Failed to parse dynamicFilters:', e);
      }
    }

    const { limit, offset } = validatePagination(
      parseIntOrDefault(searchParams.get('limit'), DEFAULT_PAGE_LIMIT),
      parseIntOrDefault(searchParams.get('offset'), 0),
      MAX_PAGE_LIMIT
    );

    // Sorting parameters
    const sortBy = searchParams.get('sortBy') || 'transfer_started_at';
    const sortOrder = searchParams.get('sortOrder') || 'desc';
    const validSortColumns = ['id', 'transfer_started_at'];
    const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'transfer_started_at';

    const client = getSupabaseClient(env);

    // If filtering by has_conversation or voicemail transfer type, get platform_call_ids from webhooks
    let platformCallIdsFromWebhook: string[] | null = null;
    if (transferType && (transferType === 'has_conversation' || transferType === 'voicemail')) {
      let webhooksQuery = client
        .from('webhook_dumps')
        .select('platform_call_id, payload');

      if (startDate) {
        webhooksQuery = webhooksQuery.gte('received_at', startDate);
      }
      if (endDate) {
        webhooksQuery = webhooksQuery.lte('received_at', endDate);
      }

      const webhooksResponse = await webhooksQuery;

      if (webhooksResponse.error) {
        console.error('Error fetching webhooks for transfer type filter:', webhooksResponse.error);
        return errorResponse('Failed to fetch webhooks', 500, 'WEBHOOK_FETCH_ERROR');
      }

      if (webhooksResponse.data && webhooksResponse.data.length > 0) {
        const filterFn = transferType === 'voicemail' ? hasVoicemailTransfer : hasConversationTransfer;
        const platformCallIds = webhooksResponse.data
          .filter((w) => {
            const payload = decodeBase64Payload(w.payload);
            return filterFn(payload as Record<string, unknown>);
          })
          .map((w) => w.platform_call_id)
          .filter((id): id is string => id !== null);

        platformCallIdsFromWebhook = [...new Set(platformCallIds)];

        if (platformCallIdsFromWebhook.length === 0) {
          return NextResponse.json({
            data: [],
            total: 0,
            limit,
            offset,
          });
        }
      } else {
        return NextResponse.json({
          data: [],
          total: 0,
          limit,
          offset,
        });
      }
    }

    // If filtering by tool call result (last transfer result category)
    let platformCallIdsByToolResult: string[] | null = null;
    if (toolCallResult) {
      let webhooksQuery = client
        .from('webhook_dumps')
        .select('platform_call_id, payload');

      if (startDate) {
        webhooksQuery = webhooksQuery.gte('received_at', startDate);
      }
      if (endDate) {
        webhooksQuery = webhooksQuery.lte('received_at', endDate);
      }

      const webhooksResponse = await webhooksQuery;

      if (webhooksResponse.error) {
        console.error('Error fetching webhooks for tool call result filter:', webhooksResponse.error);
        return errorResponse('Failed to fetch webhooks', 500, 'WEBHOOK_FETCH_ERROR');
      }

      if (webhooksResponse.data && webhooksResponse.data.length > 0) {
        const platformCallIds = webhooksResponse.data
          .filter((w) => {
            const payload = decodeBase64Payload(w.payload);
            return lastTransferMatchesCategory(payload as Record<string, unknown>, toolCallResult);
          })
          .map((w) => w.platform_call_id)
          .filter((id): id is string => id !== null);

        platformCallIdsByToolResult = [...new Set(platformCallIds)];

        if (platformCallIdsByToolResult.length === 0) {
          return NextResponse.json({
            data: [],
            total: 0,
            limit,
            offset,
          });
        }
      } else {
        return NextResponse.json({
          data: [],
          total: 0,
          limit,
          offset,
        });
      }
    }

    let query = client
      .from('transfers_details')
      .select(
        'id, call_id, firm_id, transfer_type, transfer_status, transferred_to_name, transferred_to_phone_number, transfer_started_at, created_at, updated_at, error_message, supervisor_identity, supervisor_answered_at, time_to_pickup_seconds, consultation_room_name, calls!inner(platform_call_id)',
        { count: 'exact' }
      );

    if (callId !== null) {
      query = query.eq('call_id', callId);
    }
    if (firmId !== null) {
      query = query.eq('firm_id', firmId);
    }
    if (status && status !== 'All') {
      query = query.eq('transfer_status', status);
    }
    // Filter by transfer_type - standard DB types or webhook-based filtering
    if (transferType && transferType !== 'Off' && transferType !== 'All') {
      if (platformCallIdsFromWebhook) {
        // Filter by platform_call_id from webhook analysis
        query = query.in('calls.platform_call_id', platformCallIdsFromWebhook);
      } else {
        // Standard transfer_type from database
        query = query.eq('transfer_type', transferType);
      }
    }
    if (startDate) {
      query = query.gte('created_at', startDate);
    }
    if (endDate) {
      query = query.lte('created_at', endDate);
    }
    // Filter by tool call result (last transfer result category)
    if (platformCallIdsByToolResult) {
      query = query.in('calls.platform_call_id', platformCallIdsByToolResult);
    }

    // Search across multiple columns with properly escaped terms
    if (search) {
      const searchColumns = [
        'transferred_to_name',
        'transferred_to_phone_number',
        'transfer_type',
        'transfer_status',
      ];
      let orCondition = buildSearchOrCondition(searchColumns, search);

      // If the search term is a valid integer, also search by ID and call_id
      if (isValidInt4(search)) {
        orCondition += `,id.eq.${search},call_id.eq.${search}`;
      }

      query = query.or(orCondition);
    }

    // Apply dynamic filters
    const validFilterColumns = [
      'id',
      'call_id',
      'transfer_type',
      'transfer_status',
      'transferred_to_name',
      'transferred_to_phone_number',
      'transfer_started_at',
      'time_to_pickup_seconds',
      'firm_id',
    ];

    for (const filter of dynamicFilters) {
      if (!validFilterColumns.includes(filter.field)) {
        continue;
      }

      const { field, condition, value } = filter;

      switch (condition) {
        case 'equals':
          query = query.eq(field, value);
          break;
        case 'not_equals':
          query = query.neq(field, value);
          break;
        case 'contains':
          query = query.ilike(field, `%${escapeLikePattern(value)}%`);
          break;
        case 'not_contains':
          query = query.not(field, 'ilike', `%${escapeLikePattern(value)}%`);
          break;
        case 'starts_with':
          query = query.ilike(field, `${escapeLikePattern(value)}%`);
          break;
        case 'ends_with':
          query = query.ilike(field, `%${escapeLikePattern(value)}`);
          break;
        case 'greater_than':
          query = query.gt(field, value);
          break;
        case 'less_than':
          query = query.lt(field, value);
          break;
        case 'greater_or_equal':
          query = query.gte(field, value);
          break;
        case 'less_or_equal':
          query = query.lte(field, value);
          break;
        case 'is_empty':
          query = query.is(field, null);
          break;
        case 'is_not_empty':
          query = query.not(field, 'is', null);
          break;
      }
    }

    query = query.order(sortColumn, { ascending: sortOrder === 'asc' }).range(offset, offset + limit - 1);

    const response = await query;

    if (response.error) {
      console.error('Error fetching transfers:', response.error);
      return errorResponse('Failed to fetch transfers', 500, 'TRANSFERS_FETCH_ERROR');
    }

    // Flatten the joined calls data to include platform_call_id directly
    const transfersWithPlatformCallId = (response.data || []).map((transfer) => {
      const { calls, ...rest } = transfer as unknown as Record<string, unknown> & { calls: { platform_call_id: string | null } };
      return {
        ...rest,
        platform_call_id: calls?.platform_call_id || null,
      };
    });

    return NextResponse.json({
      data: transfersWithPlatformCallId,
      total: response.count || 0,
      limit,
      offset,
    });
  } catch (error) {
    console.error('Transfers API error:', error);
    return errorResponse('Internal server error', 500, 'INTERNAL_ERROR');
  }
}
