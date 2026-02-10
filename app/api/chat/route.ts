/**
 * Chat API endpoint — streams NDJSON events from Gemini function calling.
 * POST /api/chat
 * Body: { messages: { role: 'user' | 'assistant'; content: string }[], environment?: string }
 */

import { NextRequest } from 'next/server';
import { authenticateRequest } from '@/lib/api/auth';
import { errorResponse, parseEnvironment } from '@/lib/api/utils';
import { streamChat } from '@/lib/chat/gemini-chat';

export async function POST(request: NextRequest) {
  // Auth check
  const auth = await authenticateRequest(request);
  if (!auth.authenticated) {
    return errorResponse(auth.error || 'Unauthorized', 401);
  }

  let body: { messages?: unknown; environment?: string };
  try {
    body = await request.json();
  } catch {
    return errorResponse('Invalid JSON body', 400);
  }

  const { messages, environment: envParam } = body;

  if (!Array.isArray(messages) || messages.length === 0) {
    return errorResponse('messages must be a non-empty array', 400);
  }

  // Validate message shape
  for (const msg of messages) {
    if (
      typeof msg !== 'object' ||
      !msg ||
      !('role' in msg) ||
      !('content' in msg) ||
      typeof msg.content !== 'string' ||
      (msg.role !== 'user' && msg.role !== 'assistant')
    ) {
      return errorResponse('Each message must have role (user|assistant) and content (string)', 400);
    }
  }

  const environment = parseEnvironment(envParam ?? null);

  // Create a readable stream of NDJSON events
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of streamChat(
          messages as { role: 'user' | 'assistant'; content: string }[],
          environment,
        )) {
          controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'));
        }
      } catch (err) {
        const errorEvent = {
          type: 'error',
          error: err instanceof Error ? err.message : 'Stream error',
        };
        controller.enqueue(encoder.encode(JSON.stringify(errorEvent) + '\n'));
        controller.enqueue(encoder.encode(JSON.stringify({ type: 'done' }) + '\n'));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson',
      'Cache-Control': 'no-cache',
      'Transfer-Encoding': 'chunked',
    },
  });
}
