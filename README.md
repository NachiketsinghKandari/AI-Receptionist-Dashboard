# Next.js Dashboard

A Next.js 16 dashboard application migrated from the Streamlit `unified_dashboard/`. Provides full feature parity with modern React patterns and improved architecture.

## Tech Stack

- **Framework:** Next.js 16 (App Router) + TypeScript
- **UI:** Tailwind CSS v4 + shadcn/ui + Framer Motion
- **Tables:** TanStack Table v8 (server-side pagination)
- **Data Fetching:** TanStack Query (caching, background refetch)
- **Charts:** Recharts
- **Auth:** JWT sessions with Supabase user authentication
- **Database:** Supabase PostgreSQL
- **Monitoring:** Sentry API integration (server-side proxy)
- **AI/LLM:** OpenAI + Google Gemini (for reports, chat, and accurate transcripts)
- **Call Observability:** Cekura integration
- **PDF Export:** html2pdf.js
- **Markdown:** react-markdown + remark-gfm + rehype-highlight

## Quick Start

### 1. Install dependencies

```bash
cd next-dashboard
npm install
```

### 2. Configure environment

```bash
cp .env.local.example .env.local
```

Edit `.env.local` with your credentials:

```env
# Supabase (same as Python codebase)
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_KEY=eyJ...

# Sentry API (same as Python codebase)
SENTRY_ORG=ai-receptionist
SENTRY_PROJECT=routing-intake-agent
SENTRY_AUTH_TOKEN=sntrys_xxx

# JWT Secret (generate with: openssl rand -base64 32)
JWT_SECRET=your-secret-key-here
```

### 3. Run development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### 4. Build for production

```bash
npm run build
npm start
```

## Authentication

This app uses Supabase email/password authentication. Credentials are managed through Supabase's auth system.

To set up initial users, configure them in your Supabase project's Authentication dashboard. Allowed emails can be restricted via the `ALLOWED_EMAILS` environment variable.

## API Documentation

A Postman collection is available at `postman/ai-receptionist-dashboard-api.json`. Import it into Postman to explore all API endpoints.

Collection variables to configure:
- `base_url` -- Your server URL (default: `https://ai-receptionist-dashboard.vercel.app`)
- `email` -- Your login email
- `password` -- Your login password
- `access_token` -- Auto-populated after running the Login request

## Project Structure

