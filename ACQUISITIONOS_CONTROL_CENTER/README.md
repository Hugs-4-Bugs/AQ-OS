# AcquisitionOS — CONTROL CENTER Master Instructions

This folder is the **single control system** for all development on AcquisitionOS.
It governs every implementation, modification, deletion, migration, refactor, file
creation, or architectural change — no exceptions.

## How the Control Documents Are Used

| Document | Responsibility |
|---|---|
| `ARCHITECTURE.md` | Current architecture, boundaries, dependencies, data flow, approved future architecture |
| `DESIGN.md` | UI/UX, responsive behavior, design rules, interface requirements, truthful state design |
| `FUTUREIMPLEMENTATION.md` | Long-term roadmap, scaling, intelligence, agents, MCP, integrations — **not** a license to rewrite |
| `MEMORY.md` | Existing decisions, known problems, previous fixes, project context that must not be forgotten |
| `PRODUCTION.md` | Production safety, deployment, reliability, data protection, operational requirements — **highest-priority safety contract** |
| `RULES.md` | Mandatory development rules every coding agent must obey |
| `TASKS.md` | Current implementation tasks, priorities, status, verification requirements |

## Mandatory Pre-Implementation Sequence

Before **every** implementation session, feature, bug fix, refactor, migration,
security change, or architectural change:

```text
STEP 1 — INSPECT
  Read the relevant files in ACQUISITIONOS_CONTROL_CENTER/
  Then inspect the ACTUAL codebase.
  The repository is the source of truth for what currently exists —
  never assume the documentation reflects the implementation.

STEP 2 — COMPARE
  DOCUMENTED REQUIREMENT → CURRENT IMPLEMENTATION →
  ACTUAL RUNTIME BEHAVIOR → GAP → ROOT CAUSE
  Never implement based only on the requested description.

STEP 3 — SHOW THE PLAN BEFORE CODING
  Output: CONTROL FILES READ / FILES THAT WILL BE MODIFIED /
  FILES THAT WILL BE CREATED / FILES THAT WILL NOT BE TOUCHED /
  IMPLEMENTATION FLOW.
  Do not start implementation until this plan has been produced.
```

## Per-Task Discipline

```text
READ CONTROL FILES → INSPECT CODE → CHECK RUNTIME → IDENTIFY IMPACTED FILES
→ SHOW FILE/TREE PLAN → DIAGNOSE ROOT CAUSE → IMPLEMENT MINIMAL SAFE CHANGE
→ RUN TESTS → RUNTIME VERIFY → SECURITY VERIFY → REGRESSION VERIFY
→ UPDATE TASK STATUS → REPORT EVIDENCE
```

## Completion Honesty

Never claim `implemented / fixed / completed / production-ready / secure / working /
tested` without actual evidence. Every task ends with exactly one of:

```text
DONE — verified (evidence cited)
PARTIAL — implemented but not fully verified (say what is unverified)
BLOCKED — BLOCKER / CAUSE / WHAT WAS VERIFIED / WHAT COULD NOT BE VERIFIED / REQUIRED NEXT STEP
NOT DONE
```

A success toast is NOT proof. A database row saying COMPLETED is NOT proof unless the
actual work completed. A function existing is NOT proof it is connected to runtime.

## Non-Negotiables (see PRODUCTION.md for full contract)

1. No rollback / revert / reset of production code; forward-only.
2. No destructive database operations; never delete users, subscriptions, credits,
   payment history, leads, workflows, pipeline, or audit records as a shortcut.
3. No mocks, stubs, static responses, fake provider results, or hardcoded leads in
   production paths.
4. No weakening of auth, entitlement, credits, rate limits, tenant isolation, or
   validation to make a test pass.
5. No unrelated changes while fixing a reported issue; smallest correct change wins.
6. Never invent leads, emails, websites, phone numbers, company facts, or research.
7. Server-side enforcement for plan/entitlement — frontend hiding is not enforcement.

## Maintenance

Whenever a verified architectural, production, security, design, or future-plan
decision changes, update the appropriate control document. Do not silently change the
control system; do not remove historical decisions without verification. Append new
lessons to `MEMORY.md`; append task status to `TASKS.md`.
