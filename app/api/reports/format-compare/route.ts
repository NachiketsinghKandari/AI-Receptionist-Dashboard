/**
 * Format Comparison API route
 * POST: Compare JSON vs TOON encoding of report input data
 * Returns both formatted strings with character/line counts for comparison
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/api/auth';
import { errorResponse, parseEnvironment } from '@/lib/api/utils';
import { buildReportInputData, formatInputData } from '@/lib/eod/generate-ai-report';
import { ensureCloned, getReportById } from '@/lib/sqlite/reports-db';
import type { EODReportType } from '@/types/api';

const VALID_REPORT_TYPES = new Set<EODReportType>(['success', 'failure', 'full', 'weekly']);

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth.authenticated) {
      return errorResponse(auth.error || 'Unauthorized', 401, 'UNAUTHORIZED');
    }

    const { searchParams } = new URL(request.url);
    const environment = parseEnvironment(searchParams.get('env'));

    const body = await request.json();
    const { reportId, reportType } = body;

    if (!reportType || !VALID_REPORT_TYPES.has(reportType)) {
      return errorResponse(
        'reportType must be "success", "failure", "full", or "weekly"',
        400,
        'INVALID_PARAMS'
      );
    }

    // Fetch the report's raw_data from DB (or accept rawData from body for ad-hoc use)
    let rawData = body.rawData;
    if (!rawData && reportId) {
      await ensureCloned(environment);
      const report = await getReportById(reportId);

      if (!report) {
        return errorResponse('Report not found', 404, 'NOT_FOUND');
      }
      rawData = report.raw_data;
    }

    if (!rawData) {
      return errorResponse(
        'Either reportId or rawData is required',
        400,
        'MISSING_PARAMS'
      );
    }

    // Build the inputData that would be sent to the LLM
    const { inputData, callCount } = buildReportInputData(rawData, reportType as EODReportType);

    // Format as both JSON and TOON
    const jsonOutput = formatInputData(inputData, 'json');
    const toonOutput = formatInputData(inputData, 'toon');

    const jsonLines = jsonOutput.split('\n').length;
    const toonLines = toonOutput.split('\n').length;

    const savings = jsonOutput.length > 0
      ? ((1 - toonOutput.length / jsonOutput.length) * 100).toFixed(1)
      : '0';

    return NextResponse.json({
      reportType,
      callCount,
      comparison: {
        json: {
          characters: jsonOutput.length,
          lines: jsonLines,
          content: jsonOutput,
        },
        toon: {
          characters: toonOutput.length,
          lines: toonLines,
          content: toonOutput,
        },
        savings: {
          characters: jsonOutput.length - toonOutput.length,
          characterPercent: `${savings}%`,
          lines: jsonLines - toonLines,
        },
      },
    });
  } catch (error) {
    console.error('Format comparison API error:', error);
    return errorResponse(
      error instanceof Error ? error.message : 'Internal server error',
      500,
      'INTERNAL_ERROR'
    );
  }
}
