# Tablet Design Guidelines

This document covers tablet-specific design patterns, both documenting existing implementations and providing guidelines for future development.

---

## Breakpoints

| Breakpoint | Width Range | Device Category |
|------------|-------------|-----------------|
| `sm:` | 640px - 767px | Small tablets (portrait) |
| `md:` | 768px - 1023px | Tablets (portrait/landscape) |
| `lg:` | 1024px+ | Large tablets, laptops |

**Tablet range:** 640px - 1024px (`sm:` to `lg:`)

---

## Existing Patterns

### Navigation

**Breakpoint behavior:**
- **<768px:** Hamburger menu with drawer
- **>=768px:** Desktop navigation visible

Tablets in landscape mode (typically >768px width) see the full desktop navigation. Portrait tablets may see either depending on exact device width.

```tsx
// Navigation switches at md: breakpoint
<nav className="hidden md:flex items-center gap-4">
  {/* Desktop nav links */}
</nav>
```

---

### Filter Sidebar

**Breakpoint behavior:**
- **<768px:** FAB + bottom drawer
- **>=768px:** Persistent sidebar (w-64)

```tsx
// Desktop sidebar visible at md:
<aside className="hidden md:block w-64 shrink-0 border-r">
  <FilterSidebar />
</aside>
```

---

### Grid Layouts

Tablets use intermediate column counts between mobile and desktop:

| Layout | Mobile (<640px) | Tablet (640-1024px) | Desktop (>1024px) |
|--------|-----------------|---------------------|-------------------|
| KPI cards | 2 columns | 2-3 columns | 4 columns |
| Quick links | 2 columns | 3 columns | 5 columns |
| Form fields | 1 column | 2 columns | 3 columns |

```tsx
// KPI cards
<div className="grid grid-cols-2 lg:grid-cols-4 gap-4">

// Quick links with tablet breakpoint
<div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">

// Form layout
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
```

---

### Component Sizing

Tablets generally use desktop component sizes:

| Component | Mobile | Tablet | Desktop |
|-----------|--------|--------|---------|
| Buttons | Default | Default | Default |
| Inputs | h-10 | h-10 | h-10 |
| Cards | p-4 | p-6 | p-6 |
| Page padding | p-4 | p-6 | p-6 |

---

### Tables

Tables on tablets show the same columns as desktop. The `mobileHiddenColumns` pattern only hides columns below `md:` (768px).

```tsx
// Columns hidden only on mobile, visible on tablet+
<TableCell className="hidden md:table-cell">
  {row.created_at}
</TableCell>
```

---

### Touch Considerations

Tablets are hybrid devices supporting both touch and mouse input:

**Current implementations:**
- All touch targets meet 44px minimum
- Hover states still apply (pointer devices)
- No hover-only interactions

```tsx
// Buttons work for both input types
<Button
  className="h-10 hover:bg-primary/90 active:bg-primary/80"
>
```

---

## Future Development Guidelines

### When to Use Tablet-Specific Breakpoints

Use the `sm:` (640px) and `md:` (768px) breakpoints for tablet optimization when:

1. **Grid density changes** - Different column counts
2. **Navigation transitions** - Mobile drawer vs sidebar
3. **Content visibility** - Show/hide secondary information
4. **Layout shifts** - Stack vs side-by-side

```tsx
// Example: Sidebar + content layout
<div className="flex flex-col md:flex-row">
  <aside className="w-full md:w-64 shrink-0">Sidebar</aside>
  <main className="flex-1">Content</main>
</div>
```

---

### Landscape vs Portrait

Consider both orientations when designing tablet layouts:

| Orientation | Typical Width | Considerations |
|-------------|--------------|----------------|
| Portrait | 768-834px | More vertical space, narrower |
| Landscape | 1024-1194px | More horizontal space, navigation visible |

**Guidelines:**
- Portrait tablets should work with mobile-like vertical stacking
- Landscape tablets should work with desktop-like horizontal layouts
- Avoid fixed heights that assume portrait orientation

```tsx
// Safe responsive pattern for both orientations
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
```

---

### Split-View / Multitasking Support

iPad and Android tablets support split-screen multitasking:

| Split Mode | Resulting Width |
|------------|-----------------|
| Full screen | 768-1024px |
| 50/50 split | ~384-512px |
| 70/30 split | ~537-716px or ~230-307px |

**Guidelines:**
- Test at 320px minimum width (small split pane)
- Don't assume tablet = full screen
- Use fluid layouts, not fixed widths

```tsx
// AVOID: Fixed widths that break in split view
<div className="w-[800px]">

// PREFER: Flexible layouts
<div className="max-w-4xl w-full">
```

---

### Touch vs Mouse Hybrid Patterns

Tablets support stylus, touch, and keyboard/trackpad:

