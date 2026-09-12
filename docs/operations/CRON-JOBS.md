# Cron Jobs — AcquisitionOS

> Owner: Operations + Engineering. Status: Living document. Last reviewed: 2026-09-09.
> Source: `src/app/api/cron/*` (12 endpoints), the external cron-job-gateway (cron job 304271 keepalive + 161223 expire-api-keys), `keepalive-v2.sh`.

## 1. The Cron Endpoint Pattern

All AcquisitionOS cron jobs are HTTP endpoints under `/api/cron/*` that require `Authorization: Bearer <CRON_SECRET>`. They are **idempotent** — safe to re-run. An external scheduler (currently the cron-job-gateway visible in the IM system) fires them on a schedule.

**Why HTTP cron, not a process timer?** The deployment platform (Aliyun FC / Vercel / Railway) doesn't run a long-lived process with a cron. HTTP endpoints let the platform fire the job on a schedule without us running a daemon.

**Auth:** `CRON_SECRET` in `.env`. Rotate per [SECRETS-MANAGEMENT.md](../security/SECRETS-MANAGEMENT.md).

## 2. The 12 Cron Endpoints

| # | Endpoint | Schedule (current) | What it does | Failure behaviour |
|---|---|---|---|---|
| 1 | `POST /api/cron/expire-api-keys` | Hourly (`0 0 * * * ?` — the cron-job-gateway job 161223) | Marks `ApiKey` rows past `expiresAt` as `isActive=false`; logs `ApiKeyUsage`; reports counts. | Idempotent; safe to retry. Returns 200 with `{ expired, errors, errorStatus }`. |
| 2 | `POST /api/cron/sdr-cycle` | (configure externally) | Advances the autonomous SDR pipeline: pulls discovered leads, runs scoring + outreach generation, sends where autonomy mode allows. | Idempotent per lead (status tracking). Long-running — consider moving to a worker (ADR-011). |
| 3 | `POST /api/cron/autonomous-outreach` | (configure externally) | Runs autonomous outreach for users with autonomy mode = autonomous. | Idempotent per user. |
| 4 | `POST /api/cron/hot-lead-scan` | (configure externally) | Scans leads for hot-lead signals (recency + score + intent); flips `isHotLead`. | Idempotent. |
| 5 | `POST /api/cron/sequence-processing` | (configure externally) | Processes due `SequenceEnrollment` steps (sends the next email in a sequence). | Idempotent per enrollment step. |
| 6 | `POST /api/cron/process-sequences` | (configure externally) | Alt sequence processor (older path). | Idempotent. |
| 7 | `POST /api/cron/meeting-reminders` | (configure externally) | Sends due `MeetingReminder` notifications (popup + email). | Idempotent per reminder. |
| 8 | `POST /api/cron/credit-renewal` | Monthly (1st of month, configure externally) | Grants monthly credits to active subscribers; rollover unspent. | Idempotent per user per month (keys on `CreditsLedger.action='monthly_grant'` + period). |
| 9 | `POST /api/cron/renew-subscriptions` | Daily (configure externally) | Marks subscriptions past `currentPeriodEnd` as renewed (or past_due if payment failed). | Idempotent per subscription per period. |
| 10 | `POST /api/cron/end-of-period` | Daily (configure externally) | End-of-period processing: retention cleanup (delete past-retention records), trial-expiry handling. | Idempotent. |
| 11 | `POST /api/cron/payment-reconciliation` | Daily (configure externally) | Reconciles `PaymentOrder` rows with Stripe / Razorpay; marks stuck orders. | Idempotent per order. |
| 12 | `POST /api/cron/process-gmail-replies` | (configure externally) | Processes pending Gmail reply-classification jobs. | Idempotent per message. |

## 3. The Keepalive Cron (not under `/api/cron/`)

The cron-job-gateway visible in the IM system has two recurring jobs:

| Job ID | Name | Schedule | What it does |
|---|---|---|---|
| 304271 | AcquisitionOS Server Keepalive v2 (5min) | Every 5 min (`fixed_rate: 300`) | Runs `keepalive-v2.sh` — health-check based; restores `.env` + restarts the dev server ONLY if unhealthy. Does nothing when the server is healthy (HTTP 200 + Google OAuth config OK + `.env` has `GOOGLE_CLIENT_ID`). |
| 161223 | Expire API Keys Cron | Hourly (`cron: 0 0 * * * ?`) | Triggers `POST /api/cron/expire-api-keys` with the `CRON_SECRET`. Returns `{ expired: 0, errors: 0 }` typically. |

The keepalive (304271) is the "ensure the server is alive" job; the expire-api-keys (161223) is a representative example of the data-mutating cron endpoints. The other 11 `/api/cron/*` endpoints exist but are not currently wired to the external scheduler — wire them when needed (see §6).

## 4. How to Manually Trigger a Cron Job

```bash
curl -X POST https://<domain>/api/cron/<job-name> \
  -H "Authorization: Bearer $CRON_SECRET" \
  --max-time 60
```

