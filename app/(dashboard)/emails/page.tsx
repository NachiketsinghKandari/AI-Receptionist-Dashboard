'use client';

import { useState, useMemo } from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { Mail } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ResponsiveFilterSidebar } from '@/components/filters/responsive-filter-sidebar';
import { DataTable } from '@/components/tables/data-table';
import { DetailDialog } from '@/components/details/detail-dialog';
import { useEmails } from '@/hooks/use-emails';
import { useDebounce } from '@/hooks/use-debounce';
import { DEFAULT_PAGE_LIMIT } from '@/lib/constants';
import { useDateFilter } from '@/components/providers/date-filter-provider';
import type { Email } from '@/types/database';
import { EmailBodyDisplay } from '@/components/email/email-body-display';
import { RecipientsDisplay } from '@/components/email/recipients-display';
import type { SortOrder, DynamicFilter } from '@/types/api';
import { format } from 'date-fns';
import { getTodayRangeUTC, getYesterdayRangeUTC, getDateRangeUTC } from '@/lib/date-utils';
import { DynamicFilterBuilder, type FilterRow, conditionRequiresValue } from '@/components/filters/dynamic-filter-builder';
import { EMAIL_FILTER_FIELDS } from '@/lib/filter-fields';

const columns: ColumnDef<Email>[] = [
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
    accessorKey: 'email_type',
    header: 'Type',
    cell: ({ row }) => <Badge variant="outline">{row.getValue('email_type')}</Badge>,
  },
  {
    accessorKey: 'subject',
    header: 'Subject',
    cell: ({ row }) => (
      <span className="truncate max-w-[200px] block">{row.getValue('subject')}</span>
    ),
  },
  {
    accessorKey: 'recipients',
    header: 'Recipients',
    cell: ({ row }) => {
      const recipients = row.getValue('recipients') as string[];
      return (
        <div className="max-w-[180px]">
          <RecipientsDisplay recipients={recipients} compact className="text-sm" />
        </div>
      );
    },
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => {
      const status = row.getValue('status') as string;
      const subject = row.original.subject;
      const isImportant = subject?.includes('[Important]');
      const variant = status === 'sent' ? 'default' : 'destructive';

      return (
        <Badge
          variant={variant}
          className={isImportant ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-800' : ''}
        >
          {status}
        </Badge>
      );
    },
  },
  {
    accessorKey: 'sent_at',
    header: 'Sent At',
    cell: ({ row }) => {
      const value = row.getValue('sent_at') as string;
      return value ? format(new Date(value), 'yyyy-MM-dd HH:mm') : '-';
    },
  },
];

export default function EmailsPage() {
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
  const [limit, setLimit] = useState(DEFAULT_PAGE_LIMIT);
  const [offset, setOffset] = useState(0);
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
  const [sortBy, setSortBy] = useState<string | null>('sent_at');
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

  const filters = useMemo(
    () => ({
      firmId: effectiveFirmId,
      callId: extractedFilters.callId,
      startDate: effectiveDateRange.startDate,
      endDate: effectiveDateRange.endDate,
      search: debouncedSearch || undefined,
      limit,
      offset,
      sortBy,
      sortOrder,
      dynamicFilters: extractedFilters.standardFilters,
    }),
    [effectiveFirmId, extractedFilters.callId, extractedFilters.standardFilters, effectiveDateRange.startDate, effectiveDateRange.endDate, debouncedSearch, limit, offset, sortBy, sortOrder]
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
  const { data: dateOnlyData } = useEmails(dateOnlyFilters);

  const { data, isLoading, isFetching } = useEmails(filters);

  // Navigation logic for detail dialog
  const dataArray = data?.data ?? [];
  const currentIndex = selectedEmail
    ? dataArray.findIndex(e => e.id === selectedEmail.id)
    : -1;
  const hasPrevious = currentIndex > 0;
  const hasNext = currentIndex >= 0 && currentIndex < dataArray.length - 1;

  const handlePrevious = () => {
    if (hasPrevious) setSelectedEmail(dataArray[currentIndex - 1]);
  };
  const handleNext = () => {
    if (hasNext) setSelectedEmail(dataArray[currentIndex + 1]);
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
        searchHelpText="ID, call ID, subject, type, status"
        firmId={firmId}
        onFirmIdChange={setFirmId}
        limit={limit}
        onLimitChange={setLimit}
        headerAction={
          <DynamicFilterBuilder
            fields={EMAIL_FILTER_FIELDS}
            filters={dynamicFilters}
            onFiltersChange={setDynamicFilters}
            onApply={() => setOffset(0)}
          />
        }
      />

      <div className="flex-1 flex flex-col p-4 md:p-6 overflow-hidden">
        {/* Header - fixed */}
        <div className="shrink-0">
          <h1 className="text-xl md:text-2xl font-bold mb-3 md:mb-4 flex items-center gap-2">
            <Mail className="h-5 w-5 md:h-6 md:w-6" />
            Emails
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
            Tap a row to view email details
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
            onRowSelect={(row) => setSelectedEmail(row as Email | null)}
            selectedRowId={selectedEmail?.id ?? null}
            isLoading={isLoading}
            isFetching={isFetching}
            getRowId={(row) => String(row.id)}
            sortBy={sortBy}
            sortOrder={sortOrder}
            onSort={handleSort}
            sortableColumns={['id', 'sent_at']}
            mobileHiddenColumns={['call_id', 'email_type', 'recipients', 'sent_at']}
          />
        </div>
      </div>

      {/* Detail Dialog */}
      <DetailDialog
        open={selectedEmail !== null}
        onClose={() => setSelectedEmail(null)}
        onPrevious={handlePrevious}
        onNext={handleNext}
        hasPrevious={hasPrevious}
        hasNext={hasNext}
        title={
          <span className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Email #{selectedEmail?.id}
          </span>
        }
        subtitle={selectedEmail?.subject}
      >
        {selectedEmail && (
          <div className="space-y-4">
            {/* Status badges */}
            <div className="flex items-center gap-2">
              <Badge>{selectedEmail.status}</Badge>
              <Badge variant="outline">{selectedEmail.email_type}</Badge>
            </div>

            {/* Email Header Card */}
            <Card>
              <CardContent className="p-4 space-y-3">
                {/* Subject as prominent title */}
                <h3 className="text-lg font-semibold border-b pb-2">
                  {selectedEmail.subject}
                </h3>

                {/* Email metadata in stacked format (like Gmail) */}
                <div className="space-y-1.5 text-sm">
                  <div className="flex">
                    <span className="w-16 text-muted-foreground font-medium shrink-0">To:</span>
                    <div className="flex-1">
                      <RecipientsDisplay recipients={selectedEmail.recipients} />
                    </div>
                  </div>
                  <div className="flex">
                    <span className="w-16 text-muted-foreground font-medium shrink-0">Date:</span>
                    <span className="flex-1">
                      {selectedEmail.sent_at
                        ? format(new Date(selectedEmail.sent_at), 'PPpp')
                        : '-'}
                    </span>
                  </div>
                  <div className="flex">
                    <span className="w-16 text-muted-foreground font-medium shrink-0">Type:</span>
                    <span className="flex-1">{selectedEmail.email_type}</span>
                  </div>
                  <div className="flex">
                    <span className="w-16 text-muted-foreground font-medium shrink-0">Call:</span>
                    <span className="flex-1 font-mono">#{selectedEmail.call_id}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Email Body Card */}
            {selectedEmail.body && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Message</CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <EmailBodyDisplay body={selectedEmail.body} />
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </DetailDialog>
    </div>
  );
}
