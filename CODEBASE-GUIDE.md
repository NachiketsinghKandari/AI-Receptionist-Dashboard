# AI Receptionist Dashboard -- Codebase Guide

A comprehensive guide to the entire codebase, written for reading offline. Covers architecture, data flow, every API route, the component tree, security model, and operational details.

---

## Table of Contents

1. [What This Project Is](#1-what-this-project-is)
2. [Tech Stack at a Glance](#2-tech-stack-at-a-glance)
3. [Architecture: The BFF Pattern](#3-architecture-the-bff-pattern)
4. [Directory Structure](#4-directory-structure)
5. [Authentication System](#5-authentication-system)
6. [Environment Switching (Prod / Staging)](#6-environment-switching-prod--staging)
7. [Provider Stack](#7-provider-stack)
8. [Database Schema](#8-database-schema)
9. [API Routes -- All 36](#9-api-routes----all-36)
10. [Data Fetching: Hooks Layer](#10-data-fetching-hooks-layer)
11. [Chat System (Gemini + Function Calling)](#11-chat-system-gemini--function-calling)
12. [Report Generation (LLM Abstraction)](#12-report-generation-llm-abstraction)
13. [Cekura Integration](#13-cekura-integration)
14. [Accurate Transcript (Gemini)](#14-accurate-transcript-gemini)
15. [Admin Panel and Client Config](#15-admin-panel-and-client-config)
16. [PII Masking](#16-pii-masking)
17. [Filtering System](#17-filtering-system)
18. [URL Sharing](#18-url-sharing)
19. [Components Architecture](#19-components-architecture)
20. [Page Layout Patterns](#20-page-layout-patterns)
21. [Responsive Design](#21-responsive-design)
22. [Design System](#22-design-system)
23. [Security Patterns](#23-security-patterns)
24. [External Integrations](#24-external-integrations)
25. [Environment Variables](#25-environment-variables)
26. [Dependencies](#26-dependencies)
27. [Scripts](#27-scripts)
28. [Build and Development Commands](#28-build-and-development-commands)

---

## 1. What This Project Is

The AI Receptionist Dashboard is an internal monitoring tool for law firms that use an AI-powered phone receptionist. When a call comes in to a law firm, the AI receptionist answers, triages the caller, looks up case details, transfers calls to the right attorney, and sends email summaries. This dashboard lets operations teams:

- Monitor every call in near-real-time with rich filtering and search.
- Review transcripts, transfers, and email notifications per call.
- Track KPIs: call volume, transfer rates, error rates, durations.
- Generate daily and weekly reports using LLMs (Gemini and OpenAI).
- Chat with the data using natural language (Gemini function calling that writes SQL).
- Audit call quality via Cekura integration (pass/fail metrics per call).
- Monitor errors via Sentry integration.
- Configure per-firm branding, feature toggles, and access controls via an admin panel.

The system is multi-tenant. Each law firm sees only its own data, with firm-specific branding (logo, colors, page visibility, feature flags) applied at runtime.

---

## 2. Tech Stack at a Glance

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | Next.js (App Router, Turbopack) | 16.1.1 |
| UI Library | React | 19.2.3 |
| Language | TypeScript (strict mode) | 5.x |
| Styling | Tailwind CSS v4 + OKLCH color space | 4.x |
| Component Library | shadcn/ui (Radix primitives) | -- |
| Data Fetching | TanStack Query | 5.90.16 |
| Tables | TanStack Table (server-side pagination) | 8.21.3 |
| Charts | Recharts | 2.15.4 |
| Animations | Framer Motion | 12.33.0 |
| Database | Supabase (PostgreSQL) | 2.90.0 |
| Auth | Supabase Auth (@supabase/ssr) | 0.8.0 |
| Secondary DB | Turso / LibSQL (chat history, reports) | 0.17.0 |
| LLM -- Chat | Google Gemini (@google/genai) | 1.38.0 |
| LLM -- Reports | Gemini + OpenAI | 6.16.0 |
| Icons | Lucide React | 0.562.0 |
| Markdown | react-markdown + remark-gfm + rehype-highlight | 10.1.0 |
| Export | html2pdf.js, remark-docx, file-saver | -- |

---

## 3. Architecture: The BFF Pattern

Every external service call (Supabase, Sentry, Cekura, Gemini, Google Sheets) is proxied through Next.js API routes in `app/api/`. The browser never talks to Supabase or any third-party API directly. This provides:

- **Credential isolation** -- API keys and service URLs stay server-side.
- **Single caching layer** -- API routes can add caching headers or in-memory caches.
- **Input validation** -- SQL injection prevention, pagination caps, and auth checks happen in one place.
- **Environment routing** -- API routes accept an `?env=production|staging` query param and select the correct Supabase client.

```
Browser (React + TanStack Query)
    |
    v
Next.js API Routes (app/api/*)     <-- credentials live here
    |
    +---> Supabase (prod or staging)
    +---> Sentry API
    +---> Cekura API
    +---> Google Gemini / OpenAI
    +---> Turso (LibSQL)
    +---> Google Sheets API
```

### Route Groups

Next.js App Router uses route groups (parenthesized folder names) to organize pages without affecting URLs:

| Route Group | Purpose | Pages |
|-------------|---------|-------|
| `app/(auth)/` | Public authentication | Login |
| `app/(dashboard)/` | Protected pages (requires valid session) | Home (KPIs), Calls, Emails, Transfers, Webhooks, Sentry, Reports, Admin |

---

## 4. Directory Structure

```
AI-Receptionist-Dashboard/
|
+-- app/
|   +-- (auth)/              # Login page
|   +-- (dashboard)/         # Protected pages (home, calls, emails, transfers, webhooks, sentry, reports, admin)
|   +-- api/                 # 36 BFF API routes across 14 directories
|   |   +-- admin/           # Config CRUD (global + per-firm)
|   |   +-- analytics/       # Visit logging to Google Sheets
|   |   +-- auth/            # Login, session, logout
|   |   +-- calls/           # Call listing, detail, flagged, important, date-range, transcript
|   |   +-- cekura/          # Call mapping, status, feedback
|   |   +-- chat/            # Gemini streaming + conversation history
|   |   +-- client-config/   # Resolved config for current user
|   |   +-- emails/          # Email log listing
|   |   +-- firms/           # Firm dropdown data
|   |   +-- reports/         # EOD/weekly reports, AI generation, payload generation
|   |   +-- sentry/          # Sentry events, browsing, error checks
|   |   +-- stats/           # KPIs, overview, chart data
|   |   +-- transfers/       # Transfer listing
|   |   +-- webhooks/        # Webhook dump listing
|   +-- globals.css          # Tailwind + OKLCH CSS variables
|   +-- layout.tsx           # Root layout (fonts, metadata)
|
+-- components/
|   +-- admin/       (6)     # Admin panel editors
|   +-- cekura/      (3)     # Call quality status/feedback
|   +-- charts/      (2)     # KPI cards, call volume chart
|   +-- chat/        (8)     # Chat panel, messages, history, charts, tables
|   +-- details/     (4)     # Call detail sheet (resizable 2-panel)
|   +-- email/       (2)     # Email body display, recipients
|   +-- eod/         (3)     # Report markdown renderer, PDF/DOCX export
|   +-- filters/     (3)     # Filter sidebar, dynamic filter builder
|   +-- layout/      (2)     # Navbar, environment switcher
|   +-- providers/   (6)     # React context providers
|   +-- tables/      (1)     # Generic DataTable (TanStack Table)
|   +-- ui/         (25+)    # shadcn/ui base components
|
+-- hooks/           (25)    # TanStack Query hooks + utility hooks
+-- lib/                     # Shared utilities and service clients
|   +-- api/                 # Auth helper, SQL safety utilities
|   +-- auth/                # Legacy JWT auth (unused, kept for reference)
|   +-- chat/                # Chat system prompt, SQL validation, tool definitions
|   +-- eod/                 # Report generation logic
|   +-- llm/                 # Unified LLM abstraction (Gemini + OpenAI)
|   +-- sentry/              # Sentry API client
|   +-- supabase/            # Supabase client factory (prod/staging)
|   +-- turso/               # Turso/LibSQL singleton client
|   +-- sqlite/              # Legacy file-based SQLite (migrated to Turso)
|
+-- types/                   # TypeScript interfaces (database.ts, api.ts)
+-- config/                  # client-configs.json (admin panel config store)
+-- scripts/                 # Utility scripts (Google Sheets auth, schema dump, analysis)
+-- proxy.ts                 # Auth proxy (validates every request)
```

---

## 5. Authentication System

### Overview

Authentication uses Supabase Auth with server-side cookie management via `@supabase/ssr`. There is no custom JWT minting -- Supabase handles tokens, refresh, and session lifecycle.

### Key Detail: Auth Always Hits Staging

An important architectural decision: **authentication always uses the staging Supabase project**, regardless of the selected data environment. The environment switcher (prod/staging) only affects which Supabase project is queried for data. This means user accounts live in a single place.

### Three Auth Modes

The `authenticateRequest()` function in `lib/api/auth.ts` supports three modes, checked in order:

| Mode | When Used | Mechanism |
|------|-----------|-----------|
| Cookie Auth | Browser sessions | `sb-*` cookies parsed by `@supabase/ssr`, standard for web UI |
| Bearer Token | API clients, CLI tools | `Authorization: Bearer <access_token>` header |
| Basic Auth | Postman, curl | `Authorization: Basic <base64(email:password)>`, exchanged for a Supabase session |

### Request Lifecycle

1. **`proxy.ts`** runs on every request (Next.js 16 pattern, replacing the deprecated `middleware.ts`). It validates the session and redirects unauthenticated users to `/login`.
2. **API routes** double-check authentication via `authenticateRequest()` -- defense in depth.
3. **Session tokens**: 1-hour access token, 30-day refresh token (Supabase defaults). The SSR library handles silent refresh.

### OAuth

Google OAuth is implemented but currently hidden in the UI. An email allowlist (`ALLOWED_EMAILS` env var) restricts who can sign up.

### Legacy Files

`lib/auth/config.ts` and `lib/auth/session.ts` contain legacy JWT-based auth code. These are **unused** but remain in the codebase for reference.

---

## 6. Environment Switching (Prod / Staging)

The dashboard connects to two separate Supabase projects -- one for production data, one for staging. Users (typically developers/QA) can toggle between them live.

### How It Works

1. `EnvironmentProvider` (`components/providers/environment-provider.tsx`) stores the selected environment in `localStorage`.
2. When toggled, it **invalidates all TanStack Query caches** so every query refetches from the new environment.
3. All API routes accept an optional `?env=production|staging` query parameter. The hooks layer automatically appends this.
4. `lib/supabase/` contains a client factory that returns the correct Supabase client based on the env param.
5. The `useSyncEnvironmentFromUrl` hook allows deep links to force a specific environment.

### Per-Firm Visibility

The environment switcher itself is a feature toggle (`features.environmentSwitcher` in client config). Firm users typically never see it -- it is an admin/developer tool.

---

## 7. Provider Stack

The dashboard layout wraps all protected pages in a carefully ordered provider stack. Order matters because inner providers depend on outer ones:

```
<QueryProvider>                   -- TanStack Query client
  <AuthListenerProvider>          -- Monitors Supabase auth state changes
    <EnvironmentProvider>         -- Prod/staging toggle, stored in localStorage
      <ClientConfigProvider>      -- Resolves per-firm config, applies theme
        <DateFilterProvider>      -- Shared date range state for all pages
          {children}              -- The actual page content
        </DateFilterProvider>
      </ClientConfigProvider>
    </EnvironmentProvider>
  </AuthListenerProvider>
</QueryProvider>
```

### What Each Provider Does

| Provider | Responsibility |
|----------|---------------|
| `QueryProvider` | Initializes TanStack Query with 60s default stale time, window-focus refetching |
| `AuthListenerProvider` | Listens for `onAuthStateChange` events; redirects to `/login` on sign-out |
| `EnvironmentProvider` | Manages prod/staging selection; exposes `environment` and `setEnvironment` |
| `ClientConfigProvider` | Fetches resolved config for the current user; applies CSS custom properties (theme), sets `document.title`, overrides navbar logo |
| `DateFilterProvider` | Holds the shared date range filter used across calls, emails, transfers, reports pages |

---

## 8. Database Schema

### Supabase (PostgreSQL) -- ~20 Tables

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `calls` | Core call records | `correlation_id`, `caller_name`, `caller_phone`, `duration`, `status`, `call_type`, `firm_id`, `started_at`, `ended_at`, webhook payload (compressed base64) |
| `email_logs` | Email notifications sent after calls | `subject`, `recipients`, `body`, `email_type`, `call_id` |
| `transfers_details` | Call transfers to attorneys | `caller_name`, `transferred_to`, `transfer_type`, `status`, `call_id` |
| `webhook_dumps` | Raw webhook payloads from telephony | `webhook_type`, `platform`, `platform_call_id`, `payload` |
| `firms` | Law firm records | `id`, `name`, firm metadata |
| `staff_directory` | Staff lookup for each firm | Used by AI receptionist for transfers |
| `case_details` | Case information per firm | Used by AI receptionist for case lookups |
| `prompts` | LLM prompt templates | `firm_id`, `report_type`, `prompt_text` |

### Turso (LibSQL) -- 2 Tables

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `conversations` | Chat history persistence | `id`, `user_id`, `title`, `messages` (JSON), `created_at`, `updated_at` |
| `eod_reports` | End-of-day and weekly reports | Migrated from file-based SQLite; stores raw data + AI-generated markdown |

### Supabase RPC

- **`execute_readonly_sql(query text)`** -- Used by the chat system. Wraps the query in a read-only transaction with a 15-second timeout. This is the only way user-generated SQL touches the database.

---

## 9. API Routes -- All 36

### Auth (3 routes)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/login` | Email/password authentication; returns access + refresh tokens |
| GET | `/api/auth/session` | Validates the current session; returns user info |
| POST | `/api/auth/logout` | Destroys the session (clears cookies) |

### Calls (8 routes)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/calls` | List calls with complex filtering: firmId, callType, transferType, status, date range, search, dynamic filters with AND/OR logic |
| GET | `/api/calls/[id]` | Single call with joined transfers and emails |
| POST | `/api/calls/[id]/accurate-transcript` | Gemini-powered transcript correction using audio + ground truth |
| GET | `/api/calls/flagged` | Flagged calls (sentry errors, abnormal duration, important, transfer-email mismatches) |
| GET | `/api/calls/flagged/count` | Flagged count with breakdown by flag type |
| GET | `/api/calls/important` | Calls marked as important |
| GET | `/api/calls/transfer-email-mismatch` | Calls where transfers and email notifications don't align |
| GET | `/api/calls/date-range` | Min/max dates for the calls dataset |

### Emails (1 route)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/emails` | List email logs with pagination and filtering |

### Transfers (1 route)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/transfers` | List transfers with filtering |

### Webhooks (1 route)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/webhooks` | List webhook dumps with pagination |

### Firms (1 route)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/firms` | All firms for dropdown selection (300s stale time) |

### Stats (3 routes)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/stats` | KPI statistics (call counts, rates, averages) |
| GET | `/api/stats/overview` | High-level metrics for the dashboard home |
| GET | `/api/stats/chart` | Aggregated chart data with hourly or daily granularity |

### Cekura (3 routes)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/cekura/call-mapping` | Map correlation IDs to Cekura calls; uses progressive loading |
| PATCH | `/api/cekura/status` | Update call review status (reviewed_success / reviewed_failure) |
| PATCH | `/api/cekura/feedback` | Update feedback text for a call |

### Sentry (3 routes)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/sentry/events` | Sentry error events with pagination |
| GET | `/api/sentry/browse` | Browse errors with filters |
| GET | `/api/sentry/error-check` | Check if specific calls have associated Sentry errors |

### Reports (7 routes)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/reports` | List EOD and weekly reports |
| POST | `/api/reports` | Save a new report or update an existing one |
| GET | `/api/reports/[date]` | Fetch report for a specific date |
| POST | `/api/reports/ai-generate` | Trigger AI generation (types: success, failure, full, weekly) |
| POST | `/api/reports/payload-generate` | Generate raw data payload from Supabase |
| POST | `/api/reports/weekly-generate` | Generate weekly report from daily EOD reports |
| POST | `/api/reports/format-compare` | Compare JSON vs TOON encoding efficiency |

### Admin (5 routes)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/config` | Read global admin configuration |
| PUT | `/api/admin/config` | Update global admin configuration |
| GET | `/api/admin/config/[firmId]` | Read firm-specific configuration |
| PUT | `/api/admin/config/[firmId]` | Update firm-specific configuration |
| DELETE | `/api/admin/config/[firmId]` | Remove firm-specific configuration |

### Chat (2 routes)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/chat` | Stream Gemini function-calling responses (NDJSON format) |
| GET/PUT/PATCH/DELETE | `/api/chat/history` | CRUD operations for conversation persistence via Turso |

### Client Config (1 route)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/client-config` | Returns the resolved configuration for the currently authenticated user |

### Analytics (1 route)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/analytics/log-visit` | Logs a dashboard visit to Google Sheets (fire-and-forget) |

---

## 10. Data Fetching: Hooks Layer

All data fetching goes through custom hooks in `/hooks/` that wrap TanStack Query. This gives every consumer automatic caching, background refetching, loading states, and error handling.

### Data Fetching Hooks

| Hook | Source | Notes |
|------|--------|-------|
| `useCalls` | `/api/calls` | Server-side pagination, filtering, search, dynamic filters |
| `useCallDetail` | `/api/calls/[id]` | Single call with transfers + emails |
| `useFlaggedCalls` | `/api/calls/flagged` | Flagged calls (errors, duration, important, mismatches) |
| `useImportantCallIds` | `/api/calls/important` | Returns IDs only for badge rendering |
| `useTransferEmailMismatchIds` | `/api/calls/transfer-email-mismatch` | Returns IDs only |
| `useSentryErrorCorrelationIds` | `/api/sentry/error-check` | Returns correlation IDs with errors |
| `useCallDateRange` | `/api/calls/date-range` | Min/max dates for date picker bounds |
| `useEmails` | `/api/emails` | Paginated email logs |
| `useTransfers` | `/api/transfers` | Paginated transfers |
| `useWebhooks` | `/api/webhooks` | Paginated webhook dumps |
| `useWebhooksForCall` | `/api/webhooks` | Webhooks filtered to a specific call |
| `useSentryEvents` | `/api/sentry/events` | Paginated Sentry events |
| `useSentryEventsForCall` | `/api/sentry/browse` | Errors for a specific call |
| `useEODReports` | `/api/reports` | Report listing |
| `useReportByDate` | `/api/reports/[date]` | Single report |
| `useGenerateEODReport` | `/api/reports/payload-generate` | Mutation: generate raw payload |
| `useSaveReport` | `/api/reports` (POST) | Mutation: save/update report |
| `useGenerateSuccessReport` | `/api/reports/ai-generate` | Mutation: generate success analysis |
| `useGenerateFailureReport` | `/api/reports/ai-generate` | Mutation: generate failure analysis |
| `useGenerateFullReport` | `/api/reports/ai-generate` | Mutation: generate full daily report |
| `useGenerateWeeklyReport` | `/api/reports/weekly-generate` | Mutation: generate weekly from dailies |
| `useGenerateWeeklyAIReport` | `/api/reports/ai-generate` | Mutation: AI weekly analysis |
| `useFirms` | `/api/firms` | 300s stale time (firms change rarely) |
| `useRawFirms` | `/api/firms` | Same data, different cache key |
| `useCekuraCallMapping` | `/api/cekura/call-mapping` | Progressive loading (page 1 fast, then all) |
| `useCekuraStatusMutation` | `/api/cekura/status` | Optimistic update for review status |
| `useCekuraFeedbackMutation` | `/api/cekura/feedback` | Optimistic update for feedback text |
| `useStats` | `/api/stats` | KPI numbers |
| `useOverviewStats` | `/api/stats/overview` | High-level dashboard metrics |
| `useChartData` | `/api/stats/chart` | Chart data (hourly/daily aggregation) |
| `useChat` | `/api/chat` | Streaming hook with abort support |
| `useChatHistory` | `/api/chat/history` | Turso-backed conversation CRUD |
| `useAccurateTranscript` | `/api/calls/[id]/accurate-transcript` | Mutation: Gemini transcript correction |

### Utility Hooks

| Hook | Purpose |
|------|---------|
| `useEnvironment` | Read/write the prod/staging environment toggle |
| `useSyncEnvironmentFromUrl` | Sync environment from URL params (deep linking) |
| `useClientConfig` | Access resolved per-firm config |
| `useDateFilter` | Shared date range filter state |
| `useIsMobile` | Boolean: viewport < 768px |
| `useMediaQuery` | Generic media query hook |
| `useIsLandscape` | Orientation detection (used in call detail on mobile) |
| `useDebounce` | Debounce a value by N ms |
| `usePanelSize` | Persist resizable panel sizes to localStorage |
| `useSwipe` | Touch swipe gesture detection |
| `usePIIMask` | Returns masking functions for the current firm's PII config |
| `useDashboardPrefetch` | Prefetch common queries on dashboard mount |
| `usePrefetchCallDetails` | Prefetch adjacent call details for faster navigation |
| `useUser` | Current authenticated user info |

### Caching Strategy

- **Default stale time**: 60 seconds -- data up to 1 minute old is served from cache.
- **Firms stale time**: 300 seconds -- firm list rarely changes.
- **Refetch on window focus**: Enabled globally. Switching back to the tab triggers a background refetch.
- **Cache invalidation**: Switching environments wipes the entire query cache.

---

## 11. Chat System (Gemini + Function Calling)

The chat feature lets users ask natural-language questions about their data. Under the hood, it uses Google Gemini with function calling to write and execute SQL against the Supabase database.

### Architecture

```
User types question
    |
    v
POST /api/chat (NDJSON stream)
    |
    v
Gemini 3 Flash receives:
  - System prompt (full DB schema, instructions)
  - Conversation history
  - Two tool definitions: run_sql, generate_chart
    |
    v
Gemini decides to call run_sql(query)
    |
    v
SQL Validation (client-side whitelist):
  - Only SELECT allowed
  - No system tables (pg_*, information_schema)
  - No DDL (CREATE, DROP, ALTER)
  - LIMIT enforced (max 1000 rows)
    |
    v
Supabase RPC: execute_readonly_sql(query)
  - Read-only transaction
  - 15-second timeout
    |
    v
Results returned to Gemini
    |
    v
Gemini may:
  a) Respond with text (streams back to UI)
  b) Call generate_chart(type, title, data, xKey, yKeys)
  c) Call run_sql again (up to 8 rounds)
    |
    v
NDJSON events streamed to browser:
  text | sql | result | chart | error | done
```

### Tool Definitions

**`run_sql`** -- Execute a read-only SQL query against the database. Takes a single `query` parameter. The system prompt includes the complete database schema so Gemini can write correct SQL.

**`generate_chart`** -- Render a chart in the UI. Parameters:

| Field | Type | Description |
|-------|------|-------------|
| `type` | `bar` / `line` / `pie` | Chart type |
| `title` | string | Chart title |
| `xKey` | string | Key for x-axis |
| `yKeys` | string[] | Keys for y-axis series |
| `data` | object[] | Chart data |

### Safety Guardrails

- **Max 8 tool rounds** per request to prevent infinite loops.
- **SQL whitelist** validation before execution.
- **Read-only transaction** at the database level.
- **15-second timeout** on the RPC function.
- **Max 1000 rows** returned per query.

### Chat UI Components

| Component | Description |
|-----------|-------------|
| `ChatPanel` | Mobile: Drawer (85vh). Desktop: Sheet (480px) or expanded dialog (1200x850px) |
| `ChatButton` | Floating action button to open chat |
| `ChatInput` | Message input with submit/abort |
| `ChatMessage` | Renders text (Markdown), SQL badges, tables, charts |
| `ChatHistory` | Sidebar listing past conversations |
| `ChatChart` | Recharts wrapper; pie charts auto-group >8 items into "Other"; download as PNG |
| `ChatTable` | Renders SQL results as a scrollable table; CSV export |
| `ChatSqlBadge` | Expandable badge showing the SQL query that was executed |

### Conversation Persistence

- Stored in Turso (`conversations` table): `id`, `user_id`, `title`, `messages` (JSON blob), timestamps.
- Max 50 conversations per user; oldest auto-deleted when limit is reached.
- In-flight save coalescing: if multiple saves are triggered rapidly, only the latest is actually sent.
- `useChatHistory` hook handles CRUD operations.

---

## 12. Report Generation (LLM Abstraction)

### Unified LLM Interface

The `lib/llm/` directory provides a unified interface for calling different LLM providers:

```typescript
generateContent(provider, model, prompt, options)
```

### Supported Providers and Models

| Provider | Models |
|----------|--------|
| Gemini | `gemini-2.5-flash`, `gemini-3.0-pro`, `gemini-3-flash-preview` |
| OpenAI | `gpt-4o`, `gpt-4.1` |

### Report Types

| Type | Description |
|------|-------------|
| `success` | Analysis of successful calls |
| `failure` | Analysis of failed calls |
| `full` | Complete daily analysis (success + failure) |
| `weekly` | Weekly rollup from daily EOD reports |

### Data Format: TOON

Reports can encode data in either JSON or TOON (Token-Oriented Object Notation). TOON achieves approximately 40% token reduction compared to JSON, reducing LLM costs. The `/api/reports/format-compare` endpoint lets you compare the two formats side by side.

### Report Generation Flow

```
1. Payload Generation
   POST /api/reports/payload-generate
   --> Queries Supabase for calls, transfers, emails in the date range
   --> Returns structured raw data

2. Save Report
   POST /api/reports
   --> Stores raw_data in Turso (eod_reports table)

3. AI Generation
   POST /api/reports/ai-generate
   --> Loads prompt template from `prompts` table (firm + report type specific)
   --> Encodes data as JSON or TOON
   --> Calls LLM via unified interface
   --> Returns markdown analysis

4. Update Report
   POST /api/reports
   --> Stores AI-generated text + error count in Turso
```

### Post-Processing

After generation, correlation IDs in the markdown are converted to clickable dashboard links (e.g., `[ABC123](/calls?c=ABC123&e=production)`).

### Prompt Templates

Stored in the `prompts` table in Supabase, keyed by `firm_id` and `report_type`. This allows different firms to have different analysis styles.

### Export Options

| Format | Implementation |
|--------|---------------|
| PDF | `html2pdf.js` via `pdf-export-button` component |
| DOCX | `remark-docx` via `docx-export-button` component |
| Clipboard | Copy markdown to clipboard |

### Storage

Reports are stored in Turso (migrated from file-based SQLite). The `eod_reports` table holds both the raw data payload and the AI-generated analysis.

---

## 13. Cekura Integration

Cekura is an external call observability and quality monitoring platform. It provides pass/fail metrics and detailed explanations for each call.

### Agent Configuration

| Environment | Agent ID |
|-------------|----------|
| Production | 10779 |
| Staging | 11005 |

### Progressive Loading Strategy

Cekura's API is paginated, so the dashboard uses a progressive loading pattern:

1. **Page 1** (25 items) is fetched immediately for fast initial render.
2. **Remaining pages** are fetched in the background, progressively updating the UI.

This is handled by `useCekuraCallMapping` which maps Supabase `correlation_id` values to Cekura call data.

### Data Model

- **Metrics**: Binary pass/fail metrics per call, with explanations for failures.
- **Status**: `reviewed_success` or `reviewed_failure` -- set by human reviewers.
- **Feedback**: Free-text field for reviewer notes.

### UI Components

| Component | Description |
|-----------|-------------|
| `CekuraStatus` | Badge showing pass/fail status with color coding |
| `CekuraFeedback` | Inline-editable text field with optimistic updates |
| `CekuraStatusSelector` | Dropdown for setting review status |

### Feature Gating

Cekura integration is enabled per firm via `features.cekuraIntegration` in the client config. Firms without this feature never see Cekura columns or panels.

---

## 14. Accurate Transcript (Gemini)

The accurate transcript feature uses Gemini 3 Flash with thinking capabilities to correct AI-generated transcripts using ground truth data.

### How It Works

1. The original transcript is extracted from the webhook payload (numbered message format).
2. Ground truth is gathered from multiple sources:
   - Firm name
   - `search_case_details` tool call results (case names, numbers)
   - `staff_directory_lookup` tool call results (attorney names, extensions)
   - Transfer transcripts
3. The original audio (max 20MB inline) and ground truth are sent to Gemini.
4. Gemini returns a corrected transcript with accurate names, case numbers, and entities.

### Trigger

- `POST /api/calls/[id]/accurate-transcript`
- `useAccurateTranscript` mutation hook
- Feature-gated per firm via `features.accurateTranscript`

---

## 15. Admin Panel and Client Config

### Access Control

Admin access is determined by email domain matching. The `adminDomains` array in `config/client-configs.json` specifies which email domains get admin access. Users with admin access see all firms, all pages, and the admin configuration panel.

### Config File Structure

The config is stored as a JSON file at `config/client-configs.json`:

```json
{
  "adminDomains": ["example.com"],
  "userFirmMappings": {
    "user@lawfirm.com": "firm-123"
  },
  "firms": {
    "firm-123": {
      "displayName": "Smith & Associates",
      "logoUrl": "/logos/smith.png",
      "pages": { ... },
      "columns": { ... },
      "features": { ... },
      "theme": { ... }
    }
  },
  "defaults": { ... }
}
```

### Per-Firm Configuration

**Pages** -- Toggle visibility of each dashboard page:

- calls, reports, emails, transfers, sentry, webhooks

**Columns** -- Toggle specific columns per table (calls table, emails table, etc.)

**Features** -- Boolean flags:

| Feature | Description |
|---------|-------------|
| `aiReports` | Enable AI-generated reports |
| `cekuraIntegration` | Enable Cekura quality metrics |
| `chat` | Enable natural-language chat |
| `accurateTranscript` | Enable Gemini transcript correction |
| `dynamicFilters` | Enable the advanced filter builder |
| `environmentSwitcher` | Enable prod/staging toggle |
| `piiMasking` | Enable PII masking for this firm |

**Theme** -- 25+ OKLCH color variables:

```json
{
  "theme": {
    "--background": "0.98 0 0",
    "--foreground": "0.14 0.004 285.82",
    "--primary": "0.21 0.006 285.88",
    "--primary-foreground": "0.98 0 0",
    "--card": "1 0 0",
    "--border": "0.91 0.005 285.82",
    "--radius": "0.625rem"
  }
}
```

**Branding**:

- `displayName` -- Sets `document.title` and navbar text
- `logoUrl` -- Overrides the navbar logo

### Config Resolution Logic

When a user loads the dashboard, the `ClientConfigProvider` resolves their config:

1. **Email domain in `adminDomains`?** Full access -- all pages, all features, no firm filtering.
2. **Email in `userFirmMappings`?** Firm-specific config from `firms[firmId]`.
3. **Neither?** Apply `defaults` config.

### Theme Application

The `ClientConfigProvider`:
1. Reads the resolved theme object.
2. Sets CSS custom properties on the document root element.
3. Sets `document.title` to the firm's `displayName`.
4. Forces light theme for firm users (no dark mode toggle).
5. Overrides the navbar logo with the firm's `logoUrl`.

### Admin Panel Components

| Component | Purpose |
|-----------|---------|
| `PageToggles` | Enable/disable dashboard pages per firm |
| `ColumnToggles` | Show/hide specific table columns per firm |
| `FeatureToggles` | Enable/disable features per firm |
| `BrandingEditor` | Edit display name, logo URL, theme colors |
| `UserFirmMappings` | Map email addresses to firm IDs |
| `AdminDomainEditor` | Manage admin email domains |

---

## 16. PII Masking

PII (Personally Identifiable Information) masking is a per-firm configurable feature for firms that need data protection in the dashboard UI.

### Masking Rules

| Data Type | Original | Masked |
|-----------|----------|--------|
| Phone numbers | `(555) 123-4567` | `(555) ...` (first 3 digits visible) |
| Names | `John Smith` | `J...` (first letter visible) |
| Email addresses | `john@example.com` | `j...` (first character visible) |
| Transcripts | Full text | Masked names/phones within text |

### Implementation

- **Hook**: `usePIIMask()` returns masking functions based on the current firm's `features.piiMasking` flag.
- **Source**: `lib/pii-masker.ts` contains the masking logic.
- When masking is disabled (default), the functions pass through values unchanged.

---

## 17. Filtering System

The calls page has the most sophisticated filtering in the application.

### Sidebar Filters

| Filter | Type | Source |
|--------|------|--------|
| Firm | Single-select dropdown | `/api/firms` |
| Call Type | Multi-select | Enum values |
| Transfer Type | Multi-select | Enum values |
| Cekura Status | Multi-select | reviewed_success, reviewed_failure, unreviewed |
| Date Range | Date picker | Bounded by `useCallDateRange` |
| Search | Text input | Searches caller name, phone, correlation ID |

### Dynamic Filter Builder

For power users, the dynamic filter builder supports multi-field boolean logic:

- **Combinators**: AND / OR to combine conditions.
- **Operators**: equals, not_equals, contains, not_contains, starts_with, ends_with, greater_than, less_than, is_empty, is_not_empty, is_true, is_false.
- **Webhook-based filters**: Some fields (voicemail, has_conversation) require parsing the compressed webhook payload.
- **Impossible condition detection**: If filter logic is contradictory, the system returns empty results immediately without hitting the database.

### URL Serialization

Filter state is compressed with `lz-string` and stored in URL parameters, enabling shareable filtered views. See the URL Sharing section.

---

## 18. URL Sharing

The `lib/share-url.ts` module provides `buildShareableUrl()` which compresses all current filter and navigation state into URL parameters.

### Calls URL Format

```
/calls?s=<lz-compressed-filters>&f=<firmId>&e=<environment>&c=<correlationId>
```

| Parameter | Purpose |
|-----------|---------|
| `s` | lz-string compressed filter state (all sidebar + dynamic filters) |
| `f` | Firm ID filter |
| `e` | Environment (production/staging) |
| `c` | Specific correlation ID to highlight/open |

### Reports URL Format

```
/reports?report=<date>&type=<eod|weekly>&e=<environment>
```

This allows sharing a direct link to a specific report.

---

## 19. Components Architecture

The project has 70+ component files across 13 directories. Here is the full tree with counts:

```
components/
|
+-- admin/ (6 files)
|   +-- admin-domain-editor     Manage admin email domains
|   +-- branding-editor         Edit firm display name, logo, theme colors
|   +-- column-toggles          Per-firm table column visibility
|   +-- feature-toggles         Per-firm feature flags (boolean switches)
|   +-- page-toggles            Per-firm page visibility
|   +-- user-firm-mappings      Map user emails to firm IDs
|
+-- cekura/ (3 files)
|   +-- cekura-status           Pass/fail badge with color coding
|   +-- cekura-feedback         Inline-editable feedback text
|   +-- cekura-status-selector  Dropdown for setting review status
|
+-- charts/ (2 files)
|   +-- call-volume-chart       Recharts line/bar chart for call volume over time
|   +-- kpi-card                Single KPI metric card with label, value, delta
|
+-- chat/ (8 files)
|   +-- chat-panel              Main container (Drawer on mobile, Sheet/Dialog on desktop)
|   +-- chat-button             Floating action button to open chat
|   +-- chat-input              Message textarea with submit and abort controls
|   +-- chat-message            Renders a single message (Markdown, tables, charts, SQL badges)
|   +-- chat-history            Sidebar listing past conversations
|   +-- chat-chart              Recharts wrapper for Gemini-generated charts
|   +-- chat-table              Scrollable table for SQL results with CSV export
|   +-- chat-sql-badge          Expandable badge showing the executed SQL query
|
+-- details/ (4 files)
|   +-- call-detail-sheet       Resizable 2-panel overlay (desktop) or tabbed (mobile)
|   +-- call-detail-panel       Content panels (left: summary/metadata/transcript, right: transfers/emails/sentry/cekura)
|   +-- call-detail-carousel    Previous/Next navigation with keyboard arrow support
|   +-- detail-dialog           Generic detail dialog wrapper
|
+-- email/ (2 files)
|   +-- email-body-display      Renders email HTML body safely
|   +-- recipients-display      Shows To/CC/BCC recipients with overflow handling
|
+-- eod/ (3 files)
|   +-- markdown-report         ReactMarkdown with GFM tables, syntax highlighting
|   +-- pdf-export-button       Export report to PDF via html2pdf.js
|   +-- docx-export-button      Export report to DOCX via remark-docx
|
+-- filters/ (3 files)
|   +-- filter-sidebar          The filter form (firm, type, dates, search)
|   +-- responsive-filter-sidebar   Desktop: fixed 256px sidebar. Mobile: bottom drawer with FAB
|   +-- dynamic-filter-builder  Multi-condition boolean filter builder (AND/OR)
|
+-- layout/ (2 files)
|   +-- navbar                  Top navigation bar (horizontal on desktop, hamburger drawer on mobile)
|   +-- environment-switcher    Prod/staging toggle button
|
+-- providers/ (6 files)
|   +-- query-provider          TanStack Query client initialization
|   +-- environment-provider    Prod/staging state + localStorage persistence
|   +-- date-filter-provider    Shared date range state
|   +-- theme-provider          next-themes wrapper (light/dark)
|   +-- client-config-provider  Resolves per-firm config, applies CSS theme
|   +-- auth-listener-provider  Monitors Supabase auth state changes
|
+-- tables/ (1 file)
|   +-- data-table              Generic TanStack Table with pagination, sorting, row selection
|
+-- ui/ (25+ files)
|   shadcn/ui components: audio-player, badge, button, card, chart, checkbox,
|   collapsible, dialog, drawer, dropdown-menu, input, json-viewer, label,
|   popover, resizable, scroll-area, select, separator, sheet, switch, table,
|   tabs, toggle-group, tooltip, and more
```

---

## 20. Page Layout Patterns

### Standard Page Layout

Every dashboard page follows the same flex layout pattern:

```tsx
<div className="flex h-full">
  <ResponsiveFilterSidebar>
    {/* Desktop: fixed w-64 sidebar. Mobile: bottom drawer with FAB trigger */}
  </ResponsiveFilterSidebar>

  <div className="flex-1 flex flex-col p-6 overflow-hidden">
    <header className="shrink-0">
      {/* Page title + stat badges */}
    </header>
    <main className="flex-1 min-h-0">
      <DataTable />
      {/* Scrollable table area */}
    </main>
  </div>

  {selectedId && <CallDetailSheet />}
  {/* Overlay panel for call details */}
</div>
```

### Call Detail Sheet

The call detail view is the most complex layout:

**Desktop** (width >= 768px):
- Resizable 2-panel layout (default split: 55% left / 45% right).
- Left panel: Summary, metadata, transcript, audio player.
- Right panel: Transfers, emails, Sentry errors, Cekura metrics.
- Panel sizes are persisted to localStorage via `usePanelSize`.

**Mobile** (width < 768px):
- Tabbed layout with two tabs: "Info" (summary + metadata) and "Details" (transfers + emails).
- Transcript shown inline below tabs.

**Navigation**:
- Previous/Next buttons to move between calls.
- Keyboard shortcuts: Left/Right arrows, Escape to close.
- `usePrefetchCallDetails` prefetches adjacent calls for instant navigation.

---

## 21. Responsive Design

The dashboard is mobile-first, with breakpoints and hooks managing layout differences.

### Breakpoints

| Breakpoint | Hook | Usage |
|-----------|------|-------|
| 768px | `useIsMobile()` | Primary mobile/desktop split |
| Custom | `useMediaQuery()` | Generic media query matching |
| Orientation | `useIsLandscape()` | Landscape detection for call detail layout |

### Responsive Adaptations

| Component | Desktop | Mobile |
|-----------|---------|--------|
| Filter sidebar | Fixed 256px sidebar | Bottom drawer with floating action button |
| Call detail | Resizable 2-panel | Tabbed layout (Info / Details) |
| Tables | All columns visible | Non-essential columns hidden |
| Navbar | Horizontal navigation links | Hamburger icon with slide-out drawer |
| Chat panel | Sheet (480px) or expanded dialog (1200x850) | Full-width drawer (85vh) |
| Touch targets | Standard sizing | Minimum 44x44px |

### Touch Interactions

- `useSwipe` hook for gesture detection in drawers and carousels.
- Vaul library for smooth bottom drawer behavior on mobile.

---

## 22. Design System

### Colors

Colors use the OKLCH color space, defined as CSS custom properties in `globals.css`. OKLCH provides perceptually uniform color manipulation, meaning lightness adjustments look natural across all hues.

```css
--background: 1 0 0;          /* oklch(1 0 0) = white */
--foreground: 0.14 0.004 285.82;
--primary: 0.21 0.006 285.88;
--destructive: 0.57 0.22 27.33;
```

Light and dark modes are both supported, with theme switching via `next-themes`.

### Typography

| Context | Font |
|---------|------|
| General UI text | Geist Sans |
| IDs, phone numbers, code | Geist Mono |

### Spacing and Borders

| Element | Border Radius |
|---------|---------------|
| Cards | `rounded-xl` (10px) |
| Buttons, inputs | `rounded-md` |
| Base value | 10px (configurable per-firm via theme `--radius`) |

### Shadows

| Level | Usage |
|-------|-------|
| `shadow-xs` | Inputs |
| `shadow-sm` | Cards |
| `shadow-md` | Dropdowns |
| `shadow-lg` | Dialogs, sheets |

### Icons

Lucide React icons at `h-4 w-4` standard size. Consistently imported per-component.

### Class Merging

The `cn()` utility from `lib/utils.ts` combines `clsx` (conditional classes) with `tailwind-merge` (deduplication of Tailwind classes):

```typescript
import { cn } from "@/lib/utils"

cn("px-4 py-2", isActive && "bg-primary text-white", className)
```

### Custom Animations

| Animation | CSS Class | Usage |
|-----------|-----------|-------|
| Orange pulse | `pulse-orange` | Important calls |
| Red pulse | `pulse-red` | Error indicators |
| Yellow pulse | `pulse-yellow` | Mismatch warnings |

---

## 23. Security Patterns

### SQL Injection Prevention

All user-provided strings that end up in SQL `LIKE` clauses are escaped via `escapeLikePattern()` from `lib/api/utils.ts`:

```typescript
// Escapes %, _, and \ characters
escapeLikePattern(userInput)
```

The higher-level `buildSafeSearchTerm()` trims whitespace and applies escaping for search inputs.

### Chat SQL Validation

User-generated SQL from the chat system passes through a client-side whitelist before reaching the database:

- **Allowed**: `SELECT` only.
- **Blocked**: `INSERT`, `UPDATE`, `DELETE`, `DROP`, `CREATE`, `ALTER`, `TRUNCATE`, `GRANT`, `REVOKE`.
- **Blocked tables**: `pg_*`, `information_schema.*`, and other system tables.
- **Enforced limit**: `LIMIT` clause capped at 1000 rows.
- **Server-side**: Supabase RPC `execute_readonly_sql()` wraps everything in a read-only transaction with a 15-second timeout.

### Authentication Defense in Depth

Two layers of auth checking:
1. `proxy.ts` validates every incoming request.
2. Individual API routes call `authenticateRequest()` again.

### Input Validation

| Function | Purpose |
|----------|---------|
| `parseIntOrNull(value)` | Parse integer or return null |
| `parseIntOrDefault(value, default)` | Parse integer with fallback |
| Pagination cap | Maximum 100 items per page |

### Data Compression

Webhook payloads (which can be large JSON objects) are stored as gzip-compressed, base64-encoded strings in the `calls` table. This reduces storage costs and network transfer.

### PII Protection

Per-firm PII masking (see section 16) ensures sensitive data is not displayed to users who should not see it.

---

## 24. External Integrations

### Supabase

- **Role**: Primary PostgreSQL database.
- **Two projects**: Production and staging, switchable at runtime.
- **Auth**: Supabase Auth for user management (always hits staging project).
- **Client**: `@supabase/supabase-js` with SSR cookie management via `@supabase/ssr`.

### Turso / LibSQL

- **Role**: Secondary database for chat history and reports.
- **Client**: `@libsql/client` singleton in `lib/turso/`.
- **Tables**: `conversations` (chat), `eod_reports` (reports).
- **Why separate?**: Reports and chat are dashboard-specific data, not related to the core call data in Supabase.

### Google Gemini

- **SDK**: `@google/genai`
- **Uses**: Chat function calling (Gemini 3 Flash), accurate transcript (Gemini 3 Flash with thinking), report generation (multiple models).

### OpenAI

- **SDK**: `openai`
- **Uses**: Report generation (gpt-4o, gpt-4.1) as an alternative to Gemini.

### Sentry

- **Role**: Error monitoring for the AI receptionist backend.
- **Integration**: Dashboard fetches Sentry events via Sentry API and correlates them to specific calls.
- **Auth**: `SENTRY_AUTH_TOKEN` with org/project scoping.

### Cekura

- **Role**: Call quality observability platform.
- **Integration**: Maps call correlation IDs to Cekura assessments (pass/fail metrics).
- **Auth**: `CEKURA_API_KEY`.

### Google Sheets

- **Role**: Visit and chat logging (analytics).
- **Auth**: OAuth2 with cached refresh token via `googleapis`.
- **Functions**: `logVisitToSheet()`, `logChatToSheet()`.
- **Behavior**: Fire-and-forget (non-blocking); failures are silently logged.
- **Timezone**: All timestamps in IST (Indian Standard Time).
- **Setup**: One-time OAuth flow via `scripts/google-sheets-auth.mjs`.

---

## 25. Environment Variables

### Required -- Core

| Variable | Description |
|----------|-------------|
| `SUPABASE_PROD_URL` | Production Supabase project URL |
| `SUPABASE_PROD_KEY` | Production Supabase API key |
| `SUPABASE_STAGE_URL` | Staging Supabase project URL |
| `SUPABASE_STAGE_KEY` | Staging Supabase API key |
| `NEXT_PUBLIC_SUPABASE_STAGE_URL` | Public staging URL (for client-side auth) |
| `NEXT_PUBLIC_SUPABASE_STAGE_ANON_KEY` | Public staging anon key (for client-side auth) |
| `JWT_SECRET` | Secret for signing JWT sessions |

### LLM Providers

| Variable | Description |
|----------|-------------|
| `GEMINI_API_KEY` | Google Gemini API key (chat + transcripts + reports) |
| `OPENAI_API_KEY` | OpenAI API key (alternative report generation) |

### Integrations

| Variable | Description |
|----------|-------------|
| `CEKURA_API_KEY` | Cekura call observability API key |
| `SENTRY_ORG` | Sentry organization slug |
| `SENTRY_PROJECT` | Sentry project slug |
| `SENTRY_AUTH_TOKEN` | Sentry API auth token |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID (Sheets) |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret (Sheets) |
| `GOOGLE_REFRESH_TOKEN` | Google OAuth refresh token (Sheets) |
| `GOOGLE_SHEET_ID` | Google Sheets spreadsheet ID |
| `TURSO_DATABASE_URL` | Turso database URL |
| `TURSO_AUTH_TOKEN` | Turso authentication token |

### Auth

| Variable | Description |
|----------|-------------|
| `ALLOWED_EMAILS` | Comma-separated email allowlist for OAuth sign-up |

---

## 26. Dependencies

### Core Framework

| Package | Version | Purpose |
|---------|---------|---------|
| `next` | 16.1.1 | App framework (App Router, Turbopack) |
| `react` / `react-dom` | 19.2.3 | UI library |
| `typescript` | 5.x | Type safety |

### Data Layer

| Package | Version | Purpose |
|---------|---------|---------|
| `@tanstack/react-query` | 5.90.16 | Data fetching, caching, mutations |
| `@tanstack/react-table` | 8.21.3 | Headless table with server-side pagination/sorting |
| `@supabase/supabase-js` | 2.90.0 | Supabase client |
| `@supabase/ssr` | 0.8.0 | Server-side rendering + cookie auth |
| `@libsql/client` | 0.17.0 | Turso/LibSQL client |

### UI Components

| Package | Version | Purpose |
|---------|---------|---------|
| `@radix-ui/*` | Various | Accessible primitives (dialog, popover, select, tabs, etc.) |
| `recharts` | 2.15.4 | Chart library (bar, line, pie) |
| `framer-motion` | 12.33.0 | Animations and transitions |
| `lucide-react` | 0.562.0 | Icon library |
| `vaul` | 1.1.2 | Bottom drawer component |
| `react-resizable-panels` | 4.5.3 | Resizable panel layouts |
| `react-day-picker` | 9.13.0 | Date picker |
| `@uiw/react-json-view` | 2.0.0-alpha.40 | JSON viewer for webhook payloads |
| `next-themes` | 0.4.6 | Theme switching (light/dark) |

### LLM and AI

| Package | Version | Purpose |
|---------|---------|---------|
| `@google/genai` | 1.38.0 | Gemini SDK (chat, transcripts, reports) |
| `openai` | 6.16.0 | OpenAI SDK (reports) |

### Content Processing

| Package | Version | Purpose |
|---------|---------|---------|
| `react-markdown` | 10.1.0 | Render markdown in reports and chat |
| `remark-gfm` | 4.0.1 | GitHub Flavored Markdown (tables, strikethrough) |
| `remark-docx` | 0.3.25 | Convert markdown to DOCX |
| `remark-parse` | 11.0.0 | Markdown parser |
| `rehype-highlight` | 7.0.2 | Syntax highlighting in markdown |
| `unified` | 11.0.5 | Unified text processing pipeline |

### Utilities

| Package | Version | Purpose |
|---------|---------|---------|
| `date-fns` | 4.1.0 | Date formatting and manipulation |
| `lz-string` | 1.5.0 | URL-safe compression for filter state |
| `jose` | 6.1.3 | JWT operations (legacy, kept for reference) |
| `class-variance-authority` | 0.7.1 | Variant-based component styling |
| `clsx` | 2.1.1 | Conditional class names |
| `tailwind-merge` | 3.4.0 | Deduplicates Tailwind classes |
| `file-saver` | 2.0.5 | Client-side file download |
| `html2pdf.js` | 0.14.0 | HTML to PDF conversion |
| `@toon-format/toon` | 2.1.0 | Token-efficient data serialization |

### External Services

| Package | Version | Purpose |
|---------|---------|---------|
| `googleapis` | 171.4.0 | Google Sheets API |

### Dev Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `tailwindcss` | 4.x | CSS framework |
| `@tailwindcss/postcss` | 4.x | PostCSS plugin |
| `tw-animate-css` | 1.4.0 | Animation utilities for Tailwind |
| `eslint` / `eslint-config-next` | 9.x / 16.1.1 | Linting |

---

## 27. Scripts

| Script | Location | Purpose |
|--------|----------|---------|
| `google-sheets-auth.mjs` | `scripts/` | One-time OAuth flow to obtain a Google refresh token for Sheets API access. Run locally, paste the resulting token into env vars. |
| `dump-schema.py` | `scripts/` | Extracts the Supabase database schema via the OpenAPI spec. Useful for keeping the chat system prompt up to date. |
| `analyze_call_durations.py` | `scripts/` | Python script for offline analysis of call duration distributions. |

---

## 28. Build and Development Commands

```bash
npm run dev      # Start dev server at http://localhost:3000 (Turbopack)
npm run build    # Production build
npm start        # Start production server
npm run lint     # Run ESLint
```

No test framework is currently configured. The project relies on TypeScript strict mode, ESLint, and manual QA.

---

## Appendix: Data Flow Diagrams

### Call Lifecycle (from phone to dashboard)

```
Incoming call to law firm
    |
    v
AI Receptionist handles the call
  - Answers, triages, looks up cases, transfers
  - Sends email summaries
    |
    v
Telephony platform sends webhooks
    |
    v
Backend processes webhooks:
  - Stores call record in Supabase (calls table)
  - Stores email log (email_logs table)
  - Stores transfer details (transfers_details table)
  - Stores raw webhook (webhook_dumps table)
    |
    v
Dashboard queries Supabase via BFF API routes
    |
    v
Operations team monitors in real-time
```

### Report Generation Lifecycle

```
User opens Reports page, selects date + firm
    |
    v
"Generate Payload" button
    --> POST /api/reports/payload-generate
    --> Queries calls, transfers, emails for the date range
    --> Returns structured raw data
    |
    v
"Save" button
    --> POST /api/reports
    --> Stores raw_data in Turso
    |
    v
"Generate AI Report" button (success/failure/full)
    --> POST /api/reports/ai-generate
    --> Loads prompt template from Supabase
    --> Encodes data (JSON or TOON)
    --> Calls Gemini or OpenAI
    --> Returns markdown analysis
    |
    v
"Save" button
    --> Updates report in Turso with AI text
    |
    v
Export: PDF / DOCX / Clipboard
```

### Chat Interaction Flow

```
User types: "How many calls did we get last week?"
    |
    v
POST /api/chat (NDJSON stream)
    |
    v
Gemini 3 Flash receives system prompt + schema + user message
    |
    v
Gemini calls run_sql:
  SELECT COUNT(*) FROM calls
  WHERE started_at >= '2026-02-09'
    AND started_at < '2026-02-16'
    |
    v
SQL validated (SELECT only, no system tables, LIMIT enforced)
    |
    v
Executed via Supabase RPC (read-only, 15s timeout)
    |
    v
Result: [{ count: 342 }]
    |
    v
Gemini responds: "You received 342 calls last week."
    |
    v
Streamed to browser as NDJSON events:
  { type: "sql", data: "SELECT COUNT(*)..." }
  { type: "result", data: [{ count: 342 }] }
  { type: "text", data: "You received 342 calls last week." }
  { type: "done" }
```

---

*This document covers the full AI Receptionist Dashboard codebase as of February 2026.*
