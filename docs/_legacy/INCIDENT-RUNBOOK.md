# AcquisitionOS — Incident Response Runbook

> **Version**: 2.0 | **Last Updated**: 2026-03-07 | **Owner**: Platform Team

Step-by-step incident response procedures for AcquisitionOS on-call engineers. Covers common failure scenarios with exact commands and resolution steps.

> **Companion Docs**: [INCIDENT_RESPONSE.md](./INCIDENT_RESPONSE.md) (severity levels, SLAs, escalation) | [RUNBOOK.md](./RUNBOOK.md) (operations, backup, cron) | [ROLLBACK.md](./ROLLBACK.md) (rollback procedures) | [DISASTER_RECOVERY.md](./DISASTER_RECOVERY.md)

---

## Incident Severity Levels

| Level | Name | Response | Definition | Example |
|-------|------|----------|-----------|---------|
| **P1** | Critical | < 5 min | Complete outage or data breach | DB down, auth broken, payment compromised |
| **P2** | High | < 15 min | Major feature broken, no workaround | Payments failing, AI completely down, login broken |
| **P3** | Medium | < 1 hour | Minor feature degraded, workaround exists | Slow AI, email delayed, WebSocket down |
| **P4** | Low | < 4 hours | Non-urgent, cosmetic | UI glitch, minor text error |

## Escalation Matrix

```
Alert (Prometheus → PagerDuty)
  → L1: On-Call Engineer (5 min P1 / 15 min P2)
    → L2: Platform Lead (15 min P1 / 1 hour P2)
      → L3: Engineering Manager (30 min P1)
        → L4: VP Engineering (emergency all-hands)
```

---

## Scenario 1: Database Outage (P1)

### Symptoms
- All API endpoints returning 5xx
- `ECONNREFUSED` or Prisma `P1001` errors
- `APIEndpointDown` alert firing

### Diagnosis

```bash
# Check PostgreSQL status
docker compose exec postgres pg_isready -U postgres

# Check if PostgreSQL process is running
docker compose ps postgres

# Check disk space
df -h

# Check active connections
docker compose exec postgres psql -U postgres -c "
  SELECT count(*), state FROM pg_stat_activity GROUP BY state;
"

# Check recent logs
docker compose logs postgres --tail=50
```

### Resolution

```bash
# 1. If PostgreSQL is not running
docker compose restart postgres
docker compose exec postgres pg_isready -U postgres

# 2. If connection pool exhausted, kill long-running queries
docker compose exec postgres psql -U postgres -c "
  SELECT pg_terminate_backend(pid) FROM pg_stat_activity
  WHERE state = 'active' AND query_start < now() - interval '5 minutes';
"

# 3. If disk is full, clear space
docker system prune -af
# Or expand volume

# 4. If data corruption, restore from backup
docker compose stop frontend backend celery-worker
bash scripts/backup/restore.sh --latest --type postgres
docker compose start backend frontend celery-worker

# 5. Verify recovery
curl -sf http://localhost:3000/api/health/detailed | jq .
```

### Recovery Time Target
- **Redis restart**: < 30 seconds
- **PostgreSQL restart**: < 2 minutes
- **Backup restore**: < 15 minutes (depends on DB size)

---

## Scenario 2: Redis Failure (P1)

### Symptoms
- Cache misses, session errors
- Celery queue not processing tasks
- WebSocket failures
- `RedisDown` alert firing

### Diagnosis

```bash
# Check Redis status
docker compose exec redis redis-cli -a "$REDIS_PASSWORD" PING

# Check Redis info
docker compose exec redis redis-cli -a "$REDIS_PASSWORD" INFO server
docker compose exec redis redis-cli -a "$REDIS_PASSWORD" INFO memory

# Check for OOM
docker compose exec redis redis-cli -a "$REDIS_PASSWORD" --bigkeys
```

### Resolution

```bash
# 1. If Redis OOM, clear cache keys (safe)
docker compose exec redis redis-cli -a "$REDIS_PASSWORD" --scan --pattern "acos:cache:*" | \
  xargs docker compose exec -T redis redis-cli -a "$REDIS_PASSWORD" DEL

# 2. Restart Redis
docker compose restart redis

# 3. Verify Celery workers reconnect
docker compose logs celery-worker --tail=20 | rg "ready"

# 4. Check WebSocket service reconnects
docker compose logs ws-service --tail=20 | rg "redis|connect"
```

### Impact
- Rate limiter counters reset (temporary abuse window)
- Sessions need re-authentication (access tokens expire in 15 min)
- Celery tasks re-queued on reconnect

---

## Scenario 3: Auth Service Down (P2)

### Symptoms
- Login/signup returning 500
- OTP/magic link requests failing
- Google OAuth not working

### Diagnosis

