# Changelog

All notable changes to AcquisitionOS are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [3.0.0] — 2026-03-05

The complete platform rebuild — featuring AI-powered lead discovery, automated workflows, real-time observability, and comprehensive security hardening.

---

### New Features

#### AI & Intelligence
- **AI Lead Discovery** — Natural language search to discover and score potential leads across the web using AI-powered analysis
- **Deep Lead Analysis** — AI-generated website quality scoring, digital maturity assessment, weakness identification, and SWOT analysis
- **AI Outreach Generation** — Personalized outreach messages for email, WhatsApp, LinkedIn, and Instagram with one click
- **AI Sales Coach** — Context-aware sales assistant that provides coaching, objection handling, and closing strategies
- **Competitor Intelligence** — AI-powered competitor analysis with SEO scores, SWOT analysis, tech stack detection, and differentiation opportunities
- **Lead Enrichment** — AI-driven data enrichment to fill missing contact information and social profiles
- **Website Analysis** — Automated website quality analysis with tech stack detection and digital weakness identification
- **RAG Context** — File upload and vector search for Retrieval-Augmented Generation in AI conversations
- **AI Cost Tracking** — Real-time tracking of AI token consumption and costs per action
- **Vector Search** — Semantic search across stored contexts using embedding similarity

#### Lead Management
- **Lead Scoring** — Four-dimensional scoring (reply, conversion, urgency, revenue potential) with AI-generated explanations
- **Lead Merge** — Deduplicate and merge lead records while preserving all data
- **Lead Import/Export** — Bulk import from CSV/JSON and export to CSV with field mapping
- **Lead Compare** — Side-by-side comparison of leads for prioritization
- **Lead Tags** — Custom tag system for flexible lead categorization
- **Lead Notes** — Rich notes with pinning capability per lead
- **Activity Timeline** — Chronological activity feed for each lead
- **Follow-up Reminders** — Schedule reminders for lead follow-ups

#### Pipeline
- **Kanban Pipeline** — Visual drag-and-drop pipeline with 9 default stages
- **Custom Pipeline Stages** — Organization-specific custom pipeline stages
- **Pipeline Analytics** — Stage conversion rates and funnel metrics
- **Collapsible Columns** — Mobile-friendly collapsible pipeline columns

#### Outreach & Messaging
- **Outreach Sequences** — Multi-step automated outreach sequences with configurable delays
- **Broadcast Campaigns** — One-to-many messaging with audience filtering across email, WhatsApp, and Telegram
- **Message Templates** — Reusable templates with `{{variable}}` placeholder support
- **Email Tracking** — Open tracking (pixel-based), click tracking, bounce detection
- **Scheduled Sends** — Schedule broadcasts and emails for optimal delivery times
- **Bounce Intelligence** — Automatic bounce classification (hard/soft) and lead email status updates

#### Workflows & Automation
- **Workflow Builder** — Visual workflow builder with 6 trigger types and 4 step types
- **Workflow Templates** — Pre-built templates for nurture, follow-up, alert, onboarding, enrichment, and outreach workflows
- **Workflow Execution Engine** — Robust execution engine with pause/resume/cancel, retry logic, and dead-letter queue
- **Workflow Metrics** — Success rate, average duration, and execution logs
- **Webhook Triggers** — External webhook endpoints for triggering workflows from third-party services
- **Workflow Idempotency** — Idempotent execution with configurable keys to prevent duplicate runs

#### Billing & Payments
- **Dual Payment Providers** — Stripe (USD) and Razorpay (INR) with automatic provider selection
- **Coupon System** — Discount coupons with percent/fixed types, usage limits, and plan restrictions
- **GST Calculation** — Automatic 18% GST for Indian users
- **Credit Addons** — Purchase additional credits without changing plans
- **Invoice Generation** — Automated PDF invoice generation for all payments
- **Payment Recovery** — Failed payment recovery with retry logic
- **Stripe Customer Portal** — Self-service billing management
- **Razorpay Webhook** — Secure webhook handling with HMAC-SHA256 timing-safe verification
- **Stripe Webhook** — Official SDK-based signature verification
- **Webhook Replay** — Replay webhook events for debugging and recovery

