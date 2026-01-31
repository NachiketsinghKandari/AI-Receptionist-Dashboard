'use client';

import { useState, useMemo } from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { ArrowLeftRight, ExternalLink, Bug } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ResponsiveFilterSidebar } from '@/components/filters/responsive-filter-sidebar';
import { DataTable } from '@/components/tables/data-table';
import { DetailDialog } from '@/components/details/detail-dialog';
import { useTransfers } from '@/hooks/use-transfers';
import { useDebounce } from '@/hooks/use-debounce';
import { DEFAULT_PAGE_LIMIT, TRANSFER_STATUSES, TRANSFER_TYPES } from '@/lib/constants';
import { useDateFilter } from '@/components/providers/date-filter-provider';
import type { Transfer } from '@/types/database';
import type { SortOrder, DynamicFilter } from '@/types/api';
import { format } from 'date-fns';
import { getTodayRangeUTC, getYesterdayRangeUTC, getDateRangeUTC } from '@/lib/date-utils';
import { DynamicFilterBuilder, type FilterRow, conditionRequiresValue } from '@/components/filters/dynamic-filter-builder';
import { TRANSFER_FILTER_FIELDS } from '@/lib/filter-fields';

const columns: ColumnDef<Transfer>[] = [
  {
    accessorKey: 'id',
    header: 'ID',
    cell: ({ row }) => <span className="font-mono text-sm">{row.getValue('id')}</span>,
  },
  {
    accessorKey: 'call_id',
    header: 'Call ID',
    cell: ({ row }) => <span className="font-mono text-sm">{row.getValue('call_id')}</span>,
  },
  {
    accessorKey: 'transfer_type',
    header: 'Type',
    cell: ({ row }) => <Badge variant="outline">{row.getValue('transfer_type')}</Badge>,
  },
  {
    accessorKey: 'transferred_to_name',
    header: 'Recipient',
  },
  {
    accessorKey: 'transferred_to_phone_number',
    header: 'Phone',
    cell: ({ row }) => (
      <span className="font-mono text-sm">{row.getValue('transferred_to_phone_number')}</span>
    ),
  },
  {
    accessorKey: 'transfer_status',
    header: 'Status',
    cell: ({ row }) => {
      const status = row.getValue('transfer_status') as string;
      const variant = status === 'completed' ? 'default' : status === 'failed' ? 'destructive' : 'secondary';
      return <Badge variant={variant}>{status}</Badge>;
    },
  },
  {
    accessorKey: 'transfer_started_at',
    header: 'Started',
    cell: ({ row }) => {
      const value = row.getValue('transfer_started_at') as string;
      return value ? format(new Date(value), 'yyyy-MM-dd HH:mm') : '-';
    },
  },
];

