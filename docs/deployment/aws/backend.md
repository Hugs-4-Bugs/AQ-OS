# Backend — the API Side of the ECS Service

AcquisitionOS has **no separate backend to deploy**. The same Next.js standalone container that serves the UI also serves every `/api/**` route, the SSE streams, the cron receivers, and the webhook receivers ([`../01-architecture.md`](../01-architecture.md) §1). So "deploying the backend" means *configuring the one ECS service correctly for API traffic* — health checks, secrets, timeouts, logging, autoscaling, and webhook reachability. This page covers that API side; the UI side (build-time variables, caching) is in [`frontend.md`](./frontend.md), and the click-by-click task definition setup is in [`manual-deployment.md`](./manual-deployment.md) §7.

**Labels used below:** REQUIRED FOR CURRENT ACQUISITIONOS unless marked OPTIONAL / FUTURE-ALTERNATIVE.

---

## 1. The container contract (what the task definition must satisfy)

| Fact (verified in repo) | Value | Consequence on ECS |
| --- | --- | --- |
| Runtime | Node 20, `output: 'standalone'` → `node server.js` | Any Fargate `linux/amd64` task runs it; keep image platform consistent ([`manual-deployment.md`](./manual-deployment.md) §1) |
| Port | **3000**, binds `0.0.0.0` | `containerPort: 3000`, target group port 3000 |
| Health | `GET /api/health` (unauthenticated) | ALB health check + container healthCheck both point here |
| Scheduler | none in-app | EventBridge calls HTTP endpoints (§10) |
| Webhooks | `/api/payments/webhook/stripe` + `/api/payments/webhook/razorpay`, `/api/gmail/pubsub/webhook`, `/api/telegram/webhook` | Must be publicly reachable over HTTPS (§11) |

The full task definition JSON lives in [`manual-deployment.md`](./manual-deployment.md) §7. This page explains the decisions inside it.

---

## 2. Health checks — three layers, one path

**What:** the ALB, ECS, and (optionally) CloudWatch each probe the container. **Why:** ECS must know when to restart a task, the ALB must know when to send it traffic. All layers use the same cheap, unauthenticated endpoint `GET /api/health` (checks DB via `db.user.count()`, heap memory, in-process error count).

**ALB target group** (REQUIRED) — created in [`manual-deployment.md`](./manual-deployment.md) §8.3; recommendations repeated for reference:

```bash
aws elbv2 modify-target-group-attributes --target-group-arn ${TG_ARN} \
  --attributes Key=healthcheck.interval_seconds,Value=30
```

| Setting | Recommended | Reasoning for this app |
| --- | --- | --- |
| `health-check-path` | `/api/health` | Unauthenticated; touches the DB, so it fails when the DB fails |
| `health-check-port` | `traffic-port` (3000) | Same port as real traffic |
| `health-check-interval-seconds` | **30** | Fast enough to catch crashes; not so fast it adds load |
| `health-check-timeout-seconds` | **10** | `/api/health` does a DB roundtrip; give it room on cold starts |
| `healthy-threshold-count` | **2** | Return to rotation quickly after a restart |
| `unhealthy-threshold-count` | **3** | 90 s of failures before the target is pulled |
| `Matcher` | `HttpCode=200` | The endpoint answers 200 when healthy, 503 otherwise |

**Container healthCheck in the task definition** (REQUIRED) — lets ECS restart a wedged task even without ALB traffic:

```json
"healthCheck": {
  "command": ["CMD-SHELL", "wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1"],
  "interval": 30, "timeout": 10, "retries": 3, "startPeriod": 60
}
```

`startPeriod: 60` is important: Next.js needs a few seconds to boot and open its Prisma pool; without a start period, slow boots count as failures and trigger restart loops.

**Keep the rich endpoints internal.** `GET /api/health/detailed` and `GET /api/health/database` expose more than an internet caller should see (DB diagnostics, heap details). Block them at the ALB with a listener rule — see [`security.md`](./security.md) §8. The ALB health check itself goes over the normal request path, so it must use plain `/api/health`.

**Verify:**

```bash
aws elbv2 describe-target-health --target-group-arn ${TG_ARN} \
  --query "TargetHealthDescriptions[].TargetHealth.State"     # → "healthy"
curl -i https://${APP_HOST}/api/health                        # → 200
```

---

## 3. Environment vs secrets in the task definition

**What/Why:** the task definition carries two kinds of values. Plain `environment` entries are visible in the JSON (fine for non-secret config); `secrets` entries are fetched from Secrets Manager at task start by the **execution role**, never stored in the task def.

