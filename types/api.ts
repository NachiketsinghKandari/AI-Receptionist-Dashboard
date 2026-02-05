/**
 * API request/response types
 */

import type { CallListItem, Call, Email, Transfer, Webhook, Firm, SentryEvent } from './database';

// Sort order type
export type SortOrder = 'asc' | 'desc';

// Common filter types
export interface BaseFilters {
  showAll?: boolean;
  startDate?: string | null;
  endDate?: string | null;
  search?: string;
  limit?: number;
  offset?: number;
  sortBy?: string | null;
  sortOrder?: SortOrder | null;
}

// Dynamic filter types for flexible filtering
export type DynamicFilterCondition =
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'not_contains'
  | 'starts_with'
  | 'ends_with'
  | 'greater_than'
  | 'less_than'
  | 'greater_or_equal'
  | 'less_or_equal'
  | 'is_empty'
  | 'is_not_empty'
  | 'is_true'
  | 'is_false';

export interface DynamicFilter {
  field: string;
  condition: DynamicFilterCondition;
  value: string;
  combinator?: 'and' | 'or'; // How this filter connects to previous filters
}

export interface CallFilters extends BaseFilters {
  firmId?: number | null;
  callType?: string | null;
  callTypeValues?: string[] | null; // multiple call type values for OR combinator
  callTypeUseUnion?: boolean; // true = OR (match ANY), false = AND (impossible for single-value field)
  transferType?: string | null;
  transferTypeValues?: string[] | null; // multiple values for OR combinator
  transferTypeUseIntersection?: boolean; // true = AND (must match ALL types), false = OR (must match ANY type)
  platformCallId?: string | null;
  multipleTransfers?: boolean;
  correlationIds?: string[] | null;
  excludeCorrelationIds?: string[] | null; // For is_empty filter: exclude calls WITH these correlation IDs
  dynamicFilters?: DynamicFilter[] | null;
  excludeTransferType?: string | null;
  excludeTransferTypeValues?: string[] | null; // multiple exclude values for OR combinator
  excludeTransferTypeUseUnion?: boolean; // true = OR (exclude ANY), false = AND (exclude only if matches ALL)
  excludeCallType?: string | null;
  excludeCallTypeValues?: string[] | null; // multiple exclude call type values for OR combinator
  excludeCallTypeUseUnion?: boolean; // true = OR (exclude ANY), false = AND (exclude only if matches ALL)
  requireHasTransfer?: boolean | null; // true = must have transfer, false = must NOT have transfer
  toolCallResult?: 'transfer_executed' | 'transfer_completed' | 'transfer_cancelled' | 'other' | null; // last transfer result category
  toolCallResultValues?: string[] | null; // multiple values for OR combinator
  toolCallResultUseUnion?: boolean; // true = OR (match ANY), false = AND (impossible for single-value field)
  excludeToolCallResult?: 'transfer_executed' | 'transfer_completed' | 'transfer_cancelled' | 'other' | null; // exclude calls matching this category
  excludeToolCallResultValues?: string[] | null; // multiple exclude values for OR combinator
  excludeToolCallResultUseUnion?: boolean; // true = OR (exclude ANY), false = AND (exclude only if matches ALL)
  status?: string | null; // single status value
  statusValues?: string[] | null; // multiple status values for OR combinator
  statusUseUnion?: boolean; // true = OR (match ANY), false = AND (impossible for single-value field)
  excludeStatus?: string | null; // exclude calls matching this status
  excludeStatusValues?: string[] | null; // multiple exclude status values for OR combinator
  excludeStatusUseUnion?: boolean; // true = OR (exclude ANY), false = AND (exclude only if matches ALL)
  hasImpossibleCondition?: boolean; // true = contradictory filter (e.g., is_empty AND is_not_empty), should return 0 results
  _filtersHash?: string; // Hash of raw filters for cache invalidation when combinators change
}

export interface EmailFilters extends BaseFilters {
  firmId?: number | null;
  callId?: number | null;
  dynamicFilters?: DynamicFilter[] | null;
}

export interface TransferFilters extends BaseFilters {
  firmId?: number | null;
  callId?: number | null;
  status?: string | null;
  transferType?: string | null;
  dynamicFilters?: DynamicFilter[] | null;
  toolCallResult?: 'transfer_executed' | 'transfer_completed' | 'transfer_cancelled' | 'other' | null; // last transfer result category
}

