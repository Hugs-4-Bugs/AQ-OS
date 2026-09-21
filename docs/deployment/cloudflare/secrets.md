# Secrets — Workers Secrets, Vars, and the Full Variable Map

How every AcquisitionOS environment variable is stored on Cloudflare: encrypted **Worker secrets** via `wrangler secret put`, plaintext **vars** in `wrangler.jsonc`, build-time `NEXT_PUBLIC_*` at build time, and `.dev.vars` locally. The variable semantics come from [`../02-environment-variables-and-secrets.md`](../02-environment-variables-and-secrets.md) — that inventory stays authoritative; this page only maps it onto Workers mechanics.

---

## 1. The three storage layers on Cloudflare

| Layer | Mechanism | Encrypted at rest | Visible in `wrangler.jsonc` | Used for |
| --- | --- | --- | --- | --- |
| **Secrets** | `wrangler secret put NAME` (per Worker, per environment) | Yes | No (never) | `JWT_SECRET`, DB password, provider keys |
| **Vars** | `vars` block in `wrangler.jsonc` | No | Yes (it is a repo file) | Non-secret runtime config: `APP_PUBLIC_URL`, `LOG_LEVEL` |
| **Build-time env** | Set in the shell/CI when `opennextjs-cloudflare build` runs | n/a | No | `NEXT_PUBLIC_APP_URL` (inlined into client JS) |

**Why the split matters:** `wrangler.jsonc` is a version-controlled file — anything in it is public to everyone with repo access. The golden rule from [`../02-environment-variables-and-secrets.md`](../02-environment-variables-and-secrets.md) §11 applies unchanged: if a variable's compromise is an incident, it is a secret, not a var.

---

## 2. `wrangler secret put` — the commands

**What:** stores (or updates) one encrypted value attached to one Worker. Values are readable only by that Worker at runtime via `process.env.NAME` / bindings — never retrievable afterwards (by you or an attacker).
**Why:** this replaces the container platform's secret manager on the other clouds.

```bash
# production Worker
printf "%s" "YOUR_VALUE" | npx wrangler secret put JWT_SECRET

# staging Worker (separate scope — repeat everything with staging values)
printf "%s" "STAGING_VALUE" | npx wrangler secret put JWT_SECRET --name acquisitionos-staging
```

**Expected output:** `Success! Uploaded secret JWT_SECRET`. If the Worker does not exist yet, wrangler prompts to create a placeholder Worker first — that is fine; the real deploy in [`manual-deployment.md`](./manual-deployment.md) §7 adopts it.

**How to verify:**

```bash
npx wrangler secret list          # names + timestamps; values are never shown (by design)
curl -s https://app.yourdomain.com/api/health   # the app's env validation fails loudly on missing critical vars
```

**Updating a secret:** re-run `put` — the new value applies to subsequently started isolates. Rotation guidance: §6.

---

## 3. The full variable map (from `../02-environment-variables-and-secrets.md`)

Legend: **S** = `wrangler secret put` (encrypted) · **V** = `wrangler.jsonc` `vars` (plaintext, non-secret) · **B** = build-time env for `opennextjs-cloudflare build` · **—** = leave unset in production.

### Critical
| Variable | Where | Value / source |
| --- | --- | --- |
| `DATABASE_URL` | S or binding | Hyperdrive pattern preferred: `env.HYPERDRIVE.connectionString` (see [`database.md`](./database.md) §4); if env-var pattern: S with the Hyperdrive-hosted string |
| `DIRECT_URL` | not in the Worker | CI/local only, over the direct connection ([`database.md`](./database.md) §5) |
| `JWT_SECRET` | S | `openssl rand -hex 32` |
| `APP_PUBLIC_URL` | V | `https://app.yourdomain.com` |
| `NEXT_PUBLIC_APP_URL` | **B** (+V harmless) | `https://app.yourdomain.com` — see §5 |
| `AUTH_DEV_MODE` | — | Unset (hard-gated off in production anyway) |
| `NODE_ENV` | V | `production` |

