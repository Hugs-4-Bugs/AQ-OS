# AcquisitionOS — Task Execution Protocol

## Required Reading

Before any task, read:

- production.md
- architecture.md
- rules.md
- design.md
- memory.md
- futureimplementation.md

Do not start coding before understanding these constraints.

## Phase 1 — Understand

Rewrite the task in concrete acceptance criteria.

Identify:

- user role;
- plan/entitlement;
- input;
- expected result;
- current result;
- affected workflow;
- security implications;
- credit implications.

## Phase 2 — Locate

Trace every relevant layer.

Frontend:
- component
- state
- API client
- request payload
- response handling

Spring Boot:
- controller
- DTO
- validation
- auth
- authorization
- service
- transaction
- repository
- external provider
- exception mapping

Async:
- job record
- queue
- scheduler
- worker
- retry
- persistence
- status

Database:
- schema/entity
- indexes
- tenant ownership
- migrations

## Phase 3 — Reproduce

Use a real test case where possible.

Record:

Input:
...

Expected:
...

Actual:
...

Failure:
...

## Phase 4 — Root Cause

Write:

ROOT CAUSE:
...

RUNTIME PATH:
...

WHY IT FAILS:
...

Do not patch symptoms until the root cause is understood.

## Phase 5 — Implement

Make the smallest correct change.

Preserve existing contracts.

Do not rewrite unrelated code.

## Phase 6 — Verify

### Lead Discovery Acceptance

Test at least two niches with different targeting instructions.

Verify:

target
→ provider/source
→ raw response
→ parsing
→ relevance filtering
→ verification
→ deduplication
→ persistence
→ Leads UI

Also test:

- zero results;
- provider failure;
- unauthorized plan;
- duplicate lead;
- phone-only lead;
- missing optional fields.

### Workflow Acceptance

Populate:

My Context
Business Profile
My Offer

Create and activate workflow.

Verify:

save
→ activation
→ trigger
→ queue
→ worker
→ execution
→ result
→ final status

### Entitlement Acceptance

Authorized plan:

feature executes.

Unauthorized plan:

server rejects
→ no queue
→ no credit consumption
→ clear error.

### Outreach Acceptance

Verify:

- correct authenticated sender;
- personalization;
- duplicate prevention;
- bounce/error handling;
- persisted activity;
- reply tracking.

## Phase 7 — Regression

Check affected shared services and nearby features.

## Phase 8 — Performance/Scale Check

Only after correctness:

- query efficiency;
- pagination;
- batch size;
- provider limits;
- queue throughput;
- retry behavior;
- database indexes;
- concurrency;
- memory.

Do not increase volume at the cost of correctness.

## Phase 9 — Final Report

Required:

### Root Cause
...

### Implementation
...

### Files Changed
...

### Tests
...

### Runtime Verification
...

### Data Verification
...

### Regression Verification
...

### Remaining Risk
...

### Status
DONE / PARTIAL / NOT DONE / BLOCKED

## Evidence Rule

Every DONE statement must cite actual evidence such as:

- test output;
- successful API request;
- database state;
- queue execution;
- provider response;
- end-to-end UI behavior.

Static code inspection is not sufficient for runtime claims.

## Failure Handling

If external credentials/provider access are unavailable:

BLOCKED — runtime verification requires [dependency].

Do not invent successful output.

---

# Task Status Ledger (append-only)

## P0 — Lead Discovery finds no leads + truthful outcomes  — DONE (verified)

- Root causes (5) diagnosed, implemented, and verified 2026-10-11. See MEMORY.md
  "Verified Fix Record" and worklog section `P0-DISCOVERY-WORKFLOW-FIX`.
- Acceptance: TEST A (MSP/Australia + SaaS/US, real persisted leads, honest fields),
  TEST B (zero-match honesty), TEST C (unauthorized plan server-side reject, no
  credits, no job row) — all pass with evidence in worklog.
- Regression guard: `tests/unit/production-fix-regressions.test.ts` (11 tests) —
  re-run 2026-10-11 this session: 11/11 PASS.

## P0 — Server-side plan/entitlement enforcement — DONE (verified)

