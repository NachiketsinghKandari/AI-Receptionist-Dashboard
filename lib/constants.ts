/**
 * Constants matching unified_dashboard/shared.py
 */

// Environment configuration
export const ENVIRONMENTS = ['production', 'staging'] as const;
export type Environment = (typeof ENVIRONMENTS)[number];
export const DEFAULT_ENVIRONMENT: Environment = 'production';

// Cache configuration (in seconds)
export const CACHE_TTL_DATA = 60;  // 1 minute - data queries
export const CACHE_TTL_FIRMS = 300;  // 5 minutes - firms list (rarely changes)

// Pagination
export const DEFAULT_PAGE_LIMIT = 25;
export const MAX_PAGE_LIMIT = 100;

// Date range defaults
export const DEFAULT_DAYS_BACK = 7;

// Call types (DB values)
export const CALL_TYPES = [
  'All',
  'inbound',
  'new_case',
  'existing_case',
  'insurance',
  'vendor',
  'spanish',
  'escalation',
  'customer_success',
  'other',
  'medical_provider',
  'legal_system_caller',
] as const;

// Transfer types
export const TRANSFER_TYPES = [
  'Off',
  'warm',
  'two_way_opt_in',
  'live',
  'voicemail',
  'has_conversation',
] as const;

// Transfer statuses
export const TRANSFER_STATUSES = [
  'All',
  'completed',
  'failed',
  'in_progress',
] as const;

// Webhook platforms
export const WEBHOOK_PLATFORMS = [
  'All',
  'vapi',
  'sentry',
  'make',
  'twilio',
] as const;

// Sentry event levels
export const SENTRY_LEVELS = [
  'All',
  'error',
  'warning',
  'info',
] as const;

// Tool call result categories (from webhook transfer_call results)
export const TOOL_CALL_RESULTS = [
  'transfer_executed',
  'transfer_completed',
  'transfer_cancelled',
  'other',
] as const;
