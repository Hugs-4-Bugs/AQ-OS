> ⚠️ **HISTORICAL DOCUMENT — SUPERSEDED.** This file describes the *abandoned earlier multi-service architecture* (FastAPI + Celery + Redis + dedicated WebSocket service) or an earlier product generation. It is kept only for historical reference and does **not** describe the current system. The verified current architecture is a **single Next.js 16 modular monolith** — see [`docs/02-architecture/SYSTEM-ARCHITECTURE.md`](02-architecture/SYSTEM-ARCHITECTURE.md) and [`docs/deployment/01-architecture.md`](deployment/01-architecture.md). Do not use this document for onboarding, deployment, or due diligence.

---

# AcquisitionOS — Go-Live Checklist

> **Version**: 2.0 | **Last Updated**: 2025-06-18 | **Owner**: Platform Team
>
> Complete this checklist before taking AcquisitionOS to production. Each section must be signed off by the responsible team member. **Do NOT launch if any CRITICAL item is incomplete.**

---

## Table of Contents

1. [Pre-Launch Security Checklist](#1-pre-launch-security-checklist)
2. [Environment Variable Verification](#2-environment-variable-verification)
3. [DNS and SSL Configuration](#3-dns-and-ssl-configuration)
4. [Payment Gateway Testing](#4-payment-gateway-testing)
5. [Email Delivery Verification](#5-email-delivery-verification)
6. [Load Testing Results](#6-load-testing-results)
7. [Monitoring and Alerting Setup](#7-monitoring-and-alerting-setup)
8. [Rollback Plan](#8-rollback-plan)
9. [Communication Plan](#9-communication-plan)

---

## 1. Pre-Launch Security Checklist

### CRITICAL — Must complete before launch

| # | Item | Status | Verified By | Date |
|---|------|--------|------------|------|
| 1.1 | `JWT_SECRET` is set to a strong random value (≥32 bytes) in production | ☐ | | |
| 1.2 | `JWT_SECRET` is NOT the dev fallback `acquisitionos-dev-secret-change-in-production` | ☐ | | |
| 1.3 | Server crashes on startup if `JWT_SECRET` is missing in production (hard-crash guard) | ☐ | | |
| 1.4 | `AUTH_DEV_MODE` is set to `false` in production | ☐ | | |
| 1.5 | `AUTH_BYPASS_EMAIL` is set to `false` in production | ☐ | | |
| 1.6 | `AUTH_DEV_OTP_IN_RESPONSE` is set to `false` in production | ☐ | | |
| 1.7 | `/api/payments/confirm` is blocked in production (returns 403) | ☐ | | |
| 1.8 | `hasFeatureAccess` returns `false` for unknown features (fail-closed) | ☐ | | |
| 1.9 | All cookies use `Secure` flag in production | ☐ | | |
| 1.10 | All cookies use `SameSite=Strict` | ☐ | | |
| 1.11 | Refresh token cookie path is `/api/auth` (not wider) | ☐ | | |
| 1.12 | Passwords hashed with bcrypt (12 rounds) | ☐ | | |
| 1.13 | Brute force protection active (5 attempts → 15-min lockout) | ☐ | | |
| 1.14 | MFA/TOTP flow tested end-to-end (setup → confirm → verify → disable) | ☐ | | |
| 1.15 | CORS configured to allow only production domain | ☐ | | |
| 1.16 | Security headers present (X-Frame-Options, X-Content-Type-Options, CSP) | ☐ | | |
| 1.17 | Rate limiting enabled on auth endpoints | ☐ | | |
| 1.18 | CSRF protection active | ☐ | | |
| 1.19 | Input validation/sanitization on all user inputs | ☐ | | |
| 1.20 | Razorpay webhook signature verification enabled (`RAZORPAY_WEBHOOK_SECRET` set) | ☐ | | |
| 1.21 | Stripe webhook signature verification enabled (`STRIPE_WEBHOOK_SECRET` set) | ☐ | | |

### HIGH — Should complete before launch

| # | Item | Status | Verified By | Date |
|---|------|--------|------------|------|
| 1.22 | Security scan completed (`scripts/security-scan.ts`) with no critical findings | ☐ | | |
| 1.23 | No hardcoded API keys or secrets in source code | ☐ | | |
| 1.24 | `.env` file is in `.gitignore` | ☐ | | |
| 1.25 | Database file (`*.db`) is in `.gitignore` | ☐ | | |
| 1.26 | Suspicious login detection tested (new IP/device alerts) | ☐ | | |
| 1.27 | Account lockout recovery procedure documented and tested | ☐ | | |
| 1.28 | GDPR endpoints tested (export, delete, consent, DPA) | ☐ | | |
| 1.29 | Cookie consent banner functional | ☐ | | |
| 1.30 | Privacy settings accessible to users | ☐ | | |

### Verification Commands

```bash
# Verify JWT_SECRET is set and not the dev default
echo $JWT_SECRET | wc -c  # Should be > 44 characters (base64 of 32+ bytes)
echo $JWT_SECRET | rg "acquisitionos-dev-secret" && echo "FAIL: Using dev secret" || echo "OK"

# Verify auth dev mode is off
echo $AUTH_DEV_MODE  # Should be empty or "false"
echo $AUTH_BYPASS_EMAIL  # Should be empty or "false"

# Test that confirm endpoint is blocked in production
curl -X POST https://app.acquisitionos.com/api/payments/confirm \
  -H "Content-Type: application/json" \
  -d '{"paymentOrderId":"test","providerPaymentId":"test"}'
# Expected: 403 Forbidden

# Verify security headers
curl -I https://app.acquisitionos.com/ | rg -i "x-frame|x-content|strict-transport|content-security"

# Verify CORS
curl -H "Origin: https://evil.com" -I https://app.acquisitionos.com/api/health
# Should NOT include Access-Control-Allow-Origin: https://evil.com
```

---

## 2. Environment Variable Verification

### Required Variables

| # | Variable | Purpose | Set? | Valid? |
|---|----------|---------|------|--------|
| 2.1 | `DATABASE_URL` | PostgreSQL connection string (prod) or SQLite path (dev) | ☐ | ☐ |
| 2.2 | `JWT_SECRET` | JWT signing key (≥32 bytes random) | ☐ | ☐ |
| 2.3 | `RAZORPAY_KEY_ID` | Razorpay public key | ☐ | ☐ |
| 2.4 | `RAZORPAY_KEY_SECRET` | Razorpay secret key | ☐ | ☐ |
| 2.5 | `RAZORPAY_WEBHOOK_SECRET` | Razorpay webhook signature key | ☐ | ☐ |
| 2.6 | `STRIPE_SECRET_KEY` | Stripe secret key (`sk_live_...`) | ☐ | ☐ |
| 2.7 | `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret (`whsec_...`) | ☐ | ☐ |
| 2.8 | `NODE_ENV` | Must be `production` | ☐ | ☐ |
| 2.9 | `ZAI_API_KEY` | Z-AI SDK key for AI features | ☐ | ☐ |

### Payment Variables

| # | Variable | Purpose | Set? | Valid? |
|---|----------|---------|------|--------|
| 2.10 | `STRIPE_PRICE_PRO_MONTHLY` | Stripe Price ID for Pro monthly | ☐ | ☐ |
| 2.11 | `STRIPE_PRICE_PRO_YEARLY` | Stripe Price ID for Pro yearly | ☐ | ☐ |
| 2.12 | `STRIPE_PRICE_ELITE_MONTHLY` | Stripe Price ID for Elite monthly | ☐ | ☐ |
| 2.13 | `STRIPE_PRICE_ELITE_YEARLY` | Stripe Price ID for Elite yearly | ☐ | ☐ |

### Email Variables

| # | Variable | Purpose | Set? | Valid? |
|---|----------|---------|------|--------|
| 2.14 | `RESEND_API_KEY` | Resend email API key | ☐ | ☐ |
| 2.15 | `EMAIL_FROM` | Sender email address | ☐ | ☐ |
| 2.16 | `EMAIL_REPLY_TO` | Reply-to email address | ☐ | ☐ |

### Optional but Recommended

| # | Variable | Purpose | Set? | Valid? |
|---|----------|---------|------|--------|
| 2.17 | `GOOGLE_CLIENT_ID` | Google OAuth client ID | ☐ | ☐ |
| 2.18 | `GOOGLE_CLIENT_SECRET` | Google OAuth client secret | ☐ | ☐ |
| 2.19 | `NEXT_PUBLIC_APP_URL` | Public app URL for redirects | ☐ | ☐ |
| 2.20 | `S3_BACKUP_BUCKET` | S3 bucket for automated backups | ☐ | ☐ |
| 2.21 | `SENTRY_DSN` | Sentry error tracking DSN | ☐ | ☐ |
| 2.22 | `NEXT_PUBLIC_SENTRY_DSN` | Sentry frontend DSN | ☐ | ☐ |

### PostgreSQL-Specific (Supabase)

| # | Variable | Purpose | Set? | Valid? |
|---|----------|---------|------|--------|
| 2.23 | `DIRECT_URL` | Supabase direct connection for migrations | ☐ | ☐ |
| 2.24 | `DATABASE_URL` | Supabase pooler URL (`?pgbouncer=true`) | ☐ | ☐ |

### Verification Script

```bash
#!/bin/bash
# Verify all required environment variables are set
REQUIRED_VARS=(
  "DATABASE_URL"
  "JWT_SECRET"
  "RAZORPAY_KEY_ID"
  "RAZORPAY_KEY_SECRET"
  "RAZORPAY_WEBHOOK_SECRET"
  "STRIPE_SECRET_KEY"
  "STRIPE_WEBHOOK_SECRET"
  "NODE_ENV"
  "ZAI_API_KEY"
)

echo "=== Environment Variable Verification ==="
FAIL=0
for var in "${REQUIRED_VARS[@]}"; do
  if [ -z "${!var}" ]; then
    echo "❌ MISSING: $var"
    FAIL=$((FAIL + 1))
  else
    # Don't print secrets, just confirm they're set
    echo "✅ SET: $var (length: ${#!var})"
  fi
done

if [ "$NODE_ENV" != "production" ]; then
  echo "❌ NODE_ENV is not 'production' (current: $NODE_ENV)"
  FAIL=$((FAIL + 1))
fi

if [ -n "$JWT_SECRET" ] && [ "$JWT_SECRET" = "acquisitionos-dev-secret-change-in-production" ]; then
  echo "❌ JWT_SECRET is the insecure dev default!"
  FAIL=$((FAIL + 1))
fi

echo ""
if [ $FAIL -eq 0 ]; then
  echo "✅ All required variables verified"
else
  echo "❌ $FAIL issue(s) found — DO NOT LAUNCH"
fi
```

---

## 3. DNS and SSL Configuration

### DNS Records

| # | Record | Type | Value | Status |
|---|--------|------|-------|--------|
| 3.1 | `app.acquisitionos.com` | A / CNAME | Load balancer / Vercel | ☐ |
| 3.2 | `staging.acquisitionos.com` | A / CNAME | Staging environment | ☐ |
| 3.3 | `grafana.acquisitionos.com` | A / CNAME | Monitoring server | ☐ |
| 3.4 | `api.acquisitionos.com` (optional) | A / CNAME | API server | ☐ |

### SSL/TLS Configuration

| # | Item | Status | Notes |
|---|------|--------|-------|
| 3.5 | SSL certificate provisioned for `app.acquisitionos.com` | ☐ | Let's Encrypt via Certbot or Cloudflare |
| 3.6 | SSL certificate auto-renewal configured | ☐ | Certbot cron or Cloudflare managed |
| 3.7 | HSTS header enabled (`Strict-Transport-Security`) | ☐ | `max-age=31536000; includeSubDomains` |
| 3.8 | TLS 1.2+ only (TLS 1.0/1.1 disabled) | ☐ | Check via `ssllabs.com` |
| 3.9 | HTTP → HTTPS redirect configured | ☐ | Nginx config or Cloudflare rule |
| 3.10 | SSL certificate covers all subdomains | ☐ | Wildcard or SAN cert |

### Domain Verification for Payment Providers

| # | Item | Status | Notes |
|---|------|--------|-------|
| 3.11 | Stripe domain verification completed | ☐ | Required for Apple Pay / Google Pay |
| 3.12 | Razorpay domain whitelisted | ☐ | In Razorpay Dashboard → Settings |
| 3.13 | Stripe Apple Pay domain registered | ☐ | Stripe Dashboard → Apple Pay |
| 3.14 | Google OAuth redirect URI includes production domain | ☐ | Google Cloud Console → APIs → Credentials |

### Verification Commands

```bash
# Check SSL certificate
openssl s_client -connect app.acquisitionos.com:443 -servername app.acquisitionos.com < /dev/null 2>/dev/null | openssl x509 -noout -dates -subject

# Check HTTP redirect
curl -I http://app.acquisitionos.com/ 2>/dev/null | rg "301|302|Location"

# Check HSTS
curl -I https://app.acquisitionos.com/ | rg -i "strict-transport"

# Full SSL test
# Visit: https://www.ssllabs.com/ssltest/analyze.html?d=app.acquisitionos.com
```

---

## 4. Payment Gateway Testing

### Razorpay Testing (India Payments)

| # | Test Case | Status | Result |
|---|-----------|--------|--------|
| 4.1 | Test card payment succeeds (4111 1111 1111 1111) | ☐ | |
| 4.2 | Test UPI payment succeeds | ☐ | |
| 4.3 | Test netbanking payment succeeds | ☐ | |
| 4.4 | Test wallet payment succeeds | ☐ | |
| 4.5 | Test failed payment (card decline) | ☐ | |
| 4.6 | `payment.captured` webhook received and processed | ☐ | |
| 4.7 | `payment.failed` webhook received and processed | ☐ | |
| 4.8 | PaymentOrder created with correct amount + GST | ☐ | |
| 4.9 | Subscription activated after successful payment | ☐ | |
| 4.10 | User plan + credits updated after payment | ☐ | |
| 4.11 | Invoice generated after payment | ☐ | |
| 4.12 | Coupon code applies correct discount | ☐ | |
| 4.13 | Coupon usage incremented only on success (not on order creation) | ☐ | |
| 4.14 | Idempotency: duplicate webhook events handled correctly | ☐ | |
| 4.15 | Webhook signature verification works | ☐ | |

### Stripe Testing (Global Payments)

| # | Test Case | Status | Result |
|---|-----------|--------|--------|
| 4.16 | Test card payment succeeds (4242 4242 4242 4242) | ☐ | |
| 4.17 | Test card payment with 3D Secure | ☐ | |
| 4.18 | Test failed payment (4000 0000 0000 0002) | ☐ | |
| 4.19 | Stripe webhook (`checkout.session.completed`) received | ☐ | |
| 4.20 | Stripe webhook signature verification works | ☐ | |
| 4.21 | Subscription activated after Stripe payment | ☐ | |
| 4.22 | Stripe Customer Portal accessible | ☐ | |
| 4.23 | Apple Pay / Google Pay (if domain verified) | ☐ | |

### Subscription Lifecycle Testing

| # | Test Case | Status | Result |
|---|-----------|--------|--------|
| 4.24 | Upgrade: Free → Pro activates immediately | ☐ | |
| 4.25 | Upgrade: Pro → Elite activates immediately | ☐ | |
| 4.26 | Downgrade: Elite → Pro scheduled for period end | ☐ | |
| 4.27 | Cancel: cancelAtPeriodEnd = true, access continues | ☐ | |
| 4.28 | Reactivate: cancels scheduled cancellation | ☐ | |
| 4.29 | Trial expiry: auto-downgrade to Free after trial ends | ☐ | |
| 4.30 | Credit addon purchase flow works | ☐ | |
| 4.31 | Credit deduction on feature use (lead_discovery, outreach, assistant) | ☐ | |
| 4.32 | Credit balance updates correctly in CreditsLedger | ☐ | |
| 4.33 | Plan gate blocks Pro/Elite features for Free users | ☐ | |
| 4.34 | Credit gate deducts correct credits per feature | ☐ | |

### Production Payment Verification

```bash
# Switch to live keys
# Razorpay: Key ID starts with "rzp_live_"
# Stripe: Key starts with "sk_live_"

# Verify live mode with a small real transaction
# 1. Purchase Pro plan ($29) with a real card
# 2. Verify webhook received and processed
# 3. Verify subscription activated in database
# 4. Verify user plan = 'pro', credits = 500
# 5. Immediately cancel and refund if this was a test
```

---

## 5. Email Delivery Verification

### Email Service Configuration

| # | Item | Status | Notes |
|---|------|--------|-------|
| 5.1 | `RESEND_API_KEY` set and valid | ☐ | |
| 5.2 | `EMAIL_FROM` set (e.g., `AcquisitionOS <noreply@acquisitionos.com>`) | ☐ | |
| 5.3 | DNS SPF record configured for sending domain | ☐ | `v=spf1 include: resend.com ~all` |
| 5.4 | DNS DKIM record configured | ☐ | Provided by Resend |
| 5.5 | DNS DMARC record configured | ☐ | `v=DMARC1; p=none; rua=mailto:dmarc@acquisitionos.com` |
| 5.6 | `AUTH_BYPASS_EMAIL` is `false` in production | ☐ | |

### Email Types to Verify

| # | Email Type | Trigger | Status |
|---|-----------|---------|--------|
| 5.7 | Email verification OTP | User signup | ☐ |
| 5.8 | Login OTP | OTP-based login | ☐ |
| 5.9 | Password reset OTP | Forgot password | ☐ |
| 5.10 | Magic link | Magic link login request | ☐ |
| 5.11 | Payment success notification | Payment completed | ☐ |
| 5.12 | Payment failure notification | Payment failed | ☐ |
| 5.13 | Security alert (suspicious login) | New IP/device detected | ☐ |
| 5.14 | Organization invitation | Team invite sent | ☐ |
| 5.15 | Email reply tracking (pixel) | Email opened by lead | ☐ |
| 5.16 | Email click tracking | Link clicked by lead | ☐ |
| 5.17 | Email bounce notification | Bounce received | ☐ |

### Verification Commands

```bash
# Test email delivery with Resend
curl -X POST https://api.resend.com/emails \
  -H "Authorization: Bearer $RESEND_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "AcquisitionOS <noreply@acquisitionos.com>",
    "to": ["test@example.com"],
    "subject": "Go-Live Email Test",
    "html": "<p>If you received this, email delivery is working.</p>"
  }'

# Check DNS records for email authentication
dig TXT acquisitionos.com | rg "v=spf1"
dig TXT resend._domainkey.acquisitionos.com | rg "v=DKIM"
dig TXT _dmarc.acquisitionos.com | rg "v=DMARC"
```

---

## 6. Load Testing Results

### Load Test Scenarios

| # | Scenario | Target | Result | Pass? |
|---|----------|--------|--------|-------|
| 6.1 | Baseline: 100 concurrent users, 5 min | P95 < 500ms, 0 errors | ☐ | ☐ |
| 6.2 | Normal load: 500 concurrent users, 10 min | P95 < 1s, <0.1% errors | ☐ | ☐ |
| 6.3 | Peak load: 1000 concurrent users, 5 min | P95 < 2s, <1% errors | ☐ | ☐ |
| 6.4 | Stress test: 2000 concurrent users, 5 min | Graceful degradation, no data loss | ☐ | ☐ |
| 6.5 | API load: 500 req/s to `/api/leads` | P95 < 1s | ☐ | ☐ |
| 6.6 | Payment flow: 50 concurrent checkouts | All succeed, webhooks processed | ☐ | ☐ |
| 6.7 | AI features: 20 concurrent discoveries | All complete, <30s each | ☐ | ☐ |
| 6.8 | WebSocket: 500 concurrent connections | All receive real-time updates | ☐ | ☐ |

### Load Test Execution

```bash
# Run load tests
cd /home/z/my-project

# AI feature load test
bun test tests/load/ai-load.test.ts

# Queue load test
bun test tests/load/queue-load.test.ts

# Analytics load test
bun test tests/load/analytics-load.test.ts

# WebSocket load test
bun test tests/load/websocket-load.test.ts
```

### Resource Limits Verified

| # | Resource | Limit | Observed Peak | Pass? |
|---|----------|-------|---------------|-------|
| 6.9 | Frontend memory | 1 GB | ☐ MB | ☐ |
| 6.10 | Backend memory | 1 GB | ☐ MB | ☐ |
| 6.11 | PostgreSQL memory | 2 GB | ☐ MB | ☐ |
| 6.12 | Redis memory | 512 MB | ☐ MB | ☐ |
| 6.13 | Celery worker memory | 1.5 GB | ☐ MB | ☐ |
| 6.14 | CPU utilization | <70% sustained | ☐% | ☐ |
| 6.15 | Disk I/O | No saturation | ☐ | ☐ |

---

## 7. Monitoring and Alerting Setup

### Monitoring Stack

| # | Component | Status | URL |
|---|-----------|--------|-----|
| 7.1 | Prometheus scraping all services | ☐ | http://localhost:9090 |
| 7.2 | Grafana dashboards configured | ☐ | https://grafana.acquisitionos.com |
| 7.3 | Grafana admin password changed from default | ☐ | — |
| 7.4 | Sentry error tracking (frontend + backend) | ☐ | https://sentry.io/organizations/acquisitionos |
| 7.5 | Source maps uploaded to Sentry | ☐ | — |

### Alert Channels Configured

| # | Channel | Status | Destination |
|---|---------|--------|-------------|
| 7.6 | PagerDuty integration for P1/P2 | ☐ | `acquisitionos-oncall` |
| 7.7 | Slack integration for all alerts | ☐ | `#platform-alerts` |
| 7.8 | Email alerts for P1 | ☐ | oncall@acquisitionos.com |

### Critical Alerts Verified

| # | Alert | Test Method | Status |
|---|-------|-------------|--------|
| 7.9 | `HighErrorRate` (>5% 5xx) | Trigger test errors, verify alert fires | ☐ |
| 7.10 | `APIEndpointDown` | Stop a service, verify alert fires within 2 min | ☐ |
| 7.11 | `DatabaseConnectionPoolExhaustion` | — (verify rule exists in Prometheus) | ☐ |
| 7.12 | `RedisDown` | Stop Redis, verify alert fires within 2 min | ☐ |
| 7.13 | `CeleryWorkerDown` | Stop workers, verify alert fires within 5 min | ☐ |
| 7.14 | `DiskSpaceCritical` | — (verify rule exists in Prometheus) | ☐ |
| 7.15 | `MemoryPressureCritical` | — (verify rule exists in Prometheus) | ☐ |

### Dashboards Verified

| # | Dashboard | Panels Working | Status |
|---|-----------|---------------|--------|
| 7.16 | App Overview | Request rate, error rate, latency, active users | ☐ |
| 7.17 | Infrastructure | CPU, memory, disk, network | ☐ |
| 7.18 | Database | Connections, query times, replication lag | ☐ |
| 7.19 | Redis | Memory, keyspace, pub/sub | ☐ |
| 7.20 | Celery | Queue length, task duration, failures | ☐ |

### Health Check Monitoring

```bash
# Set up external health check (e.g., UptimeRobot, Pingdom)
# Monitor: https://app.acquisitionos.com/api/health
# Interval: 1 minute
# Alert on: 2 consecutive failures

# Verify detailed health endpoint
curl -s https://app.acquisitionos.com/api/health/detailed | jq .
```

---

## 8. Rollback Plan

> Full rollback procedures are documented in [ROLLBACK.md](./ROLLBACK.md).

### Quick Rollback Summary

| Scenario | Rollback Action | Downtime |
|----------|----------------|----------|
| Bad frontend deployment | `docker compose rollback frontend` or redeploy previous image | ~2 min |
| Bad backend deployment | `docker compose rollback backend` or redeploy previous image | ~2 min |
| Bad database migration | Run `scripts/backup/migration-rollback.sh` | ~5-15 min |
| Feature flag issue | Toggle flag via database or env var | ~1 min |
| Payment gateway failure | Disable provider in env, restart | ~2 min |
| Total failure | Full restore from backup | ~30 min |

### Rollback Readiness Checklist

| # | Item | Status |
|---|------|--------|
| 8.1 | Previous Docker images available for rollback | ☐ |
| 8.2 | Database backup taken within last 6 hours | ☐ |
| 8.3 | Migration rollback script tested | ☐ |
| 8.4 | Feature flags can be toggled without redeployment | ☐ |
| 8.5 | Emergency shutdown procedure documented | ☐ |
| 8.6 | Post-rollback verification checklist ready | ☐ |

---

## 9. Communication Plan

### Pre-Launch Communication

| # | Action | Channel | Timing | Status |
|---|--------|---------|--------|--------|
| 9.1 | Announce launch date to team | Slack `#general` | T-7 days | ☐ |
| 9.2 | Notify beta users | Email | T-3 days | ☐ |
| 9.3 | Set up status page | statuspage.io | T-7 days | ☐ |
| 9.4 | Brief customer support team | Meeting | T-2 days | ☐ |
| 9.5 | Prepare incident response team | PagerDuty | T-1 day | ☐ |

### Launch Day Communication

| # | Action | Channel | Timing | Owner |
|---|--------|---------|--------|-------|
| 9.6 | "We're going live" announcement | Slack `#general` | T-0 | Platform Lead |
| 9.7 | Monitor dashboards intensively | Grafana | T+0 to T+2h | On-call |
| 9.8 | First 1-hour health check report | Slack `#platform-alerts` | T+1h | On-call |
| 9.9 | Public announcement | Email, social media | T+2h | Marketing |
| 9.10 | First 24-hour retrospective | Meeting | T+24h | Team |

### Incident Communication

| Severity | Internal Channel | External Channel | Update Frequency |
|----------|-----------------|-----------------|-----------------|
| P1 | Slack `#incident-response` + PagerDuty | Status page + Email | Every 15 min |
| P2 | Slack `#incident-response` | Status page | Every 30 min |
| P3 | Slack `#platform-alerts` | — | Every 2 hours |
| P4 | Slack `#platform-alerts` | — | Daily |

### Post-Launch Communication

| # | Action | Channel | Timing | Status |
|---|--------|---------|--------|--------|
| 9.11 | "Launch successful" announcement | Slack + Email | T+4h | ☐ |
| 9.12 | Performance report | Slack `#platform-alerts` | T+24h | ☐ |
| 9.13 | Post-launch retrospective | Meeting | T+72h | ☐ |
| 9.14 | Documentation update | Confluence / Wiki | T+1 week | ☐ |

---

## Sign-Off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Platform Lead | | | |
| Security Lead | | | |
| DevOps Lead | | | |
| Product Owner | | | |
| Engineering Manager | | | |

**Launch Authorization**: All CRITICAL items must be checked before sign-off. Any unchecked HIGH items must have a documented mitigation plan attached.

---

**See also**:
- [RUNBOOK.md](./RUNBOOK.md) — Operational runbook
- [ROLLBACK.md](./ROLLBACK.md) — Rollback procedures
- [INCIDENT_RESPONSE.md](./INCIDENT_RESPONSE.md) — Incident response plan
