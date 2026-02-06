/**
 * Stats API route - ported from Home.py:fetch_period_stats()
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase/client';
import { authenticateRequest } from '@/lib/api/auth';
import { errorResponse } from '@/lib/api/utils';

type Period = 'Today' | 'This Month';

function getPeriodDates(period: Period) {
  const now = new Date();

  if (period === 'Today') {
    const currentStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const currentEnd = now;
    const prevStart = new Date(currentStart.getTime() - 24 * 60 * 60 * 1000);
    const prevEnd = new Date(currentStart);
    return { currentStart, currentEnd, prevStart, prevEnd };
  }

  // This Month
  const currentStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const currentEnd = now;
  const prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevEnd = new Date(now.getFullYear(), now.getMonth(), 1);
  return { currentStart, currentEnd, prevStart, prevEnd };
}

function calculateAverage(values: (number | null)[]): number {
  const validValues = values.filter((v): v is number => v !== null);
  if (validValues.length === 0) return 0;
  return validValues.reduce((a, b) => a + b, 0) / validValues.length;
}

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth.authenticated) {
      return errorResponse(auth.error || 'Unauthorized', 401, 'UNAUTHORIZED');
    }

    const { searchParams } = new URL(request.url);
    const period = (searchParams.get('period') || 'Today') as Period;
    const chartStartDate = searchParams.get('chartStartDate');
    const chartEndDate = searchParams.get('chartEndDate');
    const isHourly = searchParams.get('isHourly') === 'true';

    const { currentStart, currentEnd, prevStart, prevEnd } = getPeriodDates(period);
    const client = getSupabaseClient();

    // Fetch current period data in parallel
    const [currentCallsRes, currentEmailsRes, currentTransfersRes] = await Promise.all([
      client
        .from('calls')
        .select('id, call_duration')
        .gte('started_at', currentStart.toISOString())
        .lte('started_at', currentEnd.toISOString()),
      client
        .from('email_logs')
        .select('id')
        .gte('sent_at', currentStart.toISOString())
        .lte('sent_at', currentEnd.toISOString()),
      client
        .from('transfers_details')
        .select('call_id')
        .gte('created_at', currentStart.toISOString())
        .lte('created_at', currentEnd.toISOString()),
    ]);

    // Fetch previous period data in parallel
    const [prevCallsRes, prevEmailsRes, prevTransfersRes] = await Promise.all([
      client
        .from('calls')
        .select('id, call_duration')
        .gte('started_at', prevStart.toISOString())
        .lte('started_at', prevEnd.toISOString()),
      client
        .from('email_logs')
        .select('id')
        .gte('sent_at', prevStart.toISOString())
        .lte('sent_at', prevEnd.toISOString()),
      client
        .from('transfers_details')
        .select('call_id')
        .gte('created_at', prevStart.toISOString())
        .lte('created_at', prevEnd.toISOString()),
    ]);

    const currentCalls = currentCallsRes.data || [];
    const prevCalls = prevCallsRes.data || [];
    const currentEmails = currentEmailsRes.data || [];
    const prevEmails = prevEmailsRes.data || [];
    const currentTransfers = currentTransfersRes.data || [];
    const prevTransfers = prevTransfersRes.data || [];

    // Calculate stats
    const totalCurrent = currentCalls.length;
    const totalPrev = prevCalls.length;

    // Average duration
    const avgDurationCurrent = calculateAverage(currentCalls.map((c) => c.call_duration));
    const avgDurationPrev = calculateAverage(prevCalls.map((c) => c.call_duration));

    // Transfer rate - count unique calls with transfers
    const currentTransferCallIds = new Set(currentTransfers.map((t) => t.call_id));
    const prevTransferCallIds = new Set(prevTransfers.map((t) => t.call_id));
    const transferRateCurrent =
      totalCurrent > 0 ? (currentTransferCallIds.size / totalCurrent) * 100 : 0;
    const transferRatePrev = totalPrev > 0 ? (prevTransferCallIds.size / totalPrev) * 100 : 0;

    // Fetch chart data if requested
    let chartData: { date: string; calls: number }[] = [];
    if (chartStartDate && chartEndDate) {
      const chartCallsRes = await client
        .from('calls')
        .select('started_at')
        .gte('started_at', chartStartDate)
        .lte('started_at', chartEndDate)
        .order('started_at');

      const chartCalls = chartCallsRes.data || [];

      // Group by hour or date
      const grouped = new Map<string, number>();
      for (const call of chartCalls) {
        const date = new Date(call.started_at);
        const key = isHourly
          ? date.toISOString().slice(0, 13) + ':00:00'
          : date.toISOString().slice(0, 10);
        grouped.set(key, (grouped.get(key) || 0) + 1);
      }

      chartData = Array.from(grouped.entries()).map(([date, calls]) => ({
        date,
        calls,
      }));
    }

    return NextResponse.json({
      current: {
        totalCalls: totalCurrent,
        avgDuration: avgDurationCurrent,
        transferRate: transferRateCurrent,
        emailsSent: currentEmails.length,
      },
      previous: {
        totalCalls: totalPrev,
        avgDuration: avgDurationPrev,
        transferRate: transferRatePrev,
        emailsSent: prevEmails.length,
      },
      chart: {
        data: chartData,
        isHourly,
      },
    });
  } catch (error) {
    console.error('Stats API error:', error);
    return errorResponse('Internal server error', 500, 'INTERNAL_ERROR');
  }
}
