'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { format } from 'date-fns';
import {
  FileText,
  Loader2,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  Sparkles,
  GripVertical,
  ExternalLink,
  BarChart3,
  Copy,
  ArrowLeft,
  Share2,
  Check,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CopyButton } from '@/components/ui/copy-button';
import { MarkdownReport } from '@/components/eod/markdown-report';
import { PDFExportButton } from '@/components/eod/pdf-export-button';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { JsonViewer } from '@/components/ui/json-viewer';
import {
  useGenerateSuccessReport,
  useGenerateFailureReport,
  useGenerateFullReport,
  useGenerateWeeklyAIReport,
} from '@/hooks/use-eod-reports';
import { useEnvironment } from '@/components/providers/environment-provider';
import { buildCekuraUrl } from '@/hooks/use-cekura';
import { formatUTCTimestamp } from '@/lib/formatting';
import { buildReportShareUrl, copyToClipboard } from '@/lib/report-share-url';
import { cn } from '@/lib/utils';
import type { EODReport, EODRawData, WeeklyRawData } from '@/types/api';

// Panel resize constants
const MIN_LEFT_PERCENT = 30;
const MAX_LEFT_PERCENT = 70;
const STORAGE_KEY = 'hc-report-detail-panel-sizes';

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

interface ReportDetailViewProps {
  report: EODReport;
  reportType: 'eod' | 'weekly';
  onBack: () => void;
}