### Email (`REQUIRED` for email auth)
| Variable | Where | Notes |
| --- | --- | --- |
| `RESEND_API_KEY` | S | **Recommended on Workers** (HTTP API; SMTP from Workers unreliable — [`manual-deployment.md`](./manual-deployment.md) §13.3) |
| `SMTP_HOST` / `SMTP_PORT` | V | Only if you insist on SMTP (`NEEDS VERIFICATION` behavior on Workers) |
| `SMTP_USER` | S | semi-secret |
| `SMTP_PASSWORD` | S | Gmail: 16-char App Password |
| `SMTP_FROM` / `EMAIL_FROM` | V | e.g. `AcquisitionOS <noreply@yourdomain.com>` |

### Payments
| Variable | Where |
| --- | --- |
| `STRIPE_SECRET_KEY` | S |
| `STRIPE_PUBLISHABLE_KEY` | V or B (public by design — [`../02-environment-variables-and-secrets.md`](../02-environment-variables-and-secrets.md) §4) |
| `STRIPE_WEBHOOK_SECRET` | S |
| `STRIPE_SUCCESS_URL` / `STRIPE_CANCEL_URL` | V (optional) |
| `RAZORPAY_KEY_ID` | V (semi) or S |
| `RAZORPAY_KEY_SECRET` / `RAZORPAY_WEBHOOK_SECRET` | S |

### Google / discovery
| Variable | Where |
| --- | --- |
| `GOOGLE_CLIENT_ID` | V |
| `GOOGLE_CLIENT_SECRET` | S |
| `GOOGLE_API_KEY` | S |
| `GOOGLE_SEARCH_API_KEY` | S |
| `GOOGLE_SEARCH_ENGINE_ID` | V (non-secret identifier) |
| `SERPAPI_KEY` | S (optional) |

### AI (server-side only)
| Variable | Where |
| --- | --- |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `OPENROUTER_API_KEY` | S — at least one is `REQUIRED` in external production (the built-in primary is sandbox-wired) |
| `OPENAI_MODEL` / `*_BASE_URL`, `AI_*` tuning vars | V (non-secret tuning; see inventory §6 for the full list) |

### Real-time, push, misc
| Variable | Where |
| --- | --- |
| `REDIS_URL` (optional Upstash) | S |
| `VAPID_PUBLIC_KEY` | V (public by design) |
| `VAPID_PRIVATE_KEY` | S |
| `TELEGRAM_BOT_TOKEN` | S |
| `TELEGRAM_WEBHOOK_URL` | V |
| `GMAIL_CRON_API_KEY` | S (protects `/api/gmail/jobs/process`) |
| `GMAIL_PUBSUB_*` | S/V per inventory §5 (only with push mode) |
| `OTEL_*`, `LOG_LEVEL`, `ANALYTICS_CACHE_TTL`, `ENRICHMENT_TIMEOUT_MS` | V (optional; note Workers+OpenTelemetry behavior `NEEDS VERIFICATION` — see [`../01-architecture.md`](../01-architecture.md) §1 observability row) |
| `COMPANY_*`, `PRODUCT_NAME`, `NEXT_PUBLIC_APP_VERSION` | V / B for the `NEXT_PUBLIC_` one |
| `CRON_SECRET` | S (same value in the cron-dispatcher Worker — [`manual-deployment.md`](./manual-deployment.md) §9) |

---

## 4. `.dev.vars` — local development values

**What:** wrangler's file for local variable values used by `wrangler dev` / `opennextjs-cloudflare preview`.
**Why:** you need `NEXTJS_ENV=development` (per the OpenNext get-started guide) and locally convenient values without touching production secrets.

**File (project root):**

```text
NEXTJS_ENV=development
# local-only values; never real production secrets
JWT_SECRET=local-dev-only-secret
```

**Non-negotiable:** `.dev.vars` is **gitignored** (add it next to the existing `.env*` exclusions if missing). It must never contain production values — its whole purpose is to make accidentally shipping real secrets *impossible*.

**Verify:** `git status --short` does not list `.dev.vars`.

---

## 5. Build-time `NEXT_PUBLIC_*` with OpenNext

**What:** `NEXT_PUBLIC_*` variables are inlined into client JavaScript **at build time** — the same rule as every other platform ([`../01-architecture.md`](../01-architecture.md) §2.1).
**Why it bites on Workers specifically:** `wrangler deploy` can change runtime vars instantly, but nothing can change an already-inlined `NEXT_PUBLIC_APP_URL`. If you deploy with the wrong build-time value, browser code talks to the wrong origin (broken OAuth redirects, wrong magic-link host) even though server config looks right.

