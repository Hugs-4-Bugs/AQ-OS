# Manual Deployment — AcquisitionOS on AWS, Step by Step

This is the core chapter. It walks you from an empty AWS region to a running, TLS-terminated AcquisitionOS at `https://app.yourdomain.com`, using the console where that is easier and the AWS CLI where that is more reliable. Every step says **What → Why → Command → Expected output → Verify**. Before starting: complete [`prerequisites.md`](./prerequisites.md) and read [`../03-docker.md`](../03-docker.md) (image build + the two missing repo files). The whole chapter can also be executed with Terraform — the repo already ships a compatible AWS Terraform at `deploy/terraform/main.tf` (see [`terraform.md`](./terraform.md)); do the manual pass once anyway, it teaches what each Terraform resource does.

---

## 0. Common variables (paste into every shell you work in)

```bash
export AWS_REGION="us-east-1"                          # prerequisites §5 — same region everywhere
export ACCOUNT_ID="YOUR_ACCOUNT_ID"                    # aws sts get-caller-identity → "Account" field
export PROJECT="acquisitionos"
export APP_HOST="app.yourdomain.com"                   # the domain you own (../06-dns-and-domains.md)
export ECR_URI="${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${PROJECT}"
```

---

## 1. Build the image, create the ECR repository, push

**What/Why:** ECS pulls one immutable image from ECR — it cannot pull from your laptop; building locally first proves the image is deployable.

- Create the two missing repo files first — the build fails without them: `.npmrc` (`legacy-peer-deps=true`) and `.dockerignore`. Exact contents: [`../03-docker.md`](../03-docker.md) §3. Smoke-test locally (§4-5 there), then continue.
- `--platform linux/amd64` matters on Apple Silicon: Fargate defaults to x86_64 and an arm64 image fails to run (ARM64 also works if you set `runtimePlatform` in §7 accordingly — keep both consistent).

```bash
export GIT_SHA=$(git rev-parse --short HEAD)   # traceability tag
docker build --platform linux/amd64 \
  -t ${ECR_URI}:${GIT_SHA} -t ${ECR_URI}:latest .

aws ecr create-repository --repository-name ${PROJECT} \
  --image-scanning-configuration scanOnPush=true --region ${AWS_REGION}

aws ecr get-login-password --region ${AWS_REGION} \
  | docker login --username AWS --password-stdin ${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com

docker push ${ECR_URI}:${GIT_SHA}
docker push ${ECR_URI}:latest
```

**Expected output/Verify:** `create-repository` prints JSON whose `repositoryUri` matches `$ECR_URI`; pushes end with `digest: sha256:...`; `aws ecr describe-images --repository-name ${PROJECT} --region ${AWS_REGION}` lists both tags.

---

## 3. VPC, subnets, internet path

**What/Why:** a VPC (`10.0.0.0/16`) with 2 public subnets (ALB) + 2 private subnets (ECS tasks, RDS) across 2 AZs, an Internet Gateway, and outbound internet for private subnets — the ALB must be internet-facing, the app and database must not, and tasks in private subnets need an outbound path for SMTP/Stripe/Google/AI calls.

**Easiest correct path (console):** VPC → **Create VPC** → "VPC and more" → name `acquisitionos`, CIDR `10.0.0.0/16`, **2** AZs, **2** public + **2** private subnets, NAT gateways: **1** (cheaper) or **0** if you will use public IPs on tasks (§9 note). **Or reuse code:** `deploy/terraform/main.tf` builds exactly this topology — see [`terraform.md`](./terraform.md).

Capture the IDs (needed in every later step):

