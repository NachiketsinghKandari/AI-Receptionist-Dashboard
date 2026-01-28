'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useEnvironment } from '@/components/providers/environment-provider';
import { CACHE_TTL_DATA } from '@/lib/constants';

interface CekuraCallMappingResponse {
  mapping: Record<string, number>; // correlation_id -> cekura_call_id
  count: number;
  agentId: number;
}

// Cekura agent IDs by environment (for building URLs)
const CEKURA_AGENT_IDS: Record<string, number> = {
  production: 10779,
  staging: 11005,
};

async function fetchCekuraCallMapping(
  startDate: string,
  endDate: string,
  environment: string
): Promise<CekuraCallMappingResponse> {
  const params = new URLSearchParams({
    startDate,
    endDate,
    environment,
  });

  const response = await fetch(`/api/cekura/call-mapping?${params}`);
  if (!response.ok) {
    throw new Error('Failed to fetch Cekura call mapping');
  }
  return response.json();
}

/**
 * Get the date string for "yesterday" relative to a given end date.
 * Returns a date 1 day before the end date.
 */
function getOneDayBefore(dateStr: string): string {
  const date = new Date(dateStr);
  date.setDate(date.getDate() - 1);
  return date.toISOString();
}

/**
 * Hook to fetch Cekura call ID mappings with progressive loading.
 * First fetches the most recent day (fast), then backfills the full range.
 * Returns merged results from both queries.
 */
export function useCekuraCallMapping(startDate: string | null, endDate: string | null) {
  const { environment } = useEnvironment();

  // Calculate the "recent" date range (last 1 day)
  const recentStartDate = endDate ? getOneDayBefore(endDate) : null;

  // First query: fetch just the last day (fast initial load)
  const recentQuery = useQuery({
    queryKey: ['cekura', 'call-mapping', 'recent', recentStartDate, endDate, environment],
    queryFn: () => fetchCekuraCallMapping(recentStartDate!, endDate!, environment),
    enabled: !!recentStartDate && !!endDate,
    staleTime: CACHE_TTL_DATA * 1000,
  });

  // Second query: fetch the full date range (background load)
  // Only fetch if startDate is different from recentStartDate (i.e., more than 1 day range)
  const needsFullFetch = Boolean(startDate && recentStartDate && startDate < recentStartDate);
  const fullQuery = useQuery({
    queryKey: ['cekura', 'call-mapping', 'full', startDate, endDate, environment],
    queryFn: () => fetchCekuraCallMapping(startDate!, endDate!, environment),
    enabled: Boolean(startDate && endDate && needsFullFetch),
    staleTime: CACHE_TTL_DATA * 1000,
  });

  // Merge mappings: full query takes precedence when available
  const mergedData = useMemo(() => {
    const recentMapping: Record<string, number> = recentQuery.data?.mapping || {};
    const fullMapping: Record<string, number> = fullQuery.data?.mapping || {};
    const agentId = fullQuery.data?.agentId || recentQuery.data?.agentId || CEKURA_AGENT_IDS.production;

    // Merge: start with recent, overlay with full (full has complete data)
    const merged = { ...recentMapping, ...fullMapping };

    return {
      mapping: new Map(Object.entries(merged)),
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
