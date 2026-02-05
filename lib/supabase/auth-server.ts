/**
 * Supabase server client for authentication
 * Uses @supabase/ssr for server-side auth operations in Next.js
 */

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Create a Supabase server client for auth operations
 * This client handles cookie management for server-side auth
 */
export async function createAuthServerClient() {
  const cookieStore = await cookies();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_STAGE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_STAGE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('NEXT_PUBLIC_SUPABASE_STAGE_URL and NEXT_PUBLIC_SUPABASE_STAGE_ANON_KEY must be set');
  }

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // The `setAll` method was called from a Server Component.
          // This can be ignored if you have middleware refreshing
          // user sessions.
        }
      },
    },
  });
}