| Task def field | Example values for this app | Who can read it |
| --- | --- | --- |
| `environment` | `NODE_ENV=production`, `APP_PUBLIC_URL=https://app.yourdomain.com`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM`, `LOG_LEVEL=info`, `OTEL_SERVICE_NAME=acquisitionos-prod` | Anyone who can describe the task def |
| `secrets` | `DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET`, `ENCRYPTION_KEY`, `CRON_SECRET`, `SMTP_PASSWORD`, `RESEND_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `RAZORPAY_*`, `GOOGLE_CLIENT_SECRET`, `OPENAI_API_KEY`/`ANTHROPIC_API_KEY`/`OPENROUTER_API_KEY` | Only the execution role at task start; the task def stores just ARNs |

The full variable-by-variable table (what is a secret vs plain env vs build-time) is [`secrets.md`](./secrets.md) §2.

**Two roles, two jobs** (REQUIRED — the most common beginner confusion):

- **Execution role** (`acquisitionos-ecs-exec`) — used by the *ECS agent*, not your app. Needs: ECR image pull + CloudWatch Logs write (`AmazonECSTaskExecutionRolePolicy`) **plus** `secretsmanager:GetSecretValue` on your secret ARNs only. Your app cannot use this role even if it tried.
- **Task role** — assumed by the *application process*. The current app calls no AWS APIs directly (SMTP, Stripe, Google and AI calls are plain HTTPS with their own keys), so the task role is empty/omitted. If you later adopt S3 for uploads (OPTIONAL, [`architecture.md`](./architecture.md) §2), attach `s3:PutObject`/`s3:GetObject` on one bucket — nothing else.

Full IAM JSON: [`secrets.md`](./secrets.md) §5.

---

## 4. Database connectivity from the task

**What:** the app opens a Prisma 6 pool against RDS PostgreSQL. **Why it is configured this way:** every task keeps its own pool, so the per-instance limit must fit the instance's `max_connections` budget.

- `DATABASE_URL` — pooled path: `postgresql://app_user:...@DB_HOST:5432/acquisitionos?sslmode=require&connection_limit=10` (`connection_limit=10` per task is the sane start; the budget math is [`../04-database-production.md`](../04-database-production.md) §5 and [`database.md`](./database.md) §7).
- `DIRECT_URL` — same host without pooling params; used only by one-off `prisma db push` runs, not by the running service.
- Network path: task (app SG) → RDS SG on 5432, private subnets only; TLS forced via `rds.force_ssl=1` ([`manual-deployment.md`](./manual-deployment.md) §5).
- RDS Proxy is OPTIONAL; if you enable it, note the Prisma prepared-statement caveat first — [`database.md`](./database.md) §7 (NEEDS VERIFICATION for transaction-mode compatibility).

**Verify:** `curl -s https://${APP_HOST}/api/health | grep -o '"database":{"status":"[a-z]*"'` → `healthy`. If it says `unhealthy`, go to [`troubleshooting.md`](./troubleshooting.md) §5 (database connection failure).

---

## 5. API URL configuration (runtime vs build-time)

One origin serves UI and API, so **CORS is not needed** — the browser talks to the same host it loaded the page from (details: [`frontend.md`](./frontend.md) §5). What you must get right is the public URL the server uses to build absolute links:

- `APP_PUBLIC_URL=https://app.yourdomain.com` — **runtime**, in the task definition `environment`. Change it with a task def revision + redeploy (or a service force-new-deployment after a Secrets/config change).
- `NEXT_PUBLIC_APP_URL` — **build-time**, inlined into client JavaScript at `next build`. Changing it requires rebuilding the image ([`frontend.md`](./frontend.md) §2). Keep both values identical.
- Resolution order and the legacy fallback domain: [`../01-architecture.md`](../01-architecture.md) §2.2. The ALB forwards `Host` + `X-Forwarded-Proto` by default, which is exactly what `src/lib/app-url.ts` needs — do not insert a proxy that strips them ([`networking.md`](./networking.md) §5).

---

## 6. Logging (awslogs driver → CloudWatch)

**What/Why:** the container's stdout/stderr is the only place API errors land; the awslogs driver ships it to the log group created in [`manual-deployment.md`](./manual-deployment.md) §7.1.

```json
"logConfiguration": {
  "logDriver": "awslogs",
  "options": {
    "awslogs-group": "/acquisitionos/production",
    "awslogs-region": "us-east-1",
    "awslogs-stream-prefix": "ecs"
  }
}
```

