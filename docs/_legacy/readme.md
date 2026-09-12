# AcquisitionOS — Project Documentation

> **AI-Powered B2B Lead Acquisition Platform**  
> Version 3.0.0 • March 2026

---

## Overview

AcquisitionOS is a full-stack SaaS platform that helps businesses discover, analyze, and convert B2B leads using AI-powered intelligence. It combines lead discovery, automated outreach, pipeline management, workflow automation, and competitive analysis into a single integrated platform.

### Key Capabilities

- 🔍 **AI Lead Discovery** — Find potential customers using natural language search
- 📊 **Smart Scoring** — AI-generated reply, conversion, urgency, and revenue scores
- 📧 **Multi-Channel Outreach** — Personalized messages for email, WhatsApp, LinkedIn, Instagram
- 🔄 **Workflow Automation** — Event-driven automation with visual builder
- 📈 **Pipeline Management** — Kanban-style pipeline with drag-and-drop
- 💰 **Payment Processing** — Dual provider (Stripe + Razorpay) with subscription management
- 🤖 **AI Assistant** — Context-aware sales coaching and lead analysis
- 🛡️ **Enterprise Security** — MFA, RBAC, rate limiting, CSRF, audit logging
- 📋 **Compliance** — GDPR data export, DPA, consent management, cookie compliance

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│  │ Overview  │  │  Leads   │  │ Pipeline │  │ Outreach │    │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘    │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│  │ Discover  │  │ Assistant│  │  Deals   │  │ Insights │    │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘    │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│  │Competitor │  │Workflows │  │Messaging │  │ Settings │    │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘    │
│                                                              │
│  React 19 + Next.js 16 + Tailwind CSS 4 + shadcn/ui        │
│  Zustand (state) + TanStack Query (server state)             │
│  Framer Motion (animations) + Recharts (charts)              │
└───────────────────────────┬──────────────────────────────────┘
                            │ HTTP / SSE / WebSocket
┌───────────────────────────┴──────────────────────────────────┐
│                      API GATEWAY LAYER                        │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────┐         │
│  │   Caddy     │  │   Nginx     │  │   K8s Ingress│         │
│  │ (dev proxy) │  │ (prod proxy)│  │  (cloud)     │         │
│  └─────────────┘  └─────────────┘  └──────────────┘         │
└───────────────────────────┬──────────────────────────────────┘
                            │
┌───────────────────────────┴──────────────────────────────────┐
│                    MIDDLEWARE LAYER                            │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│  │ JWT Auth │  │ API Key  │  │   CSRF   │  │  Rate    │    │
│  │ (jose)   │  │ Auth     │  │ Protect  │  │ Limiting │    │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘    │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│  │ Security │  │ Plan     │  │ Input    │  │ Monitor  │    │
│  │ Headers  │  │ Gates    │  │ Validatn │  │ (traces) │    │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘    │
└───────────────────────────┬──────────────────────────────────┘
                            │
┌───────────────────────────┴──────────────────────────────────┐
│                    APPLICATION LAYER                           │
│  ┌──────────────────────────────────────────────────────┐    │
│  │               Next.js 16 App Router                   │    │
│  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐        │    │
│  │  │ Auth   │ │ Leads  │ │ Workfl │ │ Paymnt │        │    │
│  │  │ Routes │ │ Routes │ │ Routes │ │ Routes │        │    │
│  │  └────────┘ └────────┘ └────────┘ └────────┘        │    │
│  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐        │    │
│  │  │Subscrpt│ │Mssging │ │  GDPR  │ │ Credit │        │    │
│  │  │ Routes │ │ Routes │ │ Routes │ │ Routes │        │    │
│  │  └────────┘ └────────┘ └────────┘ └────────┘        │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐    │
│  │                  Service Layer                         │    │
│  │  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐      │    │
│  │  │ Auth │ │Lead  │ │Workfl│ │Credit│ │Billed│      │    │
│  │  │ Svc  │ │Discov│ │Engine│ │ Svc  │ │ Svc  │      │    │
│  │  └──────┘ └──────┘ └──────┘ └──────┘ └──────┘      │    │
│  │  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐      │    │
│  │  │Broadc│ │Subscr│ │Trial │ │Invoc │ │RAG   │      │    │
│  │  │ Svc  │ │ Svc  │ │ Svc  │ │ Svc  │ │ Svc  │      │    │
│  │  └──────┘ └──────┘ └──────┘ └──────┘ └──────┘      │    │
│  └──────────────────────────────────────────────────────┘    │
└───────────────────────────┬──────────────────────────────────┘
                            │
