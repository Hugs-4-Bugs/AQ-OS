# Phase 5 — Admin Billing Foundations

## Task
Create the admin billing service and API route for AcquisitionOS Phase 5.

## Files Created

### 1. `/home/z/my-project/src/lib/admin-billing-service.ts`
Admin-level billing monitoring and management service with 9 exported functions:

| Function | Description | Return Type |
|---|---|---|
| `getBillingOverview()` | Billing dashboard data: active subs by plan, revenue (current/last month), failed payments, past-due, trials, churn rate | `BillingOverviewResult` |
| `getWebhookMonitoring(options?)` | Webhook processing stats with filter by provider/date, avg processing time | `WebhookMonitoringResult` |
| `getFailedPaymentLogs(options?)` | Failed payment orders with user info, webhooks, breakdown by provider/plan | `FailedPaymentLogsResult` |
| `getInvoiceTracking(options?)` | Invoice tracking with GST summary, revenue, tax collected, filter by status/currency/date | `InvoiceTrackingResult` |
| `getSubscriptionMetrics(period)` | Subscription metrics over day/week/month: new subs, churn, upgrades, downgrades, plan distribution | `SubscriptionMetricsResult` |
| `retryFailedWebhook(webhookId)` | Manually retry a failed webhook, reset its state, log the attempt | `RetryFailedWebhookResult` |
| `overrideSubscription(params)` | Admin override: change plan, set custom credits, extend trial, force status; logs with admin info | `OverrideSubscriptionResult` |
| `exportBillingData(options?)` | Export all billing data (subs, payments, invoices, webhooks) as structured JSON | `ExportBillingDataResult` |
| `getRevenueByPeriod(startDate, endDate)` | Revenue breakdown by period, plan, currency, GST, net after refunds | `RevenueByPeriodResult` |

All functions:
- Use `db` from `@/lib/db`
- Use `logBillingEvent` from `@/lib/billing-audit`
- Handle errors gracefully (catch + console.error + safe defaults)
- Support pagination where appropriate
- Export all types

### 2. `/home/z/my-project/src/app/api/admin/billing/route.ts`
GET handler for admin billing queries:
- Requires admin auth via `withAdmin` from `@/lib/auth-middleware`
- Dispatches by `action` query param:
  - `overview` → `getBillingOverview()`
  - `webhooks` → `getWebhookMonitoring()` with provider/startDate/endDate/limit/offset
  - `failed-payments` → `getFailedPaymentLogs()` with provider/plan/startDate/endDate/limit/offset
  - `invoices` → `getInvoiceTracking()` with status/currency/startDate/endDate/limit/offset
  - `metrics` → `getSubscriptionMetrics()` with period param
  - `revenue` → `getRevenueByPeriod()` with required startDate/endDate
- Returns `{ success: true, data }` or appropriate error responses

## Design Decisions
- **SQLite compatibility**: All queries use Prisma operations compatible with SQLite (no raw SQL, no unsupported aggregates). Calculations like averages and breakdowns are done in application code.
- **Churn rate**: Calculated as (expired + canceled in last 30 days) / (active + churned in period) * 100
- **Credit override**: Properly calculates delta between previous and new credit amounts, creates a ledger entry with correct balance tracking.
- **Webhook retry**: Resets the webhook to unprocessed state for re-dispatch by the webhook processing pipeline.
- **Revenue period granularity**: Automatically determines day/week/month granularity based on date range span.

## Lint Status
✅ No lint errors in new files (pre-existing errors in other files are unrelated).
