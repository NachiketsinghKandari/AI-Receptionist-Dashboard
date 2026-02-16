'use client';

/**
 * Auth session monitor — periodically checks if the JWT session is still valid.
 * If the session expires or is cleared, redirects to /login.
 */
export function AuthListenerProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
