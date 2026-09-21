# CI/CD — GitHub Actions for AcquisitionOS on Cloudflare

The platform-specific deploy pipeline. Pipeline shape, branch strategy, environment protection, and anti-patterns are identical across all four clouds and live in [`../../05-cicd.md`](../05-cicd.md) — read it first; this page only fills in the Cloudflare deploy job.

**What the pipeline does, in one line:** on every push to `main` — install, test, build the OpenNext Worker bundle, deploy to the staging Worker, then (after human approval) deploy to the production Worker and verify `/api/health`.

**No Docker and no registry exist on this path** ([`./architecture.md`](./architecture.md) §3): the "artifact" is the `.open-next/` Worker bundle produced by `opennextjs-cloudflare build` inside CI.

---

## 1. Credentials: a scoped API token (OIDC is NOT APPLICABLE here)

**Label:** `REQUIRED`

**What:** GitHub Actions authenticates to Cloudflare with `CLOUDFLARE_API_TOKEN` as a repository/Environment secret. Unlike GCP/AWS/Azure, there is **no OIDC federation option for wrangler deploys** — Cloudflare API tokens *are* the static-credential mechanism, so minimize their blast radius with scoping instead.

**Token scopes (create in dashboard → My Profile → API Tokens → Custom token):**

| Permission | Level | Why the pipeline needs it |
| --- | --- | --- |
| Account → **Workers Scripts** | Edit | `wrangler deploy` / `wrangler versions upload` of the Worker |
| Account → **Account Settings** | Read | Token/account verification during wrangler operations |
| Account → **Hyperdrive** | Edit | Update Hyperdrive bindings from config (create once manually per [`manual-deployment.md`](./manual-deployment.md) §3; keep Edit so config changes deploy) |
| Zone → **DNS** | Edit — only if CI manages DNS/Custom Domains | Not needed if Custom Domains are set once manually ([`dns-ssl.md`](./dns-ssl.md) §3) |

Restrict **Account Resources** to your account and **Zone Resources** to `yourdomain.com` only. Exact scope names shift occasionally in the token UI — `NEEDS VERIFICATION` against https://developers.cloudflare.com/fundamentals/api/get-started/create-token/ at setup time. Terraform uses a **separate** token ([`prerequisites.md`](./prerequisites.md) §6, [`terraform.md`](./terraform.md) §2).

**Command (store it):** GitHub repo → Settings → Secrets and variables → Actions → New repository secret: `CLOUDFLARE_API_TOKEN`.

**Expected output:** the secret appears masked; it is never printed in logs.

**Verify the token before wiring CI:**

```bash
export CLOUDFLARE_API_TOKEN="YOUR_TOKEN_HERE"
curl -s -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" https://api.cloudflare.com/client/v4/user/tokens/verify
```

Expected: `"status": "active"`.

---

## 2. The workflow file

**What:** `.github/workflows/deploy.yml`. The `test`/`build` shape follows [`../../05-cicd.md`](../05-cicd.md) §4; the build job below replaces the Docker build/push.

```yaml
name: CI/CD
on:
  push:
    branches: [main]
  pull_request:

concurrency:
  group: cf-deploy-${{ github.ref }}
  cancel-in-progress: false        # never cancel a running deploy mid-flight

env:
  NEXT_PUBLIC_APP_URL: https://app.yourdomain.com   # BUILD-TIME — inlined into client JS (secrets.md §5)

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - run: npx prisma generate
      - run: npm run lint
      - run: npm test

  build:
    needs: test
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - run: npx prisma generate                  # client is needed by the build
      - run: npx opennextjs-cloudflare build      # runs next build + adapter transform → .open-next/
      - uses: actions/upload-artifact@v4          # hand the bundle to the deploy jobs
        with:
          name: opennext-bundle-${{ github.sha }}
          path: .open-next/
          retention-days: 3

  deploy-staging:
    needs: build
    runs-on: ubuntu-latest
    environment: staging
    steps:
      - uses: actions/checkout@v4
      - uses: actions/download-artifact@v4
        with: { name: opennext-bundle-${{ github.sha }}, path: .open-next/ }
      - run: npx wrangler versions upload --name acquisitionos-staging
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
      - run: curl -fsS https://staging.yourdomain.com/api/health

  deploy-production:
    needs: deploy-staging
    runs-on: ubuntu-latest
    environment: production        # required reviewers configured in GitHub (05-cicd.md §5)
    steps:
      - uses: actions/checkout@v4
      - uses: actions/download-artifact@v4
        with: { name: opennext-bundle-${{ github.sha }}, path: .open-next/ }
      - run: npx opennextjs-cloudflare deploy
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
      - run: curl -fsS https://app.yourdomain.com/api/health
```

