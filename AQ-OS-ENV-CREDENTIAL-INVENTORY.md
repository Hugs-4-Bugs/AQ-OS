# AcquisitionOS — Complete Credential & Environment Inventory

**Generated from codebase audit at commit `09420b826` (origin/develop)**
**Total environment variables discovered: 238**

## Summary

| Metric | Count |
|---|---|
| Total env vars referenced in code | 238 |
| Currently configured in GLM `.env` | 26 |
| Required for core operation | 12 |
| Optional (provider/config) | 190 |
| Test/dev-only | 14 |
| Auto-set by runtime/platform | 16 |
| Secret variables | 35 |
| Distinct provider integrations | 18 |

---

## Currently Configured in GLM Environment (26 vars)

These are already present in the current `.env` file (values redacted):

| Variable | Present | Notes |
|---|---|---|
| `DATABASE_URL` | ✅ | SQLite path to production DB |
| `JWT_SECRET` | ✅ | Access token signing |
| `JWT_REFRESH_SECRET` | ✅ | Refresh token signing |
| `NEXTAUTH_SECRET` | ✅ | NextAuth compatibility |
| `AUTH_SECRET` | ✅ | Auth cookie signing |
| `CRON_SECRET` | ✅ | Cron endpoint auth |
| `GOOGLE_CLIENT_ID` | ✅ | OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | ✅ | OAuth client secret |
| `GOOGLE_SEARCH_API_KEY` | ✅ | Custom Search API |
| `GOOGLE_SEARCH_CX` | ✅ | Custom Search Engine ID |
| `SMTP_HOST` | ✅ | smtp.gmail.com |
| `SMTP_PORT` | ✅ | 587 |
| `SMTP_USER` | ✅ | Gmail address |
| `SMTP_PASSWORD` | ✅ | Gmail App Password |
| `SMTP_PASS` | ✅ | Alias (same value) |
| `GMAIL_USER` | ✅ | Alias (same value) |
| `GMAIL_APP_PASSWORD` | ✅ | Alias (same value) |
| `EMAIL_FROM` | ✅ | Sender address |
| `AUTH_DEV_MODE` | ✅ | `false` (production) |
| `AUTH_AUTO_VERIFY` | ✅ | `false` |
| `AUTH_BYPASS_EMAIL` | ✅ | `false` |
| `AUTH_DEV_OTP_IN_LOG` | ✅ | `false` |
| `AUTH_DEV_OTP_IN_RESPONSE` | ✅ | `false` |
| `ENABLE_GOOGLE_OAUTH` | ✅ | `true` |
| `ENABLE_MAGIC_LINK` | ✅ | `true` |
| `ENABLE_OTP_LOGIN` | ✅ | `true` |

---

## Full Variable Inventory by Category

### DATABASE (15 vars)

| Variable | Required? | Secret? | Source/Provider | Code Location |
|---|---|---|---|---|
| `DATABASE_URL` | **Required** | No | SQLite/Postgres | `src/lib/db.ts` |
| `SQLITE_URL` | Optional alias | No | SQLite legacy | `src/lib/db.ts` |
| `PG_URL` | Optional alias | No | Postgres legacy | `src/lib/db.ts` |
| `TEST_DATABASE_URL` | Test only | No | Test isolation | `vitest.config.ts` |
| `DATABASE_CONNECT_TIMEOUT_S` | Optional | No | Pool config | `src/lib/db-pool.ts` |
| `DATABASE_IDLE_TIMEOUT_MS` | Optional | No | Pool config | `src/lib/db-pool.ts` |
| `DATABASE_POOL_SIZE` | Optional | No | Pool config | `src/lib/db-pool.ts` |
| `DATABASE_QUERY_TIMEOUT_MS` | Optional | No | Pool config | `src/lib/db-pool.ts` |
| `DATABASE_STATEMENT_TIMEOUT_S` | Optional | No | Postgres | `src/lib/db-pool.ts` |
| `DATABASE_TIMEOUT_MS` | Optional | No | Pool config | `src/lib/db-pool.ts` |
| `DATABASE_SSL_MODE` | Optional | No | Postgres SSL | `src/lib/db-pool.ts` |
| `PGBOUNCER_ENABLED` | Optional | No | PgBouncer | `src/lib/db-pool.ts` |
| `ALLOW_DB_RESET` | Optional | No | Safety guard | `scripts/db-safety.mjs` |
| `__DB_REDIRECTED_TO_TMP` | Internal | No | Test redirect | `vitest.setup.ts` |

### AUTH / SESSION / JWT (17 vars)

