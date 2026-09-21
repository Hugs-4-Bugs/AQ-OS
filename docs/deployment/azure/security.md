# Security on Azure — RBAC, Secrets, Network, WAF, and What Never Gets Committed

AcquisitionOS's security posture on Azure rests on a few strong, boring mechanisms: **Managed Identity instead of credentials**, **least-privilege RBAC**, **TLS everywhere**, and **Key Vault with purge protection**. Nothing here requires exotic tooling. Cross-cloud secret-handling rules are in [`../02-environment-variables-and-secrets.md`](../02-environment-variables-and-secrets.md) §11 — non-negotiable — and this page maps each onto Azure services. Incident response lives at the end and points at [`rollback.md`](./rollback.md) + [`troubleshooting.md`](./troubleshooting.md).

---

## 1. RBAC least privilege (who can do what)

**What:** every identity in the stack gets the smallest role that works, scoped to the resource group.

| Identity | Role | Scope | Never |
| --- | --- | --- | --- |
| Container App **system-assigned Managed Identity** (the app at runtime) | `Key Vault Secrets User` + `AcrPull` | The vault / the registry | Contributor on the RG; Owner anywhere |
| **Deploy service principal** (GitHub Actions OIDC, [`cicd.md`](./cicd.md) §1.1) | `Contributor` | `rg-acquisitionos` only | Owner, subscription-wide rights |
| Same SP (migration step) | `Key Vault Secrets User` | The vault | `Key Vault Administrator` |
| **You**, day to day | `Contributor` on the RG (+ `Key Vault Administrator` on the vault for setup) | RG/vault | **Owner for daily work** — Owner can manage access, which you almost never need |

**Why the app identity matters most:** `Key Vault Secrets User` (a *data-plane* role) lets the app read secrets but not create/delete them or read the vault's management plane. The full role-assignment walkthrough is in [`secrets.md`](./secrets.md) §4 and [`manual-deployment.md`](./manual-deployment.md) §6.

**Verify:**

```bash
az role assignment list --resource-group "$RG" -o table
# every row must be explainable in one sentence; investigate any that is not
```

---

## 2. Secret handling recap

**What/Why:** the golden rule — secrets live in Key Vault, reach the app via `secretref`, and exist nowhere else:

- Vault created with `--enable-rbac-authorization true --enable-purge-protection true` (soft delete + purge protection: deleted secrets/vaults are recoverable, and nobody can hard-delete around RBAC) — [`secrets.md`](./secrets.md) §7.
- Rotation = **new secret version** + revision restart; rotating `JWT_SECRET` invalidates sessions (know that before you do it) — [`secrets.md`](./secrets.md) §6.
- No secret in the image, Git, CI logs, or shell history ([`cicd.md`](./cicd.md) §3 masks `DIRECT_URL` in runners).
- `AUTH_DEV_MODE` **unset/false** in production — it is hard-gated off when `NODE_ENV=production`, but never rely on a gate you can avoid testing ([`../02-environment-variables-and-secrets.md`](../02-environment-variables-and-secrets.md) §1).

**Verify:** `git ls-files | grep -i env` shows no `.env*`; `az keyvault show -n "$KV" --query properties` shows both protections enabled.

---

## 3. Network posture: firewall rules vs private endpoints

**What:** two documented shapes ([`networking.md`](./networking.md) §2–§4 — this is a recap, not a replacement):

1. **Handbook default — public access + firewall rules:** PostgreSQL reachable from your IP + `0.0.0.0` (Azure services). TLS (`sslmode=require`) + least-privilege `app_user` + strong passwords carry the load. Honest note from part A: the `0.0.0.0` rule admits *any Azure-origin* traffic.
2. **OPTIONAL hardening — VNet-integrated Container Apps + private endpoint for PostgreSQL:** `public_network_access_enabled = false`, private DNS zone `privatelink.postgres.database.azure.com`. Choose this *before* first deploy (environments cannot be moved between modes afterwards) — [`networking.md`](./networking.md) §2.

**NSG basics:** with the default managed networking you rarely touch NSGs; on the VNet path, deny internet to the DB subnet and allow 5432 intra-VNet only — and do not improvise NSG rules on the Container Apps infrastructure subnet (platform traffic can break; NEEDS VERIFICATION for required rules per region — [`networking.md`](./networking.md) §4).

**TLS everywhere:** ingress terminates TLS (managed certificate, [`dns-ssl.md`](./dns-ssl.md) §4); Front Door path stays HTTPS end-to-end (`--forwarding-protocol HttpsOnly`); production cookies are `secure`; DB strings keep `sslmode=require`. A plaintext hop anywhere undermines the rest.

**Verify:** `psql "$DIRECT_URL" -c "select 1"` fails without `sslmode=require`; browser shows no mixed-content warnings.

---

## 4. Front Door WAF (OPTIONAL)

**What:** Azure Front Door bundles a **Web Application Firewall** (managed rule sets + custom rules) that filters requests at the edge before they reach the Container App.

