# Frontend on Azure — Serving the Next.js UI from the Container App

AcquisitionOS has **no separate frontend service**. The same Container App (`acquisitionos-api`) renders the React UI, serves static assets, and handles `/api/**` — this page covers the frontend-specific decisions: build-time variables, caching, domains, staging, rollback. Architecture background: [`../01-architecture.md`](../01-architecture.md) §1 ("one unit, two roles").

---

## 1. What the "frontend" is on Azure

```text
Container App: acquisitionos-api (image: node:20-alpine, standalone Next.js 16)
  /                       -> server-rendered pages + client React
  /_next/static/**        -> immutable hashed assets (long cache)
  /api/**                 -> same process, same origin (NOT a separate service)
```

There is nothing to deploy twice: the UI and API version always match because they are one image. Do not create a second "frontend" Container App — it would serve only half the app.

---

## 2. Build-time vs runtime variables

**The one rule:** `NEXT_PUBLIC_*` variables are **inlined into the client JavaScript at `docker build` time**. Everything else is read at runtime and can change via Container App env vars.

| Variable | When it is fixed | How to set it |
| --- | --- | --- |
| `NEXT_PUBLIC_APP_URL` | **Build time** | Pass to `docker build`/`az acr build`, then bake into the image ([`../03-docker.md`](../03-docker.md) §6.1) — non-secret only |
| `APP_PUBLIC_URL` | Runtime (server-side fallback in `app-url.ts`) | Container App env var — settable anytime + revision restart |
| Everything else (`DATABASE_URL`, `JWT_SECRET`, …) | Runtime | secretref/env vars ([`secrets.md`](./secrets.md) §5) |

Build with the URL inline (Option A of [`manual-deployment.md`](./manual-deployment.md) §2):

```bash
cd /path/to/acquisitionos
az acr build --registry "$ACR" \
  --build-arg NEXT_PUBLIC_APP_URL="https://app.yourdomain.com" \
  --image "acquisitionos:$GIT_SHA" --image "acquisitionos:latest" .
```