```bash
VPC_ID=$(aws ec2 describe-vpcs --filters "Name=tag:Name,Values=acquisitionos-vpc" \
  --query "Vpcs[0].VpcId" --output text --region ${AWS_REGION})
PUB_SUBNETS=$(aws ec2 describe-subnets --filters "Name=vpc-id,Values=${VPC_ID}" "Name=map-public-ip-on-launch,Values=true" \
  --query "Subnets[*].SubnetId" --output text --region ${AWS_REGION})
PRIV_SUBNETS=$(aws ec2 describe-subnets --filters "Name=vpc-id,Values=${VPC_ID}" "Name=map-public-ip-on-launch,Values=false" \
  --query "Subnets[*].SubnetId" --output text --region ${AWS_REGION} | tr '\t' ' ')
**Verify:** the echo shows one VPC + 2 public + 2 private subnet IDs across 2 AZs. If your VPC name differs, adjust the filter or note IDs from the console (VPC → Subnets).

---

## 4. Security groups (three layers)

**What/Why:** stateful firewalls; each layer accepts traffic **only** from the previous layer's SG.

| SG | Inbound | Source |
| --- | --- | --- |
| `acquisitionos-alb-sg` | 80, 443 tcp | `0.0.0.0/0` (world) |
| `acquisitionos-app-sg` | 3000 tcp | ALB SG only |
| `acquisitionos-rds-sg` | 5432 tcp | app SG only |
| `acquisitionos-redis-sg` (OPTIONAL) | 6379 tcp | app SG only |

```bash
# ALB SG
ALB_SG_ID=$(aws ec2 create-security-group --group-name acquisitionos-alb-sg --description "ALB: HTTP/HTTPS from world" --vpc-id ${VPC_ID} --query GroupId --output text --region ${AWS_REGION})
aws ec2 authorize-security-group-ingress --group-id ${ALB_SG_ID} \
  --protocol tcp --port 80 --cidr 0.0.0.0/0
aws ec2 authorize-security-group-ingress --group-id ${ALB_SG_ID} \
  --protocol tcp --port 443 --cidr 0.0.0.0/0

# App SG (accepts 3000 from the ALB SG only)
APP_SG_ID=$(aws ec2 create-security-group --group-name acquisitionos-app-sg --description "ECS tasks: 3000 from ALB only" --vpc-id ${VPC_ID} --query GroupId --output text --region ${AWS_REGION})
aws ec2 authorize-security-group-ingress --group-id ${APP_SG_ID} \
  --protocol tcp --port 3000 --source-group ${ALB_SG_ID}

# RDS SG (accepts 5432 from the app SG only)
RDS_SG_ID=$(aws ec2 create-security-group --group-name acquisitionos-rds-sg --description "RDS: 5432 from app only" --vpc-id ${VPC_ID} --query GroupId --output text --region ${AWS_REGION})
aws ec2 authorize-security-group-ingress --group-id ${RDS_SG_ID} \
  --protocol tcp --port 5432 --source-group ${APP_SG_ID}
```

**Verify:** `aws ec2 describe-security-groups --group-ids ${APP_SG_ID}` shows one ingress rule: 3000 from the ALB SG. (The repo's `deploy/terraform/main.tf` also opens 8000 — a leftover from a frontend/backend split this single-container app does not need.)

---

## 5. RDS PostgreSQL 16 + database + least-privilege user

**What/Why:** production requires PostgreSQL via Prisma (`prisma/schema.production.prisma`); dev SQLite is not deployable. Sizing/backups deep dive: [`database.md`](./database.md).

```bash
# 5.1 Subnet group (RDS must live in private subnets, 2 AZs)
aws rds create-db-subnet-group \
  --db-subnet-group-name acquisitionos-db-subnets \
  --db-subnet-group-description "private subnets for RDS" \
  --subnet-ids ${PRIV_SUBNETS}

# 5.2 Parameter group: force TLS (auth cookies + secrets travel on these links)
aws rds create-db-parameter-group \
  --db-parameter-group-name acquisitionos-pg16 \
  --db-parameter-group-family postgres16 \
  --description "AcquisitionOS: require SSL"
aws rds modify-db-parameter-group --db-parameter-group-name acquisitionos-pg16 --parameters \
  "ParameterName=rds.force_ssl,ParameterValue=1,ApplyMethod=pending-reboot"

# 5.3 The instance
aws rds create-db-instance \
  --db-instance-identifier acquisitionos-prod \
  --engine postgres --engine-version "16.4" \
  --db-instance-class db.t4g.medium \
  --allocated-storage 50 --max-allocated-storage 500 --storage-type gp3 \
  --storage-encrypted \
  --db-name acquisitionos \
  --master-username postgres --master-user-password "YOUR_DB_PASSWORD" \
  --vpc-security-group-ids ${RDS_SG_ID} \
  --db-subnet-group-name acquisitionos-db-subnets \
  --db-parameter-group-name acquisitionos-pg16 \
  --backup-retention-period 7 --preferred-backup-window "03:00-04:00" \
  --no-publicly-accessible \
  --multi-az \
  --deletion-protection

