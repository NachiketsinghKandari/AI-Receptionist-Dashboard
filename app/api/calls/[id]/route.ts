/**
 * Call detail API route - fetches call with related data
 * Webhooks are fetched separately via /api/webhooks for better performance
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase/client';
import { type Environment } from '@/lib/constants';
import { errorResponse, parseIntOrNull } from '@/lib/api/utils';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { searchParams } = new URL(request.url);
    const env = (searchParams.get('env') || 'production') as Environment;
    const { id } = await params;
    const callId = parseIntOrNull(id);

    if (callId === null) {
      return errorResponse('Invalid call ID', 400, 'INVALID_CALL_ID');
    }

    const client = getSupabaseClient(env);

    // Fetch call, transfers, and emails in parallel
    const [callResponse, transfersResponse, emailsResponse] = await Promise.all([
      client.from('calls').select('*').eq('id', callId).single(),
      client
        .from('transfers_details')
        .select('*')
        .eq('call_id', callId)
        .order('created_at'),
      client
        .from('email_logs')
        .select('*')
        .eq('call_id', callId)
        .order('sent_at', { ascending: false }),
    ]);

    if (callResponse.error) {
      console.error('Error fetching call:', callResponse.error);
      return errorResponse('Call not found', 404, 'CALL_NOT_FOUND');
    }

    return NextResponse.json({
      call: callResponse.data,
      transfers: transfersResponse.data || [],
      emails: emailsResponse.data || [],
    });
  } catch (error) {
    console.error('Call detail API error:', error);
    return errorResponse('Internal server error', 500, 'INTERNAL_ERROR');
  }
}
