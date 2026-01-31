/**
 * Transfer-Email Mismatch API route
 * Returns call IDs where:
 * - Email subject contains "no action"
 * - But webhook shows transfer was cancelled/failed
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase/client';
import { errorResponse, decodeBase64Payload } from '@/lib/api/utils';
import { extractTransfersFromMessages, isFailedTransferResult } from '@/lib/webhook-utils';
import type { Environment } from '@/lib/constants';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const env = (searchParams.get('env') || 'production') as Environment;

    const client = getSupabaseClient(env);

    // Step 1: Get emails with "no action" in subject (case insensitive)
    const { data: noActionEmails, error: emailError } = await client
      .from('email_logs')
      .select('call_id')
      .ilike('subject', '%no action%');

    if (emailError) {
      console.error('Error fetching no-action emails:', emailError);
      return errorResponse('Failed to fetch emails', 500, 'EMAIL_FETCH_ERROR');
    }

    // Extract unique call IDs from emails with "no action"
    const noActionCallIds = [...new Set(
      (noActionEmails || [])
        .map(row => row.call_id)
        .filter((id): id is number => id !== null)
    )];

    if (noActionCallIds.length === 0) {
      return NextResponse.json({ callIds: [] });
    }

    // Step 2: Get webhooks for these call IDs
    const { data: webhooks, error: webhookError } = await client
      .from('webhook_dumps')
      .select('call_id, payload')
      .in('call_id', noActionCallIds)
      .eq('webhook_type', 'end-of-call-report');

    if (webhookError) {
      console.error('Error fetching webhooks:', webhookError);
      return errorResponse('Failed to fetch webhooks', 500, 'WEBHOOK_FETCH_ERROR');
    }

    // Step 3: Check each webhook for failed/cancelled transfers
    const mismatchedCallIds: number[] = [];

    for (const webhook of webhooks || []) {
      if (!webhook.call_id) continue;

      try {
        const decodedPayload = decodeBase64Payload(webhook.payload) as Record<string, unknown>;
        const message = decodedPayload?.message as Record<string, unknown> | undefined;
        const artifact = message?.artifact as Record<string, unknown> | undefined;
        const messages = artifact?.messages as Array<Record<string, unknown>> | undefined;

        if (messages) {
          const transfers = extractTransfersFromMessages(messages);

          // Check if any transfer was cancelled/failed
          const hasFailedTransfer = transfers.some(t => isFailedTransferResult(t.result));

          if (hasFailedTransfer) {
            mismatchedCallIds.push(webhook.call_id);
          }
        }
      } catch (e) {
        // Skip webhooks with parsing errors
        console.debug('Error parsing webhook:', e);
      }
    }

    // Return unique call IDs with mismatches
    const uniqueCallIds = [...new Set(mismatchedCallIds)];

    return NextResponse.json({ callIds: uniqueCallIds });
  } catch (error) {
    console.error('Transfer-email mismatch API error:', error);
    return errorResponse('Internal server error', 500, 'INTERNAL_ERROR');
  }
}
