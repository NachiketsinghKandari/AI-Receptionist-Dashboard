/**
 * Overview stats API route - fetches KPI metrics for dashboard overview
 * Ported from Home.py:fetch_period_stats()
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase/client';
import { type Environment } from '@/lib/constants';
import { errorResponse } from '@/lib/api/utils';
import { getTodayRangeUTC, getYesterdayRangeUTC, getDateRangeUTC, BUSINESS_TIMEZONE } from '@/lib/date-utils';

type Period = 'Today' | 'Yesterday' | 'This Month';

// Helper to get day before yesterday range
function getDayBeforeYesterdayRangeUTC() {
  const now = new Date();
  // Get day before yesterday in Eastern timezone
  const dayBeforeYesterday = new Date(now);
  dayBeforeYesterday.setDate(dayBeforeYesterday.getDate() - 2);
  const dateStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(dayBeforeYesterday);
  return getDateRangeUTC(dateStr, dateStr);
}

function getPeriodDates(period: Period) {
  const now = new Date();

  if (period === 'Today') {
    const current = getTodayRangeUTC();
    const previous = getYesterdayRangeUTC();
    return {
      currentStart: current.startDate,
      currentEnd: current.endDate,
      prevStart: previous.startDate,
      prevEnd: previous.endDate,
    };
  }

  if (period === 'Yesterday') {
    const current = getYesterdayRangeUTC();
    const previous = getDayBeforeYesterdayRangeUTC();
    return {
      currentStart: current.startDate,
      currentEnd: current.endDate,
      prevStart: previous.startDate,
      prevEnd: previous.endDate,
    };
  }

  // This Month — compute month boundaries in Eastern timezone
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type: string) => parts.find(p => p.type === type)!.value;
  const year = parseInt(get('year'), 10);
  const month = parseInt(get('month'), 10);
  const todayStr = `${get('year')}-${get('month')}-${get('day')}`;

  // Current month: 1st of this month → today (Eastern)
  const currentMonthStart = `${get('year')}-${get('month')}-01`;
  const currentRange = getDateRangeUTC(currentMonthStart, todayStr);

  // Previous month: 1st of prev month → last day of prev month (Eastern)
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const prevMonthStart = `${prevYear}-${String(prevMonth).padStart(2, '0')}-01`;
  // Day 0 of current month = last day of previous month
  const lastDayPrev = new Date(Date.UTC(year, month - 1, 0)).getUTCDate();
  const prevMonthEnd = `${prevYear}-${String(prevMonth).padStart(2, '0')}-${String(lastDayPrev).padStart(2, '0')}`;
  const prevRange = getDateRangeUTC(prevMonthStart, prevMonthEnd);

  return {
    currentStart: currentRange.startDate,
    currentEnd: currentRange.endDate,
    prevStart: prevRange.startDate,
    prevEnd: prevRange.endDate,
  };
}

function calculateAverage(values: (number | null)[]): number {
  const validValues = values.filter((v): v is number => v !== null);
  if (validValues.length === 0) return 0;
  return validValues.reduce((a, b) => a + b, 0) / validValues.length;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const env = (searchParams.get('env') || 'production') as Environment;
    const period = (searchParams.get('period') || 'Today') as Period;

    const { currentStart, currentEnd, prevStart, prevEnd } = getPeriodDates(period);
    const client = getSupabaseClient(env);

    // Fetch current period data in parallel
    const [currentCallsRes, currentEmailsRes, currentTransfersRes] = await Promise.all([
      client
        .from('calls')
        .select('id, call_duration')
        .gte('started_at', currentStart)
        .lte('started_at', currentEnd),
      client
        .from('email_logs')
        .select('id')
        .gte('sent_at', currentStart)
        .lte('sent_at', currentEnd),
      client
        .from('transfers_details')
        .select('call_id')
        .gte('created_at', currentStart)
        .lte('created_at', currentEnd),
    ]);

    // Fetch previous period data in parallel
    const [prevCallsRes, prevEmailsRes, prevTransfersRes] = await Promise.all([
      client
        .from('calls')
        .select('id, call_duration')
        .gte('started_at', prevStart)
        .lte('started_at', prevEnd),
      client
        .from('email_logs')
        .select('id')
        .gte('sent_at', prevStart)
        .lte('sent_at', prevEnd),
      client
        .from('transfers_details')
        .select('call_id')
        .gte('created_at', prevStart)
        .lte('created_at', prevEnd),
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
    });
  } catch (error) {
    console.error('Overview stats API error:', error);
    return errorResponse('Internal server error', 500, 'INTERNAL_ERROR');
  }
}
