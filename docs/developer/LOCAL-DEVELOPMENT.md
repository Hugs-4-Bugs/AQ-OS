# Local Development — AcquisitionOS

> Owner: Engineering. Status: Living document. Last reviewed: 2026-09-09.
> Source: `package.json`, `.env`, `keepalive-v2.sh`, `ensure-env.sh`, `next.config.ts`, the existing `docs/03-setup-and-deployment/LOCAL-SETUP.md`.

## 1. Prerequisites

| Tool | Version | Why |
|---|---|---|
| **Node.js** | ≥ 20 LTS | Next.js 16 requires it |
| **Bun** | ≥ 1.3 | Package manager + script runner (the project uses `bun.lock`) |
| **Git** | any recent | Version control |
| **A terminal** that supports `setsid` (Linux) | any | The keepalive script uses it |

**Optional:**
- **Prisma Studio** (`bunx prisma studio`) — DB GUI.
- **SQLite CLI** (`sqlite3`) — direct SQL (not always installed; use Prisma Studio if not).

## 2. First-Time Setup

```bash
# Clone
git clone <repo> acquisitionos
cd acquisitionos

# Install dependencies
bun install

# Restore the environment file (the sandbox wipes .env periodically)
./ensure-env.sh

# Initialize the database (creates db/custom.db + applies the schema)
bun run db:push

# (Optional) Seed some dev data
bun run scripts/seed.ts

# Start the dev server
bun run dev
# → ready in ~3s on http://localhost:3000
```

**Verify it works:**
```bash
curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/   # → 200
curl -s http://localhost:3000/api/auth/config                   # → {"googleAvailable":true,"emailConfigured":true}
```

Open the **Preview Panel** (right side of the interface) to see the app. Click "Open in New Tab" for a separate browser tab. (Don't navigate to `http://localhost:3000` directly — that's internal to the sandbox.)

## 3. Environment Variables

`ensure-env.sh` restores `.env` from a hardcoded template. The critical variables:

| Variable | Example | Required | Notes |
|---|---|---|---|
| `DATABASE_URL` | `file:/home/z/my-project/db/custom.db` | yes | SQLite path (file:) |
| `JWT_SECRET` | `acquisitionos-jwt-secret-key-2024-production` | yes | HS256 signing; `openssl rand -hex 32` for a real one |
| `JWT_REFRESH_SECRET` | `acquisitionos-jwt-refresh-secret-2024` | yes | Refresh-token signing |
| `NEXTAUTH_SECRET` | (any) | yes | NextAuth (if enabled) |
| `NEXTAUTH_URL` | `https://<your-preview-domain>` | yes | Public URL |
| `NEXT_PUBLIC_APP_URL` | `https://<your-preview-domain>` | yes | Public URL (client-side) |
| `APP_URL` | `https://<your-preview-domain>` | yes | Public URL (server-side; used for magic links + redirects) |
| `GOOGLE_CLIENT_ID` | `22873135381-...apps.googleusercontent.com` | yes (for Google OAuth) | Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | `GOCSPX-...` | yes (for Google OAuth) | Google Cloud Console |
| `SMTP_HOST` | `smtp.gmail.com` | yes (for email) | |
| `SMTP_PORT` | `587` | yes (for email) | 587 TLS, 465 SSL |
| `SMTP_USER` | `you@gmail.com` | yes (for email) | |
| `SMTP_PASSWORD` | `<16-char App Password>` | yes (for email) | Gmail App Password (not the account password) |
| `EMAIL_FROM` | `you@gmail.com` | yes (for email) | |
| `CRON_SECRET` | `acquisitionos-cron-dev` | yes (for cron) | Bearer token for `/api/cron/*` |
| `GOOGLE_SEARCH_API_KEY` | (Google CSE) | yes (for discovery) | |
| `GOOGLE_SEARCH_CX` | (CSE ID) | yes (for discovery) | |
| `AUTH_DEV_MODE` | `false` | yes | Set `false` in prod + dev for real auth |
| `ENABLE_GOOGLE_OAUTH` | `true` | yes | |
| `ENABLE_MAGIC_LINK` | `true` | yes | |
| `ENABLE_OTP_LOGIN` | `true` | yes | |

The full reference: [`docs/04-secrets-and-configuration/ALL-SECRETS.md`](../04-secrets-and-configuration/ALL-SECRETS.md).

**Adding a new secret:** update `ensure-env.sh` (the template + the `PRESERVE_KEYS` array) + `env-safeguard.ts` if it's critical.

## 4. The Sandbox Quirks (the platform)

This project runs in a restricted cloud sandbox:
- **The sandbox periodically kills the dev server AND wipes `.env`.** The `keepalive-v2.sh` script (run by a cron every 5 min) restores `.env` + restarts the server — **but only if the server is unhealthy** (health-check based).
- **`@next/swc-linux-x64-gnu` binary** gets removed sometimes; `keepalive-v2.sh` restores it from `node_modules/@next/swc-linux-x64-gnu/next-swc.linux-x64-gnu.node`.
- **`src/middleware.ts`** is renamed to `src/middleware.ts.disabled` (Next 16 uses `src/proxy.ts`).
- **Only port 3000** is exposed externally (via the gateway). Don't run the server on another port.
- **`bun run build`** may OOM in the sandbox; use `bun run dev` instead.

## 5. Common Commands

