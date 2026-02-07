/**
 * EOD Reports AI Generation API route
 * POST: Generate AI insights for a saved EOD report
 * This endpoint can be called manually to retry AI generation
 */

import { NextRequest, NextResponse } from 'next/server';
import { generateAIReportForEOD } from '@/lib/eod/generate-ai-report';
import { authenticateRequest } from '@/lib/api/auth';
import { errorResponse, parseEnvironment } from '@/lib/api/utils';
import type { EODReportType } from '@/types/api';

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth.authenticated) {
      return errorResponse(auth.error || 'Unauthorized', 401, 'UNAUTHORIZED');
    }

    const { searchParams } = new URL(request.url);
    const environment = parseEnvironment(searchParams.get('env'));

    const body = await request.json();
    const { reportId, rawData, reportType } = body;

    if (!reportId) {
      return errorResponse('reportId is required', 400, 'MISSING_PARAMS');
    }

    if (!rawData) {
      return errorResponse('rawData is required', 400, 'MISSING_PARAMS');
    }

    if (!reportType || (reportType !== 'success' && reportType !== 'failure' && reportType !== 'full' && reportType !== 'weekly')) {
      return errorResponse('reportType must be "success", "failure", "full", or "weekly"', 400, 'INVALID_PARAMS');
    }

    // Use shared AI generation function with reportType
    const result = await generateAIReportForEOD(reportId, rawData, environment, reportType as EODReportType);

    if (!result.success) {
      return errorResponse(result.error || 'AI generation failed', 500, 'AI_ERROR');
    }

    return NextResponse.json({
      success: true,
      reportType,
    });
  } catch (error) {
    console.error('AI generation API error:', error);
    return errorResponse(
      error instanceof Error ? error.message : 'Internal server error',
      500,
      'INTERNAL_ERROR'
    );
  }
}
