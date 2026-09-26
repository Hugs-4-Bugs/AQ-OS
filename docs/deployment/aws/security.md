# Security — Least Privilege on AWS for AcquisitionOS

This page hardens what [`manual-deployment.md`](./manual-deployment.md) built. The app's own security posture (custom JWT auth, `AUTH_DEV_MODE` off in production, hashed passwords) lives in the app; what AWS adds is **who can do what**, **what is reachable**, **what is encrypted**, and **what leaves an audit trail**. Every control here is cheap on day one and expensive to retrofit after an incident.

---

## 1. The three IAM actors (and what each may do)

**What:** three roles touch production: the *execution role* (ECS agent), the *task role* (app process), and the *deploy role* (GitHub Actions via OIDC). **Why separation matters:** a leak in one should not become a compromise of all.

| Role | Assumes it | Minimum permissions | Must NOT have |
| --- | --- | --- | --- |
| **Execution role** (`acquisitionos-ecs-exec`) | ECS agent at task start | `AmazonECSTaskExecutionRolePolicy` (ECR pull + CloudWatch Logs write) + `secretsmanager:GetSecretValue` on `acquisitionos/prod/*` ARNs only | `*` resources, secret *write*, any RDS/EC2/IAM action |
| **Task role** (app runtime) | Your Node process | **Nothing today** — the app calls SMTP/Stripe/Google/AI with its own provider keys over HTTPS, no AWS APIs (verified — [`backend.md`](./backend.md) §3) | Anything, until S3 uploads are adopted (then exactly `s3:PutObject`/`s3:GetObject` on one bucket) |
| **Deploy role** (`acquisitionos-github-deploy`) | GitHub Actions (OIDC) | ECR push, ECS describe/update/register, `iam:PassRole` on the exec role, `GetSecretValue` on `DIRECT_URL`, log read — full JSON in [`cicd.md`](./cicd.md) §1.3 | RDS delete, IAM management, billing, `terraform destroy` |

The exact role-creation commands: [`manual-deployment.md`](./manual-deployment.md) §7.2 and [`cicd.md`](./cicd.md) §1. The inline secret-read policy is scoped like this — never widen it to `"Resource": "*"`:

```json
{ "Effect": "Allow", "Action": "secretsmanager:GetSecretValue",
  "Resource": "arn:aws:secretsmanager:us-east-1:YOUR_ACCOUNT_ID:secret:acquisitionos/prod/*" }
```

**No root usage (REQUIRED):** root exists to create the admin user and set MFA ([`prerequisites.md`](./prerequisites.md) §2-3); daily work — including everything in this handbook — uses the IAM admin user or Identity Center. Check once a quarter: `aws cloudtrail lookup-events --lookup-attributes AttributeKey=EventSource,AttributeValue=signin.amazonaws.com --max-results 50 | grep -i root` should show nothing but the protected MFA login.

**Verify:** `aws iam generate-credential-report`, download it, and confirm root has no access keys; `aws iam simulate-principal-policy --policy-source-arn <exec-role-arn> --action-names secretsmanager:PutSecretValue` should come back `denied`.

---

## 2. Network layering recap (defense in depth)

From [`networking.md`](./networking.md) §3 and [`manual-deployment.md`](./manual-deployment.md) §4 — the whole point is that each layer accepts traffic only from the previous one:

```text
world → ALB SG (80, 443) → app SG (3000 from ALB SG only) → RDS SG (5432 from app SG only)
                                                        ↘ Redis SG (6379 from app SG only, OPTIONAL)
```

- **Private subnets (REQUIRED):** ECS tasks and RDS run in private subnets; only the ALB is internet-facing. `assignPublicIp=DISABLED` on the service; RDS `--no-publicly-accessible` (both already in [`manual-deployment.md`](./manual-deployment.md) §5.3/§9).
- Remove drift: the repo's `deploy/terraform/main.tf` opens port 8000 on one SG — a leftover from an old frontend/backend split this app does not need ([`manual-deployment.md`](./manual-deployment.md) §4). Close it in your Terraform ([`terraform.md`](./terraform.md) §2).
- Verify isolation: from a bastion/EC2 in a public subnet, `nc -zv <RDS endpoint> 5432` must **fail** — only app-SG sources may connect.

