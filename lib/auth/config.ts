/**
 * Auth configuration - Local credentials
 */

export interface UserConfig {
  email: string;
  password: string;
  apps: string[];
}

// Hardcoded user credentials
export const USERS: UserConfig[] = [
  {
    email: 'admin@receptionist.ai',
    password: 'admin@receptionist.ai123',
    apps: ['dashboard', 'analytics'],
  },
  {
    email: 'user@firm1.com',
    password: 'user@firm1.com123',
    apps: ['dashboard'],
  },
  {
    email: 'user@firm2.com',
    password: 'user@firm2.com123',
    apps: ['dashboard'],
  },
  {
    email: 'user@firm3.com',
    password: 'user@firm3.com123',
    apps: ['dashboard'],
  },
  {
    email: 'user@firm4.com',
    password: 'user@firm4.com123',
    apps: ['dashboard'],
  },
  {
    email: 'user@firm5.com',
    password: 'user@firm5.com123',
    apps: ['dashboard'],
  },
  {
    email: 'user@firm6.com',
    password: 'user@firm6.com123',
    apps: ['dashboard'],
  },
];

// Session configuration
export const SESSION_EXPIRY_HOURS = 24;

/**
 * Verify email and password against local credentials
 */
export function verifyCredentials(email: string, password: string): UserConfig | null {
  const user = USERS.find(
    (u) => u.email.toLowerCase() === email.toLowerCase() && u.password === password
  );
  return user ?? null;
}

/**
 * Generate a deterministic user ID from email
 */
export function getUserId(email: string): string {
  // Simple deterministic hash — sufficient for local auth
  let hash = 0;
  for (let i = 0; i < email.length; i++) {
    const char = email.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return `local-${Math.abs(hash).toString(36)}`;
}
