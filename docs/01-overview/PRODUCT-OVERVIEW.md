# AcquisitionOS — Product Overview

> Source of truth: `package.json` (name `vantage`, version 0.2.0), `prisma/schema.prisma`, `src/` tree.

## What AcquisitionOS Is

AcquisitionOS is a **web-based, AI-powered client-acquisition operating system** for B2B service sellers. It wraps the entire acquisition lifecycle into one application: find prospective businesses on the open web, score them automatically, research them with AI, generate and send personalized outreach emails, detect and classify replies, orchestrate meetings (including scheduling follow-ups through Google Calendar), and track everything in a CRM-style pipeline with credits-based billing on top.

The product is a single Next.js application (App Router) with a client-rendered dashboard SPA behind an auth gate, a large API surface (485 route files), and a 104-table Prisma database. It supports teams (organizations with roles), per-user integrations (Gmail, Google Calendar, Telegram, WhatsApp), and two payment providers (Stripe primary, Razorpay for Indian users with GST handling).

## The Problem It Solves

Manual client acquisition is slow and repetitive: an agency owner spends hours searching Google Maps/directories for local businesses, manually judging whether each business's website is weak enough that they'd pay for help, writing cold emails one by one, chasing replies in an inbox, and moving names between spreadsheet columns. Most of that work is pattern-shaped and automatable.

AcquisitionOS automates that loop end to end:

1. **Discovery** replaces manual searching — a discovery job queries Google Custom Search (or SerpAPI) for businesses in a niche + location, scrapes each website with Cheerio, and computes a website-quality score that identifies digital weaknesses.
2. **Qualification** replaces gut judgment — AI models score each lead on reply likelihood, conversion likelihood, urgency and revenue potential, with written reasoning.
3. **Outreach** replaces hand-written emails — the AI generates a personalized email per lead (referencing the actual weaknesses found), and sequences with delays can run multi-touch campaigns.
4. **Reply handling** replaces inbox triage — inbound replies are classified (interested / not interested / meeting request / unsubscribe), buying signals are extracted, and meeting intent is detected automatically.
5. **Meetings** replace calendar ping-pong — the meeting orchestration engine proposes slots from the user's Google Calendar availability, confirms, sends reminders, generates prep notes and follow-ups.
6. **Monetization** — the platform itself is sold as a SaaS with plan tiers (free / pro / elite), a credits system metering AI-heavy actions, add-on credit packs, coupons, invoices and tax handling.

## Who It Is For

- **Freelancers and agencies** selling web design, marketing, SEO or automation services to local businesses — the primary persona. The scoring model is explicitly tuned to find businesses with weak websites and reachable owners.
- **Solo founders / small B2B sales teams** who want an autonomous SDR: the "Autonomous Outreach" module can run discover → score → generate → send cycles on a schedule with an autonomy-mode toggle.
- **Teams** — organizations with owner/admin/member/viewer roles, invitations, team leaderboards, and shared pipeline.
- **The platform operator** — admin endpoints and feedback/crash reporting systems exist for operating the SaaS itself.

## Feature List by Category

### Authentication & Accounts
- Email/password signup and sign-in with hashed passwords (bcryptjs)
- Email verification via OTP
- Login OTP (passwordless codes) and Magic Link sign-in
- Google OAuth 2.0 sign-in (dynamic redirect_uri resolution — works on any domain the request comes from)
- JWT sessions in httpOnly cookies with refresh-token rotation and revocable sessions
- TOTP multi-factor authentication with backup codes
- Account lockout after failed attempts, known-device tracking, security alerts, login history
- Password reset via OTP; profile, avatar and password management in settings

### Lead Discovery
- Discovery jobs: niche + location driven web search (Google Custom Search API, SerpAPI fallback)
- Website scraping (Cheerio) and website quality scoring with weakness detection
- AI company research per lead (business profile, decision-maker, opportunity notes)
- Website screenshot capture, tech-stack detection
- Lead enrichment, deduplication, CSV import/export, merging
- Hot-lead detection and hot-lead feed
- Scraping metrics and rotating proxy pool management

### Pipeline (CRM)
- Kanban-style pipeline with default and organization-custom stages
- Stage moves with audit trail, lead activities timeline, notes, follow-up reminders
- Deals with values, deal risk and funnel velocity analytics
- Lead comparison, gap analysis, reply-intelligence views

### Outreach
- AI-generated personalized outreach emails (tone/goal configurable)
- Single send, batch send, and multi-step sequences (delay-based steps, enroll/pause/resume)
- Email open tracking (pixel), click tracking (wrapped links), bounce intelligence
- Unsubscribe handling, scheduled emails, email analytics
- Autonomous outreach mode with campaign tracking and SDR cycle
- Gmail integration: connect a real Gmail mailbox, send from it, sync inbox/threads, process replies, outreach-to-draft

