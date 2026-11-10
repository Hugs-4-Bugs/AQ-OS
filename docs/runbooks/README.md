# AcquisitionOS — Runbook Index

This directory contains operational runbooks for every critical alert that AcquisitionOS can fire.

## Runbooks

| Alert | Severity | Runbook |
|---|---|---|
| `HighCpuUsage` (CPU >75% sustained 5m) | warning | [cpu-high.md](./cpu-high.md) |
| `CriticalCpuUsage` (CPU >90% sustained 5m) | critical | [cpu-critical.md](./cpu-critical.md) |
| `HighMemoryUsage` / `CriticalMemoryUsage` | warning / critical | [memory-high.md](./memory-high.md) |
| `DatabaseSlowQuery` / `PostgresConnectionPoolWarning` | warning | [database.md](./database.md) |
| `QueueBacklogGrowing` / `QueueBacklogCritical` | warning / critical | [queue-backlog.md](./queue-backlog.md) |
| `RedisDown` / `RedisHighMemory` | critical / warning | [redis.md](./redis.md) |
| `HighErrorRate` (5xx >5% sustained 5m) | critical | [api-errors.md](./api-errors.md) |
| `HighLatencyP95` / `CriticalLatencyP99` | warning / critical | [api-latency.md](./api-latency.md) |
| `AppDown` (no scrape for 3m) | critical | [app-down.md](./app-down.md) |
| `AICostSpike` (>$10/hr) | warning | [ai-cost-spike.md](./ai-cost-spike.md) |
| `AuthEndpointFailures` | critical | [auth-failures.md](./auth-failures.md) |
| `MonitoringStale` | warning | [monitoring-stale.md](./monitoring-stale.md) |
| `CertificateExpiringSoon` (<14d) | warning | [certificate-expiry.md](./certificate-expiry.md) |

## Alert routing summary

| Severity | Telegram | WhatsApp | Email (fallback) | Grouping window | Repeat interval |
|---|---|---|---|---|---|
| Critical | YES | YES | YES (after 30m escalation) | 10s | 1h |
| Warning | YES | — | — | 60s | 4h |
| Recovery | YES | YES | — | 30s | n/a |
| Info | YES | — | — | 60s | 24h |

## Acknowledgement workflow

1. Alert fires → notification dispatched to Telegram + WhatsApp.
2. On-call engineer acknowledges via `POST /api/admin/operations/alert-ack` with `{ dedupKey, action: "ack" }`.
3. Acknowledged alerts are suppressed from re-notification until they resolve OR until manually un-acked.
4. If not acknowledged within 30 minutes, the dispatcher auto-escalates.

## Privacy

All alert notifications (Telegram, WhatsApp, email) contain ONLY:
- App name, environment, alert name, severity
- Affected component
- Current value + threshold
- Start time + duration
- Dashboard link

They NEVER contain:
- Email addresses, user IDs, tenant IDs
- API keys, tokens, secrets, connection strings
- Prompts, message bodies, file contents
- IP addresses
- Stack traces (linked from dashboard instead)
