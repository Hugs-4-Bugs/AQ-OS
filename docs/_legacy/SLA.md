# AcquisitionOS — Service Level Agreement (SLA)

> **Version**: 2.0 | **Last Updated**: 2026-03-07 | **Owner**: Platform Team

This document defines the service level targets for the AcquisitionOS SaaS platform at `app.acquisitionos.com`.

> **Companion Docs**: [INCIDENT_RESPONSE.md](./INCIDENT_RESPONSE.md) | [SUPPORT.md](./SUPPORT.md) | [PRODUCTION_READINESS.md](./PRODUCTION_READINESS.md)

---

## 1. Service Availability

### Target

| Metric | Target |
|--------|--------|
| **Monthly uptime** | **99.5%** |
| **Annual uptime** | **99.5%** |
| **Allowed monthly downtime** | ~3.6 hours (based on 43,200 min/month) |

### Uptime Calculation

```
Uptime % = (Total minutes − Downtime minutes) / Total minutes × 100
```

- **Downtime starts**: When `/api/health` returns non-200 for > 2 consecutive minutes
- **Downtime ends**: When `/api/health` returns 200 for 5 consecutive minutes

### Exclusions (Does NOT Count as Downtime)

- Scheduled maintenance windows (see §4)
- Third-party service outages (Google OAuth, Stripe, Razorpay, Z-AI API)
- Issues caused by customer's own infrastructure (browser, network)
- DNS propagation delays
- Force majeure events
- Degraded but functional performance within response time targets

### Best-Effort Services (No SLA Guarantee)

| Service | Reason |
|---------|--------|
| Telegram integration | Depends on Telegram Bot API |
| WhatsApp integration | Depends on Meta/Twilio API |
| Gmail integration | Depends on Google API + user OAuth token |
| Google Calendar integration | Depends on Google API + user OAuth token |
| AI-powered features | Depends on Z-AI API availability |

---

## 2. Response Time Targets

### API Response Times

| Endpoint Category | P50 | P95 | P99 |
|-------------------|-----|-----|-----|
| Health check (`/api/health`) | < 20ms | < 50ms | < 100ms |
| Auth (`/api/auth/*`) | < 100ms | < 200ms | < 500ms |
| Lead CRUD (`/api/leads`) | < 100ms | < 300ms | < 500ms |
| Lead discovery (`/api/leads/discover`) | < 3s | < 10s | < 30s |
| AI chat (`/api/sales-assistant`) | < 2s | < 10s | < 30s |
| Settings (`/api/settings/*`) | < 100ms | < 200ms | < 500ms |
| Payment (`/api/payments/*`) | < 200ms | < 500ms | < 1s |
| Webhook endpoints | < 500ms | < 1s | < 2s |

### Page Load Times

| Page | Target (4G) |
|------|-----------|
| Login/signup | < 2s TTI |
| Dashboard | < 3s LCP |
| Lead list | < 3s LCP |
| Settings | < 3s LCP |
| Pricing | < 2s LCP |

---

## 3. Support Response Times

### By Severity

| Severity | First Response | Update Frequency | Resolution Target |
|----------|---------------|-----------------|-------------------|
| **Critical** (service down, data loss) | **4 hours** | Every 1 hour | **24 hours** |
| **High** (major feature broken) | **8 hours** | Every 4 hours | **72 hours** |
| **Medium** (feature degraded) | **24 hours** | Every 24 hours | **7 business days** |
| **Low** (minor issue) | **48 hours** | On resolution | **30 business days** |

### By Plan

| Plan | Critical | High | Medium | Low |
|------|----------|------|--------|-----|
| **Free** | 8 hours | 24 hours | 48 hours | Best effort |
| **Pro** | 4 hours | 8 hours | 24 hours | 48 hours |
| **Elite** | **2 hours** | **4 hours** | **12 hours** | **24 hours** |

### Support Hours

- **Critical/High**: 24/7 via PagerDuty on-call
- **Medium/Low**: Monday–Friday, 9 AM–6 PM IST
- **Holidays**: Critical only; others handled next business day

---

## 4. Maintenance Windows

| Type | Schedule | Duration | Notice |
|------|----------|----------|--------|
| Regular maintenance | 1st & 3rd Sunday, 2:00–4:00 AM IST | ≤ 2 hours | 72 hours advance |
| Emergency maintenance | As needed | ≤ 30 min | 30 min advance (best effort) |
| Database migration | During regular window | ≤ 1 hour | 72 hours advance |
| Security patches | During regular window | ≤ 30 min | 24 hours advance |

### Zero-Downtime Deployments

Standard deployments target zero downtime via:
- Rolling updates with health check gates
- Backward-compatible database migrations
- Feature flags for risky changes
- Blue-green deployment for major versions

---

## 5. Incident Communication

| Severity | Status Page Update | Customer Email |
|----------|-------------------|---------------|
| **P1** (Critical) | Every 15 min | Within 15 min |
| **P2** (High) | Every 30 min | Within 30 min |
| **P3** (Medium) | On resolution | No |
| **P4** (Low) | No | No |

### Status Page States

| State | Meaning |
|-------|---------|
| 🟢 Operational | All systems normal |
| 🟡 Degraded Performance | Some features slower |
| 🟠 Partial Outage | Some features unavailable |
| 🔴 Major Outage | Core features unavailable |
| 🔵 Maintenance | Scheduled maintenance in progress |

---

## 6. Resolution Targets

### Incident Resolution SLAs

| Severity | Target | Measurement |
|----------|--------|-------------|
| P1 Critical | **2 hours** | From detection to confirmed fix |
| P2 High | **8 hours** | From detection to confirmed fix |
| P3 Medium | **24 hours** | From detection to confirmed fix |
| P4 Low | **1 week** | From detection to confirmed fix |

---

## 7. Service Credits

### Uptime SLA Credits

If monthly uptime falls below target:

| Monthly Uptime | Credit | Cap |
|---------------|--------|-----|
| 99.0%–99.5% | 10% of monthly bill | 10% |
| 95.0%–99.0% | 25% of monthly bill | 25% |
| Below 95.0% | 50% of monthly bill | 50% |

### Response Time SLA Credits

| Breach | Credit | Cap |
|--------|--------|-----|
| First response > 2× SLA | 5% per incident | 15% |
| Resolution > 2× SLA | 10% per incident | 30% |

### Claiming Credits

- Must be claimed within **30 days** of breach
- Email: support@acquisitionos.com with subject "SLA Credit Claim"
- Include: date/time, affected service, impact description
- Credits applied to next billing cycle

### Exclusions (No Credits Owed)

- Downtime during scheduled maintenance windows
- Third-party service outages (Google, Stripe, Razorpay, Z-AI)
- Customer misconfiguration
- Force majeure events
- **Free plan users** (no SLA coverage)

---

## 8. Uptime Reporting

- **Monthly uptime report** published on status page
- **Quarterly SLA compliance review**
- **Annual SLA target review and adjustment**

---

## 9. Escalation Path

If support response SLA is breached:

1. **Tier 1** (Support Engineer) → 2× breach →
2. **Tier 2** (Senior Engineer) → 3× breach →
3. **Tier 3** (Engineering Manager) → 4× breach →
4. **Tier 4** (CTO / VP Engineering)
