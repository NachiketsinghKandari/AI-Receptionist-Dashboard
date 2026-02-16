'use client';

import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { ColumnDef } from '@tanstack/react-table';
import {
  FileText,
  Loader2,
  Plus,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  Sparkles,
  CalendarPlus,
  X,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  GripVertical,
  ExternalLink,
  BarChart3,
  Copy,
  Share2,
  Check,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DataTable } from '@/components/tables/data-table';
import { CopyButton } from '@/components/ui/copy-button';
import { MarkdownReport } from '@/components/eod/markdown-report';
import { PDFExportButton } from '@/components/eod/pdf-export-button';
import { DocxExportButton } from '@/components/eod/docx-export-button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer';
import {
  useEODReports,
  useGenerateEODReport,
  useSaveReport,
  useGenerateSuccessReport,
  useGenerateFailureReport,
  useGenerateFullReport,
  useGenerateWeeklyReport,
  useGenerateWeeklyAIReport,
  useReportByDate,
} from '@/hooks/use-eod-reports';
import { useFirms, useRawFirms } from '@/hooks/use-firms';
import { useIsMobile } from '@/hooks/use-is-mobile';
import { useEnvironment } from '@/components/providers/environment-provider';
import { useSyncEnvironmentFromUrl } from '@/hooks/use-sync-environment';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { buildCekuraUrl } from '@/hooks/use-cekura';
import { DEFAULT_PAGE_LIMIT } from '@/lib/constants';
import { JsonViewer } from '@/components/ui/json-viewer';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import type { EODReport, EODRawData, WeeklyRawData, SortOrder, EODReportCategory, DataFormat } from '@/types/api';
import type { Firm } from '@/types/database';
import { getAnonymizedFirmName, anonymizeContent } from '@/lib/firm-anonymizer';
import { format, startOfWeek, endOfWeek } from 'date-fns';
import { formatUTCTimestamp } from '@/lib/formatting';
import { cn } from '@/lib/utils';
import { buildReportShareUrl, copyToClipboard } from '@/lib/report-share-url';
import { useClientConfig } from '@/hooks/use-client-config';

// Panel resize constants
const MIN_LEFT_PERCENT = 30;
const MAX_LEFT_PERCENT = 70;
const STORAGE_KEY = 'hc-eod-detail-panel-sizes';

function getStoredLayout(): number {
  if (typeof window === 'undefined') return 45;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (typeof parsed === 'number') return parsed;
    }
  } catch {
    // Ignore parse errors
  }
  return 45;
}

interface GeneratingState {
  reportId?: string;
  success?: boolean;
  failure?: boolean;
  full?: boolean;
}

function createColumns(generatingState?: GeneratingState, firms?: Firm[]): ColumnDef<EODReport>[] {
  return [
    {
      accessorKey: 'report_date',
      header: 'Report Date',
      cell: ({ row }) => {
        const value = row.getValue('report_date') as string;
        return <span className="font-medium">{value}</span>;
      },
    },
    {
      id: 'firm',
      header: 'Firm',
      cell: ({ row }) => {
        const firmId = row.original.firm_id;
        if (firmId == null) {
          return <span className="text-muted-foreground">All</span>;
        }
        const firmName = firms?.length
          ? getAnonymizedFirmName(firmId, firms)
          : `Firm ${firmId}`;
        return <span>{firmName}</span>;
      },
    },
    {
      id: 'call_count',
      header: 'Calls',
      cell: ({ row }) => {
        const rawData = row.original.raw_data as EODRawData;
        return <span className="font-mono">{rawData?.count ?? 0}</span>;
      },
    },
    {
      id: 'error_count',
      header: 'Errors',
      cell: ({ row }) => {
        const rawData = row.original.raw_data as EODRawData;
        // Handle both new structure (errors/failure) and old structure (calls array)
        const oldCalls = (rawData as unknown as { calls?: typeof rawData.failure })?.calls;
        const errorCount = rawData?.failure_count
          ?? rawData?.failure?.length
          ?? oldCalls?.filter(c => c.cekura?.status !== 'success').length
          ?? 0;
        return (
          <Badge variant={errorCount > 0 ? 'destructive' : 'secondary'}>
            {errorCount}
          </Badge>
        );
      },
    },
    {
      accessorKey: 'trigger_type',
      header: 'Trigger',
      cell: ({ row }) => {
        const value = row.getValue('trigger_type') as string;
        return <Badge variant="outline">{value}</Badge>;
      },
    },
    {
      accessorKey: 'generated_at',
      header: 'Generated At (UTC)',
      cell: ({ row }) => {
        const value = row.getValue('generated_at') as string;
        return formatUTCTimestamp(value);
      },
    },
    {
      id: 'ai_status',
      header: 'AI Reports',
      cell: ({ row }) => {
        const hasSuccessReport = row.original.success_report !== null;
        const hasFailureReport = row.original.failure_report !== null;
        const hasFullReport = row.original.full_report !== null;
        const isGenerating = generatingState?.reportId === row.original.id;
        const isGeneratingAny = isGenerating && (generatingState?.success || generatingState?.failure || generatingState?.full);
        const isWeekly = !!(row.original.raw_data as EODRawData)?.week_start;

        if (isWeekly) {
          // Weekly reports only have full_report
          if (hasFullReport) {
            return (
              <Badge variant="default" className="bg-green-600">
                <Sparkles className="h-3 w-3 mr-1" />
                Ready
              </Badge>
            );
          }
          if (isGeneratingAny) {
            return (
              <Badge variant="secondary">
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                Generating
              </Badge>
            );
          }
          return (
            <Badge variant="secondary">
              Pending
            </Badge>
          );
        }

        // EOD reports: 3 AI reports (success, failure, full)
        const readyCount = [hasSuccessReport, hasFailureReport, hasFullReport].filter(Boolean).length;

        if (readyCount === 3) {
          return (
            <Badge variant="default" className="bg-green-600">
              <Sparkles className="h-3 w-3 mr-1" />
              Ready
            </Badge>
          );
        }

        if (isGeneratingAny) {
          return (
            <Badge variant="secondary">
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              Generating
            </Badge>
          );
        }

        if (readyCount > 0) {
          return (
            <Badge variant="outline" className="text-yellow-600 border-yellow-600">
              {readyCount}/3
            </Badge>
          );
        }

        return (
          <Badge variant="secondary">
            Pending
          </Badge>
        );
      },
    },
  ];
}

