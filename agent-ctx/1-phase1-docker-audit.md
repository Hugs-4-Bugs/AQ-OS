# Phase 1 — Docker / Local Runtime Audit (2026-10-19)

Baseline: `origin/main` @ `b1eb92e0` (workspace HEAD at task start: `babbe95a0`,
the bootstrap checkpoint commit — contains only .env, Graphify artifacts,
verification artifacts, db runtime state; no application source changes).

Task scope: Docker/local runtime stabilization ONLY. No feature work.

---

## 1. Docker runtime availability — VERDICT

**BLOCKED — Docker runtime unavailable in this environment.**

Evidence (all commands run read-only):

| Check | Result |
|---|---|
| `docker --version` | `command not found` |
| `docker compose version` | `command not found` |
| Docker binary in /usr/bin, /usr/local/bin, /opt, /snap | absent |
| `/var/run/docker.sock`, `/run/docker.sock` | absent |
| podman / nerdctl / containerd / ctr / dockerd | absent |
| `sudo -n true` | fails (no root) |
| `/proc/self/status CapEff` | `0` (no effective capabilities) |
| cgroup | k8s.io container (sandboxed pod, not a VM) |
| `unshare --user --map-root-user` | works (userns enabled) |
| overlayfs mount inside userns | **DENIED** (kernel 5.10, no unpriv overlayfs) |
| `/dev/fuse`, fusermount3 | absent (no fuse-overlayfs possible) |
| `newuidmap` / `newgidmap` | absent (rootless multi-UID containers impossible) |
| apt-get | present but no root to install system packages |

Conclusion: neither rootful Docker nor rootless Docker can be provisioned in
this sandbox.vfs-only storage + 4.5GB free disk + 1.3GB free RAM would also
make the full 9-service build infeasible. No application source was modified
to compensate (per task Section 16).

Static validation tooling: official `docker-compose` standalone binary v2.34.0
(GitHub release) was downloaded to `scripts/docker-tools/` for offline
`compose config` validation (no daemon required), then removed after use.

---

## 2. Static Docker audit — files inspected

- `Dockerfile` (prod, multi-stage node:20-alpine → standalone `node server.js`,
  HEALTHCHECK wget `/api/health`, non-root uid 1001) — sound; matches
  `docs/deployment/03-docker.md` handbook; `.npmrc` + `.dockerignore` exist.
- `Dockerfile.frontend` (dev, oven/bun:1.1-alpine, `bun install`, `bunx prisma
  generate`, non-root uid 1001, CMD `bunx next dev -p 3000`).
- `backend/Dockerfile` (python:3.11-slim, pip, playwright chromium).
- `mini-services/realtime-service/Dockerfile` (bun alpine, port 3003).
- `docker-compose.yml` (local full stack, 9 services), `docker-compose.local.yml`
  (infra-only + opt-in backend profile), `docker-compose.prod.yml` (10 services),
  `monitoring/docker-compose.monitoring.yml` (6 services).
- `nginx.conf` (dev, :80 → frontend:3000 / backend:8000, rate limits, WS),
  `nginx.prod.conf` (TLS, certbot, realtime upstream), `Caddyfile` (sandbox
  preview :81 → localhost:3000), `deploy/nginx-entrypoint.sh` (envsubst).
- `.dockerignore` (excludes node_modules/.next/.git/.env/db/docs/download…).
- `package.json` scripts, `next.config.ts` (output standalone,
  serverExternalPackages incl. @prisma/client), `prisma/schema.prisma`
  (provider sqlite, url env DATABASE_URL), `src/lib/db.ts` (DATABASE_URL
  default `file:/home/z/my-project/db/custom.db`), `src/app/api/health/route.ts`
  (DB + memory + error checks, unauthenticated).
- `DOCKER_LOCAL_RUN/` runbook + env docs; `docs/deployment/03-docker.md`.

---

## 3. Root causes found (static, evidence-based)

