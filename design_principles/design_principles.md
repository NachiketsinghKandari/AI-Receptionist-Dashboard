# AI Receptionist Dashboard - Design Principles

This document outlines the UI design system, patterns, and conventions used throughout the dashboard.

---

## Color System

### Color Space
Uses **OKLCH** for perceptual uniformity and better color manipulation.

### Light Mode
| Token | Value | Usage |
|-------|-------|-------|
| `--background` | `oklch(1 0 0)` | Page background (white) |
| `--foreground` | `oklch(0.145 0 0)` | Primary text (dark gray) |
| `--primary` | `oklch(0.205 0 0)` | Main actions, buttons |
| `--secondary` | `oklch(0.97 0 0)` | Secondary backgrounds |
| `--muted` | `oklch(0.97 0 0)` | Subtle backgrounds |
| `--muted-foreground` | `oklch(0.556 0 0)` | Secondary/disabled text |
| `--destructive` | `oklch(0.577 0.245 27.325)` | Error states (red) |
| `--border` | `oklch(0.922 0 0)` | Borders, dividers |

### Dark Mode
| Token | Value | Usage |
|-------|-------|-------|
| `--background` | `oklch(0.145 0 0)` | Page background (dark) |
| `--foreground` | `oklch(0.985 0 0)` | Primary text (white) |
| `--primary` | `oklch(0.922 0 0)` | Main actions (light for contrast) |
| `--border` | `oklch(1 0 0 / 10%)` | Borders (white 10% opacity) |

### Chart Colors
5 distinct colors for data visualization:
- **Chart-1**: `oklch(0.646 0.222 41.116)` - Orange
- **Chart-2**: `oklch(0.6 0.118 184.704)` - Blue
- **Chart-3**: `oklch(0.398 0.07 227.392)` - Purple
- **Chart-4**: `oklch(0.828 0.189 84.429)` - Yellow-green
- **Chart-5**: `oklch(0.769 0.188 70.08)` - Orange-yellow

---

## Typography

### Font Families
- **Primary**: Geist Sans (`--font-geist-sans`) - UI text
- **Monospace**: Geist Mono (`--font-geist-mono`) - IDs, phone numbers, code

### Font Sizes
| Class | Size | Usage |
|-------|------|-------|
| `text-xs` | 12px | Labels, help text, badges |
| `text-sm` | 14px | Body text, form fields |
| `text-base` | 16px | Larger body text |
| `text-lg` | 18px | Card titles, section headers |
| `text-xl` | 20px | Subsection titles |
| `text-2xl` | 24px | KPI values |
| `text-3xl` | 30px | Page titles |

### Font Weights
| Class | Usage |
|-------|-------|
| `font-normal` | Body text |
| `font-medium` | Labels, emphasis |
| `font-semibold` | Card titles, headers |
| `font-bold` | Strong emphasis |
| `font-black` | Logo ("Counsel" in AI Receptionist) |

---

## Spacing

### Base Unit
4px (Tailwind default). All spacing is multiples of 4px.

### Common Values
| Class | Size | Usage |
|-------|------|-------|
| `gap-1` | 4px | Tight inline spacing |
| `gap-2` | 8px | Icon + text, compact lists |
| `gap-3` | 12px | Form field spacing |
| `gap-4` | 16px | Section spacing, list items |
| `gap-6` | 24px | Major section gaps |
| `p-4` | 16px | Card content padding |
| `p-6` | 24px | Page padding, large containers |
| `px-6 py-4` | - | Dialog header/content padding |

### Layout Spacing
- **Page padding**: `p-6` (24px)
- **Card internal gap**: `gap-6`
- **Form field spacing**: `mt-1` (label to input)
- **Section spacing**: `space-y-4` or `space-y-6`

---

## Border Radius

### Base Value
`--radius: 0.625rem` (10px)

### Scale
| Class | Size | Usage |
|-------|------|-------|
| `rounded-sm` | 6px | Small badges |
| `rounded-md` | 8px | Buttons, inputs |
| `rounded-lg` | 10px | Dialogs, dropdowns, popovers |
| `rounded-xl` | 14px | Cards, major containers |
| `rounded-full` | 50% | Avatars, pill badges |

### Component Radius Conventions
- **Buttons**: `rounded-md`
- **Inputs**: `rounded-md`
- **Cards**: `rounded-xl`
- **Dialogs/Modals**: `rounded-lg`
- **Badges**: `rounded-full` (pill) or `rounded-md`
- **Table containers**: `rounded-md`

---

## Shadows

| Class | Usage |
|-------|-------|
| `shadow-xs` | Inputs, subtle elevation |
| `shadow-sm` | Cards, buttons |
| `shadow-md` | Dropdowns, popovers |
| `shadow-lg` | Dialogs, modals, overlays |

### Hover Effects
Cards use `hover:shadow-md transition-shadow` for interactive feedback.

---

## Component Patterns

### Buttons
Uses CVA (Class Variance Authority) for variant management.

**Variants:**
- `default` - Primary action (dark bg, light text)
- `destructive` - Dangerous actions (red)
- `outline` - Secondary actions (bordered)
- `secondary` - Tertiary actions (light bg)
- `ghost` - Minimal (no bg until hover)
- `link` - Text only with underline

**Sizes:**
- `sm` - 32px height, compact
- `default` - 36px height, standard
- `lg` - 40px height, prominent
- `icon` - Square (36px), icon-only

