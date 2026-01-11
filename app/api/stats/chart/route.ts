/**
 * Chart data API route - fetches call volume data for charts
 * Supports "All Time" by omitting date filters
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase/client';
import { type Environment } from '@/lib/constants';
import { errorResponse } from '@/lib/api/utils';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const env = (searchParams.get('env') || 'production') as Environment;
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const isHourly = searchParams.get('isHourly') === 'true';

    const client = getSupabaseClient(env);

    // Build query - always fetch chart data, optionally filter by date
    let query = client
      .from('calls')
      .select('started_at')
      .order('started_at')
      .limit(10000); // Limit for performance (matching Home.py)

    // Only add date filters if provided (for "All Time", no filters are applied)
    if (startDate) {
      query = query.gte('started_at', startDate);
    }
    if (endDate) {
      query = query.lte('started_at', endDate);
    }

    const { data: chartCalls, error } = await query;

    if (error) {
      console.error('Chart query error:', error);
      return errorResponse('Failed to fetch chart data', 500, 'QUERY_ERROR');
    }

    const calls = chartCalls || [];

    // Generate all dates in range for zero-fill (daily view only)
    const allDates: string[] = [];
    if (startDate && endDate && !isHourly) {
      const current = new Date(startDate);
      const end = new Date(endDate);
      while (current <= end) {
        allDates.push(current.toISOString().slice(0, 10));
        current.setDate(current.getDate() + 1);
      }
    }

    // Group by hour or date
    const grouped = new Map<string, number>();
    for (const call of calls) {
      const date = new Date(call.started_at);
      const key = isHourly
        ? date.toISOString().slice(0, 13) + ':00:00'
        : date.toISOString().slice(0, 10);
      grouped.set(key, (grouped.get(key) || 0) + 1);
    }

    // Build chart data with zero-fill for daily view
    let chartData;
    if (!isHourly && allDates.length > 0) {
      // Zero-fill: include all days in range, even those with 0 calls
      chartData = allDates.map(date => ({
        date,
        calls: grouped.get(date) || 0,
      }));
    } else {
      // Hourly or "All Time" view: only include entries with data
      chartData = Array.from(grouped.entries()).map(([date, callCount]) => ({
        date,
        calls: callCount,
      }));
    }

    return NextResponse.json({
      data: chartData,
      isHourly,
      totalRecords: calls.length,
    });
  } catch (error) {
    console.error('Chart API error:', error);
    return errorResponse('Internal server error', 500, 'INTERNAL_ERROR');
  }
}