```bash
# Check health
curl -sf http://localhost:3000/api/auth/signin -X POST -H "Content-Type: application/json" -d '{}' | head

# Check logs for auth errors
docker compose logs frontend --since 10m | rg "auth|JWT|signin|signup|otp"

# Check if JWT_SECRET is loaded
docker compose exec frontend env | rg JWT_SECRET | wc -c
# Should be > 64 characters
```

### Resolution

```bash
# 1. If JWT_SECRET is missing or invalid
docker compose exec frontend sh -c 'echo $JWT_SECRET | wc -c'
# If empty or short, update .env and restart

# 2. If rate limiter is blocking legitimate users
# In-memory rate limiter resets on restart
docker compose restart frontend

# 3. If Google OAuth failing
# Check credentials are correct
docker compose exec frontend env | rg GOOGLE_CLIENT
# Verify redirect URI matches in Google Console

# 4. If SMTP is down (blocking email-based auth)
# Check SMTP connectivity
docker compose logs frontend --since 30m | rg "SMTP|email|smtp"
# Temporary: users can still use Google OAuth if enabled
```

---

## Scenario 4: Payment Processing Failure (P2)

### Symptoms
- Users unable to complete checkout
- Webhooks not being processed
- Subscription activations failing
- `HighErrorRate` on payment endpoints

### Diagnosis

```bash
# Check provider status pages
curl -sf https://status.stripe.com > /dev/null && echo "Stripe status page accessible"
curl -sf https://status.razorpay.com > /dev/null && echo "Razorpay status page accessible"

# Check unprocessed webhooks
# PostgreSQL:
docker compose exec postgres psql -U postgres -c "
  SELECT id, provider, \"eventId\", processed, \"receivedAt\"
  FROM \"PaymentWebhook\" WHERE processed = false
  ORDER BY \"receivedAt\" DESC LIMIT 20;
"

# Check failed payment orders
docker compose exec postgres psql -U postgres -c "
  SELECT id, status, provider, \"createdAt\"
  FROM \"PaymentOrder\" WHERE status = 'failed'
  ORDER BY \"createdAt\" DESC LIMIT 20;
"

# Check for subscription/plan mismatches
docker compose exec postgres psql -U postgres -c "
  SELECT u.email, u.plan, po.plan as paid_plan, po.status
  FROM \"User\" u JOIN \"PaymentOrder\" po ON po.\"userId\" = u.id
  WHERE po.status = 'completed' AND u.plan != po.plan
  ORDER BY po.\"createdAt\" DESC LIMIT 10;
"
```

### Resolution

```bash
# 1. If single provider is down, users can use the other
# Stripe → Razorpay fallback (automatic in UI)

# 2. Re-process failed webhooks via API
curl -X POST https://app.acquisitionos.com/api/payments/webhook-replay \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"eventId": "evt_xxx"}'

# 3. Or resend from Stripe CLI
stripe events resend evt_xxx

# 4. Manual subscription fix for stuck activations
docker compose exec postgres psql -U postgres -d acquisitionos -c "
  UPDATE \"User\" SET plan = 'pro', credits = 500 WHERE id = 'USER_ID';
  UPDATE \"Subscription\" SET plan = 'pro', status = 'active'
    WHERE \"userId\" = 'USER_ID';
  INSERT INTO \"CreditsLedger\" (id, \"userId\", action, credits, balance, description)
    VALUES (gen_random_uuid(), 'USER_ID', 'manual_adjustment', 500, 500,
      'Manual fix after payment webhook failure');
"

# 5. If both providers are down (P1), disable payment UI temporarily
# Post to status page and communicate with affected users
```

> **Full Reference**: [RUNBOOK.md](./RUNBOOK.md) §7 (Payment Failure Recovery)

---

## Scenario 5: High Error Rate Spike (P2)

### Symptoms
- `HighErrorRate` alert (> 5% 5xx for 5 min)
- Sentry showing new error groups
- User complaints about errors

### Diagnosis

```bash
# Identify error sources
docker compose logs frontend --tail=200 | rg "ERROR|500|5xx"
docker compose logs backend --tail=200 | rg "ERROR|traceback|500"

# Check Sentry
# https://sentry.io/organizations/acquisitionos

# Check recent deployments
git log --oneline -5

# Check database health
curl -sf http://localhost:3000/api/health/detailed | jq '.components'
```

### Resolution

```bash
# 1. If bad deployment → Rollback
git checkout <previous-commit>
docker compose build && docker compose up -d --force-recreate
# See ROLLBACK.md for detailed procedure

# 2. If DB pool exhaustion → Restart
docker compose restart frontend backend

# 3. If external API failure → Check provider, enable fallback
# Z-AI API fallback: ai-provider-fallback.ts → Anthropic

# 4. If memory pressure → Restart with increased limits
docker compose restart frontend

# 5. Emergency: enable maintenance mode if >20% error rate
docker compose exec nginx touch /tmp/maintenance-mode
docker compose exec nginx nginx -s reload
```

