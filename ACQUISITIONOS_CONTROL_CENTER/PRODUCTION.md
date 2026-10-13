# AcquisitionOS — Production Rules

## Purpose

This is the highest-priority production-safety contract for any AI coding agent working on AcquisitionOS.

The production codebase contains working functionality. Protect it while fixing or extending the product.

## Non-Negotiable Rules

1. NEVER rollback, revert, reset, cherry-pick an older implementation, or restore the codebase to an earlier state unless explicitly requested.
2. NEVER run `git reset --hard`, destructive checkout/reset commands, or equivalent destructive operations as a shortcut.
3. NEVER wipe, reset, recreate, truncate, replace, or migrate production data destructively.
4. NEVER delete users, subscriptions, credits, payment history, leads, workflows, pipeline records, audit records, or business data as a debugging shortcut.
5. NEVER replace working functionality with mocks, stubs, static responses, fake API results, hardcoded leads, simulated success, or polished placeholders.
6. NEVER claim a feature is implemented because UI controls, types, routes, service methods, database tables, or polished code exist.
7. NEVER claim success without tracing and verifying the actual runtime path.
8. NEVER weaken authentication, authorization, plan/entitlement checks, credit controls, rate limits, security boundaries, tenant isolation, or data validation to make a test pass.
9. NEVER expose secrets in source code, frontend bundles, logs, commits, screenshots, or error messages.
10. NEVER make unrelated changes while fixing a reported issue.
11. Preserve backward compatibility unless a breaking change is explicitly approved.
12. Before changing shared code, determine which existing features depend on it.
13. Prefer the smallest correct change over a broad rewrite.
14. If the implementation is unclear, inspect it before modifying it.
15. If a requirement cannot be verified, report it as NOT VERIFIED.
16. Never silently convert an upstream/provider failure into an empty successful result.
17. Never report requested lead counts, workflow counts, or success metrics that are not backed by actual persisted/runtime results.

## Production-Truth Rule

Runtime behavior is the source of truth, not code appearance.

A feature is DONE only when the relevant path works:

UI/request
→ authentication
→ authorization/entitlement
→ controller/API
→ service/business logic
→ provider/integration
→ async task/queue if applicable
→ persistence
→ response/state
→ UI confirmation

For Spring Boot paths, also trace:

Controller
→ DTO/request validation
→ service
→ repository/transaction
→ external client
→ exception handling
→ response mapping

For asynchronous work:

API
→ task/workflow record
→ queue/scheduler
→ worker
→ execution
→ retry/dead-letter behavior
→ persistence
→ final status
→ UI

A success toast is NOT proof.

A database row saying COMPLETED is NOT proof unless the actual work completed.

A function existing is NOT proof it is connected to runtime.

## No False Failure Hiding

Do not:

- catch exceptions and return success;
- return `[]` with HTTP 200 after provider failure;
- mark a task COMPLETED when the worker failed;
- swallow exceptions;
- fabricate discovery counts;
- silently skip failed sources;
- pretend zero results means successful discovery when the actual source failed.

Errors must be observable, classified, logged safely, and actionable.

## Data Integrity

Lead/business data must be evidence-based.

Never invent:

- company names
- websites
- emails
- phone numbers
- people
- company attributes
- business gaps
- research findings
- signals

If information is unavailable, represent it as unavailable.

Discovery metrics must reflect legitimate results matching the user's criteria.

## Payments and Credits

Never create real charges, refunds, subscription changes, or credit mutations during testing unless explicitly authorized.

Never bypass plan checks.

Never manually alter credit balances to make tests pass.

Unauthorized operations must be rejected server-side before expensive work, queue creation, or credit consumption.

## Environment and Secrets

Secrets belong in secure environment configuration.

Never hardcode:

- API keys
- OAuth secrets
- SMTP credentials
- Stripe secrets
- AI provider keys
- database passwords
- tokens

Do not log secrets.

## Spring Boot Production Rules

- Preserve transaction boundaries.
- Do not add `@Transactional` blindly to external network calls.
- Do not hold database transactions open while waiting on slow AI/search/email providers unless explicitly justified.
- Use request DTO validation at the API boundary.
- Do not expose JPA entities directly when the existing architecture uses DTOs.
- Avoid N+1 queries.
- Avoid loading large collections into memory unnecessarily.
- Use pagination for scalable lists.
- Use bounded retries with backoff for transient external failures.
- Use idempotency for retried workflow/outreach operations.
- Never make a non-idempotent external action repeat accidentally because a worker retried.
- Preserve tenant/user ownership checks in every data access path.
- Avoid blocking calls inside asynchronous execution paths when the architecture provides a non-blocking/provider client alternative.
- Keep provider-specific code behind adapters/services where practical.
- Do not create a second competing implementation of an existing service just to bypass understanding it.

## Scaling Rule

Before optimizing for more volume, make the current path correct.

Correctness first:
1. target intent
2. discovery
3. filtering
4. verification
5. persistence
6. execution
7. observability

Then optimize:

- batching
- pagination
- caching
- concurrency limits
- queue workers
- provider throttling
- connection pooling
- database indexes
- async processing

Never increase volume by weakening quality or validation.

## Required Final Report

Every implementation task must end with:

- Root cause
- What changed
- Exact files changed
- Tests executed
- Runtime verification
- Data/DB verification where relevant
- What remains unverified
- Risks
- Status

Statuses:

DONE — verified
PARTIAL — implemented but not fully verified
NOT DONE — not implemented
BLOCKED — dependency prevents verification

Never use DONE for unverified code.