```bash
# Dev server (auto-reloads on file change)
bun run dev

# Lint
bun run lint

# Type-check
bunx tsc --noEmit

# Database
bun run db:push        # Apply the schema (no migration history)
bun run db:generate    # Regenerate the Prisma client (after schema changes)
bun run db:migrate     # Create + apply a migration (creates SQL in prisma/migrations/)
bun run db:reset       # Drop + recreate the DB (DESTRUCTIVE — dev only)

# Tests
bun run test           # Unit (Vitest)
bun run test:watch
bun run test:coverage

# Security
bun run security:scan  # The in-repo security scanner (scripts/security-scan.ts)

# Backups
bun run backup         # Manual DB backup
bun run backup:restore # Restore from a backup

# Prisma Studio (DB GUI)
bunx prisma studio

# Keepalive (manual trigger)
./keepalive-v2.sh
```

## 6. Common Setup Errors + Fixes

### `Ecmascript file had an error` in dev.log
- A file has a syntax error. The log names the file.
- **Fix:** fix the syntax; the dev server auto-reloads.

### `Cannot find module '@next/swc-linux-x64-gnu'`
- The SWC native binary is missing.
- **Fix:** `keepalive-v2.sh` restores it; or manually:
  ```bash
  cp node_modules/@next/swc-linux-x64-gnu/next-swc.linux-x64-gnu.node node_modules/next/dist/server/next-swc.linux-x64-gnu.node
  ```

### `Both middleware file and proxy file detected` (Next 16)
- Both `src/middleware.ts` and `src/proxy.ts` exist.
- **Fix:** `keepalive-v2.sh` renames `src/middleware.ts` to `src/middleware.ts.disabled`; or manually:
  ```bash
  [ -f src/middleware.ts ] && mv src/middleware.ts src/middleware.ts.disabled
  ```

### `address already in use :::3000`
- A stale Next.js process is holding the port.
- **Fix:** `pkill -9 -f next; sleep 2; bun run dev`

### `db/custom.db does not exist`
- The DB file is missing (first run or after a wipe).
- **Fix:** `bun run db:push` (creates the file + applies the schema).

### `Prisma Client not generated`
- The schema changed but the client wasn't regenerated.
- **Fix:** `bun run db:generate`

### `Google OAuth redirect_uri_mismatch`
- The current preview URL isn't in Google Cloud Console's authorized redirect URIs.
- **Fix:** visit `/api/auth/google/redirect-uri` on the current domain; copy the URI; add it to the Google OAuth client in Google Cloud Console.

### Magic-link emails point at `localhost:3000`
- `APP_URL` is unset or set to localhost.
- **Fix:** `ensure-env.sh` (restores `APP_URL` to the preview domain); verify in `.env`.

### Google sign-in fails for a registered user
- (Was a bug; fixed 2026-09-09 — the callback now backfills + reactivates.) If it recurs, check `dev.log` for `[G-CB] Step N` to find the failing step.

### Auth fails for everyone after a `.env` wipe
- The sandbox wiped `.env`; the running server still has the old env (cached at boot).
- **Fix:** `keepalive-v2.sh` (restores `.env` + restarts); or manually `ensure-env.sh` + restart.

### Out of memory during `next build`
- Turbopack memory.
- **Fix:** use `bun run dev` (the sandbox pattern); or upgrade the build host.

## 7. Working with the Database

- **Prisma Studio:** `bunx prisma studio` — opens a GUI at `http://localhost:5555` (or wherever it finds a free port).
- **Direct SQL:** `sqlite3 db/custom.db "<query>"` (if `sqlite3` is installed; Prisma Studio is the no-CLI alternative).
- **Reset:** `bun run db:reset` — drops + recreates the DB; loses all data; dev only.
- **Seed:** `bun run scripts/seed.ts` — adds some dev data.

## 8. Working with the Frontend

- The app is a client-rendered SPA behind an auth gate. The only user-visible route is `/` (defined in `src/app/page.tsx`); the dashboard is rendered by tab state, not routes.
- **shadcn/ui** components in `src/components/ui/` — extend, don't reimplement.
- **TanStack Query** for server state; **Zustand** (`src/lib/store.ts`) for client state.
- **`next-themes`** for light/dark (default light).
- **Framer Motion** for animations.

## 9. Working with the API

- API routes under `src/app/api/*` (485 routes).
- **`withAuth`** wraps every protected handler; **`withDualAuth`** allows session or API key.
- **No absolute paths** in `fetch` — relative only (`/api/...`). The gateway forbids absolute.
- For WebSocket, the path is `/api/ws` (or `io("/?XTransformPort=<port>")` for mini-services).

## 10. The Preview Panel (where the user sees the app)

- The app runs on port 3000 internally; the gateway exposes it on the public preview URL.
- **Don't** navigate to `http://localhost:3000` directly — it's internal. Use the **Preview Panel** (right side of the interface) or click "Open in New Tab" above it.

## 11. Review Cadence

- **On each new dependency / env var** — update this document + `ensure-env.sh` + `ALL-SECRETS.md`.
- **Quarterly** — review the common-setup-errors list against recent issues; update.

---

*See also: [CONTRIBUTING.md](CONTRIBUTING.md), [DEBUGGING-GUIDE.md](DEBUGGING-GUIDE.md), [TESTING-STRATEGY.md](TESTING-STRATEGY.md), `docs/03-setup-and-deployment/LOCAL-SETUP.md`.*
