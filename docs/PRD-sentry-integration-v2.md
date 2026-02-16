# PRD: Sentry Integration v2

## Overview

This document outlines the improved implementation strategy for Sentry logs integration in the AI Receptionist Dashboard, addressing current limitations and leveraging better API endpoints.

---

## Current State Analysis

### Existing Implementation

| Component | Current Approach | Limitation |
|-----------|------------------|------------|
| **Call Detail Logs** | `GET /projects/{org}/{project}/events/?per_page=100` | Only fetches last 100 events, filters client-side by `correlation_id`. Older calls won't have logs. |
| **Error Check (Calls Table)** | Same endpoint, checks last 100 for errors | Same limitation - misses errors from older events |
| **Sentry Browse Page** | Same endpoint with pagination | No server-side filtering by `correlation_id` |

### Core Problem

The **Project Events API** does NOT support filtering by custom tags like `correlation_id`. We fetch all events and filter client-side, which:
1. Misses events outside the fetch window
2. Wastes bandwidth fetching irrelevant events
3. Cannot scale as event volume grows

---

## Proposed Solution

### Discovery: Organization Events API (Discover)

**Endpoint:** `GET /api/0/organizations/{organization_id_or_slug}/events/`

This API supports:
- **`query` parameter** with full search syntax including `tag[correlation_id]:value`
- **`field` parameter** to select specific fields (up to 20)
- **`statsPeriod`** for time range (e.g., `24h`, `7d`, `30d`, `90d`)
- **`environment`** filtering (staging vs production)
- **Proper pagination** with cursor support

### Search Syntax Capabilities

```
# Filter by correlation_id
tag[correlation_id]:abc-123-def

# Filter by level
level:error

# Combine with AND/OR
tag[correlation_id]:abc-123-def AND level:error

# Environment filtering
environment:production

# Time-based
event.timestamp:>2024-01-01
```

---

## Implementation Plan

### Phase 1: Core Client Refactor

#### 1.1 Update SentryClient (`lib/sentry/client.ts`)

```typescript
// NEW: Use Organization Events (Discover) API
async fetchEventsForCorrelationId(
  correlationId: string,
  options?: {
    environment?: 'production' | 'staging';
    statsPeriod?: string; // '24h', '7d', '30d', '90d'
    level?: 'error' | 'warning' | 'info';
    limit?: number;
  }
): Promise<{ events: SentryEvent[]; hasMore: boolean; nextCursor: string | null }> {
  const url = `${this.baseUrl}/organizations/${this.org}/events/`;

  const params = new URLSearchParams({
    // Select fields we need
    field: ['event_id', 'title', 'message', 'level', 'timestamp', 'transaction', 'environment'].join(','),
    // Server-side filter by correlation_id
    query: `tag[correlation_id]:${correlationId}`,
    statsPeriod: options?.statsPeriod || '30d',
    per_page: String(options?.limit || 100),
  });

  if (options?.environment) {
    params.set('environment', options.environment);
  }
  if (options?.level) {
    params.append('query', ` level:${options.level}`);
  }

  // ... fetch and return
}
```

#### 1.2 New Method: Fetch Error Correlation IDs

```typescript
// More efficient error check using Discover API
async fetchErrorCorrelationIds(
  environment?: string,
  statsPeriod = '7d'
): Promise<string[]> {
  const url = `${this.baseUrl}/organizations/${this.org}/events/`;

  const params = new URLSearchParams({
    field: 'tag[correlation_id]',
    query: 'level:error',
    statsPeriod,
    per_page: '100',
  });

  if (environment) {
    params.set('environment', environment);
  }

  // Returns unique correlation_ids with errors
}
```

### Phase 2: API Routes Update

#### 2.1 `/api/sentry/events` - For Call Detail Panel

```typescript
// Query params:
// - correlationId (required): The platform_call_id to search for
// - environment: 'production' | 'staging'
// - statsPeriod: '24h' | '7d' | '30d' | '90d' (default: '30d')

export async function GET(request: NextRequest) {
  const correlationId = searchParams.get('correlationId');
  const environment = searchParams.get('environment') || undefined;
  const statsPeriod = searchParams.get('statsPeriod') || '30d';

  const events = await client.fetchEventsForCorrelationId(correlationId, {
    environment,
    statsPeriod,
  });

  return NextResponse.json(events);
}
```

#### 2.2 `/api/sentry/error-check` - For Calls Table Highlighting

```typescript
// Query params:
// - environment: 'production' | 'staging'
// - statsPeriod: '7d' | '14d' | '30d' (default: '7d')

export async function GET(request: NextRequest) {
  const environment = searchParams.get('environment') || undefined;
  const statsPeriod = searchParams.get('statsPeriod') || '7d';

  const correlationIds = await client.fetchErrorCorrelationIds(environment, statsPeriod);

  return NextResponse.json({ correlationIds });
}
```

#### 2.3 `/api/sentry/browse` - For Sentry Browse Page

```typescript
// Query params:
// - environment, statsPeriod, level, eventType, search, cursor

export async function GET(request: NextRequest) {
  // Use Discover API with grouping by correlation_id
  const params = new URLSearchParams({
    field: ['tag[correlation_id]', 'count()', 'max(level)', 'min(timestamp)'].join(','),
    query: buildQuery(filters),
    statsPeriod,
    per_page: '100',
  });

  // Group results by correlation_id on the server
}
```