### Meetings
- Reply-intent detection ("Tuesday 3pm works") → meeting proposals
- Slot suggestion from Google Calendar availability; AI booking
- Meeting lifecycle: proposed → confirmed → completed, reschedule support
- Prep notes, agenda generation, objection handling, sentiment analysis, action-item extraction
- Follow-up emails, meeting reminders across channels, meeting stats

### Notifications
- In-app notification center with read/archive and preferences
- Email notifications via the platform SMTP
- Telegram bot notifications (link via code)
- WhatsApp notifications (Twilio or Meta Cloud API) — **notifications only**
- Web Push notifications (VAPID)
- Realtime in-app updates via WebSocket/SSE event streams

### Billing
- Plans: free (50 credits), pro, elite — monthly/yearly cycles (plan entitlements matrix)
- Stripe Checkout + Billing Portal, webhooks, invoice PDF generation
- Razorpay alternative for Indian users with GST number capture and tax rates
- Credits system: monthly allotment, rollover, add-on packs, per-action costs, ledger history
- Coupons, trials, upgrade/downgrade previews, dunning/payment recovery

### AI Features
- Z-AI SDK as primary provider (no key needed in the GLM sandbox), OpenAI-compatible fallback
- AI lead scoring with explanations, deep analysis, company research
- AI outreach generation, AI chat assistant with lead context, file context uploads
- RAG: ingest CSV/URL/text, vector search, grounded answers
- Reply intelligence: classification, buying signals
- AI cost tracking per call (model, tokens, estimated cost), prompt templates
- Meeting assistant, sales assistant, dashboard AI copilot

### Admin
- Feedback report moderation: status workflow, comments, analytics, crash reports
- Admin billing views: failed payments, webhook logs, refunds
- Database backup management endpoints
- Audit logs, system events, API key administration

### Feedback System (end-user facing)
- In-app feedback widget: bug reports, feature requests, general feedback with severity and screenshots
- Automatic crash reporting from the client error boundary
- Status tracking of submitted reports with comment threads

## Tech Stack (from `package.json`)

| Layer | Technology | Version |
|---|---|---|
| Framework | Next.js (App Router) | ^16.1.1 |
| UI runtime | React + React DOM | ^19.0.0 |
| Language | TypeScript | ^5 |
| ORM / Database | Prisma + SQLite (PostgreSQL-annotated) | ^6.19.2 / ^6.11.1 |
| Styling | Tailwind CSS (PostCSS) + tailwindcss-animate + tw-animate-css | ^4 |
| Component system | Radix UI (30+ packages), shadcn-style `src/components/ui` (50 components), lucide-react icons | latest |
| State/data | TanStack Query ^5, TanStack Table ^8, Zustand ^5, React Hook Form + Zod ^4 | latest |
| Realtime | socket.io-client ^4, custom SSE manager, ioredis ^5 (optional pub/sub) | latest |
| Auth | Custom JWT (jose ^6, jsonwebtoken ^9), bcryptjs ^3, next-auth ^4 present for interop | latest |
| Email | nodemailer ^8 (Gmail SMTP), Resend ^6 (optional), Ethereal (dev fallback) | latest |
| Payments | Stripe ^22, Razorpay ^2 | latest |
| AI | z-ai-web-dev-sdk ^0.0.18 (primary), OpenAI-compatible HTTP fallback | latest |
| Scraping | Cheerio ^1.2, Sharp ^0.34 (screenshots), proxy rotation service | latest |
| Charts/misc | recharts ^2, framer-motion ^12, date-fns ^4, pdfkit ^0.18, MDX editor | latest |
| Observability | OpenTelemetry SDK/API suite, custom metrics, error tracking | latest |
| Testing | Vitest ^4, Testing Library, MSW ^2, jsdom | latest |
| Lint | ESLint ^9 with eslint-config-next | latest |

## Overall Product Vision

The vision is an **autonomous acquisition pipeline**: the operator describes who they want as clients (niche, geography), and the system continuously finds candidates, qualifies them with AI, initiates personalized contact, reads the replies, books meetings on the operator's calendar, and only escalates to the human when there is a warm meeting or money decision to make. Everything is metered in credits so the SaaS can be sold predictably, and every heavy action (discovery, deep analysis, outreach, AI chat) is gated and tracked so usage maps to revenue. The interface ambition is a single command-center dashboard: pipeline health, live activity, hot leads, and the AI copilot in one screen — with WhatsApp/Telegram used as mobile alert channels rather than full interfaces.

The pragmatic current reality (documented honestly in `FEATURE-LIST.md`): the acquisition loop, auth, email, discovery, AI and the dashboard work today; the payment providers, WhatsApp/Telegram channels and Gmail inbox sync are fully coded but inactive until their credentials are supplied; and some advanced analytics modules are wired end-to-end but marked as partial because they depend on data volume to be useful.
