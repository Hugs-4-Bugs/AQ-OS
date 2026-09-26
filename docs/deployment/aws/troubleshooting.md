# Troubleshooting — AcquisitionOS on AWS

Every problem below is written as **Symptom → Cause → Diagnosis → Fix → Prevention**, with the commands that give you the answer fastest. Names used throughout (from [`manual-deployment.md`](./manual-deployment.md)): cluster `acquisitionos-prod`, service `acquisitionos-app`, task def family `acquisitionos-prod`, target group `acquisitionos-tg`, log group `/acquisitionos/production`, ALB `acquisitionos-prod`, ECR repo `acquisitionos`, host `app.yourdomain.com`. Set your shell variables first:

```bash
export AWS_REGION="us-east-1"
export ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
export APP_HOST="app.yourdomain.com"
```

---

## 1. The first 10 minutes (triage runbook — do these in order)

```text
 1. From the internet:   curl -i https://${APP_HOST}/api/health
    → 200 = request path + DB work; 503 = no healthy target; timeout = DNS/ALB/cert layer.
 2. Target health:
    aws elbv2 describe-target-health --target-group-arn $(aws elbv2 describe-target-groups \
      --names acquisitionos-tg --query "TargetGroups[0].TargetGroupArn" --output text) \
      --query "TargetHealthDescriptions[].TargetHealth.[State,Reason,Description]"
    → "unhealthy" + Reason tells you whether the task never started, failed health checks,
      or the ALB cannot reach port 3000.
 3. Live logs:
    aws logs tail /acquisitionos/production --since 15m --format short
    → stack traces, the last log line before death, whether the app ever booted.
 4. Service events (what ECS thinks happened):
    aws ecs describe-services --cluster acquisitionos-prod --services acquisitionos-app \
      --query "services[0].[events[0:5],runningCount,desiredCount,deployments[].{td:taskDefinition,running:runningCount}]"
    → circuit-breaker rollbacks, task stop reasons, deploy mid-flight.
 5. Task stop reason (if tasks die immediately):
    aws ecs describe-tasks --cluster acquisitionos-prod --tasks $(aws ecs list-tasks \
      --cluster acquisitionos-prod --service-name acquisitionos-app --query "taskArns[0]" --output text) \
      --query "tasks[0].[lastStatus,stoppedReason,containers[0].exitCode]"
 6. Database is alive (and what the app thinks — /api/health already said):
    aws rds describe-db-instances --db-instance-identifier acquisitionos-prod \
      --query "DBInstances[0].[DBInstanceStatus]" --output text
    + /api/health already told you what the app thinks of the DB.
 7. Recent change?  CI run history, then:
    aws cloudtrail lookup-events --lookup-attributes AttributeKey=EventName,AttributeValue=UpdateService \
      --max-results 3      (who touched the service, when — monitoring.md §11)
 8. Cron still running?  aws cloudwatch get-metric-statistics --namespace AWS/Events \
      --metric-name FailedInvocations --dimensions Name=RuleName,Value=cron-process-sequences ...
 9. Decide with rollback.md §5 checklist — revert app (task def), DB, or infra.
10. Write down: symptom, first bad timestamp, cause, fix. The next incident is cheaper.
```

The problem map: DNS (§3) · SSL (§4) · CORS (§5) · DB connection (§6) · container crash/OOM (§7) · health check failure (§8) · port mismatch (§9) · env var missing (§10) · secret unavailable (§11) · deploy succeeds but app fails (§12) · migrations fail (§13) · timeouts (§14) · memory (§15) · CPU (§16) · cold start/placement (§17) · background jobs (§18) · webhooks (§19) · logs unavailable (§20) · rollout stuck (§21) · logged-out loops (§22) · staging↔production bleed (§23).

---

## 2. Symptom decoder — which section owns your symptom

**What:** the fastest path from "what the user sees" to the section above. **Why it is first:** most incidents are mislabeled — a "CORS error" is usually a 500, a "site is down" is usually one unhealthy target.

