/**
 * Firms API route - ported from shared.py:get_firms()
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase/client';
import { type Environment } from '@/lib/constants';
import { authenticateRequest } from '@/lib/api/auth';
import { errorResponse } from '@/lib/api/utils';

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth.authenticated) {
      return errorResponse(auth.error || 'Unauthorized', 401, 'UNAUTHORIZED');
    }

    const { searchParams } = new URL(request.url);
    const env = (searchParams.get('env') || 'production') as Environment;
    const client = getSupabaseClient(env);

    const response = await client
      .from('firms')
      .select('id, name')
      .order('name');

    if (response.error) {
      console.error('Error fetching firms:', response.error);
      return NextResponse.json({ error: 'Failed to fetch firms' }, { status: 500 });
    }

    return NextResponse.json({
      firms: response.data || [],
    });
  } catch (error) {
    console.error('Firms API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';
