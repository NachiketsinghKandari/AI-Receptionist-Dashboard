'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createAuthBrowserClient } from '@/lib/supabase/auth-client';

/**
 * Listens for Supabase auth state changes on the client side.
 * When a token refresh fails (e.g. revoked/expired refresh token),
 * Supabase emits SIGNED_OUT — this provider catches that and
 * redirects to /login so the user doesn't sit on a broken session.
 */
export function AuthListenerProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  useEffect(() => {
    const supabase = createAuthBrowserClient();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        router.push('/login');
        router.refresh();
      }
      if (event === 'TOKEN_REFRESHED') {
        // Session was refreshed successfully — sync server state
        router.refresh();
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [router]);

  return <>{children}</>;
}
