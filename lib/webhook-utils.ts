/**
 * Shared utilities for parsing webhook payloads and extracting transfer information.
 * Used by both API routes (server-side filtering) and components (client-side display).
 */

export interface TransferInfo {
  toolCallId: string;
  callerName: string;
  staffName: string;
  result: string;
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