┌───────────────────────────┴──────────────────────────────────┐
│                      DATA LAYER                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │   SQLite     │  │ PostgreSQL   │  │  In-Memory   │       │
│  │  (default)   │  │ (production) │  │    Cache     │       │
│  │  53+ tables  │  │              │  │              │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
│                                                              │
│  Prisma ORM (SQLite client) • Connection pooling             │
└──────────────────────────────────────────────────────────────┘
                            │
┌───────────────────────────┴──────────────────────────────────┐
│                   EXTERNAL SERVICES                           │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐    │
│  │ Stripe │ │Razorpay│ │ Gmail  │ │Google  │ │Telegram│    │
│  │        │ │        │ │  SMTP  │ │ OAuth  │ │  Bot   │    │
│  └────────┘ └────────┘ └────────┘ └────────┘ └────────┘    │
│  ┌────────┐ ┌────────┐                                       │
│  │WhatsApp│ │  z-ai  │                                       │
│  │  API   │ │  SDK   │                                       │
│  └────────┘ └────────┘                                       │
└──────────────────────────────────────────────────────────────┘
```

---

## Tech Stack

### Frontend

| Technology | Version | Purpose |
|------------|---------|---------|
| **React** | 19 | UI library |
| **Next.js** | 16 | Full-stack framework (App Router) |
| **TypeScript** | 5 | Type-safe JavaScript |
| **Tailwind CSS** | 4 | Utility-first CSS |
| **shadcn/ui** | Latest | Component library (New York style) |
| **Zustand** | 5 | Client state management |
| **TanStack Query** | 5 | Server state management |
| **Framer Motion** | 12 | Animations and transitions |
| **Recharts** | 2 | Data visualization |
| **Lucide React** | Latest | Icon library |
| **react-hook-form** | 7 | Form validation |
| **Zod** | 4 | Schema validation |

### Backend

| Technology | Version | Purpose |
|------------|---------|---------|
| **Next.js API Routes** | 16 | REST API endpoints |
| **Prisma ORM** | 6 | Database ORM |
| **SQLite** | 3 | Default database |
| **jose** | 6 | JWT handling (Edge compatible) |
| **bcryptjs** | 3 | Password hashing |
| **nodemailer** | 8 | Email sending |
| **Stripe** | 22 | USD payment processing |
| **Razorpay** | 2 | INR payment processing |
| **z-ai-web-dev-sdk** | Latest | AI capabilities (RAG, chat, embeddings) |

### Infrastructure

| Technology | Purpose |
|------------|---------|
| **Docker / Docker Compose** | Containerization |
| **Kubernetes** | Orchestration (production) |
| **Nginx / Caddy** | Reverse proxy |
| **Prometheus** | Metrics collection |
| **Grafana** | Monitoring dashboards |

---

## Feature List

### Core Features

- [x] User authentication (email/password, Google OAuth, OTP, magic link)
- [x] Multi-factor authentication (TOTP)
- [x] Lead discovery with AI-powered natural language search
- [x] Lead management (CRUD, scoring, enrichment, merging)
- [x] Pipeline management (Kanban, drag-and-drop, custom stages)
- [x] Multi-channel outreach (email, WhatsApp, LinkedIn, Instagram)
- [x] Outreach sequence automation
- [x] Broadcast campaigns with audience filtering
- [x] Workflow automation builder with 6 trigger types
- [x] AI assistant and sales coach
- [x] Competitor intelligence with SWOT analysis
- [x] Deal tracking and revenue management
- [x] Business insights and AI recommendations
- [x] Credit-based billing system
- [x] Dual payment providers (Stripe + Razorpay)
- [x] Subscription management with plan gates
- [x] Organization management with RBAC
- [x] API key management with scoped permissions
- [x] GDPR compliance (DPA, data export, account deletion)
- [x] Cookie consent management
- [x] Real-time notifications (in-app, email, Telegram)
- [x] Keyboard shortcuts and command palette

### Security Features

- [x] JWT authentication with token rotation
- [x] Rate limiting (7 configurable limiters)
- [x] CSRF protection (double-submit cookie)
- [x] Input validation (SQL injection, XSS, path traversal)
- [x] Upload security (MIME whitelist, magic bytes)
- [x] Webhook signature verification (timing-safe)
- [x] Account lockout with exponential backoff
- [x] Suspicious login detection
- [x] Security audit logging
- [x] Comprehensive security headers

### Observability Features

- [x] Structured JSON logging
- [x] API performance monitoring (p50/p95/p99)
- [x] Database query monitoring
- [x] Alert engine with 8 rules
- [x] Distributed tracing
- [x] Monitoring dashboard UI
- [x] Health check endpoints (basic + detailed)
- [x] Prometheus-compatible metrics

---

## Quick Start

### Prerequisites

- [Bun](https://bun.sh/) 1.0+ or Node.js 20+
- Git

### Setup

```bash
# 1. Clone the repository
git clone https://github.com/your-org/acquisitionos.git
cd acquisitionos

