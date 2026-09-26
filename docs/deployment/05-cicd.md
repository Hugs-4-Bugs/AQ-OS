# CI/CD Guide — GitHub Actions Patterns for AcquisitionOS

This is the cross-cloud CI/CD chapter. Each cloud guide's `cicd.md` contains the platform-specific deploy job; this page covers everything identical everywhere: pipeline shape, branch strategy, secrets handling, environment protection, and verification.

**This handbook does not configure CI/CD in your repository** — it documents the pipeline for you to add when ready.

---

## 1. The pipeline, end to end

```text
Developer
   ↓
Git commit → GitHub
   ↓
CI trigger (push / PR)
   ↓
Install (npm ci)            ← needs .npmrc (see 03-docker.md §3.1)
   ↓
Checks: lint (eslint) + tests (vitest) + prisma validate
   ↓
Build: docker build  (prisma generate → next build → clean-standalone)
   ↓
Security: image scan (trivy / docker scout), secret-scan the diff
   ↓
Push image to registry (tag = git SHA)
   ↓
Deploy to staging  → smoke test /api/health
   ↓
[manual approval] → Deploy to production (same image tag)
   ↓
Health check /api/health → rollback automatically on failure
```

Principles: **one immutable image per commit**; the same artifact promoted staging → production; every deploy is a known Git SHA; production deploys are gated by humans.

---

## 2. Branch strategy (minimal, beginner-safe)

- `main` — always deployable. CI runs on every push; a deploy to **staging** happens automatically.
- Feature branches + pull requests — CI runs lint/tests on PRs; merge to `main` via PR review.
- **Production deploys** are triggered by a GitHub *Environment* (`production`) with required reviewers, from `main` only.
- Optional: a `release-YYYY-MM-DD` tag marks what is live (useful for rollback bookkeeping).

Heavier models (git-flow, release branches) are unnecessary until a team's size demands them.

---

## 3. GitHub Actions secrets — and OIDC (no long-lived cloud keys)

**What is OIDC?** GitHub Actions can obtain short-lived cloud credentials by *assuming a role*, instead of you storing static access keys in GitHub secrets.

| Cloud | Static-key alternative (avoid) | OIDC approach (preferred) |
| --- | --- | --- |
| GCP | JSON service-account key in a GitHub secret | Workload Identity Federation (GitHub OIDC → service account with Cloud Run Deploy role) |
| AWS | `AWS_ACCESS_KEY_ID`/`SECRET` in secrets | `aws-actions/configure-aws-credentials` with `role-to-assume` (deploy-only IAM role) |
| Azure | Service principal secret | `azure/login` with OIDC federated credential |
| Cloudflare | API token in a GitHub secret (scoped: Workers Scripts:Edit, etc.) | Cloudflare API tokens (OIDC not applicable; use a narrowly-scoped token) |

**Least privilege for the deploy credential:** push to registry + update the running service (+ read secrets if your deploy step writes them). It must **not** be able to delete databases or manage billing.

Other GitHub secrets used by these pipelines: `STAGING_*` / `PROD_*` URLs, and the `CRON_SECRET` is **never** needed by CI (it lives in the cloud scheduler, not GitHub).

---

## 4. Reference workflow (single deployable, per-cloud deploy job)

`.github/workflows/deploy.yml` skeleton — the `deploy-<cloud>` job content differs per platform (see each cloud's `cicd.md`):

```yaml
name: CI/CD
on:
  push:
    branches: [main]
  pull_request:

env:
  IMAGE: REGISTRY_HOST/YOUR_PROJECT/acquisitionos

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - run: npx prisma generate
      - run: npm run lint
      - run: npm test

  build-push:
    needs: test
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    outputs: { sha: "${{ github.sha }}" }
    steps:
      - uses: actions/checkout@v4
      - id: auth            # cloud-specific OIDC login (see cloud guides)
        uses: YOUR_CLOUD_LOGIN_ACTION@vX
      - run: docker build -t "$IMAGE:${GITHUB_SHA::7}" .
      - run: trivy image --exit-code 1 --severity CRITICAL "$IMAGE:${GITHUB_SHA::7}"
      - run: docker push "$IMAGE:${GITHUB_SHA::7}"

  deploy-staging:
    needs: build-push
    runs-on: ubuntu-latest
    environment: staging
    steps: [ ... cloud-specific deploy of IMAGE:${GITHUB_SHA::7} ... ]
      - run: curl -fsS https://staging.yourdomain.com/api/health

  deploy-production:
    needs: deploy-staging
    runs-on: ubuntu-latest
    environment: production          # ← required reviewers configured in GitHub
    steps: [ ... same deploy targeting production ... ]
      - run: curl -fsS https://app.yourdomain.com/api/health
```

Cloud-specific deploy steps (exact commands/actions) live in: `gcp/cicd.md`, `aws/cicd.md`, `azure/cicd.md`, `cloudflare/cicd.md`.

---

## 5. Environment protection (do not skip)

In GitHub → Settings → Environments:

1. `staging` — no reviewers; optionally restrict to `main`.
2. `production` — **required reviewers** (you), plus a 5–15 minute deploy window; restrict deployable branches to `main`.
3. Concurrency guard so two deploys can't race:
   ```yaml
   concurrency:
     group: production-deploy
     cancel-in-progress: false
   ```

---

## 6. Database migrations in CI

- Migrations run **once per deploy**, after the new image is live but before traffic shifts (or immediately after on single-instance).
- Use `DIRECT_URL` from the cloud secret manager (pipelined into the job via OIDC + secret manager — never stored in GitHub).
- Prefer `prisma db push` (repo default) or `migrate deploy` — never both (see [`04-database-production.md`](./04-database-production.md) §4).
- A failed migration **fails the deploy** — investigate before retrying; do not blindly re-run destructive operations.

---

## 7. Deployment verification & automatic rollback

After each deploy job:

```bash
curl -fsS "https://app.yourdomain.com/api/health" | grep -q '"status":"ok"' || curl -fsS ".../api/health"
```

(Adjust the grep to the real `/api/health` JSON shape — verify once and keep the check strict.) On failure: redeploy the previous image tag (see the cloud's `rollback.md`); all four platforms keep prior revisions/task definitions for instant reversion.

Post-deploy smoke list (manual, 2 minutes): login works · dashboard loads · one SSE stream connects (notifications bell) · one `/api/cron/*` scheduler run succeeds in logs.

---

## 8. Scheduling & webhooks are not CI concerns

- `/api/cron/*` schedules live in the cloud scheduler (EventBridge / Cloud Scheduler / Functions timer / Cron Triggers) — created once, unchanged by deploys.
- Webhook URLs (Stripe, Razorpay, Gmail Pub/Sub, Telegram) are registered once in provider dashboards; redeployments don't change them (same domain).

---

## 9. CI/CD anti-patterns (each has caused real outages somewhere)

- ❌ Static cloud root keys in GitHub secrets.
- ❌ `terraform apply` on production from an unprotected branch — gate IaC applies behind the `production` environment too.
- ❌ Building images with baked-in `.env` (see [`03-docker.md`](./03-docker.md) §3.2).
- ❌ Auto-deploying to production without health-check verification.
- ❌ Running migrations from multiple jobs in parallel.
- ❌ `terraform destroy` anywhere in CI.
