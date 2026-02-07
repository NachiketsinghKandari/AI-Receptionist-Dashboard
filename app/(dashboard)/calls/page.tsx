'use client';

import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useEnvironment } from '@/components/providers/environment-provider';
import { useSyncEnvironmentFromUrl } from '@/hooks/use-sync-environment';
import { ColumnDef } from '@tanstack/react-table';
import { Phone, Loader2, Flag, RotateCcw, Share2, Check } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CopyButton } from '@/components/ui/copy-button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { ResponsiveFilterSidebar } from '@/components/filters/responsive-filter-sidebar';
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
import { DEFAULT_PAGE_LIMIT, CALL_TYPES, TRANSFER_TYPES } from '@/lib/constants';
import { useDateFilter } from '@/components/providers/date-filter-provider';
import { formatDuration, formatUTCTimestamp } from '@/lib/formatting';
import type { CallListItem, Firm } from '@/types/database';
import type { SortOrder, FlaggedCallListItem } from '@/types/api';
import type { HighlightReasons } from '@/components/details/call-detail-panel';
import { getTodayRangeUTC, getYesterdayRangeUTC, getDateRangeUTC } from '@/lib/date-utils';
import { DynamicFilterBuilder, type FilterRow, conditionRequiresValue } from '@/components/filters/dynamic-filter-builder';
import { CALL_FILTER_FIELDS } from '@/lib/filter-fields';
import type { DynamicFilter } from '@/types/api';

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
      header: 'Corr. ID',
      cell: ({ row }) => {
        const value = row.getValue('platform_call_id') as string | null;
        return value ? <CopyButton value={value} /> : <span className="text-muted-foreground">-</span>;
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
      header: 'Started (UTC)',
      cell: ({ row }) => {
        const value = row.getValue('started_at') as string;
        return formatUTCTimestamp(value);
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
  const router = useRouter();
  const { environment } = useEnvironment();

  // === Sync environment from URL (e.g., shared links from a different environment) ===
  useSyncEnvironmentFromUrl(searchParams.get('e'));

  // === URL Parameter Parsing (supports both compressed and legacy formats) ===
  const urlFilters = useMemo(() => {
    // Check for compressed state param first
    const hasCompressed = searchParams.has('s');

    if (hasCompressed) {
      // Use dynamic import for the parser (it's only needed for shared URLs)
      // For now, parse inline since we need it synchronously
      const compressed = searchParams.get('s');
      if (compressed) {
        try {
          // Import lz-string synchronously (it's small)
          const { decompressFromEncodedURIComponent } = require('lz-string');
          const decompressed = decompressFromEncodedURIComponent(compressed);
          if (decompressed) {
            const state = JSON.parse(decompressed);
            const firmIdParam = searchParams.get('f');
            const parsedFirmId = firmIdParam ? parseInt(firmIdParam, 10) : 0;

            return {
              flaggedOnly: !!state.fo,
              correlationId: searchParams.get('c') || null,
              firmId: parsedFirmId === 0 ? null : parsedFirmId,
              search: state.q || '',
              callType: state.ct || 'All',
              transferType: state.tt || 'Off',
              multipleTransfers: !!state.mt,
              cekuraStatus: (state.ck || 'all') as 'all' | 'success' | 'failure' | 'other',
              sortBy: state.sb || 'started_at',
              sortOrder: (state.so || 'desc') as SortOrder,
              offset: state.o || 0,
              limit: state.l || DEFAULT_PAGE_LIMIT,
              dynamicFilters: state.df ? state.df.map((f: { f: string; c: string; v: string; x?: number }, i: number) => ({
                id: String(i + 1),
                field: f.f,
                condition: f.c,
                value: f.v,
                combinator: f.x ? 'or' : 'and',
              })) : [] as FilterRow[],
              dateMode: state.dm as 'today' | 'yesterday' | 'custom' | 'all' | null,
              startDate: state.sd || null,
              endDate: state.ed || null,
            };
          }
        } catch {
          // Fall through to legacy parsing
        }
      }
    }

    // Legacy format parsing
    const firmIdParam = searchParams.get('f') || searchParams.get('firm_id');
    const parsedFirmId = firmIdParam ? parseInt(firmIdParam, 10) : null;

    // Parse dynamic filters from URL
    let parsedDynamicFilters: FilterRow[] = [];
    const filtersParam = searchParams.get('filters');
    if (filtersParam) {
      try {
        parsedDynamicFilters = JSON.parse(decodeURIComponent(filtersParam));
      } catch {
        // Invalid JSON, ignore
      }
    }

    return {
      flaggedOnly: searchParams.get('flaggedOnly') === 'true',
      correlationId: searchParams.get('c') || searchParams.get('correlationId') || searchParams.get('call_id') || null,
      firmId: parsedFirmId === 0 ? null : parsedFirmId,
      search: searchParams.get('search') || '',
      callType: searchParams.get('callType') || 'All',
      transferType: searchParams.get('transferType') || 'Off',
      multipleTransfers: searchParams.get('multipleTransfers') === 'true',
      cekuraStatus: (searchParams.get('cekura') || 'all') as 'all' | 'success' | 'failure' | 'other',
      sortBy: searchParams.get('sortBy') || 'started_at',
      sortOrder: (searchParams.get('sortOrder') || 'desc') as SortOrder,
      offset: parseInt(searchParams.get('offset') || '0', 10),
      limit: parseInt(searchParams.get('limit') || String(DEFAULT_PAGE_LIMIT), 10),
      dynamicFilters: parsedDynamicFilters,
      dateMode: searchParams.get('dateMode') as 'today' | 'yesterday' | 'custom' | 'all' | null,
      startDate: searchParams.get('startDate') || null,
      endDate: searchParams.get('endDate') || null,
    };
  }, [searchParams]);

  // Derive selectedCallId from URL parameter
  const selectedCallId = urlFilters.correlationId;

  // Shared date filter state from context
  const {
    dateFilterMode,
    setDateFilterMode,
    startDate,
    setStartDate,
    endDate,
    setEndDate,
  } = useDateFilter();

  // Initialize date from URL on first load (if present)
  const initializedFromUrl = useRef(false);
  useEffect(() => {
    if (!initializedFromUrl.current && urlFilters.dateMode) {
      setDateFilterMode(urlFilters.dateMode);
      if (urlFilters.dateMode === 'custom') {
        if (urlFilters.startDate) setStartDate(urlFilters.startDate);
        if (urlFilters.endDate) setEndDate(urlFilters.endDate);
      }
      initializedFromUrl.current = true;
    }
  }, [urlFilters.dateMode, urlFilters.startDate, urlFilters.endDate, setDateFilterMode, setStartDate, setEndDate]);

  // Filter state - initialized from URL for deep linking
  const [flaggedOnly, setFlaggedOnly] = useState(urlFilters.flaggedOnly);
  const [search, setSearch] = useState(urlFilters.search);
  const [firmId, setFirmId] = useState<number | null>(urlFilters.firmId);
  const [callType, setCallType] = useState(urlFilters.callType);
  const [transferType, setTransferType] = useState(urlFilters.transferType);
  const [multipleTransfers, setMultipleTransfers] = useState(urlFilters.multipleTransfers);
  const [cekuraStatusFilter, setCekuraStatusFilter] = useState<'all' | 'success' | 'failure' | 'other'>(urlFilters.cekuraStatus);
  const [limit, setLimit] = useState(urlFilters.limit);
  const [offset, setOffset] = useState(urlFilters.offset);
  const [sortBy, setSortBy] = useState<string | null>(urlFilters.sortBy);
  const [sortOrder, setSortOrder] = useState<SortOrder>(urlFilters.sortOrder);
  const [dynamicFilters, setDynamicFilters] = useState<FilterRow[]>(urlFilters.dynamicFilters);
  const [highlightReasons, setHighlightReasons] = useState<HighlightReasons>({ sentry: false, duration: false, important: false, transferMismatch: false });
  const [pendingNavigation, setPendingNavigation] = useState<'first' | 'last' | null>(null);

  const debouncedSearch = useDebounce(search, 300);

  // === Lightweight URL Sync (only essential params for navigation) ===
  const updateCallIdInUrl = useCallback((correlationId: string | null) => {
    const params = new URLSearchParams();
    params.set('f', String(firmId ?? 0));
    params.set('e', environment);
    if (correlationId) {
      params.set('c', correlationId);
    }
    router.replace(`/calls?${params.toString()}`, { scroll: false });
  }, [firmId, environment, router]);

  // === Share URL Generation (compressed, includes all filters) ===
  const [shareToastVisible, setShareToastVisible] = useState(false);

  const handleSharePage = useCallback(async () => {
    const { buildShareableUrl, copyToClipboard } = await import('@/lib/share-url');
    const url = buildShareableUrl({
      flaggedOnly,
      firmId: firmId ?? 0,
      dateMode: dateFilterMode,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      search: debouncedSearch || undefined,
      callType: callType !== 'All' ? callType : undefined,
      transferType: transferType !== 'Off' ? transferType : undefined,
      multipleTransfers: multipleTransfers || undefined,
      cekuraStatus: cekuraStatusFilter,
      sortBy: sortBy || undefined,
      sortOrder,
      offset: offset > 0 ? offset : undefined,
      limit: limit !== DEFAULT_PAGE_LIMIT ? limit : undefined,
      dynamicFilters: dynamicFilters.length > 0 ? dynamicFilters : undefined,
      environment,
    });

    const success = await copyToClipboard(url);
    if (success) {
      setShareToastVisible(true);
      setTimeout(() => setShareToastVisible(false), 2000);
    }
  }, [flaggedOnly, firmId, dateFilterMode, startDate, endDate, debouncedSearch, callType, transferType, multipleTransfers, cekuraStatusFilter, sortBy, sortOrder, offset, limit, dynamicFilters, environment]);

  const handleShareCall = useCallback(async (correlationId: string) => {
    const { buildShareableUrl, copyToClipboard } = await import('@/lib/share-url');
    const url = buildShareableUrl({
      flaggedOnly,
      firmId: firmId ?? 0,
      dateMode: dateFilterMode,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      search: debouncedSearch || undefined,
      callType: callType !== 'All' ? callType : undefined,
      transferType: transferType !== 'Off' ? transferType : undefined,
      multipleTransfers: multipleTransfers || undefined,
      cekuraStatus: cekuraStatusFilter,
      sortBy: sortBy || undefined,
      sortOrder,
      offset: offset > 0 ? offset : undefined,
      limit: limit !== DEFAULT_PAGE_LIMIT ? limit : undefined,
      dynamicFilters: dynamicFilters.length > 0 ? dynamicFilters : undefined,
      environment,
      correlationId,
    });

    const success = await copyToClipboard(url);
    if (success) {
      setShareToastVisible(true);
      setTimeout(() => setShareToastVisible(false), 2000);
    }
  }, [flaggedOnly, firmId, dateFilterMode, startDate, endDate, debouncedSearch, callType, transferType, multipleTransfers, cekuraStatusFilter, sortBy, sortOrder, offset, limit, dynamicFilters, environment]);

  // Helper to get the identifier for a call (correlation ID preferred, fallback to numeric ID)
  const getCallIdentifier = (row: CallListItem | FlaggedCallListItem): string => {
    return row.platform_call_id || String(row.id);
  };

  // Firms for the grid filter
  const { data: firmsData } = useFirms();
  const firms = useMemo(() => [...(firmsData?.firms ?? [])].sort((a, b) => a.id - b.id), [firmsData]);

  // Handle flaggedOnly toggle (URL sync handled by effect)
  const handleFlaggedOnlyChange = (checked: boolean) => {
    setFlaggedOnly(checked);
    setOffset(0); // Reset pagination when toggling
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

  // Extract special filters from dynamic filters and separate standard filters
  const extractedFilters = useMemo(() => {
    const validFilters = dynamicFilters.filter(
      (f) => f.value || !conditionRequiresValue(f.condition)
    );

    // Helper to evaluate boolean conditions with AND/OR logic
    // Returns: { value: boolean | null, impossible: boolean }
    // - impossible=true means contradictory AND (e.g., true AND false)
    // - value=null means tautology OR (e.g., true OR false) - no filter needed
    const evaluateBooleanConditions = (
      conditions: Array<{ value: boolean; combinator: 'and' | 'or' }>
    ): { value: boolean | null; impossible: boolean } => {
      if (conditions.length === 0) return { value: null, impossible: false };

      const result = conditions[0].value;

      for (let i = 1; i < conditions.length; i++) {
        const { value, combinator } = conditions[i];

        if (combinator === 'and') {
          // AND logic: if values differ, it's impossible (true AND false = empty set)
          if (result !== value) {
            return { value: null, impossible: true };
          }
          // Same values: result stays the same
        } else {
          // OR logic: if values differ, it's a tautology (true OR false = everything)
          if (result !== value) {
            return { value: null, impossible: false };
          }
          // Same values: result stays the same
        }
      }

      return { value: result, impossible: false };
    };

    // Helper to evaluate value conditions with AND/OR logic
    // For equals: collect values, track if ANY are ORed (union) vs all ANDed (intersection)
    // For simplicity: if any OR combinator exists, use union; otherwise intersection
    const evaluateValueConditions = (
      conditions: Array<{ value: string; combinator: 'and' | 'or' }>
    ): { values: string[]; useUnion: boolean } => {
      if (conditions.length === 0) return { values: [], useUnion: false };

      const values = conditions.map(c => c.value);
      // Check if any combinator (after the first) is OR
      const useUnion = conditions.slice(1).some(c => c.combinator === 'or');

      return { values, useUnion };
    };

    // Track conditions with combinators for special filters
    const requireHasTransferConditions: Array<{ value: boolean; combinator: 'and' | 'or' }> = [];
    const multipleTransfersConditions: Array<{ value: boolean; combinator: 'and' | 'or' }> = [];
    const transferTypeConditions: Array<{ value: string; combinator: 'and' | 'or' }> = [];
    const excludeTransferTypeConditions: Array<{ value: string; combinator: 'and' | 'or' }> = [];
    const cekuraStatusConditions: Array<{ value: string; combinator: 'and' | 'or' }> = [];
    const excludeCekuraStatusConditions: Array<{ value: string; combinator: 'and' | 'or' }> = [];
    const toolCallResultConditions: Array<{ value: string; combinator: 'and' | 'or' }> = [];
    const excludeToolCallResultConditions: Array<{ value: string; combinator: 'and' | 'or' }> = [];
    const callTypeConditions: Array<{ value: string; combinator: 'and' | 'or' }> = [];
    const excludeCallTypeConditions: Array<{ value: string; combinator: 'and' | 'or' }> = [];
    const statusConditions: Array<{ value: string; combinator: 'and' | 'or' }> = [];
    const excludeStatusConditions: Array<{ value: string; combinator: 'and' | 'or' }> = [];

    // Boolean trackers for select field emptiness (is_empty / is_not_empty)
    const cekuraStatusEmptyConditions: Array<{ value: boolean; combinator: 'and' | 'or' }> = [];
    const callTypeEmptyConditions: Array<{ value: boolean; combinator: 'and' | 'or' }> = [];
    const toolCallResultEmptyConditions: Array<{ value: boolean; combinator: 'and' | 'or' }> = [];
    const statusEmptyConditions: Array<{ value: boolean; combinator: 'and' | 'or' }> = [];

    let extractedFirmId: number | null = null;

    // Standard filters to pass to API
    const standardFilters: DynamicFilter[] = [];

    for (const filter of validFilters) {
      const combinator = filter.combinator || 'and';

      // Handle transfer_type specially (includes voicemail detection from webhooks)
      if (filter.field === 'transfer_type') {
        if (filter.condition === 'equals') {
          transferTypeConditions.push({ value: filter.value, combinator });
        } else if (filter.condition === 'not_equals') {
          excludeTransferTypeConditions.push({ value: filter.value, combinator });
        } else if (filter.condition === 'is_not_empty') {
          requireHasTransferConditions.push({ value: true, combinator });
        } else if (filter.condition === 'is_empty') {
          requireHasTransferConditions.push({ value: false, combinator });
        }
        continue;
      }

      // Handle cekura_status specially (requires Cekura API data)
      if (filter.field === 'cekura_status') {
        if (filter.condition === 'equals') {
          cekuraStatusConditions.push({ value: filter.value, combinator });
        } else if (filter.condition === 'not_equals') {
          excludeCekuraStatusConditions.push({ value: filter.value, combinator });
        } else if (filter.condition === 'is_not_empty') {
          // has cekura data (value: true means "must have data")
          cekuraStatusEmptyConditions.push({ value: true, combinator });
        } else if (filter.condition === 'is_empty') {
          // no cekura data (value: false means "must NOT have data")
          cekuraStatusEmptyConditions.push({ value: false, combinator });
        }
        continue;
      }

      // Handle multiple_transfers (boolean from webhook analysis)
      if (filter.field === 'multiple_transfers') {
        if (filter.condition === 'is_true') {
          multipleTransfersConditions.push({ value: true, combinator });
        } else if (filter.condition === 'is_false') {
          multipleTransfersConditions.push({ value: false, combinator });
        }
        continue;
      }

      // Handle tool_call_result (last transfer result from webhook)
      if (filter.field === 'tool_call_result') {
        if (filter.condition === 'equals') {
          toolCallResultConditions.push({ value: filter.value, combinator });
        } else if (filter.condition === 'not_equals') {
          excludeToolCallResultConditions.push({ value: filter.value, combinator });
        } else if (filter.condition === 'is_not_empty') {
          toolCallResultEmptyConditions.push({ value: true, combinator });
        } else if (filter.condition === 'is_empty') {
          toolCallResultEmptyConditions.push({ value: false, combinator });
        }
        continue;
      }

      // Handle call_type
      if (filter.field === 'call_type') {
        if (filter.condition === 'equals') {
          callTypeConditions.push({ value: filter.value, combinator });
        } else if (filter.condition === 'not_equals') {
          excludeCallTypeConditions.push({ value: filter.value, combinator });
        } else if (filter.condition === 'is_not_empty') {
          callTypeEmptyConditions.push({ value: true, combinator });
        } else if (filter.condition === 'is_empty') {
          callTypeEmptyConditions.push({ value: false, combinator });
        } else {
          // Other conditions (contains, etc.) go to standard filters
          standardFilters.push({
            field: filter.field,
            condition: filter.condition,
            value: filter.value,
            combinator: filter.combinator,
          });
        }
        continue;
      }

      // Handle status (special extraction for AND/OR logic and impossible condition detection)
      if (filter.field === 'status') {
        if (filter.condition === 'equals') {
          statusConditions.push({ value: filter.value, combinator });
        } else if (filter.condition === 'not_equals') {
          excludeStatusConditions.push({ value: filter.value, combinator });
        } else if (filter.condition === 'is_not_empty') {
          statusEmptyConditions.push({ value: true, combinator });
        } else if (filter.condition === 'is_empty') {
          statusEmptyConditions.push({ value: false, combinator });
        } else {
          // Other conditions (contains, etc.) go to standard filters
          standardFilters.push({
            field: filter.field,
            condition: filter.condition,
            value: filter.value,
            combinator: filter.combinator,
          });
        }
        continue;
      }

      // Handle firm_id - equals goes to dedicated filter, others go to standard
      if (filter.field === 'firm_id' && filter.condition === 'equals') {
        extractedFirmId = parseInt(filter.value) || null;
        continue;
      }

      // All other filters go to standard filters (include combinator for per-filter AND/OR)
      standardFilters.push({
        field: filter.field,
        condition: filter.condition,
        value: filter.value,
        combinator: filter.combinator,
      });
    }

    // Evaluate boolean conditions
    const requireHasTransferResult = evaluateBooleanConditions(requireHasTransferConditions);
    const multipleTransfersResult = evaluateBooleanConditions(multipleTransfersConditions);

    // Evaluate boolean emptiness conditions for select fields
    const cekuraStatusEmptyResult = evaluateBooleanConditions(cekuraStatusEmptyConditions);
    const callTypeEmptyResult = evaluateBooleanConditions(callTypeEmptyConditions);
    const toolCallResultEmptyResult = evaluateBooleanConditions(toolCallResultEmptyConditions);

    // Evaluate value conditions
    const transferTypeResult = evaluateValueConditions(transferTypeConditions);
    const excludeTransferTypeResult = evaluateValueConditions(excludeTransferTypeConditions);
    const cekuraStatusResult = evaluateValueConditions(cekuraStatusConditions);
    const excludeCekuraStatusResult = evaluateValueConditions(excludeCekuraStatusConditions);
    const toolCallResultResult = evaluateValueConditions(toolCallResultConditions);
    const excludeToolCallResultResult = evaluateValueConditions(excludeToolCallResultConditions);
    const callTypeResult = evaluateValueConditions(callTypeConditions);
    const excludeCallTypeResult = evaluateValueConditions(excludeCallTypeConditions);
    const statusResult = evaluateValueConditions(statusConditions);
    const excludeStatusResult = evaluateValueConditions(excludeStatusConditions);
    const statusEmptyResult = evaluateBooleanConditions(statusEmptyConditions);

    // Helper to check if value conditions are impossible (AND with different values)
    const hasImpossibleValueCondition = (values: string[], useUnion: boolean) => {
      if (values.length <= 1) return false;
      if (useUnion) return false; // OR can't be impossible
      return new Set(values).size > 1; // AND with different values = impossible
    };

    // Check for any impossible conditions (contradictory ANDs)
    const hasImpossibleCondition =
      // Boolean impossibilities
      requireHasTransferResult.impossible ||
      multipleTransfersResult.impossible ||
      cekuraStatusEmptyResult.impossible ||
      callTypeEmptyResult.impossible ||
      toolCallResultEmptyResult.impossible ||
      statusEmptyResult.impossible ||
      // Value impossibilities (AND with different values)
      hasImpossibleValueCondition(cekuraStatusResult.values, cekuraStatusResult.useUnion) ||
      hasImpossibleValueCondition(callTypeResult.values, callTypeResult.useUnion) ||
      hasImpossibleValueCondition(toolCallResultResult.values, toolCallResultResult.useUnion) ||
      hasImpossibleValueCondition(statusResult.values, statusResult.useUnion) ||
      // Cross-condition impossibilities: equals AND is_empty
      (cekuraStatusResult.values.length > 0 && cekuraStatusEmptyResult.value === false) ||
      (callTypeResult.values.length > 0 && callTypeEmptyResult.value === false) ||
      (toolCallResultResult.values.length > 0 && toolCallResultEmptyResult.value === false) ||
      (statusResult.values.length > 0 && statusEmptyResult.value === false);

    return {
      // Transfer type values
      transferType: transferTypeResult.values.length > 0 ? transferTypeResult.values[0] : null,
      transferTypeValues: transferTypeResult.values.length > 0 ? transferTypeResult.values : null,
      transferTypeUseUnion: transferTypeResult.useUnion,
      excludeTransferType: excludeTransferTypeResult.values.length > 0 ? excludeTransferTypeResult.values[0] : null,
      excludeTransferTypeValues: excludeTransferTypeResult.values.length > 0 ? excludeTransferTypeResult.values : null,
      excludeTransferTypeUseUnion: excludeTransferTypeResult.useUnion,
      // Boolean filters with proper AND/OR evaluation
      requireHasTransfer: requireHasTransferResult.value,
      multipleTransfers: multipleTransfersResult.value,
      // Cekura status
      cekuraStatus: cekuraStatusResult.values.length > 0
        ? cekuraStatusResult.values[0] as 'success' | 'failure' | 'other'
        : 'all' as const,
      cekuraStatusValues: cekuraStatusResult.values.length > 0 ? cekuraStatusResult.values : null,
      cekuraStatusUseUnion: cekuraStatusResult.useUnion,
      excludeCekuraStatus: excludeCekuraStatusResult.values.length > 0 ? excludeCekuraStatusResult.values[0] : null,
      excludeCekuraStatusValues: excludeCekuraStatusResult.values.length > 0 ? excludeCekuraStatusResult.values : null,
      excludeCekuraStatusUseUnion: excludeCekuraStatusResult.useUnion,
      // Cekura status emptiness (is_empty / is_not_empty)
      // true = has data (is_not_empty), false = no data (is_empty), null = no filter
      cekuraStatusEmpty: cekuraStatusEmptyResult.value,
      // Call type
      callType: callTypeResult.values.length > 0 ? callTypeResult.values[0] : null,
      callTypeValues: callTypeResult.values.length > 0 ? callTypeResult.values : null,
      callTypeUseUnion: callTypeResult.useUnion,
      excludeCallType: excludeCallTypeResult.values.length > 0 ? excludeCallTypeResult.values[0] : null,
      excludeCallTypeValues: excludeCallTypeResult.values.length > 0 ? excludeCallTypeResult.values : null,
      excludeCallTypeUseUnion: excludeCallTypeResult.useUnion,
      // Call type emptiness (is_empty / is_not_empty)
      callTypeEmpty: callTypeEmptyResult.value,
      // Status
      status: statusResult.values.length > 0 ? statusResult.values[0] : null,
      statusValues: statusResult.values.length > 0 ? statusResult.values : null,
      statusUseUnion: statusResult.useUnion,
      excludeStatus: excludeStatusResult.values.length > 0 ? excludeStatusResult.values[0] : null,
      excludeStatusValues: excludeStatusResult.values.length > 0 ? excludeStatusResult.values : null,
      excludeStatusUseUnion: excludeStatusResult.useUnion,
      // Status emptiness (is_empty / is_not_empty)
      statusEmpty: statusEmptyResult.value,
      // Firm ID
      firmId: extractedFirmId,
      // Tool call result
      toolCallResult: toolCallResultResult.values.length > 0
        ? toolCallResultResult.values[0] as 'transfer_executed' | 'transfer_completed' | 'transfer_cancelled' | 'other'
        : null,
      toolCallResultValues: toolCallResultResult.values.length > 0 ? toolCallResultResult.values : null,
      toolCallResultUseUnion: toolCallResultResult.useUnion,
      excludeToolCallResult: excludeToolCallResultResult.values.length > 0
        ? excludeToolCallResultResult.values[0] as 'transfer_executed' | 'transfer_completed' | 'transfer_cancelled' | 'other'
        : null,
      excludeToolCallResultValues: excludeToolCallResultResult.values.length > 0 ? excludeToolCallResultResult.values : null,
      excludeToolCallResultUseUnion: excludeToolCallResultResult.useUnion,
      // Tool call result emptiness (is_empty / is_not_empty)
      toolCallResultEmpty: toolCallResultEmptyResult.value,
      // Standard filters for API
      standardFilters: standardFilters.length > 0 ? standardFilters : null,
      // Flag for impossible conditions (should return 0 results)
      hasImpossibleCondition,
    };
  }, [dynamicFilters]);

  // Compute effective Cekura status filter (sidebar takes precedence, then dynamic)
  const effectiveCekuraStatus = cekuraStatusFilter !== 'all' ? cekuraStatusFilter : extractedFilters.cekuraStatus;
  const effectiveExcludeCekuraStatus = extractedFilters.excludeCekuraStatus;

  // Helper to check if a Cekura status matches a category
  const matchesCekuraCategory = (status: string, category: 'success' | 'failure' | 'other') => {
    const s = status.toLowerCase();
    if (category === 'success') return s === 'success' || s === 'completed';
    if (category === 'failure') return s === 'failure' || s === 'failed' || s === 'error';
    if (category === 'other') return s !== 'success' && s !== 'completed' && s !== 'failure' && s !== 'failed' && s !== 'error';
    return false;
  };

  // Compute correlation IDs to filter by based on Cekura status
  const cekuraFilterResult = useMemo(() => {
    if (!cekuraCallsData?.calls) {
      return { include: null, exclude: null }; // No data yet
    }

    const statusValues = extractedFilters.cekuraStatusValues;
    const useUnion = extractedFilters.cekuraStatusUseUnion;
    const excludeValues = extractedFilters.excludeCekuraStatusValues;
    const excludeUseUnion = extractedFilters.excludeCekuraStatusUseUnion;
    const emptyFilter = extractedFilters.cekuraStatusEmpty;

    // Handle is_empty (calls without Cekura data)
    // Return special object to signal exclude filter
    if (emptyFilter === false) {
      // is_empty: return all Cekura IDs as 'exclude' - calls NOT in this list will be returned
      const allCekuraIds = Array.from(cekuraCallsData.calls.keys());
      return { include: null, exclude: allCekuraIds };
    }

    // Handle is_not_empty (calls with Cekura data)
    if (emptyFilter === true && !statusValues && !excludeValues && effectiveCekuraStatus === 'all') {
      // is_not_empty without value filters: return all correlation IDs that have data
      const matchingIds: string[] = [];
      cekuraCallsData.calls.forEach((_, correlationId) => {
        matchingIds.push(correlationId);
      });
      return { include: matchingIds, exclude: null };
    }

    // If neither include, exclude, nor sidebar filter is set, no Cekura filtering
    if (effectiveCekuraStatus === 'all' && !statusValues && !excludeValues) {
      return { include: null, exclude: null };
    }

    // Handle multiple values with AND/OR logic
    if (statusValues && statusValues.length > 1) {
      if (!useUnion) {
        // AND with different values = impossible (a call can only have one status)
        if (new Set(statusValues).size > 1) return { include: [], exclude: null };
      }
      // OR logic: match any of the categories
      const matchingIds: string[] = [];
      cekuraCallsData.calls.forEach((callData, correlationId) => {
        const status = callData.status || '';
        const matches = statusValues.some(cat =>
          matchesCekuraCategory(status, cat as 'success' | 'failure' | 'other')
        );
        if (matches) matchingIds.push(correlationId);
      });
      return { include: matchingIds, exclude: null };
    }

    // Handle multiple exclude values with AND/OR logic
    if (excludeValues && excludeValues.length > 1) {
      const matchingIds: string[] = [];
      cekuraCallsData.calls.forEach((callData, correlationId) => {
        const status = callData.status || '';
        if (excludeUseUnion) {
          // OR exclude: exclude if matches ANY of the excluded categories
          const shouldExclude = excludeValues.some(cat =>
            matchesCekuraCategory(status, cat as 'success' | 'failure' | 'other')
          );
          if (!shouldExclude) matchingIds.push(correlationId);
        } else {
          // AND exclude: exclude only if matches ALL excluded categories (impossible for single status)
          // In practice, AND with different exclude values means "exclude nothing" since a status can't be multiple things
          matchingIds.push(correlationId);
        }
      });
      return { include: matchingIds, exclude: null };
    }

    // Single value filtering (original logic)
    const matchingIds: string[] = [];
    cekuraCallsData.calls.forEach((callData, correlationId) => {
      const status = callData.status || '';

      // If we have an include filter (sidebar or single dynamic value), check if it matches
      if (effectiveCekuraStatus !== 'all') {
        if (matchesCekuraCategory(status, effectiveCekuraStatus)) {
          matchingIds.push(correlationId);
        }
      }
      // If we have an exclude filter, include everything EXCEPT that category
      else if (effectiveExcludeCekuraStatus) {
        const excludeCategory = effectiveExcludeCekuraStatus as 'success' | 'failure' | 'other';
        if (!matchesCekuraCategory(status, excludeCategory)) {
          matchingIds.push(correlationId);
        }
      }
    });

    return { include: matchingIds, exclude: null };
  }, [effectiveCekuraStatus, effectiveExcludeCekuraStatus, cekuraCallsData, extractedFilters.cekuraStatusValues, extractedFilters.cekuraStatusUseUnion, extractedFilters.excludeCekuraStatusValues, extractedFilters.excludeCekuraStatusUseUnion, extractedFilters.cekuraStatusEmpty]);

  // Extract include/exclude correlation IDs from the filter result
  const cekuraFilteredCorrelationIds = cekuraFilterResult?.include ?? null;
  const cekuraExcludeCorrelationIds = cekuraFilterResult?.exclude ?? null;

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

  // Compute effective filter values (sidebar takes precedence, then dynamic)
  const effectiveFirmId = firmId ?? extractedFilters.firmId;
  const effectiveCallType = callType !== 'All' ? callType : extractedFilters.callType;
  // For transfer type: sidebar selection overrides, otherwise use dynamic filter values
  const effectiveTransferType = transferType !== 'Off' ? transferType : extractedFilters.transferType;
  const effectiveTransferTypeValues = transferType !== 'Off' ? null : extractedFilters.transferTypeValues;
  // For multipleTransfers: sidebar true overrides, dynamic true/false applies, otherwise undefined
  const effectiveMultipleTransfers = multipleTransfers ? true : (extractedFilters.multipleTransfers ?? undefined);

  // Create a stable hash of the dynamic filters to ensure query cache invalidation when combinators change
  // This is needed because the extracted/evaluated values might be the same even when combinators differ
  const dynamicFiltersHash = useMemo(() => {
    return JSON.stringify(dynamicFilters.map(f => ({
      id: f.id,
      field: f.field,
      condition: f.condition,
      value: f.value,
      combinator: f.combinator,
    })));
  }, [dynamicFilters]);

  // Compute effective call type values (sidebar overrides, then dynamic filter)
  const effectiveCallTypeValues = callType !== 'All' ? null : extractedFilters.callTypeValues;

  // Build filters for regular calls
  // Each filter now has its own combinator for mixed AND/OR logic
  const callFilters = useMemo(
    () => ({
      firmId: effectiveFirmId,
      // Pass call type - use array if multiple values, otherwise single value
      callType: effectiveCallTypeValues && effectiveCallTypeValues.length > 1
        ? undefined // Don't use single value when we have multiple
        : effectiveCallType,
      callTypeValues: effectiveCallTypeValues,
      // AND = intersection for call type (impossible with different values for single-value field)
      callTypeUseUnion: extractedFilters.callTypeUseUnion,
      // Pass transfer type - use array if multiple values, otherwise single value
      transferType: effectiveTransferTypeValues && effectiveTransferTypeValues.length > 1
        ? undefined // Don't use single value when we have multiple
        : effectiveTransferType,
      transferTypeValues: effectiveTransferTypeValues,
      // AND = intersection (must match ALL), OR = union (must match ANY)
      transferTypeUseIntersection: extractedFilters.transferTypeUseUnion === false && (effectiveTransferTypeValues?.length ?? 0) > 1,
      multipleTransfers: effectiveMultipleTransfers,
      excludeTransferType: extractedFilters.excludeTransferType,
      excludeTransferTypeValues: extractedFilters.excludeTransferTypeValues,
      excludeTransferTypeUseUnion: extractedFilters.excludeTransferTypeUseUnion,
      excludeCallType: extractedFilters.excludeCallType,
      excludeCallTypeValues: extractedFilters.excludeCallTypeValues,
      excludeCallTypeUseUnion: extractedFilters.excludeCallTypeUseUnion,
      requireHasTransfer: extractedFilters.requireHasTransfer,
      // Pass tool call result values - always use arrays if multiple values exist
      toolCallResult: extractedFilters.toolCallResultValues && extractedFilters.toolCallResultValues.length > 1
        ? undefined // Don't use single value when we have multiple
        : extractedFilters.toolCallResult,
      toolCallResultValues: extractedFilters.toolCallResultValues,
      toolCallResultUseUnion: extractedFilters.toolCallResultUseUnion,
      excludeToolCallResult: extractedFilters.excludeToolCallResult,
      excludeToolCallResultValues: extractedFilters.excludeToolCallResultValues,
      excludeToolCallResultUseUnion: extractedFilters.excludeToolCallResultUseUnion,
      // Pass status values - use array if multiple values, otherwise single value
      status: extractedFilters.statusValues && extractedFilters.statusValues.length > 1
        ? undefined // Don't use single value when we have multiple
        : extractedFilters.status,
      statusValues: extractedFilters.statusValues,
      statusUseUnion: extractedFilters.statusUseUnion,
      excludeStatus: extractedFilters.excludeStatus,
      excludeStatusValues: extractedFilters.excludeStatusValues,
      excludeStatusUseUnion: extractedFilters.excludeStatusUseUnion,
      startDate: effectiveDateRange.startDate,
      endDate: effectiveDateRange.endDate,
      search: debouncedSearch || undefined,
      limit,
      offset,
      sortBy,
      sortOrder,
      correlationIds: cekuraFilteredCorrelationIds,
      excludeCorrelationIds: cekuraExcludeCorrelationIds,
      dynamicFilters: extractedFilters.standardFilters,
      // Flag for impossible filter conditions (e.g., is_empty AND is_not_empty)
      hasImpossibleCondition: extractedFilters.hasImpossibleCondition,
      // Include hash of raw filters to ensure cache invalidation when combinators change
      _filtersHash: dynamicFiltersHash,
    }),
    [effectiveFirmId, effectiveCallType, effectiveCallTypeValues, extractedFilters.callTypeUseUnion, effectiveTransferType, effectiveTransferTypeValues, effectiveMultipleTransfers, extractedFilters.transferTypeUseUnion, extractedFilters.excludeTransferType, extractedFilters.excludeTransferTypeValues, extractedFilters.excludeTransferTypeUseUnion, extractedFilters.excludeCallType, extractedFilters.excludeCallTypeValues, extractedFilters.excludeCallTypeUseUnion, extractedFilters.requireHasTransfer, extractedFilters.toolCallResult, extractedFilters.toolCallResultValues, extractedFilters.toolCallResultUseUnion, extractedFilters.excludeToolCallResult, extractedFilters.excludeToolCallResultValues, extractedFilters.excludeToolCallResultUseUnion, extractedFilters.status, extractedFilters.statusValues, extractedFilters.statusUseUnion, extractedFilters.excludeStatus, extractedFilters.excludeStatusValues, extractedFilters.excludeStatusUseUnion, effectiveDateRange, debouncedSearch, limit, offset, sortBy, sortOrder, cekuraFilteredCorrelationIds, cekuraExcludeCorrelationIds, extractedFilters.standardFilters, extractedFilters.hasImpossibleCondition, dynamicFiltersHash]
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
    updateCallIdInUrl(row ? getCallIdentifier(row) : null);
  };

  // Navigation logic for detail dialog
  const dataArray = data?.data ?? [];
  const totalFiltered = data?.total ?? 0;
  const localIndex = selectedCallId !== null
    ? dataArray.findIndex(c => getCallIdentifier(c) === selectedCallId)
    : -1;

  // Global index across all pages
  const globalIndex = localIndex >= 0 ? offset + localIndex : -1;

  // Adjacent call IDs for prefetching (only within current page)
  const adjacentCallIds = useMemo(() => {
    if (localIndex < 0) return undefined;
    return {
      previous: localIndex > 0 ? getCallIdentifier(dataArray[localIndex - 1]) : null,
      next: localIndex < dataArray.length - 1 ? getCallIdentifier(dataArray[localIndex + 1]) : null,
    };
  }, [localIndex, dataArray]);

  // Can always navigate if there are multiple items (wrap-around enabled)
  const hasPrevious = totalFiltered > 1;
  const hasNext = totalFiltered > 1;

  const handlePrevious = () => {
    if (totalFiltered <= 1) return;

    if (localIndex > 0) {
      // Navigate within current page
      updateCallIdInUrl(getCallIdentifier(dataArray[localIndex - 1]));
    } else if (offset > 0) {
      // Go to previous page and select last item
      const newOffset = Math.max(0, offset - limit);
      setOffset(newOffset);
      setPendingNavigation('last');
    } else {
      // At first item (1/60) - wrap to last page and last item
      const lastPageOffset = Math.floor((totalFiltered - 1) / limit) * limit;
      setOffset(lastPageOffset);
      setPendingNavigation('last');
    }
  };

  const handleNext = () => {
    if (totalFiltered <= 1) return;

    if (localIndex < dataArray.length - 1) {
      // Navigate within current page
      updateCallIdInUrl(getCallIdentifier(dataArray[localIndex + 1]));
    } else if (offset + dataArray.length < totalFiltered) {
      // Go to next page and select first item
      const newOffset = offset + limit;
      setOffset(newOffset);
      setPendingNavigation('first');
    } else {
      // At last item (60/60) - wrap to first page and first item
      setOffset(0);
      setPendingNavigation('first');
    }
  };

  // Effect to handle navigation after page data loads
  useEffect(() => {
    if (pendingNavigation && dataArray.length > 0) {
      if (pendingNavigation === 'first') {
        updateCallIdInUrl(getCallIdentifier(dataArray[0]));
      } else if (pendingNavigation === 'last') {
        updateCallIdInUrl(getCallIdentifier(dataArray[dataArray.length - 1]));
      }
      setPendingNavigation(null);
    }
  }, [pendingNavigation, dataArray, updateCallIdInUrl]);

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
        headerAction={
          <DynamicFilterBuilder
            fields={CALL_FILTER_FIELDS}
            filters={dynamicFilters}
            onFiltersChange={setDynamicFilters}
            onApply={() => setOffset(0)}
          />
        }
      >
        {/* Call-specific filters in compact 2x2 grid - only show when not in flagged mode */}
        {!flaggedOnly && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <div className="min-w-0">
                <Label className="text-sm">Firm</Label>
                <Select
                  value={firmId ? String(firmId) : 'all'}
                  onValueChange={(v) => setFirmId(v === 'all' ? null : parseInt(v))}
                >
                  <SelectTrigger className="mt-0.5 h-8 text-xs w-full [&>span:first-child]:truncate [&>span:first-child]:max-w-[calc(100%-1rem)]">
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
              <div className="min-w-0">
                <Label className="text-sm">Call Type</Label>
                <Select value={callType} onValueChange={setCallType}>
                  <SelectTrigger className="mt-0.5 h-8 text-xs w-full">
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
              <div className="min-w-0">
                <Label className="text-sm">Transfer</Label>
                <Select value={transferType} onValueChange={setTransferType}>
                  <SelectTrigger className="mt-0.5 h-8 text-xs w-full [&>span:first-child]:truncate">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TRANSFER_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type === 'has_conversation' ? 'has_convo' : type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="min-w-0">
                <Label className="text-sm">Cekura</Label>
                <Select
                  value={cekuraStatusFilter}
                  onValueChange={(v) => setCekuraStatusFilter(v as typeof cekuraStatusFilter)}
                >
                  <SelectTrigger className="mt-0.5 h-8 text-xs w-full">
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

        {/* Reset Filters Button */}
        <Button
          variant="outline"
          size="sm"
          className="w-full mt-2"
          onClick={() => {
            // Reset all filter state
            setFirmId(null);
            setCallType('All');
            setTransferType('Off');
            setCekuraStatusFilter('all');
            setMultipleTransfers(false);
            setFlaggedOnly(false);
            setSearch('');
            setDynamicFilters([]);
            setOffset(0);
            setSortBy('started_at');
            setSortOrder('desc');
            // Reset URL to clean state
            router.replace('/calls', { scroll: false });
          }}
        >
          <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
          Reset Filters
        </Button>
      </ResponsiveFilterSidebar>

      {/* Main Content */}
      <div className="flex-1 flex flex-col p-4 md:p-6 overflow-hidden">
        {/* Header - fixed */}
        <div className="shrink-0">
          <div className="flex items-center justify-between mb-3 md:mb-4">
            <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
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
            <Button
              variant="outline"
              size="sm"
              onClick={handleSharePage}
              className="gap-1.5"
            >
              <Share2 className="h-4 w-4" />
              <span className="hidden sm:inline">Share</span>
            </Button>
          </div>

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
            getRowId={(row) => getCallIdentifier(row)}
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
        onClose={() => updateCallIdInUrl(null)}
        onPrevious={handlePrevious}
        onNext={handleNext}
        hasPrevious={hasPrevious}
        hasNext={hasNext}
        currentIndex={globalIndex}
        totalCount={totalFiltered}
        dateRange={{
          startDate: effectiveDateRange.startDate ? `${effectiveDateRange.startDate.split('T')[0]}T00:00:00Z` : null,
          endDate: effectiveDateRange.endDate ? `${effectiveDateRange.endDate.split('T')[0]}T23:59:59Z` : null,
        }}
        onShare={handleShareCall}
        adjacentCallIds={adjacentCallIds}
      />

      {/* Share Toast */}
      {shareToastVisible && (
        <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg shadow-lg animate-in fade-in slide-in-from-bottom-2">
          <Check className="h-4 w-4" />
          Link copied to clipboard
        </div>
      )}
    </div>
  );
}