### Cards
Compound component pattern:
```
Card (container)
├── CardHeader
│   ├── CardTitle
│   ├── CardDescription
│   └── CardAction (optional)
├── CardContent
└── CardFooter (optional)
```

**Styling:**
- Border: `border border-border`
- Radius: `rounded-xl`
- Shadow: `shadow-sm`
- Background: `bg-card`

### Badges
Pill-shaped status indicators.

**Variants:**
- `default` - Primary color
- `secondary` - Muted color
- `destructive` - Error/danger
- `outline` - Bordered, transparent

**Styling:**
- Shape: `rounded-full`
- Padding: `px-2 py-0.5`
- Text: `text-xs font-medium`

### Tables
- **IDs/Phone numbers**: `font-mono text-sm`
- **Status columns**: Use `<Badge>` component
- **Long text**: `truncate max-w-[120px] block`
- **Dates**: Formatted with `date-fns`

---

## State Patterns

### Focus States
All interactive elements:
```css
focus-visible:border-ring
focus-visible:ring-ring/50
focus-visible:ring-[3px]
outline-none
```

### Hover States
| Component | Hover Style |
|-----------|-------------|
| Buttons | `hover:bg-primary/90` |
| Ghost buttons | `hover:bg-accent hover:text-accent-foreground` |
| Cards | `hover:shadow-md` |
| Table rows | `hover:bg-muted/50` |
| Links | `hover:underline` |

### Disabled States
```css
disabled:pointer-events-none
disabled:opacity-50
```

### Selected States
- Table rows: `data-[state=selected]:bg-muted`
- Tabs: `data-[state=active]:bg-background`
- Nav links: `bg-primary/10 text-primary`

### Error States
```css
aria-invalid:ring-destructive/20
aria-invalid:border-destructive
```

---

## Dark Mode

### Implementation
- CSS custom properties in `:root` and `.dark`
- `next-themes` library for toggle management
- System preference detection enabled

### Key Overrides
- Input backgrounds: `dark:bg-input/30`
- Borders: More subtle with opacity
- Text colors: Inverted via CSS variables

---

## Layout Patterns

### Flex Layouts
- **Horizontal**: `flex items-center gap-2`
- **Vertical**: `flex flex-col gap-4`
- **Space between**: `flex items-center justify-between`
- **Centered**: `flex items-center justify-center`

### Grid Layouts
- **KPI cards**: `grid grid-cols-2 lg:grid-cols-4 gap-4`
- **Quick links**: `grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4`

### Responsive Breakpoints
| Prefix | Min-width | Usage |
|--------|-----------|-------|
| `sm` | 640px | Small tablets |
| `md` | 768px | Tablets |
| `lg` | 1024px | Laptops |
| `xl` | 1280px | Desktops |
| `2xl` | 1536px | Large screens |

### Page Structure
```
<div className="flex h-full">
  <FilterSidebar /> {/* w-64, scrollable */}
  <div className="flex-1 flex flex-col p-6 overflow-hidden">
    <header className="shrink-0">...</header>
    <main className="flex-1 min-h-0">
      <DataTable /> {/* scrollable */}
    </main>
  </div>
</div>
```

---

## Animation & Transitions

### Transition Classes
| Class | Usage |
|-------|-------|
| `transition-all` | General smooth changes |
| `transition-colors` | Color/background changes |
| `transition-shadow` | Shadow/elevation changes |
| `transition-opacity` | Fade effects |

### Duration
Default: 150ms (Tailwind default)

### Dialog Animations
```css
data-[state=open]:animate-in
data-[state=closed]:animate-out
data-[state=closed]:fade-out-0
data-[state=open]:fade-in-0
data-[state=closed]:zoom-out-95
data-[state=open]:zoom-in-95
```

---

## Icon Usage (Lucide React)

### Sizes
| Size | Classes | Usage |
|------|---------|-------|
| Small | `h-3 w-3`, `h-3.5 w-3.5` | Inline, badges |
| Medium | `h-4 w-4` | Buttons, lists |
| Standard | `h-5 w-5` | Navigation, headers |
| Large | `h-6 w-6` | Page titles |

### Icon Box Pattern
```tsx
<div className="p-2 rounded-lg bg-primary/10">
  <Icon className="h-4 w-4 text-primary" />
</div>
```

---

## Utilities

### The `cn()` Helper
Combines `clsx` + `tailwind-merge` for safe class merging:
```tsx
import { cn } from '@/lib/utils';
cn('px-4 py-2', isActive && 'bg-primary', className)
```

### Data Attributes
Components use `data-slot` for style targeting and debugging:
```tsx
<div data-slot="card-header">...</div>
```

---

## File Organization

```
components/
├── ui/           # Base shadcn components
├── charts/       # Data visualization
├── details/      # Detail panels, dialogs
├── filters/      # Filter sidebar
├── layout/       # Navbar, app shell
├── providers/    # Context providers
└── tables/       # Data tables
```

---

## Best Practices

1. **Use CSS variables** for colors - enables dark mode and theming
2. **Use `cn()` helper** for conditional classes
3. **Prefer Tailwind utilities** over custom CSS
4. **Use shadcn components** for consistency
5. **Follow compound component pattern** for complex components
6. **Keep components focused** - single responsibility
7. **Use semantic HTML** - proper heading hierarchy, ARIA labels
8. **Test in both themes** - light and dark mode
