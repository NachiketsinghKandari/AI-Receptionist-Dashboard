'use client';

import { useState, useMemo } from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { Phone, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { CopyButton } from '@/components/ui/copy-button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { FilterSidebar } from '@/components/filters/filter-sidebar';
import { DataTable } from '@/components/tables/data-table';
import { DetailDialog } from '@/components/details/detail-dialog';
import { CallDetailPanel } from '@/components/details/call-detail-panel';
import { useCalls, useCallDetail } from '@/hooks/use-calls';
import { useDebounce } from '@/hooks/use-debounce';
import { DEFAULT_PAGE_LIMIT, DEFAULT_DAYS_BACK, CALL_TYPES, TRANSFER_TYPES } from '@/lib/constants';
import { formatDuration } from '@/lib/formatting';
import type { CallListItem } from '@/types/database';
import type { SortOrder } from '@/types/api';
import { format, subDays } from 'date-fns';

const columns: ColumnDef<CallListItem>[] = [
  {
    accessorKey: 'id',
    header: 'ID',
    cell: ({ row }) => <span className="font-mono text-sm">{row.getValue('id')}</span>,
  },
  {
    accessorKey: 'platform_call_id',
    header: 'Correlation ID',
    cell: ({ row }) => {
      const value = row.getValue('platform_call_id') as string | null;
      return value ? (
        <div className="flex items-center gap-1">
          <span className="font-mono text-xs truncate max-w-[100px]">{value}</span>
          <CopyButton value={value} />
        </div>
      ) : (
        <span className="text-muted-foreground">-</span>
      );
    },
  },
  {
    accessorKey: 'caller_name',
    header: 'Caller',
  },
  {
    accessorKey: 'phone_number',
    header: 'Phone',
    cell: ({ row }) => (
      <span className="font-mono text-sm">{row.getValue('phone_number')}</span>
    ),
  },
  {
    accessorKey: 'call_type',
    header: 'Type',
    cell: ({ row }) => {
      const type = row.getValue('call_type') as string;
      return <Badge variant="outline">{type}</Badge>;
    },
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => {
      const status = row.getValue('status') as string;
      const variant = status === 'completed' ? 'default' : 'secondary';
      return <Badge variant={variant}>{status}</Badge>;
    },
  },
  {
    accessorKey: 'started_at',
    header: 'Started',
    cell: ({ row }) => {
      const value = row.getValue('started_at') as string;
      return value ? format(new Date(value), 'yyyy-MM-dd HH:mm') : '-';
    },
  },
  {
    accessorKey: 'call_duration',
    header: 'Duration',
    cell: ({ row }) => formatDuration(row.getValue('call_duration')),
  },
];

export default function CallsPage() {
  // Filter state
  const [showAll, setShowAll] = useState(false);
  const [startDate, setStartDate] = useState(format(subDays(new Date(), DEFAULT_DAYS_BACK), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [search, setSearch] = useState('');
  const [firmId, setFirmId] = useState<number | null>(null);
  const [callType, setCallType] = useState('All');
  const [transferType, setTransferType] = useState('Off');
  const [multipleTransfers, setMultipleTransfers] = useState(false);
  const [limit, setLimit] = useState(DEFAULT_PAGE_LIMIT);
  const [offset, setOffset] = useState(0);
  const [selectedCallId, setSelectedCallId] = useState<number | null>(null);
  const [sortBy, setSortBy] = useState<string | null>('started_at');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  const debouncedSearch = useDebounce(search, 300);

  // Build filters
  const filters = useMemo(
    () => ({
      firmId,
      callType: callType !== 'All' ? callType : null,
      transferType: transferType !== 'Off' ? transferType : null,
      multipleTransfers,
      startDate: showAll ? null : `${startDate}T00:00:00`,
      endDate: showAll ? null : `${endDate}T23:59:59`,
      search: debouncedSearch || undefined,
      limit,
      offset,
      sortBy,
      sortOrder,
    }),
    [firmId, callType, transferType, multipleTransfers, startDate, endDate, showAll, debouncedSearch, limit, offset, sortBy, sortOrder]
  );

  // Handle column sorting
  const handleSort = (column: string) => {
    if (sortBy === column) {
      // Toggle order if same column
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      // New column, default to descending
      setSortBy(column);
      setSortOrder('desc');
    }
    setOffset(0); // Reset to first page when sorting changes
  };

  const { data, isLoading, isFetching } = useCalls(filters);

  const handleRowSelect = (row: CallListItem | null) => {
    setSelectedCallId(row?.id ?? null);
  };

  // Navigation logic for detail dialog
  const dataArray = data?.data ?? [];
  const currentIndex = selectedCallId !== null
    ? dataArray.findIndex(c => c.id === selectedCallId)
    : -1;
  const hasPrevious = currentIndex > 0;
  const hasNext = currentIndex >= 0 && currentIndex < dataArray.length - 1;

  const handlePrevious = () => {
    if (hasPrevious) setSelectedCallId(dataArray[currentIndex - 1].id);
  };
  const handleNext = () => {
    if (hasNext) setSelectedCallId(dataArray[currentIndex + 1].id);
  };

  return (
    <div className="flex h-full">
      {/* Filter Sidebar */}
      <FilterSidebar
        showAll={showAll}
        onShowAllChange={setShowAll}
        startDate={startDate}
        onStartDateChange={setStartDate}
        endDate={endDate}
        onEndDateChange={setEndDate}
        search={search}
        onSearchChange={setSearch}
        searchHelpText="ID, caller name, phone, correlation ID, summary"
        firmId={firmId}
        onFirmIdChange={setFirmId}
        limit={limit}
        onLimitChange={setLimit}
      >
        {/* Call Type Filter */}
        <div>
          <Label className="text-sm">Call Type</Label>
          <Select value={callType} onValueChange={setCallType}>
            <SelectTrigger className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CALL_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {type}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Transfer Type Filter */}
        <div>
          <Label className="text-sm">Transfer Type</Label>
          <Select value={transferType} onValueChange={setTransferType}>
            <SelectTrigger className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TRANSFER_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {type}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Multiple Transfers Filter */}
        <div className="flex items-center justify-between">
          <Label htmlFor="multiple-transfers" className="text-sm flex items-center gap-1.5">
            Multiple Transfers
            {multipleTransfers && isLoading && (
              <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
            )}
          </Label>
          <Switch
            id="multiple-transfers"
            checked={multipleTransfers}
            onCheckedChange={setMultipleTransfers}
          />
        </div>
      </FilterSidebar>

      {/* Main Content */}
      <div className="flex-1 flex flex-col p-6 overflow-hidden">
        {/* Header - fixed */}
        <div className="shrink-0">
          <h1 className="text-2xl font-bold mb-4 flex items-center gap-2">
            <Phone className="h-6 w-6" />
            Calls
          </h1>

          {/* Stats */}
          <div className="flex gap-4 mb-2">
            <div className="text-sm">
              <span className="font-medium">Total:</span> {data?.total ?? 0}
            </div>
            <div className="text-sm">
              <span className="font-medium">Showing:</span> {data?.data?.length ?? 0}
            </div>
          </div>

          <p className="text-sm text-muted-foreground mb-4">
            Click a row to view call details
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
            onRowSelect={handleRowSelect}
            selectedRowId={selectedCallId}
            isLoading={isLoading}
            isFetching={isFetching}
            getRowId={(row) => String(row.id)}
            sortBy={sortBy}
            sortOrder={sortOrder}
            onSort={handleSort}
            sortableColumns={['id', 'started_at', 'call_duration']}
          />
        </div>
      </div>

      {/* Detail Drawer */}
      <CallDetailDrawer
        callId={selectedCallId}
        onClose={() => setSelectedCallId(null)}
        onPrevious={handlePrevious}
        onNext={handleNext}
        hasPrevious={hasPrevious}
        hasNext={hasNext}
      />
    </div>
  );
}

function CallDetailDrawer({
  callId,
  onClose,
  onPrevious,
  onNext,
  hasPrevious,
  hasNext,
}: {
  callId: number | null;
  onClose: () => void;
  onPrevious: () => void;
  onNext: () => void;
  hasPrevious: boolean;
  hasNext: boolean;
}) {
  const { data } = useCallDetail(callId);
  const call = data?.call;

  return (
    <DetailDialog
      open={callId !== null}
      onClose={onClose}
      onPrevious={onPrevious}
      onNext={onNext}
      hasPrevious={hasPrevious}
      hasNext={hasNext}
      title={
        <span className="flex items-center gap-2">
          <Phone className="h-5 w-5" />
          Call #{callId}
        </span>
      }
      subtitle={call ? `${call.caller_name} - ${call.phone_number}` : undefined}
    >
      {callId && <CallDetailPanel callId={callId} />}
    </DetailDialog>
  );
}
