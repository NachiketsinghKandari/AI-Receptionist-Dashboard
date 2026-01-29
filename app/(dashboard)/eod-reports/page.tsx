'use client';

import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
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
  ChevronLeft,
  ChevronRight,
  GripVertical,
  ExternalLink,
  BarChart3,
  Copy,
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
import { ScrollArea } from '@/components/ui/scroll-area';
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
  useSaveEODReport,
  useGenerateSuccessReport,
  useGenerateFailureReport,
  useGenerateFullReport,
} from '@/hooks/use-eod-reports';
import { useIsMobile } from '@/hooks/use-is-mobile';
import { useEnvironment } from '@/components/providers/environment-provider';
import { buildCekuraUrl } from '@/hooks/use-cekura';
import { DEFAULT_PAGE_LIMIT } from '@/lib/constants';
import { JsonViewer } from '@/components/ui/json-viewer';
import type { EODReport, EODRawData, SortOrder } from '@/types/api';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

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

function createColumns(generatingState?: GeneratingState): ColumnDef<EODReport>[] {
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
      id: 'call_count',
      header: 'Calls',
      cell: ({ row }) => {
        const rawData = row.original.raw_data as EODRawData;
        return <span className="font-mono">{rawData?.count ?? rawData?.total ?? 0}</span>;
      },
    },
    {
      id: 'error_count',
      header: 'Errors',
      cell: ({ row }) => {
        const rawData = row.original.raw_data as EODRawData;
        // Handle both new structure (errors/failure) and old structure (calls array)
        const oldCalls = (rawData as unknown as { calls?: typeof rawData.failure })?.calls;
        const errorCount = rawData?.errors
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
      header: 'Generated At',
      cell: ({ row }) => {
        const value = row.getValue('generated_at') as string;
        return value ? format(new Date(value), 'yyyy-MM-dd HH:mm') : '-';
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
  const [limit, setLimit] = useState(DEFAULT_PAGE_LIMIT);
  const [offset, setOffset] = useState(0);
  const [sortBy, setSortBy] = useState<string | null>('report_date');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [selectedReport, setSelectedReport] = useState<EODReport | null>(null);

  // Generate report state
  const [reportDate, setReportDate] = useState(format(new Date(), 'yyyy-MM-dd'));

  const filters = useMemo(
    () => ({ limit, offset, sortBy, sortOrder }),
    [limit, offset, sortBy, sortOrder]
  );

  const { data, isLoading, isFetching } = useEODReports(filters);
  const generateMutation = useGenerateEODReport();
  const saveMutation = useSaveEODReport();
  const successReportMutation = useGenerateSuccessReport();
  const failureReportMutation = useGenerateFailureReport();
  const fullReportMutation = useGenerateFullReport();

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

  const columns = useMemo(() => createColumns(generatingState), [generatingState]);

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
      // Step 1: Generate raw data from Cekura + Sentry
      const result = await generateMutation.mutateAsync(reportDate);
      const rawData = result.raw_data;

      // Step 2: Save the report to database
      const saveResult = await saveMutation.mutateAsync({ reportDate, rawData });

      // Step 3: Generate all three AI reports in parallel
      const reportId = saveResult.report.id;
      await Promise.allSettled([
        successReportMutation.mutateAsync({ reportId, rawData }),
        failureReportMutation.mutateAsync({ reportId, rawData }),
        fullReportMutation.mutateAsync({ reportId, rawData }),
      ]);
    } catch (error) {
      console.error('Failed to generate report:', error);
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

  // Retry handlers for individual reports
  const handleRetrySuccessReport = async () => {
    if (!selectedReport) return;
    try {
      await successReportMutation.mutateAsync({
        reportId: selectedReport.id,
        rawData: selectedReport.raw_data as EODRawData,
      });
    } catch (error) {
      console.error('Failed to retry success report:', error);
    }
  };

  const handleRetryFailureReport = async () => {
    if (!selectedReport) return;
    try {
      await failureReportMutation.mutateAsync({
        reportId: selectedReport.id,
        rawData: selectedReport.raw_data as EODRawData,
      });
    } catch (error) {
      console.error('Failed to retry failure report:', error);
    }
  };

  const handleRetryFullReport = async () => {
    if (!selectedReport) return;
    try {
      await fullReportMutation.mutateAsync({
        reportId: selectedReport.id,
        rawData: selectedReport.raw_data as EODRawData,
      });
    } catch (error) {
      console.error('Failed to retry full report:', error);
    }
  };

  const isAnyPending = generateMutation.isPending || saveMutation.isPending ||
    successReportMutation.isPending || failureReportMutation.isPending || fullReportMutation.isPending;

  const hasAnyError = generateMutation.isError || saveMutation.isError ||
    successReportMutation.isError || failureReportMutation.isError || fullReportMutation.isError;

  const anySuccess = successReportMutation.isSuccess || failureReportMutation.isSuccess || fullReportMutation.isSuccess;

  // Sidebar content component to avoid duplication
  const sidebarContent = (
    <div className="space-y-4">
      <div>
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

      <Button
        onClick={handleGenerate}
        disabled={isAnyPending || !reportDate}
        className="w-full"
      >
        {generateMutation.isPending ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Fetching data...
          </>
        ) : saveMutation.isPending ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Saving report...
          </>
        ) : (successReportMutation.isPending || failureReportMutation.isPending || fullReportMutation.isPending) ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Generating AI reports...
          </>
        ) : (
          <>
            <Plus className="h-4 w-4 mr-2" />
            Generate Report
          </>
        )}
      </Button>

      {hasAnyError && (
        <div className="p-2 bg-red-50 dark:bg-red-900/20 rounded-md text-sm text-red-600 dark:text-red-400 flex items-center gap-2">
          <AlertCircle className="h-4 w-4" />
          {generateMutation.error?.message || saveMutation.error?.message ||
           successReportMutation.error?.message || failureReportMutation.error?.message ||
           fullReportMutation.error?.message || 'Failed to generate'}
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

  return (
    <div className="flex h-full">
      {/* Desktop Sidebar for generating reports */}
      <div className="hidden md:flex w-64 shrink-0 flex-col bg-card border-r border-border">
        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
          <h2 className="font-semibold text-lg">Generate Report</h2>
          {sidebarContent}
        </div>
      </div>

      {/* Mobile: Floating Action Button + Drawer */}
      <Drawer>
        <DrawerTrigger asChild>
          <Button
            size="icon"
            className="fixed bottom-6 right-6 z-40 h-14 w-14 rounded-full shadow-lg md:hidden"
            aria-label="Generate Report"
          >
            <CalendarPlus className="h-6 w-6" />
          </Button>
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
      <div className="flex-1 flex flex-col p-4 md:p-6 overflow-hidden">
        {/* Header */}
        <div className="shrink-0">
          <h1 className="text-xl md:text-2xl font-bold mb-3 md:mb-4 flex items-center gap-2">
            <FileText className="h-5 w-5 md:h-6 md:w-6" />
            EOD Reports
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
            mobileHiddenColumns={['trigger_type', 'generated_at']}
          />
        </div>
      </div>

      {/* Detail Panel (like calls detail sheet) */}
      {selectedReport && (
        <EODReportDetailPanel
          report={selectedReport}
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
          isRetryingFull={fullReportMutation.isPending}
          successError={successReportMutation.error?.message}
          failureError={failureReportMutation.error?.message}
          fullError={fullReportMutation.error?.message}
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
  onClose: () => void;
  onPrevious: () => void;
  onNext: () => void;
  hasPrevious: boolean;
  hasNext: boolean;
  onRetrySuccessReport: () => void;
  onRetryFailureReport: () => void;
  onRetryFullReport: () => void;
  isRetryingSuccess: boolean;
  isRetryingFailure: boolean;
  isRetryingFull: boolean;
  successError?: string;
  failureError?: string;
  fullError?: string;
}

function EODReportDetailPanel({
  report,
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
  const containerRef = useRef<HTMLDivElement>(null);
  const [leftPercent, setLeftPercent] = useState(getStoredLayout());
  const [isHydrated, setIsHydrated] = useState(false);
  const isDragging = useRef(false);

  useEffect(() => {
    setLeftPercent(getStoredLayout());
    setIsHydrated(true);
  }, []);

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

  const rawData = report.raw_data as EODRawData;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed inset-y-0 right-0 w-full md:w-[calc(100vw-280px)] md:max-w-[1600px] bg-background z-50 flex flex-col border-l shadow-xl">
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b bg-muted/50">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
            <div>
              <h2 className="font-semibold flex items-center gap-2">
                <FileText className="h-4 w-4" />
                EOD Report - {report.report_date}
              </h2>
              <p className="text-xs text-muted-foreground">
                Generated: {report.generated_at ? format(new Date(report.generated_at), 'PPpp') : 'N/A'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
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
          <Tabs defaultValue="info" className="flex-1 flex flex-col min-h-0">
            <TabsList className="shrink-0 mx-4 mt-2">
              <TabsTrigger value="info">Info</TabsTrigger>
              <TabsTrigger value="reports">AI Reports</TabsTrigger>
            </TabsList>
            <TabsContent value="info" className="flex-1 min-h-0 mt-0">
              <ScrollArea className="h-full">
                <EODLeftPanel report={report} rawData={rawData} />
              </ScrollArea>
            </TabsContent>
            <TabsContent value="reports" className="flex-1 min-h-0 mt-0">
              <ScrollArea className="h-full">
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
                />
              </ScrollArea>
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
              <EODLeftPanel report={report} rawData={rawData} />
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

function EODLeftPanel({ report, rawData }: { report: EODReport; rawData: EODRawData }) {
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

  const totalCalls = rawData?.count ?? rawData?.total ?? (successCalls.length + failureCalls.length);
  const errorCount = rawData?.errors ?? failureCalls.length;

  return (
    <div className="p-4 h-full flex flex-col gap-4">
      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-3 shrink-0">
        <Card>
          <CardContent className="p-3">
            <div className="text-xl font-bold">{totalCalls}</div>
            <div className="text-xs text-muted-foreground">Total Calls</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="text-xl font-bold text-red-500">{errorCount}</div>
            <div className="text-xs text-muted-foreground">Failed</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="text-xl font-bold text-green-500">{successCalls.length}</div>
            <div className="text-xs text-muted-foreground">Success</div>
          </CardContent>
        </Card>
      </div>

      {/* Metadata */}
      <Card className="shrink-0">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Report Metadata</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <span className="text-muted-foreground">Report Date:</span>{' '}
            <span className="font-medium">{report.report_date}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Environment:</span>{' '}
            <Badge variant="outline">{rawData?.environment}</Badge>
          </div>
          <div>
            <span className="text-muted-foreground">Trigger:</span>{' '}
            <Badge variant="outline">{report.trigger_type}</Badge>
          </div>
          <div>
            <span className="text-muted-foreground">Generated:</span>{' '}
            <span>{rawData?.generated_at ? format(new Date(rawData.generated_at), 'PP HH:mm') : 'N/A'}</span>
          </div>
        </CardContent>
      </Card>

      {/* Tabs for Raw Data and Errors - fills remaining space */}
      <Tabs defaultValue="errors" className="flex-1 flex flex-col min-h-0">
        <TabsList className="shrink-0">
          <TabsTrigger value="errors">
            <AlertCircle className="h-4 w-4 mr-1" />
            Errors ({failureCalls.length})
          </TabsTrigger>
          <TabsTrigger value="raw-data">Raw Data</TabsTrigger>
        </TabsList>

        <TabsContent value="errors" className="mt-3 flex-1 min-h-0 flex flex-col">
          {failureCalls.length > 0 ? (
            <Card className="flex-1 flex flex-col min-h-0">
              <CardContent className="p-3 space-y-2 flex-1 overflow-y-auto">
                {failureCalls.map((call) => (
                  <div
                    key={call.correlation_id}
                    className="p-2 bg-red-50 dark:bg-red-900/10 rounded-md text-sm"
                  >
                    {/* Single row: Status | Correlation ID | Copy | VAPI | Cekura */}
                    <div className="flex items-center gap-2">
                      <Badge variant="destructive" className="text-xs shrink-0">
                        {call.cekura.status}
                      </Badge>
                      <span className="font-mono text-xs truncate flex-1" title={call.correlation_id}>
                        {call.correlation_id}
                      </span>
                      <div className="flex items-center gap-0.5 shrink-0">
                        <CopyButton value={call.correlation_id} className="h-6 w-6" />
                        <Button variant="ghost" size="icon" className="h-6 w-6" asChild>
                          <a
                            href={`https://dashboard.vapi.ai/calls/${call.correlation_id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Open in VAPI"
                          >
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </Button>
                        {call.cekura?.id && (
                          <Button variant="ghost" size="icon" className="h-6 w-6" asChild>
                            <a
                              href={buildCekuraUrl(call.cekura.id, environment)}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="Open in Cekura"
                            >
                              <BarChart3 className="h-3 w-3" />
                            </a>
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Error message (if any) */}
                    {call.cekura.error_message && (
                      <div className="mt-1 text-xs text-red-600 dark:text-red-400 pl-1">
                        {call.cekura.error_message}
                      </div>
                    )}

                    {/* Sentry errors (if any) */}
                    {call.sentry.errors.length > 0 && (
                      <div className="mt-1 text-xs text-muted-foreground pl-1">
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

        <TabsContent value="raw-data" className="mt-3 flex-1 min-h-0 flex flex-col">
          <Card className="flex-1 flex flex-col min-h-0">
            <CardHeader className="pb-2 flex flex-row items-center justify-between shrink-0">
              <CardTitle className="text-sm">Raw Data (JSON)</CardTitle>
              <CopyButton value={JSON.stringify(rawData, null, 2)} />
            </CardHeader>
            <CardContent className="flex-1 min-h-0 overflow-y-auto">
              <JsonViewer data={rawData} collapsed={false} />
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
  onRetrySuccessReport: () => void;
  onRetryFailureReport: () => void;
  onRetryFullReport: () => void;
  isRetryingSuccess: boolean;
  isRetryingFailure: boolean;
  isRetryingFull: boolean;
  successError?: string;
  failureError?: string;
  fullError?: string;
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
  const defaultTab = hasFailures ? 'failure' : 'full';

  return (
    <div className="p-4 h-full flex flex-col">
      <h3 className="font-semibold mb-3 flex items-center gap-2 shrink-0">
        <Sparkles className="h-4 w-4" />
        AI Reports
      </h3>

      <Tabs defaultValue={defaultTab} className="flex-1 flex flex-col min-h-0">
        <TabsList className="w-full shrink-0">
          <TabsTrigger value="failure" className="flex-1">
            Failure
            {!hasFailureReport && (
              <Badge variant="secondary" className="ml-1 text-xs">
                {isRetryingFailure ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Pending'}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="success" className="flex-1">
            Success
            {!hasSuccessReport && (
              <Badge variant="secondary" className="ml-1 text-xs">
                {isRetryingSuccess ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Pending'}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="full" className="flex-1">
            Full
            {!hasFullReport && (
              <Badge variant="secondary" className="ml-1 text-xs">
                {isRetryingFull ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Pending'}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="failure" className="mt-3 flex-1 min-h-0 overflow-y-auto">
          <ReportContent
            report={report}
            content={report.failure_report}
            reportType="failure"
            onRetry={onRetryFailureReport}
            isRetrying={isRetryingFailure}
            error={failureError}
          />
        </TabsContent>

        <TabsContent value="success" className="mt-3 flex-1 min-h-0 overflow-y-auto">
          <ReportContent
            report={report}
            content={report.success_report}
            reportType="success"
            onRetry={onRetrySuccessReport}
            isRetrying={isRetryingSuccess}
            error={successError}
          />
        </TabsContent>

        <TabsContent value="full" className="mt-3 flex-1 min-h-0 overflow-y-auto">
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
  onRetry: () => void;
  isRetrying: boolean;
  error?: string;
}) {
  const markdownRef = useRef<HTMLDivElement>(null);
  const hasReport = content !== null;
  const titleMap = {
    success: 'Success Report',
    failure: 'Failure Report',
    full: 'Full Report',
  };
  const title = titleMap[reportType];

  if (hasReport) {
    return (
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Sparkles className={cn(
              'h-4 w-4',
              reportType === 'success' && 'text-green-500',
              reportType === 'failure' && 'text-red-500',
              reportType === 'full' && 'text-blue-500'
            )} />
            {title}
          </CardTitle>
          <div className="flex gap-1">
            <PDFExportButton
              contentRef={markdownRef}
              filename={`eod-${reportType}-report-${report.report_date}`}
            />
            <Button variant="outline" size="sm" onClick={() => navigator.clipboard.writeText(content || '')} title="Copy to clipboard">
              <Copy className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={onRetry} disabled={isRetrying} title="Regenerate">
              {isRetrying ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div ref={markdownRef} className="bg-background">
            <MarkdownReport content={content || ''} />
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
        <Button variant="outline" size="sm" onClick={onRetry} disabled={isRetrying}>
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
      </CardContent>
    </Card>
  );
}
