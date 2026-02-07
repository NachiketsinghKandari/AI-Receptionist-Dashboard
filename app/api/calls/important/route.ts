/**
 * Important calls API route
 * Returns call IDs that have emails with "[Important]" in the subject
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase/client';
import { authenticateRequest } from '@/lib/api/auth';
import { errorResponse, parseEnvironment } from '@/lib/api/utils';

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth.authenticated) {
      return errorResponse(auth.error || 'Unauthorized', 401, 'UNAUTHORIZED');
    }

    const { searchParams } = new URL(request.url);
    const env = parseEnvironment(searchParams.get('env'));

    const client = getSupabaseClient(env);

    // Query emails with "[Important]" in subject and get unique call_ids
    const { data, error } = await client
      .from('email_logs')
      .select('call_id')
      .ilike('subject', '%[Important]%');

    if (error) {
      console.error('Error fetching important emails:', error);
      return errorResponse('Failed to fetch important calls', 500, 'IMPORTANT_CALLS_FETCH_ERROR');
    }

    // Extract unique call IDs (filter out nulls)
    const callIds = [...new Set(
      (data || [])
        .map(row => row.call_id)
        .filter((id): id is number => id !== null)
    )];

    return NextResponse.json({ callIds });
  } catch (error) {
    console.error('Important calls API error:', error);
    return errorResponse('Internal server error', 500, 'INTERNAL_ERROR');
  }
}