### RC-1 — local compose frontend crash-loop (CRITICAL)
`docker-compose.yml` frontend service overrode the image CMD with
`command: bun run dev`. The package.json `dev` script begins with
`node scripts/boot-recovery.mjs && …`. `oven/bun:1.1-alpine` ships **no
Node.js binary**, and `scripts/boot-recovery.mjs:33` imports `node:sqlite`.
Result: `sh: node: not found` → exit 127 → `restart: unless-stopped` →
infinite crash loop. Dockerfile.frontend's own CMD (`bunx next dev -p 3000`)
was specifically designed to avoid this; the compose override defeated it.

### RC-2 — blank-database hazard (DATABASE SAFETY, CRITICAL)
Frontend env `DATABASE_URL: file:/app/data/custom.db` with **no bind mount**
for `/app/data` (and `.dockerignore` excludes `db/`). A started container
would create/use a **blank** SQLite DB in the container layer — never the
canonical `db/custom.db` (115 tables / 42 users / 191 leads / 39 subs).
This is exactly the "create a blank database and silently use it" failure
the task forbids. Fix: bind `./db:/app/data` (uid 1001 image user == host
user z, so SQLite writes work).

### RC-3 — missing runtime env injection
Frontend container received only NEXT_PUBLIC_APP_URL + DATABASE_URL; host
`.env` (NEXTAUTH_SECRET/AUTH_SECRET/JWT secrets, SMTP_*, GOOGLE_CLIENT_*,
GMAIL_*, GOOGLE_SEARCH_*, CRON_SECRET, ENABLE_*, AUTH_* flags) was never
passed → next-auth v4.24.11 / OAuth / email dead in-container. Repo's own
`DOCKER_LOCAL_RUN/docker_env_setup.md` §3–4 prescribes runtime `env_file`.

### RC-4 — prod compose unparseable (pre-existing, PROD SCOPE)
`docker-compose.prod.yml` anchor `x-common-restart` wrapped the value in a
map (`restart: unless-stopped`) instead of a scalar, so all ten
`restart: *common-restart` references resolved to a map →
`services.frontend.restart must be a string` → the entire prod file failed
`docker compose config` (all 10 services unusable under Compose v2).

### Operational notes (not defects)
- Host port 3000 is held by the native dev server (next-server v16.1.3);
  `docker compose up` on the same machine would hit a port-bind conflict —
  stop the native server first when running the compose stack.
- Native `/api/health` at audit time: database healthy (1.29ms), errors
  healthy, **memory unhealthy (96.5% dev heap)** → overall "down"/503.
  Dev-heap gauge artifact of the running native dev server; observation
  only (out of Phase 1 scope). Relevant caveat: a container healthcheck of
  `/api/health` via wget --spider treats 503 as failure — expect flapping
  under dev heap pressure.
- Prod frontend (reported separately, NOT touched): `DATABASE_URL=
  file:./data/acquisitionos.db` with no data volume and a non-canonical
  filename; healthcheck probes `/` instead of `/api/health`.

---

## 4. Fixes applied (minimal, Docker-config only)

`git diff --stat`: docker-compose.yml +13/−1, docker-compose.prod.yml +1/−2.
No other tracked files changed by this phase.

### docker-compose.yml — frontend service
1. Removed `command: bun run dev` override (restores Dockerfile.frontend CMD).
2. Added `env_file: [".env"]` (runtime secret injection; explicit
   `environment:` still overrides env_file, so DATABASE_URL stays
   `file:/app/data/custom.db`).
3. Added volume `./db:/app/data` (canonical DB at the path DATABASE_URL
   already expects).

### docker-compose.prod.yml — single line
`x-common-restart: &common-restart unless-stopped` (was a nested map).
All ten services now parse; intent preserved (unless-stopped everywhere).

### Validation (offline, official docker-compose v2.34.0)
- `docker compose config` — docker-compose.yml: VALID (9 services).
- `docker-compose -f docker-compose.local.yml config --services`: VALID
  (3 default + backend-profile services).