**Rules:**

1. Set `NEXT_PUBLIC_APP_URL=https://app.yourdomain.com` in the **build environment** (shell export locally, GitHub Actions env for the build job — [`../../05-cicd.md`](../05-cicd.md)).
2. Keep it identical to runtime `APP_PUBLIC_URL` — mismatch produces the exact bugs [`../01-architecture.md`](../01-architecture.md) §2.2 warns about.
3. Changing it means **rebuilding and redeploying** (`opennextjs-cloudflare build && opennextjs-cloudflare deploy`) — plan domain migrations accordingly.
4. `STRIPE_PUBLISHABLE_KEY` and `VAPID_PUBLIC_KEY` follow the same rule if the client references them (`B` above).

**Verify:** after deploy, view-source a page and confirm the inlined origin is your domain; complete one Google OAuth round-trip (redirect URIs in the Google console must match exactly — [`../02-environment-variables-and-secrets.md`](../02-environment-variables-and-secrets.md) §5).

---

## 6. Rotation guidance

| Secret | Rotation effect | Procedure |
| --- | --- | --- |
| `JWT_SECRET` | **Invalidates all sessions** (users re-login) | Announce → `wrangler secret put JWT_SECRET` → verify logins. Rotate on suspicion only. |
| `CRON_SECRET` | Cron calls 401 until dispatcher updated | Update the cron-dispatcher secret first, then the app's — or update both, verify a manual dispatch. |
| DB password | Requires provider-side change | Change at provider → update Hyperdrive config (`wrangler hyperdrive create` anew or update) → update `DIRECT_URL` in CI — see [`database.md`](./database.md). |
| Provider keys (Stripe/Resend/Google/AI) | Provider-dependent | Roll in the provider dashboard → `wrangler secret put` the new value → verify the feature. |
| Account API tokens | CI breaks if wrong | Scoped tokens per [`prerequisites.md`](./prerequisites.md) §6; roll via dashboard, update the GitHub secret. |

Test every rotation in staging first; `npx wrangler tail` is your verification window.

---

## 7. Never commit (the list)

- `.dev.vars` (local values file)
- Any `.env*` file (already excluded — keep it that way)
- `wrangler.jsonc` containing secrets (secrets belong in `wrangler secret put`; only non-secret `vars` belong in the file)
- API tokens (`CLOUDFLARE_API_TOKEN`, provider keys) in Terraform files, GitHub workflows, or docs
- `.open-next/` build output (can embed build-time env values)
- Terraform state/plan files (plaintext secrets inside — [`terraform.md`](./terraform.md) §8)

**Verify:** `git log --all -- .dev.vars wrangler.jsonc` shows no secret-bearing versions; use `git secrets`/`gitleaks` in CI for defense in depth ([`../05-cicd.md`](../05-cicd.md)).

---

## 8. Account API tokens — scoping recap

Created and scoped in [`prerequisites.md`](./prerequisites.md) §6. Recap of the rules:

1. One token per consumer (CI deploy vs Terraform vs one-off scripts).
2. Least privilege: Workers Scripts Edit + Hyperdrive Edit (+ DNS Edit only if CI manages DNS) scoped to the single account and zone.
3. Stored as GitHub Actions secrets / password manager — never in the repo, never in `wrangler.jsonc`.
4. `wrangler login` (OAuth) is for humans; CI always uses the scoped API token via `CLOUDFLARE_API_TOKEN`.

**Verify:** `curl -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" https://api.cloudflare.com/client/v4/user/tokens/verify` → `"status": "active"`.

---

## 9. Official Documentation

- Workers secrets — https://developers.cloudflare.com/workers/configuration/secrets/
- Environment variables (vars) — https://developers.cloudflare.com/workers/configuration/environment-variables/
- `.dev.vars` and local development — https://developers.cloudflare.com/workers/wrangler/commands/#dev (and the OpenNext get-started: https://opennext.js.org/cloudflare)
- API tokens — https://developers.cloudflare.com/fundamentals/api/get-started/create-token/
- Variable inventory (authoritative semantics) — [`../02-environment-variables-and-secrets.md`](../02-environment-variables-and-secrets.md)
