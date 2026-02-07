/**
 * Shared auth helper for API routes
 * Supports Bearer token and Basic auth for external tool access (Postman, curl)
 * Requests without Authorization header are assumed to come through proxy with valid cookies
 */

import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';

interface AuthResult {
  authenticated: boolean;
  error?: string;
}

export async function authenticateRequest(request: NextRequest): Promise<AuthResult> {
  const authHeader = request.headers.get('authorization');

  // No Authorization header = request came through proxy with valid cookies
  if (!authHeader) {
    return { authenticated: true };
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_STAGE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_STAGE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return { authenticated: false, error: 'Auth configuration missing' };
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  // Bearer token auth
  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) {
      return { authenticated: false, error: 'Invalid or expired token' };
    }
    return { authenticated: true };
  }

  // Basic auth (email:password)
  if (authHeader.startsWith('Basic ')) {
    const base64 = authHeader.slice(6);
    let email: string, password: string;
    try {
      const decoded = atob(base64);
      const colonIndex = decoded.indexOf(':');
      if (colonIndex === -1) {
        return { authenticated: false, error: 'Invalid Basic auth format' };
      }
      email = decoded.slice(0, colonIndex);
      password = decoded.slice(colonIndex + 1);
    } catch {
      return { authenticated: false, error: 'Invalid Base64 encoding' };
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      return { authenticated: false, error: 'Invalid email or password' };
    }
    return { authenticated: true };
  }

  return { authenticated: false, error: 'Unsupported authorization scheme' };
}