---

## Scenario 6: Memory / CPU Exhaustion (P2)

### Symptoms
- `MemoryPressureCritical` alert (> 95%)
- OOM kills in Docker logs
- Services restarting repeatedly
- `HighCPUUsage` alert (> 85% for 15 min)

### Diagnosis

```bash
# Check resource usage
docker stats --no-stream

# Check Node.js heap
curl -sf http://localhost:3000/api/health/detailed | jq '.components.memory'

# Check if specific container is the problem
docker compose ps
docker stats --no-stream acquisitionos-app
docker stats --no-stream acquisitionos-postgres
docker stats --no-stream acquisitionos-redis
```

### Resolution

```bash
# 1. Immediate: restart the affected service
docker compose restart app

# 2. If Redis OOM, clear cache
docker compose exec redis redis-cli -a "$REDIS_PASSWORD" --scan --pattern "acos:cache:*" | \
  xargs docker compose exec -T redis redis-cli -a "$REDIS_PASSWORD" DEL

# 3. Scale workers if Celery is the issue
docker compose up -d --scale celery-worker=4

# 4. Long-term: increase memory limits in docker-compose.prod.yml
# deploy.resources.limits.memory: 2048M → 4096M

# 5. Check for memory leaks
# Compare heap snapshots over time in Grafana
```

---

## Scenario 7: SSL Certificate Expiry (P2 → P1)

### Symptoms
- Browser warnings about expired certificate
- API clients failing with TLS errors
- Let's Encrypt expiry notification

### Diagnosis

```bash
# Check certificate expiry
echo | openssl s_client -connect app.acquisitionos.com:443 2>/dev/null | \
  openssl x509 -noout -dates

# Check SSL Labs rating
curl -sf https://www.ssllabs.com/ssltest/analyze.html?d=app.acquisitionos.com
```

### Resolution

```bash
# 1. Renew Let's Encrypt certificate
certbot certonly --standalone -d app.acquisitionos.com

# 2. Copy new certificates
cp /etc/letsencrypt/live/app.acquisitionos.com/fullchain.pem ./ssl/
cp /etc/letsencrypt/live/app.acquisitionos.com/privkey.pem ./ssl/

# 3. Reload Nginx
docker compose exec nginx nginx -s reload

# 4. Verify
echo | openssl s_client -connect app.acquisitionos.com:443 2>/dev/null | \
  openssl x509 -noout -dates

# 5. Ensure auto-renewal cron exists
# 0 0 * * * certbot renew --quiet --post-hook "docker compose restart nginx"
```

---

## Rollback Procedure

### Application Rollback

```bash
# 1. Identify the last known-good commit
git log --oneline -10

# 2. Check out the working version
git checkout <commit-hash>

# 3. Rebuild and deploy
docker compose build
docker compose up -d --force-recreate

# 4. Verify
curl -sf http://localhost:3000/api/health | jq .
curl -sf http://localhost:3000/api/health/detailed | jq .
```

### Database Migration Rollback

```bash
# 1. Stop application services
docker compose stop frontend backend celery-worker

# 2. Restore from pre-deployment backup
bash scripts/backup/restore.sh --latest --type postgres

# 3. Start services
docker compose start backend
sleep 10
docker compose start celery-worker celery-beat frontend

# 4. Verify
curl -sf http://localhost:3000/api/health/detailed | jq .
```

> **Full Rollback Reference**: [ROLLBACK.md](./ROLLBACK.md)

---

## Post-Incident Review Template

Complete for all P1/P2 incidents within **48 hours**.

```markdown
## Post-Mortem: INC-YYYYMMDD-NNN

**Severity**: P1/P2
**Duration**: XX hours YY minutes
**Date**: YYYY-MM-DD

### Timeline
| Time | Event |
|------|-------|
| HH:MM | Alert fired |
| HH:MM | On-call acknowledged |
| HH:MM | Root cause identified |
| HH:MM | Mitigation applied |
| HH:MM | All-clear declared |

### Root Cause
[Technical explanation]

### Five Whys
1. Why? → [Answer]
2. Why? → [Answer]
3. Why? → [Answer]
4. Why? → [Answer]
5. Why? → [Root cause]

### Impact
- Users affected: [count]
- Revenue impact: [amount]
- Data loss: [none / description]

### Action Items
| # | Action | Owner | Due | Status |
|---|--------|-------|-----|--------|
| 1 | [Action] | @owner | date | ☐ |
```

> **Full Template**: [INCIDENT_RESPONSE.md](./INCIDENT_RESPONSE.md) §5
