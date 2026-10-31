# Phase 32 — Admin Operations / Support / Integrations Architecture

## Overview

Phase 32 provides the production-grade Admin Operations control center for AcquisitionOS. It is built on top of existing infrastructure (SystemEvent, AuditLog, WorkflowExecution, AutopilotRun, PaymentWebhook, EmailAccount, TelegramConfig, WhatsappConfig) — **no duplicate systems created**.

## Architecture

### Service Layer

`src/lib/admin-operations-service.ts` — single service module exposing:

| Function | Purpose | Backing Model(s) |
|---|---|---|
| `getSystemHealth()` | Aggregate platform health (DB ping, sessions, errors, audit, integrations) | All models |
| `getOperationalEvents(opts)` | Paginated SystemEvent list with filters | SystemEvent |
| `resolveOperationalEvent(opts)` | Idempotent event resolution + audit | SystemEvent + AuditLog |
| `getIntegrationsStatus()` | Per-provider config + reachability + health | PaymentWebhook, EmailAccount, TelegramConfig, WhatsappConfig, env vars |
| `getAuditLog(opts)` | Paginated AuditLog search | AuditLog |
| `retryFailedOperation(opts)` | (Legacy) intent-only retry — superseded by `executeRealRetry` | AuditLog |
| `getOperationalMetrics()` | DB-aggregated KPIs | All models |
| `getWorkflowMonitoring(opts)` | REAL workflow execution state | WorkflowExecution + WorkflowDefinition |
| `getAutopilotMonitoring(opts)` | REAL autopilot state + scheduler verification | AutopilotRun + AuditLog |
| `getCronJobMonitoring()` | REAL cron job execution evidence | AuditLog (per-job action prefix) |
| `getDeploymentHealth()` | REAL version/env/uptime/DB ping | process + DB |
| `executeRealRetry(opts)` | **REAL retry execution** — calls `retryExecution()` from workflow-executor | WorkflowExecution + AuditLog |
| `executeRealIntegrationAction(opts)` | **REAL provider validation** — calls actual `isEmailServiceConfigured()` etc. | Provider-specific |
| `getUnifiedOperationsOverview()` | Aggregates all subsystems into one status panel | All |
| `getUserSupportContext(opts)` | Per-user operational view | User + Subscription + PaymentOrder + WorkflowExecution + AutopilotRun + AuditLog + CreditsLedger |

### API Routes

All routes under `/api/admin/operations/*` are RBAC-gated at the HTTP level via `withPermission`. The real `@/lib/rbac` permission registry decides access — no client-side role checks.

| Method | Route | Permission | Purpose |
|---|---|---|---|
| GET | `/api/admin/operations/system-health` | `system.health.read` | DB ping, sessions, errors, audit, integrations |
| GET | `/api/admin/operations/events` | `system.health.read` | Paginated SystemEvent list |
| PATCH | `/api/admin/operations/events/[id]` | `system.events.resolve` | Idempotent event resolution |
| GET | `/api/admin/operations/integrations` | `integrations.read` | Per-provider status |
| POST | `/api/admin/operations/integrations/[provider]/action` | `integrations.control` | **REAL provider validation** |
| GET | `/api/admin/operations/audit` | `audit.read` | Paginated AuditLog search |
| POST | `/api/admin/operations/retry` | `system.operations.retry` | **REAL retry execution** |
| GET | `/api/admin/operations/metrics` | `system.health.read` | DB-aggregated KPIs |
| GET | `/api/admin/operations/workflows` | `system.health.read` | REAL workflow monitoring |
| GET | `/api/admin/operations/autopilot` | `system.health.read` | REAL autopilot monitoring |
| GET | `/api/admin/operations/cron-jobs` | `system.health.read` | REAL cron job evidence |
| GET | `/api/admin/operations/deployment-health` | `system.health.read` | REAL deployment info |
| GET | `/api/admin/operations/overview` | `system.health.read` | Unified overview |
| GET | `/api/admin/operations/users/[id]/support-context` | `user360.read` | Per-user operational view |

