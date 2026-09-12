# AcquisitionOS — Support Guide

> **Version**: 1.0 | **Last Updated**: 2026-03-06 | **Owner**: Platform Team

Operational support reference for AcquisitionOS. Covers support channels, escalation, common issues, debug procedures, and administrative operations.

---

## Table of Contents

1. [Support Channels](#1-support-channels)
2. [Escalation Matrix](#2-escalation-matrix)
3. [Common Issues and Solutions](#3-common-issues-and-solutions)
4. [Debug Procedures by Integration](#4-debug-procedures-by-integration)
5. [Secret Rotation](#5-secret-rotation)
6. [Force-Logout a User](#6-force-logout-a-user)
7. [Add Credits Manually](#7-add-credits-manually)
8. [Cancel a Subscription](#8-cancel-a-subscription)

---

## 1. Support Channels

### 1.1 Channel Overview

| Channel | Endpoint | Use Case | SLA |
|---------|----------|----------|-----|
| **Email** | support@acquisitionos.com | General support, bug reports, billing questions | See SLA.md |
| **In-app help** | Settings → Help & Feedback | Feature questions, in-context issues | See SLA.md |
| **Documentation** | docs.acquisitionos.com | Self-service, FAQs, guides | N/A |
| **Status page** | status.acquisitionos.com | Service status, incidents, maintenance | N/A |
| **Emergency** | PagerDuty (on-call) | P0/P1 incidents only | 15 min |

### 1.2 Channel Routing

```
User Request
    |
    ├── Question/How-to ──────→ Documentation → Email if unresolved
    |
    ├── Bug report ───────────→ Email → Triage → P0-P4 → Assign
    |
    ├── Billing issue ────────→ Email (billing tag) → Finance team
    |
    ├── Security concern ────→ security@acquisitionos.com → Security team
    |
    └── Feature request ──────→ Email → Product backlog
```

### 1.3 Internal Communication

| Channel | Purpose | Who |
|---------|---------|-----|
| Slack `#support` | Support requests and discussion | Support team |
| Slack `#incident-response` | Active incidents | On-call + engineers |
| Slack `#platform-alerts` | System alerts (automated) | All engineering |
| PagerDuty | P0/P1 on-call escalation | On-call engineer |

---

## 2. Escalation Matrix

### 2.1 Tier Structure

| Tier | Role | Handles | Escalates To |
|------|------|---------|-------------|
| **L1** | Support Engineer | FAQ, account issues, password resets, basic billing | L2 |
| **L2** | Senior Engineer | Technical issues, integration debugging, DB queries | L3 |
| **L3** | Engineering Lead | Architecture issues, security incidents, data recovery | CTO |
| **L4** | CTO / VP Eng | Business-critical decisions, vendor escalations | CEO |

### 2.2 Escalation Triggers

| Condition | From → To | Timeline |
|-----------|-----------|----------|
| L1 cannot resolve within 30 min | L1 → L2 | Automatic |
| Technical debugging needed | L1 → L2 | Immediate |
| Potential data loss or security breach | Any → L3 | Immediate |
| L2 cannot resolve within 2 hours | L2 → L3 | Automatic |
| Payment provider escalation needed | L2 → L3 → Vendor | Within 4 hours |
| Customer demanding manager | Any → L3 | Within 1 hour |
| SLA breach imminent | L2 → L3 | 2x SLA threshold |

### 2.3 On-Call Rotation

- **Primary on-call**: L2 engineer ( PagerDuty )
- **Secondary on-call**: L3 engineer (backup)
- **Rotation**: Weekly, Monday 9 AM IST
- **Handoff**: Sunday 6 PM IST — review open issues, known incidents

---

## 3. Common Issues and Solutions

### 3.1 Authentication Issues

#### "I can't log in"

| Step | Check | Action |
|------|-------|--------|
| 1 | Email verified? | Check `User.emailVerified` in DB. If false, resend verification email |
| 2 | Account locked? | Check `User.otpAttemptCount` >5 and `User.otpLockedUntil` > NOW |
| 3 | Password correct? | Try password reset flow. Check bcrypt hash matches |
| 4 | Google OAuth? | Check `GOOGLE_CLIENT_ID`/`SECRET` set. Check redirect URI matches |
| 5 | Session expired? | Access token expires in 15 min. Try refresh. Check `UserSession.isRevoked` |

#### "I'm not receiving verification/OTP emails"

| Step | Check | Action |
|------|-------|--------|
| 1 | SMTP configured? | Check `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` in env |
| 2 | Email in spam? | Ask user to check spam/junk folder |
| 3 | Email bounce? | Check `EmailBounce` table for user's email |
| 4 | AUTH_DEV_MODE? | Must be `false` in production. If `true`, emails go to console |
| 5 | Rate limited? | OTP requests limited to 5/min per email |

#### "Google OAuth not working"

| Step | Check | Action |
|------|-------|--------|
| 1 | Env vars set? | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `NEXT_PUBLIC_GOOGLE_CLIENT_ID` |
| 2 | Redirect URI matches? | Must be `https://app.acquisitionos.com/api/auth/google/callback` |
| 3 | Consent screen configured? | Google Cloud Console → OAuth consent screen |
| 4 | Browser blocking popups? | User must allow popups for Google OAuth |
| 5 | State parameter valid? | Frontend encodes `window.location.origin` into state; backend decodes for redirect_uri |

### 3.2 Billing Issues

#### "I paid but still on Free plan"

| Step | Check | Action |
|------|-------|--------|
| 1 | PaymentOrder status? | `SELECT * FROM "PaymentOrder" WHERE "userId" = '...' ORDER BY "createdAt" DESC LIMIT 5` |
| 2 | Webhook received? | `SELECT * FROM "PaymentWebhook" WHERE "userId" = '...' AND processed = true` |
| 3 | Subscription created? | `SELECT * FROM "Subscription" WHERE "userId" = '...'` |
| 4 | User plan correct? | `SELECT plan, credits, "creditsMonthly" FROM "User" WHERE id = '...'` |
| 5 | Manual fix needed? | See [Section 7](#7-add-credits-manually) and [RUNBOOK.md](./RUNBOOK.md#75-manual-subscription-fix) |

#### "My credits weren't added"

| Step | Check | Action |
|------|-------|--------|
| 1 | CreditsLedger entry? | `SELECT * FROM "CreditsLedger" WHERE "userId" = '...' ORDER BY "createdAt" DESC LIMIT 10` |
| 2 | Webhook processed? | Check PaymentWebhook for `invoice.paid` event |
| 3 | Monthly reset? | `invoice.paid` triggers `resetMonthlyCredits` — check subscription period |
| 4 | Credit addon? | `POST /api/payments/credit-addons` must use `withAuth` and call `addCreditAddon()` |

#### "I was charged twice"

| Step | Check | Action |
|------|-------|--------|
| 1 | Duplicate PaymentOrders? | Search by user + amount + date range |
| 2 | Duplicate webhook? | Check PaymentWebhook idempotency — same event ID should not process twice |
| 3 | Stripe duplicate? | Check Stripe Dashboard → Payments for duplicates |
| 4 | Refund | Process refund via Stripe Dashboard or `/api/payments/refund` |

### 3.3 Integration Issues

#### "Gmail won't connect"

| Step | Check | Action |
|------|-------|--------|
| 1 | Google OAuth configured? | `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` must be set |
| 2 | Gmail API enabled? | Google Cloud Console → APIs → Gmail API |
| 3 | Correct scopes? | OAuth must include `https://mail.google.com/` |
| 4 | Token expired? | `getValidGmailAccessToken()` auto-refreshes with 5-min buffer |
| 5 | Token in DB? | Check `EmailAccount` table for user's tokens |
| 6 | Consent screen? | User must grant access when redirected |

#### "Telegram bot not responding"

| Step | Check | Action |
|------|-------|--------|
| 1 | Bot token set? | `TELEGRAM_BOT_TOKEN` in environment |
| 2 | Webhook configured? | `curl https://api.telegram.org/bot<TOKEN>/getWebhookInfo` |
| 3 | Webhook URL correct? | Must point to `https://app.acquisitionos.com/api/integrations/telegram/webhook` |
| 4 | Bot is alive? | Send `/start` to bot — should respond |
| 5 | Link code flow? | User generates code via `POST /api/settings/integrations/telegram/link`, sends to bot |

#### "WhatsApp not working"

| Step | Check | Action |
|------|-------|--------|
| 1 | Meta/Twilio configured? | `META_WHATSAPP_TOKEN` or `TWILIO_AUTH_TOKEN` set |
| 2 | Webhook verified? | Meta webhook verify token matches `META_WEBHOOK_VERIFY_TOKEN` |
| 3 | Templates approved? | WhatsApp message templates must be pre-approved by Meta |
| 4 | Phone number verified? | Test number registered in Meta Business Settings |

### 3.4 Credits Issues

#### "Credits aren't deducting"

| Step | Check | Action |
|------|-------|--------|
| 1 | User has credits? | `SELECT credits FROM "User" WHERE id = '...'` |
| 2 | Feature gated? | Credit gate checks `hasFeatureAccess` before deduction |
| 3 | Credit cost correct? | Verify CREDIT_COSTS in credit-service.ts matches subscription-store.ts |
| 4 | CreditsLedger entry? | Every deduction should create a ledger entry |
| 5 | Float precision? | Credits are Float type — check for rounding issues with small amounts (0.2) |

#### "Wrong credit cost charged"

- Credit costs: `lead_discovery=1`, `deep_analysis=1.5`, `outreach_message=0.2`, `outreach_sequence=0.5`, `sales_coaching=0.5`, `proposal_generation=1.5`, `competitor_analysis=1.5`, `data_export=0.5`
- If mismatch: check both `src/lib/credit-service.ts` and `src/store/subscription-store.ts`

### 3.5 Lead Search Issues

#### "Lead search returns no results"

| Step | Check | Action |
|------|-------|--------|
| 1 | ZAI_API_KEY set? | Required for web search via z-ai-web-dev-sdk |
| 2 | Niche too narrow? | Try broader search terms |
| 3 | Credits available? | Need ≥1 credit per lead discovery |
| 4 | Service logs? | Check lead-discovery-service.ts logs for errors |
| 5 | Rate limited? | AI endpoint rate limit: 30 req/min per user |

---

## 4. Debug Procedures by Integration

### 4.1 Gmail Debug Flow

```
1. Check env vars: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
2. Test OAuth redirect: GET /api/integrations/google/connect (authenticated)
3. Check callback: GET /api/integrations/google/callback?code=...&state=...
4. Verify tokens in DB: SELECT * FROM "EmailAccount" WHERE "userId" = '...'
5. Test token refresh: getValidGmailAccessToken() — auto-refreshes if expired
6. Test inbox: GET /api/gmail/inbox (authenticated)
7. Test send: POST /api/gmail/send (authenticated)
8. Check Gmail API quotas: https://console.cloud.google.com/apis/api/gmail.googleapis.com/quotas
```

### 4.2 Google Calendar Debug Flow

```
1. Calendar shares OAuth with Gmail (same scopes)
2. Check tokens: SELECT * FROM "GoogleCalendarToken" WHERE "userId" = '...'
3. Test list: GET /api/calendar/events (authenticated)
4. Test create: POST /api/calendar/events (authenticated)
5. Test reminders: GET /api/calendar/reminders (authenticated)
6. Check token expiry: tokenExpiry should be > NOW()
```

### 4.3 Stripe Debug Flow

```
1. Check env: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
2. Test connectivity: curl https://api.stripe.com/v1/balance -u "$STRIPE_SECRET_KEY:"
3. Check webhooks: Stripe Dashboard → Developers → Webhooks → Recent deliveries
4. Check PaymentWebhook: SELECT * FROM "PaymentWebhook" WHERE processed = false
5. Re-process: Use Stripe CLI `stripe events resend evt_xxx`
6. Check PaymentOrder: SELECT * FROM "PaymentOrder" WHERE status = 'pending' AND "createdAt" < NOW() - INTERVAL '1 hour'
7. Manual fix: See RUNBOOK.md Section 7.5
```

### 4.4 Razorpay Debug Flow

```
1. Check env: RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET
2. Test connectivity: curl -u "$RAZORPAY_KEY_ID:$RAZORPAY_KEY_SECRET" https://api.razorpay.com/v1/orders
3. Check webhook: Razorpay Dashboard → Settings → Webhooks
4. Verify signature: HMAC-SHA256(body, RAZORPAY_WEBHOOK_SECRET)
5. Check PaymentOrder for pending orders
6. Manual fix: See RUNBOOK.md Section 7.5
```

### 4.5 Telegram Debug Flow

```
1. Check env: TELEGRAM_BOT_TOKEN
2. Test bot: curl https://api.telegram.org/bot<TOKEN>/getMe
3. Check webhook: curl https://api.telegram.org/bot<TOKEN>/getWebhookInfo
4. Set webhook: curl -X POST https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://app.acquisitionos.com/api/integrations/telegram/webhook
5. Test connection: POST /api/settings/integrations/telegram/link → get code → send to bot
6. Check UserSettings: SELECT * FROM "UserSettings" WHERE "userId" = '...'
```

### 4.6 Z-AI Debug Flow

```
1. Check env: ZAI_API_KEY
2. Test connectivity: Verify AI features return results (not errors)
3. Check AI cost: SELECT * FROM "AiCostRecord" WHERE "createdAt" > NOW() - INTERVAL '1 day'
4. Check provider fallback: If primary fails, should fall back to Anthropic
5. Check rate limits: AI endpoint limited to 30 req/min per user
6. Test simple request: POST /api/leads/discover with small niche
```

---

## 5. Secret Rotation

### 5.1 Quick Reference

| Secret | Rotation Frequency | Method | Downtime | See Also |
|--------|-------------------|--------|----------|----------|
| `JWT_SECRET` | 90 days | Dual-secret transition | None | SECRETS_REFERENCE.md §3 |
| `JWT_REFRESH_SECRET` | 90 days | Dual-secret transition | None | SECRETS_REFERENCE.md §3 |
| `TOKEN_ENCRYPTION_KEY` | 180 days | Re-encrypt all data | None | SECRETS_REFERENCE.md §14 |
| `STRIPE_SECRET_KEY` | 180 days | Stripe Dashboard → Roll key | None | SECRETS_REFERENCE.md §6 |
| `RAZORPAY_KEY_SECRET` | 180 days | Razorpay Dashboard → Regenerate | None | SECRETS_REFERENCE.md §7 |
| `GOOGLE_CLIENT_SECRET` | 365 days | Google Console → Reset | Brief | SECRETS_REFERENCE.md §8 |
| `REDIS_PASSWORD` | 90 days | Update env + restart | ~30s | SECRETS_REFERENCE.md §5 |
| `TELEGRAM_BOT_TOKEN` | 365 days | @BotFather → /revoke | Brief | SECRETS_REFERENCE.md §10 |
| `SMTP_PASSWORD` | 180 days | Email provider | Brief | SECRETS_REFERENCE.md §5 |

### 5.2 JWT Rotation Steps

```bash
# 1. Set previous secret alongside new one
export JWT_SECRET_PREVIOUS="$JWT_SECRET"
export JWT_SECRET="$(openssl rand -base64 64 | tr -d '\n')"

# 2. Deploy and restart
docker compose up -d --force-recreate frontend backend

# 3. Wait for transition (24 hours for access tokens to expire)
# 4. After 30 days, remove JWT_SECRET_PREVIOUS
unset JWT_SECRET_PREVIOUS
docker compose up -d --force-recreate frontend backend
```

### 5.3 Emergency Rotation

```bash
# Rotate ALL critical secrets at once (emergency only)
NEW_JWT=$(openssl rand -base64 64 | tr -d '\n')
export JWT_SECRET="$NEW_JWT"
docker compose restart frontend backend
# Force all users to re-login
curl -X POST http://localhost:3000/api/settings/sessions/revoke-all \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

See [SECRETS_REFERENCE.md](./SECRETS_REFERENCE.md) for detailed rotation procedures per secret.

---

## 6. Force-Logout a User

### 6.1 Revoke All Sessions (API)

```bash
# If you have the user's active token
curl -X POST https://app.acquisitionos.com/api/auth/signout?allDevices=true \
  -H "Authorization: Bearer $USER_TOKEN"
```

### 6.2 Revoke All Sessions (Database)

```sql
-- Revoke all sessions for a specific user
UPDATE "UserSession"
SET "isRevoked" = true
WHERE "userId" = 'USER_ID_HERE'
AND "isRevoked" = false;

-- Verify revocation
SELECT count(*) FROM "UserSession"
WHERE "userId" = 'USER_ID_HERE'
AND "isRevoked" = false;
-- Should return 0
```

### 6.3 Revoke a Specific Session

```sql
-- Find the session
SELECT id, "deviceInfo", "ipAddress", "createdAt"
FROM "UserSession"
WHERE "userId" = 'USER_ID_HERE'
AND "isRevoked" = false
ORDER BY "createdAt" DESC;

-- Revoke it
UPDATE "UserSession"
SET "isRevoked" = true
WHERE id = 'SESSION_ID_HERE';
```

### 6.4 When to Force-Logout

- User reports unauthorized access
- Password changed (automatic — reset-password route revokes all sessions)
- Security incident involving the account
- Account locked due to suspicious activity
- Admin action per user request

---

## 7. Add Credits Manually

### 7.1 Via Database (Direct)

```sql
-- Step 1: Check current credits
SELECT id, email, credits, "creditsMonthly", plan FROM "User" WHERE email = 'user@example.com';

-- Step 2: Add credits (e.g., add 100 credits)
UPDATE "User"
SET credits = credits + 100
WHERE email = 'user@example.com';

-- Step 3: Create audit trail
INSERT INTO "CreditsLedger" (id, "userId", action, credits, balance, description, "createdAt")
VALUES (
  gen_random_uuid(),
  (SELECT id FROM "User" WHERE email = 'user@example.com'),
  'manual_adjustment',
  100,
  (SELECT credits FROM "User" WHERE email = 'user@example.com'),
  'Manual credit adjustment by support — reason: [YOUR REASON HERE]',
  NOW()
);

-- Step 4: Verify
SELECT id, email, credits, plan FROM "User" WHERE email = 'user@example.com';
SELECT * FROM "CreditsLedger" WHERE "userId" = (SELECT id FROM "User" WHERE email = 'user@example.com') ORDER BY "createdAt" DESC LIMIT 5;
```

### 7.2 Via Credit Addon API (Authenticated)

```bash
# User must be authenticated; endpoint uses withAuth
curl -X POST https://app.acquisitionos.com/api/payments/credit-addons \
  -H "Authorization: Bearer $USER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "addonId": "CREDIT_ADDON_ID",
    "paymentProvider": "stripe"
  }'
```

### 7.3 Common Reasons for Manual Credit Addition

| Reason | Credits | Approval |
|--------|---------|----------|
| Payment processed but credits not added (webhook failure) | Match paid plan | L2+ approval |
| Goodwill gesture for service disruption | ≤50 | L1 approval |
| Goodwill gesture for service disruption | >50 | L2+ approval |
| Trial extension credits | 50 | L1 approval |
| Bug caused incorrect deduction | Match lost credits | L2+ with evidence |

### 7.4 Important Notes

- **Always create a CreditsLedger entry** — no credit changes without audit trail
- **Always include a reason** in the description field
- **Always verify** the new balance matches expected value after update
- **Credits are Float** — support fractional amounts (e.g., 0.2 for outreach_message)

---

## 8. Cancel a Subscription

### 8.1 User-Initiated Cancellation

Users can cancel via:
1. **Stripe Customer Portal** — Self-service at `https://billing.stripe.com/...`
2. **Settings → Billing → Cancel** — UI triggers cancel API
3. **Email request** — Support processes on their behalf

### 8.2 Cancel via API (Authenticated)

```bash
# Cancel at period end (user retains access until period ends)
curl -X POST https://app.acquisitionos.com/api/subscriptions/cancel \
  -H "Authorization: Bearer $USER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "cancelAtPeriodEnd": true }'
```

### 8.3 Cancel via Database (Admin)

```sql
-- Step 1: Check current subscription
SELECT s.id, s.plan, s.status, s."cancelAtPeriodEnd", s."currentPeriodEnd"
FROM "Subscription" s
JOIN "User" u ON s."userId" = u.id
WHERE u.email = 'user@example.com'
AND s.status IN ('active', 'trialing');

-- Step 2: Mark for cancellation at period end
UPDATE "Subscription"
SET "cancelAtPeriodEnd" = true
WHERE "userId" = (SELECT id FROM "User" WHERE email = 'user@example.com')
AND status IN ('active', 'trialing');

-- Step 3: Or immediately cancel and downgrade
UPDATE "Subscription"
SET status = 'canceled', "cancelAtPeriodEnd" = false
WHERE "userId" = (SELECT id FROM "User" WHERE email = 'user@example.com')
AND status IN ('active', 'trialing');

UPDATE "User"
SET plan = 'free', "isTrial" = false, "trialEndsAt" = NULL
WHERE email = 'user@example.com';

-- Step 4: Create audit trail
INSERT INTO "CreditsLedger" (id, "userId", action, credits, balance, description, "createdAt")
VALUES (
  gen_random_uuid(),
  (SELECT id FROM "User" WHERE email = 'user@example.com'),
  'subscription_canceled',
  0,
  (SELECT credits FROM "User" WHERE email = 'user@example.com'),
  'Subscription canceled by support — reason: [REASON]',
  NOW()
);

-- Step 5: Also cancel in Stripe/Razorpay dashboard
```

### 8.4 Cancel via Stripe Dashboard

1. Go to Stripe Dashboard → Customers → Find by email
2. Click subscription → Cancel subscription
3. Choose: "Cancel at end of billing period" or "Cancel immediately"
4. Stripe sends `customer.subscription.deleted` webhook → AcquisitionOS handles downgrade

### 8.5 Cancel via Razorpay Dashboard

1. Go to Razorpay Dashboard → Subscriptions → Find by email
2. Click Cancel → Confirm
3. Razorpay sends `subscription.cancelled` webhook → AcquisitionOS handles downgrade

### 8.6 Refund on Cancellation

If user requests a refund along with cancellation:

```bash
# Process refund via API
curl -X POST https://app.acquisitionos.com/api/payments/refund \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "paymentOrderId": "ORDER_ID",
    "reason": "cancellation_refund",
    "amount": 29.00
  }'
```

### 8.7 Cancellation Verification

After cancellation, verify:

- [ ] Subscription status = `canceled` or `cancelAtPeriodEnd = true`
- [ ] User plan = `free` (if immediate) or remains until period end
- [ ] CreditsLedger entry created with cancellation reason
- [ ] Stripe/Razorpay subscription also canceled (if applicable)
- [ ] User receives cancellation confirmation email (if configured)
- [ ] No further billing attempts

---

**See also**:
- [SLA.md](./SLA.md) — Service level agreements
- [RUNBOOK.md](./RUNBOOK.md) — Operational runbook
- [SECRETS_REFERENCE.md](./SECRETS_REFERENCE.md) — Secrets and rotation
- [SUPPORT.md](./SUPPORT.md) — This document
- [INCIDENT_RESPONSE.md](./INCIDENT_RESPONSE.md) — Incident response plan
