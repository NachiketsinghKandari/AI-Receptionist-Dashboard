'use client';

import { useQuery } from '@tanstack/react-query';
import { useEnvironment } from '@/components/providers/environment-provider';
import type { TransferFilters, TransfersResponse } from '@/types/api';
import { CACHE_TTL_DATA } from '@/lib/constants';

async function fetchTransfers(filters: TransferFilters, environment: string): Promise<TransfersResponse> {
  const params = new URLSearchParams();
  params.set('env', environment);

  if (filters.firmId) params.set('firmId', String(filters.firmId));
  if (filters.callId) params.set('callId', String(filters.callId));
  if (filters.status && filters.status !== 'All') params.set('status', filters.status);
  if (filters.transferType && filters.transferType !== 'Off') params.set('transferType', filters.transferType);
  if (filters.startDate) params.set('startDate', filters.startDate);
  if (filters.endDate) params.set('endDate', filters.endDate);
  if (filters.search) params.set('search', filters.search);
  if (filters.limit) params.set('limit', String(filters.limit));
  if (filters.offset) params.set('offset', String(filters.offset));
  if (filters.sortBy) params.set('sortBy', filters.sortBy);
  if (filters.sortOrder) params.set('sortOrder', filters.sortOrder);
  if (filters.dynamicFilters && filters.dynamicFilters.length > 0) {
    params.set('dynamicFilters', JSON.stringify(filters.dynamicFilters));
  }

  const response = await fetch(`/api/transfers?${params}`);
  if (!response.ok) throw new Error('Failed to fetch transfers');
  return response.json();
}

export function useTransfers(filters: TransferFilters) {
  const { environment } = useEnvironment();
  return useQuery({
    queryKey: ['transfers', 'list', environment, filters],
    queryFn: () => fetchTransfers(filters, environment),
    staleTime: CACHE_TTL_DATA * 1000,
    placeholderData: (prev) => prev,
  });
}