Retention (set it, or logs bill forever): `aws logs put-retention-policy --log-group-name /acquisitionos/production --retention-in-days 30`.

**Verify:** `aws logs tail /acquisitionos/production --follow --format short` streams request logs while you click around the app. Queries and alarms: [`monitoring.md`](./monitoring.md).

---

## 7. Timeouts and the SSE budget

Three timeout knobs, each independent:

| Knob | Recommended | Protects |
| --- | --- | --- |
| ALB `idle_timeout.timeout_seconds` | **3600** (minimum 120) | SSE streams with 15–30 s heartbeats; the 60 s default kills them ([`networking.md`](./networking.md) §4) |
| Target group `deregistration_delay.timeout_seconds` | **30** | In-flight SSE/requests get a grace period during deploys |
| Task `stopTimeout` | **30** | Time between SIGTERM and SIGKILL inside the container — match the deregistration delay so the container is still alive while the ALB drains it |

```bash
aws elbv2 modify-load-balancer-attributes --load-balancer-arn ${ALB_ARN} \
  --attributes Key=idle_timeout.timeout_seconds,Value=3600
aws elbv2 modify-target-group-attributes --target-group-arn ${TG_ARN} \
  --attributes Key=deregistration_delay.timeout_seconds,Value=30
# stopTimeout goes in the task definition: "stopTimeout": 30
```

**Why 3600 for SSE:** the app's clients reconnect automatically and replay missed events with `Last-Event-ID` via `/api/realtime/recover` (verified — [`../01-architecture.md`](../01-architecture.md) §2.3), so a dropped stream is not an outage — but a 60 s idle timeout causes *constant* reconnect churn. Set it once, forget it.

---

## 8. Request limits (body size)

**What:** how large a request body the API accepts (invoice uploads, feedback attachments, webhook payloads).

- The **ALB does not impose a request-body size cap** — unlike nginx (`client_max_body_size`) there is no default ceiling to raise. Streaming uploads are passed through.
- If you later add **CloudFront** (OPTIONAL, [`networking.md`](./networking.md) §6), note that it does limit request body sizes — verify the current limit before routing uploads through it (NEEDS VERIFICATION).
- Practical limits therefore come from the app itself and from task memory: a multi-hundred-MB upload handled in-process consumes task memory. If uploads grow, prefer S3 direct upload (FUTURE/ALTERNATIVE — requires app support) over pushing bodies through the container.

---

## 9. CPU/memory sizing and autoscaling

**Start:** 1 vCPU / 2 GB (`"cpu": "1024", "memory": "2048"`). **Comfortable once real users arrive:** 2 vCPU / 4 GB. Valid Fargate size combos and the scaling policy JSON are in [`scaling.md`](./scaling.md) §2-3.

**Service autoscaling (REQUIRED for production):** target tracking on `ECSServiceAverageCPUUtilization` at 60%, minimum 1 task — **2 recommended for HA** (rolling deploys then have zero gap). Remember the two hard rules for this app:

1. Never scale to zero — SSE clients would lose their streams.
2. Never exceed 2+ tasks without setting `REDIS_URL` — events are instance-local without it (§ in [`scaling.md`](./scaling.md) §6).

SSE connection math (how many streams a task can hold): [`scaling.md`](./scaling.md) §4.

---

## 10. Deployment strategy + rollback pointer

**What/Why:** rolling deploys replace tasks one revision at a time; the **deployment circuit breaker** stops a broken rollout and (with `rollback=true`) reverts automatically instead of flapping forever.

```bash
aws ecs update-service --cluster acquisitionos-prod --service acquisitionos-app \
  --deployment-configuration "deploymentCircuitBreaker={enable=true,rollback=true},minimumHealthyPercent=100,maximumPercent=200"
```

- `minimumHealthyPercent=100` keeps at least one healthy task serving throughout (with desired count 2 you get true zero-downtime rolls).
- A new revision ≠ new config only: deploys change the image tag; secrets/config changes need a new revision too (or a `--force-new-deployment` after secret *values* changed in Secrets Manager).
- Manual rollback to a previous revision and the full runbook: [`rollback.md`](./rollback.md).

**Verify:** after `update-service`, `aws ecs wait services-stable --cluster acquisitionos-prod --services acquisitionos-app` returns; `describe-services` shows `rollouts` state `COMPLETED`.

---

## 11. Webhook registration (public HTTPS entry points)