# 2. Install dependencies
bun install

# 3. Configure environment
cp .env.example .env
# Edit .env — at minimum, set DATABASE_URL and JWT_SECRET

# 4. Initialize database
bun run db:push

# 5. Start development server
bun run dev

# 6. Open in browser
# Navigate to http://localhost:3000
```

### Default Credentials (Development)

After running the seed script (`bun run scripts/seed.ts`):

| Email | Password | Role |
|-------|----------|------|
| `demo@acquisitionos.com` | `demo1234` | Owner |

**⚠️ Change these credentials immediately in production.**

---

## Documentation Index

| Document | Description | Audience |
|----------|-------------|----------|
| [API Reference](./api-reference.md) | Complete REST API documentation with examples | Developers |
| [User Guide](./user-guide.md) | How to use AcquisitionOS features | End Users |
| [Admin Guide](./admin-guide.md) | Installation, configuration, monitoring, troubleshooting | Administrators |
| [Changelog](./changelog.md) | Version history and release notes | Everyone |
| [Deployment Guide](./deployment.md) | Production deployment instructions | DevOps |
| [Security Audit](./security-audit.md) | Security findings and fixes | Security |
| [Monitoring Guide](./monitoring.md) | Observability setup and usage | SRE |

---

## Project Structure

```
acquisitionos/
├── src/
│   ├── app/
│   │   ├── api/                    # API routes (100+ endpoints)
│   │   │   ├── auth/               # Authentication (signin, signup, MFA, OAuth, etc.)
│   │   │   ├── leads/              # Lead management (CRUD, analyze, discover, etc.)
│   │   │   ├── pipeline/           # Pipeline view
│   │   │   ├── workflows/          # Workflow automation
│   │   │   ├── messaging/          # Broadcasts, templates, analytics
│   │   │   ├── payments/           # Orders, webhooks, refunds, invoices
│   │   │   ├── subscriptions/      # Plans, entitlements, trials
│   │   │   ├── settings/           # Profile, password, API keys, org
│   │   │   ├── credits/            # Credit balance and history
│   │   │   ├── deals/              # Deal tracking
│   │   │   ├── insights/           # Analytics and recommendations
│   │   │   ├── competitor/         # Competitive intelligence
│   │   │   ├── ai/                 # RAG, vector search, costs
│   │   │   ├── gdpr/               # Compliance (DPA, export, delete)
│   │   │   ├── health/             # Health checks
│   │   │   ├── audit/              # Audit logs
│   │   │   └── admin/              # Admin operations
│   │   ├── layout.tsx              # Root layout
│   │   ├── page.tsx                # Main application page
│   │   ├── globals.css             # Global styles
│   │   ├── error.tsx               # Error boundary
│   │   ├── loading.tsx             # Loading state
│   │   └── not-found.tsx           # 404 page
│   ├── components/
│   │   ├── dashboard/              # Application components (50+)
│   │   └── ui/                     # shadcn/ui primitives (40+)
│   ├── hooks/                      # Custom React hooks
│   ├── lib/                        # Core libraries and services
│   │   ├── auth.ts                 # Authentication core
│   │   ├── auth-middleware.ts      # Auth middleware (JWT + API Key)
│   │   ├── credit-service.ts       # Credit deduction (atomic, idempotent)
│   │   ├── subscription-service.ts # Subscription management
│   │   ├── entitlement-service.ts  # Plan entitlements
│   │   ├── workflow-engine.ts      # Workflow execution engine
│   │   ├── pipeline-service.ts     # Pipeline operations
│   │   ├── broadcast-service.ts    # Broadcast campaigns
│   │   ├── lead-discovery-service.ts # AI lead discovery
│   │   ├── rag-service.ts          # RAG and vector search
│   │   ├── observability/          # Logging, monitoring, tracing
│   │   ├── security/               # Rate limiting, validation, upload security
│   │   └── ...                     # 40+ service modules
│   └── middleware.ts               # Next.js middleware (auth, CSRF, headers)
├── prisma/
│   └── schema.prisma               # Database schema (53+ models)
├── docs/                           # Documentation
├── deploy/                         # Deployment configurations
│   ├── k8s/                        # Kubernetes manifests
│   ├── terraform/                  # Infrastructure as code
│   ├── ec2/                        # EC2 deployment
│   ├── render/                     # Render configuration
│   ├── grafana/                    # Grafana dashboards
│   └── prometheus/                 # Prometheus config
├── scripts/
│   ├── backup/                     # Backup and restore scripts
│   └── seed.ts                     # Database seeding
├── mini-services/                  # Independent microservices
│   ├── ws-service/                 # WebSocket service
│   └── proxy/                      # Proxy service
├── monitoring/                     # Monitoring stack
├── docker-compose.yml              # Development Docker Compose
├── docker-compose.prod.yml         # Production Docker Compose
├── Dockerfile                      # Production Dockerfile
├── Dockerfile.frontend             # Frontend Dockerfile
├── nginx.conf                      # Development Nginx
├── nginx.prod.conf                 # Production Nginx
├── .env.example                    # Environment variable template
└── package.json                    # Dependencies and scripts
```

---

## Contributing

### Development Workflow

1. Create a feature branch from `main`
2. Make changes with proper TypeScript types
3. Run linting: `bun run lint`
4. Test manually via the UI and API
5. Submit a pull request

### Code Style

- TypeScript throughout with strict typing
- ES6+ import/export syntax
- shadcn/ui components over custom implementations
- `'use client'` for client components, `'use server'` for server actions
- Prisma schema primitives cannot be lists

### Useful Commands

```bash
bun run dev          # Start development server
bun run lint         # Run ESLint
bun run db:push      # Push schema changes to database
bun run db:generate  # Regenerate Prisma client
bun run db:migrate   # Run database migrations
bun run backup       # Create a backup
bun run security:scan # Run security scan
```

---

*Last updated: 2026-03-05 • AcquisitionOS v3.0.0*
