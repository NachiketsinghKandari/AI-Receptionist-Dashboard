/**
 * Field definitions for dynamic filter builder
 * Defines filterable fields for each data type
 */

import type { FilterFieldDefinition } from '@/components/filters/dynamic-filter-builder';
import { CALL_TYPES, TRANSFER_TYPES, TRANSFER_STATUSES } from '@/lib/constants';

// Call fields that can be filtered
export const CALL_FILTER_FIELDS: FilterFieldDefinition[] = [
  { key: 'id', label: 'Call ID', type: 'number' },
  { key: 'platform_call_id', label: 'Correlation ID', type: 'text' },
  { key: 'caller_name', label: 'Caller Name', type: 'text' },
  { key: 'phone_number', label: 'Phone Number', type: 'text' },
  {
    key: 'call_type',
    label: 'Call Type',
    type: 'select',
    options: CALL_TYPES.filter((t) => t !== 'All').map((t) => ({ value: t, label: t })),
  },
  {
    key: 'transfer_type',
    label: 'Transfer Type',
    type: 'select',
    options: TRANSFER_TYPES.filter((t) => t !== 'Off').map((t) => ({ value: t, label: t })),
  },
  {
    key: 'status',
    label: 'Status',
    type: 'select',
    options: [
      { value: 'completed', label: 'Completed' },
      { value: 'active', label: 'Active' },
      { value: 'failed', label: 'Failed' },
    ],
  },
  {
    key: 'cekura_status',
    label: 'Cekura Status',
    type: 'select',
    options: [
      { value: 'success', label: 'Success' },
      { value: 'failure', label: 'Failure' },
      { value: 'other', label: 'Other' },
    ],
  },
  { key: 'call_duration', label: 'Duration (seconds)', type: 'number' },
  { key: 'started_at', label: 'Started At', type: 'date' },
  { key: 'firm_id', label: 'Firm ID', type: 'number' },
  { key: 'multiple_transfers', label: 'Multiple Transfers', type: 'boolean' },
];

// Email fields that can be filtered
export const EMAIL_FILTER_FIELDS: FilterFieldDefinition[] = [
  { key: 'id', label: 'Email ID', type: 'number' },
  { key: 'call_id', label: 'Call ID', type: 'number' },
  { key: 'subject', label: 'Subject', type: 'text' },
  {
    key: 'email_type',
    label: 'Email Type',
    type: 'select',
    options: [
      { value: 'confirmation', label: 'Confirmation' },
      { value: 'follow_up', label: 'Follow Up' },
      { value: 'important', label: 'Important' },
    ],
  },
  {
    key: 'status',
    label: 'Status',
    type: 'select',
    options: [
      { value: 'sent', label: 'Sent' },
      { value: 'failed', label: 'Failed' },
      { value: 'pending', label: 'Pending' },
    ],
  },
  { key: 'sent_at', label: 'Sent At', type: 'date' },
  { key: 'firm_id', label: 'Firm ID', type: 'number' },
];

// Transfer fields that can be filtered
export const TRANSFER_FILTER_FIELDS: FilterFieldDefinition[] = [
  { key: 'id', label: 'Transfer ID', type: 'number' },
  { key: 'call_id', label: 'Call ID', type: 'number' },
  {
    key: 'transfer_type',
    label: 'Transfer Type',
    type: 'select',
    options: TRANSFER_TYPES.filter((t) => t !== 'Off').map((t) => ({ value: t, label: t })),
  },
  {
    key: 'transfer_status',
    label: 'Status',
    type: 'select',
    options: TRANSFER_STATUSES.filter((s) => s !== 'All').map((s) => ({ value: s, label: s })),
  },
  { key: 'transferred_to_name', label: 'Recipient Name', type: 'text' },
  { key: 'transferred_to_phone_number', label: 'Recipient Phone', type: 'text' },
  { key: 'transfer_started_at', label: 'Started At', type: 'date' },
  { key: 'time_to_pickup_seconds', label: 'Pickup Time (seconds)', type: 'number' },
  { key: 'firm_id', label: 'Firm ID', type: 'number' },
];

// Webhook fields that can be filtered
export const WEBHOOK_FILTER_FIELDS: FilterFieldDefinition[] = [
  { key: 'id', label: 'Webhook ID', type: 'number' },
  { key: 'call_id', label: 'Call ID', type: 'number' },
  { key: 'platform_call_id', label: 'Correlation ID', type: 'text' },
  {
    key: 'platform',
    label: 'Platform',
    type: 'select',
    options: [
      { value: 'vapi', label: 'VAPI' },
      { value: 'sentry', label: 'Sentry' },
      { value: 'make', label: 'Make' },
      { value: 'twilio', label: 'Twilio' },
    ],
  },
  { key: 'received_at', label: 'Received At', type: 'date' },
];