**What/Why:** three provider-initiated endpoints must reach the container through the ALB. Register them **once** per environment — they do not change on redeployments (same domain).

| Provider | Exact URL to register | Method | Signature secret (where it lives) |
| --- | --- | --- | --- |
| Stripe | `https://app.yourdomain.com/api/payments/webhook/stripe` | POST | `STRIPE_WEBHOOK_SECRET` (`whsec_...` from the Stripe dashboard) |
| Razorpay | `https://app.yourdomain.com/api/payments/webhook/razorpay` | POST | `RAZORPAY_WEBHOOK_SECRET` |
| Gmail Pub/Sub (OPTIONAL — push mode) | `https://app.yourdomain.com/api/gmail/pubsub/webhook` | POST | Google OIDC token validation in-app; needs a (free) GCP project ([`architecture.md`](./architecture.md) §2) |
| Telegram (OPTIONAL) | `https://app.yourdomain.com/api/telegram/webhook` | POST | Per-config `x-telegram-bot-api-secret-token` header (verified in `src/app/api/telegram/webhook/route.ts`) |

Setup commands (Stripe example — needs `aws` + `stripe` CLI):

```bash
# 1. Create the webhook endpoint in Stripe and capture its signing secret
stripe webhook_endpoints create \
  --url "https://${APP_HOST}/api/payments/webhook/stripe" \
  --enabled-events "checkout.session.completed" "invoice.paid" "customer.subscription.deleted"
# → prints id=we_... and secret=whsec_...

# 2. Store the signing secret for the app
aws secretsmanager put-secret-value --secret-id ${PROJECT}/prod/STRIPE_WEBHOOK_SECRET \
  --secret-string "whsec_..."    # from the previous output

# 3. Verify the URL is reachable and answers non-POST safely
curl -s -o /dev/null -w "%{http_code}\n" -X GET https://${APP_HOST}/api/payments/webhook/stripe
```

**Verify (end to end):** trigger a Stripe test event (`stripe trigger invoice.paid`) and watch for a 200 from `/api/payments/webhook/stripe` in `aws logs tail /acquisitionos/production` or ALB access logs ([`monitoring.md`](./monitoring.md) §9).

**Requirements, in one line each:** the URL must be **public HTTPS** (after [`dns-ssl.md`](./dns-ssl.md)); providers only ever use **POST** — a GET/PUT registration or an ALB rule that blocks POSTs breaks signature checks; the signing secret must match the environment you registered (staging secrets ≠ production).

---

## 12. Backend checklist

```text
[ ] Target group health check: /api/health, interval 30 s, timeout 10 s, healthy 2 / unhealthy 3, matcher 200
[ ] Task def healthCheck with startPeriod 60; service health-check-grace-period 60 s
[ ] /api/health/detailed + /api/health/database blocked at the ALB (security.md §8)
[ ] Plain env in `environment`; all credentials in `secrets` via ARNs
[ ] Execution role reads only acquisitionos/prod/* secret ARNs; task role empty
[ ] DATABASE_URL with sslmode=require + connection_limit=10; DIRECT_URL kept for migrations
[ ] APP_PUBLIC_URL (runtime) == NEXT_PUBLIC_APP_URL (build-time) == https://app.yourdomain.com
[ ] ALB idle timeout 3600; deregistration delay 30 s; task stopTimeout 30
[ ] awslogs group /acquisitionos/production with retention
[ ] Autoscaling: target tracking CPU 60%, min 2 (HA), max within the DB connection budget
[ ] Circuit breaker enabled with rollback=true
[ ] Stripe/Razorpay webhook URLs registered; test event returns 200
```

---

## 13. Official Documentation

- ECS task definitions (env, secrets, healthCheck, stopTimeout) — https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task_definitions.html
- Secrets Manager in ECS tasks — https://docs.aws.amazon.com/AmazonECS/latest/developerguide/secrets-envvar.html
- ALB target group health checks — https://docs.aws.amazon.com/elasticloadbalancing/latest/application/target-group-health-checks.html
- ALB listener rules — https://docs.aws.amazon.com/elasticloadbalancing/latest/application/load-balancer-listeners.html
- ECS service autoscaling — https://docs.aws.amazon.com/AmazonECS/latest/developerguide/service-auto-scaling.html
- ECS deployment circuit breaker — https://docs.aws.amazon.com/AmazonECS/latest/developerguide/deployment-type-ecs.html
- Prisma connection management — https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/databases-connections/postgresql
