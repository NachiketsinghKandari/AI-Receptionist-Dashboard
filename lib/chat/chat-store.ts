/**
 * Server-side chat history store.
 * In-memory Map<userId, Conversation[]> backed by a CSV file on disk.
 *
 * CSV columns: userId, conversationId, title, messages (JSON), createdAt, updatedAt
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import type { Conversation } from '@/types/chat';

const DATA_DIR = join(process.cwd(), '.data');
const STORE_FILE = join(DATA_DIR, 'chat-history.csv');
const MAX_CONVERSATIONS_PER_USER = 50;

const CSV_HEADER = 'userId,conversationId,title,messages,createdAt,updatedAt';

/* ------------------------------------------------------------------ */
/*  CSV helpers                                                        */
/* ------------------------------------------------------------------ */

/** Escape a value for CSV — wraps in double-quotes if needed */
function csvEscape(value: string): string {
  if (
    value.includes(',') ||
    value.includes('"') ||
    value.includes('\n') ||
    value.includes('\r')
  ) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Parse a single CSV row that may contain quoted fields with commas/newlines */
function parseCsvRow(row: string): string[] {
  const fields: string[] = [];
  let i = 0;

  while (i <= row.length) {
    if (i === row.length) {
      // trailing comma → empty field
      break;
    }

    if (row[i] === '"') {
      // Quoted field
      let value = '';
      i++; // skip opening quote
      while (i < row.length) {
        if (row[i] === '"') {
          if (i + 1 < row.length && row[i + 1] === '"') {
            // Escaped double-quote
            value += '"';
            i += 2;
          } else {
            // Closing quote
            i++; // skip closing quote
            break;
          }
        } else {
          value += row[i];
          i++;
        }
      }
      fields.push(value);
      // Skip comma separator
      if (i < row.length && row[i] === ',') i++;
    } else {
      // Unquoted field
      const nextComma = row.indexOf(',', i);
      if (nextComma === -1) {
        fields.push(row.slice(i));
        i = row.length;
      } else {
        fields.push(row.slice(i, nextComma));
        i = nextComma + 1;
      }
    }
  }

  return fields;
}

/**
 * Split CSV text into logical rows.
 * Handles newlines inside quoted fields correctly.
 */
function splitCsvRows(text: string): string[] {
  const rows: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (ch === '"') {
      if (inQuotes && i + 1 < text.length && text[i + 1] === '"') {
        current += '""';
        i++; // skip escaped quote
      } else {
        inQuotes = !inQuotes;
        current += ch;
      }
    } else if (ch === '\n' && !inQuotes) {
      if (current.trim()) rows.push(current);
      current = '';
    } else if (ch === '\r' && !inQuotes) {
      // skip \r, the \n that follows will trigger row push
    } else {
      current += ch;
    }
  }

  if (current.trim()) rows.push(current);
  return rows;
}

/* ------------------------------------------------------------------ */
/*  Store internals                                                    */
/* ------------------------------------------------------------------ */

/** In-memory HashMap: userId → Conversation[] */
let store: Map<string, Conversation[]> | null = null;

function ensureLoaded(): Map<string, Conversation[]> {
  if (store) return store;

  store = new Map();

  if (existsSync(STORE_FILE)) {
    try {
      const raw = readFileSync(STORE_FILE, 'utf-8');
      const rows = splitCsvRows(raw);

      // Skip header row
      for (let r = 1; r < rows.length; r++) {
        const fields = parseCsvRow(rows[r]);
        if (fields.length < 6) continue;

        const [userId, conversationId, title, messagesJson, createdAt, updatedAt] = fields;

        let messages;
        try {
          messages = JSON.parse(messagesJson);
        } catch {
          continue; // skip corrupted row
        }

        const conversation: Conversation = {
          id: conversationId,
          title,
          messages,
          createdAt: Number(createdAt),
          updatedAt: Number(updatedAt),
        };

        const existing = store.get(userId) ?? [];
        existing.push(conversation);
        store.set(userId, existing);
      }
    } catch {
      // Corrupted file — start fresh
      store = new Map();
    }
  }

  return store;
}

function persistToDisk(): void {
  const map = ensureLoaded();

  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }

  const lines: string[] = [CSV_HEADER];

  for (const [userId, conversations] of map) {
    for (const conv of conversations) {
      const messagesJson = JSON.stringify(conv.messages);
      lines.push(
        [
          csvEscape(userId),
          csvEscape(conv.id),
          csvEscape(conv.title),
          csvEscape(messagesJson),
          String(conv.createdAt),
          String(conv.updatedAt),
        ].join(','),
      );
    }
  }

  writeFileSync(STORE_FILE, lines.join('\n') + '\n', 'utf-8');
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/** Get all conversations for a user, sorted by most recent first */
export function getConversations(userId: string): Conversation[] {
  const map = ensureLoaded();
  const conversations = map.get(userId) ?? [];
  return [...conversations].sort((a, b) => b.updatedAt - a.updatedAt);
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