- Discovery: free plan 429 LEAD_DISCOVERY_LIMIT_REACHED before any work/credits.
- Workflows: free plan 403 PLAN_REQUIRED on create/execute.
- Frontend hiding alone is NOT relied upon; server gates verified live.

## P1 — Workflow created but never executes — DONE (verified)

- Root causes (7) diagnosed and fixed; draft→activate→trigger→scheduler→worker→
  result→status path verified end-to-end (TEST D/E/F, scheduler tick, heartbeat,
  event chains) — evidence in worklog.
- My Context + Business Profile + My Offer proven present at execution time via
  generated OutreachMessage content referencing profile value proposition.

## Non-blocking remaining items (documented, intentionally untouched per scope)

- Trigger producers for gmail_connected / email_received / telegram_received /
  whatsapp_received / payment_success / trial_ending (plumbing lives in webhook
  flows; larger blast radius).
- Execution timeoutMs advisory only (60-min scheduler recovery covers stuck runs).
- Workflow builder UI lacks literal "To" field (lead.email fallback + {{lead.email}}
  cover the recipient path).

## Control System — INSTALLED (2026-10-11)

- ACQUISITIONOS_CONTROL_CENTER/ created at repo root with all 7 control documents
  (byte-identical to user-uploaded sources) + this README.md master instructions.
- Rule going forward: every implementation session starts with STEP 1 inspect /
  STEP 2 compare / STEP 3 show-the-plan (see README.md in this folder).

## Autopilot (niche-based automated acquisition) — DONE (verified 2026-10-14)

- Feature: multi-niche Autopilot reusing the existing discovery pipeline
  (≈20/batch, NOT increased) + existing workflow execution engine; separate UI
  tab; Pro=3 / Elite=7 ACTIVE+RUNNING slots; Free/Starter server-blocked.
- Implementation lives in local commit 5795e312d (platform auto-commit):
  src/lib/autopilot/{constants,service,runner,scheduler-runner}.ts,
  /api/autopilot[+ /id + /id/run + /api/cron/autopilot-scheduler],
  autopilot-tab.tsx (lazy, PlanGate pro), additive Prisma models
  AutopilotWorkflow/AutopilotRun/AutopilotLead (ledger unique guard).
- Verification evidence (2026-10-14, this session):
  - Unit: tests/unit/autopilot.test.ts 30/30 + autopilot-runner.test.ts 16/16
    (incl. "never executes the same lead twice — ledger unique guard wins",
    honest EXEC_FAILED, per-niche failure continuation).
  - Full suite: 1270 passed / 28 failed — failed count EXACTLY the documented
    pre-existing baseline; ZERO failures in any autopilot file.
  - tsc scoped (lib/components/app): 0 errors in autopilot files (remaining
    errors = pre-existing baseline: lib 163 / components 99 / app 103).
  - Production build: EXIT=0, BUILD_ID VIrN2lyOIcUhHokgzuiqa (prior attempts
    OOM-killed at page-data phase — heap sizing, not code; 2GB heap fits 4GB pod).
  - Live API (real sessions): free GET→{allowed:false,limit:0}; free POST→403
    PLAN_REQUIRED (no row, no credits); pro GET→200 entitlement {limit:3};
    4th ACTIVE→403 AUTOPILOT_LIMIT_REACHED; PAUSED frees slot→create succeeds;
    cross-user GET/RUN/DELETE→404/403/404 (no IDOR leak); cron no/wrong
    secret→401; CRUD round-trip + full cleanup (final state unchanged).
  - Live browser E2E: real signin → dashboard → Autopilot tab renders
    "Active slots: 1 / 3" + real autopilot "Dental+Hospital Mumbai" (ACTIVE,
    Dental+Hospital, Mumbai/India, daily, next run) + Run now / New Autopilot
    controls. Screenshot: scripts/autopilot-tab-verified.png.
- BLOCKED (external, unchanged): Gmail SMTP 535 BadCredentials re-confirmed
  live 2026-10-14 (app password rejected by Google); Google OAuth real
  consent flow requires valid external client credentials (401 invalid_client
  documented in earlier sessions). Operator must rotate/re-provision both.

