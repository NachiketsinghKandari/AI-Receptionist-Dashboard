/**
 * JWT Session management
 */

import { SignJWT, jwtVerify, JWTPayload } from 'jose';
import { cookies } from 'next/headers';
import { SESSION_EXPIRY_HOURS } from './config';

const getSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET environment variable must be set');
  }
  return new TextEncoder().encode(secret);
};

export interface SessionPayload extends JWTPayload {
  id: string;
  email: string;
  username: string;
  apps: string[];
}

/**
 * Create a new session and set cookie
 */
export async function createSession(
  id: string,
  email: string,
  apps: string[]
): Promise<string> {
  const username = email.split('@')[0] || 'User';
  const token = await new SignJWT({ id, email, username, apps })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(`${SESSION_EXPIRY_HOURS}h`)
    .setIssuedAt()
    .sign(getSecret());

  const cookieStore = await cookies();
  cookieStore.set('session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_EXPIRY_HOURS * 60 * 60,
    path: '/',
  });

  return token;
}

/**
 * Get and validate current session
 */
export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get('session')?.value;

  if (!token) {
    return null;
  }

  try {
    const { payload } = await jwtVerify(token, getSecret());
    return payload as SessionPayload;
  } catch {
    return null;
  }
}

/**
 * Destroy current session
 */
export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete('session');
}

/**
 * Verify a session token (for proxy/middleware)
 */
export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return payload as SessionPayload;
  } catch {
    return null;
  }
}
