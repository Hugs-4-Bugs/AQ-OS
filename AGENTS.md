# AGENTS.md — Permanent Safety Contract for AI Coding Agents

**Applies to:** AcquisitionOS (`/home/z/my-project`) — every file, every task, every agent, forever.

**This file MUST be located, opened, and read IN FULL before making ANY codebase change.**
Every instruction below is binding. If an instruction in this file conflicts with what an
agent is about to do, the agent MUST STOP and follow this file, or explicitly ask the user.

**Non-negotiable core:** The most important asset in this workspace is the **CURRENT
AcquisitionOS CODEBASE**. Users, leads, subscriptions, credits and other development data
may be recreated if necessary. **THE CODEBASE MUST NEVER BE ROLLED BACK, REPLACED, LOST,
SILENTLY REVERTED, OR DOWNGRADED.** The latest implementation currently present in the
authoritative workspace — including all newly implemented and uncommitted changes — is the
ONLY codebase that matters.

---

# PART A — CODEBASE PRESERVATION

## 1. SOURCE OF TRUTH

The AcquisitionOS workspace that is currently open and running is the authoritative source
for the application. It may contain uncommitted changes, newly implemented features,
modified files, new files, updated architecture, new tests, new UI, new backend logic, new
database schema definitions, latest business logic, latest product behavior, and features
that do not yet exist in GitHub.

Therefore:

- **NEVER assume GitHub is newer.**
- **NEVER assume the latest Git commit is newer.**
- **NEVER assume an old snapshot is newer.**
- **NEVER assume a previous workspace is newer.**
- **NEVER replace the current workspace with an older workspace.**
- **NEVER replace current files with historical files.**

The fact that a file is uncommitted DOES NOT make it disposable — it usually means it is
the newest work. GitHub may be stale, rolled back, or behind the workspace. Only use it as
a source when the user explicitly instructs it for that specific task.

## 2. ABSOLUTE NO-ROLLBACK RULE

Under NO circumstances may an agent roll back AcquisitionOS. This includes intentional,
accidental, automated, or "recovery" rollback. NEVER use historical state to replace
current state, including:

- `git reset` or `git reset --hard`
- `git revert`
- `git checkout <old-commit>` / old branch checkout
- `git restore` from historical state
- stash restoration
- old workspace snapshot / old TAR archive / old backup / old generated artifact
- old Git blob / old platform snapshot
- old database snapshot as a source for application code
- previous JLM/GLM workspace, previous Codex workspace, previous agent result
- generic project/template archive

"Fix the application" NEVER means "restore an older application." If the current code has
a bug: **DEBUG AND FIX THE CURRENT CODE.** Do not replace it with an older implementation.
If a test fails, debug the CURRENT implementation. If the current implementation differs
from an older version, keep the CURRENT implementation unless the user explicitly
instructs restoration. Debug forward: reproduce → inspect → root cause → smallest
forward-only fix → test → verify. If an older version appears useful for any reason,
**STOP and ask the user** before using it.

## 3. SANDBOX RESTART IS NOT PERMISSION TO ROLLBACK

The sandbox may restart, stop, kill processes, recreate containers, rematerialize the
workspace, lose uncommitted files, recreate the filesystem, restart the application, or
restart the database. NONE of these events gives permission to roll back the codebase.

- Sandbox restart **1 time** → current code must remain current.
- Sandbox restart **100 times** → current code must remain current.
- Sandbox restart **1,000 times** → current code must remain current.

A sandbox restart is an infrastructure event. It is NOT authorization to choose an older
application version.

## 4. CRITICAL RESET DETECTION RULE

After ANY workspace restart, sandbox restart, workspace rehydration, environment
recreation, server restart, restore event, or initialization event — DO NOT immediately
start coding.

First determine: **"Is this workspace actually the latest AcquisitionOS codebase?"**

Inspect and compare: file tree, source files, feature-specific files, tests, configuration,
package files, Prisma schema, documentation, `ACQUISITIONOS_CURRENT_STATE.md`,
`ACQUISITIONOS_CODEBASE_MANIFEST.json`, known latest implementation markers, and current
workspace artifacts.

If the workspace is older than the last known current state:

# STOP.

- Do NOT continue development.
- Do NOT tell the user the old workspace is current.
- Do NOT silently accept the rollback.
- Do NOT replace it with another old snapshot.
- Do NOT reconstruct missing features from memory.

