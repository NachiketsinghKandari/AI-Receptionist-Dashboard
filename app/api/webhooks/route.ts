/**
 * Webhooks API route - ported from shared.py:get_webhooks()
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
  decodeBase64Payload,
} from '@/lib/api/utils';
import { hasMultipleTransfers } from '@/lib/webhook-utils';

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
    const platform = searchParams.get('platform');
    const platformCallId = searchParams.get('platformCallId')?.trim() || null;
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const search = searchParams.get('search')?.trim() || null;
    const multipleTransfers = searchParams.get('multipleTransfers') === 'true';

    const { limit, offset } = validatePagination(
      parseIntOrDefault(searchParams.get('limit'), DEFAULT_PAGE_LIMIT),
      parseIntOrDefault(searchParams.get('offset'), 0),
      MAX_PAGE_LIMIT
    );

    // Sorting parameters
    const sortBy = searchParams.get('sortBy') || 'received_at';
    const sortOrder = searchParams.get('sortOrder') || 'desc';
    const validSortColumns = ['id', 'received_at'];
    const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'received_at';

    const client = getSupabaseClient(env);

    // When filtering for multiple transfers, we need to fetch all matching webhooks,
    // filter by payload content, then apply pagination
    if (multipleTransfers) {
      let query = client
        .from('webhook_dumps')
        .select('id, call_id, platform, platform_call_id, webhook_type, received_at, payload');

      if (callId !== null) {
        query = query.eq('call_id', callId);
      }
      if (platform && platform !== 'All') {
        query = query.eq('platform', platform);
      }
      if (platformCallId) {
        query = query.eq('platform_call_id', platformCallId);
      }
      if (startDate) {
        query = query.gte('received_at', startDate);
      }
      if (endDate) {
        query = query.lte('received_at', endDate);
      }

      // Search filter
      if (search) {
        const searchColumns = ['webhook_type', 'platform', 'platform_call_id'];
        let orCondition = buildSearchOrCondition(searchColumns, search);
        if (isValidInt4(search)) {
          orCondition += `,id.eq.${search},call_id.eq.${search}`;
        }
        query = query.or(orCondition);
      }

      query = query.order(sortColumn, { ascending: sortOrder === 'asc' });

      const response = await query;

      if (response.error) {
        console.error('Error fetching webhooks:', response.error);
        return errorResponse('Failed to fetch webhooks', 500, 'WEBHOOKS_FETCH_ERROR');
      }

      // Decode payloads and filter by transfer count >= 2
      const webhooksWithDecodedPayload = (response.data || [])
        .map((webhook) => ({
          ...webhook,
          payload: decodeBase64Payload(webhook.payload),
        }))
        .filter((webhook) => hasMultipleTransfers(webhook.payload as Record<string, unknown>));

      // Apply pagination to filtered results
      const total = webhooksWithDecodedPayload.length;
      const paginatedData = webhooksWithDecodedPayload.slice(offset, offset + limit);

      return NextResponse.json({
        data: paginatedData,
        total,
        limit,
        offset,
      });
    }

    let query = client
      .from('webhook_dumps')
      .select('id, call_id, platform, platform_call_id, webhook_type, received_at, payload', {
        count: 'exact',
      });

    if (callId !== null) {
      query = query.eq('call_id', callId);
    }
    if (platform && platform !== 'All') {
      query = query.eq('platform', platform);
    }
    if (platformCallId) {
      query = query.eq('platform_call_id', platformCallId);
    }
    if (startDate) {
      query = query.gte('received_at', startDate);
    }
    if (endDate) {
      query = query.lte('received_at', endDate);
    }

    // Search across multiple columns with properly escaped terms
    if (search) {
      const searchColumns = ['webhook_type', 'platform', 'platform_call_id'];
      let orCondition = buildSearchOrCondition(searchColumns, search);

      // If the search term is a valid integer, also search by ID and call_id
      if (isValidInt4(search)) {
        orCondition += `,id.eq.${search}`;
        // call_id can be null, so only add if it's a valid int
        orCondition += `,call_id.eq.${search}`;
      }

      query = query.or(orCondition);
    }

    query = query.order(sortColumn, { ascending: sortOrder === 'asc' }).range(offset, offset + limit - 1);

    const response = await query;

    if (response.error) {
      console.error('Error fetching webhooks:', response.error);
      return errorResponse('Failed to fetch webhooks', 500, 'WEBHOOKS_FETCH_ERROR');
    }

    // Decode base64-encoded payloads
    const webhooksWithDecodedPayload = (response.data || []).map((webhook) => ({
      ...webhook,
      payload: decodeBase64Payload(webhook.payload),
    }));

    return NextResponse.json({
      data: webhooksWithDecodedPayload,
      total: response.count || 0,
      limit,
      offset,
    });
  } catch (error) {
    console.error('Webhooks API error:', error);
    return errorResponse('Internal server error', 500, 'INTERNAL_ERROR');
  }
}