### RBAC Matrix

| Role | system.health.read | system.events.resolve | integrations.read | integrations.control | audit.read | system.operations.retry | user360.read |
|---|---|---|---|---|---|---|---|
| super_admin | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| admin | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| support | ✓ | ✗ | ✓ | ✗ | ✓ | ✗ | ✓ |
| analytics | ✓ | ✗ | ✗ | ✗ | ✓ | ✗ | ✓ |
| member | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| viewer | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |

## Provider Health Semantics

Phase 32 distinguishes 4 separate state dimensions per provider:

1. **Config State**: `CONFIGURED` / `NOT_CONFIGURED` / `ERROR` / `UNKNOWN`
   - Derived from env var presence OR configured-account count
   - NEVER claims health

2. **Reachability**: `REACHABLE` / `UNREACHABLE` / `UNKNOWN`
   - Derived from recent successful events (last 24h)
   - For providers with no event stream (search, auth): explicitly `UNKNOWN`

3. **Health**: `HEALTHY` / `DEGRADED` / `DOWN` / `UNKNOWN`
   - Derived from recent failure rate (last 24h, ≥5 events required)
   - `deriveHealthFromEvents(recent, failures)`:
     - `< 5 events` → `UNKNOWN` (insufficient evidence)
     - `> 50% failures` → `DOWN`
     - `5–50% failures` → `DEGRADED`
     - `< 5% failures` → `HEALTHY`
   - **HEALTHY is NEVER claimed from env var presence alone**

4. **Evidence**: `configuredAccounts`, `recentSuccessfulEvents`, `recentFailedEvents`, `lastEventAt`, `lastFailureAt`
   - Raw counts that back the states above

## Retry Semantics

`executeRealRetry()` — **REAL execution, not intent-only**:

1. Validate `idempotencyKey` (≥4 chars) + `operationType` (≥3 chars) + `targetId` (required)
2. Idempotency check: look for prior AuditLog entry with same idempotencyKey
   - If found → return `already_completed` + prior result
3. For `operationType='workflow_reexecute'`:
   - Look up the WorkflowExecution
   - If not found → return `rejected_not_found` (HTTP 404)
   - If status not in `['failed', 'dead_letter', 'exhausted']` → return `rejected_non_retryable` (HTTP 409)
   - **Actually call `retryExecution()` from `@/lib/workflow-executor`** — this updates the DB row, bumps retryCount, kicks off `processExecution()`
   - Record AuditLog entry with the actual result
   - Return `executed` + executionResult
4. For unknown operationType → return `rejected_non_retryable` with explicit reason

## Integration Action Semantics

`executeRealIntegrationAction()` — **REAL validation, not intent-only**:

For `action='validate'`:
- `payment.stripe` / `payment.razorpay`: reuses Phase 31 `getProviderStatus()` — real webhook evidence
- `email.smtp_imap`: calls real `isEmailServiceConfigured()` from `@/lib/email` + counts EmailAccount rows
- `messaging.telegram` / `messaging.whatsapp`: queries real config + `isConnected` flag
- `search.google` / `auth.google_oauth`: configuration verification only (explicit — no API call made, would consume quota / require interactive login)

For `action='clear_cache'`:
- Returns `skipped` with explicit reason: "No cache layer in this architecture"
- Does NOT fabricate execution

Every action records an AuditLog entry with the **REAL provider result** (reachable, latencyMs, error, details).

## Scheduler Verification

`getAutopilotMonitoring()` does NOT report "HEALTHY" merely because an Autopilot row exists. The `schedulerVerified` field is `true` ONLY if the AuditLog shows a recent (last 10 minutes) entry with action containing "scheduler". If no such entry exists, `schedulerVerified=false` — we explicitly cannot prove the scheduler is running.

## Cron Job Monitoring

`getCronJobMonitoring()` enumerates the 10 known cron routes (from `src/app/api/cron/*`) and for each:
- Looks for AuditLog entries with action containing the job's prefix
- If found in last 24h → `OBSERVED_RECENTLY`
- If found historically but not recently → `OBSERVED_HISTORICALLY`
- If never found → `NEVER_OBSERVED`

