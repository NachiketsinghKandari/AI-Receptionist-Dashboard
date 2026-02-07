/**
 * Weekly Report generation API route
 * Aggregates existing EOD reports over a Mon-Sun week
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/api/auth';
import { errorResponse } from '@/lib/api/utils';
import { getSupabaseClient } from '@/lib/supabase/client';
import { startOfWeek, endOfWeek, format } from 'date-fns';
import type { Environment } from '@/lib/constants';
import type {
  EODRawData,
  WeeklyRawData,
  EODReport,
  EODCSEscalation,
  EODTransferDestinationStats,
} from '@/types/api';

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth.authenticated) {
      return errorResponse(auth.error || 'Unauthorized', 401, 'UNAUTHORIZED');
    }

    const { searchParams } = new URL(request.url);
    const environment = (searchParams.get('env') || 'production') as Environment;

    const body = await request.json();
    const weekDate = body.weekDate as string;
    const firmId = body.firmId as number | null | undefined;

    if (!weekDate || !/^\d{4}-\d{2}-\d{2}$/.test(weekDate)) {
      return errorResponse('Invalid weekDate format. Use YYYY-MM-DD', 400, 'INVALID_DATE');
    }

    // Compute Monday and Sunday of the week containing weekDate
    const dateObj = new Date(weekDate + 'T12:00:00Z'); // noon to avoid timezone issues
    const monday = startOfWeek(dateObj, { weekStartsOn: 1 });
    const sunday = endOfWeek(dateObj, { weekStartsOn: 1 });
    const weekStart = format(monday, 'yyyy-MM-dd');
    const weekEnd = format(sunday, 'yyyy-MM-dd');

    const supabase = getSupabaseClient(environment);

    // Query reports table for EOD reports in the date range
    let query = supabase
      .from('reports')
      .select('*')
      .gte('report_date', weekStart)
      .lte('report_date', weekEnd);

    // Filter to only EOD reports (report_type is 'eod' or null for backward compat)
    query = query.or('report_type.eq.eod,report_type.is.null');

    // Filter by firmId if provided
    if (firmId) {
      query = query.eq('raw_data->firm_id', firmId);
    }

    const { data: eodReports, error } = await query.order('report_date', { ascending: true });

    if (error) {
      console.error('Error fetching EOD reports for weekly aggregation:', error);
      return errorResponse('Failed to fetch EOD reports', 500, 'DB_ERROR');
    }

    if (!eodReports || eodReports.length === 0) {
      return errorResponse(
        `No EOD reports found for week ${weekStart} to ${weekEnd}`,
        404,
        'NO_REPORTS'
      );
    }

    // Aggregate across all found EOD reports
    const typedReports = eodReports as EODReport[];
    const aggregated = aggregateEODReports(typedReports, weekStart, weekEnd, environment, firmId);

    return NextResponse.json({
      raw_data: aggregated,
      week_start: weekStart,
      week_end: weekEnd,
      eod_reports_used: typedReports.length,
    });
  } catch (error) {
    console.error('Weekly report generation error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return errorResponse(message, 500, 'GENERATION_ERROR');
  }
}

function aggregateEODReports(
  reports: EODReport[],
  weekStart: string,
  weekEnd: string,
  environment: string,
  firmId?: number | null
): WeeklyRawData {
  let count = 0;
  let failureCount = 0;
  let timeSaved = 0;
  let totalCallTime = 0;
  let messagesTaken = 0;
  let csEscalationCount = 0;
  const csEscalationMap: EODCSEscalation[] = [];
  let transferAttemptsCount = 0;
  let transferFailureCount = 0;
  const transfersMap: Record<string, EODTransferDestinationStats> = {};

  // For weighted average of disconnection_rate
  let weightedDisconnectionSum = 0;
  let totalCountForDisconnection = 0;

  for (const report of reports) {
    const rawData = report.raw_data as EODRawData;
    if (!rawData) continue;

    // Sum numeric fields
    count += rawData.count ?? 0;
    failureCount += rawData.failure_count ?? 0;
    timeSaved += rawData.time_saved ?? 0;
    totalCallTime += rawData.total_call_time ?? 0;
    messagesTaken += rawData.messages_taken ?? 0;
    csEscalationCount += rawData.cs_escalation_count ?? 0;

    // Weighted disconnection rate
    const dayCount = rawData.count ?? 0;
    if (dayCount > 0) {
      weightedDisconnectionSum += (rawData.disconnection_rate ?? 0) * dayCount;
      totalCountForDisconnection += dayCount;
    }

    // Merge cs_escalation_map arrays
    if (rawData.cs_escalation_map) {
      csEscalationMap.push(...rawData.cs_escalation_map);
    }

    // Merge transfers_report
    if (rawData.transfers_report) {
      transferAttemptsCount += rawData.transfers_report.attempts_count ?? 0;
      transferFailureCount += rawData.transfers_report.failure_count ?? 0;

      if (rawData.transfers_report.transfers_map) {
        for (const [dest, stats] of Object.entries(rawData.transfers_report.transfers_map)) {
          const existing = transfersMap[dest] || { attempts: 0, failed: 0 };
          existing.attempts += stats.attempts ?? 0;
          existing.failed += stats.failed ?? 0;
          transfersMap[dest] = existing;
        }
      }
    }
  }

  // Calculate weighted average disconnection rate
  const disconnectionRate = totalCountForDisconnection > 0
    ? Math.round((weightedDisconnectionSum / totalCountForDisconnection) * 100) / 100
    : 0;

  // Get firm info from first report that has it
  const firstWithFirm = reports.find(r => (r.raw_data as EODRawData)?.firm_id);
  const firmName = firstWithFirm ? (firstWithFirm.raw_data as EODRawData).firm_name : null;

  return {
    count,
    failure_count: failureCount,
    time_saved: timeSaved,
    total_call_time: totalCallTime,
    messages_taken: messagesTaken,
    disconnection_rate: disconnectionRate,
    cs_escalation_count: csEscalationCount,
    cs_escalation_map: csEscalationMap,
    transfers_report: {
      attempts_count: transferAttemptsCount,
      failure_count: transferFailureCount,
      transfers_map: transfersMap,
    },
    report_date: weekStart,
    generated_at: new Date().toISOString(),
    environment,
    firm_id: firmId || null,
    firm_name: firmName || null,
    week_start: weekStart,
    week_end: weekEnd,
  };
}
