# pdf_body_data2.py — Chapters 11-19 (verified against repository HEAD 30624fe)

CHAPTERS_2 = [
("11. Payments (Stripe and Razorpay)", [
('p', 'Two gateways are integrated and both are optional: without keys the provider-status '
      'endpoint reports them unavailable, the UI hides checkout, and nothing else breaks. Stripe '
      '(SDK 22.1.1, API version 2025-04-30.basil) handles subscriptions, credit add-ons, refunds '
      'and the billing portal. Razorpay (SDK 2.9.6) is the India-first gateway with one-time '
      'orders and mandate subscriptions. Mode is auto-detected from key prefixes (sk_test_ vs '
      'sk_live_, rzp_test_ vs rzp_live_).'),
('table',
 ['Aspect', 'Stripe', 'Razorpay'],
 [
  ['Keys', 'STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY, 16 price-ID names resolved', 'RAZORPAY_KEY_ID/KEY_SECRET/WEBHOOK_SECRET, NEXT_PUBLIC_RAZORPAY_KEY_ID, RAZORPAY_PLAN_*'],
  ['Webhook endpoint', '/api/payments/webhook/stripe', '/api/payments/webhook/razorpay'],
  ['Events handled', '11 types incl. checkout.session.completed, invoice.payment_failed, charge.refunded, subscription events', '8 types incl. payment.captured, subscription.charged, refund.processed'],
  ['Verification', 'constructEvent() signature; production rejects unsigned webhooks', 'HMAC-SHA256 constant-time compare; webhook HMAC over raw body'],
  ['Local testing', 'stripe listen --forward-to localhost:3000/api/payments/webhook/stripe', 'Test keys + dashboard-forwarded webhook'],
 ], [0.16, 0.44, 0.40], 'Gateway comparison (verified in the webhook routes and provider services).'),
('p', 'For local Stripe testing: install the Stripe CLI (brew install stripe/stripe-cli), run '
      'stripe login, then stripe listen --forward-to localhost:3000/api/payments/webhook/stripe '
      'and copy the printed whsec value into STRIPE_WEBHOOK_SECRET. Test cards such as 4242 '
      '4242 4242 4242 complete checkout. Razorpay test keys come from the Razorpay dashboard and '
      'its webhook can be verified by triggering a test payment from the dashboard.'),
]),

("12. Authentication and Admin Dashboard", [
('p', 'Authentication is a custom JWT stack (no next-auth in use). Access tokens live 15 minutes '
      'and refresh tokens 30 days, both signed with JWT_SECRET (issuer acquisitionos, audience '
      'acquisitionos-api) and stored in httpOnly SameSite=strict cookies; the refresh cookie is '
      'scoped to the /api/auth path. Passwords use bcrypt at 12 rounds. OTP codes are 6 digits '
      'with 10-minute expiry, a 5-attempt limit and constant-time comparison; accounts lock for '
      '15 minutes after 5 failed logins. TOTP MFA, known-device tracking and security alerts are '
      'built in.'),
('table',
 ['Flow', 'Sequence (verified)'],
 [
  ['OTP login', '/api/auth/otp/request (email code) then /api/auth/otp/verify (session + cookies)'],
  ['Magic link', '/api/auth/magic-link/request then /magic-link/verify (redirect with session)'],
  ['Google OAuth', '/api/auth/google/state builds authUrl with dynamically derived redirect_uri, then /api/auth/callback/google exchanges the code, upserts the user (role owner, plan free, 14-day trial) and sets cookies'],
  ['Session refresh', 'POST /api/auth/refresh rotates the pair and revokes the old session'],
  ['Signout', 'POST /api/auth/signout revokes the session (optionally all devices)'],
 ], [0.20, 0.80], 'Primary auth flows. First-login via Google creates role owner with a 14-day trial.'),
('h2', '12.1 Admin authorization'),
('bullets', [
 'Roles are super_admin, owner, admin, member, viewer; every /api/admin/* handler wraps in '
 'withSuperAdmin, which demands exactly role super_admin from the database.',
 'The four /admin pages (overview, users, billing, feedback) are guarded server-side by '
 'getSuperAdminSession(), which re-loads the user from the database on every request.',
 'There is no promotion API and no SUPER_ADMIN_EMAIL variable: becoming admin is a direct DB '
 'role update (for example via Prisma Studio), documented in ADMIN-DASHBOARD-ACCESS.md.',
 'The documented super-admin account contact@prabhat.online logs in through the same public '
 'OTP or Google flows. No bypass exists and none should be created.',
]),
]),

("13. Application Startup (frontend and backend together)", [
('p', 'There is no separate backend server to start. One command runs everything: the Next.js '
      'dev server serves the React app and all 507 API routes in the same process on port 3000.'),
('code',
 'npm run dev            # Turbopack dev server on http://localhost:3000, logs to dev.log\n'
 'curl -s localhost:3000/api/health\n'
 'open http://localhost:3000\n'
 '# stop: Ctrl-C  (or:  lsof -ti :3000 | xargs kill)'),
('p', 'Expected output starts with the Next.js 16 banner (Turbopack) and "Ready". The health '
      'endpoint returns a JSON status object. For a production-shaped run on the Mac, build with '
      'webpack (the repository already pins --webpack in both build and vercel-build scripts to '
      'avoid Turbopack memory pressure on smaller machines) and start the standalone server:'),
('code',
 'npm run build          # prisma generate, next build --webpack, clean-standalone\n'
 'npm start              # start.js assembles .next/standalone and serves on :3000'),
('callout', 'If the dev server is ever killed with exit code 137 on a small-RAM Mac, that is '
            'Turbopack memory pressure, not a code error: free memory or reduce concurrent work; '
            'production builds already use webpack.'),
]),

("14. Workflows and Background Jobs", [
('p', 'The workflow system offers a visual builder with 14 trigger types (lead_discovered, '
      'lead_moved, lead_reply, gmail_connected, email_received, telegram_received, '
      'whatsapp_received, payment_success, trial_ending, credits_low, ai_completed, webhook, '
      'scheduled, manual) and 17 action types (send_email, ai_analysis, ai_outreach, '
      'wait_delay, conditional_branch, webhook_call, score_lead and more). Executions are '
      'tracked in WorkflowExecution and WorkflowLog with per-step status, retries (default 3) '
      'and a database-backed dead-letter queue with manual retry endpoints. Seven built-in '
      'templates ship in src/lib/workflow-templates.ts.'),
('table',
 ['Cron endpoint (/api/cron/)', 'Purpose', 'Local trigger'],
 [
  ['expire-api-keys', 'Mark expired API keys', 'curl POST + Bearer CRON_SECRET'],
  ['renew-subscriptions', 'Renew credit allocations; downgrades; free reset', 'same'],
  ['credit-renewal / end-of-period', 'Subscription period processing', 'same'],
  ['payment-reconciliation', 'Sweep Stripe/Razorpay for missed fulfillments', 'same (GET)'],
  ['process-sequences / sequence-processing', 'Advance outreach sequences', 'same'],
  ['process-gmail-replies', 'Classify new Gmail replies', 'same'],
  ['hot-lead-scan / sdr-cycle', 'Hot lead detection; SDR autonomous cycle', 'same'],
  ['autonomous-outreach', 'Process autonomous outreach queue', 'same'],
  ['meeting-reminders', 'Send due meeting reminder emails', 'same'],
 ], [0.34, 0.42, 0.24], 'All 12 cron endpoints are Bearer-protected by CRON_SECRET.'),
('p', 'No local scheduler is wired: trigger jobs manually with curl using '
      'Authorization: Bearer $CRON_SECRET. In production an external scheduler (Cloudflare '
      'Worker dispatcher or GCP Cloud Scheduler, both documented in docs/deployment/) POSTs each '
      'endpoint; vercel.json contains no crons key, so Vercel Cron will not fire them '
      'automatically. Scheduled workflow triggers additionally require the optional Python '
      'Celery stack.'),
]),

("15. Local End-to-End Test Checklist", [
('p', 'After completing setup, verify each area below. Every item corresponds to a real route '
      'or page verified in this repository.'),
('table',
 ['Area', 'What to verify', 'Expected result'],
 [
  ['Application', 'Homepage, /auth/signin, OTP request, verify, dashboard, signout', 'Pages render; real OTP email arrives; session persists'],
  ['Database', '/api/health, /api/health/database, Prisma Studio, CRUD in a tab', 'OK status; rows visible and editable'],
  ['Email', 'OTP and magic-link requests', 'Real delivery via SMTP/Resend; no dev-mode banner'],
  ['AI', 'Dashboard AI chat, lead analysis', 'Replies generated (Z-AI needs no key)'],
  ['Lead discovery', 'Discovery job with search keys configured', 'Leads found; without keys, explicit config error'],
  ['Credits', 'AI actions consume credits; billing page ledger', 'Balance decreases per action cost'],
  ['Payments', 'Stripe test checkout + webhook event; Razorpay test payment', 'Order verified; subscription/credits applied'],
  ['Admin', 'super_admin account login, /admin sections', 'Overview, Users, Billing, Feedback all load'],
  ['Security', 'Normal user opens /admin; unauthenticated API call', 'Redirect to /; 401/403 JSON responses'],
 ], [0.16, 0.44, 0.40], 'End-to-end verification matrix.'),
]),

("16. Local to Staging to Production", [
('p', 'The same codebase moves through three environments. What changes is configuration, '
      'never code: URLs, secrets, database, payment mode, and the scheduler. The repository '
      'contains a prepared PostgreSQL path for production because SQLite cannot persist on '
      'ephemeral hosts such as Vercel.'),
('table',
 ['Aspect', 'Local', 'Staging', 'Production'],
 [
  ['Runtime', 'npm run dev (Turbopack)', 'npm run build && npm start or platform build', 'same as staging, live secrets'],
  ['Database', 'SQLite file', 'managed PostgreSQL recommended', 'PostgreSQL required on Vercel'],
  ['Auth secrets', 'self-generated dev values', 'separate staging secrets', 'separate production secrets'],
  ['Google OAuth', 'localhost redirect whitelisted', 'staging redirect whitelisted', 'production redirect whitelisted'],
  ['Payments', 'sk_test_ / rzp_test_', 'test keys + staging webhook', 'live keys + production webhook'],
  ['Cron', 'manual curl', 'external scheduler to staging URL', 'external scheduler to production URL'],
 ], [0.16, 0.28, 0.28, 0.28], 'Environment matrix (details in LOCAL-TO-PRODUCTION-DEPLOYMENT.md).'),
('bullets', [
 'Database migration: schema.production.prisma (PostgreSQL/Supabase) plus the guided script '
 'scripts/migrate-to-postgresql.sh and the rollback runbook infra/db-migration-rollback.md.',
 'Deployment targets verified in-repo: vercel.json (npm install --legacy-peer-deps, build '
 'command npm run build, region sin1; note: no crons key), root Dockerfile (node:20-alpine '
 'two-stage, standalone output, HEALTHCHECK on /api/health), and per-platform runbooks under '
 'docs/deployment/ (Cloudflare, GCP, AWS, Azure, EC2/K8s/Railway/Render).',
 'Dockerfile note: it copies .npmrc, which is currently absent from the repository - create an '
 'empty .npmrc or adjust the COPY line before containerized builds.',
 'Production webhooks to register: /api/payments/webhook/stripe, /api/payments/webhook/razorpay, '
 'optionally /api/gmail/pubsub/webhook, /api/telegram/webhook and /api/calendar/webhook.',
 'Backups: scripts/backup/backup.sh (sqlite3 .backup, gzip, integrity check, optional S3, '
 '30-day rotation) - always pass DB_PATH=db/custom.db because the built-in default points '
 'elsewhere; pg_dump supported for PostgreSQL.',
]),
]),

("17. Troubleshooting", [
('p', 'Only verified failure modes are listed. Each entry names the symptom, the confirmed '
      'cause in this codebase, how to verify it, and the fix.'),
('table',
 ['Symptom', 'Cause (verified)', 'Fix'],
 [
  ['npm install ERESOLVE peer conflict', 'next-auth 4 vs nodemailer 8 ranges', 'npm install --legacy-peer-deps (exact repo command)'],
  ['Dev server killed, exit 137', 'Turbopack memory pressure on small-RAM machines', 'Free RAM; builds already use --webpack'],
  ['Port 3000 in use', 'Stale process', 'lsof -ti :3000 | xargs kill'],
  ['Cannot find module @prisma/client', 'generate skipped', 'npm run db:generate'],
  ['SQLITE_BUSY / database locked', 'Concurrent writers on the SQLite file', 'Retry; keep a single app instance locally'],
  ['OTP shows dev-mode banner', 'No email provider configured', 'Set real SMTP_* values (or RESEND_API_KEY)'],
  ['Gmail SMTP 535 auth error', 'Wrong/missing App Password or 2FA off', 'Create a 16-char App Password'],
  ['Google redirect_uri_mismatch', 'Localhost redirect not whitelisted', 'Add http://localhost:3000/api/auth/callback/google'],
  ['401 on APIs after login', 'Access cookie expired (15 min)', 'Re-login or POST /api/auth/refresh'],
  ['403 on /api/admin/*', 'Account is not super_admin in DB', 'Update User.role (Prisma Studio)'],
  ['Discovery error "No search API configured"', 'Missing discovery keys', 'Set GOOGLE_SEARCH_API_KEY + GOOGLE_SEARCH_CX or SERPAPI_KEY'],
  ['Build killed (exit 137)', 'Build memory limit', 'NODE_OPTIONS=--max-old-space-size=2560 npm run build'],
  ['Docker build fails at COPY .npmrc', '.npmrc absent from repo', 'Create an empty .npmrc or remove the COPY line'],
 ], [0.30, 0.34, 0.36], 'Verified troubleshooting matrix.'),
]),

("18. Complete Command Reference", [
('table',
 ['Purpose', 'Directory', 'Command'],
 [
  ['Install dependencies', 'project root', 'npm install --legacy-peer-deps'],
  ['Generate Prisma client', 'project root', 'npm run db:generate'],
  ['Push schema to SQLite', 'project root', 'npm run db:push'],
  ['Seed sample data (destructive)', 'project root', 'bun run scripts/seed.ts'],
  ['Start application (dev)', 'project root', 'npm run dev'],
  ['Start application (prod)', 'project root', 'npm run build && npm start'],
  ['Run tests (vitest, 37 files)', 'project root', 'npm test'],
  ['Run lint (ESLint 9 flat)', 'project root', 'npm run lint'],
  ['Prisma Studio', 'project root', 'npx prisma studio'],
  ['Security scan (needs Bun)', 'project root', 'npm run security:scan'],
  ['Database backup / restore', 'project root', 'npm run backup / npm run backup:restore'],
  ['Trigger a cron job', 'project root', 'curl -X POST localhost:3000/api/cron/<job> -H "Authorization: Bearer $CRON_SECRET"'],
  ['Optional realtime sidecar', 'mini-services/realtime-service', 'bun install && bun run dev'],
  ['Optional backend stack', 'project root', 'make install-backend && make backend'],
 ], [0.34, 0.24, 0.42], 'Consolidated command table (all scripts verified in package.json and Makefile).'),
]),

("19. Security Notes", [
('bullets', [
 'Secret hygiene: .gitignore covers .env*; never paste real keys into documentation, screenshots '
 'or chat. The shareable template is .env.example with placeholders only.',
 'Rotate exposed credentials: the git-tracked ensure-env.sh historically embedded real Google '
 'OAuth, Gmail app-password and search API values. Rotate them at their providers and store '
 'replacements only in .env.',
 'AUTH_DEV_MODE must be false (or unset with real email configured) in any shared environment; '
 'production builds can never expose OTP codes regardless of this flag.',
 'Cookies: access and refresh tokens are httpOnly, SameSite=strict, secure in production; the '
 'refresh cookie is path-scoped to /api/auth. HTTPS is mandatory outside localhost.',
 'Webhooks: Stripe production rejects unsigned deliveries; Razorpay verifies HMAC-SHA256 over '
 'the raw body in constant time; keep webhook secrets set in every non-local environment.',
 'Admin: /api/admin/* demands role super_admin from the database on every call (withSuperAdmin), '
 'and /admin pages re-verify server-side. There is deliberately no authentication bypass, no '
 'backdoor and no promotion endpoint; admin creation is a manual, audited DB change.',
 'Rate limiting and account lockout are enforced in-process (per-instance); horizontal '
 'deployments should front the app with a shared limiter if abuse becomes a concern.',
 'Known non-blocking items tracked for later: 322 pre-existing TypeScript errors hidden by '
 'ignoreBuildErrors, OpenTelemetry installed but not initialized, and a handful of unused '
 'dependencies. None affect the setup path documented here.',
]),
]),
]
