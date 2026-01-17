'use client';

import { useQuery } from '@tanstack/react-query';
import { useEnvironment } from '@/components/providers/environment-provider';
import type { CallFilters, CallsResponse, CallDetailResponse } from '@/types/api';
import { CACHE_TTL_DATA } from '@/lib/constants';

async function fetchCalls(filters: CallFilters, environment: string): Promise<CallsResponse> {
  const params = new URLSearchParams();
  params.set('env', environment);

  if (filters.firmId) params.set('firmId', String(filters.firmId));
  if (filters.callType && filters.callType !== 'All') params.set('callType', filters.callType);
  if (filters.transferType && filters.transferType !== 'Off') params.set('transferType', filters.transferType);
  if (filters.platformCallId) params.set('platformCallId', filters.platformCallId);
  if (filters.startDate) params.set('startDate', filters.startDate);
  if (filters.endDate) params.set('endDate', filters.endDate);
  if (filters.search) params.set('search', filters.search);
  if (filters.limit) params.set('limit', String(filters.limit));
  if (filters.offset) params.set('offset', String(filters.offset));
  if (filters.sortBy) params.set('sortBy', filters.sortBy);
  if (filters.sortOrder) params.set('sortOrder', filters.sortOrder);
  if (filters.multipleTransfers) params.set('multipleTransfers', 'true');

  const response = await fetch(`/api/calls?${params}`);
  if (!response.ok) throw new Error('Failed to fetch calls');
  return response.json();
}

async function fetchCallDetail(id: number, environment: string): Promise<CallDetailResponse> {
  const response = await fetch(`/api/calls/${id}?env=${environment}`);
  if (!response.ok) throw new Error('Failed to fetch call detail');
  return response.json();
}

export function useCalls(filters: CallFilters) {
  const { environment } = useEnvironment();
  return useQuery({
    queryKey: ['calls', 'list', environment, filters],
    queryFn: () => fetchCalls(filters, environment),
    staleTime: CACHE_TTL_DATA * 1000,
    placeholderData: (prev) => prev,
  });
}

export function useCallDetail(id: number | null) {
  const { environment } = useEnvironment();
  return useQuery({
    queryKey: ['calls', 'detail', environment, id],
    queryFn: () => fetchCallDetail(id!, environment),
    enabled: id !== null,
    staleTime: CACHE_TTL_DATA * 1000,
  });
}

// Types for important calls API
interface ImportantCallsResponse {
  callIds: number[];
}

async function fetchImportantCallIds(environment: string): Promise<ImportantCallsResponse> {
  const response = await fetch(`/api/calls/important?env=${environment}`);
  if (!response.ok) throw new Error('Failed to fetch important calls');
  return response.json();
}

/**
 * Hook to fetch call IDs that have emails with "[Important]" in the subject
 * Used to highlight important calls in the table
 */
export function useImportantCallIds() {
  const { environment } = useEnvironment();
  return useQuery({
    queryKey: ['calls', 'important', environment],
    queryFn: () => fetchImportantCallIds(environment),
    staleTime: 60 * 1000, // 1 minute
    select: (data) => new Set(data.callIds),
  });
}

// Types for transfer-email mismatch API
interface TransferEmailMismatchResponse {
  callIds: number[];
}

async function fetchTransferEmailMismatchIds(environment: string): Promise<TransferEmailMismatchResponse> {
  const response = await fetch(`/api/calls/transfer-email-mismatch?env=${environment}`);
  if (!response.ok) throw new Error('Failed to fetch transfer-email mismatches');
  return response.json();
}

/**
 * Hook to fetch call IDs where:
 * - Email subject contains "no action"
 * - But webhook shows transfer was cancelled/failed
 * Used to highlight inconsistent calls in the table
 */
export function useTransferEmailMismatchIds() {
  const { environment } = useEnvironment();
  return useQuery({
    queryKey: ['calls', 'transfer-email-mismatch', environment],
    queryFn: () => fetchTransferEmailMismatchIds(environment),
    staleTime: 60 * 1000, // 1 minute
    select: (data) => new Set(data.callIds),
  });
}