(The Dockerfile must declare `ARG NEXT_PUBLIC_APP_URL` / `ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL` before `npm run build` for the argument to reach the build — verify the current Dockerfile and adapt it if the ARG is absent; NEEDS VERIFICATION whether the repo's Dockerfile already plumbs this through.)

Consequences:

- Changing the public domain = **new image + new deploy**. Plan domain changes accordingly.
- Never put secrets behind `NEXT_PUBLIC_` — client bundles are public ([`../02-environment-variables-and-secrets.md`](../02-environment-variables-and-secrets.md) golden rule).

**Verify:** `curl -s https://app.yourdomain.com | grep -o "app.yourdomain.com" | head -1` — and in the browser, an OTP/magic-link email whose link points at your domain, not the legacy fallback.

---

## 3. Caching — the app already sets Cache-Control

Next.js sets its own cache headers: hashed `/_next/static/**` assets are immutable/long-cache; HTML and API routes carry conservative headers. On Azure:

- **Container Apps ingress:** adds no caching layer — the app's headers pass through untouched. Nothing to configure.
- **Front Door (OPTIONAL):** if you front the app, set **caching Disabled** on the main route (as in [`manual-deployment.md`](./manual-deployment.md) §8.3). Reason: letting a CDN layer add its own caching decisions on top of server-rendered HTML risks users seeing stale pages after login, and `/api/events/*` must never be cached or buffered (§4). When your traffic justifies edge caching, do it deliberately with a separate route pattern for `/_next/static/*` — and test logins after the change.

**Verify:** `curl -sI https://app.yourdomain.com/_next/static/... | grep -i cache-control` (expect long immutable values on hashed assets) and `curl -sI https://app.yourdomain.com/api/health | grep -i cache-control` (expect no-store-style values from the API).

---

## 4. CDN options and the SSE caveat

| Option | SSE behavior | Verdict |
| --- | --- | --- |
| Container Apps ingress direct | Streams as-is | REQUIRED baseline — works with zero config |
| Azure Front Door with caching disabled on `/api/events/*` | Streams (verify no buffering; probe on `/api/health`) | OPTIONAL — fine if configured per [`networking.md`](./networking.md) §6 |
| Any CDN with default cache-all rules | Breaks notifications bell, payment/analytics streams | Avoid |

The app's SSE routes (`/api/events/{notifications,payments,analytics,messages,workflows,ai}`) send heartbeats every 15–30 s; the notifications bell in the UI opens a stream per session. If the bell "stops updating but works after refresh", something in the edge chain is buffering — walk the checklist in [`networking.md`](./networking.md) §6/§9.

---

## 5. Custom domain + staging

**Custom domain:** one host, `app.yourdomain.com`, bound to the Container App with a **managed certificate** (free, auto-renewing). Steps: [`manual-deployment.md`](./manual-deployment.md) §8, mechanics: [`networking.md`](./networking.md) §8. UI-only consequence to remember: `NEXT_PUBLIC_APP_URL` inside the image must match this host, or client-side absolute URLs (OAuth redirects, asset links) point elsewhere.

**Staging:** a **separate** Container App + **separate** Flexible Server (Burstable SKU) + separate state key if Terraform-managed ([`terraform.md`](./terraform.md) §2):

```bash
# same commands, different names
export APP="acquisitionos-staging" ENV_NAME="cae-staging" PG="pg-acquisitionos-staging"
```

`NEXT_PUBLIC_APP_URL` for staging builds points at `https://staging.yourdomain.com` — that is why staging gets its **own image build**, never the production image (the inlined URL would be wrong). CI promotes the *commit*, and builds per environment ([`../05-cicd.md`](../05-cicd.md) §1 principle adapted: keep one image per commit and rebuild only when build-time inputs differ — document whichever you choose and stay consistent).

---

## 6. CORS: nothing to configure

The UI calls `/api/**` on the **same origin**, so the browser never issues cross-origin API calls — no CORS configuration, no preflights, first-party cookies. This is why the handbook recommends one host (see [`../06-dns-and-domains.md`](../06-dns-and-domains.md) §3). The repo ships CORS tooling (`src/lib/security/cors-config.ts`) for the OPTIONAL `api.`-split case; you do not need it on the single-host Azure deployment.

**Verify (negative check):** browser devtools → Network → the app's fetch/XHR calls show no `OPTIONS` preflight requests to the same origin.

---

## 7. CI/CD and rollback pointers

- **CI/CD:** build → push `acquisitionos:<sha>` → `az containerapp update --image` → health-check `/api/health`. The full pipeline, OIDC login, and environment gating: [`../05-cicd.md`](../05-cicd.md) and `cicd.md` in this folder. Frontend-specific note: any deploy that changes `NEXT_PUBLIC_*` values must rebuild, not just redeploy the old image.
- **Rollback:** Container Apps keeps previous revisions; reactivating one is a one-command revert (details in `rollback.md`):

```bash
az containerapp revision list -n "$APP" -g "$RG" -o table          # see history
az containerapp revision restart -n "$APP" -g "$RG" --revision <old-revision-name>
```

A UI-only regression therefore reverts in seconds with **no database involvement**. Database-affecting rollbacks follow [`../04-database-production.md`](../04-database-production.md) §6 (expand→migrate→contract keeps old revisions compatible with the schema).

---

## 8. Troubleshooting pointers

| Symptom | First checks |
| --- | --- |
| Old page content after deploy | CDN caching (Front Door route) or browser cache; hard refresh, check `Cache-Control` (§3) |
| Bell not updating live | SSE path buffering/caching — [`networking.md`](./networking.md) §6; min replicas ≥ 1 |
| Emails/links point at wrong domain | `APP_PUBLIC_URL` env var, `NEXT_PUBLIC_APP_URL` at build time (§2), [`networking.md`](./networking.md) §8 headers |
| Assets 404 after rollback | Revision references an image tag that no longer exists in ACR — rebuild the old SHA |
| Blank page, console errors about origin | Inlined `NEXT_PUBLIC_APP_URL` mismatched with the serving host |
| Styling/fonts broken | `/_next/static/**` blocked by edge config; check route rules |
| Log stream | `az containerapp logs show -n "$APP" -g "$RG" --follow` |

More symptom→cause→fix entries: `troubleshooting.md` in this folder.

## 9. Official Documentation

- Container Apps (the runtime for the UI) — https://learn.microsoft.com/azure/container-apps/
- Next.js `output: standalone` — https://nextjs.org/docs/app/api-reference/config/next-config-js/output
- Next.js deployment docs — https://nextjs.org/docs/app/getting-started/deploying
- Front Door caching concepts — https://learn.microsoft.com/azure/frontdoor/
- Custom domains & managed certificates — https://learn.microsoft.com/azure/container-apps/custom-domains-managed-certificates
