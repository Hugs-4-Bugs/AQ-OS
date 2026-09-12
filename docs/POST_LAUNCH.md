# AcquisitionOS — Post-Launch Operations

> **Version**: 1.0 | **Last Updated**: 2026-03-06 | **Owner**: Platform Team

Operational guide for the critical post-launch period. Covers monitoring, priorities, baselines, feedback, known issues, and scaling.

---

## Table of Contents

1. [First 24 Hours Monitoring](#1-first-24-hours-monitoring)
2. [First Week Priorities](#2-first-week-priorities)
3. [Performance Baselines](#3-performance-baselines)
4. [User Feedback Channels](#4-user-feedback-channels)
5. [Known Issues Tracking](#5-known-issues-tracking)
6. [Scaling Triggers](#6-scaling-triggers)

---

## 1. First 24 Hours Monitoring

### 1.1 Hour-by-Hour Checklist

| Hour | Focus | Actions |
|------|-------|---------|
| 0–1 | Deployment stability | Verify health checks, monitor error rate, check all containers running |
| 1–2 | Core flows | Test signup, login, payment, lead search — verify no regressions |
| 2–4 | User-facing validation | Monitor real user signups, payment attempts, support tickets |
| 4–8 | System stability | Check memory/CPU trends, verify cron jobs ran, review Sentry |
| 8–12 | Billing validation | Verify webhooks processed, subscriptions correct, credits allocated |
| 12–24 | Comprehensive review | Full error rate analysis, performance review, backup verification |

### 1.2 Critical Metrics Dashboard

Monitor these metrics continuously in Grafana during the first 24 hours:

| Metric | Target | Alert Threshold | Check Frequency |
|--------|--------|----------------|-----------------|
| HTTP 5xx rate | <0.5% | >2% for 5 min → P2 alert | Every 5 min |
| HTTP 4xx rate | <5% | >10% for 10 min → P3 alert | Every 5 min |
| P95 API latency | <500ms | >2s for 5 min → P2 alert | Every 5 min |
| P99 API latency | <2s | >5s for 5 min → P1 alert | Every 5 min |
| Memory usage | <75% | >85% → P2, >95% → P1 | Every 5 min |
| CPU usage | <60% | >80% for 15 min → P2 | Every 5 min |
| DB connection pool | <50% | >80% → P2, >95% → P1 | Every 5 min |
| Signup success rate | >95% | <80% → P2 alert | Every 15 min |
| Payment success rate | >99% | <95% → P1 alert | Every 15 min |
| Active WebSocket connections | Trend | >80% of max → P3 | Every 15 min |

### 1.3 Hourly Health Check Command

```bash
#!/bin/bash
# post-launch-check.sh — Run every hour for first 24 hours
echo "=== Post-Launch Health Check $(date) ==="

# Basic health
curl -sf http://localhost:3000/api/health | jq . || echo "❌ HEALTH CHECK FAILED"

# Error rate (from last hour logs)
docker compose logs frontend --since 1h 2>/dev/null | rg -c "500|5xx" || echo "0 5xx errors"

# Memory check
curl -sf http://localhost:3000/api/health/detailed | jq '.components.memory'

# Payment check
docker compose exec -T postgres psql -U postgres -d acquisitionos -c \
  "SELECT count(*) FROM \"PaymentOrder\" WHERE status='pending' AND \"createdAt\" < NOW() - INTERVAL '1 hour';"

# Webhook check
docker compose exec -T postgres psql -U postgres -d acquisitionos -c \
  "SELECT count(*) FROM \"PaymentWebhook\" WHERE processed=false;"

echo "=== Check Complete ==="
```

### 1.4 Red Flags — Escalate Immediately

- Any `SELECT * FROM "User"` query in logs (potential data leak)
- Stripe/Razorpay webhook failures >3 in a row
- User reported they were charged but didn't get Pro/Elite
- Google OAuth callback returning errors for all users
- AI features returning errors for >50% of requests
- Memory climbing monotonically without stabilizing (leak)

---

## 2. First Week Priorities

### 2.1 Day 1–2: Stabilization

- [ ] **Monitor error rates** — Ensure <2% 5xx across all endpoints
- [ ] **Verify all webhook flows** — Stripe + Razorpay webhooks processing correctly
- [ ] **Check first 50 signups** — Validate user data, plan assignments, credit allocations
- [ ] **Review payment pipeline** — Every payment has matching PaymentOrder, Subscription, CreditsLedger
- [ ] **Test all auth flows** — Email/password, Google OAuth, OTP, magic link, MFA
- [ ] **Monitor AI feature usage** — Z-AI API costs within budget, quality acceptable

### 2.2 Day 3–4: Optimization

- [ ] **Review slow queries** — Check `pg_stat_statements` for queries >100ms
- [ ] **Add missing indexes** — Based on actual query patterns from production
- [ ] **Tune rate limits** — Adjust if legitimate users hitting limits
- [ ] **Review CORS/caching** — Fine-tune CDN caching rules
- [ ] **Optimize AI prompts** — Reduce token usage if responses are wasteful
- [ ] **Check backup integrity** — Verify all backups from first 3 days are restorable

### 2.3 Day 5–7: Hardening

- [ ] **Security review** — Re-run security scan, check for new vulnerabilities
- [ ] **Update dependencies** — Patch any security advisories
- [ ] **Review audit logs** — Check for suspicious patterns (repeated failed logins, unusual API usage)
- [ ] **Test rollback procedure** — Verify rollback still works in production
- [ ] **Document runbook additions** — Any new operational procedures discovered
- [ ] **Performance baseline** — Capture and document baseline metrics (see Section 3)

### 2.4 Prioritized Bug Triage

| Priority | Definition | Response Time | Example |
|----------|-----------|---------------|---------|
| P0 — Critical | Service down, data loss, security breach | <15 min | Site returning 500 for all users |
| P1 — High | Core feature broken for all/most users | <4 hours | Payments not processing, login broken |
| P2 — Medium | Feature degraded or broken for some users | <24 hours | Gmail sync intermittent, slow AI responses |
| P3 — Low | Minor issue, workaround available | <1 week | UI glitch on specific browser, typo |
| P4 — Cosmetic | Visual/polish issues | Backlog | Alignment off by 2px, color inconsistency |

---

## 3. Performance Baselines

### 3.1 Capture Baselines Within First Week

Record these metrics during normal operation (no load test, typical traffic) for future comparison:

| Metric | Measurement | Command |
|--------|-------------|---------|
| API P50 latency | By endpoint | `curl -w '%{time_total}' -o /dev/null -s https://app.acquisitionos.com/api/health` |
| API P95 latency | By endpoint | Grafana histogram over 24h |
| API P99 latency | By endpoint | Grafana histogram over 24h |
| Page load time | Initial + TTI | Lighthouse CI or WebPageTest |
| Database query time | Avg by table | `SELECT relname, mean_exec_time FROM pg_stat_statements ORDER BY mean_exec_time DESC LIMIT 20` |
| Memory baseline | Steady-state | `curl -s http://localhost:3000/api/health/detailed | jq .components.memory` |
| CPU baseline | Steady-state | `docker stats --no-stream` |
| DB size | On disk | `SELECT pg_size_pretty(pg_database_size('acquisitionos'))` |
| Redis memory | Used vs max | `redis-cli INFO memory | rg used_memory_human` |
| Concurrent users | Peak | Grafana active users metric |
| Signup rate | Per hour | `SELECT count(*) FROM "User" WHERE "createdAt" > NOW() - INTERVAL '1 hour'` |
| Payment rate | Per hour | `SELECT count(*) FROM "PaymentOrder" WHERE "createdAt" > NOW() - INTERVAL '1 hour'` |

### 3.2 Baseline Template

```markdown
## Performance Baseline — [DATE]

### Environment
- Server: [specs]
- Database: [PostgreSQL version, size]
- Cache: [Redis version, memory]
- Users: [count]

### API Latency (24h average)
| Endpoint | P50 | P95 | P99 |
|----------|-----|-----|-----|
| GET /api/health | __ms | __ms | __ms |
| POST /api/auth/signin | __ms | __ms | __ms |
| GET /api/leads | __ms | __ms | __ms |
| POST /api/leads/discover | __ms | __ms | __ms |
| GET /api/subscriptions/current | __ms | __ms | __ms |

### Resource Utilization
- Memory steady-state: __MB (__% of limit)
- CPU steady-state: __%
- DB connections: __/max
- Redis memory: __MB

### User Metrics
- Total users: __
- Active users (24h): __
- Signups/day: __
- Payments/day: __
- AI requests/day: __
```

### 3.3 Regression Detection

After any deployment, compare against baseline:

| Metric | Regression Threshold | Action |
|--------|---------------------|--------|
| P95 latency | >50% increase from baseline | Investigate, consider rollback |
| Error rate | >2x baseline | Rollback, investigate |
| Memory | >20% increase from baseline at same load | Check for leak |
| CPU | >20% increase from baseline at same load | Profile, optimize |
| DB query time | >50% increase from baseline | Check for missing index, N+1 |

---

## 4. User Feedback Channels

### 4.1 Feedback Collection

| Channel | Setup | Response SLA | Priority Boost |
|---------|-------|-------------|----------------|
| In-app feedback form | Settings → Help & Feedback | 24h | +1 priority |
| Email: support@acquisitionos.com | Help Scout / Gmail | 8h business hours | Standard |
| In-app chat (WebSocket) | Bottom-right chat widget | 4h business hours | +1 for Pro/Elite |
| Social media mentions | Twitter/LinkedIn monitoring | 4h | +2 for public complaints |
| App store reviews | (if applicable) | 24h | Standard |
| GitHub issues | Public repo (if applicable) | 48h | Low |

### 4.2 Feedback Triage Process

1. **Receive** — Feedback arrives via any channel
2. **Classify** — Bug, feature request, question, complaint
3. **Prioritize** — Apply P0–P4 based on impact + urgency
4. **Assign** — Route to appropriate team member
5. **Respond** — Acknowledge within SLA
6. **Track** — Log in issue tracker with user impact count
7. **Close** — Follow up with user when resolved

### 4.3 First-Week Feedback Metrics

Track these during the first week:

| Metric | Target | Alert If |
|--------|--------|----------|
| Feedback volume | Baseline | >5x expected volume |
| Bug report rate | <5/day | >10/day → review quality |
| CSAT score | >4.0/5.0 | <3.5 → urgent review |
| NPS | >30 | <0 → stop feature work, fix issues |
| Avg response time | <4h | >12h → add support capacity |
| Escalation rate | <10% | >25% → product quality concern |

---

## 5. Known Issues Tracking

### 5.1 Current Known Issues

| ID | Issue | Severity | Workaround | Fix ETA |
|----|-------|----------|------------|---------|
| KI-001 | In-memory rate limiter resets on server restart | Low | Accept; upgrade to Redis-backed when scaling | Phase 15 |
| KI-002 | `withCsrfProtection()` exists but not applied to routes | Medium | Middleware CSRF provides baseline | Phase 15 |
| KI-003 | CSP allows `unsafe-eval`/`unsafe-inline` | Medium | Accept for now; nonce-based CSP planned | Phase 15 |
| KI-004 | SSE connection limits not enforced per user | Low | Accept; monitor in production | Phase 15 |
| KI-005 | WhatsApp integration requires Twilio/Meta Business API setup | Low | Follow WEBHOOK_SETUP_GUIDE.md | On demand |
| KI-006 | 7 pre-existing test failures (mock drift in competitors/workflows tests) | Low | Tests in CI only, not production | Ongoing |

### 5.2 Issue Discovery Process

When a new issue is discovered post-launch:

1. **Reproduce** — Confirm the issue is real, not user error
2. **Assess impact** — How many users affected? Data loss? Security?
3. **Assign severity** — P0 through P4 (see triage table in Section 2.4)
4. **Log** — Add to known issues table above
5. **Communicate** — If P0/P1, post to `#incident-response` Slack
6. **Fix** — Deploy hotfix or schedule for next release
7. **Verify** — Confirm fix in production, update table

### 5.3 Regression Tracking

Any fix that introduces a new issue is tracked as:

| Field | Description |
|-------|-------------|
| Original Issue | The issue that was "fixed" |
| Regression | The new issue introduced by the fix |
| Root Cause | Why the fix caused the regression |
| Prevention | How to prevent similar regressions |

---

## 6. Scaling Triggers

### 6.1 Vertical Scaling (Scale Up)

Scale up individual resources when these thresholds are hit:

| Resource | Trigger | Action | Lead Time |
|----------|---------|--------|-----------|
| Memory | >85% sustained for 30 min | Increase container memory limit | ~5 min (restart) |
| CPU | >80% sustained for 15 min | Increase CPU allocation | ~5 min (restart) |
| DB storage | >80% disk used | Increase storage volume | ~15 min (AWS) |
| DB connections | >90% pool used | Increase pool size in config | ~5 min (restart) |
| Redis memory | >85% of maxmemory | Increase maxmemory or add eviction policy | ~5 min (restart) |

### 6.2 Horizontal Scaling (Scale Out)

Add more instances when these thresholds are hit:

| Metric | Trigger | Action | Lead Time |
|--------|---------|--------|-----------|
| Concurrent users | >500 per instance | Add Next.js instance behind load balancer | ~10 min |
| API request rate | >500 req/s per instance | Add API instances | ~10 min |
| Celery queue depth | >1000 tasks pending | Add worker instances (`--scale celery-worker=N`) | ~5 min |
| WebSocket connections | >1000 per instance | Add WebSocket service instances | ~10 min |
| DB read replicas | Read latency >200ms | Add read replica, route reads | ~30 min |

### 6.3 Infrastructure Scaling Roadmap

| Users | Infrastructure | Estimated Cost/mo |
|-------|---------------|-------------------|
| 0–500 | Single instance (2 vCPU, 4GB RAM) + SQLite/Supabase Free | $20–50 |
| 500–2,000 | 2 instances (4 vCPU, 8GB each) + PostgreSQL + Redis | $100–300 |
| 2,000–10,000 | 3+ instances + PgBouncer + Redis Cluster + CDN | $300–800 |
| 10,000+ | Kubernetes + managed DB + Redis Enterprise | $800+ |

### 6.4 Auto-Scaling Configuration (Future)

```yaml
# Target: Kubernetes HPA for Next.js frontend
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
spec:
  minReplicas: 2
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 80
```

### 6.5 Scaling Decision Matrix

| Symptom | Likely Bottleneck | Immediate Fix | Long-term Fix |
|---------|-------------------|---------------|---------------|
| Slow page loads | CPU/Network | Scale up instance | CDN + edge caching |
| Slow API responses | DB/CPU | Add DB indexes, scale up | Read replicas |
| OOM kills | Memory | Increase memory limit | Fix memory leaks |
| High queue depth | Workers | Scale workers horizontally | Optimize task duration |
| Slow AI responses | Z-AI API | Accept (external) | Cache + prompt optimization |
| Webhook lag | Processing time | Scale workers | Batch processing |

---

**See also**:
- [LAUNCH_CHECKLIST.md](./LAUNCH_CHECKLIST.md) — Launch day checklist
- [SLA.md](./SLA.md) — Service level agreements
- [SUPPORT.md](./SUPPORT.md) — Support procedures
- [RUNBOOK.md](./RUNBOOK.md) — Operational runbook
- [PRODUCTION_READINESS.md](./PRODUCTION_READINESS.md) — Readiness assessment
