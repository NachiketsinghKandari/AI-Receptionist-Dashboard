'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useEnvironment } from '@/components/providers/environment-provider';
import { startOfDay, endOfDay, subDays } from 'date-fns';

/**
 * Prefetches all dashboard chart and overview data on mount.
 * This enables instant switching between time ranges and periods.
 */
export function useDashboardPrefetch() {
  const queryClient = useQueryClient();
  const { environment } = useEnvironment();

  useEffect(() => {
    const now = new Date();

    // Define all chart date ranges to prefetch
    const chartRanges = [
      // Today (hourly)
      {
        startDate: startOfDay(now).toISOString(),
        endDate: endOfDay(now).toISOString(),
        isHourly: true,
      },
      // 7 Days
      {
        startDate: startOfDay(subDays(now, 6)).toISOString(),
        endDate: endOfDay(now).toISOString(),
        isHourly: false,
      },
      // 30 Days
      {
        startDate: startOfDay(subDays(now, 29)).toISOString(),
        endDate: endOfDay(now).toISOString(),
        isHourly: false,
      },
      // All Time (no date params)
      {
        startDate: undefined,
        endDate: undefined,
        isHourly: false,
      },
    ];

    // Prefetch chart data for all ranges
    chartRanges.forEach((params) => {
      queryClient.prefetchQuery({
        queryKey: ['chart-data', environment, params.startDate, params.endDate, params.isHourly],
        queryFn: async () => {
          const searchParams = new URLSearchParams();
          searchParams.set('env', environment);
          if (params.startDate) searchParams.set('startDate', params.startDate);
          if (params.endDate) searchParams.set('endDate', params.endDate);
          if (params.isHourly !== undefined) searchParams.set('isHourly', String(params.isHourly));
          const response = await fetch(`/api/stats/chart?${searchParams}`);
          if (!response.ok) throw new Error('Failed to fetch chart data');
          return response.json();
        },
      });
    });

    // Prefetch overview stats for both periods
    const overviewPeriods = ['Today', 'This Month'] as const;
    overviewPeriods.forEach((period) => {
      queryClient.prefetchQuery({
        queryKey: ['overview-stats', environment, period],
        queryFn: async () => {
          const response = await fetch(`/api/stats/overview?period=${period}&env=${environment}`);
          if (!response.ok) throw new Error('Failed to fetch overview stats');
          return response.json();
        },
      });
    });
  }, [queryClient, environment]);
}
