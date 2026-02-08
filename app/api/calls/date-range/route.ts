/**
 * Calls date range API route
 * Returns the earliest and latest started_at dates from the calls table.
 * Used to determine the Cekura fetch window when no date filter is active.
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

    // Fetch earliest and latest started_at in a single query using Supabase RPC
    // Two lightweight queries in parallel (index on started_at makes these instant)
    const [earliestResult, latestResult] = await Promise.all([
      client
        .from('calls')
        .select('started_at')
        .order('started_at', { ascending: true })
        .limit(1)
        .single(),
      client
        .from('calls')
        .select('started_at')
        .order('started_at', { ascending: false })
        .limit(1)
        .single(),
    ]);

    if (earliestResult.error || latestResult.error) {
      // No calls in the table
      return NextResponse.json({ earliest: null, latest: null });
    }

    return NextResponse.json({
      earliest: earliestResult.data.started_at,
      latest: latestResult.data.started_at,
    });
  } catch (error) {
    console.error('Calls date range API error:', error);
    return errorResponse('Internal server error', 500, 'INTERNAL_ERROR');
  }
}