**Why (for AcquisitionOS):** if you already run the OPTIONAL Front Door edge ([`manual-deployment.md`](./manual-deployment.md) §8.3), enabling WAF is the cheapest broad defense: SQLi/XSS managed rulesets, plus two custom rules worth writing:

- **Rate-limit `/api/*`** — e.g. block or throttle >100 requests/10 s per client IP. Reason: the app's own limiter is in-process (§5); the edge can enforce a *global* ceiling before traffic multiplies.
- **Block admin-ish endpoints** — deny external access to `/api/health/detailed`, `/api/health/database`, `/api/auth/debug`, `/api/metrics`, and the admin utility `/api/payments/webhook-replay` (§9).

WAF configuration lives in the portal's Front Door **Security** pane (Front Door *Premium* SKU for managed rules; WAF policy attach + managed ruleset names/flags vary by SKU and API version — NEEDS VERIFICATION; portal-first). Configure in **Detection** mode first, watch the logs for false positives (the app's webhooks and SSE must never be blocked), then switch to **Prevention**.

**Verify:** a curl loop against `/api/health` from one IP gets 429/blocked once the rate rule is in Prevention; Stripe test webhooks still arrive.

---

## 5. Rate limiting (app-level reality)

**What:** the application ships an **in-process** rate limiter. In-process means per-replica: with 3 replicas, a client gets 3× the documented limit from the platform's point of view.

**For current AcquisitionOS:** fine — [`scaling.md`](./scaling.md) keeps you at 1–2 replicas until traffic demands more. If you scale beyond one replica AND care about exact global limits, two mitigations:

- Edge-level rate rule on Front Door WAF (§4) — global, coarse;
- Redis-backed limiter via `REDIS_URL` (the same Redis used for SSE fan-out) — an app change, FUTURE/ALTERNATIVE.

Do not buy a dedicated rate-limiting service for this; the app's limiter plus (optional) WAF covers the realistic threat at this scale.

---

## 6. Container and image scanning

**What/Why:** the image is the attack surface you ship; scan it twice — in CI and in the registry.