| What you observe | First check | Section |
| --- | --- | --- |
| `Could not resolve host` | `dig ${APP_HOST} +short` | §3 |
| Certificate warning / handshake failure | ACM status + listener cert | §4 |
| Browser "blocked by CORS policy" | Compare origins; check real status code | §5 |
| `/api/health` says `database: unhealthy` | SG rules + `sslmode=require` | §6 |
| Tasks crash-looping / `OutOfMemoryError` | `describe-tasks` stoppedReason | §7, §15 |
| ALB answers 503 | Target health reasons | §8 |
| Requests hang, then 504 | idle timeout + DB pressure | §14 |
| Auth returns 500 on every route | Task def `environment`/`secrets` diff | §10 |
| OTP/magic link: "Email delivery is not configured" | SMTP/Resend secrets | §10 |
| Magic links point at the wrong host | `APP_PUBLIC_URL` / `NEXT_PUBLIC_APP_URL` | §10, §12 |
| 401 fetching a secret at task start | Execution role + ARN region | §11 |
| CI green but behavior unchanged | Image SHA actually deployed | §12 |
| `db push` fails or hangs | `DIRECT_URL`, grants, locks | §13 |
| SSE drops every minute | ALB idle timeout | §14 |
| Slow but not erroring | RDS CPU/connections first | §16 |
| Cron/webhooks silently not firing | Rules + Connection + method | §18, §19 |
| Log group empty or access denied | Region + IAM + retention | §20 |
| Everyone suddenly logged out | `JWT_SECRET` rotated? | §22 |
| Staging writes visible in production data | Secret separation audit | §23 |

Status-code decoder for the edge (what the **ALB layer** says vs what it means):

| Response | Who produced it | Meaning |
| --- | --- | --- |
| `200` | app | Healthy end to end |
| `301` (on port 80) | ALB listener | HTTP→HTTPS redirect working as configured |
| `403` on `/api/health/detailed`, `200` on `/api/health` | ALB rule | Your protection rules are live ([`security.md`](./security.md) §8) |
| `502` | ALB → target | Target refused/closed the connection — app crash or port mismatch (§7, §9) |
| `503` | ALB | No healthy target registered (§8) or target group empty |
| `504` | ALB | Target accepted the connection but did not answer in time (§14) |
| `timeout` / `000` from curl | network | DNS, TLS, or security-group problem before the ALB (§3, §4) |

---

## 3. DNS not resolving

- **Symptom:** `curl https://${APP_HOST}/api/health` → `Could not resolve host`; browser `DNS_PROBE_FINISHED_NXDOMAIN`.
- **Cause:** record created in the wrong zone, registrar still on old name servers, or the record name typo'd (`app.app.yourdomain.com`).
- **Diagnosis:** `dig ${APP_HOST} +short` (empty) → `dig NS yourdomain.com +short` (do the four `awsdns` servers answer? If not, delegation is missing — [`dns-ssl.md`](./dns-ssl.md) §1). `aws route53 list-resource-record-sets --hosted-zone-id ${ZONE_ID} | grep app` for typos.
- **Fix:** complete registrar delegation with the Route 53 NS set, or UPSERT the A/AAAA ALIAS record correctly ([`dns-ssl.md`](./dns-ssl.md) §4).
- **Prevention:** verify delegation right after zone creation; create records via Terraform ([`terraform.md`](./terraform.md) §4.8) so name typos are review diffs.

## 4. SSL not working

- **Symptom:** browser certificate warning; `curl` `SSL certificate problem`; handshake failure via domain but fine via `${ALB_DNS}`.
- **Cause:** ACM certificate still `PENDING_VALIDATION`, cert requested in the **wrong region** (must be `us-east-1` with the ALB), or the 443 listener has no/wrong certificate.
- **Diagnosis:** `aws acm describe-certificate --certificate-arn ${CERT_ARN} --query "Certificate.Status"`; check the validation CNAME resolves (`dig _xxxx.app.yourdomain.com CNAME +short`); `aws elbv2 describe-listeners --load-balancer-arn ${ALB_ARN} --query "Listeners[?Port=='443'].Certificates"`.
- **Fix:** re-add the validation record ([`dns-ssl.md`](./dns-ssl.md) §2.3), request in the right region, or attach the cert to the listener (§3 of the same page).
- **Prevention:** keep the validation CNAME forever (auto-renew depends on it); Terraform ties listener↔cert so it cannot drift.

## 5. CORS failure (only if you split hosts)