Report exactly:

> "The current workspace appears to be an older/rolled-back AcquisitionOS state. I will
> not continue development or overwrite it. The latest codebase state must be
> identified/recovered first."

## 5. LATEST CODEBASE CHECKPOINT — `ACQUISITIONOS_CURRENT_STATE.md`

Maintain a root-level `ACQUISITIONOS_CURRENT_STATE.md` describing the latest known
codebase state, including: current implementation state, current feature set, important
architecture decisions, important new files, important modified files, test status,
implementation milestone, timestamp, current workspace fingerprint/checksum where
practical, latest verified features, and an explicit statement that this represents the
latest known codebase.

This document is ONLY a verification manifest. It is NOT permission to recreate missing
code by guessing. Never use it as a substitute for actual source code.

## 6. CODEBASE INTEGRITY MANIFEST — `ACQUISITIONOS_CODEBASE_MANIFEST.json`

Maintain, where practical, a root-level `ACQUISITIONOS_CODEBASE_MANIFEST.json` recording:
important application files, important untracked application files, SHA256 hashes where
practical, implementation milestone, generated timestamp, latest verified state, and
critical feature markers.

Purpose: detect `CURRENT CODE != OLD CODE` before an agent accidentally continues from a
stale workspace.

## 7. NEVER DELETE CURRENT UNCOMMITTED WORK

Before ANY change, inspect: `git status`, current branch, current commit, this `AGENTS.md`,
`ACQUISITIONOS_CURRENT_STATE.md` (if present), `ACQUISITIONOS_CODEBASE_MANIFEST.json`
(if present).

If uncommitted changes exist: **PRESERVE THEM.** Never clean, reset, restore over, discard,
overwrite, or assume they are temporary.

## 8. AGENTS.md IS MANDATORY

Before EVERY future coding task:

1. Locate root `AGENTS.md` (this file).
2. Open the COMPLETE file.
3. Read it.
4. Follow every rule.
5. Only then inspect or modify code.

Never skip this step. If `AGENTS.md` is missing after a workspace restart: **STOP.** Do
NOT silently create a guessed replacement and continue. First determine whether the
workspace itself has been rolled back (see §4 and §38).

---

# PART B — PROTECTED FEATURES

## 9. PROTECTED FEATURE CATALOG

The features in §10–§16 are explicitly part of the latest AcquisitionOS product and MUST
NOT disappear during coding, refactoring, debugging, workspace restart, recovery, sandbox
rehydration, deployment, or testing. They are protected functionality.

## 10. LEAD DISCOVERY — PROTECTED FEATURE SET

Lead Discovery must preserve the latest implemented functionality, including where already
implemented: lead discovery, search, AI search, research, enrichment, business context,
campaign context, discovery job state, idempotency, duplicate-request protection, credit
safety, resume-on-navigation/remount, retry protection, lead persistence, lead-user
association, profile/context-aware discovery, existing discovery UI, existing discovery
backend, existing discovery workflow.

Do NOT replace the current Lead Discovery implementation with an older implementation.

## 11. USER PREFERENCE / PERSONAL BUSINESS CONTEXT — DISTINCT FEATURE

AcquisitionOS contains (or is intended to contain) a separate user-context/preference
capability where the user provides information about themselves — what they do, interests,
services, expertise, business context, objectives, preferences, target audience,
positioning, communication context — used when generating workflow instructions,
AI-generated workflows, outreach messages, personalization, AI analysis, recommendations,
acquisition strategy, and other AI-generated business/client-acquisition content.

### IMPORTANT DISTINCTION

This user preference/context feature is **NOT the same as the Business Profile
entity/system** (§13). Do NOT merge them. Do NOT replace one with the other. Do NOT assume
that having Business Profiles in Settings means this separate user-preference/context
feature is preserved.

If it already exists anywhere in the current workspace: **PRESERVE THE EXISTING
IMPLEMENTATION** — do not rebuild it, do not create a second implementation, do not
simplify it, do not replace it with Business Profiles.

## 12. DISCOVER PAGE — CONTEXT / CAMPAIGN SELECTOR FEATURE

The latest Lead Discovery page contains (or is intended to contain) a
context/campaign/business-selection capability where discovery can use a selected
context/campaign/business configuration, including selector/override behavior. It is
DISTINCT from the general Business Profile page.

