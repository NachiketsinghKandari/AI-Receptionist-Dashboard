/**
 * EOD Reports API route
 * GET: List all EOD reports
 * POST: Save a new EOD report (frontend triggers AI generation separately)
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/api/auth';
import { errorResponse, parseIntOrDefault, clamp, parseEnvironment } from '@/lib/api/utils';
import { MAX_PAGE_LIMIT, DEFAULT_PAGE_LIMIT } from '@/lib/constants';
import {
  ensureCloned,
  listReports,
  findReportByDateTypeAndFirm,
  updateReport,
  insertReport,
} from '@/lib/sqlite/reports-db';

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth.authenticated) {
      return errorResponse(auth.error || 'Unauthorized', 401, 'UNAUTHORIZED');
    }

    const { searchParams } = new URL(request.url);
    const environment = parseEnvironment(searchParams.get('env'));
    const limit = clamp(parseIntOrDefault(searchParams.get('limit'), DEFAULT_PAGE_LIMIT), 1, MAX_PAGE_LIMIT);
    const offset = parseIntOrDefault(searchParams.get('offset'), 0);
    const sortBy = searchParams.get('sortBy') || 'report_date';
    const sortOrder = searchParams.get('sortOrder') || 'desc';
    const reportType = searchParams.get('reportType');
    const firmIdParam = searchParams.get('firmId');
    const firmId = firmIdParam ? parseInt(firmIdParam, 10) : null;
    const excludeTriggerType = searchParams.get('excludeTriggerType') || undefined;

    await ensureCloned(environment);

    const { data, total } = await listReports(environment, {
      reportType,
      firmId,
      excludeTriggerType,
      sortBy,
      sortOrder,
      limit,
      offset,
    });

    return NextResponse.json({
      data,
      total,
      limit,
      offset,
    });
  } catch (error) {
    console.error('EOD reports API error:', error);
    return errorResponse('Internal server error', 500, 'INTERNAL_ERROR');
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth.authenticated) {
      return errorResponse(auth.error || 'Unauthorized', 401, 'UNAUTHORIZED');
    }

    const { searchParams } = new URL(request.url);
    const environment = parseEnvironment(searchParams.get('env'));

    const body = await request.json();
    const { reportDate, rawData, triggerType = 'manual', reportType = 'eod' } = body;
    const firmId = body.firmId as number | null | undefined;
    const firmIdValue = firmId ?? null;

    if (!reportDate || !rawData) {
      return errorResponse('reportDate and rawData are required', 400, 'MISSING_PARAMS');
    }

    await ensureCloned(environment);

    // Check if report already exists for this date, type, and firm
    const existing = await findReportByDateTypeAndFirm(environment, reportDate, reportType, firmIdValue);

    if (existing) {
      // When weekly prerequisite overwrites an existing manual/scheduled report,
      // preserve the original trigger_type so the report stays visible in the EOD list
      const effectiveTriggerType =
        triggerType === 'weekly' && existing.trigger_type && existing.trigger_type !== 'weekly'
          ? existing.trigger_type
          : triggerType;

      // Update existing report - clear AI fields for regeneration
      const data = await updateReport(existing.id, {
        raw_data: rawData,
        generated_at: new Date().toISOString(),
        trigger_type: effectiveTriggerType,
        report_type: reportType,
        full_report: null,
        errors: null,
        success_report: null,
        failure_report: null,
      });

      return NextResponse.json({
        report: data,
        updated: true,
        message: 'Report saved! Trigger AI generation separately.',
      });
    }

    // Insert new report
    const insertPayload: Record<string, unknown> = {
      report_date: reportDate,
      raw_data: rawData,
      trigger_type: triggerType,
      report_type: reportType,
      full_report: null,
      errors: null,
      success_report: null,
      failure_report: null,
    };
    if (firmIdValue != null) {
      insertPayload.firm_id = firmIdValue;
    }

    const data = await insertReport(environment, insertPayload as Parameters<typeof insertReport>[1]);

    return NextResponse.json({
      report: data,
      updated: false,
      message: 'Report saved! Trigger AI generation separately.',
    });
  } catch (error) {
    console.error('EOD reports API error:', error);
    return errorResponse('Internal server error', 500, 'INTERNAL_ERROR');
  }
}
