# AcquisitionOS — Vercel Deployment Guide

## TL;DR — Will everything work on Vercel as-is?

**NO — not as-is.** The app works on Vercel after 3 mandatory changes. Magic
Link, OTP, and email/password auth will work. Google login will work **only
after** you add the new domain's redirect URI in Google Cloud Console.

UPDATE 2026-09-09: The Google credentials (client ID `22873135381-…` + secret
`GOCSPX-GFt8BypS…`) are now VALID and VERIFIED — the token endpoint accepts
them (`invalid_grant` on a bogus code, not `invalid_client`) and both callback
paths are registered in Google Cloud Console (authorize endpoint returns 302,
not 400). The secret is already applied in `.env` and `ensure-env.sh`.

| Feature | Works on Vercel? | Notes |
|---|---|---|
| Email/password login | ✅ (after DB migration) | Needs a real database |
| OTP login | ✅ (after DB migration) | Needs SMTP (works) + DB |
| Magic Link | ✅ (after env + DB) | Links use `APP_URL` env var |
| Google OAuth | ✅ (add Vercel redirect URI) | Creds verified valid 2026-09-09 |
| SQLite database | ❌ **will break** | Vercel filesystem is ephemeral |
| API-key expiry cron | ✅ via Vercel Cron | Add `vercel.json` config |

## 1. Database — MANDATORY migration (SQLite → Postgres)

The app currently uses SQLite (`db/custom.db`). On Vercel, the filesystem is
**ephemeral**: every deployment (and every serverless cold start) gets a fresh
container, so **all data — users, sessions, leads, everything — would be wiped**
on each deploy. This is the single biggest blocker.

Steps:
1. Create a Postgres database (Vercel Postgres / Neon / Supabase / Railway).
2. Update `prisma/schema.prisma`:
   ```prisma
   datasource db {
     provider = "postgresql"
     url      = env("DATABASE_URL")
   }
   ```
3. Update the `DATABASE_URL` env var and run `npx prisma migrate deploy`.
4. Migrate existing data (optional — export from SQLite and re-import).

## 2. Environment variables — set in Vercel dashboard

Set these in **Vercel Project → Settings → Environment Variables**:

```env
DATABASE_URL=postgresql://...            # from step 1
NEXTAUTH_URL=https://acquisitionos.vercel.app
NEXTAUTH_SECRET=<same value as current>
APP_URL=https://acquisitionos.vercel.app
NEXT_PUBLIC_APP_URL=https://acquisitionos.vercel.app
GOOGLE_CLIENT_ID=22873135381-...apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=<a VALID, freshly generated secret>
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=mailtoprabhat72@gmail.com
SMTP_PASSWORD=<gmail app password>
EMAIL_FROM=mailtoprabhat72@gmail.com
```

The code reads `APP_URL` for magic-link emails and OAuth redirect URIs — once
set to the Vercel domain, all links automatically point at
`https://acquisitionos.vercel.app` instead of the preview URL. No code changes
needed for the domain switch.

**Recommended for email on Vercel:** Gmail SMTP works but Vercel's cloud IPs
can hurt deliverability, and Gmail caps ~500 mails/day. The codebase already
supports **Resend** as the primary provider — set `RESEND_API_KEY` (verify your
domain in Resend) and it takes priority over SMTP automatically. This gives
far better inbox delivery for OTP/verification/magic-link emails.

## 3. Google OAuth — add the new redirect URI

In [Google Cloud Console](https://console.cloud.google.com/apis/credentials) →
OAuth 2.0 Client (client ID `22873135381-rha5u0opkhc4q8ja1a0a91mq8m6emfbi`):

1. **Authorized redirect URIs** — ADD (keep existing ones too, so both domains
   keep working). Register BOTH paths — the app uses either depending on flow:
   ```
   https://acquisitionos.vercel.app/api/auth/callback/google
   https://acquisitionos.vercel.app/api/auth/google/callback
   ```
2. **Authorized JavaScript origins** — add:
   ```
   https://acquisitionos.vercel.app
   ```

The current preview-domain redirect URIs are already registered and verified
(both return 302 on the authorize endpoint). The client secret is valid —
do NOT reset it unless you also update `.env`, `ensure-env.sh` and the Vercel
env vars with the new value.

One OAuth client can serve **both** domains simultaneously — you do NOT need
separate credentials for the preview URL and Vercel.

## 4. Cron jobs

Add `vercel.json` at the repo root:

```json
{
  "crons": [
    { "path": "/api/cron/expire-api-keys", "schedule": "0 * * * *" }
  ]
}
```

Vercel Cron calls the endpoint hourly; the route already authenticates via the
`Authorization: Bearer ...` header — set a `CRON_SECRET` env var and send it,
or keep the current dev bearer value if acceptable.

## 5. What happens to the current preview URL?

Nothing breaks. Because every URL derives from env vars (`APP_URL`,
`NEXTAUTH_URL`, `NEXT_PUBLIC_APP_URL`):
- Keep the preview deployment's env vars as-is → magic links keep pointing to
  the preview domain.
- Set the Vercel deployment's env vars to the Vercel domain → magic links,
  OTP verification links, and OAuth redirects point there.
- If you later retire the preview URL, just remove its redirect URI from the
  Google Console list.

## 6. Sandbox / "always active" (GLM workspace)

The GLM workspace keepalive system (cron job 304271, every 5 minutes) already:
- checks the dev server health (HTTP 200),
- restores `.env` if the sandbox wipes it,
- restarts the server if the sandbox kills it.

This keeps the app reachable **as long as the GLM workspace itself exists**.
Caveats:
- The workspace is a development sandbox, not a production host. If the
  platform garbage-collects long-idle workspaces, nothing inside the sandbox
  can prevent that.
- For a real "never down for weeks/months" guarantee, production traffic
  should live on Vercel (always-on, global CDN, no idle timeouts). The two
  can run in parallel: workspace for development, Vercel for production.
