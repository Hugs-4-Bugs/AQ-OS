# GCP Security — IAM, Secrets, Network, and What Must Never Leak

This page is the security baseline for the deployment built in [`manual-deployment.md`](./manual-deployment.md). It is deliberately boring: least-privilege IAM, secrets in Secret Manager, TLS everywhere, a short list of endpoints to wall off, and a short list of things that must never be committed. Every item is checkable.

Cross-references: secret management deep-dive [`secrets.md`](./secrets.md); incident runbook [`troubleshooting.md`](./troubleshooting.md) §1; rollback [`rollback.md`](./rollback.md).

```bash
export PROJECT_ID="YOUR_PROJECT_ID"      # gcloud config get-value project
export REGION="us-central1"
export SERVICE_NAME="acquisitionos"
export RUNTIME_SA="acquisitionos-runtime@${PROJECT_ID}.iam.gserviceaccount.com"
export APP_DOMAIN="app.yourdomain.com"
```

---

## 1. IAM least privilege — `REQUIRED FOR CURRENT ACQUISITIONOS`

**What:** three identities, each with only what it does:

| Identity | Needs | Must NOT have |
| --- | --- | --- |
| **Runtime SA** (Cloud Run acts as it) | `roles/secretmanager.secretAccessor` (on the secrets), `roles/cloudsql.client` (DB path) | `roles/run.invoker` is **not** needed for a publicly-ingressed service; no `roles/editor`; no secret *admin* |
| **Deployer / CI SA** ([`cicd.md`](./cicd.md) §2) | `roles/run.admin`, `roles/artifactregistry.writer`, `roles/secretmanager.secretAccessor`, `roles/cloudsql.client`, `roles/iam.serviceAccountUser` on the runtime SA | billing, IAM editing, SQL admin/deletion |
| **Humans** | `roles/viewer` + what they actually operate | interactive `Owner`/`Editor` for day-to-day work |

```bash
# Audit what the runtime SA actually has:
gcloud projects get-iam-policy "$PROJECT_ID" \
  --flatten="bindings[].members" \
  --filter="bindings.members:${RUNTIME_SA}" \
  --format="table(bindings.role)"
# Expected output: exactly secretAccessor (+ cloudsql.client if using private IP / proxy with IAM) — nothing else.
```

Notes:

- If you deploy behind the LB with `--ingress=internal-and-cloud-load-balancing`, the LB's service agent needs `roles/run.invoker` on the *service* — that is an LB identity, not a reason to widen the runtime SA ([`networking.md`](./networking.md) §3).
- Never grant primitive roles (`roles/editor`, `roles/owner`) to service accounts. If a command "needs" Editor, the command is wrong.
- WIF (no JSON keys) for CI — a downloaded service-account key is a permanent password ([`cicd.md`](./cicd.md) §2).

## 2. Secret handling — recap

Full lifecycle: [`secrets.md`](./secrets.md). Non-negotiables repeated here because they are security, not convenience:

- Every secret env var is injected via `--set-secrets`; nothing secret goes in `--set-env-vars`, the image, or Git.
- `roles/secretmanager.secretAccessor` granted to the runtime SA **on the secrets** (or project, if few) — nobody else.
- Enable **Data Access** audit logs for Secret Manager so reads are attributable ([`monitoring.md`](./monitoring.md) §8).
- Rotation: JWT_SECRET rotation invalidates all sessions (planned maintenance); CRON_SECRET rotation means updating the scheduler jobs in the same breath ([`secrets.md`](./secrets.md) §6).

## 3. Network — keep the database and admin surface private

**Cloud SQL private IP** (`OPTIONAL` hardening, recommended once the Auth-Proxy path works): instance reachable only inside the VPC; Cloud Run reaches it via Direct VPC egress or a Serverless VPC Access connector. Comparison and walkthrough: [`database.md`](./database.md) §4 and [`networking.md`](./networking.md) §2. No public IP option exists with private IP — that is the point.

**Cloud Run ingress settings** (service-level, not VPC-level):

```bash
gcloud run services update "$SERVICE_NAME" --region="$REGION" \
  --ingress=internal-and-cloud-load-balancing
# Expected output: revision ... deployed. Direct hits to *.run.app now fail; traffic must enter via your LB.
```