## Documentation drift note (2026-10-14)

- production-fix-regressions.test.ts (cited above and in MEMORY.md) no longer
  exists; equivalent P0 coverage now lives in tests/unit/{permanent-auth-fix,
  workflow-schedule-timezone,discovery-hard-criteria,infra-failure-auth-semantics,
  verification,discovery-volume-persistence}.test.ts — ALL PASSING in the
  2026-10-14 full-suite run. Docs kept as historical record; coverage mapping
  recorded here per the completion-honesty rule.

## Autopilot UI visibility + scheduler heartbeat + execution-truth fixes — DONE (verified 2026-10-14, session AUTH-FIX-2/AUTOPILOT-UI-1)

- User evidence: Workflows page showed [Workflows|Executions|Templates|New Workflow] with no
  visible Autopilot. Audit: Autopilot existed as a separate sidebar surface
  (/business-ai/autopilot, PlanGate pro) with REAL state (browser-verified: "Dental+Hospital
  Mumbai ACTIVE, Discovered 79, slots 1/3") but was absent INSIDE the Workflows area the user
  screenshots, and GitHub main (9158bb68f) predates the entire local Autopilot implementation
  (unpushed commits — repository source-of-truth divergence documented).
- UI fix: workflows-tab.tsx internal tabs now [Workflows | Autopilot | Executions | Templates]
  embedding the SAME autopilot-tab.tsx (lazy + Suspense, no fork). Browser evidence as Pro:
  tab renders full panel with live backend state; as Free: "Workflows requires Pro" upgrade
  wall (shot-pro-workflows-autopilot-tab.png, shot-free-workflows-gate.png).
- Scheduler gap FIXED: runAutopilotSchedulerTick was reachable ONLY via the cron route, and no
  external cron exists in this environment (the 04:07 schedule silently never fired — no
  trigger='scheduled' run row existed). Added in-process heartbeat in src/instrumentation.ts
  register() (5-min interval, 20s after boot, AUTOPILOT_SCHEDULER_DISABLED=1 opt-out) driving
  the SAME atomic tick. LIVE PROOF: heartbeat logged "due=1 started=1"; run
  cmv7ta95k0000n trigger='scheduler' COMPLETED (discovered 40, saved 0, processed 38,
  executions 0 — every lead was an AutopilotLead-ledger duplicate: dedup + idempotency held);
  nextRunAt advanced +24h; autopilot returned to ACTIVE.
- Execution-truth fix (root cause of 41 failed executions "No tags specified"): the system has
  TWO execution engines — workflow-engine.ts→workflow-actions.ts (manual/scheduled) and
  workflow-executor.ts (autopilot/webhook/retry). The builder/AI-generator vocabulary
  (update_tags/move_lead_stage/create_gmail_draft) and legacy vocabulary (add_tag/
  move_to_stage/send_gmail_draft) plus config key shapes (tag vs tags, stage vs targetStage)
  were not mutually accepted → saved definitions failed on the autopilot path. Fix: alias
  cases + tolerant config resolution in BOTH engines + executor default-case delegation to
  the canonical executeAction (full builder ACTION_TYPES coverage on every path; honest
  Unknown failure preserved). RUNTIME PROOF: retry of failed execution
  cmv7t2hod00f6na24l06bbpgu → completed (was failed "No tags specified").
- Run Now / concurrency: 4 real manual runs today, strictly serialized (each started ≤10ms
  after the previous COMPLETED — user lock + atomic claims held; no overlapping runs, no
  double execution). Credits respected (72→54; truthful "Insufficient credits" FAILED run in
  history). Unit suites: autopilot 46/46 (incl. atomic claim, second-run rejection, ledger
  unique guard, stuck recovery), workflows 54/54. tsc (bun runtime): 0 errors in modified
  files (692 pre-existing generated .next/dev/types noise only).
- Server-side entitlement re-verified live: free GET {limit:0,allowed:false}; free POST 403
  PLAN_REQUIRED (no row, no credits); pro GET {limit:3}; elite GET {limit:7}; IDOR free→pro
  detail 404, run 403; cron no/wrong secret 401.
