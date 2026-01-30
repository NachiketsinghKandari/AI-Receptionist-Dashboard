# Mobile Design Guidelines

This document covers mobile-specific design patterns, both documenting existing implementations and providing guidelines for future development.

---

## Breakpoints

| Breakpoint | Width | Device Category |
|------------|-------|-----------------|
| Default | <640px | Mobile phones |
| `sm:` | >=640px | Large phones / small tablets |
| `md:` | >=768px | **Primary mobile breakpoint** |

The **primary mobile breakpoint is 768px** (`md:`). Below this width, mobile-specific layouts activate.

---

## Existing Patterns

### Mobile Detection

**JavaScript Detection:**
```tsx
// hooks/use-mobile.tsx
import { useIsMobile } from "@/hooks/use-mobile"

const isMobile = useIsMobile() // Returns true when viewport < 768px
```

**CSS Detection:**
```tsx
// Hidden on mobile, visible on desktop
<div className="hidden md:block">Desktop only</div>

// Visible on mobile, hidden on desktop
<div className="md:hidden">Mobile only</div>
```

---

### Navigation

**Desktop:** Persistent sidebar navigation
**Mobile:** Hamburger menu → Sheet drawer (slides from left)

```tsx
// components/layout/navbar.tsx
<Sheet>
  <SheetTrigger asChild>
    <Button variant="ghost" size="icon" className="md:hidden">
      <Menu className="h-5 w-5" />
    </Button>
  </SheetTrigger>
  <SheetContent side="left" className="w-64">
    {/* Navigation links */}
  </SheetContent>
</Sheet>
```

---

### Filter Sidebar

**Desktop:** Persistent left sidebar (w-64)
**Mobile:** Bottom FAB + Drawer pattern

```tsx
// Mobile: Floating action button to open filters
<Button
  className="fixed bottom-4 right-4 z-50 md:hidden rounded-full shadow-lg"
  size="icon"
>
  <SlidersHorizontal className="h-5 w-5" />
</Button>

// Opens Sheet drawer with filter controls
<Sheet>
  <SheetContent side="bottom" className="h-[80vh]">
    {/* Filter controls */}
  </SheetContent>
</Sheet>
```

---

### Tables

**Column Visibility:**
Tables use `mobileHiddenColumns` prop to hide less-critical columns on mobile.

```tsx
<DataTable
  columns={columns}
  data={data}
  mobileHiddenColumns={["created_at", "call_id", "duration"]}
/>
```

**Implementation pattern:**
- Primary identifier column always visible
- Status/outcome columns always visible
- Secondary info (IDs, timestamps, duration) hidden on mobile

---

### Detail Sheets

**Desktop:** Side panel or dialog
**Mobile:** Full-width bottom sheet with tabbed interface

```tsx
// Tabbed interface for mobile details
<Tabs defaultValue="details">
  <TabsList className="w-full">
    <TabsTrigger value="details" className="flex-1">Details</TabsTrigger>
    <TabsTrigger value="transcript" className="flex-1">Transcript</TabsTrigger>
  </TabsList>
  <TabsContent value="details">...</TabsContent>
  <TabsContent value="transcript">...</TabsContent>
</Tabs>
```

---

### Touch Targets

**Minimum size:** 44px × 44px (Apple HIG recommendation)

```tsx
// Mobile buttons use h-10 (40px) minimum
<Button size="default" className="h-10">  // 40px height
<Button size="lg" className="h-11">       // 44px height

// Icon buttons maintain touch target
<Button variant="ghost" size="icon" className="h-10 w-10">
```

---

### Typography Scaling

| Element | Mobile | Desktop |
|---------|--------|---------|
| Page title | `text-2xl` | `text-3xl` |
| Section header | `text-lg` | `text-xl` |
| Body text | `text-sm` | `text-sm` |
| Labels | `text-xs` | `text-xs` |

```tsx
<h1 className="text-2xl md:text-3xl font-semibold">Page Title</h1>
```

---

### Spacing

| Context | Mobile | Desktop |
|---------|--------|---------|
| Page padding | `p-4` | `p-6` |
| Card padding | `p-4` | `p-6` |
| Section gaps | `gap-4` | `gap-6` |

```tsx
<div className="p-4 md:p-6">
  <div className="space-y-4 md:space-y-6">
```

---

### Grid Layouts

