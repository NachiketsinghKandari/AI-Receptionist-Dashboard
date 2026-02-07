'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEnvironment } from '@/components/providers/environment-provider';
import type {
  EODReportFilters,
  EODReportsResponse,
  EODRawData,
  WeeklyRawData,
  GenerateEODReportResponse,
  GenerateWeeklyReportResponse,
  EODReportType,
  EODReportCategory,
  EODReport,
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
  if (filters.firmId) params.set('firmId', String(filters.firmId));
  if (filters.reportCategory) params.set('reportType', filters.reportCategory);

  const response = await fetch(`/api/reports?${params}`);
  if (!response.ok) throw new Error('Failed to fetch EOD reports');
  return response.json();
}

async function fetchReportByDate(
  date: string,
  reportType: 'eod' | 'weekly',
  environment: string
): Promise<{ report: EODReport }> {
  const params = new URLSearchParams();
  params.set('env', environment);
  params.set('type', reportType);

  const response = await fetch(`/api/reports/${date}?${params}`);
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to fetch report');
  }
  return response.json();
}

async function generateEODReport(
  reportDate: string,
  environment: string,
  firmId?: number | null
): Promise<GenerateEODReportResponse> {
  const response = await fetch(`/api/reports/payload-generate?env=${environment}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reportDate, firmId }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to generate EOD report');
  }

  return response.json();
}

interface SaveReportResponse {
  report: { id: string; [key: string]: unknown };
  updated: boolean;
  message: string;
}

async function saveReport(
  reportDate: string,
  rawData: EODRawData | WeeklyRawData,
  environment: string,
  firmId?: number | null,
  reportType?: EODReportCategory
): Promise<SaveReportResponse> {
  const response = await fetch(`/api/reports?env=${environment}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reportDate, rawData, triggerType: 'manual', firmId, reportType: reportType || 'eod' }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to save EOD report');
  }

  return response.json();
}

async function generateAIReport(
  reportId: string,
  rawData: EODRawData | WeeklyRawData,
  reportType: EODReportType,
  environment: string
): Promise<{ success: boolean; reportType: EODReportType }> {
  const response = await fetch(`/api/reports/ai-generate?env=${environment}`, {
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
    queryKey: ['reports', 'list', environment, filters],
    queryFn: () => fetchEODReports(filters, environment),
    staleTime: CACHE_TTL_DATA * 1000,
    placeholderData: (prev) => prev,
  });
}

export function useGenerateEODReport() {
  const { environment } = useEnvironment();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ reportDate, firmId }: { reportDate: string; firmId?: number | null }) =>
      generateEODReport(reportDate, environment, firmId),
    onSuccess: () => {
      // Invalidate the reports list to refetch
      queryClient.invalidateQueries({ queryKey: ['reports', 'list'] });
    },
  });
}

export function useSaveReport() {
  const { environment } = useEnvironment();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ reportDate, rawData, firmId, reportType }: { reportDate: string; rawData: EODRawData | WeeklyRawData; firmId?: number | null; reportType?: EODReportCategory }) =>
      saveReport(reportDate, rawData, environment, firmId, reportType),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reports', 'list'] });
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
      queryClient.invalidateQueries({ queryKey: ['reports', 'list'] });
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
      queryClient.invalidateQueries({ queryKey: ['reports', 'list'] });
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
      queryClient.invalidateQueries({ queryKey: ['reports', 'list'] });
    },
  });
}

async function generateWeeklyReport(
  weekDate: string,
  environment: string,
  firmId?: number | null
): Promise<GenerateWeeklyReportResponse> {
  const response = await fetch(`/api/reports/weekly-generate?env=${environment}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ weekDate, firmId }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to generate weekly report');
  }

  return response.json();
}

export function useGenerateWeeklyReport() {
  const { environment } = useEnvironment();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ weekDate, firmId }: { weekDate: string; firmId?: number | null }) =>
      generateWeeklyReport(weekDate, environment, firmId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reports', 'list'] });
    },
  });
}

export function useGenerateWeeklyAIReport() {
  const { environment } = useEnvironment();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ reportId, rawData }: { reportId: string; rawData: WeeklyRawData }) =>
      generateAIReport(reportId, rawData, 'weekly', environment),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reports', 'list'] });
    },
  });
}

export function useReportByDate(
  date: string | null,
  reportType: 'eod' | 'weekly',
  environmentOverride?: string
) {
  const { environment: contextEnvironment } = useEnvironment();
  const environment = environmentOverride || contextEnvironment;

  return useQuery({
    queryKey: ['report', reportType, date, environment],
    queryFn: () => fetchReportByDate(date!, reportType, environment),
    enabled: !!date,
    staleTime: CACHE_TTL_DATA * 1000,
  });
}
