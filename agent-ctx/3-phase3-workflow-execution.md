# Phase 3 — Workflow Execution (Fix + Verification)

**Date:** 2026-10-19
**Starting HEAD:** `41ea7a02daef1995c4f1174abff9875d767a213c` (Lead Discovery checkpoint)
**Scope:** Workflow execution lifecycle ONLY (normal + Autopilot). No auth, README, Lead Discovery, billing, or profile changes.

## Problem

Reported: "Workflow creation succeeds, but running/executing the workflow fails" — for BOTH normal workflow execution and Autopilot execution.

## Investigation & Root Causes

### Baseline
- Expected HEAD `935c01e02` does **not exist** in this workspace (`git cat-file` → invalid object). Actual HEAD: `41ea7a02d` (the Lead Discovery checkpoint — which Phase 3 itself declares part of current history). Per user directive ("Continue only from that exact current HEAD"), work proceeded from `41ea7a02d` with zero resets/rollbacks/checkouts.
- The reported `session_failed / session init failed` JSON was the IM gateway/sandbox session failure of the prior conversation (chat_id matches this session), not an in-repo application error. Resolved by sandbox recovery.

### Traced lifecycle
`Create (POST /api/workflows) → Run (POST /api/workflows/[id]/execute → workflow-engine.runSteps → processStep → workflow-actions.executeAction) → WorkflowExecution + WorkflowLog rows → status transitions → UI (Workflows tab / notifications / Executions tab)` and separately `Autopilot (POST /api/autopilot → activate → run: manual route /api/autopilot/[id]/run or 5-min in-process scheduler heartbeat → runner → startDiscoveryJob → poll → AutopilotLead ledger → workflow-executor.executeWorkflow)`.

### Root cause 1 — normal runs fail at move_to_stage when the lead is already in the stage
`src/lib/pipeline-service.ts` `moveLeadToStage()` returned `success: false, error: 'Lead is already in this stage'` when `lead.stage === newStage`. Every template/AI workflow begins with a stage-move step, so any re-run (or run against an already-moved lead) failed the whole execution with a user-facing "Workflow execution failed" notification.
**Reproduced live through the real UI** (browser → Workflows tab → Run → lead picker): execution `cmvfqh4kx0001m2qk1n62ojig` failed, error `"Lead is already in this stage"`, step 0/2.

### Root cause 2 — send_email steps are structurally un-runnable (no recipient anywhere)
`executeSendEmail` hard-required `config.to`, but NO creation path ever sets it: the builder UI exposes only Subject/Body for email steps (`workflows-tab.tsx`), code templates ship `{actionType:'send_email', subject, body}` (`workflow-templates.ts`), and the AI generator's prompt never asks for a recipient. Any workflow containing an email step — the majority of templates — always failed with `"Email requires to, subject, and body"`. `executeCreateGmailDraft` had the same defect.