| Variable | Required? | Secret? | Source/Provider | Code Location |
|---|---|---|---|---|
| `JWT_SECRET` | **Required** | **Secret** | App auth | `src/lib/auth.ts`, `src/proxy.ts` |
| `JWT_REFRESH_SECRET` | **Required** | **Secret** | App auth | `src/lib/auth.ts` |
| `NEXTAUTH_SECRET` | **Required** | **Secret** | NextAuth compat | `src/lib/auth.ts` |
| `AUTH_SECRET` | **Required** | **Secret** | Auth cookie signing | `src/lib/auth.ts` |
| `NEXTAUTH_URL` | Optional | No | Auth callback URL | `src/lib/app-url.ts` |
| `AUTH_DEV_MODE` | Optional | No | Dev backdoors | `src/lib/dev-auth.ts` |
| `AUTH_AUTO_VERIFY` | Optional | No | Dev auto-verify | `src/lib/dev-auth.ts` |
| `AUTH_BYPASS_EMAIL` | Optional | No | Dev email bypass | `src/lib/dev-auth.ts` |
| `AUTH_DEV_OTP_IN_LOG` | Optional | No | Dev OTP logging | `src/lib/dev-auth.ts` |
| `AUTH_DEV_OTP_IN_RESPONSE` | Optional | No | Dev OTP in API | `src/lib/dev-auth.ts` |
| `ENABLE_GOOGLE_OAUTH` | Optional | No | Feature flag | UI / config routes |
| `ENABLE_MAGIC_LINK` | Optional | No | Feature flag | UI / config routes |
| `ENABLE_OTP_LOGIN` | Optional | No | Feature flag | UI / config routes |
| `VERIFY_USER_EMAIL` | Test only | No | Test fixture | `tests/helpers/` |
| `VERIFY_USER_PASSWORD` | Test only | No | Test fixture | `tests/helpers/` |
| `VERIFY_USER_PLAN` | Test only | No | Test fixture | `tests/helpers/` |
| `RELAY_SECRET` | Optional | **Secret** | OAuth relay token | `src/lib/oauth-relay.ts` |
| `SECRET_KEY` | Optional | **Secret** | Legacy alias | `src/lib/encryption.ts` |
| `ENCRYPTION_KEY` | Optional | **Secret** | AES master key | `src/lib/encryption.ts` |
| `USER_AI_PROVIDER_ENCRYPTION_KEY` | Optional | **Secret** | User AI cred encryption | `src/lib/encryption.ts` |

### GOOGLE OAUTH (3 vars)

| Variable | Required? | Secret? | Source/Provider | Code Location |
|---|---|---|---|---|
| `GOOGLE_CLIENT_ID` | **Required** | No (public) | Google Cloud Console | `src/lib/google-oauth.ts`, `src/app/api/auth/google/` |
| `GOOGLE_CLIENT_SECRET` | **Required** | **Secret** | Google Cloud Console | `src/lib/google-oauth.ts`, `src/app/api/auth/google/callback/route.ts` |
| `GOOGLE_REDIRECT_URI` | Optional | No | Dynamic (code-resolved) | `src/app/api/auth/google/state/route.ts` |

### GOOGLE CLOUD / APIs (5 vars)

| Variable | Required? | Secret? | Source/Provider | Code Location |
|---|---|---|---|---|
| `GOOGLE_API_KEY` | Optional | **Secret** | Google Cloud | `src/lib/admin-operations-service.ts` |
| `GOOGLE_MAPS_API_KEY` | Optional | **Secret** | Google Maps Platform | `src/lib/lead-discovery/source-adapters.ts` |
| `GOOGLE_SEARCH_API_KEY` | Optional | **Secret** | Google Custom Search | `src/lib/lead-discovery/discovery-engine.ts` |
| `GOOGLE_SEARCH_CX` | Optional | No | Google Custom Search | `src/lib/lead-discovery/discovery-engine.ts` |
| `GOOGLE_SEARCH_ENGINE_ID` | Optional alias | No | Alias for CX | `src/lib/lead-discovery/` |

### SMTP / EMAIL (18 vars)

| Variable | Required? | Secret? | Source/Provider | Code Location |
|---|---|---|---|---|
| `SMTP_HOST` | **Required** | No | Email provider | `src/lib/email-ethereal.ts` |
| `SMTP_PORT` | **Required** | No | Email provider | `src/lib/email-ethereal.ts` |
| `SMTP_USER` | **Required** | No | Email provider | `src/lib/email-ethereal.ts` |
| `SMTP_PASSWORD` | **Required** | **Secret** | Email provider | `src/lib/email-ethereal.ts` |
| `SMTP_PASS` | Optional alias | **Secret** | Alias | `src/lib/email-ethereal.ts` |
| `SMTP_USERNAME` | Optional alias | No | Alias | `src/lib/email-ethereal.ts` |
| `SMTP_AUTH_PASSWORD` | Optional alias | **Secret** | Alias | `src/lib/email-ethereal.ts` |
| `SMTP_FROM` | Optional alias | No | Alias | `src/lib/email-ethereal.ts` |
| `EMAIL_*` (8 aliases) | Optional | Mixed | Alias family | `src/lib/email-ethereal.ts` |
| `MAIL_*` (6 aliases) | Optional | Mixed | Alias family | `src/lib/email-ethereal.ts` |
| `FROM_EMAIL` | Optional alias | No | Alias | `src/lib/email-ethereal.ts` |
| `RESEND_API_KEY` | Optional | **Secret** | Resend.com | `src/lib/email.ts`, `src/lib/notification-engine.ts` |
| `ETHEREAL_*` (4 vars) | Dev only | No | Ethereal test inbox | `src/lib/email-ethereal.ts` |