**Touch considerations:**
- 44px minimum touch targets
- Adequate spacing between interactive elements
- Support for swipe gestures where appropriate

**Pointer considerations:**
- Hover states for trackpad/mouse users
- Fine pointer adjustments (stylus precision)
- Keyboard navigation support

```tsx
// Detect pointer type if needed
@media (pointer: coarse) {
  /* Touch-friendly styles */
}
@media (pointer: fine) {
  /* Precise pointer styles */
}
```

---

### Grid Density Recommendations

| Content Type | Mobile | Tablet Portrait | Tablet Landscape | Desktop |
|--------------|--------|-----------------|------------------|---------|
| Cards (info) | 1 col | 2 col | 2-3 col | 3-4 col |
| Cards (action) | 2 col | 3 col | 4 col | 4-5 col |
| Form fields | 1 col | 2 col | 2-3 col | 3 col |
| Gallery items | 2 col | 3 col | 4 col | 5-6 col |

---

### Sidebar Behavior Guidelines

**Standard sidebar (filters, navigation):**
- **Mobile (<768px):** Hidden, accessible via drawer
- **Tablet (>=768px):** Visible, fixed width (w-64)
- Consider collapsible sidebar for narrow tablets

**Detail sidebar (context panels):**
- **Mobile:** Full-screen sheet
- **Tablet portrait:** Bottom sheet (70-80% height)
- **Tablet landscape:** Side panel (40-50% width)

```tsx
// Responsive detail panel
const isMobile = useIsMobile()

// Mobile: bottom sheet
// Tablet/Desktop: side panel
<Sheet>
  <SheetContent
    side={isMobile ? "bottom" : "right"}
    className={isMobile ? "h-[80vh]" : "w-[500px]"}
  >
```

---

### Tablet-Specific UI Patterns

**Floating action button positioning:**
```tsx
// Bottom-right on mobile, consider bottom-center on tablet
<Button className="fixed bottom-4 right-4 md:right-auto md:left-1/2 md:-translate-x-1/2 lg:hidden">
```

**Expanded toolbars:**
```tsx
// More toolbar actions visible on tablet
<div className="flex gap-2">
  <Button variant="outline">Export</Button>
  <Button variant="outline" className="hidden sm:inline-flex">Print</Button>
  <Button variant="outline" className="hidden md:inline-flex">Share</Button>
</div>
```

**Split button groups:**
```tsx
// Inline on tablet, stacked on mobile
<div className="flex flex-col sm:flex-row gap-2">
  <Button>Primary Action</Button>
  <Button variant="outline">Secondary</Button>
</div>
```

---

## Testing Checklist

### Device Widths to Test

| Device | Width | Breakpoint |
|--------|-------|------------|
| iPad Mini (portrait) | 768px | md: edge case |
| iPad (portrait) | 810px | md: |
| iPad (landscape) | 1080px | lg: |
| iPad Pro 11" (portrait) | 834px | md: |
| iPad Pro 12.9" (portrait) | 1024px | lg: edge case |
| Surface Pro (portrait) | 912px | md: |
| Galaxy Tab (portrait) | 800px | md: |

### Test Scenarios

- [ ] Portrait and landscape orientations
- [ ] Split-view multitasking (50/50 and 70/30)
- [ ] Touch interactions (no hover dependency)
- [ ] Keyboard/trackpad navigation (Magic Keyboard)
- [ ] Stylus precision interactions (Apple Pencil)
- [ ] Virtual keyboard appearance (form inputs)

---

## Common Tablet Patterns Reference

### Responsive Master-Detail
```tsx
<div className="flex flex-col md:flex-row h-full">
  {/* List view - full width mobile, sidebar on tablet+ */}
  <div className="w-full md:w-80 lg:w-96 shrink-0 border-b md:border-b-0 md:border-r">
    <ListView />
  </div>

  {/* Detail view - separate route mobile, inline on tablet+ */}
  <div className="flex-1 hidden md:block">
    <DetailView />
  </div>
</div>
```

### Collapsible Sidebar
```tsx
const [collapsed, setCollapsed] = useState(false)

<aside className={cn(
  "hidden md:block shrink-0 border-r transition-all",
  collapsed ? "w-16" : "w-64"
)}>
  <Button
    variant="ghost"
    size="icon"
    onClick={() => setCollapsed(!collapsed)}
  >
    {collapsed ? <ChevronRight /> : <ChevronLeft />}
  </Button>
</aside>
```

### Responsive Modal Sizing
```tsx
<DialogContent className="w-[95vw] max-w-lg sm:max-w-xl md:max-w-2xl">
  {/* Content scales with viewport */}
</DialogContent>
```

### Adaptive Card Grid
```tsx
<div className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
  {items.map(item => (
    <Card key={item.id}>...</Card>
  ))}
</div>
```
