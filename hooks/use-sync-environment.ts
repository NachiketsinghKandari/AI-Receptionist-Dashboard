'use client';

import { useEffect } from 'react';
import { useEnvironment } from '@/components/providers/environment-provider';
import { ENVIRONMENTS, type Environment } from '@/lib/constants';

/**
 * Sync the global environment context from a URL search param (e.g. shared links).
 * Only runs on mount to avoid re-render loops.
 */
export function useSyncEnvironmentFromUrl(urlEnvParam: string | null) {
  const { environment, setEnvironment } = useEnvironment();

  useEffect(() => {
    if (
      urlEnvParam &&
      (ENVIRONMENTS as readonly string[]).includes(urlEnvParam) &&
      urlEnvParam !== environment
    ) {
      setEnvironment(urlEnvParam as Environment);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}
