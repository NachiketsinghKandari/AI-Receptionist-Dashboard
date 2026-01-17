'use client';

import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import type { SentryEventsResponse } from '@/types/api';
import { CACHE_TTL_DATA } from '@/lib/constants';

// Types for browse API
export interface SentryParsedEvent {
  event_id: string;
  message: string;
  event_type: string;
  transaction: string;
  level: string;
  environment: string;
  correlation_id: string;
  call_id: number | null;
  timestamp: string;
  logger: string;
}

export interface SentryGroupedSummary {
  correlation_id: string;
  call_id: number | null;
  event_count: number;
  level: string;
  types: string;
  first_timestamp: string;
}

export interface SentryBrowseResponse {
  summary: SentryGroupedSummary[];
  groups: Record<string, SentryParsedEvent[]>;
  totalEvents: number;
  filteredEvents: number;
  hasMore: boolean;
  nextCursor: string | null;
}

export interface SentryBrowseFilters {
  limit?: number;
  cursor?: string | null;
  eventType?: string | null;
  level?: string | null;
  search?: string | null;
}

async function fetchSentryEventsForCall(correlationId: string): Promise<SentryEventsResponse> {
  const response = await fetch(`/api/sentry/events?correlationId=${encodeURIComponent(correlationId)}`);
  if (!response.ok) throw new Error('Failed to fetch Sentry events');
  return response.json();
}

async function fetchSentryBrowse(filters: SentryBrowseFilters): Promise<SentryBrowseResponse> {
  const params = new URLSearchParams();
  if (filters.limit) params.set('limit', String(filters.limit));
  if (filters.cursor) params.set('cursor', filters.cursor);
  if (filters.eventType && filters.eventType !== 'All') params.set('eventType', filters.eventType);
  if (filters.level && filters.level !== 'All') params.set('level', filters.level);
  if (filters.search) params.set('search', filters.search);

  const response = await fetch(`/api/sentry/browse?${params}`);
  if (!response.ok) throw new Error('Failed to fetch Sentry events');
  return response.json();
}

export function useSentryEventsForCall(correlationId: string | null) {
  return useQuery({
    queryKey: ['sentry', 'events', correlationId],
    queryFn: () => fetchSentryEventsForCall(correlationId!),
    enabled: !!correlationId,
    staleTime: CACHE_TTL_DATA * 1000,
  });
}

export function useSentryBrowse(filters: SentryBrowseFilters) {
  return useQuery({
    queryKey: ['sentry', 'browse', filters],
    queryFn: () => fetchSentryBrowse(filters),
    staleTime: 60 * 1000, // 1 minute
  });
}

/**
 * Infinite query hook for Sentry browse with "Load More" support
 * Accumulates events from multiple pages
 */
export function useSentryBrowseInfinite(filters: Omit<SentryBrowseFilters, 'cursor'>) {
  return useInfiniteQuery({
    queryKey: ['sentry', 'browse', 'infinite', filters],
    queryFn: ({ pageParam }) => fetchSentryBrowse({ ...filters, cursor: pageParam }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.hasMore ? lastPage.nextCursor : undefined,
    staleTime: 60 * 1000, // 1 minute
  });
}

// Types for error check API
interface SentryErrorCheckResponse {
  correlationIds: string[];
}

async function fetchSentryErrorCheck(): Promise<SentryErrorCheckResponse> {
  const response = await fetch('/api/sentry/error-check');
  if (!response.ok) throw new Error('Failed to fetch Sentry error check');
  return response.json();
}

/**
 * Hook to fetch correlation IDs that have Sentry errors
 * Used to highlight calls with errors in the table
 */
export function useSentryErrorCorrelationIds() {
  return useQuery({
    queryKey: ['sentry', 'error-check'],
    queryFn: fetchSentryErrorCheck,
    staleTime: 60 * 1000, // 1 minute
    select: (data) => new Set(data.correlationIds),
  });
}
