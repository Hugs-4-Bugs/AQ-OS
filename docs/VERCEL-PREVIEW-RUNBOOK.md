# AcquisitionOS — Vercel Preview Deployment Runbook

**Branch:** `develop`
**Verified SHA:** `bd7e0f12383f1f588338f908f7515457f9d9654d`
**Last Updated:** 2026-11-06

---

## ⚠️ CRITICAL SAFETY RULES

1. **NEVER run `vercel --prod`** until separate production authorization is given
2. **NEVER deploy `main`** — only `develop`
3. **NEVER use production environment variables** — create separate preview env vars
4. **NEVER connect to production databases** — use a separate preview database
5. **NEVER expose secrets** in Git, logs, or deployment output

---

## 1. Current Configuration (Verified from Source)

### vercel.json
```json
{
  "framework": "nextjs",
  "installCommand": "npm install --legacy-peer-deps",
  "buildCommand": "npm run build",
  "devCommand": "next dev",
  "regions": ["sin1"],
  "output": "standalone"  // (from next.config.ts)
}
```

### Build Command
```bash
prisma generate && next build --webpack && node scripts/clean-standalone.js
```

### Database
- **Current provider:** SQLite (`prisma/schema.prisma`: `provider = "sqlite"`)
- **Problem:** Vercel serverless functions have an **ephemeral filesystem**. SQLite files are NOT persistent across invocations. Each cold start creates a fresh filesystem.
- **Solution required:** Switch to PostgreSQL for Vercel deployment
- **Schema compatibility:** UNVERIFIED — schema has PostgreSQL migration notes but `provider = "sqlite"`. Full compatibility NOT assessed.

### Region
- `sin1` (Singapore) — configured in `vercel.json`

---

## 2. SQLite Limitation on Vercel

### The Problem
Vercel runs Next.js as serverless functions. Each function invocation gets a fresh, ephemeral filesystem. SQLite databases stored as files (`file:./db/custom.db`) are **lost between invocations**. User registrations, sessions, and all data would disappear on every cold start.

### Why This Matters
- Authentication will fail (users table is empty after cold start)
- Sessions will be invalidated (session table is empty)
- All application state is lost
- MFA enrollment data is lost

### Required Action
Before deploying to Vercel, the database MUST be migrated to PostgreSQL:
1. Change `provider = "sqlite"` to `provider = "postgresql"` in `prisma/schema.prisma`
2. Set `DATABASE_URL` to a PostgreSQL connection string (e.g., Vercel Postgres, Supabase, Neon)
3. Run `prisma db push` against the PostgreSQL database to create tables
4. Seed essential data (super_admin user, MFA config, etc.)

**Do NOT perform this migration in the documentation phase.** This is a separate implementation task.

---

## 3. PostgreSQL Compatibility Assessment

### Status: NOT FULLY ASSESSED

The Prisma schema uses `provider = "sqlite"` with comments indicating PostgreSQL migration is planned:

```prisma
// [MIGRATE-RISK] Changing provider from "sqlite" to "postgresql"
```

### What Needs Verification Before Migration
1. **Raw SQL queries:** Check if any `$queryRaw` or `$executeRaw` calls use SQLite-specific syntax
2. **Auto-increment behavior:** SQLite and PostgreSQL handle auto-increment differently
3. **Boolean type:** SQLite stores as 0/1, PostgreSQL as true/false
4. **Date/Time handling:** Verify all date operations are Prisma-abstracted
5. **JSON columns:** Verify JSON operations work in PostgreSQL
6. **Case sensitivity:** SQLite is case-insensitive by default, PostgreSQL is case-sensitive
7. **Migration scripts:** Check `prisma/migrations/` for SQLite-specific SQL
8. **Seed scripts:** Check `seed-dev.sql` and `bootstrap.sql` for SQLite-specific syntax

