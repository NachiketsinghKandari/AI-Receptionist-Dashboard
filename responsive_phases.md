# Responsive Design Overhaul Plan - AI Receptionist Dashboard

## Summary

Make the dashboard fully responsive across desktop, tablet, and mobile devices while preserving existing functionality.

## Critical Issues

| Issue | Impact | Solution |
|-------|--------|----------|
| Fixed 256px sidebar | Content squashed on mobile | Mobile drawer pattern |
| Two-panel detail sheet | Cramped on mobile | Tab-based layout on mobile |
| No column hiding | Tables overflow | Column visibility management |

---

## Phase 1: Foundation

### 1.1 Create `useIsMobile` Hook
**File**: `hooks/use-is-mobile.ts` (new)

```typescript
'use client';
import { useState, useEffect } from 'react';

const MOBILE_BREAKPOINT = 768;

export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    setIsMobile(mql.matches);
    mql.addEventListener('change', (e) => setIsMobile(e.matches));
    return () => mql.removeEventListener('change', () => {});
  }, []);

  return isMobile;
}
```

### 1.2 Add Drawer Component
**Command**: `npm install vaul`
**File**: `components/ui/drawer.tsx` (new - shadcn/ui drawer)

---

## Phase 2: Filter Sidebar (CRITICAL)

### Files to Modify
- `components/filters/filter-sidebar.tsx` - Add className prop
- `components/filters/responsive-filter-sidebar.tsx` (new) - Wrapper component

### Pattern
- **Desktop (md+)**: Fixed sidebar as-is
- **Mobile (<md)**: Bottom drawer with floating action button (FAB)

### Update All Pages
Replace `<FilterSidebar>` with `<ResponsiveFilterSidebar>` in:
- `app/(dashboard)/calls/page.tsx`
- `app/(dashboard)/emails/page.tsx`
- `app/(dashboard)/transfers/page.tsx`
- `app/(dashboard)/webhooks/page.tsx`
- `app/(dashboard)/sentry/page.tsx`
- `app/(dashboard)/eod-reports/page.tsx`

---

## Phase 3: Call Detail Sheet (CRITICAL)

### File to Modify
`components/details/call-detail-sheet.tsx`

### Changes
1. **Sheet width**: Full width on mobile, `calc(100vw-280px)` on desktop
   ```tsx
   className="w-full md:w-[calc(100vw-280px)] md:max-w-[1600px]"
   ```

2. **Panel layout**:
   - **Desktop**: Horizontal resizable panels (existing)
   - **Mobile**: Vertical tabs (Details | Transcript)

---

## Phase 4: Data Table Responsive

### File to Modify
`components/tables/data-table.tsx`

### Changes
1. Add `columnVisibility` prop to DataTable
2. Add mobile pagination (icons instead of text)

### Column Visibility by Page
| Page | Always Visible | Hide on Mobile |
|------|----------------|----------------|
| Calls | id, status, caller_name, duration | platform_call_id, call_type, cekura_status, started_at |
| Emails | id, subject, status | call_id, email_type, recipients, sent_at |
| Transfers | id, caller_name, status | call_id, transferred_to, transfer_type |
| Webhooks | id, webhook_type, platform | platform_call_id, received_at |
| Sentry | title, level | logger, timestamp, event_type |

---

## Phase 5: Home Page & Charts

### Files to Modify
- `components/charts/call-volume-chart.tsx`
- `app/(dashboard)/page.tsx`

### Changes
1. **Chart height**: `h-[250px] sm:h-[300px] md:h-[350px]`
2. **Quick Links grid**: `grid-cols-1 xs:grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5`
3. **KPI grid**: `grid-cols-2 md:grid-cols-4`
4. **Chart card header**: Stack title and tabs vertically on mobile

---

## Phase 6: Touch Target Improvements

### Files to Modify
- `components/ui/button.tsx`
- `components/ui/input.tsx`

### Changes
- Increase button/input heights on mobile (h-10 on mobile, h-9 on desktop)
- Minimum 44x44px tap targets

---

## Verification Checklist

### Mobile (< 640px)
- [ ] Filter drawer opens/closes with FAB button
- [ ] Detail sheet is full width with tabbed panels
- [ ] Tables show priority columns only
- [ ] Pagination uses icons
- [ ] All tap targets >= 44x44px
- [ ] No horizontal overflow

### Tablet (768px - 1023px)
- [ ] Filter sidebar visible
- [ ] Detail sheet width correct
- [ ] Resizable panels work

### Desktop (>= 1024px)
- [ ] No regressions from current design

### Test Devices
- iPhone SE (375x667)
- iPhone 14 (390x844)
- iPad Mini (768x1024)
- Desktop (1440x900)

---

## Implementation Order

```
Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6
   ↓         ↓         ↓         ↓
  Hook    Sidebar   Sheet    Tables
  Drawer  (needs    (needs   (needs
          hook)     hook)    hook)
```

Phases 5-6 can run in parallel after Phase 1.