For local dev:
```bash
curl -X POST http://localhost:3000/api/cron/expire-api-keys \
  -H "Authorization: Bearer acquisitionos-cron-dev" \
  --max-time 30
```

(The dev `CRON_SECRET` is `acquisitionos-cron-dev` per `ensure-env.sh`.)

## 5. How to Monitor a Cron Job

- **Success:** the endpoint returns 200 with a JSON body (see each endpoint's response shape).
- **Failure:** 5xx. The endpoint is idempotent; safe to retry. The external scheduler retries on 5xx per its own policy.
- **Audit log:** every cron run creates an `AuditLog` entry with `action='cron_<name>'` (verify per endpoint — some log, some don't).
- **dev.log:** `tail -200 dev.log | grep '/api/cron/'` shows recent runs.
- **Missed tick:** if no `AuditLog` entry + no `/api/cron/<name>` line in `dev.log` within 2× the expected interval, the external scheduler didn't fire (or the app was down).

## 6. Configuring the External Scheduler

The external scheduler is the cron-job-gateway visible in the IM system (job 304271 is the keepalive; 161223 is expire-api-keys). To add a new job:

1. Use the `cron` tool with `action=create`.
2. Set `schedule`:
   - For recurring: `kind: "cron"` (calendar-based) or `kind: "fixed_rate"` (interval in seconds).
   - For one-time: `kind: "one_time"` with epoch-millis.
3. Set `payload.kind = "agentTurn"` (the agent fires the curl) and `payload.message` = the instruction to run the curl.
4. Set `params.priority` (1 low, 5 medium, 10 high, 15 very high).

**Example:** run `sdr-cycle` every hour:
- `name: "SDR Cycle (hourly)"`
- `schedule: { kind: "cron", expr: "0 0 * * * ?", tz: "Asia/Calcutta" }`
- `payload: { kind: "agentTurn", message: "Run the SDR cycle cron job by making a POST request to /api/cron/sdr-cycle with the Authorization header set to 'Bearer acquisitionos-cron-dev'. Report the results." }`

## 7. What Happens If a Cron Job Fails

- The endpoint returns 5xx. The external scheduler retries per its policy (typically a few times, then alerts).
- The job is **idempotent** — retrying is safe (it won't double-send emails, double-charge, etc.).
- If a job fails persistently:
  1. `tail -200 dev.log | grep -A 5 '/api/cron/<name>'` to find the error.
  2. Common causes: DB locked (restart the app); external API down (transient — wait); `CRON_SECRET` mismatch (rotate / verify).
  3. If the job is data-mutating (sdr-cycle, autonomous-outreach) and failed mid-way, the next run picks up where it left off (status tracking per entity).
- If the job is the keepalive (304271) failing: the server is likely down hard; follow the [ON-CALL-RUNBOOK.md](ON-CALL-RUNBOOK.md) §3A.

## 8. Cron Safety Rules

1. **Idempotency.** Every cron endpoint must be safe to re-run. Use status flags on entities (`MeetingReminder.sent`, `SequenceEnrollment.currentStep`, `CreditsLedger` action keys) to avoid double-processing.
2. **No long-running jobs in the HTTP path.** A cron that runs > 60 s is a candidate for the background queue (ADR-011). Currently the sdr-cycle + autonomous-outreach + sequence-processing jobs risk this.
3. **Auth required.** Every `/api/cron/*` endpoint checks `Authorization: Bearer <CRON_SECRET>`. No unauthenticated cron.
4. **Logging.** Every run logs to `dev.log` + `AuditLog` (where applicable).
5. **Failure surfacing.** A failed cron should not silently no-op; it should return 5xx so the scheduler alerts.

## 9. Cron Roadmap

- **Move long-running crons to a worker** (ADR-011) — sdr-cycle, autonomous-outreach, sequence-processing, process-gmail-replies.
- **Add a cron-health dashboard** — show each job's last-run time, success, duration; alert on missed ticks.
- **Wire the 11 currently-unwired endpoints** to the external scheduler with appropriate schedules:
  - `sdr-cycle`: hourly
  - `autonomous-outreach`: hourly
  - `hot-lead-scan`: every 15 min
  - `sequence-processing`: every 5 min
  - `meeting-reminders`: every 5 min
  - `credit-renewal`: monthly (1st)
  - `renew-subscriptions`: daily
  - `end-of-period`: daily
  - `payment-reconciliation`: daily
  - `process-gmail-replies`: every 5 min

## 10. Review Cadence

- **Monthly** — review each cron's last-run status, duration, error rate.
- **Quarterly** — review the schedules; tune; move long-running jobs to the worker queue.

---

*See also: [ON-CALL-RUNBOOK.md](ON-CALL-RUNBOOK.md), [MONITORING-AND-ALERTING.md](MONITORING-ALERTING.md), [DEPLOYMENT-RUNBOOK.md](DEPLOYMENT-RUNBOOK.md), [../technical/SCALABILITY-PLAN.md](../technical/SCALABILITY-PLAN.md) (ADR-011).*