---

## 3. TLS in transit

- **Edge:** ACM certificate on the ALB, `ELBSecurityPolicy-TLS13-1-2-2021-06`, HTTP→HTTPS 301 ([`dns-ssl.md`](./dns-ssl.md) §2-3). Rotate for free — ACM auto-renews while the validation CNAME stays in Route 53.
- **ALB → container:** HTTP inside the VPC on 3000. Acceptable inside a private-subnet security-group boundary; if your compliance regime requires in-VPC encryption, that is a scope creep decision (FUTURE/ALTERNATIVE — TLS on the container itself + `https` target group).
- **App → RDS:** `rds.force_ssl=1` on the parameter group + `sslmode=require` in both DB URLs (REQUIRED — [`manual-deployment.md`](./manual-deployment.md) §5.2, [`database.md`](./database.md) §5).
- **App → third parties:** SMTP/Stripe/Google/AI calls are HTTPS by their libraries.

---

## 4. WAF on the ALB (OPTIONAL hardening)

**What/Why:** AWS WAF filters requests before they reach targets — managed rule groups catch common exploits, and a rate-based rule blunts credential-stuffing and scraping bursts against `/api/*`.

```bash
aws wafv2 create-web-acl --name acquisitionos-waf --scope REGIONAL \
  --region ${AWS_REGION} \
  --default-action Allow '{}' \
  --rules '[
    {"Name":"AWSCommon","Priority":1,"Statement":[{"ManagedRuleGroupStatement":
      {"VendorName":"AWS","Name":"AWSManagedRulesCommonRuleSet"}}],
     "OverrideAction":{"None":{}},"VisibilityConfig":{"SampledRequestsEnabled":true,
      "CloudWatchMetricsEnabled":true,"MetricName":"AWSCommon"},
     "Statement":[]},
    {"Name":"RateApi","Priority":2,"Statement":[{"RateBasedStatement":
      {"Limit":2000,"AggregateKeyType":"IP"}}],
     "Action":{"Block":{}},"VisibilityConfig":{"SampledRequestsEnabled":true,
      "CloudWatchMetricsEnabled":true,"MetricName":"RateApi"}}
  ]'
# then associate: aws wafv2 associate-web-acl --web-acl-arn <arn> --resource-arn ${ALB_ARN}
```

Cautions: start with the managed rules in **count mode** for a week and inspect WAF logs before blocking — false positives on legitimate API payloads are common. Tune the rate limit to real traffic (check `TargetRequestCount` first). SSE clients open long-lived connections, so connection churn rather than request rate is their signature — a per-IP rate rule rarely hurts them, but verify after enabling. WAF billing is per-rule + per-request; it is the first OPTIONAL to add when the app becomes publicly popular.

---

## 5. Secrets: encryption and rotation

**At rest:** Secrets Manager encrypts with KMS (AWS-managed key by default; a customer-managed key adds `kms:Decrypt` to the execution role and full control — OPTIONAL). RDS storage and snapshots are encrypted (`--storage-encrypted` — snapshots inherit it). ECR images are encrypted at rest.

**Rotation guidance, variable by variable** (mechanics: [`secrets.md`](./secrets.md) §3, §6):

| Secret | Rotation effect | Procedure |
| --- | --- | --- |
| `JWT_SECRET` | **Invalidates all sessions** — every user is signed out | Do it in a window; announce; then update secret + new task def revision |
| `DATABASE_URL` / `DIRECT_URL` password part | Old tasks fail while new start | Rotate DB password first, then secret, then roll tasks; brief mixed state is unavoidable |
| `CRON_SECRET` | EventBridge Connection must be updated in lockstep | Update the Connection (`aws events update-connection --auth-parameters ...`) and the secret together, or crons 401 ([`troubleshooting.md`](./troubleshooting.md) §17) |
| `SMTP_PASSWORD`, `STRIPE_*`, AI keys | Safe to swap anytime | `put-secret-value` + task rollout |
| `ENCRYPTION_KEY` | **Do not rotate casually** — data encrypted with it (e.g., stored Telegram credentials) becomes unreadable | Key rotation needs an app-level re-encryption plan |

