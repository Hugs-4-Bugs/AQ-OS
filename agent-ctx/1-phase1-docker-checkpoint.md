# Phase 1 — Docker Configuration Checkpoint (2026-10-19)

## Purpose

Formal, clearly-labeled forward checkpoint for the Phase 1 Docker/local
runtime stabilization work, per task directive Section 4 ("FIRST ACTION —
DURABLE CHECKPOINT").

## Git lineage (all forward commits, no rewrites, no force-push)

| Commit | Meaning |
|---|---|
| `b1eb92e0` | GitHub baseline `origin/main` (authoritative source) |
| `babbe95a` | Bootstrap checkpoint (workspace/Graphify/runtime checkpoint work) |
| `902f7ef0` | Platform auto-commit (UUID message `cf79a7ec-…`) that swept the Phase 1 compose fixes into history, mixed with routine runtime churn (`.next` dev cache, `dev.log`, `db/custom.db` runtime writes, `worklog.md`) |
| this commit | Formal Phase 1 checkpoint: engineering documentation + checkpoint record |

Note on `902f7ef0`: history rewriting is forbidden, so the Phase 1 compose
fixes remain inside that platform auto-commit. The exact intended diff was
re-verified at checkpoint time against `agent-ctx/1-phase1-docker-audit.md`
(see below) and matches 1:1. No application source files were changed by
Phase 1 anywhere in this lineage.

## Verified intended changes (git diff babbe95a0..902f7ef0)

`docker-compose.yml` — frontend service (matches audit doc RC-1/2/3):

1. `command: bun run dev` override REMOVED — restores Dockerfile.frontend's
   authoritative CMD (`bunx next dev -p 3000`). The removed override started
   with `node scripts/boot-recovery.mjs`, and oven/bun images ship no Node.js
   binary (boot-recovery also imports `node:sqlite`) → exit-127 crash loop.
2. `env_file: [".env"]` ADDED — runtime secret injection; explicit
   `environment:` entries still take precedence over env_file.
3. Volume `./db:/app/data` ADDED — canonical SQLite DB now reachable at the
   path `DATABASE_URL=file:/app/data/custom.db` already expects. Without it
   the container would silently use a BLANK database (DB-safety violation).

`docker-compose.prod.yml` (matches audit doc RC-4):

4. Anchor fixed to scalar: `x-common-restart: &common-restart
   unless-stopped` (was an invalid nested map that made all 10 services
   unparseable under Compose v2).

Diffstat: docker-compose.yml +13/−1, docker-compose.prod.yml +1/−2.
No other application source changes belong to Phase 1.

## Verification status — READ THIS

**STATIC CONFIGURATION FIXED.**
**RUNTIME VERIFICATION BLOCKED BY SANDBOX.**

Docker runtime is NOT available inside this GLM sandbox (no docker binary,
no docker.sock, no root, no user-namespace overlayfs, no fuse). Therefore:

- Docker build: NOT VERIFIED
- Docker container startup: NOT VERIFIED
- Docker healthcheck: NOT VERIFIED
- Docker browser verification: NOT VERIFIED

Do NOT claim any of the above are working. This checkpoint commit is a
local configuration fix and must NOT be mistaken for runtime verification.

Offline validation performed with the official docker-compose standalone
v2.34.0 binary: `compose config` passes for docker-compose.yml (9 services),
docker-compose.local.yml (3 + backend profile), docker-compose.prod.yml
(10 services, previously failing). Rendered frontend section confirmed the
three intended properties. Full evidence: `agent-ctx/1-phase1-docker-audit.md`.

## Procedure for a Docker-capable host (when one becomes available)

1. `git status --short` — expect only runtime churn (.next cache, dev.log).
2. Stop the native dev server (port 3000 conflict otherwise).
3. `docker compose config` (redact secrets from output before sharing).
4. `docker compose build frontend` then `docker compose up -d`.
5. Verify: containers stable (no restart loops), `docker compose ps`
   healthy, frontend logs show `next dev` boot (no `node: not found`),
   /api/health 200 from inside the network, canonical DB reachable
   (tables=115/users=42 — verify counts BEFORE and AFTER; never reset).
6. Browser: homepage, /auth/signin, /dashboard auth gate, static assets,
   console errors.

## Database safety (unchanged)

Canonical DB `db/custom.db`: 115 tables / 42 users / 191 leads /
39 subscriptions — identical before and after Phase 1. No migrations,
resets, seeds, or destructive operations were performed or are permitted.

## Not in scope (later phases)

README, MIT License, Workflow execution, Autopilot, UI redesign,
auth redesign, Docker runtime workaround beyond config, any feature work.
