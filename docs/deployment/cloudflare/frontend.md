# Frontend — The Next.js UI on Workers (via OpenNext)

AcquisitionOS has no separate frontend service — the same Next.js 16 app renders the UI and serves `/api/**` ([`../01-architecture.md`](../01-architecture.md) §1). On Cloudflare, that whole unit runs as one Worker built by the OpenNext adapter; this page covers the UI-specific concerns: static assets, caching, build-time variables, image optimization, staging, and rollback.

---

## 1. Build-time vs runtime environment on Workers

**What:** the same two-variable classes as every other platform ([`../01-architecture.md`](../01-architecture.md) §2.1), with a Workers-specific twist:

| Class | Example | When its value is fixed | Where it is set |
| --- | --- | --- | --- |
| Build-time (`NEXT_PUBLIC_*`) | `NEXT_PUBLIC_APP_URL`, `STRIPE_PUBLISHABLE_KEY` | During `opennextjs-cloudflare build` (inlined into client JS) | CI/shell env — see [`secrets.md`](./secrets.md) §5 |
| Runtime (server-only) | `APP_PUBLIC_URL`, `JWT_SECRET`, `DATABASE_URL` | At request time | `wrangler.jsonc` `vars` (non-secret) and `wrangler secret put` (secret) |

**Why the twist:** on container clouds you can "restart with new env vars"; on Workers the equivalent is redeploying — but **only runtime vars change without a rebuild**. A changed `NEXT_PUBLIC_APP_URL` requires a full rebuild + redeploy. Get the build-time value right in CI before your first production deploy.

**Verify:** after deploy, load the login page and view-source: the inlined origin must be `https://app.yourdomain.com`; then confirm one full login round-trip works.

---

## 2. Static assets: Workers Assets

**What:** the OpenNext build emits two parts — `.open-next/worker.js` (server bundle) and `.open-next/assets/` (client chunks from `_next/static` plus files from `public/`). The `assets` block in `wrangler.jsonc` binds that directory, and Cloudflare's **Workers Assets** layer serves it directly from the edge:

```jsonc
"assets": { "directory": ".open-next/assets", "binding": "ASSETS" }
```

