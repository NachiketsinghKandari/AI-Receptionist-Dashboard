'use client';

import { useState, useMemo } from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { Webhook as WebhookIcon, Building2, Bot, BarChart3, FileText, ChevronDown, ArrowLeftRight, ExternalLink, Bug, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CopyButton } from '@/components/ui/copy-button';
import { JsonViewer } from '@/components/ui/json-viewer';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { FilterSidebar } from '@/components/filters/filter-sidebar';
import { DataTable } from '@/components/tables/data-table';
import { DetailDialog } from '@/components/details/detail-dialog';
import { useWebhooks } from '@/hooks/use-webhooks';
import { useCallDetail } from '@/hooks/use-calls';
import { useDebounce } from '@/hooks/use-debounce';
import { DEFAULT_PAGE_LIMIT, DEFAULT_DAYS_BACK, WEBHOOK_PLATFORMS } from '@/lib/constants';
import type { Webhook } from '@/types/database';
import type { SortOrder } from '@/types/api';
import { format, subDays } from 'date-fns';
import { parseWebhookPayload, enrichTransfersWithDatabaseData } from '@/lib/webhook-utils';

const columns: ColumnDef<Webhook>[] = [
  {
    accessorKey: 'id',
    header: 'ID',
    cell: ({ row }) => <span className="font-mono text-sm">{row.getValue('id')}</span>,
  },
  {
    accessorKey: 'call_id',
    header: 'Call ID',
    cell: ({ row }) => {
      const value = row.getValue('call_id') as number | null;
      return value ? <span className="font-mono text-sm">{value}</span> : '-';
    },
  },
  {
    accessorKey: 'platform',
    header: 'Platform',
    cell: ({ row }) => <Badge variant="outline">{row.getValue('platform')}</Badge>,
  },
  {
    accessorKey: 'platform_call_id',
    header: 'Correlation ID',
    cell: ({ row }) => {
      const value = row.getValue('platform_call_id') as string;
      return (
        <div className="flex items-center gap-1">
          <span className="font-mono text-xs truncate max-w-[100px]">{value}</span>
          <CopyButton value={value} />
        </div>
      );
    },
  },
  {
    accessorKey: 'webhook_type',
    header: 'Type',
    cell: ({ row }) => <Badge variant="secondary">{row.getValue('webhook_type')}</Badge>,
  },
  {
    accessorKey: 'received_at',
    header: 'Received',
    cell: ({ row }) => {
      const value = row.getValue('received_at') as string;
      return value ? format(new Date(value), 'yyyy-MM-dd HH:mm') : '-';
    },
  },
];

