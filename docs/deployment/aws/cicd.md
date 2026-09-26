# CI/CD — GitHub Actions to ECR + ECS

This page turns the manual deploy in [`manual-deployment.md`](./manual-deployment.md) into an automated pipeline: every push to `main` builds one immutable image, pushes it to ECR tagged with the git SHA, updates the ECS task definition, deploys, and verifies `/api/health`. The cross-cloud parts (branch strategy, environment protection, OIDC concept, anti-patterns) are in [`../05-cicd.md`](../05-cicd.md) — read that first; this page is the AWS-specific deploy job.

**This handbook does not add CI to your repository** — it documents the pipeline for you to create when ready.

Pipeline shape (AWS column of [`../05-cicd.md`](../05-cicd.md) §1):

```text
push to main
  → lint + tests (vitest)              (job: test)
  → docker build --platform linux/amd64
  → push ${ECR_URI}:${GIT_SHA}         (job: build-push, OIDC login)
  → prisma db push (DIRECT_URL)        (job: migrate, one runner, serialized)
  → render new task def revision + deploy + wait-for-stability
  → curl /api/health; rollback job on failure
  → [production: requires reviewer approval via GitHub Environment]
```

Placeholders: `YOUR_ACCOUNT_ID` (`aws sts get-caller-identity`), `APP_HOST` = `app.yourdomain.com`, `PROJECT` = `acquisitionos` — the names from [`manual-deployment.md`](./manual-deployment.md) §0.

---

## 1. One-time setup: GitHub OIDC → AWS deploy role

**What:** GitHub Actions assumes a short-lived AWS role via OIDC instead of storing static keys (concept: [`../05-cicd.md`](../05-cicd.md) §3). **Why:** no long-lived credentials in GitHub secrets; the role can only do what the pipeline needs.

```bash
# 1.1 Trust GitHub's OIDC provider (once per account)
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com

# 1.2 Role restricted to ONE repo and branch (edit account/repo names)
cat > gh-trust.json <<'EOF'
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Federated": "arn:aws:iam::YOUR_ACCOUNT_ID:oidc-provider/token.actions.githubusercontent.com" },
    "Action": "sts:AssumeRoleWithWebIdentity",
    "Condition": {
      "StringEquals": { "token.actions.githubusercontent.com:aud": "sts.amazonaws.com" },
      "StringLike": { "token.actions.githubusercontent.com:sub": "repo:YOUR_GH_USER/YOUR_REPO:ref:refs/heads/main" }
    }
  }]
}
EOF
aws iam create-role --role-name acquisitionos-github-deploy \
  --assume-role-policy-document file://gh-trust.json

# 1.3 Least-privilege policy: ECR push + ECS update + read the DB secret for migrations
cat > gh-deploy-policy.json <<'EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    { "Sid": "EcrAuth", "Effect": "Allow", "Action": ["ecr:GetAuthorizationToken"],
      "Resource": "*" },
    { "Sid": "EcrPush", "Effect": "Allow",
      "Action": ["ecr:BatchCheckLayerAvailability","ecr:GetDownloadUrlForLayer","ecr:BatchGetImage",
                 "ecr:InitiateLayerUpload","ecr:UploadLayerPart","ecr:CompleteLayerUpload","ecr:PutImage"],
      "Resource": "arn:aws:ecr:us-east-1:YOUR_ACCOUNT_ID:repository/acquisitionos" },
    { "Sid": "EcsDeploy", "Effect": "Allow",
      "Action": ["ecs:DescribeServices","ecs:UpdateService","ecs:DescribeTaskDefinition",
                 "ecs:RegisterTaskDefinition","ecs:DescribeClusters"],
      "Resource": "*" },
    { "Sid": "PassTaskRoles", "Effect": "Allow", "Action": ["iam:PassRole"],
      "Resource": ["arn:aws:iam::YOUR_ACCOUNT_ID:role/acquisitionos-ecs-exec"] },
    { "Sid": "ReadDbSecretForMigrations", "Effect": "Allow", "Action": ["secretsmanager:GetSecretValue"],
      "Resource": "arn:aws:secretsmanager:us-east-1:YOUR_ACCOUNT_ID:secret:acquisitionos/prod/DIRECT_URL*" },
    { "Sid": "VerifyLogs", "Effect": "Allow", "Action": ["logs:GetLogEvents","logs:FilterLogEvents"],
      "Resource": "arn:aws:logs:us-east-1:YOUR_ACCOUNT_ID:log-group:/acquisitionos/production:*" }
  ]
}
EOF
aws iam put-role-policy --role-name acquisitionos-github-deploy \
  --policy-name gh-deploy --policy-document file://gh-deploy-policy.json
```

