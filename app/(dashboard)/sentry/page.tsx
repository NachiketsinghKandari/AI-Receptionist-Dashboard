'use client';

import { useState, useMemo } from 'react';
import { ColumnDef } from '@tanstack/react-table';
import {
  Bug,
  ChevronDown,
  AlertCircle,
  AlertTriangle,
  Info,
  ArrowLeftRight,
  Webhook as WebhookIcon,
  Search,
  MessageSquare,
  Calendar,
  HelpCircle,
  ExternalLink,
  RefreshCw,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CopyButton } from '@/components/ui/copy-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { DataTable } from '@/components/tables/data-table';
import { DetailDialog } from '@/components/details/detail-dialog';
import { useSentryBrowse, type SentryGroupedSummary, type SentryParsedEvent } from '@/hooks/use-sentry-events';
import { useDebounce } from '@/hooks/use-debounce';
import { format } from 'date-fns';

const EVENT_TYPES = ['All', 'transfer', 'webhook', 'search_case', 'take_message', 'schedule_callback'];
const LEVELS = ['All', 'error', 'warning', 'info', 'debug'];
const TIME_PERIODS = [
  { value: '24h', label: 'Last 24 hours' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
];
const SENTRY_ENVS = [
  { value: 'production', label: 'Production' },
  { value: 'pre-prod', label: 'Pre-Prod' },
  { value: 'stage', label: 'Stage' },
  { value: 'develop', label: 'Develop' },
  { value: 'development', label: 'Development' },
];

function getLevelIcon(level: string) {
  switch (level) {
    case 'error':
      return <AlertCircle className="h-4 w-4 text-red-500" />;
    case 'warning':
      return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
    default:
      return <Info className="h-4 w-4 text-blue-500" />;
  }
}

function getTypeIcon(type: string) {
  switch (type) {
    case 'transfer':
      return <ArrowLeftRight className="h-4 w-4" />;
    case 'webhook':
      return <WebhookIcon className="h-4 w-4" />;
    case 'search_case':
      return <Search className="h-4 w-4" />;
    case 'take_message':
      return <MessageSquare className="h-4 w-4" />;
    case 'schedule_callback':
      return <Calendar className="h-4 w-4" />;
    default:
      return <HelpCircle className="h-4 w-4" />;
  }
}

function getLevelBadgeVariant(level: string): 'default' | 'destructive' | 'secondary' {
  if (level === 'error') return 'destructive';
  if (level === 'warning') return 'default';
  return 'secondary';
}

const columns: ColumnDef<SentryGroupedSummary>[] = [
  {
    accessorKey: 'call_id',
    header: 'Call ID',
    cell: ({ row }) => {
      const value = row.getValue('call_id') as number | null;
      return value ? <span className="font-mono text-sm">{value}</span> : <span className="text-muted-foreground">-</span>;
    },
  },
  {
    accessorKey: 'correlation_id',
    header: 'Correlation ID',
    cell: ({ row }) => {
      const value = row.getValue('correlation_id') as string;
      return (
        <div className="flex items-center gap-1">
          <span className="font-mono text-xs truncate max-w-[120px]">{value}</span>
          <CopyButton value={value} />
        </div>
      );
    },
  },
  {
    accessorKey: 'event_count',
    header: 'Events',
    cell: ({ row }) => <Badge variant="outline">{row.getValue('event_count')}</Badge>,
  },
  {
    accessorKey: 'level',
    header: 'Level',
    cell: ({ row }) => {
      const level = row.getValue('level') as string;
      return (
        <div className="flex items-center gap-1.5">
          {getLevelIcon(level)}
          <Badge variant={getLevelBadgeVariant(level)}>{level}</Badge>
        </div>
      );
    },
  },
  {
    accessorKey: 'types',
    header: 'Types',
    cell: ({ row }) => <span className="text-sm">{row.getValue('types')}</span>,
  },
  {
    accessorKey: 'last_timestamp',
    header: 'Last Event',
    cell: ({ row }) => {
      const value = row.getValue('last_timestamp') as string;
      if (!value) return '-';
      try {
        return format(new Date(value), 'yyyy-MM-dd HH:mm:ss');
      } catch {
        return value;
      }
    },
  },
];

// Extract message up to the second colon for a cleaner preview
function getMessagePreview(message: string): string {
  let colonCount = 0;
  for (let i = 0; i < message.length; i++) {
    if (message[i] === ':') {
      colonCount++;
      if (colonCount === 2) {
        return message.slice(0, i + 1).trim();
      }
    }
  }
  // If less than 2 colons, return the whole message (truncated)
  return message.slice(0, 60);
}

function EventCard({ event }: { event: SentryParsedEvent }) {
  const [isOpen, setIsOpen] = useState(false);

  const timeStr = event.timestamp
    ? format(new Date(event.timestamp), 'HH:mm:ss')
    : '';

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="ghost" className="w-full justify-between p-3 h-auto text-left">
          <span className="flex items-center gap-2 truncate">
            {getLevelIcon(event.level)}
            <span className="text-muted-foreground text-xs">{timeStr}</span>
            {getTypeIcon(event.event_type)}
            <span className="truncate">{getMessagePreview(event.message)}</span>
          </span>
          <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="p-3 bg-muted/30 rounded-md space-y-3">
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div><strong>Level:</strong> {event.level}</div>
          <div><strong>Type:</strong> {event.event_type}</div>
          <div><strong>Time:</strong> {event.timestamp}</div>
          <div><strong>Environment:</strong> {event.environment || '-'}</div>
          <div><strong>Logger:</strong> {event.logger || '-'}</div>
          <div><strong>Event ID:</strong> {event.event_id.slice(0, 12)}...</div>
        </div>

        {event.transaction && (
          <div>
            <strong>Endpoint:</strong>
            <code className="ml-2 p-1 bg-background rounded text-sm">{event.transaction}</code>
          </div>
        )}

        <div>
          <strong>Message:</strong>
          <pre className="mt-1 p-2 bg-background rounded text-sm whitespace-pre-wrap max-h-40 overflow-auto">
            {event.message}
          </pre>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export default function SentryPage() {
  const [eventType, setEventType] = useState('All');
  const [level, setLevel] = useState('error'); // Default to errors
  const [statsPeriod, setStatsPeriod] = useState('30d'); // Default to 30 days
  const [sentryEnv, setSentryEnv] = useState('production'); // Default to production
  const [search, setSearch] = useState('');
  const [selectedCorrelationId, setSelectedCorrelationId] = useState<string | null>(null);

  const debouncedSearch = useDebounce(search, 300);

  const filters = useMemo(() => ({
    eventType: eventType !== 'All' ? eventType : null,
    level: level !== 'All' ? level : null,
    search: debouncedSearch || null,
    statsPeriod,
    sentryEnv,
  }), [eventType, level, debouncedSearch, statsPeriod, sentryEnv]);

  const {
    data: pagesData,
    isLoading,
    refetch,
    isFetching,
  } = useSentryBrowse(filters);

  // Process data from the query
  const accumulatedData = useMemo(() => {
    if (!pagesData) return null;

    return {
      summary: pagesData.summary,
      groups: pagesData.groups,
      totalEvents: pagesData.totalEvents,
    };
  }, [pagesData]);

  const selectedGroup = selectedCorrelationId && accumulatedData?.groups
    ? accumulatedData.groups[selectedCorrelationId] || []
    : [];

  const selectedSummary = selectedCorrelationId && accumulatedData?.summary
    ? accumulatedData.summary.find((s: SentryGroupedSummary) => s.correlation_id === selectedCorrelationId)
    : null;

  const handleRowSelect = (row: SentryGroupedSummary | null) => {
    setSelectedCorrelationId(row?.correlation_id ?? null);
  };

  // Navigation logic for detail dialog
  const dataArray = accumulatedData?.summary ?? [];
  const currentIndex = selectedCorrelationId !== null
    ? dataArray.findIndex((s: SentryGroupedSummary) => s.correlation_id === selectedCorrelationId)
    : -1;
  const hasPrevious = currentIndex > 0;
  const hasNext = currentIndex >= 0 && currentIndex < dataArray.length - 1;

  const handlePrevious = () => {
    if (hasPrevious) setSelectedCorrelationId(dataArray[currentIndex - 1].correlation_id);
  };
  const handleNext = () => {
    if (hasNext) setSelectedCorrelationId(dataArray[currentIndex + 1].correlation_id);
  };

  const sentryExplorerUrl = selectedCorrelationId
    ? `https://helloounsil.sentry.io/explore/logs/?environment=${sentryEnv}&logsFields=timestamp&logsFields=correlation_id&logsFields=message&logsQuery=correlation_id%3A${selectedCorrelationId}&logsSortBys=-timestamp`
    : null;

  return (
    <div className="h-full flex flex-col p-6 overflow-hidden">
      {/* Header - fixed */}
      <div className="shrink-0 space-y-4">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Bug className="h-6 w-6" />
          Sentry Events
        </h1>

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
              {/* Search */}
              <div className="lg:col-span-2">
                <Label htmlFor="search" className="text-sm flex items-center gap-1.5">
                  <Search className="h-3.5 w-3.5" />
                  Search
                </Label>
                <Input
                  id="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search correlation ID, call ID, message..."
                  className="mt-1"
                />
              </div>

              {/* Event Type */}
              <div>
                <Label className="text-sm">Event Type</Label>
                <Select value={eventType} onValueChange={setEventType}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EVENT_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Level */}
              <div>
                <Label className="text-sm">Level</Label>
                <Select value={level} onValueChange={setLevel}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LEVELS.map((l) => (
                      <SelectItem key={l} value={l}>
                        {l}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Time Period */}
              <div>
                <Label className="text-sm">Time Period</Label>
                <Select value={statsPeriod} onValueChange={setStatsPeriod}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIME_PERIODS.map((period) => (
                      <SelectItem key={period.value} value={period.value}>
                        {period.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Sentry Environment */}
              <div>
                <Label className="text-sm">Environment</Label>
                <Select value={sentryEnv} onValueChange={setSentryEnv}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SENTRY_ENVS.map((env) => (
                      <SelectItem key={env.value} value={env.value}>
                        {env.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Metrics */}
        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Total Events</p>
              <p className="text-2xl font-bold">{accumulatedData?.totalEvents ?? 0}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Unique Calls</p>
              <p className="text-2xl font-bold">{accumulatedData?.summary?.length ?? 0}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Mapped to DB</p>
              <p className="text-2xl font-bold">
                {accumulatedData?.summary?.filter((s: SentryGroupedSummary) => s.call_id !== null).length ?? 0}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Table Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Summary by Call</h2>
            <p className="text-sm text-muted-foreground">Click a row to view events</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Summary Table - scrollable */}
      <div className="flex-1 min-h-0 mt-4 flex flex-col">
        <div className="flex-1 min-h-0">
          {isLoading ? (
            <Skeleton className="h-full" />
          ) : (
            <DataTable
              columns={columns}
              data={accumulatedData?.summary ?? []}
              total={accumulatedData?.summary?.length ?? 0}
              offset={0}
              limit={accumulatedData?.summary?.length ?? 0}
              onOffsetChange={() => {}}
              onRowSelect={handleRowSelect}
              selectedRowId={selectedCorrelationId}
              isLoading={isLoading}
              getRowId={(row) => row.correlation_id}
            />
          )}
        </div>

      </div>

      {/* Detail Dialog */}
      <DetailDialog
        open={selectedCorrelationId !== null}
        onClose={() => setSelectedCorrelationId(null)}
        onPrevious={handlePrevious}
        onNext={handleNext}
        hasPrevious={hasPrevious}
        hasNext={hasNext}
        title={
          <span className="flex items-center gap-2">
            <Bug className="h-5 w-5" />
            Events for {selectedSummary?.call_id ? `Call #${selectedSummary.call_id}` : 'Call'}
          </span>
        }
        subtitle={selectedCorrelationId ? `Correlation ID: ${selectedCorrelationId}` : undefined}
      >
        {selectedCorrelationId && (
          <div className="space-y-4">
            {/* Correlation ID with copy */}
            <div className="flex items-center gap-2 text-sm">
              <strong>Correlation ID:</strong>
              <span className="font-mono text-xs">{selectedCorrelationId}</span>
              <CopyButton value={selectedCorrelationId} />
            </div>

            {/* Sentry Explorer Link */}
            {sentryExplorerUrl && (
              <a
                href={sentryExplorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-blue-500 hover:underline text-sm"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                View all logs in Sentry Explorer
              </a>
            )}

            {/* Summary */}
            {selectedSummary && (
              <div className="grid grid-cols-2 gap-2 text-sm p-3 bg-muted/30 rounded-md">
                <div><strong>Call ID:</strong> {selectedSummary.call_id ?? 'Not mapped'}</div>
                <div><strong>Events:</strong> {selectedSummary.event_count}</div>
                <div className="flex items-center gap-1">
                  <strong>Level:</strong>
                  {getLevelIcon(selectedSummary.level)}
                  {selectedSummary.level}
                </div>
                <div><strong>Types:</strong> {selectedSummary.types}</div>
              </div>
            )}

            {/* Events List */}
            <div>
              <h4 className="font-medium mb-2">Events ({selectedGroup.length})</h4>
              {selectedGroup.length > 0 ? (
                <div className="space-y-1">
                  {selectedGroup
                    .sort((a: SentryParsedEvent, b: SentryParsedEvent) => b.timestamp.localeCompare(a.timestamp))
                    .map((event: SentryParsedEvent) => (
                      <EventCard key={event.event_id} event={event} />
                    ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No events found.</p>
              )}
            </div>
          </div>
        )}
      </DetailDialog>
    </div>
  );
}