#### Subscriptions & Credits
- **Three-Tier Plans** — Free (50 credits), Pro (200 credits), Elite (500 credits)
- **Credit System** — Atomic, idempotent credit deduction with audit logging
- **Credit Rollover** — Unused credits roll over on Pro and Elite plans
- **Trial System** — 14-day free trial with automatic tracking
- **Plan Gates** — Feature access control based on plan entitlements
- **Upgrade/Downgrade Preview** — Preview changes before committing
- **Usage Tracking** — Detailed feature usage tracking per billing period

#### Security & Auth
- **Multi-Factor Authentication** — TOTP-based MFA with backup codes
- **Google OAuth** — One-click sign-in/sign-up with Google
- **Magic Link Auth** — Passwordless authentication via email link
- **OTP Login** — Passwordless login via one-time password
- **Account Lockout** — Automatic lockout after failed login attempts with exponential backoff
- **Suspicious Login Detection** — AI-powered detection of unusual login patterns
- **Security Alerts** — Email notifications for suspicious activity
- **Device Tracking** — Known device management and new device alerts
- **CSRF Protection** — Double-submit cookie pattern with origin validation
- **Input Validation** — SQL injection, XSS, path traversal, and command injection detection
- **Upload Security** — MIME type whitelist, magic bytes verification, filename sanitization
- **API Key System** — Scoped API keys with rotation, revocation, and usage analytics
- **Rate Limiting** — Sliding window rate limiting with 7 configurable limiters
- **JWT Token Rotation** — Refresh token rotation on every use

#### Observability
- **Structured Logging** — JSON logger with 4 levels, context enrichment, and in-memory buffer
- **API Performance Monitoring** — Sliding window percentiles (p50/p95/p99), slow endpoint detection
- **Database Query Monitoring** — Prisma event-based slow query detection (>100ms)
- **Alert Engine** — 8 alert rules with auto-evaluation, cooldown, and auto-resolution
- **Distributed Tracing** — Trace ID propagation with HTTP/DB/AI span types
- **Monitoring Dashboard** — Real-time system health, API metrics, DB metrics, business metrics
- **Prometheus Metrics** — Compatible metrics export for external monitoring

#### GDPR & Compliance
- **Data Processing Agreement** — Downloadable DPA
- **Data Export** — Full GDPR portability export (rate limited 1/24h)
- **Account Deletion** — Right to be forgotten with 30-day grace period
- **Consent Management** — Granular consent recording and tracking
- **Data Retention Policies** — Configurable retention schedules
- **Cookie Consent** — GDPR-compliant cookie consent banner with preferences
- **Legal Pages** — Privacy Policy, Terms of Service, DPA, and Cookie Policy

#### UI/UX
- **Command Palette** — ⌘K command palette for quick actions and navigation
- **Keyboard Shortcuts** — Comprehensive keyboard shortcuts for all major actions
- **Dark/Light Theme** — System-aware theme switching with manual override
- **Responsive Design** — Mobile-first responsive layout for all screen sizes
- **Framer Motion Animations** — Smooth transitions, hover effects, and entrance animations
- **Notification Center** — In-app notification center with read/unread status
- **Onboarding Flow** — Guided first-run experience for new users
- **Cookie Consent Banner** — GDPR-compliant consent management
- **Credit Warning Banner** — Proactive alerts when credits are low
- **Trial Banner** — Trial status with upgrade prompts
- **Accessibility** — Semantic HTML, ARIA labels, keyboard navigation, responsive audit

#### Organizations
- **Multi-Tenant** — Organization-level data isolation with role-based access
- **Team Invitations** — Email invitations with token-based acceptance
- **Custom Branding** — Organization-specific colors, logo, and white-label options
- **Role-Based Access Control** — Owner, Admin, Member, Viewer roles

---

### Improvements

- **Database Schema** — 53+ tables with comprehensive indexes, constraints, and relations
- **Health Checks** — Fast basic check (3 checks) and detailed check (6 component checks)
- **Backup Scripts** — Fixed JSON manifests, configurable paths, stderr logging, gzip integrity verification
- **Docker Configuration** — Added `.dockerignore`, non-root user, Prisma generation in frontend image
- **Process Management** — Graceful shutdown, exponential backoff, max restart limits, connection tracking
- **Deployment Configs** — Fixed K8s PVC, Railway/Render health paths, Docker Compose V2
- **Environment Variables** — 60+ documented variables in `.env.example`
- **Middleware** — JWT verification (Edge Runtime compatible via jose), security headers, route protection
- **API Response Headers** — X-Trace-Id and X-Response-Time on monitored endpoints
- **Error Handling** — Comprehensive error handler with structured responses and logging