- **Symptom:** browser console: `Access to fetch ... has been blocked by CORS policy`. API works via `curl`.
- **Cause:** the UI is served from a **different origin** than the API. On the default single-host deployment (same container, same `app.yourdomain.com`) CORS cannot occur — same origin by construction ([`frontend.md`](./frontend.md) §5).
- **Diagnosis:** compare the page's origin with the failing request URL. If both are `${APP_HOST}`, this is not CORS — it is a 4xx/5xx the browser mislabels; check the network tab status.
- **Fix:** stop splitting hosts (drop the `api.` subdomain idea — the app is one unit, [`../01-architecture.md`](../01-architecture.md) §1). If a split is truly required, the app must send `Access-Control-Allow-Origin` — an app change (FUTURE/ALTERNATIVE), not an ALB setting.
- **Prevention:** one canonical host everywhere: `APP_PUBLIC_URL`, OAuth redirect URIs, webhook URLs ([`dns-ssl.md`](./dns-ssl.md) §6).

## 6. Database connection failure

- **Symptom:** `/api/health` returns 200 but `"database":{"status":"unhealthy"}`; logs show `P1001`/`Can't reach database server` or connection timeouts.
- **Cause (in frequency order):** wrong SG rule (RDS SG does not accept app SG on 5432), `sslmode=require` missing while `rds.force_ssl=1`, wrong endpoint/credentials in the secret, app exceeds the connection budget, RDS Proxy pinning quirks.
- **Diagnosis:**
  ```bash
  aws ec2 describe-security-groups --group-ids ${RDS_SG_ID} --query "GroupId,IpPermissions"
  aws rds describe-db-instances --db-instance-identifier acquisitionos-prod --query "DBInstances[0].[Endpoint.Address,DBInstanceStatus]"
  # from inside the VPC (bastion or one-off task):
  nc -zv <RDS_HOST> 5432 && psql "postgresql://app_user:PW@<RDS_HOST>:5432/acquisitionos?sslmode=require" -c 'select 1'
  # connection budget vs reality:
  psql "..." -c 'SHOW max_connections;'   # compare with tasks × connection_limit (04-database §5)
  ```
- **Fix:** add the missing SG ingress from the app SG; rebuild the `DATABASE_URL` secret with `?sslmode=require&connection_limit=10` and roll tasks ([`secrets.md`](./secrets.md) §3); correct credentials/endpoint; lower `connection_limit` or scale DB ([`scaling.md`](./scaling.md) §5). **RDS Proxy caveat:** if you introduced the proxy, prepared statements + transaction-mode pinning are the prime suspect (NEEDS VERIFICATION — test session-level pinning, [`database.md`](./database.md) §7).
- **Prevention:** SG layering exactly per [`manual-deployment.md`](./manual-deployment.md) §4; `DatabaseConnections` alarm ([`monitoring.md`](./monitoring.md) §3); never enable RDS Proxy without the Prisma check.

## 7. Container crash (OOM / missing env)

- **Symptom:** tasks flip `RUNNING → PROVISIONING` repeatedly; `describe-tasks` shows `stoppedReason: OutOfMemoryError` or exit code 1; or immediate crashloop after first deploy.
- **Cause:** OOM at 1 GB/"256" sizes, or a missing required env (`DATABASE_URL`, `JWT_SECRET`) — the app exits at startup (env validation, verified: `src/lib/env-validation.ts`).
- **Diagnosis:** `aws ecs describe-tasks ... --query "tasks[0].[stoppedReason,containers[0].exitCode]"`; then `aws logs tail /acquisitionos/production --since 30m` for the exact throw (OOM leaves nothing — see §15).
- **Fix:** OOM → new task def with larger memory (`2048`/`2048` minimum, [`backend.md`](./backend.md) §9); missing env → add it to `environment` or `secrets` (§10) and roll.
- **Prevention:** smoke-test the exact task def in staging first ([`frontend.md`](./frontend.md) §6); container healthCheck + circuit breaker catch this before users do ([`backend.md`](./backend.md) §2, §10).

## 8. Health check failure (ALB says unhealthy)

