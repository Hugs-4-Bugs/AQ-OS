# Prerequisites — Cloudflare

Everything you need before the first command in [`manual-deployment.md`](./manual-deployment.md). The general tooling concepts (domain, DNS, secrets, Node, Terraform) are explained once in [`../00-prerequisites.md`](../00-prerequisites.md); this page adds only what is specific to Cloudflare.

---

## 1. Cloudflare account

**What:** a Cloudflare account hosts your DNS zone, the Worker, Hyperdrive, and (optionally) R2. One account can host staging and production.

**Why (for AcquisitionOS):** the Worker, its secrets, Hyperdrive, Cron Triggers, DNS, and SSL all belong to a single account; you will use its **Account ID** in nearly every command.

**How:**

1. Sign up at https://dash.cloudflare.com/sign-up (free to create; no card needed for DNS).
2. Decide the plan honestly:

| Plan | What it means for this app |
| --- | --- |
| Free | Works for DNS, SSL, WAF basics, and Workers — **but** Workers Free allows only **10 ms CPU per request** (as documented at the time of writing) and 5 Cron Triggers per account. A full Next.js SSR app with Prisma and bcrypt auth exceeds 10 ms CPU routinely, so the app will fail unpredictably on Free. |
| Workers Paid (the Workers add-on, billed separately from zone plans) | Raises CPU per request to minutes (30 s default) and Cron Triggers to 250/account. **Effectively required for AcquisitionOS.** |
| Zone Pro/Business | Optional: unlocks Advanced Certificate Manager, more WAF features, higher upload limits. Not required for a first deployment. |

> `NEEDS VERIFICATION`: exact CPU limits, plan prices, and Hyperdrive plan availability change over time — re-check https://developers.cloudflare.com/workers/platform/limits/ and https://developers.cloudflare.com/hyperdrive/ before committing. This handbook deliberately does not quote prices (see [`../README.md`](../README.md) §5).

**How to verify:** log in to the dashboard; the Account ID is visible on the Workers & Pages overview page (right sidebar). Note it down — you will export it as `CF_ACCOUNT_ID` later.

---

## 2. Domain on Cloudflare DNS

**What:** Cloudflare must be the authoritative DNS provider for `yourdomain.com` so that (a) Custom Domains for Workers work, (b) Universal SSL is issued automatically, and (c) WAF/cache rules apply.

**Two ways to get there:**

1. **Change nameservers at your registrar (recommended, reversible).** Add the zone in the Cloudflare dashboard (Add a domain → Free plan works), then set the two `*.ns.cloudflare.com` nameservers your registrar gives you. Propagation can take from minutes to 24–48 h.
2. **Registrar transfer to Cloudflare.** Cloudflare can become your registrar (at-cost pricing). More permanent; not needed for a first deployment.

**Why (for AcquisitionOS):** the app needs exactly one public host (`app.yourdomain.com` — see [`../06-dns-and-domains.md`](../06-dns-and-domains.md) for why one host is the default). With the zone on Cloudflare, that host becomes a Worker Custom Domain: Cloudflare creates the DNS record and the certificate automatically.

**How to verify:** in the dashboard, the zone status reads **Active**; `dig NS yourdomain.com +short` returns `*.ns.cloudflare.com` nameservers.

> Note: existing DNS records are imported when the zone is added. Review them before switching nameservers so nothing (e.g., your mail MX records) breaks.

---

## 3. Wrangler CLI (install + login)

**What:** `wrangler` is Cloudflare's official CLI for Workers. It deploys Workers, creates Hyperdrive configs, stores secrets, and tails logs. It is to this guide what `gcloud`/`aws`/`az` are to the other guides.

