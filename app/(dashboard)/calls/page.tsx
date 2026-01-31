'use client';

import { useState, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { ColumnDef } from '@tanstack/react-table';
import { Phone, Loader2, Flag } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { CopyButton } from '@/components/ui/copy-button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { ResponsiveFilterSidebar } from '@/components/filters/responsive-filter-sidebar';
import type { DateFilterMode } from '@/components/filters/filter-sidebar';
import { DataTable } from '@/components/tables/data-table';
import { CallDetailSheet } from '@/components/details/call-detail-sheet';
import { CekuraStatus } from '@/components/cekura/cekura-status';
import { CekuraFeedback } from '@/components/cekura/cekura-feedback';
import { useCalls, useImportantCallIds, useTransferEmailMismatchIds } from '@/hooks/use-calls';
import { useFlaggedCalls } from '@/hooks/use-flagged-calls';
import { useSentryErrorCorrelationIds } from '@/hooks/use-sentry-events';
import { useCekuraCallMapping, type CekuraCallData } from '@/hooks/use-cekura';
import { useFirms } from '@/hooks/use-firms';
import { useDebounce } from '@/hooks/use-debounce';
import { DEFAULT_PAGE_LIMIT, DEFAULT_DAYS_BACK, CALL_TYPES, TRANSFER_TYPES } from '@/lib/constants';
import { formatDuration } from '@/lib/formatting';
import type { CallListItem, Firm } from '@/types/database';
import type { SortOrder, FlaggedCallListItem } from '@/types/api';
import type { HighlightReasons } from '@/components/details/call-detail-panel';
import { format, subDays } from 'date-fns';
import { getTodayRangeUTC, getYesterdayRangeUTC, getDateRangeUTC } from '@/lib/date-utils';

// Helper to create columns with error, important, mismatch, and Cekura state access
function createColumns(
  errorCorrelationIds: Set<string> | undefined,
  importantCallIds: Set<number> | undefined,
  transferMismatchIds: Set<number> | undefined,
  cekuraData: {
    calls: Map<string, CekuraCallData>;
    isLoading: boolean;
    isFullyLoaded: boolean;
    hasError: boolean;
  }
): ColumnDef<CallListItem>[] {
  return [
    {
      accessorKey: 'id',
      header: 'ID',
      cell: ({ row }) => <span className="font-mono text-[10px] md:text-sm">{row.getValue('id')}</span>,
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
      cell: ({ row }) => <span className="text-xs md:text-sm truncate max-w-[80px] md:max-w-none block">{row.getValue('caller_name')}</span>,
    },
    {
      accessorKey: 'call_duration',
      header: 'Duration',
      cell: ({ row }) => <span className="text-[10px] md:text-sm whitespace-nowrap">{formatDuration(row.getValue('call_duration'))}</span>,
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
      id: 'cekura_status',
      header: 'Cekura Status',
      cell: ({ row }) => {
        const correlationId = row.original.platform_call_id;
        const callData = correlationId ? cekuraData.calls.get(correlationId) : undefined;

        return (
          <CekuraStatus
            callData={callData}
            isLoading={cekuraData.isLoading}
            isFullyLoaded={cekuraData.isFullyLoaded}
            hasError={cekuraData.hasError}
          />
        );
      },
    },
    {
      id: 'feedback',
      header: 'Feedback',
      cell: ({ row }) => {
        const correlationId = row.original.platform_call_id;
        const callData = correlationId ? cekuraData.calls.get(correlationId) : undefined;

        return (
          <CekuraFeedback
            callData={callData}
            correlationId={correlationId}
            isLoading={cekuraData.isLoading}
            isFullyLoaded={cekuraData.isFullyLoaded}
          />
        );
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
      accessorKey: 'phone_number',
      header: 'Phone',
      cell: ({ row }) => (
        <span className="font-mono text-sm">{row.getValue('phone_number')}</span>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => {
        const status = row.getValue('status') as string;
        const callId = row.original.id;
        const correlationId = row.original.platform_call_id;
        const duration = row.original.call_duration;
        const hasError = correlationId && errorCorrelationIds?.has(correlationId);
        const isLongCall = duration !== null && duration > 300; // > 5 minutes
        const isImportant = importantCallIds?.has(callId);
        const hasTransferMismatch = transferMismatchIds?.has(callId);
        const variant = status === 'completed' ? 'default' : 'secondary';

        // Priority: Sentry error (red) > Transfer mismatch (yellow) > Long call / important (orange)
        let className = '';
        if (hasError) {
          className = 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800';
        } else if (hasTransferMismatch) {
          className = 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800';
        } else if (isLongCall || isImportant) {
          className = 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-800';
        }

        return (
          <Badge variant={variant} className={className}>
            {status}
          </Badge>
        );
      },
    },
  ];
}

export default function CallsPage() {
  const searchParams = useSearchParams();

  // Initialize flaggedOnly from URL param
  const [flaggedOnly, setFlaggedOnly] = useState(searchParams.get('flaggedOnly') === 'true');

  // Filter state
  const [dateFilterMode, setDateFilterMode] = useState<DateFilterMode>('today');
  const [startDate, setStartDate] = useState(format(subDays(new Date(), DEFAULT_DAYS_BACK), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [search, setSearch] = useState('');
  const [firmId, setFirmId] = useState<number | null>(null);
  const [callType, setCallType] = useState('All');
  const [transferType, setTransferType] = useState('Off');
  const [multipleTransfers, setMultipleTransfers] = useState(false);
  const [cekuraStatusFilter, setCekuraStatusFilter] = useState<'all' | 'success' | 'failure' | 'other'>('all');
  const [limit, setLimit] = useState(DEFAULT_PAGE_LIMIT);
  const [offset, setOffset] = useState(0);
  const [selectedCallId, setSelectedCallId] = useState<number | null>(null);
  const [highlightReasons, setHighlightReasons] = useState<HighlightReasons>({ sentry: false, duration: false, important: false, transferMismatch: false });
  const [sortBy, setSortBy] = useState<string | null>('started_at');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  const debouncedSearch = useDebounce(search, 300);

  // Firms for the grid filter
  const { data: firmsData } = useFirms();
  const firms = useMemo(() => [...(firmsData?.firms ?? [])].sort((a, b) => a.id - b.id), [firmsData]);

  // Update URL when flaggedOnly changes (without causing re-render loops)
  const handleFlaggedOnlyChange = (checked: boolean) => {
    setFlaggedOnly(checked);
    setOffset(0); // Reset pagination when toggling
    // Update URL without using router to avoid re-render loops
    const url = checked ? '/calls?flaggedOnly=true' : '/calls';
    window.history.replaceState(null, '', url);
  };

  // Compute effective date range based on filter mode
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

  // Fetch Cekura call data (progressive loading - recent day first, then full range)
  // This needs to be before callFilters so we can use it for Cekura status filtering
  const {
    data: cekuraCallsData,
    isLoading: cekuraIsLoading,
    isFullyLoaded: cekuraIsFullyLoaded,
    hasError: cekuraHasError,
  } = useCekuraCallMapping(
    effectiveDateRange.startDate,
    effectiveDateRange.endDate
  );

  // Compute correlation IDs to filter by based on Cekura status
  const cekuraFilteredCorrelationIds = useMemo(() => {
    if (cekuraStatusFilter === 'all' || !cekuraCallsData?.calls) {
      return null; // No filtering
    }

    const matchingIds: string[] = [];
    cekuraCallsData.calls.forEach((callData, correlationId) => {
      const status = callData.status?.toLowerCase() || '';
      if (cekuraStatusFilter === 'success' && (status === 'success' || status === 'completed')) {
        matchingIds.push(correlationId);
      } else if (cekuraStatusFilter === 'failure' && (status === 'failure' || status === 'failed' || status === 'error')) {
        matchingIds.push(correlationId);
      } else if (cekuraStatusFilter === 'other' &&
                 status !== 'success' && status !== 'completed' &&
                 status !== 'failure' && status !== 'failed' && status !== 'error') {
        matchingIds.push(correlationId);
      }
    });

    return matchingIds;
  }, [cekuraStatusFilter, cekuraCallsData]);

  // Date-only filters for total count (no other filters applied)
  const dateOnlyFilters = useMemo(
    () => ({
      startDate: effectiveDateRange.startDate,
      endDate: effectiveDateRange.endDate,
      limit: 1, // Only need count, not data
      offset: 0,
    }),
    [effectiveDateRange]
  );

  // Build filters for regular calls
  const callFilters = useMemo(
    () => ({
      firmId,
      callType: callType !== 'All' ? callType : null,
      transferType: transferType !== 'Off' ? transferType : null,
      multipleTransfers,
      startDate: effectiveDateRange.startDate,
      endDate: effectiveDateRange.endDate,
      search: debouncedSearch || undefined,
      limit,
      offset,
      sortBy,
      sortOrder,
      correlationIds: cekuraFilteredCorrelationIds,
    }),
    [firmId, callType, transferType, multipleTransfers, effectiveDateRange, debouncedSearch, limit, offset, sortBy, sortOrder, cekuraFilteredCorrelationIds]
  );

  // Build filters for flagged calls
  const flaggedFilters = useMemo(
    () => ({
      firmId,
      startDate: effectiveDateRange.startDate,
      endDate: effectiveDateRange.endDate,
      search: debouncedSearch || undefined,
      limit,
      offset,
      sortBy,
      sortOrder,
    }),
    [firmId, effectiveDateRange, debouncedSearch, limit, offset, sortBy, sortOrder]
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

  // Date-only count query (for "Total" display)
  const { data: dateOnlyData } = useCalls(dateOnlyFilters);

  // Use appropriate hook based on flaggedOnly mode
  const regularCallsQuery = useCalls(callFilters);
  const flaggedCallsQuery = useFlaggedCalls(flaggedFilters);

  // Select the active query based on mode
  const { data, isLoading, isFetching } = flaggedOnly ? flaggedCallsQuery : regularCallsQuery;

  // Fetch Sentry error correlation IDs (runs in background)
  const { data: errorCorrelationIds } = useSentryErrorCorrelationIds();

  // Fetch important call IDs (runs in background)
  const { data: importantCallIds } = useImportantCallIds();

  // Fetch transfer-email mismatch call IDs (runs in background)
  const { data: transferMismatchIds } = useTransferEmailMismatchIds();

  // Memoize Cekura data for columns
  const cekuraData = useMemo(() => ({
    calls: cekuraCallsData?.calls || new Map<string, CekuraCallData>(),
    isLoading: cekuraIsLoading,
    isFullyLoaded: cekuraIsFullyLoaded,
    hasError: cekuraHasError,
  }), [cekuraCallsData, cekuraIsLoading, cekuraIsFullyLoaded, cekuraHasError]);

  // Memoize columns with Sentry error, important call, mismatch, and Cekura data
  const columns = useMemo(
    () => createColumns(errorCorrelationIds, importantCallIds, transferMismatchIds, cekuraData),
    [errorCorrelationIds, importantCallIds, transferMismatchIds, cekuraData]
  );

  const handleRowSelect = (row: CallListItem | FlaggedCallListItem | null) => {
    if (row) {
      // Check if this is a flagged call with flagReasons attached
      const flaggedRow = row as FlaggedCallListItem;
      if (flaggedRow.flagReasons) {
        setHighlightReasons({
          sentry: flaggedRow.flagReasons.sentry,
          duration: flaggedRow.flagReasons.duration,
          important: flaggedRow.flagReasons.important,
          transferMismatch: flaggedRow.flagReasons.transferMismatch,
        });
      } else {
        // Compute highlight reasons for regular calls
        const correlationId = row.platform_call_id;
        const hasSentry = !!(correlationId && errorCorrelationIds?.has(correlationId));
        const hasDuration = row.call_duration !== null && row.call_duration > 300;
        const hasImportant = !!(importantCallIds?.has(row.id));
        const hasTransferMismatch = !!(transferMismatchIds?.has(row.id));

        setHighlightReasons({
          sentry: hasSentry,
          duration: hasDuration,
          important: hasImportant,
          transferMismatch: hasTransferMismatch,
        });
      }
    } else {
      setHighlightReasons({ sentry: false, duration: false, important: false, transferMismatch: false });
    }
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
      <ResponsiveFilterSidebar
        dateFilterMode={dateFilterMode}
        onDateFilterModeChange={setDateFilterMode}
        startDate={startDate}
        onStartDateChange={setStartDate}
        endDate={endDate}
        onEndDateChange={setEndDate}
        search={search}
        onSearchChange={setSearch}
        searchHelpText="ID, caller name, phone, correlation ID, summary"
        firmId={firmId}
        onFirmIdChange={setFirmId}
        hideFirmFilter={!flaggedOnly}
        limit={limit}
        onLimitChange={setLimit}
      >
        {/* Call-specific filters in compact 2x2 grid - only show when not in flagged mode */}
        {!flaggedOnly && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-sm">Firm</Label>
                <Select
                  value={firmId ? String(firmId) : 'all'}
                  onValueChange={(v) => setFirmId(v === 'all' ? null : parseInt(v))}
                >
                  <SelectTrigger className="mt-0.5 h-8 text-xs">
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Firms</SelectItem>
                    {firms.map((firm: Firm) => (
                      <SelectItem key={firm.id} value={String(firm.id)}>
                        {firm.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-sm">Call Type</Label>
                <Select value={callType} onValueChange={setCallType}>
                  <SelectTrigger className="mt-0.5 h-8 text-xs">
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
              <div>
                <Label className="text-sm">Transfer</Label>
                <Select value={transferType} onValueChange={setTransferType}>
                  <SelectTrigger className="mt-0.5 h-8 text-xs">
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
              <div>
                <Label className="text-sm">Cekura</Label>
                <Select
                  value={cekuraStatusFilter}
                  onValueChange={(v) => setCekuraStatusFilter(v as typeof cekuraStatusFilter)}
                >
                  <SelectTrigger className="mt-0.5 h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="success">Success</SelectItem>
                    <SelectItem value="failure">Failure</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Multiple Transfers - below grid */}
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
          </>
        )}

        {/* Flagged Only Filter */}
        <div className="flex items-center justify-between pt-2 border-t">
          <Label htmlFor="flagged-only" className="text-sm flex items-center gap-1.5">
            <Flag className="h-3.5 w-3.5 text-red-500" />
            Flagged Only
            {flaggedOnly && isLoading && (
              <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
            )}
          </Label>
          <Switch
            id="flagged-only"
            checked={flaggedOnly}
            onCheckedChange={handleFlaggedOnlyChange}
          />
        </div>
      </ResponsiveFilterSidebar>

      {/* Main Content */}
      <div className="flex-1 flex flex-col p-4 md:p-6 overflow-hidden">
        {/* Header - fixed */}
        <div className="shrink-0">
          <h1 className="text-xl md:text-2xl font-bold mb-3 md:mb-4 flex items-center gap-2">
            {flaggedOnly ? (
              <>
                <Flag className="h-5 w-5 md:h-6 md:w-6 text-red-500" />
                Flagged Calls
              </>
            ) : (
              <>
                <Phone className="h-5 w-5 md:h-6 md:w-6" />
                Calls
              </>
            )}
          </h1>

          {/* Stats */}
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
            {flaggedOnly
              ? 'Calls flagged by: Sentry errors, long duration (>5 min), important emails, or transfer mismatches'
              : 'Tap a row to view call details'}
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
            isLoading={isLoading || cekuraIsLoading}
            isFetching={isFetching}
            getRowId={(row) => String(row.id)}
            sortBy={sortBy}
            sortOrder={sortOrder}
            onSort={handleSort}
            sortableColumns={['id', 'started_at', 'call_duration']}
            mobileHiddenColumns={['platform_call_id', 'call_type', 'status', 'feedback', 'started_at', 'phone_number']}
          />
        </div>
      </div>

      {/* Detail Sheet - Two-panel resizable layout */}
      <CallDetailSheet
        callId={selectedCallId}
        highlightReasons={highlightReasons}
        onClose={() => setSelectedCallId(null)}
        onPrevious={handlePrevious}
        onNext={handleNext}
        hasPrevious={hasPrevious}
        hasNext={hasNext}
        dateRange={{
          startDate: effectiveDateRange.startDate ? `${effectiveDateRange.startDate.split('T')[0]}T00:00:00Z` : null,
          endDate: effectiveDateRange.endDate ? `${effectiveDateRange.endDate.split('T')[0]}T23:59:59Z` : null,
        }}
      />
    </div>
  );
}