`REQUIRED` once the LB path is live (do it in the same deploy as the LB cutover, [`networking.md`](./networking.md) §3); scheduler jobs, webhooks, and users all arrive through the LB, which forwards natively.

**Cloud Armor** (`OPTIONAL`): WAF policies on the LB backend — rate-limit rules on `/api/*`, IP allow-lists if your team is small. Basics: [`networking.md`](./networking.md) §7. Start with rate limiting on auth and cron endpoints; add the preconfigured WAF rule sets (`FUTURE/ALTERNATIVE` for day one) when you have traffic worth attacking.

## 4. TLS everywhere — `REQUIRED`

- Edge: Google-managed certificate (Certificate Manager / domain mapping) with auto-renew — [`dns-ssl.md`](./dns-ssl.md). HTTP→HTTPS: serve only HTTPS (the LB/domain-mapping paths handle this; verify with `curl -I http://$APP_DOMAIN/api/health`).
- Database: `sslmode=require` on every connection string (Cloud SQL enforces TLS with the default flags — [`database.md`](./database.md) §2).
- Cookies: the app marks auth cookies `secure` in production — a broken cert chain breaks login itself, so treat cert-expiry alerts as availability alerts ([`monitoring.md`](./monitoring.md) §4 row 8).

## 5. Rate limiting — two layers

- **App layer (present):** the application has an in-process rate limiter (verified in-repo) — per-instance memory, effective per instance. Fine for single-instance deployments.
- **Edge layer (`OPTIONAL`):** Cloud Armor rate-limit rules apply across all instances. The moment you run **more than one Cloud Run instance**, app-level limits are per-instance quotas, not global — use Cloud Armor for global thresholds, and note that adopting Redis (`REDIS_URL`) also enables shared-state limiting for the features that support it ([`scaling.md`](./scaling.md) §6).

## 6. Container & image scanning

- **Artifact Analysis** scans images pushed to Artifact Registry and reports vulnerabilities (Monitoring → Security, or `gcloud artifacts docker images list-vulnerabilities`). Make it visible weekly; block on CRITICAL via the CI trivy step instead ([`cicd.md`](./cicd.md) §3).
- The runtime container is already hardened by the repo Dockerfile (non-root user, alpine base — [`../../03-docker.md`](../03-docker.md)); do not override the user.
- CI credentials are the smallest standing risk: WIF condition pins the repo, the deployer SA holds four roles, nothing more ([`cicd.md`](./cicd.md) §2).

## 7. Dependency scanning

```yaml
# In CI (05-cicd.md §1 step "Checks"): fail the build on known-vulnerable dependencies
- run: npm audit --audit-level=high
```

`npm ci` reproduces the lockfile; `npm audit` scores it. Run both on every PR. Add Dependabot/Renovate (`OPTIONAL`) so updates arrive as PRs instead of as news stories.

## 8. Audit trails

- **Cloud Audit Logs** — admin activity is always on: IAM changes, secret lifecycle, Cloud Run deploys, SQL changes. Data Access for Secret Manager: enable deliberately ([`monitoring.md`](./monitoring.md) §8).
- **App-level audit:** the app has its own audit route group (`src/app/api/audit/`) for user actions — the two trails answer different questions (who changed the infra vs who changed the data).
- Review cadence: weekly glance at admin-activity logs; immediately after any "something changed" surprise.

## 9. Protect admin-ish endpoints — verified public today

**What:** these routes are functional but unauthenticated **in the current code** — verify each against `src/app/api/**` before exposing a deployment publicly, and wall them off at the edge:

| Route | What it reveals | Action |
| --- | --- | --- |
| `GET /api/health` | status, coarse memory/DB booleans | **keep public** — it is the probe ([`backend.md`](./backend.md) §2) |
| `GET /api/health/detailed` | rich runtime diagnostics | **restrict at the LB** (or internal only) |
| `GET /api/health/database` | DB diagnostics | **restrict at the LB** |
| `GET /api/auth/debug` | env-var presence, DB connectivity, computed app URL, forwarded headers (verified: public diagnostic route) | **restrict at the LB** |
| `GET /api/metrics` | Prometheus-format operational metrics | **restrict at the LB** (scrape internally, [`monitoring.md`](./monitoring.md) §6) |
| `POST /api/payments/webhook-replay` | admin utility for replaying webhooks | **restrict at the LB** unless the app gates it — verify the route's own auth first |

