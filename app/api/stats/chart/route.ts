/**
 * Chart data API route - fetches call volume data for charts
 * Supports "All Time" by omitting date filters
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase/client';
import { authenticateRequest } from '@/lib/api/auth';
import { errorResponse, parseEnvironment } from '@/lib/api/utils';
import { BUSINESS_TIMEZONE } from '@/lib/date-utils';

/**
 * Get the Eastern-timezone-aware hour key for a UTC date.
 * Returns format like "2026-01-29T10" (the hour in Eastern time).
 * Handles DST automatically via Intl.DateTimeFormat.
 */
function toTimezoneHourKey(date: Date, tz: string): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
  });
  const parts = fmt.formatToParts(date);
  const get = (type: string) => parts.find(p => p.type === type)!.value;
  // hour12:false can produce "24" at midnight in some locales; normalize to "00"
  const hour = get('hour') === '24' ? '00' : get('hour');
  return `${get('year')}-${get('month')}-${get('day')}T${hour}`;
}

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth.authenticated) {
      return errorResponse(auth.error || 'Unauthorized', 401, 'UNAUTHORIZED');
    }

    const { searchParams } = new URL(request.url);
    const env = parseEnvironment(searchParams.get('env'));
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

    // Group by hour (Eastern timezone) or date
    const grouped = new Map<string, number>();
    for (const call of calls) {
      const date = new Date(call.started_at);
      const key = isHourly
        ? toTimezoneHourKey(date, BUSINESS_TIMEZONE)
        : date.toISOString().slice(0, 10);
      grouped.set(key, (grouped.get(key) || 0) + 1);
    }

    // Generate all slots in range for zero-fill
    const allSlots: string[] = [];
    if (startDate && endDate) {
      if (isHourly) {
        // Generate all 24 hour slots between start and end
        const current = new Date(startDate);
        const end = new Date(endDate);
        while (current <= end) {
          allSlots.push(toTimezoneHourKey(current, BUSINESS_TIMEZONE));
          current.setTime(current.getTime() + 60 * 60 * 1000);
        }
      } else {
        // Generate all date slots
        const current = new Date(startDate);
        const end = new Date(endDate);
        while (current <= end) {
          allSlots.push(current.toISOString().slice(0, 10));
          current.setDate(current.getDate() + 1);
        }
      }
    }

    // Build chart data with zero-fill
    let chartData;
    if (allSlots.length > 0) {
      // Deduplicate slots (hourly slots can repeat at DST boundaries)
      const seen = new Set<string>();
      chartData = allSlots
        .filter(slot => {
          if (seen.has(slot)) return false;
          seen.add(slot);
          return true;
        })
        .map(slot => ({
          date: slot,
          calls: grouped.get(slot) || 0,
        }));
    } else {
      // "All Time" view: only include entries with data
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
