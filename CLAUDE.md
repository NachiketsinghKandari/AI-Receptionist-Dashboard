# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
npm run dev      # Start dev server at http://localhost:3000
npm run build    # Production build
npm start        # Start production server
npm run lint     # Run ESLint
```

No test framework is currently configured.

## Tech Stack

- **Next.js 16** with App Router and Turbopack
- **React 19** with TypeScript (strict mode)
- **Tailwind CSS v4** with shadcn/ui components (Radix primitives)
- **TanStack Query** for data fetching with 60s stale time
- **TanStack Table** for server-side paginated tables
- **Supabase** as PostgreSQL backend
- **Supabase Auth** for authentication (cookie-based, `sb-*` prefix); legacy JWT auth via `jose` still present
- **Google Gemini** (`@google/genai`) for AI chat and accurate transcripts
- **OpenAI** for AI report generation
- **Turso/libSQL** (`@libsql/client`) for conversation history and reports storage
- **Google Sheets API** (`googleapis`) for visit/chat logging
- **TOON format** (`@toon-format/toon`) for token-optimized report data
- **Recharts** for data visualization
- **Framer Motion** for animations
- **lz-string** for URL compression
- **vaul** for drawer component

## Architecture

### BFF (Backend-for-Frontend) Pattern
All external API calls (Supabase, Sentry) go through Next.js API routes in `app/api/`. This keeps credentials server-side and provides a single point for caching/error handling.

### Route Groups
- `app/(auth)/` - Login page (public)
- `app/(dashboard)/` - Protected pages: home (KPIs), calls, emails, transfers, webhooks, sentry

### Auth Proxy
`proxy.ts` validates sessions on every request (Next.js 16 pattern, replaces deprecated `middleware.ts`). Uses Supabase Auth with cookies (`sb-*` prefix), validating via `supabase.auth.getUser()`. Redirects unauthenticated users to `/login`.

### Environment Switching
`components/providers/environment-provider.tsx` enables switching between production and staging Supabase environments. Stored in localStorage, invalidates all TanStack Query caches on switch.

### Data Fetching Pattern
All queries use custom hooks in `/hooks` wrapping TanStack Query:
- `use-calls.ts`, `use-emails.ts`, `use-transfers.ts`, etc.
- 60-second stale time for data, 300-second for firms list
- Background refetch on window focus

### Chat System
Gemini function calling with `run_sql` and `generate_chart` tools. Uses NDJSON streaming for real-time responses. SQL queries are validated server-side (whitelist approach). Max 8 tool rounds per conversation turn.

### Admin Panel & Client Config
Per-firm white-labeling with OKLCH theming, page/column/feature toggles. File-based config at `config/client-configs.json`. Supports admin domains and user-firm mappings.

### Cekura Integration
Call observability with progressive loading, status updates, and feedback submission. Integrated into call details panel.

### Report Generation
LLM abstraction layer supporting Gemini and OpenAI providers. Uses TOON format for token-optimized data passed to LLMs. Prompts stored in database table for easy iteration.

### Turso/libSQL
Turso database stores chat conversation history and end-of-day reports. Accessed via `@libsql/client`.

## Key Directories

```
app/api/              # BFF API routes (calls, emails, transfers, webhooks, stats, sentry, chat, reports, admin)
components/ui/        # shadcn/ui base components
components/admin/     # Admin panel components (page/column/feature toggles, branding)
components/chat/      # AI chat interface (panel, messages, charts, tables)
components/cekura/    # Cekura integration (status, feedback)
components/eod/       # Report display (markdown, PDF/DOCX export)
config/               # Client configs (client-configs.json)
hooks/                # TanStack Query hooks
lib/auth/             # Auth config + session management
lib/supabase/         # Supabase client factory (prod/staging)
lib/chat/             # Gemini chat orchestration, SQL validation, system prompt
lib/llm/              # LLM provider abstraction (Gemini, OpenAI)
lib/eod/              # Report generation logic
lib/turso/            # Turso client
lib/google-sheets.ts  # Google Sheets logging
lib/api/utils.ts      # SQL injection prevention, input validation
scripts/              # Utility scripts (Google Sheets auth, schema dump)
types/                # TypeScript interfaces (database.ts, api.ts)
```

## Security Patterns

### SQL Injection Prevention
Use `escapeLikePattern()` from `lib/api/utils.ts` for LIKE queries - escapes `%`, `_`, `\`.

### Input Validation
- `parseIntOrNull()`, `parseIntOrDefault()` for integer params
- Pagination capped at 100 per page
- Search terms trimmed and escaped via `buildSafeSearchTerm()`

### Chat SQL Validation
Whitelist approach: SELECT only, no system tables, LIMIT enforced. Supabase RPC executes queries as read-only with a 15-second timeout.

### Webhook Payload Compression
Webhook payloads are base64 + gzip compressed. Decoded via `decodeBase64Payload()`.

## UI Conventions

- **Border radius**: 10px base (`rounded-xl` for cards, `rounded-md` for buttons/inputs)
- **Colors**: OKLCH color space via CSS variables
- **Icons**: Lucide React, typically `h-4 w-4`
- **Class merging**: Use `cn()` from `lib/utils.ts`
- **Font**: Geist Sans for UI, Geist Mono for IDs/phone numbers

## Environment Variables

Required:
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_KEY` - Supabase API key
- `JWT_SECRET` - Secret for signing JWT sessions (legacy)

Supabase environments:
- `SUPABASE_PROD_URL`, `SUPABASE_PROD_KEY` - Production Supabase
- `SUPABASE_STAGE_URL`, `SUPABASE_STAGE_KEY` - Staging Supabase
- `NEXT_PUBLIC_SUPABASE_STAGE_URL`, `NEXT_PUBLIC_SUPABASE_STAGE_ANON_KEY` - Client-side Supabase Auth

AI/LLM:
- `GEMINI_API_KEY` - Google Gemini API key (chat, reports, transcripts)
- `OPENAI_API_KEY` - OpenAI API key (reports)

Turso:
- `TURSO_DATABASE_URL` - Turso database URL
- `TURSO_AUTH_TOKEN` - Turso auth token

Google Sheets:
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN` - Google OAuth credentials
- `GOOGLE_SHEET_ID` - Target Google Sheet ID

Auth:
- `ALLOWED_EMAILS` - Comma-separated login allowlist

Optional (for Sentry integration):
- `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN`

Optional (for Cekura integration):
- `CEKURA_API_KEY` - API key for Cekura call observability

## Git Commit Guidelines

- **Do NOT add `Co-Authored-By: Claude` lines** to commit messages
