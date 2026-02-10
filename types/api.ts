/**
 * API request/response types
 */

import type { CallListItem, Call, Email, Transfer, Webhook, Firm, SentryEvent } from './database';

// Sort order type
export type SortOrder = 'asc' | 'desc';

// Cekura status filter categories
export type CekuraStatusCategory = 'success' | 'failure' | 'reviewed_success' | 'reviewed_failure' | 'other';
export type CekuraStatusFilter = 'all' | CekuraStatusCategory;

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
  searchFeedbackCorrelationIds?: string[] | null; // Correlation IDs matching feedback text for search OR condition
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
export type EODReportCategory = 'eod' | 'weekly';

export interface EODReportFilters extends BaseFilters {
  reportDate?: string | null;
  firmId?: number | null;
  reportCategory?: EODReportCategory | null;
}

// Filtered metric structure for EOD reports
// Only includes essential fields: id, name, and score OR enum (mutually exclusive)
export interface CekuraMetricFiltered {
  id: number;
  name: string;
  score?: number | null;  // Present when metric type is not 'enum'
  enum?: string | null;   // Present when metric type is 'enum'
}

export interface CekuraEvaluationFiltered {
  metrics: CekuraMetricFiltered[];
}

export interface CekuraCallRawData {
  id: number;
  call_id: string;
  call_ended_reason: string | null;
  status: string;
  is_reviewed: boolean;
  feedback: string | null;
  duration: string | null;  // Duration as string (e.g., "01:26")
  agent: string | null;
  dropoff_point: string | null;
  error_message: string | null;
  critical_categories: string[];
  evaluation: CekuraEvaluationFiltered | null;
}

export interface SentryErrorRawData {
  id: string;
  title: string;
  message: string;
  level: string;
  timestamp: string;
  environment: string;
}

// Transfer data sourced from transfers_details table
export interface EODTransferData {
  destination: string;  // transferred_to_name from transfers_details
  mode: 'transfer_direct' | 'transfer_experimental_voicemail' | 'transfer_experimental_pickup';
  result: string;       // transfer_status; "cancelled" if error_message contains "failed due to user hangup"
}

export interface EODStructuredOutput {
  name: string;
  result: unknown;  // Can be string, boolean, or object
}

export interface EODCallRawData {
  correlation_id: string;
  caller_type: string | null;  // From calls.call_type in database
  no_action_needed: boolean;  // True if email subject contains "No action needed"
  message_taken: boolean;     // True if email body contains "took a message"
  is_disconnected: boolean;   // True if cekura "Disconnection rate" metric score != 5
  structured_outputs: EODStructuredOutput[];  // From webhook payload structuredOutputs
  structured_output_failure: boolean;  // True if any structured output indicates a failure
  cekura: CekuraCallRawData;
  sentry: {
    errors: SentryErrorRawData[];
  };
  transfers: EODTransferData[];  // From transfers_details table
}

export interface EODTransferDestinationStats {
  attempts: number;  // total transfer attempts to this destination
  failed: number;    // transfers where result !== 'completed'
}

export interface EODTransferReport {
  attempts_count: number;                                        // total transfer attempts across all calls
  failure_count: number;                                        // transfers with result !== 'completed'
  transfers_map: Record<string, EODTransferDestinationStats>;    // destination -> stats, sorted by count descending
}

export interface EODCSEscalation {
  correlation_id: string;
  failed_tool_calls: string[];  // names of tool calls that failed
}

export interface EODFirm {
  id: number;
  name: string;
}

export interface EODRawData {
  // Metrics
  count: number;              // total calls
  failure_count: number;      // count of calls where status !== 'success'
  total_call_time: number;    // sum of all call durations (in seconds)
  time_saved: number;         // sum of durations (in seconds) where no_action_needed is true
  messages_taken: number;     // count of calls where message_taken is true
  disconnection_rate: number; // percentage of calls where is_disconnected is true
  cs_escalation_count: number; // calls transferred to "Customer Success" with structured_output_failure
  cs_escalation_map: EODCSEscalation[];  // details of each CS escalation
  transfers_report: EODTransferReport;  // aggregate transfer statistics
  // Context
  firm_id?: number | null;    // optional firm filter used during generation
  firm_name?: string | null;  // firm name for display purposes
  firms?: EODFirm[];          // list of firms covered by this report
  report_date: string;        // YYYY-MM-DD date for this report
  generated_at: string;
  environment: string;
  // Call data
  success: EODCallRawData[];  // calls where cekura.status === 'success'
  failure: EODCallRawData[];  // calls where cekura.status !== 'success'
  // Weekly report fields
  week_start?: string;        // YYYY-MM-DD Monday of the week (weekly reports only)
  week_end?: string;          // YYYY-MM-DD Sunday of the week (weekly reports only)
}

// Weekly reports omit individual call arrays — only aggregated metrics
export type WeeklyRawData = Omit<EODRawData, 'success' | 'failure'> & {
  week_start: string;   // YYYY-MM-DD Monday
  week_end: string;     // YYYY-MM-DD Sunday
};

export interface EODReport {
  id: string;
  report_date: string;
  raw_data: EODRawData | WeeklyRawData;
  full_report: string | null;     // AI-generated full report (all calls)
  errors: number | null;          // Error count computed by AI
  success_report: string | null;  // AI-generated report for successful calls
  failure_report: string | null;  // AI-generated report for failed calls
  generated_at: string;
  trigger_type: 'scheduled' | 'manual';
  report_type?: EODReportCategory; // 'eod' or 'weekly' — optional for backward compat
  firm_id?: number | null;        // null = all firms, number = firm-specific report
}

export type EODReportType = 'success' | 'failure' | 'full' | 'weekly';

export type DataFormat = 'json' | 'toon';

export type EODReportsResponse = PaginatedResponse<EODReport>;

export interface GenerateEODReportRequest {
  reportDate: string; // YYYY-MM-DD format
}

export interface GenerateEODReportResponse {
  raw_data: EODRawData;
}

export interface GenerateWeeklyReportResponse {
  raw_data: WeeklyRawData;
  week_start: string;
  week_end: string;
  eod_reports_used: number;
}

// Accurate Transcript types (Gemini-powered transcription accuracy evaluation)
export interface TranscriptionCorrection {
  original: string;
  corrected: string;
  source: 'audio' | 'tool_call' | 'context_inference';
  evidence: string;
}

export interface AccurateUtterance {
  role: 'assistant' | 'user';
  content: string;
  original_transcription: string;
  corrections: TranscriptionCorrection[];
}

export interface MajorCorrection {
  original: string;
  corrected: string;
  category: 'name' | 'data' | 'number' | 'missing_speech' | 'meaning_change';
  source: 'audio' | 'tool_call' | 'context_inference';
  evidence: string;
}

export interface TranscriptionAccuracyResult {
  accurate_transcript: AccurateUtterance[];
  accuracy_score: number;
  total_utterances: number;
  corrected_utterances: number;
  correction_categories: {
    name_corrections: number;
    data_corrections: number;
    number_corrections: number;
    missing_speech: number;
    word_corrections: number;
    filler_omissions: number;
  };
  major_corrections: MajorCorrection[];
}

export interface AccurateTranscriptResponse {
  result: TranscriptionAccuracyResult;
}

// Login API types
export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  expires_at: number;
  token_type: 'bearer';
  user: {
    id: string;
    email: string;
  };
}