**Notes on the deploy commands:**

- `opennextjs-cloudflare deploy` = build (already done) + `wrangler deploy`. In `deploy-staging` we bypass a rebuild with `wrangler versions upload` against the downloaded artifact — the same bundle promoted staging → production, matching the handbook's "one immutable artifact per commit" rule ([`../../05-cicd.md`](../05-cicd.md) §1). Exact subcommand behavior (`versions upload` vs `deploy` per environment) — `NEEDS VERIFICATION` against your wrangler version (https://developers.cloudflare.com/workers/wrangler/commands/); the equivalent alternative is running `opennextjs-cloudflare deploy` in both jobs with separate wrangler configs per environment ([`frontend.md`](./frontend.md) §7).
- `wrangler.jsonc` in the repo is the source of bindings/routes; CI only needs the two secrets plus the checked-in config.

**Expected output (successful run):** green `test → build → deploy-staging → deploy-production`; the deploy step prints the deployed version ID — **record it** (§6).

**Verify:** `npx wrangler versions list` (or dashboard → Deployments) shows a new version whose source is the CI run; `curl -s https://app.yourdomain.com/api/health` → 200.

---

## 3. `NEXT_PUBLIC_APP_URL` is a build-time variable — set it in the workflow

**What:** `NEXT_PUBLIC_*` values are inlined during `opennextjs-cloudflare build` ([`secrets.md`](./secrets.md) §5, [`frontend.md`](./frontend.md) §1).

**Why it bites in CI:** a deploy that reuses a stale build (cache, wrong job order) ships the wrong inlined origin → broken OAuth redirects and wrong magic-link hosts while "everything looks deployed".

**Rules:** set `NEXT_PUBLIC_APP_URL` as a workflow-level `env` (shown above); use **different values per environment** if staging and production build separately (separate builds are the honest way — one artifact per environment build). Verify after deploy: view-source a page and confirm the inlined origin.

---

## 4. Secrets: one-time bootstrap, never per-deploy

**What:** application secrets (`JWT_SECRET`, `CRON_SECRET`, provider keys, ...) are stored **once** via `wrangler secret put` from your machine — they are not part of the CI pipeline at all. Deploys do not touch them.

**Command (one-time, local, interactive or piped — from [`manual-deployment.md`](./manual-deployment.md) §4):**

```bash
printf "%s" "YOUR_VALUE" | npx wrangler secret put JWT_SECRET
npx wrangler secret list                      # verify names + timestamps
```

