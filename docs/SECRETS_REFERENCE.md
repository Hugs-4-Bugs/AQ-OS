# AcquisitionOS — Secrets Reference

Complete reference for all secrets used across AcquisitionOS phases (1–12), including classification, rotation schedules, and emergency procedures.

---

## Table of Contents

1. [Secret Classification](#1-secret-classification)
2. [Phase-by-Phase Secrets](#2-phase-by-phase-secrets)
3. [JWT Secrets](#3-jwt-secrets)
4. [Database Credentials](#4-database-credentials)
5. [Redis Password](#5-redis-password)
6. [Stripe Keys](#6-stripe-keys)
7. [Razorpay Keys](#7-razorpay-keys)
8. [Google OAuth Credentials](#8-google-oauth-credentials)
9. [Gmail API Tokens](#9-gmail-api-tokens)
10. [Telegram Bot Token](#10-telegram-bot-token)
11. [Twilio Credentials](#11-twilio-credentials)
12. [Meta WhatsApp Token](#12-meta-whatsapp-token)
13. [z-ai-web-dev-sdk API Key](#13-z-ai-web-dev-sdk-api-key)
14. [Encryption Keys](#14-encryption-keys)
15. [Webhook Secrets](#15-webhook-secrets)
16. [Secret Rotation Procedures](#16-secret-rotation-procedures)
17. [Emergency Secret Compromise Response](#17-emergency-secret-compromise-response)

---

## 1. Secret Classification

| Level | Impact if Compromised | Examples | Storage Requirement |
|---|---|---|---|
| **Critical** | Full system takeover, data breach | `JWT_SECRET`, `TOKEN_ENCRYPTION_KEY`, `DATABASE_URL` (prod) | Encrypted vault, never in code |
| **High** | Financial loss, unauthorized access | `STRIPE_SECRET_KEY`, `RAZORPAY_KEY_SECRET`, `META_APP_SECRET` | Encrypted vault, access logging |
| **Medium** | Service disruption, spam | `TELEGRAM_BOT_TOKEN`, `SMTP_PASSWORD`, `REDIS_PASSWORD` | Encrypted vault |
| **Low** | Limited impact, read-only access | `STRIPE_PUBLISHABLE_KEY`, `RAZORPAY_KEY_ID`, `ZAI_API_KEY` | Environment variables |

---

## 2. Phase-by-Phase Secrets

### Phase 1: Core Infrastructure

| Variable | Classification | Description | Where to Obtain | Rotation | Example Format |
|---|---|---|---|---|---|
| `DATABASE_URL` | Critical | Database connection string with credentials | Self-hosted or Supabase dashboard | On compromise | `postgresql://user:pass@host:5432/db` |
| `REDIS_PASSWORD` | Medium | Redis authentication password | Self-generated | 90 days | `openssl rand -base64 32` |
| `CELERY_BROKER_URL` | Medium | Redis URL for Celery (may include password) | Same as Redis | With Redis | `redis://:pass@localhost:6379/1` |
| `APP_SECRET_KEY` | Critical | Application-level secret key | Self-generated | 90 days | `openssl rand -base64 64` |
| `POSTGRES_PASSWORD` | Critical | PostgreSQL superuser password | Self-generated or Supabase | 90 days | `openssl rand -base64 32` |

### Phase 3: Authentication

| Variable | Classification | Description | Where to Obtain | Rotation | Example Format |
|---|---|---|---|---|---|
| `JWT_SECRET` | Critical | Signs access tokens (15 min expiry) | Self-generated | 90 days | `openssl rand -base64 64` |
| `JWT_REFRESH_SECRET` | Critical | Signs refresh tokens (30 day expiry) | Self-generated | 90 days | `openssl rand -base64 64` |
| `NEXTAUTH_SECRET` | Critical | NextAuth.js encryption key | Self-generated | 90 days | `openssl rand -base64 32` |
| `GOOGLE_CLIENT_ID` | Low | Google OAuth client identifier | Google Cloud Console | N/A (not secret) | `123456789-abc.apps.googleusercontent.com` |
| `GOOGLE_CLIENT_SECRET` | High | Google OAuth client secret | Google Cloud Console | 365 days | `GOCSPX-xxxxxxxxxxxx` |

### Phase 4: Billing

| Variable | Classification | Description | Where to Obtain | Rotation | Example Format |
|---|---|---|---|---|---|
| `STRIPE_SECRET_KEY` | High | Stripe API secret key | Stripe Dashboard | 180 days | `sk_live_xxxxxxxxxxxxx` |
| `STRIPE_WEBHOOK_SECRET` | High | Stripe webhook signing secret | Stripe Dashboard (webhook settings) | On endpoint change | `whsec_xxxxxxxxxxxxx` |
| `STRIPE_PUBLISHABLE_KEY` | Low | Stripe public key (not secret) | Stripe Dashboard | N/A | `pk_live_xxxxxxxxxxxxx` |
| `RAZORPAY_KEY_ID` | Low | Razorpay key identifier | Razorpay Dashboard | N/A | `rzp_live_xxxxxxxx` |
| `RAZORPAY_KEY_SECRET` | High | Razorpay API secret | Razorpay Dashboard | 180 days | `xxxxxxxxxxxxxxxxxxxxxxxx` |
| `RAZORPAY_WEBHOOK_SECRET` | High | Razorpay webhook signing secret | Razorpay Dashboard (webhook settings) | On endpoint change | `xxxxxxxxxxxxxxxx` |

### Phase 5: AI & Email

| Variable | Classification | Description | Where to Obtain | Rotation | Example Format |
|---|---|---|---|---|---|
| `ZAI_API_KEY` | Low | z-ai-web-dev-sdk API key | z-ai dashboard | On compromise | `zai_xxxxxxxxxxxxx` |
| `ANTHROPIC_API_KEY` | Low | Anthropic Claude API key | Anthropic Console | On compromise | `sk-ant-xxxxxxxxxxx` |
| `SMTP_PASSWORD` | Medium | SMTP authentication password | Email provider | 180 days | App-specific password |
| `RESEND_API_KEY` | Medium | Resend email API key | Resend Dashboard | On compromise | `re_xxxxxxxxxxxxx` |

### Phase 6: Security

| Variable | Classification | Description | Where to Obtain | Rotation | Example Format |
|---|---|---|---|---|---|
| `TOKEN_ENCRYPTION_KEY` | Critical | Fernet key for OAuth token encryption | Self-generated | 180 days | Fernet key (44 chars, base64) |
| `SENTRY_DSN` | Low | Sentry error tracking DSN | Sentry Dashboard | N/A | `https://key@sentry.io/project` |

### Phase 9: Gmail

| Variable | Classification | Description | Where to Obtain | Rotation | Example Format |
|---|---|---|---|---|---|
| `GMAIL_CLIENT_ID` | Low | Gmail OAuth client ID | Google Cloud Console | N/A | Same as Google OAuth |
| `GMAIL_CLIENT_SECRET` | High | Gmail OAuth client secret | Google Cloud Console | 365 days | Same as Google OAuth |
| `GMAIL_REDIRECT_URI` | Low | OAuth callback URL | Self-configured | On domain change | `https://app.example.com/api/integrations/gmail/callback` |
| `GOOGLE_PUBSUB_TOPIC` | Low | Pub/Sub topic name | Google Cloud Console | N/A | `projects/proj/topics/gmail-notifications` |

### Phase 10: Messaging

| Variable | Classification | Description | Where to Obtain | Rotation | Example Format |
|---|---|---|---|---|---|
| `TELEGRAM_BOT_TOKEN` | Medium | Telegram Bot API token | @BotFather on Telegram | 365 days | `123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11` |
| `TWILIO_ACCOUNT_SID` | Low | Twilio account identifier | Twilio Console | N/A | `ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` |
| `TWILIO_AUTH_TOKEN` | High | Twilio authentication token | Twilio Console | 180 days | `xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` |
| `META_WHATSAPP_TOKEN` | High | WhatsApp Business API token | Meta Business Settings | 60 days | `EAAxxxxxxxxxxxxxxxxxxxxxxxx` |
| `META_WHATSAPP_PHONE_ID` | Low | WhatsApp phone number ID | Meta Business Settings | N/A | `xxxxxxxxxxxxxxxxxx` |
| `META_WEBHOOK_VERIFY_TOKEN` | Medium | Webhook verification token | Self-generated | 180 days | `openssl rand -hex 16` |
| `META_APP_SECRET` | High | Meta app secret for signatures | Meta App Dashboard | 180 days | `xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` |

### Phase 11: Real-Time

| Variable | Classification | Description | Where to Obtain | Rotation | Example Format |
|---|---|---|---|---|---|
| `REDIS_PUBSUB_PREFIX` | Low | Redis channel prefix | Self-configured | N/A | `acos:pubsub:` |

### Phase 12: Workflow Automation

| Variable | Classification | Description | Where to Obtain | Rotation | Example Format |
|---|---|---|---|---|---|
| `WORKFLOW_MAX_RETRIES` | Low | Max retry attempts for failed steps | Self-configured | N/A | `3` |
| `WORKFLOW_TIMEOUT` | Low | Execution timeout in ms | Self-configured | N/A | `300000` |
| `WORKFLOW_QUEUE_SIZE` | Low | Max execution queue size | Self-configured | N/A | `1000` |
| `WORKFLOW_RETENTION_DAYS` | Low | Days to retain execution history | Self-configured | N/A | `90` |
| `WORKFLOW_DLQ_SIZE` | Low | Max dead letter queue size | Self-configured | N/A | `500` |

> **Note**: Phase 12 workflow variables are configuration parameters, not cryptographic secrets. No rotation is required.

---

### Phase 14: CI/CD & Deployment

| Variable | Classification | Description | Where to Obtain | Rotation |
|---|---|---|---|---|
| `STAGING_DEPLOY_KEY` | High | SSH private key for staging deployment | Self-generated | 90 days |
| `STAGING_HOST` | Low | Staging server hostname | Infrastructure config | On change |
| `STAGING_USER` | Low | Staging server SSH user | Infrastructure config | On change |
| `STAGING_URL` | Low | Staging application URL | DNS config | On change |
| `PROD_DEPLOY_KEY` | Critical | SSH private key for production deployment | Self-generated | 90 days |
| `PROD_HOST` | Low | Production server hostname | Infrastructure config | On change |
| `PROD_USER` | Low | Production server SSH user | Infrastructure config | On change |
| `PROD_URL` | Low | Production application URL | DNS config | On change |
| `SLACK_WEBHOOK_URL` | Medium | Slack webhook for CI/CD notifications | Slack App config | On compromise |

> **Note**: All Phase 14 variables are stored as GitHub Secrets (Repository Settings → Secrets → Actions), not in `.env` files. They are only accessible within GitHub Actions workflows.

---

## 3. JWT Secrets

### JWT_SECRET

- **Purpose**: Signs JWT access tokens (15 minute expiry)
- **Classification**: Critical
- **Generation**: `openssl rand -base64 64 | tr -d '\n'`
- **Rotation**: Every 90 days
- **Required Permissions**: Must be accessible by all API server instances
- **Impact of Compromise**: Attacker can forge valid access tokens for any user
- **Rotation Notes**:
  - Support dual-secret validation during transition (current + previous)
  - Transition period: 24 hours (access token max lifetime)
  - After transition, remove `JWT_SECRET_PREVIOUS`
  - Optionally revoke all sessions after rotation

### JWT_REFRESH_SECRET

- **Purpose**: Signs JWT refresh tokens (30 day expiry)
- **Classification**: Critical
- **Generation**: `openssl rand -base64 64 | tr -d '\n'`
- **Rotation**: Every 90 days
- **Impact of Compromise**: Attacker can forge refresh tokens for persistent access
- **Rotation Notes**:
  - Same dual-secret transition as `JWT_SECRET`
  - Transition period: 30 days (refresh token max lifetime)
  - Must revoke all sessions after rotation to invalidate old refresh tokens

### NEXTAUTH_SECRET

- **Purpose**: NextAuth.js encryption and signing key
- **Classification**: Critical
- **Generation**: `openssl rand -base64 32`
- **Rotation**: Every 90 days
- **Impact of Compromise**: Session cookies and CSRF tokens can be forged

---

## 4. Database Credentials

### DATABASE_URL (Production)

- **Purpose**: Primary database connection string
- **Classification**: Critical
- **Format**: `postgresql://user:password@host:port/database`
- **Where to Obtain**: Supabase Dashboard → Settings → Database → Connection string
- **Rotation**: On compromise or password policy (90 days)
- **Impact of Compromise**: Full database access (read/write all data)
- **Required Permissions**: Read/write access to all AcquisitionOS tables

### POSTGRES_PASSWORD

- **Purpose**: PostgreSQL superuser password (Docker)
- **Classification**: Critical
- **Generation**: `openssl rand -base64 32`
- **Rotation**: 90 days or on compromise
- **Impact of Compromise**: Full database admin access

### DIRECT_URL

- **Purpose**: Direct PostgreSQL connection for Prisma migrations (bypasses PgBouncer)
- **Classification**: Critical
- **Same credentials as DATABASE_URL but different port** (5432 vs 6543)

---

## 5. Redis Password

### REDIS_PASSWORD

- **Purpose**: Redis authentication password
- **Classification**: Medium
- **Generation**: `openssl rand -base64 32 | tr -d '\n/+=`
- **Rotation**: Every 90 days
- **Impact of Compromise**: Access to cached sessions, OTP codes, rate limit counters, and Pub/Sub messages
- **Required Permissions**: All Redis databases (0–2)

### CELERY_BROKER_URL / CELERY_RESULT_BACKEND

- **Purpose**: Redis URLs for Celery (include password)
- **Classification**: Medium (inherits from REDIS_PASSWORD)
- **Format**: `redis://:password@host:6379/1` and `redis://:password@host:6379/2`
- **Rotation**: Changes with REDIS_PASSWORD

---

## 6. Stripe Keys

### STRIPE_SECRET_KEY

- **Purpose**: Stripe API secret key for payment processing
- **Classification**: High
- **Where to Obtain**: Stripe Dashboard → Developers → API keys
- **Format**: `sk_test_...` (test) or `sk_live_...` (live)
- **Rotation**: Every 180 days
- **Required Permissions**: `charges:write`, `customers:write`, `subscriptions:write`, `invoices:write`
- **Impact of Compromise**: Unauthorized charges, refund fraud, customer data access

### STRIPE_WEBHOOK_SECRET

- **Purpose**: Verifies Stripe webhook signatures
- **Classification**: High
- **Where to Obtain**: Stripe Dashboard → Developers → Webhooks → [Endpoint] → Signing secret
- **Format**: `whsec_...`
- **Rotation**: When webhook endpoint is recreated
- **Impact of Compromise**: Attacker can forge webhook events

### STRIPE_PUBLISHABLE_KEY

- **Purpose**: Stripe public key (used client-side)
- **Classification**: Low (not actually secret)
- **Format**: `pk_test_...` or `pk_live_...`

---

## 7. Razorpay Keys

### RAZORPAY_KEY_ID

- **Purpose**: Razorpay API key identifier
- **Classification**: Low (public identifier)
- **Where to Obtain**: Razorpay Dashboard → Settings → API Keys
- **Format**: `rzp_test_...` or `rzp_live_...`

### RAZORPAY_KEY_SECRET

- **Purpose**: Razorpay API secret for payment processing
- **Classification**: High
- **Where to Obtain**: Razorpay Dashboard → Settings → API Keys → Generate Key
- **Rotation**: Every 180 days
- **Required Permissions**: Full access (Razorpay uses single-role keys)
- **Impact of Compromise**: Unauthorized payment capture, refund fraud

### RAZORPAY_WEBHOOK_SECRET

- **Purpose**: Verifies Razorpay webhook signatures
- **Classification**: High
- **Where to Obtain**: Razorpay Dashboard → Settings → Webhooks → [Webhook] → Secret
- **Rotation**: When webhook is recreated
- **Impact of Compromise**: Attacker can forge payment events

---

## 8. Google OAuth Credentials

### GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET

- **Purpose**: OAuth 2.0 credentials for Google sign-in
- **Classification**: High (secret), Low (ID)
- **Where to Obtain**: Google Cloud Console → APIs & Services → Credentials
- **Format**: ID: `123456789-abc.apps.googleusercontent.com`, Secret: `GOCSPX-...`
- **Rotation**: Every 365 days
- **Impact of Compromise**: Unauthorized OAuth token generation
- **Important**: Google invalidates old secret **immediately** on rotation — no transition period

### Required OAuth Scopes

| Scope | Purpose |
|---|---|
| `openid` | Basic authentication |
| `profile` | User profile info |
| `email` | User email address |

---

## 9. Gmail API Tokens

### GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET

- **Purpose**: OAuth 2.0 credentials for Gmail API access
- **Classification**: High (secret), Low (ID)
- **Where to Obtain**: Google Cloud Console (separate OAuth client from sign-in)
- **Rotation**: Every 365 days

### Required OAuth Scopes (Gmail)

| Scope | Purpose |
|---|---|
| `https://mail.google.com/` | Full Gmail access (read, send, modify) |
| `https://www.googleapis.com/auth/gmail.modify` | Modify Gmail (less permissive) |
| `https://www.googleapis.com/auth/pubsub` | Pub/Sub push notifications |

### Required APIs (Google Cloud Console)

- Gmail API
- Cloud Pub/Sub API

### Token Storage

Gmail OAuth tokens (access + refresh) are encrypted at rest using `TOKEN_ENCRYPTION_KEY` (Fernet) and stored in the `EmailAccount` table.

---

## 10. Telegram Bot Token

### TELEGRAM_BOT_TOKEN

- **Purpose**: Authenticates API requests to Telegram Bot API
- **Classification**: Medium
- **Where to Obtain**: Message [@BotFather](https://t.me/BotFather) → `/newbot` or `/token`
- **Format**: `123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11`
- **Rotation**: Every 365 days (or revoke via @BotFather)
- **Impact of Compromise**: Attacker can send messages as your bot, read all messages
- **Required Permissions**: Determined by bot configuration (groups, commands, etc.)

---

## 11. Twilio Credentials

### TWILIO_ACCOUNT_SID

- **Purpose**: Twilio account identifier
- **Classification**: Low (public identifier)
- **Where to Obtain**: Twilio Console Dashboard
- **Format**: `ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`

### TWILIO_AUTH_TOKEN

- **Purpose**: Twilio authentication token
- **Classification**: High
- **Where to Obtain**: Twilio Console Dashboard
- **Rotation**: Every 180 days
- **Impact of Compromise**: Send unauthorized SMS/WhatsApp messages, access call logs

### TWILIO_WHATSAPP_NUMBER

- **Purpose**: Twilio WhatsApp Business number
- **Classification**: Low
- **Format**: `whatsapp:+14155238886` (sandbox) or `whatsapp:+919876543210` (production)

---

## 12. Meta WhatsApp Token

### META_WHATSAPP_TOKEN

- **Purpose**: WhatsApp Business API access token
- **Classification**: High
- **Where to Obtain**: Meta Business Settings → WhatsApp → API Setup
- **Rotation**: Every 60 days (Meta auto-expires tokens)
- **Impact of Compromise**: Send unauthorized WhatsApp messages, access business data

### META_WHATSAPP_PHONE_ID

- **Purpose**: WhatsApp phone number identifier
- **Classification**: Low
- **Where to Obtain**: Meta Business Settings → WhatsApp → Phone Numbers

### META_WEBHOOK_VERIFY_TOKEN

- **Purpose**: Verifies Meta webhook handshake
- **Classification**: Medium
- **Generation**: `openssl rand -hex 16`
- **Rotation**: Every 180 days

### META_APP_SECRET

- **Purpose**: Verifies Meta webhook request signatures
- **Classification**: High
- **Where to Obtain**: Meta App Dashboard → Settings → App Secret
- **Rotation**: Every 180 days
- **Impact of Compromise**: Forge webhook events from Meta

---

## 13. z-ai-web-dev-sdk API Key

### ZAI_API_KEY

- **Purpose**: Powers all AI features (discovery, enrichment, chat, analysis)
- **Classification**: Low (rate-limited, no user data access)
- **Where to Obtain**: z-ai dashboard
- **Rotation**: On compromise
- **Impact of Compromise**: Unauthorized API usage on your account/quota
- **Usage**: SDK reads automatically from environment via `ZAI.create()`

### Features Powered by ZAI_API_KEY

| Feature | SDK Function |
|---|---|
| Lead Discovery | `zai.functions.invoke('web_search')` + `zai.chat.completions.create()` |
| Lead Scoring | `zai.chat.completions.create()` |
| AI Outreach | `zai.chat.completions.create()` |
| Sales Coach | `zai.chat.completions.create()` |
| Website Analysis | `zai.chat.completions.create()` + VLM |
| Proposal Generation | `zai.chat.completions.create()` |

---

## 14. Encryption Keys

### TOKEN_ENCRYPTION_KEY

- **Purpose**: Fernet symmetric key for encrypting OAuth tokens at rest
- **Classification**: Critical
- **Generation**: 
  ```python
  from cryptography.fernet import Fernet
  key = Fernet.generate_key().decode()
  ```
- **Rotation**: Every 180 days
- **Impact of Compromise**: Decrypt stored Gmail OAuth tokens, impersonate users' email accounts
- **Rotation Notes**:
  - Must re-encrypt all data with new key during rotation
  - Keep old key as `TOKEN_ENCRYPTION_KEY_PREVIOUS` for 7 days
  - Run rotation script before removing old key
- **What's Encrypted**:
  - `EmailAccount.accessToken`
  - `EmailAccount.refreshToken`
  - `MfaConfig.secret` (TOTP secret)

---

## 15. Webhook Secrets

### STRIPE_WEBHOOK_SECRET

- **Purpose**: Verify Stripe webhook signatures (`Stripe-Signature` header)
- **Classification**: High
- **Algorithm**: HMAC-SHA256
- **Verification**:
  ```typescript
  import Stripe from 'stripe';
  const stripe = new Stripe(STRIPE_SECRET_KEY);
  const event = stripe.webhooks.constructEvent(body, signature, STRIPE_WEBHOOK_SECRET);
  ```

### RAZORPAY_WEBHOOK_SECRET

- **Purpose**: Verify Razorpay webhook signatures (`X-Razorpay-Signature` header)
- **Classification**: High
- **Algorithm**: HMAC-SHA256
- **Verification**:
  ```typescript
  import crypto from 'crypto';
  const expected = crypto.createHmac('sha256', RAZORPAY_WEBHOOK_SECRET)
    .update(body)
    .digest('hex');
  ```

### META_WEBHOOK_VERIFY_TOKEN

- **Purpose**: Verify Meta webhook handshake (GET request with `hub.verify_token`)
- **Classification**: Medium
- **Not HMAC** — simple string comparison during initial verification

### META_APP_SECRET

- **Purpose**: Verify Meta webhook signatures (`X-Hub-Signature-256` header)
- **Classification**: High
- **Algorithm**: HMAC-SHA256
- **Verification**:
  ```typescript
  import crypto from 'crypto';
  const expected = crypto.createHmac('sha256', META_APP_SECRET)
    .update(body)
    .digest('hex');
  ```

### TELEGRAM_BOT_TOKEN (as webhook secret)

- **Purpose**: Telegram uses the bot token itself as the webhook path for identification
- **Classification**: Medium
- **Verification**: Validate `X-Telegram-Bot-Api-Secret-Token` header (set via `setWebhook`)

---

## 16. Secret Rotation Procedures

### Rotation Schedule Summary

| Secret | Frequency | Transition Period | Downtime | Automation |
|---|---|---|---|---|
| `JWT_SECRET` | 90 days | 24 hours | None | Semi-automatic |
| `JWT_REFRESH_SECRET` | 90 days | 30 days | None | Semi-automatic |
| `NEXTAUTH_SECRET` | 90 days | None | Brief (force re-login) | Manual |
| `APP_SECRET_KEY` | 90 days | None | Brief | Semi-automatic |
| `STRIPE_SECRET_KEY` | 180 days | 48 hours | None | Manual (Dashboard) |
| `RAZORPAY_KEY_SECRET` | 180 days | 48 hours | None | Manual (Dashboard) |
| `GOOGLE_CLIENT_SECRET` | 365 days | None | Brief | Manual (Console) |
| `REDIS_PASSWORD` | 90 days | None | Brief (<30s) | Semi-automatic |
| `TOKEN_ENCRYPTION_KEY` | 180 days | 7 days | None | Script-based |
| `TELEGRAM_BOT_TOKEN` | 365 days | None | Brief | Manual (@BotFather) |
| `TWILIO_AUTH_TOKEN` | 180 days | None | Brief | Manual (Console) |
| `META_WHATSAPP_TOKEN` | 60 days | None | Brief | Manual (Dashboard) |
| `META_APP_SECRET` | 180 days | None | Brief | Manual (Dashboard) |
| `ZAI_API_KEY` | On compromise | None | None | Manual |
| `SMTP_PASSWORD` | 180 days | None | Brief | Manual |
| `STRIPE_WEBHOOK_SECRET` | On change | None | None | Manual |
| `RAZORPAY_WEBHOOK_SECRET` | On change | None | None | Manual |
| `PROD_DEPLOY_KEY` | 90 days | None | Brief | Semi-automatic |
| `STAGING_DEPLOY_KEY` | 90 days | None | Brief | Semi-automatic |
| `SLACK_WEBHOOK_URL` | On compromise | None | None | Manual |

### General Rotation Steps

1. **Generate new secret** using appropriate method
2. **Update environment** with new value (keep old as `*_PREVIOUS` if transition needed)
3. **Deploy** updated environment to all instances
4. **Verify** all services work with new secret
5. **Remove** previous secret after transition period
6. **Update** rotation tracking log (`infra/secret-rotation-log.csv`)
7. **Document** rotation in audit log

### JWT Secret Rotation (Detailed)

```bash
#!/bin/bash
# rotate-jwt-secret.sh

# Generate new secrets
NEW_JWT_SECRET=$(openssl rand -base64 64 | tr -d '\n')
NEW_JWT_REFRESH_SECRET=$(openssl rand -base64 64 | tr -d '\n')

# Set previous for transition
export JWT_SECRET_PREVIOUS="$JWT_SECRET"
export JWT_SECRET="$NEW_JWT_SECRET"
export JWT_REFRESH_SECRET_PREVIOUS="$JWT_REFRESH_SECRET"
export JWT_REFRESH_SECRET="$NEW_JWT_REFRESH_SECRET"

# Deploy and restart services
# Application checks both JWT_SECRET and JWT_SECRET_PREVIOUS

# After 24 hours, remove JWT_SECRET_PREVIOUS
# After 30 days, remove JWT_REFRESH_SECRET_PREVIOUS
```

### Encryption Key Rotation (Detailed)

```python
#!/usr/bin/env python3
"""rotate-encryption-key.py — Re-encrypt all data with new key"""
import os
from cryptography.fernet import Fernet

OLD_KEY = os.environ["TOKEN_ENCRYPTION_KEY"]
NEW_KEY = os.environ["TOKEN_ENCRYPTION_KEY_NEW"]

old_fernet = Fernet(OLD_KEY.encode())
new_fernet = Fernet(NEW_KEY.encode())

# Re-encrypt all EmailAccount tokens
# 1. Query all EmailAccount records
# 2. Decrypt accessToken with old key
# 3. Encrypt with new key
# 4. Update record
# 5. Repeat for refreshToken

print("Encryption key rotation complete.")
```

```bash
export TOKEN_ENCRYPTION_KEY="current-key"
export TOKEN_ENCRYPTION_KEY_NEW="new-key"
python3 rotate-encryption-key.py

# After 7 days, remove TOKEN_ENCRYPTION_KEY_PREVIOUS
```

---

## 17. Emergency Secret Compromise Response

### Immediate Actions (0–15 minutes)

1. **Identify the compromised secret** — determine scope and impact
2. **Rotate the secret immediately** — no transition period
3. **Invalidate affected sessions** — force all users to re-authenticate
4. **Block suspicious activity** — enable IP-based rate limiting
5. **Notify security team** — PagerDuty P1 alert

### Short-term Actions (15–60 minutes)

1. **Audit logs** — check for unauthorized access since compromise window
2. **Review database** — check for unauthorized data access or modifications
3. **Check payment records** — verify no fraudulent transactions
4. **Update all related secrets** — rotate adjacent secrets that may be related
5. **Enable enhanced monitoring** — increase log verbosity and alerting

### Long-term Actions (1–7 days)

1. **Post-incident review** — document root cause within 48 hours
2. **Update security procedures** — address any gaps found
3. **Communicate with users** — if user data was affected
4. **Update infrastructure** — patch any vulnerabilities
5. **Review access controls** — ensure principle of least privilege

### Quick Emergency Rotation

```bash
#!/bin/bash
# emergency-rotate-all.sh — Rotate all critical secrets at once

echo "=== EMERGENCY SECRET ROTATION ==="

# Generate all new secrets
NEW_JWT=$(openssl rand -base64 64 | tr -d '\n')
NEW_JWT_REFRESH=$(openssl rand -base64 64 | tr -d '\n')
NEW_APP_KEY=$(openssl rand -base64 64 | tr -d '\n')
NEW_REDIS=$(openssl rand -base64 32 | tr -d '\n/+= ')

# Update all secrets at once
export JWT_SECRET="$NEW_JWT"
export JWT_REFRESH_SECRET="$NEW_JWT_REFRESH"
export APP_SECRET_KEY="$NEW_APP_KEY"
export REDIS_PASSWORD="$NEW_REDIS"

# Restart all services
docker compose restart

# Force all users to re-login
curl -X POST http://localhost:3000/api/settings/sessions/revoke-all \
  -H "Authorization: Bearer admin-token"

echo "=== EMERGENCY ROTATION COMPLETE ==="
echo "Next steps:"
echo "1. Rotate payment provider keys via their dashboards"
echo "2. Rotate Google OAuth credentials via Google Console"
echo "3. Rotate Telegram bot token via @BotFather"
echo "4. Review audit logs for unauthorized access"
echo "5. Document incident in post-incident report"
```

### Compromise Indicators

| Indicator | Likely Compromised Secret |
|---|---|
| Unknown JWT tokens in logs | `JWT_SECRET` or `JWT_REFRESH_SECRET` |
| Unauthorized Stripe charges | `STRIPE_SECRET_KEY` |
| Unauthorized Razorpay payments | `RAZORPAY_KEY_SECRET` |
| Suspicious emails sent | `SMTP_PASSWORD` or `RESEND_API_KEY` |
| Suspicious Telegram messages | `TELEGRAM_BOT_TOKEN` |
| Suspicious WhatsApp messages | `META_WHATSAPP_TOKEN` |
| Unauthorized Gmail access | `TOKEN_ENCRYPTION_KEY` |
| Unusual Redis operations | `REDIS_PASSWORD` |
| Unexpected AI API usage | `ZAI_API_KEY` |

### Secret Storage Best Practices

- **Never** commit secrets to version control
- **Never** share secrets via Slack, email, or other unencrypted channels
- **Use** a secrets manager (HashiCorp Vault, AWS Secrets Manager, GitHub Secrets)
- **Rotate** secrets on a regular schedule (see rotation table above)
- **Audit** secret access logs monthly
- **Limit** access to production secrets to authorized personnel only
- **Use** different secrets for development and production
- **Document** all rotation events in `infra/secret-rotation-log.csv`
