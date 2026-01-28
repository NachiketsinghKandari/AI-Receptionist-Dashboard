# DateTime Inconsistency Report

## Overview

This document tracks datetime handling inconsistencies across the codebase that need to be addressed for consistent behavior.

---

## Critical Inconsistencies

### 1. Timezone Mismatch (HIGH PRIORITY)

**Frontend** (4 pages): Computes "today" in `America/New_York` timezone

```typescript
// app/(dashboard)/calls/page.tsx:185-201
// app/(dashboard)/emails/page.tsx:104-120
// app/(dashboard)/transfers/page.tsx:87-103
// app/(dashboard)/webhooks/page.tsx:93-110

const usDateFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const parts = usDateFormatter.formatToParts(now);
// Produces: "2026-01-28T00:00:00" (no timezone suffix)
```

**Backend** (stats/overview/route.ts:13-30): Uses server's local timezone with `new Date()`, then converts to UTC via `.toISOString()`

**Impact**: A call at 11:59 PM Eastern on Jan 27 could be filtered as Jan 28 because the backend interprets the date string differently.

---

### 2. Date Format Inconsistencies

| Location | Format | Issue |
|----------|--------|-------|
| Filter inputs (filter-sidebar.tsx) | `yyyy-MM-dd` | No time component |
| Page effectiveDateRange | `yyyy-MM-ddTHH:mm:ss` | No timezone suffix |
| Cekura hook (use-cekura.ts) | Uses `.toISOString()` (UTC) | Mixes with Eastern dates |
| API routes | Expects ISO 8601 | Assumes UTC |

**Files affected:**
- `components/filters/filter-sidebar.tsx`
- `app/(dashboard)/calls/page.tsx`
- `app/(dashboard)/emails/page.tsx`
- `app/(dashboard)/transfers/page.tsx`
- `app/(dashboard)/webhooks/page.tsx`
- `hooks/use-cekura.ts`

---

### 3. Database Column Inconsistencies

**Transfers table** uses different columns for filtering vs display:
- **Filtering**: `created_at` column (`app/api/transfers/route.ts:60-65`)
- **Display**: `transfer_started_at` column (`app/(dashboard)/transfers/page.tsx:278`)

These columns can have different values, causing filter/display mismatch.

**Other tables:**
- **calls**: Uses `started_at` for filtering
- **email_logs**: Uses `sent_at` for filtering
- **webhook_dumps**: Uses `received_at` for filtering

---

### 4. Chart Grouping Bug

**File**: `app/api/stats/chart/route.ts:56-64`

```typescript
const grouped = new Map<string, number>();
for (const call of calls) {
  const date = new Date(call.started_at);  // Parses ISO string (UTC)
  const key = isHourly
    ? date.toISOString().slice(0, 13) + ':00:00'  // Uses UTC time
    : date.toISOString().slice(0, 10);             // Uses UTC date
  grouped.set(key, (grouped.get(key) || 0) + 1);
}
```

**Impact**: Groups data by UTC date, but filters come in as Eastern timezone dates. A call at 11 PM Eastern shows in the wrong day's bucket.

---

### 5. No Centralized Date Handling

Date logic is scattered and duplicated across 4 pages with no shared utility.

**Missing**: `lib/date-utils.ts`

---

## Summary Table

| Inconsistency | Severity | Location | Impact |
|---|---|---|---|
| Frontend uses America/New_York for "today" but backend converts to UTC | CRITICAL | pages + API routes | Off-by-one-day bugs |
| Date format changes between components | MEDIUM | Filter sidebar + pages | Date filtering may fail |
| Different DB columns for filtering (created_at vs transfer_started_at) | MEDIUM | transfers API | Data inconsistency |
| Chart grouping uses UTC but filters computed in Eastern | HIGH | stats/chart/route | Chart data misalignment |
| Display format loses timezone indicator | LOW | All page components | User confusion |
| No timezone constants or centralized date utilities | MEDIUM | lib directory | Maintainability issue |

---

## Recommended Fix

### Step 1: Create centralized date utility

Create `lib/date-utils.ts` with:

```typescript
// Business timezone constant
export const BUSINESS_TIMEZONE = 'America/New_York';

// Get today's date range in business timezone, formatted for API
export function getTodayRange(): { startDate: string; endDate: string } {
  // Implementation that returns UTC ISO strings
  // accounting for Eastern timezone
}

// Get date range for custom dates
export function getDateRange(startDate: string, endDate: string): { startDate: string; endDate: string } {
  // Implementation
}

// Format date for display (converts UTC to Eastern)
export function formatDisplayDate(isoString: string, format: string): string {
  // Implementation
}
```

### Step 2: Update all pages to use shared utility

Replace duplicated `effectiveDateRange` logic in:
- `app/(dashboard)/calls/page.tsx`
- `app/(dashboard)/emails/page.tsx`
- `app/(dashboard)/transfers/page.tsx`
- `app/(dashboard)/webhooks/page.tsx`

### Step 3: Fix chart grouping

Update `app/api/stats/chart/route.ts` to group by Eastern timezone date.

### Step 4: Standardize transfers filtering

Decide whether to filter by `created_at` or `transfer_started_at` and be consistent.

---

## Files to Modify (Priority Order)

1. **Create**: `lib/date-utils.ts` - Centralized date utilities
2. **Fix**: `app/api/stats/overview/route.ts` - Use Eastern timezone
3. **Fix**: `app/api/stats/chart/route.ts` - Group by Eastern date
4. **Refactor**: `app/(dashboard)/calls/page.tsx` - Use shared utility
5. **Refactor**: `app/(dashboard)/emails/page.tsx` - Use shared utility
6. **Refactor**: `app/(dashboard)/transfers/page.tsx` - Use shared utility
7. **Refactor**: `app/(dashboard)/webhooks/page.tsx` - Use shared utility
8. **Fix**: `hooks/use-cekura.ts` - Consistent timezone handling

---

## Status

- [ ] Create `lib/date-utils.ts`
- [ ] Update stats overview API
- [ ] Update stats chart API
- [ ] Refactor calls page
- [ ] Refactor emails page
- [ ] Refactor transfers page
- [ ] Refactor webhooks page
- [ ] Fix Cekura hook
- [ ] Add timezone display indicator to UI (optional)
