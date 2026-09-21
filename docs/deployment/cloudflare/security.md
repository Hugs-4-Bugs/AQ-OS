# Security — Tokens, WAF, Access, TLS, Secrets

The security controls for the Cloudflare deployment, in priority order. Everything here builds on the secrets hygiene in [`secrets.md`](./secrets.md) and the WAF/cache behavior in [`networking.md`](./networking.md) §6 — those pages are referenced, not repeated.

**The threat model in one line:** a public HTTPS endpoint (the Worker) holding powerful provider keys as secrets, backed by a database full of customer data — attackers will try credential stuffing on `/api/auth/*`, scraping, injection via webhook endpoints, and finding your leaked tokens. Everything below addresses one of those.

---

## 1. API tokens: CI token vs admin token

**Label:** `REQUIRED` discipline

**What:** one narrowly-scoped API token per consumer. The two roles that matter:

| Token | Consumer | Scopes (at the time of writing — `NEEDS VERIFICATION` in the token UI) | Where it lives |
| --- | --- | --- | --- |
| **CI deploy token** | GitHub Actions | Account: Workers Scripts Edit, Account Settings Read, Hyperdrive Edit (+ DNS Edit only if CI manages DNS) — account/zone-restricted | GitHub Environment secrets ([`cicd.md`](./cicd.md) §1) |
| **Admin/human token** | You, for `wrangler` CLI and one-offs | Broader (Workers Edit, Hyperdrive Edit, R2 Edit if used, DNS Edit, Account Settings Read) — still restricted to the single account/zone | Password manager; used via `wrangler login` OAuth locally where possible |
| Terraform token | Terraform runs | Per [`terraform.md`](./terraform.md) §2 | CI secrets / password manager |

**Rules:** never share tokens between consumers; roll a token immediately if it may have leaked; a token that can delete Workers or edit DNS has no business in CI. Verify any token with:

```bash
curl -s -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" https://api.cloudflare.com/client/v4/user/tokens/verify
```

**Expected output:** `"status": "active"`. **Verify least privilege:** attempt an out-of-scope call (e.g. zone delete) with the CI token and confirm it is denied.

---

## 2. WAF: managed rules + the custom rules this app needs

**Label:** `RECOMMENDED` (strongly)