export default function EODReportsPage() {
  const searchParams = useSearchParams();
  const { environment } = useEnvironment();
  const { config, isAdmin } = useClientConfig();
  const queryClient = useQueryClient();
  const [limit, setLimit] = useState(DEFAULT_PAGE_LIMIT);
  const [offset, setOffset] = useState(0);
  const [sortBy, setSortBy] = useState<string | null>('report_date');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [selectedReport, setSelectedReport] = useState<EODReport | null>(null);

  // Generate report state
  const [reportDate, setReportDate] = useState(format(new Date(), 'yyyy-MM-dd'));

  // Firm and report category filters
  const [firmId, setFirmId] = useState<number | null>(null);
  const [reportCategory, setReportCategory] = useState<EODReportCategory>('eod');

  // Shared report link params (date stays in DDMMYYYY format — the API expects it)
  const sharedReportDate = searchParams.get('report');
  const sharedReportType = searchParams.get('type') as 'eod' | 'weekly' | null;

  // Sync environment from URL (for shared links)
  useSyncEnvironmentFromUrl(searchParams.get('e'));

  // Fetch shared report by date (when opening a shared link)
  const { data: sharedReportData } = useReportByDate(
    sharedReportDate,
    sharedReportType || 'eod',
    searchParams.get('e') || undefined
  );

  // Auto-open the detail panel when shared report loads
  useEffect(() => {
    if (sharedReportData?.report && !selectedReport) {
      setSelectedReport(sharedReportData.report);
    }
  }, [sharedReportData?.report]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch firms list
  const { data: firmsData } = useFirms();
  const firms = [...(firmsData?.firms ?? [])].sort((a, b) => a.id - b.id);

  const filters = useMemo(
    () => ({ limit, offset, sortBy, sortOrder, firmId, reportCategory }),
    [limit, offset, sortBy, sortOrder, firmId, reportCategory]
  );

  const { data, isLoading, isFetching } = useEODReports(filters);
  const generateMutation = useGenerateEODReport();
  const saveMutation = useSaveReport();
  const successReportMutation = useGenerateSuccessReport();
  const failureReportMutation = useGenerateFailureReport();
  const fullReportMutation = useGenerateFullReport();
  const weeklyGenerateMutation = useGenerateWeeklyReport();
  const weeklyAIReportMutation = useGenerateWeeklyAIReport();

  // Data format for AI report generation (JSON or TOON)
  const [dataFormat, setDataFormat] = useState<DataFormat>('json');

  // Weekly generation progress tracking
  const [weeklyProgress, setWeeklyProgress] = useState<string | null>(null);
  const [forceRegenerate, setForceRegenerate] = useState(false);

  // Compute the week range for weekly report display
  const weekDateObj = useMemo(() => {
    const d = new Date(reportDate + 'T12:00:00Z');
    const mon = startOfWeek(d, { weekStartsOn: 1 });
    const sun = endOfWeek(d, { weekStartsOn: 1 });
    return { monday: mon, sunday: sun };
  }, [reportDate]);
  const weekRangeLabel = `${format(weekDateObj.monday, 'MMM d')} - ${format(weekDateObj.sunday, 'MMM d, yyyy')}`;

  const generatingState: GeneratingState = useMemo(() => ({
    reportId: successReportMutation.isPending ? successReportMutation.variables?.reportId
            : failureReportMutation.isPending ? failureReportMutation.variables?.reportId
            : fullReportMutation.isPending ? fullReportMutation.variables?.reportId
            : undefined,
    success: successReportMutation.isPending,
    failure: failureReportMutation.isPending,
    full: fullReportMutation.isPending,
  }), [
    successReportMutation.isPending, successReportMutation.variables?.reportId,
    failureReportMutation.isPending, failureReportMutation.variables?.reportId,
    fullReportMutation.isPending, fullReportMutation.variables?.reportId,
  ]);

  const columns = useMemo(() => createColumns(generatingState, firmsData?.firms), [generatingState, firmsData?.firms]);

  const handleSort = (column: string) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('desc');
    }
    setOffset(0);
  };

  const handleGenerate = async () => {
    try {
      // Step 1: Generate raw data from Cekura + Sentry (optionally filtered by firm)
      const result = await generateMutation.mutateAsync({ reportDate, firmId });
      const rawData = result.raw_data;

      // Step 2: Save the report to database
      const saveResult = await saveMutation.mutateAsync({ reportDate, rawData, firmId });

      // Step 3: Generate all three AI reports in parallel
      const reportId = saveResult.report.id;
      await Promise.allSettled([
        successReportMutation.mutateAsync({ reportId, rawData, dataFormat }),
        failureReportMutation.mutateAsync({ reportId, rawData, dataFormat }),
        fullReportMutation.mutateAsync({ reportId, rawData, dataFormat }),
      ]);
    } catch (error) {
      console.error('Failed to generate report:', error);
    }
  };

  const handleGenerateWeekly = async () => {
    try {
      // Step 1: Compute the days in the week (Mon-Sun, up to today)
      setWeeklyProgress('Checking existing reports...');
      const d = new Date(reportDate + 'T12:00:00Z');
      const mon = startOfWeek(d, { weekStartsOn: 1 });
      const sun = endOfWeek(d, { weekStartsOn: 1 });
      const today = new Date();
      today.setHours(23, 59, 59, 999);

      const days: string[] = [];
      const cursor = new Date(mon);
      while (cursor <= sun && cursor <= today) {
        days.push(format(cursor, 'yyyy-MM-dd'));
        cursor.setDate(cursor.getDate() + 1);
      }

      // Step 2: Check which days already have EOD reports (skip regenerating them unless forced)
      let daysToGenerate = days;
      if (!forceRegenerate) {
        const existingRes = await fetch(
          `/api/reports?env=${environment}&reportType=eod&limit=100&sortBy=report_date&sortOrder=desc`
        );
        const existingDates = new Set<string>();
        if (existingRes.ok) {
          const existingData = await existingRes.json();
          for (const r of (existingData.data || []) as EODReport[]) {
            if (days.includes(r.report_date)) {
              existingDates.add(r.report_date);
            }
          }
        }
        daysToGenerate = days.filter(day => !existingDates.has(day));
      }

      // Step 3: Generate & save EOD reports only for days that need it
      if (daysToGenerate.length > 0) {
        setWeeklyProgress(`Generating ${daysToGenerate.length} daily report${daysToGenerate.length > 1 ? 's' : ''}...`);
        await Promise.allSettled(
          daysToGenerate.map(async (day) => {
            try {
              const genRes = await fetch(`/api/reports/payload-generate?env=${environment}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reportDate: day, firmId }),
              });
              if (!genRes.ok) return;
              const genResult = await genRes.json();
              await fetch(`/api/reports?env=${environment}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reportDate: day, rawData: genResult.raw_data, triggerType: 'manual', firmId, reportType: 'eod' }),
              });
            } catch {
              // Individual day failures are acceptable — aggregation uses whatever exists
            }
          })
        );
      }
      queryClient.invalidateQueries({ queryKey: ['reports', 'list'] });

      // Step 4: Aggregate EOD reports for the week
      setWeeklyProgress('Aggregating weekly data...');
      const result = await weeklyGenerateMutation.mutateAsync({ weekDate: reportDate, firmId });
      const rawData = result.raw_data;

      // Step 5: Save the weekly report
      setWeeklyProgress('Saving weekly report...');
      const saveResult = await saveMutation.mutateAsync({
        reportDate: result.week_start,
        rawData,
        firmId,
        reportType: 'weekly',
      });

      // Step 6: Generate AI weekly narrative
      setWeeklyProgress('Generating AI report...');
      const reportId = saveResult.report.id;
      await weeklyAIReportMutation.mutateAsync({ reportId, rawData, dataFormat });

      setWeeklyProgress(null);
    } catch (error) {
      console.error('Failed to generate weekly report:', error);
      setWeeklyProgress(null);
    }
  };

  // Navigation logic for detail panel
  const dataArray = data?.data ?? [];
  const currentIndex = selectedReport
    ? dataArray.findIndex(r => r.id === selectedReport.id)
    : -1;
  const hasPrevious = currentIndex > 0;
  const hasNext = currentIndex >= 0 && currentIndex < dataArray.length - 1;

  const handlePrevious = () => {
    if (hasPrevious) setSelectedReport(dataArray[currentIndex - 1]);
  };
  const handleNext = () => {
    if (hasNext) setSelectedReport(dataArray[currentIndex + 1]);
  };

  // Get previous report for comparison (older report = next in array since sorted desc)
  const previousReport = currentIndex >= 0 && currentIndex < dataArray.length - 1
    ? dataArray[currentIndex + 1]
    : null;

  // Retry handlers for individual reports
  const handleRetrySuccessReport = async (fmt?: DataFormat) => {
    if (!selectedReport) return;
    try {
      await successReportMutation.mutateAsync({
        reportId: selectedReport.id,
        rawData: selectedReport.raw_data as EODRawData,
        dataFormat: fmt,
      });
    } catch (error) {
      console.error('Failed to retry success report:', error);
    }
  };

  const handleRetryFailureReport = async (fmt?: DataFormat) => {
    if (!selectedReport) return;
    try {
      await failureReportMutation.mutateAsync({
        reportId: selectedReport.id,
        rawData: selectedReport.raw_data as EODRawData,
        dataFormat: fmt,
      });
    } catch (error) {
      console.error('Failed to retry failure report:', error);
    }
  };

  const handleRetryFullReport = async (fmt?: DataFormat) => {
    if (!selectedReport) return;
    const isWeekly = !!(selectedReport.raw_data as EODRawData)?.week_start;
    try {
      if (isWeekly) {
        await weeklyAIReportMutation.mutateAsync({
          reportId: selectedReport.id,
          rawData: selectedReport.raw_data as WeeklyRawData,
          dataFormat: fmt,
        });
      } else {
        await fullReportMutation.mutateAsync({
          reportId: selectedReport.id,
          rawData: selectedReport.raw_data as EODRawData,
          dataFormat: fmt,
        });
      }
    } catch (error) {
      console.error('Failed to retry full report:', error);
    }
  };

  const isAnyPending = generateMutation.isPending || saveMutation.isPending ||
    successReportMutation.isPending || failureReportMutation.isPending || fullReportMutation.isPending ||
    weeklyGenerateMutation.isPending || weeklyAIReportMutation.isPending || weeklyProgress !== null;

  const hasAnyError = generateMutation.isError || saveMutation.isError ||
    successReportMutation.isError || failureReportMutation.isError || fullReportMutation.isError ||
    weeklyGenerateMutation.isError || weeklyAIReportMutation.isError;

  const anySuccess = successReportMutation.isSuccess || failureReportMutation.isSuccess || fullReportMutation.isSuccess ||
    (weeklyAIReportMutation.isSuccess && saveMutation.isSuccess);

  // Sidebar content component to avoid duplication
  const sidebarContent = (
    <div className="space-y-4">
      {/* Report Category Filter */}
      <div>
        <Label className="text-sm">Report Type</Label>
        <Tabs value={reportCategory} onValueChange={(v) => { setReportCategory(v as EODReportCategory); setOffset(0); setSelectedReport(null); }} className="mt-1">
          <TabsList className="w-full">
            <TabsTrigger value="eod" className="flex-1 text-xs">EOD Reports</TabsTrigger>
            <TabsTrigger value="weekly" className="flex-1 text-xs">Weekly Reports</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Firm Filter */}
      <div className="w-full">
        <Label className="text-sm">Firm</Label>
        <Select
          value={firmId ? String(firmId) : 'all'}
          onValueChange={(v) => {
            setFirmId(v === 'all' ? null : parseInt(v, 10));
            setOffset(0);
          }}
        >
          <SelectTrigger className="mt-1.5 h-11 w-full">
            <SelectValue placeholder="All Firms" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Firms</SelectItem>
            {firms.map((firm: Firm) => (
              <SelectItem key={firm.id} value={String(firm.id)}>
                {firm.name} (ID: {firm.id})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {reportCategory === 'eod' ? (
        <>
          <div className="pt-2 border-t">
            <Label htmlFor="reportDate" className="text-sm">
              Report Date
            </Label>
            <Input
              id="reportDate"
              type="date"
              value={reportDate}
              onChange={(e) => setReportDate(e.target.value)}
              className="mt-1"
            />
          </div>

          <div className="flex gap-0">
            <Button
              onClick={handleGenerate}
              disabled={isAnyPending || !reportDate}
              className="flex-1 h-11 rounded-r-none"
            >
              <span className="flex items-center justify-center gap-2">
                {generateMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Fetching data...</span>
                  </>
                ) : saveMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Saving report...</span>
                  </>
                ) : (successReportMutation.isPending || failureReportMutation.isPending || fullReportMutation.isPending) ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Generating AI...</span>
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4" />
                    <span>Generate Report</span>
                  </>
                )}
              </span>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  disabled={isAnyPending || !reportDate}
                  className="h-11 px-2 rounded-l-none border-l border-primary-foreground/20"
                >
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuRadioGroup value={dataFormat} onValueChange={(v) => setDataFormat(v as DataFormat)}>
                  <DropdownMenuRadioItem value="json">JSON</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="toon">TOON (experimental)</DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <p className="text-[10px] text-muted-foreground text-right">Format: {dataFormat.toUpperCase()}</p>
        </>
      ) : (
        <>
          <div className="pt-2 border-t">
            <Label htmlFor="reportDate" className="text-sm">
              Select any date in the week
            </Label>
            <Input
              id="reportDate"
              type="date"
              value={reportDate}
              onChange={(e) => setReportDate(e.target.value)}
              className="mt-1"
            />
            <p className="text-xs text-muted-foreground mt-1.5">
              Week: {weekRangeLabel}
            </p>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={forceRegenerate}
              onChange={(e) => setForceRegenerate(e.target.checked)}
              className="rounded border-border"
            />
            <span className="text-xs text-muted-foreground">Force regenerate all daily reports</span>
          </label>

          <div className="flex gap-0 min-w-0">
            <Button
              onClick={handleGenerateWeekly}
              disabled={isAnyPending || !reportDate}
              className="flex-1 h-11 rounded-r-none min-w-0"
            >
              <span className="flex items-center justify-center gap-2 min-w-0">
                {weeklyProgress ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                    <span className="truncate">{weeklyProgress}</span>
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4 shrink-0" />
                    <span className="truncate">Generate Weekly</span>
                  </>
                )}
              </span>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  disabled={isAnyPending || !reportDate}
                  className="h-11 px-2 rounded-l-none border-l border-primary-foreground/20"
                >
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuRadioGroup value={dataFormat} onValueChange={(v) => setDataFormat(v as DataFormat)}>
                  <DropdownMenuRadioItem value="json">JSON</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="toon">TOON (experimental)</DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <p className="text-[10px] text-muted-foreground text-right">Format: {dataFormat.toUpperCase()}</p>
        </>
      )}

      {hasAnyError && (
        <div className="p-2 bg-red-50 dark:bg-red-900/20 rounded-md text-sm text-red-600 dark:text-red-400 flex items-center gap-2">
          <AlertCircle className="h-4 w-4" />
          {generateMutation.error?.message || saveMutation.error?.message ||
           successReportMutation.error?.message || failureReportMutation.error?.message ||
           fullReportMutation.error?.message || weeklyGenerateMutation.error?.message ||
           weeklyAIReportMutation.error?.message || 'Failed to generate'}
        </div>
      )}

      {anySuccess && !isAnyPending && (
        <Card>
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
              <CheckCircle className="h-4 w-4" />
              <span className="text-sm font-medium">Report generated!</span>
            </div>
            <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
              <Sparkles className="h-3 w-3" />
              <span className="text-xs">AI insights ready</span>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="pt-4 border-t">
        <Label className="text-sm">Results per page</Label>
        <Input
          type="number"
          min={10}
          max={100}
          value={limit}
          onChange={(e) => setLimit(parseInt(e.target.value) || 25)}
          className="mt-1"
        />
      </div>
    </div>
  );

  // Route guard: hide page if disabled for this client
  if (!isAdmin && config && !config.pages.reports) return null;

  return (
    <div className="flex h-full">
      {/* Desktop Sidebar for generating reports */}
      <div className="hidden md:flex w-64 shrink-0 flex-col bg-card border-r border-border">
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-4 space-y-4">
          <h2 className="font-semibold text-lg">Generate Report</h2>
          {sidebarContent}
        </div>
      </div>

      {/* Mobile: Centered bottom frosted glass tab + Drawer */}
      <Drawer>
        <DrawerTrigger asChild>
          <button
            className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 px-6 py-3 rounded-full bg-gradient-to-r from-gray-900/80 via-gray-800/80 to-gray-900/80 dark:from-white/80 dark:via-gray-100/80 dark:to-white/80 backdrop-blur-xl border border-white/30 dark:border-black/20 shadow-[0_4px_20px_rgba(0,0,0,0.4)] dark:shadow-[0_4px_20px_rgba(0,0,0,0.3)] md:hidden text-white dark:text-gray-900 font-medium ring-1 ring-white/10 dark:ring-black/10"
            aria-label="Generate Report"
          >
            <CalendarPlus className="h-4 w-4" />
            <span className="text-sm">Generate</span>
          </button>
        </DrawerTrigger>
        <DrawerContent className="max-h-[85vh]">
          <DrawerHeader>
            <DrawerTitle>Generate Report</DrawerTitle>
          </DrawerHeader>
          <div className="overflow-y-auto px-4 pb-6">
            {sidebarContent}
          </div>
        </DrawerContent>
      </Drawer>

      {/* Main Content */}
      <div className="flex-1 flex flex-col p-4 pb-20 md:p-6 md:pb-6 overflow-hidden">
        {/* Header */}
        <div className="shrink-0">
          <h1 className="text-xl md:text-2xl font-bold mb-3 md:mb-4 flex items-center gap-2">
            <FileText className="h-5 w-5 md:h-6 md:w-6" />
            Reports
            {firmId && (
              <Badge variant="secondary" className="text-xs font-normal">
                {firms.find(f => f.id === firmId)?.name || `Firm ${firmId}`}
              </Badge>
            )}
          </h1>

          <div className="flex flex-wrap gap-2 md:gap-4 mb-2">
            <div className="text-xs md:text-sm">
              <span className="font-medium">Total:</span> {data?.total ?? 0}
            </div>
            <div className="text-xs md:text-sm">
              <span className="font-medium">Showing:</span> {data?.data?.length ?? 0}
            </div>
          </div>

          <p className="text-xs md:text-sm text-muted-foreground mb-3 md:mb-4">
            Tap a row to view full report details
          </p>
        </div>

        {/* Table */}
        <div className="flex-1 min-h-0">
          <DataTable
            columns={columns}
            data={data?.data ?? []}
            total={data?.total ?? 0}
            offset={offset}
            limit={limit}
            onOffsetChange={setOffset}
            onRowSelect={(row) => setSelectedReport(row as EODReport | null)}
            selectedRowId={selectedReport?.id ?? null}
            isLoading={isLoading}
            isFetching={isFetching}
            getRowId={(row) => row.id}
            sortBy={sortBy}
            sortOrder={sortOrder}
            onSort={handleSort}
            sortableColumns={['report_date', 'generated_at']}
            mobileHiddenColumns={['call_count', 'error_count', 'trigger_type', 'generated_at']}
          />
        </div>
      </div>

      {/* Detail Panel (like calls detail sheet) */}
      {selectedReport && (
        <EODReportDetailPanel
          report={selectedReport}
          previousReport={previousReport}
          onClose={() => setSelectedReport(null)}
          onPrevious={handlePrevious}
          onNext={handleNext}
          hasPrevious={hasPrevious}
          hasNext={hasNext}
          onRetrySuccessReport={handleRetrySuccessReport}
          onRetryFailureReport={handleRetryFailureReport}
          onRetryFullReport={handleRetryFullReport}
          isRetryingSuccess={successReportMutation.isPending}
          isRetryingFailure={failureReportMutation.isPending}
          isRetryingFull={fullReportMutation.isPending || weeklyAIReportMutation.isPending}
          successError={successReportMutation.error?.message}
          failureError={failureReportMutation.error?.message}
          fullError={fullReportMutation.error?.message || weeklyAIReportMutation.error?.message}
        />
      )}
    </div>
  );
}

