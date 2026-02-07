import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';

export interface ShareableCallsState {
  // Flags
  flaggedOnly?: boolean;
  // Firm (0 = All)
  firmId: number;
  // Date
  dateMode?: 'today' | 'yesterday' | 'custom' | 'all';
  startDate?: string;
  endDate?: string;
  // Search
  search?: string;
  // Sidebar filters
  callType?: string;
  transferType?: string;
  multipleTransfers?: boolean;
  cekuraStatus?: 'all' | 'success' | 'failure' | 'other';
  // Sorting
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  // Pagination
  offset?: number;
  limit?: number;
  // Dynamic filters
  dynamicFilters?: Array<{
    id: string;
    field: string;
    condition: string;
    value: string;
    combinator?: 'and' | 'or';
  }>;
  // Environment
  environment: string;
  // Selected call
  correlationId?: string;
}

/**
 * Build a shareable URL for the calls page
 * Uses compression for compact URLs
 */
export function buildShareableUrl(
  state: ShareableCallsState,
  baseUrl: string = typeof window !== 'undefined' ? window.location.origin : ''
): string {
  const params = new URLSearchParams();

  // Always include firm_id and environment (short names)
  params.set('f', String(state.firmId));
  params.set('e', state.environment);

  // Build state object with only non-default values
  const stateToEncode: Record<string, unknown> = {};

  if (state.flaggedOnly) stateToEncode.fo = 1;
  if (state.dateMode && state.dateMode !== 'today') stateToEncode.dm = state.dateMode;
  if (state.startDate) stateToEncode.sd = state.startDate;
  if (state.endDate) stateToEncode.ed = state.endDate;
  if (state.search) stateToEncode.q = state.search;
  if (state.callType && state.callType !== 'All') stateToEncode.ct = state.callType;
  if (state.transferType && state.transferType !== 'Off') stateToEncode.tt = state.transferType;
  if (state.multipleTransfers) stateToEncode.mt = 1;
  if (state.cekuraStatus && state.cekuraStatus !== 'all') stateToEncode.ck = state.cekuraStatus;
  if (state.sortBy && state.sortBy !== 'started_at') stateToEncode.sb = state.sortBy;
  if (state.sortOrder && state.sortOrder !== 'desc') stateToEncode.so = state.sortOrder;
  if (state.offset && state.offset > 0) stateToEncode.o = state.offset;
  if (state.limit && state.limit !== 60) stateToEncode.l = state.limit;
  if (state.dynamicFilters && state.dynamicFilters.length > 0) {
    // Compact format for dynamic filters
    stateToEncode.df = state.dynamicFilters.map(f => ({
      f: f.field,
      c: f.condition,
      v: f.value,
      ...(f.combinator === 'or' ? { x: 1 } : {}),
    }));
  }

  // Only compress if there's state beyond the basics
  if (Object.keys(stateToEncode).length > 0) {
    const compressed = compressToEncodedURIComponent(JSON.stringify(stateToEncode));
    params.set('s', compressed);
  }

  // Correlation ID at the end (not compressed - for readability)
  if (state.correlationId) {
    params.set('c', state.correlationId);
  }

  return `${baseUrl}/calls?${params.toString()}`;
}

/**
 * Parse a shareable URL back into state
 */
export function parseShareableUrl(searchParams: URLSearchParams): Partial<ShareableCallsState> {
  const result: Partial<ShareableCallsState> = {};

  // Parse basic params
  const firmId = searchParams.get('f') || searchParams.get('firm_id');
  if (firmId != null) {
    const parsed = parseInt(firmId, 10);
    result.firmId = parsed === 0 ? 0 : parsed;
  }

  result.environment = searchParams.get('e') || searchParams.get('environment') || 'production';
  result.correlationId = searchParams.get('c') || searchParams.get('correlationId') || undefined;

  // Parse compressed state
  const compressed = searchParams.get('s');
  if (compressed) {
    try {
      const decompressed = decompressFromEncodedURIComponent(compressed);
      if (decompressed) {
        const state = JSON.parse(decompressed);

        if (state.fo) result.flaggedOnly = true;
        if (state.dm) result.dateMode = state.dm;
        if (state.sd) result.startDate = state.sd;
        if (state.ed) result.endDate = state.ed;
        if (state.q) result.search = state.q;
        if (state.ct) result.callType = state.ct;
        if (state.tt) result.transferType = state.tt;
        if (state.mt) result.multipleTransfers = true;
        if (state.ck) result.cekuraStatus = state.ck;
        if (state.sb) result.sortBy = state.sb;
        if (state.so) result.sortOrder = state.so;
        if (state.o) result.offset = state.o;
        if (state.l) result.limit = state.l;
        if (state.df) {
          result.dynamicFilters = state.df.map((f: { f: string; c: string; v: string; x?: number }, i: number) => ({
            id: String(i + 1),
            field: f.f,
            condition: f.c,
            value: f.v,
            combinator: f.x ? 'or' : 'and',
          }));
        }
      }
    } catch {
      // Invalid compressed data, ignore
    }
  }

  // Also support legacy uncompressed params for backwards compatibility
  if (!compressed) {
    if (searchParams.get('flaggedOnly') === 'true') result.flaggedOnly = true;
    if (searchParams.get('dateMode')) result.dateMode = searchParams.get('dateMode') as ShareableCallsState['dateMode'];
    if (searchParams.get('startDate')) result.startDate = searchParams.get('startDate')!;
    if (searchParams.get('endDate')) result.endDate = searchParams.get('endDate')!;
    if (searchParams.get('search')) result.search = searchParams.get('search')!;
    if (searchParams.get('callType')) result.callType = searchParams.get('callType')!;
    if (searchParams.get('transferType')) result.transferType = searchParams.get('transferType')!;
    if (searchParams.get('multipleTransfers') === 'true') result.multipleTransfers = true;
    if (searchParams.get('cekura')) result.cekuraStatus = searchParams.get('cekura') as ShareableCallsState['cekuraStatus'];
    if (searchParams.get('sortBy')) result.sortBy = searchParams.get('sortBy')!;
    if (searchParams.get('sortOrder')) result.sortOrder = searchParams.get('sortOrder') as 'asc' | 'desc';
    if (searchParams.get('offset')) result.offset = parseInt(searchParams.get('offset')!, 10);
    if (searchParams.get('limit')) result.limit = parseInt(searchParams.get('limit')!, 10);

    const filtersParam = searchParams.get('filters');
    if (filtersParam) {
      try {
        result.dynamicFilters = JSON.parse(decodeURIComponent(filtersParam));
      } catch {
        // Invalid JSON
      }
    }
  }

  return result;
}

/**
 * Copy URL to clipboard and return success status
 */
export async function copyToClipboard(url: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(url);
    return true;
  } catch {
    // Fallback for older browsers
    const textArea = document.createElement('textarea');
    textArea.value = url;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand('copy');
      return true;
    } catch {
      return false;
    } finally {
      document.body.removeChild(textArea);
    }
  }
}
