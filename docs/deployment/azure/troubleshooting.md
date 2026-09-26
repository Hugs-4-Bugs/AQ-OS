# Troubleshooting on Azure — AcquisitionOS Runbook

Commands assume the variables from [`manual-deployment.md`](./manual-deployment.md) §0 (`$APP`, `$RG`, `$PG`, `$KV`, …). Every entry follows **Symptom → Cause → Diagnosis → Fix → Prevention**. If you only read one section, read §1.

---

## 1. The first 10 minutes (triage runbook)

Run these in order. They answer "is it the edge, the app, or the database?" — which is 90 % of triage.

```bash
# 1) Is the public entry point alive at all?
curl -s -o /dev/null -w "%{http_code}\n" "https://app.yourdomain.com/api/health"

# 2) What does the app itself say?
curl -s "https://app.yourdomain.com/api/health"

# 3) What are the logs doing right now?
az containerapp logs show -n "$APP" -g "$RG" --tail 100

# 4) Which revision is live, and when was it created (correlate with the incident time)?
az containerapp ingress traffic show -n "$APP" -g "$RG" -o table
az containerapp revision list -n "$APP" -g "$RG" -o table

# 5) Is the database itself healthy?
az postgres flexible-server show -g "$RG" -n "$PG" --query "{state: state, vCores: sku.capacity}" -o jsonc

# 6) Did anything change recently (deploys, config, firewall, IAM)?
#    Portal -> each resource -> Activity Log  (also monitoring.md §9)

# 7) Decide with rollback.md §1: recent deploy -> app rollback (seconds, safe);
#    data wrong -> PITR bookmark first (backups.md §3), then the DB decision tree.
```

A deploy that breaks the app is *expected* to be revertible in minutes ([`rollback.md`](./rollback.md) §2) — when in doubt, roll the app back, then diagnose calmly.

---

## 2. DNS not resolving

**Symptom:** `curl` returns `Could not resolve host`; browser shows DNS_PROBE / NXDOMAIN for `app.yourdomain.com`.

**Cause:** nameservers not yet delegated to Azure DNS, missing CNAME, or the registrar still holds the zone.

**Diagnosis:**

```bash
dig NS yourdomain.com +short          # empty -> delegation incomplete
dig app.yourdomain.com CNAME +short   # empty -> record missing or zone not delegated
```

**Fix:** set the four Azure NS nameservers at the registrar ([`dns-ssl.md`](./dns-ssl.md) §2); recreate the `app` CNAME if absent. Wait out the TTL/delegation window (minutes to 48 h for NS moves).

**Prevention:** keep cutover TTLs at 300 s ([`dns-ssl.md`](./dns-ssl.md) §6); verify with `@1.1.1.1` before announcing the domain.

---

## 3. SSL not working

**Symptom:** browser certificate warning; portal shows the custom domain certificate **Pending** for hours; `curl` fails TLS handshake.

**Cause:** the managed certificate cannot validate — usually because the CNAME does not resolve yet, or the `asuid.<hostname>` TXT validation record is missing ([`dns-ssl.md`](./dns-ssl.md) §3–4).

**Diagnosis:**

```bash
dig app.yourdomain.com CNAME +short                     # must resolve first
az network dns record-set txt show -g "$RG" -z yourdomain.com -n "asuid.app" -o table
az containerapp show -n "$APP" -g "$RG" \
  --query properties.configuration.ingress.customDomains -o json   # cert state
```

**Fix:** create the CNAME (wait for resolution), add the TXT record if the portal requested one, then re-trigger issuance in Portal → Custom domains. The exact CLI command for issuance varies by az version (NEEDS VERIFICATION — use the portal, per [`manual-deployment.md`](./manual-deployment.md) §8.2). Never delete the records afterwards — auto-renewal depends on them.

**Prevention:** follow the order CNAME → TXT → certificate ([`dns-ssl.md`](./dns-ssl.md) §3.1) and check "Issued" before updating `APP_PUBLIC_URL`.

---

## 4. CORS failure

**Symptom:** browser console shows "blocked by CORS policy" / preflight `OPTIONS` failing on API calls.