**Verify after any rotation:** `/api/health` 200; a fresh login works (new JWT); one cron rule fires with 200 in logs; Stripe test webhook returns 200.

---

## 6. Image and dependency scanning

**ECR scanning (REQUIRED, already on):** the repository was created with `--image-scanning-configuration scanOnPush=true` ([`manual-deployment.md`](./manual-deployment.md) §1). Review findings after each push:

```bash
aws ecr describe-image-scan-findings --repository-name acquisitionos \
  --image-id imageTag=<GIT_SHA> --query "imageScanFindings.findingSeverityCounts"
```

Enhanced scanning (continuous, OPTIONAL) turns on Amazon Inspector coverage: ECR console → scanning configuration → enhanced. **Dependency scanning:** `npm audit` in CI (test job, [`../05-cicd.md`](../05-cicd.md) §4) and/or `trivy image` before push — the reference workflow already includes it. Treat CRITICALs in runtime dependencies as deploy blockers; fix with `npm audit fix` + rebuild.

**Verify:** a deliberately old base image produces HIGH/CRITICAL findings; your pipeline or review step catches them.

---

## 7. Audit trails

- **CloudTrail (REQUIRED):** management events record who changed what — trail setup + verification in [`monitoring.md`](./monitoring.md) §11. This is how you answer "which principal updated the service / deleted the alarm".
- **AWS Config (OPTIONAL):** resource-configuration history and drift (security-group rule changes over time). Add when compliance asks; CloudTrail covers incident needs first.
- **App-level audit:** the app's own logs record API access; keep LOG_LEVEL at `info` in production ([`secrets.md`](./secrets.md) §2) and retain 30 days ([`backend.md`](./backend.md) §6).

---

## 8. Protect the diagnostic endpoints

**What/Why:** `/api/health` is designed to be public (the ALB needs it unauthenticated), but the richer siblings — `/api/health/detailed`, `/api/health/database` (heap details, DB diagnostics) and the admin utility `/api/payments/webhook-replay` — should not be internet-reachable ([`../01-architecture.md`](../01-architecture.md) §1 health-endpoint notes). Block them at the ALB so no app change is needed:

```bash
aws elbv2 create-rule --listener-arn ${HTTPS_LISTENER_ARN} --priority 10 \
  --conditions '[{"Field":"path-pattern","Values":["/api/health/detailed","/api/health/database","/api/payments/webhook-replay"]}]' \
  --actions '[{"Type":"fixed-response","FixedResponseConfig":{"StatusCode":"403","ContentType":"text/plain","MessageBody":"Forbidden"}}]'
```

Priority 10 must be lower (evaluated earlier) than the default forward rule. **Verify:** `curl -i https://${APP_HOST}/api/health/detailed` → 403 while `/api/health` stays 200. If you manage this at the app layer instead, require admin auth on those routes — but the ALB rule protects you even before the app does.

---

## 9. Backup security

- Snapshots inherit the instance's encryption; **never share snapshots outside the account** (a shared snapshot is a database copy anyone with the ARN+key can copy). Check: `aws rds describe-db-snapshots --query "DBSnapshots[?DBSnapshotAttributes!=null][]"`.
- Restrict who can `rds:RestoreDBInstanceFromDBSnapshot` / `rds:DeleteDBSnapshot` — keep snapshot admin to the IAM admin user; the deploy role must not have it.
- Terraform state in S3 can contain sensitive values — bucket versioning plus restricted bucket policy; never commit state to Git ([`backups.md`](./backups.md) §7, [`terraform.md`](./terraform.md) §6).

---

## 10. What must NEVER be committed

