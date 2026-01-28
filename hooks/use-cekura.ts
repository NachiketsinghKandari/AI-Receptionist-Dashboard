'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
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
  metrics: CekuraMetric[];
}

interface CekuraApiResponse {
  calls: Record<string, CekuraCallData>; // correlation_id -> call data
  count: number;
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
  environment: string
): Promise<CekuraApiResponse> {
  const params = new URLSearchParams({
    startDate,
    endDate,
    environment,
  });

  const response = await fetch(`/api/cekura/call-mapping?${params}`);
  if (!response.ok) {
    throw new Error('Failed to fetch Cekura call data');
  }
  return response.json();
}

/**
 * Get the start of the previous day relative to a given end date.
 * This ensures we fetch a full day's worth of calls, not just 24 hours.
 * e.g., if endDate is "2026-01-28T23:59:59Z", returns "2026-01-27T00:00:00.000Z"
 */
function getStartOfPreviousDay(dateStr: string): string {
  const date = new Date(dateStr);
  date.setUTCDate(date.getUTCDate() - 1);
  date.setUTCHours(0, 0, 0, 0);
  return date.toISOString();
}

/**
 * Hook to fetch Cekura call data with progressive loading.
 * First fetches the most recent day (fast), then backfills the full range.
 * Returns merged results from both queries.
 */
export function useCekuraCallMapping(startDate: string | null, endDate: string | null) {
  const { environment } = useEnvironment();

  // Calculate the "recent" date range (yesterday + today)
  const recentStartDate = endDate ? getStartOfPreviousDay(endDate) : null;

  // First query: fetch just the last day (fast initial load)
  const recentQuery = useQuery({
    queryKey: ['cekura', 'call-data', 'recent', recentStartDate, endDate, environment],
    queryFn: () => fetchCekuraCallData(recentStartDate!, endDate!, environment),
    enabled: !!recentStartDate && !!endDate,
    staleTime: CACHE_TTL_DATA * 1000,
  });

  // Second query: fetch the full date range (background load)
  // Only fetch if startDate is different from recentStartDate (i.e., more than 1 day range)
  const needsFullFetch = Boolean(startDate && recentStartDate && startDate < recentStartDate);
  const fullQuery = useQuery({
    queryKey: ['cekura', 'call-data', 'full', startDate, endDate, environment],
    queryFn: () => fetchCekuraCallData(startDate!, endDate!, environment),
    enabled: Boolean(startDate && endDate && needsFullFetch),
    staleTime: CACHE_TTL_DATA * 1000,
  });

  // Merge call data: full query takes precedence when available
  const mergedData = useMemo(() => {
    const recentCalls: Record<string, CekuraCallData> = recentQuery.data?.calls || {};
    const fullCalls: Record<string, CekuraCallData> = fullQuery.data?.calls || {};
    const agentId = fullQuery.data?.agentId || recentQuery.data?.agentId || CEKURA_AGENT_IDS.production;

    // Merge: start with recent, overlay with full (full has complete data)
    const merged = { ...recentCalls, ...fullCalls };

    return {
      calls: new Map(Object.entries(merged)),
      agentId,
    };
  }, [recentQuery.data, fullQuery.data]);

  // Loading states
  const isInitialLoading = recentQuery.isLoading;
  const isBackfilling = needsFullFetch && fullQuery.isLoading;
  const isFullyLoaded = !isInitialLoading && (!needsFullFetch || !fullQuery.isLoading);

  return {
    data: mergedData,
    isLoading: isInitialLoading,
    isBackfilling,
    isFullyLoaded,
  };
}

/**
 * Build a Cekura dashboard URL for a specific call.
 */
export function buildCekuraUrl(cekuraCallId: number, environment: string): string {
  const agentId = CEKURA_AGENT_IDS[environment] || CEKURA_AGENT_IDS.production;
  return `https://dashboard.cekura.ai/dashboard/1939/3184/${agentId}/calls?page=1&pageSize=30&callId=${cekuraCallId}`;
}