**Cause:** on the single-host deployment this app is tuned for, CORS **cannot** happen — UI and API share one origin. Seeing CORS errors means the UI and API are actually being served from *different* hosts (an `api.` split, a staging/prod mix-up, or a proxy rewriting the host).

**Diagnosis:** browser devtools → Network: compare the origin of the page with the origin of the failing request. If they differ, the host config split them ([`frontend.md`](./frontend.md) §6, [`../06-dns-and-domains.md`](../06-dns-and-domains.md) §3).

**Fix:** return to one host: serve UI + API from `app.yourdomain.com` only, and set `APP_PUBLIC_URL`/`NEXT_PUBLIC_APP_URL` to that host ([`backend.md`](./backend.md) §6). The repo's CORS tooling (`src/lib/security/cors-config.ts`) exists only for a deliberate split (FUTURE/ALTERNATIVE).

**Prevention:** the one-host rule; a post-deploy login smoke test catches host drift immediately ([`../05-cicd.md`](../05-cicd.md) §7).

---

## 5. Database connection failure

**Symptom:** `/api/health` shows `database` unhealthy; logs show Prisma "Can't reach database server" or auth failures; 500s on every data route.

**Cause (in observed frequency):** firewall rules → TLS/sslmode → wrong user/password → private-endpoint DNS → connection limit.

**Diagnosis:**

```bash
az postgres flexible-server firewall list -g "$RG" -n "$PG" -o table   # rules present?
PGPASSWORD="..." psql "host=$PG.postgres.database.azure.com port=5432 \
  dbname=acquisitionos user=app_user sslmode=require" -c "select 1;"   # direct test
az containerapp logs show -n "$APP" -g "$RG" --tail 50 | grep -i prisma
```

**Fix per cause:**

- **Firewall:** recreate `my-machine` (your IP) + `azure-services` (0.0.0.0) rules ([`database.md`](./database.md) §7) — note these do **not** carry over to a restored server ([`backups.md`](./backups.md) §4).
- **TLS:** `sslmode=require` must be in both connection strings; Flexible Server rejects plaintext ([`database.md`](./database.md) §8).
- **Wrong user:** the app uses `app_user`, not `pgadmin`; re-run the grant script if roles are missing ([`manual-deployment.md`](./manual-deployment.md) §3.1).
- **Private-endpoint DNS:** on the VNet path, the `privatelink.postgres.database.azure.com` zone must be linked to the VNet or resolution fails ([`networking.md`](./networking.md) §3).
- **Connection limit:** Prisma "Timed out fetching a new connection" → budget check replicas × `connection_limit` vs `max_connections` ([`scaling.md`](./scaling.md) §5).

**Prevention:** the §5 checklist in [`database.md`](./database.md) §15; a Key Vault value change always followed by a revision restart ([`secrets.md`](./secrets.md) §5).

---

## 6. Container crash / restart loop

**Symptom:** `Restart count` metric climbing; replicas flapping; intermittent 502s; logs end abruptly mid-request.

**Cause:** usually **OOM** (memory cap too low) or a missing env var crashing the Node process at boot; rarely a bad image.

**Diagnosis:**

```bash
az containerapp show -n "$APP" -g "$RG" --query "properties.template.containers[0].resources" -o json
az containerapp logs show -n "$APP" -g "$RG" --tail 200 | grep -iE "fatal|cannot|undefined|exit"
az monitor metrics alert list -g "$RG" -o table    # restart alerts, if configured (monitoring.md §4)
```

**Fix:** OOM → raise memory one step (`az containerapp update --memory 2Gi`, [`scaling.md`](./scaling.md) §3). Missing env at boot → the env-var symptom map (§9 below) tells you which; add via `--set-env-vars` (or the Key Vault secretref) and let the revision restart. Bad image → app rollback ([`rollback.md`](./rollback.md) §2).

**Prevention:** memory alerts at 75 % of cap ([`monitoring.md`](./monitoring.md) §4); env-var checklist in CI before deploy ([`cicd.md`](./cicd.md) §9).

---

## 7. Health probe failure