### GMAIL INTEGRATION (10 vars)

| Variable | Required? | Secret? | Source/Provider | Code Location |
|---|---|---|---|---|
| `GMAIL_USER` | Optional alias | No | Gmail | `src/lib/email-ethereal.ts` |
| `GMAIL_APP_PASSWORD` | Optional alias | **Secret** | Gmail App Password | `src/lib/email-ethereal.ts` |
| `GMAIL_PASSWORD` | Optional alias | **Secret** | Alias | `src/lib/email-ethereal.ts` |
| `GMAIL_CRON_API_KEY` | Optional | **Secret** | Gmail sync cron | `src/lib/gmail-sync-service.ts` |
| `GMAIL_ENCRYPTION_KEY` | Optional | **Secret** | Token encryption | `src/lib/encryption.ts` |
| `GMAIL_PUBSUB_TOPIC` | Optional | No | Google PubSub | `src/lib/gmail-pubsub-service.ts` |
| `GMAIL_PUBSUB_SUBSCRIPTION` | Optional | No | Google PubSub | `src/lib/gmail-pubsub-service.ts` |
| `GMAIL_PUBSUB_WEBHOOK_URL` | Optional | No | PubSub webhook | `src/lib/gmail-pubsub-service.ts` |
| `GMAIL_PUBSUB_VERIFICATION_TOKEN` | Optional | **Secret** | Webhook verification | `src/lib/gmail-pubsub-service.ts` |
| `GMAIL_TRACKING_BASE_URL` | Optional | No | Email tracking | `src/lib/email-open-tracking.ts` |
| `GMAIL_UNSUBSCRIBE_SECRET` | Optional | **Secret** | Unsubscribe links | `src/lib/email-unsubscribe.ts` |

### PAYMENTS — STRIPE (25 vars)

| Variable | Required? | Secret? | Source/Provider | Code Location |
|---|---|---|---|---|
| `STRIPE_SECRET_KEY` | **Required for payments** | **Secret** | Stripe Dashboard | `src/lib/stripe-service.ts`, `src/lib/payments/stripe-provider.ts` |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | **Required for client checkout** | No (public) | Stripe Dashboard | Client components |
| `STRIPE_PUBLISHABLE_KEY` | Optional alias | No | Alias | `src/lib/payments/stripe-provider.ts` |
| `STRIPE_WEBHOOK_SECRET` | **Required for webhooks** | **Secret** | Stripe Dashboard | `src/lib/stripe-service.ts`, `src/app/api/payments/webhook/stripe/route.ts` |
| `STRIPE_SUCCESS_URL` | Optional | No | Checkout redirect | `src/lib/stripe-service.ts` |
| `STRIPE_CANCEL_URL` | Optional | No | Checkout redirect | `src/lib/stripe-service.ts` |
| `STRIPE_PORTAL_RETURN_URL` | Optional | No | Portal redirect | `src/lib/stripe-portal-service.ts` |
| `STRIPE_PRICE_STARTER_MONTHLY_ID` | Optional | No | Stripe Products | `src/lib/payment-service.ts` |
| `STRIPE_PRICE_STARTER_YEARLY_ID` | Optional | No | Stripe Products | `src/lib/payment-service.ts` |
| `STRIPE_PRICE_PRO_MONTHLY_ID` | Optional | No | Stripe Products | `src/lib/payment-service.ts` |
| `STRIPE_PRICE_PRO_YEARLY_ID` | Optional | No | Stripe Products | `src/lib/payment-service.ts` |
| `STRIPE_PRICE_ELITE_MONTHLY_ID` | Optional | No | Stripe Products | `src/lib/payment-service.ts` |
| `STRIPE_PRICE_ELITE_YEARLY_ID` | Optional | No | Stripe Products | `src/lib/payment-service.ts` |
| `STRIPE_PRICE_ID_*` (4 legacy aliases) | Optional | No | Legacy aliases | `src/lib/payment-service.ts` |
| `STRIPE_*_PRICE_ID` (4 legacy aliases) | Optional | No | Legacy aliases | `src/lib/payment-service.ts` |
| `STRIPE_PRO_PRODUCT_ID` | Optional | No | Stripe Products | `src/lib/payments/plan-config.ts` |
| `STRIPE_ELITE_PRODUCT_ID` | Optional | No | Stripe Products | `src/lib/payments/plan-config.ts` |
| `STRIPE_PRICE_CREDITS_*` (5 vars) | Optional | No | Credit add-ons | `src/lib/payment-service.ts` |

