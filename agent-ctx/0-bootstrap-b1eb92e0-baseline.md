# CONTEXT CHECKPOINT — AcquisitionOS Workspace Baseline

> This file orients any future session (AI agent or human) to the exact state of this
> workspace. It was created during the fresh-workspace bootstrap on 2026-10-19.
> Graphify is installed and indexed — read `graphify-out/GRAPH_REPORT.md` BEFORE
> exploring source files (~71.5x cheaper than reading raw source).

## CURRENT BASELINE

- Repository: https://github.com/Hugs-4-Bugs/AQ-OS.git
- Branch: main
- HEAD: b1eb92e0aa2a7e356c7d81ed98cbd98eb6d2cf18 (short: b1eb92e0)
- Status: Fresh GitHub baseline — 85,821 tracked files restored path-by-path and
  hash-verified (git blob SHA-1 identity) against GitHub main.
  NO feature modifications performed yet.
- origin/main == HEAD == b1eb92e0 (no local commits, nothing pushed).

## Workspace Layout (top-level)

- `src/` — Next.js 15 App Router frontend + API routes + lib (auth, lead-discovery,
  workflow engine, payments, notifications)
- `frontend/` — secondary frontend assets
- `backend/` — Python backend (FastAPI-style services, analytics tasks)
- `prisma/schema.prisma` + `db/custom.db` — database schema + SQLite data (TRACKED — do not reset)
- `db-backups/` — tracked DB snapshots
- `node_modules/` — TRACKED (self-contained deps; bun is the package manager; bun.lock)
- `.next/` — tracked build output
- `ACQUISITIONOS_CONTROL_CENTER/`, `DOCKER_LOCAL_RUN/`, `PAYMENT-CONFIGURATION/`,
  `deploy/`, `infra/`, `mini-services/`, `monitoring/` — ops/config areas
- `agent-ctx/` — per-task context files from previous sessions (convention: one file per task)
- `worklog.md` — TRACKED multi-session worklog (append entries; do not clobber)
- `AGENTS.md` — binding safety contract; read before any codebase change
- `tests/`, `scripts/`, `docs/` — tests, tooling, documentation
- `upload/` — user-uploaded assets (LIVES ON OSS MOUNT — see persistence notes)

## Persistence (GLM/Z.ai sandbox)

- Durable: `/home/sync` (ossfs OSS mount). Boot restores from `/home/sync/repo.tar`
  via `/start.sh` (which wipes `/home/z/my-project` except the `upload` mount, then
  extracts the tar, re-extracts official skills, rewrites `.env` with
  `DATABASE_URL=file:/home/z/my-project/db/custom.db`, then runs bun install +
  `bun run db:push` + `bun run dev`).
- `/home/z/my-project/upload` ≡ `/home/sync/upload` (SAME OSS storage, mounted twice).
- Insurance checkpoint: `/home/sync/AQ-OS-b1eb92e0-persistent.tar` (+ `.meta` JSON with
  sha256) — created from the verified workspace at bootstrap.
- KNOWN PLATFORM BEHAVIOR (not data loss): boot-time `tar xf` of repo.tar exits 1 with
  ~44 "Directory renamed before its status could be extracted" warnings on node_modules
  `.bin` symlink dirs (overlayfs inode churn). `/start.sh` tolerates this. Content
  completeness after restore is hash-verified — see
  `download/workspace-verification/simulation-reactivation/`.
- Graphify index: `graphify-out/` (16MB) — inside the workspace, included in repo.tar,
  survives reactivation. Reinstall the CLI after reactivation with
  `bash scripts/reinstall-graphify.sh` (venv is ephemeral; wheel is vendored in
  `scripts/vendor/`).

## Graphify Index (code-only, AST)

- 12,306 nodes · 35,026 edges · 511 communities · built from commit b1eb92e0
- Key hubs: auth.ts / withAuth / withSuperAdmin (auth), workflow-engine.ts +
  workflow-executor.ts (workflows), lead-discovery-service.ts + discovery-engine.ts +
  company-researcher.ts + distributed-scraping-service.ts (lead discovery),
  stripe-service.ts / razorpay-provider.ts / subscription-service.ts /
  entitlement-service.ts / credit-service.ts (payments), @prisma/client (db),
  meeting-service.ts, notification-engine.ts, competitor-intelligence-service.ts.
- Semantic doc extraction NOT run (no LLM API key in sandbox; gateway not
  HTTP-reachable from shell). Run `graphify . --update` after future changes.
- Query examples: `graphify query "where is lead discovery handled?"`,
  `graphify path "AuthMiddleware" "PostgresAdapter"`, `graphify explain "Lead"`.

## Environment

- `.env` contains only `DATABASE_URL=file:/home/z/my-project/db/custom.db`
  (platform-managed; rewritten at every boot — do not rely on it for other vars).
- `.env.example` does NOT exist in-repo (deleted in history; see
  `ENVIRONMENT-VARIABLES.md` and `agent-ctx/` for required variable NAMES).
- Secrets: `secrets.md` / `secrets.yaml` exist TRACKED in-repo (flagged sensitive by
  graphify and skipped from the index). Never print their contents.

## Rules In Effect

- GitHub main @ b1eb92e0 is the ONLY source of truth for this bootstrap.
- No feature development until the user confirms the foundation is stable.
- Future phase order (user-defined): 1) Docker/local runtime 2) Lead Discovery >20
  3) README update 4) MIT License 5) Workflow execution 6) one-at-a-time fixes.
- Never: git reset/clean/checkout-revert, DB resets, destructive migrations,
  stale-archive restores. See AGENTS.md (binding) + user directives in worklog.md.
