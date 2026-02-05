/**
 * Supabase browser client for authentication
 * Uses @supabase/ssr for client-side auth operations
 */

import { createBrowserClient } from '@supabase/ssr';

/**
 * Create a Supabase browser client for auth operations
 * This client is used in client components for sign-in, sign-out, etc.
 */
export function createAuthBrowserClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_STAGE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_STAGE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('NEXT_PUBLIC_SUPABASE_STAGE_URL and NEXT_PUBLIC_SUPABASE_STAGE_ANON_KEY must be set');
  }

  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