aws rds wait db-instance-available --db-instance-identifier acquisitionos-prod
export DB_HOST=$(aws rds describe-db-instances --db-instance-identifier acquisitionos-prod \
  --query "DBInstances[0].Endpoint.Address" --output text)
echo "DB_HOST=${DB_HOST}"
```

Decisions: **`db.t4g.medium`** (2 vCPU/4 GB Graviton) is the starting point; **Multi-AZ** mirrors data to a second AZ (costs ~2× — start `--no-multi-az` on staging, enable in production); **backup retention 7** days gives point-in-time recovery (PITR); **deletion-protection** blocks accidental deletes. Engine version: pick the newest 16.x listed by `aws rds describe-db-engine-versions --engine postgres` (the repo's older `deploy/terraform/main.tf` pins 15.4; `16.4` here is an example — use a version your region lists).

**Verify:** the `wait` returns and `DB_HOST` prints like `acquisitionos-prod.xxxx.us-east-1.rds.amazonaws.com`.

5.4 **Create the app database user (do not use `postgres` for the app):**

```bash
psql "postgresql://postgres:YOUR_DB_PASSWORD@${DB_HOST}:5432/acquisitionos?sslmode=require" <<'SQL'
CREATE ROLE app_user WITH LOGIN PASSWORD 'YOUR_DB_PASSWORD';
GRANT CONNECT ON DATABASE acquisitionos TO app_user;
\c acquisitionos
GRANT USAGE, CREATE ON SCHEMA public TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;
GRANT USAGE, CREATE ON ALL SEQUENCES IN SCHEMA public TO app_user;
SQL
```

The full grant rationale is in [`../04-database-production.md`](../04-database-production.md) §2; `psql` install in [`../00-prerequisites.md`](../00-prerequisites.md) §9.

---

## 6. Secrets Manager: store every secret

**What/Why:** encrypted storage; ECS reads secrets at task start and injects them as env vars. `DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET` and the provider keys must never be baked into the image.

```bash
DB_URL_BASE="postgresql://app_user:YOUR_DB_PASSWORD@${DB_HOST}:5432/acquisitionos"

for S in JWT_SECRET ENCRYPTION_KEY CRON_SECRET; do
  aws secretsmanager create-secret --name ${PROJECT}/prod/${S} \
    --secret-string "$(openssl rand -hex 32)"
done
aws secretsmanager create-secret --name ${PROJECT}/prod/DATABASE_URL \
  --secret-string "${DB_URL_BASE}?sslmode=require&connection_limit=10"
aws secretsmanager create-secret --name ${PROJECT}/prod/DIRECT_URL \
  --secret-string "${DB_URL_BASE}?sslmode=require"
# example provider key — repeat the pattern for SMTP/Stripe/Google/... (secrets.md §2):
aws secretsmanager create-secret --name ${PROJECT}/prod/OPENAI_API_KEY \
  --secret-string "sk-YOUR_OPENAI_KEY"
```

**Expected output/Verify:** each `create-secret` returns JSON with the full ARN (random suffix is normal). `aws secretsmanager list-secrets --query "SecretList[].Name"` shows `acquisitionos/prod/...`. Read-back test without printing the value: `aws secretsmanager get-secret-value --secret-id ${PROJECT}/prod/JWT_SECRET --query SecretString --output text | wc -c` → 64 + newline. The complete per-variable list (which vars are secrets vs plain env) is in [`secrets.md`](./secrets.md) §2.

---

## 7. Task definition (the container's spec) + roles + log group

**What/Why:** the JSON "recipe" — image, CPU/memory, port, env vars, secret references, health check. The ECS service runs *this recipe*; separating image (immutable) from config (task def) enables clean rollbacks.

7.1 **Log group first** (the awslogs driver cannot create it reliably itself):

```bash
aws logs create-log-group --log-group-name /${PROJECT}/production
aws logs put-retention-policy --log-group-name /${PROJECT}/production --retention-in-days 30
```

7.2 **Execution role** (ECS agent: pulls the image + reads secrets) and a minimal **task role** (the app process itself; it calls no AWS APIs, so it stays empty/optional):

```bash
cat > ecs-trust.json <<'EOF'
{ "Version": "2012-10-17",
  "Statement": [{ "Effect": "Allow", "Principal": { "Service": "ecs-tasks.amazonaws.com" }, "Action": "sts:AssumeRole" }] }
