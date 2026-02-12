/**
 * Chat history CRUD API — server-side JSON file storage
 *
 * GET    /api/chat/history           — list conversations for current user
 * PUT    /api/chat/history           — save / update a conversation
 * PATCH  /api/chat/history           — rename a conversation
 * DELETE /api/chat/history?id=xxx    — delete one conversation
 * DELETE /api/chat/history?all=true  — clear all conversations for user
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAuthServerClient } from '@/lib/supabase/auth-server';
import { errorResponse } from '@/lib/api/utils';
import {
  getConversations,
  saveConversation,
  renameConversation,
  deleteConversation,
  clearConversations,
} from '@/lib/chat/chat-store';
import type { Conversation } from '@/types/chat';

async function getUserId(): Promise<string | null> {
  try {
    const supabase = await createAuthServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user?.id ?? null;
  } catch {
    return null;
  }
}

export async function GET() {
  const userId = await getUserId();
  if (!userId) return errorResponse('Unauthorized', 401);

  const conversations = getConversations(userId);
  return NextResponse.json({ conversations });
}

export async function PUT(request: NextRequest) {
  const userId = await getUserId();
  if (!userId) return errorResponse('Unauthorized', 401);

  let body: { conversation?: Conversation };
  try {
    body = await request.json();
  } catch {
    return errorResponse('Invalid JSON', 400);
  }

  const { conversation } = body;
  if (
    !conversation ||
    !conversation.id ||
    !Array.isArray(conversation.messages)
  ) {
    return errorResponse('conversation with id and messages is required', 400);
  }

  saveConversation(userId, conversation);
  return NextResponse.json({ ok: true });
}

export async function PATCH(request: NextRequest) {
  const userId = await getUserId();
  if (!userId) return errorResponse('Unauthorized', 401);

  let body: { id?: string; title?: string };
  try {
    body = await request.json();
  } catch {
    return errorResponse('Invalid JSON', 400);
  }

  const { id, title } = body;
  if (!id || !title?.trim()) {
    return errorResponse('id and title are required', 400);
  }

  const success = renameConversation(userId, id, title.trim());
  if (!success) return errorResponse('Conversation not found', 404);

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const userId = await getUserId();
  if (!userId) return errorResponse('Unauthorized', 401);

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  const all = searchParams.get('all');

  if (all === 'true') {
    clearConversations(userId);
    return NextResponse.json({ ok: true });
  }

  if (!id) {
    return errorResponse('id query param or all=true is required', 400);
  }

  const success = deleteConversation(userId, id);
  if (!success) return errorResponse('Conversation not found', 404);

  return NextResponse.json({ ok: true });
}
