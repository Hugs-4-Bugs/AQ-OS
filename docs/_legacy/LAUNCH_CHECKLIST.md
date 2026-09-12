# AcquisitionOS — Pre-Launch Verification Checklist

Complete pre-launch verification checklist. Every item must be checked off before production launch. Any blocking issues must be resolved before proceeding to Go/No-Go decision.

---

## Table of Contents

1. [Infrastructure](#1-infrastructure)
2. [Security](#2-security)
3. [Authentication](#3-authentication)
4. [Integrations](#4-integrations)
5. [Payments](#5-payments)
6. [AI Features](#6-ai-features)
7. [Workflows](#7-workflows)
8. [Analytics](#8-analytics)
9. [Compliance](#9-compliance)
10. [Performance](#10-performance)
11. [Accessibility](#11-accessibility)
12. [Monitoring](#12-monitoring)
13. [Documentation](#13-documentation)
14. [Go/No-Go Decision](#14-gono-go-decision)

---

## 1. Infrastructure

### DNS & Networking

- [ ] **DNS records configured** — A record pointing to production server IP
- [ ] **DNS propagation verified** — `dig app.acquisitionos.com` resolves correctly
- [ ] **CDN configured** — Cloudflare or similar CDN in front of origin
- [ ] **CDN caching rules** — Static assets cached, API routes bypassed
- [ ] **CDN purge tested** — Can purge cache when needed
- [ ] **Subdomains configured** — `app.`, `staging.`, `grafana.` (if applicable)
- [ ] **MX records set** — If sending email from custom domain

### SSL/TLS

- [ ] **SSL certificate installed** — Valid for all subdomains
- [ ] **TLS 1.2+ only** — TLS 1.0 and 1.1 disabled
- [ ] **HSTS header enabled** — `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
- [ ] **HSTS preloading submitted** — To hstspreload.org
- [ ] **Certificate auto-renewal** — Let's Encrypt or Cloudflare managed
- [ ] **Mixed content check** — No HTTP resources on HTTPS pages
- [ ] **SSL Labs test** — Rating A or A+ (https://www.ssllabs.com/ssltest/)

### Server & Containers

- [ ] **Docker images built** — Frontend and backend images in registry
- [ ] **Docker Compose verified** — All services start and remain healthy
- [ ] **Container health checks** — All services have health check endpoints
- [ ] **Container resource limits** — Memory and CPU limits set for all services
- [ ] **Container restart policies** — `restart: always` for production services
- [ ] **Non-root containers** — Docker images run as non-root user
- [ ] **Server OS patched** — All security updates applied
- [ ] **SSH key-based auth** — Password authentication disabled
- [ ] **Fail2ban configured** — SSH brute-force protection active

### Backup Schedule

- [ ] **Database backups automated** — Daily full backup at 2 AM
- [ ] **Redis persistence** — RDB + AOF enabled
- [ ] **File upload backups** — S3 backup sync configured
- [ ] **Backup retention policy** — 30-day retention with offsite copy
- [ ] **Backup restoration tested** — Successfully restored from backup
- [ ] **Backup monitoring** — Alert on backup failure
- [ ] **WAL archiving** — Point-in-time recovery capability

---

## 2. Security

### Rate Limiting

- [ ] **General API rate limiting** — 200 requests/minute per IP
- [ ] **Auth endpoint rate limiting** — 5 requests/minute per IP
- [ ] **AI endpoint rate limiting** — 30 requests/minute per user
- [ ] **Scraping rate limiting** — 10 requests/minute per user
- [ ] **Webhook rate limiting** — 100 requests/minute per IP
- [ ] **Rate limit headers** — `X-RateLimit-Limit`, `X-RateLimit-Remaining` returned
- [ ] **Rate limit exceeded response** — 429 with `Retry-After` header

### CORS & CSRF

- [ ] **CORS configured** — Only allowed origins accepted (`ALLOWED_ORIGINS`)
- [ ] **CORS credentials** — `credentials: true` only for same-origin
- [ ] **CSRF tokens** — All state-changing requests require CSRF token
- [ ] **SameSite cookies** — `SameSite=Strict` or `Lax` for all cookies
- [ ] **CORS preflight** — OPTIONS requests handled correctly
- [ ] **Wildcard CORS disabled** — No `Access-Control-Allow-Origin: *` in production

### Security Headers

- [ ] `X-Frame-Options: DENY` — Prevent clickjacking
- [ ] `X-Content-Type-Options: nosniff` — Prevent MIME sniffing
- [ ] `X-XSS-Protection: 1; mode=block` — XSS filter
- [ ] `Referrer-Policy: strict-origin-when-cross-origin` — Limit referrer data
- [ ] `Permissions-Policy: camera=(), microphone=(), geolocation=()` — Restrict features
- [ ] `Content-Security-Policy` — Restrict script/style sources (if configured)
- [ ] `Strict-Transport-Security` — HSTS with preload

### Secrets Management

- [ ] **No secrets in code** — No API keys, passwords in source code
- [ ] **Secrets in environment** — All secrets via `.env` or secrets manager
- [ ] **Secret rotation schedule** — Documented in SECRETS_REFERENCE.md
- [ ] **JWT secrets strong** — ≥64-byte base64 strings
- [ ] **Encryption key set** — `TOKEN_ENCRYPTION_KEY` for OAuth tokens
- [ ] **Dev secrets different** — Production uses different secrets than development
- [ ] **GitHub Secrets configured** — All CI/CD secrets set in repository settings

---

## 3. Authentication

### Signup Flow

- [ ] **Email signup** — Users can register with email/password
- [ ] **Email verification** — Verification email sent and OTP works
- [ ] **Password strength** — Minimum 8 chars, 1 uppercase, 1 number
- [ ] **Duplicate email handling** — Clear error for existing email
- [ ] **Signup rate limiting** — Prevent mass account creation
- [ ] **Welcome email** — Sent after successful verification

### Login Flow

- [ ] **Email/password login** — Correct credentials grant access
- [ ] **Wrong password** — Clear error, attempt counting
- [ ] **Account lockout** — After 5 failed attempts, lock for 15 min
- [ ] **Remember me** — Extended session with refresh token
- [ ] **Concurrent sessions** — Multiple sessions handled correctly

### OTP Login

- [ ] **OTP request** — Sent to registered email
- [ ] **OTP verification** — Correct OTP grants access
- [ ] **OTP expiry** — OTP expires after configured time
- [ ] **OTP attempt limit** — Max 5 attempts before lockout
- [ ] **OTP not in response** — In production, OTP not returned in API response

### Magic Link

- [ ] **Magic link request** — Email sent with login link
- [ ] **Magic link verification** — Clicking link logs user in
- [ ] **Magic link expiry** — Link expires after configured time
- [ ] **Magic link one-time use** — Cannot reuse link

### OAuth (Google)

- [ ] **Google OAuth flow** — Redirect to Google, callback works
- [ ] **OAuth account linking** — Existing email accounts linked
- [ ] **OAuth error handling** — Denied permissions handled gracefully
- [ ] **OAuth scope minimal** — Only `openid`, `profile`, `email` requested

### MFA (Multi-Factor Authentication)

- [ ] **TOTP setup** — QR code generated correctly
- [ ] **TOTP verification** — Codes from authenticator app work
- [ ] **Backup codes** — Generated and displayed during setup
- [ ] **MFA enforcement** — Required after setup
- [ ] **MFA bypass** — Recovery flow for lost authenticator

### Session Management

- [ ] **Access token expiry** — 15 minutes
- [ ] **Refresh token expiry** — 30 days
- [ ] **Token refresh** — Silent refresh works
- [ ] **Session revocation** — Can revoke all sessions
- [ ] **Device tracking** — Login history shows device and IP
- [ ] **Suspicious login detection** — New device/country triggers alert

---

## 4. Integrations

### Gmail Connection

- [ ] **OAuth flow** — Google OAuth for Gmail API works
- [ ] **Token encryption** — Access/refresh tokens encrypted at rest
- [ ] **Token refresh** — Expired tokens refreshed automatically
- [ ] **Email reading** — Can read inbox messages
- [ ] **Email sending** — Can send emails via Gmail
- [ ] **Pub/Sub notifications** — Real-time inbox notifications
- [ ] **Label management** — AcquisitionOS label created in Gmail
- [ ] **Token revocation** — Disconnect removes tokens

### Telegram Connection

- [ ] **Bot setup** — Bot created and token configured
- [ ] **Webhook configuration** — Telegram webhook endpoint working
- [ ] **Message sending** — Can send messages to users
- [ ] **Message receiving** — Can receive and process user messages
- [ ] **Bot commands** — `/start`, `/help`, etc. working
- [ ] **Connection flow** — Users can link their Telegram account

### WhatsApp Connection

- [ ] **Twilio/Meta setup** — WhatsApp Business API configured
- [ ] **Webhook verification** — Meta webhook verify token works
- [ ] **Message sending** — Can send WhatsApp messages
- [ ] **Message receiving** — Can receive and process messages
- [ ] **Template messages** — Pre-approved templates working
- [ ] **Monthly quota** — Quota tracking and enforcement

---

## 5. Payments

### Stripe Integration

- [ ] **Live mode** — Using `sk_live_*` keys
- [ ] **Webhook endpoint** — Registered in Stripe Dashboard
- [ ] **Webhook signature** — Verified with `whsec_*` secret
- [ ] **Payment intent** — Can create and confirm payments
- [ ] **Subscription creation** — Monthly and yearly plans work
- [ ] **Subscription cancellation** — Cancel at period end works
- [ ] **Invoice generation** — PDF invoices created automatically
- [ ] **Customer portal** — Stripe Customer Portal accessible
- [ ] **Refund processing** — Can issue full and partial refunds
- [ ] **Idempotency keys** — Prevent duplicate charges

### Razorpay Integration

- [ ] **Live mode** — Using production keys
- [ ] **Order creation** — Payment orders created correctly
- [ ] **Payment capture** — Payments captured on success
- [ ] **Webhook handling** — Events processed correctly
- [ ] **Signature verification** — HMAC-SHA256 verified
- [ ] **GST calculation** — Tax calculated for Indian users
- [ ] **Refund processing** — Can issue refunds

### Payment Flow

- [ ] **Free trial signup** — 14-day trial starts correctly
- [ ] **Plan upgrade** — Proration calculated correctly
- [ ] **Plan downgrade** — Scheduled at period end
- [ ] **Credit purchase** — Add-on credits work
- [ ] **Coupon codes** — Discount applied correctly
- [ ] **Payment failure** — Grace period and recovery work
- [ ] **Past due handling** — Access restricted after grace period

### Refund Flow

- [ ] **Full refund** — Stripe and Razorpay full refunds work
- [ ] **Partial refund** — Partial amount refunded correctly
- [ ] **Credit reversal** — Credits deducted on refund
- [ ] **Refund receipt** — Email sent to customer
- [ ] **Refund audit** — Logged in CreditsLedger

---

## 6. AI Features

### Lead Chat / Sales Assistant

- [ ] **Chat session creation** — New sessions created correctly
- [ ] **Message send/receive** — Streaming responses work
- [ ] **Context awareness** — Lead context included in prompts
- [ ] **Sales coach mode** — Specialized coaching responses
- [ ] **Credit deduction** — Credits deducted per message
- [ ] **Error handling** — AI failures don't crash the app

### Lead Scoring

- [ ] **Score generation** — All four scores calculated (reply, conversion, urgency, revenue)
- [ ] **Score explanation** — Reasoning provided for each score
- [ ] **Score range** — Scores within 0-100 range
- [ ] **Batch scoring** — Multiple leads can be scored
- [ ] **Score caching** — Results cached to reduce API calls

### Website Analysis

- [ ] **URL analysis** — Can analyze a business website
- [ ] **Screenshot capture** — Website screenshot taken
- [ ] **Weakness detection** — Digital weaknesses identified
- [ ] **Opportunity notes** — Actionable recommendations provided
- [ ] **Tech stack detection** — Technology stack identified

### Outreach Generation

- [ ] **Email generation** — Subject and body generated
- [ ] **WhatsApp message** — Short-form message generated
- [ ] **LinkedIn message** — Professional message generated
- [ ] **Follow-up sequences** — Multi-step follow-ups generated
- [ ] **Tone customization** — Outreach style adapts to settings

### AI Cost Tracking

- [ ] **Cost per request** — AI API costs tracked per request
- [ ] **Cost per user** — Aggregated costs per user
- [ ] **Cost alerts** — Alerts when approaching budget
- [ ] **Provider fallback** — Switches to backup provider on failure

---

## 7. Workflows

### Trigger Types

- [ ] **Lead stage change** — Workflow triggers on stage transition
- [ ] **Lead reply** — Workflow triggers when lead replies
- [ ] **Score change** — Workflow triggers when score crosses threshold
- [ ] **Manual trigger** — User can manually trigger workflow
- [ ] **Scheduled trigger** — Cron-based triggers work
- [ ] **Payment received** — Workflow triggers on payment event

### Workflow Execution

- [ ] **Sequential execution** — Steps execute in order
- [ ] **Conditional branching** — If/else conditions evaluated
- [ ] **Delay steps** — Wait steps work correctly
- [ ] **Parallel steps** — Concurrent step execution works
- [ ] **Variable passing** — Data passed between steps
- [ ] **AI action steps** — AI generation steps work

### Retry & Error Handling

- [ ] **Max retries** — Failed steps retry up to 3 times
- [ ] **Retry backoff** — Exponential backoff between retries
- [ ] **Execution timeout** — Workflows timeout after 5 minutes
- [ ] **Partial completion** — Some steps can succeed while others fail
- [ ] **Error notifications** — User notified on workflow failure

### Dead Letter Queue

- [ ] **DLQ capture** — Permanently failed executions captured
- [ ] **DLQ size limit** — Max 500 items per user
- [ ] **DLQ processing** — Can replay or discard DLQ items
- [ ] **DLQ cleanup** — Old items cleaned up automatically

---

## 8. Analytics

### Dashboards

- [ ] **Overview dashboard** — Key metrics displayed
- [ ] **Pipeline analytics** — Stage distribution and conversion rates
- [ ] **Lead analytics** — Source, score, and status breakdown
- [ ] **Deal analytics** — Revenue, close rate, timeline
- [ ] **Activity feed** — Recent actions and events

### Predictions & Anomalies

- [ ] **Revenue predictions** — AI-based revenue forecasting
- [ ] **Anomaly detection** — Unusual patterns flagged
- [ ] **Trend analysis** — Historical trends visualized
- [ ] **Comparison periods** — Compare current vs. previous period

### Insights

- [ ] **Auto-generated insights** — AI generates actionable insights
- [ ] **Lead quality insights** — Scoring patterns and recommendations
- [ ] **Outreach effectiveness** — Response rate analytics
- [ ] **Conversion funnel** — Pipeline conversion visualization

---

## 9. Compliance

### GDPR

- [ ] **Data export** — Users can export all their data (`/api/gdpr/export`)
- [ ] **Data deletion** — Users can request account deletion (`/api/gdpr/delete`)
- [ ] **Consent tracking** — Cookie consent recorded
- [ ] **Consent withdrawal** — Users can withdraw consent
- [ ] **Data Processing Agreement** — DPA available (`/api/gdpr/dpa`)
- [ ] **Privacy policy** — Published and accessible (`/api/gdpr/policies`)
- [ ] **Data retention** — Policies implemented and enforced
- [ ] **Right to rectification** — Users can update their data

### Audit Logging

- [ ] **Auth events** — Login, logout, signup, MFA events logged
- [ ] **Data access** — Read operations on sensitive data logged
- [ ] **Data modification** — Create, update, delete operations logged
- [ ] **Admin actions** — All admin operations logged
- [ ] **Audit log export** — Can export audit logs (`/api/audit/export`)
- [ ] **Log retention** — Retained for compliance period
- [ ] **Tamper protection** — Audit logs cannot be modified

---

## 10. Performance

### Page Load Times

- [ ] **Initial page load** — <3 seconds on 4G connection
- [ ] **Time to Interactive** — <5 seconds on 4G
- [ ] **Largest Contentful Paint** — <2.5 seconds
- [ ] **Cumulative Layout Shift** — <0.1
- [ ] **First Input Delay** — <100ms
- [ ] **Bundle size** — Main JS bundle <300 KB gzipped

### API Latency

- [ ] **Health endpoint** — <50ms P95
- [ ] **Auth endpoints** — <200ms P95
- [ ] **Lead CRUD** — <300ms P95
- [ ] **AI endpoints** — <10s P95 (acceptable for AI)
- [ ] **Search** — <500ms P95
- [ ] **Export** — <5s for 5000 rows

### Database Query Performance

- [ ] **Simple queries** — <10ms average
- [ ] **Complex queries** — <100ms average
- [ ] **Index coverage** — All frequently queried columns indexed
- [ ] **Connection pooling** — PgBouncer configured (production)
- [ ] **N+1 queries** — No N+1 query patterns detected
- [ ] **Query logging** — Slow queries logged and monitored

### Resource Utilization

- [ ] **Memory usage** — <80% under normal load
- [ ] **CPU usage** — <70% under normal load
- [ ] **Database connections** — <50% of pool under normal load
- [ ] **Redis memory** — <70% of max memory
- [ ] **Disk I/O** — No disk bottleneck
- [ ] **Network bandwidth** — No saturation

---

## 11. Accessibility

### WCAG 2.1 AA Compliance

- [ ] **Color contrast** — Minimum 4.5:1 ratio for text
- [ ] **Focus indicators** — Visible focus on all interactive elements
- [ ] **Keyboard navigation** — All features accessible via keyboard
- [ ] **Screen reader** — Tested with VoiceOver (macOS) and NVDA (Windows)
- [ ] **ARIA labels** — Proper ARIA attributes on custom components
- [ ] **Semantic HTML** — Proper heading hierarchy, landmarks, lists
- [ ] **Alt text** — Descriptive alt text on all images
- [ ] **Form labels** — All form inputs have associated labels
- [ ] **Error messages** — Clear, specific error messages
- [ ] **Skip navigation** — Skip-to-content link available

### Mobile Accessibility

- [ ] **Touch targets** — Minimum 44x44px for interactive elements
- [ ] **Font scaling** — App works with 200% font scaling
- [ ] **Orientation** — Works in both portrait and landscape
- [ ] **Swipe gestures** — Alternative to swipe gestures available

---

## 12. Monitoring

### Metrics Endpoint

- [ ] **`/api/metrics`** — Prometheus-compatible metrics exposed
- [ ] **`/api/health`** — Basic health check returns 200
- [ ] **`/api/health/detailed`** — Component-level health checks
- [ ] **Custom metrics** — Application-specific metrics collected

### Health Checks

- [ ] **Database health** — PostgreSQL connection verified
- [ ] **Redis health** — Redis connection verified
- [ ] **Celery health** — Workers active and processing
- [ ] **External APIs** — Third-party service connectivity checked
- [ ] **Disk space** — Adequate free space verified

### Alerting

- [ ] **Prometheus alerts** — 16 alert rules configured
- [ ] **Alertmanager** — Routes alerts to correct channels
- [ ] **Slack integration** — Alerts posted to `#platform-alerts`
- [ ] **PagerDuty** — P1 alerts trigger PagerDuty
- [ ] **Email alerts** — Critical alerts sent via email
- [ ] **Alert suppression** — Duplicate alerts suppressed

### Dashboards

- [ ] **App Overview** — Request rate, error rate, latency
- [ ] **Infrastructure** — CPU, memory, disk, network
- [ ] **Database** — Connections, queries, replication
- [ ] **Redis** — Memory, keyspace, pub/sub
- [ ] **Celery** — Queue depth, task duration, failures

---

## 13. Documentation

### Required Documentation

- [ ] **ENV_SETUP_GUIDE.md** — All environment variables documented
- [ ] **SECRETS_REFERENCE.md** — All secrets with rotation procedures
- [ ] **PRODUCTION_DEPLOYMENT_GUIDE.md** — Complete deployment guide
- [ ] **RUNBOOK.md** — Operational runbook with incident procedures
- [ ] **DISASTER_RECOVERY.md** — Disaster recovery plan
- [ ] **MONITORING_GUIDE.md** — Monitoring and alerting documentation
- [ ] **OAUTH_SETUP_GUIDE.md** — OAuth setup instructions
- [ ] **WEBHOOK_SETUP_GUIDE.md** — Webhook configuration guide
- [ ] **LAUNCH_CHECKLIST.md** — This checklist (meta, but verify)

### User-Facing Documentation

- [ ] **Help center** — FAQ and knowledge base
- [ ] **API documentation** — Endpoint reference (if public API)
- [ ] **Onboarding guide** — Step-by-step for new users
- [ ] **Billing FAQ** — Common billing questions answered

---

## 14. Go/No-Go Decision

### Go Criteria

All of the following must be met for a **GO** decision:

| # | Criteria | Required | Status |
|---|---|---|---|
| 1 | All P0/P1 bugs resolved | Yes | ☐ |
| 2 | Security audit passed (no critical findings) | Yes | ☐ |
| 3 | Performance benchmarks met | Yes | ☐ |
| 4 | Payment flow end-to-end tested | Yes | ☐ |
| 5 | Backup and restore tested | Yes | ☐ |
| 6 | Monitoring and alerting verified | Yes | ☐ |
| 7 | SSL/TLS configured and verified | Yes | ☐ |
| 8 | All critical secrets rotated from dev values | Yes | ☐ |
| 9 | GDPR compliance features working | Yes | ☐ |
| 10 | Documentation complete and reviewed | Yes | ☐ |

### No-Go Criteria

Any of the following is an automatic **NO-GO**:

| # | Condition | Blocker? |
|---|---|---|
| 1 | Unresolved critical security vulnerability | ☐ YES |
| 2 | Data loss or corruption in testing | ☐ YES |
| 3 | Payment processing failures in live mode | ☐ YES |
| 4 | Authentication bypass discovered | ☐ YES |
| 5 | Backup restoration fails | ☐ YES |
| 6 | Performance <50% of target | ☐ YES |

### Conditional Go

A **CONDITIONAL GO** may be approved if:

- Non-critical bugs have documented workarounds
- Minor performance issues with a remediation plan
- Documentation has minor gaps with a completion deadline
- Accessibility issues with a remediation timeline

### Decision Process

1. **Checklist Review** — Team reviews all items (30 min)
2. **Risk Assessment** — Evaluate any open issues (15 min)
3. **Decision** — Product + Engineering leads make Go/No-Go call
4. **Communication** — Announce decision to all stakeholders
5. **Launch Window** — Schedule launch time (prefer low-traffic period)

### Post-Launch Verification (First 30 Minutes)

- [ ] Health check returns 200
- [ ] First real user signup completes
- [ ] First real payment processes
- [ ] AI features respond correctly
- [ ] WebSocket notifications deliver
- [ ] Error rate <1%
- [ ] No Sentry alerts above normal
- [ ] Grafana dashboards show expected traffic

### Post-Launch Verification (First 24 Hours)

- [ ] Error rate remains <2%
- [ ] No critical alerts triggered
- [ ] Payment success rate >99%
- [ ] User feedback positive
- [ ] Backup completed successfully
- [ ] All monitoring stable
