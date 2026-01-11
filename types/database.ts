/**
 * Database types matching Supabase tables
 * Ported from unified_dashboard/shared.py
 */

export interface Call {
  id: number;
  platform_call_id: string | null;
  caller_name: string;
  phone_number: string;
  call_type: string;
  status: string;
  started_at: string;
  call_duration: number | null;
  firm_id: number;
  platform: string | null;
  transcription: string | null;
  summary: string | null;
  recording_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface CallListItem {
  id: number;
  platform_call_id: string | null;
  caller_name: string;
  phone_number: string;
  call_type: string;
  status: string;
  started_at: string;
  call_duration: number | null;
  firm_id: number;
  platform: string | null;
}

export interface Email {
  id: number;
  call_id: number;
  firm_id: number;
  subject: string;
  recipients: string[];
  email_type: string;
  status: string;
  sent_at: string;
  body: string | null;
  created_at: string;
}

export interface Transfer {
  id: number;
  call_id: number;
  firm_id: number;
  transfer_type: string;
  transfer_status: string;
  transferred_to_name: string;
  transferred_to_phone_number: string;
  transfer_started_at: string;
  supervisor_answered_at: string | null;
  time_to_pickup_seconds: number | null;
  supervisor_identity: string | null;
  consultation_room_name: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  platform_call_id?: string | null; // Joined from calls table
}

export interface Webhook {
  id: number;
  call_id: number | null;
  platform: string;
  platform_call_id: string;
  webhook_type: string;
  received_at: string;
  payload: Record<string, unknown>;
}

export interface Firm {
  id: number;
  name: string;
}

export interface SentryEvent {
  event_id: string;
  message: string;
  title: string;
  level: 'info' | 'warning' | 'error';
  event_type: string;
  timestamp: string;
  transaction: string;
  logger: string;
  environment: string;
  tags: Record<string, string>;
  request?: {
    url: string;
    method: string;
    headers: Array<{ key: string; value: string }>;
    body: Record<string, unknown> | null;
    query: string | null;
    content_type: string | null;
  };
  context?: Record<string, unknown>;
  exception_type?: string;
  exception_value?: string;
}
