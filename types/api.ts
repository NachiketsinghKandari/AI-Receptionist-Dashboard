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

export interface CallFilters extends BaseFilters {
  firmId?: number | null;
  callType?: string | null;
  transferType?: string | null;
  platformCallId?: string | null;
  multipleTransfers?: boolean;
}

export interface EmailFilters extends BaseFilters {
  firmId?: number | null;
  callId?: number | null;
}

export interface TransferFilters extends BaseFilters {
  firmId?: number | null;
  callId?: number | null;
  status?: string | null;
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
  apps: string[];
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
