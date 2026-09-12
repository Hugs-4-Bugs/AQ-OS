# Deploying on the GLM Platform

> This document describes the platform this project is currently developed on. Everything here comes from direct operational experience recorded in `worklog.md`.

## What the GLM Platform Is

GLM (the Z.ai chat/sandbox platform) hosts this project as an **ephemeral development sandbox** attached to the chat session: a Linux container with Node/bun, a terminal, and a **preview URL** through which the running dev server (port 3000) is exposed to the internet, proxied with `x-forwarded-host`/`x-forwarded-proto` headers. It is excellent for iterating with an AI agent because the agent has full shell access, and the z-ai-web-dev-sdk works without API keys.

## How Deployment Works on GLM

1. The workspace is the project directory (`/home/z/my-project`).
2. The app "runs" when the dev server is up: `setsid npx next dev -p 3000 > dev.log 2>&1 &`.
3. The preview URL (`https://preview-chat-<session-id>.space-z.ai`) proxies to port 3000.
4. There is also a "deploy" action that produces a static deployment at `https://acquisition.space-z.ai`; **a deploy only succeeds if `next build` completes with zero TypeScript errors**.
5. A `secrets` panel stores environment variables that are injected into the sandbox.

## GLM Limitations (important — some cannot be fixed by code)

| Limitation | Reality | Mitigation |
|---|---|---|
| **Sandbox kills the server periodically** | The dev server (and sometimes node processes generally) is reaped after inactivity or on resource pressure | Keepalive runbook: `keepalive-v2.sh` restores env and restarts; production should not run here |
| **.env file gets wiped** | The sandbox periodically resets workspace files | `ensure-env.sh` is the authoritative restore template; secrets live in the GLM Secrets panel and are re-applied by the script |
| **4 GB memory ceiling** | Running `next build` (Turbopack) while the dev server is up causes OOM → `exit 137`; orphan `tsc`/build processes then keep eating memory and kill the dev server repeatedly | Kill dev server + zombie processes first, then `NODE_OPTIONS='--max-old-space-size=3000' npx next build` |
| **Preview URL changes per session** | A new chat session gets a NEW `preview-chat-<id>.space-z.ai` domain | Google OAuth requires re-registering the new redirect URI in GCP each session (or use the production domain for login) |
| **Deployed URL has no running server backend** | `acquisition.space-z.ai` serves the deployed build; it is NOT the same live process as the preview sandbox | Login/callback on the deployed URL only works while a matching deployment is healthy; use preview for testing during development |
| **Middleware disabled** | `src/middleware.ts` had to be disabled (`middleware.ts.disabled`) in the sandbox | Per-route auth checks compensate; do not re-enable casually |
| **Sandbox timeout / "session expired"** | After chat inactivity the whole sandbox pauses; the site shows `session_failed` or does not connect | Not a code bug — reopen/resume the session, or use a real host (Railway) for anything durable |

## Setting Secrets in the GLM Secrets Panel

1. Open the project's **Secrets** panel (puzzle/shield icon in the workspace UI).
2. Add each key exactly as documented in `04-secrets-and-configuration/ALL-SECRETS.md` (names are case-sensitive).
3. Current production-critical pairs that are already configured and verified: `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`, `SMTP_USER`/`SMTP_PASSWORD` (Gmail app password), `JWT_SECRET`/`JWT_REFRESH_SECRET`, `DATABASE_URL`, `CRON_SECRET`, `GOOGLE_SEARCH_API_KEY`/`GOOGLE_SEARCH_CX`.
4. After editing secrets, **restart the server** (run `keepalive-v2.sh` or the manual runbook) so the process picks them up.
5. Verify with:
   ```bash
   curl -s http://localhost:3000/api/auth/config
   # → {"googleAvailable":true,"emailConfigured":true}
   ```

**Important nuance:** the code reads SMTP credentials through an alias chain (`SMTP_PASSWORD` → `SMTP_PASS` → …), but `ensure-env.sh` writes the canonical names — align the panel with the canonical names to avoid surprises.

## Preview vs Deployed URL — What It Means

- **Preview URL** (`preview-chat-…space-z.ai`): proxies to the LIVE dev server in your sandbox. Full functionality, real database, real env vars. Changes on every new session.
- **Deployed URL** (`acquisition.space-z.ai`): a built artifact pushed by the deploy action. To have working OAuth here, its redirect URI (`https://acquisition.space-z.ai/api/auth/callback/google`) must be registered in GCP, and its env/secrets must be set for the deployment.

Because `redirect_uri` is now resolved dynamically from request headers (`x-forwarded-host`), the same codebase generates the correct redirect URI for whichever domain serves the login page — but **Google rejects any redirect URI that is not pre-registered**, so each domain in use must exist in the GCP OAuth client's Authorized redirect URIs.

## Recommended Usage

**Use GLM only for development.** It is a sandbox: servers get killed, files get reset, URLs rotate, and memory is capped. Develop and verify features here with the preview URL, then deploy production to Railway (recommended) or Vercel — see `DEPLOYMENT-RAILWAY.md` / `DEPLOYMENT-VERCEL.md`. Keep the secrets canonical names identical across platforms so the same env documentation works everywhere.

## Operational Quick Reference (sandbox)

```bash
# status check
curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/          # expect 200
curl -s http://localhost:3000/api/auth/config                           # expect googleAvailable:true

# restore env + restart (the keepalive runbook)
/home/z/my-project/keepalive-v2.sh

# manual runbook if the script fails
pkill -9 -f 'next' 2>/dev/null; sleep 2
/home/z/my-project/ensure-env.sh
[ -f src/middleware.ts ] && mv src/middleware.ts src/middleware.ts.disabled
setsid npx next dev -p 3000 > dev.log 2>&1 & sleep 25
curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/

# production build WITHOUT OOM (stop dev server first!)
pkill -9 -f 'next dev' 2>/dev/null; pkill -9 -f 'next build' 2>/dev/null; pkill -9 -f 'tsc' 2>/dev/null
NODE_OPTIONS='--max-old-space-size=3000' npx next build
```