**Expected output/Verify:** role ARN `arn:aws:iam::YOUR_ACCOUNT_ID:role/acquisitionos-github-deploy`. Scope it tighter if you prefer — `ecs:*` on a specific cluster/service ARN also works; what matters is that it can **not** delete RDS, manage IAM broadly, or touch billing (anti-pattern list: [`../05-cicd.md`](../05-cicd.md) §9). Store the ARN as the GitHub secret `AWS_DEPLOY_ROLE_ARN`.

---

## 2. Build and push to ECR (SHA-tagged)

**What/Why:** one immutable image per commit, tagged with the short SHA — this tag is what you roll back to ([`rollback.md`](./rollback.md) §2). Build needs the two repo files first: `.npmrc` (`legacy-peer-deps=true`) and `.dockerignore` ([`../03-docker.md`](../03-docker.md) §3).

```yaml
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ secrets.AWS_DEPLOY_ROLE_ARN }}
          aws-region: us-east-1
      - id: ecr-login
        uses: aws-actions/amazon-ecr-login@v2
      - name: Build and push
        run: |
          IMAGE=${{ steps.ecr-login.outputs.registry }}/acquisitionos
          docker build --platform linux/amd64 -t ${IMAGE}:${{ github.sha }} .
          docker push ${IMAGE}:${{ github.sha }}
          echo "IMAGE=${IMAGE}" >> "$GITHUB_ENV"
```

**Expected output:** push digest lines in the job log; `aws ecr describe-images --repository-name acquisitionos` shows the new SHA tag. **Verify:** the SHA in ECR matches the commit that triggered the run.

---

## 3. Render a new task definition revision and deploy

**What/Why:** the pipeline rewrites only the `image` line of the current task definition, registers revision N+1, and updates the service. ECS rolls tasks; the circuit breaker (enabled in [`backend.md`](./backend.md) §10) aborts bad rollouts and auto-reverts.

```yaml
      - name: Download current task definition
        run: |
          aws ecs describe-task-definition --task-definition acquisitionos-prod \
            --query "taskDefinition" > task-def.json
      - name: Render new revision with the new image
        id: render
        uses: aws-actions/amazon-ecs-render-task-definition@v1
        with:
          task-definition: task-def.json
          container-name: acquisitionos
          image: ${{ env.IMAGE }}:${{ github.sha }}
      - name: Deploy to ECS
        uses: aws-actions/amazon-ecs-deploy-task-definition@v2
        with:
          task-definition: ${{ steps.render.outputs.task-definition }}
          service: acquisitionos-app
          cluster: acquisitionos-prod
          wait-for-stability: true
```

**Expected output:** the deploy action logs `Created task definition revision: N+1`, streams rollout progress, and exits 0 when the service is stable. `describe-task-definition --task-definition acquisitionos-prod` shows the new image SHA. **Verify:** `curl -i https://${APP_HOST}/api/health` → 200 and `aws ecs describe-services ... --query "services[0].rollouts"` shows `COMPLETED`.

Notes:
- `wait-for-stability: true` is what makes a broken deploy **fail the pipeline** rather than silently proceed.
- Environment-only changes (e.g., a new plain env var) are done by editing `taskdef.json` — via a PR to the repo's task def file if you keep it in Git (recommended) or via the console; the pipeline then picks up whatever the current revision is.

---

## 4. The `prisma db push` step (once per deploy, serialized)

**What/Why:** the container does not migrate at boot — schema changes are applied deliberately ([`manual-deployment.md`](./manual-deployment.md) §10). In CI there are two acceptable ways; pick **one** and stay with it ([`../04-database-production.md`](../04-database-production.md) §4).

**Option A (default, simplest): run it on the build runner.**

```yaml
  migrate:
    needs: build-push
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ secrets.AWS_DEPLOY_ROLE_ARN }}
          aws-region: us-east-1
      - name: Fetch DIRECT_URL from Secrets Manager (never stored in GitHub)
        run: |
          DIRECT_URL=$(aws secretsmanager get-secret-value \
            --secret-id acquisitionos/prod/DIRECT_URL --query SecretString --output text)
          echo "::add-mask::$DIRECT_URL"
          echo "DIRECT_URL=$DIRECT_URL" >> "$GITHUB_ENV"
      - name: Push schema
        run: npx prisma db push --schema=prisma/schema.production.prisma
```

