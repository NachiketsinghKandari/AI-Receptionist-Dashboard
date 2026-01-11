'use client';

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Environment } from '@/lib/constants';
import { DEFAULT_ENVIRONMENT } from '@/lib/constants';

interface EnvironmentContextType {
  environment: Environment;
  setEnvironment: (env: Environment) => void;
}

const EnvironmentContext = createContext<EnvironmentContextType | null>(null);

const STORAGE_KEY = 'hc-dashboard-environment';

export function EnvironmentProvider({ children }: { children: React.ReactNode }) {
  const [environment, setEnvironmentState] = useState<Environment>(DEFAULT_ENVIRONMENT);
  const [isHydrated, setIsHydrated] = useState(false);
  const queryClient = useQueryClient();

  // Hydrate from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as Environment | null;
    if (stored && (stored === 'production' || stored === 'staging')) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Intentional hydration from localStorage
      setEnvironmentState(stored);
    }
    setIsHydrated(true);
  }, []);

  const setEnvironment = useCallback((env: Environment) => {
    setEnvironmentState(env);
    localStorage.setItem(STORAGE_KEY, env);
    // Invalidate all queries to refetch with new environment
    queryClient.invalidateQueries();
  }, [queryClient]);

  // Prevent flash of wrong environment
  if (!isHydrated) {
    return null;
  }

  return (
    <EnvironmentContext.Provider value={{ environment, setEnvironment }}>
      {children}
    </EnvironmentContext.Provider>
  );
}

export function useEnvironment() {
  const context = useContext(EnvironmentContext);
  if (!context) {
    throw new Error('useEnvironment must be used within EnvironmentProvider');
  }
  return context;
}