**If you must (re)set many secrets from CI** (e.g. a bootstrap workflow): wrangler provides a bulk upload that reads a JSON file (or stdin) — historically invoked as `wrangler secret bulk <file.json>`. Before relying on it, **verify the exact command name and behavior in your wrangler version** — `NEEDS VERIFICATION` (https://developers.cloudflare.com/workers/configuration/secrets/#secrets-bulk) — and never echo the values: build the JSON file from GitHub secrets *inside the step* and delete it in the same step (`rm secrets.json`), so nothing lands in CI logs.

**Anti-pattern (from [`../../05-cicd.md`](../05-cicd.md) §9):** passing application secrets as plaintext `env:` to the build. Build-time values are only the public `NEXT_PUBLIC_*` ones.

**Verify:** `npx wrangler secret list` for `acquisitionos` and separately for `acquisitionos-staging` (secrets are per Worker — [`secrets.md`](./secrets.md) §2) shows every required name.

---

## 5. Database migrations in CI (`DIRECT_URL`)

**What:** `prisma db push` (or `migrate deploy`) runs **once per deploy, over the direct connection** — never through Hyperdrive, never from inside the Worker ([`database.md`](./database.md) §5, [`../../04-database-production.md`](../04-database-production.md) §4).

**Where `DIRECT_URL` lives:** a GitHub Actions secret (`DIRECT_URL`) on the `production`/`staging` Environments, or pulled at runtime from an external secret store. It must NOT be a Worker secret (the Worker never migrates).

**Step (added to `deploy-production`, after the deploy step and before the health check):**

```yaml
      - name: Push database schema
        run: |
          export DIRECT_URL="${{ secrets.DIRECT_URL }}"
          export DATABASE_URL="$DIRECT_URL"
          npx prisma db push --schema=prisma/schema.production.prisma
```

Prisma needs no Cloudflare credentials — only `DIRECT_URL`.

**Expected output:** `The database is in sync with your Prisma schema.` A failed migration **fails the deploy** — investigate before re-running; never blindly retry destructive changes ([`../../05-cicd.md`](../05-cicd.md) §6).

**Sequencing note:** because Workers deploys are instant and version-atomic, the safe order is: deploy new Worker version → run schema push (additive changes keep the old version working) → health check. If a schema change breaks the previous version, run the push *between* upload and activation, or use gradual traffic splitting (`NEEDS VERIFICATION` support with the adapter — [`rollback.md`](./rollback.md) §2.3).

---

## 6. Rollback job (or manual command)

**What:** re-point traffic at the previous immutable Worker Version — instant, no rebuild ([`./rollback.md`](./rollback.md) §2).

**Command (manual, from your machine):**

```bash
npx wrangler versions list                     # copy the previous version ID
npx wrangler rollback                          # interactive pick, or:
npx wrangler versions rollback <VERSION_ID>    # exact subcommand shape — NEEDS VERIFICATION per wrangler version
```

**As a CI job (optional convenience):**

```yaml
  rollback-production:
    if: workflow_dispatch
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: actions/checkout@v4
      - run: npx wrangler rollback --message "rollback via CI"
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
      - run: curl -fsS https://app.yourdomain.com/api/health
```

**Expected output:** the dashboard Deployments tab shows the previous version live again; health check green. **Verify:** `curl -s https://app.yourdomain.com/api/health` plus one login.

---

## 7. Staging environment (separate Worker, separate Hyperdrive)

**What:** CI deploys staging to a **different Worker name** — never a shared one:

| Resource | Production | Staging |
| --- | --- | --- |
| Worker | `acquisitionos` | `acquisitionos-staging` (`--name` / per-env wrangler config) |
| Hyperdrive | `acquisitionos-pg` → prod DB | `acquisitionos-pg-staging` → **staging DB** (create: `npx wrangler hyperdrive create acquisitionos-pg-staging --connection-string="postgresql://...staging..."`) |
| Custom Domain | `app.yourdomain.com` | `staging.yourdomain.com` |
| Secrets | prod values | staging values (`wrangler secret put --name acquisitionos-staging`) |
| Build | `NEXT_PUBLIC_APP_URL=https://app.yourdomain.com` | `https://staging.yourdomain.com` (separate build) |

**Why:** staging webhooks, OTP emails, and cron runs must never touch production data or connection budget ([`database.md`](./database.md) §9, [`frontend.md`](./frontend.md) §7).

**Verify:** `https://staging.yourdomain.com/api/health` → 200; log into staging and confirm an empty user list; production data untouched.

---

## 8. Cron Triggers: a one-time config change, not a CI concern

**What:** the scheduler for the 15 Bearer-protected endpoints is the `acquisitionos-cron` dispatcher Worker — its schedules live in **its** `wrangler.jsonc` (`triggers.crons`) and are deployed **once** ([`manual-deployment.md`](./manual-deployment.md) §9). App redeploys do not touch it; CI does not manage it.

**Why this shape:** a tiny dedicated dispatcher fetching the app's own cron URLs over HTTPS keeps the OpenNext-generated Worker untouched and survives every app deploy. (An external uptime-style pinger is the zero-code alternative.)

**Config recap** — `cron-dispatcher/wrangler.jsonc`:

```jsonc
{
  "name": "acquisitionos-cron",
  "main": "src/index.js",
  "compatibility_date": "2024-09-23",
  "triggers": { "crons": ["*/10 * * * *", "*/30 * * * *", "0 3 * * *"] },
  "vars": { "APP_BASE_URL": "https://app.yourdomain.com" }
}
```

and the `scheduled()` handler pattern (fetch + Bearer + `ctx.waitUntil`; see [`backend.md`](./backend.md) §8):

```js
export default {
  async scheduled(controller, env, ctx) {
    const paths = GROUPS[controller.cron] ?? [];
    ctx.waitUntil(Promise.all(paths.map(async (p) => {
      const res = await fetch(`${env.APP_BASE_URL}${p}`, {
        method: p === "/api/cron/payment-reconciliation" ? "GET" : "POST",
        headers: { Authorization: `Bearer ${env.CRON_SECRET}` },
      });
      console.log(p, res.status);
    })));
  },
};
```

**Cadences** (source: [`../01-architecture.md`](../01-architecture.md) §2.4; grouping honors the 5-trigger free-plan cap — Paid allows 250, figures `NEEDS VERIFICATION`):

| Trigger | Endpoints in the group | Cadence |
| --- | --- | --- |
| `*/10 * * * *` | `/api/cron/process-sequences`, `/api/cron/sequence-processing`, `/api/cron/meeting-reminders` (+ `/api/cron/process-gmail-replies`, `/api/gmail/jobs/process` — skip if Gmail Pub/Sub push is configured) | every 5–15 min |
| `*/30 * * * *` | `/api/cron/expire-api-keys`, `/api/cron/hot-lead-scan`, `/api/cron/autonomous-outreach`, `/api/cron/sdr-cycle` | every 15–60 min |
| `0 3 * * *` (daily, off-peak) | `/api/cron/credit-renewal`, `/api/cron/end-of-period`, `/api/cron/renew-subscriptions`, `/api/cron/payment-reconciliation`, `/api/payments/process-billing`, `/api/feedback/retry-emails` | daily |

> **Method note (verified in-repo):** every `/api/cron/**` route checks `Authorization: Bearer <CRON_SECRET>`; methods are POST except `/api/cron/payment-reconciliation` (GET). `/api/gmail/jobs/process` additionally accepts `x-api-key` (`GMAIL_CRON_API_KEY`). Schedule changes take up to ~15 minutes to propagate (documented in the Cron Triggers docs).

**Verify:** `curl "http://localhost:8787/__scheduled?cron=*/30+*+*+*+*"` under `wrangler dev` in `cron-dispatcher/`, then `npx wrangler tail --name acquisitionos` shows the endpoints returning 200; unauthenticated `curl` to a cron URL returns 401.

---

## 9. Concurrency, branch protection, environments (recap)

Everything below is cross-cloud and detailed in [`../../05-cicd.md`](../05-cicd.md) §2/§5 — recap only:

- `concurrency: group: cf-deploy-${{ github.ref }}, cancel-in-progress: false` — two deploys never race (Workers Versions make overlap survivable, but sequential deploys keep rollback IDs unambiguous).
- `production` GitHub Environment: **required reviewers**, restricted to `main`.
- PRs run `test` only; `main` deploys to staging; approval promotes to production.
- `terraform plan` on PR / gated `apply` is a **separate** workflow ([`terraform.md`](./terraform.md) §9) — never mixed into the app deploy job.

**Verify:** open a PR → only `test` runs; merge to `main` → staging deploys without prompts; the `deploy-production` job waits for your approval.

---

## 10. Official Documentation

- Cloudflare API tokens — https://developers.cloudflare.com/fundamentals/api/get-started/create-token/
- Wrangler commands (deploy, versions, secret, tail) — https://developers.cloudflare.com/workers/wrangler/commands/
- Workers Versions & gradual deployments — https://developers.cloudflare.com/workers/configuration/versions-and-deployments/
- Workers Builds (Cloudflare-managed Git builds — an alternative to GitHub Actions) — https://developers.cloudflare.com/workers/ci-cd/builds/
- Secrets (incl. bulk upload) — https://developers.cloudflare.com/workers/configuration/secrets/
- Cron Triggers — https://developers.cloudflare.com/workers/configuration/cron-triggers/
- OpenNext Cloudflare adapter — https://opennext.js.org/cloudflare
- Shared CI/CD chapter — [`../../05-cicd.md`](../05-cicd.md)