EOF
aws iam create-role --role-name acquisitionos-ecs-exec --assume-role-policy-document file://ecs-trust.json
aws iam attach-role-policy --role-name acquisitionos-ecs-exec --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy
cat > secrets-policy.json <<EOF
{ "Version": "2012-10-17",
  "Statement": [{ "Effect": "Allow", "Action": ["secretsmanager:GetSecretValue"],
    "Resource": "arn:aws:secretsmanager:${AWS_REGION}:${ACCOUNT_ID}:secret:${PROJECT}/prod/*" }] }
EOF
aws iam put-role-policy --role-name acquisitionos-ecs-exec --policy-name read-acquisitionos-secrets --policy-document file://secrets-policy.json
```

The AWS-managed policy covers ECR pull + log writing; the inline policy limits secret reads to your prefix (never `"Resource": "*"`). `kms:Decrypt` is only needed with a customer-managed KMS key on secrets (default AWS-managed key: not needed).

7.3 **Register the task definition** — save as `taskdef.json`, replace the uppercase placeholders, register:

```json
{
  "family": "acquisitionos-prod",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "1024",
  "memory": "2048",
  "executionRoleArn": "arn:aws:iam::YOUR_ACCOUNT_ID:role/acquisitionos-ecs-exec",
  "containerDefinitions": [{
    "name": "acquisitionos",
    "image": "YOUR_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/acquisitionos:latest",
    "essential": true,
    "portMappings": [{ "containerPort": 3000, "protocol": "tcp", "appProtocol": "http" }],
    "environment": [
      { "name": "NODE_ENV", "value": "production" },
      { "name": "APP_PUBLIC_URL", "value": "https://app.yourdomain.com" },
      { "name": "SMTP_HOST", "value": "smtp.yourprovider.com" },
      { "name": "SMTP_PORT", "value": "587" },
      { "name": "SMTP_FROM", "value": "AcquisitionOS <no-reply@yourdomain.com>" },
      { "name": "STRIPE_PUBLISHABLE_KEY", "value": "pk_live_..." }
    ],
    "secrets": [
      { "name": "DATABASE_URL",  "valueFrom": "arn:aws:secretsmanager:us-east-1:YOUR_ACCOUNT_ID:secret:acquisitionos/prod/DATABASE_URL" },
      { "name": "DIRECT_URL",    "valueFrom": "arn:aws:secretsmanager:us-east-1:YOUR_ACCOUNT_ID:secret:acquisitionos/prod/DIRECT_URL" },
      { "name": "JWT_SECRET",    "valueFrom": "arn:aws:secretsmanager:us-east-1:YOUR_ACCOUNT_ID:secret:acquisitionos/prod/JWT_SECRET" },
      { "name": "ENCRYPTION_KEY","valueFrom": "arn:aws:secretsmanager:us-east-1:YOUR_ACCOUNT_ID:secret:acquisitionos/prod/ENCRYPTION_KEY" },
      { "name": "CRON_SECRET",   "valueFrom": "arn:aws:secretsmanager:us-east-1:YOUR_ACCOUNT_ID:secret:acquisitionos/prod/CRON_SECRET" }
    ],
    "healthCheck": {
      "command": ["CMD-SHELL", "wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1"],
      "interval": 30, "timeout": 10, "retries": 3, "startPeriod": 60
    },
    "logConfiguration": {
      "logDriver": "awslogs",
      "options": { "awslogs-group": "/acquisitionos/production", "awslogs-region": "us-east-1", "awslogs-stream-prefix": "ecs" }
    }
  }]
}
```

Notes: 1 vCPU / 2 GB is the minimum — 2 vCPU / 4 GB (`"cpu": "2048", "memory": "4096"`) is comfortable once real users arrive. The container `HEALTHCHECK` mirrors the task-level `wget` probe. `NEXT_PUBLIC_APP_URL` is **build-time** (baked into the image — [`frontend.md`](./frontend.md) §2), so it is not here. Add the remaining provider secrets (SMTP_PASSWORD, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, GOOGLE_CLIENT_SECRET, AI keys...) to `secrets` per [`secrets.md`](./secrets.md) §2.

```bash
aws ecs register-task-definition --cli-input-json file://taskdef.json
```

**Verify:** `aws ecs describe-task-definition --task-definition acquisitionos-prod --query "taskDefinition.status"` → `ACTIVE`, revision 1.

---

## 8. ALB + target group (tuned for SSE)

**What/Why:** the public load balancer + routing target — TLS termination, health checks, and the raised idle timeout this app's SSE streams require.

```bash
# 8.1 ALB in the public subnets
ALB_ARN=$(aws elbv2 create-load-balancer --name acquisitionos-prod --subnets ${PUB_SUBNETS} \
  --security-groups ${ALB_SG_ID} --scheme internet-facing --type application \
  --query "LoadBalancers[0].LoadBalancerArn" --output text)
