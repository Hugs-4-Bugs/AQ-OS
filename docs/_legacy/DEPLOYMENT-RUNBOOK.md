# AcquisitionOS — Deployment Runbook

> **Version**: 2.0 | **Last Updated**: 2026-03-07 | **Owner**: Platform Team

Step-by-step deployment guide for AcquisitionOS. Covers prerequisites, deployment steps, database migrations, health verification, and troubleshooting.

> **Companion Docs**: [PRODUCTION_DEPLOYMENT_GUIDE.md](./PRODUCTION_DEPLOYMENT_GUIDE.md) (full infrastructure setup) | [deployment.md](./deployment.md) (local + Docker basics) | [ROLLBACK.md](./ROLLBACK.md) (rollback procedures)

---

## Prerequisites

### Software Requirements

| Software | Version | Required |
|----------|---------|----------|
| Node.js | 20.x | Yes |
| Bun | Latest | Yes |
| Python | 3.11+ | Yes (for FastAPI backend) |
| Docker | 24+ | Production |
| Docker Compose | v2+ | Production |
| Git | 2.40+ | Yes |

### Environment Configuration

All required environment variables must be set in `.env` before deployment. See [ENV_SETUP_GUIDE.md](./ENV_SETUP_GUIDE.md) and [LAUNCH-CHECKLIST.md](./LAUNCH-CHECKLIST.md) §1.

**Critical variables (app will not start without these)**:
- `DATABASE_URL` (PostgreSQL for production)
- `JWT_SECRET` (strong random, ≥64 bytes)
- `JWT_REFRESH_SECRET` (strong random)
- `TOKEN_ENCRYPTION_KEY` (Fernet key)
- `NODE_ENV=production`
- `AUTH_DEV_MODE=false`

### Infrastructure Checklist

- [ ] Server provisioned (≥ 2 vCPU, 4 GB RAM, 20 GB SSD)
- [ ] Docker and Docker Compose installed
- [ ] Firewall configured (ports 80, 443 only)
- [ ] SSL certificate provisioned
- [ ] DNS configured (`app.acquisitionos.com` → server IP)
- [ ] `.env` file populated with production values

---

## Deployment Steps

### Step 1: Pre-Deploy Backup

```bash
# Always backup before deploying
cd /opt/acquisitionos
bash scripts/backup/backup.sh

# Verify backup was created
ls -la backups/$(date +%Y/%m/%d)/
```

### Step 2: Pull Latest Code

```bash
cd /opt/acquisitionos
git fetch origin main
git checkout origin/main
git log --oneline -5  # Review what changed
```

### Step 3: Build Docker Images

```bash
# Build all images
docker compose build

# Or build individually
docker compose build app
docker compose build postgres  # Only if Dockerfile changed
```

### Step 4: Run Database Migrations

```bash
# Push Prisma schema (adds new tables/columns, no data loss)
docker compose run --rm app npx prisma db push

# Generate Prisma client
docker compose run --rm app npx prisma generate

# If using production schema
docker compose run --rm app npx prisma db push --schema=prisma/schema.production.prisma
```

### Step 5: Deploy Services

```bash
# Rolling restart (zero-downtime if replicas > 1)
docker compose up -d

# Or force recreate all containers
docker compose up -d --force-recreate

# Verify all services started
docker compose ps
```

### Step 6: Health Verification

```bash
# Basic health check (should return 200)
curl -sf https://app.acquisitionos.com/api/health | jq .

# Detailed health check (DB, memory, process)
curl -sf https://app.acquisitionos.com/api/health/detailed | jq .

# Check all containers are healthy
docker compose ps

# Check for errors in logs
docker compose logs --tail=50 | rg "ERROR|error|FATAL"
```

### Step 7: Smoke Tests

```bash
# Test authentication endpoint
curl -sf -X POST https://app.acquisitionos.com/api/auth/signin \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"test"}' | jq .

# Test metrics endpoint
curl -sf https://app.acquisitionos.com/api/metrics | head -5

# Test static assets
curl -sfI https://app.acquisitionos.com/_next/static/ | head -1
```

---

## Database Migration Procedure

### Schema Changes (Non-Breaking)

```bash
# 1. Add the new field/table to prisma/schema.prisma
# 2. Test locally: bun run db:push
# 3. Deploy to production:
docker compose run --rm app npx prisma db push
# 4. Regenerate client
docker compose run --rm app npx prisma generate
# 5. Restart app container to pick up new client
docker compose restart app
```

### Schema Changes (Breaking)

Breaking migrations (renaming columns, dropping tables) require a multi-step deploy:

```bash
# Step 1: Add new column alongside old one (deploy v1)
# Step 2: Migrate data from old → new column (one-time script)
# Step 3: Update code to use new column (deploy v2)
# Step 4: Drop old column (deploy v3)
```

### Migration Rollback

```bash
# If migration caused issues:
# 1. Stop app
docker compose stop app

# 2. Restore from pre-migration backup
bash scripts/backup/restore.sh --latest --type postgres

# 3. Revert code to previous commit
git checkout <previous-commit>

# 4. Rebuild and start
docker compose build app
docker compose up -d

# 5. Verify
curl -sf http://localhost:3000/api/health/detailed | jq .
```

