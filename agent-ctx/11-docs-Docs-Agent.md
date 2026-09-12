# Task 11-docs — Docs Agent Work Record

## Task
Create 5 documentation files for the AcquisitionOS project in the `docs/` directory.

## Files Created

### 1. docs/ENV_SETUP_GUIDE.md
Comprehensive environment setup guide covering:
- Prerequisites (Node.js 20, Bun, Python 3.11, Docker)
- Quick Start (5-step setup)
- Environment Variables organized by phase (1-11):
  - Phase 1: DATABASE_URL, REDIS_URL, REDIS_PASSWORD, CELERY_BROKER_URL, CELERY_RESULT_BACKEND
  - Phase 3: JWT_SECRET, JWT_REFRESH_SECRET, NEXTAUTH_SECRET, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, auth feature flags
  - Phase 4: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET
  - Phase 5: ZAI_API_KEY, SMTP settings, RESEND_API_KEY
  - Phase 6: TOKEN_ENCRYPTION_KEY, SENTRY_DSN
  - Phase 7: DISCOVERY_MAX_CONCURRENT_JOBS, ENRICHMENT_TIMEOUT_MS
  - Phase 9: GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GOOGLE_PUBSUB_TOPIC
  - Phase 10: TELEGRAM_BOT_TOKEN, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, META_WHATSAPP_TOKEN
  - Phase 11: WS_HEARTBEAT_INTERVAL, WS_RECONNECT_LIMIT, SSE_TIMEOUT, NOTIFICATION_BATCH_SIZE, REDIS_PUBSUB_PREFIX
- Database Setup (SQLite dev, PostgreSQL prod, Supabase)
- Redis Setup (Docker, production config, DB allocation)
- Celery Worker Setup (workers, beat, flower)
- WebSocket Service Setup (mini service architecture)
- Monitoring Stack Setup (Prometheus, Grafana, OTel)
- Development Mode vs Production Mode comparison table
- Troubleshooting Common Issues (database, auth, Redis, Celery, AI, Docker, build, email)
- Complete environment file template

### 2. docs/SECRETS_REFERENCE.md
Complete secrets reference covering:
- Secret Classification (Critical, High, Medium, Low)
- Phase-by-phase secrets with variable name, description, where to obtain, rotation schedule, example format, required permissions
- Detailed sections for each secret type:
  - JWT Secrets (access + refresh, dual-secret rotation)
  - Database credentials (DATABASE_URL, POSTGRES_PASSWORD, DIRECT_URL)
  - Redis password
  - Stripe keys (secret, webhook, publishable)
  - Razorpay keys (key ID, key secret, webhook)
  - Google OAuth credentials (sign-in + Gmail separate)
  - Gmail API tokens
  - Telegram Bot token
  - Twilio credentials
  - Meta WhatsApp token
  - z-ai-web-dev-sdk API key
  - Encryption keys (Fernet for OAuth tokens)
  - Webhook secrets
- Secret Rotation Procedures (detailed for JWT, encryption key)
- Emergency Secret Compromise Response (immediate, short-term, long-term actions)
- Quick emergency rotation script
- Compromise indicators table
- Secret storage best practices

### 3. docs/OAUTH_SETUP_GUIDE.md
OAuth setup guide covering:
- Overview of two OAuth clients (sign-in vs Gmail)
- Google OAuth Setup (Sign-In):
  - Creating Google Cloud Project
  - Configuring consent screen (step by step)
  - Creating OAuth 2.0 credentials
  - Setting redirect URIs (dev + prod)
  - Testing OAuth flow
- Gmail API-Specific Setup:
  - Enabling Gmail API and Cloud Pub/Sub API
  - Creating separate Gmail OAuth client
  - Configuring Gmail OAuth consent (scopes)
  - Creating Pub/Sub topic and subscription
  - Granting Gmail API permission to publish
  - Watch Gmail for new messages
  - Token refresh handling
  - Verifying push notifications
- OAuth Security Best Practices (client secret, redirect URI, token handling, scope minimization, consent screen, monitoring)
- Troubleshooting OAuth Issues (redirect_uri_mismatch, access_denied, invalid_client, invalid_grant, Gmail 403, Pub/Sub issues, token refresh failures, watch expiration, encryption issues)

### 4. docs/WEBHOOK_SETUP_GUIDE.md
Webhook setup guide covering:
- Overview of all webhook endpoints
- Stripe Webhooks:
  - Creating webhook endpoint
  - Required events (10 events listed with actions)
  - Signature verification (TypeScript code)
  - Webhook handler (full implementation)
  - Testing with Stripe CLI
  - Idempotency handling
  - Replay tools
- Razorpay Webhooks:
  - Creating webhook endpoint
  - Required events (10 events listed)
  - Signature verification (HMAC-SHA256)
  - Webhook handler
  - Testing (test mode, test card numbers)
- Gmail PubSub Push Notifications:
  - Push endpoint setup
  - Verifying push signature
  - Handling notifications
- Telegram Webhooks:
  - Setting bot webhook
  - Verifying Telegram signature
  - Handling updates
- WhatsApp Webhooks (Meta/Twilio):
  - Meta verification handshake (GET handler)
  - Message status webhooks
  - Incoming message webhooks
  - Signature verification (HMAC-SHA256)
  - Twilio WhatsApp webhooks
- Webhook Security (signature verification pattern, idempotency pattern, rate limiting, error handling)
- Webhook Testing Tools (ngrok, Stripe CLI, curl examples for each provider, retry configuration)

### 5. docs/PRODUCTION_DEPLOYMENT_GUIDE.md
Production deployment guide covering:
- Architecture Overview (ASCII diagram showing full architecture)
- Technology Stack table
- Infrastructure Requirements (minimum, recommended, database requirements, cloud providers)
- Deployment Steps (10-step process with code examples)
- Docker Compose Production Configuration (full docker-compose.prod.yml with resource limits, replicas, health checks)
- Nginx/Caddy Reverse Proxy Configuration (full nginx.conf with rate limiting, WebSocket, caching; Caddyfile alternative)
- SSL/TLS Configuration (Let's Encrypt, Cloudflare, commercial, best practices)
- Database Migration to PostgreSQL (5-step process with pgloader, CSV, verification)
- Celery Worker Deployment (production config, queue separation table, scaling, Flower monitoring)
- WebSocket Service Deployment (mini service setup, Docker deployment, health check)
- Monitoring Stack Deployment (Prometheus config, Grafana dashboards, alert rules)
- Backup and Restore Procedures (database, Redis, file uploads, automated schedule)
- Scaling Strategy (Next.js horizontal, Celery workers, Redis clustering, DB read replicas, auto-scaling rules)
- Security Hardening Checklist (application, infrastructure, data, network)
- Performance Optimization (Next.js, database, Redis, caching strategy table)
- Incident Response Runbook (severity levels, P1 procedures for service down, database down, payment failures)
- Rollback Procedures (application, database, quick rollback script)
- Phase-Specific Deployment Notes (all 11 phases)