- **Symptom:** target group `unhealthy`, Reason `Target.FailedHealthChecks` (or `Timeout`); ALB answers 503.
- **Cause:** health check path/port wrong (must be `/api/health` on port 3000), DB unreachable from the task (`/api/health` checks the DB — it fails if the DB fails), startPeriod too short so boots count as failures, or the app is genuinely erroring.
- **Diagnosis:** `aws elbv2 describe-target-health ... --query "TargetHealthDescriptions[].TargetHealth.[Reason,Description]"`; then `curl -i http://<task-eni-ip>:3000/api/health` from inside the VPC to see what the app actually answers; logs (step 3 of §1).
- **Fix:** correct path/port/matcher 200 ([`backend.md`](./backend.md) §2 table); fix the DB layer (§6); raise `startPeriod` to 60+ and service `health-check-grace-period-seconds` 60; if the app 500s on `/api/health`, fix the app (logs say why).
- **Prevention:** never point health checks at authenticated routes; keep `/api/health` fast and dependency-light on purpose (it checks only DB + memory + error counts by design).

## 9. Port mismatch

- **Symptom:** targets healthy for a moment then `Request timeout` / 503; app logs show requests arriving but ALB logs 504; or nothing arrives at all.
- **Cause:** the app listens on **3000** but the target group, container mapping, or SG says something else; a leftover from the repo's Terraform opens 8000 (old split) while the target group points elsewhere.
- **Diagnosis:** three places must agree on 3000: task def `portMappings[].containerPort`, target group `--port 3000`, app SG ingress. `aws elbv2 describe-target-groups --names acquisitionos-tg --query "TargetGroups[].[Port,HealthCheckPort]"`; `aws ecs describe-task-definition --task-definition acquisitionos-prod --query "taskDefinition.containerDefinitions[0].portMappings"`; the Dockerfile CMD binds 3000 (verified).
- **Fix:** align all three on 3000; close the 8000 leftover ([`security.md`](./security.md) §2).
- **Prevention:** copy the §7 task def of [`manual-deployment.md`](./manual-deployment.md) verbatim; keep it Terraform-managed.

## 10. Env var missing — the symptom map

**What/Why:** missing variables have misleading downstream symptoms; this table is the decoder (full inventory: [`secrets.md`](./secrets.md) §2, [`../02-environment-variables-and-secrets.md`](../02-environment-variables-and-secrets.md)):

| Missing/wrong variable | Symptom in the app |
| --- | --- |
| `JWT_SECRET` | 500s on every auth route (signin/OTP/magic link); users cannot log in |
| `DATABASE_URL` | container exits at boot or `/api/health` `database: unhealthy` (§6/§7) |
| `SMTP_*` (or `RESEND_API_KEY`) | OTP/magic-link requests fail or log **"Email delivery is not configured"** (verified string in `src/lib/email-ethereal.ts`) — email auth unusable |
| `APP_PUBLIC_URL` wrong/absent | magic links and OAuth redirects point at the wrong host (or the hardcoded legacy domain) — link resolution order in [`../01-architecture.md`](../01-architecture.md) §2.2 |
| `NEXT_PUBLIC_APP_URL` (build-time!) | client-side URLs stale even after fixing `APP_PUBLIC_URL` — needs an image **rebuild** ([`frontend.md`](./frontend.md) §2) |
| `CRON_SECRET` mismatch | all 15 cron endpoints return 401 (§18) |
| AI provider key absent | AI features error — the sandbox primary has no external availability; set at least one fallback key (NEEDS VERIFICATION for z-ai outside the sandbox) |
| `AUTH_DEV_MODE` set in prod | forbidden; production hard-gates it off — remove it ([`../02-environment-variables-and-secrets.md`](../02-environment-variables-and-secrets.md) §1) |

- **Diagnosis:** `aws ecs describe-task-definition --task-definition acquisitionos-prod --query "taskDefinition.containerDefinitions[0].[environment,secrets]"` — diff against the inventory table; app logs name the missing one at boot.
- **Fix:** add to `environment` (non-secret) or `secrets` (ARN), register a new revision, deploy ([`cicd.md`](./cicd.md) §3).
- **Prevention:** the staging environment shares the task def template — a missing var surfaces there first.

## 11. Secret unavailable at task start