> **Full Migration Reference**: [infra/db-migration-rollback.md](../infra/db-migration-rollback.md)

---

## Rollback Steps

### Application Rollback

```bash
# 1. Identify the last known-good commit
git log --oneline -10

# 2. Checkout working version
git checkout <commit-hash>

# 3. Rebuild and deploy
docker compose build
docker compose up -d --force-recreate

# 4. Verify
curl -sf http://localhost:3000/api/health | jq .
```

### Database Rollback

```bash
# 1. Stop services
docker compose stop app backend celery-worker

# 2. Restore from backup
bash scripts/backup/restore.sh --latest --type postgres

# 3. Start services
docker compose start backend
sleep 10
docker compose start celery-worker app

# 4. Verify
curl -sf http://localhost:3000/api/health/detailed | jq .
```

> **Full Rollback Reference**: [ROLLBACK.md](./ROLLBACK.md)

---

## Health Verification Post-Deploy

Run this checklist after every deployment:

```bash
#!/bin/bash
set -e
echo "=== Post-Deploy Health Check ==="

# 1. All containers running
echo -n "Containers: "
docker compose ps --format json | jq -r '.[] | .State' | sort | uniq -c
echo ""

# 2. Health endpoint
echo -n "Health: "
STATUS=$(curl -sf -o /dev/null -w "%{http_code}" http://localhost:3000/api/health)
echo "$STATUS (expect 200)"

# 3. Detailed health
echo "Components:"
curl -sf http://localhost:3000/api/health/detailed | jq '.components | to_entries[] | {key: .key, status: .value.status}'

# 4. No recent errors
echo -n "Recent errors: "
docker compose logs app --since 5m 2>/dev/null | rg -c "ERROR|FATAL" || echo "0"

# 5. Memory usage
echo "Memory:"
docker stats --no-stream --format "table {{.Name}}\t{{.MemUsage}}"

echo "=== Health Check Complete ==="
```

---

## Zero-Downtime Deployment Tips

### Using Multiple Replicas

```yaml
# docker-compose.prod.yml
services:
  app:
    deploy:
      replicas: 2
      update_config:
        parallelism: 1
        delay: 30s
        order: start-first
        failure_action: rollback
```

```bash
# Rolling update (one container at a time)
docker compose up -d --no-deps --build app
```

### Using CI/CD (GitHub Actions)

Deployment is automated via GitHub Actions workflows:

1. **On push to `main`**: Build → Test → Deploy to staging
2. **On release tag**: Build → Test → Deploy to production

Environment-specific deploy keys stored as GitHub Secrets (`PROD_DEPLOY_KEY`, `STAGING_DEPLOY_KEY`).

### Blue-Green Deployment (Advanced)

For major version changes:

```bash
# 1. Deploy new version to "green" containers
docker compose -f docker-compose.yml -f docker-compose.green.yml up -d

# 2. Verify green is healthy
curl -sf http://green-app:3000/api/health

# 3. Switch Nginx upstream to green
# Update nginx.conf upstream → green-app
docker compose exec nginx nginx -s reload

# 4. If issues, switch back to blue
```

---

## Troubleshooting Common Deploy Failures

### Build Failure

```bash
# Clear cache and rebuild
docker compose build --no-cache app

# Check for missing dependencies
docker compose run --rm app bun install

# Check for TypeScript errors
docker compose run --rm app bun run lint
```

### Container Won't Start

```bash
# Check logs
docker compose logs app --tail=100

# Common causes:
# 1. Missing env var → Check .env file
# 2. Port already in use → lsof -i :3000
# 3. Database not ready → docker compose ps postgres

# Check env vars are loaded
docker compose exec app env | rg -c "JWT_SECRET"
```

### Health Check Failing

```bash
# Check why health endpoint returns 503
curl -v http://localhost:3000/api/health

# Check database connectivity
docker compose exec postgres pg_isready -U postgres

# Check Redis
docker compose exec redis redis-cli PING

# Check memory
docker stats --no-stream acquisitionos-app
```

### Migration Fails

```bash
# Check schema drift
docker compose run --rm app npx prisma db pull
diff prisma/schema.prisma prisma/schema.prisma.production

# Force push (dangerous — may lose data)
docker compose run --rm app npx prisma db push --accept-data-loss

# Use backup/restore if schema is corrupted
bash scripts/backup/restore.sh --latest --type postgres
```

### SSL Issues After Deploy

```bash
# Check certificate validity
echo | openssl s_client -connect app.acquisitionos.com:443 2>/dev/null | \
  openssl x509 -noout -dates

# Reload Nginx
docker compose exec nginx nginx -s reload

# Check Nginx config
docker compose exec nginx nginx -t
```

---

## Service Ports Reference

| Service | Port | Notes |
|---------|------|-------|
| Next.js (App) | 3000 | Main application |
| FastAPI (Backend) | 8000 | Heavy processing, webhooks |
| PostgreSQL | 5432 | Internal only (not exposed) |
| Redis | 6379 | Internal only |
| WebSocket (Socket.io) | 3003 | Real-time notifications |
| Prometheus | 9090 | Monitoring |
| Grafana | 3001 | Dashboards |
| Flower (Celery) | 5555 | Task monitoring |
| Nginx | 80, 443 | Reverse proxy + SSL |