```
├── app/
│   ├── (auth)/                # Public auth pages
│   │   ├── login/             # Login page
│   │   ├── forgot-password/   # Password reset request
│   │   └── reset-password/    # Password reset confirmation
│   ├── (dashboard)/           # Protected dashboard pages
│   │   ├── page.tsx           # Home (KPIs + chart)
│   │   ├── calls/             # Calls table + drill-down
│   │   ├── emails/            # Emails table
│   │   ├── transfers/         # Transfers table
│   │   ├── webhooks/          # Webhooks table
│   │   ├── sentry/            # Sentry event search
│   │   └── reports/           # AI-powered end-of-day reports
│   └── api/                   # BFF API routes
│       ├── auth/              # Login/logout/session
│       ├── calls/             # Calls list, detail, flagged, important
│       ├── cekura/            # Cekura call observability integration
│       ├── chat/              # AI chat with streaming + conversation history
│       ├── client-config/     # Client configuration endpoint
│       ├── emails/            # Emails list
│       ├── reports/           # End-of-day report generation (including AI)
│       ├── transfers/         # Transfers list
│       ├── webhooks/          # Webhooks list
│       ├── firms/             # Firms dropdown
│       ├── stats/             # KPI statistics (overview, chart)
│       ├── admin/             # Admin panel configuration (per-firm theming)
│       └── sentry/            # Sentry proxy (keeps tokens private)
├── components/
│   ├── ui/                    # shadcn/ui components
│   ├── layout/                # Sidebar, Header
│   ├── tables/                # DataTable (generic)
│   ├── details/               # CallDetailPanel
│   ├── filters/               # FilterSidebar
│   ├── charts/                # KPICard, CallVolumeChart
│   ├── chat/                  # AI chat panel, messages, history, charts
│   ├── cekura/                # Cekura feedback and status components
│   ├── email/                 # Email body display, recipients
│   ├── eod/                   # Markdown report, PDF export
│   └── providers/             # Context providers (environment, date, theme, query)
├── hooks/                     # TanStack Query hooks
│   ├── use-calls.ts           # Calls data fetching
│   ├── use-emails.ts          # Emails data fetching
│   ├── use-transfers.ts       # Transfers data fetching
│   ├── use-cekura.ts          # Cekura integration
│   ├── use-eod-reports.ts     # End-of-day reports
│   ├── use-chat.ts            # Chat data fetching
│   ├── use-chat-history.ts    # Chat conversation history
│   ├── use-client-config.ts   # Client configuration
│   ├── use-accurate-transcript.ts # Gemini-powered accurate transcripts
│   ├── use-flagged-calls.ts   # Flagged calls
│   ├── use-is-mobile.ts       # Mobile detection
│   └── ...                    # Additional hooks
├── lib/
│   ├── api/utils.ts           # API utilities (validation, error handling)
│   ├── auth/                  # Auth config + session management + allowlist
│   ├── supabase/              # Supabase client (auth-client, auth-server)
│   ├── chat/                  # Gemini chat logic and streaming
│   ├── sentry/                # Sentry API client (server-only)
│   ├── llm/                   # LLM provider abstraction (OpenAI, Gemini)
│   ├── eod/                   # End-of-day report generation logic
│   ├── share-url.ts           # URL sharing functionality
│   ├── date-utils.ts          # Date manipulation utilities
│   ├── formatting.ts          # Text formatting helpers
│   ├── webhook-utils.ts       # Webhook parsing utilities
│   └── constants.ts           # App constants
├── types/                     # TypeScript interfaces
├── design_principles/         # Design system documentation
├── docs/                      # Product requirements and documentation
├── proxy.ts                   # Auth proxy (Next.js 16 pattern)
└── next.config.ts             # Next.js configuration
```

## Features

### Home Page (`/`)
- KPI cards with period comparison (Today vs Yesterday, This Month vs Last Month)
- Call volume chart (hourly or daily breakdown)
- Period selector toggle

### Calls Page (`/calls`)
- Filterable/searchable table with pagination
- Filters: Date range, Firm, Call Type, Transfer Type
- Click row to expand details:
  - Call overview (duration, status, platform)
  - Audio player (recording URL)
  - Transcript viewer
  - Related transfers
  - Related emails
  - Related webhooks (with parsed payload)
  - Sentry events

### Emails Page (`/emails`)
- Filterable table with HTML body preview
- Filters: Date range, Firm, Search

### Transfers Page (`/transfers`)
- Filterable table with status badges
- Filters: Date range, Firm, Status
- Shows timing details (time to pickup, supervisor answered)

### Webhooks Page (`/webhooks`)
- Filterable table with platform badges
- Filters: Date range, Platform
- Expandable payload viewer with parsed sections:
  - Squad Overrides
  - Assistant Overrides
  - Structured Outputs

### Sentry Page (`/sentry`)
- Search by Correlation ID (platform_call_id)
- Collapsible event cards with:
  - Level/type indicators
  - Request details
  - Context/extra data
  - Exception info

### Reports Page (`/reports`)
- AI-powered end-of-day report generation
- Multiple LLM provider support (OpenAI, Gemini)
- Markdown report rendering with syntax highlighting
- PDF export functionality
- Historical report viewing

### Chat
- AI-powered data analysis chat with Google Gemini
- Streaming responses with real-time output
- Conversation history (server-side persistence)
- Inline chart and table rendering from query results
- Accessible via a floating panel across all dashboard pages

### Admin Panel (`/admin`)
- Per-firm white-label theming configuration
- Customize branding and appearance per firm