- **Symptom:** tasks stop immediately; ECS event says `Fetching secret ... failed` or `ResourceInitializationError`; sometimes `AccessDenied` in role logs.
- **Cause:** execution role lacks `secretsmanager:GetSecretValue` on that ARN, secret is in a **different region** than the task (ARNs are region-locked), or the secret was deleted/renamed.
- **Diagnosis:** `aws ecs describe-tasks ... --query "tasks[0].stoppedReason"`; `aws iam simulate-principal-policy --policy-source-arn <exec-role-arn> --action-names secretsmanager:GetSecretValue --resource-arns <secret-arn>`; compare the ARN's region in the task def with `AWS_REGION`.
- **Fix:** extend the inline policy to the missing ARN (keep the `acquisitionos/prod/*` scoping, [`backend.md`](./backend.md) §3); recreate/rename the secret or fix the ARN; roll tasks.
- **Prevention:** create all secrets in one batch with one prefix ([`manual-deployment.md`](./manual-deployment.md) §6) so one policy covers them.

## 12. Deploy succeeds but app fails

- **Symptom:** CI green, `services-stable` green, yet users see the old bug — or a new one with old code behavior.
- **Cause (both classics):** (a) `NEXT_PUBLIC_*` changes require a **rebuild** — you redeployed an old image built with stale values ([`frontend.md`](./frontend.md) §2); (b) the deployment's new tasks pulled a stale cached image because the tag didn't change (mutated `latest`).
- **Diagnosis:** `aws ecs describe-task-definition --task-definition acquisitionos-prod --query "taskDefinition.containerDefinitions[0].image"` — does the SHA match the commit you think shipped? Check the ECR image's push timestamp for that tag.
- **Fix:** rebuild from the right commit, push with a **new SHA tag**, re-run the deploy ([`cicd.md`](./cicd.md) §2-3); never mutate an already-pushed tag.
- **Prevention:** CI tags by `github.sha` (immutable by construction); frontend var changes = new build = new tag.

## 13. Migrations fail (`prisma db push`)