- **CI gate (REQUIRED by the pipeline shape):** `trivy image --exit-code 1 --severity CRITICAL` fails the build ([`cicd.md`](./cicd.md) §2, pattern from [`../05-cicd.md`](../05-cicd.md) §1).
- **Defender for Cloud (OPTIONAL):** the Defender Cloud Native Protection plan performs continuous **ACR image vulnerability scanning** and surfaces findings per registry/image. It costs per-registry — enable when the team is big enough to act on findings; a scanner nobody reads is theater.
- Also useful: pull the app image as the least-privileged runtime (the Dockerfile's non-root `nextjs` user — [`../03-docker.md`](../03-docker.md)).

**Verify:** trivy step is green on the current image; if Defender is on, its recommendation list shows no CRITICALs on `acquisitionos:*`.

---

## 7. Dependency scanning

**What/Why:** most real-world compromises arrive as a vulnerable npm dependency, not a zero-day in your code.

- `npm audit` in CI (fail or at least report on high/critical — pick a policy and enforce it).
- GitHub Dependabot on the repo: automated PRs for dependency bumps.
- `npm ci` with `package-lock.json` in Docker builds means reproducible dependencies — never `npm install` into an image.

**Verify:** a scheduled CI job (weekly) runs `npm audit --omit=dev` and reports; Dependabot tab shows active PRs.

---

## 8. Audit trails

**What:** two Azure surfaces, both flowing to Log Analytics when configured ([`monitoring.md`](./monitoring.md) §9):

- **Activity Log** — control plane: role assignments, firewall changes, revisions, vault settings changes. 90-day portal retention; export to the workspace to keep longer.
- **Key Vault diagnostics (`AuditEvent`)** — data plane: *who read which secret, when*. This is your "did credentials leak?" first responder (category names vary by API version — NEEDS VERIFICATION, [`monitoring.md`](./monitoring.md) §9).

**Verify:** read one secret manually, see the audit event in the workspace within minutes.

---

## 9. Protect admin-ish endpoints

**What:** the app exposes diagnostic/utility routes that must never be openly reachable:

| Endpoint | Risk | Protection |
| --- | --- | --- |
| `GET /api/health/detailed` | Leaks heap/env internals | Keep internal — do not probe it, do not expose it; block at WAF (§4) or add app-side auth |
| `GET /api/health/database` | Leaks DB health/shape details | Same |
| `/api/auth/debug` (if present in your checkout) | Debug auth bypass/leak risk | Block at the edge (WAF rule) or harden in app code — verify the route exists before relying on the block |
| `/api/metrics` | Internal metrics exposure | Protect like the above |
| `/api/payments/webhook-replay` | Admin billing utility | Same |

**Baseline if you run no WAF:** ensure these paths are not referenced by any probe, uptime test, or scheduler config, and treat "reached from the internet" as a finding ([`backend.md`](./backend.md) §2). `GET /api/health` alone is public by design.

**Verify:** `curl -s -o /dev/null -w "%{http_code}\n" https://app.yourdomain.com/api/health/detailed` → 4xx (blocked/authorized), while `/api/health` stays 200.

---

## 10. SSRF awareness

**What:** Server-Side Request Forgery — a user-supplied URL gets fetched by *your server*, reaching internal addresses (metadata endpoints, the DB, other private services).

**For AcquisitionOS today:** the app's outbound calls go to known providers (SMTP/Resend, Stripe/Razorpay, Google, AI providers) — the classic SSRF surface (user-configured callback/webhook URLs fetched by the server) is not a documented feature of the current code. The standing rules:

- Never relax that by fetching arbitrary user-provided URLs without validating scheme (https only) and resolving against private ranges (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `169.254.169.254`, link-local).
- On the VNet/private-endpoint path, SSRF matters *more*: the app's network position can reach the DB. Public-endpoint deployments have less to lose here.
- Treat "the server fetches a URL the user typed" as a security review trigger, not a routine PR.

(NEEDS VERIFICATION if you extend integrations — re-check this section whenever a feature adds server-side fetching of user input.)

---

## 11. What MUST NEVER be committed

The `.gitignore` already excludes `.env*`, `node_modules`, and `.next/` (verified repo state) — the discipline is yours:

```text
.env, .env.*, any dotenv variant
JWT_SECRET, CRON_SECRET, ENCRYPTION_KEY, DB passwords (any generated value)
STRIPE_* / RAZORPAY_* keys and webhook secrets
GOOGLE_CLIENT_SECRET, RESEND_API_KEY, SMTP passwords, app passwords
Service-principal client secrets (should not exist at all — OIDC, cicd.md §1.1)
pg_dump outputs, Key Vault exports, terraform.tfvars with real values, state files
```

If a secret *does* land in Git history: rotate it immediately (new version + restart) — history rewriting is secondary to rotation ([`secrets.md`](./secrets.md) §6). Secret scanning (GitHub push protection / `gitleaks` in CI) is the cheap net under this list.

**Verify:** `git log --all --diff-filter=A -- '*.env*'` is empty; push protection enabled in repo settings.

---

## 12. Incident first steps (pointer)

1. **Freeze:** stop deploys; note the time (it is your PITR bookmark — [`backups.md`](./backups.md) §3).
2. **Identify:** health check → app logs → Activity Log → Key Vault audit ([`troubleshooting.md`](./troubleshooting.md) §First 10 minutes; [`monitoring.md`](./monitoring.md) §9).
3. **Contain:** app-level → previous revision ([`rollback.md`](./rollback.md) §2); data-level → restore decision tree ([`rollback.md`](./rollback.md) §3–4).
4. **Rotate on suspicion of secret exposure:** JWT_SECRET, DB_APP_PASSWORD, provider keys (§2), then verify logins/webhooks still work.
5. **Post-mortem:** what signal was missing? Add the alert ([`monitoring.md`](./monitoring.md) §4).

## 13. Security checklist

```text
[ ] App MI: Key Vault Secrets User + AcrPull ONLY; no RG-level rights
[ ] Deploy SP: Contributor on rg-acquisitionos only; OIDC, no client secret anywhere
[ ] No Owner used for daily work
[ ] Vault: RBAC model + soft delete + purge protection; audit events flowing
[ ] Network: firewall-minimal today; private-endpoint path chosen before first deploy if wanted
[ ] TLS: valid cert on app.yourdomain.com; HttpsOnly origin; sslmode=require; secure cookies
[ ] WAF (if Front Door): managed ruleset + /api/* rate rule + admin-endpoint block, Detection -> Prevention
[ ] In-process limiter understood (per-replica); edge rule if multi-replica
[ ] trivy in CI; Defender for Cloud consciously on/off; npm audit + Dependabot running
[ ] Admin-ish endpoints not publicly reachable
[ ] Never-commit list enforced by .gitignore + secret scanning; rotation runbook exists
```

## 14. Official Documentation

- RBAC roles & assignment — https://learn.microsoft.com/azure/role-based-access-control/
- Managed identities for Azure resources — https://learn.microsoft.com/entra/identity/managed-identities-azure-resources/
- Key Vault security baseline (soft delete, purge, RBAC) — https://learn.microsoft.com/azure/key-vault/general/security-features
- Front Door WAF — https://learn.microsoft.com/azure/web-application-firewall/afds/afds-overview
- Defender for Cloud / ACR image scanning — https://learn.microsoft.com/azure/defender-for-cloud/defender-for-containers-introduction
- Private networking for PostgreSQL Flexible Server — https://learn.microsoft.com/azure/postgresql/flexible-server/concepts-networking
- Secret handling rules — [`../02-environment-variables-and-secrets.md`](../02-environment-variables-and-secrets.md) §11