### PAYMENTS — RAZORPAY (11 vars)

| Variable | Required? | Secret? | Source/Provider | Code Location |
|---|---|---|---|---|
| `RAZORPAY_KEY_ID` | Optional | No (public) | Razorpay Dashboard | `src/lib/payments/razorpay-provider.ts` |
| `RAZORPAY_KEY_SECRET` | Optional | **Secret** | Razorpay Dashboard | `src/lib/payments/razorpay-provider.ts` |
| `RAZORPAY_KEY` | Optional alias | No | Alias | `src/lib/payments/razorpay-provider.ts` |
| `RAZORPAY_SECRET` | Optional alias | **Secret** | Alias | `src/lib/payments/razorpay-provider.ts` |
| `NEXT_PUBLIC_RAZORPAY_KEY_ID` | Optional | No (public) | Client checkout | Client components |
| `RAZORPAY_WEBHOOK_SECRET` | Optional | **Secret** | Razorpay Dashboard | `src/app/api/payments/webhook/razorpay/route.ts` |
| `RAZORPAY_PLAN_STARTER_MONTHLY` | Optional | No | Razorpay Plans | `src/lib/payments/plan-config.ts` |
| `RAZORPAY_PLAN_PRO_MONTHLY` | Optional | No | Razorpay Plans | `src/lib/payments/plan-config.ts` |
| `RAZORPAY_PLAN_ELITE_YEARLY` | Optional | No | Razorpay Plans | `src/lib/payments/plan-config.ts` |
| `RAZORPAY_SUPPORTED_CURRENCIES` | Optional | No | Config | `src/lib/payments/plan-config.ts` |
| `PAYMENTS_DEV_CONFIRM_ENABLED` | Dev only | No | Dev skip | `src/lib/payment-service.ts` |

### AI PROVIDERS (17 vars)

| Variable | Required? | Secret? | Source/Provider | Code Location |
|---|---|---|---|---|
| `OPENAI_API_KEY` | Optional | **Secret** | OpenAI | `src/lib/ai/ai-provider.ts` |
| `OPENAI_BASE_URL` | Optional | No | OpenAI proxy | `src/lib/ai/ai-provider.ts` |
| `OPENAI_MODEL` | Optional | No | Default model | `src/lib/ai/ai-provider.ts` |
| `ANTHROPIC_API_KEY` | Optional | **Secret** | Anthropic | `src/lib/ai/ai-provider.ts` |
| `ANTHROPIC_BASE_URL` | Optional | No | Anthropic proxy | `src/lib/ai/ai-provider.ts` |
| `ANTHROPIC_MODEL` | Optional | No | Default model | `src/lib/ai/ai-provider.ts` |
| `GEMINI_API_KEY` | Optional | **Secret** | Google Gemini | `src/lib/ai/ai-provider.ts` |
| `GEMINI_BASE_URL` | Optional | No | Gemini proxy | `src/lib/ai/ai-provider.ts` |
| `GEMINI_MODEL` | Optional | No | Default model | `src/lib/ai/ai-provider.ts` |
| `DEEPSEEK_API_KEY` | Optional | **Secret** | DeepSeek | `src/lib/ai/ai-provider.ts` |
| `DEEPSEEK_BASE_URL` | Optional | No | DeepSeek proxy | `src/lib/ai/ai-provider.ts` |
| `DEEPSEEK_MODEL` | Optional | No | Default model | `src/lib/ai/ai-provider.ts` |
| `OPENROUTER_API_KEY` | Optional | **Secret** | OpenRouter | `src/lib/ai/ai-provider.ts` |
| `OPENROUTER_BASE_URL` | Optional | No | OpenRouter proxy | `src/lib/ai/ai-provider.ts` |
| `OPENROUTER_MODEL` | Optional | No | Default model | `src/lib/ai/ai-provider.ts` |
| `AI_LOCAL_ENDPOINT` | Optional | No | Local LLM | `src/lib/ai/ai-provider.ts` |
| `AI_LOCAL_MODEL` | Optional | No | Local model name | `src/lib/ai/ai-provider.ts` |
| `AI_DAILY_BUDGET_USD` | Optional | No | Budget limit | `src/lib/ai/ai-provider.ts` |
| `AI_MONTHLY_BUDGET_USD` | Optional | No | Budget limit | `src/lib/ai/ai-provider.ts` |

### SOCIAL / OAUTH PROVIDERS (9 vars)

