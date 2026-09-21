# Pre-Launch Checklist (Go/No-Go)

Every item must be checked before exposing AcquisitionOS to the public. Grouped for sign-off; failure of ANY item in a "blocker" group = no-go.

---

## A. Secrets & Configuration (blocker)

- [ ] All production secrets set on the production platform (NOT in `.env` on a sandbox): `DATABASE_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `APP_URL`, `NEXT_PUBLIC_APP_URL`, `CRON_SECRET`
- [ ] `JWT_*` secrets are fresh (never used in any dev/sandbox environment)
- [ ] `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` set; dev values rotated
- [ ] SMTP credentials set and REAL (`SMTP_USER`, `SMTP_PASSWORD` app password without spaces, `EMAIL_FROM` = same mailbox)
- [ ] Stripe: `STRIPE_SECRET_KEY` (live), `STRIPE_WEBHOOK_SECRET` (live endpoint), publishable key set
- [ ] Dev-only flags ABSENT from production env: `AUTH_DEV_MODE`, `AUTH_BYPASS_EMAIL`, `AUTH_AUTO_VERIFY`, `AUTH_DEV_OTP_IN_LOG`, `AUTH_DEV_OTP_IN_RESPONSE`
- [ ] Optional channels configured or explicitly disabled: `TELEGRAM_BOT_TOKEN`, Twilio/Meta WhatsApp creds, VAPID keys, `REDIS_URL`
- [ ] `GMAIL_ENCRYPTION_KEY` (32-char) set for credential encryption at rest
- [ ] No `GEMINI_API_KEY`/`Z_AI_KEY` placeholders lingering (not read by code — remove to avoid confusion)

## B. Database (blocker)

- [ ] PostgreSQL provisioned (SQLite not used in production)
- [ ] `prisma/schema.prisma` datasource switched to `postgresql`; `prisma migrate deploy` completed
- [ ] Data migration from dev verified (if applicable — `scripts/migrate-to-postgresql.sh` + schema annotations)
- [ ] Connection pooling configured (`directUrl` if using PgBouncer/Supabase)
- [ ] Backup job scheduled (`npm run backup`) and a restore has been TESTED
- [ ] `/api/health/database` returns healthy under production load

## C. Google OAuth (blocker)

- [ ] Production redirect URI registered: `https://<prod-domain>/api/auth/callback/google`
- [ ] Any additional domains (www/apex) each registered individually
- [ ] OAuth consent screen published (or test users correct for a private beta); verification submitted if sensitive scopes (Gmail/Calendar) are public
- [ ] Google sign-in tested end-to-end on the production domain (no `redirect_uri_mismatch`)
- [ ] `/api/auth/config` → `{"googleAvailable":true,"emailConfigured":true}`

## D. Email / SMTP (blocker)

- [ ] Real email delivered: signup OTP, password reset, magic link all arrive (not in spam — check SPF/DKIM/DMARC for the from-domain; for Gmail, use the mailbox's own domain)
- [ ] `node scripts/smtp-verify.js` → SMTP AUTH SUCCESS from the production host
- [ ] Sending limits understood (Gmail 500/day free / 2000 Workspace) or Resend transport enabled
- [ ] Bounce handling observed (`EmailBounce` rows on forced bounce test)

## E. Payments (blocker for monetization)

- [ ] Live webhook endpoint registered in Stripe: `https://<prod-domain>/api/payments/webhook/stripe` with correct events
- [ ] Live-mode checkout tested with a REAL card (small amount) → subscription + credits + invoice generated
- [ ] Refund path tested (dashboard-initiated AND app-initiated)
- [ ] Failed-payment path tested (declined card → dunning/recovery behavior sane)
- [ ] Tax/GST behavior reviewed for target markets (`TaxRate`, Indian user flow)
- [ ] Razorpay configured if serving India (or India flow disabled deliberately)

## F. Auth Methods (blocker)

- [ ] Email+password signup → verify → login → logout → login again
- [ ] OTP login and Magic Link verified with real email delivery
- [ ] MFA enrollment + login with TOTP + backup code recovery
- [ ] Session revocation verified (settings → sessions → revoke all kills other tabs)
- [ ] Account lockout verified (failed attempts lock; admin unlock path known)

## G. Core Product Flows (blocker)

- [ ] Discovery run completes with real API keys; leads scored with reasoning
- [ ] AI outreach generated + sent; open/click tracking fires
- [ ] Reply handling classifies a real reply; meeting intent → slot → booking works (with connected Google Calendar)
- [ ] Credits deduct correctly and block at zero; renewal cron verified
- [ ] Cron endpoints scheduled and authorized: `process-sequences`, `meeting-reminders`, `sdr-cycle`, `hot-lead-scan`, `credit-renewal`, `end-of-period`, `payment-reconciliation` (Bearer `CRON_SECRET`)

## H. Infrastructure (blocker)

- [ ] SSL certificate active (auto with Railway/Vercel; verify padlock + HSTS)
- [ ] Always-on hosting (Railway recommended) — NOT the GLM sandbox
- [ ] Logs accessible (platform log viewer) and rotated
- [ ] Error monitoring live (Sentry DSN or equivalent) with alert routing
- [ ] Uptime monitoring on `/api/health` (external pinger)
- [ ] Rate limiting active on public routes (`src/lib/security/rate-limiter.ts` reviewed per-route); cron endpoints Bearer-protected
- [ ] Security headers/CORS reviewed (`src/lib/security/security-headers.ts`, `cors-config.ts`)

## I. Hygiene (blocker)

- [ ] No hardcoded test credentials anywhere in code (`grep -rn "rodv\|sk_test\|GOCSPX\|password=" src/ scripts/` clean)
- [ ] All `console.log` with sensitive data removed or gated behind dev flags (check `src/lib/email-ethereal.ts` diagnostics print SET/MISSING only — keep it that way)
- [ ] `middleware.ts` decision made consciously (disabled in sandbox — verify per-route auth before public launch or re-enable)
- [ ] `competitor-intelligence-service.ts.bak` removed
- [ ] Legal pages present and accurate (`/privacy`, `/terms`, `/legal`) — consent screen, GDPR endpoints (`/api/gdpr/*`) functional
- [ ] `.env` never committed (`.gitignore` verified); secrets only in platform panels

## J. Post-Launch (day-1 readiness)

- [ ] Rollback plan: previous deployment tagged (Railway/Vercel instant rollback tested)
- [ ] Support path live: feedback widget verified end-to-end (`FeedbackReport` → admin console)
- [ ] Monitoring dashboards: AI costs (`/api/ai/costs`), email bounces, webhook failures, system metrics
- [ ] Incident runbook acknowledged (see `09-troubleshooting/COMMON-ERRORS.md` + `DEPLOYMENT-GLM.md` ops section)
- [ ] Feature status communicated honestly (WhatsApp = notifications only; no app control via chat)
