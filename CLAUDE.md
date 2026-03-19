# Design System Rules for Figma-to-Code Integration

## Project Overview

**ainews-v2** is a Next.js 14 news aggregation app using the App Router.

- **Framework:** Next.js 14.2.0 (App Router)
- **Language:** TypeScript 5
- **Styling:** Tailwind CSS 3.4.0 (utility-first, no CSS Modules or styled-components)
- **UI Library:** React 18 (functional components only)
- **Path alias:** `@/*` maps to project root

---

## 1. Design Tokens

All tokens are defined in `tailwind.config.ts`. Do NOT use hardcoded hex values when a token exists.

### Color Palette

```ts
// tailwind.config.ts
colors: {
  primary: {
    50:  '#fff1f2',
    100: '#ffe4e6',
    500: '#fb2c36',  // primary action color
    600: '#e11d28',
    700: '#be123c',
  }
}
```

**Semantic colors used inline (no token — use as-is):**

| Role            | Value       | Usage                        |
|-----------------|-------------|------------------------------|
| Text primary    | `#101828`   | Body text, headings          |
| Text secondary  | `#6a7282`   | Subtitles, metadata          |
| Text muted      | `#99a1af`   | Placeholders, disabled       |
| Background      | `#f5f5f5`   | Page background              |
| Surface         | `#ffffff`   | Cards, modals                |
| Border light    | `#f3f4f6`   | Card borders                 |
| Border medium   | `#e5e7eb`   | Dividers                     |
| Accent gold     | `#d7a220`   | Highlights, badges           |
| Accent gold alt | `#f0c030`   | Secondary highlights         |

### Typography

```ts
fontFamily: {
  sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
}
```

Always use `font-sans` (default). No other font families in use.

### Spacing Extras

```ts
spacing: {
  '70':  '280px',   // sidebar width
  '200': '800px',   // max content width
  '319': '319px',   // fixed panel width
}
```

### Shadows

```ts
boxShadow: {
  'xs':    '0 1px 2px rgba(0,0,0,0.05)',
  'sm':    '0 1px 3px rgba(0,0,0,0.08)',
  DEFAULT: '0 2px 8px rgba(0,0,0,0.08)',
  'md':    '0 4px 12px rgba(0,0,0,0.1)',
  'lg':    '0 8px 24px rgba(0,0,0,0.12)',
  'hover': '0 4px 16px rgba(0,0,0,0.12)',
}
```

### Animations

```ts
animation: {
  'fade-in':       'fadeIn 0.3s ease-out',
  'slide-in':      'slideIn 0.3s ease-out',
  'slide-in-right':'slideInRight 0.3s ease-out',
  'scale-in':      'scaleIn 0.2s ease-out',
  'bounce-subtle': 'bounceSubtle 0.5s ease-in-out',
  'pulse-subtle':  'pulseSubtle 2s ease-in-out infinite',
}
```

---

## 2. Component Library

**Location:** `components/` (17 components, all flat — no subdirectories)

All components are:
- Functional React components with TypeScript
- Styled exclusively with Tailwind utility classes
- No default exports from index files — import directly by filename

### Key Components

| File | Purpose |
|------|---------|
| `NewsCard.tsx` | News item card (compact/default variants) |
| `StatsCards.tsx` | Stat counters row |
| `SiteHeader.tsx` | App header with title and stats |
| `MainContent.tsx` | Three-column layout shell |
| `SourcesList.tsx` | Left sidebar source list |
| `CategoryFilter.tsx` | Horizontal category tab bar |
| `SearchBox.tsx` | Search input |
| `StatusIndicator.tsx` | Refresh status display |
| `FloatingButton.tsx` | Fixed right-side action button |
| `WeeklyReportModal.tsx` | Full-screen modal overlay |
| `FilterPanel.tsx` | Filter controls panel |
| `EmptyState.tsx` | Empty/no-results state |
| `TopImportantNews.tsx` | Featured news section |

### Component Pattern

```tsx
// Standard component structure
interface Props {
  title: string
  variant?: 'default' | 'compact'
}

export default function MyComponent({ title, variant = 'default' }: Props) {
  return (
    <div className="bg-white rounded-md shadow-sm border border-[#f3f4f6] p-4">
      <h2 className="text-[#101828] font-semibold">{title}</h2>
    </div>
  )
}
```

---

## 3. Styling Approach

### Tailwind-First Rules

1. **Always use Tailwind utilities** — no inline `style={{}}` unless absolutely necessary (e.g., dynamic values)
2. **Use component classes** from `globals.css` for repeated patterns
3. **No CSS Modules** — do not create `.module.css` files
4. **No styled-components** — do not install or use

### Component Classes (globals.css)