// ============================================================================
// EOD Report Detail Panel (Split Panel Layout)
// ============================================================================

interface EODReportDetailPanelProps {
  report: EODReport;
  previousReport: EODReport | null;
  onClose: () => void;
  onPrevious: () => void;
  onNext: () => void;
  hasPrevious: boolean;
  hasNext: boolean;
  onRetrySuccessReport: (dataFormat?: DataFormat) => void;
  onRetryFailureReport: (dataFormat?: DataFormat) => void;
  onRetryFullReport: (dataFormat?: DataFormat) => void;
  isRetryingSuccess: boolean;
  isRetryingFailure: boolean;
  isRetryingFull: boolean;
  successError?: string;
  failureError?: string;
  fullError?: string;
}

function EODReportDetailPanel({
  report,
  previousReport,
  onClose,
  onPrevious,
  onNext,
  hasPrevious,
  hasNext,
  onRetrySuccessReport,
  onRetryFailureReport,
  onRetryFullReport,
  isRetryingSuccess,
  isRetryingFailure,
  isRetryingFull,
  successError,
  failureError,
  fullError,
}: EODReportDetailPanelProps) {
  const isMobile = useIsMobile();
  const { environment } = useEnvironment();
  const containerRef = useRef<HTMLDivElement>(null);
  const [leftPercent, setLeftPercent] = useState(getStoredLayout());
  const [isHydrated, setIsHydrated] = useState(false);
  const [shareSuccess, setShareSuccess] = useState(false);
  const isDragging = useRef(false);

  useEffect(() => {
    setLeftPercent(getStoredLayout());
    setIsHydrated(true);
  }, []);

  const rawData = report.raw_data as EODRawData;
  const isWeeklyReport = !!rawData?.week_start;
  const reportType = isWeeklyReport ? 'weekly' : 'eod';

  const handleShare = async () => {
    const url = buildReportShareUrl(report.report_date, reportType, environment);
    const success = await copyToClipboard(url);
    if (success) {
      setShareSuccess(true);
      setTimeout(() => setShareSuccess(false), 2000);
    }
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && hasPrevious) onPrevious();
      if (e.key === 'ArrowRight' && hasNext) onNext();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, onPrevious, onNext, hasPrevious, hasNext]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMouseMove = (moveEvent: MouseEvent) => {
      if (!isDragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = moveEvent.clientX - rect.left;
      const percent = (x / rect.width) * 100;
      const clamped = Math.min(MAX_LEFT_PERCENT, Math.max(MIN_LEFT_PERCENT, percent));
      setLeftPercent(clamped);
    };

    const onMouseUp = () => {
      isDragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      setLeftPercent((current) => {
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
        } catch {}
        return current;
      });
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, []);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed inset-y-0 right-0 w-full md:w-[calc(100vw-280px)] md:max-w-[1600px] bg-background z-50 flex flex-col border-l shadow-xl overflow-hidden">
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between px-3 md:px-4 py-3 border-b bg-muted/50 gap-2">
          <div className="flex items-center gap-2 md:gap-3 min-w-0 flex-1">
            <Button variant="ghost" size="icon" onClick={onClose} className="shrink-0">
              <X className="h-4 w-4" />
            </Button>
            <div className="min-w-0">
              <h2 className="font-semibold flex items-center gap-2 text-sm md:text-base">
                <FileText className="h-4 w-4 shrink-0" />
                <span className="truncate">
                  {isWeeklyReport
                    ? `Weekly Report - ${format(new Date(rawData.week_start + 'T12:00:00Z'), 'MMM d')} to ${format(new Date((rawData.week_end ?? rawData.week_start) + 'T12:00:00Z'), 'MMM d')}`
                    : `EOD Report - ${report.report_date}`
                  }
                </span>
              </h2>
              <p className="text-xs text-muted-foreground truncate">
                Generated: {formatUTCTimestamp(report.generated_at)} UTC
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={handleShare}
              className="gap-1.5 h-8 px-2.5"
            >
              {shareSuccess ? (
                <>
                  <Check className="h-3.5 w-3.5 text-green-500" />
                  <span className="hidden sm:inline text-xs">Copied!</span>
                </>
              ) : (
                <>
                  <Share2 className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline text-xs">Share</span>
                </>
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onPrevious}
              disabled={!hasPrevious}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onNext}
              disabled={!hasNext}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Mobile: Tabbed layout */}
        {isMobile && (
          <Tabs defaultValue="info" className="flex-1 flex flex-col min-h-0 overflow-hidden">
            <TabsList className="shrink-0 mx-2 mt-2 w-auto">
              <TabsTrigger value="info" className="text-xs px-3">Info</TabsTrigger>
              <TabsTrigger value="reports" className="text-xs px-3">{isWeeklyReport ? 'Weekly Report' : 'AI Reports'}</TabsTrigger>
            </TabsList>
            <TabsContent value="info" className="flex-1 min-h-0 mt-0 overflow-hidden">
              <ScrollArea className="h-full">
                <EODLeftPanel report={report} rawData={rawData} previousReport={previousReport} isMobile hideErrors={isWeeklyReport} />
              </ScrollArea>
            </TabsContent>
            <TabsContent value="reports" className="flex-1 min-h-0 mt-0 overflow-hidden">
              <EODRightPanel
                report={report}
                onRetrySuccessReport={onRetrySuccessReport}
                onRetryFailureReport={onRetryFailureReport}
                onRetryFullReport={onRetryFullReport}
                isRetryingSuccess={isRetryingSuccess}
                isRetryingFailure={isRetryingFailure}
                isRetryingFull={isRetryingFull}
                successError={successError}
                failureError={failureError}
                fullError={fullError}
                isMobile
                hideSuccessFailure={isWeeklyReport}
              />
            </TabsContent>
          </Tabs>
        )}

        {/* Desktop: Two-panel resizable layout */}
        {!isMobile && isHydrated && (
          <div ref={containerRef} className="flex-1 min-h-0 flex">
            {/* Left Panel */}
            <div
              className="h-full overflow-hidden"
              style={{ width: `${leftPercent}%` }}
            >
              <EODLeftPanel report={report} rawData={rawData} previousReport={previousReport} isMobile={false} hideErrors={isWeeklyReport} />
            </div>

            {/* Resize Handle */}
            <div
              className="relative flex items-center justify-center w-1.5 shrink-0 cursor-col-resize group hover:bg-primary/10 transition-colors"
              onMouseDown={handleMouseDown}
            >
              <div className="absolute z-10 flex h-8 w-3 items-center justify-center rounded-sm border bg-muted shadow-sm group-hover:bg-muted-foreground/20 transition-colors">
                <GripVertical className="size-3 text-muted-foreground" />
              </div>
            </div>

            {/* Right Panel */}
            <div className="h-full overflow-hidden flex-1">
              <EODRightPanel
                report={report}
                onRetrySuccessReport={onRetrySuccessReport}
                onRetryFailureReport={onRetryFailureReport}
                onRetryFullReport={onRetryFullReport}
                isRetryingSuccess={isRetryingSuccess}
                isRetryingFailure={isRetryingFailure}
                isRetryingFull={isRetryingFull}
                successError={successError}
                failureError={failureError}
                fullError={fullError}
                isMobile={false}
                hideSuccessFailure={isWeeklyReport}
              />
            </div>
          </div>
        )}

        {/* Loading state while hydrating */}
        {!isMobile && !isHydrated && (
          <div className="flex-1 flex items-center justify-center">
            <div className="animate-pulse text-muted-foreground">Loading...</div>
          </div>
        )}
      </div>
    </>
  );
}