- `docker-compose -f docker-compose.prod.yml config --services`: VALID after
  fix (10 services) — was FAILING before.
- Rendered frontend section confirmed: no command override; `./db:/app/data`
  bind present; env_file merged with correct precedence.
- All four compose files parse as valid YAML (python yaml).

⚠️ Caution for future runs: `docker compose config` renders merged secret
VALUES to stdout when env_file is used — pipe through a redactor before
sharing output.

---

## 5. Database safety verification

Canonical DB `db/custom.db` (SQLite, Prisma provider sqlite):

| Metric | Pre-work | Post-work |
|---|---|---|
| Tables | 115 | 115 |
| Users | 42 | 42 |
| Leads | 191 | 191 |
| Subscriptions | 39 | 39 |

Docker never ran in this sandbox; counts unchanged; no migrations, no
seeding, no resets, no volume writes. DB md5 at snapshot: ae3d99c2… (runtime
writes from the native dev server continue as normal).

---

## 6. Repository integrity vs origin/main @ b1eb92e0

- Tracked files: 85,821. Physically missing **outside `.next/dev/cache/`**: **0**
  (285 missing paths are all Turbopack cache files continuously rewritten by
  the live dev server; also visible as .next churn in git status).
- Missing tracked directories: 0 — download/ db/ db-backups/ backend/
  frontend/ src/ public/ scripts/ tests/ ACQUISITIONOS_CONTROL_CENTER/
  DOCKER_LOCAL_RUN/ PAYMENT-CONFIGURATION/ agent-ctx/ docs/ skills/
  graphify-out/ all present.
- Modified tracked files vs origin/main: `.next/dev/*` (runtime), `db/custom.db`
  (runtime), `dev.log` (runtime), `node_modules/.prisma/client/*` (regenerated
  client), `worklog.md` (bootstrap), `docker-compose.yml` +
  `docker-compose.prod.yml` (this phase, intentional).

---

## 7. NOT verified in this sandbox (honest blockers)

- Docker image builds (frontend/backend/realtime) — no Docker daemon.
- Container startup / healthchecks / logs — no Docker daemon.
- nginx proxy path end-to-end — no Docker daemon.
- Browser verification of the Docker-served app — no Docker daemon.
- Compose runtime behavior of the fixes (command removal, db bind mount,
  env_file precedence) — statically validated only.

## 8. Verification procedure for a Docker-capable environment

```bash
cd /path/to/AQ-OS && git status --short        # expect only runtime churn
docker compose config --services               # 9 services
docker compose build                           # or targeted: build frontend
# stop any native dev server holding :3000 first
docker compose up -d && docker compose ps      # all Up (non-restarting)
docker compose logs --tail=200 frontend        # no crash loop, prisma OK
curl -s http://localhost:3000/api/health       # database: healthy
# canonical DB in-container check:
docker compose exec frontend ls -la /app/data  # custom.db present (5.3MB)
# browser: homepage, sign-in, sign-up, dashboard, /api/health, static assets
# after tests: sqlite counts must equal pre-run snapshot (115/42/191/39)
```

## 9. Git & persistence decisions

- No commit created: task Section 20 authorizes a commit only when the fix is
  runtime-verified — it is not (Docker unavailable). The two compose fixes
  remain uncommitted working-tree changes, fully described above for
  re-derivation.
- `/home/sync/repo.tar` NOT modified (Section 21 requires verified runtime
  before persistence checkpoint updates). The archive still reflects the
  bootstrap state; these fixes are documented here so they survive.
- No push performed. No history rewritten. No destructive git commands used.

## 10. Deferred findings (documented only — separate phases)

- Lead Discovery returns ~20 leads (limit investigation) — NOT touched.
- Workflow execution issues — NOT touched.
- README / MIT License — NOT touched.
- Native dev-server heap pressure (96.5%) — NOT touched.
- Prod frontend DB path/volume + healthcheck target mismatch — reported in
  §3, NOT fixed (prod scope; requires its own verified phase).