**Symptom:** revision shows "Unhealthy"/"Degraded"; ingress returns 502/503; platform restarts replicas even though manual requests work.

**Cause:** probe misconfiguration (wrong path/port/interval) or the app genuinely failing the check at boot (DB unreachable, slow cold start) or at runtime (liveness too aggressive).

**Diagnosis:** Portal → Containers → Health probes: path must be `/api/health`, port `3000`, and the startup budget generous (~40 s delay, ~12 × 10 s attempts — [`backend.md`](./backend.md) §2). Then hit the same URL from inside: `curl -s https://app.yourdomain.com/api/health` (200 = probe config is the problem, not the app).

**Fix:** correct path/port/interval to §2 of [`backend.md`](./backend.md); if the DB is what fails the check, fix §5 first — `/api/health` reports `database` status and *should* go unhealthy when the DB is down (that is correct behavior, not a probe bug).

**Prevention:** only `/api/health` is probed (never `/api/health/detailed|database`); probe settings survive in IaC ([`terraform.md`](./terraform.md) §4.5).

---

## 8. Port mismatch

**Symptom:** ingress 502 on every route; logs show the app running happily; `/api/health` fine when exec'd locally in the container.

**Cause:** ingress **target port** ≠ the port the standalone server binds. AcquisitionOS binds **3000** (verified: Dockerfile CMD + `next.config.ts` standalone output) — anything else is config drift.

**Diagnosis:**

```bash
az containerapp ingress show -n "$APP" -g "$RG" \
  --query "{targetPort: targetPort, transport: transport, external: external}" -o jsonc
```