**What:** zone-level filtering before traffic reaches the Worker. Managed rulesets (Cloudflare's maintained signatures) are on by default per plan; **custom rules** are where AcquisitionOS-specific protection lives. Full syntax and plan matrix: https://developers.cloudflare.com/waf/ (also [`networking.md`](./networking.md) §6 and the IaC form in [`terraform.md`](./terraform.md) §4.5).

**Recommended starting custom rules:**

| # | Purpose | Expression (shape) | Action |
| --- | --- | --- | --- |
| 1 | Rate-limit credential endpoints | `starts_with(http.request.uri.path, "/api/auth/")` | Block (or managed challenge) above N req/min per IP — start generous: login + OTP bursts are normal |
| 2 | Rate-limit cron endpoints | `starts_with(http.request.uri.path, "/api/cron/")` | Block above a low rate — legitimate traffic is the dispatcher only (a few calls/min at most) |
| 3 | Protect diagnostics | `starts_with(http.request.uri.path, "/api/health/detailed") or starts_with(http.request.uri.path, "/api/health/database")` | Block (public) — see §5 for the Access alternative |
| 4 | Protect admin surfaces | `starts_with(http.request.uri.path, "/api/admin/")` | Block from anonymous IPs, or gate via Access (§4) — the code has `/api/admin/**` routes behind app auth; the edge rule shrinks the attack surface further |

**Caution — do not strangle SSE and webhooks** (from [`networking.md`](./networking.md) §6): `/api/events/*` are one long-lived request each (rate limits barely register, but avoid duration/bytes-based rules); `/api/payments/webhook/*` and `/api/gmail/pubsub/webhook` come from provider IP ranges — exempt them from challenges or deliveries bounce.

**Command:** zone → Security → WAF → Custom rules → Create rule (paste expression, choose action). 

**Expected output:** rule saved and deployed in seconds. **Verify:** rapid-fire 100 `POST /api/auth/signin` from a test client → 429/challenge after the threshold, while a normal login still succeeds; `curl -s -o /dev/null -w "%{http_code}\n" https://app.yourdomain.com/api/health/detailed` → 403.

---

## 3. TLS mode: Full (strict)

**What:** zone → SSL/TLS → encryption mode. **Full (strict)** means Cloudflare validates the origin certificate on any origin connection it makes.

**Why it matters here:** with a pure Worker Custom Domain there is *no origin behind the hostname* — TLS terminates at the edge. Full (strict) is still the right setting because the moment you add *any* non-Worker origin (a marketing site on a VM, a future service), "Flexible" would silently allow unencrypted edge→origin hops. Set it once, correctly.

**Verify:** `curl -sI https://app.yourdomain.com/api/health` → HTTP/2 200 over TLS 1.2+; the SSL/TLS settings page shows Full (strict). Minimum TLS version 1.2 is a reasonable hardening — `NEEDS VERIFICATION` for current Universal SSL options ([`dns-ssl.md`](./dns-ssl.md) §5, ACM).

---

## 4. Cloudflare Access (Zero Trust) for admin surfaces — `OPTIONAL`

**What:** identity-aware gate in front of chosen paths — the browser must pass an email-OTP/SSO check (a Cloudflare Zero Trust application) before requests reach the Worker.

**Why (for this app):** belt-and-suspenders for the human-ish surfaces: `/api/health/detailed`, `/api/health/database`, `/api/admin/*`, `/api/payments/webhook-replay` (the admin utility route that exists in the code). The app's own JWT auth still applies underneath — Access just removes anonymous internet access to those paths entirely.

**Command (dashboard):** Zero Trust → Access → Applications → Add → Self-hosted → domain `app.yourdomain.com`, path `/api/admin/*` (repeat per surface) → policy: allow your team's emails via One-time PIN.

**Expected output:** visiting the path from outside prompts an Access login; with a valid identity, the request proceeds to the Worker (with an `CF-Access-Jwt-Assertion` header you may optionally validate in-app — `NEEDS VERIFICATION` for current header guidance).

**Verify:** `curl -s https://app.yourdomain.com/api/admin/billing` from an outside IP → Access interstitial (not the app's JSON). Note: do **not** put Access in front of provider webhooks (Stripe cannot log in) — the signature check is their protection.

---

## 5. Secrets handling recap

**What:** the non-negotiables, all detailed in [`secrets.md`](./secrets.md) — recap for security review:

1. **Secrets via `wrangler secret put`** — encrypted, per-Worker, never retrievable, never in `wrangler.jsonc`.
2. **`.dev.vars` gitignored** — it exists so local values never touch Git; verify `git status --short` does not list it, and it never contains production values.
3. **`AUTH_DEV_MODE` unset in production** — it is hard-gated off under `NODE_ENV=production`, but a deployment that needs the gate to work has a config bug ([`../02-environment-variables-and-secrets.md`](../02-environment-variables-and-secrets.md) §1).
4. **`DIRECT_URL` (DB password) never reaches the Worker** — CI secrets or local shell only.
5. Rotation runbook in [`secrets.md`](./secrets.md) §6 (rotate on suspicion; `JWT_SECRET` rotation logs everyone out).

**Verify:** `npx wrangler secret list` shows names only; `git log --all -- .dev.vars` is empty; no repo file matches `JWT_SECRET=sk` patterns (`gitleaks`/`git secrets` in CI for defense in depth — [`../../05-cicd.md`](../05-cicd.md)).

---

## 6. What MUST NEVER be committed (the list)

| Item | Why |
| --- | --- |
| `.dev.vars` | Local wrangler values — may hold semi-real credentials |
| Any `.env*` file | The classic leak (`.gitignore` already excludes — keep it that way) |
| `CLOUDFLARE_API_TOKEN` values | Full account access within scope; in workflows only as `${{ secrets... }}` |
| Secrets in `wrangler.jsonc` | The file is in Git; secrets belong to `wrangler secret put` |
| Terminal output pasted into issues/docs showing `wrangler secret put` values or `wrangler.jsonc` with secrets | Screenshots leak; paste with values redacted |
| `.open-next/` build output | Can embed build-time env values ([`secrets.md`](./secrets.md) §7) |
| Terraform state/plan files | Plaintext secrets inside |

**Verify:** add `gitleaks` (or `git secrets`) to CI (pattern in [`../../05-cicd.md`](../05-cicd.md) §1's security step); run it once on full history.

---

## 7. Rate limiting: the two layers

**What:** two rate-limiting layers exist, and they do different jobs:

1. **App-level (in-process):** the app's own limiter runs **per isolate** — on Workers each request may hit a different isolate, so the in-process limiter is a per-isolate heuristic, not a global counter. That is the same caveat as multi-instance container deployments, just more pronounced.
2. **Edge-level (global):** WAF rate-limiting rules (§2, rule #1/#2) count per IP across the whole zone — this is your real global gate for anonymous abuse.
3. **Global app-level (if needed):** Upstash Redis via `REDIS_URL` — the same optional integration other clouds use gives every isolate one shared counter (`OPTIONAL`; see [`./scaling.md`](./scaling.md) §2.4).

**Practical default:** WAF rules for anonymous abuse; app limiter for logged-in behavior; Redis only when you observe that per-isolate limits are being gamed.

**Verify:** the §2 test (429s at the edge); app-level limiter behavior per its own configuration.

---

## 8. Bot Fight Mode

**What:** zone → Security → Bots → Bot Fight Mode — Cloudflare's automatic challenge for known-bad bots. Free on all plans (Super Bot Fight Mode with more controls is a paid tier — `NEEDS VERIFICATION` for current entitlements).

**Why:** kills a large share of credential-stuffing and scraping noise before your WAF custom rules even matter.

**Gotcha:** aggressive bot scoring can challenge API clients you actually want (uptime monitors, the cron dispatcher — though the dispatcher is Worker-to-Worker and unaffected). If your uptime provider gets challenged, allow-list its IP ranges or use a WAF skip rule for its signed probes.

**Verify:** enable, then confirm: normal login works, SSE connects, uptime monitor stays green, webhook deliveries stay 200 ([`backend.md`](./backend.md) §10).

---

## 9. Dependency scanning

**What:** CI-level hygiene for the npm tree the app bundles into the Worker.

```bash
npm audit --omit=dev          # prod-tree audit; triage findings, don't blind-fix
npm outdated                  # planned upgrades; check OpenNext adapter compatibility first
npm test && npm run lint      # the existing gates (package.json scripts)
```

**Cloudflare-specific rule:** after any Next.js or `@opennextjs/cloudflare` upgrade, re-run the staging compatibility checks ([`manual-deployment.md`](./manual-deployment.md) §13 — SSE, pdfkit caveat `NEEDS VERIFICATION`, email, Prisma pattern). A dependency bump can change adapter behavior even when tests pass.

**Verify:** CI runs the audit as a non-blocking (or blocking for CRITICAL) step; the upgrade checklist lives in your PR template.

---

## 10. Backup security

**What:** backups are copies of your most sensitive data — apply the same paranoia:

- Provider backups live in the provider's tenancy: enable their encryption + access-control options, restrict dashboard access (least-privilege provider users).
- Self-managed `pg_dump` files (§[`backups.md`](./backups.md) §2) go to storage you control, encrypted at rest, never in Git, never on a laptop without encryption.
- Terraform state and Workers Logs exports can contain sensitive fields — store them like secrets ([`backups.md`](./backups.md) §6, [`monitoring.md`](./monitoring.md) §7).

**Verify:** list everywhere a copy of production data can exist (provider, dump storage, state bucket, log exports) and confirm each has access control you can name.

---

## 11. Cloudflare Audit Logs

**What:** the account-level "who changed what" trail — deploys, secret creation events (names, not values), Hyperdrive/DNS/WAF/token changes ([`monitoring.md`](./monitoring.md) §9).

**Security use:** after any suspected incident, diff the audit log against expected changes; rotate anything whose creation event you cannot explain.

**Verify:** you can produce a 30-day audit trail for a review; members have least-privilege account roles (no full-admin for read-only colleagues).

---

## 12. Protecting admin-ish endpoints (summary table)

| Surface | Protection |
| --- | --- |
| `/api/health` | Public by design (uptime probe) — asserts nothing sensitive |
| `/api/health/detailed`, `/api/health/database` | WAF block (§2 #3) or Access (§4) |
| `/api/admin/**` | App JWT auth + WAF rule (§2 #4) + Access for browser use (OPTIONAL) |
| `/api/payments/webhook-replay` | App auth (admin utility) — consider the §2 #4 rule's path set |
| `/api/cron/**`, `/api/gmail/jobs/process` | Bearer `CRON_SECRET` / `GMAIL_CRON_API_KEY` + WAF rate rule (§2 #2) |
| Webhook routes | Signature verification in-handler; WAF challenge exemption (§2 caution) |
| Everything else `/api/**` | App JWT auth as coded |

**Verify:** hit each row's URL unauthenticated from an outside network and record the expected status (401/403) — this doubles as the security section of your go-live checklist.

---

## 13. SSRF note

**What:** the app fetches URLs by design (lead website analysis, enrichment, webhooks out). Server-Side Request Forgery risk is an *application* property, unchanged by Cloudflare — but Workers has one relevant edge: with `global_fetch_strictly_public` enabled ([`manual-deployment.md`](./manual-deployment.md) §5), the Worker's `fetch` cannot target private/internal addresses through Cloudflare's network — a cheap, platform-level mitigation worth keeping enabled.

**Why still care:** defense in depth — validate and normalize user-supplied URLs in app code (scheme allow-list, no redirects to internal hosts, timeouts) per the app's own enrichment logic. `NEEDS VERIFICATION` for the current scope/behavior of `global_fetch_strictly_public` (https://developers.cloudflare.com/workers/configuration/compatibility-dates/).

**Verify:** a test enrichment request pointing at `http://localhost:...`/private IP fails closed.

---

## 14. Incident first steps (pointer)

When something is wrong: `wrangler tail` first, then the decision tree — the full runbook lives at the top of [`./troubleshooting.md`](./troubleshooting.md) ("first 10 minutes"), with rollback actions in [`./rollback.md`](./rollback.md) §5. Security-flavored incidents (leaked key, weird admin activity) additionally follow [`secrets.md`](./secrets.md) §6 rotation and §11 audit review.

---

## 15. Official Documentation

- API tokens & scoping — https://developers.cloudflare.com/fundamentals/api/get-started/create-token/
- WAF — https://developers.cloudflare.com/waf/ (custom rules: https://developers.cloudflare.com/waf/custom-rules/, rate limiting: https://developers.cloudflare.com/waf/rate-limiting-rules/)
- SSL/TLS modes — https://developers.cloudflare.com/ssl/origin-configuration/ssl-modes/
- Bot Fight Mode — https://developers.cloudflare.com/bots/get-started/bot-fight-mode/
- Cloudflare Access — https://developers.cloudflare.com/cloudflare-one/policies/access/
- Workers secrets — https://developers.cloudflare.com/workers/configuration/secrets/
- Audit Logs — https://developers.cloudflare.com/fundamentals/account/account-audit-logs/
- `global_fetch_strictly_public` — https://developers.cloudflare.com/workers/configuration/compatibility-dates/
- Shared secrets inventory — [`../02-environment-variables-and-secrets.md`](../02-environment-variables-and-secrets.md)