export default function TransfersPage() {
  // Shared date filter state from context
  const {
    dateFilterMode,
    setDateFilterMode,
    startDate,
    setStartDate,
    endDate,
    setEndDate,
  } = useDateFilter();

  const [search, setSearch] = useState('');
  const [firmId, setFirmId] = useState<number | null>(null);
  const [status, setStatus] = useState('All');
  const [transferType, setTransferType] = useState('Off');
  const [limit, setLimit] = useState(DEFAULT_PAGE_LIMIT);
  const [offset, setOffset] = useState(0);
  const [selectedTransfer, setSelectedTransfer] = useState<Transfer | null>(null);
  const [sortBy, setSortBy] = useState<string | null>('transfer_started_at');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [dynamicFilters, setDynamicFilters] = useState<FilterRow[]>([]);

  const debouncedSearch = useDebounce(search, 300);

  // Extract special filters from dynamic filters and separate standard filters
  const extractedFilters = useMemo(() => {
    const validFilters = dynamicFilters.filter(
      (f) => f.value || !conditionRequiresValue(f.condition)
    );

    let extractedFirmId: number | null = null;
    let extractedCallId: number | null = null;
    let extractedStatus: string | null = null;
    const standardFilters: DynamicFilter[] = [];

    for (const filter of validFilters) {
      if (filter.condition === 'equals') {
        switch (filter.field) {
          case 'firm_id':
            extractedFirmId = parseInt(filter.value) || null;
            break;
          case 'call_id':
            extractedCallId = parseInt(filter.value) || null;
            break;
          case 'transfer_status':
            extractedStatus = filter.value;
            break;
          default:
            standardFilters.push({
              field: filter.field,
              condition: filter.condition,
              value: filter.value,
            });
        }
      } else {
        standardFilters.push({
          field: filter.field,
          condition: filter.condition,
          value: filter.value,
        });
      }
    }

    return {
      firmId: extractedFirmId,
      callId: extractedCallId,
      status: extractedStatus,
      standardFilters: standardFilters.length > 0 ? standardFilters : null,
    };
  }, [dynamicFilters]);

  // Compute effective date range based on filter mode (in UTC)
  const effectiveDateRange = useMemo(() => {
    if (dateFilterMode === 'all') {
      return { startDate: null, endDate: null };
    }
    if (dateFilterMode === 'today') {
      return getTodayRangeUTC();
    }
    if (dateFilterMode === 'yesterday') {
      return getYesterdayRangeUTC();
    }
    // Custom mode - convert Eastern dates to UTC
    return getDateRangeUTC(startDate, endDate);
  }, [dateFilterMode, startDate, endDate]);

  // Date-only filters for total count (no other filters applied)
  const dateOnlyFilters = useMemo(
    () => ({
      startDate: effectiveDateRange.startDate,
      endDate: effectiveDateRange.endDate,
      limit: 1,
      offset: 0,
    }),
    [effectiveDateRange]
  );

  // Compute effective filter values (sidebar takes precedence, then dynamic)
  const effectiveFirmId = firmId ?? extractedFilters.firmId;
  const effectiveStatus = status !== 'All' ? status : extractedFilters.status;

  const filters = useMemo(
    () => ({
      firmId: effectiveFirmId,
      callId: extractedFilters.callId,
      status: effectiveStatus,
      transferType: transferType !== 'Off' ? transferType : undefined,
      startDate: effectiveDateRange.startDate,
      endDate: effectiveDateRange.endDate,
      search: debouncedSearch || undefined,
      limit,
      offset,
      sortBy,
      sortOrder,
      dynamicFilters: extractedFilters.standardFilters,
    }),
    [effectiveFirmId, extractedFilters.callId, effectiveStatus, transferType, extractedFilters.standardFilters, effectiveDateRange.startDate, effectiveDateRange.endDate, debouncedSearch, limit, offset, sortBy, sortOrder]
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

  // Date-only count query (for "Total" display)
  const { data: dateOnlyData } = useTransfers(dateOnlyFilters);

  const { data, isLoading, isFetching } = useTransfers(filters);

  // Navigation logic for detail dialog
  const dataArray = data?.data ?? [];
  const currentIndex = selectedTransfer
    ? dataArray.findIndex(t => t.id === selectedTransfer.id)
    : -1;
  const hasPrevious = currentIndex > 0;
  const hasNext = currentIndex >= 0 && currentIndex < dataArray.length - 1;

  const handlePrevious = () => {
    if (hasPrevious) setSelectedTransfer(dataArray[currentIndex - 1]);
  };
  const handleNext = () => {
    if (hasNext) setSelectedTransfer(dataArray[currentIndex + 1]);
  };

  return (
    <div className="flex h-full">
      <ResponsiveFilterSidebar
        dateFilterMode={dateFilterMode}
        onDateFilterModeChange={setDateFilterMode}
        startDate={startDate}
        onStartDateChange={setStartDate}
        endDate={endDate}
        onEndDateChange={setEndDate}
        search={search}
        onSearchChange={setSearch}
        searchHelpText="ID, call ID, recipient name, phone, type, status"
        firmId={firmId}
        onFirmIdChange={setFirmId}
        limit={limit}
        onLimitChange={setLimit}
        headerAction={
          <DynamicFilterBuilder
            fields={TRANSFER_FILTER_FIELDS}
            filters={dynamicFilters}
            onFiltersChange={setDynamicFilters}
            onApply={() => setOffset(0)}
          />
        }
      >
        <div>
          <Label className="text-sm">Status</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TRANSFER_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-sm">Transfer Type</Label>
          <Select value={transferType} onValueChange={setTransferType}>
            <SelectTrigger className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TRANSFER_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {t === 'has_conversation' ? 'Has Conversation' : t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </ResponsiveFilterSidebar>

      <div className="flex-1 flex flex-col p-4 md:p-6 overflow-hidden">
        {/* Header - fixed */}
        <div className="shrink-0">
          <h1 className="text-xl md:text-2xl font-bold mb-3 md:mb-4 flex items-center gap-2">
            <ArrowLeftRight className="h-5 w-5 md:h-6 md:w-6" />
            Transfers
          </h1>

          <div className="flex flex-wrap gap-2 md:gap-4 mb-2">
            <div className="text-xs md:text-sm">
              <span className="font-medium">Total:</span> {dateOnlyData?.total ?? 0}
            </div>
            <div className="text-xs md:text-sm">
              <span className="font-medium">Filtered:</span> {data?.total ?? 0}
              {dateOnlyData?.total ? (
                <span className="text-muted-foreground ml-1">
                  ({Math.round(((data?.total ?? 0) / dateOnlyData.total) * 100)}%)
                </span>
              ) : null}
            </div>
            <div className="text-xs md:text-sm">
              <span className="font-medium">Showing:</span> {data?.data?.length ?? 0}
            </div>
          </div>

          <p className="text-xs md:text-sm text-muted-foreground mb-3 md:mb-4">
            Tap a row to view transfer details
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
            onRowSelect={(row) => setSelectedTransfer(row as Transfer | null)}
            selectedRowId={selectedTransfer?.id ?? null}
            isLoading={isLoading}
            isFetching={isFetching}
            getRowId={(row) => String(row.id)}
            sortBy={sortBy}
            sortOrder={sortOrder}
            onSort={handleSort}
            sortableColumns={['id', 'transfer_started_at']}
            mobileHiddenColumns={['call_id', 'transfer_type', 'transferred_to_phone_number', 'transfer_started_at']}
          />
        </div>
      </div>

      {/* Detail Dialog */}
      <DetailDialog
        open={selectedTransfer !== null}
        onClose={() => setSelectedTransfer(null)}
        onPrevious={handlePrevious}
        onNext={handleNext}
        hasPrevious={hasPrevious}
        hasNext={hasNext}
        title={
          <span className="flex items-center gap-2">
            <ArrowLeftRight className="h-5 w-5" />
            Transfer #{selectedTransfer?.id}
          </span>
        }
        subtitle={selectedTransfer?.transferred_to_name}
      >
        {selectedTransfer && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Badge variant={
                selectedTransfer.transfer_status === 'completed' ? 'default' :
                selectedTransfer.transfer_status === 'failed' ? 'destructive' : 'secondary'
              }>
                {selectedTransfer.transfer_status}
              </Badge>
              <Badge variant="outline">{selectedTransfer.transfer_type}</Badge>
            </div>

            {/* External Links */}
            {selectedTransfer.platform_call_id && (
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" asChild>
                  <a href={`https://dashboard.vapi.ai/calls/${selectedTransfer.platform_call_id}`} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                    VAPI Dashboard
                  </a>
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <a href={`https://helloounsil.sentry.io/explore/logs/?logsFields=timestamp&logsFields=correlation_id&logsFields=message&logsQuery=correlation_id%3A${selectedTransfer.platform_call_id}&logsSortBys=-timestamp`} target="_blank" rel="noopener noreferrer">
                    <Bug className="h-3.5 w-3.5 mr-1.5" />
                    Sentry Logs
                  </a>
                </Button>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div><strong>Type:</strong> {selectedTransfer.transfer_type}</div>
              <div><strong>Status:</strong> {selectedTransfer.transfer_status}</div>
              <div><strong>To:</strong> {selectedTransfer.transferred_to_name}</div>
              <div><strong>Phone:</strong> {selectedTransfer.transferred_to_phone_number}</div>
              <div><strong>Call ID:</strong> {selectedTransfer.call_id}</div>
              <div><strong>Started:</strong> {selectedTransfer.transfer_started_at || '-'}</div>
              <div><strong>Supervisor Answered:</strong> {selectedTransfer.supervisor_answered_at || '-'}</div>
              <div><strong>Time to Pickup:</strong> {selectedTransfer.time_to_pickup_seconds ? `${selectedTransfer.time_to_pickup_seconds}s` : '-'}</div>
              <div><strong>Supervisor Identity:</strong> {selectedTransfer.supervisor_identity || '-'}</div>
              <div><strong>Room:</strong> {selectedTransfer.consultation_room_name || '-'}</div>
            </div>

            {selectedTransfer.error_message && (
              <div className="p-3 bg-red-100 dark:bg-red-900/30 rounded text-red-600 dark:text-red-400">
                <strong>Error:</strong> {selectedTransfer.error_message}
              </div>
            )}
          </div>
        )}
      </DetailDialog>
    </div>
  );
}