**Fix:** `az containerapp ingress update -n "$APP" -g "$RG" --target-port 3000 --transport auto` ([`networking.md`](./networking.md) §5; if the flag shape differs, use the portal's Ingress pane).

**Prevention:** never change the target port "to be safe"; the app is 3000, full stop ([`../03-docker.md`](../03-docker.md)).

---

## 9. Environment variable missing (symptom map)

**Symptom:** app runs but specific features fail. Map the failure to the variable:

| What you observe | Missing/wrong variable | Fix + restart |
| --- | --- | --- |
| Every login/auth route 500s; "auth not configured"-style boot errors | `JWT_SECRET` (secretref unresolved counts) | [`secrets.md`](./secrets.md) §3.1 |
| `/api/health` reports database unhealthy | `DATABASE_URL` | §5 above |
| OTP/magic-link/verification replies "Email delivery is not configured" | `SMTP_HOST/PORT/USER/PASSWORD/FROM` (or `RESEND_API_KEY`) | [`secrets.md`](./secrets.md) §3.3, [`../02-environment-variables-and-secrets.md`](../02-environment-variables-and-secrets.md) §3 |
| Magic links / OAuth redirects point at the wrong host (localhost, `azurecontainerapps.io`, or the legacy fallback) | `APP_PUBLIC_URL` (runtime) and/or `NEXT_PUBLIC_APP_URL` (build-time!) | [`backend.md`](./backend.md) §6, [`../01-architecture.md`](../01-architecture.md) §2.2 |
| AI features error out | No fallback provider key set (`OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `OPENROUTER_API_KEY`) — the sandbox z-ai path is unavailable outside the sandbox (NEEDS VERIFICATION by design) | [`secrets.md`](./secrets.md) §3.6 |
| Cron endpoints 401 | `CRON_SECRET` mismatch between Function App setting and app | [`cicd.md`](./cicd.md) §8, §16 below |

**Diagnosis (values never readable for secretrefs — by design):**

```bash
az containerapp show -n "$APP" -g "$RG" --query "properties.template.containers[0].env" -o table
```

**Fix:** set the var (`--set-env-vars` for plain, `--secrets` + secretref for sensitive), creating a new revision. **`NEXT_PUBLIC_*` needs a rebuild**, not a restart ([`frontend.md`](./frontend.md) §2).

**Prevention:** the end-to-end checklist before every real deploy ([`README.md`](./README.md) §5).

---

## 10. Secret unavailable (Managed Identity role missing)

**Symptom:** revision fails to start or restarts forever; logs/portal diagnostics mention failing to resolve a secret (`keyvaultref`); the app boots after a manual restart with no change.

**Cause:** the app's system-assigned Managed Identity lacks `Key Vault Secrets User` on the vault — often just RBAC propagation delay right after creation ([`manual-deployment.md`](./manual-deployment.md) §6).

**Diagnosis:**

```bash
PRINCIPAL_ID=$(az containerapp show -n "$APP" -g "$RG" --query identity.principalId -o tsv)
az role assignment list --assignee "$PRINCIPAL_ID" -o table
```

**Fix:** assign `Key Vault Secrets User` scoped to the vault (§6 of the manual guide), wait minutes for propagation, then `az containerapp revision restart -n "$APP" -g "$RG"`.

**Prevention:** create the role assignment as part of app creation (Terraform does this in [`terraform.md`](./terraform.md) §4.6); vault RBAC + purge protection per [`secrets.md`](./secrets.md) §2.

---

## 11. Deploy succeeds but the app misbehaves

**Symptom:** CI green, revision active, yet users see old behavior; or the new feature is absent; or the UI is broken while the API works.

**Cause:** two classics — (a) **build-time `NEXT_PUBLIC_*` stale** (the image was built before the value changed), (b) **old revision still receiving traffic** (canary weights never moved to 100 %, or a second environment-specific build was skipped — [`frontend.md`](./frontend.md) §5).

**Diagnosis:**

```bash
az containerapp ingress traffic show -n "$APP" -g "$RG" -o table    # weights per revision
az acr repository show-tags --name "$ACR" --repository acquisitionos -o tsv | tail -5
curl -s https://app.yourdomain.com | grep -o "app.yourdomain.com" | head -1   # baked URL check
```

**Fix:** (a) rebuild with the `--build-arg NEXT_PUBLIC_APP_URL=...` of [`cicd.md`](./cicd.md) §2 — restarts cannot fix build-time values; (b) move weights to 100 on the intended revision ([`backend.md`](./backend.md) §13).

**Prevention:** CI builds per environment with explicit build-args; the post-deploy smoke list includes one login + one SSE check ([`../05-cicd.md`](../05-cicd.md) §7).

---

## 12. Migrations fail

**Symptom:** `prisma db push` errors in CI or locally: authentication failure, "permission denied", or lock waits/timeouts.

**Cause:** wrong `DIRECT_URL` (pointing at the pooled host/DB, or a stale restored host), `app_user` missing grants, or an object lock from a long-running transaction ([`../04-database-production.md`](../04-database-production.md) §4–6).

**Diagnosis:**

```bash
psql "$DIRECT_URL" -c "select current_user, current_database();"   # right identity? right DB?
psql "$DIRECT_URL" -c "\dp public.*" | head                        # grants present?
psql "$DIRECT_URL" -c "select relation, mode, granted, pid from pg_locks l
  join pg_class c on c.oid = l.relation limit 20;"                 # who holds locks
```

**Fix:** re-export the exact `direct-url` from Key Vault ([`cicd.md`](./cicd.md) §3); re-run the grant script as admin if grants are missing ([`manual-deployment.md`](./manual-deployment.md) §3.1); for locks, wait out the cron window or identify the holding query via Query Store ([`database.md`](./database.md) §13). A destructive-push prompt (`--accept-data-loss`) is a **stop**, not an error to bypass — [`rollback.md`](./rollback.md) §3.

**Prevention:** single-flight migration step behind the CI concurrency guard ([`cicd.md`](./cicd.md) §6); UTC timestamp bookmark before risky changes ([`backups.md`](./backups.md) §3).

---

## 13. Timeout (requests and SSE)

**Symptom:** clients report the notifications bell "disconnecting" or events arriving in bursts; long AI/billing requests die at a fixed duration; the scheduler reports truncated runs.

**Cause:** some hop's timeout < the operation's duration. The app's SSE heartbeats (15–30 s) are designed to keep idle connections alive — a stream that still dies points at a configured timeout or buffering in the chain ([`../01-architecture.md`](../01-architecture.md) §2.3).

**Diagnosis:**

```bash
curl -N -H "Cookie: <auth-cookie>" "https://app.yourdomain.com/api/events/notifications"
# heartbeats must stream every 15-30 s. Burst-then-die = buffering; clean cutoff at N s = timeout.
```

**Fix:** on the direct Container Apps path there is no verified per-revision idle-timeout knob (NEEDS VERIFICATION — [`architecture.md`](./architecture.md) §3); heartbeats should suffice, so verify you have not altered them. If **Front Door** is in front: raise the origin response timeout (~240 s max; exact current maximum NEEDS VERIFICATION) and keep caching disabled on `/api/events/*` ([`networking.md`](./networking.md) §6). For scheduler routes, raise the Function/Job timeout (`--replica-timeout`, [`manual-deployment.md`](./manual-deployment.md) §9.2) past the slowest endpoint.

**Prevention:** the SSE verification step in every deploy checklist; timeouts documented per hop in [`networking.md`](./networking.md) §10.

---

## 14. Memory exhaustion

**Symptom:** replicas restart with no deploy; logs truncated mid-stream; `Working set bytes` saw-tooths against the cap.

**Cause:** memory cap too low for real traffic (Next.js + Prisma + SSE connections hold memory), or a leak. See also §6.

**Diagnosis:** portal Metrics: `Working set bytes` vs the configured cap; correlate restarts with traffic peaks.

**Fix:** raise memory one step ([`scaling.md`](./scaling.md) §3) — do not "fix" OOM by adding replicas (spreads the same cap across more processes and triggers the Redis requirement). Recurring OOM at 2–4 Gi with modest traffic is an app-level leak: capture heap profiles, open an app issue.

**Prevention:** memory alert at 75 % ([`monitoring.md`](./monitoring.md) §4); capacity notes in [`backend.md`](./backend.md) §9.

---

## 15. CPU exhaustion

**Symptom:** p95 latency climbs; `Usage nano cores` pinned near the allocation; SSE heartbeats jitter.

**Cause:** CPU allocation too low (0.5 vCPU start), or a genuinely expensive route (AI assembly, large exports) hogging the event loop.

**Diagnosis:** metrics per above; KQL on slow request paths (App Insights if wired, else timestamps in logs — [`monitoring.md`](./monitoring.md) §2–3).

**Fix:** `az containerapp update --cpu 1.0` ([`scaling.md`](./scaling.md) §3); if CPU is *always* saturated at 1–2 vCPU under normal traffic, add replicas (after §5–6 of the scaling page: budget + Redis).

**Prevention:** load-test once with realistic traffic (login + bell + one workflow run) before launch.

---

## 16. Background job not running (scheduler)

**Symptom:** sequences not processing, reminders not sent, subscriptions not renewed; no cron lines in app logs.

**Cause:** Function App disabled/stopped, timer bucket not created for that endpoint, wrong HTTP method (an endpoint that expects GET answering 405 to POST), or `CRON_SECRET` mismatch (401s).

**Diagnosis:**

```bash
az functionapp logs tail -g "$RG" -n func-acquisitionos-cron        # did it fire? what status?
az containerapp logs show -n "$APP" -g "$RG" --tail 300 | grep -i "cron"
curl -s -o /dev/null -w "%{http_code}\n" -X POST \
  -H "Authorization: Bearer $CRON_SECRET" \
  "https://app.yourdomain.com/api/cron/hot-lead-scan"               # 200 expected; 401 = secret
```

**Fix:** no firing → check the Function started/enabled and the NCRONTAB (six fields, seconds first — [`manual-deployment.md`](./manual-deployment.md) §9.1); 401 → the Function's `CRON_SECRET` (Key Vault reference) diverges from the app's — re-sync from the vault; 405 → that endpoint expects GET, switch the method per endpoint (NEEDS VERIFICATION per route — the handbook default is POST); `/api/gmail/jobs/process` uses `GMAIL_CRON_API_KEY`, not `CRON_SECRET` ([`../01-architecture.md`](../01-architecture.md) §2.4).

**Prevention:** after any vault rotation, re-fire one bucket and verify a 200 ([`secrets.md`](./secrets.md) §6); the full 15-endpoint verification lives in [`cicd.md`](./cicd.md) §8.

---

## 17. Webhook failure (Stripe / Razorpay / Gmail / Telegram)

**Symptom:** payments state does not update; Stripe dashboard shows failing deliveries; Gmail push silent.

**Cause:** URL not publicly reachable (cert/DNS), wrong signature secret in the app, endpoint receiving non-POST, or an edge component buffering/altering the request.

**Diagnosis:**

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST "https://app.yourdomain.com/api/payments/webhook/stripe"
# 400/401 from the APP (not 5xx from the edge) means reachability + routing are fine;
# the app rejected an unsigned/invalid body - which is correct behavior.
az containerapp logs show -n "$APP" -g "$RG" --tail 200 | grep -i webhook
```

**Fix:** unreachable → DNS/cert ([§2](#2-dns-not-resolving), [§3](#3-ssl-not-working)); signature failures → re-copy the signing secret into Key Vault `stripe-webhook-secret`/`razorpay-webhook-secret` and restart the revision ([`backend.md`](./backend.md) §14); if the provider's dashboard shows timeouts on a route that works via curl, suspect edge buffering — Front Door route config per [`networking.md`](./networking.md) §6; non-POST → the provider is misconfigured (webhooks are POST).

**Prevention:** send one test event after every domain/secret change ([`README.md`](./README.md) §5 verification list); webhook URLs are registered once and are deploy-independent ([`cicd.md`](./cicd.md) §8).

---

## 18. Logs unavailable

**Symptom:** `az containerapp logs show` empty; Log Analytics queries return nothing; "no data" in the workspace.

**Cause:** the environment was created without (or with a broken) Log Analytics association, the workspace query hits the wrong table/schema, or your RBAC cannot read the workspace.

**Diagnosis:**

```bash
az containerapp env show -n "$ENV_NAME" -g "$RG" \
  --query "properties.appLogsConfiguration" -o jsonc        # logDestination should be log-analytics
az monitor log-analytics workspace show -g "$RG" -n "$LAW" --query customerId -o tsv
az role assignment list --assignee "$(az ad signed-in-user show --query id -o tsv)" -o table | grep -i "log analytics"
```

**Fix:** if the environment lacks the destination, recreate the environment wired to the workspace (apps cannot be moved between environments — plan it, [`networking.md`](./networking.md) §2); if it is a permissions issue, request `Log Analytics Reader`/`Monitoring Reader` on the workspace or resource group; if it is schema confusion, re-pick column names from the portal schema pane ([`monitoring.md`](./monitoring.md) §2). Meanwhile `--follow` from the CLI uses the streaming API and works even when workspace queries mislead.

**Prevention:** wire Log Analytics at environment creation (the handbook's default, [`manual-deployment.md`](./manual-deployment.md) §5); keep Key Vault + Activity Log diagnostics flowing ([`monitoring.md`](./monitoring.md) §9).

---

## 19. Quick cross-reference

| Symptom | Likely sections |
| --- | --- |
| Bell dead after scaling to 2+ replicas | [`scaling.md`](./scaling.md) §6 (Redis) |
| 502 from ingress, app fine | §7 probe, §8 port |
| Everything 500s right after a deploy | [`rollback.md`](./rollback.md) §2 first |
| Slow dashboards, fast everywhere else | [`database.md`](./database.md) §13 (Query Store) |
| Suspicious access / secret reads | [`security.md`](./security.md) §8, §12 |

## 20. Official Documentation

- Container Apps troubleshooting — https://learn.microsoft.com/azure/container-apps/
- Container Apps log streaming — https://learn.microsoft.com/azure/container-apps/log-monitoring
- Managed certificate diagnostics — https://learn.microsoft.com/azure/container-apps/custom-domains-managed-certificates
- Flexible Server connectivity troubleshooting — https://learn.microsoft.com/azure/postgresql/flexible-server/how-to-connect-tls-ssl
- Functions timer diagnostics — https://learn.microsoft.com/azure/azure-functions/functions-bindings-timer
- First-10-minutes flow — §1 above; rollback decisions — [`rollback.md`](./rollback.md) §1
