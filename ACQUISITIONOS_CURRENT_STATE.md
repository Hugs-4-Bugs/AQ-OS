# ACQUISITIONOS_CURRENT_STATE.md — Latest Known Codebase Checkpoint

> **STATUS: This document represents the LATEST KNOWN state of the AcquisitionOS
> codebase.** Per `AGENTS.md` §5, it is a verification manifest only — it is NOT
> permission to recreate missing code by guessing, and it is never a substitute for
> actual source code. After any workspace restart/sandbox rehydration, compare the
> workspace against this document and `ACQUISITIONOS_CODEBASE_MANIFEST.json` (AGENTS.md
> §4) before doing any work.

| Field | Value |
|---|---|
| Generated (UTC) | 2026-10-04 |
| Workspace path | `/home/z/my-project` |
| Git branch | `main` |
| HEAD at checkpoint | `9895a0056e7997295c6a3842459f8424c52f4519` (platform auto-commit `3fb6a37f-0ed8-404c-902f-206e5f382428`, 2026-10-04 01:15:08 UTC) |
| Prior recorded HEAD | `98aa357c57fa031f6d7f3cb93f21f716293f3806` (superseded — workspace moved FORWARD, not back) |
| Working tree at checkpoint | Clean except `AGENTS.md` extended from 20-section to 42-section contract by current agent session |
| Implementation milestone | Forward-only merge: user personal context + discover context/campaign selector + lead-detail shell-bounded portal fix (all verified by tests) |

## 1. Current Implementation State

- **PART 1A (Pro+Elite AI workflow creation) — IMPLEMENTED & COMMITTED** in HEAD
  `9895a00`. Backend gate `src/app/api/workflows/ai-generate/route.ts` uses
  `hasFeatureAccess(userPlan, 'workflow_access')` (server-side source of truth);
  entitlement table in `src/lib/entitlement-service.ts` grants `workflow_access` to
  **pro** and **elite** (`enabled: true`, unlimited), denies free/starter. UI gate in
  `src/components/dashboard/workflows-tab.tsx` reads the same key via
  `useSubscriptionStore.hasFeatureAccess('workflow_access')`. 5-credit cost with
  refund-on-AI-failure preserved. Manual workflow creation
  (`src/app/api/workflows/route.ts`) checks the same `workflow_access` key.
- **PART 1B (Phone profile) — IMPLEMENTED & COMMITTED** in HEAD `9895a00`.
  `src/lib/phone.ts` (453 lines): 241-entry country calling-code table
  (`COUNTRY_CALLING_CODES`), `MAX_LOCAL_PHONE_DIGITS = 10`, digits-only enforcement,
  pasted-country-code stripping (`filterNationalInput`), longest-prefix dial extraction,
  legacy-value parsing (`parseStoredPhone`) that never throws, shared
  `validateSubmittedPhone` used by BOTH client (`settings-shell.tsx`) and server
  (`src/app/api/settings/profile/route.ts` — round-trip preserved legacy values are
  accepted verbatim; new/edited values must pass full validation).
- **AGENTS.md — CREATED AND EXTENDED**: originally committed at HEAD `9895a00` with 20
  sections; current session extended it forward-only to the complete 42-section / 7-part
  safety contract (codebase preservation, reset detection, manifests, protected feature
  catalog, operational safety, testing, debugging, verification protocols, commandments).
- **Master bug-fix audit work** (22 files, +858/−305, 2 additive DB columns, 30 regression
  tests, 5 E2E) from the previous session is present in earlier commits and intact.

## 2. Current Feature Set (verified by direct file inspection, 2026-10-04)

