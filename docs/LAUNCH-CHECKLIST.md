# AcquisitionOS — Launch Checklist

> **Version**: 2.0 | **Last Updated**: 2026-03-07 | **Owner**: Platform Team

Consolidated launch checklist for AcquisitionOS production release. Complete every section before going live.

> **Detailed References**: [LAUNCH_CHECKLIST.md](./LAUNCH_CHECKLIST.md) (legacy v1) | [GO_LIVE.md](./GO_LIVE.md) | [GO_NO_GO.md](./GO_NO_GO.md) | [FINAL_ENV_CHECKLIST.md](./FINAL_ENV_CHECKLIST.md)

---

## 1. Pre-Launch

### 1.1 Environment Variables

| # | Item | Check | Notes |
|---|------|-------|-------|
| 1 | `NODE_ENV=production` | ☐ | Must not be `development` |
| 2 | `DATABASE_URL` → PostgreSQL | ☐ | `postgresql://user:pass@host:5432/acquisitionos` |
| 3 | `JWT_SECRET` — strong random ≥64 bytes | ☐ | Must NOT be `acquisitionos-dev-secret-change-in-production` |
| 4 | `JWT_REFRESH_SECRET` — strong random | ☐ | Separate from `JWT_SECRET` |
| 5 | `TOKEN_ENCRYPTION_KEY` — Fernet key | ☐ | For OAuth token encryption |
| 6 | `ZAI_API_KEY` | ☐ | Powers all AI features |
| 7 | `NEXT_PUBLIC_APP_URL` | ☐ | `https://app.acquisitionos.com` |
| 8 | `AUTH_DEV_MODE=false` | ☐ | Disables all dev bypasses |
| 9 | `AUTH_AUTO_VERIFY=false` | ☐ | Email verification required |
| 10 | `AUTH_DEV_OTP_IN_RESPONSE=false` | ☐ | OTPs not leaked in API |
| 11 | `AUTH_BYPASS_EMAIL=false` | ☐ | SMTP-only delivery |

### 1.2 Secrets

| # | Item | Check | Notes |
|---|------|-------|-------|
| 1 | `STRIPE_SECRET_KEY` → `sk_live_*` | ☐ | Not `sk_test_*` |
| 2 | `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` → `pk_live_*` | ☐ | Not `pk_test_*` |
| 3 | `STRIPE_WEBHOOK_SECRET` | ☐ | From Stripe webhook settings |
| 4 | `RAZORPAY_KEY_ID` + `RAZORPAY_KEY_SECRET` | ☐ | If accepting Indian payments |
| 5 | `RAZORPAY_WEBHOOK_SECRET` | ☐ | From Razorpay webhook settings |
| 6 | `GOOGLE_CLIENT_SECRET` | ☐ | OAuth sign-in + Gmail integration |
| 7 | `SMTP_PASS` or `RESEND_API_KEY` | ☐ | At least one must be configured |
| 8 | `REDIS_PASSWORD` | ☐ | Production Redis must be authenticated |
| 9 | `POSTGRES_PASSWORD` | ☐ | Strong password, not default |

> **Full Reference**: [SECRETS_REFERENCE.md](./SECRETS_REFERENCE.md) | [ENV_SETUP_GUIDE.md](./ENV_SETUP_GUIDE.md)

### 1.3 Domain, SSL & DNS

| # | Item | Check | Notes |
|---|------|-------|-------|
| 1 | Domain `app.acquisitionos.com` resolves | ☐ | A/AAAA record pointing to server |
| 2 | SSL certificate installed | ☐ | Let's Encrypt or Cloudflare |
| 3 | TLS 1.2+ only, 1.0/1.1 disabled | ☐ | |
| 4 | HSTS header enabled | ☐ | `max-age=63072000; includeSubDomains; preload` |
| 5 | HTTP→HTTPS redirect | ☐ | Configured in Nginx/Caddy |
| 6 | SSL Labs A+ rating | ☐ | https://www.ssllabs.com/ssltest/ |
| 7 | Google OAuth redirect URIs updated | ☐ | `https://app.acquisitionos.com/api/auth/google/callback` |

### 1.4 Database

| # | Item | Check | Notes |
|---|------|-------|-------|
| 1 | Prisma schema pushed to PostgreSQL | ☐ | `npx prisma db push` |
| 2 | Schema matches code (no drift) | ☐ | |
| 3 | Seed data removed | ☐ | No demo@acquisitionos.com with Pro plans |
| 4 | Plan entitlements seeded | ☐ | `bun run scripts/seed-entitlements.ts` |
| 5 | Indexes verified | ☐ | userId, orgId, status fields |
| 6 | Pre-launch backup taken | ☐ | Full DB backup verified restorable |

### 1.5 Email (SMTP)

