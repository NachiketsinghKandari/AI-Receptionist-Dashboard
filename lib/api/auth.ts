/**
 * Shared auth helper for API routes
 * Supports Bearer token (JWT) and Basic auth for external tool access (Postman, curl)
 * Requests without Authorization header are assumed to come through proxy with valid session cookie
 */

import { NextRequest } from 'next/server';
import { verifySession } from '@/lib/auth/session';
import { verifyCredentials } from '@/lib/auth/config';

interface AuthResult {
  authenticated: boolean;
  error?: string;
}

export async function authenticateRequest(request: NextRequest): Promise<AuthResult> {
  const authHeader = request.headers.get('authorization');

  // No Authorization header — verify session cookie exists (set by proxy.ts auth)
  if (!authHeader) {
    const hasSession = request.cookies.get('session')?.value;
    if (!hasSession) {
      return { authenticated: false, error: 'No authorization credentials provided' };
    }
    return { authenticated: true };
  }

  // Bearer token auth (JWT)
  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const session = await verifySession(token);
    if (!session) {
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

    const user = verifyCredentials(email, password);
    if (!user) {
      return { authenticated: false, error: 'Invalid email or password' };
    }
    return { authenticated: true };
  }

  return { authenticated: false, error: 'Unsupported authorization scheme' };
}
