'use client';

import { useState, useEffect } from 'react';
import type { User } from '@/types/api';

export function useUser() {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch('/api/auth/session')
      .then((res) => {
        if (!res.ok) return null;
        return res.json();
      })
      .then((data) => {
        if (data?.authenticated && data.user) {
          setUser({
            username: data.user.username,
            email: data.user.email,
            id: data.user.id,
          });
        }
      })
      .catch((err) => {
        console.error('Failed to fetch session:', err);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  return { user, isLoading };
}