### Phase 3: Environment Integration

#### 3.1 Connect to Environment Provider

The dashboard already has an environment switcher. Connect Sentry queries to use the selected environment:

```typescript
// In hooks/use-sentry-events.ts
export function useSentryEventsForCall(correlationId: string | null) {
  const { environment } = useEnvironment(); // 'production' | 'staging'

  return useQuery({
    queryKey: ['sentry', 'events', correlationId, environment],
    queryFn: () => fetchSentryEventsForCall(correlationId!, environment),
    enabled: !!correlationId,
  });
}
```

### Phase 4: UI Enhancements

#### 4.1 Call Detail Panel - Logs Tab

- Show environment badge on each event
- Add time range selector (24h, 7d, 30d, 90d)
- Show "No events found in selected time range" with option to expand

#### 4.2 Calls Table - Error Indicator

- Filter errors by selected environment
- Cache error check for 1 minute
- Show loading state while checking

#### 4.3 Sentry Browse Page

- Add environment filter dropdown
- Show event counts by environment
- Group by correlation_id with server-side aggregation

---

## API Comparison

| Feature | Current (Project Events) | Proposed (Org Discover) |
|---------|-------------------------|------------------------|
| Filter by correlation_id | Client-side | Server-side (`query=tag[correlation_id]:X`) |
| Filter by level | Client-side | Server-side (`query=level:error`) |
| Filter by environment | Not used | Server-side (`environment=production`) |
| Time range | Limited (100 events) | `statsPeriod=30d` (or custom range) |
| Pagination | Yes | Yes |
| Field selection | No | Yes (`field=` parameter) |
| Aggregations | No | Yes (`count()`, `max()`, etc.) |

---

## Data Flow (Proposed)

```
┌─────────────────────────────────────────────────────────────────────┐
│                         CALLS TABLE (v2)                             │
│  useSentryErrorCorrelationIds(environment)                          │
│       │                                                              │
│       ▼                                                              │
│  /api/sentry/error-check?environment={env}&statsPeriod=7d           │
│       │                                                              │
│       ▼                                                              │
│  GET /organizations/{org}/events/                                    │
│      ?field=tag[correlation_id]                                      │
│      &query=level:error                                              │
│      &environment={env}                                              │
│      &statsPeriod=7d                                                 │
│       │                                                              │
│       ▼                                                              │
│  Returns: { correlationIds: ['abc-123', 'def-456', ...] }           │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                      CALL DETAIL PANEL (v2)                          │
│  useSentryEventsForCall(platform_call_id, environment)              │
│       │                                                              │
│       ▼                                                              │
│  /api/sentry/events?correlationId={id}&environment={env}            │
│       │                                                              │
│       ▼                                                              │
│  GET /organizations/{org}/events/                                    │
│      ?field=event_id,title,message,level,timestamp,transaction       │
│      &query=tag[correlation_id]:{id}                                 │
│      &environment={env}                                              │
│      &statsPeriod=30d                                                │
│       │                                                              │
│       ▼                                                              │
│  Returns ALL events for this call (server-side filtered)            │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Migration Strategy

### Step 1: Add New Methods (Non-breaking)
- Add new Discover-based methods to SentryClient
- Keep existing methods working

### Step 2: Create Feature Flag
- Add `USE_DISCOVER_API` flag in constants
- Allow gradual rollout

### Step 3: Update Hooks
- Modify hooks to use new API when flag is enabled
- Add environment parameter

### Step 4: Test & Validate
- Compare results between old and new implementations
- Verify older call logs are now visible

### Step 5: Remove Old Implementation
- Delete deprecated methods
- Remove feature flag

---

## Success Metrics

1. **Coverage**: Logs visible for calls up to 30 days old (vs current ~100 events)
2. **Accuracy**: Error highlighting matches actual Sentry errors
3. **Performance**: Faster queries due to server-side filtering
4. **Environment**: Correct separation of staging/production data

---

## Required Permissions

The Discover API requires one of:
- `org:admin`
- `org:read`
- `org:write`

Current token may need scope update if only project-level scopes exist.

---

## Timeline Estimate

| Phase | Scope | Effort |
|-------|-------|--------|
| Phase 1 | Client Refactor | Medium |
| Phase 2 | API Routes | Medium |
| Phase 3 | Environment Integration | Low |
| Phase 4 | UI Enhancements | Low |
| Testing & Migration | Validation | Medium |

---

## Open Questions

1. **Token Permissions**: Does current `SENTRY_AUTH_TOKEN` have `org:read` scope?
2. **Rate Limits**: What are the rate limits for the Discover API?
3. **Field Availability**: Are all needed fields available in Discover API responses?
4. **Historical Data**: How far back does Sentry retain events? (affects `statsPeriod` max)

---

## References

- [Sentry Discover Events API](https://docs.sentry.io/api/discover/query-discover-events-in-table-format/)
- [Sentry Search Syntax](https://docs.sentry.io/product/sentry-basics/search/)
- [Sentry API Authentication](https://docs.sentry.io/api/auth/)
