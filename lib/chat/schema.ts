/**
 * DDL schema for all dashboard tables.
 * Provided to Gemini so it can generate accurate SQL.
 */

export const DATABASE_SCHEMA = `
-- Table: calls
-- The primary table. Every phone call handled by the AI legal intake system is logged here.
-- Use this table when the user asks about calls, call volume, call durations, caller info, or call types.
CREATE TABLE calls (
  id            serial PRIMARY KEY,              -- Internal auto-increment ID
  platform_call_id text,                         -- External call ID from the telephony platform (e.g. Vapi, Twilio). Used to cross-reference with webhooks
  caller_name   text NOT NULL,                   -- Name of the person who called (collected during intake)
  phone_number  text NOT NULL,                   -- Caller's phone number in E.164 or national format
  call_type     text NOT NULL,                   -- Category of the call. Values: 'inbound' (general), 'new_case' (potential new client), 'existing_case' (follow-up on existing matter), 'insurance' (insurance-related), 'vendor' (vendor call), 'spanish' (Spanish-language intake), 'escalation' (escalated to human), 'customer_success' (CS team), 'other', 'medical_provider' (medical provider calling about a case), 'legal_system_caller' (courts/opposing counsel)
  status        text NOT NULL,                   -- Final outcome of the call. Values: 'completed' (normal end), 'failed' (system error), 'in_progress' (still active), 'no_answer', 'busy', 'voicemail'
  started_at    timestamptz NOT NULL,            -- When the call began. PRIMARY date column for filtering calls by time range
  call_duration integer,                         -- Total call length in SECONDS. Divide by 60 for minutes. NULL if call didn't connect
  firm_id       integer NOT NULL REFERENCES firms(id), -- The law firm this call belongs to. Join with firms table to get firm name
  platform      text,                            -- Telephony platform that handled the call. Values: 'vapi', 'twilio', etc.
  transcription text,                            -- Full text transcript of the call conversation. Can be very long. Avoid selecting unless specifically asked
  summary       text,                            -- AI-generated summary of the call. Shorter than transcription. Good for quick overviews
  recording_url text,                            -- URL to the call recording audio file
  created_at    timestamptz NOT NULL DEFAULT now(), -- Row creation timestamp (when the record was saved to DB, not when call started)
  updated_at    timestamptz NOT NULL DEFAULT now()  -- Last modification timestamp
);

-- Table: firms
-- Law firms / legal organizations that use HelloCounsel. Every call, transfer, and email belongs to a firm.
-- Use this table when the user asks about firms, firm names, or wants to group/filter data by firm.
CREATE TABLE firms (
  id   serial PRIMARY KEY,                       -- Internal firm ID. Referenced by calls.firm_id, transfers_details.firm_id, email_logs.firm_id, eod_reports.firm_id
  name text NOT NULL                             -- Display name of the law firm (e.g. "Smith & Associates", "Johnson Legal Group")
);

-- Table: transfers_details
-- Records of call transfers — when the AI agent transfers a caller to a human (attorney, paralegal, supervisor).
-- Use this table when the user asks about transfers, pickup times, transfer success/failure, or warm/live transfers.
CREATE TABLE transfers_details (
  id                          serial PRIMARY KEY,              -- Internal auto-increment ID
  call_id                     integer NOT NULL REFERENCES calls(id), -- The call that was transferred. Join with calls to get caller info
  firm_id                     integer NOT NULL REFERENCES firms(id), -- The firm this transfer belongs to
  transfer_type               text NOT NULL,                   -- How the transfer was performed. Values: 'warm' (agent stays on while connecting), 'two_way_opt_in' (both parties consent), 'live' (direct connect to live person), 'voicemail' (transferred to voicemail box), 'has_conversation' (agent had a conversation with supervisor before connecting caller)
  transfer_status             text NOT NULL,                   -- Outcome of the transfer attempt. Values: 'completed' (successfully connected), 'failed' (transfer did not succeed, e.g. no answer), 'in_progress' (transfer still active)
  transferred_to_name         text NOT NULL,                   -- Name of the person the call was transferred to (e.g. attorney name, "Front Desk")
  transferred_to_phone_number text NOT NULL,                   -- Phone number the call was transferred to
  transfer_started_at         timestamptz NOT NULL,            -- When the transfer was initiated. PRIMARY date column for filtering transfers by time range
  supervisor_answered_at      timestamptz,                     -- When the human recipient picked up. NULL if they didn't answer
  time_to_pickup_seconds      integer,                         -- Seconds between transfer initiation and supervisor answering. NULL if not answered. Key metric for responsiveness
  supervisor_identity         text,                            -- Identifier of who answered (e.g. extension number, name from phone system)
  consultation_room_name      text,                            -- Name of the virtual consultation room (for warm transfers where all parties join)
  error_message               text,                            -- Error description if transfer_status = 'failed' (e.g. "No answer after 30s", "Number unreachable")
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

-- Table: email_logs
-- Email notifications sent by the system after calls (intake summaries, transfer confirmations, etc.).
-- Use this table when the user asks about emails, email delivery, or notifications sent to firms.
CREATE TABLE email_logs (
  id         serial PRIMARY KEY,                 -- Internal auto-increment ID
  call_id    integer NOT NULL REFERENCES calls(id), -- The call that triggered this email. Join with calls for call details
  firm_id    integer NOT NULL REFERENCES firms(id), -- The firm this email was sent for
  subject    text NOT NULL,                      -- Email subject line
  recipients text[] NOT NULL,                    -- PostgreSQL text array of recipient email addresses
  email_type text NOT NULL,                      -- Category of the email (e.g. 'intake_summary', 'transfer_notification', 'voicemail_alert')
  status     text NOT NULL,                      -- Delivery status. Values: 'sent' (successfully delivered), 'failed' (delivery error), 'pending' (queued, not yet sent)
  sent_at    timestamptz NOT NULL,               -- When the email was sent. PRIMARY date column for filtering emails by time range
  body       text,                               -- Full HTML/text body of the email. Can be long. Avoid selecting unless specifically asked
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Table: webhook_dumps
-- Raw webhook payloads received from external platforms. Used for debugging and auditing.
-- Use this table when the user asks about webhooks, platform events, or raw event data.
CREATE TABLE webhook_dumps (
  id               serial PRIMARY KEY,           -- Internal auto-increment ID
  call_id          integer,                      -- Associated call ID. NULL if the webhook isn't tied to a specific call
  platform         text NOT NULL,                -- Source platform. Values: 'vapi' (AI voice agent), 'sentry' (error tracking), 'make' (automation platform), 'twilio' (telephony)
  platform_call_id text NOT NULL,                -- The call ID as known by the external platform
  webhook_type     text NOT NULL,                -- Type of webhook event (e.g. 'call.completed', 'call.started', 'error', 'transfer.completed')
  received_at      timestamptz NOT NULL,         -- When the webhook was received. PRIMARY date column for filtering webhooks by time range
  payload          jsonb NOT NULL                -- Full raw JSON payload from the platform. Use jsonb operators (->>, ->) to query specific fields
);

-- Table: eod_reports
-- End-of-day report records. Tracks which daily summary reports have been generated for each firm.
-- Use this table when the user asks about EOD reports, daily reports, or report generation history.
CREATE TABLE eod_reports (
  id         serial PRIMARY KEY,                 -- Internal auto-increment ID
  firm_id    integer NOT NULL REFERENCES firms(id), -- The firm this report was generated for
  report_date date NOT NULL,                     -- The date the report covers (not when it was generated)
  created_at timestamptz NOT NULL DEFAULT now()  -- When the report record was created
);
`.trim();

