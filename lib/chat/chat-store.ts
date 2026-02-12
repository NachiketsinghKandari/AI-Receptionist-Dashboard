/**
 * Server-side chat history store.
 * In-memory Map<userId, Conversation[]> backed by a JSON file on disk.
 * Created if not exists, read from if exists.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import type { Conversation } from '@/types/chat';

const DATA_DIR = join(process.cwd(), '.data');
const STORE_FILE = join(DATA_DIR, 'chat-history.json');
const MAX_CONVERSATIONS_PER_USER = 50;

/** In-memory HashMap: userId → Conversation[] */
let store: Map<string, Conversation[]> | null = null;

function ensureLoaded(): Map<string, Conversation[]> {
  if (store) return store;

  store = new Map();

  if (existsSync(STORE_FILE)) {
    try {
      const raw = readFileSync(STORE_FILE, 'utf-8');
      const data = JSON.parse(raw) as Record<string, Conversation[]>;
      for (const [userId, conversations] of Object.entries(data)) {
        store.set(userId, conversations);
      }
    } catch {
      // Corrupted file — start fresh
      store = new Map();
    }
  }

  return store;
}

function persistToDisk() {
  const map = ensureLoaded();
  const obj: Record<string, Conversation[]> = {};
  for (const [userId, conversations] of map) {
    obj[userId] = conversations;
  }

  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }

  writeFileSync(STORE_FILE, JSON.stringify(obj), 'utf-8');
}

/** Get all conversations for a user, sorted by most recent first */
export function getConversations(userId: string): Conversation[] {
  const map = ensureLoaded();
  return map.get(userId) ?? [];
}

/** Insert or update a conversation for a user */
export function saveConversation(userId: string, conversation: Conversation): void {
  const map = ensureLoaded();
  const conversations = map.get(userId) ?? [];

  const idx = conversations.findIndex((c) => c.id === conversation.id);
  if (idx >= 0) {
    // Update existing — preserve original createdAt
    conversations[idx] = { ...conversation, createdAt: conversations[idx].createdAt };
  } else {
    // Insert new at front
    conversations.unshift(conversation);
  }

  // Cap per-user conversations
  map.set(userId, conversations.slice(0, MAX_CONVERSATIONS_PER_USER));
  persistToDisk();
}

/** Rename a conversation. Returns false if not found. */
export function renameConversation(
  userId: string,
  conversationId: string,
  title: string,
): boolean {
  const map = ensureLoaded();
  const conversations = map.get(userId);
  if (!conversations) return false;

  const conv = conversations.find((c) => c.id === conversationId);
  if (!conv) return false;

  conv.title = title;
  conv.updatedAt = Date.now();
  persistToDisk();
  return true;
}

/** Delete a single conversation. Returns false if not found. */
export function deleteConversation(userId: string, conversationId: string): boolean {
  const map = ensureLoaded();
  const conversations = map.get(userId);
  if (!conversations) return false;

  const idx = conversations.findIndex((c) => c.id === conversationId);
  if (idx < 0) return false;

  conversations.splice(idx, 1);
  if (conversations.length === 0) {
    map.delete(userId);
  }
  persistToDisk();
  return true;
}

/** Delete all conversations for a user */
export function clearConversations(userId: string): void {
  const map = ensureLoaded();
  map.delete(userId);
  persistToDisk();
}