- **Symptom:** `db push` errors: `P1001` (can't reach), `P3006`, `permission denied`, or hangs then `canceling statement due to lock timeout`.
- **Cause:** used `DATABASE_URL` instead of `DIRECT_URL`; `app_user` lacks `CREATE` on schema `public`; another session holds a lock (long transaction) on a table being altered.
- **Diagnosis:** confirm which URL you ran with (`echo ${DIRECT_URL:+set}`); `psql "$DIRECT_URL" -c '\d+' <table>` to check ownership; `psql "$DIRECT_URL" -c "SELECT pid, state, query FROM pg_stat_activity WHERE wait_event='Lock';"` for blockers.
- **Fix:** always `npx prisma db push --schema=prisma/schema.production.prisma` with `DIRECT_URL` ([`manual-deployment.md`](./manual-deployment.md) §10); re-grant `USAGE, CREATE ON SCHEMA public` if privileges were dropped; terminate/commit the blocking session off-peak. Destructive prompt (`--accept-data-loss`) → stop and follow [`rollback.md`](./rollback.md) §2.
- **Prevention:** migrations via CI, serialized ([`cicd.md`](./cicd.md) §4, §6), snapshot taken first ([`backups.md`](./backups.md) §2).

## 14. Timeouts (SSE and scheduler)

- **Symptom:** (a) notifications bell reconnects every ~60 s; (b) long AI/analysis requests die at a fixed wall-clock; (c) EventBridge invocations marked failed with `HTTP 504`-style errors.
- **Cause:** (a) ALB `idle_timeout` back at the 60 s default — must exceed the 15–30 s heartbeats by a wide margin (3600 recommended); (b) same knob: a slow request with no bytes for > idle timeout gets cut; (c) a target that cannot answer within the connection budget (DB pressure — §6/§16).
- **Diagnosis:** `aws elbv2 describe-load-balancer-attributes --load-balancer-arn ${ALB_ARN} --query "Attributes[?Key=='idle_timeout.timeout_seconds']"`; app logs: do heartbeats keep flowing on the affected stream?; `TargetResponseTime` p95 during the window ([`monitoring.md`](./monitoring.md) §3).
- **Fix:** set `idle_timeout.timeout_seconds=3600` ([`backend.md`](./backend.md) §7); for (c) fix the DB/pressure root cause — clients auto-reconnect and replay via `Last-Event-ID` (`/api/realtime/recover`), so short blips self-heal by design.
- **Prevention:** the idle-timeout check is part of the end-to-end checklist ([`README.md`](./README.md) §5); Terraform manages it so console edits cannot silently revert it.

## 15. Memory exhaustion

- **Symptom:** tasks die with `OutOfMemoryError` (dmesg-style OOM in `stoppedReason`), sporadically under load; no stack trace in logs (the killer is the kernel).
- **Cause:** 2 GB is tight once AI analysis, large Prisma result sets, or upload handling spike; a leak (trend, not load, correlated death).
- **Diagnosis:** `aws cloudwatch get-metric-statistics --namespace AWS/ECS --metric-name MemoryUtilization ...` (per service) — climbing trend at steady traffic = leak; spikes on specific endpoints = workload size; correlate deaths with `describe-tasks` stop times.
- **Fix:** move to 2 vCPU / 4 GB ([`scaling.md`](./scaling.md) §3); prefer fewer-bigger tasks (§1 of that page); cap the offending workload (batch sizes, pagination).
- **Prevention:** `MemoryUtilization` > 80% alarm ([`monitoring.md`](./monitoring.md) §3); load-test the deploy candidate in staging.

## 16. CPU exhaustion

- **Symptom:** `TargetResponseTime` p95 climbs, deploys of new tasks stay at 100% CPU, autoscaler pinned at `max-capacity` yet latency keeps rising.
- **Cause:** at 60% target tracking, pinned-at-max + rising latency means the bottleneck is **downstream** — almost always RDS (queries, not CPU) or an external API; more tasks just multiply connections.
- **Diagnosis:** RDS `CPUUtilization` + `DatabaseConnections` ([`monitoring.md`](./monitoring.md) §3-4); app logs for slow request markers; `EXPLAIN ANALYZE` the hot queries ([`../04-database-production.md`](../04-database-production.md) §8).
- **Fix:** DB work first (index, batch), then RDS vertical scale ([`scaling.md`](./scaling.md) §5.1) — only then more tasks.
- **Prevention:** the metrics-to-action table ([`scaling.md`](./scaling.md) §9) — resist scaling tasks into a database bottleneck.

## 17. Cold start / slow task placement

- **Symptom:** after scale-out or deploy, 30–90 s where capacity is below demand; users see slow responses, not errors.
- **Cause:** Fargate has no scale-to-zero (min ≥ 1 always) but has *placement + pull* latency: image pull (100s of MB), Prisma pool open, `startPeriod` health checks; larger images = slower pulls.
- **Diagnosis:** `aws ecs describe-services ... --query "services[0].deployments"` (pending count), and task `startedAt` vs `createdAt` gaps; ECR scan findings don't block pulls but multi-arch pull paths can surprise (keep `linux/amd64` consistent, [`manual-deployment.md`](./manual-deployment.md) §1).
- **Fix:** nothing to fix below ~60 s — it is the cost of correctness; reduce image size if pulls dominate; keep `min-capacity 2` so there is always headroom ([`scaling.md`](./scaling.md) §2).
- **Prevention:** schedule deploys off-peak; the circuit breaker + grace period mean slow boots don't flap.

## 18. Background job not running (cron)

- **Symptom:** sequences don't advance, API keys don't expire, reminders never send; nothing in logs for that endpoint.
- **Cause (checklist order):** rule disabled or missing; Connection carries the wrong `Authorization` header (not exactly `Bearer <CRON_SECRET>`); `CRON_SECRET` secret rotated without updating the Connection (or vice versa); wrong HTTP method — `/api/cron/payment-reconciliation` is **GET** (verified in the repo), everything else POST; `/api/gmail/jobs/process` needs `GMAIL_CRON_API_KEY`, not `CRON_SECRET`.
- **Diagnosis:**
  ```bash
  aws events list-rules --query "Rules[].[Name,State,ScheduleExpression]"
  aws events describe-connection --name acquisitionos-cron --query "ConnectionState"
  # fire one manually and watch:
  aws events list-targets-by-rule --rule cron-expire-api-keys --query "Targets[].Arn"
  aws logs tail /acquisitionos/production --since 10m | grep expire-api-keys   # expect a 200 line
  ```
  A 401 line in app logs = secret mismatch; `FailedInvocations` metric ([`monitoring.md`](./monitoring.md) §5) = ALB/network/timeout issue.
- **Fix:** enable the rule; recreate the Connection with `ApiKeyName=Authorization`, value `Bearer <CRON_SECRET>` ([`cicd.md`](./cicd.md) §8.1); fix the method (`--http-method GET` for payment-reconciliation); rotate secret + Connection in lockstep ([`security.md`](./security.md) §5).
- **Prevention:** the §5 failed-invocation alarms + one temporary `rate(1 minute)` verification per environment ([`cicd.md`](./cicd.md) §8.3 verify step).

## 19. Webhook failure (Stripe / Razorpay / Gmail / Telegram)

- **Symptom:** provider dashboard shows delivery failures; payments reconcile late; Pub/Sub dead-lettering after retries.
- **Cause (checklist order):** URL not the public HTTPS host (placeholder/localhost registered); provider sends GET/PUT-ish test or you registered the wrong path; signature secret mismatch (`STRIPE_WEBHOOK_SECRET` vs the endpoint that issued it — staging ≠ production secrets); the ALB rule blocking the path (§8 of [`security.md`](./security.md)); TLS/DNS broken for that provider only (rare).
- **Diagnosis:**
  ```bash
  curl -s -o /dev/null -w "%{http_code}\n" -X POST https://${APP_HOST}/api/payments/webhook/stripe   # 400 is FINE (no signature) — proves reachability
  aws logs tail /acquisitionos/production --since 1h | grep payments/webhook                  # signature-verification errors vs reachability errors
  ```
  A 400/401 from the app = path reachable, signature/secret problem. A 503/timeout = ALB/target problem (§8). Nothing in logs = request never arrived (URL/registration problem).
- **Fix:** register `https://app.yourdomain.com/api/payments/webhook/stripe` (Stripe) or `https://app.yourdomain.com/api/payments/webhook/razorpay` (Razorpay) (POST) and re-copy the signing secret into Secrets Manager + roll tasks ([`backend.md`](./backend.md) §11); ensure the WAF/security rules exempt the path; for Gmail Pub/Sub set `GMAIL_PUBSUB_WEBHOOK_URL` to the live domain.
- **Prevention:** the end-to-end webhook test ([`README.md`](./README.md) §5 verification) after every domain or secret change; test-event trigger in staging first.

## 20. Logs unavailable

- **Symptom:** `aws logs tail` says group/stream doesn't exist, or shows nothing for a task that clearly ran; `AccessDenied` from the CLI.
- **Cause:** log group never created or in the wrong **region**; task def `awslogs-region` mismatch; your IAM user/role lacks `logs:GetLogEvents`; retention policy expired the window you're searching (30 days, [`backend.md`](./backend.md) §6).
- **Diagnosis:** `aws logs describe-log-groups --log-group-name-prefix /acquisitionos` (note the region!); `aws ecs describe-task-definition --task-definition acquisitionos-prod --query "taskDefinition.containerDefinitions[0].logConfiguration"`; `aws sts get-caller-identity` — whose credentials are you using?
- **Fix:** create the group ([`manual-deployment.md`](./manual-deployment.md) §7.1), align region in task def and CLI (`--region`), add `logs:GetLogEvents`/`FilterLogEvents` to your admin permissions or use the admin user ([`prerequisites.md`](./prerequisites.md) §3), and accept that >30-day-old lines are gone by design.
- **Prevention:** one region everywhere ([`prerequisites.md`](./prerequisites.md) §5); the deploy pipeline's `VerifyLogs` policy already includes read access ([`cicd.md`](./cicd.md) §1.3).

---

## 21. Deploy rollout stuck (`IN_PROGRESS` forever)

- **Symptom:** `describe-services` shows two deployments for hours; new tasks keep launching and dying quietly; CI's `wait-for-stability` hangs.
- **Cause:** new tasks fail the ALB health check (§8) but the circuit breaker has not tripped yet (it needs several consecutive failures across the rollout window), or `minimumHealthyPercent=100` with `desired-count 1` means ECS must keep the old task alive while trying to place a new one that keeps failing.
- **Diagnosis:** `aws ecs describe-services ... --query "services[0].deployments[].{td:taskDefinition,running:runningCount,status:status}"`; look at the *new* tasks only: `aws logs tail /acquisitionos/production --since 30m` filtered to their stream prefix; target-health reason for the new targets.
- **Fix:** if you can see the cause (bad env, bad secret), fix the task def and redeploy ([§10](#10-env-var-missing--the-symptom-map), §11); if not, stop the bleeding: `aws ecs update-service --cluster acquisitionos-prod --service acquisitionos-app --task-definition acquisitionos-prod:<LAST_GOOD>` — ECS stops the stuck rollout and converges on the known-good revision ([`rollback.md`](./rollback.md) §1.2).
- **Prevention:** `desired-count >= 2` in production so rollouts overlap instead of blocking; staging deploy first ([`frontend.md`](./frontend.md) §6); health check grace period 60 s ([`backend.md`](./backend.md) §2).

## 22. Users logged out constantly (auth 401 loops)

- **Symptom:** sessions survive minutes, not days; users bounced to sign-in mid-work; API calls intermittently 401.
- **Cause:** `JWT_SECRET` changed (rotation invalidates every existing session — expected, one-time), different tasks running with *different* `JWT_SECRET` values (a secret updated in Secrets Manager while old tasks still run), or `APP_PUBLIC_URL`/`X-Forwarded-Proto` mismatch making cookies `Secure`-domain mismatched.
- **Diagnosis:** `aws ecs describe-services ... --query "services[0].deployments"` — more than one task definition running means mixed secrets; `curl -sI https://${APP_HOST}/auth/signin | grep -i set-cookie` to inspect `Secure`/`Domain` attributes; check when `JWT_SECRET` version was last updated (`aws secretsmanager describe-secret --secret-id acquisitionos/prod/JWT_SECRET --query "LastUpdatedDate"`).
- **Fix:** let the rollout finish so all tasks share the secret (one-time sign-out wave is correct); if a *stale* deployment lingers, force a full roll: `aws ecs update-service --force-new-deployment ...`; fix the public URL/headers ([`backend.md`](./backend.md) §5, [`../01-architecture.md`](../01-architecture.md) §2.2).
- **Prevention:** rotate `JWT_SECRET` only in announced windows ([`security.md`](./security.md) §5); never run long-lived mixed deployments.

## 23. Staging pointing at the production database (the scariest one)

- **Symptom:** test signups appear in production `User` table; a staging `db push` altered production schema; "staging broke prod".
- **Cause:** staging secrets copied from production verbatim — `DATABASE_URL`/`DIRECT_URL` still point at `acquisitionos-prod`.
- **Diagnosis:** `aws secretsmanager get-secret-value --secret-id acquisitionos/staging/DATABASE_URL --query SecretString --output text | sed 's/:[^:@]*@/:***@/'` — read the host only; it must be the *staging* instance. `psql "$STAGING_DIRECT_URL" -c 'select current_database(), inet_server_addr();'` if in doubt.
- **Fix:** stop staging tasks immediately; create/repoint staging secrets at a staging RDS instance ([`frontend.md`](./frontend.md) §6); `db push` the staging schema there; re-enable. Audit production data for test rows before deleting anything.
- **Prevention:** staging is a **separate RDS instance + separate secret prefix** (`acquisitionos/staging/*`), never shared; the IAM policy already scopes by prefix ([`backend.md`](./backend.md) §3) — extend it per environment, not per account-wide wildcard beyond `acquisitionos/*`.

---

## 24. Escalation path

When the runbook doesn't converge: capture the §1 outputs (target health, events, last 100 log lines, CloudTrail lookups) into an incident note, revert via [`rollback.md`](./rollback.md) §5 if users are impacted, and only then investigate at leisure. For AWS-side faults (ALB/RDS region issues), the health status in `describe-*` plus the AWS Health Dashboard are the authoritative checks.

---

## 25. Official Documentation

- ECS troubleshooting guide — https://docs.aws.amazon.com/AmazonECS/latest/developerguide/troubleshooting.html
- ALB target health reasons — https://docs.aws.amazon.com/elasticloadbalancing/latest/application/target-group-health-checks.html
- ECS stopped task error codes — https://docs.aws.amazon.com/AmazonECS/latest/troubleshootguide/stopped-task-error-codes.html
- Prisma error reference (P1001 etc.) — https://www.prisma.io/docs/orm/reference/error-reference
- CloudWatch Logs Insights syntax — https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/CloudWatch_Logs_Logs_Insights_Syntax.html
- EventBridge troubleshooting — https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-troubleshooting.html
- Stripe webhook testing — https://docs.stripe.com/webhooks#test-manually
