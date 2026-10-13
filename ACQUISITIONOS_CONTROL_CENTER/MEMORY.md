# AcquisitionOS — Project Memory and Historical Lessons

## Product Identity

AcquisitionOS is an **AI-native Client Acquisition Operating System**.

It should evolve beyond “AI CRM” into the intelligence + execution layer for customer acquisition.

North Star:

> Who should I contact, why now, what should I say, what should I do next, and how do I close them?

## Core 12 Stages

Discover
→ Research
→ Find Gaps
→ Opportunity Report
→ Score
→ Personalize
→ Outreach
→ Reply
→ Meeting
→ Pipeline
→ Proposal
→ Close

These stages are the product backbone.

## Current Critical Product Problems

### Lead Discovery

Historical/user-reported issue:

The system could claim that leads had been discovered while actual discovery did not return valid leads according to the user's niche/targeting instructions.

Primary lesson:

Do not trust counters, UI messages, or requested batch size.

Verify:

criteria
→ source
→ actual results
→ filtering
→ persistence
→ Leads UI.

The discovery engine must honor:

- niche;
- target market;
- geography;
- user script/instructions;
- exclusions;
- source selection;
- plan eligibility.

### Workflow Execution

Historical/user-reported issue:

Workflow creation/configuration could work while actual workflow execution did not happen.

Inputs include:

1. My Context
2. Business Profile
3. My Offer

Lesson:

Saved configuration ≠ executed workflow.

Trace:

save
→ activate
→ trigger
→ queue
→ worker
→ provider
→ result
→ status.

## GLM Reliability Lessons

The user has repeatedly encountered AI coding-agent behavior where:

- work was declared complete when it was incomplete;
- only UI was implemented;
- backend was not connected;
- polished placeholder code was created;
- incorrect implementation methods were used;
- tests were claimed without meaningful runtime verification;
- working functionality was broken while fixing another feature;
- counters/statuses claimed success without actual execution;
- broad rewrites introduced regressions.

Therefore:

**Verified truth > polished code.**

If incomplete, say incomplete.

If unverified, say unverified.

If blocked, say blocked.

## Spring Boot Historical Lesson

The backend is business-critical.

Do not treat Spring Boot as a collection of endpoints.

Always trace:

Controller
→ DTO
→ validation
→ auth
→ authorization
→ service
→ transaction
→ repository
→ provider
→ exception mapping
→ response.

For async workflows:

API
→ job record
→ queue
→ worker
→ execution
→ result
→ status.

## Lead Data Quality

Users expect accurate legitimate data.

Never invent:

- emails;
- websites;
- phone numbers;
- company facts;
- business gaps.

Phone-only leads are valid if legitimately sourced.

Preserve source and verification status.

## Outreach

Personalization must be based on real company/prospect context.

Desired:

Research
→ Gap/Trigger
→ Opportunity Context
→ Personalized Message
→ Outreach
→ Reply Analysis.

Not acceptable:

First-name/company merge fields pretending to be research.

## User Profile

Outreach should dynamically use authenticated user profile fields:

- name
- email
- phone
- company
- signature

Never hardcode one user's identity.

## AI

Claude has been used during development and is intended for reasoning-heavy tasks.

Future model direction:

- Claude
- ChatGPT/OpenAI
- Gemini
- other models
- user-provided API keys

AcquisitionOS should remain model-agnostic through an AI gateway/router.

## BYOK

User-provided model keys are part of the product direction.

Keys must be encrypted, server-side only, non-logged, revocable, testable, and usage-trackable.

## MCP

Strategic direction:

AcquisitionOS should expose acquisition intelligence and actions to Claude, ChatGPT, and other assistants through MCP.

AcquisitionOS should remain the underlying data/workflow/execution layer.

AI assistants should be able to invoke meaningful acquisition work, not merely chat beside a CRM.

## Company Brain

Long-term customer context:

- product
- ICP
- personas
- value proposition
- pricing
- case studies
- competitors
- objections
- playbooks
- brand voice
- historical outcomes

This should power personalization, reply handling, proposals, and agents.

## Opportunity Intelligence

Long-term differentiation:

Company
→ signals
→ evidence
→ problems
→ opportunities
→ people
→ conversations
→ deals.

Important distinction:

Fact
vs.
Inference
vs.
Recommendation.

AI should explain important recommendations with evidence.

## Product Philosophy

AcquisitionOS should:

- discover real opportunities;
- understand businesses;
- identify gaps/triggers;
- produce opportunity context;
- score prospects;
- personalize outreach;
- automate repetitive acquisition work;
- analyze replies;
- assist meetings;
- generate proposals;
- track deals;
- learn from outcomes.

The goal is not maximum email volume.

The goal is **qualified opportunities and revenue**.

## Scaling Philosophy

First make:

Correctness
→ reliability
→ observability
→ security

Then optimize:

throughput
→ concurrency
→ batching
→ caching
→ queue capacity
→ provider limits
→ database performance.

Do not scale broken behavior.

## Security/Compliance Memory

Never bypass:

