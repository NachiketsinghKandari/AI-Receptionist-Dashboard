'use client';

import { useState, useEffect } from 'react';
import { createAuthBrowserClient } from '@/lib/supabase/auth-client';
import type { User } from '@/types/api';

export function useUser() {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const supabase = createAuthBrowserClient();

    // Get user directly from Supabase (reads from cookie, no network call needed for cached session)
    supabase.auth.getUser().then(({ data: { user: authUser } }) => {
      if (authUser) {
        const displayName =
          authUser.user_metadata?.name ||
          authUser.user_metadata?.full_name ||
          authUser.email?.split('@')[0] ||
          'User';

        setUser({
          username: displayName,
          email: authUser.email,
          id: authUser.id,
        });
      }
      setIsLoading(false);
    });
  }, []);

  return { user, isLoading };
}
