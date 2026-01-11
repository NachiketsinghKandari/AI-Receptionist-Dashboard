/**
 * Auth configuration - Hardcoded users
 * Ported from unified_dashboard/config.py
 */

export interface UserConfig {
  password: string;
  apps: string[];
}

// Hardcoded user credentials (from config.py)
export const USERS: Record<string, UserConfig> = {
  admin: {
    password: 'admin123',
    apps: ['dashboard', 'analytics'],
  },
  dashboard_user: {
    password: 'dash123',
    apps: ['dashboard'],
  },
  analytics_user: {
    password: 'analytics123',
    apps: ['analytics'],
  },
};

// App configuration
export const APP_CONFIG = {
  dashboard: {
    name: 'Dashboard',
    description: 'Monitor calls, emails, transfers, and webhooks',
    icon: '📊',
  },
  analytics: {
    name: 'Analytics',
    description: 'Call analytics and resolution tracking',
    icon: '📈',
  },
} as const;

// Session configuration
export const SESSION_EXPIRY_HOURS = 24;
export const SESSION_IDLE_TIMEOUT_HOURS = 4;

/**
 * Verify username and password
 */
export function verifyCredentials(username: string, password: string): boolean {
  const user = USERS[username];
  return user !== undefined && user.password === password;
}

/**
 * Get list of apps available to user
 */
export function getUserApps(username: string): string[] {
  const user = USERS[username];
  return user?.apps ?? [];
}

/**
 * Check if user can access specific app
 */
export function canAccessApp(username: string, appKey: string): boolean {
  return getUserApps(username).includes(appKey);
}