`.gitignore` already excludes `.env*` (verified in the repo) — keep it that way and never make exceptions for "just one value":

- `.env`, `.env.*`, any file with `DATABASE_URL`, `JWT_SECRET`, `STRIPE_SECRET_KEY`, `SMTP_PASSWORD`, `GOOGLE_CLIENT_SECRET`, AI keys
- AWS credentials (`AWS_ACCESS_KEY_ID`/`SECRET`) — GitHub needs none of them (OIDC, [`cicd.md`](./cicd.md) §1); laptops use `aws configure` profiles, never repo files
- Private keys, `*.pem`, service-account JSONs
- Terraform state files (`*.tfstate`) — they can contain secret material ([`terraform.md`](./terraform.md) §6)

Leak procedure (do not panic-delete): rotate the leaked value **first** (invalidates it), then remove from history, then investigate CloudTrail for misuse. A `gitleaks` pre-commit/CI hook is an OPTIONAL guard that catches this before push.

---

## 11. SSRF and metadata hygiene (brief)

The app makes server-side HTTP calls where some destinations are configuration-driven (webhook retries, enrichment, AI base URLs). Two AWS-specific notes:

- **IMDSv2/SSRF:** Fargate tasks expose no long-lived instance credentials of the kind EC2 metadata leaks to SSRF — but the task role's temporary credentials are still reachable in-process. The current task role is empty (§1), so SSRF yields nothing; this is one more reason not to grant it permissions casually. Keep it that way.
- **Egress:** tasks reach the internet via NAT (or public IPs — [`networking.md`](./networking.md) §2). If you later add egress allowlisting at the NAT/proxy layer, include: SMTP host, Stripe (`api.stripe.com`), Razorpay, Google (`oauth2.googleapis.com`, `accounts.google.com`, Gmail/Calendar/Custom Search endpoints), your AI provider(s), Resend. Validate hosts app-side before fetches (the app already constrains some of these by configuration).

**Incident first steps:** suspicious traffic or a leaked key → rotate the affected secret ([`secrets.md`](./secrets.md) §6) → check CloudTrail for what changed ([`monitoring.md`](./monitoring.md) §11) → if data is affected, PITR is the undo ([`backups.md`](./backups.md) §5) → then triage normally ([`troubleshooting.md`](./troubleshooting.md) §1).

---

## 12. Security checklist

```text
[ ] Root: MFA on, no access keys; daily work via IAM admin/Identity Center
[ ] Execution role: ECR pull + logs + GetSecretValue on acquisitionos/prod/* only
[ ] Task role: empty; deploy role (OIDC) scoped per cicd.md §1.3
[ ] SG chain: world→ALB→app(3000)→RDS(5432); port 8000 leftover closed
[ ] ECS + RDS in private subnets; RDS not publicly accessible
[ ] TLS13 policy on ALB; rds.force_ssl=1; sslmode=require in DB URLs
[ ] (OPTIONAL) WAF with managed rules in count mode, then block; rate rule on /api/*
[ ] ECR scanOnPush findings reviewed; npm audit in CI
[ ] CloudTrail trail logging to S3
[ ] /api/health/detailed, /api/health/database, /api/payments/webhook-replay → 403 at the ALB
[ ] Snapshots encrypted, unshared; state bucket versioned
[ ] .env* and credentials never in Git; gitleaks hook (OPTIONAL)
```

---

## 13. Official Documentation

- IAM best practices — https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html
- ECS task execution role — https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task-execution-iam-role.html
- WAF managed rule groups + rate-based rules — https://docs.aws.amazon.com/waf/latest/developerguide/waf-managed-rule-groups.html
- Secrets Manager + KMS — https://docs.aws.amazon.com/secretsmanager/latest/userguide/security-encryption.html
- ECR image scanning — https://docs.aws.amazon.com/AmazonECR/latest/userguide/image-scanning.html
- CloudTrail — https://docs.aws.amazon.com/awscloudtrail/latest/userguide/cloudtrail-user-guide.html
- RDS encryption — https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Overview.Encryption.html
