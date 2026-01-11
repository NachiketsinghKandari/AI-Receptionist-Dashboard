/**
 * Transfers API route - ported from shared.py:get_transfers()
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
} from '@/lib/api/utils';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const env = (searchParams.get('env') || 'production') as Environment;

    // Parse and validate parameters
    const callId = parseIntOrNull(searchParams.get('callId'));
    const firmId = parseIntOrNull(searchParams.get('firmId'));
    const status = searchParams.get('status');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const search = searchParams.get('search')?.trim() || null;

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
    if (startDate) {
      query = query.gte('created_at', startDate);
    }
    if (endDate) {
      query = query.lte('created_at', endDate);
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
