'use client';

import { useQuery } from '@tanstack/react-query';
import { useEnvironment } from '@/components/providers/environment-provider';
import type { FlaggedFilters, FlaggedCallsResponse, FlaggedCountResponse } from '@/types/api';
import { CACHE_TTL_DATA } from '@/lib/constants';

async function fetchFlaggedCalls(filters: FlaggedFilters, environment: string): Promise<FlaggedCallsResponse> {
  const params = new URLSearchParams();
  params.set('env', environment);

  if (filters.firmId) params.set('firmId', String(filters.firmId));
  if (filters.flagType) params.set('flagType', filters.flagType);
  if (filters.startDate) params.set('startDate', filters.startDate);
  if (filters.endDate) params.set('endDate', filters.endDate);
  if (filters.search) params.set('search', filters.search);
  if (filters.limit) params.set('limit', String(filters.limit));
  if (filters.offset) params.set('offset', String(filters.offset));
  if (filters.sortBy) params.set('sortBy', filters.sortBy);
  if (filters.sortOrder) params.set('sortOrder', filters.sortOrder);

  const response = await fetch(`/api/calls/flagged?${params}`);
  if (!response.ok) throw new Error('Failed to fetch flagged calls');
  return response.json();
}

async function fetchFlaggedCount(environment: string): Promise<FlaggedCountResponse> {
  const response = await fetch(`/api/calls/flagged/count?env=${environment}`);
  if (!response.ok) throw new Error('Failed to fetch flagged count');
  return response.json();
}

/**
 * Hook to fetch paginated flagged calls
 */
export function useFlaggedCalls(filters: FlaggedFilters) {
  const { environment } = useEnvironment();
  return useQuery({
    queryKey: ['calls', 'flagged', 'list', environment, filters],
    queryFn: () => fetchFlaggedCalls(filters, environment),
    staleTime: CACHE_TTL_DATA * 1000,
    placeholderData: (prev) => prev,
  });
}

/**
 * Hook to fetch flagged calls count for navbar badge
 */
export function useFlaggedCount() {
  const { environment } = useEnvironment();
  return useQuery({
    queryKey: ['calls', 'flagged', 'count', environment],
    queryFn: () => fetchFlaggedCount(environment),
    staleTime: CACHE_TTL_DATA * 1000, // 60 seconds
  });
}
