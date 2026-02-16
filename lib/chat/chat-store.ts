/**
 * Server-side chat history store backed by Turso (libSQL).
 *
 * Table: conversations
 *   id          TEXT PRIMARY KEY
 *   user_id     TEXT NOT NULL
 *   title       TEXT NOT NULL
 *   messages    TEXT NOT NULL   (JSON-serialised ChatMessage[])
 *   created_at  INTEGER NOT NULL
 *   updated_at  INTEGER NOT NULL
 */

import { getTursoClient } from '@/lib/turso/client';
import type { Conversation } from '@/types/chat';

const MAX_CONVERSATIONS_PER_USER = 50;

// --- Schema ---

let schemaReady = false;

async function ensureSchema(): Promise<void> {
  if (schemaReady) return;

  const db = getTursoClient();
  await db.batch(
    [
      {
        sql: `CREATE TABLE IF NOT EXISTS conversations (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          title TEXT NOT NULL,
          messages TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        )`,
        args: [],
      },
      {
        sql: 'CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id)',
        args: [],
      },
      {
        sql: 'CREATE INDEX IF NOT EXISTS idx_conversations_user_updated ON conversations(user_id, updated_at)',
        args: [],
      },
    ],
    'write',
  );

  schemaReady = true;
}

// --- Helpers ---

function rowToConversation(row: Record<string, unknown>): Conversation {
  return {
    id: row.id as string,
    title: row.title as string,
    messages: JSON.parse(row.messages as string),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

// --- Public API (all async) ---

/** Get all conversations for a user, sorted by most recent first */
export async function getConversations(userId: string): Promise<Conversation[]> {
  await ensureSchema();

  const db = getTursoClient();
  const result = await db.execute({
    sql: 'SELECT * FROM conversations WHERE user_id = ? ORDER BY updated_at DESC LIMIT ?',
    args: [userId, MAX_CONVERSATIONS_PER_USER],
  });

  return result.rows.map(rowToConversation);
}

/** Insert or update a conversation for a user */
export async function saveConversation(userId: string, conversation: Conversation): Promise<void> {
  await ensureSchema();

  const db = getTursoClient();
  const messagesJson = JSON.stringify(conversation.messages);

  // Check if it already exists to preserve original createdAt
  const existing = await db.execute({
    sql: 'SELECT created_at FROM conversations WHERE id = ? AND user_id = ?',
    args: [conversation.id, userId],
  });

  if (existing.rows.length > 0) {
    // Update — keep original createdAt
    await db.execute({
      sql: 'UPDATE conversations SET title = ?, messages = ?, updated_at = ? WHERE id = ? AND user_id = ?',
      args: [conversation.title, messagesJson, conversation.updatedAt, conversation.id, userId],
    });
  } else {
    // Insert new
    await db.execute({
      sql: 'INSERT INTO conversations (id, user_id, title, messages, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      args: [conversation.id, userId, conversation.title, messagesJson, conversation.createdAt, conversation.updatedAt],
    });

    // Cap per-user conversations: delete oldest beyond the limit
    await db.execute({
      sql: `DELETE FROM conversations WHERE user_id = ? AND id NOT IN (
        SELECT id FROM conversations WHERE user_id = ? ORDER BY updated_at DESC LIMIT ?
      )`,
      args: [userId, userId, MAX_CONVERSATIONS_PER_USER],
    });
  }
}

/** Rename a conversation. Returns false if not found. */
export async function renameConversation(
  userId: string,
  conversationId: string,
  title: string,
): Promise<boolean> {
  await ensureSchema();

  const db = getTursoClient();
  const result = await db.execute({
    sql: 'UPDATE conversations SET title = ?, updated_at = ? WHERE id = ? AND user_id = ?',
    args: [title, Date.now(), conversationId, userId],
  });

  return (result.rowsAffected ?? 0) > 0;
}

/** Delete a single conversation. Returns false if not found. */
export async function deleteConversation(userId: string, conversationId: string): Promise<boolean> {
  await ensureSchema();

  const db = getTursoClient();
  const result = await db.execute({
    sql: 'DELETE FROM conversations WHERE id = ? AND user_id = ?',
    args: [conversationId, userId],
  });

  return (result.rowsAffected ?? 0) > 0;
}

/** Delete all conversations for a user */
export async function clearConversations(userId: string): Promise<void> {
  await ensureSchema();

  const db = getTursoClient();
  await db.execute({
    sql: 'DELETE FROM conversations WHERE user_id = ?',
    args: [userId],
  });
}