ALB_DNS=$(aws elbv2 describe-load-balancers --load-balancer-arns ${ALB_ARN} --query "LoadBalancers[0].DNSName" --output text)
echo "ALB_DNS=${ALB_DNS}"

# 8.2 SSE fix: raise idle timeout (default 60 s kills streams; 3600 s recommended, >= 120 s minimum)
aws elbv2 modify-load-balancer-attributes --load-balancer-arn ${ALB_ARN} \
  --attributes Key=idle_timeout.timeout_seconds,Value=3600

# 8.3 Target group: HTTP:3000, health check /api/health, matcher 200
TG_ARN=$(aws elbv2 create-target-group \
  --name acquisitionos-tg --protocol HTTP --port 3000 --vpc-id ${VPC_ID} --target-type ip \
  --health-check-protocol HTTP --health-check-path /api/health --health-check-port traffic-port \
  --health-check-interval-seconds 30 --health-check-timeout-seconds 10 \
  --healthy-threshold-count 2 --unhealthy-threshold-count 3 --matcher HttpCode=200 \
  --query "TargetGroups[0].TargetGroupArn" --output text)

# 8.4 Deregistration delay: 30 s grace for in-flight SSE when tasks are drained
aws elbv2 modify-target-group-attributes --target-group-arn ${TG_ARN} \
  --attributes Key=deregistration_delay.timeout_seconds,Value=30

# 8.5 Temporary HTTP listener (replaced by HTTPS + redirect in §11)
aws elbv2 create-listener --load-balancer-arn ${ALB_ARN} --protocol HTTP --port 80 \
  --default-actions Type=forward,TargetGroupArn=${TG_ARN}
```

**Verify:** `aws elbv2 describe-target-groups --target-group-arns ${TG_ARN}` shows path `/api/health`; the ALB DNS name resolves after ~1 minute (`dig ${ALB_DNS}`).

---

## 9. ECS cluster + service (first deploy)

**What/Why:** the cluster is a logical grouping; the service keeps `desired-count` tasks alive and redeploys on new task definition revisions.

```bash
aws ecs create-cluster --cluster-name acquisitionos-prod

aws ecs create-service \
  --cluster acquisitionos-prod \
  --service-name acquisitionos-app \
  --task-definition acquisitionos-prod \
  --launch-type FARGATE \
  --desired-count 1 \
  --network-configuration "awsvpcConfiguration={subnets=[${PRIV_SUBNETS// /,}],securityGroups=[${APP_SG_ID}],assignPublicIp=DISABLED}" \
  --load-balancers "targetGroupArn=${TG_ARN},containerName=acquisitionos,containerPort=3000" \
  --health-check-grace-period-seconds 60 \
  --deployment-configuration "deploymentCircuitBreaker={enable=true,rollback=true}"
```

Three decisions: **`desired-count 1`** to start — use **2** for HA (two AZs, rolling deploys with zero gap; keep >= 1 always if SSE matters). **`assignPublicIp=DISABLED`** assumes NAT exists (§3) — if you skipped NAT, create tasks in the **public** subnets with `assignPublicIp=ENABLED` instead (Fargate pulls images and reads secrets via public endpoints without NAT; trade-offs in [`networking.md`](./networking.md) §2). The **circuit breaker with rollback** auto-reverts a broken deploy ([`../05-cicd.md`](../05-cicd.md) §7). First boot failing or unhealthy? `aws logs tail /${PROJECT}/production --follow` — usual causes: wrong secret ARN, security-group typo (§13).

```bash
aws ecs describe-services --cluster acquisitionos-prod --services acquisitionos-app \
  --query "services[0].{Status:status,Running:runningCount,LastEvent:events[0].message}"
aws elbv2 describe-target-health --target-group-arn ${TG_ARN} \
  --query "TargetHealthDescriptions[].TargetHealth.State"   # → "healthy"