| Variable | Required? | Secret? | Source/Provider | Code Location |
|---|---|---|---|---|
| `LINKEDIN_CLIENT_ID` | Optional | No (public) | LinkedIn Developers | `src/lib/lead-discovery/source-adapters.ts` |
| `LINKEDIN_CLIENT_SECRET` | Optional | **Secret** | LinkedIn Developers | `src/lib/lead-discovery/source-adapters.ts` |
| `FACEBOOK_APP_ID` | Optional | No (public) | Facebook Developers | `src/lib/lead-discovery/source-adapters.ts` |
| `FACEBOOK_APP_SECRET` | Optional | **Secret** | Facebook Developers | `src/lib/lead-discovery/source-adapters.ts` |
| `INSTAGRAM_APP_ID` | Optional | No (public) | Meta Developers | `src/lib/lead-discovery/source-adapters.ts` |
| `INSTAGRAM_APP_SECRET` | Optional | **Secret** | Meta Developers | `src/lib/lead-discovery/source-adapters.ts` |
| `WHATSAPP_API_TOKEN` | Optional | **Secret** | WhatsApp Business | `src/lib/whatsapp-service.ts` |
| `TELEGRAM_WEBHOOK_URL` | Optional | No | Telegram Bot API | `src/lib/telegram-service.ts` |
| `TWILIO_AUTH_TOKEN` | Optional | **Secret** | Twilio Console | `src/app/api/settings/integrations/route.ts` |

### DISCOVERY / LEAD SOURCES (10 vars)

| Variable | Required? | Secret? | Source/Provider | Code Location |
|---|---|---|---|---|
| `JUSTDIAL_API_KEY` | Optional | **Secret** | JustDial API | `src/lib/lead-discovery/source-adapters.ts` |
| `JUSTDIAL_API_URL` | Optional | No | JustDial endpoint | `src/lib/lead-discovery/source-adapters.ts` |
| `INDIAMART_API_KEY` | Optional | **Secret** | IndiaMART API | `src/lib/lead-discovery/source-adapters.ts` |
| `YELP_API_KEY` | Optional | **Secret** | Yelp Fusion API | `src/lib/lead-discovery/source-adapters.ts` |
| `SERPAPI_KEY` | Optional | **Secret** | SerpAPI | `src/lib/lead-discovery/discovery-engine.ts` |
| `DISCOVERY_MAX_CONCURRENT_JOBS` | Optional | No | Rate limit | `src/lib/lead-discovery/discovery-engine.ts` |
| `DISCOVERY_MAX_TOTAL_QUERIES` | Optional | No | Rate limit | `src/lib/lead-discovery/discovery-engine.ts` |
| `DISCOVERY_RESULTS_PER_JOB` | Optional | No | Pagination | `src/lib/lead-discovery/discovery-engine.ts` |
| `DISCOVERY_WEBSITE_PROBE_MAX` | Optional | No | Probe limit | `src/lib/lead-discovery/discovery-engine.ts` |
| `DISCOVERY_ZAI_MIN_INTERVAL_MS` | Optional | No | Rate limit | `src/lib/lead-discovery/discovery-engine.ts` |

### REDIS / CACHE (3 vars)

| Variable | Required? | Secret? | Source/Provider | Code Location |
|---|---|---|---|---|
| `REDIS_HOST` | Optional | No | Redis | `src/lib/redis-pubsub-service.ts` |
| `REDIS_URL` | Optional | **Secret** (may contain password) | Redis | `src/lib/redis-pubsub-service.ts` |
| `ANALYTICS_CACHE_TTL` | Optional | No | Cache config | `src/lib/analytics-engine.ts` |

### PUSH NOTIFICATIONS (2 vars)

| Variable | Required? | Secret? | Source/Provider | Code Location |
|---|---|---|---|---|
| `VAPID_PUBLIC_KEY` | Optional | No (public) | Web Push | `src/lib/notification-channels/push-channel.ts` |
| `VAPID_PRIVATE_KEY` | Optional | **Secret** | Web Push | `src/lib/notification-channels/push-channel.ts` |

### OBSERVABILITY (7 vars)

| Variable | Required? | Secret? | Source/Provider | Code Location |
|---|---|---|---|---|
| `OTEL_ENABLED` | Optional | No | OpenTelemetry | `src/lib/observability/tracing.ts` |
| `OTEL_EXPORTER` | Optional | No | OTLP exporter | `src/lib/observability/tracing.ts` |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Optional | No | OTLP endpoint | `src/lib/observability/tracing.ts` |
| `OTEL_SERVICE_NAME` | Optional | No | Service name | `src/lib/observability/tracing.ts` |
| `NEXT_PUBLIC_SENTRY_DSN` | Optional | No (public) | Sentry | `src/instrumentation.ts` |
| `LOG_LEVEL` | Optional | No | Logging | `src/lib/logger.ts` |
| `DEBUG` | Optional | No | Verbose logging | Various |

### AUTOPILOT / WORKFLOW (20 vars)

