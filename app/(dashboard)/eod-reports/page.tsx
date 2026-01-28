'use client';

import { useState, useMemo, useRef } from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { FileText, Loader2, Plus, CheckCircle, AlertCircle, RefreshCw, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DataTable } from '@/components/tables/data-table';
import { CopyButton } from '@/components/ui/copy-button';
import { DetailDialog } from '@/components/details/detail-dialog';
import { MarkdownReport } from '@/components/eod/markdown-report';
import { PDFExportButton } from '@/components/eod/pdf-export-button';
import { useEODReports, useGenerateEODReport, useSaveEODReport, useGenerateAIReport } from '@/hooks/use-eod-reports';
import { DEFAULT_PAGE_LIMIT } from '@/lib/constants';
import { JsonViewer } from '@/components/ui/json-viewer';
import type { EODReport, EODRawData, SortOrder } from '@/types/api';
import { format } from 'date-fns';

function createColumns(generatingReportId?: string): ColumnDef<EODReport>[] {
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
        return <span className="font-mono">{rawData?.count ?? 0}</span>;
      },
    },
    {
      id: 'error_count',
      header: 'Errors',
      cell: ({ row }) => {
        // Use AI-computed error count if available, otherwise fallback to raw count
        const aiErrors = row.original.errors;
        if (aiErrors !== null && aiErrors !== undefined) {
          return (
            <Badge variant={aiErrors > 0 ? 'destructive' : 'secondary'}>
              {aiErrors}
            </Badge>
          );
        }
        // Fallback: count from raw data
        const rawData = row.original.raw_data as EODRawData;
        const errorCount = rawData?.calls?.reduce(
          (sum, call) => sum + (call.sentry?.errors?.length || 0),
          0
        ) ?? 0;
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
      header: 'AI Report',
      cell: ({ row }) => {
        const hasAIReport = row.original.report !== null && row.original.report !== undefined;
        const isGenerating = generatingReportId === row.original.id;
        if (hasAIReport) {
          return (
            <Badge variant="default" className="bg-green-600">
              <Sparkles className="h-3 w-3 mr-1" />
              Ready
            </Badge>
          );
        }
        if (isGenerating) {
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
  const [generatedRawData, setGeneratedRawData] = useState<EODRawData | null>(null);

  const filters = useMemo(
    () => ({
      limit,
      offset,
      sortBy,
      sortOrder,
    }),
    [limit, offset, sortBy, sortOrder]
  );

  const { data, isLoading, isFetching } = useEODReports(filters);
  const generateMutation = useGenerateEODReport();
  const saveMutation = useSaveEODReport();
  const aiGenerateMutation = useGenerateAIReport();

  const generatingReportId = aiGenerateMutation.isPending ? aiGenerateMutation.variables?.reportId : undefined;
  const columns = useMemo(() => createColumns(generatingReportId), [generatingReportId]);

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
      const result = await generateMutation.mutateAsync(reportDate);
      setGeneratedRawData(result.raw_data);
    } catch (error) {
      console.error('Failed to generate report:', error);
    }
  };

  const handleSave = async () => {
    if (!generatedRawData) return;

    try {
      await saveMutation.mutateAsync({ reportDate, rawData: generatedRawData });
      setGeneratedRawData(null); // Clear after save
    } catch (error) {
      console.error('Failed to save report:', error);
    }
  };

  // Navigation logic for detail dialog
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

  const handleRetryAI = async () => {
    if (!selectedReport) return;
    try {
      await aiGenerateMutation.mutateAsync({
        reportId: selectedReport.id,
        rawData: selectedReport.raw_data as EODRawData,
      });
    } catch (error) {
      console.error('Failed to retry AI generation:', error);
    }
  };

  return (
    <div className="flex h-full">
      {/* Sidebar for generating reports */}
      <div className="w-64 shrink-0 flex flex-col bg-card border-r border-border">
        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
          <h2 className="font-semibold text-lg">Generate Report</h2>

          <div>
            <Label htmlFor="reportDate" className="text-sm">
              Report Date
            </Label>
            <Input
              id="reportDate"
              type="date"
              value={reportDate}
              onChange={(e) => {
                setReportDate(e.target.value);
                setGeneratedRawData(null);
              }}
              className="mt-1"
            />
          </div>

          <Button
            onClick={handleGenerate}
            disabled={generateMutation.isPending || !reportDate}
            className="w-full"
          >
            {generateMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Plus className="h-4 w-4 mr-2" />
                Generate Report
              </>
            )}
          </Button>

          {generateMutation.isError && (
            <div className="p-2 bg-red-50 dark:bg-red-900/20 rounded-md text-sm text-red-600 dark:text-red-400 flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              {generateMutation.error?.message || 'Failed to generate'}
            </div>
          )}

          {/* Preview generated data */}
          {generatedRawData && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  Generated Preview
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total Calls:</span>
                  <span className="font-mono">{generatedRawData.count}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">With Errors:</span>
                  <span className="font-mono">
                    {generatedRawData.calls.filter(c => c.sentry.errors.length > 0).length}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Environment:</span>
                  <Badge variant="outline" className="text-xs">
                    {generatedRawData.environment}
                  </Badge>
                </div>

                <Button
                  onClick={handleSave}
                  disabled={saveMutation.isPending}
                  variant="default"
                  className="w-full mt-2"
                >
                  {saveMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    'Save Report'
                  )}
                </Button>

                {saveMutation.isSuccess && (
                  <div className="p-2 bg-green-50 dark:bg-green-900/20 rounded-md text-sm text-green-600 dark:text-green-400 space-y-1">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4" />
                      Report saved!
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <Sparkles className="h-3 w-3" />
                      AI insights generating...
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Results per page */}
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
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col p-6 overflow-hidden">
        {/* Header */}
        <div className="shrink-0">
          <h1 className="text-2xl font-bold mb-4 flex items-center gap-2">
            <FileText className="h-6 w-6" />
            EOD Reports
          </h1>

          <div className="flex gap-4 mb-2">
            <div className="text-sm">
              <span className="font-medium">Total:</span> {data?.total ?? 0}
            </div>
            <div className="text-sm">
              <span className="font-medium">Showing:</span> {data?.data?.length ?? 0}
            </div>
          </div>

          <p className="text-sm text-muted-foreground mb-4">
            Click a row to view full report details
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
          />
        </div>
      </div>

      {/* Detail Dialog */}
      <DetailDialog
        open={selectedReport !== null}
        onClose={() => setSelectedReport(null)}
        onPrevious={handlePrevious}
        onNext={handleNext}
        hasPrevious={hasPrevious}
        hasNext={hasNext}
        title={
          <span className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            EOD Report - {selectedReport?.report_date}
          </span>
        }
        subtitle={`Generated: ${selectedReport?.generated_at ? format(new Date(selectedReport.generated_at), 'PPpp') : 'N/A'}`}
      >
        {selectedReport && (
          <EODReportDetail
            report={selectedReport}
            onRetryAI={handleRetryAI}
            isRetrying={aiGenerateMutation.isPending}
            retryError={aiGenerateMutation.error?.message}
          />
        )}
      </DetailDialog>
    </div>
  );
}

function EODReportDetail({ report, onRetryAI, isRetrying, retryError }: { report: EODReport; onRetryAI?: () => void; isRetrying?: boolean; retryError?: string }) {
  const rawData = report.raw_data as EODRawData;
  const callsWithErrors = rawData?.calls?.filter(c => c.sentry.errors.length > 0) || [];
  const callsWithoutErrors = rawData?.calls?.filter(c => c.sentry.errors.length === 0) || [];
  const markdownRef = useRef<HTMLDivElement>(null);

  const hasAIReport = report.report !== null && report.report !== undefined;

  return (
    <div className="space-y-4">
      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold">{rawData?.count ?? 0}</div>
            <div className="text-sm text-muted-foreground">Total Calls</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-red-500">
              {report.errors ?? callsWithErrors.length}
            </div>
            <div className="text-sm text-muted-foreground">
              {report.errors !== null ? 'AI-Detected Errors' : 'Calls with Errors'}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-green-500">{callsWithoutErrors.length}</div>
            <div className="text-sm text-muted-foreground">Clean Calls</div>
          </CardContent>
        </Card>
      </div>

      {/* Metadata */}
      <Card>
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
            <span>{rawData?.generated_at ? format(new Date(rawData.generated_at), 'PPpp') : 'N/A'}</span>
          </div>
        </CardContent>
      </Card>

      {/* Tabs for AI Report and Raw Data */}
      <Tabs defaultValue={hasAIReport ? 'ai-report' : 'raw-data'}>
        <TabsList>
          <TabsTrigger value="ai-report">
            <Sparkles className="h-4 w-4 mr-1" />
            AI Report
            {!hasAIReport && (
              <Badge variant="secondary" className="ml-2 text-xs">
                {isRetrying && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
                {isRetrying ? 'Generating' : 'Pending'}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="raw-data">Raw Data</TabsTrigger>
          <TabsTrigger value="errors">Errors ({callsWithErrors.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="ai-report" className="mt-4">
          {hasAIReport ? (
            <Card>
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-green-500" />
                  AI-Generated Report
                </CardTitle>
                <div className="flex gap-2">
                  <PDFExportButton
                    contentRef={markdownRef}
                    filename={`eod-report-${report.report_date}`}
                  />
                  <CopyButton value={report.report || ''} />
                </div>
              </CardHeader>
              <CardContent>
                <div ref={markdownRef} className="bg-background p-4 rounded-lg">
                  <MarkdownReport content={report.report || ''} />
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-8 text-center">
                {isRetrying ? (
                  <>
                    <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-muted-foreground" />
                    <p className="text-muted-foreground mb-4">
                      Generating AI report...
                    </p>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-8 w-8 mx-auto mb-4 text-muted-foreground" />
                    <p className="text-muted-foreground mb-4">
                      AI report not generated yet.
                    </p>
                  </>
                )}
                {retryError && (
                  <div className="p-2 bg-red-50 dark:bg-red-900/20 rounded-md text-sm text-red-600 dark:text-red-400 mb-4">
                    <AlertCircle className="h-4 w-4 inline mr-2" />
                    {retryError}
                  </div>
                )}
                {onRetryAI && (
                  <Button variant="outline" size="sm" onClick={onRetryAI} disabled={isRetrying}>
                    {isRetrying ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Generate AI Report
                      </>
                    )}
                  </Button>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="raw-data" className="mt-4">
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-sm">Raw Data (JSON)</CardTitle>
              <CopyButton value={JSON.stringify(rawData, null, 2)} />
            </CardHeader>
            <CardContent>
              <JsonViewer data={rawData} className="max-h-96" collapsed={false} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="errors" className="mt-4">
          {callsWithErrors.length > 0 ? (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-red-500">
                  Calls with Sentry Errors ({callsWithErrors.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 max-h-96 overflow-y-auto">
                {callsWithErrors.map((call) => (
                  <div
                    key={call.correlation_id}
                    className="p-2 bg-red-50 dark:bg-red-900/10 rounded-md text-sm"
                  >
                    <div className="flex justify-between items-start">
                      <span className="font-mono text-xs truncate max-w-[200px]">
                        {call.correlation_id}
                      </span>
                      <Badge variant="outline" className="text-xs">
                        {call.cekura.status}
                      </Badge>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {call.sentry.errors.length} error(s):{' '}
                      {call.sentry.errors.map(e => e.title).join(', ')}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-8 text-center">
                <CheckCircle className="h-8 w-8 text-green-500 mx-auto mb-4" />
                <p className="text-muted-foreground">No errors detected in this report.</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
