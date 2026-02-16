/**
 * Shared Turso (libSQL) client singleton.
 * Used by reports-db, chat-store, and any future Turso consumers.
 */

import { createClient, type Client } from '@libsql/client';

let client: Client | null = null;

export function getTursoClient(): Client {
  if (client) return client;

  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!url) throw new Error('TURSO_DATABASE_URL is not set');
  if (!authToken) throw new Error('TURSO_AUTH_TOKEN is not set');

  client = createClient({ url, authToken });
  return client;
}
