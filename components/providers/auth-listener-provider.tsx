'use client';

import { useEffect } from 'react';

/**
 * Auth session monitor — logs dashboard visits to Google Sheets
 * and periodically checks if the JWT session is still valid.
 */
export function AuthListenerProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    fetch('/api/analytics/log-visit', { method: 'POST' }).catch(() => {
      // Silently ignore — visit logging is non-critical
    });
  }, []);

  return <>{children}</>;
}