export const SCHEMA_NOTES = `
Key relationships:
- calls.firm_id → firms.id
- transfers_details.call_id → calls.id
- transfers_details.firm_id → firms.id
- email_logs.call_id → calls.id
- email_logs.firm_id → firms.id
- webhook_dumps.call_id → calls.id (nullable)
- eod_reports.firm_id → firms.id

Table selection guide (use this to decide which table to query):
- "calls", "call volume", "callers", "phone calls", "duration", "how long", "call types" → calls table
- "firms", "law firm", "organization", "company", "client" → firms table (often joined with other tables)
- "transfers", "transferred", "pickup time", "warm transfer", "live transfer", "voicemail", "supervisor" → transfers_details table
- "emails", "notifications", "sent", "delivery", "email status" → email_logs table
- "webhooks", "events", "payloads", "platform events", "vapi events" → webhook_dumps table
- "reports", "EOD", "end of day", "daily report" → eod_reports table

Common query patterns:
- Join calls with firms using calls.firm_id = firms.id to get firm names
- Join transfers_details with calls using transfers_details.call_id = calls.id to get caller info for a transfer
- Filter by date range: use started_at (calls), transfer_started_at (transfers), sent_at (emails), received_at (webhooks)
- Group by firm: JOIN with firms and GROUP BY firms.name
- call_duration is in SECONDS — divide by 60 for minutes, by 3600 for hours
- time_to_pickup_seconds is in SECONDS — this measures how fast a supervisor answered a transfer
- Use DATE(started_at) or DATE_TRUNC('day', started_at) for daily aggregation
- Use DATE_TRUNC('week', started_at) or DATE_TRUNC('month', started_at) for weekly/monthly rollups
- For "today", use WHERE started_at >= CURRENT_DATE
- For "last N days", use WHERE started_at >= NOW() - INTERVAL 'N days'
`.trim();
