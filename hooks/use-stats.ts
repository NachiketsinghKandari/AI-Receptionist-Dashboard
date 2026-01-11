'use client';

import { useQuery } from '@tanstack/react-query';
import type { StatsResponse } from '@/types/api';
import { CACHE_TTL_DATA } from '@/lib/constants';

interface StatsParams {
  period: 'Today' | 'This Month';
  chartStartDate?: string;
  chartEndDate?: string;
  isHourly?: boolean;
}

async function fetchStats(params: StatsParams): Promise<StatsResponse> {
  const searchParams = new URLSearchParams();
  searchParams.set('period', params.period);
  if (params.chartStartDate) searchParams.set('chartStartDate', params.chartStartDate);
  if (params.chartEndDate) searchParams.set('chartEndDate', params.chartEndDate);
  if (params.isHourly !== undefined) searchParams.set('isHourly', String(params.isHourly));

  const response = await fetch(`/api/stats?${searchParams}`);
  if (!response.ok) throw new Error('Failed to fetch stats');
  return response.json();
}

export function useStats(params: StatsParams) {
  return useQuery({
    queryKey: ['stats', params],
    queryFn: () => fetchStats(params),
    staleTime: CACHE_TTL_DATA * 1000,
  });
}
