# AcquisitionOS — Local Architecture Document

> **Version**: 1.0  
> **Last Updated**: 2025-03-04  
> **Environment**: Local Development (Sandbox)  
> **Stack**: Next.js 16.1.3 · React 19 · TypeScript 5 · Prisma · SQLite · Redis · Socket.IO

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Service Architecture](#2-service-architecture)
3. [Data Flow Diagrams](#3-data-flow-diagrams)
4. [Database Architecture](#4-database-architecture)
5. [Authentication Architecture](#5-authentication-architecture)
6. [Payment Architecture](#6-payment-architecture)
7. [Realtime Architecture](#7-realtime-architecture)
8. [Background Jobs Architecture](#8-background-jobs-architecture)
9. [Security Architecture](#9-security-architecture)
10. [Observability](#10-observability)
11. [Local vs Production Differences](#11-local-vs-production-differences)

---

## 1. System Overview

### 1.1 High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              EXTERNAL CLIENTS                               │
│                   (Browser · Mobile App · API Consumers)                    │
└───────────────────────────────────┬─────────────────────────────────────────┘
                                    │  HTTPS / WSS
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CADDY REVERSE GATEWAY                               │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │  Routing Rules:                                                       │  │
│  │    /               → localhost:3000  (Next.js)                        │  │
│  │    /api/*          → localhost:3000  (Next.js API Routes)             │  │
│  │    ?XTransformPort=3001 → localhost:3001 (Proxy Service)              │  │
│  │    ?XTransformPort=3003 → localhost:3003 (Socket.IO Realtime)         │  │
│  │    WebSocket /    → localhost:3003  (Socket.IO upgrade)               │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
└───────┬──────────────────┬───────────────────┬──────────────────────────────┘
        │                  │                   │
        ▼                  ▼                   ▼
┌───────────────┐  ┌───────────────┐  ┌───────────────────────────────────────┐
│   NEXT.JS     │  │  PROXY SVC    │  │        REALTIME SERVICE               │
│  Port 3000    │  │  Port 3001    │  │        Port 3003                      │
│               │  │               │  │                                       │
│ ┌───────────┐ │  │  HTTP Proxy   │  │  ┌─────────────┐  ┌───────────────┐  │
│ │ App Router│ │  │  for external │  │  │  Socket.IO  │  │  Redis Pub/Sub│  │
│ │ SSR / RSC │ │  │  API requests │  │  │  Server     │  │  Adapter      │  │
│ └───────────┘ │  │               │  │  └──────┬──────┘  └───────┬───────┘  │
│ ┌───────────┐ │  └───────────────┘  └─────────┼─────────────────┼──────────┘
│ │ API Routes│ │                               │                 │
│ │ 122+ endp │ │                               │                 │
│ └─────┬─────┘ │                               │                 │
│ ┌─────┴─────┐ │                               │                 │
│ │  Prisma   │ │                               │                 │
│ │   ORM     │ │                               │                 │
│ └─────┬─────┘ │                               │                 │
└───────┼───────┘                               │                 │
        │                                       │                 │
        ▼                                       ▼                 ▼
┌───────────────┐                      ┌───────────────────────────────────┐
│   DATABASE    │                      │          REDIS 7                   │
│               │                      │          Port 6379                 │
│ ┌───────────┐ │                      │                                   │
│ │  SQLite   │ │◄─────────────────────│  Pub/Sub channels                 │
│ │  (local)  │ │                      │  Session store                    │
│ │  /db/     │ │                      │  Celery broker                    │
│ └───────────┘ │                      │  Rate limit counters              │
│ ┌───────────┐ │                      └───────────────────────────────────┘
│ │PostgreSQL │ │                               │
│ │  (prod)   │ │                               │
│ └───────────┘ │                               ▼
└───────────────┘                      ┌───────────────────────────────────┐
                                       │      FASTAPI + CELERY              │
┌─────────────────────────────────────┐│      Port 8000                     │
│          EXTERNAL SERVICES          ││                                   │
│                                     ││  ┌─────────────┐  ┌────────────┐ │
│  ┌──────────┐  ┌─────────────────┐ ││  │  Celery     │  │  FastAPI   │ │
│  │  Stripe  │  │   Razorpay     │ ││  │  Workers    │  │  REST API  │ │
│  │  API     │  │   API          │ ││  └─────────────┘  └────────────┘ │
│  └──────────┘  └─────────────────┘ │└───────────────────────────────────┘
│  ┌──────────┐  ┌─────────────────┐ │
│  │  Resend  │  │   Google       │ │  ┌───────────────────────────────────┐
│  │  Email   │  │   OAuth        │ │  │          MAILPIT                   │
│  └──────────┘  └─────────────────┘ │  │   SMTP: 1025  ·  Web: 8025       │
│  ┌──────────┐  ┌─────────────────┐ │  │   (Dev email capture)             │
│  │  Nodemail│  │   Prometheus   │ │  └───────────────────────────────────┘
│  │  SMTP    │  │   + Grafana    │ │
│  └──────────┘  └─────────────────┘ │
└─────────────────────────────────────┘
```

### 1.2 Service Dependency Graph

```
  Browser
    │
    ├──► Next.js (3000) ──► Prisma ──► SQLite
    │         │                         ▲
    │         ├──► Redis (6379) ────────┘
    │         │         ▲
    │         │         │
    │         ├──► Realtime Svc (3003) ──┘
    │         │
    │         ├──► Proxy Svc (3001) ──► External APIs
    │         │
    │         ├──► FastAPI (8000) ──► Celery ──► Redis
    │         │
    │         ├──► Stripe / Razorpay
    │         │
    │         └──► Resend / Nodemailer ──► Mailpit (1025)
    │
    └──► Socket.IO Client ──► Realtime Svc (3003) ──► Redis
```

---

## 2. Service Architecture

### 2.1 Service Registry

| Service | Port | Technology | Role | Health Check |
|---------|------|------------|------|-------------|
| **Next.js App** | 3000 | Next.js 16 + React 19 | Primary web server, SSR, API routes, auth | `GET /api/health` |
| **Proxy Service** | 3001 | Bun + Hono | HTTP proxy for external API requests, CORS handling | `GET /health` |
| **Realtime Service** | 3003 | Bun + Socket.IO | WebSocket connections, Redis pub/sub adapter, event broadcasting | `GET /health` |
| **PostgreSQL** | 5432 | PostgreSQL 16 | Production-grade relational database | TCP connection check |
| **Redis** | 6379 | Redis 7 | Pub/sub, session store, Celery broker, rate limiting | `PING` |
| **FastAPI** | 8000 | Python 3.11+ | Background task execution, Celery worker management | `GET /health` |
| **Mailpit Web** | 8025 | Mailpit | Dev email inbox UI for testing OTP/magic links | HTTP 200 |
| **Mailpit SMTP** | 1025 | Mailpit | SMTP server capturing outbound emails in dev | TCP check |
| **Prisma Studio** | 5555 | Prisma | Database GUI for inspecting/editing records | HTTP 200 |

### 2.2 Next.js Application (Port 3000)

**Role**: The monolithic core of AcquisitionOS — serves all pages, handles SSR/RSC rendering, processes API requests, and orchestrates business logic.

```
src/
├── app/                          # App Router (pages + API routes)
│   ├── (auth)/                   # Auth route group (login, signup, verify)
│   ├── (dashboard)/              # Protected dashboard route group
│   ├── api/                      # API routes (122+ endpoints)
│   │   ├── auth/                 #   Authentication endpoints
│   │   ├── payments/             #   Stripe & Razorpay endpoints
│   │   ├── webhooks/             #   Webhook receivers
│   │   ├── health/               #   Health check endpoints
│   │   └── ...                   #   Feature-specific APIs
│   ├── layout.tsx                # Root layout (providers, fonts, metadata)
│   └── page.tsx                  # Landing / dashboard page
│
├── components/                   # React components (101 total)
│   ├── ui/                       #   shadcn/ui primitives (49 components)
│   ├── dashboard/                #   Dashboard feature components (52)
│   ├── auth/                     #   Auth forms & guards
│   └── shared/                   #   Reusable across features
│
├── hooks/                        # Custom React hooks (11)
│   ├── use-auth.ts               #   Auth state & actions
│   ├── use-realtime.ts           #   SSE / Socket.IO subscription
│   └── ...
│
└── lib/                          # Business logic (90+ services)
    ├── db.ts                     #   Prisma client singleton
    ├── auth/                     #   JWT, OTP, OAuth, MFA logic
    ├── payments/                 #   Stripe, Razorpay integrations
    ├── email/                    #   Resend, Nodemailer, templates
    ├── realtime/                 #   SSE manager, event bus
    └── utils/                    #   Validators, formatters, helpers
```

**Key API Route Categories**:

| Category | Prefix | Count | Description |
|----------|--------|-------|-------------|
| Auth | `/api/auth/*` | ~15 | Login, signup, OTP, OAuth, magic link, MFA, refresh |
| Payments | `/api/payments/*` | ~8 | Checkout, subscriptions, invoices, portal |
| Webhooks | `/api/webhooks/*` | ~4 | Stripe, Razorpay, generic |
| Users | `/api/users/*` | ~6 | Profile, settings, preferences |
| Admin | `/api/admin/*` | ~10 | User management, analytics, config |
| Health | `/api/health` | ~3 | Liveness, readiness, metrics |
| Features | `/api/[feature]/*` | ~76 | Domain-specific CRUD + actions |

### 2.3 Proxy Service (Port 3001)

**Role**: HTTP proxy for making external API calls from the browser while avoiding CORS issues and hiding API keys.

```
mini-services/proxy/
├── package.json        # Independent bun project
├── index.ts            # Entry point (bun --hot)
└── routes/
    └── proxy.ts        # Proxy route handler
```

**Flow**:
```
Browser → fetch("/api/proxy?XTransformPort=3001", {
  body: JSON.stringify({ url, method, headers, body })
}) → Proxy Service → External API → Response back to browser
```

**When to use**: When frontend needs to call a third-party API (e.g., Google Places, analytics) and CORS or key exposure is a concern.

### 2.4 Realtime Service (Port 3003)

**Role**: Persistent WebSocket connections for live updates — notifications, chat, dashboards, collaborative editing.

```
mini-services/realtime-service/
├── package.json           # Independent bun project
├── index.ts               # Socket.IO server entry (bun --hot)
├── socket-handler.ts      # Connection/disconnect logic
├── rooms.ts               # Room/channel management
└── events.ts              # Event type definitions
```

**Architecture**:
```
┌──────────┐    WebSocket     ┌─────────────────────┐
│  Browser │◄───────────────►│  Socket.IO Server    │
│  Client  │  io("/?XTransformPort=3003")            │
└──────────┘                  │                      │
                              │  ┌────────────────┐  │
┌──────────┐    WebSocket     │  │ Redis Adapter   │  │──► Redis (6379)
│  Browser │◄───────────────►│  │ (pub/sub)      │  │
│  Client  │                  │  └────────────────┘  │
└──────────┘                  └─────────────────────┘
                                       ▲
                                       │ emit() / broadcast
                                       │
                              ┌────────┴────────┐
                              │  Next.js API     │
                              │  (port 3000)     │
                              │  → redisClient   │
                              │    .publish()    │
                              └─────────────────┘
```

**Connection Protocol**:
1. Client connects: `io("/?XTransformPort=3003")`
2. Caddy upgrades connection → forwards to port 3003
3. Server authenticates via JWT in handshake query
4. Server joins user to personal room: `user:{userId}`
5. Server joins user to org rooms: `org:{orgId}`
6. Events flow: API route → Redis publish → Socket.IO broadcast → client

### 2.5 Redis (Port 6379)

**Role**: Multi-purpose infrastructure component.

| Use Case | Key Pattern | Description |
|----------|-------------|-------------|
| Pub/Sub | Channel: `acq:events:*` | Realtime event broadcasting to Socket.IO |
| Session Store | `sess:{sessionId}` | User session data with TTL |
| Rate Limiting | `rl:{ip}:{endpoint}` | Sliding window counters |
| Celery Broker | `celery-task-meta-*` | Task queue for background jobs |
| OTP Store | `otp:{email}` | Time-limited OTP codes (5 min TTL) |
| Magic Link | `ml:{token}` | One-time magic link tokens (15 min TTL) |
| Refresh Token | `rt:{userId}:{deviceId}` | Refresh token validation |

### 2.6 FastAPI + Celery (Port 8000)

**Role**: Optional Python backend for CPU-intensive or long-running background tasks.

```
backend/
├── main.py                 # FastAPI app entry
├── celery_app.py           # Celery configuration
├── tasks/
│   ├── emails.py           # Bulk email sending
│   ├── reports.py          # PDF/CSV report generation
│   ├── analytics.py        # Data aggregation pipelines
│   └── imports.py          # Large CSV/data imports
├── requirements.txt
└── Dockerfile
```

**Task Queue Flow**:
```
Next.js API → POST http://localhost:8000/tasks/enqueue
                    │
                    ▼
              FastAPI → celery_app.send_task()
                    │
                    ▼
              Redis Broker → Celery Worker picks up task
                    │
                    ▼
              Worker executes → Result stored in Redis
                    │
                    ▼
              Next.js polls /tasks/{id}/status (or Redis pub/sub notification)
```

### 2.7 Mailpit (SMTP 1025 / Web 8025)

**Role**: Local SMTP server that captures all outbound emails for development testing.

**Configuration**:
- Next.js `EMAIL_PROVIDER=console` → emails logged to stdout only
- Next.js `EMAIL_PROVIDER=smtp` → emails sent to `localhost:1025` → captured by Mailpit
- Browse captured emails at `http://localhost:8025`

---

## 3. Data Flow Diagrams

### 3.1 Authentication Flow

#### 3.1.1 Email + Password Signup

```
  Client                              Next.js API                        Database / Redis
    │                                      │                                  │
    │  POST /api/auth/signup               │                                  │
    │  { name, email, password }           │                                  │
    │─────────────────────────────────────►│                                  │
    │                                      │                                  │
    │                                      │  1. Validate input                │
    │                                      │  2. Check email uniqueness        │
    │                                      │     db.user.findUnique()          │
    │                                      │──────────────────────────────────►│
    │                                      │                                  │
    │                                      │  3. Hash password (bcrypt, 12)   │
    │                                      │  4. Create user + generate OTP    │
    │                                      │     db.user.create()              │
    │                                      │──────────────────────────────────►│
    │                                      │                                  │
    │                                      │  5. Store OTP in Redis            │
    │                                      │     SET otp:{email} TTL=300s      │
    │                                      │──────────────────────────────────►│
    │                                      │                                  │
    │                                      │  6. Send verification email       │
    │                                      │     Resend / SMTP → Mailpit       │
    │                                      │──────────────────┐                │
    │                                      │                  │                │
    │  202 { message: "OTP sent" }         │                  ▼                │
    │◄─────────────────────────────────────│           Email Service           │
    │                                      │                                  │
    │  POST /api/auth/verify-otp           │                                  │
    │  { email, otp }                      │                                  │
    │─────────────────────────────────────►│                                  │
    │                                      │  7. Validate OTP from Redis       │
    │                                      │──────────────────────────────────►│
    │                                      │                                  │
    │                                      │  8. Mark email verified           │
    │                                      │     db.user.update()              │
    │                                      │──────────────────────────────────►│
    │                                      │                                  │
    │                                      │  9. Generate JWT pair             │
    │                                      │     access (15m) + refresh (30d) │
    │                                      │                                  │
    │  Set-Cookie: accessToken (httpOnly)   │                                  │
    │  Set-Cookie: refreshToken (httpOnly)  │                                  │
    │  200 { user, accessToken }           │                                  │
    │◄─────────────────────────────────────│                                  │
    │                                      │                                  │
```

#### 3.1.2 Email + Password Login

```
  Client                              Next.js API                        Database / Redis
    │                                      │                                  │
    │  POST /api/auth/login                │                                  │
    │  { email, password }                 │                                  │
    │─────────────────────────────────────►│                                  │
    │                                      │                                  │
    │                                      │  1. Find user by email            │
    │                                      │──────────────────────────────────►│
    │                                      │                                  │
    │                                      │  2. Compare bcrypt hash           │
    │                                      │                                  │
    │                                      │  3. Check MFA enabled?            │
    │                                      │     ┌──────────────────┐         │
    │                                      │     │ YES: Generate     │         │
    │                                      │     │ TOTP challenge    │         │
    │                                      │     │ Return 202 MFA    │         │
    │                                      │     └──────────────────┘         │
    │                                      │     ┌──────────────────┐         │
    │                                      │     │ NO: Generate JWT  │         │
    │                                      │     │ Return 200 OK     │         │
    │                                      │     └──────────────────┘         │
    │                                      │                                  │
    │                                      │  4. Device fingerprint check      │
    │                                      │     (new device → email alert)    │
    │                                      │                                  │
    │  Set-Cookie: accessToken + refresh    │                                  │
    │  200 { user } | 202 { mfaRequired }  │                                  │
    │◄─────────────────────────────────────│                                  │
```

#### 3.1.3 Google OAuth Flow

```
  Client                    Next.js API              Google OAuth         Database
    │                          │                        │                   │
    │  GET /api/auth/google    │                        │                   │
    │─────────────────────────►│                        │                   │
    │                          │                        │                   │
    │  302 → Google Auth URL   │                        │                   │
    │◄─────────────────────────│                        │                   │
    │                          │                        │                   │
    │  User authorizes on Google                        │                   │
    │──────────────────────────────────────────────────►│                   │
    │                          │                        │                   │
    │  302 → /api/auth/google/callback?code=xxx         │                   │
    │◄─────────────────────────────────────────────────│                   │
    │                          │                        │                   │
    │  GET /api/auth/google/callback?code=xxx           │                   │
    │─────────────────────────►│                        │                   │
    │                          │                        │                   │
    │                          │  Exchange code → token │                   │
    │                          │───────────────────────►│                   │
    │                          │                        │                   │
    │                          │  Get user profile      │                   │
    │                          │───────────────────────►│                   │
    │                          │  { sub, email, name, picture }              │
    │                          │◄───────────────────────│                   │
    │                          │                        │                   │
    │                          │  Upsert user by Google ID                   │
    │                          │───────────────────────────────────────────►│
    │                          │                        │                   │
    │                          │  Generate JWT pair     │                   │
    │                          │                        │                   │
    │  Set-Cookie: tokens      │                        │                   │
    │  302 → /dashboard        │                        │                   │
    │◄─────────────────────────│                        │                   │
```

#### 3.1.4 Magic Link Flow

```
  Client                              Next.js API                   Redis / Email
    │                                      │                             │
    │  POST /api/auth/magic-link           │                             │
    │  { email }                           │                             │
    │─────────────────────────────────────►│                             │
    │                                      │                             │
    │                                      │  1. Generate token (uuid)    │
    │                                      │  2. Store in Redis           │
    │                                      │     SET ml:{token}          │
    │                                      │     { email, userId }       │
    │                                      │     TTL=900s (15 min)       │
    │                                      │────────────────────────────►│
    │                                      │                             │
    │                                      │  3. Send email with link    │
    │                                      │     {host}/auth/verify?token=xxx
    │                                      │────────────────────────────►│
    │                                      │                        Email Service
    │  200 { message: "Magic link sent" }  │                             │
    │◄─────────────────────────────────────│                             │
    │                                      │                             │
    │  ──── User clicks link in email ────                              │
    │                                      │                             │
    │  GET /api/auth/verify-magic          │                             │
    │  ?token=xxx                          │                             │
    │─────────────────────────────────────►│                             │
    │                                      │                             │
    │                                      │  4. Lookup token in Redis    │
    │                                      │────────────────────────────►│
    │                                      │                             │
    │                                      │  5. Delete token (one-time)  │
    │                                      │     DEL ml:{token}          │
    │                                      │────────────────────────────►│
    │                                      │                             │
    │                                      │  6. Generate JWT pair        │
    │                                      │                             │
    │  Set-Cookie: tokens                  │                             │
    │  302 → /dashboard                    │                             │
    │◄─────────────────────────────────────│                             │
```

### 3.2 Payment Flow

#### 3.2.1 Stripe Checkout → Subscription

```
  Client                   Next.js API              Stripe API            Database
    │                          │                       │                    │
    │  POST /api/payments/     │                       │                    │
    │  checkout                │                       │                    │
    │  { priceId, plan }      │                       │                    │
    │─────────────────────────►│                       │                    │
    │                          │                       │                    │
    │                          │  1. Get or create      │                    │
    │                          │     Stripe customer    │                    │
    │                          │──────────────────────►│                    │
    │                          │  { customerId }        │                    │
    │                          │◄──────────────────────│                    │
    │                          │                       │                    │
    │                          │  2. Create checkout    │                    │
    │                          │     session            │                    │
    │                          │──────────────────────►│                    │
    │                          │  { url, sessionId }    │                    │
    │                          │◄──────────────────────│                    │
    │                          │                       │                    │
    │  200 { checkoutUrl }     │                       │                    │
    │◄─────────────────────────│                       │                    │
    │                          │                       │                    │
    │  ──── Redirect to Stripe ──────────────────────►│                    │
    │  ──── User completes payment ──────────────────►│                    │
    │  ──── Redirect back to /billing?success=true ──►│                    │
    │                          │                       │                    │
    │                          │                       │                    │
    │                   WEBHOOK FLOW (async):           │                    │
    │                          │                       │                    │
    │                          │  POST /api/webhooks/  │                    │
    │                          │  stripe               │                    │
    │                          │◄──────────────────────│                    │
    │                          │  { type: event, data } │                    │
    │                          │                       │                    │
    │                          │  3. Verify signature   │                    │
    │                          │  4. Route by event     │                    │
    │                          │     type:              │                    │
    │                          │  ┌──────────────────┐ │                    │
    │                          │  │ checkout.session  │ │                    │
    │                          │  │ .completed        │ │                    │
    │                          │  │ → Create Payment  │ │                    │
    │                          │  │   Order record    │ │                    │
    │                          │  ├──────────────────┤ │                    │
    │                          │  │ customer.subscr   │ │                    │
    │                          │  │ iption.created    │ │                    │
    │                          │  │ → Create/update   │ │                    │
    │                          │  │   Subscription    │ │                    │
    │                          │  ├──────────────────┤ │                    │
    │                          │  │ customer.subscr   │ │                    │
    │                          │  │ iption.updated    │ │                    │
    │                          │  │ → Sync plan/      │ │                    │
    │                          │  │   status changes  │ │                    │
    │                          │  ├──────────────────┤ │                    │
    │                          │  │ customer.subscr   │ │                    │
    │                          │  │ iption.deleted    │ │                    │
    │                          │  │ → Cancel access   │ │                    │
    │                          │  ├──────────────────┤ │                    │
    │                          │  │ invoice.payment   │ │                    │
    │                          │  │ _failed           │ │                    │
    │                          │  │ → Dunning, notify │ │                    │
    │                          │  └──────────────────┘ │                    │
    │                          │                       │                    │
    │                          │  5. Update database    │                    │
    │                          │───────────────────────────────────────────►│
    │                          │                       │                    │
    │                          │  6. Emit realtime     │                    │
    │                          │     event (Redis)     │                    │
    │                          │───────────────────────────────────────────►│
    │                          │                       │            Redis Pub/Sub
    │                          │                       │                    │
    │                          │  200 { received: true }                    │
    │                          │──────────────────────►│                    │
    │                          │                       │                    │
    │  SSE / Socket.IO         │                       │                    │
    │  notification:           │                       │                    │
    │  "subscription_updated"  │                       │                    │
    │◄─────────────────────────│                       │                    │
```

#### 3.2.2 Dual Provider Architecture

```
                    ┌─────────────────────┐
                    │   Payment Router     │
                    │   (lib/payments/)    │
                    └─────────┬───────────┘
                              │
                    ┌─────────┴───────────┐
                    │  Detect currency /   │
                    │  region preference   │
                    └─────────┬───────────┘
                              │
               ┌──────────────┼──────────────┐
               │              │              │
               ▼              ▼              ▼
        ┌────────────┐ ┌────────────┐ ┌────────────┐
        │   Stripe   │ │  Razorpay  │ │   Manual   │
        │            │ │            │ │  (Admin)   │
        │ International│ India/INR │ │            │
        │  135+ currencies│ UPI     │ │  Bank xfer │
        │  Cards       │  Cards     │ │  Cash      │
        │  ACH/SEPA    │  Netbanking│ │  Cheque    │
        └──────┬───────┘ └──────┬────┘ └──────┬────┘
               │                │             │
               ▼                ▼             ▼
        ┌──────────────────────────────────────────┐
        │          PaymentOrder Model               │
        │  provider: stripe | razorpay | manual     │
        │  providerId: session_id | order_id | null │
        │  status: pending | completed | failed     │
        │  amount, currency, metadata               │
        └──────────────────────────────────────────┘
```

### 3.3 Email Flow

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                           EMAIL DISPATCH PIPELINE                             │
│                                                                              │
│  Trigger Sources:                                                            │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐  │
│  │   OTP    │  │  Magic   │  │ Welcome  │  │ Invoice  │  │ Notification │  │
│  │  Verify  │  │  Link    │  │  Email   │  │ Receipt  │  │  Alert       │  │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘  └──────┬───────┘  │
│       │              │              │              │               │          │
│       └──────────────┴──────────────┴──────────────┴───────────────┘          │
│                                     │                                        │
│                                     ▼                                        │
│                         ┌──────────────────────┐                             │
│                         │   Email Service       │                             │
│                         │   (lib/email/)        │                             │
│                         │                       │                             │
│                         │  Template rendering   │                             │
│                         │  (React Email → HTML) │                             │
│                         └──────────┬────────────┘                             │
│                                    │                                         │
│                         ┌──────────┴────────────┐                            │
│                         │  Provider Resolution   │                            │
│                         │  (based on env config) │                            │
│                         └──────────┬────────────┘                            │
│                                    │                                         │
│              ┌─────────────────────┼─────────────────────┐                   │
│              │                     │                     │                   │
│              ▼                     ▼                     ▼                   │
│     ┌────────────────┐   ┌────────────────┐   ┌────────────────┐           │
│     │    Resend      │   │   Nodemailer   │   │    Console     │           │
│     │    API         │   │    SMTP        │   │    (dev only)  │           │
│     │                │   │                │   │                │           │
│     │  EMAIL_PROVIDER│   │  EMAIL_PROVIDER│   │  EMAIL_PROVIDER│           │
│     │  = resend      │   │  = smtp        │   │  = console     │           │
│     │                │   │                │   │                │           │
│     │  → Resend API  │   │  → SMTP server │   │  → stdout     │           │
│     │  → Delivery     │   │  → Mailpit (dev)│  │  → terminal   │           │
│     │  → Webhooks     │   │  → Real SMTP   │   │                │           │
│     └────────────────┘   └────────────────┘   └────────────────┘           │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Fallback Chain**:
```
Resend API ──(failure)──► Nodemailer SMTP ──(failure)──► Console log
   │                           │                            │
   │  Network error            │  Connection refused        │  Always succeeds
   │  Rate limited             │  Auth failed               │  (dev safety net)
   │  API key invalid          │  TLS error                 │
```

### 3.4 Realtime Event Flow

```
┌──────────────────────────────────────────────────────────────────────────┐
│                        REALTIME EVENT PIPELINE                            │
│                                                                          │
│  Event Producers                    Event Transport          Consumers    │
│                                                                          │
│  ┌───────────────┐                                                      │
│  │  API Route    │                                                      │
│  │  (mutation)   │──────┐                                               │
│  └───────────────┘      │        ┌─────────────────┐    ┌─────────────┐  │
│  ┌───────────────┐      ├───►    │  Event Bus       │    │  Browser    │  │
│  │  Webhook      │      │        │  (Redis pub/sub) │───►│  Client A   │  │
│  │  Handler      │──────┤        │                  │    │  (SSE/SIO)  │  │
│  └───────────────┘      │        │  Channels:       │    └─────────────┘  │
│  ┌───────────────┐      │        │  acq:user:{id}   │    ┌─────────────┐  │
│  │  Background   │      │        │  acq:org:{id}    │───►│  Browser    │  │
│  │  Job Result   │──────┤        │  acq:global      │    │  Client B   │  │
│  └───────────────┘      │        └────────┬────────┘    │  (SSE/SIO)  │  │
│  ┌───────────────┐      │                 │             └─────────────┘  │
│  │  Admin Action │──────┘                 │                               │
│  └───────────────┘                        │                               │
│                                           │                               │
│                              ┌────────────┴────────────┐                  │
│                              │                         │                  │
│                              ▼                         ▼                  │
│                    ┌──────────────────┐     ┌──────────────────┐          │
│                    │  SSE (in-process) │     │  Socket.IO Svc   │          │
│                    │  Port 3000        │     │  Port 3003        │          │
│                    │                   │     │                    │          │
│                    │  For:             │     │  For:              │          │
│                    │  • Simple notifs  │     │  • Chat            │          │
│                    │  • Status updates │     │  • Live dashboards │          │
│                    │  • One-way data   │     │  • Collaborative   │          │
│                    │                   │     │  • Bidirectional   │          │
│                    └──────────────────┘     └──────────────────┘          │
└──────────────────────────────────────────────────────────────────────────┘
```

**Event Replay Strategy**:
```
Client reconnects
    │
    ├──► SSE: Client sends Last-Event-ID header
    │         Server replays missed events from buffer (last 100 per channel)
    │
    └──► Socket.IO: Client connects with lastEventId in auth
              Server fetches missed events from Redis stream
              Emits 'missed_events' array to client
```

---

## 4. Database Architecture

### 4.1 Entity-Relationship Summary

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CORE ENTITIES                                   │
│                                                                             │
│  ┌──────────┐     1:N     ┌──────────┐     1:N     ┌──────────────┐       │
│  │   User   │────────────►│  Account │             │  Session     │       │
│  │──────────│             │──────────│             │──────────────│       │
│  │ id       │             │ id       │             │ id           │       │
│  │ email    │             │ provider │             │ userId       │       │
│  │ name     │             │ provider │             │ sessionToken │       │
│  │ password │             │ AccountId│             │ expires      │       │
│  │ role     │             │ userId   │             └──────┬───────┘       │
│  │ mfaEnabled│            │ tokens   │                    │               │
│  │ emailVer.│             └──────────┘                    │               │
│  └────┬─────┘                                             │               │
│       │                                                   │               │
│       │ 1:N                                               │               │
│       ▼                                                   │               │
│  ┌──────────────┐    N:1    ┌──────────────┐              │               │
│  │ Subscription │◄──────────│ PaymentOrder │◄─────────────┘               │
│  │──────────────│           │──────────────│                              │
│  │ id           │           │ id           │                              │
│  │ userId       │           │ userId       │                              │
│  │ plan         │           │ provider     │                              │
│  │ status       │           │ providerId   │                              │
│  │ stripeSubId  │           │ amount       │                              │
│  │ currentPeriod│           │ currency     │                              │
│  │ expiresAt    │           │ status       │                              │
│  └──────────────┘           │ metadata     │                              │
│                             └──────────────┘                              │
│                                                                          │
│  ┌──────────────┐     1:N    ┌──────────────┐     1:N    ┌────────────┐  │
│  │Organization  │───────────►│  Member      │           │  Project    │  │
│  │──────────────│            │──────────────│           │────────────│  │
│  │ id           │            │ id           │           │ id         │  │
│  │ name         │            │ userId       │           │ orgId      │  │
│  │ slug         │            │ orgId        │           │ name       │  │
│  │ plan         │            │ role         │           │ status     │  │
│  └──────────────┘            │ joinedAt     │           │ metadata   │  │
│                              └──────────────┘           └──────┬─────┘  │
│                                                                │        │
│                                                                │ 1:N    │
│                                                                ▼        │
│  ┌──────────────┐    1:N    ┌──────────────┐     1:N  ┌────────────┐  │
│  │ Notification │           │    Audit     │         │  Activity  │  │
│  │──────────────│           │    Log       │         │  Log       │  │
│  │ id           │           │──────────────│         │────────────│  │
│  │ userId       │           │ id           │         │ id         │  │
│  │ type         │           │ userId       │         │ projectId  │  │
│  │ title        │           │ action       │         │ type       │  │
│  │ read         │           │ resource     │         │ data       │  │
│  │ createdAt    │           │ timestamp    │         │ timestamp  │  │
│  └──────────────┘           └──────────────┘         └────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 SQLite vs PostgreSQL

| Aspect | SQLite (Local Dev) | PostgreSQL 16 (Production) |
|--------|--------------------|-----------------------------|
| **File** | `/db/dev.db` (single file) | Hosted instance, port 5432 |
| **Migrations** | `bun run db:push` (schema push) | `prisma migrate deploy` |
| **Concurrency** | Single-writer, WAL mode | Multi-writer, MVCC |
| **JSON Support** | `json()` extension | Native `jsonb` with indexing |
| **Full-Text** | FTS5 extension | `tsvector` + GIN indexes |
| **Arrays** | Not supported (use JSON) | Native array types |
| **Connection** | File path string | Connection pool URL |
| **Prisma URL** | `file:./dev.db` | `postgresql://user:pass@host:5432/db` |
| **Inspection** | Prisma Studio (port 5555) | `psql` or Prisma Studio |

### 4.3 Prisma ORM Layer

```
┌───────────────────────────────────────────────────────────┐
│                    APPLICATION CODE                        │
│                                                           │
│   API Routes · Services · Server Actions · Middleware     │
└──────────────────────────┬────────────────────────────────┘
                           │
                           │  import { db } from '@/lib/db'
                           │
                           ▼
┌───────────────────────────────────────────────────────────┐
│                   PRISMA CLIENT                           │
│                                                           │
│   ┌────────────────┐   ┌──────────────┐                  │
│   │ Query Builder  │   │  Type Gen    │                  │
│   │ (CRUD, filters)│   │  (auto types)│                  │
│   └───────┬────────┘   └──────────────┘                  │
│           │                                               │
│   ┌───────┴────────┐   ┌──────────────┐                  │
│   │  Middleware     │   │  Logger      │                  │
│   │  (soft-delete,  │   │  (query log) │                  │
│   │   audit trail)  │   └──────────────┘                  │
│   └───────┬────────┘                                     │
└───────────┼───────────────────────────────────────────────┘
            │
            │  Generated SQL
            │
            ▼
┌───────────────────────────────────────────────────────────┐
│                  DATABASE ENGINE                          │
│         SQLite (dev)  ·  PostgreSQL (prod)                │
└───────────────────────────────────────────────────────────┘
```

**Singleton Pattern** (prevents connection exhaustion in dev):
```typescript
// src/lib/db.ts
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { db: PrismaClient }

export const db = globalForPrisma.db ?? new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
})

if (process.env.NODE_ENV !== 'production') globalForPrisma.db = db
```

---

## 5. Authentication Architecture

### 5.1 JWT Token Flow

```
┌──────────────────────────────────────────────────────────────────────────┐
│                         TOKEN LIFECYCLE                                   │
│                                                                          │
│  LOGIN                                                                    │
│  ─────                                                                    │
│  Credentials ──► Validate ──► Generate Token Pair                        │
│                               ┌──────────────────────────────────┐       │
│                               │  Access Token (JWT)              │       │
│                               │  ┌────────────────────────────┐  │       │
│                               │  │ Header: { alg: RS256 }    │  │       │
│                               │  │ Payload: {                 │  │       │
│                               │  │   sub: userId,             │  │       │
│                               │  │   email,                   │  │       │
│                               │  │   role,                    │  │       │
│                               │  │   orgId,                   │  │       │
│                               │  │   deviceId,                │  │       │
│                               │  │   iat, exp (15 min)        │  │       │
│                               │  │ }                          │  │       │
│                               │  └────────────────────────────┘  │       │
│                               │  Stored: httpOnly cookie         │       │
│                               │  Path: /                         │       │
│                               │  SameSite: Lax                   │       │
│                               │  Secure: true (prod)             │       │
│                               └──────────────────────────────────┘       │
│                                                                          │
│                               ┌──────────────────────────────────┐       │
│                               │  Refresh Token (JWT)             │       │
│                               │  ┌────────────────────────────┐  │       │
│                               │  │ Payload: {                 │  │       │
│                               │  │   sub: userId,             │  │       │
│                               │  │   deviceId,                │  │       │
│                               │  │   tokenVersion,            │  │       │
│                               │  │   iat, exp (30 days)       │  │       │
│                               │  │ }                          │  │       │
│                               │  └────────────────────────────┘  │       │
│                               │  Stored: httpOnly cookie         │       │
│                               │  Path: /api/auth/refresh         │       │
│                               │  Also stored in Redis for       │       │
│                               │  validation: rt:{userId}:{devId} │       │
│                               └──────────────────────────────────┘       │
│                                                                          │
│  REFRESH                                                                  │
│  ──────                                                                   │
│  Access token expired                                                     │
│       │                                                                   │
│       ▼                                                                   │
│  Client → POST /api/auth/refresh                                         │
│       │  (refresh cookie sent automatically — scoped path)                │
│       ▼                                                                   │
│  Server validates refresh token ──► Redis lookup ──► Generate new pair   │
│       │                                                                   │
│       ▼                                                                   │
│  Rotate both tokens, invalidate old refresh in Redis                      │
│                                                                          │
│  LOGOUT                                                                   │
│  ──────                                                                   │
│  Client → POST /api/auth/logout                                          │
│       │                                                                   │
│       ▼                                                                   │
│  Delete cookies + Delete Redis refresh token + Increment tokenVersion     │
│  (tokenVersion increment invalidates ALL existing refresh tokens)         │
└──────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Middleware Auth Guard

```
┌───────────────────────────────────────────────────────────────────┐
│                     MIDDLEWARE EXECUTION ORDER                     │
│                                                                   │
│  Incoming Request                                                 │
│       │                                                           │
│       ▼                                                           │
│  ┌─────────────────┐                                              │
│  │  CORS Check     │  ← Reject cross-origin violations           │
│  └────────┬────────┘                                              │
│           ▼                                                       │
│  ┌─────────────────┐                                              │
│  │  Rate Limiter   │  ← Redis sliding window per IP+endpoint      │
│  └────────┬────────┘                                              │
│           ▼                                                       │
│  ┌─────────────────┐                                              │
│  │  Route Matcher  │  ← Is this a protected route?                │
│  └────────┬────────┘                                              │
│           │                                                       │
│     ┌─────┴─────┐                                                 │
│     │           │                                                 │
│  Public      Protected                                            │
│     │           │                                                 │
│     │           ▼                                                 │
│     │    ┌─────────────────┐                                      │
│     │    │  Extract Token  │  ← From httpOnly cookie              │
│     │    └────────┬────────┘                                      │
│     │             │                                               │
│     │        ┌────┴────┐                                          │
│     │     Valid      Invalid                                      │
│     │        │           │                                        │
│     │        ▼           ▼                                        │
│     │    Continue    401 + Clear cookies                          │
│     │    with user                                             │
│     │    in request                                             │
│     │                                                           │
│     ▼                                                           │
│  ┌─────────────────┐                                             │
│  │  RBAC Check     │  ← Does user.role allow this action?       │
│  └────────┬────────┘                                             │
│           │                                                      │
│      ┌────┴────┐                                                 │
│   Allowed   Denied                                               │
│      │         │                                                 │
│      ▼         ▼                                                 │
│   Handler   403 Forbidden                                        │
└───────────────────────────────────────────────────────────────────┘
```

### 5.3 Role-Based Access Control (RBAC)

| Role | Level | Permissions |
|------|-------|-------------|
| **superadmin** | System | All permissions + manage tenants + system config |
| **admin** | Organization | Manage members, billing, org settings, all project CRUD |
| **manager** | Project | Create/edit/delete projects, manage team assignments |
| **member** | Project | Read projects, create items, edit own items |
| **viewer** | Organization | Read-only access to assigned projects |

**Permission Check Pattern**:
```
API Route Handler
    │
    ├── requireAuth(request)           → Returns user or throws 401
    ├── requireRole(user, 'admin')     → Returns void or throws 403
    ├── requireOrgMember(user, orgId)  → Returns membership or throws 403
    └── requirePermission(user, 'billing:write') → Returns void or throws 403
```

### 5.4 Multi-Factor Authentication (MFA)

```
┌────────────────────────────────────────────────────────────────┐
│                    MFA FLOW (TOTP)                              │
│                                                                │
│  SETUP:                                                        │
│  ┌──────────┐    POST /api/auth/mfa/setup     ┌────────────┐  │
│  │  User    │────────────────────────────────►│  Generate   │  │
│  │          │                                 │  TOTP Secret│  │
│  │          │◄────────────────────────────────│  + QR Code  │  │
│  │          │   { qrCode, secret, backupCodes }│            │  │
│  └──────────┘                                  └────────────┘  │
│       │                                                        │
│       │  User adds to authenticator app                         │
│       │                                                        │
│       │  POST /api/auth/mfa/verify-setup                        │
│       │  { totpCode: "123456" }                                 │
│       │───────────────────────────────────────────────────────► │
│       │                                                         │
│       │  Validate TOTP → Enable MFA on user record             │
│       │  Store encrypted backup codes                           │
│       │                                                         │
│  LOGIN:                                                        │
│       │  Password verified → MFA required → 202 { mfaRequired} │
│       │                                                         │
│       │  POST /api/auth/mfa/challenge                           │
│       │  { totpCode: "123456" } OR { backupCode: "xxxx-xxxx" } │
│       │───────────────────────────────────────────────────────► │
│       │                                                         │
│       │  Validate → Issue JWT tokens → 200 OK                  │
│                                                                │
│  RECOVERY:                                                     │
│  Each backup code is single-use. After using all 10,           │
│  user must re-generate via /api/auth/mfa/backup-codes/regen    │
└────────────────────────────────────────────────────────────────┘
```

---

## 6. Payment Architecture

### 6.1 Dual Provider System

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      PAYMENT ABSTRACTION LAYER                           │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                   PaymentService (interface)                     │    │
│  │                                                                  │    │
│  │  createCheckout(params) → { url, sessionId }                     │    │
│  │  createSubscription(params) → { subscriptionId }                 │    │
│  │  cancelSubscription(id) → { status }                             │    │
│  │  updatePaymentMethod(id, pm) → { status }                        │    │
│  │  getInvoices(userId) → Invoice[]                                 │    │
│  │  handleWebhook(signature, body) → WebhookResult                  │    │
│  │  getPortalUrl(userId) → { url }                                  │    │
│  └──────────────────────────┬──────────────────────────────────────┘    │
│                             │                                           │
│              ┌──────────────┼──────────────┐                            │
│              │                             │                            │
│              ▼                             ▼                            │
│  ┌─────────────────────┐     ┌─────────────────────┐                   │
│  │  StripeProvider     │     │  RazorpayProvider    │                   │
│  │─────────────────────│     │─────────────────────│                   │
│  │ checkout.sessions   │     │ orders.create        │                   │
│  │ subscriptions       │     │ subscriptions        │                   │
│  │ customers           │     │ payments             │                   │
│  │ invoices            │     │ refunds              │                   │
│  │ payment_intents     │     │ settlements          │                   │
│  │ webhooks            │     │ webhooks             │                   │
│  └─────────────────────┘     └─────────────────────┘                   │
└─────────────────────────────────────────────────────────────────────────┘
```

### 6.2 Provider Selection Logic

```
┌──────────────────────────────────────────────────────────┐
│               PROVIDER ROUTING DECISION                   │
│                                                          │
│  Input: { currency, country, amount, userId }            │
│                                                          │
│  ┌───────────────┐                                       │
│  │ Currency = INR│──► Razorpay (UPI, NetBanking, Cards)  │
│  │ Country = IN  │                                       │
│  └───────┬───────┘                                       │
│          │                                               │
│          │ (else)                                        │
│          ▼                                               │
│  ┌───────────────┐                                       │
│  │ User Pref =   │──► Preferred provider                 │
│  │   stripe/rzp  │                                       │
│  └───────┬───────┘                                       │
│          │                                               │
│          │ (no pref)                                     │
│          ▼                                               │
│  ┌───────────────┐                                       │
│  │ Default =     │──► Stripe                             │
│  │   stripe      │                                       │
│  └───────────────┘                                       │
└──────────────────────────────────────────────────────────┘
```

### 6.3 Subscription Lifecycle

```
                    ┌──────────┐
                    │  FREE    │
                    │  TIER    │
                    └────┬─────┘
                         │ Upgrade
                         ▼
                    ┌──────────┐     Trial     ┌──────────┐
                    │  TRIAL   │──────────────►│  ACTIVE  │
                    │  (14d)   │              │          │
                    └──────────┘              └────┬─────┘
                         │                         │
                         │ Cancel                  │ Past Due
                         ▼                         ▼
                    ┌──────────┐              ┌──────────┐
                    │CANCELLED │              │ PAST_DUE │
                    │ (period  │              │ (retry   │
                    │  ends)   │              │  3x)     │
                    └────┬─────┘              └────┬─────┘
                         │                         │ Payment failed
                         │ Reactivate              │ after retries
                         ▼                         ▼
                    ┌──────────┐              ┌──────────┐
                    │  ACTIVE  │              │ EXPIRED  │
                    │          │              │          │
                    └──────────┘              └──────────┘
```

### 6.4 Webhook Signature Verification

```
Stripe Webhook:
  1. Read raw body (do NOT parse JSON first)
  2. Get stripe-signature header
  3. stripe.webhooks.constructEvent(body, sig, webhookSecret)
  4. If invalid → 400 Bad Request

Razorpay Webhook:
  1. Read raw body
  2. Get X-Razorpay-Signature header
  3. HMAC-SHA256(body, webhookSecret)
  4. Compare signatures (timing-safe)
  5. If invalid → 400 Bad Request
```

---

## 7. Realtime Architecture

### 7.1 Transport Comparison

| Feature | SSE (In-Process) | Socket.IO (Mini-Service) |
|---------|-------------------|--------------------------|
| **Port** | 3000 (same as Next.js) | 3003 (dedicated) |
| **Direction** | Server → Client only | Bidirectional |
| **Protocol** | HTTP (text/event-stream) | WebSocket (upgraded HTTP) |
| **Reconnection** | Auto (browser built-in) | Auto (Socket.IO client) |
| **Event Replay** | Last-Event-ID header | Custom auth.lastEventId |
| **Rooms/Channels** | Manual per-connection | Built-in room support |
| **Binary Data** | Not supported | Supported |
| **Max Connections** | Limited by Next.js server | Dedicated process, higher |
| **Use Case** | Notifications, status | Chat, collaboration, dashboards |
| **Caddy Routing** | Default (no XTransformPort) | `?XTransformPort=3003` |

### 7.2 SSE Implementation (In-Process)

```
┌──────────────────────────────────────────────────────────────┐
│                    SSE WITHIN NEXT.JS                         │
│                                                              │
│  Client                          Next.js (port 3000)         │
│    │                                  │                      │
│    │  GET /api/events/stream          │                      │
│    │  Cookie: accessToken             │                      │
│    │─────────────────────────────────►│                      │
│    │                                  │                      │
│    │                                  │  Validate auth       │
│    │                                  │  Subscribe to        │
│    │                                  │  EventManager        │
│    │                                  │                      │
│    │  Content-Type: text/event-stream │                      │
│    │◄─────────────────────────────────│                      │
│    │                                  │                      │
│    │  data: {"type":"notification",...}│                     │
│    │◄─────────────────────────────────│                      │
│    │                                  │                      │
│    │  data: {"type":"payment_update"}│                       │
│    │◄─────────────────────────────────│                      │
│    │                                  │                      │
│    │  (connection stays open)         │                      │
│                                                              │
│  EventManager (singleton in Next.js process):                │
│  ┌──────────────────────────────────────────────────┐        │
│  │  subscribers: Map<userId, Set<Response>>         │        │
│  │  eventBuffer: Map<channel, CircularBuffer<100>>  │        │
│  │                                                    │        │
│  │  subscribe(userId, res) → adds to subscribers     │        │
│  │  unsubscribe(userId, res) → removes               │        │
│  │  emit(channel, event) → sends to all subscribers  │        │
│  │  replay(channel, lastEventId) → buffered events   │        │
│  └──────────────────────────────────────────────────┘        │
└──────────────────────────────────────────────────────────────┘
```

### 7.3 Socket.IO Implementation (Mini-Service)

```
┌──────────────────────────────────────────────────────────────────┐
│                 SOCKET.IO MINI-SERVICE (PORT 3003)                │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐     │
│  │                    Socket.IO Server                      │     │
│  │                                                          │     │
│  │  Adapter: Redis (@socket.io/redis-adapter)               │     │
│  │  ┌──────────────┐  ┌──────────────┐                     │     │
│  │  │ redisClient  │  │ subClient    │                     │     │
│  │  │ (publish)    │  │ (subscribe)  │                     │     │
│  │  └──────────────┘  └──────────────┘                     │     │
│  │                                                          │     │
│  │  Auth Middleware:                                         │     │
│  │  ┌──────────────────────────────────────────────────┐   │     │
│  │  │  socket.handshake.auth.token → verify JWT         │   │     │
│  │  │  → attach socket.data.user = { id, role, orgId }  │   │     │
│  │  └──────────────────────────────────────────────────┘   │     │
│  │                                                          │     │
│  │  Room Management:                                        │     │
│  │  ┌──────────────────────────────────────────────────┐   │     │
│  │  │  On connect:                                      │   │     │
│  │  │    socket.join(`user:${userId}`)                  │   │     │
│  │  │    socket.join(`org:${orgId}`)                    │   │     │
│  │  │    socket.join(`role:${role}`)                    │   │     │
│  │  │                                                    │   │     │
│  │  │  On project open:                                 │   │     │
│  │  │    socket.join(`project:${projectId}`)            │   │     │
│  │  │                                                    │   │     │
│  │  │  On project close:                                │   │     │
│  │  │    socket.leave(`project:${projectId}`)           │   │     │
│  │  └──────────────────────────────────────────────────┘   │     │
│  │                                                          │     │
│  │  Events:                                                 │     │
│  │  ┌──────────────────────────────────────────────────┐   │     │
│  │  │  Client → Server:                                 │   │     │
│  │  │    'subscribe:project' { projectId }              │   │     │
│  │  │    'unsubscribe:project' { projectId }            │   │     │
│  │  │    'typing:start' { channelId }                   │   │     │
│  │  │    'typing:stop' { channelId }                    │   │     │
│  │  │    'chat:message' { channelId, content }          │   │     │
│  │  │                                                    │   │     │
│  │  │  Server → Client:                                 │   │     │
│  │  │    'notification' { type, title, body }           │   │     │
│  │  │    'subscription:update' { plan, status }         │   │     │
│  │  │    'project:update' { projectId, changes }        │   │     │
│  │  │    'chat:message' { channelId, message }          │   │     │
│  │  │    'presence:online' { userIds[] }                │   │     │
│  │  │    'missed_events' { events[] }                   │   │     │
│  │  └──────────────────────────────────────────────────┘   │     │
│  └─────────────────────────────────────────────────────────┘     │
└──────────────────────────────────────────────────────────────────┘
```

### 7.4 Redis Pub/Sub Event Bus

```
┌──────────────────────────────────────────────────────────────────┐
│                     REDIS EVENT BUS                               │
│                                                                  │
│  Publishers (Next.js API routes):                                │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌────────────┐   │
│  │  Payment  │  │   Auth    │  │  Project  │  │   Admin    │   │
│  │  Webhook  │  │  Service  │  │  Service  │  │   Service  │   │
│  └─────┬─────┘  └─────┬─────┘  └─────┬─────┘  └─────┬──────┘   │
│        │              │              │              │            │
│        └──────────────┴──────────────┴──────────────┘            │
│                              │                                    │
│                              ▼                                    │
│                    redis.publish(channel, JSON.stringify({        │
│                      type, payload, timestamp, eventId           │
│                    }))                                            │
│                              │                                    │
│                              ▼                                    │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │                    REDIS CHANNELS                          │  │
│  │                                                            │  │
│  │  acq:user:{userId}        → User-specific events          │  │
│  │  acq:org:{orgId}          → Organization-wide events      │  │
│  │  acq:project:{projectId}  → Project-level events          │  │
│  │  acq:global               → System-wide broadcasts        │  │
│  │  acq:role:{role}          → Role-targeted alerts          │  │
│  └────────────────────────────────────────────────────────────┘  │
│                              │                                    │
│              ┌───────────────┼───────────────┐                    │
│              │               │               │                    │
│              ▼               ▼               ▼                    │
│        ┌──────────┐   ┌──────────┐   ┌──────────────┐            │
│        │ Socket.IO│   │   SSE    │   │  Celery      │            │
│        │ Service  │   │ Manager  │   │  Workers     │            │
│        │ (3003)   │   │ (3000)   │   │  (optional)  │            │
│        └──────────┘   └──────────┘   └──────────────┘            │
│                                                                  │
│  Subscribers: redis.subscribe(channel, handler)                  │
│  Each handler filters + forwards to connected clients            │
└──────────────────────────────────────────────────────────────────┘
```

---

## 8. Background Jobs Architecture

### 8.1 Celery Task Queue

```
┌─────────────────────────────────────────────────────────────────────┐
│                    BACKGROUND JOB ARCHITECTURE                       │
│                                                                     │
│  ┌──────────────┐         ┌──────────────────┐                      │
│  │  Next.js API │         │  FastAPI (8000)   │                      │
│  │  (Producer)  │────────►│  Task Enqueuer   │                      │
│  └──────────────┘         └────────┬─────────┘                      │
│                                    │                                 │
│                                    │ celery_app.send_task()         │
│                                    │                                 │
│                                    ▼                                 │
│                           ┌─────────────────┐                       │
│                           │  Redis Broker    │                       │
│                           │  (port 6379)     │                       │
│                           │                  │                       │
│                           │  Queues:         │                       │
│                           │  ┌─────────────┐ │                       │
│                           │  │  default    │ │  ← General tasks     │
│                           │  │  emails     │ │  ← Bulk email        │
│                           │  │  reports    │ │  ← PDF/CSV generation│
│                           │  │  analytics  │ │  ← Data pipelines   │
│                           │  │  imports    │ │  ← Large file import│
│                           │  │  priority   │ │  ← Urgent tasks     │
│                           │  └─────────────┘ │                       │
│                           └────────┬────────┘                       │
│                                    │                                 │
│                      ┌─────────────┼─────────────┐                  │
│                      │             │             │                   │
│                      ▼             ▼             ▼                   │
│              ┌────────────┐ ┌────────────┐ ┌────────────┐          │
│              │  Worker 1  │ │  Worker 2  │ │  Worker N  │          │
│              │  (emails,  │ │  (reports, │ │  (analytics│          │
│              │   default) │ │   imports) │ │   default) │          │
│              └──────┬─────┘ └──────┬─────┘ └──────┬─────┘          │
│                     │              │              │                  │
│                     └──────────────┴──────────────┘                  │
│                                    │                                 │
│                                    ▼                                 │
│                           ┌─────────────────┐                       │
│                           │  Redis Backend   │                       │
│                           │  (result store)  │                       │
│                           │                  │                       │
│                           │  celery-task-meta│                       │
│                           │  -{task_id}      │                       │
│                           └─────────────────┘                       │
│                                    │                                 │
│                                    ▼                                 │
│                           ┌─────────────────┐                       │
│                           │  Result Polling  │                       │
│                           │                  │                       │
│                           │  Next.js polls:  │                       │
│                           │  GET /api/tasks/ │                       │
│                           │  {id}/status     │                       │
│                           │                  │                       │
│                           │  OR: Redis       │                       │
│                           │  pub/sub notify  │                       │
│                           └─────────────────┘                       │
└─────────────────────────────────────────────────────────────────────┘
```

### 8.2 Task Types

| Task | Queue | Avg Duration | Retry Policy | Description |
|------|-------|-------------|--------------|-------------|
| `send_bulk_email` | emails | 5-60s | 3x, 30s backoff | Send templated emails to user list |
| `generate_report` | reports | 10-120s | 2x, 60s backoff | Create PDF/CSV report file |
| `run_analytics_pipeline` | analytics | 30-300s | 1x, 120s backoff | Aggregate data, update dashboards |
| `import_csv` | imports | 5-600s | 2x, 30s backoff | Parse + insert large CSV data |
| `send_notification` | default | 1-3s | 3x, 10s backoff | Push notification to user |
| `cleanup_expired_sessions` | priority | 5-30s | 1x, no retry | Remove expired sessions/tokens |
| `sync_stripe_data` | priority | 10-60s | 3x, 60s backoff | Reconcile Stripe ↔ local data |

### 8.3 Fallback: In-Process Jobs

When Celery/FastAPI is not running (pure Next.js mode):

```
┌─────────────────────────────────────────────────────────┐
│             IN-PROCESS JOB RUNNER (Fallback)             │
│                                                         │
│  Uses: Node.js worker_threads or sequential execution   │
│                                                         │
│  ┌───────────────────────────────────────────────────┐  │
│  │  JobQueue (in-memory, singleton)                   │  │
│  │                                                    │  │
│  │  enqueue(job) → adds to queue                      │  │
│  │  process() → picks next job, runs synchronously    │  │
│  │  onComplete(jobId, result) → stores result         │  │
│  │  getStatus(jobId) → pending | running | done       │  │
│  └───────────────────────────────────────────────────┘  │
│                                                         │
│  Limitations:                                           │
│  • No persistence (lost on server restart)              │
│  • Single-threaded (blocks if CPU-heavy)               │
│  • No horizontal scaling                               │
│  • Suitable for: dev, lightweight production            │
└─────────────────────────────────────────────────────────┘
```

---

## 9. Security Architecture

### 9.1 Security Layers

```
┌─────────────────────────────────────────────────────────────────────┐
│                      SECURITY DEFENSE LAYERS                         │
│                                                                     │
│  Layer 1: NETWORK                                                   │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  Caddy Reverse Proxy (TLS termination)                       │    │
│  │  • HSTS headers (max-age=31536000; includeSubDomains)       │    │
│  │  • X-Frame-Options: DENY                                     │    │
│  │  • X-Content-Type-Options: nosniff                           │    │
│  │  • Referrer-Policy: strict-origin-when-cross-origin          │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                     │
│  Layer 2: APPLICATION                                               │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  CORS Configuration                                          │    │
│  │  • Allowed origins: whitelist (never *)                      │    │
│  │  • Credentials: true                                         │    │
│  │  • Methods: GET, POST, PUT, PATCH, DELETE                    │    │
│  │                                                              │    │
│  │  CSRF Protection                                             │    │
│  │  • SameSite=Lax cookies (default)                            │    │
│  │  • Custom CSRF token for state-changing requests             │    │
│  │  • Origin header validation on API routes                    │    │
│  │                                                              │    │
│  │  Rate Limiting (Redis-backed sliding window)                 │    │
│  │  ┌────────────────┬──────────────┬───────────────────┐      │    │
│  │  │  Endpoint      │  Limit       │  Window            │      │    │
│  │  ├────────────────┼──────────────┼───────────────────┤      │    │
│  │  │ /api/auth/login│  5 requests  │  15 minutes        │      │    │
│  │  │ /api/auth/signup│  3 requests │  60 minutes        │      │    │
│  │  │ /api/auth/otp  │  3 requests  │  5 minutes         │      │    │
│  │  │ /api/auth/magic│  3 requests  │  15 minutes        │      │    │
│  │  │ /api/webhooks/*│  100 req/min │  per IP            │      │    │
│  │  │ /api/* (general)│  60 req/min │  per IP            │      │    │
│  │  └────────────────┴──────────────┴───────────────────┘      │    │
│  │                                                              │    │
│  │  Input Validation (Zod schemas)                              │    │
│  │  • All API inputs validated before processing                │    │
│  │  • SQL injection: prevented by Prisma parameterized queries  │    │
│  │  • XSS: React auto-escapes + DOMPurify for rich text        │    │
│  │  • NoSQL injection: N/A (using SQL database)                │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                     │
│  Layer 3: AUTHENTICATION                                            │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  • bcrypt hash (cost factor 12) for passwords                │    │
│  │  • JWT with RS256 signing (asymmetric keys)                  │    │
│  │  • httpOnly + Secure + SameSite cookies                      │    │
│  │  • Refresh token rotation on every use                       │    │
│  │  • Device fingerprinting on login                            │    │
│  │  • MFA/TOTP as second factor                                 │    │
│  │  • Account lockout after 5 failed attempts (30 min)          │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                     │
│  Layer 4: AUTHORIZATION                                             │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  • RBAC with hierarchical roles                              │    │
│  │  • Resource-level ownership checks                           │    │
│  │  • Organization membership validation                        │    │
│  │  • API key scoping (future)                                  │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                     │
│  Layer 5: DATA                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  • Encryption at rest: SQLite file permissions / PG TDE     │    │
│  │  • Encryption in transit: TLS 1.3 everywhere                 │    │
│  │  • PII fields: encrypted before storage (AES-256-GCM)       │    │
│  │  • Sensitive logs: redacted (emails, tokens, passwords)     │    │
│  │  • Backup encryption: AES-256 before storage                 │    │
│  └─────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
```

### 9.2 Device Fingerprinting

```
┌──────────────────────────────────────────────────────────────────┐
│                  NEW DEVICE DETECTION                             │
│                                                                  │
│  On every login:                                                 │
│                                                                  │
│  1. Compute fingerprint:                                         │
│     SHA-256(userAgent + screenRes + timezone + language +        │
│             platform + canvasHash)                                │
│                                                                  │
│  2. Query: db.device.findUnique({ userId + fingerprint })        │
│                                                                  │
│  3. If NOT found:                                                │
│     • Create Device record (trusted: false)                      │
│     • Send "New device login" email with details                 │
│     • Include device info in login response                      │
│     • Optionally require MFA even if not globally enabled        │
│                                                                  │
│  4. If found but not trusted:                                    │
│     • Require email verification to trust device                 │
│                                                                  │
│  5. If found and trusted:                                        │
│     • Update lastUsedAt timestamp                                │
│     • Continue normal login flow                                 │
└──────────────────────────────────────────────────────────────────┘
```

### 9.3 Security Headers

| Header | Value | Purpose |
|--------|-------|---------|
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains; preload` | Force HTTPS |
| `X-Frame-Options` | `DENY` | Prevent clickjacking |
| `X-Content-Type-Options` | `nosniff` | Prevent MIME sniffing |
| `X-XSS-Protection` | `0` | Disabled (React handles XSS) |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Limit referrer leakage |
| `Content-Security-Policy` | `default-src 'self'; script-src 'self' 'unsafe-eval'; ...` | Prevent injection |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` | Restrict browser APIs |

---

## 10. Observability

### 10.1 Health Endpoints

```
┌──────────────────────────────────────────────────────────────────┐
│                      HEALTH CHECK ENDPOINTS                       │
│                                                                  │
│  GET /api/health                                                 │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  {                                                          │  │
│  │    "status": "healthy",                                     │  │
│  │    "timestamp": "2025-03-04T12:00:00Z",                    │  │
│  │    "version": "1.0.0"                                      │  │
│  │  }                                                          │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
│  GET /api/health/ready                                           │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  {                                                          │  │
│  │    "status": "ready",                                       │  │
│  │    "checks": {                                              │  │
│  │      "database": { "status": "up", "latencyMs": 3 },       │  │
│  │      "redis": { "status": "up", "latencyMs": 1 },          │  │
│  │      "email": { "status": "degraded", "provider": "smtp" } │  │
│  │    }                                                        │  │
│  │  }                                                          │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
│  GET /api/health/live                                            │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  { "status": "alive" }                                      │  │
│  │  (Lightweight, no dependency checks — for k8s liveness)     │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

### 10.2 Logging Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                     LOGGING PIPELINE                              │
│                                                                  │
│  Application Code                                                │
│       │                                                          │
│       │  logger.info() / logger.error() / logger.warn()          │
│       │                                                          │
│       ▼                                                          │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │  Structured Logger (pino / winston)                       │    │
│  │                                                           │    │
│  │  Log Format (JSON):                                       │    │
│  │  {                                                        │    │
│  │    "level": "info",                                       │    │
│  │    "timestamp": "2025-03-04T12:00:00.123Z",              │    │
│  │    "service": "nextjs",                                   │    │
│  │    "traceId": "abc123",                                   │    │
│  │    "userId": "user_456",                                  │    │
│  │    "message": "Payment processed",                        │    │
│  │    "metadata": { "amount": 9900, "currency": "usd" }      │    │
│  │  }                                                        │    │
│  └──────────────────────┬───────────────────────────────────┘    │
│                         │                                        │
│          ┌──────────────┼──────────────┐                         │
│          │              │              │                          │
│          ▼              ▼              ▼                          │
│    ┌──────────┐  ┌──────────┐  ┌──────────────┐                 │
│    │  Console │  │   File   │  │  External    │                 │
│    │  (dev)   │  │  (prod)  │  │  (Datadog/   │                 │
│    │          │  │          │  │   Sentry)    │                 │
│    └──────────┘  └──────────┘  └──────────────┘                 │
│                                                                  │
│  Log Levels:                                                     │
│  fatal → error → warn → info → debug → trace                    │
│                                                                  │
│  Sensitive Data Redaction:                                       │
│  • Passwords → [REDACTED]                                        │
│  • Email addresses → u***@domain.com                             │
│  • Tokens/JWTs → [REDACTED]                                      │
│  • IP addresses → 192.168.*.*                                    │
└──────────────────────────────────────────────────────────────────┘
```

### 10.3 Metrics (Production)

```
┌──────────────────────────────────────────────────────────────────┐
│               PROMETHEUS + GRAFANA (Production)                   │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐     │
│  │  Next.js App                                             │     │
│  │                                                          │     │
│  │  GET /api/metrics (prom-client)                          │     │
│  │  ┌────────────────────────────────────────────────────┐ │     │
│  │  │  http_request_duration_seconds (histogram)         │ │     │
│  │  │  http_requests_total (counter by method/path/code) │ │     │
│  │  │  auth_login_attempts_total (counter by outcome)    │ │     │
│  │  │  auth_active_sessions (gauge)                      │ │     │
│  │  │  payment_transactions_total (counter by provider)  │ │     │
│  │  │  payment_revenue_total (counter by currency)       │ │     │
│  │  │  db_query_duration_seconds (histogram)             │ │     │
│  │  │  redis_operations_total (counter by op/outcome)    │ │     │
│  │  │  socket_connections_active (gauge)                 │ │     │
│  │  │  email_sent_total (counter by provider/outcome)    │ │     │
│  │  └────────────────────────────────────────────────────┘ │     │
│  └──────────────────────────┬──────────────────────────────┘     │
│                             │  scrape (15s interval)             │
│                             ▼                                    │
│  ┌─────────────────────────────────────────────────────────┐     │
│  │  Prometheus (monitoring/)                                │     │
│  │  • Time-series storage                                   │     │
│  │  • Alerting rules                                        │     │
│  │  • Recording rules for dashboards                        │     │
│  └──────────────────────────┬──────────────────────────────┘     │
│                             │  query                             │
│                             ▼                                    │
│  ┌─────────────────────────────────────────────────────────┐     │
│  │  Grafana (monitoring/)                                   │     │
│  │  • Pre-built dashboards:                                 │     │
│  │    - API Performance                                     │     │
│  │    - Auth & Security                                     │     │
│  │    - Payment Revenue                                     │     │
│  │    - Infrastructure                                      │     │
│  │  • Alert channels: Slack, Email, PagerDuty               │     │
│  └─────────────────────────────────────────────────────────┘     │
└──────────────────────────────────────────────────────────────────┘
```

### 10.4 Error Tracking

```
┌──────────────────────────────────────────────────────────────────┐
│                      ERROR TRACKING                               │
│                                                                  │
│  Unhandled Errors                                                │
│       │                                                          │
│       ├──► API Route Errors                                      │
│       │    • Caught by Next.js error boundary                    │
│       │    • Logged with request context                         │
│       │    • Reported to Sentry (production)                     │
│       │                                                          │
│       ├──► React Component Errors                                │
│       │    • Caught by ErrorBoundary component                   │
│       │    • Fallback UI rendered                                │
│       │    • Reported to Sentry                                  │
│       │                                                          │
│       └──► Background Job Errors                                 │
│            • Celery: auto-retry with backoff                     │
│            • Max retries exceeded → dead letter queue            │
│            • Alert sent to admin channel                         │
│                                                                  │
│  Error Response Format:                                          │
│  {                                                               │
│    "error": {                                                    │
│      "code": "PAYMENT_FAILED",                                   │
│      "message": "Payment could not be processed",               │
│      "details": { "provider": "stripe", "reason": "card_declined" },│
│      "requestId": "req_abc123"                                   │
│    }                                                             │
│  }                                                               │
└──────────────────────────────────────────────────────────────────┘
```

---

## 11. Local vs Production Differences

### 11.1 Environment Comparison Table

| Component | Local Development | Production |
|-----------|-------------------|------------|
| **Framework** | Next.js 16 (dev server, hot reload) | Next.js 16 (standalone build) |
| **Database** | SQLite (`/db/dev.db`) | PostgreSQL 16 (managed RDS) |
| **DB Migrations** | `prisma db push` (schema push) | `prisma migrate deploy` (versioned) |
| **DB Inspection** | Prisma Studio (port 5555) | `psql` / admin tool |
| **Cache** | Redis 7 (local Docker) | Redis 7 (ElastiCache / Upstash) |
| **Email Provider** | Console (stdout) or SMTP → Mailpit | Resend API → SMTP fallback |
| **Email Capture** | Mailpit Web UI (port 8025) | N/A (real delivery) |
| **Auth Cookies** | Secure: false, SameSite: Lax | Secure: true, SameSite: Strict |
| **HTTPS** | No (HTTP via Caddy) | Yes (TLS via Caddy/ALB) |
| **CORS Origin** | `http://localhost:3000` | `https://acq.example.com` |
| **Stripe Mode** | Test mode (test keys) | Live mode (live keys) |
| **Razorpay Mode** | Test mode | Live mode |
| **Webhook Signing** | Stripe CLI or test secrets | Production webhook secrets |
| **Static Assets** | Next.js dev server | CDN (CloudFront / Vercel) |
| **Background Jobs** | In-process (no Celery) | Celery + Redis broker |
| **File Storage** | Local filesystem (`/uploads`) | S3 / GCS bucket |
| **Logging** | Console (pretty print) | Structured JSON → log aggregator |
| **Metrics** | None / health endpoints only | Prometheus + Grafana + OTEL |
| **Error Tracking** | Console + terminal | Sentry with source maps |
| **Process Manager** | `bun --hot` (auto restart) | PM2 / Docker / K8s |
| **Scaling** | Single process | Horizontal (multiple instances) |
| **Socket.IO** | Single server (no Redis adapter needed) | Redis adapter (multi-instance) |
| **SSE Scaling** | Single process (in-memory) | Redis pub/sub (multi-process) |
| **Rate Limiting** | In-memory (per process) | Redis-backed (shared across instances) |
| **Secrets** | `.env.local` file | Environment variables / Secrets Manager |
| **Prisma Log** | `['query', 'error', 'warn']` | `['error']` |
| **Build Optimization** | No (dev mode) | Yes (tree-shaking, minification, splitting) |

### 11.2 Configuration Switching

```
┌──────────────────────────────────────────────────────────────────┐
│                  ENVIRONMENT CONFIGURATION                        │
│                                                                  │
│  .env.local (git-ignored, local overrides)                       │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  DATABASE_URL="file:./dev.db"                              │  │
│  │  REDIS_URL="redis://localhost:6379"                        │  │
│  │  EMAIL_PROVIDER="console"        # or "smtp" for Mailpit   │  │
│  │  SMTP_HOST="localhost"                                     │  │
│  │  SMTP_PORT="1025"                                          │  │
│  │  NEXTAUTH_URL="http://localhost:3000"                      │  │
│  │  STRIPE_SECRET_KEY="sk_test_..."                           │  │
│  │  STRIPE_WEBHOOK_SECRET="whsec_..."                         │  │
│  │  JWT_SECRET="dev-secret-key-not-for-production"            │  │
│  │  NEXT_PUBLIC_APP_URL="http://localhost:3000"               │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
│  .env.production (deployed environment)                           │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  DATABASE_URL="postgresql://user:pass@host:5432/acqos"     │  │
│  │  REDIS_URL="redis://redis.internal:6379"                   │  │
│  │  EMAIL_PROVIDER="resend"                                   │  │
│  │  RESEND_API_KEY="re_..."                                   │  │
│  │  NEXTAUTH_URL="https://acq.example.com"                    │  │
│  │  STRIPE_SECRET_KEY="sk_live_..."                           │  │
│  │  STRIPE_WEBHOOK_SECRET="whsec_live_..."                    │  │
│  │  JWT_SECRET="<strong-random-key-256-bit>"                   │  │
│  │  NEXT_PUBLIC_APP_URL="https://acq.example.com"             │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

### 11.3 Caddy Gateway Configuration

```
┌──────────────────────────────────────────────────────────────────┐
│                    CADDYFILE (Simplified)                         │
│                                                                  │
│  :80 {                                                           │
│    # Default: proxy all requests to Next.js                      │
│    reverse_proxy localhost:3000                                   │
│                                                                  │
│    # Mini-service routing via query parameter                    │
│    # When XTransformPort is present, route to specified port     │
│                                                                  │
│    # WebSocket upgrade handling                                  │
│    # Socket.IO connections are routed to port 3003               │
│    # when XTransformPort=3003 is in the query string             │
│                                                                  │
│    # Security headers                                            │
│    header {                                                      │
│      X-Frame-Options "DENY"                                      │
│      X-Content-Type-Options "nosniff"                            │
│      Referrer-Policy "strict-origin-when-cross-origin"           │
│    }                                                             │
│  }                                                               │
│                                                                  │
│  Key Routing Rules:                                              │
│  • No XTransformPort → localhost:3000 (Next.js)                  │
│  • XTransformPort=3001 → localhost:3001 (Proxy Service)          │
│  • XTransformPort=3003 → localhost:3003 (Realtime Service)       │
│  • WebSocket upgrade + XTransformPort=3003 → Socket.IO           │
└──────────────────────────────────────────────────────────────────┘
```

### 11.4 Local Development Startup Order

```
┌──────────────────────────────────────────────────────────────────┐
│              SERVICE STARTUP SEQUENCE (Local)                     │
│                                                                  │
│  Step 1: Infrastructure                                          │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  Redis      → docker run -p 6379:6379 redis:7-alpine      │  │
│  │  Mailpit    → docker run -p 1025:1025 -p 8025:8025 ...    │  │
│  │  PostgreSQL → docker run -p 5432:5432 postgres:16          │  │
│  │  (optional — SQLite used by default in dev)                │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
│  Step 2: Database Setup                                          │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  bun run db:push    → Push schema to SQLite                │  │
│  │  bun run db:seed    → Seed development data                │  │
│  │  bun run db:studio  → Open Prisma Studio (port 5555)       │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
│  Step 3: Mini Services                                           │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  cd mini-services/realtime-service && bun run dev           │  │
│  │  cd mini-services/proxy && bun run dev                      │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
│  Step 4: Optional Python Backend                                 │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  cd backend && pip install -r requirements.txt              │  │
│  │  celery -A celery_app worker --loglevel=info               │  │
│  │  uvicorn main:app --port 8000                               │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
│  Step 5: Main Application                                        │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  bun run dev    → Next.js dev server (port 3000)            │  │
│  │  (auto-started in sandbox environment)                      │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
│  Step 6: Verification                                            │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  curl http://localhost:3000/api/health     → "healthy"      │  │
│  │  curl http://localhost:3000/api/health/ready → checks OK    │  │
│  │  curl http://localhost:3003/health         → Socket.IO OK   │  │
│  │  curl http://localhost:6379 → PONG                          │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

---

## Appendix A: Port Quick Reference

```
┌──────────┬──────┬──────────────────────────────────────────────┐
│ Service  │ Port │ URL / Connection                            │
├──────────┼──────┼──────────────────────────────────────────────┤
│ Next.js  │ 3000 │ http://localhost:3000                        │
│ Proxy    │ 3001 │ http://localhost:3001 (via XTransformPort)   │
│ Realtime │ 3003 │ ws://localhost:3003 (via XTransformPort)     │
│ Postgres │ 5432 │ postgresql://localhost:5432/acqos            │
│ Redis    │ 6379 │ redis://localhost:6379                       │
│ FastAPI  │ 8000 │ http://localhost:8000                        │
│ Mailpit  │ 8025 │ http://localhost:8025 (web UI)               │
│ SMTP     │ 1025 │ smtp://localhost:1025                        │
│ Prisma   │ 5555 │ http://localhost:5555                        │
└──────────┴──────┴──────────────────────────────────────────────┘
```

## Appendix B: Key File Paths

```
┌──────────────────────────────────────────────────────────────────────┐
│  Path                               │ Purpose                        │
├─────────────────────────────────────┼────────────────────────────────┤
│  src/app/page.tsx                   │ Main entry page                │
│  src/app/layout.tsx                 │ Root layout + providers        │
│  src/app/api/                       │ All API route handlers         │
│  src/lib/db.ts                      │ Prisma client singleton        │
│  src/lib/auth/                      │ Auth services (JWT, OTP, etc.) │
│  src/lib/payments/                  │ Payment provider integrations  │
│  src/lib/email/                     │ Email service + templates      │
│  src/lib/realtime/                  │ SSE manager + event bus        │
│  src/middleware.ts                  │ Next.js middleware (auth guard) │
│  prisma/schema.prisma              │ Database schema definition     │
│  .env.local                        │ Local environment variables    │
│  Caddyfile                         │ Gateway routing configuration  │
│  mini-services/realtime-service/   │ Socket.IO server               │
│  mini-services/proxy/              │ HTTP proxy service             │
│  backend/                          │ FastAPI + Celery workers       │
│  monitoring/                       │ Prometheus + Grafana configs   │
│  scripts/                          │ DB seed, backup, security scan │
│  deploy/                           │ Deployment configurations      │
└─────────────────────────────────────┴────────────────────────────────┘
```

## Appendix C: API Route Patterns

```
┌──────────────────────────────────────────────────────────────────────────┐
│                       RESTful API CONVENTIONS                             │
│                                                                          │
│  Method   Path                     Purpose         Auth    Rate Limit    │
│  ───────  ───────────────────────  ──────────────  ──────  ──────────   │
│  POST     /api/auth/login          Login           Public  5/15min      │
│  POST     /api/auth/signup         Register        Public  3/60min      │
│  POST     /api/auth/refresh        Refresh token   Cookie  20/min      │
│  POST     /api/auth/logout         Logout          Auth    None         │
│  GET      /api/users/me            Current user    Auth    60/min      │
│  PATCH    /api/users/me            Update profile  Auth    20/min      │
│  POST     /api/payments/checkout   Start checkout  Auth    10/min      │
│  GET      /api/payments/subscription Get sub info  Auth    30/min      │
│  POST     /api/webhooks/stripe     Stripe webhook  Sig     100/min     │
│  POST     /api/webhooks/razorpay   Razorpay hook   Sig     100/min     │
│  GET      /api/health              Health check    Public  None         │
│  GET      /api/events/stream       SSE endpoint    Auth    None         │
│                                                                          │
│  Response Envelope:                                                      │
│  { "data": T, "error": { code, message, details }, "meta": { ... } }   │
│                                                                          │
│  Pagination:                                                             │
│  ?page=1&limit=20&sort=createdAt&order=desc                              │
│  → { data: [], meta: { page, limit, total, totalPages } }               │
└──────────────────────────────────────────────────────────────────────────┘
```

---

*End of LOCAL_ARCHITECTURE.md — AcquisitionOS Local Architecture Document*
