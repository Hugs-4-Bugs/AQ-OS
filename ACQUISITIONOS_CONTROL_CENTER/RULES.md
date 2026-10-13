# AcquisitionOS — AI Coding Agent Rules

## Highest Priority

Optimize for **verified truth, not polished output**.

The user has repeatedly encountered AI-generated code that looked complete but was not connected to runtime behavior. This must not happen.

## 1. Diagnose Before Coding

First:

- inspect repository;
- locate entry point;
- trace runtime path;
- inspect frontend/backend contracts;
- inspect database model;
- inspect queue/worker;
- inspect external integrations;
- inspect auth/entitlement;
- reproduce failure;
- inspect tests.

Only then implement.

## 2. Never Fake Completion

Not acceptable:

- placeholder service methods;
- TODO implementations presented as done;
- static sample leads;
- fake provider results;
- mocked production paths;
- hardcoded success;
- UI-only state;
- unused code;
- dead endpoints;
- code paths never called;
- comments describing future behavior as current behavior.

## 3. Runtime Truth

The following do NOT prove completion:

- file exists;
- class exists;
- method exists;
- endpoint exists;
- component renders;
- TypeScript compiles;
- Java compiles;
- UI shows success;
- database row exists.

Actual execution must be verified.

## 4. Spring Boot Specific Rules

Before changing backend code, identify:

- controller;
- request DTO;
- validation;
- authentication;
- authorization;
- service;
- transaction boundary;
- repository;
- entity;
- external client;
- exception handler;
- response DTO;
- async task/worker;
- tests.

Do not:

- expose entities unnecessarily;
- bypass service layers;
- add broad `@Transactional` annotations without understanding transaction boundaries;
- make slow external API calls inside long DB transactions;
- swallow exceptions;
- return fake success;
- duplicate existing services.

Use typed exceptions and consistent HTTP error mapping where the project already has that pattern.

## 5. Lead Discovery Rules

The discovery request must preserve:

- niche;
- geography;
- target market;
- user script/instructions;
- exclusions;
- business characteristics;
- source selection;
- plan/feature eligibility.

The backend must enforce these, not merely the UI.

Acceptance:

Target criteria
→ actual search
→ actual source response
→ filtering
→ verification
→ deduplication
→ persistence
→ Leads UI

Test multiple niches, not only one.

Example:

MSP + Australia + specific instruction.

Then:

SaaS + US + different instruction.

Also test a zero-match query.

## 6. Plan / Entitlement Rules

If a feature is restricted to a plan, enforce it server-side.

Unauthorized:

- must fail clearly;
- must not enqueue work;
- must not consume credits;
- must not partially execute.

Do not hide the failure behind frontend disabling alone.

Use the project's canonical entitlement service/source of truth rather than scattering plan strings throughout code.

## 7. Workflow Execution Rules

Creating/saving a workflow is not execution.

Verify:

configuration
→ persisted values
→ activation
→ trigger
→ queue/scheduler
→ worker
→ provider execution
→ result
→ status

The worker must receive:

- My Context
- Business Profile
- My Offer
- target criteria
- workflow instructions
- user/workspace identity
- plan
- credit context

If the worker never executes, the feature is NOT DONE.

## 8. Async Reliability

Every async job needs observable states.

At minimum, distinguish appropriately between:

PENDING
QUEUED
RUNNING
COMPLETED
FAILED
CANCELLED

Use safe retry behavior.

External side effects must be idempotent.

Do not retry an email send blindly and risk duplicates.

Do not let jobs remain RUNNING forever without timeout/recovery logic where appropriate.

## 9. AI Rules

AI output must distinguish:

Fact
Inference
Recommendation

Do not fabricate research.

Do not claim a company has a gap without evidence or an explicitly labeled inference.

## 10. Outreach Rules

Personalization must use actual available prospect/company context.

Avoid generic first-name/company substitution masquerading as research.

Use authenticated user's profile/signature dynamically.

Missing profile fields must be omitted gracefully.

Respect:

- unsubscribe/suppression;
- duplicate prevention;
- bounce handling;
- provider limits;
- configured sending rules;
- user authorization.

## 11. Data Rules

Never invent missing:

- emails;
- websites;
- phone numbers;
- people;
- company facts.

Preserve source and verification status.

## 12. Security Rules

Never:

- expose secrets;
- bypass auth;
- bypass tenant isolation;
- bypass entitlement;
- log credentials;
- disable security for testing.

## 13. Payment/Credit Rules

No real charges/refunds/subscription changes during testing unless explicitly authorized.

No manual credit mutations to make tests pass.

## 14. Regression Rules

Before modifying shared code, identify existing consumers.

A fix must not silently break:

- auth;
- onboarding;
- billing;
- credits;
- leads;
- pipeline;
- outreach;
- workflows;
- integrations;
- AI;
- dashboard;
- notifications.

## 15. Scope Rules

Do not rewrite unrelated modules.

Do not introduce a new framework because it is fashionable.

Do not replace working infrastructure without evidence.

## 16. Verification Rules

Before DONE:

[ ] Reproduced or otherwise demonstrated the original problem
[ ] Root cause identified
[ ] Correct implementation applied
[ ] Build/typecheck passes
[ ] Relevant unit tests pass
[ ] Integration tests pass where available
[ ] Runtime path verified
[ ] Persistence verified
[ ] Async execution verified
[ ] Authorization verified
[ ] Credits verified
[ ] Regression checked

## 17. Reporting

Use:

DONE — verified
PARTIAL — implemented but not fully verified
NOT DONE — missing
BLOCKED — dependency prevents verification

Never inflate the status.

If a test was not run, say so.

If external credentials were unavailable, say so.

If only static inspection was performed, say so.

## 18. Ask Rather Than Guess

If a choice materially changes behavior, architecture, data, security, or billing, ask before making a large assumption.

Small implementation details can be chosen safely when they preserve existing architecture and behavior.
