'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEnvironment } from '@/components/providers/environment-provider';
import type {
  EODReportFilters,
  EODReportsResponse,
  EODRawData,
  GenerateEODReportResponse,
  EODReportType,
} from '@/types/api';
import { CACHE_TTL_DATA } from '@/lib/constants';

async function fetchEODReports(
  filters: EODReportFilters,
  environment: string
): Promise<EODReportsResponse> {
  const params = new URLSearchParams();
  params.set('env', environment);

  if (filters.limit) params.set('limit', String(filters.limit));
  if (filters.offset) params.set('offset', String(filters.offset));
  if (filters.sortBy) params.set('sortBy', filters.sortBy);
  if (filters.sortOrder) params.set('sortOrder', filters.sortOrder);

  const response = await fetch(`/api/eod-reports?${params}`);
  if (!response.ok) throw new Error('Failed to fetch EOD reports');
  return response.json();
}

async function generateEODReport(
  reportDate: string,
  environment: string
): Promise<GenerateEODReportResponse> {
  const response = await fetch(`/api/eod-reports/generate?env=${environment}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reportDate }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to generate EOD report');
  }

  return response.json();
}

interface SaveEODReportResponse {
  report: { id: string; [key: string]: unknown };
  updated: boolean;
  message: string;
}

async function saveEODReport(
  reportDate: string,
  rawData: EODRawData,
  environment: string
): Promise<SaveEODReportResponse> {
  const response = await fetch(`/api/eod-reports?env=${environment}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reportDate, rawData, triggerType: 'manual' }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to save EOD report');
  }

  return response.json();
}

async function generateAIReport(
  reportId: string,
  rawData: EODRawData,
  reportType: EODReportType,
  environment: string
): Promise<{ success: boolean; reportType: EODReportType }> {
  const response = await fetch(`/api/eod-reports/ai-generate?env=${environment}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reportId, rawData, reportType }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || `Failed to generate ${reportType} AI report`);
  }

  return response.json();
}

export function useEODReports(filters: EODReportFilters) {
  const { environment } = useEnvironment();

  return useQuery({
    queryKey: ['eod-reports', 'list', environment, filters],
    queryFn: () => fetchEODReports(filters, environment),
    staleTime: CACHE_TTL_DATA * 1000,
    placeholderData: (prev) => prev,
  });
}

export function useGenerateEODReport() {
  const { environment } = useEnvironment();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (reportDate: string) => generateEODReport(reportDate, environment),
    onSuccess: () => {
      // Invalidate the reports list to refetch
      queryClient.invalidateQueries({ queryKey: ['eod-reports', 'list'] });
    },
  });
}

export function useSaveEODReport() {
  const { environment } = useEnvironment();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ reportDate, rawData }: { reportDate: string; rawData: EODRawData }) =>
      saveEODReport(reportDate, rawData, environment),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['eod-reports', 'list'] });
    },
  });
}

export function useGenerateSuccessReport() {
  const { environment } = useEnvironment();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ reportId, rawData }: { reportId: string; rawData: EODRawData }) =>
      generateAIReport(reportId, rawData, 'success', environment),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['eod-reports', 'list'] });
    },
  });
}

export function useGenerateFailureReport() {
  const { environment } = useEnvironment();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ reportId, rawData }: { reportId: string; rawData: EODRawData }) =>
      generateAIReport(reportId, rawData, 'failure', environment),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['eod-reports', 'list'] });
    },
  });
}

export function useGenerateFullReport() {
  const { environment } = useEnvironment();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ reportId, rawData }: { reportId: string; rawData: EODRawData }) =>
      generateAIReport(reportId, rawData, 'full', environment),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['eod-reports', 'list'] });
    },
  });
}
