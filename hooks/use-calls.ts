'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { useEnvironment } from '@/components/providers/environment-provider';
import type { CallFilters, CallsResponse, CallDetailResponse } from '@/types/api';
import { CACHE_TTL_DATA } from '@/lib/constants';

async function fetchCalls(filters: CallFilters, environment: string): Promise<CallsResponse> {
  const params = new URLSearchParams();
  params.set('env', environment);

  if (filters.firmId) params.set('firmId', String(filters.firmId));
  if (filters.callType && filters.callType !== 'All') params.set('callType', filters.callType);
  // Multiple call type values for OR combinator
  if (filters.callTypeValues && filters.callTypeValues.length > 0) {
    params.set('callTypeValues', filters.callTypeValues.join(','));
  }
  if (filters.callTypeUseUnion) {
    params.set('callTypeUseUnion', 'true');
  }
  if (filters.transferType && filters.transferType !== 'Off') params.set('transferType', filters.transferType);
  if (filters.transferTypeValues && filters.transferTypeValues.length > 0) {
    params.set('transferTypeValues', filters.transferTypeValues.join(','));
  }
  if (filters.transferTypeUseIntersection) {
    params.set('transferTypeUseIntersection', 'true');
  }
  if (filters.platformCallId) params.set('platformCallId', filters.platformCallId);
  if (filters.startDate) params.set('startDate', filters.startDate);
  if (filters.endDate) params.set('endDate', filters.endDate);
  if (filters.search) params.set('search', filters.search);
  if (filters.limit) params.set('limit', String(filters.limit));
  if (filters.offset) params.set('offset', String(filters.offset));
  if (filters.sortBy) params.set('sortBy', filters.sortBy);
  if (filters.sortOrder) params.set('sortOrder', filters.sortOrder);
  if (filters.multipleTransfers) params.set('multipleTransfers', 'true');
  if (filters.correlationIds && filters.correlationIds.length > 0) {
    params.set('correlationIds', filters.correlationIds.join(','));
  }
  if (filters.excludeCorrelationIds && filters.excludeCorrelationIds.length > 0) {
    params.set('excludeCorrelationIds', filters.excludeCorrelationIds.join(','));
  }
  if (filters.dynamicFilters && filters.dynamicFilters.length > 0) {
    params.set('dynamicFilters', JSON.stringify(filters.dynamicFilters));
  }
  if (filters.excludeTransferType) {
    params.set('excludeTransferType', filters.excludeTransferType);
  }
  if (filters.excludeTransferTypeValues && filters.excludeTransferTypeValues.length > 0) {
    params.set('excludeTransferTypeValues', filters.excludeTransferTypeValues.join(','));
  }
  if (filters.excludeTransferTypeUseUnion) {
    params.set('excludeTransferTypeUseUnion', 'true');
  }
  if (filters.excludeCallType) {
    params.set('excludeCallType', filters.excludeCallType);
  }
  // Multiple exclude call type values for OR combinator
  if (filters.excludeCallTypeValues && filters.excludeCallTypeValues.length > 0) {
    params.set('excludeCallTypeValues', filters.excludeCallTypeValues.join(','));
  }
  if (filters.excludeCallTypeUseUnion) {
    params.set('excludeCallTypeUseUnion', 'true');
  }
  if (filters.requireHasTransfer !== undefined && filters.requireHasTransfer !== null) {
    params.set('requireHasTransfer', filters.requireHasTransfer ? 'true' : 'false');
  }
  if (filters.toolCallResult) {
    params.set('toolCallResult', filters.toolCallResult);
  }
  if (filters.toolCallResultValues && filters.toolCallResultValues.length > 0) {
    params.set('toolCallResultValues', filters.toolCallResultValues.join(','));
  }
  if (filters.toolCallResultUseUnion) {
    params.set('toolCallResultUseUnion', 'true');
  }
  if (filters.excludeToolCallResult) {
    params.set('excludeToolCallResult', filters.excludeToolCallResult);
  }
  if (filters.excludeToolCallResultValues && filters.excludeToolCallResultValues.length > 0) {
    params.set('excludeToolCallResultValues', filters.excludeToolCallResultValues.join(','));
  }
  if (filters.excludeToolCallResultUseUnion) {
    params.set('excludeToolCallResultUseUnion', 'true');
  }
  // Status filter parameters
  if (filters.status) {
    params.set('status', filters.status);
  }
  if (filters.statusValues && filters.statusValues.length > 0) {
    params.set('statusValues', filters.statusValues.join(','));
  }
  if (filters.statusUseUnion) {
    params.set('statusUseUnion', 'true');
  }
  if (filters.excludeStatus) {
    params.set('excludeStatus', filters.excludeStatus);
  }
  if (filters.excludeStatusValues && filters.excludeStatusValues.length > 0) {
    params.set('excludeStatusValues', filters.excludeStatusValues.join(','));
  }
  if (filters.excludeStatusUseUnion) {
    params.set('excludeStatusUseUnion', 'true');
  }
  // Feedback search: correlation IDs where feedback matches search term (added to search OR condition)
  if (filters.searchFeedbackCorrelationIds && filters.searchFeedbackCorrelationIds.length > 0) {
    params.set('searchFeedbackCorrelationIds', filters.searchFeedbackCorrelationIds.join(','));
  }

  const response = await fetch(`/api/calls?${params}`);
  if (!response.ok) throw new Error('Failed to fetch calls');
  return response.json();
}

