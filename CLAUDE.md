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
- **Recharts** for data visualization
- **JWT auth** via `jose` library

## Architecture

### BFF (Backend-for-Frontend) Pattern
All external API calls (Supabase, Sentry) go through Next.js API routes in `app/api/`. This keeps credentials server-side and provides a single point for caching/error handling.

### Route Groups
- `app/(auth)/` - Login page (public)
- `app/(dashboard)/` - Protected pages: home (KPIs), calls, emails, transfers, webhooks, sentry

### Auth Proxy
`proxy.ts` validates JWT sessions on every request (Next.js 16 pattern, replaces deprecated `middleware.ts`). Redirects unauthenticated users to `/login`.

### Environment Switching
`components/providers/environment-provider.tsx` enables switching between production and staging Supabase environments. Stored in localStorage, invalidates all TanStack Query caches on switch.

### Data Fetching Pattern
All queries use custom hooks in `/hooks` wrapping TanStack Query:
- `use-calls.ts`, `use-emails.ts`, `use-transfers.ts`, etc.
- 60-second stale time for data, 300-second for firms list
- Background refetch on window focus

## Key Directories

```
app/api/           # BFF API routes (calls, emails, transfers, webhooks, stats, sentry)
components/ui/     # shadcn/ui base components
hooks/             # TanStack Query hooks
lib/auth/          # Auth config + JWT session management
lib/supabase/      # Supabase client factory (prod/staging)
lib/api/utils.ts   # SQL injection prevention, input validation
types/             # TypeScript interfaces (database.ts, api.ts)
```

## Security Patterns

### SQL Injection Prevention
Use `escapeLikePattern()` from `lib/api/utils.ts` for LIKE queries - escapes `%`, `_`, `\`.

### Input Validation
- `parseIntOrNull()`, `parseIntOrDefault()` for integer params
- Pagination capped at 100 per page
- Search terms trimmed and escaped via `buildSafeSearchTerm()`

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
- `JWT_SECRET` - Secret for signing JWT sessions

Optional (for Sentry integration):
- `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN`
