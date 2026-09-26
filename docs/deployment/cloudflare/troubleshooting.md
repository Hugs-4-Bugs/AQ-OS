# Troubleshooting — AcquisitionOS on Cloudflare Workers

The page you open when something is broken. Start with the **first 10 minutes runbook** (§1), then find your symptom in §3–§17. Every entry follows **Symptom → Cause → Diagnosis → Fix → Prevention**.

**Cross-references:** limits table ([`./architecture.md`](./architecture.md) §2), env-var inventory ([`../02-environment-variables-and-secrets.md`](../02-environment-variables-and-secrets.md)), rollback runbook ([`./rollback.md`](./rollback.md)), OpenNext adapter troubleshooting (https://opennext.js.org/cloudflare/troubleshooting).

---

## 1. The first 10 minutes — triage runbook

**Run these in order. Do not skip step 0.**

```bash
# 0. WATCH THE LOGS FIRST — every diagnosis below starts here
npx wrangler tail --format pretty
#   (second terminal, or ask a colleague to keep it open)

# 1. Is the app up from the outside?
curl -s -o /dev/null -w "%{http_code}\n" https://app.yourdomain.com/api/health
#   200 → app is alive; the problem is feature-specific (search §3–§17)
#   5xx/timeout → read the matching tail lines, then §8/§9

# 2. Did anything change in the last hour? (the 4 kinds of change)
npx wrangler versions list            # deploys — a bad version is the #1 suspect
#   schema push? terraform apply? secret rotation? (ask the team / check audit logs:
#   dash → Manage Account → Audit Logs)

# 3. If a deploy caused it: roll back NOW, diagnose after (rollback.md §2)
npx wrangler rollback

# 4. If it is the database: is the DB itself healthy?
psql "$DIRECT_URL" -c "select 1;"     # direct connection — bypasses Hyperdrive and the Worker
#   fails → provider problem (§7). succeeds → path problem (Hyperdrive/binding) (§7)

# 5. Check the platform: status pages
#   https://www.cloudflarestatus.com/   and your Postgres provider's status page

# 6. Write down: timestamp, symptom, tail excerpt, version IDs, what you changed.
```

**Decision shortcut:** deploy-caused → version rollback; DB-caused → provider/path split (§7); config-caused → §10–§11; no change → status pages then §8/§15.

---

## 2. How to read this catalog

Each entry: **Symptom** (what you observe) → **Cause** (usual suspects, most likely first) → **Diagnosis** (commands that prove which) → **Fix** → **Prevention**. Error codes you will see in `wrangler tail`:

| Code | Meaning | Entry |
| --- | --- | --- |
| `1101` | Uncaught exception in the Worker | §8 |
| `1102` | Worker exceeded memory | §9 |
| `1103` | Worker exceeded CPU | §8 |
| `429` | Rate-limited (WAF rule) | §5 / [`security.md`](./security.md) §2 |
| `526` | Invalid certificate on edge→origin (rare here) | §4 |
| `401` on cron/webhook | Auth header/secret problem | §15–§16 |

---

## 3. DNS not resolving

**Symptom:** `dig app.yourdomain.com` returns nothing/NXDOMAIN, or returns your registrar's parking page; browsers say "site can't be reached" with a DNS error.

**Cause:** the zone is not Active on Cloudflare (registrar nameservers not yet delegated), or the domain was added to Cloudflare but the nameserver change at the registrar was never made.

**Diagnosis:**

```bash
dig NS yourdomain.com +short          # expect *.ns.cloudflare.com; registrar NS = not delegated yet
```

and dashboard → zone status: **Pending** vs **Active**.

**Fix:** set the two `*.ns.cloudflare.com` nameservers at your registrar ([`prerequisites.md`](./prerequisites.md) §2), then wait — minutes to 24–48 h. Everything Cloudflare-side is already correct; this is registrar-side propagation.

**Prevention:** verify zone status **Active** before the first deploy; do not attach Custom Domains to a Pending zone and expect them to work.

---

## 4. SSL not working (certificate errors)

**Symptom:** browser shows certificate warnings; `curl` fails TLS handshake; sometimes Cloudflare error 526.

**Cause:** Universal SSL still issuing (zone recently activated), or the Custom Domain was never actually attached to the Worker (a hand-made DNS record without a certificate), or the hostname is a deeper subdomain than Universal SSL covers (e.g. `api.staging.yourdomain.com`).

**Diagnosis:** dashboard → SSL/TLS → Edge Certificates (is a Universal cert active?); Workers & Pages → `acquisitionos` → Domains & Routes (is `app.yourdomain.com` listed **Active**?). `openssl s_client -connect app.yourdomain.com:443 -servername app.yourdomain.com | head` shows the served cert.

**Fix:** attach the Custom Domain to the Worker and let Cloudflare create the record + certificate ([`dns-ssl.md`](./dns-ssl.md) §3) — do not hand-create the record. For deeper subdomains, use ACM ([`dns-ssl.md`](./dns-ssl.md) §5). If the zone is days-old, wait — issuance is automatic.

**Prevention:** single-host pattern (`app.` + `staging.`) keeps you inside Universal SSL's coverage; check the padlock right after attaching.

---

## 5. CORS failure (and why it is almost always self-inflicted)

**Symptom:** browser console: `blocked by CORS policy` on API calls; the same request works via `curl`.

**Cause:** the browser client and `/api/**` are on **different origins** — which the default architecture never produces (one Worker, one origin). It happens when someone split an `api.` host, pointed a test at the `*.workers.dev` URL while the page is on the custom domain, or added an edge rule that rewrites the host.

**Diagnosis:** compare `window.location.origin` (page) with the failing request's URL. Same origin? Then it is not CORS — it is a 4xx/5xx surfacing as a console error. Different origins? Fix the origin mismatch, not the headers.

**Fix:** serve UI and API from the one Custom Domain; revert any `api.` split; test against the same domain the page is served from. Do **not** "fix" it with permissive `Access-Control-Allow-Origin` rules — cookie-based JWT auth makes that pure attack surface ([`backend.md`](./backend.md) §4).

**Prevention:** never split hosts for this app ([`scaling.md`](./scaling.md) §3); keep one environment per hostname ([`frontend.md`](./frontend.md) §7).

---

## 6. Deploy succeeds but the app fails

**Symptom:** `opennextjs-cloudflare deploy` prints success; pages 404 on assets, render stale content, or the browser calls the wrong origin; CSS/JS chunks 404.

**Cause:** (a) **stale build** — an artifact built before the latest code/config was deployed (CI artifact reuse, or running `wrangler deploy` without rebuilding); (b) **build-time `NEXT_PUBLIC_APP_URL` wrong** — inlined origin points elsewhere ([`secrets.md`](./secrets.md) §5); (c) **assets binding wrong** — `assets.directory` does not match `.open-next/assets` ([`manual-deployment.md`](./manual-deployment.md) §5).

**Diagnosis:** `npx wrangler versions list` — is the newest version active? View-source a page: does the inlined origin match `https://app.yourdomain.com`? Do the chunk URLs 404 (assets) or return HTML (routing)? Rebuild locally and diff behavior.

**Fix:** always `npx opennextjs-cloudflare build && npx opennextjs-cloudflare deploy` as one step (or promote the same CI artifact — [`cicd.md`](./cicd.md) §2); fix `NEXT_PUBLIC_APP_URL` and **rebuild** (it cannot be changed at runtime); restore `"assets": { "directory": ".open-next/assets", "binding": "ASSETS" }`.

**Prevention:** CI builds once and deploys that artifact; smoke test (`curl /api/health` + one page load) in every deploy job ([`../../05-cicd.md`](../05-cicd.md) §7).

---

## 7. Database connection failure

**Symptom:** `/api/health` reports the DB check failing; `wrangler tail` shows connection errors (`ECONNREFUSED`, `too many connections`, `password authentication failed`, `SSL required`, `prepared statement "..." does not exist`).

**Cause:** Hyperdrive config wrong (bad origin host/password/`sslmode`); provider firewall/networking not reachable from Cloudflare's egress (`NEEDS VERIFICATION` — Cloudflare publishes egress ranges for Hyperdrive at https://developers.cloudflare.com/hyperdrive/; the list is volatile, check it before allow-listing); wrong DB user; or the Prisma **prepared-statements/adapter mismatch** (global client reused across requests on Workers).

**Diagnosis (splits the problem in half):**

```bash
psql "$DIRECT_URL" -c "select 1;"     # direct: provider reachable at all? credentials good?
```

- **Direct fails** → provider-side: instance paused/stopped (Neon autosuspend!), firewall, wrong user/password, `sslmode`.
- **Direct works, Worker fails** → Hyperdrive path: `npx wrangler hyperdrive list` (config exists? binding `id` matches `wrangler.jsonc`?), then `npx wrangler tail` for the exact driver error.
- **`prepared statement ... does not exist` / connection reuse errors** → the global Prisma client is still in use; the per-request `@prisma/adapter-pg` pattern was never applied ([`database.md`](./database.md) §4).

**Fix:** re-create the Hyperdrive config with the correct origin string (`sslmode=require` — never downgrade to `disable`, [`database.md`](./database.md) §6); align the binding `id`; apply the per-request client; allow-list Cloudflare's egress IPs at the provider if it is not publicly reachable (ranges `NEEDS VERIFICATION`).

**Prevention:** keep `DIRECT_URL` (migrations/CI) and the Hyperdrive binding (runtime) strictly separated ([`database.md`](./database.md) §5); verify `/api/health` after any DB or Hyperdrive change.

---

## 8. Worker crash — CPU limit exceeded / unsupported Node API

**Symptom:** intermittent `1101` (exception) or `1103`/`Exceeded CPU` in `wrangler tail`; specific routes always fail (login = bcrypt CPU; PDF export = native code).

**Cause:** CPU budget exhausted on your plan (Free's 10 ms is routinely exceeded by this app — [`prerequisites.md`](./prerequisites.md) §1), or a Node API that `nodejs_compat` does not cover (missing flag, or a native module like `pdfkit`'s stream pipeline behaving differently).

**Diagnosis:** `wrangler tail` shows the stack/exception per request — which route, which code path? Re-run locally under `npx wrangler dev` (real `workerd` runtime, not Node). Check `wrangler.jsonc` has `"compatibility_flags": ["nodejs_compat"]` and a current `compatibility_date`. For PDF generation specifically: part A flags `pdfkit` + Node streams as **`NEEDS VERIFICATION`** on Workers ([`manual-deployment.md`](./manual-deployment.md) §13.2) — generate one invoice in staging and observe.

**Fix:** confirm the **Workers Paid plan** (CPU default 30 s, max 5 min — `NEEDS VERIFICATION` current figures); trim hot paths (the app's AI/cache knobs); for unsupported Node internals, use the adapter's guidance or move that one feature off the interactive path (cron job, R2 pre-render, or a container elsewhere — `FUTURE/ALTERNATIVE` Cloudflare Containers, `NEEDS VERIFICATION`). If `nodejs_compat` was missing, add it and redeploy.

**Prevention:** staging must run the real runtime (`wrangler dev` / staging Worker) before every feature ships; keep the §13 caveat list of [`manual-deployment.md`](./manual-deployment.md) as your regression checklist after each adapter/Next.js upgrade.

---

## 9. Memory exhaustion

**Symptom:** `1102` errors ("Worker exceeded memory") on specific heavy routes; failures correlate with large payloads or big result sets.

**Cause:** the 128 MB per-isolate limit hit by one request's working set — e.g. an export endpoint materializing a huge dataset, or an AI response assembled fully in memory.

**Diagnosis:** `wrangler tail` → which route produced 1102? Reproduce with the same input size in staging.

**Fix:** paginate/stream the offending route (do not `prisma.$queryRaw` an entire table into one object); cap payload sizes; move bulk exports to the cron path writing to R2 (OPTIONAL) instead of one HTTP response.

**Prevention:** load-test the heaviest route (export, discovery) once with realistic data sizes; alert on 1102 recurrence via Workers Logs ([`monitoring.md`](./monitoring.md) §1).

---

## 10. Env var missing (symptom map)

**Symptom:** varied — auth errors, unhealthy status, emails never send, links point at the wrong host.

**Cause + symptom map** (full inventory: [`../02-environment-variables-and-secrets.md`](../02-environment-variables-and-secrets.md)):

| Missing/wrong var | Symptom |
| --- | --- |
| `JWT_SECRET` | auth routes 500 / tokens invalid; app's env validation complains |
| `DATABASE_URL` (env-var pattern) or Hyperdrive binding | `/api/health` unhealthy — DB leg fails (§7) |
| `SMTP_*` missing **or** no `RESEND_API_KEY` | "Email delivery is not configured" on OTP/magic-link flows |
| `APP_PUBLIC_URL` wrong/stale | magic links, OAuth redirects point at the wrong host ([`../01-architecture.md`](../01-architecture.md) §2.2) |
| `NEXT_PUBLIC_APP_URL` (build-time) wrong | browser code calls wrong origin — OAuth/cookies break while server config looks right ([`secrets.md`](./secrets.md) §5) |
| `STRIPE_WEBHOOK_SECRET` mismatch | webhook deliveries 400 (§16) |
| AI keys absent | AI actions fail in production (primary is sandbox-wired) |
| `AUTH_DEV_MODE` set | must be **unset** in production (§1 hard-gate) — treat as a config bug |

**Diagnosis:** `npx wrangler secret list` (secrets exist?) vs `wrangler.jsonc` `vars` (plain vars present?); exercise the failing flow with `wrangler tail` open; the app's env validation surfaces missing criticals loudly.

**Fix:** `printf "%s" "VALUE" | npx wrangler secret put NAME` (secrets) or fix `vars` + redeploy; for build-time vars — rebuild + redeploy. Then re-run the flow.

**Prevention:** the §4 checklist in [`manual-deployment.md`](./manual-deployment.md) and the secrets inventory ([`secrets.md`](./secrets.md) §3) run at every bootstrap; staging shares the same var names so gaps surface before production.

---

## 11. Secret unavailable (set somewhere else)

**Symptom:** a route says the config is missing even though "I set that" — usually on staging, or after renaming.

**Cause:** secrets are **per Worker** (`acquisitionos` vs `acquisitionos-staging` are separate stores), and the value may have been set on a different Worker than the one serving, or typed with a different NAME (case-sensitive).

**Diagnosis:** `npx wrangler secret list` **against the exact Worker name** (`npx wrangler secret list --name acquisitionos-staging`). Compare names character-by-character with the code's `env.NAME` usage ([`secrets.md`](./secrets.md) §3).

**Fix:** `wrangler secret put` on the right Worker; redeploy not required (new isolates pick it up), but verify via the affected flow + tail.

**Prevention:** bootstrap secrets per environment from one checklist; never "copy from prod Worker" mentally — staging gets staging values on staging Workers.

---

## 12. Health check failing

**Symptom:** uptime monitor alerts; `GET /api/health` returns non-200 or times out; the detailed variant (if you reach it internally) names the failing component.

**Cause:** DB unreachable (§7) — the most common; the app returning errors broadly (§8); the Worker disabled by accident.

**Cause — explicitly NOT: cold start.** Workers has no scale-to-zero cold start to wait out; if `/api/health` fails, something is actually broken. (That is a difference from the container clouds' health checks — [`backend.md`](./backend.md) §1.)

**Diagnosis:** §1 runbook steps 0–2; `psql "$DIRECT_URL" -c "select 1"`; check Worker not disabled in the dashboard; check the WAF rule isn't blocking your monitor's IP (a Block rule on `/api/health/detailed` must not catch plain `/api/health` — expression check, [`security.md`](./security.md) §2).

**Fix:** per the split — provider-side (§7), app-side (§8), or un-disable/un-block.

**Prevention:** monitor asserts 200 **and** sane JSON body; exempt the monitor from WAF/bot challenges.

---

## 13. Timeout / SSE duration issues

**Symptom:** SSE streams drop after a fixed wall-time (per plan — `NEEDS VERIFICATION`, documented behavior at the time of writing is unlimited-while-connected); long AI calls cut off; the cron dispatcher logs non-2xx from slow endpoints.

**Cause:** genuinely reaching a duration limit (plan-dependent — re-check https://developers.cloudflare.com/workers/platform/limits/), an intermediary killing idle streams (rare on this platform — no LB idle timeout exists; check corporate proxies client-side), or the endpoint being slow for *query* reasons and the client giving up.

**Diagnosis:** `wrangler tail` during the failure — did the Worker log anything (exception = §8) or did the connection just end? How long did it live? Compare against the app's 15–30 s heartbeats ([`../01-architecture.md`](../01-architecture.md) §2.3): if drops happen at a fixed multiple of idle time rather than heartbeats' cadence, look platform-side; if endpoints are slow-but-completing, it is a database problem (§7).

**Fix:** rely on heartbeats (they exist precisely for this); add `REDIS_URL` for cross-isolate fan-out if reconnect churn is high ([`scaling.md`](./scaling.md) §2.4); fix slow queries; re-verify duration limits for your plan before blaming the runtime.

**Prevention:** the SSE go-live test ([`manual-deployment.md`](./manual-deployment.md) §13.1) — one stream > 5 minutes across many heartbeats, plus a reconnect-replay via `/api/realtime/recover`.

---

## 14. Migrations fail

**Symptom:** `prisma db push --schema=prisma/schema.production.prisma` errors: auth failure, connection refused, "prepared statements" errors, or it "succeeds" against the *wrong* database.

**Cause:** the classic **`DIRECT_URL` mix-up** — pointing migrations at a Hyperdrive/pooled string instead of the direct provider hostname (pooled paths are not built for migration sessions), wrong credentials in the CI secret, or the schema file's `directUrl` not resolving.

**Diagnosis:** print (masked) which host `DIRECT_URL` targets: `echo "$DIRECT_URL" | sed 's/:[^@]*@/:***@/'` — it must be the **provider's direct host**, not anything Hyperdrive-related; then `psql "$DIRECT_URL" -c "select 1;"`.

**Fix:** set `DIRECT_URL` (and `DATABASE_URL` for the push command itself) to the direct string ([`database.md`](./database.md) §5, [`cicd.md`](./cicd.md) §5); fix the GitHub secret; re-run.

**Prevention:** two clearly-named secrets (`DIRECT_URL` = migrations; Hyperdrive binding = runtime) documented in [`database.md`](./database.md) §5's table; CI runs `prisma db push` only in the deploy job, never in parallel jobs.

---

## 15. Background job not running (cron)

**Symptom:** scheduled work silently doesn't happen (sequences stall, credits don't renew, no reminders).

**Cause:** (a) **crons not deployed** — `triggers.crons` only take effect when the dispatcher Worker is actually deployed (config alone does nothing); (b) schedule changes take up to ~15 minutes to propagate; (c) **Bearer header wrong** or **`CRON_SECRET` mismatch** between dispatcher and app (two Workers, two secret stores — §11); (d) **wrong HTTP method** — endpoints are POST except `/api/cron/payment-reconciliation` (GET; verified in-repo).

**Diagnosis:**

```bash
npx wrangler tail --name acquisitionos-cron      # is the dispatcher firing at all? status codes?
npx wrangler tail --name acquisitionos           # do the fetches arrive? 401 = secret mismatch
# manual local trigger:
cd cron-dispatcher && npx wrangler dev
curl "http://localhost:8787/__scheduled?cron=*/30+*+*+*+*"
```

Dashboard → Worker → Triggers (are the schedules listed?). Unauthenticated curl to a cron URL should be 401 — if it is 200, fix that first ([`security.md`](./security.md) §2).

**Fix:** deploy the dispatcher (`npx wrangler deploy` in `cron-dispatcher/`); set `CRON_SECRET` on **both** Workers to the same value; match the method per endpoint ([`cicd.md`](./cicd.md) §8 table); wait out the propagation window.

**Prevention:** post-deploy smoke list includes one visible cron run ([`../../05-cicd.md`](../05-cicd.md) §7); the dispatcher logs every path+status — alert on non-200s ([`monitoring.md`](./monitoring.md) §8).

---

## 16. Webhook failure (Stripe / Razorpay / Gmail / Telegram)

**Symptom:** provider dashboard shows failing deliveries (4xx/5xx) or no attempts; payments don't reconcile; Gmail replies aren't ingested.

**Cause:** wrong URL path (the code serves `/api/payments/webhook/stripe` and `/api/payments/webhook/razorpay` — see the path note in [`backend.md`](./backend.md) §10; Gmail push must point at `/api/gmail/pubsub/webhook`; Telegram at `/api/telegram/webhook`); **signature secret mismatch** (`STRIPE_WEBHOOK_SECRET` etc. — a re-registered endpoint gets a new secret); the Custom Domain not routing yet (pre-cutover registration); WAF challenge blocking provider IPs; non-POST methods.

**Diagnosis:** trigger a test event (`stripe trigger checkout.session.completed`) with `npx wrangler tail --format pretty` open: no line at all = routing/DNS (§3/§4); a 400/401 = signature/secret; 403 = WAF rule ([`security.md`](./security.md) §2 caution); 500 = app-side (tail shows the exception).

**Fix:** re-register the exact path; re-store the matching signing secret (`wrangler secret put`); exempt provider traffic from challenges; only POST.

**Prevention:** webhook verification is part of the go-live checklist ([`manual-deployment.md`](./manual-deployment.md) §11–§12); re-run it after any domain or secret change.

---

## 17. Logs unavailable

**Symptom:** `wrangler tail` shows nothing; the dashboard Logs tab is empty.

**Cause:** `observability.enabled` not set (Workers Logs off — tail still works but dashboard history does not); tailing the wrong Worker name; wrangler not logged in / token lacks permission; genuinely no traffic (test with a curl).

**Diagnosis:** `npx wrangler whoami` (logged in?); `npx wrangler tail --name acquisitionos` while a colleague curls `/api/health` (name right? traffic reaching the Worker?); check `wrangler.jsonc` for the `"observability": { "enabled": true }` block ([`monitoring.md`](./monitoring.md) §1).

**Fix:** deploy with observability enabled; use the exact Worker name; `npx wrangler login` (humans) or a correctly-scoped token (CI).

**Prevention:** observability on from day one ([`monitoring.md`](./monitoring.md) §1); tail is step 0 of every diagnosis ([`./troubleshooting.md`](./troubleshooting.md) §1) — if you ever *need* logs and cannot get them, that is itself the first incident to fix.

---

## 18. Still stuck?

1. Reproduce in **staging** with `wrangler dev` locally (real `workerd` runtime) — most adapter/runtime issues reproduce there.
2. Search the OpenNext adapter's known issues: https://opennext.js.org/cloudflare/troubleshooting.
3. Check the Workers limits page before blaming your code: https://developers.cloudflare.com/workers/platform/limits/.
4. File a Cloudflare support/community thread with: `wrangler tail` excerpt (redacted), Worker version ID, plan, and a minimal reproduction.
5. Add the resolution to this page — the best troubleshooting doc is the one your team wrote after the last incident.