| Feature | State | Exact implementation anchors |
|---|---|---|
| Lead Discovery (Discover tab) | EXISTS | `src/components/dashboard/discover-tab.tsx` (1529 ln) → POST `/api/leads/discover`, polls `/api/leads/discover/status/[jobId]`; service `src/lib/lead-discovery-service.ts` (1799 ln); intent parse `/api/discovery/parse-intent`; sources `/api/discovery/sources` |
| Discovery credit safety | EXISTS | idempotent `deductCredits({idempotencyKey: \`${jobId}:lead:${imported}\`})` (service ~L549), refund on failed import (~L632), `checkDuplicate` + `mergeFillDuplicate` dedup, max 3 concurrent jobs |
| Discovery resume-on-remount | **NOT IMPLEMENTED** | server job continues server-side; UI does not re-attach on remount (observation, not a defect to silently patch) |
| User preference / personal business context | **WAS NOT FOUND** → merged forward this session (see row below; previous impl unrecoverable from workspace/git/artifacts, rebuilt per explicit PART 18 authorization) | see updated row below |
| Discover context/campaign selector | **WAS NOT FOUND** → merged forward this session (see row below) | see updated row below |
| Business Profiles | PARTIAL | single-user "Offer Profile" (`/api/prospecting/offer-profile` → `UserSettings.servicesOffered`, UI `offer-profile-settings.tsx`); no multi-profile entity. Do NOT collapse with user-context (§13) |
| Workflow automation engine | EXISTS | models `WorkflowDefinition/Step/Execution/Log/Template`; libs `workflow-engine.ts`, `workflow-executor.ts`, `workflow-triggers.ts` (scheduled check L250-283), `workflow-actions.ts`, `workflow-credits.ts`, `workflow-service.ts`, `workflow-templates.ts`; 26 route files under `/api/workflows/*` incl. executions pause/resume/retry/replay/cancel, dead-letter, webhook, trigger |
| AI workflow creation entitlement | EXISTS (Pro+Elite) | `workflow_access` feature key; see §1 above; tests `tests/integration/workflow-ai-generate-entitlement.test.ts` |
| Phone profile | EXISTS | see §1 above; tests `src/__tests__/lib/phone.test.ts` |
| User preference / personal business context (Settings → My Context) | EXISTS (merged forward this session — previous impl unrecoverable, rebuilt per explicit authorization) | `src/lib/personal-context.ts` (shared AI helpers), `src/app/api/settings/personal-context/route.ts` (GET/PUT), `src/components/dashboard/personal-context-settings.tsx` + settings-shell "context" section; AI integration: `src/lib/ai/outreach-generator.ts` (loadSenderProfile + user message), `src/app/api/workflows/ai-generate/route.ts`, `src/app/api/leads/[id]/analyze/route.ts`, `src/lib/prospecting/pipeline-steps.ts` (runStepMatch). Schema: `UserSettings.personalContext` (additive nullable) |
| Discover context/campaign selector | EXISTS (merged forward this session — previous impl unrecoverable, rebuilt per explicit authorization) | Discover tab selector (Both search modes, None/business/campaign options, localStorage persistence `acquisitionos_discovery_context`); server: `/api/leads/discover` body.context (campaign ownership verified, instructions merged into requirements, campaign targeting fills EMPTY fields only); `DiscoveryParams.context` + `DiscoveryJob.contextJson` persisted for explainability |
| Billing/credits | EXISTS | `src/lib/credit-service.ts` with idempotency-key ledger; plan entitlements `src/lib/entitlement-service.ts`; gates `src/lib/plan-gates.ts` (`withFeature` used by export route) |

## 3. Architecture Decisions In Force

- Single entitlement system: `src/lib/entitlement-service.ts` is the server source of
  truth; client mirrors via `useSubscriptionStore.hasFeatureAccess()`. No second
  permission system may be created.
- Next.js 15 App Router (`src/app/`), shadcn/ui primitives (`src/components/ui/`),
  Prisma + SQLite (`db/custom.db` — LIVE; never reset; additive-only schema changes,
  forward-only migrations).
- Tests: vitest, jsdom, fully mocked Prisma (`tests/helpers/mock-db.ts`); integration
  tests never hit the real DB, real credits, real AI, or real outreach.
- Plan naming currently in code: free / starter / pro / elite (files may still contain
  legacy "Free Lite"/"Standard" labels — rename is Task D scope, not yet applied).

