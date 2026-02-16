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