### Cekura Integration
- Call observability and quality scoring
- Feedback submission for call quality
- Status tracking and filtering
- Integration with call details panel

## Architecture Decisions

### BFF Pattern (Backend-for-Frontend)
All database and external API calls go through Next.js API routes. This:
- Keeps Supabase/Sentry credentials server-side
- Enables response shaping for frontend needs
- Provides a single point for caching and error handling

### Auth Proxy (Next.js 16)
Uses the new `proxy.ts` convention (replaces deprecated `middleware.ts`):
- Runs on Node.js runtime
- Validates JWT sessions on every request
- Redirects unauthenticated users to `/login`

### SQL Injection Prevention
All search queries use `escapeLikePattern()` to escape special characters (`%`, `_`, `\`) before building LIKE clauses.

### Input Validation
All API routes validate:
- Integer parameters (prevents NaN)
- Pagination limits (max 100 per page)
- Search terms (trimmed, escaped)

### Caching Strategy
TanStack Query caching:
- Data queries: 60 second stale time
- Firms list: 300 second stale time
- Background refetch on window focus

### LLM Provider Pattern
Abstraction layer in `lib/llm/` supports multiple AI providers:
- Pluggable provider interface (OpenAI, Gemini)
- Graceful fallback and error handling
- Used for AI-powered report generation and chat

### Environment Switching
`components/providers/environment-provider.tsx` enables switching between production and staging Supabase environments:
- Stored in localStorage
- Invalidates all TanStack Query caches on switch

### Responsive Design
Mobile-first responsive design with:
- Custom hooks (`use-is-mobile.ts`, `use-media-query.ts`)
- Framer Motion animations for mobile interactions
- Design documentation in `design_principles/`

## Scripts

```bash
npm run dev      # Start development server
npm run build    # Build for production
npm start        # Start production server
npm run lint     # Run ESLint
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_KEY` | Yes | Supabase anon/service key |
| `JWT_SECRET` | Yes | Secret for signing JWT sessions |
| `SENTRY_ORG` | No | Sentry organization slug |
| `SENTRY_PROJECT` | No | Sentry project slug |
| `SENTRY_AUTH_TOKEN` | No | Sentry API auth token |
| `OPENAI_API_KEY` | No | OpenAI API key (for AI report generation) |
| `GEMINI_API_KEY` | No | Google Gemini API key (for chat, reports, and accurate transcripts) |
| `CEKURA_API_KEY` | No | Cekura API key (for call observability) |
| `ALLOWED_EMAILS` | No | Comma-separated list of allowed login emails |

## Migration from Streamlit

This dashboard is a complete rewrite of `unified_dashboard/` with:

| Streamlit | Next.js |
|-----------|---------|
| `shared.py` queries | `app/api/*/route.ts` |
| `Home.py` | `app/(dashboard)/page.tsx` |
| `pages/1_Calls.py` | `app/(dashboard)/calls/page.tsx` |
| `pages/2_Emails.py` | `app/(dashboard)/emails/page.tsx` |
| `pages/3_Transfers.py` | `app/(dashboard)/transfers/page.tsx` |
| `pages/4_Webhooks.py` | `app/(dashboard)/webhooks/page.tsx` |
| `pages/5_Sentry.py` | `app/(dashboard)/sentry/page.tsx` |
| `config.py` users | `lib/auth/config.ts` |
| Streamlit caching | TanStack Query |
| st.dataframe | TanStack Table |
| Plotly charts | Recharts |

## Deployment

### Vercel (Recommended)

1. Push to GitHub
2. Import project in Vercel
3. Add environment variables in Vercel dashboard
4. Deploy

### Docker

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
CMD ["npm", "start"]
```

## Learn More

- [Next.js Documentation](https://nextjs.org/docs)
- [TanStack Query](https://tanstack.com/query/latest)
- [TanStack Table](https://tanstack.com/table/latest)
- [shadcn/ui](https://ui.shadcn.com/)
- [Recharts](https://recharts.org/)