// ============================================================================
// Left Panel: Summary, Metadata, Raw Data, Errors
// ============================================================================

// Helper to calculate percentage change
function calcPercentChange(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? 100 : null;
  return ((current - previous) / previous) * 100;
}

// Helper component for displaying change indicator
function ChangeIndicator({ change, inverted = false }: { change: number | null; inverted?: boolean }) {
  if (change === null) return null;
  const isPositive = change > 0;
  const isNegative = change < 0;
  // For "Failed" count, positive change is bad (red), negative is good (green)
  // For "Success" count, positive change is good (green), negative is bad (red)
  const colorClass = inverted
    ? (isPositive ? 'text-red-500' : isNegative ? 'text-green-500' : 'text-muted-foreground')
    : (isPositive ? 'text-green-500' : isNegative ? 'text-red-500' : 'text-muted-foreground');
  const arrow = isPositive ? '↑' : isNegative ? '↓' : '';
  return (
    <span className={cn('text-xs ml-1', colorClass)}>
      {arrow}{Math.abs(change).toFixed(0)}%
    </span>
  );
}

function EODLeftPanel({
  report,
  rawData,
  previousReport,
  isMobile = false,
  hideErrors = false,
}: {
  report: EODReport;
  rawData: EODRawData;
  previousReport: EODReport | null;
  isMobile?: boolean;
  hideErrors?: boolean;
}) {
  const { environment } = useEnvironment();

  // Handle both new structure (success/failure arrays) and old structure (calls array)
  const hasNewStructure = rawData?.success !== undefined || rawData?.failure !== undefined;

  // For old reports with calls array, filter by cekura.status
  const oldCalls = (rawData as unknown as { calls?: typeof rawData.success })?.calls ?? [];

  const successCalls = hasNewStructure
    ? (rawData?.success ?? [])
    : oldCalls.filter(c => c.cekura?.status === 'success');

  const failureCalls = hasNewStructure
    ? (rawData?.failure ?? [])
    : oldCalls.filter(c => c.cekura?.status !== 'success');

  const totalCalls = rawData?.count ?? (successCalls.length + failureCalls.length);
  const errorCount = rawData?.failure_count ?? failureCalls.length;
  const successCount = totalCalls - errorCount;

  // Calculate previous report stats for comparison
  const prevRawData = previousReport?.raw_data as EODRawData | undefined;
  const prevHasNewStructure = prevRawData?.success !== undefined || prevRawData?.failure !== undefined;
  const prevOldCalls = (prevRawData as unknown as { calls?: typeof rawData.success })?.calls ?? [];

  const prevErrorCount = prevRawData?.failure_count ?? (prevHasNewStructure
    ? (prevRawData?.failure?.length ?? 0)
    : prevOldCalls.filter(c => c.cekura?.status !== 'success').length);

  const prevTotalCalls = prevRawData?.count ?? (
    (prevHasNewStructure ? (prevRawData?.success?.length ?? 0) : prevOldCalls.filter(c => c.cekura?.status === 'success').length)
    + prevErrorCount
  );

  const prevSuccessCount = prevTotalCalls - prevErrorCount;

  // Calculate percentage changes
  const totalChange = previousReport ? calcPercentChange(totalCalls, prevTotalCalls) : null;
  const errorChange = previousReport ? calcPercentChange(errorCount, prevErrorCount) : null;
  const successChange = previousReport ? calcPercentChange(successCount, prevSuccessCount) : null;

  return (
    <div className={cn(
      "h-full flex flex-col gap-3 overflow-x-hidden overflow-y-auto w-full max-w-full",
      isMobile ? "p-2" : "p-4 gap-4"
    )}>
      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-1.5 md:gap-3 shrink-0">
        <Card>
          <CardContent className="p-2 md:p-3">
            <div className="flex items-baseline">
              <span className="text-base md:text-xl font-bold">{totalCalls}</span>
              <ChangeIndicator change={totalChange} />
            </div>
            <div className="text-[10px] md:text-xs text-muted-foreground">Total</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-2 md:p-3">
            <div className="flex items-baseline">
              <span className="text-base md:text-xl font-bold text-red-500">{errorCount}</span>
              <ChangeIndicator change={errorChange} inverted />
            </div>
            <div className="text-[10px] md:text-xs text-muted-foreground">Failure</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-2 md:p-3">
            <div className="flex items-baseline">
              <span className="text-base md:text-xl font-bold text-green-500">{successCount}</span>
              <ChangeIndicator change={successChange} />
            </div>
            <div className="text-[10px] md:text-xs text-muted-foreground">Success</div>
          </CardContent>
        </Card>
      </div>

      {/* Metadata */}
      <Card className="shrink-0">
        <CardHeader className="pb-2 px-2 md:px-4 pt-2 md:pt-4">
          <CardTitle className="text-xs md:text-sm">Report Metadata</CardTitle>
        </CardHeader>
        <CardContent className={cn(
          "gap-1.5 text-xs md:text-sm px-2 md:px-4 pb-2 md:pb-4",
          isMobile ? "flex flex-col" : "grid grid-cols-2 gap-2"
        )}>
          <div className="flex items-center gap-1">
            <span className="text-muted-foreground">Date:</span>
            <span className="font-medium">{report.report_date}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-muted-foreground">Env:</span>
            <Badge variant="outline" className="text-[10px] md:text-xs h-5">{rawData?.environment}</Badge>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-muted-foreground">Trigger:</span>
            <Badge variant="outline" className="text-[10px] md:text-xs h-5">{report.trigger_type}</Badge>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-muted-foreground">Generated:</span>
            <span className="truncate">{rawData?.generated_at ? `${formatUTCTimestamp(rawData.generated_at)} UTC` : 'N/A'}</span>
          </div>
        </CardContent>
      </Card>

      {/* Tabs for Raw Data and Errors - fills remaining space */}
      <Tabs defaultValue={hideErrors ? 'raw-data' : 'errors'} className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <TabsList className="shrink-0 w-full">
          {!hideErrors && (
            <TabsTrigger value="errors" className="text-xs flex-1">
              <AlertCircle className="h-3 w-3 mr-1" />
              Errors ({failureCalls.length})
            </TabsTrigger>
          )}
          <TabsTrigger value="raw-data" className="text-xs flex-1">Raw</TabsTrigger>
        </TabsList>

        <TabsContent value="errors" className="mt-2 flex-1 min-h-0 flex flex-col overflow-hidden">
          {failureCalls.length > 0 ? (
            <Card className="flex-1 flex flex-col min-h-0 overflow-hidden">
              <CardContent className="p-2 space-y-1.5 flex-1 overflow-y-auto overflow-x-hidden">
                {failureCalls.map((call) => (
                  <div
                    key={call.correlation_id}
                    className="p-2 bg-red-50 dark:bg-red-900/10 rounded-md text-sm overflow-hidden"
                  >
                    {/* Single row: Status | Correlation ID | Copy | VAPI | Cekura */}
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Badge variant="destructive" className="text-[10px] shrink-0">
                        {call.cekura.status}
                      </Badge>
                      <span className="font-mono text-[10px] truncate min-w-0 flex-1" title={call.correlation_id}>
                        {call.correlation_id}
                      </span>
                      <div className="flex items-center shrink-0">
                        <CopyButton value={call.correlation_id} className="h-5 w-5" />
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-5 w-5" asChild>
                              <a
                                href={`https://dashboard.vapi.ai/calls/${call.correlation_id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Open in VAPI</TooltipContent>
                        </Tooltip>
                        {call.cekura?.id && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-5 w-5" asChild>
                                <a
                                  href={buildCekuraUrl(call.cekura.id, environment)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  <BarChart3 className="h-3 w-3" />
                                </a>
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Open in Cekura</TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    </div>

                    {/* Error message (if any) */}
                    {call.cekura.error_message && (
                      <div className="mt-1 text-[10px] text-red-600 dark:text-red-400 pl-1 break-words">
                        {call.cekura.error_message}
                      </div>
                    )}

                    {/* Sentry errors (if any) */}
                    {call.sentry.errors.length > 0 && (
                      <div className="mt-1 text-[10px] text-muted-foreground pl-1 break-words">
                        <span className="font-medium">Sentry:</span> {call.sentry.errors.map((e) => e.title).join(', ')}
                      </div>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-6 text-center">
                <CheckCircle className="h-6 w-6 text-green-500 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No failed calls</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="raw-data" className="mt-3 flex-1 min-h-0 flex flex-col overflow-hidden">
          <Card className="flex-1 flex flex-col min-h-0 overflow-hidden">
            <CardHeader className="pb-2 flex flex-row items-center justify-between shrink-0">
              <CardTitle className="text-xs md:text-sm">Raw Data</CardTitle>
              <CopyButton value={JSON.stringify(rawData, null, 2)} />
            </CardHeader>
            <CardContent className="flex-1 min-h-0 overflow-auto p-2">
              <div className="text-[10px] md:text-xs overflow-x-auto">
                <JsonViewer data={rawData} collapsed={false} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ============================================================================
// Right Panel: AI Reports Tabs
// ============================================================================

interface EODRightPanelProps {
  report: EODReport;
  onRetrySuccessReport: (dataFormat?: DataFormat) => void;
  onRetryFailureReport: (dataFormat?: DataFormat) => void;
  onRetryFullReport: (dataFormat?: DataFormat) => void;
  isRetryingSuccess: boolean;
  isRetryingFailure: boolean;
  isRetryingFull: boolean;
  successError?: string;
  failureError?: string;
  fullError?: string;
  isMobile?: boolean;
  hideSuccessFailure?: boolean;
}

function EODRightPanel({
  report,
  onRetrySuccessReport,
  onRetryFailureReport,
  onRetryFullReport,
  isRetryingSuccess,
  isRetryingFailure,
  isRetryingFull,
  successError,
  failureError,
  fullError,
  isMobile = false,
  hideSuccessFailure = false,
}: EODRightPanelProps) {
  const hasFailureReport = report.failure_report !== null;
  const hasSuccessReport = report.success_report !== null;
  const hasFullReport = report.full_report !== null;

  // Default to failure report tab if there are failures, otherwise full report
  const rawData = report.raw_data as EODRawData;
  // Handle both new structure (failure array) and old structure (calls array)
  const oldCalls = (rawData as unknown as { calls?: typeof rawData.failure })?.calls ?? [];
  const failureCount = rawData?.failure?.length ?? oldCalls.filter(c => c.cekura?.status !== 'success').length;
  const hasFailures = failureCount > 0;
  const defaultTab = hideSuccessFailure ? 'full' : (hasFailures ? 'failure' : 'full');

  return (
    <div className={cn(
      "h-full flex flex-col overflow-hidden w-full max-w-full",
      isMobile ? "p-2" : "p-4"
    )}>
      <h3 className="font-semibold mb-2 md:mb-3 flex items-center gap-2 shrink-0 text-sm md:text-base">
        <Sparkles className="h-3.5 w-3.5 md:h-4 md:w-4" />
        {hideSuccessFailure ? 'Weekly Report' : 'AI Reports'}
      </h3>

      <Tabs defaultValue={defaultTab} className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <TabsList className="w-full shrink-0">
          {!hideSuccessFailure && (
            <>
              <TabsTrigger value="failure" className="flex-1 text-xs md:text-sm px-2 md:px-3">
                Failure
                {!hasFailureReport && (
                  <Badge variant="secondary" className="ml-1 text-[10px] md:text-xs px-1 md:px-1.5">
                    {isRetryingFailure ? <Loader2 className="h-2.5 w-2.5 md:h-3 md:w-3 animate-spin" /> : '!'}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="success" className="flex-1 text-xs md:text-sm px-2 md:px-3">
                Success
                {!hasSuccessReport && (
                  <Badge variant="secondary" className="ml-1 text-[10px] md:text-xs px-1 md:px-1.5">
                    {isRetryingSuccess ? <Loader2 className="h-2.5 w-2.5 md:h-3 md:w-3 animate-spin" /> : '!'}
                  </Badge>
                )}
              </TabsTrigger>
            </>
          )}
          <TabsTrigger value="full" className="flex-1 text-xs md:text-sm px-2 md:px-3">
            {hideSuccessFailure ? 'Weekly Report' : 'Full'}
            {!hasFullReport && (
              <Badge variant="secondary" className="ml-1 text-[10px] md:text-xs px-1 md:px-1.5">
                {isRetryingFull ? <Loader2 className="h-2.5 w-2.5 md:h-3 md:w-3 animate-spin" /> : '!'}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {!hideSuccessFailure && (
          <>
            <TabsContent value="failure" className="mt-2 flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
              <ReportContent
                report={report}
                content={report.failure_report}
                reportType="failure"
                onRetry={onRetryFailureReport}
                isRetrying={isRetryingFailure}
                error={failureError}
              />
            </TabsContent>

            <TabsContent value="success" className="mt-2 flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
              <ReportContent
                report={report}
                content={report.success_report}
                reportType="success"
                onRetry={onRetrySuccessReport}
                isRetrying={isRetryingSuccess}
                error={successError}
              />
            </TabsContent>
          </>
        )}

        <TabsContent value="full" className="mt-2 flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
          <ReportContent
            report={report}
            content={report.full_report}
            reportType="full"
            onRetry={onRetryFullReport}
            isRetrying={isRetryingFull}
            error={fullError}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ============================================================================
// Report Content Component
// ============================================================================

function ReportContent({
  report,
  content,
  reportType,
  onRetry,
  isRetrying,
  error,
}: {
  report: EODReport;
  content: string | null;
  reportType: 'success' | 'failure' | 'full';
  onRetry: (dataFormat?: DataFormat) => void;
  isRetrying: boolean;
  error?: string;
}) {
  const markdownRef = useRef<HTMLDivElement>(null);
  const { data: firmsData } = useFirms();
  const { data: rawFirmsData } = useRawFirms();
  const hasReport = content !== null;
  const isWeekly = !!(report.raw_data as EODRawData)?.week_start;
  const titleMap = {
    success: 'Success Report',
    failure: 'Failure Report',
    full: isWeekly ? 'Weekly Report' : 'Full Report',
  };
  const title = titleMap[reportType];

  // Replace real firm names in markdown with anonymized equivalents
  const displayContent = useMemo(() => {
    if (!content || !rawFirmsData?.firms?.length) return content;
    return anonymizeContent(content, rawFirmsData.firms);
  }, [content, rawFirmsData?.firms]);

  if (hasReport) {
    return (
      <Card className="overflow-hidden">
        <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2 px-2 md:px-4">
          <CardTitle className="text-xs md:text-sm flex items-center gap-1.5 min-w-0">
            <Sparkles className={cn(
              'h-3 w-3 md:h-4 md:w-4 shrink-0',
              reportType === 'success' && 'text-green-500',
              reportType === 'failure' && 'text-red-500',
              reportType === 'full' && 'text-blue-500'
            )} />
            <span className="truncate">{title}</span>
          </CardTitle>
          <div className="flex gap-0.5 shrink-0">
            <PDFExportButton
              contentRef={markdownRef}
              filename={`${isWeekly ? 'weekly' : 'eod'}-${reportType}-report-${report.report_date}`}
              reportTitle={title}
              reportDate={report.report_date}
              firmId={(report.raw_data as EODRawData)?.firm_id}
              firmName={
                (report.raw_data as EODRawData)?.firm_id != null && firmsData?.firms?.length
                  ? getAnonymizedFirmName((report.raw_data as EODRawData).firm_id!, firmsData.firms)
                  : undefined
              }
            />
            <DocxExportButton
              markdown={displayContent || ''}
              filename={`${isWeekly ? 'weekly' : 'eod'}-${reportType}-report-${report.report_date}`}
            />
            <Button variant="outline" size="icon" className="h-7 w-7 md:h-8 md:w-8" onClick={() => navigator.clipboard.writeText(displayContent || '')} title="Copy to clipboard">
              <Copy className="h-3 w-3 md:h-4 md:w-4" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="h-7 w-7 md:h-8 md:w-8" disabled={isRetrying} title="Regenerate">
                  {isRetrying ? (
                    <Loader2 className="h-3 w-3 md:h-4 md:w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3 w-3 md:h-4 md:w-4" />
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onRetry('json')}>
                  Regenerate (JSON)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onRetry('toon')}>
                  Regenerate (TOON)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardHeader>
        <CardContent className="px-2 md:px-4 pb-2 md:pb-4 overflow-hidden">
          <div ref={markdownRef} className="overflow-x-auto text-xs md:text-sm">
            <MarkdownReport content={displayContent || ''} />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-8 text-center">
        {isRetrying ? (
          <>
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground mb-4">
              Generating {title.toLowerCase()}...
            </p>
          </>
        ) : (
          <>
            <Sparkles className="h-8 w-8 mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground mb-4">
              {title} not generated yet.
            </p>
          </>
        )}
        {error && (
          <div className="p-2 bg-red-50 dark:bg-red-900/20 rounded-md text-sm text-red-600 dark:text-red-400 mb-4">
            <AlertCircle className="h-4 w-4 inline mr-2" />
            {error}
          </div>
        )}
        <div className="inline-flex items-center gap-1">
          <Button variant="outline" size="sm" onClick={() => onRetry()} disabled={isRetrying}>
            {isRetrying ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-2" />
                Generate {title}
              </>
            )}
          </Button>
          {!isRetrying && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="h-8 w-8">
                  <ChevronDown className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onRetry('json')}>
                  Generate (JSON)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onRetry('toon')}>
                  Generate (TOON)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