**Why (for AcquisitionOS):** every command in [`manual-deployment.md`](./manual-deployment.md) (`wrangler hyperdrive create`, `wrangler secret put`, `wrangler deploy`, `wrangler tail`) comes from wrangler. The OpenNext adapter also requires a minimum wrangler version (≥ 3.99.0 at the time of writing — verify in https://opennext.js.org/cloudflare).

**Command (run in the project root):**

```bash
npm install --save-dev wrangler@latest
npx wrangler --version
```

**Expected output:** a semver like `4.x.x` (any version ≥ 3.99.0 is acceptable for the adapter).

**Login (once per machine):**

```bash
npx wrangler login
```

This opens a browser to authorize the CLI against your Cloudflare account. **Expected output:** `Successfully logged in.`

**How to verify:**

```bash
npx wrangler whoami
```

Expected output shows your account email, your Account ID, and your permissions (e.g., "You are logged in with an API Token" or OAuth scopes). The Account ID here is the value you will use as `CF_ACCOUNT_ID`.

> The project root already uses npm (`package-lock.json` — see [`../01-architecture.md`](../01-architecture.md)), so `npm install --save-dev wrangler` is consistent with the repo. Do not switch package managers for this.

---

## 4. Node.js 20 + npm locally

**What:** the build machine (your laptop or CI) runs Next.js builds with Node 20 — the same major version the app targets in production ([`../01-architecture.md`](../01-architecture.md) §1).

**Why (for AcquisitionOS):** `next build`, Prisma generate, and `opennextjs-cloudflare build` all run locally/CI even though the *runtime* is `workerd`. Version drift between build and the Node-API emulation layer is a classic source of subtle bugs.

**Command:**

```bash
node --version   # expected: v20.x (or the current LTS the app targets)
npm --version    # expected: 10.x or newer
```

**Verify:** the versions match what you use in CI (GitHub Actions `setup-node` with `node-version: 20` — see [`../05-cicd.md`](../05-cicd.md)).

---

## 5. Workers vs Pages — use Workers

**What:** Cloudflare has two application platforms: **Workers** (the current, actively developed runtime) and **Cloudflare Pages** (the older site-focused product).

**Why it matters for AcquisitionOS:** the OpenNext adapter (`@opennextjs/cloudflare`) targets **Workers** with Workers Assets. Pages uses the legacy `@cloudflare/next-on-pages` adapter, which is Edge-runtime-based and does not fit this app (the app needs the Node.js runtime — see [`architecture.md`](./architecture.md) §2). Cloudflare's own docs now direct new projects to Workers (Workers Static Assets, Custom Domains, Workers Builds) and describe Pages as maintained-but-not-the-focus for new projects.

**Decision: deploy as a Worker.** Everything in this guide uses Workers terminology (`wrangler.jsonc`, `wrangler deploy`, Custom Domains on the Worker).

**Verify:** after deployment, the dashboard entry appears under **Workers & Pages → Workers** (not Pages), and the adapter docs you follow are https://opennext.js.org/cloudflare (not the next-on-pages docs).

---

## 6. API tokens for CI (scoping)

**What:** a Cloudflare **API Token** authorizes automated tools (GitHub Actions, Terraform) without your personal login. Tokens carry explicit permission scopes and (optionally) account/zone restrictions.

**Why (for AcquisitionOS):** CI/CD will run `opennextjs-cloudflare deploy` (via wrangler) and later `terraform apply`. Both authenticate with `CLOUDFLARE_API_TOKEN`. Least privilege means scoping the token to exactly what those tools touch.

**Two distinct tokens (recommended — one per consumer):**

| Token | Used by | Minimal scopes (at the time of writing — `NEEDS VERIFICATION` against the token UI/docs) |
| --- | --- | --- |
| `CF_DEPLOY_TOKEN` | wrangler / GitHub Actions deploy | Account: **Workers Scripts: Edit**, **Workers KV Storage: Edit** (only if used), **Hyperdrive: Edit** (only if Terraform/CI manages configs); Zone: **DNS: Edit** (only if CI manages DNS) — scoped to the single account and zone |
| `CF_TERRAFORM_TOKEN` | Terraform | The permission set in [`terraform.md`](./terraform.md) §2 (Zone Read/Edit, Workers Scripts Edit, Hyperdrive Edit, R2 Edit if used, Account Settings Read) |

**Command (create a token):** Dashboard → My Profile → **API Tokens** → Create Token → Custom token. Set scopes, then restrict **Account Resources** to your account and **Zone Resources** to `yourdomain.com` only.

**How to verify:**

```bash
export CLOUDFLARE_API_TOKEN="YOUR_TOKEN_HERE"
curl -s -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  https://api.cloudflare.com/client/v4/user/tokens/verify | head -20
```

Expected: JSON with `"status": "active"`. If it returns `errors`, the token (or its scopes) is wrong.

**Handling rules:** tokens are secrets — store them in GitHub Actions secrets and your password manager, never in Git. See [`secrets.md`](./secrets.md) §7 and [`../../02-environment-variables-and-secrets.md`](../02-environment-variables-and-secrets.md) §11.

---

## 7. Checklist before you continue

- [ ] Cloudflare account created; Account ID noted (`CF_ACCOUNT_ID`)
- [ ] Workers Paid plan decision made (required in practice for this app)
- [ ] Zone `yourdomain.com` **Active** on Cloudflare DNS
- [ ] `wrangler` installed in the project and `wrangler whoami` works
- [ ] Node 20 + npm verified locally and pinned in CI
- [ ] Deploy-time API token created with least-privilege scopes and stored in GitHub secrets
- [ ] External PostgreSQL provider chosen and instance created (next step — [`database.md`](./database.md) §2)
- [ ] You have read [`architecture.md`](./architecture.md) §2 and accept the Workers runtime constraints (adapter, CPU limits, no filesystem)

Next: [`manual-deployment.md`](./manual-deployment.md) — the complete deployment, step by step.
