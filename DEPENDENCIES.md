> ⚠️ **HISTORICAL DOCUMENT — SUPERSEDED.** This file describes the *abandoned earlier multi-service architecture* (FastAPI + Celery + Redis + dedicated WebSocket service) or an earlier product generation. It is kept only for historical reference and does **not** describe the current system. The verified current architecture is a **single Next.js 16 modular monolith** — see [`docs/02-architecture/SYSTEM-ARCHITECTURE.md`](02-architecture/SYSTEM-ARCHITECTURE.md) and [`docs/deployment/01-architecture.md`](deployment/01-architecture.md). Do not use this document for onboarding, deployment, or due diligence.

---

# AcquisitionOS — Dependency Reference

> Complete dependency documentation for the AcquisitionOS platform.  
> Last updated: 2025-07-04

---

## Table of Contents

1. [System Dependencies](#1-system-dependencies)
2. [Runtime Dependencies](#2-runtime-dependencies)
3. [Core Framework](#3-core-framework)
4. [UI Dependencies](#4-ui-dependencies)
5. [State Management](#5-state-management)
6. [Database](#6-database)
7. [Authentication](#7-authentication)
8. [Email](#8-email)
9. [Payments](#9-payments)
10. [Realtime](#10-realtime)
11. [Testing](#11-testing)
12. [Developer Tools](#12-developer-tools)
13. [Mini-Service Dependencies](#13-mini-service-dependencies)
14. [Install Commands](#14-install-commands)
15. [Version Compatibility Matrix](#15-version-compatibility-matrix)

---

## 1. System Dependencies

OS-level tools required to build, run, and deploy AcquisitionOS.

| Dependency | Version | Purpose | Required | Install |
|---|---|---|---|---|
| Bun | 1.x | JavaScript/TypeScript runtime & package manager | ✅ Required | `curl -fsSL https://bun.sh/install \| bash` |
| Node.js | 20+ | Required by some native modules and tooling | ✅ Required | `nvm install 20` |
| PostgreSQL | 16 | Production relational database | ✅ Required (prod) | `brew install postgresql@16` |
| SQLite | 3 | Development database (bundled with Prisma) | ⚡ Dev only | Bundled |
| Redis | 7 | Caching, session store, Celery broker | ✅ Required (prod) | `brew install redis` |
| Docker Desktop | Latest | Containerized services & local dev | ⚡ Recommended | [docker.com](https://docker.com) |
| Stripe CLI | Latest | Local Stripe webhook testing | ⚡ Optional | `brew install stripe/stripe-cli/stripe` |
| Git | 2.x | Version control | ✅ Required | `brew install git` |

### Configuration Notes

- **Bun**: Must be on `PATH`. Verify with `bun --version`. Used as the primary package manager and script runner.
- **Node.js**: Required for native module compilation (e.g., `sharp`, `bcryptjs`). Ensure `node-gyp` prerequisites are met.
- **PostgreSQL**: Create a database named `acquisitionos` (or set `DATABASE_URL`). Required for production; SQLite is used automatically in development.
- **Redis**: Required for Celery task queue (Python backend) and Socket.IO adapter in production. Not required for local dev without realtime features.
- **Stripe CLI**: Run `stripe login` and `stripe listen --forward-to localhost:3000/api/stripe/webhook` for local webhook testing.

---

## 2. Runtime Dependencies

| Dependency | Version | Purpose | Required | Install |
|---|---|---|---|---|
| Bun | 1.x | Primary JS/TS runtime & bundler | ✅ Required | `curl -fsSL https://bun.sh/install \| bash` |
| Node.js | 20+ | Secondary runtime for native modules | ✅ Required | `nvm install 20` |

### Configuration Notes

- **Bun** is the default runtime for `bun run dev`, `bun run build`, and `bun run start`.
- **Node.js** is used by Next.js for SSR and API routes under the hood. Some native modules (`sharp`, `bcryptjs`) require Node.js ABI compatibility.
- Set `NODE_OPTIONS=--max-old-space-size=4096` for large production builds.

---

## 3. Core Framework

| Package | Version | Purpose | Required | Install |
|---|---|---|---|---|
| `next` | ^16.1.1 | React framework with App Router | ✅ Required | `bun add next` |
| `react` | ^19.0.0 | UI rendering library | ✅ Required | `bun add react` |
| `react-dom` | ^19.0.0 | React DOM renderer | ✅ Required | `bun add react-dom` |
| `typescript` | ^5 | Type-safe JavaScript superset | ✅ Required | `bun add -d typescript` |

### Configuration Notes

- **Next.js 16** uses the App Router (`src/app/`). Do NOT use the Pages Router.
- **React 19** supports Server Components by default. Use `'use client'` directives for client components.
- **TypeScript** is configured in `tsconfig.json` with strict mode enabled.

---

## 4. UI Dependencies

### 4.1 Component Library (Radix UI & shadcn/ui)

All Radix UI primitives power the shadcn/ui component set. These are **required** as they form the design system.

| Package | Version | Purpose | Required | Install |
|---|---|---|---|---|
| `@radix-ui/react-accordion` | latest | Collapsible accordion sections | ✅ Required | `bun add @radix-ui/react-accordion` |
| `@radix-ui/react-alert-dialog` | latest | Modal alert confirmations | ✅ Required | `bun add @radix-ui/react-alert-dialog` |
| `@radix-ui/react-aspect-ratio` | latest | Aspect ratio container | ✅ Required | `bun add @radix-ui/react-aspect-ratio` |
| `@radix-ui/react-avatar` | latest | User avatar display | ✅ Required | `bun add @radix-ui/react-avatar` |
| `@radix-ui/react-checkbox` | latest | Checkbox input | ✅ Required | `bun add @radix-ui/react-checkbox` |
| `@radix-ui/react-collapsible` | latest | Collapsible content sections | ✅ Required | `bun add @radix-ui/react-collapsible` |
| `@radix-ui/react-context-menu` | latest | Right-click context menus | ✅ Required | `bun add @radix-ui/react-context-menu` |
| `@radix-ui/react-dialog` | latest | Modal dialog windows | ✅ Required | `bun add @radix-ui/react-dialog` |
| `@radix-ui/react-dropdown-menu` | latest | Dropdown menu selections | ✅ Required | `bun add @radix-ui/react-dropdown-menu` |
| `@radix-ui/react-hover-card` | latest | Hover-triggered info cards | ✅ Required | `bun add @radix-ui/react-hover-card` |
| `@radix-ui/react-label` | latest | Accessible form labels | ✅ Required | `bun add @radix-ui/react-label` |
| `@radix-ui/react-menubar` | latest | Application menu bar | ⚡ Optional | `bun add @radix-ui/react-menubar` |
| `@radix-ui/react-navigation-menu` | latest | Navigation menu component | ✅ Required | `bun add @radix-ui/react-navigation-menu` |
| `@radix-ui/react-popover` | latest | Floating popover panels | ✅ Required | `bun add @radix-ui/react-popover` |
| `@radix-ui/react-progress` | latest | Progress bar indicator | ✅ Required | `bun add @radix-ui/react-progress` |
| `@radix-ui/react-radio-group` | latest | Radio button group | ✅ Required | `bun add @radix-ui/react-radio-group` |
| `@radix-ui/react-scroll-area` | latest | Custom scrollbar areas | ✅ Required | `bun add @radix-ui/react-scroll-area` |
| `@radix-ui/react-select` | latest | Select dropdown input | ✅ Required | `bun add @radix-ui/react-select` |
| `@radix-ui/react-separator` | latest | Visual divider | ✅ Required | `bun add @radix-ui/react-separator` |
| `@radix-ui/react-slider` | latest | Range slider input | ⚡ Optional | `bun add @radix-ui/react-slider` |
| `@radix-ui/react-slot` | latest | Component composition utility | ✅ Required | `bun add @radix-ui/react-slot` |
| `@radix-ui/react-switch` | latest | Toggle switch input | ✅ Required | `bun add @radix-ui/react-switch` |
| `@radix-ui/react-tabs` | latest | Tabbed interface | ✅ Required | `bun add @radix-ui/react-tabs` |
| `@radix-ui/react-toggle` | latest | Toggle button | ✅ Required | `bun add @radix-ui/react-toggle` |
| `@radix-ui/react-toggle-group` | latest | Toggle button group | ✅ Required | `bun add @radix-ui/react-toggle-group` |
| `@radix-ui/react-tooltip` | latest | Tooltip on hover | ✅ Required | `bun add @radix-ui/react-tooltip` |

> **Note**: All 18 `@radix-ui/react-*` packages are installed together. They provide the accessible, unstyled primitives that shadcn/ui wraps with Tailwind styling.

### 4.2 Styling

| Package | Version | Purpose | Required | Install |
|---|---|---|---|---|
| `tailwindcss` | ^4 | Utility-first CSS framework | ✅ Required | `bun add -d tailwindcss` |
| `@tailwindcss/postcss` | ^4 | PostCSS plugin for Tailwind v4 | ✅ Required | `bun add -d @tailwindcss/postcss` |
| `tailwind-merge` | ^3.3.1 | Merge Tailwind classes without conflicts | ✅ Required | `bun add tailwind-merge` |
| `tailwindcss-animate` | ^1.0.7 | Tailwind animation utilities | ✅ Required | `bun add tailwindcss-animate` |
| `tw-animate-css` | ^1.3.5 | CSS animation utilities | ⚡ Dev | `bun add -d tw-animate-css` |
| `class-variance-authority` | ^0.7.1 | CSS variant generation (cva) | ✅ Required | `bun add class-variance-authority` |
| `clsx` | ^2.1.1 | Conditional className utility | ✅ Required | `bun add clsx` |

### Configuration Notes

- **Tailwind CSS v4** uses the new `@import "tailwindcss"` syntax in CSS files instead of `@tailwind` directives.
- **tailwind-merge** is used in the `cn()` utility: `clsx(inputs) → twMerge()`.
- **class-variance-authority (cva)** defines component variants in shadcn/ui (e.g., `buttonVariants`).
- **tailwindcss-animate** provides `animate-in`, `animate-out`, `fade-in`, `slide-in-from-*` utilities.

### 4.3 Icons & Animation

| Package | Version | Purpose | Required | Install |
|---|---|---|---|---|
| `lucide-react` | ^0.525.0 | 1,500+ SVG icon set for React | ✅ Required | `bun add lucide-react` |
| `framer-motion` | ^12.23.2 | Production-grade animation library | ✅ Required | `bun add framer-motion` |

### Configuration Notes

- **Lucide React**: Import individual icons to enable tree-shaking: `import { Mail } from "lucide-react"`.
- **Framer Motion**: Use `motion.div` for layout animations, `AnimatePresence` for enter/exit transitions. Supports React 19 with v12+.

### 4.4 Layout & Panels

| Package | Version | Purpose | Required | Install |
|---|---|---|---|---|
| `react-resizable-panels` | ^3.0.3 | Resizable split-panel layouts | ✅ Required | `bun add react-resizable-panels` |
| `vaul` | ^1.1.2 | Drawer component (mobile-friendly) | ✅ Required | `bun add vaul` |
| `embla-carousel-react` | ^8.6.0 | Carousel/slider component | ✅ Required | `bun add embla-carousel-react` |
| `@dnd-kit/core` | ^6.3.1 | Drag-and-drop engine | ✅ Required | `bun add @dnd-kit/core` |
| `@dnd-kit/sortable` | ^10.0.0 | Sortable DnD preset | ✅ Required | `bun add @dnd-kit/sortable` |
| `@dnd-kit/utilities` | ^3.2.2 | DnD helper utilities | ✅ Required | `bun add @dnd-kit/utilities` |

### Configuration Notes

- **react-resizable-panels**: Wrap sections with `<PanelGroup>`, `<Panel>`, and `<PanelResizeHandle>`.
- **vaul**: Use `<Drawer>` as a mobile alternative to `<Dialog>`. Integrates with shadcn/ui's Drawer component.
- **embla-carousel-react**: Configure with `opts={{ align: "start", loop: true }}` for typical carousels.
- **@dnd-kit**: Use `DndContext` + `SortableContext` for reorderable lists. Each sortable item needs `useSortable()`.

### 4.5 Forms & Input

| Package | Version | Purpose | Required | Install |
|---|---|---|---|---|
| `react-hook-form` | ^7.60.0 | Performant form state management | ✅ Required | `bun add react-hook-form` |
| `@hookform/resolvers` | ^5.1.1 | Schema resolvers for react-hook-form | ✅ Required | `bun add @hookform/resolvers` |
| `zod` | ^4.0.2 | TypeScript-first schema validation | ✅ Required | `bun add zod` |
| `input-otp` | ^1.4.2 | OTP/pin-code input component | ⚡ Optional | `bun add input-otp` |
| `cmdk` | ^1.1.1 | Command palette (Cmd+K) component | ✅ Required | `bun add cmdk` |

### Configuration Notes

- **react-hook-form + zod**: Use `zodResolver()` from `@hookform/resolvers/zod` to validate forms.
- **zod v4**: Uses `z.object()`, `z.string()`, `z.email()` etc. Inference with `z.infer<typeof schema>`.
- **cmdk**: Wire into shadcn/ui's `<Command>` component. Use `<CommandInput>`, `<CommandList>`, `<CommandItem>`.
- **input-otp**: Used for MFA/verification code entry. Integrates with shadcn/ui's `<InputOTP>`.

### 4.6 Data Display

| Package | Version | Purpose | Required | Install |
|---|---|---|---|---|
| `recharts` | ^2.15.4 | Charting library (bar, line, pie, area) | ✅ Required | `bun add recharts` |
| `@tanstack/react-table` | ^8.21.3 | Headless table component with sorting/filtering | ✅ Required | `bun add @tanstack/react-table` |
| `react-syntax-highlighter` | ^15.6.1 | Code block syntax highlighting | ⚡ Optional | `bun add react-syntax-highlighter` |
| `react-markdown` | ^10.1.0 | Render Markdown to React elements | ⚡ Optional | `bun add react-markdown` |
| `@mdxeditor/editor` | ^3.39.1 | MDX rich-text WYSIWYG editor | ⚡ Optional | `bun add @mdxeditor/editor` |

### Configuration Notes

- **recharts**: Use `<ResponsiveContainer>` for auto-sizing charts. Wrap in `'use client'` components.
- **@tanstack/react-table**: Headless — pair with shadcn/ui's `<Table>` for styled output. Use `useReactTable()` hook.
- **react-syntax-highlighter**: Use `Prism` or `LightAsync` for code blocks. Import specific languages to reduce bundle size.
- **@mdxeditor/editor**: Heavy dependency (~500KB gzipped). Only include if rich editing is needed.

### 4.7 Date & Time

| Package | Version | Purpose | Required | Install |
|---|---|---|---|---|
| `date-fns` | ^4.1.0 | Modern date utility library | ✅ Required | `bun add date-fns` |
| `react-day-picker` | ^9.8.0 | Calendar/date picker component | ✅ Required | `bun add react-day-picker` |

### Configuration Notes

- **date-fns v4**: Tree-shakeable. Import only what you need: `import { format, addDays } from "date-fns"`.
- **react-day-picker v9**: Integrates with shadcn/ui's `<Calendar>` and `<DatePicker>` components.

---

## 5. State Management

| Package | Version | Purpose | Required | Install |
|---|---|---|---|---|
| `zustand` | ^5.0.6 | Lightweight client-side state store | ✅ Required | `bun add zustand` |
| `@tanstack/react-query` | ^5.82.0 | Server state management & data fetching | ✅ Required | `bun add @tanstack/react-query` |
| `@reactuses/core` | ^6.0.5 | Collection of React hooks | ⚡ Optional | `bun add @reactuses/core` |

### Configuration Notes

- **Zustand v5**: Create stores with `create()` from `zustand`. Use `persist` middleware for localStorage. No providers needed.
- **TanStack Query v5**: Wrap app with `<QueryClientProvider>`. Use `useQuery()` for reads, `useMutation()` for writes. Configure stale time and cache time per query.
- **@reactuses/core**: Provides `useLocalStorage`, `useDebounce`, `useClickOutside`, and 50+ utility hooks.

---

## 6. Database

| Package | Version | Purpose | Required | Install |
|---|---|---|---|---|
| `prisma` | ^6.11.1 | ORM CLI & schema management | ✅ Required | `bun add prisma` |
| `@prisma/client` | ^6.11.1 | Type-safe database client | ✅ Required | `bun add @prisma/client` |

### Configuration Notes

- **Prisma v6**: Schema lives in `prisma/schema.prisma`. Run `bun run db:push` to sync schema to database.
- Import the client with `import { db } from "@/lib/db"`.
- **Development**: Uses SQLite (file: `./db/dev.db`). No extra setup needed.
- **Production**: Set `DATABASE_URL` to a PostgreSQL connection string. Example: `postgresql://user:pass@localhost:5432/acquisitionos`.
- Run `bunx prisma studio` for a visual database browser.
- Run `bunx prisma generate` after schema changes to update the client.

---

## 7. Authentication

| Package | Version | Purpose | Required | Install |
|---|---|---|---|---|
| `next-auth` | ^4.24.11 | Authentication for Next.js (legacy compat) | ✅ Required | `bun add next-auth` |
| `bcryptjs` | ^3.0.3 | Password hashing (bcrypt) | ✅ Required | `bun add bcryptjs` |
| `jose` | ^6.2.3 | JWT library for Edge Runtime | ✅ Required | `bun add jose` |
| `jsonwebtoken` | ^9.0.3 | JWT library for Node.js runtime | ✅ Required | `bun add jsonwebtoken` |

### Configuration Notes

- **next-auth v4**: Configured in `src/app/api/auth/[...nextauth]/route.ts`. Uses the `NEXTAUTH_SECRET` env variable.
- **bcryptjs**: Pure JS implementation (no native deps). Use `hash()` for registration, `compare()` for login.
- **jose vs jsonwebtoken**: Use `jose` in Edge Runtime / Middleware (no Node.js APIs). Use `jsonwebtoken` in Node.js API routes. Do NOT mix in the same context.
- **TypeScript types**: Install `@types/bcryptjs` and `@types/jsonwebtoken` as dev dependencies.

---

## 8. Email

| Package | Version | Purpose | Required | Install |
|---|---|---|---|---|
| `nodemailer` | ^8.0.7 | SMTP email sending | ⚡ Optional | `bun add nodemailer` |
| `resend` | ^6.12.3 | Modern email API (Resend.com) | ⚡ Optional | `bun add resend` |

### Configuration Notes

- **nodemailer**: Configure with SMTP credentials (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`). Good for self-hosted email.
- **resend**: Use API key (`RESEND_API_KEY`). Simpler API: `resend.emails.send({ from, to, subject, html })`. Recommended for production.
- Install `@types/nodemailer` as a dev dependency for TypeScript support.
- **Choose one**: Use Resend for production (reliable delivery), nodemailer for self-hosted SMTP.

---

## 9. Payments

| Package | Version | Purpose | Required | Install |
|---|---|---|---|---|
| `stripe` | ^22.1.1 | Stripe server SDK (Node.js) | ⚡ Optional | `bun add stripe` |
| `@stripe/stripe-js` | ^9.6.0 | Stripe client SDK (browser) | ⚡ Optional | `bun add @stripe/stripe-js` |
| `razorpay` | ^2.9.6 | Razorpay payments (India) | ⚡ Optional | `bun add razorpay` |

### Configuration Notes

- **stripe** (server): Initialize with `new Stripe(process.env.STRIPE_SECRET_KEY)`. Handle webhooks in `src/app/api/stripe/webhook/route.ts`.
- **@stripe/stripe-js** (client): Load with `loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)`. Use with `@stripe/react-stripe-js` for Elements.
- **razorpay**: Initialize with `new Razorpay({ key_id, key_secret })`. Used for UPI, netbanking, and wallets (India-focused).
- **Environment variables**: Set `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`.

---

## 10. Realtime

| Package | Version | Purpose | Required | Install |
|---|---|---|---|---|
| `socket.io` | ^4.7.0 | WebSocket library (mini-services) | ⚡ Optional | `bun add socket.io` |
| `socket.io-client` | latest | Socket.IO client for browser | ⚡ Optional | `bun add socket.io-client` |

### Configuration Notes

- Socket.IO runs as a **mini-service** (see Section 13), not in the main Next.js process.
- Frontend connects via: `io("/?XTransformPort=3003")` (Caddy gateway routing).
- **Do NOT** use `io("http://localhost:3003")` — always use the gateway query parameter.
- Used for: real-time notifications, live deal updates, collaborative editing.

---

## 11. Testing

| Package | Version | Purpose | Required | Install |
|---|---|---|---|---|
| `vitest` | ^4.1.6 | Fast unit test framework | ⚡ Dev | `bun add -d vitest` |
| `@vitest/coverage-v8` | ^4.1.6 | V8 code coverage reporter | ⚡ Dev | `bun add -d @vitest/coverage-v8` |
| `@vitejs/plugin-react` | ^6.0.2 | Vite React plugin for Vitest | ⚡ Dev | `bun add -d @vitejs/plugin-react` |
| `@testing-library/react` | ^16.3.2 | React component testing utilities | ⚡ Dev | `bun add -d @testing-library/react` |
| `@testing-library/jest-dom` | ^6.9.1 | Custom DOM matchers (toBeInTheDocument) | ⚡ Dev | `bun add -d @testing-library/jest-dom` |
| `@testing-library/user-event` | ^14.6.1 | Simulate user interactions | ⚡ Dev | `bun add -d @testing-library/user-event` |
| `jsdom` | ^29.1.1 | DOM implementation for test environment | ⚡ Dev | `bun add -d jsdom` |
| `msw` | ^2.14.6 | Mock Service Worker for API mocking | ⚡ Dev | `bun add -d msw` |
| `dompurify` | ^3.4.5 | HTML sanitization for test fixtures | ⚡ Dev | `bun add -d dompurify` |

### Configuration Notes

- **Vitest**: Configure in `vitest.config.ts`. Set `environment: "jsdom"` for DOM tests.
- **Testing Library**: Use `render()`, `screen`, `fireEvent` / `userEvent` for component tests. Prefer `userEvent` over `fireEvent`.
- **MSW**: Set up request handlers in `src/mocks/handlers.ts`. Use `setupServer()` for Node.js tests.
- **Coverage**: Run `bun run test:coverage` to generate V8 coverage reports.

---

## 12. Developer Tools

| Package | Version | Purpose | Required | Install |
|---|---|---|---|---|
| `eslint` | ^9 | JavaScript/TypeScript linter | ⚡ Dev | `bun add -d eslint` |
| `eslint-config-next` | ^16.1.1 | Next.js-specific ESLint rules | ⚡ Dev | `bun add -d eslint-config-next` |
| `typescript` | ^5 | TypeScript compiler | ✅ Required | `bun add -d typescript` |
| `@types/react` | ^19 | React type definitions | ⚡ Dev | `bun add -d @types/react` |
| `@types/react-dom` | ^19 | React DOM type definitions | ⚡ Dev | `bun add -d @types/react-dom` |
| `@types/bcryptjs` | ^3.0.0 | bcryptjs type definitions | ⚡ Dev | `bun add -d @types/bcryptjs` |
| `@types/jsonwebtoken` | ^9.0.10 | jsonwebtoken type definitions | ⚡ Dev | `bun add -d @types/jsonwebtoken` |
| `@types/nodemailer` | ^8.0.0 | nodemailer type definitions | ⚡ Dev | `bun add -d @types/nodemailer` |
| `@types/dompurify` | ^3.2.0 | dompurify type definitions | ⚡ Dev | `bun add -d @types/dompurify` |
| `bun-types` | ^1.3.4 | Bun runtime type definitions | ⚡ Dev | `bun add -d bun-types` |

### Configuration Notes

- **ESLint v9**: Uses flat config (`eslint.config.mjs`). Extends `eslint-config-next` for Next.js rules.
- **TypeScript v5**: Configured in `tsconfig.json` with `strict: true`. Path aliases: `@/*` → `src/*`.
- Run `bun run lint` to check for code quality issues.

---

## 13. Mini-Service Dependencies

Independent services that run alongside the main Next.js application.

### 13.1 Realtime Service (`mini-services/realtime-service`)

| Package | Version | Purpose | Required | Install |
|---|---|---|---|---|
| `socket.io` | ^4.7.0 | WebSocket server | ✅ Required | `cd mini-services/realtime-service && bun add socket.io` |
| `cors` | ^2.8.5 | Cross-origin middleware | ✅ Required | `cd mini-services/realtime-service && bun add cors` |
| `ioredis` | ^5.3.0 | Redis client (Socket.IO adapter) | ⚡ Optional | `cd mini-services/realtime-service && bun add ioredis` |

**Port**: 3003  
**Start**: `bun run dev` (runs `bun --hot index.ts`)

### 13.2 Proxy Service (`mini-services/proxy`)

| Package | Version | Purpose | Required | Install |
|---|---|---|---|---|
| `http-proxy` | latest | HTTP proxy middleware | ✅ Required | `cd mini-services/proxy && bun add http-proxy` |

**Port**: Configurable  
**Start**: `bun run dev`

### 13.3 WebSocket Service (`mini-services/ws-service`)

| Package | Version | Purpose | Required | Install |
|---|---|---|---|---|
| `socket.io` | ^4.7.0 | WebSocket server | ✅ Required | `cd mini-services/ws-service && bun add socket.io` |
| `cors` | ^2.8.5 | Cross-origin middleware | ✅ Required | `cd mini-services/ws-service && bun add cors` |

**Port**: 3004  
**Start**: `bun run dev`

### Configuration Notes

- Each mini-service is an **independent Bun project** with its own `package.json` and entry file (`index.ts`).
- All services must be started for full functionality. The main app's Caddy gateway routes traffic via `XTransformPort` query parameter.
- **ioredis** in the realtime service enables the Socket.IO Redis adapter for horizontal scaling (multiple instances). Not required for single-instance dev.

---

## 14. Install Commands

### Fresh Install (All Dependencies)

```bash
# Install main project dependencies
bun install

# Install mini-service dependencies
cd mini-services/realtime-service && bun install && cd ../..
cd mini-services/proxy && bun install && cd ../..
cd mini-services/ws-service && bun install && cd ../..
```

### By Category

```bash
# Core framework
bun add next react react-dom
bun add -d typescript

# UI — Component library (all Radix UI primitives)
bun add @radix-ui/react-accordion @radix-ui/react-alert-dialog @radix-ui/react-aspect-ratio \
  @radix-ui/react-avatar @radix-ui/react-checkbox @radix-ui/react-collapsible \
  @radix-ui/react-context-menu @radix-ui/react-dialog @radix-ui/react-dropdown-menu \
  @radix-ui/react-hover-card @radix-ui/react-label @radix-ui/react-menubar \
  @radix-ui/react-navigation-menu @radix-ui/react-popover @radix-ui/react-progress \
  @radix-ui/react-radio-group @radix-ui/react-scroll-area @radix-ui/react-select \
  @radix-ui/react-separator @radix-ui/react-slider @radix-ui/react-slot \
  @radix-ui/react-switch @radix-ui/react-tabs @radix-ui/react-toggle \
  @radix-ui/react-toggle-group @radix-ui/react-tooltip

# UI — Styling
bun add tailwind-merge class-variance-authority clsx tailwindcss-animate
bun add -d tailwindcss @tailwindcss/postcss tw-animate-css

# UI — Icons & Animation
bun add lucide-react framer-motion

# UI — Layout & Panels
bun add react-resizable-panels vaul embla-carousel-react @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities

# UI — Forms & Input
bun add react-hook-form @hookform/resolvers zod input-otp cmdk

# UI — Data Display
bun add recharts @tanstack/react-table react-syntax-highlighter react-markdown @mdxeditor/editor

# UI — Date & Time
bun add date-fns react-day-picker

# State Management
bun add zustand @tanstack/react-query @reactuses/core

# Database
bun add prisma @prisma/client

# Authentication
bun add next-auth bcryptjs jose jsonwebtoken
bun add -d @types/bcryptjs @types/jsonwebtoken

# Email
bun add nodemailer resend
bun add -d @types/nodemailer

# Payments
bun add stripe @stripe/stripe-js razorpay

# Testing
bun add -d vitest @vitest/coverage-v8 @vitejs/plugin-react \
  @testing-library/react @testing-library/jest-dom @testing-library/user-event \
  jsdom msw dompurify
bun add -d @types/dompurify

# Developer Tools
bun add -d eslint eslint-config-next typescript @types/react @types/react-dom bun-types

# Utility
bun add uuid sonner sharp next-intl next-themes
```

### Database Setup

```bash
# After installing Prisma, initialize and push schema
bunx prisma generate
bun run db:push

# Open visual database browser
bunx prisma studio
```

---

## 15. Version Compatibility Matrix

Key compatibility constraints between major dependencies.

| Package A | Version | Package B | Version | Compatible | Notes |
|---|---|---|---|---|---|
| `next` | 16.x | `react` | 19.x | ✅ | Next.js 16 requires React 19 |
| `next` | 16.x | `next-auth` | 4.x | ✅ | v4 is legacy compat; v5 is in beta |
| `react` | 19.x | `framer-motion` | 12.x | ✅ | FM v12+ supports React 19 |
| `react` | 19.x | `@tanstack/react-query` | 5.x | ✅ | Full React 19 support |
| `react` | 19.x | `@tanstack/react-table` | 8.x | ✅ | Framework-agnostic, React adapter works |
| `react` | 19.x | `react-hook-form` | 7.60+ | ✅ | v7.60+ adds React 19 support |
| `react` | 19.x | `recharts` | 2.15+ | ✅ | Works with React 19 |
| `react` | 19.x | `@radix-ui/react-*` | latest | ✅ | All Radix packages support React 19 |
| `tailwindcss` | 4.x | `@tailwindcss/postcss` | 4.x | ✅ | Must match major versions |
| `tailwindcss` | 4.x | `tailwind-merge` | 3.x | ✅ | Compatible |
| `tailwindcss` | 4.x | `tailwindcss-animate` | 1.x | ✅ | Compatible (may need config tweaks) |
| `prisma` | 6.x | `@prisma/client` | 6.x | ✅ | Must match major + minor versions |
| `prisma` | 6.x | Node.js | 20+ | ✅ | Prisma 6 requires Node 18+ |
| `prisma` | 6.x | SQLite | 3.x | ✅ | Dev database |
| `prisma` | 6.x | PostgreSQL | 16.x | ✅ | Production database |
| `zod` | 4.x | `@hookform/resolvers` | 5.x | ✅ | zodResolver supports Zod v4 |
| `jose` | 6.x | Edge Runtime | — | ✅ | Designed for Edge; no Node.js APIs |
| `jsonwebtoken` | 9.x | Node.js Runtime | — | ✅ | Requires Node.js; NOT Edge-compatible |
| `socket.io` | 4.7+ | `socket.io-client` | 4.7+ | ✅ | Major versions must match |
| `socket.io` | 4.7+ | `ioredis` | 5.x | ✅ | Via `@socket.io/redis-adapter` |
| `vitest` | 4.x | `@vitejs/plugin-react` | 6.x | ✅ | Vite 6 plugin for React |
| `vitest` | 4.x | `jsdom` | 29.x | ✅ | DOM environment for tests |
| `bun` | 1.x | `next` | 16.x | ✅ | Bun runs Next.js via `bun run dev` |
| `bun` | 1.x | `prisma` | 6.x | ⚠️ | May need `--backend=cpython` for native |
| `stripe` | 22.x | `@stripe/stripe-js` | 9.x | ✅ | Server + client SDK pair |
| `next-intl` | 4.x | `next` | 16.x | ✅ | Internationalization for App Router |
| `next-themes` | 0.4.x | `next` | 16.x | ✅ | Dark mode provider |
| `@dnd-kit/core` | 6.x | `@dnd-kit/sortable` | 10.x | ✅ | DnD engine + sortable preset |
| `embla-carousel-react` | 8.x | `react` | 19.x | ✅ | Carousel component |
| `cmdk` | 1.x | `react` | 19.x | ✅ | Command palette |
| `vaul` | 1.x | `react` | 19.x | ✅ | Drawer component |
| `sonner` | 2.x | `react` | 19.x | ✅ | Toast notifications |

### Runtime Compatibility Summary

| Runtime | Works With | Limitations |
|---|---|---|
| **Bun 1.x** | Next.js 16, React 19, Prisma 6 | Some native modules may need fallback |
| **Node.js 20+** | All server-side packages | Required by `sharp`, `bcryptjs` native bindings |
| **Edge Runtime** | `jose`, `next-auth` (partial) | No `jsonwebtoken`, `bcryptjs`, `nodemailer`, `stripe` |

### Breaking Change Warnings

| Package | Current | Upgrade Path | Risk |
|---|---|---|---|
| `next-auth` | v4 | v5 (Auth.js) | 🔴 Major API changes; deferred |
| `zod` | v4 | — | 🟡 New major; some v3 patterns changed |
| `tailwindcss` | v4 | — | 🟡 New config syntax; no `tailwind.config.ts` |
| `react` | v19 | — | 🟢 Stable; most libraries now compatible |
| `prisma` | v6 | — | 🟢 Stable; new `prisma-client-ts` preview |

---

> **Legend**: ✅ Required | ⚡ Optional / Dev only | ⚠️ Compatibility note | 🔴 High-risk upgrade | 🟡 Medium-risk change | 🟢 Stable