**KPI Cards:**
```tsx
<div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
```

**Quick Links:**
```tsx
<div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
```

---

### Pagination

**Desktop:** Text labels ("Previous", "Next")
**Mobile:** Icon buttons only

```tsx
<Button variant="outline" size="sm">
  <ChevronLeft className="h-4 w-4" />
  <span className="hidden sm:inline">Previous</span>
</Button>
```

---

## Future Development Guidelines

### Mobile-First Approach

Write base styles for mobile, then add breakpoint prefixes for larger screens:

```tsx
// CORRECT: Mobile-first
<div className="p-4 md:p-6 lg:p-8">

// AVOID: Desktop-first (harder to maintain)
<div className="p-8 lg:p-8 md:p-6 sm:p-4">
```

---

### Touch Target Requirements

All interactive elements must meet minimum touch target sizes:

| Element | Minimum Size | Recommended |
|---------|-------------|-------------|
| Buttons | 40px | 44px |
| Links in lists | 44px height | 48px height |
| Icon buttons | 40px × 40px | 44px × 44px |
| Form inputs | 40px height | 44px height |

```tsx
// Ensure adequate spacing between touch targets
<div className="space-y-2"> // 8px gap minimum between tappable items
```

---

### Gesture Considerations

**Swipe actions:**
- Consider swipe-to-dismiss for sheets/drawers
- Swipe gestures should have visual affordances (handles, hints)

**Pull-to-refresh:**
- Not currently implemented; consider for data tables if needed

**Scroll behavior:**
- Use `overscroll-behavior-contain` to prevent scroll chaining
- Ensure momentum scrolling on iOS (`-webkit-overflow-scrolling: touch`)

---

### Performance on Mobile

**Image optimization:**
- Use Next.js `<Image>` component with responsive sizing
- Provide mobile-appropriate image dimensions

**Lazy loading:**
- Defer non-critical content below the fold
- Use `React.lazy()` for route-level code splitting

**Bundle size:**
- Monitor mobile bundle separately
- Consider reduced animation on low-power mode

---

### Testing Requirements

**Device testing:**
- iPhone SE (375px) - smallest common viewport
- iPhone 14 Pro (393px) - standard modern phone
- iPad Mini (768px) - tablet breakpoint edge case

**Emulator testing:**
- Chrome DevTools device mode
- Safari Responsive Design Mode

**Real device testing:**
- Touch interactions (hover states don't apply)
- Keyboard behavior (virtual keyboard resize)
- Orientation changes (portrait/landscape)

---

### Accessibility on Mobile

**VoiceOver (iOS) / TalkBack (Android):**
- Ensure all interactive elements have accessible names
- Group related content with semantic HTML
- Test focus order matches visual order

**Zoom support:**
- Support pinch-to-zoom (don't disable)
- Text should be readable at 200% zoom
- Layouts should not break at 400% zoom

**Reduced motion:**
```tsx
// Respect user preference
<div className="motion-safe:animate-in motion-reduce:animate-none">
```

---

### New Component Checklist

When building new components, verify:

- [ ] Works at 320px viewport width (minimum)
- [ ] Touch targets meet 44px minimum
- [ ] Text readable without horizontal scrolling
- [ ] Forms usable with virtual keyboard visible
- [ ] Modals/sheets don't overflow viewport
- [ ] Tested with `useIsMobile()` hook if conditional rendering needed
- [ ] No hover-only interactions (provide tap alternative)
- [ ] Loading states visible and informative
- [ ] Error states accessible and actionable

---

## Common Mobile Patterns Reference

### Bottom Sheet
```tsx
<Sheet>
  <SheetContent side="bottom" className="h-[85vh] rounded-t-xl">
    <div className="mx-auto w-12 h-1.5 bg-muted rounded-full mb-4" /> {/* Handle */}
    {/* Content */}
  </SheetContent>
</Sheet>
```

### Sticky Header
```tsx
<header className="sticky top-0 z-40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
```

### Fixed Bottom Actions
```tsx
<div className="fixed bottom-0 left-0 right-0 p-4 bg-background border-t md:hidden">
  <Button className="w-full">Primary Action</Button>
</div>
```

### Responsive Text Truncation
```tsx
<span className="truncate max-w-[150px] md:max-w-[200px] lg:max-w-none">
  Long text content here
</span>
```