It must preserve: the selector, its current UI behavior, the current selected/default
context, campaign override behavior where implemented, context association with discovery,
persistence, backend handling, discovery integration, existing `None`/no-override behavior,
current entitlement behavior, and current credit/idempotency behavior.

- Do NOT assume this feature is merely the Business Profile selector.
- Do NOT replace it with the Settings Business Profile UI.
- Do NOT remove it because discovery can technically work without it.
- If it exists in the current workspace: **DO NOT IMPLEMENT IT AGAIN** — locate the exact
  existing implementation and preserve it as-is.
- **If it is missing: STOP.** Do NOT recreate it from memory. Do NOT use an old Git
  commit, old workspace, old TAR, or old snapshot. Report that the feature is missing from
  the current workspace.

## 13. USER BUSINESS PROFILE

Business Profiles are a protected AcquisitionOS capability. Preserve the latest
implementation for: multiple business profiles where implemented, business information,
niche, services, target market, goals, business context, profile selection, profile
association, profile-aware discovery, profile-aware research, profile-aware AI analysis,
profile-aware outreach, profile-aware workflows.

Business Profiles and User Preferences/Context (§11) are separate concepts. Do NOT collapse
them into one system.

## 14. WORKFLOW AUTOMATION — PRO + ELITE

AcquisitionOS must preserve the intended autonomous workflow capability. For **Pro and
Elite**, the system must support the latest implemented automated workflow functionality —
conceptually: *"Every day at 8:00 AM, find XYZ leads in this niche and do everything
according to my instructions."*

Preserve the pipeline where implemented:

```text
Trigger
  ↓
Discover Leads
  ↓
Research / Enrich
  ↓
AI Analysis
  ↓
Identify Gaps / Opportunities
  ↓
Prepare Personalized Outreach
  ↓
Approval where required by configuration
  ↓
Send Outreach
  ↓
Monitor Replies
  ↓
Follow Up
  ↓
Qualify
  ↓
Schedule Meeting
  ↓
Update Pipeline
  ↓
Continue / Stop
```

Preserve: scheduling, triggers, actions, conditions, branching, retries, execution state,
execution history, approval state, next-step visibility, error state, timestamps, workflow
persistence, automation entitlements.

Do NOT downgrade Pro/Elite automation to manual-only behavior. Do NOT replace it with an
older workflow implementation.

## 15. PRO + ELITE AI WORKFLOW CREATION

Current intended entitlement:

- **Pro → AI workflow creation allowed**
- **Elite → AI workflow creation allowed**
- Free/Starter → restricted according to the existing entitlement design

Use the existing entitlement system (`src/lib/entitlement-service.ts`, feature key
`workflow_access`). Do NOT reintroduce an Elite-only hardcoded restriction. Do NOT create
duplicate entitlement logic. **Backend authorization remains the source of truth.**

## 16. PHONE PROFILE IMPLEMENTATION

Preserve the latest phone implementation:

- country-code dropdown with comprehensive country calling codes
- local number separated from country code
- maximum 10 local digits (country code does NOT count toward the limit)
- digits-only local number
- server-side validation AND client-side validation
- legacy value handling (existing stored numbers must keep working)
- no duplicate country code (typing/pasting `+91`/`+1` into the local field is rejected)

Do NOT replace it with the old free-form phone field.

---

# PART C — OPERATIONAL SAFETY

## 17. GIT SAFETY

Before substantial changes: inspect `git status`, the current branch, the current commit
(`git rev-parse HEAD`), and understand what is uncommitted before touching anything.

Rules: never destroy uncommitted user work; do not rewrite Git history unless explicitly
requested; do not force-push; do not reset the repository to make tests pass; do not commit
secrets (§28).

## 18. CHANGE SCOPE

For every request: identify exactly what the user asked for — nothing more. Modify only
relevant files. Do not refactor unrelated code, redesign unrelated UI, change architecture
unnecessarily, "clean up" unrelated code, upgrade dependencies unless explicitly required,
rename unrelated components/files, or change database models unnecessarily. One requested
feature must never become an excuse for broad application changes.

## 19. INSPECT BEFORE MODIFYING

