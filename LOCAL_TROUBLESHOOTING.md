# AcquisitionOS — Local Development Troubleshooting Guide

> **Last Updated:** 2025-03-04  
> **Audience:** Developers running AcquisitionOS locally

This guide covers every common issue you may encounter while developing AcquisitionOS locally, along with root causes, step-by-step fixes, and verification steps.

---

## Table of Contents

1. [Common Issues](#1-common-issues)
   - [Startup Issues](#11-startup-issues)
   - [Build / Compilation Issues](#12-build--compilation-issues)
   - [Authentication Issues](#13-authentication-issues)
   - [Payment Issues](#14-payment-issues)
   - [Database Issues](#15-database-issues)
   - [Redis Issues](#16-redis-issues)
   - [Email Issues](#17-email-issues)
   - [Realtime Issues](#18-realtime-issues)
2. [Diagnostic Commands](#2-diagnostic-commands)
3. [Reset Procedures](#3-reset-procedures)
4. [Environment Debugging](#4-environment-debugging)

---

## 1. Common Issues

### 1.1 Startup Issues

---

#### Blank Page / White Screen

| | |
|---|---|
| **Symptom** | The app loads but shows a blank white page, sometimes with only the GLM AI logo visible. The browser tab title may load but no interactive content renders. |
| **Root Cause** | Multiple possible causes: missing environment variables, unhandled JavaScript errors crashing the render, middleware blocking the request, or a failed build that still serves a stale shell. |
| **Solution** | 1. Open **DevTools → Console** and look for red errors. |
| | 2. Check that `.env.local` exists and has all required variables (see [Environment Debugging](#4-environment-debugging)). |
| | 3. Check `dev.log` for build or runtime errors: |
| | ```bash |
| | tail -100 dev.log |
| | ``` |
| | 4. If you see middleware errors, temporarily disable middleware by renaming `middleware.ts`: |
| | ```bash |
| | mv src/middleware.ts src/middleware.ts.bak |
| | ``` |
| | 5. Clear the Next.js cache and restart: |
| | ```bash |
| | rm -rf .next && bun run dev |
| | ``` |
| **Verification** | The app renders the landing page or dashboard with interactive elements. No errors in browser console. |

---

#### Port 3000 Already in Use

| | |
|---|---|
| **Symptom** | `bun run dev` fails with `EADDRINUSE` or "Port 3000 is already in use". |
| **Root Cause** | Another process (a previous dev server, a Docker container, or another app) is occupying port 3000. |
| **Solution** | 1. Find the offending process: |
| | ```bash |
| | lsof -ti:3000 |
| | ``` |
| | 2. Kill it: |
| | ```bash |
| | kill -9 $(lsof -ti:3000) |
| | ``` |
| | 3. If a Docker container is the culprit: |
| | ```bash |
| | docker ps --filter "publish=3000" |
| | docker stop <container_id> |
| | ``` |
| | 4. Restart the dev server: |
| | ```bash |
| | bun run dev |
| | ``` |
| **Verification** | `lsof -ti:3000` returns the PID of your new dev server only. The app loads at the preview URL. |

---

#### `MODULE_NOT_FOUND` Errors

| | |
|---|---|
| **Symptom** | Server or browser console shows `Cannot find module '<package>'` or `Module not found: Can't resolve '<package>'`. |
| **Root Cause** | Dependencies are not installed, or a package was added to `package.json` but never installed. |
| **Solution** | 1. Reinstall all dependencies: |
| | ```bash |
| | bun install |
| | ``` |
| | 2. If the error references a local module (e.g., `@/lib/db`), verify the file exists and the import path matches the alias in `tsconfig.json`. |
| | 3. For Prisma-related module errors, regenerate the client: |
| | ```bash |
| | bun run db:generate |
| | ``` |
| **Verification** | The app starts without `MODULE_NOT_FOUND` errors. Check `dev.log` for a clean startup. |

---

#### Prisma Client Not Generated

| | |
|---|---|
| **Symptom** | Runtime error: `@prisma/client did not initialize yet`. Or TypeScript errors referencing `PrismaClient`. |
| **Root Cause** | The Prisma client must be generated after schema changes or a fresh clone. |
| **Solution** | 1. Generate the client: |
| | ```bash |
| | bunx prisma generate |
| | ``` |
| | 2. If schema has changed, push it to the database first: |
| | ```bash |
| | bun run db:push |
| | ``` |
| | 3. Restart the dev server. |
| **Verification** | `import { db } from '@/lib/db'` works without errors. A simple query like `db.user.count()` returns a number. |

---

#### `.env.local` Missing

| | |
|---|---|
| **Symptom** | App starts but features silently fail — auth redirects fail, Stripe errors, database connection refused, etc. |
| **Root Cause** | `.env.local` is git-ignored and must be created manually from the template. |
| **Solution** | 1. Copy the template: |
| | ```bash |
| | cp .env.example .env.local |
| | ``` |
| | 2. Fill in all required values (see [Environment Debugging](#4-environment-debugging)). |
| | 3. Restart the dev server — Next.js reads `.env.local` only at startup. |
| **Verification** | `curl http://localhost:3000/api/health/detailed` returns `status: "ok"` with all service checks passing. |

---

#### Docker Not Running

| | |
|---|---|
| **Symptom** | Services that depend on Docker (PostgreSQL, Redis, Mailpit) fail to connect. You may see "connection refused" errors. |
| **Root Cause** | Docker Desktop or the Docker daemon is not running. |
| **Solution** | 1. Start Docker: |
| | ```bash |
| | # macOS / Windows: open Docker Desktop |
| | # Linux: |
| | sudo systemctl start docker |
| | ``` |
| | 2. Start the local stack: |
| | ```bash |
| | docker compose -f docker-compose.local.yml up -d |
| | ``` |
| | 3. Verify containers are running: |
| | ```bash |
| | docker compose -f docker-compose.local.yml ps |
| | ``` |
| **Verification** | All containers show status `Up`. `redis-cli ping` returns `PONG`. `psql` connects successfully. |

---

#### Redis Connection Refused

| | |
|---|---|
| **Symptom** | `ECONNREFUSED 127.0.0.1:6379` in server logs. Caching, sessions, or pub/sub features fail silently. |
| **Root Cause** | Redis is not running locally or the `REDIS_URL` in `.env.local` is incorrect. |
| **Solution** | 1. Check if Redis is running: |
| | ```bash |
| | redis-cli ping |
| | # Expected: PONG |
| | ``` |
| | 2. If not running, start it via Docker: |
| | ```bash |
| | docker compose -f docker-compose.local.yml up -d redis |
| | ``` |
| | 3. Or start directly: |
| | ```bash |
| | redis-server |
| | ``` |
| | 4. Verify the `REDIS_URL` in `.env.local`: |
| | ```bash |
| | # Should be something like: |
| | REDIS_URL=redis://localhost:6379 |
| | ``` |
| **Verification** | `redis-cli ping` returns `PONG`. The app's health endpoint shows Redis as connected. |

---

### 1.2 Build / Compilation Issues

---

#### Turbopack HMR Cache Corruption

| | |
|---|---|
| **Symptom** | Error: `subscription-store.ts module factory not available` or similar "module factory" errors. HMR stops working — file changes are not reflected. |
| **Root Cause** | Turbopack's hot-module-replacement cache in `.next/` becomes corrupted, often after a git branch switch or an abrupt process termination. |
| **Solution** | 1. Stop the dev server. |
| | 2. Delete the corrupted cache: |
| | ```bash |
| | rm -rf .next |
| | ``` |
| | 3. Restart: |
| | ```bash |
| | bun run dev |
| | ``` |
| **Verification** | The app starts cleanly. HMR works — edit a component file, save, and the change appears in the browser without a full reload. |

---

#### TypeScript Compilation Errors

| | |
|---|---|
| **Symptom** | `bun run dev` or `bun run lint` shows TypeScript errors. Red squiggly lines in your editor. |
| **Root Cause** | Type mismatches, missing type definitions, or stale generated types (e.g., Prisma). |
| **Solution** | 1. If Prisma types are stale: |
| | ```bash |
| | bunx prisma generate |
| | ``` |
| | 2. For missing type packages: |
| | ```bash |
| | bun add -d @types/<package> |
| | ``` |
| | 3. Run the linter to see all errors at once: |
| | ```bash |
| | bun run lint |
| | ``` |
| | 4. Fix errors one by one. Common fixes include: |
| |    - Adding `null` checks for optional fields |
| |    - Providing explicit return types for async functions |
| |    - Using type assertions (`as`) only as a last resort |
| **Verification** | `bun run lint` passes with zero errors. The dev server starts without type errors in `dev.log`. |

---

#### Tailwind CSS Not Applying Styles

| | |
|---|---|
| **Symptom** | HTML renders but looks unstyled — no colors, spacing, or responsive behavior. Or, some classes work but custom ones don't. |
| **Root Cause** | Tailwind's content paths are misconfigured, or the CSS file is not imported in the layout. |
| **Solution** | 1. Verify `tailwind.config.ts` includes your component paths: |
| | ```ts |
| | content: [ |
| |   './src/**/*.{ts,tsx}', |
| | ], |
| | ``` |
| | 2. Ensure `src/app/globals.css` imports Tailwind: |
| | ```css |
| | @import "tailwindcss"; |
| | ``` |
| | 3. Verify your root layout (`src/app/layout.tsx`) imports the CSS: |
| | ```tsx |
| | import '@/app/globals.css' |
| | ``` |
| | 4. Clear cache and restart: |
| | ```bash |
| | rm -rf .next && bun run dev |
| | ``` |
| **Verification** | Inspect any element — Tailwind utility classes appear in the computed styles. Changing a class in a component and saving triggers an HMR update with visible style changes. |

---

#### Import Resolution Failures

| | |
|---|---|
| **Symptom** | `Cannot find module '@/components/...'` or similar path-alias resolution errors. |
| **Root Cause** | The `paths` mapping in `tsconfig.json` does not match the actual file structure, or the file simply doesn't exist. |
| **Solution** | 1. Check `tsconfig.json` for the `paths` configuration: |
| | ```json |
| | { |
| |   "compilerOptions": { |
| |     "paths": { |
| |       "@/*": ["./src/*"] |
| |     } |
| |   } |
| | } |
| | ``` |
| | 2. Verify the file exists at the expected path: |
| | ```bash |
| | ls src/components/ui/button.tsx |
| | ``` |
| | 3. If you just created a new file, restart the dev server — TypeScript's file watcher can miss new files occasionally. |
| **Verification** | The import resolves without errors. No red squiggly lines in the editor. |

---

#### `next build` Fails

| | |
|---|---|
| **Symptom** | Running `bun run build` produces errors and exits with a non-zero code. |
| **Root Cause** | Could be TypeScript errors, missing environment variables at build time, or a server component importing client-only code. |
| **Solution** | 1. Read the full error output — `next build` is verbose and pinpoints the file. |
| | 2. Common fixes: |
| |    - **Server component importing `'use client'` code:** Move the import to a client component wrapper. |
| |    - **Missing env vars at build time:** Add them to `.env.local` (Next.js includes `.env.local` during builds). |
| |    - **TypeScript errors:** Fix them (see [TypeScript Compilation Errors](#typescript-compilation-errors)). |
| | 3. For a clean build: |
| | ```bash |
| | rm -rf .next && bun run build |
| | ``` |
| **Verification** | Build completes with `✓ Compiled successfully` and zero errors. The `.next/` directory contains the production bundle. |

---

### 1.3 Authentication Issues

---

#### Google OAuth Callback Fails (`redirect_uri_mismatch`)

| | |
|---|---|
| **Symptom** | Clicking "Sign in with Google" shows a Google error page: "Error 400: redirect_uri_mismatch". |
| **Root Cause** | The `redirect_uri` sent by NextAuth does not match any authorized redirect URI in the Google Cloud Console. |
| **Solution** | 1. Go to [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials). |
| | 2. Select your OAuth 2.0 Client. |
| | 3. Under **Authorized redirect URIs**, add: |
| | ``` |
| | http://localhost:3000/api/auth/callback/google |
| | ``` |
| | 4. If using a preview URL, also add: |
| | ``` |
| | https://<your-preview-domain>/api/auth/callback/google |
| | ``` |
| | 5. Save and wait ~5 minutes for propagation. |
| | 6. Verify `NEXTAUTH_URL` in `.env.local` matches: |
| | ```bash |
| | NEXTAUTH_URL=http://localhost:3000 |
| | ``` |
| **Verification** | Click "Sign in with Google" — you are redirected to Google's consent screen, then back to the app logged in. |

---

#### OTP Not Received (SMTP Misconfigured)

| | |
|---|---|
| **Symptom** | The "Send OTP" button appears to work but no email arrives in the inbox. |
| **Root Cause** | SMTP credentials are wrong, the email provider is blocking the request, or Mailpit is not running. |
| **Solution** | 1. If using Mailpit for local dev, ensure it's running: |
| | ```bash |
| | docker compose -f docker-compose.local.yml up -d mailpit |
| | # Check at http://localhost:8025 |
| | ``` |
| | 2. If using Gmail, verify: |
| |    - You're using an **App Password**, not your regular password. |
| |    - 2FA is enabled on the Google account. |
| |    - `SMTP_USER` and `SMTP_PASS` are correct in `.env.local`. |
| | 3. Test the SMTP connection manually (see [Environment Debugging](#44-how-to-test-smtp-connection)). |
| | 4. **Dev shortcut:** Set `AUTH_DEV_MODE=true` to bypass email and have the OTP returned in the API response. |
| **Verification** | OTP email appears in Mailpit (or Gmail inbox). Or with `AUTH_DEV_MODE=true`, the OTP is visible in the network response. |

---

#### Magic Link Expired / Invalid

| | |
|---|---|
| **Symptom** | Clicking a magic link in the email shows "Link expired or invalid". |
| **Root Cause** | Magic links have a short TTL (typically 10 minutes). The link may have expired, or the token was already consumed. |
| **Solution** | 1. Request a new magic link. |
| | 2. Check that `NEXTAUTH_URL` matches the URL you're actually using (preview URL vs. localhost). |
| | 3. Ensure the email client isn't pre-fetching the link (some email clients "read" links, consuming the token). |
| | 4. Increase the token TTL in your auth configuration if needed for development. |
| **Verification** | A freshly requested magic link logs you in immediately. |

---

#### JWT Token Expired / Invalid

| | |
|---|---|
| **Symptom** | API calls return `401 Unauthorized` with "token expired" or "invalid token". |
| **Root Cause** | The JWT has expired, `NEXTAUTH_SECRET` changed (invalidating all tokens), or the system clock is skewed. |
| **Solution** | 1. Log out and log back in to get a fresh token. |
| | 2. Verify `NEXTAUTH_SECRET` hasn't changed in `.env.local`. |
| | 3. Check system clock: |
| | ```bash |
| | date |
| | # Ensure it's accurate |
| | ``` |
| | 4. If `NEXTAUTH_SECRET` was regenerated, all existing sessions are invalidated — this is expected. |
| **Verification** | After re-login, API calls succeed without 401 errors. |

---

#### Session Not Persisting

| | |
|---|---|
| **Symptom** | You log in successfully but are logged out on page refresh or navigation. |
| **Root Cause** | Session cookie is not being set correctly, or is being cleared by the browser due to misconfigured domain/secure flags. |
| **Solution** | 1. In DevTools → Application → Cookies, check if `next-auth.session-token` (or `__Secure-next-auth.session-token`) exists. |
| | 2. If using a preview URL with HTTPS, ensure `NEXTAUTH_URL` uses `https://`. |
| | 3. Check that `NEXTAUTH_SECRET` is set. |
| | 4. If using Redis for sessions, verify Redis is running (see [Redis Connection Refused](#redis-connection-refused)). |
| **Verification** | After login, refreshing the page keeps you logged in. The session cookie persists across navigations. |

---

#### `AUTH_DEV_MODE` Left On in Production

| | |
|---|---|
| **Symptom** | OTP is returned in API responses. Anyone can log in as any user without email verification. |
| **Root Cause** | `AUTH_DEV_MODE=true` was left in `.env.local` or deployed to production. This flag bypasses real authentication by including the OTP in the API response body. |
| **Solution** | 1. **Immediately** remove or set `AUTH_DEV_MODE=false` in all environments. |
| | 2. Invalidate all existing sessions (rotate `NEXTAUTH_SECRET`). |
| | 3. Audit recent logins for suspicious activity. |
| | 4. Add a CI check that fails if `AUTH_DEV_MODE` is set in production: |
| | ```bash |
| | # In your CI pipeline |
| | if [ "$AUTH_DEV_MODE" = "true" ]; then |
| |   echo "ERROR: AUTH_DEV_MODE must not be true in production" |
| |   exit 1 |
| | fi |
| | ``` |
| **Verification** | OTP is no longer visible in API responses. Login requires a real OTP delivered via email. |

---

#### CORS Errors on Auth Endpoints

| | |
|---|---|
| **Symptom** | Browser console shows `Access-Control-Allow-Origin` errors when calling auth endpoints from a different origin (e.g., preview URL vs. localhost). |
| **Root Cause** | The CORS policy in the auth configuration doesn't include the origin you're requesting from. |
| **Solution** | 1. Add your preview URL to the allowed origins in `next.config.ts`: |
| | ```ts |
| | // next.config.ts |
    | const nextConfig = { |
    |   allowedDevOrigins: ['your-preview-domain'], |
    | } |
    | ``` |
| | 2. If using a custom CORS middleware, add the origin there. |
| | 3. For development only, you can use a browser extension to disable CORS (not recommended for production). |
| **Verification** | Auth requests from the preview URL succeed without CORS errors in the console. |

---

### 1.4 Payment Issues

---

#### Stripe Checkout Not Redirecting

| | |
|---|---|
| **Symptom** | Clicking "Upgrade" auto-completes without redirecting to the Stripe checkout page. The subscription shows as active without payment. |
| **Root Cause** | The payment bypass bug — the upgrade action short-circuits to a success state instead of creating a Stripe Checkout Session. This can happen if `STRIPE_SECRET_KEY` is missing (causing a silent fallback) or if the code has a bug that skips the Stripe redirect. |
| **Solution** | 1. Verify `STRIPE_SECRET_KEY` is set in `.env.local`: |
| | ```bash |
    | echo $STRIPE_SECRET_KEY | head -c 8 |
    | # Should show "sk_test_" or "sk_live_" |
    | ``` |
| | 2. Check the upgrade API endpoint — ensure it creates a Checkout Session: |
| | ```ts |
    | // Expected flow: |
    | const session = await stripe.checkout.sessions.create({...}) |
    | return redirect(session.url) |
    | ``` |
| | 3. Check `dev.log` for errors from the Stripe API: |
| | ```bash |
    | rg -i "stripe" dev.log | tail -20 |
    | ``` |
| | 4. Test with a real Stripe test key — never use an empty or placeholder key. |
| **Verification** | Clicking "Upgrade" redirects to a Stripe Checkout page. Completing checkout with a test card updates the subscription. |

---

#### Webhook Signature Verification Fails

| | |
|---|---|
| **Symptom** | Stripe webhook endpoint returns `400` — "Webhook signature verification failed". Events are not processed. |
| **Root Cause** | `STRIPE_WEBHOOK_SECRET` doesn't match the signing secret of the webhook endpoint. This happens when using the wrong endpoint's secret, or when the CLI generates a new secret on restart. |
| **Solution** | 1. If using the Stripe CLI, it prints the webhook signing secret on startup. Copy it to `.env.local`: |
| | ```bash |
    | STRIPE_WEBHOOK_SECRET=whsec_... |
    | ``` |
| | 2. If using a Stripe Dashboard webhook, copy the signing secret from the endpoint details. |
| | 3. Restart the dev server after updating `.env.local`. |
| | 4. Verify the CLI is forwarding to the correct port: |
| | ```bash |
    | stripe listen --forward-to localhost:3000/api/stripe/webhook |
    | ``` |
| **Verification** | Webhook events are received and processed. Check `dev.log` for "Webhook processed" messages. |

---

#### Payment Succeeds but Subscription Not Updated

| | |
|---|---|
| **Symptom** | Stripe shows a successful payment, but the app still shows the old plan (e.g., "Free" instead of "Pro"). |
| **Root Cause** | The `checkout.session.completed` webhook event was not received or failed to process. |
| **Solution** | 1. Check if the Stripe CLI is running and forwarding events: |
| | ```bash |
    | stripe listen --forward-to localhost:3000/api/stripe/webhook |
    | ``` |
| | 2. Check `dev.log` for webhook processing errors. |
| | 3. Manually replay the event from the Stripe Dashboard: **Developers → Webhooks → [Endpoint] → Events → Resend**. |
| | 4. Verify the webhook handler correctly updates the database: |
| | ```bash |
    | bun run db:studio |
    | # Check the Subscription table for the user |
    | ``` |
| **Verification** | After the webhook is processed, the user's subscription status in the database matches their Stripe subscription. The UI reflects the updated plan. |

---

#### Stripe CLI Not Forwarding Events

| | |
|---|---|
| **Symptom** | `stripe listen` is running but events never reach the webhook endpoint. |
| **Root Cause** | The CLI is forwarding to the wrong port, the dev server is not running, or the API key doesn't match the account with the events. |
| **Solution** | 1. Verify the forward-to URL: |
| | ```bash |
    | stripe listen --forward-to localhost:3000/api/stripe/webhook |
    | ``` |
| | 2. Ensure the dev server is running on port 3000. |
| | 3. Verify the API key matches the correct Stripe account: |
| | ```bash |
    | stripe config --list |
    | ``` |
| | 4. Trigger a test event to verify the pipeline: |
| | ```bash |
    | stripe trigger payment_intent.succeeded |
    | ``` |
| **Verification** | The `stripe trigger` event appears in the CLI output as "forwarded" and is processed by the webhook endpoint. |

---

#### Test Card Numbers Not Working

| | |
|---|---|
| **Symptom** | Entering Stripe test card `4242 4242 4242 4242` results in a "card declined" error. |
| **Root Cause** | You're using a **live** API key instead of a **test** key. Test cards only work with `sk_test_*` / `pk_test_*` keys. |
| **Solution** | 1. Verify your keys in `.env.local`: |
| | ```bash |
    | # Should start with sk_test_ and pk_test_ |
    | STRIPE_SECRET_KEY=sk_test_... |
    | NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_... |
    | ``` |
| | 2. Get test keys from the Stripe Dashboard (toggle "Test mode" on). |
| | 3. Common test card numbers: |
    | | Card Number | Result |
    | |---|---|
    | | `4242 4242 4242 4242` | Success |
    | | `4000 0025 0000 3155` | Requires authentication |
    | | `4000 0000 0000 9995` | Declined |
    | | `4000 0000 0000 3220` | 3D Secure |
| **Verification** | Test card `4242 4242 4242 4242` (any future expiry, any CVC, any postal code) completes checkout successfully. |

---

#### Idempotency Key Conflicts

| | |
|---|---|
| **Symptom** | Stripe API returns `idempotency_key_in_use` or you see duplicate charges. |
| **Root Cause** | The same idempotency key was reused for a different request, or a previous request with the same key is still being processed. |
| **Solution** | 1. Use unique idempotency keys — typically a combination of user ID, action, and timestamp. |
| | 2. Do not reuse keys across different request payloads. |
| | 3. If you see this in development, it's safe to wait 24 hours for the key to expire or use a fresh key. |
| | 4. Check your code for accidental key reuse in loops or retries. |
| **Verification** | Each Stripe API call uses a unique idempotency key. No `idempotency_key_in_use` errors. |

---

### 1.5 Database Issues

---

#### Prisma Migration Fails

| | |
|---|---|
| **Symptom** | `bunx prisma migrate dev` fails with SQL errors or "migration could not be applied". |
| **Root Cause** | The migration SQL conflicts with the current database state, or there's a schema drift. |
| **Solution** | 1. For local development, the fastest fix is to reset: |
| | ```bash |
    | bunx prisma migrate reset |
    | ``` |
| | 2. If you need to keep data, read the error carefully — it usually identifies the conflicting column/table. |
| | 3. For SQLite-specific issues, delete the database file: |
| | ```bash |
    | rm prisma/dev.db |
    | bunx prisma migrate dev |
    | ``` |
| | 4. For PostgreSQL, drop and recreate: |
| | ```bash |
    | docker compose -f docker-compose.local.yml down -v |
    | docker compose -f docker-compose.local.yml up -d |
    | bunx prisma migrate dev |
    | ``` |
| **Verification** | `bunx prisma migrate status` shows "Database schema is up to date!". |

---

#### SQLite Locked Errors

| | |
|---|---|
| **Symptom** | `SQLite3::BusyException: database is locked` or `SQLITE_BUSY`. |
| **Root Cause** | SQLite only supports one writer at a time. Multiple processes or long-running transactions can cause lock contention. |
| **Solution** | 1. Kill any lingering processes: |
| | ```bash |
    | lsof prisma/dev.db |
    | kill <pid> |
    | ``` |
| | 2. Increase the busy timeout in the Prisma schema: |
| | ```prisma |
    | datasource db { |
    |   provider = "sqlite" |
    |   url      = env("DATABASE_URL") |
    | } |
    | // In .env.local, append ?connection_limit=1 to DATABASE_URL |
    | ``` |
| | 3. For development, consider switching to PostgreSQL if locking issues persist. |
| **Verification** | Database operations complete without `SQLITE_BUSY` errors. |

---

#### PostgreSQL Connection Refused

| | |
|---|---|
| **Symptom** | `ECONNREFUSED` or `connection refused` when connecting to PostgreSQL. |
| **Root Cause** | PostgreSQL is not running, or the `DATABASE_URL` is incorrect. |
| **Solution** | 1. Check if the container is running: |
| | ```bash |
    | docker compose -f docker-compose.local.yml ps postgres |
    | ``` |
| | 2. If not running: |
| | ```bash |
    | docker compose -f docker-compose.local.yml up -d postgres |
    | ``` |
| | 3. Verify the connection string: |
| | ```bash |
    | # .env.local |
    | DATABASE_URL=postgresql://postgres:postgres@localhost:5432/acquisitionos |
    | ``` |
| | 4. Test the connection: |
| | ```bash |
    | psql postgresql://postgres:postgres@localhost:5432/acquisitionos -c "SELECT 1" |
    | ``` |
| **Verification** | `psql` connects successfully. `bunx prisma db push` completes without errors. |

---

#### Schema Drift Between Environments

| | |
|---|---|
| **Symptom** | Features work locally but fail in staging/production with database-related errors. |
| **Root Cause** | The local database schema differs from the remote — migrations were applied in one environment but not the other. |
| **Solution** | 1. Check migration status in both environments: |
| | ```bash |
    | bunx prisma migrate status |
    | ``` |
| | 2. Apply all pending migrations: |
| | ```bash |
    | bunx prisma migrate deploy |
    | ``` |
| | 3. To sync local to match production schema: |
| | ```bash |
    | bunx prisma migrate reset |
    | ``` |
| | 4. Always run migrations as part of your deployment pipeline. |
| **Verification** | `prisma migrate status` shows the same migration history in all environments. |

---

#### Seed Data Conflicts

| | |
|---|---|
| **Symptom** | `bunx prisma db seed` fails with unique constraint violations. |
| **Root Cause** | The database already contains data that conflicts with the seed script (e.g., duplicate emails). |
| **Solution** | 1. Reset the database before seeding: |
| | ```bash |
    | bunx prisma migrate reset --skip-seed |
    | bunx prisma db seed |
    | ``` |
| | 2. Or make the seed script idempotent — use `upsert` instead of `create`: |
| | ```ts |
    | await db.user.upsert({ |
    |   where: { email: 'test@example.com' }, |
    |   update: {}, |
    |   create: { email: 'test@example.com', name: 'Test User' }, |
    | }) |
    | ``` |
| **Verification** | Seed script runs without errors. The expected test data exists in the database. |

---

### 1.6 Redis Issues

---

#### Redis Connection Refused (Detailed)

| | |
|---|---|
| **Symptom** | Same as [Redis Connection Refused](#redis-connection-refused) in Startup Issues, but persists after starting Redis. |
| **Root Cause** | Redis is running but on a different port, or requires authentication, or the URL in `.env.local` is wrong. |
| **Solution** | 1. Find the actual Redis port: |
| | ```bash |
    | docker compose -f docker-compose.local.yml ps redis |
    | ``` |
| | 2. Update `REDIS_URL` accordingly: |
    | ```bash |
    | REDIS_URL=redis://localhost:6379 |
    | # If Redis requires auth: |
    | REDIS_URL=redis://:password@localhost:6379 |
    | ``` |
| | 3. Test the connection with the full URL: |
| | ```bash |
    | redis-cli -u "$REDIS_URL" ping |
    | ``` |
| **Verification** | `redis-cli -u "$REDIS_URL" ping` returns `PONG`. |

---

#### Pub/Sub Not Working

| | |
|---|---|
| **Symptom** | Real-time features that depend on Redis pub/sub don't work. Events published by one process are not received by another. |
| **Root Cause** | Different processes are connected to different Redis instances, or the channel names don't match. |
| **Solution** | 1. Verify all processes use the same `REDIS_URL`. |
| | 2. Test pub/sub manually: |
    | ```bash |
    | # Terminal 1 — subscribe |
    | redis-cli SUBSCRIBE acquisitionos:events |
    | # Terminal 2 — publish |
    | redis-cli PUBLISH acquisitionos:events '{"type":"test"}' |
    | ``` |
| | 3. Check that the channel name in your code matches what you're publishing to. |
| **Verification** | Messages published in Terminal 2 appear in Terminal 1 instantly. |

---

#### Celery Tasks Not Executing

| | |
|---|---|
| **Symptom** | Background jobs are queued but never processed. |
| **Root Cause** | The Celery worker is not running, or it's connected to the wrong Redis broker. |
| **Solution** | 1. Start the Celery worker: |
| | ```bash |
    | celery -A acquisitionos worker --loglevel=info |
    | ``` |
| | 2. Verify the broker URL: |
    | ```bash |
    | echo $CELERY_BROKER_URL |
    | # Should match REDIS_URL |
    | ``` |
| | 3. Check the task queue: |
    | ```bash |
    | celery -A acquisitionos inspect active |
    | ``` |
| **Verification** | Queued tasks are picked up and executed. Check the Celery worker logs for task completion messages. |

---

#### Redis Memory Full

| | |
|---|---|
| **Symptom** | Redis returns `OOM command not allowed when used memory > 'maxmemory'`. Writes fail. |
| **Root Cause** | Redis has hit its memory limit, typically because old keys are not being evicted. |
| **Solution** | 1. Check Redis memory usage: |
| | ```bash |
    | redis-cli INFO memory | grep used_memory_human |
    | ``` |
| | 2. Set an eviction policy: |
| | ```bash |
    | redis-cli CONFIG SET maxmemory-policy allkeys-lru |
    | ``` |
| | 3. For development, flush all data: |
| | ```bash |
    | redis-cli FLUSHALL |
    | ``` |
| | 4. Increase the max memory limit: |
| | ```bash |
    | redis-cli CONFIG SET maxmemory 512mb |
    | ``` |
| **Verification** | `redis-cli SET test_key test_value` returns `OK` without OOM error. |

---

### 1.7 Email Issues

---

#### Gmail App Password Not Working

| | |
|---|---|
| **Symptom** | SMTP authentication fails when using a Gmail App Password. |
| **Root Cause** | The App Password was revoked, 2FA was disabled, or the password was entered incorrectly (spaces, wrong copy). |
| **Solution** | 1. Verify 2FA is enabled on the Google account: [myaccount.google.com/security](https://myaccount.google.com/security). |
| | 2. Generate a new App Password: [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords). |
| | 3. Copy the 16-character code **without spaces** into `.env.local`: |
| | ```bash |
    | SMTP_PASS=abcdefghijklmnop |
    | ``` |
| | 4. Test the connection (see [Environment Debugging](#44-how-to-test-smtp-connection)). |
| **Verification** | A test email is sent successfully via the SMTP connection. |

---

#### SMTP Authentication Failed

| | |
|---|---|
| **Symptom** | Server logs show "Invalid login" or "535 Authentication failed" when sending emails. |
| **Root Cause** | Wrong credentials, or the SMTP server requires specific authentication methods (e.g., STARTTLS). |
| **Solution** | 1. Double-check `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, and `SMTP_PASS` in `.env.local`. |
| | 2. Common SMTP settings: |
    | | Provider | Host | Port | |
    | |---|---|---|
    | | Gmail | smtp.gmail.com | 587 (STARTTLS) |
    | | Mailpit | localhost | 1025 (no auth) |
    | | SendGrid | smtp.sendgrid.net | 587 |
| | 3. For Gmail, ensure `SMTP_SECURE=false` (port 587 uses STARTTLS, not implicit TLS). |
| **Verification** | `curl` or a test script successfully authenticates and sends an email. |

---

#### Emails Going to Spam

| | |
|---|---|
| **Symptom** | Emails are sent but end up in the recipient's spam folder. |
| **Root Cause** | Missing or misconfigured SPF, DKIM, or DMARC records. Gmail and other providers flag emails from unknown domains. |
| **Solution** | 1. **For local development:** This is expected. Use Mailpit instead of real email delivery. |
| | 2. **For production:** Configure DNS records: |
| |    - SPF: `v=spf1 include:_spf.google.com ~all` |
| |    - DKIM: Set up in your email provider's dashboard |
| |    - DMARC: `v=DMARC1; p=none; rua=mailto:dmarc@yourdomain.com` |
| | 3. Use a transactional email service (SendGrid, Resend, Postmark) instead of Gmail for production. |
| **Verification** | Emails land in the inbox. Check with [mail-tester.com](https://www.mail-tester.com/) for a spam score. |

---

#### Rate Limiting by Gmail

| | |
|---|---|
| **Symptom** | After sending several emails, Gmail starts rejecting with "421 4.7.0 Try again later" or similar. |
| **Root Cause** | Gmail imposes rate limits on App Passwords — approximately 500 emails per day and limits on emails per minute. |
| **Solution** | 1. For development: Use Mailpit (no rate limits). |
| | 2. Throttle your email sending in code: |
    | ```ts |
    | await new Promise(resolve => setTimeout(resolve, 1000)) // 1s delay |
    | ``` |
| | 3. For production: Use a transactional email service with higher limits. |
| **Verification** | Emails are sent without rate-limit errors. If using Mailpit, all emails appear in the Mailpit UI. |

---

#### Mailpit Not Receiving

| | |
|---|---|
| **Symptom** | Email sends appear to succeed but Mailpit's web UI at `http://localhost:8025` shows no messages. |
| **Root Cause** | The app is sending to Gmail's SMTP instead of Mailpit's, or Mailpit is not running. |
| **Solution** | 1. Ensure Mailpit is running: |
| | ```bash |
    | docker compose -f docker-compose.local.yml up -d mailpit |
    | ``` |
| | 2. Update `.env.local` to point to Mailpit: |
| | ```bash |
    | SMTP_HOST=localhost |
    | SMTP_PORT=1025 |
    | SMTP_SECURE=false |
    | SMTP_USER= |
    | SMTP_PASS= |
    | ``` |
| | 3. Restart the dev server. |
| **Verification** | Trigger an email send (e.g., request OTP). The email appears in Mailpit at `http://localhost:8025`. |

---

### 1.8 Realtime Issues

---

#### Socket.IO Connection Fails

| | |
|---|---|
| **Symptom** | Browser console shows `transport error` or `xhr poll error`. Real-time features don't work. |
| **Root Cause** | The Socket.IO mini-service is not running, or the `XTransformPort` query parameter is missing. |
| **Solution** | 1. Ensure the Socket.IO mini-service is running: |
| | ```bash |
    | ps aux | grep socket |
    | # Should show the mini-service process |
    | ``` |
| | 2. Start it if needed: |
| | ```bash |
    | cd mini-services/chat-service && bun run dev |
    | ``` |
| | 3. On the client, use the correct connection string: |
| | ```ts |
    | import { io } from 'socket.io-client' |
    | const socket = io('/?XTransformPort=3003') |
    | ``` |
| | 4. **Never** use `io('http://localhost:3003')` — the Caddy gateway requires the `XTransformPort` parameter. |
| **Verification** | Browser console shows `socket connected`. Real-time messages are received. |

---

#### WebSocket Disconnects

| | |
|---|---|
| **Symptom** | Socket connects but disconnects frequently. Console shows `transport close` or `ping timeout`. |
| **Root Cause** | Network instability, the server is restarting (HMR), or the heartbeat timeout is too short. |
| **Solution** | 1. Increase the heartbeat interval on the client: |
| | ```ts |
    | const socket = io('/?XTransformPort=3003', { |
    |   heartbeatInterval: 25000, |
    |   heartbeatTimeout: 60000, |
    | }) |
    | ``` |
| | 2. Add reconnection handling: |
| | ```ts |
    | socket.on('disconnect', (reason) => { |
    |   console.log('Disconnected:', reason) |
    |   socket.connect() // auto-reconnect |
    | }) |
    | ``` |
| | 3. If caused by HMR during development, this is expected — the socket will reconnect after the page reloads. |
| **Verification** | The socket maintains a stable connection during idle periods. Reconnection succeeds automatically after brief disconnects. |

---

#### Events Not Delivered

| | |
|---|---|
| **Symptom** | Socket is connected, `socket.emit()` is called, but the server doesn't receive it (or vice versa). |
| **Root Cause** | Event name mismatch, the socket is not in the correct room, or the event is being emitted before the connection is fully established. |
| **Solution** | 1. Verify event names match on both client and server: |
| | ```ts |
    | // Client |
    | socket.emit('message:send', payload) |
    | // Server — must be the same string |
    | socket.on('message:send', (payload) => { ... }) |
    | ``` |
| | 2. Ensure the socket has joined the correct room: |
| | ```ts |
    | socket.emit('room:join', { roomId: 'abc' }) |
    | ``` |
| | 3. Wait for connection before emitting: |
| | ```ts |
    | socket.on('connect', () => { |
    |   socket.emit('message:send', payload) |
    | }) |
    | ``` |
| **Verification** | Events are received on the other side. Log both emit and receive to confirm the round-trip. |

---

#### `XTransformPort` Not Working

| | |
|---|---|
| **Symptom** | Requests with `?XTransformPort=3030` return 404 or are not routed to the mini-service. |
| **Root Cause** | The Caddyfile is not configured to handle the `XTransformPort` parameter, or the mini-service is not running on the specified port. |
| **Solution** | 1. Verify the mini-service is running on the correct port: |
| | ```bash |
    | curl http://localhost:3030/api/health |
    | ``` |
| | 2. Check the `Caddyfile` for the `XTransformPort` handling: |
| | ``` |
    | # Ensure the Caddyfile has a rewrite rule for XTransformPort |
    | ``` |
| | 3. Ensure the client request uses the correct format: |
| | ```ts |
    | // Correct — relative path with query param |
    | fetch('/api/test?XTransformPort=3030') |
    | // Wrong — absolute URL with port |
    | fetch('http://localhost:3030/api/test') |
    | ``` |
| **Verification** | `curl 'http://localhost:3000/api/health?XTransformPort=3030'` returns a response from the mini-service on port 3030. |

---

## 2. Diagnostic Commands

Quick-reference table for diagnosing common issues.

| Category | Command | Purpose |
|---|---|---|
| **Port** | `lsof -ti:3000` | Find process using port 3000 |
| **Port** | `lsof -ti:6379` | Find process using Redis port |
| **Port** | `lsof -ti:5432` | Find process using PostgreSQL port |
| **Process** | `ps aux \| grep bun` | List all Bun processes |
| **Process** | `ps aux \| grep node` | List all Node processes |
| **Logs** | `tail -50 dev.log` | View recent dev server logs |
| **Logs** | `tail -f dev.log` | Tail dev server logs in real-time |
| **Logs** | `rg -i "error" dev.log \| tail -20` | Find recent errors in dev logs |
| **Database** | `bun run db:studio` | Open Prisma Studio (DB GUI) |
| **Database** | `bunx prisma migrate status` | Check migration status |
| **Database** | `bunx prisma db push` | Sync schema without migration |
| **Database** | `sqlite3 prisma/dev.db ".tables"` | List SQLite tables |
| **Redis** | `redis-cli ping` | Test Redis connectivity |
| **Redis** | `redis-cli INFO memory` | Check Redis memory usage |
| **Redis** | `redis-cli DBSIZE` | Number of keys in Redis |
| **Redis** | `redis-cli MONITOR` | Watch all Redis commands (debug) |
| **Docker** | `docker compose -f docker-compose.local.yml ps` | Check container status |
| **Docker** | `docker compose -f docker-compose.local.yml logs redis` | View Redis container logs |
| **Health** | `curl http://localhost:3000/api/health/detailed` | Full health check |
| **Health** | `curl -s http://localhost:3000/api/health \| jq .` | Pretty-print health check |
| **Lint** | `bun run lint` | Check code quality |
| **Stripe** | `stripe listen --forward-to localhost:3000/api/stripe/webhook` | Forward Stripe events |
| **Stripe** | `stripe trigger payment_intent.succeeded` | Send a test Stripe event |

---

## 3. Reset Procedures

### 3.1 Reset Database

Completely wipe and recreate the database with fresh seed data:

```bash
# Using Prisma (recommended)
bunx prisma migrate reset

# Or for SQLite — just delete the file
rm prisma/dev.db
bunx prisma migrate dev

# Re-seed if not automatic
bunx prisma db seed
```

### 3.2 Reset HMR Cache

Fix Turbopack HMR cache corruption and other build artifacts:

```bash
# Remove the Next.js cache
rm -rf .next

# Restart the dev server
bun run dev
```

### 3.3 Reset Everything (Clean Install)

Nuclear option — start completely from scratch:

```bash
# 1. Stop all services
# Press Ctrl+C on the dev server

# 2. Stop Docker containers and remove volumes
docker compose -f docker-compose.local.yml down -v

# 3. Remove all generated files
rm -rf .next
rm -rf node_modules
rm -rf prisma/dev.db

# 4. Reinstall dependencies
bun install

# 5. Regenerate Prisma client
bunx prisma generate

# 6. Create the database and apply migrations
bunx prisma migrate dev

# 7. Seed the database
bunx prisma db seed

# 8. Start Docker services
docker compose -f docker-compose.local.yml up -d

# 9. Start the dev server
bun run dev
```

### 3.4 Reset Docker

Remove all Docker containers, volumes, and networks for a clean slate:

```bash
# Stop and remove everything
docker compose -f docker-compose.local.yml down -v

# Also remove images (optional, frees disk space)
docker compose -f docker-compose.local.yml down -v --rmi all

# Start fresh
docker compose -f docker-compose.local.yml up -d

# Verify
docker compose -f docker-compose.local.yml ps
```

---

## 4. Environment Debugging

### 4.1 How to Verify Each `.env.local` Variable

Run this script to quickly check all environment variables:

```bash
#!/bin/bash
# save as check-env.sh and run: bash check-env.sh

set -e

check_var() {
  local name=$1
  local expected_prefix=$2
  local value="${!name}"

  if [ -z "$value" ]; then
    echo "❌ $name — NOT SET"
  elif [ -n "$expected_prefix" ] && [[ ! "$value" == "$expected_prefix"* ]]; then
    echo "⚠️  $name — Set but unexpected prefix (expected: $expected_prefix...)"
    echo "   Value: ${value:0:10}..."
  else
    echo "✅ $name — Set (${#value} chars)"
  fi
}

echo "=== AcquisitionOS Environment Check ==="
echo ""

echo "--- Core ---"
check_var NEXTAUTH_URL "http"
check_var NEXTAUTH_SECRET
check_var DATABASE_URL

echo ""
echo "--- Auth ---"
check_var GOOGLE_CLIENT_ID
check_var GOOGLE_CLIENT_SECRET
check_var AUTH_DEV_MODE

echo ""
echo "--- Stripe ---"
check_var STRIPE_SECRET_KEY "sk_"
check_var NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY "pk_"
check_var STRIPE_WEBHOOK_SECRET "whsec_"

echo ""
echo "--- Email ---"
check_var SMTP_HOST
check_var SMTP_PORT
check_var SMTP_USER
check_var SMTP_PASS

echo ""
echo "--- Redis ---"
check_var REDIS_URL "redis://"

echo ""
echo "=== Done ==="
```

### 4.2 How to Test SMTP Connection

Test that your SMTP credentials work:

```bash
# Using swaks (install: brew install swaks or apt install swaks)
swaks --to test@example.com \
  --from your-app@gmail.com \
  --server smtp.gmail.com:587 \
  --tls \
  --auth LOGIN \
  --auth-user your-app@gmail.com \
  --auth-password your-app-password

# Using openssl (no extra tools needed)
openssl s_client -connect smtp.gmail.com:587 -starttls smtp -quiet <<EOF
EHLO localhost
AUTH LOGIN
$(echo -n "your-app@gmail.com" | base64)
$(echo -n "your-app-password" | base64)
MAIL FROM:<your-app@gmail.com>
RCPT TO:<test@example.com>
DATA
Subject: Test Email

This is a test.
.
QUIT
EOF

# Using Node.js / Bun
bun -e "
const nodemailer = require('nodemailer');
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});
transporter.verify().then(() => console.log('✅ SMTP connected')).catch(e => console.error('❌ SMTP failed:', e.message));
"
```

### 4.3 How to Test Stripe API Key

Verify your Stripe keys are valid and active:

```bash
# Using the Stripe CLI
stripe whoami

# Using curl with your secret key
curl https://api.stripe.com/v1/balance \
  -u "sk_test_YOUR_KEY_HERE:"

# Expected response:
# {
#   "object": "balance",
#   "available": [...],
#   "livemode": false
# }

# If "livemode" is true, you're using a live key — switch to test mode!

# Using Node.js / Bun
bun -e "
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
stripe.balance.retrieve()
  .then(b => console.log('✅ Stripe connected. Livemode:', b.livemode))
  .catch(e => console.error('❌ Stripe failed:', e.message));
"
```

### 4.4 How to Test Google OAuth Setup

Verify your Google OAuth configuration is correct:

```bash
# Step 1: Verify client ID and secret are set
echo "GOOGLE_CLIENT_ID: ${GOOGLE_CLIENT_ID:0:20}..."
echo "GOOGLE_CLIENT_SECRET: ${GOOGLE_CLIENT_SECRET:0:5}..."

# Step 2: Test the OAuth discovery endpoint
curl -s "https://accounts.google.com/.well-known/openid-configuration" | head -5
# Should return JSON with authorization_endpoint, token_endpoint, etc.

# Step 3: Verify redirect URI is registered
# Go to: https://console.cloud.google.com/apis/credentials
# Check: Authorized redirect URIs includes:
#   http://localhost:3000/api/auth/callback/google

# Step 4: Test the OAuth flow manually
# Open in browser:
echo "https://accounts.google.com/o/oauth2/v2/auth?client_id=${GOOGLE_CLIENT_ID}&redirect_uri=http://localhost:3000/api/auth/callback/google&response_type=code&scope=openid%20email%20profile"
# If you get a consent screen, the client ID is valid.
# If you get redirect_uri_mismatch, update the Google Cloud Console.
```

### 4.5 How to Test Redis Connection

Verify Redis is accessible and working:

```bash
# Basic connectivity
redis-cli ping
# Expected: PONG

# With URL from .env.local
redis-cli -u "$REDIS_URL" ping
# Expected: PONG

# Check server info
redis-cli INFO server | head -10

# Test read/write
redis-cli SET test:key "hello-acquisitionos"
redis-cli GET test:key
# Expected: "hello-acquisitionos"
redis-cli DEL test:key

# Check memory usage
redis-cli INFO memory | grep used_memory_human

# Test pub/sub (open two terminals)
# Terminal 1:
redis-cli SUBSCRIBE acquisitionos:test
# Terminal 2:
redis-cli PUBLISH acquisitionos:test '{"msg":"hello"}'
# Terminal 1 should show the message

# Using Node.js / Bun
bun -e "
const redis = require('ioredis');
const client = new redis(process.env.REDIS_URL || 'redis://localhost:6379');
client.ping().then(r => { console.log('✅ Redis:', r); client.quit(); }).catch(e => { console.error('❌ Redis failed:', e.message); client.quit(); });
"
```

---

## Quick Reference: Issue → Solution

| Issue | Quick Fix |
|---|---|
| Blank page | `rm -rf .next && bun run dev` |
| Port 3000 in use | `kill -9 $(lsof -ti:3000)` |
| HMR cache corruption | `rm -rf .next && bun run dev` |
| Prisma not generated | `bunx prisma generate` |
| Module not found | `bun install` |
| Redis refused | `docker compose -f docker-compose.local.yml up -d redis` |
| Postgres refused | `docker compose -f docker-compose.local.yml up -d postgres` |
| OAuth mismatch | Add redirect URI in Google Cloud Console |
| OTP not received | Set `AUTH_DEV_MODE=true` for dev |
| Stripe not redirecting | Check `STRIPE_SECRET_KEY` in `.env.local` |
| Webhook fails | Update `STRIPE_WEBHOOK_SECRET` from CLI output |
| SQLite locked | Kill other processes using the DB file |
| Socket.IO fails | Use `io('/?XTransformPort=3003')` |
| Email to spam | Use Mailpit for local dev |
| DB schema drift | `bunx prisma migrate reset` |
| CORS errors | Add origin to `allowedDevOrigins` in `next.config.ts` |
| Full reset | See [Section 3.3](#33-reset-everything-clean-install) |

---

*If your issue isn't covered here, check `dev.log` for error messages and consult the project's GitHub Issues.*
