'use client';

import { useQuery } from '@tanstack/react-query';
import { useEnvironment } from '@/components/providers/environment-provider';
import { CACHE_TTL_DATA } from '@/lib/constants';

interface OverviewStats {
  current: {
    totalCalls: number;
    avgDuration: number;
    transferRate: number;
    emailsSent: number;
  };
  previous: {
    totalCalls: number;
    avgDuration: number;
    transferRate: number;
    emailsSent: number;
  };
}

interface OverviewParams {
  period: 'Today' | 'Yesterday' | 'This Month';
}

async function fetchOverviewStats(params: OverviewParams, environment: string): Promise<OverviewStats> {
  const searchParams = new URLSearchParams();
  searchParams.set('period', params.period);
  searchParams.set('env', environment);

  const response = await fetch(`/api/stats/overview?${searchParams}`);
  if (!response.ok) throw new Error('Failed to fetch overview stats');
  return response.json();
}

export function useOverviewStats(params: OverviewParams) {
  const { environment } = useEnvironment();
  return useQuery({
    queryKey: ['overview-stats', environment, params.period],
    queryFn: () => fetchOverviewStats(params, environment),
    staleTime: CACHE_TTL_DATA * 1000,
  });
}
