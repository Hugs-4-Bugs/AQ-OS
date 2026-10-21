<div align="center">

<br/>

# AcquisitionOS

### AI-native customer acquisition platform

**From discovering prospects to closing the opportunity — in one system.**

[![Next.js 16](https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Prisma](https://img.shields.io/badge/Prisma-ORM-2D3748?style=flat-square&logo=prisma)](https://www.prisma.io/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-4-06B6D4?style=flat-square&logo=tailwindcss)](https://tailwindcss.com/)
[![License](https://img.shields.io/badge/License-Proprietary-8B0000?style=flat-square)](LICENSE)

<br/>

</div>

---

## What is AcquisitionOS?

AcquisitionOS is an **AI-native customer acquisition platform that takes a business from discovering prospects to closing an opportunity.**

It covers the full outbound journey in a single workspace:

**Discover → Research → Identify Opportunities → Score → Personalize → Outreach → Replies → Meetings → Pipeline → Proposals → Close**

The platform is built for **outbound-heavy agencies, consultancies, B2B service businesses, and sales teams** that need to find, qualify, contact, and convert prospects at scale — without losing the thread between first discovery and signed deal.

---

## Core Capabilities

Capability status below reflects the current codebase honestly: **Available** (implemented), **In development** (actively being built or hardened), **Planned** (on the roadmap, not yet in the codebase).

### Lead Discovery — Available
- Prospect discovery by niche/industry and geographic targeting (country, city)
- Multi-source discovery pipeline with source adapters, verification, and normalization
- Lead intelligence: enrichment, research jobs, website analysis
- Lead qualification with composite scoring (reply, conversion, urgency, revenue potential)
- Persistent lead database with activity history, notes, tags, import/export

### Business Context — Available (hardening in progress)
- **My Context** — the user's saved business context
- **Business Profile** — saved business information per user
- **My Offer** — the user's offer/positioning
- Saved business information is the foundation for outreach personalization

### Workflows — Available (targeting expansion in development)
- Visual workflow builder with configurable multi-step definitions
- Workflow execution engine with execution records, step logs, templates, and triggers
- Lead-based execution and execution history/analytics
- Run-against-lead execution with multi-lead selection and advanced targeting modes in active development

### Personalization — In development
Intended architecture: **user business context + user offer/profile + individual lead information + lead-specific signals → individualized outreach and actions per lead.** The building blocks (context, profiles, offers, AI generation, lead data) are present; deep per-lead individualization is being completed.

### Autopilot — In development
Intended role: **automatic prospect discovery → lead creation → deduplication → workflow execution → scheduling → tracking**, configurable per niche, country, and schedule. Core models and run tracking exist in the codebase; completion of targeting breadth, dynamic workflow selection, and schedule granularity is in progress.

### Outreach — Email available; other channels expanding
- **Email** — SMTP delivery, Gmail OAuth integration, sequences with scheduled enrollment, open/click tracking, bounce and unsubscribe handling
- **WhatsApp / Telegram** — credential-gated messaging integrations
- **LinkedIn / Instagram** — planned, not yet implemented

### Pipeline & Deals — Available
- Kanban pipeline with stage management (including custom stages)
- Deal analytics: funnel, velocity, win/loss, aging alerts
- Meeting scheduling with calendar integration

### Analytics & Insights — Available
- Conversion funnels, performance trends, score distributions
- Predictive analytics and anomaly detection engines
- Real-time dashboards and activity feeds

### Platform — Available
- Authentication: email/password, Google OAuth, OTP, magic link, MFA support
- Organizations, team management, role-based access control
- Plans & entitlements (Free / Starter / Pro / Elite), credits ledger, invoicing, Stripe and Razorpay payment integrations
- Real-time updates (WebSocket + SSE), notifications, feature flags
- Internationalization (next-intl), dark/light theming, responsive UI

---

## AI / RAG / Lead Intelligence

AcquisitionOS is AI-native: AI participates in discovery assistance, lead analysis and scoring, outreach generation, reply intelligence, meeting assistance, and insights.

- **AI layer** — a gateway service (`src/lib/ai/`) built on `z-ai-web-dev-sdk` with provider fallback, prompt management, and AI cost tracking/credits
- **Lead intelligence** — enrichment, website scoring, composite lead scores with AI-generated explanations
- **RAG** — document ingestion (text, CSV, URL) with context retrieval (`src/lib/rag-service.ts`, `src/lib/vector-search-service.ts`, `/api/ai/rag/*`) — foundational implementation, in development

No specific model, provider count, or accuracy claims are made; capabilities evolve with the configured AI provider.

---

## Architecture

**Modular monolith** — a single Next.js 16 application serving UI, API, and business logic from one process with one database.

```text
AcquisitionOS (single deployable)
│
├── Frontend — React 19 · TypeScript · Tailwind 4 · shadcn/ui · TanStack Query · Zustand
│
├── API / Backend — Next.js App Router (~500 REST route files)
│
├── Authentication — credentials · Google OAuth · OTP · magic link · sessions/JWT · MFA · RBAC
│
├── Lead Discovery — discovery engine · source adapters · verification · enrichment · dedup
│
├── Lead Intelligence — scoring engine · website scorer · reply intelligence · analytics engines
│
├── Workflow Engine — definitions · executor · executions/logs · templates · triggers · DLQ
│
├── Autopilot — workflow/run/lead models · scheduler (in development)
│
├── AI Layer — z-ai-web-dev-sdk gateway · provider fallback · RAG · prompt manager · cost tracking
│
├── Outreach / Integrations — Email (SMTP/Gmail) · WhatsApp · Telegram · Google Calendar · Stripe · Razorpay
│
└── Database — Prisma ORM · 105 models · SQLite (development runtime)
```

**Database:** development runs on SQLite via Prisma (`db/`). A PostgreSQL schema variant exists for production (`prisma/schema.production.prisma`) but currently covers only a subset of models — full production database migration is on the roadmap, and no production deployment is live yet.

Deeper documentation lives in [`docs/`](docs/): [Product Overview](docs/01-overview/PRODUCT-OVERVIEW.md), [System Architecture](docs/02-architecture/SYSTEM-ARCHITECTURE.md), [Database Schema](docs/02-architecture/DATABASE-SCHEMA.md), [Deployment](DEPLOYMENT.md), and operational runbooks.

---

## Tech Stack

| Category | Technology |
|----------|-----------|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript 5 |
| UI | React 19, Tailwind CSS 4, shadcn/ui, Radix UI, Framer Motion, Lucide |
| State / Data | TanStack Query, TanStack Table, Zustand, React Hook Form + Zod |
| Database | Prisma ORM (105 models), SQLite (development) |
| Auth | NextAuth, jose / jsonwebtoken, bcryptjs (credentials, Google OAuth, OTP, magic link, MFA) |
| AI | z-ai-web-dev-sdk gateway with provider fallback, RAG services, prompt management |
| Email / Messaging | Nodemailer (SMTP), Resend, Gmail OAuth, WhatsApp & Telegram integrations |
| Payments | Stripe, Razorpay |
| Realtime | WebSocket + SSE |
| Observability | OpenTelemetry, health endpoints |
| Charts | Recharts |
| Testing | Vitest, Testing Library, MSW |
| Deployment | Vercel (`vercel.json`) and Docker (`Dockerfile`, `docker-compose*.yml`) |

---

## Project Structure

```text
/
├── src/app/            # Next.js App Router — pages + ~500 API route files
├── src/components/     # dashboard feature components + shadcn/ui primitives
├── src/lib/            # ~258 service modules (workflows, discovery, AI, billing, outreach, ...)
├── prisma/             # schema.prisma (105 models) + production schema variant
├── scripts/            # db-safety, backup, and operational scripts
├── db/                 # SQLite database (development)
├── docs/               # architecture, runbooks, checklists, integration guides
├── Dockerfile / docker-compose*.yml / vercel.json / DEPLOYMENT.md
├── README.md
└── LICENSE
```

---

## Local Development

### Prerequisites

- **Node.js ≥ 20** (required by Next.js 16)
- **Bun ≥ 1.0** (recommended) or npm
- **Git**

### Installation

```bash
git clone https://github.com/Hugs-4-Bugs/AQ-OS.git
cd AQ-OS
bun install        # postinstall generates the Prisma client
```

### Environment Variables

Create a `.env` file in the project root. Minimal safe example (**never commit real credentials**):

```env
# Database (SQLite, local development)
DATABASE_URL="file:./db/custom.db"

# AI provider (required for AI features)
ZAI_API_KEY=

# Google OAuth (optional)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# SMTP email delivery (optional)
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASSWORD=

# Session secrets
AUTH_SECRET=

# Google Programmable Search (optional, discovery)
GOOGLE_SEARCH_API_KEY=
GOOGLE_SEARCH_CX=
```

The complete variable reference is in [`docs/ENV-SECRETS-REFERENCE.md`](docs/ENV-SECRETS-REFERENCE.md) and [`docs/04-secrets-and-configuration/`](docs/04-secrets-and-configuration/).

### Database Setup

```bash
bun run db:push      # apply the schema (wrapped by an automatic safety snapshot)
```

### Running the Application

```bash
bun run dev          # development server at http://localhost:3000
bun run build        # production build
bun run start        # production server
bun test             # run the test suite (Vitest)
```

---

## Database & Data Safety

Persistent application data (users, leads, profiles, contexts, offers, workflows, executions, outreach, pipeline, billing records) is **intended to remain persistent** and must never be automatically deleted, reset, or truncated as part of normal application operation. Deletion happens only through explicit, supported user actions.

The repository ships with safety tooling that reflects this policy:

- `db:push` / `db:migrate` are wrapped by `scripts/db-safety.mjs`, which takes an automatic snapshot before touching the schema
- `db:reset` is gated behind an explicit guard
- `db:snapshot` / `db:safety` provide manual snapshot and status checks
- `backup` / `backup:restore` scripts provide operational backups

Do not run destructive database operations (`DROP`, `TRUNCATE`, bulk `DELETE`, reset/reseed) against an application database — they are not part of any documented setup or runbook procedure.

---

## Authentication

Implemented authentication flows:

- **Email / password** with verification, password reset, and account lock protection
- **Google OAuth**
- **OTP login**
- **Magic link login**
- **MFA** configuration support and session management (refresh, device history, suspicious-login detection)

Individual flows can be enabled/disabled via environment flags (e.g., `ENABLE_GOOGLE_OAUTH`, `ENABLE_OTP_LOGIN`, `ENABLE_MAGIC_LINK`). Sessions use signed JWTs with refresh handling.

---

## Deployment

Two deployment paths are provided:

- **Vercel** — `vercel.json` (build via `npm run vercel-build`, security headers, region config)
- **Docker** — `Dockerfile`, `docker-compose.yml`, `docker-compose.local.yml`, `docker-compose.prod.yml`

Guides: [`DEPLOYMENT.md`](DEPLOYMENT.md), [`LOCAL-TO-PRODUCTION-DEPLOYMENT.md`](LOCAL-TO-PRODUCTION-DEPLOYMENT.md), and [`docs/03-setup-and-deployment/`](docs/03-setup-and-deployment/).

> Note: no production deployment is currently live; the PostgreSQL production schema variant covers a subset of the full model set (see Architecture).

---

## Status & Roadmap

### Current Product (implemented)
Lead discovery pipeline · lead intelligence & scoring · persistent lead database · pipeline & deal management · email outreach (SMTP/Gmail, sequences, tracking) · workflows engine with executions & logs · My Context / Business Profile / My Offer · authentication suite (password, Google, OTP, magic link) · organizations & RBAC · plans, entitlements, credits, billing (Stripe/Razorpay) · analytics & insights · notifications & realtime · RAG foundation · admin foundation · i18n & theming

### In Progress
Workflow step-execution reliability hardening · multi-lead selection and advanced workflow targeting · Autopilot completion (targeting breadth, dynamic workflow selection, schedule granularity) · per-lead personalization depth · admin operations expansion · full production database migration

### Planned
Additional outreach channels (LinkedIn, Instagram) · CRM sync (HubSpot, Salesforce) · A/B testing for outreach · advanced opportunity analysis

---

## License

This repository contains **proprietary software**. See [`LICENSE`](LICENSE).

Copyright © 2026 **QuantumFusion Solutions**. All rights reserved. Unauthorized copying, reproduction, distribution, or modification is prohibited.

---

<div align="center">

**AI-native customer acquisition infrastructure for modern sales teams.**

</div>