### Files to Inspect (NOT YET DONE)
- `prisma/schema.prisma` — all 53+ models
- `prisma/migrations/` — migration SQL files
- `seed-dev.sql` — seed data
- `bootstrap.sql` — bootstrap data
- `src/lib/db.ts` — database connection logic
- All `$queryRaw` / `$executeRaw` calls in `src/`

---

## 4. Required Environment Variables for Vercel Preview

| Variable | Required | Preview Value | Notes |
|---|---|---|---|
| `DATABASE_URL` | YES | PostgreSQL connection string | MUST be PostgreSQL, not SQLite |
| `JWT_SECRET` | YES | Generate new 64-char secret | Do NOT reuse production |
| `JWT_REFRESH_SECRET` | YES | Generate new 64-char secret | Do NOT reuse production |
| `AUTH_SECRET` | YES | Generate new secret | Do NOT reuse production |
| `NEXTAUTH_SECRET` | YES | Generate new secret | Do NOT reuse production |
| `GOOGLE_CLIENT_ID` | YES | Use same OAuth client | Register preview URL as redirect URI |
| `GOOGLE_CLIENT_SECRET` | YES | Use same secret | Do NOT expose in Git |
| `ENABLE_GOOGLE_OAUTH` | YES | `true` | |
| `SMTP_HOST` | YES | `smtp.gmail.com` | |
| `SMTP_PORT` | YES | `587` | |
| `SMTP_USER` | YES | Gmail address | |
| `SMTP_PASSWORD` | YES | Gmail App Password (no spaces) | 16 chars without spaces |
| `EMAIL_FROM` | YES | Same as SMTP_USER | |
| `CRON_SECRET` | YES | Generate new secret | |
| `NEXT_PUBLIC_APP_URL` | Optional | Preview URL | For absolute URLs in OG metadata |

### Google OAuth Redirect URI
After creating the preview deployment, register the preview URL in Google Cloud Console:
1. Go to Google Cloud Console → APIs & Services → Credentials
2. Select the OAuth 2.0 Client ID
3. Add Authorized redirect URI: `https://<preview-url>/api/auth/callback/google`
4. Save

---

## 5. Vercel Preview Deployment Steps

### Prerequisites
- [ ] Vercel account with access
- [ ] Vercel CLI installed locally (NOT in sandbox)
- [ ] PostgreSQL database provisioned (Vercel Postgres, Supabase, or Neon)
- [ ] Google OAuth redirect URI ready to register
- [ ] All environment variables prepared

### Step-by-Step

```bash
# 1. Clone the develop branch
git clone --branch develop https://github.com/Hugs-4-Bugs/AQ-OS.git
cd AQ-OS

# 2. Link to Vercel (creates .vercel/ directory)
vercel link

# 3. Add environment variables (interactive — NEVER commit these)
vercel env add DATABASE_URL    # PostgreSQL connection string
vercel env add JWT_SECRET      # new 64-char secret
vercel env add JWT_REFRESH_SECRET  # new 64-char secret
vercel env add AUTH_SECRET     # new secret
vercel env add NEXTAUTH_SECRET # new secret
vercel env add GOOGLE_CLIENT_ID    # OAuth client ID
vercel env add GOOGLE_CLIENT_SECRET # OAuth secret
vercel env add ENABLE_GOOGLE_OAUTH # "true"
vercel env add SMTP_HOST       # "smtp.gmail.com"
vercel env add SMTP_PORT       # "587"
vercel env add SMTP_USER       # Gmail address
vercel env add SMTP_PASSWORD   # App password (16 chars, no spaces)
vercel env add EMAIL_FROM      # Gmail address
vercel env add CRON_SECRET     # new secret

# 4. IMPORTANT: Change Prisma provider to PostgreSQL
# Edit prisma/schema.prisma:
#   datasource db {
#     provider = "postgresql"  # was "sqlite"
#     url      = env("DATABASE_URL")
#   }

# 5. Push schema to PostgreSQL database
npx prisma db push

# 6. Seed essential data (super_admin user, etc.)
# Create a seed script or manually insert:
# - super_admin user with hashed password
# - MFA config with TOTP secret
# - Required subscription/plan records

# 7. Deploy as PREVIEW (NOT production)
vercel  # This creates a preview deployment, NOT production

# 8. Register the preview URL as Google OAuth redirect URI
# Go to Google Cloud Console → add https://<preview-url>/api/auth/callback/google

# 9. Verify deployment
curl https://<preview-url>/api/health
# Should return: {"status":"healthy",...}
```

