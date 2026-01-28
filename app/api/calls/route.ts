/**
 * Calls API route - ported from shared.py:get_calls()
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase/client';
import { DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT, type Environment } from '@/lib/constants';
import {
  errorResponse,
  parseIntOrNull,
  parseIntOrDefault,
  validatePagination,
  buildSearchOrCondition,
  isValidInt4,
  decodeBase64Payload,
} from '@/lib/api/utils';
import { hasMultipleTransfers } from '@/lib/webhook-utils';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const env = (searchParams.get('env') || 'production') as Environment;

    // Parse and validate parameters
    const firmId = parseIntOrNull(searchParams.get('firmId'));
    const callType = searchParams.get('callType');
    const transferType = searchParams.get('transferType');
    const platformCallId = searchParams.get('platformCallId')?.trim() || null;
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const search = searchParams.get('search')?.trim() || null;
    const multipleTransfers = searchParams.get('multipleTransfers') === 'true';
    // Cekura status filter - comma-separated list of correlation IDs
    const correlationIds = searchParams.get('correlationIds')?.trim() || null;

    const { limit, offset } = validatePagination(
      parseIntOrDefault(searchParams.get('limit'), DEFAULT_PAGE_LIMIT),
      parseIntOrDefault(searchParams.get('offset'), 0),
      MAX_PAGE_LIMIT
    );

    // Sorting parameters
    const sortBy = searchParams.get('sortBy') || 'started_at';
    const sortOrder = searchParams.get('sortOrder') || 'desc';
    const validSortColumns = ['id', 'started_at', 'call_duration'];
    const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'started_at';

    const client = getSupabaseClient(env);

    // If filtering by transfer_type, get call IDs that have transfers with that type
    let callIdsFilter: number[] | null = null;
    if (transferType && transferType !== 'Off' && transferType !== 'All') {
      const transfersResponse = await client
        .from('transfers_details')
        .select('call_id')
        .eq('transfer_type', transferType);

      if (transfersResponse.error) {
        console.error('Error fetching transfers for filter:', transfersResponse.error);
        return errorResponse('Failed to fetch transfers', 500, 'TRANSFER_FETCH_ERROR');
      }

      if (transfersResponse.data && transfersResponse.data.length > 0) {
        callIdsFilter = [...new Set(transfersResponse.data.map((t) => t.call_id))];
      } else {
        // No calls match this transfer type
        return NextResponse.json({
          data: [],
          total: 0,
          limit,
          offset,
        });
      }
    }

    // If filtering for multiple transfers, find platform_call_ids from webhooks with 2+ transfers
    let platformCallIdsWithMultipleTransfers: string[] | null = null;
    if (multipleTransfers) {
      let webhooksQuery = client
        .from('webhook_dumps')
        .select('platform_call_id, payload');

      // Apply the same date filters to webhooks query
      if (startDate) {
        webhooksQuery = webhooksQuery.gte('received_at', startDate);
      }
      if (endDate) {
        webhooksQuery = webhooksQuery.lte('received_at', endDate);
      }

      const webhooksResponse = await webhooksQuery;

      if (webhooksResponse.error) {
        console.error('Error fetching webhooks for multiple transfers filter:', webhooksResponse.error);
        return errorResponse('Failed to fetch webhooks', 500, 'WEBHOOK_FETCH_ERROR');
      }

      if (webhooksResponse.data && webhooksResponse.data.length > 0) {
        // Find webhooks with 2+ transfers in their payload
        const platformCallIds = webhooksResponse.data
          .filter((w) => {
            const payload = decodeBase64Payload(w.payload);
            return hasMultipleTransfers(payload as Record<string, unknown>);
          })
          .map((w) => w.platform_call_id)
          .filter((id): id is string => id !== null);

        platformCallIdsWithMultipleTransfers = [...new Set(platformCallIds)];

        if (platformCallIdsWithMultipleTransfers.length === 0) {
          return NextResponse.json({
            data: [],
            total: 0,
            limit,
            offset,
          });
        }
      } else {
        // No webhooks at all
        return NextResponse.json({
          data: [],
          total: 0,
          limit,
          offset,
        });
      }
    }

    // Build base query - select only needed columns for list view
    let query = client
      .from('calls')
      .select(
        'id, platform_call_id, caller_name, phone_number, call_type, status, started_at, call_duration, firm_id, platform',
        { count: 'exact' }
      );

    // Apply filters
    if (firmId !== null) {
      query = query.eq('firm_id', firmId);
    }
    if (callType && callType !== 'All') {
      query = query.eq('call_type', callType);
    }
    if (platformCallId) {
      query = query.eq('platform_call_id', platformCallId);
    }
    if (callIdsFilter) {
      query = query.in('id', callIdsFilter);
    }
    if (platformCallIdsWithMultipleTransfers) {
      query = query.in('platform_call_id', platformCallIdsWithMultipleTransfers);
    }
    // Filter by specific correlation IDs (for Cekura status filtering)
    if (correlationIds) {
      const ids = correlationIds.split(',').filter(id => id.length > 0);
      if (ids.length === 0) {
        // No matching correlation IDs - return empty result
        return NextResponse.json({
          data: [],
          total: 0,
          limit,
          offset,
        });
      }
      query = query.in('platform_call_id', ids);
    }
    if (startDate) {
      query = query.gte('started_at', startDate);
    }
    if (endDate) {
      query = query.lte('started_at', endDate);
    }

    // Search across multiple columns with properly escaped terms
    if (search) {
      const searchColumns = ['caller_name', 'phone_number', 'summary', 'platform_call_id'];
      let orCondition = buildSearchOrCondition(searchColumns, search);

      // If the search term is a valid integer, also search by ID
      if (isValidInt4(search)) {
        orCondition += `,id.eq.${search}`;
      }

      query = query.or(orCondition);
    }

    // Execute with sorting and pagination
    query = query.order(sortColumn, { ascending: sortOrder === 'asc' }).range(offset, offset + limit - 1);

    const response = await query;

    if (response.error) {
      console.error('Error fetching calls:', response.error);
      return errorResponse('Failed to fetch calls', 500, 'CALLS_FETCH_ERROR');
    }

    return NextResponse.json({
      data: response.data || [],
      total: response.count || 0,
      limit,
      offset,
    });
  } catch (error) {
    console.error('Calls API error:', error);
    return errorResponse('Internal server error', 500, 'INTERNAL_ERROR');
  }
}