### Root cause 3 — add_tag/update_tags steps crash with ReferenceError in the normal engine
`executeUpdateTags` referenced an **undefined bare identifier** `action` (`const tagAction = action || 'add'`) — `TS2304` confirmed, no declaration anywhere. At runtime this throws `ReferenceError: action is not defined`, failing every tag step in the normal execution route. (Autopilot runs were unaffected: its engine, workflow-executor.ts, implements add_tag natively — which is why autopilot executions' output shape `{leadId,tags,added}` differs from the canonical `{previousTags,newTags,action}`.)

### Autopilot at HEAD — verified WORKING (failures were environmental/historical)
- Oct 14 failures (`"No tags specified"`): already fixed at HEAD by commit `9103f62d2` (`config.tags ?? config.tag`).
- Oct 19 stuck run (`"Recovered by scheduler: run stuck in RUNNING for over 60 minutes"`): the prior session restarted the dev server mid-run, killing in-flight async work (discovery job `cmvejeu7d003op1avofespult` stuck `running` with zero updates). The 60-min recovery then honestly marked it FAILED. Forensics: run started 00:48:57, 4 Dental executions completed 00:49:45–50, Hospital job created 00:49:54 and never progressed; the poll's own 15-min timeout never fired → the promise died with the process.
- Live E2E at HEAD (pre-fix): manual run COMPLETED — 20 discovered/saved/processed, 20/20 executions completed, ledger EXEC_QUEUED×20, nextRunAt scheduled; scheduler heartbeat also fired and completed a run.

## Minimal Fix (2 files, +70/−11 source lines)

1. **`src/lib/pipeline-service.ts`** — `moveLeadToStage`: already-in-stage is now an idempotent success (no-op, no activity/audit writes since nothing changed). Real stage changes behave exactly as before. All callers audited (reply-handler ignores result; `/api/leads/[id]/move-stage` now returns success for same-stage no-ops; crm-sync semantics improve).
2. **`src/lib/workflow-actions.ts`** —
   - `executeSendEmail` / `executeCreateGmailDraft`: recipient resolution — resolve `to` through templates first; when absent or still an unresolved `{{...}}` placeholder, fall back to the executed lead's email (owner-scoped via `resolveLeadForExecution`); honest failure only when neither exists. Explicit `to` always wins.
   - `executeUpdateTags`: `action` → `String(config.action || 'add')`.

No engine rewrite, no architecture change, no template/UI/auth files touched.

## Verification (all through the REAL API/UI path)

| Test | Before | After |
|---|---|---|
| UI Run → "Read and Brew" (move_to_stage + add_tag) | FAILED "Lead is already in this stage" (20:55) | **COMPLETED 2/2** (21:03:48, browser-run, "Workflow completed" notification) |
| send_email step with no `to` (template/AI shape), approval-gated | FAILED "Email requires to, subject, and body" | **COMPLETED 1/1**, draft + approval notification, recipient resolved to lead email `qa-phase3@example.com` |
| send_email with no lead email available | — | honest failure surfaced (no fabrication) |
| Autopilot manual E2E v1 (bookstores/Pune) | — | **COMPLETED**: 20/20/20, 20/20 executions completed |
| Autopilot manual E2E v2 post-fix (stationery shops/Pune) | — | **COMPLETED**: 20 discovered, 19 saved, **19/19 executions completed** (native + canonical-delegated steps), 0 stuck |
| Stuck executions anywhere after all runs | 0 | 0 |

Status transitions observed: `running → completed` (normal), `QUEUED → RUNNING → COMPLETED` (autopilot runs), autopilot `ACTIVE → RUNNING → ACTIVE`, failures surfaced honestly with correct error strings in WorkflowExecution.error + step logs + notifications.

## DB Safety (before → after)

users 43→43, subscriptions 40→40, other users' credits unchanged (2000/750/549/150/50×…), pre-existing 4 workflows intact. Disposable QA additions for `testfix@test.local` only: +3 QA workflows, +40 leads (20 bookstores + 19 stationery + 1 QA lead), +1 QA autopilot (+1 existing), executions/logs/notifications/ledger rows from those runs. Credit ledger exact: 477→426 (−45 discovery imports, −6 workflow_action charges; approval-gated send charged 0 — by design). No resets/truncations/deletes. Never touched: README, .env (its pre-existing working-tree modification predates this session), auth files, Lead Discovery source, billing.

## Tests

- NEW `src/__tests__/lib/workflow-execution-fixes.test.ts`: **12/12 PASS** (idempotency ×3, recipient resolution ×6, tag-action regression ×3).
- Workflow/autopilot suites: `tests/unit/{workflows,workflow-schedule-timezone,autopilot,autopilot-runner,lead-patch-add-to-pipeline}` **107/107 PASS**; `tests/integration/{workflows-integration,workflow-ai-generate-entitlement}` + `tests/e2e/workflow-flow` **38/38 PASS**.
- Adjacent: discovery-volume-persistence (Lead Discovery >20 regression) + credit-costs + credit-service **66/66 PASS**; persistence/support **36/36**; load **57/57**; components **3/3**.
- Full chunked suite: 44 failures, ALL pre-existing in the 8 files documented by Phase 2 (auth-routes, health-credits, email, subscription-store, jwt-security, onboarding-flow, auth-api, api-key-service — the last re-verified failing identically with changes stashed). Zero new failures.
- Scoped tsc (lib): my files clean; the old `TS2304 action` error is gone; pre-existing errors elsewhere unchanged.

## Verdict

- NORMAL WORKFLOW: **PASS**
- AUTOPILOT: **PASS**
- NO UNRELATED REGRESSION: **PASS** (incl. Lead Discovery >20 behavior intact)