export default function WebhooksPage() {
  const [showAll, setShowAll] = useState(false);
  const [startDate, setStartDate] = useState(format(subDays(new Date(), DEFAULT_DAYS_BACK), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [search, setSearch] = useState('');
  const [firmId, setFirmId] = useState<number | null>(null);
  const [platform, setPlatform] = useState('All');
  const [multipleTransfers, setMultipleTransfers] = useState(false);
  const [limit, setLimit] = useState(DEFAULT_PAGE_LIMIT);
  const [offset, setOffset] = useState(0);
  const [selectedWebhook, setSelectedWebhook] = useState<Webhook | null>(null);
  const [sortBy, setSortBy] = useState<string | null>('received_at');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  const debouncedSearch = useDebounce(search, 300);

  const filters = useMemo(
    () => ({
      platform: platform !== 'All' ? platform : null,
      multipleTransfers,
      startDate: showAll ? null : `${startDate}T00:00:00`,
      endDate: showAll ? null : `${endDate}T23:59:59`,
      search: debouncedSearch || undefined,
      limit,
      offset,
      sortBy,
      sortOrder,
    }),
    [platform, multipleTransfers, startDate, endDate, showAll, debouncedSearch, limit, offset, sortBy, sortOrder]
  );

  // Handle column sorting
  const handleSort = (column: string) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('desc');
    }
    setOffset(0);
  };

  const { data, isLoading, isFetching } = useWebhooks(filters);

  // Fetch call details when a webhook is selected (for enriching transfer data)
  const { data: callDetailData } = useCallDetail(selectedWebhook?.call_id ?? null);

  const parsedPayload = selectedWebhook?.payload ? parseWebhookPayload(selectedWebhook.payload) : null;

  // Enrich transfers with database data (caller name from call, recipient from transfers table)
  const enrichedTransfers = (() => {
    const parsedTransfers = parsedPayload?.transfers ?? [];
    if (!parsedTransfers.length) return [];
    return enrichTransfersWithDatabaseData(
      parsedTransfers,
      callDetailData?.call?.caller_name ?? null,
      callDetailData?.transfers ?? []
    );
  })();

  // Navigation logic for detail dialog
  const dataArray = data?.data ?? [];
  const currentIndex = selectedWebhook
    ? dataArray.findIndex(w => w.id === selectedWebhook.id)
    : -1;
  const hasPrevious = currentIndex > 0;
  const hasNext = currentIndex >= 0 && currentIndex < dataArray.length - 1;

  const handlePrevious = () => {
    if (hasPrevious) setSelectedWebhook(dataArray[currentIndex - 1]);
  };
  const handleNext = () => {
    if (hasNext) setSelectedWebhook(dataArray[currentIndex + 1]);
  };

  return (
    <div className="flex h-full">
      <FilterSidebar
        showAll={showAll}
        onShowAllChange={setShowAll}
        startDate={startDate}
        onStartDateChange={setStartDate}
        endDate={endDate}
        onEndDateChange={setEndDate}
        search={search}
        onSearchChange={setSearch}
        searchHelpText="ID, call ID, correlation ID, type, platform"
        firmId={firmId}
        onFirmIdChange={setFirmId}
        limit={limit}
        onLimitChange={setLimit}
      >
        <div>
          <Label className="text-sm">Platform</Label>
          <Select value={platform} onValueChange={setPlatform}>
            <SelectTrigger className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WEBHOOK_PLATFORMS.map((p) => (
                <SelectItem key={p} value={p}>
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Multiple Transfers Filter */}
        <div className="flex items-center justify-between">
          <Label htmlFor="multiple-transfers-webhooks" className="text-sm flex items-center gap-1.5">
            Multiple Transfers
            {multipleTransfers && isLoading && (
              <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
            )}
          </Label>
          <Switch
            id="multiple-transfers-webhooks"
            checked={multipleTransfers}
            onCheckedChange={setMultipleTransfers}
          />
        </div>
      </FilterSidebar>

      <div className="flex-1 flex flex-col p-6 overflow-hidden">
        {/* Header - fixed */}
        <div className="shrink-0">
          <h1 className="text-2xl font-bold mb-4 flex items-center gap-2">
            <WebhookIcon className="h-6 w-6" />
            Webhooks
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
            Click a row to view webhook details
          </p>
        </div>

        {/* Table - scrollable */}
        <div className="flex-1 min-h-0">
          <DataTable
            columns={columns}
            data={data?.data ?? []}
            total={data?.total ?? 0}
            offset={offset}
            limit={limit}
            onOffsetChange={setOffset}
            onRowSelect={(row) => setSelectedWebhook(row as Webhook | null)}
            selectedRowId={selectedWebhook?.id ?? null}
            isLoading={isLoading}
            isFetching={isFetching}
            getRowId={(row) => String(row.id)}
            sortBy={sortBy}
            sortOrder={sortOrder}
            onSort={handleSort}
            sortableColumns={['id', 'received_at']}
          />
        </div>
      </div>

      {/* Detail Dialog */}
      <DetailDialog
        open={selectedWebhook !== null}
        onClose={() => setSelectedWebhook(null)}
        onPrevious={handlePrevious}
        onNext={handleNext}
        hasPrevious={hasPrevious}
        hasNext={hasNext}
        title={
          <span className="flex items-center gap-2">
            <WebhookIcon className="h-5 w-5" />
            Webhook #{selectedWebhook?.id}
          </span>
        }
        subtitle={selectedWebhook?.webhook_type}
      >
        {selectedWebhook && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Badge variant="outline">{selectedWebhook.platform}</Badge>
              <Badge variant="secondary">{selectedWebhook.webhook_type}</Badge>
            </div>

            {/* External Links */}
            {selectedWebhook.platform_call_id && (
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" asChild>
                  <a href={`https://dashboard.vapi.ai/calls/${selectedWebhook.platform_call_id}`} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                    VAPI Dashboard
                  </a>
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <a href={`https://helloounsil.sentry.io/explore/logs/?logsFields=timestamp&logsFields=correlation_id&logsFields=message&logsQuery=correlation_id%3A${selectedWebhook.platform_call_id}&logsSortBys=-timestamp`} target="_blank" rel="noopener noreferrer">
                    <Bug className="h-3.5 w-3.5 mr-1.5" />
                    Sentry Logs
                  </a>
                </Button>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><strong>ID:</strong> {selectedWebhook.id}</div>
              <div><strong>Type:</strong> {selectedWebhook.webhook_type}</div>
              <div><strong>Platform:</strong> {selectedWebhook.platform}</div>
              <div><strong>Received:</strong> {selectedWebhook.received_at}</div>
              <div className="flex items-center gap-1">
                <strong>Platform Call ID:</strong>
                <span className="font-mono text-xs truncate">{selectedWebhook.platform_call_id}</span>
                {selectedWebhook.platform_call_id && <CopyButton value={selectedWebhook.platform_call_id} />}
              </div>
              <div><strong>Call ID:</strong> {selectedWebhook.call_id || '-'}</div>
            </div>

            {parsedPayload?.squadOverrides && (
              <details className="group rounded-lg border border-border overflow-hidden">
                <summary className="flex items-center justify-between gap-2 p-3 bg-muted/50 hover:bg-muted cursor-pointer list-none">
                  <span className="flex items-center gap-2 font-medium text-sm">
                    <Building2 className="h-4 w-4" />
                    Squad Overrides
                  </span>
                  <div className="flex items-center gap-1">
                    <CopyButton value={JSON.stringify(parsedPayload.squadOverrides, null, 2)} />
                    <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
                  </div>
                </summary>
                <div className="border-t">
                  <JsonViewer data={parsedPayload.squadOverrides} className="max-h-60 rounded-none border-0" />
                </div>
              </details>
            )}

            {parsedPayload?.assistantOverrides && (
              <details className="group rounded-lg border border-border overflow-hidden">
                <summary className="flex items-center justify-between gap-2 p-3 bg-muted/50 hover:bg-muted cursor-pointer list-none">
                  <span className="flex items-center gap-2 font-medium text-sm">
                    <Bot className="h-4 w-4" />
                    Assistant Overrides
                  </span>
                  <div className="flex items-center gap-1">
                    <CopyButton value={JSON.stringify(parsedPayload.assistantOverrides, null, 2)} />
                    <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
                  </div>
                </summary>
                <div className="border-t">
                  <JsonViewer data={parsedPayload.assistantOverrides} className="max-h-60 rounded-none border-0" />
                </div>
              </details>
            )}

            {parsedPayload?.structuredOutputs && (
              <details className="group rounded-lg border border-border overflow-hidden">
                <summary className="flex items-center justify-between gap-2 p-3 bg-muted/50 hover:bg-muted cursor-pointer list-none">
                  <span className="flex items-center gap-2 font-medium text-sm">
                    <BarChart3 className="h-4 w-4" />
                    Structured Outputs
                  </span>
                  <div className="flex items-center gap-1">
                    <CopyButton value={JSON.stringify(parsedPayload.structuredOutputs, null, 2)} />
                    <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
                  </div>
                </summary>
                <div className="border-t">
                  <JsonViewer data={parsedPayload.structuredOutputs} className="max-h-60 rounded-none border-0" />
                </div>
              </details>
            )}

            {enrichedTransfers.length > 0 && (
              <details className="group rounded-lg border border-border overflow-hidden">
                <summary className="flex items-center justify-between gap-2 p-3 bg-muted/50 hover:bg-muted cursor-pointer list-none">
                  <span className="flex items-center gap-2 font-medium text-sm">
                    <ArrowLeftRight className="h-4 w-4" />
                    Transfers ({enrichedTransfers.length})
                  </span>
                  <div className="flex items-center gap-1">
                    <CopyButton value={JSON.stringify(enrichedTransfers, null, 2)} />
                    <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
                  </div>
                </summary>
                <div className="p-3 bg-muted/30 border-t space-y-2">
                  {enrichedTransfers.map((transfer) => (
                    <div key={transfer.toolCallId} className="p-2 bg-background rounded-md border text-sm">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">
                          {transfer.callerName} → {transfer.staffName}
                        </span>
                        <Badge variant={transfer.result.toLowerCase().includes('cancelled') ? 'destructive' : 'default'}>
                          {transfer.result}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </details>
            )}

            <details className="group rounded-lg border border-border overflow-hidden">
              <summary className="flex items-center justify-between gap-2 p-3 bg-muted/50 hover:bg-muted cursor-pointer list-none">
                <span className="flex items-center gap-2 font-medium text-sm">
                  <FileText className="h-4 w-4" />
                  Full Payload
                </span>
                <div className="flex items-center gap-1">
                  <CopyButton value={JSON.stringify(selectedWebhook.payload, null, 2)} />
                  <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
                </div>
              </summary>
              <div className="border-t">
                <JsonViewer data={selectedWebhook.payload} className="max-h-80 rounded-none border-0" />
              </div>
            </details>
          </div>
        )}
      </DetailDialog>
    </div>
  );
}