### ⚠️ DANGER: Commands to NEVER Run
```bash
vercel --prod           # FORBIDDEN — deploys to production
git push origin main    # FORBIDDEN — pushes to main branch
prisma migrate reset    # FORBIDDEN — destroys all data
prisma db push --accept-data-loss  # FORBIDDEN — accepts data loss
```

---

## 6. Vercel Limitations for This Application

### WebSocket/SSE
- Vercel serverless functions do NOT support persistent WebSocket connections
- The app has `mini-services/` for realtime/ws-service — these need a separate hosting provider (Railway, Render, Fly.io)
- SSE (Server-Sent Events) may work but with cold-start limitations

### Background Workers/Cron
- Vercel Cron Jobs can trigger API routes on a schedule
- The autopilot scheduler runs inside `instrumentation.ts` — this will NOT work on Vercel serverless (no persistent process)
- Background workers need a separate hosting provider

### Mini-Services Required
| Service | Purpose | Vercel Compatible? |
|---|---|---|
| proxy | Reverse proxy / request routing | ❌ Needs separate host |
| email-service | Email delivery | ❌ Needs separate host |
| realtime-service | Real-time updates | ❌ Needs separate host (WebSocket) |
| ws-service | WebSocket connections | ❌ Needs separate host |
| server-watchdog | Process supervision | ❌ Not needed on Vercel |

### Memory Limits
- Vercel Hobby: 256MB per function (insufficient for build)
- Vercel Pro: 1GB per function (may be insufficient for some routes)
- Vercel Enterprise: Up to 3GB per function

---

## 7. Preview Test Plan

After deployment, verify:

1. `GET /api/health` → 200
2. `GET /` → Landing page renders
3. `GET /favicon.ico` → 200
4. `GET /brand/logo-light.png` → 200
5. `GET /manifest.webmanifest` → 200
6. `GET /api/auth/config` → `{"googleAvailable":true,...}`
7. `GET /api/admin/security/events` (unauth) → 401
8. Sign in as super_admin
9. Open Admin Console
10. Test all 6 phase fixes (see `CRITICAL-ISSUE-REGISTER.md`)
11. Test Agents page (ISSUE-007)
12. Test inactivity timeout (ISSUE-008)

---

## 8. Rollback Procedure

If the preview deployment has issues:

```bash
# List deployments
vercel ls

# Promote a previous deployment (if needed)
vercel promote <previous-deployment-url>

# Or simply delete the preview project
vercel rm <project-name> --yes
```

**Never roll back production.** This runbook is for preview only.

---

## 9. Teardown

When the preview is no longer needed:

1. Delete the Vercel preview project
2. Delete the preview PostgreSQL database
3. Remove the Google OAuth redirect URI for the preview URL
4. Delete any preview environment variables from Vercel dashboard

---

## 10. Production Deployment Authorization

Production deployment requires ALL of the following:

- [ ] All 8 issues in `CRITICAL-ISSUE-REGISTER.md` are `BROWSER VERIFIED` or `CLOSED`
- [ ] PostgreSQL migration completed and tested
- [ ] Full integration test suite passes
- [ ] Security audit completed by independent reviewer
- [ ] Load test passes
- [ ] Backup and recovery procedures tested
- [ ] Monitoring and alerting configured
- [ ] Explicit go/no-go approval from project owner
- [ ] `vercel --prod` authorized in writing

**`vercel --prod` is FORBIDDEN until ALL items are checked.**