- authentication;
- authorization;
- tenant isolation;
- plan entitlement;
- credits;
- rate limits.

No destructive database debugging.

No real payment/refund tests without authorization.

No secrets in code/logs.

## Known UI Regression Areas

- modal layering/overlap;
- lead search focus loss;
- duplicate Notifications;
- duplicate Credits;
- onboarding form contrast;
- Sales Coach shrinking chat/context;
- raw AI Markdown rendering.

These areas require regression awareness.

## Long-Term Product Vision

The eventual system is:

**Intelligence + Execution + Learning**

not simply:

**CRM + Chatbot.**

The moat should come from:

- opportunity intelligence;
- evidence;
- opportunity graph;
- workflow state;
- company brain;
- outcome feedback;
- model independence;
- agent execution;
- MCP distribution.

---

# Verified Fix Record — P0-DISCOVERY-WORKFLOW-FIX (2026-10-11)

Status: implemented and verified in the same session (unit + live E2E evidence in worklog).

## Lead Discovery — Root Causes That Were Real (fixed)

1. `getFeatureUsage('lead_discovery')` counted ALL leads ever (any source/stage,
   including deleted) against free/starter limits → 429 before any job row.
   Fix: entitlement metric = active leads with a discovery-provider source.
2. ai_search provider failures swallowed per-query → jobs reported "completed" 0/0
   with no reason; extraction LLM failures returned [] indistinguishable from no-match.
   Fix: total search failure → job FAILED with reason; extraction outage → FAILED;
   provider-empty → completed-empty WITH truthful breakdown reason.
3. No pre-flight credit check → jobs imported until balance 0 then silently failed
   every remaining lead. Fix: pre-flight checkCreditSufficiency + mid-job stop with
   truthful reason; per-actionType credit pricing fixed in workflows too.
4. Legacy env mismatch GOOGLE_SEARCH_ENGINE_ID vs provisioned GOOGLE_SEARCH_CX.
   Fix: fallback chain.
5. Orphaned pending/running jobs consumed the 3-slot concurrency cap forever.
   Fix: lazy stale-job reaper (>2h → failed).

## Workflow Execution — Root Causes That Were Real (fixed)

1. DRAFT LIMBO: builder always saved status 'draft'; activation Switch disabled for
   drafts; activateWorkflow() had zero callers → scheduled workflows could never run.
   Fix: drafts activatable via existing PUT; UI Switch enabled.
2. Nothing ever called /api/cron/workflow-scheduler → scheduled workflows never fired.
   Fix: workflow-scheduler-runner.ts shared by cron route AND in-process heartbeat
   from src/instrumentation.ts (5-min interval, day-idempotent, WORKFLOW_SCHEDULER_DISABLED=1 opt-out). No second queue/scheduler invented.
3. Credit deduction keyed on NODE type not actionType + inverted insufficiency check.
4. send_email had no recipient config + no {{lead.*}} template vars → every manual
   email step failed. Fix: recipient resolution (ownership-safe) + {{lead.*}} vars.
5. Business Profile (workflow.profileId) and My Offer never reached execution-time
   AI prompts. Fix: buildBusinessOfferContextBlockForUser (ownership re-verified,
   falls back to UserSettings, never throws) into ai_outreach context.
6. 12 of 16 trigger types had no producers. Fix wired: lead_moved, lead_discovered,
   credits_low (fire-and-forget, dynamic imports). Remaining producers documented as
   non-blocking (gmail/telegram/whatsapp/payment/trial plumbing).

## Verification Evidence (same session, see worklog for details)

- tests/unit/production-fix-regressions.test.ts 11/11 PASS (re-confirmed 2026-10-11).
- Full suite: 1227 passed / 28 failed = exact pre-existing baseline, zero regressions.
- TEST A: MSP/Australia/custom instruction (pro) → 8 found/8 imported, real businesses,
  no fabricated fields, verificationStatus=unverified (honest). A2: SaaS/US → 5/5.
- TEST C: free plan → 429 LEAD_DISCOVERY_LIMIT_REACHED server-side, no job row, no
  credits; workflow → 403 PLAN_REQUIRED.
- TEST D/E/F + scheduler/heartbeat/event-chains: all verified live (details in worklog
  section P0-DISCOVERY-WORKFLOW-FIX).

## Platform Rollback Recurrence (operational lesson, confirmed twice)

The platform can roll the workspace back to an older GitHub main, which undoes BOTH
the restored files AND the runtime prisma client/schema sync. Remedy (non-destructive,
in order): re-restore from GitHub main per restore scripts → `npx prisma generate` →
`npx prisma db push` (additive, zero data loss) → restart dev server → re-run
`tests/unit/production-fix-regressions.test.ts` to confirm fixes are live.

## Repository State Truth (2026-10-11)

- Local main HEAD 7f823db contains ALL P0 fixes; working tree clean.
- GitHub main 7bd083a is OLDER and has diverged from local history (platform
  auto-commits). GitHub is NOT currently ahead — do NOT reset local to remote.
  Forward-only applies.
