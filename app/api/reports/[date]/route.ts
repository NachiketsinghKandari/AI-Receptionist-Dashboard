/**
 * Report by Date API route
 * GET: Fetch a specific report by date and type
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/api/auth';
import { errorResponse, parseEnvironment } from '@/lib/api/utils';
import { ensureCloned, getReportByDateAndType } from '@/lib/sqlite/reports-db';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ date: string }> }
) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth.authenticated) {
      return errorResponse(auth.error || 'Unauthorized', 401, 'UNAUTHORIZED');
    }

    const { date: dateParam } = await params;
    const { searchParams } = new URL(request.url);
    const environment = parseEnvironment(searchParams.get('env'));
    const reportType = searchParams.get('type') || 'eod';

    // Parse date from DDMMYYYY format to YYYY-MM-DD
    if (!dateParam || dateParam.length !== 8) {
      return errorResponse('Invalid date format. Expected DDMMYYYY', 400, 'INVALID_DATE');
    }

    const day = dateParam.slice(0, 2);
    const month = dateParam.slice(2, 4);
    const year = dateParam.slice(4, 8);
    const reportDate = `${year}-${month}-${day}`;

    // Validate date is a real date
    const dateObj = new Date(reportDate);
    if (isNaN(dateObj.getTime())) {
      return errorResponse('Invalid date', 400, 'INVALID_DATE');
    }

    await ensureCloned(environment);

    const data = await getReportByDateAndType(environment, reportDate, reportType);

    if (!data) {
      return errorResponse('Report not found', 404, 'NOT_FOUND');
    }

    return NextResponse.json({ report: data });
  } catch (error) {
    console.error('Report by date API error:', error);
    return errorResponse('Internal server error', 500, 'INTERNAL_ERROR');
  }
}
