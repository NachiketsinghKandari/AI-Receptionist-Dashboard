'use client';

import { useState, useMemo } from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { Mail } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FilterSidebar } from '@/components/filters/filter-sidebar';
import { DataTable } from '@/components/tables/data-table';
import { DetailDialog } from '@/components/details/detail-dialog';
import { useEmails } from '@/hooks/use-emails';
import { useDebounce } from '@/hooks/use-debounce';
import { DEFAULT_PAGE_LIMIT, DEFAULT_DAYS_BACK } from '@/lib/constants';
import type { Email } from '@/types/database';
import type { SortOrder } from '@/types/api';
import { format, subDays } from 'date-fns';

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
        <span className="truncate max-w-[150px] block">
          {Array.isArray(recipients) ? recipients.join(', ') : recipients}
        </span>
      );
    },
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => {
      const status = row.getValue('status') as string;
      const variant = status === 'sent' ? 'default' : 'destructive';
      return <Badge variant={variant}>{status}</Badge>;
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
  const [showAll, setShowAll] = useState(false);
  const [startDate, setStartDate] = useState(format(subDays(new Date(), DEFAULT_DAYS_BACK), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [search, setSearch] = useState('');
  const [firmId, setFirmId] = useState<number | null>(null);
  const [limit, setLimit] = useState(DEFAULT_PAGE_LIMIT);
  const [offset, setOffset] = useState(0);
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
  const [sortBy, setSortBy] = useState<string | null>('sent_at');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  const debouncedSearch = useDebounce(search, 300);

  const filters = useMemo(
    () => ({
      firmId,
      startDate: showAll ? null : `${startDate}T00:00:00`,
      endDate: showAll ? null : `${endDate}T23:59:59`,
      search: debouncedSearch || undefined,
      limit,
      offset,
      sortBy,
      sortOrder,
    }),
    [firmId, startDate, endDate, showAll, debouncedSearch, limit, offset, sortBy, sortOrder]
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

  const { data, isLoading } = useEmails(filters);

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
      <FilterSidebar
        showAll={showAll}
        onShowAllChange={setShowAll}
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
      />

      <div className="flex-1 flex flex-col p-6 overflow-hidden">
        {/* Header - fixed */}
        <div className="shrink-0">
          <h1 className="text-2xl font-bold mb-4 flex items-center gap-2">
            <Mail className="h-6 w-6" />
            Emails
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
            Click a row to view email details
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
            getRowId={(row) => String(row.id)}
            sortBy={sortBy}
            sortOrder={sortOrder}
            onSort={handleSort}
            sortableColumns={['id', 'sent_at']}
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
                    <span className="flex-1">
                      {Array.isArray(selectedEmail.recipients)
                        ? selectedEmail.recipients.join(', ')
                        : selectedEmail.recipients}
                    </span>
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
                  <div className="bg-muted/30 rounded-md p-4 border border-border/50">
                    <div
                      className="max-w-2xl text-sm leading-relaxed space-y-3
                        [&_p]:mb-3
                        [&_a]:text-primary [&_a]:underline [&_a]:hover:text-primary/80
                        [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1
                        [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:space-y-1
                        [&_li]:text-foreground
                        [&_h1]:text-lg [&_h1]:font-bold [&_h1]:mb-2
                        [&_h2]:text-base [&_h2]:font-semibold [&_h2]:mb-2
                        [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mb-1
                        [&_strong]:font-semibold
                        [&_em]:italic
                        [&_blockquote]:border-l-2 [&_blockquote]:border-muted-foreground/30 [&_blockquote]:pl-3 [&_blockquote]:italic [&_blockquote]:text-muted-foreground
                        [&_hr]:border-border [&_hr]:my-4
                        [&_pre]:bg-muted [&_pre]:p-2 [&_pre]:rounded [&_pre]:overflow-auto [&_pre]:text-xs
                        [&_code]:bg-muted [&_code]:px-1 [&_code]:rounded [&_code]:text-xs"
                      dangerouslySetInnerHTML={{ __html: selectedEmail.body }}
                    />
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </DetailDialog>
    </div>
  );
}