export function ReportDetailView({ report, reportType, onBack }: ReportDetailViewProps) {
  const { environment } = useEnvironment();
  const containerRef = useRef<HTMLDivElement>(null);
  const [leftPercent, setLeftPercent] = useState(getStoredLayout());
  const [isHydrated, setIsHydrated] = useState(false);
  const [shareSuccess, setShareSuccess] = useState(false);
  const isDragging = useRef(false);

  const successReportMutation = useGenerateSuccessReport();
  const failureReportMutation = useGenerateFailureReport();
  const fullReportMutation = useGenerateFullReport();
  const weeklyAIReportMutation = useGenerateWeeklyAIReport();

  useEffect(() => {
    setLeftPercent(getStoredLayout());
    setIsHydrated(true);
  }, []);

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

  const handleShare = async () => {
    const url = buildReportShareUrl(report.report_date, reportType, environment);
    const success = await copyToClipboard(url);
    if (success) {
      setShareSuccess(true);
      setTimeout(() => setShareSuccess(false), 2000);
    }
  };

  const rawData = report.raw_data as EODRawData;
  const isWeeklyReport = reportType === 'weekly' || !!rawData?.week_start;

  const handleRetrySuccessReport = async () => {
    if (!report) return;
    try {
      await successReportMutation.mutateAsync({
        reportId: report.id,
        rawData: report.raw_data as EODRawData,
      });
    } catch (error) {
      console.error('Failed to retry success report:', error);
    }
  };

  const handleRetryFailureReport = async () => {
    if (!report) return;
    try {
      await failureReportMutation.mutateAsync({
        reportId: report.id,
        rawData: report.raw_data as EODRawData,
      });
    } catch (error) {
      console.error('Failed to retry failure report:', error);
    }
  };

  const handleRetryFullReport = async () => {
    if (!report) return;
    try {
      if (isWeeklyReport) {
        await weeklyAIReportMutation.mutateAsync({
          reportId: report.id,
          rawData: report.raw_data as WeeklyRawData,
        });
      } else {
        await fullReportMutation.mutateAsync({
          reportId: report.id,
          rawData: report.raw_data as EODRawData,
        });
      }
    } catch (error) {
      console.error('Failed to retry full report:', error);
    }
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b bg-muted/50 gap-2">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <Button variant="ghost" size="icon" onClick={onBack} className="shrink-0">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0">
            <h2 className="font-semibold flex items-center gap-2 text-base">
              <FileText className="h-4 w-4 shrink-0" />
              <span className="truncate">
                {isWeeklyReport
                  ? `Weekly Report - ${format(new Date(rawData.week_start + 'T12:00:00Z'), 'MMM d')} to ${format(new Date(rawData.week_end! + 'T12:00:00Z'), 'MMM d')}`
                  : `EOD Report - ${report.report_date}`
                }
              </span>
            </h2>
            <p className="text-xs text-muted-foreground truncate">
              Generated: {formatUTCTimestamp(report.generated_at)} UTC
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={handleShare}
            className="gap-2"
          >
            {shareSuccess ? (
              <>
                <Check className="h-4 w-4 text-green-500" />
                Copied!
              </>
            ) : (
              <>
                <Share2 className="h-4 w-4" />
                Share
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Content - Two-panel resizable layout */}
      {isHydrated && (
        <div ref={containerRef} className="flex-1 min-h-0 flex">
          {/* Left Panel */}
          <div
            className="h-full overflow-hidden"
            style={{ width: `${leftPercent}%` }}
          >
            <LeftPanel report={report} rawData={rawData} hideErrors={isWeeklyReport} />
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
            <RightPanel
              report={report}
              onRetrySuccessReport={handleRetrySuccessReport}
              onRetryFailureReport={handleRetryFailureReport}
              onRetryFullReport={handleRetryFullReport}
              isRetryingSuccess={successReportMutation.isPending}
              isRetryingFailure={failureReportMutation.isPending}
              isRetryingFull={fullReportMutation.isPending || weeklyAIReportMutation.isPending}
              successError={successReportMutation.error?.message}
              failureError={failureReportMutation.error?.message}
              fullError={fullReportMutation.error?.message || weeklyAIReportMutation.error?.message}
              hideSuccessFailure={isWeeklyReport}
            />
          </div>
        </div>
      )}

      {/* Loading state while hydrating */}
      {!isHydrated && (
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-pulse text-muted-foreground">Loading...</div>
        </div>
      )}
    </div>
  );
}

// Left Panel Component
function LeftPanel({
  report,
  rawData,
  hideErrors = false,
}: {
  report: EODReport;
  rawData: EODRawData;
  hideErrors?: boolean;
}) {
  const { environment } = useEnvironment();

  const hasNewStructure = rawData?.success !== undefined || rawData?.failure !== undefined;
  const oldCalls = (rawData as unknown as { calls?: typeof rawData.success })?.calls ?? [];

  const successCalls = hasNewStructure
    ? (rawData?.success ?? [])
    : oldCalls.filter(c => c.cekura?.status === 'success');

  const failureCalls = hasNewStructure
    ? (rawData?.failure ?? [])
    : oldCalls.filter(c => c.cekura?.status !== 'success');

  const totalCalls = rawData?.count ?? (successCalls.length + failureCalls.length);
  const errorCount = rawData?.failure_count ?? failureCalls.length;
  const successCount = successCalls.length;

  return (
    <div className="h-full flex flex-col gap-4 overflow-x-hidden overflow-y-auto w-full max-w-full p-4">
      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-3 shrink-0">
        <Card>
          <CardContent className="p-3">
            <span className="text-xl font-bold">{totalCalls}</span>
            <div className="text-xs text-muted-foreground">Total</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <span className="text-xl font-bold text-red-500">{errorCount}</span>
            <div className="text-xs text-muted-foreground">Failure</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <span className="text-xl font-bold text-green-500">{successCount}</span>
            <div className="text-xs text-muted-foreground">Success</div>
          </CardContent>
        </Card>
      </div>

      {/* Metadata */}
      <Card className="shrink-0">
        <CardHeader className="pb-2 px-4 pt-4">
          <CardTitle className="text-sm">Report Metadata</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-2 text-sm px-4 pb-4">
          <div className="flex items-center gap-1">
            <span className="text-muted-foreground">Date:</span>
            <span className="font-medium">{report.report_date}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-muted-foreground">Env:</span>
            <Badge variant="outline" className="text-xs h-5">{rawData?.environment}</Badge>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-muted-foreground">Trigger:</span>
            <Badge variant="outline" className="text-xs h-5">{report.trigger_type}</Badge>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-muted-foreground">Generated:</span>
            <span className="truncate">{rawData?.generated_at ? `${formatUTCTimestamp(rawData.generated_at)} UTC` : 'N/A'}</span>
          </div>
        </CardContent>
      </Card>

      {/* Tabs for Raw Data and Errors */}
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

                    {call.cekura.error_message && (
                      <div className="mt-1 text-[10px] text-red-600 dark:text-red-400 pl-1 break-words">
                        {call.cekura.error_message}
                      </div>
                    )}

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
              <CardTitle className="text-sm">Raw Data</CardTitle>
              <CopyButton value={JSON.stringify(rawData, null, 2)} />
            </CardHeader>
            <CardContent className="flex-1 min-h-0 overflow-auto p-2">
              <div className="text-xs overflow-x-auto">
                <JsonViewer data={rawData} collapsed={false} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Right Panel Component
interface RightPanelProps {
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
  hideSuccessFailure?: boolean;
}

function RightPanel({
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
  hideSuccessFailure = false,
}: RightPanelProps) {
  const hasFailureReport = report.failure_report !== null;
  const hasSuccessReport = report.success_report !== null;
  const hasFullReport = report.full_report !== null;

  const rawData = report.raw_data as EODRawData;
  const oldCalls = (rawData as unknown as { calls?: typeof rawData.failure })?.calls ?? [];
  const failureCount = rawData?.failure?.length ?? oldCalls.filter(c => c.cekura?.status !== 'success').length;
  const hasFailures = failureCount > 0;
  const defaultTab = hideSuccessFailure ? 'full' : (hasFailures ? 'failure' : 'full');

  return (
    <div className="h-full flex flex-col overflow-hidden w-full max-w-full p-4">
      <h3 className="font-semibold mb-3 flex items-center gap-2 shrink-0 text-base">
        <Sparkles className="h-4 w-4" />
        {hideSuccessFailure ? 'Weekly Report' : 'AI Reports'}
      </h3>

      <Tabs defaultValue={defaultTab} className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <TabsList className="w-full shrink-0">
          {!hideSuccessFailure && (
            <>
              <TabsTrigger value="failure" className="flex-1 text-sm px-3">
                Failure
                {!hasFailureReport && (
                  <Badge variant="secondary" className="ml-1 text-xs px-1.5">
                    {isRetryingFailure ? <Loader2 className="h-3 w-3 animate-spin" /> : '!'}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="success" className="flex-1 text-sm px-3">
                Success
                {!hasSuccessReport && (
                  <Badge variant="secondary" className="ml-1 text-xs px-1.5">
                    {isRetryingSuccess ? <Loader2 className="h-3 w-3 animate-spin" /> : '!'}
                  </Badge>
                )}
              </TabsTrigger>
            </>
          )}
          <TabsTrigger value="full" className="flex-1 text-sm px-3">
            {hideSuccessFailure ? 'Weekly Report' : 'Full'}
            {!hasFullReport && (
              <Badge variant="secondary" className="ml-1 text-xs px-1.5">
                {isRetryingFull ? <Loader2 className="h-3 w-3 animate-spin" /> : '!'}
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

// Report Content Component
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
      <Card className="overflow-hidden">
        <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2 px-4">
          <CardTitle className="text-sm flex items-center gap-1.5 min-w-0">
            <Sparkles className={cn(
              'h-4 w-4 shrink-0',
              reportType === 'success' && 'text-green-500',
              reportType === 'failure' && 'text-red-500',
              reportType === 'full' && 'text-blue-500'
            )} />
            <span className="truncate">{title}</span>
          </CardTitle>
          <div className="flex gap-0.5 shrink-0">
            <PDFExportButton
              contentRef={markdownRef}
              filename={`eod-${reportType}-report-${report.report_date}`}
            />
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => navigator.clipboard.writeText(content || '')} title="Copy to clipboard">
              <Copy className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={onRetry} disabled={isRetrying} title="Regenerate">
              {isRetrying ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4 overflow-hidden">
          <div ref={markdownRef} className="bg-background overflow-x-auto text-sm">
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