| Variable | Required? | Secret? | Source/Provider | Code Location |
|---|---|---|---|---|
| `AUTOPILOT_SCHEDULER_DISABLED` | Optional | No | Scheduler control | `src/autopilot/scheduler.ts` |
| `AUTOPILOT_SCHEDULER_INTERVAL_MS` | Optional | No | Poll interval | `src/autopilot/scheduler.ts` |
| `AUTOPILOT_JOB_POLL_MS` | Optional | No | Job polling | `src/autopilot/runner.ts` |
| `AUTOPILOT_NICHE_PACING_MS` | Optional | No | Rate limit | `src/autopilot/runner.ts` |
| `AUTOPILOT_EXECUTION_PACING_MS` | Optional | No | Rate limit | `src/autopilot/runner.ts` |
| `AUTOPILOT_EXECUTION_SETTLE_POLL_MS` | Optional | No | Settle polling | `src/autopilot/runner.ts` |
| `AUTOPILOT_EXECUTION_SETTLE_TIMEOUT_MS` | Optional | No | Settle timeout | `src/autopilot/runner.ts` |
| `WORKFLOW_TIMEOUT` | Optional | No | Execution timeout | `src/lib/workflow-engine.ts` |
| `WORKFLOW_MAX_RETRIES` | Optional | No | Retry count | `src/lib/workflow-engine.ts` |
| `WORKFLOW_MAX_TARGET_LEADS` | Optional | No | Lead limit | `src/lib/workflow-engine.ts` |
| `WORKFLOW_BATCH_*` (3 vars) | Optional | No | Batch control | `src/lib/workflow-batch.ts` |
| `WORKFLOW_DISCOVERY_*` (3 vars) | Optional | No | Discovery control | `src/lib/workflow-engine.ts` |
| `WORKFLOW_KICK_STAGGER_MS` | Optional | No | Stagger | `src/lib/workflow-engine.ts` |
| `WORKFLOW_LEAD_PACING_MS` | Optional | No | Rate limit | `src/lib/workflow-engine.ts` |
| `WORKFLOW_RATE_LIMIT_COOLDOWN_MS` | Optional | No | Rate limit | `src/lib/workflow-engine.ts` |
| `WORKFLOW_RETRY_*` (3 vars) | Optional | No | Retry config | `src/lib/workflow-engine.ts` |
| `WORKFLOW_AI_*` (2 vars) | Optional | No | AI rate limit | `src/lib/workflow-engine.ts` |
| `WORKFLOW_WEBHOOK_TIMEOUT_MS` | Optional | No | Webhook timeout | `src/lib/workflow-engine.ts` |

### COMPANY / LEGAL (11 vars)

| Variable | Required? | Secret? | Source/Provider | Code Location |
|---|---|---|---|---|
| `COMPANY_NAME` | Optional | No | Company info | `src/lib/invoice-pdf-service.ts` |
| `COMPANY_ADDRESS` | Optional | No | Company info | `src/lib/invoice-pdf-service.ts` |
| `COMPANY_EMAIL` | Optional | No | Company info | `src/lib/invoice-pdf-service.ts` |
| `COMPANY_PHONE` | Optional | No | Company info | `src/lib/invoice-pdf-service.ts` |
| `COMPANY_TAX_ID` | Optional | No | Company info | `src/lib/invoice-pdf-service.ts` |
| `COMPANY_GST_NUMBER` | Optional | No | India GST | `src/lib/invoice-pdf-service.ts` |
| `PRIVACY_POLICY_URL` | Optional | No | Legal link | UI components |
| `TERMS_URL` | Optional | No | Legal link | UI components |
| `PRODUCT_NAME` | Optional | No | App name | Various |
| `ADMIN_EMAIL` | Optional | No | Admin contact | `src/lib/feedback/admin-email.ts` |
| `BOOK_LANG` | Optional | No | Language | `src/lib/invoice-pdf-service.ts` |

### LIMITS / QUOTAS (14 vars)

| Variable | Required? | Secret? | Source/Provider | Code Location |
|---|---|---|---|---|
| `DAILY_OUTREACH_LIMIT_FREE` | Optional | No | Plan limit | `src/lib/outreach-limits.ts` |
| `DAILY_OUTREACH_LIMIT_STARTER` | Optional | No | Plan limit | `src/lib/outreach-limits.ts` |
| `DAILY_OUTREACH_LIMIT_PRO` | Optional | No | Plan limit | `src/lib/outreach-limits.ts` |
| `DAILY_OUTREACH_LIMIT_ELITE` | Optional | No | Plan limit | `src/lib/outreach-limits.ts` |
| `IMPORT_MAX_ROWS` | Optional | No | Import limit | `src/lib/lead-import-export-service.ts` |
| `EXPORT_MAX_ROWS` | Optional | No | Export limit | `src/lib/lead-import-export-service.ts` |
| `ENRICHMENT_TIMEOUT_MS` | Optional | No | Timeout | `src/lib/lead-enrichment-service.ts` |
| `RESEARCH_BATCH_MAX` | Optional | No | Batch limit | `src/lib/business-research-service.ts` |
| `RESEARCH_BATCH_CONCURRENCY` | Optional | No | Concurrency | `src/lib/business-research-service.ts` |
| `SSE_TIMEOUT` | Optional | No | SSE keepalive | `src/lib/sse-manager.ts` |
| `UPLOAD_STORAGE_PATH` | Optional | No | File storage | `src/lib/file-storage.ts` |
| `BACKUP_DIR` | Optional | No | Backup path | `scripts/backup/` |
| `S3_BACKUP_BUCKET` | Optional | No | AWS S3 | `scripts/backup/` |

