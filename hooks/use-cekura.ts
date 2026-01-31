'use client';

import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEnvironment } from '@/components/providers/environment-provider';
import { CACHE_TTL_DATA } from '@/lib/constants';

// Types for Cekura call data
export interface CekuraMetric {
  name: string;
  score: number;
  explanation: string;
}

export interface CekuraCallData {
  cekuraId: number;
  status: string;
  feedback: string | null;
  metrics: CekuraMetric[];
  // Error-related metrics like Transcription Accuracy
  errorMetrics: CekuraMetric[];
}

interface CekuraApiResponse {
  calls: Record<string, CekuraCallData>; // correlation_id -> call data
  count: number;
  totalCount: number;
  hasMore: boolean;
  page: number;
  pageSize: number;
  agentId: number;
}

// Cekura agent IDs by environment (for building URLs)
const CEKURA_AGENT_IDS: Record<string, number> = {
  production: 10779,
  staging: 11005,
};

async function fetchCekuraCallData(
  startDate: string,
  endDate: string,
  environment: string,
  options?: { page?: number; pageSize?: number; fetchAll?: boolean }
): Promise<CekuraApiResponse> {
  const params = new URLSearchParams({
    startDate,
    endDate,
    environment,
  });

  if (options?.page) params.set('page', options.page.toString());
  if (options?.pageSize) params.set('pageSize', options.pageSize.toString());
  if (options?.fetchAll) params.set('fetchAll', 'true');

  const response = await fetch(`/api/cekura/call-mapping?${params}`);
  if (!response.ok) {
    throw new Error('Failed to fetch Cekura call data');
  }
  return response.json();
}

const PAGE_SIZE = 25;

/**
 * Hook to fetch Cekura call data with progressive loading.
 * First fetches page 1 (fast), then background fetches all remaining data.
 * Returns merged results from both queries.
 */
export function useCekuraCallMapping(startDate: string | null, endDate: string | null) {
  const { environment } = useEnvironment();

  // First query: fetch just page 1 (fast initial load - 25 items)
  const firstPageQuery = useQuery({
    queryKey: ['cekura', 'call-data', 'page1', startDate, endDate, environment],
    queryFn: () => fetchCekuraCallData(startDate!, endDate!, environment, { page: 1, pageSize: PAGE_SIZE }),
    enabled: !!startDate && !!endDate,
    staleTime: CACHE_TTL_DATA * 1000,
  });

  // Second query: fetch all data (background load)
  // Only fetch if page 1 indicates there's more data
  const hasMoreData = firstPageQuery.data?.hasMore === true;
  const fullQuery = useQuery({
    queryKey: ['cekura', 'call-data', 'full', startDate, endDate, environment],
    queryFn: () => fetchCekuraCallData(startDate!, endDate!, environment, { fetchAll: true, pageSize: PAGE_SIZE }),
    enabled: !!startDate && !!endDate && hasMoreData && !firstPageQuery.isLoading,
    staleTime: CACHE_TTL_DATA * 1000,
  });

  // Merge call data: full query takes precedence when available
  const mergedData = useMemo(() => {
    const firstPageCalls: Record<string, CekuraCallData> = firstPageQuery.data?.calls || {};
    const fullCalls: Record<string, CekuraCallData> = fullQuery.data?.calls || {};
    const agentId = fullQuery.data?.agentId || firstPageQuery.data?.agentId || CEKURA_AGENT_IDS.production;

    // Merge: start with first page, overlay with full (full has complete data)
    const merged = { ...firstPageCalls, ...fullCalls };

    return {
      calls: new Map(Object.entries(merged)),
      agentId,
    };
  }, [firstPageQuery.data, fullQuery.data]);

  // Loading states
  const isInitialLoading = firstPageQuery.isLoading;
  const isBackfilling = hasMoreData && fullQuery.isLoading;
  const isFullyLoaded = !isInitialLoading && (!hasMoreData || fullQuery.isSuccess);

  // Error state - helps debug API issues
  const hasError = firstPageQuery.isError || fullQuery.isError;
  const error = firstPageQuery.error || fullQuery.error;

  return {
    data: mergedData,
    isLoading: isInitialLoading,
    isBackfilling,
    isFullyLoaded,
    hasError,
    error,
  };
}

/**
 * Build a Cekura dashboard URL for a specific call.
 */
export function buildCekuraUrl(cekuraCallId: number, environment: string): string {
  const agentId = CEKURA_AGENT_IDS[environment] || CEKURA_AGENT_IDS.production;
  return `https://dashboard.cekura.ai/dashboard/1939/3184/${agentId}/calls?page=1&pageSize=30&callId=${cekuraCallId}`;
}

/**
 * Update feedback for a Cekura call
 */
async function updateCekuraFeedback(cekuraId: number, feedback: string): Promise<void> {
  const response = await fetch('/api/cekura/feedback', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ cekuraId, feedback }),
  });

  if (!response.ok) {
    throw new Error('Failed to update feedback');
  }
}

/**
 * Hook to update feedback for a Cekura call.
 * Optimistically updates the local cache and invalidates on success.
 */
export function useCekuraFeedbackMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ cekuraId, feedback }: { cekuraId: number; feedback: string; correlationId: string }) =>
      updateCekuraFeedback(cekuraId, feedback),
    onMutate: async ({ feedback, correlationId }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['cekura', 'call-data'] });

      // Snapshot previous value
      const previousData = queryClient.getQueriesData({ queryKey: ['cekura', 'call-data'] });

      // Optimistically update all matching queries
      queryClient.setQueriesData<CekuraApiResponse>(
        { queryKey: ['cekura', 'call-data'] },
        (old) => {
          if (!old?.calls) return old;
          const updatedCalls = { ...old.calls };
          if (updatedCalls[correlationId]) {
            updatedCalls[correlationId] = {
              ...updatedCalls[correlationId],
              feedback,
            };
          }
          return { ...old, calls: updatedCalls };
        }
      );

      return { previousData };
    },
    onError: (_err, _variables, context) => {
      // Rollback on error
      if (context?.previousData) {
        context.previousData.forEach(([queryKey, data]) => {
          queryClient.setQueryData(queryKey, data);
        });
      }
    },
    onSettled: () => {
      // Invalidate to refetch
      queryClient.invalidateQueries({ queryKey: ['cekura', 'call-data'] });
    },
  });
}