**LB-path restriction example** (Path B — add a deny-all path matcher entry for these prefixes):

```bash
# With Cloud Armor (OPTIONAL but the clean tool):
gcloud compute security-policies create acquisitionos-policy
gcloud compute security-policies rules create 1000 \
  --security-policy=acquisitionos-policy \
  --expression='request.path.matches("/api/health/detailed") || request.path.matches("/api/auth/debug") || request.path.matches("/api/metrics")' \
  --action=deny-403
# Attach the policy to the backend service (see networking.md §7), keep /api/health (no suffix) untouched.
```

Without an LB (Path A), there is no good edge filter — another reason the LB path is recommended for production ([`networking.md`](./networking.md) §1). Re-verify this table after any framework/auth upgrade: routes gain or lose auth as the app evolves.

## 10. SSRF / outbound-call posture

The server calls external APIs on the user's behalf (AI providers, Google Custom Search/SerpAPI discovery, SMTP, Telegram). That is **outbound-only**; there is no feature that fetches arbitrary user-supplied URLs in the verified feature set — keep it that way. Hardening (`OPTIONAL`): Direct VPC egress + firewall rules control egress ranges ([`networking.md`](./networking.md) §2); proxy egress through a fixed NAT if a partner demands IP allow-listing.

## 11. Backup security

Backups and exports are data too: Cloud SQL backups are encrypted at rest with the instance's keys; the GCS export bucket must be **private** (`uniform-bucket-level-access`, no `allUsers` bindings — verify `gcloud storage buckets describe gs://... --format="value(iamConfiguration)"`) and versioned; IAM on the bucket is least-privilege ([`backups.md`](./backups.md) §4, §7).

## 12. What must NEVER be committed

`.gitignore` already excludes these patterns (`.env*` verified) — keep it that way and never force-add:

```text
.env, .env.*               — every real secret starts here
*key*, *.pem               — private keys, OAuth certs
*token*, *secret*          — ad-hoc credential files
service-account-*.json     — GCP SA keys (should not exist at all: use WIF, cicd.md §2)
db/custom.db, *.sql.gz     — dev database, dumps (real user data lives in production)
```

If a secret ever lands in Git history: rotate the secret first, clean history second ([`../../02-environment-variables-and-secrets.md`](../02-environment-variables-and-secrets.md)). Rotation invalidates the leak; history rewriting does not.

## 13. Incident first steps

When something looks wrong: run the 10-minute triage in [`troubleshooting.md`](./troubleshooting.md) §1, then decide rollback vs fix-forward with [`rollback.md`](./rollback.md). Security-flavored incidents (leaked secret, unexpected IAM change, suspicious traffic): rotate the affected secret, check Cloud Audit Logs ([§8](#8-audit-trails)), tighten the implicated IAM/network setting, and only then optimize the post-mortem.

---

## 14. Official documentation

- IAM least privilege — https://cloud.google.com/iam/docs/using-iam-securely
- Service accounts & keys (and why to avoid keys) — https://cloud.google.com/iam/docs/best-practices-service-accounts
- Secret Manager security model — https://cloud.google.com/secret-manager/docs/access-control
- Cloud Run ingress settings — https://cloud.google.com/run/docs/securing/ingress
- Cloud Armor — https://cloud.google.com/armor/docs
- Artifact Analysis (vulnerability scanning) — https://cloud.google.com/artifact-analysis/docs
- Cloud Audit Logs — https://cloud.google.com/logging/docs/audit
- Private IP Cloud SQL + connectors — https://cloud.google.com/sql/docs/postgres/connect-overview
- Handbook: [`../../02-environment-variables-and-secrets.md`](../02-environment-variables-and-secrets.md) · [`secrets.md`](./secrets.md) · [`networking.md`](./networking.md)