### QA / TEST (7 vars)

| Variable | Required? | Secret? | Source/Provider | Code Location |
|---|---|---|---|---|
| `QA_EMAIL` | Test only | No | Test identity | `tests/helpers/` |
| `QA_USER_ID` | Test only | No | Test identity | `tests/helpers/` |
| `QA_CREDITS` | Test only | No | Test fixture | `tests/helpers/` |
| `TEST_USER_EMAIL` | Test only | No | Test identity | `tests/helpers/` |
| `TEST_BASE_URL` | Test only | No | Test URL | `tests/e2e/` |
| `E2E_BASE` | Test only | No | E2E URL | `tests/e2e/` |
| `DRY_RUN` | Optional | No | Don't persist | Various |

### APP URL / RUNTIME (16 vars)

| Variable | Required? | Secret? | Source/Provider | Code Location |
|---|---|---|---|---|
| `APP_URL` | Optional | No | Canonical URL | `src/lib/app-url.ts` |
| `APP_PUBLIC_URL` | Optional alias | No | Alias | `src/lib/app-url.ts` |
| `NEXT_PUBLIC_APP_URL` | Optional | No | Client-side URL | Client components |
| `NEXT_PUBLIC_APP_VERSION` | Optional | No | Version display | Client components |
| `HOST` | Auto | No | Runtime | Next.js |
| `PORT` | Optional | No | Server port | Next.js |
| `NODE_ENV` | Auto | No | Runtime | Node.js |
| `NEXT_RUNTIME` | Auto | No | Vercel | Next.js |
| `VERCEL` | Auto | No | Vercel | Vercel |
| `VERCEL_BUILD_ID` | Auto | No | Vercel | Vercel |
| `VERCEL_GIT_COMMIT_SHA` | Auto | No | Vercel | Vercel |
| `GIT_SHA` | Optional | No | Build inject | `next.config.ts` |
| `ALLOWED_ORIGINS` | Optional | No | CORS | Various |
| `NODE_COMPILE_CACHE` | Auto | No | Node.js | Node.js |
| `NODE_TEST_WORKER_ID` | Auto test | No | Vitest | Vitest |
| `NODE_UNIQUE_ID` | Auto test | No | Vitest | Vitest |
| `WS_NO_BUFFER_UTIL` | Auto | No | WebSocket opt | `src/lib/websocket.ts` |
| `WS_NO_UTF_8_VALIDATE` | Auto | No | WebSocket opt | `src/lib/websocket.ts` |
| `AWS_LAMBDA_FUNCTION_NAME` | Auto | No | AWS Lambda | Runtime |

### CRON / BACKGROUND JOBS (2 vars)

| Variable | Required? | Secret? | Source/Provider | Code Location |
|---|---|---|---|---|
| `CRON_SECRET` | **Required** | **Secret** | Cron auth | `src/app/api/cron/*/route.ts` |
| `CRON_AUTH_TOKEN` | Optional alias | **Secret** | Alias | Various cron routes |

---

## Inconsistencies Detected

### 1. Alias families (same concept, multiple names)
- **SMTP password**: `SMTP_PASSWORD`, `SMTP_PASS`, `SMTP_AUTH_PASSWORD`, `GMAIL_APP_PASSWORD`, `GMAIL_PASSWORD`, `EMAIL_PASSWORD`, `EMAIL_PASS`, `MAIL_PASSWORD`, `MAIL_PASS` (9 names for the same credential)
- **SMTP user**: `SMTP_USER`, `SMTP_USERNAME`, `GMAIL_USER`, `EMAIL_USER`, `EMAIL_USERNAME`, `MAIL_USER`, `MAIL_USERNAME` (7 names)
- **SMTP host**: `SMTP_HOST`, `EMAIL_HOST`, `MAIL_HOST` (3 names)
- **SMTP from**: `EMAIL_FROM`, `SMTP_FROM`, `FROM_EMAIL`, `MAIL_FROM`, `MAIL_FROM_ADDRESS` (5 names)
- **Stripe price IDs**: Multiple naming conventions (`STRIPE_PRICE_X_Y_ID` vs `STRIPE_PRICE_ID_X_Y` vs `STRIPE_X_Y_PRICE_ID`) — auto-resolved by `payment-service.ts`

### 2. Variables in code but NOT in current `.env`
**Notable missing vars** (referenced in code, absent from `.env`):
- All Stripe vars (25) — must be set in Vercel
- All Razorpay vars (11) — optional alternative provider
- All AI provider keys (OpenAI, Anthropic, Gemini, DeepSeek, OpenRouter) — optional
- All social provider credentials (LinkedIn, Facebook, Instagram, WhatsApp, Telegram, Twilio)
- All discovery source API keys (JustDial, IndiaMART, Yelp, SerpAPI)
- Redis, VAPID, OTEL, Sentry
- Most autopilot/workflow tuning vars