## 4. Test Status (latest verified run — evidence recorded 2026-10-04)

PASSED (scoped to all changed/merged code — 13 files, **206/206**):

- `src/__tests__/lib/phone.test.ts` — **25/25**
- `src/__tests__/lib/personal-context.test.ts` — **15/15** (NEW)
- `src/__tests__/components/lead-detail-portal.test.tsx` — **3/3** (NEW — regression:
  dialog must render inside `[data-app-content-region]`, never body-portal)
- `tests/integration/personal-context-route.test.ts` — **10/10** (NEW)
- `tests/integration/discovery-context.test.ts` — **11/11** (NEW — ownership,
  merge, none-passthrough, hard-criteria enforcement on merged text)
- `tests/integration/workflow-ai-generate-entitlement.test.ts` — **5/5**
- `tests/unit/workflows.test.ts` — **38/38** · `tests/integration/workflows-integration.test.ts` — **14/14**
- `tests/unit/discovery-hard-criteria.test.ts`, `discovery-volume-persistence.test.ts`,
  `verification.test.ts` — **56/56** combined
- `tests/unit/outreach-signature.test.ts`, `outreach-prompt-signature.test.ts` — **15/15**

PRE-EXISTING FAILURES (verified UNRELATED to PART 1A/1B — reported, not hidden):

- `src/__tests__/api/health-credits-routes.test.ts` — 8 failures (health structure,
  smtp/google env-dependent fields, admin 503-vs-403)
- `src/__tests__/api/auth-routes.test.ts` — 3 failures (auth-config env-dependent
  fields: smtpConfigured/devMode/structure)

Evidence of unrelatedness: HEAD `9895a00` touched 0 files under `src/app/api/health/`
or `src/app/api/auth/`; the failing tests import only `@/lib/db`, `@/lib/auth`,
`next/server` (none changed by PART 1A/1B); root cause is sandbox environment (missing
SMTP_HOST / GOOGLE_CLIENT_ID). Future agents must re-run scoped tests after changes
(AGENTS.md §30) and update this section.

## 5. Explicit Statement

**This file describes the latest known AcquisitionOS codebase state as of the timestamp
above. The current workspace is expected to match or exceed this state. If the workspace
contains LESS than this state, it is stale/rolled back — STOP and report per AGENTS.md §4
and §38.**

---

## UPDATE 2026-10-04 — Product Requirements Audit + Forward Implementation (latest)

Forward-only implementation on top of the verified codebase (no rollback, no reset; additive schema only).