---

### Security Fixes

- **CRITICAL**: Fixed Razorpay webhook timing-unsafe comparison — replaced `!==` with `crypto.timingSafeEqual()`
- **CRITICAL**: Added rate limiting to all 8 auth POST endpoints (5 req/min/IP)
- **HIGH**: Added production JWT_SECRET validation in middleware
- **HIGH**: Added dedicated MFA rate limiter (3 req/min/IP) to prevent TOTP brute force
- **HIGH**: Added production guards to Stripe and Razorpay webhook signature verification
- **HIGH**: Added payment amount verification in both webhook handlers
- **MEDIUM**: Fixed `secureCompare` timing leak with dummy timingSafeEqual for different-length strings
- **MEDIUM**: Added admin route protection at middleware level (role check)
- **LOW**: Error message sanitization improvements
- **LOW**: Session token hashing considerations documented

---

### Bug Fixes

- Fixed SMTP password quoting in `.env` for Gmail app passwords with spaces
- Fixed `instrumentation.ts` incompatibility with Edge Runtime — removed file
- Fixed Docker health check path from `/` to `/api/health`
- Fixed nginx dev config routing — corrected `/api/` proxy target
- Fixed K8s frontend deployment using `emptyDir` instead of PersistentVolumeClaim
- Fixed Railway/Render health check paths
- Fixed `backup.sh` JSON manifest trailing commas
- Fixed `snapshot.sh` and `migration-rollback.sh` missing `warn()` function
- Fixed Docker Compose V1 commands in deploy scripts (updated to V2 `docker compose`)
- Fixed email sending blocking OTP and Magic Link routes — made fire-and-forget

---

### Breaking Changes

- **API Authentication**: All protected endpoints now require either JWT Bearer token or API Key — session-only auth is no longer supported for API calls
- **Rate Limiting**: Auth endpoints now enforce 5 req/min/IP rate limits — clients must handle 429 responses
- **Webhook Verification**: Stripe and Razorpay webhooks now strictly verify signatures in production — unsigned requests are rejected with HTTP 500
- **Credit Deduction**: Credit deduction is now atomic and idempotent — duplicate requests with the same `idempotencyKey` return the original result
- **Admin Routes**: Admin-only endpoints now enforce role checks at the middleware level — previously only checked in route handlers
- **Refresh Token Rotation**: Refresh tokens are now rotated on every use — the old token is immediately revoked
- **Account Lockout**: Failed login attempts trigger account lockout after threshold — clients must handle 423 responses

---

### Known Issues

- **Turbopack Stability**: The development server (Turbopack) may crash intermittently in sandboxed environments — use `--webpack` flag for improved stability
- **SQLite Scalability**: The default SQLite database has a recommended threshold of 1GB — for production workloads exceeding this, migration to PostgreSQL is recommended
- **Google OAuth**: Browser-based Google OAuth flow requires a public domain — testing in local/sandbox environments requires the Google OAuth callback URL to be accessible
- **WebSocket Reconnection**: Real-time event streams (SSE) may require manual reconnection after extended idle periods (>5 minutes)
- **Mobile Drag-and-Drop**: Pipeline card drag-and-drop may have reduced precision on touch devices — use the stage dropdown as an alternative
- **PDF Invoice Generation**: Invoice PDF generation requires the `sharp` native module which may need additional system dependencies on some Linux distributions

---

### Migration Guide (v2.x → v3.0)

1. **Update environment variables**: Review `.env.example` for 20+ new required variables including `JWT_SECRET`, `SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD`
2. **Database migration**: Run `bun run db:push` to apply the updated schema with new tables and indexes
3. **Update API clients**: All API calls must now include `Authorization: Bearer <token>` or `x-api-key: <key>` header
4. **Handle rate limiting**: Implement retry logic with exponential backoff for 429 responses
5. **Webhook endpoints**: Ensure your Stripe/Razorpay webhook endpoints are configured with the correct signing secrets
6. **Refresh token rotation**: Update clients to save the new refresh token returned by `POST /api/auth/refresh`

---

*Format: [Keep a Changelog](https://keepachangelog.com/) • [Semantic Versioning](https://semver.org/)*
