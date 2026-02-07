/**
 * Call detail API route - fetches call with related data
 * Webhooks are fetched separately via /api/webhooks for better performance
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase/client';
import { authenticateRequest } from '@/lib/api/auth';
import { errorResponse, parseIntOrNull, parseEnvironment } from '@/lib/api/utils';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth.authenticated) {
      return errorResponse(auth.error || 'Unauthorized', 401, 'UNAUTHORIZED');
    }

    const { searchParams } = new URL(request.url);
    const env = parseEnvironment(searchParams.get('env'));
    const { id } = await params;

    // Support both numeric ID and correlation ID (UUID format)
    const isCorrelationId = id.includes('-') && id.length > 20;
    const callId = isCorrelationId ? null : parseIntOrNull(id);

    if (!isCorrelationId && callId === null) {
      return errorResponse('Invalid call ID', 400, 'INVALID_CALL_ID');
    }

    const client = getSupabaseClient(env);

    // Fetch call by either numeric ID or correlation ID (platform_call_id)
    const callQuery = isCorrelationId
      ? client.from('calls').select('*').eq('platform_call_id', id).single()
      : client.from('calls').select('*').eq('id', callId).single();

    const callResponse = await callQuery;

    if (callResponse.error) {
      console.error('Error fetching call:', callResponse.error);
      return errorResponse('Call not found', 404, 'CALL_NOT_FOUND');
    }

    // Use the actual call ID for fetching related data
    const actualCallId = callResponse.data.id;

    // Fetch transfers and emails in parallel
    const [transfersResponse, emailsResponse] = await Promise.all([
      client
        .from('transfers_details')
        .select('*')
        .eq('call_id', actualCallId)
        .order('created_at'),
      client
        .from('email_logs')
        .select('*')
        .eq('call_id', actualCallId)
        .order('sent_at', { ascending: false }),
    ]);

    // Enrich transfers with caller_name from the call
    const callerName = callResponse.data.caller_name;
    const enrichedTransfers = (transfersResponse.data || []).map((transfer) => ({
      ...transfer,
      caller_name: callerName,
    }));

    return NextResponse.json({
      call: callResponse.data,
      transfers: enrichedTransfers,
      emails: emailsResponse.data || [],
    });
  } catch (error) {
    console.error('Call detail API error:', error);
    return errorResponse('Internal server error', 500, 'INTERNAL_ERROR');
  }
}
