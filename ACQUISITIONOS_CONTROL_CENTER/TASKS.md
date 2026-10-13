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