| # | Item | Check | Notes |
|---|------|-------|-------|
| 1 | SMTP connection works | ☐ | `telnet smtp.gmail.com 587` |
| 2 | Verification email delivers | ☐ | Test signup end-to-end |
| 3 | OTP email delivers | ☐ | |
| 4 | Magic link email delivers | ☐ | |
| 5 | Password reset email delivers | ☐ | |
| 6 | SPF/DKIM/DMARC configured | ☐ | DNS records for sending domain |

### 1.6 OAuth

| # | Item | Check | Notes |
|---|------|-------|-------|
| 1 | Google sign-in end-to-end | ☐ | Click → consent → authenticated |
| 2 | Avatar/name synced from Google | ☐ | |
| 3 | Gmail connect works | ☐ | `/api/integrations/google/connect` |
| 4 | Calendar events visible | ☐ | Shared OAuth flow |
| 5 | Gmail PubSub topic configured (optional) | ☐ | Falls back to polling |

### 1.7 Stripe / Razorpay

| # | Item | Check | Notes |
|---|------|-------|-------|
| 1 | Webhook endpoint registered | ☐ | `https://app.acquisitionos.com/api/payments/webhook/stripe` |
| 2 | Webhook events selected | ☐ | `checkout.session.completed`, `customer.subscription.*`, `invoice.paid`, `charge.refunded` |
| 3 | Webhook signature verification | ☐ | `STRIPE_WEBHOOK_SECRET` set |
| 4 | Customer Portal configured | ☐ | Users can manage subscriptions |
| 5 | Test payment with live card succeeds | ☐ | |
| 6 | `customer.subscription.deleted` handler verified | ☐ | Downgrades to Free correctly |
| 7 | Idempotency verified (duplicate webhooks) | ☐ | No double-processing |

> **Full Reference**: [WEBHOOK_SETUP_GUIDE.md](./WEBHOOK_SETUP_GUIDE.md)

### 1.8 Monitoring

| # | Item | Check | Notes |
|---|------|-------|-------|
| 1 | Sentry DSN configured | ☐ | `SENTRY_DSN` env var set |
| 2 | Source maps uploaded to Sentry | ☐ | During CI/CD build |
| 3 | Prometheus targets configured | ☐ | `monitoring/prometheus/prometheus.yml` |
| 4 | Grafana dashboards imported | ☐ | App Overview + Infrastructure |
| 5 | 16 alert rules active | ☐ | `monitoring/prometheus/alerts.yml` |
| 6 | PagerDuty integration tested | ☐ | P1 alert → page fires |
| 7 | Uptime monitor configured | ☐ | UptimeRobot/Pingdom → `/api/health` |

---

## 2. Security

| # | Item | Check | Notes |
|---|------|-------|-------|
| 1 | JWT secret rotated (not dev default) | ☐ | |
| 2 | CSRF protection active | ☐ | Middleware-level (route-level planned for Phase 15) |
| 3 | Rate limiting active | ☐ | Auth: 5/min, AI: 30/min, General: 200/min |
| 4 | Security headers present | ☐ | X-Frame-Options, X-Content-Type-Options, CSP, HSTS |
| 5 | CORS locked to production domain | ☐ | `app.acquisitionos.com` only |
| 6 | No IDOR vulnerabilities | ☐ | All data scoped to user/org |
| 7 | No mock/stub data in production | ☐ | |
| 8 | `hasFeatureAccess` defaults to deny | ☐ | |
| 9 | `/api/payments/confirm` blocked | ☐ | Returns 403 in production |
| 10 | Docker images scanned (Trivy) | ☐ | No critical CVEs |
| 11 | Security scan completed | ☐ | See [SECURITY_REPORT.md](./SECURITY_REPORT.md) |

---

## 3. Performance

| # | Item | Check | Notes |
|---|------|-------|-------|
| 1 | `next build` succeeds with no warnings | ☐ | |
| 2 | Static assets optimized | ☐ | AVIF/WebP, blur placeholders |
| 3 | Bundle splitting configured | ☐ | webpack split chunks |
| 4 | Image optimization enabled | ☐ | `next/image` with formats |
| 5 | Caching layer active | ☐ | `withApiCache` on insights; Redis for sessions |
| 6 | CDN configured | ☐ | Cloudflare or equivalent |
| 7 | Gzip/Brotli compression enabled | ☐ | Nginx config |
| 8 | Tab lazy loading verified | ☐ | All 12 tabs use `React.lazy()` |

---

## 4. Testing