curl -i http://${ALB_DNS}/api/health                        # → HTTP 200, database healthy
```

First boot failing or unhealthy? `aws logs tail /${PROJECT}/production --follow` — usual causes: wrong secret ARN, security-group typo (§13).

---

## 10. Apply the database schema (one-off, DIRECT_URL)

**What/Why:** push the Prisma schema (53+ tables) to the new database. The container does **not** migrate at boot; this is a deliberate one-off from your machine or CI.

```bash
export DIRECT_URL=$(aws secretsmanager get-secret-value \
  --secret-id ${PROJECT}/prod/DIRECT_URL --query SecretString --output text)
cd /path/to/acquisitionos
npx prisma db push --schema=prisma/schema.production.prisma
```

**Expected output:** "Your database is now in sync with your schema." **Verify:** `psql "$DIRECT_URL" -c '\dt' | head -20` lists tables; then watch `aws logs tail` as the new code meets the new schema. Context + the expand/migrate/contract pattern for future changes: [`../04-database-production.md`](../04-database-production.md) §4-6. Take a **manual RDS snapshot before any future schema change** ([`database.md`](./database.md) §4).

---

## 11. ACM certificate + Route 53 records

**What/Why:** a free managed TLS certificate + DNS pointing `app.yourdomain.com` at the ALB. Auth cookies are `secure` in production, so everything must be HTTPS.

```bash
# 11.1 Request the cert (must be in the ALB's region)
CERT_ARN=$(aws acm request-certificate --domain-name ${APP_HOST} --validation-method DNS \
  --query CertificateArn --output text)

# 11.2 Add the validation CNAME to the domain's DNS, wait for ISSUED
aws acm describe-certificate --certificate-arn ${CERT_ARN} \
  --query "Certificate.DomainValidationOptions[0].ResourceRecord"
# Route 53 console offers to add the ACM validation record with one click; else create the CNAME it prints.
aws acm wait certificate-validated --certificate-arn ${CERT_ARN}

# 11.3 HTTPS listener + lock down HTTP
aws elbv2 create-listener --load-balancer-arn ${ALB_ARN} --protocol HTTPS --port 443 \
  --certificates CertificateArn=${CERT_ARN} \
  --ssl-policy ELBSecurityPolicy-TLS13-1-2-2021-06 \
  --default-actions Type=forward,TargetGroupArn=${TG_ARN}
HTTP_LISTENER_ARN=$(aws elbv2 describe-listeners --load-balancer-arn ${ALB_ARN} --query "Listeners[?Port=='80'].ListenerArn" --output text)
aws elbv2 modify-listener --listener-arn ${HTTP_LISTENER_ARN} \
  --default-actions Type=redirect,RedirectConfig="{Protocol=HTTPS,Port=443,StatusCode=HTTP_301}"
```

11.4 **DNS record.** Route 53 hosted zone: create **A + AAAA** records for `app` with "Alias to Application Load Balancer" → `dualstack.${ALB_DNS}` (via CLI: `aws route53 change-resource-record-sets` with the zone ID and the ALB's `CanonicalHostedZoneId`). Other registrar: `CNAME`/ALIAS `app` → `${ALB_DNS}` ([`../06-dns-and-domains.md`](../06-dns-and-domains.md) §5). **Verify:** `curl -i https://${APP_HOST}/api/health` → 200; `http://` answers 301 (propagation: minutes to hours).

---

## 12. Scheduled jobs: EventBridge → the 15 HTTP cron endpoints

**What/Why:** AcquisitionOS has no in-app scheduler; an external one must call these endpoints with `Authorization: Bearer <CRON_SECRET>` (verified in [`../01-architecture.md`](../01-architecture.md) §2.4). On AWS the native fit is **EventBridge scheduled rules → API destinations**: API destinations send your Bearer header natively, no extra service. (EventBridge *Scheduler*, the managed-schedule service, targets AWS APIs only; using it needs API Gateway in front — an OPTIONAL extra this app does not need.)

12.1 **One connection holding the Bearer secret** (stored encrypted by EventBridge):

```bash
CONN_ARN=$(aws events create-connection \
  --name acquisitionos-cron \
  --authorization-type API_KEY \
  --auth-parameters '{"ApiKeyAuth":{"ApiKeyName":"Authorization","ApiKeyValue":"Bearer YOUR_CRON_SECRET"}}' \
  --query ConnectionArn --output text)
```

