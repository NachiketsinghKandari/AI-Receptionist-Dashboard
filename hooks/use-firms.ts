'use client';

import { useQuery } from '@tanstack/react-query';
import { useEnvironment } from '@/components/providers/environment-provider';
import type { FirmsResponse } from '@/types/api';
import { CACHE_TTL_FIRMS } from '@/lib/constants';
import { anonymizeFirms } from '@/lib/firm-anonymizer';

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
    select: (data) => ({
      ...data,
      firms: anonymizeFirms(data.firms),
    }),
  });
}

/**
 * Returns firms with their original (non-anonymized) names.
 * Shares the same TanStack Query cache as useFirms — no extra network request.
 * Used internally for building real→anonymized name replacement maps.
 */
export function useRawFirms() {
  const { environment } = useEnvironment();
  return useQuery({
    queryKey: ['firms', environment],
    queryFn: () => fetchFirms(environment),
    staleTime: CACHE_TTL_FIRMS * 1000,
  });
}
