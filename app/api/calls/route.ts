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
  escapeLikePattern,
} from '@/lib/api/utils';
import type { DynamicFilter } from '@/types/api';
import { hasMultipleTransfers, hasVoicemailTransfer, hasConversationTransfer } from '@/lib/webhook-utils';

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
    const excludeTransferType = searchParams.get('excludeTransferType')?.trim() || null;
    const excludeCallType = searchParams.get('excludeCallType')?.trim() || null;
    // requireHasTransfer: 'true' = must have transfer, 'false' = must NOT have transfer, null = no filter
    const requireHasTransferParam = searchParams.get('requireHasTransfer');
    const requireHasTransfer = requireHasTransferParam === 'true' ? true : requireHasTransferParam === 'false' ? false : null;
    // Cekura status filter - comma-separated list of correlation IDs
    const correlationIds = searchParams.get('correlationIds')?.trim() || null;

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
    const sortBy = searchParams.get('sortBy') || 'started_at';
    const sortOrder = searchParams.get('sortOrder') || 'desc';
    const validSortColumns = ['id', 'started_at', 'call_duration'];
    const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'started_at';

    const client = getSupabaseClient(env);

    // If filtering by transfer_type, get call IDs that have transfers with that type
    let callIdsFilter: number[] | null = null;
    let platformCallIdsWithVoicemail: string[] | null = null;
    let platformCallIdsWithConversation: string[] | null = null;

    if (transferType && transferType !== 'Off' && transferType !== 'All') {
      if (transferType === 'voicemail' || transferType === 'has_conversation') {
        // Voicemail and has_conversation are detected from webhook payload, not from transfer_type column
        let webhooksQuery = client
          .from('webhook_dumps')
          .select('platform_call_id, payload');

        // Apply date filters to webhooks query
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
          // Find webhooks matching the filter criteria
          const filterFn = transferType === 'voicemail' ? hasVoicemailTransfer : hasConversationTransfer;
          const platformCallIds = webhooksResponse.data
            .filter((w) => {
              const payload = decodeBase64Payload(w.payload);
              return filterFn(payload as Record<string, unknown>);
            })
            .map((w) => w.platform_call_id)
            .filter((id): id is string => id !== null);

          const uniqueIds = [...new Set(platformCallIds)];

          if (transferType === 'voicemail') {
            platformCallIdsWithVoicemail = uniqueIds;
          } else {
            platformCallIdsWithConversation = uniqueIds;
          }

          if (uniqueIds.length === 0) {
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
      } else {
        // Standard transfer type filter from database
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

    // If excluding a specific transfer type (e.g., voicemail, has_conversation), find platform_call_ids to exclude
    let platformCallIdsToExcludeByTransferType: string[] | null = null;
    if (excludeTransferType) {
      if (excludeTransferType === 'voicemail' || excludeTransferType === 'has_conversation') {
        // Voicemail and has_conversation detection from webhook payloads
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

        if (!webhooksResponse.error && webhooksResponse.data) {
          const filterFn = excludeTransferType === 'voicemail' ? hasVoicemailTransfer : hasConversationTransfer;
          const idsToExclude = webhooksResponse.data
            .filter((w) => {
              const payload = decodeBase64Payload(w.payload);
              return filterFn(payload as Record<string, unknown>);
            })
            .map((w) => w.platform_call_id)
            .filter((id): id is string => id !== null);

          platformCallIdsToExcludeByTransferType = [...new Set(idsToExclude)];
        }
      } else {
        // Other transfer types - get call_ids from transfers_details table
        const transfersResponse = await client
          .from('transfers_details')
          .select('call_id')
          .eq('transfer_type', excludeTransferType);

        if (!transfersResponse.error && transfersResponse.data && transfersResponse.data.length > 0) {
          // We need to convert call_ids to exclude - we'll filter these out in the main query
          const callIdsToExclude = [...new Set(transfersResponse.data.map((t) => t.call_id))];
          // Store call IDs to exclude (we'll handle this differently)
          platformCallIdsToExcludeByTransferType = callIdsToExclude.map(id => `call:${id}`);
        }
      }
    }

    // Track call IDs to exclude by transfer type (for non-voicemail types)
    let callIdsToExcludeByTransferType: number[] | null = null;
    if (platformCallIdsToExcludeByTransferType) {
      const callIdExcludes = platformCallIdsToExcludeByTransferType
        .filter(id => id.startsWith('call:'))
        .map(id => parseInt(id.replace('call:', '')));
      if (callIdExcludes.length > 0) {
        callIdsToExcludeByTransferType = callIdExcludes;
      }
      // Filter to only keep actual platform_call_ids (not call: prefixed ones)
      platformCallIdsToExcludeByTransferType = platformCallIdsToExcludeByTransferType.filter(id => !id.startsWith('call:'));
      if (platformCallIdsToExcludeByTransferType.length === 0) {
        platformCallIdsToExcludeByTransferType = null;
      }
    }

    // Handle requireHasTransfer filter (is_empty / is_not_empty for transfer_type)
    let callIdsWithTransfers: number[] | null = null;
    let callIdsWithoutTransfers: boolean = false; // Flag to filter for calls without transfers

    if (requireHasTransfer !== null) {
      // Get all call_ids that have at least one transfer
      const transfersResponse = await client
        .from('transfers_details')
        .select('call_id');

      if (!transfersResponse.error && transfersResponse.data) {
        callIdsWithTransfers = [...new Set(transfersResponse.data.map((t) => t.call_id))];
      }

      if (requireHasTransfer === false) {
        // User wants calls WITHOUT transfers - we'll exclude the ones with transfers
        callIdsWithoutTransfers = true;
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
    if (platformCallIdsWithVoicemail) {
      query = query.in('platform_call_id', platformCallIdsWithVoicemail);
    }
    if (platformCallIdsWithConversation) {
      query = query.in('platform_call_id', platformCallIdsWithConversation);
    }
    // Filter by whether call has transfers (is_empty / is_not_empty for transfer_type)
    if (requireHasTransfer === true && callIdsWithTransfers) {
      // Only show calls that have transfers
      if (callIdsWithTransfers.length === 0) {
        return NextResponse.json({
          data: [],
          total: 0,
          limit,
          offset,
        });
      }
      query = query.in('id', callIdsWithTransfers);
    } else if (callIdsWithoutTransfers && callIdsWithTransfers && callIdsWithTransfers.length > 0) {
      // Exclude calls that have transfers (show only calls without transfers)
      query = query.not('id', 'in', `(${callIdsWithTransfers.join(',')})`);
    }
    // Exclude calls by transfer type (for "not equals" transfer type filter)
    if (platformCallIdsToExcludeByTransferType && platformCallIdsToExcludeByTransferType.length > 0) {
      // Exclude voicemail-type calls by platform_call_id
      query = query.not('platform_call_id', 'in', `(${platformCallIdsToExcludeByTransferType.map(id => `"${id}"`).join(',')})`);
    }
    if (callIdsToExcludeByTransferType && callIdsToExcludeByTransferType.length > 0) {
      // Exclude other transfer type calls by call id
      query = query.not('id', 'in', `(${callIdsToExcludeByTransferType.join(',')})`);
    }
    // Exclude calls by call_type
    if (excludeCallType) {
      query = query.neq('call_type', excludeCallType);
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

    // Apply dynamic filters
    // Valid columns that can be filtered (security: whitelist approach)
    const validFilterColumns = [
      'id',
      'platform_call_id',
      'caller_name',
      'phone_number',
      'call_type',
      'status',
      'call_duration',
      'started_at',
      'firm_id',
    ];

    for (const filter of dynamicFilters) {
      // Security: Only allow filtering on whitelisted columns
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
        case 'is_true':
          query = query.eq(field, true);
          break;
        case 'is_false':
          query = query.eq(field, false);
          break;
      }
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