export interface WebhookFilters extends BaseFilters {
  platform?: string | null;
  callId?: number | null;
  platformCallId?: string | null;
  multipleTransfers?: boolean;
}

export interface SentryFilters {
  correlationId?: string | null;
  query?: string;
  limit?: number;
  cursor?: string | null;
}

// API Responses
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
}

export type CallsResponse = PaginatedResponse<CallListItem>;

export interface CallDetailResponse {
  call: Call;
  transfers: Transfer[];
  emails: Email[];
  // webhooks fetched separately via useWebhooksForCall for better performance
}

export type EmailsResponse = PaginatedResponse<Email>;

export type TransfersResponse = PaginatedResponse<Transfer>;

export type WebhooksResponse = PaginatedResponse<Webhook>;

export interface FirmsResponse {
  firms: Firm[];
}

export interface StatsResponse {
  current: {
    totalCalls: number;
    avgDuration: number;
    transferRate: number;
    emailsSent: number;
  };
  previous: {
    totalCalls: number;
    avgDuration: number;
    transferRate: number;
    emailsSent: number;
  };
  chart: {
    data: ChartDataPoint[];
    isHourly: boolean;
  };
}

export interface ChartDataPoint {
  date: string;
  calls: number;
}

export interface SentryEventsResponse {
  events: SentryEvent[];
  hasMore: boolean;
  nextCursor: string | null;
}

// Auth types
export interface User {
  username: string;
  email?: string;
  id?: string;
  apps?: string[];
}

export interface Session {
  username: string;
  apps: string[];
  exp: number;
  iat: number;
}

// Flagged calls types
export type FlagType = 'sentry' | 'duration' | 'important' | 'transferMismatch';

export interface FlagReasons {
  sentry: boolean;
  duration: boolean;
  important: boolean;
  transferMismatch: boolean;
}

export interface FlaggedCallListItem extends CallListItem {
  flagReasons: FlagReasons;
}

export interface FlaggedFilters extends BaseFilters {
  firmId?: number | null;
  flagType?: FlagType | null;
}

export interface FlaggedCountResponse {
  count: number;
  breakdown: Record<FlagType, number>;
}

export type FlaggedCallsResponse = PaginatedResponse<FlaggedCallListItem>;

// EOD Reports types
export interface EODReportFilters extends BaseFilters {
  reportDate?: string | null;
}

// Filtered metric structure for EOD reports
// Only includes essential fields, excludes: extra, vocera_defined_metric_code
export interface CekuraMetricFiltered {
  id: number;
  name: string;
  type: string;
  score: number | null;
  score_normalized: number | null;
  explanation: string | null;
  function_name: string | null;
}

export interface CekuraEvaluationFiltered {
  metrics: CekuraMetricFiltered[];
}

export interface CekuraCallRawData {
  id: number;
  call_id: string;
  call_ended_reason: string | null;
  status: string;
  success: boolean;
  agent: string | null;
  dropoff_point: string | null;
  error_message: string | null;
  critical_categories: string[];
  evaluation: CekuraEvaluationFiltered | null;
  duration: number | null;
}

export interface SentryErrorRawData {
  id: string;
  title: string;
  message: string;
  level: string;
  timestamp: string;
  environment: string;
}

export interface EODCallRawData {
  correlation_id: string;
  cekura: CekuraCallRawData;
  sentry: {
    errors: SentryErrorRawData[];
  };
}

export interface EODRawData {
  count: number;              // total calls
  total: number;              // same as count (for clarity)
  errors: number;             // count of calls where status !== 'success'
  success: EODCallRawData[];  // calls where cekura.status === 'success'
  failure: EODCallRawData[];  // calls where cekura.status !== 'success'
  generated_at: string;
  environment: string;
}

export interface EODReport {
  id: string;
  report_date: string;
  raw_data: EODRawData;
  full_report: string | null;     // AI-generated full report (all calls)
  errors: number | null;          // Error count computed by AI
  success_report: string | null;  // AI-generated report for successful calls
  failure_report: string | null;  // AI-generated report for failed calls
  generated_at: string;
  trigger_type: 'scheduled' | 'manual';
}

export type EODReportType = 'success' | 'failure' | 'full';

export type EODReportsResponse = PaginatedResponse<EODReport>;

export interface GenerateEODReportRequest {
  reportDate: string; // YYYY-MM-DD format
}

export interface GenerateEODReportResponse {
  raw_data: EODRawData;
}