**Option B: one-off ECS task.** Run `aws ecs run-task` with an override command (`npx prisma db push ...` needs an image that contains the CLI — e.g., the app image) in the same subnets/SGs with the execution role that can read `DIRECT_URL`. Use this when your DB is not reachable from GitHub runners (no public access, restrictive networking). Fargate tasks have no public IP unless you ask for one — see [`networking.md`](./networking.md) §2.

Rules either way: migrations run **after** the image is built and **before/alongside** the service update, never in parallel with themselves (concurrency group in §6 enforces this), and `--accept-data-loss` must never appear in CI (a destructive change belongs in a manual, reviewed run — [`../04-database-production.md`](../04-database-production.md) §6).

---

## 5. Health check + automatic rollback job

**What/Why:** a green `wait-for-stability` plus a real HTTP probe proves the app actually works; a failing probe triggers a redeploy of the previous revision.

```yaml
  verify:
    needs: deploy
    runs-on: ubuntu-latest
    steps:
      - name: Health check
        run: |
          for i in $(seq 1 10); do
            curl -fsS "https://${APP_HOST}/api/health" | grep -q '"status":"ok"' && exit 0
            sleep 10
          done
          exit 1
      - name: Trigger manual rollback on failure
        if: failure()
        run: |
          PREV=$(aws ecs list-task-definitions --family-prefix acquisitionos-prod \
            --sort DESC --max-items 2 --query "taskDefinitionArns[1]" --output text)
          aws ecs update-service --cluster acquisitionos-prod --service acquisitionos-app \
            --task-definition "$PREV"
          aws ecs wait services-stable --cluster acquisitionos-prod --service acquisitionos-app
```

(Adjust the grep to the real `/api/health` JSON once — [`../05-cicd.md`](../05-cicd.md) §7. The full manual rollback runbook is [`rollback.md`](./rollback.md) §2.)

The **circuit breaker is the primary safety net** — it auto-reverts a rollout whose new tasks fail the ALB health check. The `verify` job covers the cases the breaker cannot see (app boots healthy but business endpoints 500).

---

## 6. Environments, approvals, concurrency

Per [`../05-cicd.md`](../05-cicd.md) §5 — GitHub → Settings → Environments:

- **`staging`** — auto-deploy from `main`, no reviewers, separate ECS service + RDS instance ([`frontend.md`](./frontend.md) §6).
- **`production`** — **required reviewers** (you), deployable only from `main`, same image tag promoted from staging.
- **Concurrency** so two deploys cannot race (and migrations cannot overlap):

```yaml
concurrency:
  group: production-deploy
  cancel-in-progress: false
```

Full workflow skeleton (test → build-push → migrate → deploy-staging → deploy-production): [`../05-cicd.md`](../05-cicd.md) §4. Branch protection on `main` (PR reviews, required checks) completes the setup — recap in [`../05-cicd.md`](../05-cicd.md) §2.

---

## 7. What CI does NOT manage

- **EventBridge schedules** — created once, not per deploy (next section).
- **Webhook URLs** — registered once in provider dashboards ([`backend.md`](./backend.md) §11).
- **Terraform** — its own gated pipeline; if you adopt IaC, plan on PRs and apply on `main` with approval ([`terraform.md`](./terraform.md) §8).

---

## 8. EventBridge scheduled rules — one-time infrastructure (the 15 cron endpoints)

**What/Why:** AcquisitionOS has no in-app scheduler; the 15 HTTP cron endpoints must be called externally with `Authorization: Bearer <CRON_SECRET>` (verified list: [`../01-architecture.md`](../01-architecture.md) §2.4). On AWS this is **EventBridge scheduled rules → API destinations**, where a **Connection** holds the Bearer header — scheduler primitives cannot set custom headers on plain targets, which is exactly what the Connection/API-destination pair exists for. This is one-time infrastructure: deploys never touch it (same domain).

**8.1 One connection carrying the Bearer secret** (value = the `CRON_SECRET` stored in Secrets Manager, [`manual-deployment.md`](./manual-deployment.md) §6):

```bash
CONN_ARN=$(aws events create-connection \
  --name acquisitionos-cron \
  --authorization-type API_KEY \
  --auth-parameters '{"ApiKeyAuth":{"ApiKeyName":"Authorization","ApiKeyValue":"Bearer YOUR_CRON_SECRET"}}' \
  --query ConnectionArn --output text)
```

**8.2 The 15 endpoints + recommended starting cadences** (tune to your usage; EventBridge `cron()` is 6 fields in UTC; `--http-method` must match the route — all are POST except `/api/cron/payment-reconciliation`, which is GET, verified in the repo):

