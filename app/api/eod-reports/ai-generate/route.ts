/**
 * EOD Reports AI Generation API route
 * POST: Generate AI insights for a saved EOD report
 * This endpoint can be called manually to retry AI generation
 */

import { NextRequest, NextResponse } from 'next/server';
import { generateAIReportForEOD } from '@/lib/eod/generate-ai-report';
import { errorResponse } from '@/lib/api/utils';
import type { Environment } from '@/lib/constants';

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const environment = (searchParams.get('env') || 'production') as Environment;

    const body = await request.json();
    const { reportId, rawData } = body;

    if (!reportId) {
      return errorResponse('reportId is required', 400, 'MISSING_PARAMS');
    }

    if (!rawData) {
      return errorResponse('rawData is required', 400, 'MISSING_PARAMS');
    }

    // Use shared AI generation function
    const result = await generateAIReportForEOD(reportId, rawData, environment);

    if (!result.success) {
      return errorResponse(result.error || 'AI generation failed', 500, 'AI_ERROR');
    }

    return NextResponse.json({
      success: true,
      error_count: result.error_count,
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
