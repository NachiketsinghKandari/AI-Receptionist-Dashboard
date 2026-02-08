/**
 * Calls API route - ported from shared.py:get_calls()
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase/client';
import { DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT } from '@/lib/constants';
import { authenticateRequest } from '@/lib/api/auth';
import {
  errorResponse,
  parseIntOrNull,
  parseIntOrDefault,
  validatePagination,
  buildSearchOrCondition,
  isValidInt4,
  decodeBase64Payload,
  escapeLikePattern,
  parseEnvironment,
} from '@/lib/api/utils';
import type { DynamicFilter } from '@/types/api';
import { hasMultipleTransfers, hasVoicemailTransfer, hasConversationTransfer, lastTransferMatchesCategory, type ToolCallResultCategory } from '@/lib/webhook-utils';

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth.authenticated) {
      return errorResponse(auth.error || 'Unauthorized', 401, 'UNAUTHORIZED');
    }

    const { searchParams } = new URL(request.url);
    const env = parseEnvironment(searchParams.get('env'));

    // Parse and validate parameters
    const firmId = parseIntOrNull(searchParams.get('firmId'));
    const callType = searchParams.get('callType');
    // Multiple call type values (comma-separated) for OR combinator
    const callTypeValuesParam = searchParams.get('callTypeValues')?.trim() || null;
    const callTypeValues = callTypeValuesParam
      ? callTypeValuesParam.split(',').filter(v => v)
      : null;
    // true = OR (match ANY), false = AND (impossible for single-value field - will return empty)
    const callTypeUseUnion = searchParams.get('callTypeUseUnion') === 'true';
    const transferType = searchParams.get('transferType');
    // Multiple transfer type values (comma-separated)
    const transferTypeValuesParam = searchParams.get('transferTypeValues')?.trim() || null;
    const transferTypeValues = transferTypeValuesParam
      ? transferTypeValuesParam.split(',').filter(v => v)
      : null;
    // AND = intersection (must match ALL types), OR = union (must match ANY type)
    const transferTypeUseIntersection = searchParams.get('transferTypeUseIntersection') === 'true';
    const platformCallId = searchParams.get('platformCallId')?.trim() || null;
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const search = searchParams.get('search')?.trim() || null;
    const multipleTransfers = searchParams.get('multipleTransfers') === 'true';
    const excludeTransferType = searchParams.get('excludeTransferType')?.trim() || null;
    // Multiple exclude transfer type values for OR combinator (comma-separated)
    const excludeTransferTypeValuesParam = searchParams.get('excludeTransferTypeValues')?.trim() || null;
    const excludeTransferTypeValues = excludeTransferTypeValuesParam
      ? excludeTransferTypeValuesParam.split(',').filter(v => v)
      : null;
    // true = OR (exclude ANY), false = AND (exclude only if matches ALL - impossible for single-value)
    const excludeTransferTypeUseUnion = searchParams.get('excludeTransferTypeUseUnion') === 'true';
    const excludeCallType = searchParams.get('excludeCallType')?.trim() || null;
    // Multiple exclude call type values (comma-separated) for OR combinator
    const excludeCallTypeValuesParam = searchParams.get('excludeCallTypeValues')?.trim() || null;
    const excludeCallTypeValues = excludeCallTypeValuesParam
      ? excludeCallTypeValuesParam.split(',').filter(v => v)
      : null;
    // true = OR (exclude ANY), false = AND (exclude only if matches ALL - impossible for single-value)
    const excludeCallTypeUseUnion = searchParams.get('excludeCallTypeUseUnion') === 'true';
    // requireHasTransfer: 'true' = must have transfer, 'false' = must NOT have transfer, null = no filter
    const requireHasTransferParam = searchParams.get('requireHasTransfer');
    const requireHasTransfer = requireHasTransferParam === 'true' ? true : requireHasTransferParam === 'false' ? false : null;
    // Tool call result filter (last transfer result: transfer_executed, transfer_cancelled, other)
    const toolCallResult = searchParams.get('toolCallResult') as ToolCallResultCategory | null;
    // Multiple tool call result values for OR combinator (comma-separated)
    const toolCallResultValuesParam = searchParams.get('toolCallResultValues')?.trim() || null;
    const toolCallResultValues = toolCallResultValuesParam
      ? toolCallResultValuesParam.split(',').filter(v => v) as ToolCallResultCategory[]
      : null;
    // true = OR (match ANY), false = AND (impossible for single-value field - will return empty)
    const toolCallResultUseUnion = searchParams.get('toolCallResultUseUnion') === 'true';
    const excludeToolCallResult = searchParams.get('excludeToolCallResult') as ToolCallResultCategory | null;
    // Multiple exclude tool call result values for OR combinator (comma-separated)
    const excludeToolCallResultValuesParam = searchParams.get('excludeToolCallResultValues')?.trim() || null;
    const excludeToolCallResultValues = excludeToolCallResultValuesParam
      ? excludeToolCallResultValuesParam.split(',').filter(v => v) as ToolCallResultCategory[]
      : null;
    // true = OR (exclude ANY), false = AND (exclude only if matches ALL - impossible for single-value)
    const excludeToolCallResultUseUnion = searchParams.get('excludeToolCallResultUseUnion') === 'true';
    // Cekura status filter - comma-separated list of correlation IDs
    const correlationIds = searchParams.get('correlationIds')?.trim() || null;
    // Exclude correlation IDs (for is_empty filter - exclude calls WITH Cekura data)
    const excludeCorrelationIds = searchParams.get('excludeCorrelationIds')?.trim() || null;

    // Status filter parameters (for call status field)
    const status = searchParams.get('status')?.trim() || null;
    const statusValuesParam = searchParams.get('statusValues')?.trim() || null;
    const statusValues = statusValuesParam
      ? statusValuesParam.split(',').filter(v => v)
      : null;
    // true = OR (match ANY), false = AND (impossible for single-value field - will return empty)
    const statusUseUnion = searchParams.get('statusUseUnion') === 'true';
    const excludeStatus = searchParams.get('excludeStatus')?.trim() || null;
    const excludeStatusValuesParam = searchParams.get('excludeStatusValues')?.trim() || null;
    const excludeStatusValues = excludeStatusValuesParam
      ? excludeStatusValuesParam.split(',').filter(v => v)
      : null;
    // true = OR (exclude ANY), false = AND (exclude only if matches ALL - impossible for single-value)
    const excludeStatusUseUnion = searchParams.get('excludeStatusUseUnion') === 'true';

    // Feedback search: correlation IDs where Cekura feedback matches search term
    // These get added to the search OR condition so feedback matches appear alongside DB column matches
    const searchFeedbackCorrelationIdsParam = searchParams.get('searchFeedbackCorrelationIds')?.trim() || null;
    const searchFeedbackCorrelationIds = searchFeedbackCorrelationIdsParam
      ? searchFeedbackCorrelationIdsParam.split(',').filter(id => id.length > 0)
      : null;

    // Parse dynamic filters (JSON array) - each filter has its own combinator for mixed AND/OR
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
    // Support both single value and multiple values (for OR combinator)
    let callIdsFilter: number[] | null = null;
    let platformCallIdsByTransferType: string[] | null = null;

    // Combine single transferType with array (if both present, array takes precedence)
    const effectiveTransferTypes = transferTypeValues && transferTypeValues.length > 0
      ? transferTypeValues
      : (transferType && transferType !== 'Off' && transferType !== 'All') ? [transferType] : null;

    if (effectiveTransferTypes && effectiveTransferTypes.length > 0) {
      // Separate webhook-based types (voicemail, has_conversation) from DB-based types
      const webhookTypes = effectiveTransferTypes.filter(t => t === 'voicemail' || t === 'has_conversation');
      const dbTypes = effectiveTransferTypes.filter(t => t !== 'voicemail' && t !== 'has_conversation');

      // Helper to compute set intersection
      const intersectSets = <T>(sets: Set<T>[]): Set<T> => {
        if (sets.length === 0) return new Set();
        if (sets.length === 1) return sets[0];
        let result = sets[0];
        for (let i = 1; i < sets.length; i++) {
          result = new Set([...result].filter(x => sets[i].has(x)));
        }
        return result;
      };

      // For INTERSECTION (AND), we need to get matches for each type separately
      // For UNION (OR), we can batch them together
      if (transferTypeUseIntersection && effectiveTransferTypes.length > 1) {
        // INTERSECTION MODE: Get call IDs for each type, then intersect
        const callIdSetsPerType: Set<number>[] = [];
        const platformCallIdSetsPerType: Set<string>[] = [];

        // Fetch webhooks once for all webhook-based types
        let webhooksData: Array<{ platform_call_id: string | null; payload: string }> = [];
        if (webhookTypes.length > 0) {
          let webhooksQuery = client
            .from('webhook_dumps')
            .select('platform_call_id, payload');
          if (startDate) webhooksQuery = webhooksQuery.gte('received_at', startDate);
          if (endDate) webhooksQuery = webhooksQuery.lte('received_at', endDate);
          const webhooksResponse = await webhooksQuery;
          if (webhooksResponse.error) {
            console.error('Error fetching webhooks for transfer type filter:', webhooksResponse.error);
            return errorResponse('Failed to fetch webhooks', 500, 'WEBHOOK_FETCH_ERROR');
          }
          webhooksData = webhooksResponse.data || [];
        }

        // Process each type individually
        for (const transferTypeVal of effectiveTransferTypes) {
          if (transferTypeVal === 'voicemail' || transferTypeVal === 'has_conversation') {
            // Webhook-based type
            const matchingPlatformCallIds = webhooksData
              .filter((w) => {
                const payload = decodeBase64Payload(w.payload);
                if (transferTypeVal === 'voicemail') return hasVoicemailTransfer(payload as Record<string, unknown>);
                if (transferTypeVal === 'has_conversation') return hasConversationTransfer(payload as Record<string, unknown>);
                return false;
              })
              .map((w) => w.platform_call_id)
              .filter((id): id is string => id !== null);
            platformCallIdSetsPerType.push(new Set(matchingPlatformCallIds));
          } else {
            // DB-based type
            const transfersResponse = await client
              .from('transfers_details')
              .select('call_id')
              .eq('transfer_type', transferTypeVal);
            if (transfersResponse.error) {
              console.error('Error fetching transfers for filter:', transfersResponse.error);
              return errorResponse('Failed to fetch transfers', 500, 'TRANSFER_FETCH_ERROR');
            }
            const matchingCallIds = (transfersResponse.data || []).map((t) => t.call_id);
            callIdSetsPerType.push(new Set(matchingCallIds));
          }
        }

        // Compute intersections
        if (platformCallIdSetsPerType.length > 0) {
          const intersection = intersectSets(platformCallIdSetsPerType);
          platformCallIdsByTransferType = [...intersection];
        }
        if (callIdSetsPerType.length > 0) {
          const intersection = intersectSets(callIdSetsPerType);
          callIdsFilter = [...intersection];
        }

        // If intersection is empty, return no results
        const hasWebhookFilters = webhookTypes.length > 0;
        const hasDbFilters = dbTypes.length > 0;
        if ((hasWebhookFilters && (!platformCallIdsByTransferType || platformCallIdsByTransferType.length === 0)) ||
            (hasDbFilters && (!callIdsFilter || callIdsFilter.length === 0))) {
          return NextResponse.json({
            data: [],
            total: 0,
            limit,
            offset,
          });
        }
      } else {
        // UNION MODE (OR): Get all matching call IDs together
        const allMatchingPlatformCallIds: string[] = [];
        const allMatchingCallIds: number[] = [];

        // Handle webhook-based types (voicemail, has_conversation)
        if (webhookTypes.length > 0) {
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
            const platformCallIds = webhooksResponse.data
              .filter((w) => {
                const payload = decodeBase64Payload(w.payload);
                // Check if matches ANY of the webhook types (OR)
                return webhookTypes.some(t => {
                  if (t === 'voicemail') return hasVoicemailTransfer(payload as Record<string, unknown>);
                  if (t === 'has_conversation') return hasConversationTransfer(payload as Record<string, unknown>);
                  return false;
                });
              })
              .map((w) => w.platform_call_id)
              .filter((id): id is string => id !== null);

            allMatchingPlatformCallIds.push(...platformCallIds);
          }
        }

        // Handle DB-based types
        if (dbTypes.length > 0) {
          const transfersResponse = await client
            .from('transfers_details')
            .select('call_id')
            .in('transfer_type', dbTypes);

          if (transfersResponse.error) {
            console.error('Error fetching transfers for filter:', transfersResponse.error);
            return errorResponse('Failed to fetch transfers', 500, 'TRANSFER_FETCH_ERROR');
          }

          if (transfersResponse.data && transfersResponse.data.length > 0) {
            allMatchingCallIds.push(...transfersResponse.data.map((t) => t.call_id));
          }
        }

        // Combine results - for OR, we want calls matching ANY of the types
        if (allMatchingPlatformCallIds.length > 0) {
          platformCallIdsByTransferType = [...new Set(allMatchingPlatformCallIds)];
        }
        if (allMatchingCallIds.length > 0) {
          callIdsFilter = [...new Set(allMatchingCallIds)];
        }

        // If we had filters but no matches, return empty
        if (allMatchingPlatformCallIds.length === 0 && allMatchingCallIds.length === 0) {
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

    // If filtering by tool call result (last transfer result category)
    // Support both single value (toolCallResult) and multiple values (toolCallResultValues)
    // with AND/OR logic via toolCallResultUseUnion flag
    let platformCallIdsByToolResult: string[] | null = null;
    const effectiveToolCallResultValues = toolCallResultValues && toolCallResultValues.length > 0
      ? toolCallResultValues
      : toolCallResult ? [toolCallResult] : null;

    if (effectiveToolCallResultValues && effectiveToolCallResultValues.length > 0) {
      // Check for impossible AND condition (different values for single-value field)
      if (!toolCallResultUseUnion && effectiveToolCallResultValues.length > 1) {
        // AND with different values: a call can only match one result category
        // This is impossible, return empty results
        return NextResponse.json({
          data: [],
          total: 0,
          limit,
          offset,
        });
      }

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
            // For OR combinator (or single value), match ANY of the categories
            return effectiveToolCallResultValues.some(category =>
              lastTransferMatchesCategory(payload as Record<string, unknown>, category)
            );
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

    // If excluding by tool call result (last transfer result category)
    // Support both single value and multiple values with AND/OR logic
    let platformCallIdsToExcludeByToolResult: string[] | null = null;
    const effectiveExcludeToolCallResultValues = excludeToolCallResultValues && excludeToolCallResultValues.length > 0
      ? excludeToolCallResultValues
      : excludeToolCallResult ? [excludeToolCallResult] : null;

    if (effectiveExcludeToolCallResultValues && effectiveExcludeToolCallResultValues.length > 0) {
      // For OR exclude with multiple values: (result != A) OR (result != B) is always true for single-value field
      // This is a tautology - skip the filter entirely
      if (excludeToolCallResultUseUnion && effectiveExcludeToolCallResultValues.length > 1) {
        // OR exclude with different values = tautology (no filter applied)
        // Just skip setting platformCallIdsToExcludeByToolResult
      } else {
        // AND exclude: (result != A) AND (result != B) = exclude records matching A OR B
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

        if (!webhooksResponse.error && webhooksResponse.data && webhooksResponse.data.length > 0) {
          const platformCallIds = webhooksResponse.data
            .filter((w) => {
              const payload = decodeBase64Payload(w.payload);
              // For OR exclude (or single value): exclude calls matching ANY of the specified categories
              return effectiveExcludeToolCallResultValues.some(category =>
                lastTransferMatchesCategory(payload as Record<string, unknown>, category)
              );
            })
            .map((w) => w.platform_call_id)
            .filter((id): id is string => id !== null);

          platformCallIdsToExcludeByToolResult = [...new Set(platformCallIds)];
        }
      }
    }

    // If excluding specific transfer types (e.g., voicemail, has_conversation), find platform_call_ids to exclude
    // Support both single value (excludeTransferType) and multiple values (excludeTransferTypeValues) with AND/OR logic
    let platformCallIdsToExcludeByTransferType: string[] | null = null;

    // Combine single excludeTransferType with array (if both present, array takes precedence)
    const effectiveExcludeTransferTypes = excludeTransferTypeValues && excludeTransferTypeValues.length > 0
      ? excludeTransferTypeValues
      : excludeTransferType ? [excludeTransferType] : null;

    if (effectiveExcludeTransferTypes && effectiveExcludeTransferTypes.length > 0) {
      // For OR exclude with multiple values: (type != A) OR (type != B) is always true for single-value field
      // This is a tautology - skip the filter entirely
      if (excludeTransferTypeUseUnion && effectiveExcludeTransferTypes.length > 1) {
        // OR exclude with different values = tautology (no filter applied)
        // Just skip setting platformCallIdsToExcludeByTransferType
      } else {
        // AND exclude: (type != A) AND (type != B) = exclude records matching A OR B
        // Separate webhook-based types from DB-based types
        const webhookTypes = effectiveExcludeTransferTypes.filter(t => t === 'voicemail' || t === 'has_conversation');
        const dbTypes = effectiveExcludeTransferTypes.filter(t => t !== 'voicemail' && t !== 'has_conversation');

        const allIdsToExclude: string[] = [];

        // Handle webhook-based types (voicemail, has_conversation)
        if (webhookTypes.length > 0) {
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
            const idsToExclude = webhooksResponse.data
              .filter((w) => {
                const payload = decodeBase64Payload(w.payload);
                // For OR exclude (or single value): exclude calls matching ANY of the webhook types
                return webhookTypes.some(t => {
                  if (t === 'voicemail') return hasVoicemailTransfer(payload as Record<string, unknown>);
                  if (t === 'has_conversation') return hasConversationTransfer(payload as Record<string, unknown>);
                  return false;
                });
              })
              .map((w) => w.platform_call_id)
              .filter((id): id is string => id !== null);

            allIdsToExclude.push(...idsToExclude);
          }
        }

        // Handle DB-based types
        if (dbTypes.length > 0) {
          const transfersResponse = await client
            .from('transfers_details')
            .select('call_id')
            .in('transfer_type', dbTypes);

          if (!transfersResponse.error && transfersResponse.data && transfersResponse.data.length > 0) {
            // We need to convert call_ids to exclude - we'll filter these out in the main query
            const callIdsToExclude = [...new Set(transfersResponse.data.map((t) => t.call_id))];
            // Store call IDs to exclude with prefix (we'll handle this differently)
            allIdsToExclude.push(...callIdsToExclude.map(id => `call:${id}`));
          }
        }

        if (allIdsToExclude.length > 0) {
          platformCallIdsToExcludeByTransferType = [...new Set(allIdsToExclude)];
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

    // Handle call_type filtering with AND/OR logic
    // Combine single callType with array (if both present, array takes precedence)
    const effectiveCallTypes = callTypeValues && callTypeValues.length > 0
      ? callTypeValues
      : (callType && callType !== 'All') ? [callType] : null;

    if (effectiveCallTypes && effectiveCallTypes.length > 0) {
      if (effectiveCallTypes.length === 1) {
        // Single value - simple equals
        query = query.eq('call_type', effectiveCallTypes[0]);
      } else if (callTypeUseUnion) {
        // OR: match ANY of the call types
        query = query.in('call_type', effectiveCallTypes);
      } else {
        // AND with different values: impossible for single-value field
        // A call can only have one call_type, so AND with different values = no results
        return NextResponse.json({
          data: [],
          total: 0,
          limit,
          offset,
        });
      }
    }

    // Handle status filtering with AND/OR logic
    // Combine single status with array (if both present, array takes precedence)
    const effectiveStatusValues = statusValues && statusValues.length > 0
      ? statusValues
      : status ? [status] : null;

    if (effectiveStatusValues && effectiveStatusValues.length > 0) {
      if (effectiveStatusValues.length === 1) {
        // Single value - simple equals
        query = query.eq('status', effectiveStatusValues[0]);
      } else if (statusUseUnion) {
        // OR: match ANY of the status values
        query = query.in('status', effectiveStatusValues);
      } else {
        // AND with different values: impossible for single-value field
        // A call can only have one status, so AND with different values = no results
        return NextResponse.json({
          data: [],
          total: 0,
          limit,
          offset,
        });
      }
    }

    // Handle exclude status filtering with AND/OR logic
    const effectiveExcludeStatusValues = excludeStatusValues && excludeStatusValues.length > 0
      ? excludeStatusValues
      : excludeStatus ? [excludeStatus] : null;

    if (effectiveExcludeStatusValues && effectiveExcludeStatusValues.length > 0) {
      if (effectiveExcludeStatusValues.length === 1) {
        // Single value - simple not equals
        query = query.neq('status', effectiveExcludeStatusValues[0]);
      } else if (excludeStatusUseUnion) {
        // OR exclude: (status != A) OR (status != B) is always true for single-value field
        // This is a tautology - skip the filter entirely
        // We just skip the filter in this case
      } else {
        // AND exclude: (status != A) AND (status != B) = exclude records matching A OR B
        // This means: NOT IN (status1, status2, ...)
        query = query.not('status', 'in', `(${effectiveExcludeStatusValues.map(s => `"${s}"`).join(',')})`);
      }
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
    if (platformCallIdsByToolResult) {
      query = query.in('platform_call_id', platformCallIdsByToolResult);
    }
    // Filter by transfer type (webhook-based types like voicemail, has_conversation)
    if (platformCallIdsByTransferType) {
      query = query.in('platform_call_id', platformCallIdsByTransferType);
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
    // Exclude calls by call_type (with AND/OR logic)
    // Combine single excludeCallType with array (if both present, array takes precedence)
    const effectiveExcludeCallTypes = excludeCallTypeValues && excludeCallTypeValues.length > 0
      ? excludeCallTypeValues
      : excludeCallType ? [excludeCallType] : null;

    if (effectiveExcludeCallTypes && effectiveExcludeCallTypes.length > 0) {
      if (effectiveExcludeCallTypes.length === 1) {
        // Single value - simple not equals
        query = query.neq('call_type', effectiveExcludeCallTypes[0]);
      } else if (excludeCallTypeUseUnion) {
        // OR exclude: (call_type != A) OR (call_type != B) is always true for single-value field
        // This is a tautology - skip the filter entirely
        // We just skip the filter in this case
      } else {
        // AND exclude: (call_type != A) AND (call_type != B) = exclude records matching A OR B
        // This means: NOT IN (type1, type2, ...)
        query = query.not('call_type', 'in', `(${effectiveExcludeCallTypes.map(t => `"${t}"`).join(',')})`);
      }
    }
    // Exclude calls by tool call result (for "not equals" tool call result filter)
    if (platformCallIdsToExcludeByToolResult && platformCallIdsToExcludeByToolResult.length > 0) {
      query = query.not('platform_call_id', 'in', `(${platformCallIdsToExcludeByToolResult.map(id => `"${id}"`).join(',')})`);
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
    // Exclude specific correlation IDs (for is_empty filter - calls WITHOUT Cekura data)
    if (excludeCorrelationIds) {
      const excludeIds = excludeCorrelationIds.split(',').filter(id => id.length > 0);
      if (excludeIds.length > 0) {
        // Use NOT IN to exclude calls that have these correlation IDs
        // Supabase doesn't have a direct 'not.in' so we use 'or' with 'is.null' and 'not.in'
        query = query.or(`platform_call_id.is.null,platform_call_id.not.in.(${excludeIds.join(',')})`);
      }
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

      // Include calls where Cekura feedback matches the search term (computed client-side)
      if (searchFeedbackCorrelationIds && searchFeedbackCorrelationIds.length > 0) {
        orCondition += `,platform_call_id.in.(${searchFeedbackCorrelationIds.join(',')})`;
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

    // Helper function to build a PostgREST filter condition string for a single filter
    const buildFilterCondition = (filter: DynamicFilter): string | null => {
      if (!validFilterColumns.includes(filter.field)) {
        return null;
      }

      const { field, condition, value } = filter;

      switch (condition) {
        case 'equals':
          return `${field}.eq.${value}`;
        case 'not_equals':
          return `${field}.neq.${value}`;
        case 'contains':
          return `${field}.ilike.%${escapeLikePattern(value)}%`;
        case 'not_contains':
          return `${field}.not.ilike.%${escapeLikePattern(value)}%`;
        case 'starts_with':
          return `${field}.ilike.${escapeLikePattern(value)}%`;
        case 'ends_with':
          return `${field}.ilike.%${escapeLikePattern(value)}`;
        case 'greater_than':
          return `${field}.gt.${value}`;
        case 'less_than':
          return `${field}.lt.${value}`;
        case 'greater_or_equal':
          return `${field}.gte.${value}`;
        case 'less_or_equal':
          return `${field}.lte.${value}`;
        case 'is_empty':
          return `${field}.is.null`;
        case 'is_not_empty':
          return `${field}.not.is.null`;
        case 'is_true':
          return `${field}.eq.true`;
        case 'is_false':
          return `${field}.eq.false`;
        default:
          return null;
      }
    };

    // Apply dynamic filters with per-filter combinators
    // Strategy: Group consecutive AND filters, join groups with OR
    if (dynamicFilters.length > 0) {
      // Check if any filter uses OR
      const hasOrCombinator = dynamicFilters.some(f => f.combinator === 'or');

      if (hasOrCombinator) {
        // Build groups of AND conditions separated by OR
        // Example: A AND B OR C AND D => [(A,B), (C,D)] => or(and(A,B),and(C,D))
        const groups: string[][] = [];
        let currentGroup: string[] = [];

        for (const filter of dynamicFilters) {
          const condition = buildFilterCondition(filter);
          if (!condition) continue;

          if (filter.combinator === 'or' && currentGroup.length > 0) {
            // Start a new group when we hit an OR
            groups.push(currentGroup);
            currentGroup = [condition];
          } else {
            // Add to current group (AND)
            currentGroup.push(condition);
          }
        }

        // Don't forget the last group
        if (currentGroup.length > 0) {
          groups.push(currentGroup);
        }

        if (groups.length > 0) {
          // Build the final OR condition
          // Each group is ANDed together, then groups are ORed
          const groupConditions = groups.map(group => {
            if (group.length === 1) {
              return group[0];
            }
            // Multiple conditions in group - wrap in and()
            return `and(${group.join(',')})`;
          });

          // Apply the OR condition (works for single and multiple groups)
          // PostgREST will handle: or(and(A,B),and(C,D)) or just or(A,B) etc.
          query = query.or(groupConditions.join(','));
        }
      } else {
        // All AND: Apply each filter sequentially (default behavior)
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
            case 'is_true':
              query = query.eq(field, true);
              break;
            case 'is_false':
              query = query.eq(field, false);
              break;
          }
        }
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
