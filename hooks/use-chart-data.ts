'use client';

import { useQuery } from '@tanstack/react-query';
import { useEnvironment } from '@/components/providers/environment-provider';
import type { ChartDataPoint } from '@/types/api';
import { CACHE_TTL_DATA } from '@/lib/constants';

interface ChartResponse {
  data: ChartDataPoint[];
  isHourly: boolean;
  totalRecords: number;
}

interface ChartParams {
  startDate?: string;
  endDate?: string;
  isHourly?: boolean;
}

async function fetchChartData(params: ChartParams, environment: string): Promise<ChartResponse> {
  const searchParams = new URLSearchParams();
  searchParams.set('env', environment);

  // Only add date params if provided (omit for "All Time")
  if (params.startDate) {
    searchParams.set('startDate', params.startDate);
  }
  if (params.endDate) {
    searchParams.set('endDate', params.endDate);
  }
  if (params.isHourly !== undefined) {
    searchParams.set('isHourly', String(params.isHourly));
  }

  const response = await fetch(`/api/stats/chart?${searchParams}`);
  if (!response.ok) throw new Error('Failed to fetch chart data');
  return response.json();
}

export function useChartData(params: ChartParams) {
  const { environment } = useEnvironment();
  return useQuery({
    queryKey: ['chart-data', environment, params.startDate, params.endDate, params.isHourly],
    queryFn: () => fetchChartData(params, environment),
    staleTime: CACHE_TTL_DATA * 1000,
  });
}
