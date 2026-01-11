'use client';

import { useState, useMemo } from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { ArrowLeftRight, ExternalLink, Bug } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FilterSidebar } from '@/components/filters/filter-sidebar';
import { DataTable } from '@/components/tables/data-table';
import { DetailDialog } from '@/components/details/detail-dialog';
import { useTransfers } from '@/hooks/use-transfers';
import { useDebounce } from '@/hooks/use-debounce';
import { DEFAULT_PAGE_LIMIT, DEFAULT_DAYS_BACK, TRANSFER_STATUSES } from '@/lib/constants';
import type { Transfer } from '@/types/database';
import type { SortOrder } from '@/types/api';
import { format, subDays } from 'date-fns';

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
  const [showAll, setShowAll] = useState(false);
  const [startDate, setStartDate] = useState(format(subDays(new Date(), DEFAULT_DAYS_BACK), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [search, setSearch] = useState('');
  const [firmId, setFirmId] = useState<number | null>(null);
  const [status, setStatus] = useState('All');
  const [limit, setLimit] = useState(DEFAULT_PAGE_LIMIT);
  const [offset, setOffset] = useState(0);
  const [selectedTransfer, setSelectedTransfer] = useState<Transfer | null>(null);
  const [sortBy, setSortBy] = useState<string | null>('transfer_started_at');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  const debouncedSearch = useDebounce(search, 300);

  const filters = useMemo(
    () => ({
      firmId,
      status: status !== 'All' ? status : null,
      startDate: showAll ? null : `${startDate}T00:00:00`,
      endDate: showAll ? null : `${endDate}T23:59:59`,
      search: debouncedSearch || undefined,
      limit,
      offset,
      sortBy,
      sortOrder,
    }),
    [firmId, status, startDate, endDate, showAll, debouncedSearch, limit, offset, sortBy, sortOrder]
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

  const { data, isLoading } = useTransfers(filters);

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
      <FilterSidebar
        showAll={showAll}
        onShowAllChange={setShowAll}
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
      </FilterSidebar>

      <div className="flex-1 flex flex-col p-6 overflow-hidden">
        {/* Header - fixed */}
        <div className="shrink-0">
          <h1 className="text-2xl font-bold mb-4 flex items-center gap-2">
            <ArrowLeftRight className="h-6 w-6" />
            Transfers
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
            Click a row to view transfer details
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
            getRowId={(row) => String(row.id)}
            sortBy={sortBy}
            sortOrder={sortOrder}
            onSort={handleSort}
            sortableColumns={['id', 'transfer_started_at']}
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

            <div className="grid grid-cols-2 gap-4 text-sm">
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