`NEVER_OBSERVED` explicitly means we cannot prove the job has executed — never reported as "healthy".

## Tenant Isolation

All operations routes are platform-level admin-only:
- Every endpoint wraps its handler in `withPermission(request, '<permission>', async (admin) => ...)`
- The `admin` user is resolved by the real `getAuthUser` → `withAuth` pipeline
- AuditLog entries are tied to `admin.id` — the admin who performed the action
- No user-scoped (tenant) data is exposed without admin role verification
- The `getUserSupportContext` endpoint uses `user360.read` permission (same as Phase 30) — admin can inspect any user, but only with proper authorization

## Secret Protection

- No Stripe/Razorpay/webhook/JWT/OAuth secrets returned in any response
- 4 dedicated secret-protection HTTP tests scan response bodies for: `STRIPE_SECRET_KEY`, `sk_live_*`, `sk_test_*`, `RAZORPAY_KEY_SECRET`, `rzp_live_*`, `WEBHOOK_SIGNING_SECRET`, `whsec_*`, `JWT_SECRET=...`, `GOOGLE_CLIENT_SECRET=...`, `signingSecret`, `rawPayload`, `apiKey=...`
- `getAuditLog` select excludes all sensitive fields — only id, userId, action, details, ipAddress, userAgent, resource, resourceId, createdAt, metadata
- `getIntegrationsStatus` reports `CONFIGURED`/`NOT_CONFIGURED` from env presence but NEVER claims `HEALTHY` from env presence alone
- Provider validation functions return sanitized `details` strings — never raw secret values

## Audit Logging

Every mutation writes an AuditLog entry tied to the admin userId:

| Action | Resource | When |
|---|---|---|
| `event_resolved` | `system_event` | `resolveOperationalEvent()` |
| `operation_retried` | `workflow_execution` | `executeRealRetry()` — includes actual result |
| `integration_controlled` | `integration` | `executeRealIntegrationAction()` — includes real providerResult |

## Performance

- All aggregate queries use DB-side `count`/`aggregate`/`groupBy`
- All list queries use `take`/`skip` pagination capped at `Math.min(limit, 200)`
- Independent queries parallelized via `Promise.all`
- DB latency measured via real `SELECT 1` ping
- No `findMany` for aggregate metrics
- No N+1 queries

## Idempotency

- `resolveOperationalEvent`: returns `alreadyResolved=true` if event was already resolved (no state change, no duplicate audit)
- `executeRealRetry`: looks up prior AuditLog by idempotencyKey in metadata; returns `already_completed` + prior result if found
- `executeRealIntegrationAction`: optional idempotencyKey in body; if provided and prior audit entry exists, returns prior result

## Capabilities Not Applicable to This Architecture

- **Queue / background processor monitoring**: This architecture uses Next.js cron routes + in-process execution, not a dedicated queue subsystem (no BullMQ, Sidekiq, etc.). The cron job monitoring section covers the equivalent operational visibility.
- **Real SMTP NOOP / AI provider test API call**: These would consume quota or require interactive OAuth. The provider validation functions verify configuration presence + count configured accounts + check recent event evidence, but do NOT make actual API calls. This is explicitly documented in the `details` field of each provider result.

## Test Coverage

`tests/unit/phase32-operations-routes-http.test.ts` — 121 genuine HTTP route tests:
- 14 endpoints × 6 roles = 84 role-matrix tests
- 14 unauthenticated tests (one per endpoint) → 401
- Validation tests (missing/short fields, invalid providers, invalid JSON body)
- 4 secret-protection tests (scan response bodies)
- 4 idempotency tests (already_completed, executed, rejected_non_retryable, rejected_not_found)
- 2 REAL-execution tests (integration action returns real providerResult)
- Response-body-shape tests

All tests import the actual GET/POST/PATCH handlers from the real Next.js route modules, use REAL `@/lib/auth-middleware` and REAL `@/lib/rbac`, and assert actual HTTP status codes.
