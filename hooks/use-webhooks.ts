'use client';

import { useQuery } from '@tanstack/react-query';
import { useEnvironment } from '@/components/providers/environment-provider';
import type { WebhookFilters, WebhooksResponse } from '@/types/api';
import { CACHE_TTL_DATA } from '@/lib/constants';

async function fetchWebhooks(filters: WebhookFilters, environment: string): Promise<WebhooksResponse> {
  const params = new URLSearchParams();
  params.set('env', environment);

  if (filters.platform && filters.platform !== 'All') params.set('platform', filters.platform);
  if (filters.callId) params.set('callId', String(filters.callId));
  if (filters.platformCallId) params.set('platformCallId', filters.platformCallId);
  if (filters.startDate) params.set('startDate', filters.startDate);
  if (filters.endDate) params.set('endDate', filters.endDate);
  if (filters.search) params.set('search', filters.search);
  if (filters.limit) params.set('limit', String(filters.limit));
  if (filters.offset) params.set('offset', String(filters.offset));
  if (filters.sortBy) params.set('sortBy', filters.sortBy);
  if (filters.sortOrder) params.set('sortOrder', filters.sortOrder);
  if (filters.multipleTransfers) params.set('multipleTransfers', 'true');

  const response = await fetch(`/api/webhooks?${params}`);
  if (!response.ok) throw new Error('Failed to fetch webhooks');
  return response.json();
}

export function useWebhooks(filters: WebhookFilters) {
  const { environment } = useEnvironment();
  return useQuery({
    queryKey: ['webhooks', 'list', environment, filters],
    queryFn: () => fetchWebhooks(filters, environment),
    staleTime: CACHE_TTL_DATA * 1000,
    placeholderData: (prev) => prev,
  });
}

/**
 * Fetch webhooks for a specific call by platformCallId
 * Used in call detail panel to load webhooks separately for better performance
 */
export function useWebhooksForCall(platformCallId: string | null) {
  const { environment } = useEnvironment();
  return useQuery({
    queryKey: ['webhooks', 'forCall', environment, platformCallId],
    queryFn: async () => {
      const response = await fetch(`/api/webhooks?platformCallId=${encodeURIComponent(platformCallId!)}&env=${environment}`);
      if (!response.ok) throw new Error('Failed to fetch webhooks');
      const data: WebhooksResponse = await response.json();
      return data.data;
    },
    enabled: !!platformCallId,
    staleTime: CACHE_TTL_DATA * 1000,
  });
}