```css
.btn-primary      /* white button with hover */
.card             /* white card with border and shadow */
.card-hover       /* adds hover shadow transition */
.card-hover-lift  /* adds hover lift (-translate-y-1) */
.btn-press        /* active:scale-95 press effect */
.input-field      /* styled text input */
.skeleton         /* shimmer loading state */
.gradient-mask-r  /* right fade mask */
.gradient-mask-l  /* left fade mask */
```

### Responsive Design

Use Tailwind breakpoints. No custom breakpoints defined — use defaults:
- `sm:` 640px
- `md:` 768px
- `lg:` 1024px
- `xl:` 1280px

### Dark Mode

Not implemented. Do not add dark mode unless explicitly requested.

---

## 4. Icon System

**No icon library installed.** All icons are:

1. **Inline SVG** — embedded directly in JSX
2. **Unicode emoji** — for simple indicators

```tsx
// Inline SVG pattern
<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="..." />
</svg>

// Emoji pattern
<span className="text-lg">⭐</span>
```

**When implementing Figma icons:**
- Export as inline SVG, not as image files
- Use `currentColor` for stroke/fill to inherit text color
- Size with `w-*` / `h-*` Tailwind classes
- Do NOT install lucide-react, heroicons, or similar unless asked

---

## 5. Asset Management

- **No static assets** (no `/public` images in use)
- **No CDN configuration**
- Avatars/placeholders use styled `<div>` elements:

```tsx
<div className="w-5 h-5 rounded-full bg-gray-300 flex-shrink-0" />
```

When implementing Figma designs with images:
- Use Next.js `<Image>` component from `next/image`
- Place static assets in `/public/`
- Reference as `/filename.ext` (no import needed)

---

## 6. Project Structure

```
ainews-v2/
├── app/
│   ├── api/           # Next.js API routes
│   ├── news/          # News sub-routes
│   ├── globals.css    # Global Tailwind styles + component classes
│   ├── layout.tsx     # Root layout (fonts, metadata)
│   └── page.tsx       # Home page
├── components/        # All UI components (flat, no subdirs)
├── lib/               # Business logic, utilities, types
│   └── types.ts       # Shared TypeScript types
├── data/              # JSON data cache files
├── database/          # SQLite database files
├── scripts/           # Utility scripts
├── tailwind.config.ts # Design tokens
├── next.config.js     # Next.js config (minimal)
└── tsconfig.json      # TypeScript config
```

**New components go in:** `components/ComponentName.tsx`
**New pages go in:** `app/route-name/page.tsx`
**New utilities go in:** `lib/util-name.ts`

---

## 7. Figma-to-Code Integration Rules

### Color Mapping

When Figma uses colors, map to the closest token:

| Figma color | Tailwind class |
|-------------|----------------|
| Red primary | `bg-primary-500` / `text-primary-500` |
| Dark text   | `text-[#101828]` |
| Gray text   | `text-[#6a7282]` |
| Light text  | `text-[#99a1af]` |
| Page bg     | `bg-[#f5f5f5]` |
| Card bg     | `bg-white` |
| Border      | `border-[#f3f4f6]` |

### Spacing Mapping

Use Tailwind's default spacing scale (4px base unit). Custom values:
- Sidebar width: `w-70` (280px)
- Max content: `max-w-200` (800px)

### Card Pattern

```tsx
<div className="card card-hover p-4">
  {/* content */}
</div>
```

### Button Pattern

```tsx
// Primary
<button className="btn-primary btn-press rounded-md px-4 py-2 text-sm font-medium">
  Label
</button>

// Destructive / accent
<button className="bg-primary-500 hover:bg-primary-600 text-white btn-press rounded-md px-4 py-2 text-sm font-medium transition-colors duration-200">
  Label
</button>
```

### Input Pattern

```tsx
<input className="input-field w-full text-sm" placeholder="Search..." />
```

### Modal Pattern

```tsx
<div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
  <div className="bg-white rounded-lg shadow-lg max-w-2xl w-full mx-4 p-6 animate-scale-in">
    {/* content */}
  </div>
</div>
```

---

## 8. TypeScript Types

Key types from `lib/types.ts`:

```ts
export type NewsCategory =
  | 'Model Update'
  | 'Product Update'
  | 'Research'
  | 'Company News'
  | 'Funding'
  | 'Policy'
  | 'Open Source'
  | 'Other'

export type NewsSource = {
  platform: 'X' | 'RSS' | 'Blog' | 'YouTube' | 'Reddit'
  name: string
  handle: string
  url: string
}

export type NewsItem = {
  id: string
  title: string
  summary: string
  content: string
  source: NewsSource
  category: NewsCategory
  publishedAt: string
  originalText: string
  createdAt: string
  importanceScore?: number
}
```

Always import types from `@/lib/types` — do not redefine them.