async function fetchCallDetail(id: number | string, environment: string): Promise<CallDetailResponse> {
  // Supports both numeric ID and correlation ID (platform_call_id)
  const response = await fetch(`/api/calls/${id}?env=${environment}`);
  if (!response.ok) throw new Error('Failed to fetch call detail');
  return response.json();
}

export function useCalls(filters: CallFilters) {
  const { environment } = useEnvironment();

  // If filter has impossible condition (e.g., is_empty AND is_not_empty), return empty results
  const hasImpossibleCondition = filters.hasImpossibleCondition === true;

  return useQuery({
    queryKey: ['calls', 'list', environment, filters],
    queryFn: () => {
      // Return empty results immediately for impossible conditions
      if (hasImpossibleCondition) {
        return Promise.resolve({
          data: [],
          total: 0,
          limit: filters.limit || 25,
          offset: filters.offset || 0,
        } as CallsResponse);
      }
      return fetchCalls(filters, environment);
    },
    staleTime: CACHE_TTL_DATA * 1000,
    placeholderData: (prev) => prev,
  });
}

// Supports both numeric ID and correlation ID (platform_call_id string)
export function useCallDetail(id: number | string | null) {
  const { environment } = useEnvironment();
  return useQuery({
    queryKey: ['calls', 'detail', environment, id],
    queryFn: () => fetchCallDetail(id!, environment),
    enabled: id !== null,
    staleTime: CACHE_TTL_DATA * 1000,
  });
}

// Types for important calls API
interface ImportantCallsResponse {
  callIds: number[];
}

async function fetchImportantCallIds(environment: string): Promise<ImportantCallsResponse> {
  const response = await fetch(`/api/calls/important?env=${environment}`);
  if (!response.ok) throw new Error('Failed to fetch important calls');
  return response.json();
}

/**
 * Hook to fetch call IDs that have emails with "[Important]" in the subject
 * Used to highlight important calls in the table
 */
export function useImportantCallIds() {
  const { environment } = useEnvironment();
  return useQuery({
    queryKey: ['calls', 'important', environment],
    queryFn: () => fetchImportantCallIds(environment),
    staleTime: 60 * 1000, // 1 minute
    select: (data) => new Set(data.callIds),
  });
}

// Types for transfer-email mismatch API
interface TransferEmailMismatchResponse {
  callIds: number[];
}

async function fetchTransferEmailMismatchIds(environment: string): Promise<TransferEmailMismatchResponse> {
  const response = await fetch(`/api/calls/transfer-email-mismatch?env=${environment}`);
  if (!response.ok) throw new Error('Failed to fetch transfer-email mismatches');
  return response.json();
}

/**
 * Hook to fetch call IDs where:
 * - Email subject contains "no action"
 * - But webhook shows transfer was cancelled/failed
 * Used to highlight inconsistent calls in the table
 */
export function useTransferEmailMismatchIds() {
  const { environment } = useEnvironment();
  return useQuery({
    queryKey: ['calls', 'transfer-email-mismatch', environment],
    queryFn: () => fetchTransferEmailMismatchIds(environment),
    staleTime: 60 * 1000, // 1 minute
    select: (data) => new Set(data.callIds),
  });
}

/**
 * Hook to prefetch call details for smooth carousel navigation.
 * Returns a function that can be called with call IDs to prefetch.
 */
export function usePrefetchCallDetails() {
  const { environment } = useEnvironment();
  const queryClient = useQueryClient();

  const prefetch = useCallback(
    (callIds: (number | string)[]) => {
      callIds.forEach((id) => {
        if (id === null || id === undefined) return;

        // Only prefetch if not already in cache
        const cached = queryClient.getQueryData(['calls', 'detail', environment, id]);
        if (!cached) {
          queryClient.prefetchQuery({
            queryKey: ['calls', 'detail', environment, id],
            queryFn: () => fetchCallDetail(id, environment),
            staleTime: CACHE_TTL_DATA * 1000,
          });
        }
      });
    },
    [environment, queryClient]
  );

  return prefetch;
}

/**
 * Hook to fetch the earliest and latest started_at dates from the calls table.
 * Used to determine the Cekura fetch window when no date filter is active ("all" mode).
 */
interface CallDateRangeResponse {
  earliest: string | null;
  latest: string | null;
}

async function fetchCallDateRange(environment: string): Promise<CallDateRangeResponse> {
  const response = await fetch(`/api/calls/date-range?env=${environment}`);
  if (!response.ok) throw new Error('Failed to fetch call date range');
  return response.json();
}

export function useCallDateRange() {
  const { environment } = useEnvironment();
  return useQuery({
    queryKey: ['calls', 'date-range', environment],
    queryFn: () => fetchCallDateRange(environment),
    staleTime: 5 * 60 * 1000, // 5 minutes — date bounds change infrequently
  });
}
