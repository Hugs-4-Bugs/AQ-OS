# AcquisitionOS — Incident Response Plan

> **Version**: 2.0 | **Last Updated**: 2025-06-18 | **Owner**: Platform Team
>
> This document defines the incident response process for AcquisitionOS. All on-call engineers must read this document before their first shift. The goal is to minimize customer impact, resolve incidents quickly, and learn from each event.

---

## Table of Contents

1. [Severity Levels (P1–P4)](#1-severity-levels-p1p4)
2. [Response Time SLAs](#2-response-time-slas)
3. [Escalation Matrix](#3-escalation-matrix)
4. [Communication Templates](#4-communication-templates)
5. [Post-Mortem Template](#5-post-mortem-template)
6. [Runbook References](#6-runbook-references)

---

## 1. Severity Levels (P1–P4)

### Definitions

| Severity | Name | Definition | Customer Impact | Example |
|----------|------|-----------|----------------|---------|
| **P1** | Critical | Complete service outage or data breach | All users unable to use the product, or data compromised | Database down, payment system compromised, auth completely broken |
| **P2** | High | Major feature broken with no workaround | Significant portion of users affected, core workflow broken | Payments failing, AI features down, login broken for subset of users |
| **P3** | Medium | Minor feature degraded, workaround available | Some users affected, degraded but functional experience | Slow AI responses, email delivery delayed, some dashboard errors |
| **P4** | Low | Non-urgent, cosmetic, or minor issue | Minimal user impact, no data risk | UI glitch, minor text error, non-critical notification failure |

### Severity Decision Tree

```
Is the service completely down or is data compromised?
├── YES → P1 (Critical)
└── NO → Is a core feature broken with no workaround?
    ├── YES → P2 (High)
    └── NO → Is a feature degraded but workaround exists?
        ├── YES → P3 (Medium)
        └── NO → P4 (Low)
```

### AcquisitionOS-Specific Severity Examples

| Severity | Scenario | Trigger |
|----------|----------|---------|
| P1 | PostgreSQL/SQLite down — no reads or writes | `APIEndpointDown` alert, all API 500s |
| P1 | Redis down — sessions, queues, caching all fail | `RedisDown` alert for >2 min |
| P1 | Security breach — JWT_SECRET compromised | Security alert or unauthorized access detected |
| P1 | Payment data breach | Suspicious payment activity, webhook tampering |
| P2 | Payment processing failing (one or both gateways) | `HighErrorRate` on payment endpoints |
| P2 | Auth system broken (login/signup failing) | `HighErrorRate` on auth endpoints |
| P2 | AI features completely unavailable | All AI endpoints returning errors |
| P2 | Celery workers down — no background processing | `CeleryWorkerDown` alert for >5 min |
| P3 | AI features slow but working | `HighLatencyP95` alert, no errors |
| P3 | Email delivery delayed >30 minutes | User complaints, no alert |
| P3 | WebSocket service down (notifications delayed) | `APIEndpointDown` for ws-service |
| P3 | Celery queue backlog (tasks delayed but processing) | `CeleryQueueBacklog` alert |
| P4 | UI rendering issues on specific browser | User report |
| P4 | Minor API latency increase (<2s P95) | `ElevatedErrorRate` or `HighLatencyP95` warning |
| P4 | Non-critical notification not sending | Audit log check |

---

## 2. Response Time SLAs

### Response Time Requirements

| Severity | Acknowledge | Start Investigation | Update Frequency | Resolve Target | Post-Mortem |
|----------|------------|--------------------|-----------------|---------------|-------------|
| **P1** | < 5 min | < 15 min | Every 15 min | < 2 hours | < 24 hours |
| **P2** | < 15 min | < 1 hour | Every 30 min | < 8 hours | < 48 hours |
| **P3** | < 1 hour | < 4 hours | Every 2 hours | < 24 hours | < 1 week |
| **P4** | < 4 hours | Next business day | Daily | < 1 week | Optional |

### Response Time Breakdown by Role

| Role | P1 | P2 | P3 | P4 |
|------|-----|-----|-----|-----|
| On-Call Engineer | 5 min | 15 min | 1 hour | 4 hours |
| Platform Lead | 15 min | 1 hour | 4 hours | Next day |
| Engineering Manager | 30 min | 2 hours | 8 hours | Next day |
| VP Engineering | 30 min | Notified | Notified | — |
| Security Team | 15 min (if security) | 1 hour (if security) | — | — |

### Escalation Timers

If the on-call engineer does not acknowledge within the SLA:

| After | Action |
|-------|--------|
| 5 min (P1) / 15 min (P2) | Auto-page backup on-call |
| 10 min (P1) / 30 min (P2) | Notify Platform Lead via phone |
| 15 min (P1) / 45 min (P2) | Notify Engineering Manager |
| 30 min (P1) | Notify VP Engineering |

---

## 3. Escalation Matrix

### Escalation Contacts

| Level | Role | Primary Contact | Backup Contact | Channel |
|-------|------|----------------|---------------|---------|
| L1 | On-Call Engineer | PagerDuty: `acquisitionos-oncall` | PagerDuty: `acquisitionos-oncall-backup` | PagerDuty → Phone → Slack |
| L2 | Platform Lead | Slack: `@platform-lead` | Slack: `@platform-lead-backup` | Slack → Phone |
| L3 | Engineering Manager | Slack: `@eng-manager` | Slack: `@eng-manager-backup` | Slack → Phone |
| L4 | VP Engineering | Slack: `@vp-eng` | — | Phone only |
| Security | Security Team | Slack: `#security-alerts` | PagerDuty: `security-oncall` | PagerDuty → Slack → Phone |
| External | Payment Providers | Stripe: Dashboard support | Razorpay: Dashboard support | Provider dashboards |

### Escalation Flow

```
Alert fires (Prometheus → PagerDuty)
        |
        v
L1: On-Call Engineer acknowledges
        |
        ├── Resolved within SLA? → YES → Close incident, write post-mortem
        |
        └── NO → Escalate to L2
                |
                ├── Resolved? → YES → Close incident, write post-mortem
                |
                └── NO → Escalate to L3
                        |
                        ├── Resolved? → YES → Close incident
                        |
                        └── NO → Escalate to L4
                                |
                                └── Emergency response (all hands)
```

### Incident Commander

For P1 and P2 incidents, an Incident Commander (IC) is designated:

**IC Responsibilities**:
- Coordinate the response effort
- Assign roles (investigator, communicator, fixer)
- Track timeline and decisions
- Ensure communication is flowing
- Authorize rollbacks and emergency changes
- Declare resolution

**IC Assignment**:
| Situation | IC |
|-----------|-----|
| P1 during business hours | Platform Lead |
| P1 outside business hours | On-Call Engineer (until Platform Lead joins) |
| P2 during business hours | Senior Engineer on team |
| P2 outside business hours | On-Call Engineer |
| Security incident | Security Team Lead |

---

## 4. Communication Templates

### 4.1 Incident Declaration (Slack)

Post to `#incident-response` channel:

```
🚨 INCIDENT DECLARED

**Severity**: P1/P2/P3/P4
**Incident ID**: INC-YYYYMMDD-NNN
**Title**: [Brief description]
**Started at**: YYYY-MM-DD HH:MM UTC
**Declared by**: @oncall-engineer
**Affected services**: [List services]
**Customer impact**: [Description of impact]
**Current status**: INVESTIGATING / MITIGATING / MONITORING / RESOLVED

**Incident Commander**: @ic-name
**Investigator**: @investigator-name
**Communicator**: @communicator-name

**Bridge call**: [Zoom/Google Meet link] (P1/P2 only)
**Status page**: [Updated / Not yet updated]
```

### 4.2 Status Update (Slack)

Post to `#incident-response` channel (every 15 min for P1, 30 min for P2):

```
📋 STATUS UPDATE — INC-YYYYMMDD-NNN

**Time**: HH:MM UTC
**Status**: INVESTIGATING / MITIGATING / MONITORING / RESOLVED
**What happened**: [New findings since last update]
**What we're doing**: [Current actions]
**ETA to resolution**: [Time estimate or "Unknown"]
**Customer impact**: [Updated impact assessment]
**Next update**: [HH:MM UTC]
```

### 4.3 External Status Page Update

Post to statuspage.io:

```
**Title**: [Service] — [Issue Summary]

**Status**: Investigating / Identified / Monitoring / Resolved

**Message**:
We are currently experiencing [description of issue]. 
[Description of customer impact].

Our team is actively investigating and working to resolve this as quickly as possible.
We will provide an update within [15/30] minutes.

**Affected Components**: [App, Payments, AI Features, etc.]
```

### 4.4 Resolution Notice (Slack)

```
✅ INCIDENT RESOLVED — INC-YYYYMMDD-NNN

**Severity**: P1/P2/P3/P4
**Duration**: XX hours YY minutes
**Resolved at**: YYYY-MM-DD HH:MM UTC
**Resolution**: [What was done to fix the issue]
**Root cause**: [Brief description — detailed in post-mortem]
**Customer impact**: [Final impact summary]
**Post-mortem**: [Scheduled / Link to post-mortem]

**Action items**:
1. [ ] [Follow-up action]
2. [ ] [Follow-up action]

Thank you to everyone who helped resolve this incident.
```

### 4.5 Customer Communication (Email)

**Subject**: AcquisitionOS Service Incident — [Date]

```
Dear AcquisitionOS User,

We want to inform you of a service issue that affected your experience.

What happened:
[Brief description of the incident in plain language]

When it happened:
[Start time] to [End time] UTC

How it affected you:
[Specific impact — e.g., "Some users were unable to process payments during this time"]

What we're doing:
[Actions taken to resolve and prevent recurrence]

We sincerely apologize for any inconvenience. If you have questions or 
believe you were affected in a way not described above, please contact 
support@acquisitionos.com.

Sincerely,
The AcquisitionOS Team
```

### 4.6 Payment-Specific Communication

For payment incidents, additional communication is required:

```
💰 PAYMENT INCIDENT — ADDITIONAL DETAILS

**Affected provider**: Razorpay / Stripe / Both
**Time window**: [Start] to [End] UTC
**Failed transactions**: [Count]
**Affected users**: [Count]

**For affected users**:
- Your payment was not processed successfully
- Your account has NOT been charged (or: your account WAS charged but service was not activated)
- Please retry your payment at [link]
- If you were charged but service was not activated, contact support for immediate resolution

**Internal actions**:
1. [ ] Review all PaymentWebhook entries during the incident window
2. [ ] Re-process any failed webhooks
3. [ ] Verify subscription states match payment states
4. [ ] Issue refunds for double-charges (if any)
5. [ ] Credit affected users for the inconvenience
```

---

## 5. Post-Mortem Template

### Post-Mortem: INC-YYYYMMDD-NNN

**Title**: [Incident Title]
**Severity**: P1/P2/P3/P4
**Date**: YYYY-MM-DD
**Author**: [Name]
**Attendees**: [List of participants]

---

#### Summary

[2-3 sentence summary of what happened, the impact, and the resolution]

#### Timeline (all times UTC)

| Time | Event |
|------|-------|
| HH:MM | Alert fired: [description] |
| HH:MM | On-call acknowledged |
| HH:MM | Incident declared P[X] |
| HH:MM | Root cause identified: [description] |
| HH:MM | Mitigation applied: [description] |
| HH:MM | Resolution confirmed |
| HH:MM | All-clear declared |

#### Root Cause

[Detailed technical explanation of what caused the incident. Include code paths, configuration, and infrastructure details.]

**Five Whys Analysis**:
1. Why did the incident occur? → [Answer]
2. Why did [Answer 1] happen? → [Answer]
3. Why did [Answer 2] happen? → [Answer]
4. Why did [Answer 3] happen? → [Answer]
5. Why did [Answer 4] happen? → [Answer] (root cause)

#### Impact

| Metric | Value |
|--------|-------|
| Duration | XX hours YY minutes |
| Users affected | [Count or percentage] |
| API error rate (peak) | [Percentage] |
| Revenue impact | [Amount or "Under investigation"] |
| Support tickets created | [Count] |
| Data loss | [Description or "None"] |

#### Detection

- **How was the incident detected?** [Alert / User report / Manual check]
- **Could it have been detected sooner?** [Yes/No + explanation]
- **Were alerts configured correctly?** [Yes/No + details]

#### Response Assessment

| Aspect | Rating | Notes |
|--------|--------|-------|
| Detection speed | ✅ Good / ⚠️ Needs improvement / ❌ Poor | |
| Acknowledgment time | ✅ / ⚠️ / ❌ | |
| Communication quality | ✅ / ⚠️ / ❌ | |
| Resolution speed | ✅ / ⚠️ / ❌ | |
| Escalation effectiveness | ✅ / ⚠️ / ❌ | |

#### Action Items

| # | Action | Owner | Priority | Due Date | Status |
|---|--------|-------|----------|----------|--------|
| 1 | [Description] | @owner | P1/P2/P3 | YYYY-MM-DD | ☐ |
| 2 | [Description] | @owner | P1/P2/P3 | YYYY-MM-DD | ☐ |
| 3 | [Description] | @owner | P1/P2/P3 | YYYY-MM-DD | ☐ |

**Categories**:
- **Prevention**: Actions to prevent the same type of incident
- **Detection**: Actions to improve alerting and monitoring
- **Process**: Actions to improve incident response process
- **Documentation**: Actions to update runbooks and documentation

#### Lessons Learned

**What went well**:
- [Item 1]
- [Item 2]

**What could be improved**:
- [Item 1]
- [Item 2]

**Where we got lucky**:
- [Item 1]

#### Supporting Evidence

- [Grafana screenshot of the incident]
- [Relevant log excerpts]
- [Sentry error group links]
- [Database query results]

---

## 6. Runbook References

### Quick-Reference: Which Runbook to Use

| Symptom | Start Here | Additional |
|---------|-----------|-----------|
| All services down | [Emergency Shutdown](./ROLLBACK.md#5-emergency-shutdown-procedure) | [Total Service Outage](./RUNBOOK.md#31-total-service-outage) |
| Database errors | [Database Rollback](./ROLLBACK.md#1-database-rollback-strategy) | [Database Issues](./RUNBOOK.md#32-database-unavailable) |
| Redis errors | [Redis Issues](./RUNBOOK.md#33-redis-down) | [Celery Queue Backlog](./RUNBOOK.md#35-celery-queue-backlog) |
| High error rate | [Application Rollback](./ROLLBACK.md#2-application-version-roll-back) | [High Error Rate](./RUNBOOK.md#34-high-error-rate-5-5xx) |
| Payment failures | [Payment Gateway Disable](./ROLLBACK.md#4-payment-gateway-disable) | [Payment Failure Recovery](./RUNBOOK.md#7-payment-failure-recovery) |
| Security breach | [Emergency Shutdown](./ROLLBACK.md#5-emergency-shutdown-procedure) | [Pre-Launch Security](./GO_LIVE.md#1-pre-launch-security-checklist) |
| Feature flag issue | [Feature Flag Rollback](./ROLLBACK.md#3-feature-flag-rollback) | — |
| Slow performance | [Performance Troubleshooting](./RUNBOOK.md#6-performance-troubleshooting) | — |
| Session issues | [Session Management](./RUNBOOK.md#8-session-management) | — |
| Need to roll back deployment | [Application Version Rollback](./ROLLBACK.md#2-application-version-roll-back) | [Post-Rollback Verification](./ROLLBACK.md#6-post-rollback-verification) |

### Complete Documentation Index

| Document | Purpose |
|----------|---------|
| [RUNBOOK.md](./RUNBOOK.md) | Day-to-day operations, incident procedures, troubleshooting |
| [GO_LIVE.md](./GO_LIVE.md) | Pre-launch checklist, security verification, payment testing |
| [ROLLBACK.md](./ROLLBACK.md) | Database, application, feature flag, and emergency rollback |
| [INCIDENT_RESPONSE.md](./INCIDENT_RESPONSE.md) | This document — severity levels, SLAs, escalation, communication |
| [DISASTER_RECOVERY.md](./DISASTER_RECOVERY.md) | Full disaster recovery procedures |
| [MONITORING_GUIDE.md](./MONITORING_GUIDE.md) | Monitoring stack setup and configuration |
| [SECRETS_REFERENCE.md](./SECRETS_REFERENCE.md) | Secrets management and rotation procedures |
| [WEBHOOK_SETUP_GUIDE.md](./WEBHOOK_SETUP_GUIDE.md) | Payment webhook configuration |
| [OAUTH_SETUP_GUIDE.md](./OAUTH_SETUP_GUIDE.md) | Google OAuth setup |
| [ENV_SETUP_GUIDE.md](./ENV_SETUP_GUIDE.md) | Environment variable setup |
| [PRODUCTION_DEPLOYMENT_GUIDE.md](./PRODUCTION_DEPLOYMENT_GUIDE.md) | Production deployment procedures |

### Key API Endpoints for Incident Response

| Endpoint | Purpose | Method |
|----------|---------|--------|
| `/api/health` | Basic health check | GET |
| `/api/health/detailed` | Component-level health (DB, memory, process) | GET |
| `/api/metrics` | Prometheus-compatible metrics | GET |
| `/api/auth/signin` | Test authentication | POST |
| `/api/payments/webhook/razorpay` | Razorpay webhook (check if receiving) | POST |
| `/api/payments/webhook/stripe` | Stripe webhook (check if receiving) | POST |
| `/api/payments/webhook-replay` | Re-process failed webhooks | POST |
| `/api/billing/recovery` | Force subscription sync | POST |
| `/api/settings/sessions/revoke-all` | Force logout all devices | POST |

### Key Database Queries for Incident Investigation

```sql
-- Recent errors in audit log
SELECT * FROM "AuditLog" WHERE action LIKE '%failed%' OR action LIKE '%error%'
ORDER BY "createdAt" DESC LIMIT 20;

-- Unprocessed payment webhooks
SELECT * FROM "PaymentWebhook" WHERE processed = false
ORDER BY "receivedAt" DESC;

-- Failed payment orders
SELECT * FROM "PaymentOrder" WHERE status = 'failed'
ORDER BY "createdAt" DESC LIMIT 20;

-- Active sessions count
SELECT count(*) FROM "UserSession" WHERE "isRevoked" = false AND "expiresAt" > NOW();

-- Subscription state distribution
SELECT status, count(*) FROM "Subscription" GROUP BY status;

-- Credit anomalies (negative credits)
SELECT id, email, credits FROM "User" WHERE credits < 0;

-- Recent login failures (potential brute force)
SELECT ip, count(*) as attempts FROM "LoginHistory"
WHERE success = false AND "createdAt" > NOW() - INTERVAL '1 hour'
GROUP BY ip HAVING count(*) > 5
ORDER BY attempts DESC;

-- AI cost spike detection
SELECT date("createdAt"), sum("creditsCost") as total_cost, count(*) as requests
FROM "AiCostRecord"
WHERE "createdAt" > NOW() - INTERVAL '7 days'
GROUP BY date("createdAt")
ORDER BY date("createdAt") DESC;
```

---

## Appendix: On-Call Handbook

### Before Your Shift

- [ ] Read this document completely
- [ ] Ensure PagerDuty app is installed and notifications are on
- [ ] Have SSH access to production servers
- [ ] Have admin credentials for Grafana, Sentry, and provider dashboards
- [ ] Know the location of the runbooks
- [ ] Confirm backup on-call is available

### During Your Shift

- **Acknowledge alerts within 5 minutes** (P1/P2)
- **Post to Slack** when you pick up an alert
- **Follow the runbook** — don't improvise unless the runbook fails
- **Communicate frequently** — silence is the enemy
- **Ask for help** — escalate early, not late
- **Document everything** — timestamps, commands, outputs

### After Your Shift

- **Hand off open incidents** to the next on-call
- **Complete post-mortems** for any P1/P2 incidents
- **Update runbooks** if you discovered gaps
- **Report near-misses** — things that almost became incidents

### Tools Access

| Tool | URL | Access Method |
|------|-----|--------------|
| PagerDuty | https://acquisitionos.pagerduty.com | SSO |
| Grafana | https://grafana.acquisitionos.com | SSO |
| Sentry | https://sentry.io/organizations/acquisitionos | SSO |
| AWS Console | https://console.aws.amazon.com | SSO + MFA |
| Stripe Dashboard | https://dashboard.stripe.com | Email + MFA |
| Razorpay Dashboard | https://dashboard.razorpay.com | Email + MFA |
| Vercel Dashboard | https://vercel.com/acquisitionos | GitHub SSO |
| Status Page | https://status.acquisitionos.com | Admin login |

---

**See also**:
- [RUNBOOK.md](./RUNBOOK.md) — Operational runbook
- [GO_LIVE.md](./GO_LIVE.md) — Go-live checklist
- [ROLLBACK.md](./ROLLBACK.md) — Rollback procedures
