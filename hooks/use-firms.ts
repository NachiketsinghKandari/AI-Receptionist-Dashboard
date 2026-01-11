'use client';

import { useQuery } from '@tanstack/react-query';
import { useEnvironment } from '@/components/providers/environment-provider';
import type { FirmsResponse } from '@/types/api';
import { CACHE_TTL_FIRMS } from '@/lib/constants';

async function fetchFirms(environment: string): Promise<FirmsResponse> {
  const response = await fetch(`/api/firms?env=${environment}`);
  if (!response.ok) throw new Error('Failed to fetch firms');
  return response.json();
}

export function useFirms() {
  const { environment } = useEnvironment();
  return useQuery({
    queryKey: ['firms', environment],
    queryFn: () => fetchFirms(environment),
    staleTime: CACHE_TTL_FIRMS * 1000,
  });
}