| # | Item | Check | Notes |
|---|------|-------|-------|
| 1 | Unit tests: 326/333 pass (97.9%) | ☐ | 7 pre-existing failures (mock drift) |
| 2 | Integration tests: all pass | ☐ | Auth, payment, webhook flows |
| 3 | E2E: all 12 dashboard tabs render | ☐ | Agent-browser verified |
| 4 | Security tests: all pass | ☐ | JWT, rate limiting, IDOR, injection |
| 5 | Load test: baseline + normal pass | ☐ | See [LOAD_REPORT.md](./LOAD_REPORT.md) |
| 6 | Smoke tests pass post-deploy | ☐ | Health, auth, payment, AI |

> **Full Reference**: [QA_REPORT.md](./QA_REPORT.md) | [LOAD_REPORT.md](./LOAD_REPORT.md)

---

## 5. Legal

| # | Item | Check | Notes |
|---|------|-------|-------|
| 1 | Privacy Policy live | ☐ | `/legal/privacy` |
| 2 | Terms of Service live | ☐ | `/legal/terms` |
| 3 | Cookie Policy live | ☐ | `/legal/cookies` |
| 4 | Refund Policy live | ☐ | `/legal/refund` |
| 5 | GDPR/DPA live | ☐ | `/legal/gdpr` |
| 6 | AI Disclaimer live | ☐ | `/legal/ai-disclaimer` |
| 7 | Data Retention Policy live | ☐ | `/legal/data-retention` |
| 8 | Cookie consent banner functional | ☐ | Records consent in DB |
| 9 | GDPR export endpoint works | ☐ | `/api/gdpr/export` |
| 10 | GDPR deletion endpoint works | ☐ | `/api/gdpr/delete` |

---

## 6. Monitoring

| # | Item | Check | Notes |
|---|------|-------|-------|
| 1 | `/api/health` returns 200 | ☐ | Basic liveness |
| 2 | `/api/health/detailed` returns component status | ☐ | DB, memory, process |
| 3 | `/api/metrics` exposes Prometheus metrics | ☐ | |
| 4 | Grafana accessible | ☐ | Port 3001 or proxied |
| 5 | Alerts routing to PagerDuty | ☐ | |
| 6 | Status page configured | ☐ | status.acquisitionos.com |

---

## 7. Communication

| # | Item | Check | Notes |
|---|------|-------|-------|
| 1 | Status page live | ☐ | statuspage.io or equivalent |
| 2 | Support email configured | ☐ | support@acquisitionos.com |
| 3 | On-call rotation set up | ☐ | PagerDuty schedule |
| 4 | Incident Slack channel exists | ☐ | `#incident-response` |
| 5 | Launch announcement drafted | ☐ | Email + in-app banner |

---

## 8. Go / No-Go Criteria

### Must-Pass Items (Any failure = NO-GO)

| # | Criteria | Status | Blocker? |
|---|----------|--------|----------|
| 1 | No critical security vulnerabilities (CVE >7.0) | ☐ | YES |
| 2 | All deploy blockers resolved (6 config items) | ☐ | YES |
| 3 | Database backup verified restorable | ☐ | YES |
| 4 | Stripe live mode keys configured | ☐ | YES |
| 5 | SMTP configured and delivering emails | ☐ | YES |
| 6 | JWT_SECRET is not dev default | ☐ | YES |
| 7 | `/api/health` returns 200 in staging | ☐ | YES |
| 8 | No new P1/P2 bugs found in QA | ☐ | YES |
| 9 | SSL certificate valid (>30 days remaining) | ☐ | YES |
| 10 | Google OAuth redirect URIs match production | ☐ | YES |

### Should-Pass Items (Failure = conditional go, tracked)

| # | Criteria | Status |
|---|----------|--------|
| 1 | CSP upgraded to nonce-based (currently `unsafe-eval`) | ☐ |
| 2 | CSRF route-level protection applied | ☐ |
| 3 | Sentry source maps uploaded in CI/CD | ☐ |
| 4 | Rate limiter backed by Redis (currently in-memory) | ☐ |
| 5 | Gmail PubSub configured for real-time inbox | ☐ |
| 6 | Load test passes at 3× baseline | ☐ |

### Decision Authority

| Role | Can Approve GO | Can Abort |
|------|---------------|-----------|
| On-Call Engineer | No | Yes (automatic criteria) |
| Platform Lead | Yes | Yes |
| Engineering Manager | Yes | Yes |
| Product Owner | Advisory | Advisory |

> **Full Go/No-Go Framework**: [GO_NO_GO.md](./GO_NO_GO.md)

---

## Post-Launch (First 24 Hours)

- [ ] Error rate < 2% sustained
- [ ] Payment success rate > 99%
- [ ] No Sentry error spike
- [ ] Grafana dashboards stable
- [ ] First automated backup successful
- [ ] User feedback positive

> **Post-Launch Reference**: [POST_LAUNCH.md](./POST_LAUNCH.md)