### Implemented this session
1. **Credit idempotency FIXED (critical)** — `credit-service.ts` wrote ledger rows under the plain action while the pre-check queried `${action}_idempotent_${key}` (dead-code idempotency → double-charge on replay). Now the write uses the composite label; refunds accept an `idempotencyKey` too. Write-path regression tests added (the old tests only mocked the read side).
2. **Discovery resume-on-navigation** — `src/lib/discovery-resume.ts` + mount re-attach in `discover-tab.tsx` (restores the most recent pending/running job from the persisted snapshot WITHOUT re-POSTing); status-poll failure cutoff (5); `recentlyDiscovered` filter fixed (`stage === 'discovered'`).
3. **Assistant durable history** — `src/lib/assistant-conversation-store.ts` (localStorage, capped, defensive) + restore-on-mount + persist-on-change in `assistant-tab.tsx`; regenerate double-fire guard; history popover now loads real persisted conversations (was a dead-end toast).
4. **Business Profiles end-to-end (NEW)** — additive `BusinessProfile` model; `business_profiles` entitlement (free=1, starter=1, pro=3, elite=7 ACTIVE) enforced server-side in POST/PUT; `/api/business-profiles` + `/[id]` CRUD with strict ownership; Settings → Business Profiles UI (create/edit/archive/delete); Discover context selector gains profile options; `POST /api/workflows` accepts an ownership-verified `profileId` (one workflow ↔ one profile).
5. **Workflow scheduling wired (was broken/orphaned)** — `POST /api/cron/workflow-scheduler` (CRON_SECRET) runs `processScheduledTriggers()`; timezone-aware matching (default **Asia/Kolkata**, 08:00) with a 15-minute missed-job catch-up and per-LOCAL-day idempotency; stuck 'running' executions (>60m) and stuck discovery jobs (>2h) recovered as failed; `execute`/`duplicate` routes now enforce `workflow_access`; `requiresApproval` on WorkflowDefinition = send actions park DRAFTS + notify (human approval before send; approval-gated sends are not pre-charged); starter added to WORKFLOW/EXECUTION limits; effective-config snapshot stored on every execution (`triggerData.workflowSnapshot`).
6. **Signup EXACTLY 50** — explicit `credits/creditsMonthly: SIGNUP_REWARD_CREDITS(50)` at signup + `signup_reward` ledger row (auditable, retry-safe); the +25 onboarding bonus future award removed (historical rows untouched); "+25 bonus" badge removed.
7. **Personal context in 4 more AI paths** — workflow `ai_outreach` nodes, autonomous outreach-sender, `/api/leads/[id]/outreach`, `/api/sales-assistant` (proposals + coach/assistant prompts).
8. **Honesty/anti-fabrication** — binding evidence rules added to legacy `lead-analysis` v2, gap-analysis prompts, outreach-generation reply-rate field ("impact cannot be reliably quantified…" path).
9. **Research hardening** — robots.txt compliance in `website-fetch` (per-origin cache; disallowed paths skipped); SSRF-guarded+robots-checked crawling; untrusted website text and inbound email content sanitized before prompts.
10. **Phone validation on lead create** — `/api/leads` POST validates `phone`/`whatsapp` (digits-only ≤10 local digits; formatting tolerated).
11. **Security** — `/api/gmail/send` verifies lead ownership before thread association; sequence AI-generated sends default to DRAFT + notification unless autonomy mode is explicitly 'autonomous'; AI no longer auto-marks leads `closed_lost` (forward-progression only).
12. **batch-research repaired** — rewritten against the real architecture (additive `ResearchJob` model; no phantom `researchJob`/`lead.researchStatus`; 2-arg `startProspectPipeline`; pipeline's own `PIPELINE_CREDIT_COST` used for the gate).

### Schema (additive only)
- `BusinessProfile` model (+User relation, @@index([userId,status]))
- `ResearchJob` model (+User relation)
- `WorkflowDefinition.requiresApproval Boolean @default(false)`, `WorkflowDefinition.profileId String?` (+relation)
- Applied via `prisma db push` — "in sync", no data loss; `prisma generate` OK.

### Tests (this session)
- New: credit write-path regression (3), discovery-resume (11), assistant store (8), business-profiles integration (13), workflow schedule timezone/catch-up (16). Existing suites re-run: workflows 38+14+5+19 pass; personal-context 25 pass; discovery-context 11 pass; phone 25 pass.
- Full suite: 1227 passed / 28 failed — ALL 28 pre-existing (broken harness imports in onboarding e2e, stale subscription-store assertions, env-dependent SMTP/health/auth-config tests, api-key/jwt pre-existing). Previously-failing signup credits test now passes.

### Known limitations (disclosed)
- `src/lib/prospecting/strategy.ts` is a non-compiling orphan (zero importers; its STEP 3b role is implemented inline in pipeline-steps.ts) — needs a removal decision (no silent cleanup per AGENTS.md §33).
- Workflows UI schedule input remains a raw cron string (server defaults to Asia/Kolkata; no UI timezone picker yet).
- Selector choice persists client-side (localStorage); discovery effective context IS persisted server-side on DiscoveryJob.contextJson.
- Two parallel workflow engines remain (engine vs executor) — drift risk documented; not merged (risk control).
- Remote git backup (safety branch `acquisitionos-current-state-2026-10-04` @ f0ee0a2) is armed locally but push blocked by missing GitHub credentials.