**Why:** static JS/CSS/images are served without invoking the Worker process at all — faster, cheaper, and with sensible built-in caching/ETag handling (https://developers.cloudflare.com/workers/static-assets/). Navigation requests fall through to the Worker for SSR.

**Behavior notes for this app:**

- Hashed `_next/static/**` files are effectively immutable — long caches are correct and automatic.
- Files in `public/` ship with the deployment; **uploads that the app writes to `public/` at runtime are NOT here** (§3).
- Limits at the time of writing: 20,000 asset files per Worker version on the free plan (100,000 on paid), 25 MiB per file — `NEEDS VERIFICATION`; the current figures live at https://developers.cloudflare.com/workers/static-assets/ (billing and limitations page).

**Verify:** `curl -sD - -o /dev/null https://app.yourdomain.com/_next/static/<a-chunk-from-view-source> | head -5` → `200` with strong cache headers; network tab shows chunks loading from your domain.

---

## 3. Caching: the app's `Cache-Control` headers are respected

**What:** caching happens at three layers, and the app's headers govern the top one:

1. **Workers Assets** — static files, built-in immutable caching (§2).
2. **CDN/Cache Rules** — the edge respects the app's `Cache-Control` responses; force behavior with Cache Rules ([`networking.md`](./networking.md) §8). The one mandatory rule: **bypass cache for `/api/*`**.
3. **Cache API inside the Worker** — OpenNext exposes a cache implementation; with an optional R2 binding (`NEXT_INC_CACHE_R2_BUCKET`) Next.js ISR/incremental cache can persist across isolates (https://opennext.js.org/cloudflare — Caching docs). `OPTIONAL`: AcquisitionOS relies mainly on SSR + client-side caching, so start without ISR caching and add it only if you adopt ISR.

**Why this matters:** server-rendered pages for logged-in users must never be shared-cached; the app sets its headers accordingly, and the `/api/*` bypass rule guarantees auth/SSE/webhook responses are always per-request.

**Verify:**

```bash
curl -sD - -o /dev/null https://app.yourdomain.com/ | rg -i "cache-control|cf-cache-status"
curl -sD - -o /dev/null https://app.yourdomain.com/api/health | rg -i "cache-control|cf-cache-status"   # no-store, no HIT
```

---

## 4. Image optimization — the honest caveat

**What:** Next.js `<Image>` (and `/next/image` requests) normally run server-side image resizing via sharp-like native processing. On Workers this is **not automatic** — the OpenNext docs ship a dedicated how-to (https://opennext.js.org/cloudflare/howtos/image) because `sharp` is a native module that does not run as-is under `workerd`.

**Options for AcquisitionOS (choose explicitly; do not leave it default):**

| Option | What you do | Trade-offs |
| --- | --- | --- |
| **A. Cloudflare Images binding** | Add the `images` binding to `wrangler.jsonc` per the OpenNext how-to; `next/image` is routed to Cloudflare Images | Native-quality resizing at the edge; adds Cloudflare Images usage/cost; vendor-coupled |
| **B. External/custom loader** | Set `images.loader` to a loader backed by any resizing service/CDN you already run | Portable, but you operate the loader |
| **C. `images.unoptimized = true`** | Serve original images, sized by layout | Zero moving parts; heavier pages; acceptable if the UI uses few/optimized images |

**Recommendation:** start with **C** to remove a variable from your first deployment, then evaluate **A** once traffic justifies it. This mirrors how the app's images are used (mostly UI chrome and user uploads, not a media-heavy gallery).

**Verify:** load a page containing `next/image` in staging; confirm images render and no `/next/image` route returns 5xx in `npx wrangler tail`.

---

## 5. Custom domain + HTTPS for the UI

Covered operationally in [`manual-deployment.md`](./manual-deployment.md) §10 and [`networking.md`](./networking.md) §3–4. Summary for the UI: the Worker Custom Domain gives `https://app.yourdomain.com` with automatic Universal SSL; secure auth cookies and OAuth redirects depend on it; no extra frontend-specific DNS is needed because UI and API share one origin.

---

## 6. CORS: not needed (same origin)

**What:** the React client and `/api/**` are served from the same origin by design (that is the app's architecture, [`../01-architecture.md`](../01-architecture.md) §1), so browsers make same-origin requests — no CORS configuration anywhere in the stack, and none on Cloudflare.

**One implication:** do not "helpfully" add a permissive `Access-Control-Allow-Origin` rule at the edge; the app relies on cookie-based JWT auth, and cross-origin looseness only adds attack surface. If a future mobile client needs API access, that is an application-level decision, not an edge rule.

**Verify:** browser console shows no CORS errors during login and SSE use; `curl -s -D - -o /dev/null https://app.yourdomain.com/api/health` behaves the same with and without `Origin` headers.

---

## 7. Staging: a separate Worker with its own everything

**What:** staging is a second deployment of the same Worker with a different name and bindings — not a shared instance.

```bash
# one-time: separate config per environment (recommended: wrangler.staging.jsonc or env overrides)
npx opennextjs-cloudflare build
npx wrangler deploy --name acquisitionos-staging
```

| Resource | Production | Staging |
| --- | --- | --- |
| Worker | `acquisitionos` | `acquisitionos-staging` |
| Custom Domain | `app.yourdomain.com` | `staging.yourdomain.com` |
| Hyperdrive | `acquisitionos-pg` → prod DB | `acquisitionos-pg-staging` → **staging DB** (separate database — [`database.md`](./database.md) §9) |
| Secrets | prod values | staging values (`wrangler secret put --name acquisitionos-staging`) |
| `APP_PUBLIC_URL` / build-time `NEXT_PUBLIC_APP_URL` | `https://app.yourdomain.com` | `https://staging.yourdomain.com` (rebuild!) |

**Why separate DB and secrets:** staging webhooks, OTP emails, and cron runs must never mutate production data; the `NEXT_PUBLIC_APP_URL` difference forces a separate build per environment (§1) — CI jobs make this mechanical ([`../../05-cicd.md`](../05-cicd.md)).

**Verify:** `https://staging.yourdomain.com/api/health` → 200; log into staging, confirm the user list is empty (separate DB); confirm production data untouched.

---

## 8. Deploy, versions, rollback

**What:** every `opennextjs-cloudflare deploy` (or `wrangler versions upload`) creates a **Worker Version** — an immutable snapshot. The dashboard (Deployments tab) and `wrangler versions list` show history; **rollback is instant** (`wrangler rollback` / dashboard button) because it re-points traffic at a previous version rather than rebuilding anything.

**Why this is nice:** the container-cloud "pull previous image and redeploy" dance disappears; a bad release is one click away from fixed. Pair rule: application rollback = instant version rollback; **database rollback is separate and slower** — migrations run over `DIRECT_URL` ([`database.md`](./database.md) §5), so follow the rollback discipline in [`../04-database-production.md`](../04-database-production.md) before rolling app versions back across schema changes.

**CI/CD:** the full pipeline (build → `opennextjs-cloudflare deploy` per environment, gated by GitHub Environments, with the plan-on-PR / apply-on-merge pattern for Terraform) is in [`../../05-cicd.md`](../05-cicd.md) and [`terraform.md`](./terraform.md) §9. Keep deploy jobs and Terraform jobs decoupled (see [`terraform.md`](./terraform.md) §1).

**Verify:** deploy twice with a cosmetic change between builds; `wrangler versions list` shows both; roll back; confirm the previous behavior returns within seconds.

---

## 9. Troubleshooting pointers

| Symptom | First checks | Where documented |
| --- | --- | --- |
| Page renders but CSS/JS 404 | `assets.directory` exists in `.open-next/`? deploy completed (not just build)? | [`manual-deployment.md`](./manual-deployment.md) §7; https://opennext.js.org/cloudflare/troubleshooting |
| Login works, then immediate logout | Build-time `NEXT_PUBLIC_APP_URL` mismatch; secure-cookie origin mismatch | [`secrets.md`](./secrets.md) §5; [`../01-architecture.md`](../01-architecture.md) §2.2 |
| SSE bell silent | Cache bypass rule for `/api/*` missing; heartbeat/`Last-Event-ID` test not run | [`networking.md`](./networking.md) §7; [`manual-deployment.md`](./manual-deployment.md) §13.1 |
| DB errors like "prepared statement ... does not exist" or connection reuse failures | Global Prisma client still in use; per-request pattern not applied | [`database.md`](./database.md) §4 |
| Images broken after migration | `next/image` optimization not configured (§4 option chosen?) | https://opennext.js.org/cloudflare/howtos/image |
| Random 1101 errors in `wrangler tail` | Node-API usage outside `nodejs_compat`; check the adapter's known-issues page | https://opennext.js.org/cloudflare (Known issues / Troubleshooting) |
| OTP email never arrives | SMTP-from-Workers friction; switch to Resend HTTP API | [`manual-deployment.md`](./manual-deployment.md) §13.3 |

---

## 10. Official Documentation

- Workers Static Assets — https://developers.cloudflare.com/workers/static-assets/
- OpenNext Cloudflare adapter — https://opennext.js.org/cloudflare (Get Started, Caching, Image Optimization how-to, Static assets)
- Workers Versions & rollbacks — https://developers.cloudflare.com/workers/configuration/versions-and-deployments/rollbacks/
- Cache Rules — https://developers.cloudflare.com/cache/how-to/cache-rules/
- Workers Builds (Git-integrated builds, alternative to CI-managed deploys) — https://developers.cloudflare.com/workers/ci-cd/builds/
- Next.js deployment docs — https://nextjs.org/docs/app/getting-started/deploying
