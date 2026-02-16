# API Reference

All API routes follow the BFF (Backend-for-Frontend) pattern. External credentials (Supabase service keys, Sentry token, Cekura API key) are kept server-side.

## Table of Contents

- [Authentication](#authentication)
- [Common Parameters](#common-parameters)
- [Common Response Shape](#common-response-shape)
- [Auth API](#auth-api)
- [Calls API](#calls-api)
- [Emails API](#emails-api)
- [Transfers API](#transfers-api)
- [Webhooks API](#webhooks-api)
- [Stats API](#stats-api)
- [Firms API](#firms-api)
- [Sentry API](#sentry-api)
- [Cekura API](#cekura-api)
- [Reports API](#reports-api)
- [Chat API](#chat-api)
- [Admin Config API](#admin-config-api)
- [Client Config API](#client-config-api)
- [Analytics API](#analytics-api)
- [Accurate Transcript API](#accurate-transcript-api)
- [Cross-Cutting Concerns](#cross-cutting-concerns)

## Authentication

All routes (except `POST /api/auth/login`) require authentication via `authenticateRequest()`.

### Authentication Methods

| Method | Header | How It Works |
|--------|--------|-------------|
| Cookie (Browser) | None (sb-* cookies sent automatically) | proxy.ts validates session, API route trusts proxy |
| Bearer Token | `Authorization: Bearer <token>` | API route validates token via `supabase.auth.getUser(token)` |
| Basic Auth | `Authorization: Basic <base64(email:password)>` | API route validates via `supabase.auth.signInWithPassword()` |

## Common Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `env` | `'production' \| 'staging'` | `'production'` | Supabase environment to query |
| `limit` | number | 25 | Results per page (max 100) |
| `offset` | number | 0 | Pagination offset |
| `sortBy` | string | varies | Sort column |
| `sortOrder` | `'asc' \| 'desc'` | `'desc'` | Sort direction |
| `startDate` | ISO date | - | Filter start date |
| `endDate` | ISO date | - | Filter end date |
| `search` | string | - | Search term (escaped for SQL safety) |
| `firmId` | number | - | Filter by firm ID |
| `dynamicFilters` | JSON | - | Advanced filter array |

## Common Response Shape

### Success Response (Paginated)

```json
{
  "data": [...],
  "total": number,
  "limit": number,
  "offset": number
}
```

### Error Response

```json
{
  "error": "message",
  "code": "ERROR_CODE",
  "details": "optional"
}
```

---

## Auth API

### POST `/api/auth/login`

Authenticate user and receive access token.

**Authentication**: Public

**Request Body**:
```json
{
  "email": "string",
  "password": "string"
}
```

**Response** (200):
```json
{
  "access_token": "string",
  "refresh_token": "string",
  "expires_in": number,
  "expires_at": number,
  "token_type": "bearer",
  "user": {
    "id": "string",
    "email": "string"
  }
}
```

**Error Codes**:
- `400` - Missing email or password
- `401` - Invalid credentials
- `500` - Configuration error (missing Supabase credentials)

---

### POST `/api/auth/logout`

Logout current user session.

**Authentication**: Required (Cookie-based)

**Response** (200):
```json
{
  "success": true
}
```

---

### GET `/api/auth/session`

Get current session information.

**Authentication**: Required (Cookie-based)

**Response** (200):
```json
{
  "authenticated": true,
  "user": {
    "email": "string",
    "id": "string",
    "username": "string"
  }
}
```

**Response** (401):
```json
{
  "authenticated": false
}
```

---

## Calls API

### GET `/api/calls`

List calls with filtering, sorting, and pagination.

**Authentication**: Required

**Query Parameters**:

**Pagination**:
- `limit` - Results per page (default: 25, max: 100)
- `offset` - Pagination offset (default: 0)

**Sorting**:
- `sortBy` - Column to sort by: `id` | `started_at` | `call_duration` (default: `id`)
- `sortOrder` - Sort direction: `asc` | `desc` (default: `desc`)

**Basic Filters**:
- `env` - Environment: `production` | `staging` (default: `production`)
- `firmId` - Filter by firm ID
- `callType` - Single call type filter
- `callTypeValues` - CSV list of call types
- `platformCallId` - Filter by platform call ID
- `startDate` - Filter by start date (ISO format)
- `endDate` - Filter by end date (ISO format)
- `search` - Search term (searches: caller_name, phone_number, summary, platform_call_id via ilike, id via exact match)
- `status` - Single status filter
- `statusValues` - CSV list of statuses

**Transfer Filters**:
- `transferType` - Single transfer type filter
- `transferTypeValues` - CSV list of transfer types
- `multipleTransfers` - Boolean filter for multiple transfers
- `requireHasTransfer` - Boolean filter requiring at least one transfer

**Exclude Filters**:
- `excludeTransferType` - Exclude single transfer type
- `excludeTransferTypeValues` - CSV list of transfer types to exclude
- `excludeTransferTypeUseUnion` - Use OR logic for exclusion
- `excludeCallType` - Exclude single call type
- `excludeCallTypeValues` - CSV list of call types to exclude
- `excludeCallTypeUseUnion` - Use OR logic for exclusion
- `excludeStatus` - Exclude single status
- `excludeStatusValues` - CSV list of statuses to exclude
- `excludeStatusUseUnion` - Use OR logic for exclusion

**Tool Call Filters**:
- `toolCallResult` - Single tool call result filter
- `toolCallResultValues` - CSV list of tool call results
- `excludeToolCallResult` - Exclude single tool call result
- `excludeToolCallResultValues` - CSV list of tool call results to exclude

**Cekura Filters**:
- `correlationIds` - CSV list of correlation IDs to include
- `excludeCorrelationIds` - CSV list of correlation IDs to exclude

**Dynamic Filters**:
- `dynamicFilters` - JSON array of advanced filters

**Response** (200):
```json
{
  "data": [
    {
      "id": number,
      "platform_call_id": "string",
      "caller_name": "string | null",
      "phone_number": "string",
      "started_at": "ISO timestamp",
      "call_duration": number,
      "summary": "string | null",
      "firm_id": number,
      "status": "string | null",
      "call_type": "string | null",
      "correlation_id": "string | null",
      "transfer_count": number,
      "email_count": number
    }
  ],
  "total": number,
  "limit": number,
  "offset": number
}
```

---

### GET `/api/calls/[id]`

Get detailed information for a specific call.

**Authentication**: Required

**URL Parameters**:
- `id` - Call ID (numeric) or correlation ID (UUID)

**Query Parameters**:
- `env` - Environment (default: `production`)

**Response** (200):
```json
{
  "call": {
    "id": number,
    "platform_call_id": "string",
    "caller_name": "string | null",
    "phone_number": "string",
    "started_at": "ISO timestamp",
    "call_duration": number,
    "summary": "string | null",
    "firm_id": number,
    "status": "string | null",
    "call_type": "string | null",
    "correlation_id": "string | null",
    "ended_at": "ISO timestamp | null",
    "created_at": "ISO timestamp"
  },
  "transfers": [
    {
      "id": number,
      "call_id": number,
      "transfer_type": "string | null",
      "transfer_status": "string | null",
      "transferred_to_name": "string | null",
      "transferred_to_phone_number": "string | null",
      "transfer_started_at": "ISO timestamp | null",
      "time_to_pickup_seconds": "number | null"
    }
  ],
  "emails": [
    {
      "id": number,
      "call_id": number,
      "subject": "string",
      "email_type": "string",
      "status": "string",
      "sent_at": "ISO timestamp"
    }
  ]
}
```

**Error Codes**:
- `400` - Invalid ID format
- `404` - Call not found

---

### GET `/api/calls/flagged`

List calls flagged for review.

**Authentication**: Required

**Query Parameters**:
- `env` - Environment (default: `production`)
- `firmId` - Filter by firm ID
- `flagType` - Flag type: `sentry` | `duration` | `important` | `transferMismatch`
- `startDate` - Filter by start date
- `endDate` - Filter by end date
- `search` - Search term
- `limit` - Results per page (default: 25, max: 100)
- `offset` - Pagination offset (default: 0)
- `sortBy` - Column to sort by (default: `started_at`)
- `sortOrder` - Sort direction: `asc` | `desc` (default: `desc`)

**Response** (200):
```json
{
  "data": [
    {
      "id": number,
      "platform_call_id": "string",
      "caller_name": "string | null",
      "phone_number": "string",
      "started_at": "ISO timestamp",
      "call_duration": number,
      "summary": "string | null",
      "firm_id": number,
      "correlation_id": "string | null",
      "flagReasons": ["string"]
    }
  ],
  "total": number,
  "limit": number,
  "offset": number
}
```

---

### GET `/api/calls/flagged/count`

Get total count of flagged calls and breakdown by flag type.

**Authentication**: Required

**Query Parameters**:
- `env` - Environment (default: `production`)

**Response** (200):
```json
{
  "count": number,
  "breakdown": {
    "sentry": number,
    "duration": number,
    "important": number,
    "transferMismatch": number
  }
}
```

---

### GET `/api/calls/important`

Get list of call IDs marked as important.

**Authentication**: Required

**Query Parameters**:
- `env` - Environment (default: `production`)

**Response** (200):
```json
{
  "callIds": [number]
}
```

---

### GET `/api/calls/transfer-email-mismatch`

Get list of call IDs with transfer/email mismatch issues.

**Authentication**: Required

**Query Parameters**:
- `env` - Environment (default: `production`)

**Response** (200):
```json
{
  "callIds": [number]
}
```

---

### GET `/api/calls/date-range`

Get the minimum and maximum call dates in the database.

**Authentication**: Required

**Query Parameters**:
- `env` - Environment (default: `production`)

**Response** (200):
```json
{
  "minDate": "ISO timestamp",
  "maxDate": "ISO timestamp"
}
```

---

### POST `/api/calls/[id]/accurate-transcript`

Generate an accurate transcript correction using Gemini.

**Authentication**: Required

**URL Parameters**:
- `id` - Call ID

**Request Body**:
```json
{
  "recordingUrl": "string",
  "webhookPayload": {},
  "firmName": "string (optional)",
  "env": "production | staging"
}
```

**Response** (200):
```json
{
  "result": {
    "correctedTranscript": "string",
    "corrections": [
      {
        "original": "string",
        "corrected": "string",
        "reason": "string"
      }
    ],
    "confidence": number
  }
}
```

**Error Codes**:
- `400` - Missing required fields
- `500` - Transcription error

---

## Emails API

### GET `/api/emails`

List emails with filtering, sorting, and pagination.

**Authentication**: Required

**Query Parameters**:
- `env` - Environment (default: `production`)
- `callId` - Filter by call ID
- `firmId` - Filter by firm ID
- `startDate` - Filter by sent date (start)
- `endDate` - Filter by sent date (end)
- `search` - Search term (searches: subject, email_type, status via ilike, id and call_id via exact match)
- `limit` - Results per page (default: 25, max: 100)
- `offset` - Pagination offset (default: 0)
- `sortBy` - Column to sort by (default: `sent_at`)
- `sortOrder` - Sort direction: `asc` | `desc` (default: `desc`)
- `dynamicFilters` - JSON array of advanced filters

**Dynamic Filter Columns**:
- `id`, `call_id`, `subject`, `email_type`, `status`, `sent_at`, `firm_id`

**Response** (200):
```json
{
  "data": [
    {
      "id": number,
      "call_id": number,
      "subject": "string",
      "email_type": "string",
      "status": "string",
      "sent_at": "ISO timestamp",
      "firm_id": number
    }
  ],
  "total": number,
  "limit": number,
  "offset": number
}
```

---

## Transfers API

### GET `/api/transfers`

List transfers with filtering, sorting, and pagination.

**Authentication**: Required

**Query Parameters**:
- `env` - Environment (default: `production`)
- `callId` - Filter by call ID
- `firmId` - Filter by firm ID
- `status` - Filter by transfer status
- `transferType` - Filter by transfer type
- `startDate` - Filter by transfer started date (start)
- `endDate` - Filter by transfer started date (end)
- `search` - Search term (searches: transferred_to_name, transferred_to_phone_number, transfer_type, transfer_status via ilike)
- `toolCallResult` - Filter by tool call result
- `limit` - Results per page (default: 25, max: 100)
- `offset` - Pagination offset (default: 0)
- `sortBy` - Column to sort by (default: `transfer_started_at`)
- `sortOrder` - Sort direction: `asc` | `desc` (default: `desc`)
- `dynamicFilters` - JSON array of advanced filters

**Dynamic Filter Columns**:
- `id`, `call_id`, `transfer_type`, `transfer_status`, `transferred_to_name`, `transferred_to_phone_number`, `transfer_started_at`, `time_to_pickup_seconds`, `firm_id`

**Response** (200):
```json
{
  "data": [
    {
      "id": number,
      "call_id": number,
      "transfer_type": "string | null",
      "transfer_status": "string | null",
      "transferred_to_name": "string | null",
      "transferred_to_phone_number": "string | null",
      "transfer_started_at": "ISO timestamp | null",
      "time_to_pickup_seconds": "number | null",
      "firm_id": number
    }
  ],
  "total": number,
  "limit": number,
  "offset": number
}
```

---

## Webhooks API

### GET `/api/webhooks`

List webhooks with filtering, sorting, and pagination.

**Authentication**: Required

**Query Parameters**:
- `env` - Environment (default: `production`)
- `callId` - Filter by call ID
- `platform` - Filter by platform
- `platformCallId` - Filter by platform call ID
- `startDate` - Filter by received date (start)
- `endDate` - Filter by received date (end)
- `search` - Search term
- `multipleTransfers` - Boolean filter for multiple transfers (special behavior: fetches ALL matching webhooks, decodes payloads, filters client-side, then applies pagination)
- `limit` - Results per page (default: 25, max: 100)
- `offset` - Pagination offset (default: 0)
- `sortBy` - Column to sort by (default: `received_at`)
- `sortOrder` - Sort direction: `asc` | `desc` (default: `desc`)

**Special Behavior**:
- All payloads are decoded from base64+gzip via `decodeBase64Payload()` before return
- When `multipleTransfers=true`, fetches ALL matching webhooks, decodes payloads, filters client-side, then applies pagination

**Response** (200):
```json
{
  "data": [
    {
      "id": number,
      "call_id": "number | null",
      "platform": "string",
      "platform_call_id": "string | null",
      "received_at": "ISO timestamp",
      "payload": {} // decoded from base64+gzip
    }
  ],
  "total": number,
  "limit": number,
  "offset": number
}
```

---

## Stats API

### GET `/api/stats/overview`

Get overview statistics for a specific time period.

**Authentication**: Required

**Query Parameters**:
- `env` - Environment (default: `production`)
- `period` - Time period: `Today` | `Yesterday` | `This Month`

**Response** (200):
```json
{
  "current": {
    "totalCalls": number,
    "avgDuration": number,
    "transferRate": number,
    "emailsSent": number
  },
  "previous": {
    "totalCalls": number,
    "avgDuration": number,
    "transferRate": number,
    "emailsSent": number
  }
}
```

---

### GET `/api/stats/chart`

Get chart data for calls over time.

**Authentication**: Required

**Query Parameters**:
- `env` - Environment (default: `production`)
- `startDate` - Start date (ISO format, required)
- `endDate` - End date (ISO format, required)
- `isHourly` - Group by hour (boolean, default: false)

**Behavior**:
- Groups by hour (Eastern TZ-aware) or date
- Zero-fills all gaps in the date/hour range
- Fetches up to 10,000 records

**Response** (200):
```json
{
  "data": [
    {
      "date": "ISO timestamp",
      "calls": number
    }
  ],
  "isHourly": boolean,
  "totalRecords": number
}
```

---

### GET `/api/stats` (Legacy)

Get combined overview and chart data.

**Authentication**: Required

**Note**: Always uses production environment (no env param)

**Response** (200):
```json
{
  "overview": {
    "current": { "totalCalls": number, "avgDuration": number, "transferRate": number, "emailsSent": number },
    "previous": { "totalCalls": number, "avgDuration": number, "transferRate": number, "emailsSent": number }
  },
  "chart": {
    "data": [{ "date": "ISO timestamp", "calls": number }],
    "isHourly": boolean,
    "totalRecords": number
  }
}
```

---

## Firms API

### GET `/api/firms`

Get list of all firms.

**Authentication**: Required

**Query Parameters**:
- `env` - Environment (default: `production`)

**Note**: `force-dynamic` export prevents Next.js caching

**Response** (200):
```json
{
  "firms": [
    {
      "id": number,
      "name": "string"
    }
  ]
}
```

---

## Sentry API

### GET `/api/sentry/browse`

Browse Sentry events and group by correlation ID.

**Authentication**: Required

**Query Parameters**:
- `eventType` - Filter by event type
- `level` - Filter by level (error, warning, info, etc.)
- `search` - Search term
- `sentryEnv` - Sentry environment: `production` | `pre-prod` | `stage` | `develop`
- `statsPeriod` - Time period (default: `7d`)

**External API**: Sentry Discover API (paginated, up to 10 pages = 1000 events)

**Flow**:
1. Fetches events from Sentry
2. Maps correlation IDs to call IDs via Supabase
3. Groups events by correlation_id

**Caching**: Sentry requests cached 60s via `next: { revalidate: 60 }`

**Response** (200):
```json
{
  "summary": [
    {
      "correlation_id": "string",
      "call_id": "number | null",
      "event_count": number,
      "first_seen": "ISO timestamp",
      "last_seen": "ISO timestamp",
      "levels": ["string"],
      "event_types": ["string"]
    }
  ],
  "groups": {
    "correlation_id": [
      {
        "id": "string",
        "timestamp": "ISO timestamp",
        "level": "string",
        "message": "string",
        "event.type": "string",
        "correlation_id": "string"
      }
    ]
  },
  "totalEvents": number,
  "filteredEvents": number,
  "hasMore": boolean,
  "nextCursor": "string | null"
}
```

---

### GET `/api/sentry/error-check`

Get list of correlation IDs with Sentry errors.

**Authentication**: Required

**Query Parameters**:
- `environment` - Sentry environment
- `statsPeriod` - Time period (default: `7d`)

**Response** (200):
```json
{
  "correlationIds": ["string"]
}
```

---

### GET `/api/sentry/events`

Get Sentry events for a specific correlation ID.

**Authentication**: Required

**Query Parameters**:
- `correlationId` - Correlation ID to filter by
- `query` - Additional query parameters
- `limit` - Results per page (max: 100)
- `cursor` - Pagination cursor
- `environment` - Sentry environment
- `statsPeriod` - Time period

**Response** (200):
```json
// Sentry event data (format varies by event type)
```

---

## Cekura API

### GET `/api/cekura/call-mapping`

Get call logs from Cekura observability API.

**Authentication**: Required

**Query Parameters**:
- `startDate` - Start date (ISO format, required)
- `endDate` - End date (ISO format, required)
- `environment` - Environment: `production` | `staging` (default: `production`)
- `page` - Page number (default: 1)
- `pageSize` - Results per page (default: 100)
- `fetchAll` - Fetch all pages (boolean, default: false)

**External API**: `https://api.cekura.ai/observability/v1/call-logs/`

**Authentication Header**: `X-CEKURA-API-KEY`

**Agent IDs**:
- Production: 10779
- Staging: 11005

**Response** (200):
```json
{
  "calls": {
    "correlation_id": {
      "id": number,
      "correlation_id": "string",
      "agent_id": number,
      "start_time": "ISO timestamp",
      "end_time": "ISO timestamp",
      "duration": number,
      "status": "string",
      "rating": "number | null"
    }
  },
  "count": number,
  "totalCount": number,
  "hasMore": boolean,
  "page": number,
  "pageSize": number,
  "agentId": number
}
```

**Error Codes**:
- `400` - Missing required parameters
- `500` - Cekura API error

---

### PATCH `/api/cekura/status`

Update Cekura call review status.

**Authentication**: Required

**Request Body**:
```json
{
  "cekuraId": number,
  "status": "reviewed_success" | "reviewed_failure"
}
```

**Response** (200):
```json
{
  "success": true,
  "data": {} // Cekura API response
}
```

**Error Codes**:
- `400` - Missing cekuraId or status
- `500` - Cekura API error

---

### PATCH `/api/cekura/feedback`

Submit feedback for a Cekura call.

**Authentication**: Required

**Request Body**:
```json
{
  "cekuraId": number,
  "feedback": "string"
}
```

**Response** (200):
```json
{
  "success": true,
  "data": {} // Cekura API response
}
```

**Error Codes**:
- `400` - Missing cekuraId or feedback
- `500` - Cekura API error

---

## Reports API

### GET `/api/reports`

List reports with filtering, sorting, and pagination.

**Authentication**: Required

**Query Parameters**:
- `env` - Environment (default: `production`)
- `limit` - Results per page (default: 25, max: 100)
- `offset` - Pagination offset (default: 0)
- `sortBy` - Column to sort by (default: `report_date`)
- `sortOrder` - Sort direction: `asc` | `desc` (default: `desc`)
- `firmId` - Filter by firm ID
- `reportType` - Filter by report type

**Response** (200):
```json
{
  "data": [
    {
      "id": number,
      "report_date": "ISO date",
      "raw_data": {},
      "ai_insights": "string | null",
      "trigger_type": "string | null",
      "report_type": "string",
      "created_at": "ISO timestamp",
      "updated_at": "ISO timestamp"
    }
  ],
  "total": number,
  "limit": number,
  "offset": number
}
```

---

### POST `/api/reports` (Save/Upsert)

Save or update a report.

**Authentication**: Required

**Request Body**:
```json
{
  "reportDate": "YYYY-MM-DD",
  "rawData": {},
  "triggerType": "string | null (optional)",
  "reportType": "string | null (optional, default: 'eod')"
}
```

**Behavior**:
- Upserts by date + type
- Clears AI fields (ai_insights, ai_success_insights, ai_failure_insights) on update for regeneration

**Response** (200):
```json
{
  "report": {
    "id": number,
    "report_date": "ISO date",
    "raw_data": {},
    "ai_insights": "string | null",
    "trigger_type": "string | null",
    "report_type": "string",
    "created_at": "ISO timestamp",
    "updated_at": "ISO timestamp"
  },
  "updated": boolean,
  "message": "string"
}
```

**Error Codes**:
- `400` - Missing reportDate or rawData
- `500` - Database error

---

### GET `/api/reports/[date]`

Get a specific report by date.

**Authentication**: Required

**URL Parameters**:
- `date` - Report date in DDMMYYYY format

**Query Parameters**:
- `env` - Environment (default: `production`)
- `type` - Report type (default: `eod`)

**Response** (200):
```json
{
  "report": {
    "id": number,
    "report_date": "ISO date",
    "raw_data": {},
    "ai_insights": "string | null",
    "trigger_type": "string | null",
    "report_type": "string",
    "created_at": "ISO timestamp",
    "updated_at": "ISO timestamp"
  }
}
```

**Error Codes**:
- `400` - Invalid date format
- `404` - Report not found

---

### POST `/api/reports/payload-generate`

Generate raw data payload for a report.

**Authentication**: Required

**Request Body**:
```json
{
  "reportDate": "YYYY-MM-DD",
  "firmId": "number | null (optional)"
}
```

**Flow**:
1. Parallel-fetches from Supabase (calls, transfers, emails)
2. Fetches Cekura call logs
3. Fetches Sentry errors
4. Merges data by correlation_id

**Response** (200):
```json
{
  "raw_data": {
    "total_calls": number,
    "successful_calls": number,
    "avg_duration": number,
    "total_transfers": number,
    "total_emails": number,
    "time_saved": number,
    "call_details": [
      {
        "id": number,
        "platform_call_id": "string",
        "caller_name": "string | null",
        "phone_number": "string",
        "started_at": "ISO timestamp",
        "call_duration": number,
        "summary": "string | null",
        "correlation_id": "string | null",
        "transfers": [],
        "emails": [],
        "cekura_data": {} | null,
        "sentry_errors": []
      }
    ]
  }
}
```

**Error Codes**:
- `400` - Missing reportDate
- `500` - Data fetch error

---

### POST `/api/reports/ai-generate`

Generate AI insights for a report.

**Authentication**: Required

**Request Body**:
```json
{
  "reportId": number,
  "rawData": {},
  "reportType": "success" | "failure" | "full" | "weekly",
  "dataFormat": "toon" | "json (optional, default: 'json')"
}
```

**Flow**:
1. Reads prompt + LLM config from `prompts` table
2. Generates insights via OpenAI or Gemini API
3. Saves to appropriate field in report record (ai_success_insights, ai_failure_insights, or ai_insights)

**Response** (200):
```json
{
  "success": true,
  "reportType": "string"
}
```

**Error Codes**:
- `400` - Missing required fields or invalid reportType
- `404` - Prompt not found in database
- `500` - AI generation error

---

### POST `/api/reports/weekly-generate`

Generate raw data for a weekly report.

**Authentication**: Required

**Request Body**:
```json
{
  "weekDate": "YYYY-MM-DD",
  "firmId": "number | null (optional)"
}
```

**Flow**:
1. Computes Monday-Sunday boundaries for the week
2. Fetches daily EOD reports for the week
3. Aggregates data across all days

**Response** (200):
```json
{
  "raw_data": {
    "week_start": "ISO date",
    "week_end": "ISO date",
    "total_calls": number,
    "successful_calls": number,
    "avg_duration": number,
    "total_transfers": number,
    "total_emails": number,
    "time_saved": number,
    "daily_breakdown": [
      {
        "date": "ISO date",
        "total_calls": number,
        "successful_calls": number,
        "avg_duration": number,
        "total_transfers": number,
        "total_emails": number
      }
    ],
    "call_details": []
  },
  "week_start": "ISO date",
  "week_end": "ISO date",
  "eod_reports_used": number
}
```

**Error Codes**:
- `400` - Missing weekDate
- `500` - Data aggregation error

---

### POST `/api/reports/format-compare`

Compare JSON vs Toon format for AI report generation.

**Authentication**: Required

**Request Body**:
```json
{
  "reportId": "number | null (optional)",
  "rawData": "{} | null (optional)",
  "reportType": "success" | "failure" | "full" | "weekly"
}
```

**Note**: Must provide either `reportId` or `rawData`

**Response** (200):
```json
{
  "reportType": "string",
  "callCount": number,
  "comparison": {
    "json": {
      "tokens": number,
      "cost_estimate": number,
      "format": "json"
    },
    "toon": {
      "tokens": number,
      "cost_estimate": number,
      "format": "toon"
    },
    "savings": {
      "tokens_saved": number,
      "cost_saved": number,
      "percentage_saved": number
    }
  }
}
```

**Error Codes**:
- `400` - Missing required fields or invalid reportType
- `404` - Report not found (when using reportId)
- `500` - Comparison error

---

## Chat API

### POST `/api/chat`

Send a message and receive a streaming NDJSON response with Gemini function calling.

**Authentication**: Required

**Request Body**:
```json
{
  "messages": [
    {
      "role": "user | assistant",
      "content": "string"
    }
  ],
  "environment": "production | staging (optional, default: production)"
}
```

**Response**: Streaming NDJSON (newline-delimited JSON). Each line is a JSON object with a `type` field:

```
{"type": "text", "content": "Here are the results..."}
{"type": "sql", "query": "SELECT ..."}
{"type": "result", "data": [...], "rowCount": 5}
{"type": "chart", "spec": {"type": "bar", "data": [...], ...}}
{"type": "error", "message": "Error description"}
{"type": "done"}
```

**Event Types**:
- `text` - Natural language text from Gemini
- `sql` - SQL query being executed (for transparency)
- `result` - Query result data
- `chart` - Chart specification for client-side rendering
- `error` - Error during processing
- `done` - Stream complete

**Behavior**:
- Gemini function calling with `run_sql` and `generate_chart` tools
- SQL validated to be SELECT-only (no mutations allowed)
- SQL executed via Supabase RPC `execute_readonly_sql`
- Max 8 rounds of function calling per request
- Chat message logged to Google Sheets (fire-and-forget)

**Error Codes**:
- `400` - Missing or invalid messages
- `401` - Unauthorized
- `500` - Gemini API or SQL execution error

---

### GET `/api/chat/history`

List all saved conversations.

**Authentication**: Required

**Response** (200):
```json
{
  "conversations": [
    {
      "id": "string",
      "title": "string",
      "messages": [],
      "createdAt": "ISO timestamp",
      "updatedAt": "ISO timestamp"
    }
  ]
}
```

---

### PUT `/api/chat/history`

Save or update a conversation.

**Authentication**: Required

**Request Body**:
```json
{
  "id": "string",
  "title": "string",
  "messages": [
    {
      "role": "user | assistant",
      "content": "string"
    }
  ]
}
```

**Response** (200):
```json
{
  "success": true
}
```

---

### PATCH `/api/chat/history`

Rename a conversation.

**Authentication**: Required

**Request Body**:
```json
{
  "id": "string",
  "title": "string"
}
```

**Response** (200):
```json
{
  "success": true
}
```

---

### DELETE `/api/chat/history`

Delete one or all conversations.

**Authentication**: Required

**Query Parameters**:
- `id` - Conversation ID to delete (mutually exclusive with `all`)
- `all` - Set to `true` to delete all conversations

**Response** (200):
```json
{
  "success": true
}
```

**Error Codes**:
- `400` - Must provide either `id` or `all=true`

---

## Admin Config API

### GET `/api/admin/config`

Get the full client configuration (admin only).

**Authentication**: Required (admin only)

**Response** (200):
```json
{
  "adminDomains": ["string"],
  "userFirmMappings": {
    "email@example.com": "firmId"
  },
  "defaults": {
    "pages": {},
    "columns": {},
    "features": {}
  },
  "firms": {
    "firmId": {
      "pages": {},
      "columns": {},
      "features": {},
      "branding": {}
    }
  }
}
```

**Error Codes**:
- `403` - Not an admin user

---

### PUT `/api/admin/config`

Update global configuration settings (admin only).

**Authentication**: Required (admin only)

**Request Body**:
```json
{
  "adminDomains": ["string"],
  "userFirmMappings": {},
  "defaults": {}
}
```

**Response** (200):
```json
{
  "success": true
}
```

---

### GET `/api/admin/config/[firmId]`

Get configuration for a specific firm.

**Authentication**: Required (admin only)

**URL Parameters**:
- `firmId` - Firm identifier

**Response** (200):
```json
{
  "pages": {},
  "columns": {},
  "features": {},
  "branding": {
    "primaryColor": "string",
    "logoUrl": "string",
    "displayName": "string"
  }
}
```

---

### PUT `/api/admin/config/[firmId]`

Save configuration for a specific firm.

**Authentication**: Required (admin only)

**Request Body**: FirmConfig object
```json
{
  "pages": {},
  "columns": {},
  "features": {},
  "branding": {}
}
```

**Response** (200):
```json
{
  "success": true
}
```

---

### DELETE `/api/admin/config/[firmId]`

Remove a firm-specific configuration (falls back to defaults).

**Authentication**: Required (admin only)

**URL Parameters**:
- `firmId` - Firm identifier

**Response** (200):
```json
{
  "success": true
}
```

---

## Client Config API

### GET `/api/client-config`

Get the resolved configuration for the current user. Resolves based on admin domain check, user-firm mapping, and defaults.

**Authentication**: Required

**Response** (200):
```json
{
  "isAdmin": true,
  "firmId": "string | null",
  "pages": {
    "calls": true,
    "emails": true,
    "transfers": true,
    "webhooks": true,
    "sentry": true,
    "reports": true,
    "admin": false
  },
  "columns": {},
  "features": {
    "chat": true,
    "cekura": true,
    "accurateTranscript": false
  },
  "branding": {
    "primaryColor": "string | null",
    "logoUrl": "string | null",
    "displayName": "string | null"
  }
}
```

---

## Analytics API

### POST `/api/analytics/log-visit`

Log a dashboard visit to Google Sheets.

**Authentication**: Required

**Request Body**:
```json
{
  "userEmail": "string",
  "page": "string (optional)"
}
```

**Response** (200):
```json
{
  "success": true
}
```

**Notes**:
- Timestamps are logged in IST (Indian Standard Time)
- Fire-and-forget pattern; errors are logged but do not fail the request

---

## Accurate Transcript API

See [POST `/api/calls/[id]/accurate-transcript`](#post-apicallsidaccurate-transcript) under Calls API.

---

## Cross-Cutting Concerns

### Input Validation

All API routes implement strict input validation to prevent SQL injection and ensure data integrity.

#### SQL Safety Functions

**`escapeLikePattern(pattern: string): string`**
- Escapes special characters in LIKE patterns: `\`, `%`, `_`
- Used internally by `buildSafeSearchTerm()`

**`buildSafeSearchTerm(search: string): string`**
- Trims whitespace
- Escapes LIKE special characters
- Wraps in `%...%` for partial matching
- Returns empty string if input is empty

#### Pagination Validation

**`validatePagination(limit?: number, offset?: number)`**
- Clamps `limit` to range [1, 100]
- Ensures `offset` >= 0
- Returns validated values

#### Integer Validation

**`isValidInt4(value: number): boolean`**
- Validates PostgreSQL int4 range: -2147483648 to 2147483647
- Used for ID validation

**`parseIntOrNull(value: string | null | undefined): number | null`**
- Safely parses string to integer
- Returns null if parsing fails

**`parseIntOrDefault(value: string | null | undefined, defaultValue: number): number`**
- Safely parses string to integer with fallback

#### Dynamic Filter Validation

All dynamic filter endpoints use column whitelisting:
- Only allow filtering on explicitly defined columns
- Reject queries that reference non-whitelisted columns
- Prevent arbitrary SQL injection via column names

### Error Handling

All routes follow a consistent error handling pattern:

1. **Try-Catch Wrapper**: All route logic wrapped in try-catch
2. **Consistent Response Format**: Uses `errorResponse(message, status, code)` helper
3. **Auth Failures**: Return 401 with `{ error: 'Unauthorized' }`
4. **Validation Failures**: Return 400 with descriptive error messages
5. **Not Found**: Return 404 for missing resources
6. **Server Errors**: Return 500 for unexpected failures

#### Error Response Helper

```typescript
function errorResponse(
  message: string,
  status: number = 500,
  code?: string
): NextResponse {
  return NextResponse.json(
    { error: message, code },
    { status }
  );
}
```

### Security Best Practices

1. **Credentials**: All external API credentials stored server-side only
2. **Authentication**: Every route (except login) validates auth before processing
3. **SQL Injection**: All user input escaped before database queries
4. **Rate Limiting**: Not currently implemented (consider adding for production)
5. **CORS**: Handled by Next.js defaults (same-origin only)

### Caching Strategy

1. **Sentry API**: 60-second revalidation via `next: { revalidate: 60 }`
2. **Firms List**: `force-dynamic` export to prevent caching
3. **Other Routes**: No explicit caching (relies on TanStack Query client-side caching)

---

## Rate Limits and Quotas

### Pagination Limits
- Maximum `limit` per request: 100
- Default `limit`: 25

### External API Limits
- **Sentry**: Up to 10 pages (1000 events) per browse request
- **Cekura**: Configurable via `pageSize` parameter, supports `fetchAll` option
- **Supabase**: No hard limits imposed by API layer

### Special Cases
- **Webhooks with `multipleTransfers=true`**: Fetches ALL matching records (no pagination limit during initial fetch)
- **Stats chart data**: Up to 10,000 records per request
