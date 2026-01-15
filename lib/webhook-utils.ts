/**
 * Shared utilities for parsing webhook payloads and extracting transfer information.
 * Used by both API routes (server-side filtering) and components (client-side display).
 */

import type { Transfer } from '@/types/database';

export interface TransferInfo {
  toolCallId: string;
  callerName: string;
  staffName: string;
  result: string;
}

export interface EnrichedTransferInfo extends TransferInfo {
  /** Database transfer ID if matched */
  transferId?: number;
  /** Transfer status from database */
  transferStatus?: string;
}

export interface ParsedWebhookPayload {
  squadOverrides?: Record<string, unknown>;
  assistantOverrides?: Record<string, unknown>;
  structuredOutputs?: Record<string, unknown>;
  transfers: TransferInfo[];
}

/**
 * Extract transfer details from webhook artifact messages by matching
 * tool_calls with their corresponding tool_call_results.
 */
export function extractTransfersFromMessages(messages: Array<Record<string, unknown>>): TransferInfo[] {
  // Step 1: Find all transfer_call tool calls and extract caller_name, staff_name
  const toolCallArgs = new Map<string, { callerName: string; staffName: string }>();

  for (const msg of messages) {
    if (msg.role === 'tool_calls') {
      const toolCalls = msg.toolCalls as Array<Record<string, unknown>> | undefined;
      if (toolCalls) {
        for (const tc of toolCalls) {
          const func = tc.function as Record<string, unknown> | undefined;
          if (func?.name === 'transfer_call') {
            const id = tc.id as string;
            const argsStr = func.arguments as string;
            try {
              const args = JSON.parse(argsStr);
              toolCallArgs.set(id, {
                callerName: args.caller_name || 'Unknown',
                staffName: args.staff_name || 'Unknown',
              });
            } catch {
              toolCallArgs.set(id, { callerName: 'Unknown', staffName: 'Unknown' });
            }
          }
        }
      }
    }
  }

  // Step 2: Find all transfer_call results and match with tool calls
  const transfers: TransferInfo[] = [];

  for (const msg of messages) {
    if (msg.role === 'tool_call_result' && msg.name === 'transfer_call') {
      const toolCallId = msg.toolCallId as string;
      const result = (msg.result as string) || 'Unknown';
      const args = toolCallArgs.get(toolCallId);

      transfers.push({
        toolCallId,
        callerName: args?.callerName || 'Unknown',
        staffName: args?.staffName || 'Unknown',
        result,
      });
    }
  }

  return transfers;
}

/**
 * Parse a webhook payload to extract structured sections and transfer information.
 */
export function parseWebhookPayload(payload: Record<string, unknown>): ParsedWebhookPayload {
  try {
    const message = payload?.message as Record<string, unknown> | undefined;
    const artifact = message?.artifact as Record<string, unknown> | undefined;
    const call = message?.call as Record<string, unknown> | undefined;

    const squadOverrides = call?.squadOverrides as Record<string, unknown> | undefined;
    const assistantOverrides = call?.assistantOverrides as Record<string, unknown> | undefined;
    const structuredOutputs = artifact?.structuredOutputs as Record<string, unknown> | undefined;

    const messages = artifact?.messages as Array<Record<string, unknown>> | undefined;
    const transfers = messages ? extractTransfersFromMessages(messages) : [];

    return { squadOverrides, assistantOverrides, structuredOutputs, transfers };
  } catch {
    return { transfers: [] };
  }
}

/**
 * Count the number of transfers in a webhook payload.
 * Useful for filtering webhooks/calls with multiple transfers.
 */
export function countTransfersInPayload(payload: Record<string, unknown>): number {
  return parseWebhookPayload(payload).transfers.length;
}

/**
 * Check if a webhook payload has multiple transfers (2 or more).
 */
export function hasMultipleTransfers(payload: Record<string, unknown>): boolean {
  return countTransfersInPayload(payload) >= 2;
}

/**
 * Enrich parsed webhook transfers with data from the database.
 * Uses database values (caller_name from call, transferred_to_name from transfers)
 * as the source of truth, falling back to webhook parsed values only when database
 * data is unavailable.
 *
 * Matching strategy:
 * - Primary: Match by transferred_to_name (staffName) - most reliable
 * - Secondary: Match by index order (both sources are ordered by time)
 *
 * @param parsedTransfers - Transfers parsed from webhook payload
 * @param callerName - Caller name from the call record
 * @param dbTransfers - Transfer records from the database (ordered by created_at)
 * @returns Enriched transfers with database values
 */
export function enrichTransfersWithDatabaseData(
  parsedTransfers: TransferInfo[],
  callerName: string | null | undefined,
  dbTransfers: Transfer[]
): EnrichedTransferInfo[] {
  // Create a working copy of database transfers to track which ones have been matched
  const unmatchedDbTransfers = [...dbTransfers];

  return parsedTransfers.map((parsed, index) => {
    // Try to find a matching database transfer
    let matchedTransfer: Transfer | undefined;

    // Strategy 1: Try to match by staff name (transferred_to_name)
    // This handles cases where the same person might be called multiple times
    const staffNameMatch = unmatchedDbTransfers.findIndex(
      (t) => t.transferred_to_name.toLowerCase() === parsed.staffName.toLowerCase()
    );

    if (staffNameMatch !== -1) {
      matchedTransfer = unmatchedDbTransfers[staffNameMatch];
      unmatchedDbTransfers.splice(staffNameMatch, 1);
    } else if (index < unmatchedDbTransfers.length) {
      // Strategy 2: Fall back to index-based matching
      // Both webhook transfers and database transfers are ordered by time
      matchedTransfer = unmatchedDbTransfers[0];
      unmatchedDbTransfers.shift();
    }

    // Build enriched transfer, preferring database values
    return {
      toolCallId: parsed.toolCallId,
      // Use database caller_name if available, otherwise fall back to parsed value
      callerName: callerName || parsed.callerName,
      // Use database transferred_to_name if matched, otherwise fall back to parsed value
      staffName: matchedTransfer?.transferred_to_name || parsed.staffName,
      result: parsed.result,
      transferId: matchedTransfer?.id,
      transferStatus: matchedTransfer?.transfer_status,
    };
  });
}

/**
 * Create transfer display info directly from database records.
 * Use this when webhook parsing is not available or not needed.
 *
 * @param callerName - Caller name from the call record
 * @param dbTransfers - Transfer records from the database
 * @returns Transfer info suitable for display
 */
export function createTransferInfoFromDatabase(
  callerName: string | null | undefined,
  dbTransfers: Transfer[]
): EnrichedTransferInfo[] {
  return dbTransfers.map((transfer) => ({
    toolCallId: `db-transfer-${transfer.id}`,
    callerName: callerName || 'Unknown Caller',
    staffName: transfer.transferred_to_name || 'Unknown Recipient',
    result: transfer.transfer_status || 'Unknown',
    transferId: transfer.id,
    transferStatus: transfer.transfer_status,
  }));
}