Before editing anything: inspect the existing architecture, the relevant components, the
relevant services/API routes, the database models involved, the existing entitlement logic
(`src/lib/entitlement-service.ts`, `src/lib/plan-gates.ts`), and the existing tests.
Identify existing reusable utilities/components (e.g., `src/components/ui/*`,
`src/lib/*`). Understand the data flow end to end. Prefer extending the existing
architecture over creating duplicate systems.

## 20. DATABASE SAFETY

Before any schema/database change:

1. Inspect the current schema (`prisma/schema.prisma`).
2. Inspect the current database state (read-only queries are allowed and encouraged).
3. Determine whether the change is additive or destructive.
4. Preserve existing records.
5. Create/verify a backup when appropriate (see `scripts/backup/`).
6. Use forward-only, additive migrations whenever possible.
7. Never reset the database to solve schema drift — diagnose the drift instead.
8. Verify migration impact before applying it.

Never claim data is safe without verification. Show evidence.

Never use database reset as a solution to code problems. Never execute without explicit
user authorization: `prisma migrate reset`, `prisma db push --force-reset`,
`prisma db push --accept-data-loss`, destructive migrations, `DROP`, `TRUNCATE`, mass
`DELETE`, destructive seed, or database recreation of any kind. Database problems must be
diagnosed separately from codebase integrity.

## 21. NEVER DESTROY USER DATA

Never delete, reset, truncate, recreate, or overwrite the production/application database
(`db/custom.db` and any DB the application uses). Never execute destructive database
operations merely to make tests pass. Do not modify real user data during testing — tests
must use mocks, fixtures, or dedicated test doubles, never mutate live records.

## 22. USER DATA PRIORITY

For this development environment: **CODEBASE PRESERVATION > USER DATA PRESERVATION.**

If the sandbox loses users, leads, subscriptions, test accounts, sessions, or database
state, do NOT sacrifice the latest codebase to recover old data. The user explicitly
accepts recreating development/test user data if necessary. However, do NOT intentionally
delete data and do NOT reset the database without explicit authorization.

## 23. BILLING / CREDIT INTEGRITY

One logical billable operation = one billing event. Any operation that consumes credits
must be protected against duplicate clicks, retries, refresh, component remount,
navigation, race conditions, and duplicate API requests. Never reset credits merely to test
functionality. Never consume real paid AI credits unnecessarily. Never redesign the billing
system just to fix an unrelated bug.

## 24. AUTHORIZATION / ENTITLEMENTS

Plan restrictions must be enforced consistently:

- **Frontend gates are UX. Backend authorization is the source of truth.**
- Never bypass backend authorization to make a UI feature appear available.
- UI and backend must read from the SAME entitlement definition — reuse
  `src/lib/entitlement-service.ts` (server) and `useSubscriptionStore.hasFeatureAccess()`
  (client, backed by authoritative backend entitlements).
- Do not create duplicate plan logic or a second permission system.
- Do not hardcode plan names in feature checks when a feature key exists (e.g., prefer
  `hasFeatureAccess(plan, 'workflow_access')` over `plan === 'elite'`).

## 25. DATA INTEGRITY

Never silently change: user IDs, subscriptions, credits, payment history, ledger records,
leads, outreach history, workflow history, business profiles, authentication records. When
changing data models, preserve existing relationships and records. Prefer additive,
nullable, backward-compatible changes.

## 26. API SAFETY

Before changing an API: inspect existing consumers (frontend callers, services, external
integrations), the frontend callers of the route, and the backend route and its middleware.
Preserve backward compatibility where possible. Avoid breaking existing contracts (request/
response shapes, status codes). Test both success and failure cases.

## 27. UI SAFETY

- Do not fix visual problems using arbitrary z-index or CSS hacks without understanding the
  layout hierarchy.
- Preserve: responsive behavior (mobile/tablet/desktop), accessibility (labels, keyboard
  navigation, ARIA), the existing design system (shadcn/ui components in
  `src/components/ui`, existing color tokens, spacing conventions), loading states, error
  states, empty states.
- Reuse existing primitives (e.g., `Select`, `Input`, `Button`) instead of introducing new
  UI libraries.

## 28. ENVIRONMENT SAFETY

Never expose secrets. Never print API keys/passwords/tokens in logs, responses, or chat.
Never replace `.env` with an old environment file. Never commit secrets (`.env`,
credentials, tokens, private keys). Do not change production credentials during
development.