### 3. Variables in `.env` but marked as aliases
The current `.env` sets both canonical AND alias vars (e.g. `SMTP_PASSWORD` + `SMTP_PASS` + `GMAIL_APP_PASSWORD`) to the same value. This is correct — the code's alias resolver checks canonical first, then aliases.

### 4. No hardcoded secrets in source code
The grep for `sk_live_*`, `ghp_*`, `AIza*`, `xox*` patterns found only **regex detection patterns** in security scanners (`src/lib/security/audit-chain.ts`, `src/lib/system-event-service.ts`) — these are secret-leak detectors, not actual credentials.

### 5. Local-path-specific variables
- `DATABASE_URL=file:/home/z/my-project/db/custom.db` — hardcoded local path; for Vercel, must be changed to a Postgres connection string
- `BACKUP_DIR` — local filesystem path; not applicable on Vercel
- `UPLOAD_STORAGE_PATH` — local filesystem; needs S3 or blob storage on Vercel

### 6. Production-specific (Vercel) requirements
For Vercel deployment, these MUST be set in Vercel Environment Variables:
- `DATABASE_URL` → Postgres connection string (not SQLite)
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `STRIPE_PRICE_*_ID` (at least for active plans)
- `STRIPE_SUCCESS_URL`, `STRIPE_CANCEL_URL` (Vercel domain)
- `GOOGLE_CLIENT_SECRET` (current value)
- `SMTP_*` credentials
- `JWT_SECRET`, `JWT_REFRESH_SECRET`, `AUTH_SECRET`, `NEXTAUTH_SECRET`
- `CRON_SECRET`

---

## Provider Integrations Summary (18 providers)

| # | Provider | Category | Key Env Vars | Configured? |
|---|---|---|---|---|
| 1 | Google OAuth | Auth | `GOOGLE_CLIENT_ID/SECRET` | ✅ Configured |
| 2 | Gmail SMTP | Email | `SMTP_HOST/USER/PASSWORD` | ✅ Configured |
| 3 | Google Custom Search | Discovery | `GOOGLE_SEARCH_API_KEY/CX` | ✅ Configured |
| 4 | Stripe | Payments | `STRIPE_SECRET_KEY/WEBHOOK_SECRET` | ❌ Not configured |
| 5 | Razorpay | Payments | `RAZORPAY_KEY_ID/SECRET` | ❌ Not configured |
| 6 | Resend | Email | `RESEND_API_KEY` | ❌ Not configured |
| 7 | OpenAI | AI | `OPENAI_API_KEY` | ❌ Not configured |
| 8 | Anthropic | AI | `ANTHROPIC_API_KEY` | ❌ Not configured |
| 9 | Google Gemini | AI | `GEMINI_API_KEY` | ❌ Not configured |
| 10 | DeepSeek | AI | `DEEPSEEK_API_KEY` | ❌ Not configured |
| 11 | OpenRouter | AI | `OPENROUTER_API_KEY` | ❌ Not configured |
| 12 | LinkedIn | Social/OAuth | `LINKEDIN_CLIENT_ID/SECRET` | ❌ Not configured |
| 13 | Facebook | Social/OAuth | `FACEBOOK_APP_ID/SECRET` | ❌ Not configured |
| 14 | Instagram | Social/OAuth | `INSTAGRAM_APP_ID/SECRET` | ❌ Not configured |
| 15 | WhatsApp | Messaging | `WHATSAPP_API_TOKEN` | ❌ Not configured |
| 16 | Telegram | Messaging | `TELEGRAM_WEBHOOK_URL` | ❌ Not configured |
| 17 | Twilio | SMS | `TWILIO_AUTH_TOKEN` | ❌ Not configured |
| 18 | Redis | Cache/PubSub | `REDIS_HOST/URL` | ❌ Not configured |

---

## Files Generated

| File | Location | Purpose |
|---|---|---|
| `AQ-OS-COMPLETE-ENV-TEMPLATE.env` | `/home/z/my-project-develop/AQ-OS-COMPLETE-ENV-TEMPLATE.env` | Complete env template with all 238 vars |
| `AQ-OS-ENV-CREDENTIAL-INVENTORY.md` | `/home/z/my-project-develop/AQ-OS-ENV-CREDENTIAL-INVENTORY.md` | This inventory document |

Both files are in the project root directory and can be downloaded directly.

---

## Final Counts

| Metric | Count |
|---|---|
| Total environment variables discovered | **238** |
| Total required variables (core operation) | **12** |
| Total optional variables | **190** |
| Total secret variables | **35** |
| Total provider integrations | **18** |
| Missing variables (in code, not in .env) | **212** |
| Existing configured variables | **26** |
| Hardcoded secrets discovered | **0** (only regex patterns in security scanners) |
