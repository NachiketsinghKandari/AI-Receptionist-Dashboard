'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useEnvironment } from '@/components/providers/environment-provider';
import { getTodayRangeUTC, getDateRangeUTC, BUSINESS_TIMEZONE } from '@/lib/date-utils';

/**
 * Prefetches all dashboard chart and overview data on mount.
 * This enables instant switching between time ranges and periods.
 */
export function useDashboardPrefetch() {
  const queryClient = useQueryClient();
  const { environment } = useEnvironment();

  useEffect(() => {
    const now = new Date();

    // Get today's date in Eastern timezone (same as page.tsx)
    const todayStr = new Intl.DateTimeFormat('en-CA', {
      timeZone: BUSINESS_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);

    const subtractDays = (dateStr: string, days: number): string => {
      const d = new Date(dateStr + 'T12:00:00Z');
      d.setUTCDate(d.getUTCDate() - days);
      return d.toISOString().slice(0, 10);
    };

    const todayRange = getTodayRangeUTC();
    const weekRange = getDateRangeUTC(subtractDays(todayStr, 6), todayStr);
    const monthRange = getDateRangeUTC(subtractDays(todayStr, 29), todayStr);

    // Define all chart date ranges to prefetch
    const chartRanges = [
      // Today (hourly)
      {
        startDate: todayRange.startDate,
        endDate: todayRange.endDate,
        isHourly: true,
      },
      // 7 Days
      {
        startDate: weekRange.startDate,
        endDate: weekRange.endDate,
        isHourly: false,
      },
      // 30 Days
      {
        startDate: monthRange.startDate,
        endDate: monthRange.endDate,
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