## 29. DEPLOYMENT SAFETY

Before deployment-related changes: inspect the existing deployment architecture
(`Dockerfile*`, `deploy/`, `docker-compose*`), the production database configuration, and
the environment variables referenced by the change. Verify whether a command is destructive
BEFORE running it. Never execute destructive production commands without explicit
authorization.

---

# PART D — TESTING & REAL-WORLD SAFETY

## 30. TESTING RULES

For every feature change:

1. Inspect existing tests.
2. Add/update appropriate tests.
3. Run unit tests.
4. Run integration tests.
5. Run E2E tests when safe.
6. Inspect final diff.
7. Verify no unrelated functionality changed.

Use the appropriate testing level: unit tests for isolated logic (`src/__tests__/lib/`,
`tests/unit/`); integration tests for API/database behavior (`tests/integration/` — Prisma
is mocked there; follow that pattern, never hit the real DB from tests); component tests
for UI behavior; E2E/browser tests for complete user flows.

Rules:

- Do not claim a feature is verified unless the relevant test actually ran successfully.
- Do not hide failing tests.
- Do not delete tests to make them pass; do not weaken assertions.
- Do not change expected behavior in tests unless the requested product behavior genuinely
  changed.
- Run the relevant scoped tests for the files you changed (`bun run test` or a targeted
  `vitest run <files>` invocation).

## 31. REAL-WORLD ACTION SAFETY

During testing, never: send real outreach, send real emails, contact real leads, make real
payments, issue real refunds, or consume paid AI credits unnecessarily. Use mocks/test data
wherever possible. Prefer mocks/stubs/test accounts/test providers.

---

# PART E — DEBUGGING & CLEANUP

## 32. DEBUGGING RULE

If something breaks, do NOT rollback. Follow:

```text
Reproduce
↓
Inspect (logs, dev.log, server output)
↓
Identify root cause
↓
Patch CURRENT implementation (smallest forward-only fix)
↓
Test
↓
Review diff
↓
Verify unrelated functionality still works
```

A bug is fixed by changing the current implementation, not by returning to an older
version.

## 33. NO SILENT CLEANUP

Never delete files because they appear untracked, unfamiliar, temporary, unused, generated,
or old-looking. First determine whether they belong to the latest implementation.

## 34. NO TEMPLATE REPLACEMENT

Never run an initialization process that: downloads a generic template, extracts a generic
TAR, overwrites `/home/z/my-project`, replaces the current application, or reinitializes
AcquisitionOS. AcquisitionOS is an existing application.

---

# PART F — VERIFICATION PROTOCOLS

## 35. VERIFY CURRENT IMPLEMENTATION BEFORE ANY NEW WORK

Before implementing ANY new request, verify that the current workspace still contains:

- **Lead Discovery** — latest discovery implementation, latest discovery context/campaign
  selector, latest idempotency implementation, latest credit protections.
- **User Context** — separate user preference/context feature, user interests, what the
  user does, business/service context, AI personalization context.
- **Business Profiles** — Business Profile system, profile selection, profile-aware
  features.
- **Workflows** — Pro AI workflow creation, Elite AI workflow creation, autonomous
  workflow execution, scheduling, conditions, branching, approvals, execution state.
- **Profile** — country-code dropdown, 10-digit local phone validation.
- **Tests** — latest tests associated with these implementations.

## 36. "FEATURE EXISTS SOMEWHERE" RULE

A claim like *"the implementation codebase still exists in my workspace"* is NOT
sufficient. If an agent claims an implementation exists, it MUST identify the exact files
and inspect them:

```text
Feature
→ exact source file(s)
→ exact component/service/API
→ exact tests
→ exact implementation state
```

Do not make vague claims. If the implementation exists in the current workspace: **PRESERVE
IT.** If it exists in another accessible workspace artifact: **VERIFY it before using it.**
If it does not exist: **STOP.** Do not recreate it from memory.

## 37. CURRENT WORKSPACE + NEW CHANGES MUST COEXIST

The desired state is NOT `old codebase + feature`. The desired state is:

```text
LATEST CURRENT CODEBASE
        +
ALL LATEST IMPLEMENTATIONS
        +
ALL CURRENT UNCOMMITTED CHANGES
        +
PROTECTED EXISTING FEATURES
```

