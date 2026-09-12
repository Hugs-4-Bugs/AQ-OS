# AcquisitionOS — Frontend Local Setup Guide

Complete guide to setting up the AcquisitionOS frontend for local development.

---

## Prerequisites

| Requirement | Minimum Version |
|---|---|
| **Node.js** | 20+ |
| **Bun** | 1.x |
| **Browser** | Chrome, Firefox, Safari, or Edge (latest) |

> **Tip:** Use `node -v` and `bun -v` to verify your installed versions before proceeding.

---

## Dependencies & Installation

### Production Dependencies

| Package | Purpose |
|---|---|
| **Next.js 16** | React framework with App Router |
| **React 19** | UI library with concurrent features |
| **TypeScript 5** | Strict type safety |
| **Tailwind CSS 4** | Utility-first styling with custom theme |
| **shadcn/ui** | Component library (New York style) |
| **Radix UI** | 18 accessible primitives |
| **Lucide React** | Icon library |
| **Framer Motion** | Animation library |
| **Recharts** | Data visualization / charts |
| **Zustand** | Client-side state management |
| **TanStack Query** | Server-state management |
| **React Hook Form** | Form state management |
| **Zod** | Schema validation |
| **@dnd-kit** | Drag & drop toolkit |
| **MDXEditor** | Rich text / MDX editing |
| **next-themes** | Light / dark mode theming |
| **next-auth** | Authentication |

### Dev Dependencies

| Package | Purpose |
|---|---|
| **ESLint** | Code linting |
| **Prettier** | Code formatting |
| **@types/react** | TypeScript definitions |

### Install Commands

```bash
bun install
```

---

## Run Commands

| Command | Description |
|---|---|
| `bun run dev` | Start the development server on **port 3000** (Turbopack enabled) |
| `bun run build` | Create a production build |
| `bun run lint` | Run ESLint to check code quality and Next.js rules |
| `bun run test` | Run the test suite |
| `bun run test:watch` | Run tests in watch mode |

---

## Framework Details

### Next.js 16 with App Router + Turbopack

- **App Router** — File-system based routing using the `src/app/` directory.
- **Turbopack** — Rust-based bundler for near-instant HMR during development.
- **Server Components** — Default rendering mode; components render on the server with zero client-side JS.
- **Client Components** — Opt in with `'use client'` for interactivity, state, and browser APIs.

### TypeScript Strict Mode

- `strict: true` is enabled in `tsconfig.json`.
- All code must pass strict type checking — no implicit `any`, null checks enforced.

### Tailwind CSS 4 with Custom Theme

- Utility-first CSS framework configured in `tailwind.config.ts`.
- Custom design tokens (colors, spacing, typography) extend the default theme.
- Dark mode support via `next-themes` with `class` strategy.

### shadcn/ui Component Library (New York Style)

- Pre-built, accessible, composable components in `src/components/ui/`.
- Based on Radix UI primitives with Tailwind styling.
- New York style variant for a clean, professional aesthetic.

### React 19 with Concurrent Features

- **Suspense** — Declarative loading states for async components.
- **Transitions** — Non-blocking UI updates with `useTransition`.
- **Server Actions** — Form submissions and mutations without manual API routes.

---

## UI Libraries

### Radix UI Primitives (18 components)

| Component | Use Case |
|---|---|
| `@radix-ui/react-accordion` | Collapsible sections |
| `@radix-ui/react-alert-dialog` | Confirmation dialogs |
| `@radix-ui/react-avatar` | User avatars |
| `@radix-ui/react-checkbox` | Checkbox inputs |
| `@radix-ui/react-dialog` | Modal dialogs |
| `@radix-ui/react-dropdown-menu` | Dropdown menus |
| `@radix-ui/react-label` | Accessible labels |
| `@radix-ui/react-popover` | Popover overlays |
| `@radix-ui/react-progress` | Progress indicators |
| `@radix-ui/react-radio-group` | Radio button groups |
| `@radix-ui/react-scroll-area` | Custom scrollbars |
| `@radix-ui/react-select` | Select dropdowns |
| `@radix-ui/react-separator` | Visual dividers |
| `@radix-ui/react-sheet` | Side panels |
| `@radix-ui/react-slider` | Range sliders |
| `@radix-ui/react-switch` | Toggle switches |
| `@radix-ui/react-tabs` | Tab navigation |
| `@radix-ui/react-tooltip` | Hover tooltips |

### Framer Motion Animations

- Page transitions and route animations.
- Hover, focus, and interaction micro-animations.
- Layout animations for list reordering and modal transitions.

### Recharts Data Visualization

- Line, bar, area, pie, and composed charts.
- Responsive containers and tooltips.
- Custom theming to match the AcquisitionOS design system.

### @dnd-kit Drag & Drop

- Kanban boards, pipeline stages, and reorderable lists.
- Keyboard-accessible drag interactions.
- Collision detection algorithms for complex layouts.

### MDXEditor Rich Text

- WYSIWYG editing for notes, templates, and documentation.
- MDX support with custom component embedding.
- Toolbar with formatting, links, images, and code blocks.

---

## State Libraries

| Library | Scope | Use Case |
|---|---|---|
| **Zustand** | Client state | Global UI state, user preferences, feature flags |
| **TanStack Query** | Server state | API data fetching, caching, background refetching, optimistic updates |
| **React Hook Form** | Form state | Form validation, submission, field-level error handling |

### Zustand Patterns

```ts
// src/stores/use-app-store.ts
import { create } from 'zustand';

interface AppState {
  sidebarOpen: boolean;
  toggleSidebar: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  sidebarOpen: true,
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
}));
```

### TanStack Query Patterns

```ts
// src/hooks/use-leads.ts
import { useQuery } from '@tanstack/react-query';

export function useLeads(pipelineId: string) {
  return useQuery({
    queryKey: ['leads', pipelineId],
    queryFn: () => fetch(`/api/leads?pipelineId=${pipelineId}`).then((r) => r.json()),
  });
}
```

### React Hook Form + Zod Patterns

```ts
// src/schemas/lead.ts
import { z } from 'zod';

export const leadSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email'),
  value: z.number().min(0, 'Value must be positive'),
});

export type LeadFormValues = z.infer<typeof leadSchema>;
```

---

## Environment Variables

Create a `.env.local` file in the `frontend/` directory:

```env
# Application
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Authentication (Google OAuth)
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your-google-client-id

# Payments (Stripe)
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_xxx

# Payments (Razorpay)
NEXT_PUBLIC_RAZORPAY_KEY_ID=rzp_test_xxx

# Error Tracking (Sentry)
NEXT_PUBLIC_SENTRY_DSN=https://xxx@sentry.io/xxx
```

> **Note:** Variables prefixed with `NEXT_PUBLIC_` are exposed to the browser. Never put secrets in these variables — use server-only env vars or API routes instead.

---

## Troubleshooting & Fix Commands

| Issue | Fix Command |
|---|---|
| **HMR cache corruption** — stale styles, broken hot reload | `rm -rf .next && bun run dev` |
| **Prisma client out of sync** — type errors after schema changes | `bun run db:generate` |
| **Type errors** — TypeScript complaints | `bun run lint` |
| **Dependency issues** — broken installs, version conflicts | `rm -rf node_modules && bun install` |

---

## Development Workflow

1. **Start the dev server** — `bun run dev`
2. **Open the app** — Navigate to `http://localhost:3000` in your browser.
3. **Make changes** — HMR will reflect edits instantly.
4. **Lint often** — Run `bun run lint` to catch issues early.
5. **Commit clean** — Ensure lint and type checks pass before committing.

---

*AcquisitionOS Frontend Team*
