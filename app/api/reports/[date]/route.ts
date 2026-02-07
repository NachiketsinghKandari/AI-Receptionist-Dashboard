/**
 * Report by Date API route
 * GET: Fetch a specific report by date and type
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase/client';
import { authenticateRequest } from '@/lib/api/auth';
import { errorResponse, parseEnvironment } from '@/lib/api/utils';

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

    const supabase = getSupabaseClient(environment);

    // Fetch report by date and type
    const { data, error } = await supabase
      .from('reports')
      .select('*')
      .eq('report_date', reportDate)
      .eq('report_type', reportType)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return errorResponse('Report not found', 404, 'NOT_FOUND');
      }
      console.error('Error fetching report:', error);
      return errorResponse('Failed to fetch report', 500, 'DB_ERROR');
    }

    return NextResponse.json({ report: data });
  } catch (error) {
    console.error('Report by date API error:', error);
    return errorResponse('Internal server error', 500, 'INTERNAL_ERROR');
  }
}