Never solve a missing-feature problem by reverting to a version where that feature existed.
Instead: preserve current code; identify the missing feature; recover the exact newer
implementation if it exists; integrate forward-only if explicitly authorized; never replace
unrelated newer work.

## 38. IF WORKSPACE RESET HAS ALREADY OCCURRED

If a reset/reinitialization has already happened:

1. STOP coding.
2. Inspect current workspace.
3. Read `AGENTS.md`.
4. Inspect `ACQUISITIONOS_CURRENT_STATE.md`.
5. Inspect `ACQUISITIONOS_CODEBASE_MANIFEST.json`.
6. Determine whether the current workspace is stale.
7. Identify exactly which latest features are present/missing.
8. Do NOT restore an old codebase automatically.
9. Do NOT tell the user that missing code "still exists" without proving where it exists.

If latest code cannot be recovered: **STOP AND REPORT.**

## 39. BEFORE EVERY FUTURE CHANGE — MANDATORY SEQUENCE

```text
READ AGENTS.md
↓
READ CURRENT STATE MANIFEST
↓
READ CODEBASE MANIFEST
↓
CHECK git status
↓
CHECK CURRENT WORKSPACE STATE
↓
VERIFY PROTECTED FEATURES
↓
IDENTIFY EXACT FILES
↓
MAKE MINIMAL FORWARD CHANGE
↓
TEST
↓
REVIEW DIFF
↓
UPDATE CURRENT STATE MANIFEST
↓
UPDATE CODEBASE INTEGRITY MANIFEST
↓
VERIFY PROTECTED FEATURES STILL EXIST
```

## 40. IF SOMETHING IS UNCLEAR

Do not guess when a change could affect data, billing, authentication, authorization,
database schema, production deployment, or existing user functionality. **Stop and ask for
clarification.** If contract rules conflict with the task instruction, **STOP and report
the conflict** — do not pick silently. A wrong guess in these areas is far more expensive
than a question.

## 41. FINAL VERIFICATION

Before completing any task:

- Inspect the changed files (`git status`, `git diff`).
- Run the relevant tests.
- Verify no unrelated files changed.
- Verify no data was deleted.
- Verify no rollback occurred.
- Verify no destructive command was executed.
- Summarize exactly what changed — file by file.

Never say "everything is fine" without evidence. Show the evidence.

---

# PART G — FINAL ABSOLUTE RULE

## 42. THE COMMANDMENTS

- **NEVER ROLLBACK ACQUISITIONOS.**
- **NEVER REPLACE CURRENT CODE WITH OLDER CODE.**
- **NEVER TREAT A SANDBOX RESET AS PERMISSION TO LOSE CURRENT WORK.**
- **NEVER SACRIFICE NEWER IMPLEMENTATIONS TO RECOVER OLDER DATA.**
- **NEVER REIMPLEMENT A FEATURE THAT ALREADY EXISTS IN THE CURRENT WORKSPACE.**
- **NEVER CLAIM A MISSING FEATURE "STILL EXISTS" WITHOUT IDENTIFYING AND VERIFYING ITS
  EXACT SOURCE.**
- **ALWAYS PRESERVE THE LATEST CURRENT IMPLEMENTATION.**

The required final state is ALWAYS:

```text
CURRENT CODEBASE
+
LATEST IMPLEMENTATIONS
+
LATEST UNCOMMITTED CHANGES
+
PROTECTED LEAD DISCOVERY
+
PROTECTED USER PREFERENCE/CONTEXT
+
PROTECTED BUSINESS PROFILES
+
PROTECTED DISCOVER CONTEXT/CAMPAIGN SELECTOR
+
PROTECTED PRO/ELITE AUTOMATION
+
PROTECTED PHONE IMPLEMENTATION
+
ALL VERIFIED TESTS
```

### FINAL COMMANDMENT

**CURRENT CODE + LATEST CHANGES = THE ONLY CODEBASE THAT MATTERS.**

**NO ROLLBACK. NO SILENT RESTORE. NO OLD SNAPSHOT. NO OLD GITHUB VERSION. NO OLD TAR.**

**NO "RECOVERY" BY REPLACING THE CURRENT WORKSPACE.**

**IF THE CURRENT CODEBASE IS MISSING, STOP — DO NOT GUESS.**
