<div align="center">

<br/>

# AcquisitionOS

### AI Market Intelligence Platform

**See Everything. Close Anyone. Dominate Every Market.**

[![Next.js 16](https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Prisma](https://img.shields.io/badge/Prisma-ORM-2D3748?style=flat-square&logo=prisma)](https://www.prisma.io/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-4-06B6D4?style=flat-square&logo=tailwindcss)](https://tailwindcss.com/)
[![Vercel](https://img.shields.io/badge/Deploy-Vercel-000?style=flat-square&logo=vercel)](https://vercel.com/)
[![Supabase](https://img.shields.io/badge/DB-Supabase-3ECF8E?style=flat-square&logo=supabase)](https://supabase.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green?style=flat-square)](LICENSE)

<br/>

</div>

---

## What is AcquisitionOS?

AcquisitionOS is an **AI-powered market intelligence platform** that automates the entire client acquisition lifecycle — from discovering businesses to closing deals. It combines OSINT-based prospecting, predictive lead scoring, AI-driven outreach automation, and real-time deal intelligence into a single, unified command center.

Built for agencies, consultancies, and sales teams who need to **find, qualify, contact, and close** businesses at scale.

---

## Why AcquisitionOS?

| Problem | AcquisitionOS Solution |
|---------|-----------------|
| Hours of manual prospecting | AI-powered business discovery across 22 niches and 6 countries |
| Guessing which leads to pursue | Predictive scoring engine with 4 composite scores per lead |
| Generic outreach that gets ignored | AI-generated, contextual outreach across Email, WhatsApp, LinkedIn, Instagram |
| Deals slipping through the cracks | Visual pipeline with stage tracking, aging alerts, and velocity metrics |
| No visibility into team performance | Real-time dashboards with activity heatmaps, conversion funnels, and trend analysis |

---

## Key Features

### 🎯 AI Lead Intelligence
- **OSINT Business Discovery** — Find businesses across Google Maps, LinkedIn, Yelp, IndiaMart
- **Predictive Scoring** — Reply Score, Deal Conversion Score, Urgency Score, Revenue Potential Score
- **Digital Audit** — Automated UI/UX, SEO, and tech stack analysis for every prospect
- **Score Explanation** — AI-generated reasoning for why a lead received its scores

### 📊 Deal Intelligence
- **Visual Pipeline** — Kanban-style pipeline with drag-and-drop stage management
- **Deal Flow Analytics** — Pipeline funnel, win/loss analysis, velocity metrics
- **AI Proposal Generation** — One-click professional proposal creation using LLM
- **Aging Alerts** — Configurable thresholds for deals stuck in stages too long

### 📈 Market Analytics
- **Conversion Funnels** — Stage-by-stage conversion rates with drop-off analysis
- **Score Distribution** — Donut chart of lead quality distribution
- **Performance Trends** — 7-day vs previous 7-day comparison metrics
- **Lead Score Heatmap** — Niche × Country grid visualization of average scores
- **Source Effectiveness** — Compare lead quality by discovery source

### 🤖 AI Automation
- **Smart Outreach Templates** — 5 contextual template categories with variable interpolation
- **AI Message Generation** — LLM-powered personalized outreach messages
- **Sales Assistant** — Real-time chatbot with objection handling and buying signal detection
- **Follow-up Scheduling** — Schedule and track follow-up reminders

### 🔔 Intelligence Center
- **Real-time Notifications** — Lead events, deal updates, and system alerts
- **Activity Timeline** — Chronological feed of all lead and deal activities
- **Follow-up Reminders** — Overdue reminders with polling-based checking
- **Command Palette** — `⌘K` for instant search and navigation

### 📱 Responsive Design
- **Mobile-first** — Optimized for phones, tablets, and desktops
- **Adaptive Navigation** — Bottom nav on mobile, sidebar on desktop
- **Touch-friendly** — 44px minimum touch targets, swipe gestures
- **Dark/Light Mode** — Full theme support with smooth transitions

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                       AcquisitionOS Platform                     │
├──────────────┬───────────────┬───────────────────────────────────┤
│   Frontend   │    Backend    │          AI Engine                 │
│   (Next.js)  │  (API Routes) │     (z-ai-web-dev-sdk)            │
├──────────────┼───────────────┼───────────────────────────────────┤
│ React 19     │ REST APIs     │ Lead Scoring                      │
│ TypeScript   │ Prisma ORM    │ Proposal Generation                │
│ Tailwind 4   │ PostgreSQL    │ Outreach Generation                │
│ shadcn/ui    │ (Supabase)    │ Sales Assistant                    │
│ Recharts     │ or SQLite     │ Website Analysis                   │
│ Framer       │ (local dev)   │ Score Explanation                  │
│ Motion       │               │ Market Discovery                   │
├──────────────┴───────────────┴───────────────────────────────────┤
│                      State Management                             │
│           TanStack Query + Zustand + React Context                │
├──────────────────────────────────────────────────────────────────┤
│                         Database                                  │
│            Production: Supabase PostgreSQL                        │
│            Local Dev:  SQLite via Prisma ORM                      │
│      Lead │ Communication │ Deal │ Activity │ Reminder │ Insight │
└──────────────────────────────────────────────────────────────────┘
```

### Data Flow

```mermaid
graph LR
    A[Discovery Engine] -->|Create| B[Lead]
    B -->|Score| C[AI Scoring Engine]
    C -->|Enrich| B
    B -->|Select| D[Outreach Engine]
    D -->|Generate| E[AI Message Generator]
    E -->|Send| F[Communication]
    F -->|Track| G[Pipeline]
    G -->|Close| H[Deal]
    H -->|Generate| I[AI Proposal]
    I -->|Win| J[Revenue]
    B --> K[Analytics]
    G --> K
    H --> K
```

### Module Architecture

```
src/
├── app/                        # Next.js App Router
│   ├── api/                    # REST API endpoints
│   │   ├── leads/              # Lead CRUD + discovery + analysis + outreach
│   │   ├── deals/              # Deal CRUD + status management
│   │   ├── insights/           # Analytics + funnel + heatmap + trends
│   │   ├── sales-assistant/    # AI chat + proposal generation
│   │   ├── reminders/          # Follow-up reminder management
│   │   └── settings/           # App settings + data management
│   ├── globals.css             # Global styles + custom utilities
│   ├── layout.tsx              # Root layout + providers + metadata
│   └── page.tsx                # Entry point
├── components/
│   ├── dashboard/              # Business logic components
│   │   ├── dashboard-layout.tsx    # Main layout + navigation
│   │   ├── overview-tab.tsx        # Dashboard + stats + activity
│   │   ├── leads-tab.tsx           # Lead table + filters + bulk actions
│   │   ├── pipeline-tab.tsx        # Kanban pipeline view
│   │   ├── discover-tab.tsx        # Business discovery + results
│   │   ├── outreach-tab.tsx        # Outreach + templates + timeline
│   │   ├── assistant-tab.tsx       # AI sales assistant chat
│   │   ├── insights-tab.tsx        # Analytics + charts + recommendations
│   │   ├── deals-tab.tsx           # Deal management + proposals
│   │   ├── lead-detail-panel.tsx   # Lead detail sheet + editing
│   │   ├── notification-center.tsx # Notification popover
│   │   ├── command-palette.tsx      # ⌘K command palette
│   │   ├── settings-panel.tsx      # App settings dialog
│   │   ├── shortcuts-dialog.tsx    # Keyboard shortcuts reference
│   │   ├── import-leads-dialog.tsx # CSV import workflow
│   │   ├── lead-compare-dialog.tsx # Lead comparison tool
│   │   ├── tag-input.tsx           # Tag management component
│   │   ├── quick-actions-fab.tsx   # Floating action button
│   │   ├── follow-up-reminders.tsx # Sidebar reminders widget
│   │   └── theme-toggle.tsx        # Dark/light mode toggle
│   ├── ui/                     # shadcn/ui primitives (40+ components)
│   └── providers.tsx           # Theme + client providers
├── hooks/                      # Custom React hooks
│   ├── use-keyboard-shortcuts.ts
│   ├── use-mobile.ts
│   └── use-toast.ts
└── lib/                        # Shared utilities
    ├── api.ts                  # API client functions
    ├── db.ts                   # Prisma client singleton
    ├── export.ts               # CSV export utilities
    ├── import.ts               # CSV import utilities
    ├── settings-store.ts       # Settings Zustand store
    ├── store.ts                # Global Zustand store
    ├── types.ts                # TypeScript type definitions
    └── utils.ts                # Utility functions
```

---

## Tech Stack

| Category | Technology | Purpose |
|----------|-----------|---------|
| **Framework** | Next.js 16 (App Router) | Full-stack React framework |
| **Language** | TypeScript 5 | Type-safe development |
| **Styling** | Tailwind CSS 4 | Utility-first CSS |
| **UI Library** | shadcn/ui (New York) | Accessible component primitives |
| **Database (Local)** | SQLite via Prisma ORM | Local development database |
| **Database (Prod)** | Supabase PostgreSQL via Prisma ORM | Production cloud database |
| **State** | TanStack Query + Zustand | Server + client state management |
| **Animations** | Framer Motion | Smooth transitions and gestures |
| **Charts** | Recharts | Data visualization |
| **AI Engine** | z-ai-web-dev-sdk | LLM, VLM, Web Search |
| **Icons** | Lucide React | Consistent icon system |
| **Theme** | next-themes | Dark/light mode |
| **Tables** | TanStack Table | Headless data tables |
| **Forms** | React Hook Form + Zod | Validation and form handling |
| **Notifications** | Sonner | Toast notifications |
| **Markdown** | ReactMarkdown | Proposal rendering |
| **Deployment** | Vercel | Serverless hosting with edge CDN |

---

## Getting Started

### Prerequisites

- **Node.js** ≥ 18
- **Bun** ≥ 1.0 (recommended) or npm/yarn/pnpm
- **Git** for version control

### Installation

```bash
# Clone the repository
git clone https://github.com/your-org/AcquisitionOS.git
cd AcquisitionOS

# Install dependencies
bun install

# Set up environment variables
cp .env.example .env
# Edit .env with your values (see Environment Variables below)

# Set up the database (SQLite for local development)
bun run db:push

# Start the development server
bun run dev
```

The application will be available at `http://localhost:3000`.

### Environment Variables

Create a `.env` file in the project root (or copy from `.env.example`):

#### Local Development (SQLite)

```env
# Database — SQLite for local development
DATABASE_URL="file:./db/custom.db"

# AI SDK — Required for AI features
ZAI_API_KEY=your_zai_api_key_here

# Optional: Authentication
# NEXTAUTH_SECRET=your_nextauth_secret
# NEXTAUTH_URL=http://localhost:3000
```

#### Production (Supabase PostgreSQL)

```env
# Database — Supabase PostgreSQL for production
DATABASE_URL="postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres"

# AI SDK — Required for AI features
ZAI_API_KEY=your_zai_api_key_here

# Optional: Authentication
# NEXTAUTH_SECRET=your_nextauth_secret
# NEXTAUTH_URL=https://your-domain.vercel.app

# Optional: App Configuration
# NEXT_PUBLIC_APP_URL=https://your-domain.vercel.app
# NEXT_TELEMETRY_DISABLED=1
```

#### Environment Variable Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | ✅ Yes | Database connection string. SQLite path for local, Supabase pooler URL for production |
| `DIRECT_URL` | ⚠️ Prod only | Direct PostgreSQL connection (bypasses PgBouncer). Required for Prisma migrations on Supabase |
| `ZAI_API_KEY` | ✅ Yes | API key for z-ai-web-dev-sdk. Powers all AI features: discovery, scoring, outreach, assistant, proposals |
| `NEXTAUTH_SECRET` | ❌ Optional | Secret for NextAuth.js session encryption. Generate with `openssl rand -base64 32` |
| `NEXTAUTH_URL` | ❌ Optional | Canonical URL of your app for NextAuth.js callbacks |
| `NEXT_PUBLIC_APP_URL` | ❌ Optional | Public URL accessible in browser |
| `NEXT_TELEMETRY_DISABLED` | ❌ Optional | Set to `1` to disable Next.js telemetry |

> **Note:** Without `ZAI_API_KEY`, AI features will fail. All AI-powered capabilities (discovery, scoring, outreach, assistant, proposals, website analysis) require a valid key.

---

## 🚀 Deploy to Vercel

AcquisitionOS is designed to deploy seamlessly on **Vercel** with **Supabase** as the production database.

### Quick Deploy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/your-org/AcquisitionOS&env=DATABASE_URL,DIRECT_URL,ZAI_API_KEY&envDescription=AcquisitionOS%20requires%20these%20environment%20variables&envLink=https://github.com/your-org/AcquisitionOS/blob/main/DEPLOYMENT.md)

### Deployment Overview

```
┌──────────────────────┐     ┌────────────────────────────┐
│   Vercel Edge CDN    │────▶│   Next.js Serverless       │
│   (Static Assets)    │     │   Functions (API Routes)   │
└──────────────────────┘     └──────────┬─────────────────┘
                                        │
                       ┌────────────────┼──────────────┐
                       ▼                ▼              ▼
             ┌──────────────┐  ┌──────────────┐  ┌──────────┐
             │   Supabase   │  │   ZAI SDK    │  │  Vercel  │
             │  PostgreSQL  │  │  AI Engine   │  │  Blob    │
             │  Database    │  │  (LLM/Web)   │  │ (Assets) │
             └──────────────┘  └──────────────┘  └──────────┘
```

### Step-by-Step Deployment

#### 1. Set Up Supabase

1. Create a project at [supabase.com/dashboard](https://supabase.com/dashboard)
2. Go to **Settings → Database** → copy both connection strings:
   - **Transaction Pooler** (port 6543) → `DATABASE_URL`
   - **Direct Connection** (port 5432) → `DIRECT_URL`

#### 2. Push Schema to Supabase

```bash
export DATABASE_URL="postgresql://postgres.[ref]:[pw]@aws-0-[region].pooler.supabase.com:5432/postgres"
export DIRECT_URL="$DATABASE_URL"
npx prisma db push --schema=prisma/schema.production.prisma
```

#### 3. Switch to Production Schema

```bash
cp prisma/schema.prisma prisma/schema.local.prisma
cp prisma/schema.production.prisma prisma/schema.prisma
git add . && git commit -m "Switch to PostgreSQL for Vercel" && git push
```

#### 4. Deploy on Vercel

1. Go to [vercel.com/new](https://vercel.com/new)
2. Import your GitHub repository
3. Add environment variables (see table below)
4. Deploy

#### Required Vercel Environment Variables

| Variable | Value |
|----------|-------|
| `DATABASE_URL` | Supabase Transaction Pooler URL (port 6543, `?pgbouncer=true`) |
| `DIRECT_URL` | Supabase Direct Connection URL (port 5432) |
| `ZAI_API_KEY` | Your z-ai-web-dev-sdk API key |

#### Vercel Configuration

The project includes a `vercel.json` that configures:
- **Build command**: `bun run db:generate && next build` (generates Prisma client before build)
- **Install command**: `bun install`
- **Security headers**: XSS protection, frame options, cache control on API routes
- **Region**: Singapore (`sin1`) — change to your preferred region

> 📖 **For the complete deployment guide with troubleshooting, cost estimates, and detailed Supabase setup instructions, see [DEPLOYMENT.md](./DEPLOYMENT.md).**

---

## Usage Guide

### 1. Discover Businesses
Navigate to the **Discover** tab. Select a niche (e.g., "Dental", "Restaurant") and country, then click **Discover Businesses**. The AI engine will find and score businesses matching your criteria.

### 2. Analyze & Score Leads
Each discovered lead receives four predictive scores:
- **Reply Score** — Likelihood of responding to outreach
- **Conversion Score** — Probability of becoming a paying client
- **Urgency Score** — How urgently the business needs your services
- **Revenue Potential Score** — Estimated deal value

Click any lead to view detailed scoring reasoning, digital weaknesses, and the best contact strategy.

### 3. Automate Outreach
Select a lead in the **Outreach** tab. Choose from 5 template categories or let AI generate a personalized message. Send via Email, WhatsApp, LinkedIn, or Instagram.

### 4. Track Pipeline
Monitor deals through 9 pipeline stages: Discovered → Analyzed → Contacted → Replied → Discussion → Proposal → Negotiation → Won → Lost. Each stage shows conversion rates and revenue potential.

### 5. Close Deals
Create deals with project scope and pricing. Use **AI Proposal Generation** for professional, contextual proposals. Track deal velocity and win rates in real-time.

### 6. Gain Insights
The **Insights** tab provides conversion funnels, score distributions, performance trends by niche/country, source effectiveness analysis, and actionable AI recommendations.

---

## API Reference

### Leads

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/leads` | List leads with filters, sorting, and pagination |
| `POST` | `/api/leads` | Create a new lead |
| `GET` | `/api/leads/stats` | Get dashboard statistics |
| `GET` | `/api/leads/[id]` | Get lead details |
| `PATCH` | `/api/leads/[id]` | Update lead fields |
| `DELETE` | `/api/leads/[id]` | Delete a lead |
| `POST` | `/api/leads/discover` | Discover businesses via AI |
| `POST` | `/api/leads/[id]/analyze` | AI-analyze a lead |
| `POST` | `/api/leads/[id]/analyze-website` | AI website analysis |
| `GET` | `/api/leads/[id]/explain-scores` | Get AI score explanations |
| `POST` | `/api/leads/[id]/outreach` | AI-generate outreach message |
| `GET` | `/api/leads/[id]/communications` | List lead communications |
| `POST` | `/api/leads/[id]/communications` | Log a communication |
| `GET` | `/api/leads/[id]/deals` | List lead's deals |
| `GET` | `/api/leads/[id]/activities` | List lead activity log |
| `GET` | `/api/leads/[id]/reminders` | List follow-up reminders |
| `POST` | `/api/leads/[id]/reminders` | Create a reminder |

### Deals

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/deals` | List all deals |
| `POST` | `/api/deals` | Create a new deal |
| `PATCH` | `/api/deals/[id]` | Update deal status/price |

### AI & Intelligence

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/sales-assistant` | Chat with AI assistant or generate proposal |
| `GET` | `/api/insights` | Get analytics, funnel, heatmap, trends |

### System

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/reminders` | List reminders (with overdue filter) |
| `POST` | `/api/settings/clear-data` | Clear all application data |

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `1` – `8` | Switch tabs (Overview → Deals) |
| `⌘K` / `Ctrl+K` | Open command palette |
| `N` | New lead |
| `?` | Show shortcuts |

---

## Database Schema

```
┌──────────┐     ┌────────────────┐     ┌──────────┐
│   Lead   │────<│  Communication │     │   Deal   │
│          │     └────────────────┘     │          │
│ id       │     ┌────────────────┐     │ id       │
│ business │────<│  LeadActivity  │     │ leadId   │
│ scores   │     └────────────────┘     │ status   │
│ stage    │     ┌────────────────┐     │ price    │
│ digital  │────<│ FollowUpReminder│    │ proposal │
│ contact  │     └────────────────┘     └──────────┘
│ source   │                             │
└──────────┘     ┌────────────────┐
                  │    Insight     │
                  │ type + content │
                  └────────────────┘
```

### Database Configurations

| Environment | Provider | Connection | Schema File |
|---|---|---|---|
| **Local Dev** | SQLite | `file:./db/custom.db` | `prisma/schema.prisma` |
| **Production** | PostgreSQL (Supabase) | Connection pooler + direct URL | `prisma/schema.production.prisma` |

---

## Roadmap

### v1.0 — Foundation ✅
- [x] AI business discovery (OSINT)
- [x] Predictive lead scoring
- [x] Multi-channel outreach automation
- [x] Visual deal pipeline
- [x] AI proposal generation
- [x] Real-time analytics dashboards
- [x] CSV import/export
- [x] Dark/light mode
- [x] Responsive mobile design
- [x] Command palette (⌘K)
- [x] Keyboard shortcuts
- [x] Notification center
- [x] Lead comparison tool
- [x] Follow-up reminders
- [x] Vercel deployment support
- [x] Supabase PostgreSQL integration

### v1.1 — Collaboration (Planned)
- [ ] Multi-tenant organization support
- [ ] Role-based access control (RBAC)
- [ ] Team activity feed
- [ ] Shared pipeline views
- [ ] Assignment and ownership

### v1.2 — Integrations (Planned)
- [ ] Email integration (Gmail/Outlook)
- [ ] CRM sync (HubSpot, Salesforce)
- [ ] Calendar integration
- [ ] Slack notifications
- [ ] Webhook API

### v2.0 — Intelligence (Planned)
- [ ] Competitor intelligence tracking
- [ ] Market trend analysis
- [ ] Predictive deal closure forecasting
- [ ] Automated A/B testing for outreach
- [ ] Real-time WebSocket updates
- [ ] Custom workflow automation builder

---

## Contributing

We welcome contributions! Please follow these steps:

1. **Fork** the repository
2. **Create** a feature branch (`git checkout -b feature/amazing-feature`)
3. **Commit** your changes (`git commit -m 'Add amazing feature'`)
4. **Push** to the branch (`git push origin feature/amazing-feature`)
5. **Open** a Pull Request

### Development Guidelines

- Use **TypeScript** for all new code
- Follow the existing **component architecture** patterns
- Write **responsive** code (mobile-first)
- Use **shadcn/ui** components over custom implementations
- Add **loading states** for async operations
- Include **error handling** with user-friendly messages
- Test on **dark and light** themes
- Ensure **44px minimum** touch targets on mobile

---

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

---

<div align="center">

### Built with AI. Designed for closers.

**AcquisitionOS** — Where intelligence meets execution.

</div>