`YOUR_CRON_SECRET` = the value stored as `${PROJECT}/prod/CRON_SECRET` in §6. Exception: `/api/gmail/jobs/process` is protected by `GMAIL_CRON_API_KEY`, not `CRON_SECRET` — if you use Gmail pull mode, create a second connection with that key and use it for that one destination.

12.2 **Create rule + API destination for all 15 endpoints.** The cadences in `CRON_JOBS` are the recommended starting schedule from [`../01-architecture.md`](../01-architecture.md) §2.4 — tune to your usage. EventBridge `cron()` is 6 fields in **UTC**; destinations send **POST** (adjust `--http-method` for a GET-only route). The 15th endpoint, `/api/gmail/jobs/process`, is protected by `GMAIL_CRON_API_KEY` (not `CRON_SECRET`) — if you use Gmail pull mode, create a second connection with that key and run the same three commands for it (`rate(15 minutes)`).

```bash
# Format: <endpoint path>|<EventBridge schedule expression>
CRON_JOBS='
/api/cron/expire-api-keys|rate(30 minutes)
/api/cron/hot-lead-scan|rate(30 minutes)
/api/cron/process-sequences|rate(10 minutes)
/api/cron/sequence-processing|rate(10 minutes)
/api/cron/meeting-reminders|rate(10 minutes)
/api/cron/process-gmail-replies|rate(10 minutes)
/api/cron/autonomous-outreach|rate(30 minutes)
/api/cron/sdr-cycle|rate(30 minutes)
/api/cron/credit-renewal|cron(0 2 * * ? *)
/api/cron/end-of-period|cron(0 2 * * ? *)
/api/cron/renew-subscriptions|cron(0 2 * * ? *)
/api/cron/payment-reconciliation|cron(15 2 * * ? *)
/api/payments/process-billing|cron(0 3 * * ? *)
/api/feedback/retry-emails|cron(30 3 * * ? *)
'
while IFS='|' read -r CRON_PATH SCHED; do
  [ -z "$CRON_PATH" ] && continue
  NAME=$(echo "$CRON_PATH" | sed -e 's|^/api/||' -e 's|/|-|g')   # e.g. cron-expire-api-keys
  DEST_ARN=$(aws events create-api-destination --name "$NAME" \
    --connection-arn ${CONN_ARN} --http-method POST \
    --invocation-endpoint "https://${APP_HOST}${CRON_PATH}" \
    --query ApiDestinationArn --output text)
  aws events put-rule --name "$NAME" --schedule-expression "$SCHED"
  aws events put-targets --rule "$NAME" --targets "Id=app,Arn=${DEST_ARN}"
done <<< "$CRON_JOBS"
```

**Verify:** `aws events list-rules` shows the rules; easiest end-to-end check is to temporarily set one rule to `rate(1 minute)` and watch `aws logs tail /${PROJECT}/production --follow` for the endpoint's log line + a 200.

---

## 13. Logs and metrics

**What/Why:** the awslogs driver streams container stdout/stderr to CloudWatch; alarms turn silent failures into emails. Live logs: `aws logs tail /${PROJECT}/production --follow --format short` (one log stream per task). Recommended first alarms: ECS `CPUUtilization` / `MemoryUtilization` > 80% for 10 min, target-group `UnHealthyHostCount` > 0, RDS `FreeStorageSpace` low + `CPUUtilization` high — the repo's `deploy/terraform/main.tf` shows two of these as Terraform `aws_cloudwatch_metric_alarm`.

---

## 14. Final verification checklist

- [ ] `curl -i https://${APP_HOST}/api/health` → 200 (before §11, use the ALB DNS once the 443 listener exists)
- [ ] Sign up / log in with password, **email OTP**, and **magic link** (SMTP secret correct)
- [ ] Notifications bell receives **SSE** updates live; stream survives 10+ minutes (idle timeout 3600 s doing its job)
- [ ] One real **workflow** run completes end to end; **discovery** search works; one **AI** feature works
- [ ] Billing: send a Stripe/Razorpay **test webhook** → 200 in ALB/app logs; (if used) Gmail connect + reply ingestion works
- [ ] `aws logs tail` shows no recurring stack traces; target health stays `healthy`

Deployment complete. Next: harden and automate with [`terraform.md`](./terraform.md), tune the network with [`networking.md`](./networking.md), review [`database.md`](./database.md) + [`secrets.md`](./secrets.md) for the production settings you stubbed here.