| Endpoint (POST unless noted) | Suggested cadence |
| --- | --- |
| `/api/cron/process-sequences` | `rate(10 minutes)` |
| `/api/cron/sequence-processing` | `rate(10 minutes)` |
| `/api/cron/meeting-reminders` | `rate(10 minutes)` |
| `/api/cron/process-gmail-replies` | `rate(10 minutes)` (skip if Gmail Pub/Sub push is on) |
| `/api/cron/expire-api-keys` | `rate(30 minutes)` |
| `/api/cron/hot-lead-scan` | `rate(30 minutes)` |
| `/api/cron/autonomous-outreach` | `rate(30 minutes)` |
| `/api/cron/sdr-cycle` | `rate(30 minutes)` |
| `/api/cron/credit-renewal` | `cron(0 2 * * ? *)` daily |
| `/api/cron/end-of-period` | `cron(0 2 * * ? *)` daily |
| `/api/cron/renew-subscriptions` | `cron(0 2 * * ? *)` daily |
| `/api/cron/payment-reconciliation` (**GET**) | `cron(15 2 * * ? *)` daily |
| `/api/payments/process-billing` | `cron(0 3 * * ? *)` daily |
| `/api/feedback/retry-emails` | `cron(30 3 * * ? *)` daily |
| `/api/gmail/jobs/process` (pull mode only) | `rate(15 minutes)` — uses `GMAIL_CRON_API_KEY`, not `CRON_SECRET`: create a **second connection** with that key |

**8.3 Creation loop** (same commands as [`manual-deployment.md`](./manual-deployment.md) §12 — shown once there, referenced here; run it once per environment):

```bash
# Format: <endpoint path>|<schedule>|<http method>
CRON_JOBS='
/api/cron/expire-api-keys|rate(30 minutes)|POST
/api/cron/payment-reconciliation|cron(15 2 * * ? *)|GET
/api/payments/process-billing|cron(0 3 * * ? *)|POST
'
while IFS='|' read -r CRON_PATH SCHED METHOD; do
  [ -z "$CRON_PATH" ] && continue
  NAME=$(echo "$CRON_PATH" | sed -e 's|^/api/||' -e 's|/|-|g')
  DEST_ARN=$(aws events create-api-destination --name "$NAME" \
    --connection-arn ${CONN_ARN} --http-method ${METHOD} \
    --invocation-endpoint "https://${APP_HOST}${CRON_PATH}" \
    --query ApiDestinationArn --output text)
  aws events put-rule --name "$NAME" --schedule-expression "$SCHED"
  aws events put-targets --rule "$NAME" --targets "Id=app,Arn=${DEST_ARN}"
done <<< "$CRON_JOBS"
```

**Verify:** temporarily set one rule to `rate(1 minute)`, then `aws logs tail /acquisitionos/production --follow` shows the endpoint's log line with a 200; set the cadence back. Failed-invocation alarms for these rules: [`monitoring.md`](./monitoring.md) §5.

---

## 9. Checklist

```text
[ ] OIDC provider + acquisitionos-github-deploy role (scoped: ECR push, ECS update, DIRECT_URL read)
[ ] GitHub secret AWS_DEPLOY_ROLE_ARN set; no static AWS keys anywhere in GitHub
[ ] CI: lint + vitest + prisma validate on PRs ([../05-cicd.md](../05-cicd.md) §2)
[ ] Image pushed tagged with github.sha; task def revision rendered + deployed with wait-for-stability
[ ] prisma db push runs once per deploy (Option A or B), masked, never --accept-data-loss
[ ] /api/health verification + rollback-on-failure job
[ ] staging auto-deploys; production gated by Environment reviewers; concurrency group set
[ ] EventBridge connection + 15 API destinations + rules created once and verified with a 1-minute rule
```

---

## 10. Official Documentation

- aws-actions/configure-aws-credentials (OIDC) — https://github.com/aws-actions/configure-aws-credentials
- aws-actions/amazon-ecs-render-task-definition — https://github.com/aws-actions/amazon-ecs-render-task-definition
- aws-actions/amazon-ecs-deploy-task-definition — https://github.com/aws-actions/amazon-ecs-deploy-task-definition
- Creating an OIDC provider for GitHub — https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_providers_create_oidc.html
- EventBridge API destinations + connections — https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-api-destinations.html
- EventBridge schedule expressions — https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-schedule-expressions.html
- ECS deployment circuit breaker — https://docs.aws.amazon.com/AmazonECS/latest/developerguide/deployment-type-ecs.html
