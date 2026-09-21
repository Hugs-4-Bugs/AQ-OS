# Frontend — Serving the Next.js UI on AWS

AcquisitionOS has **no separate frontend deployment**. The same ECS Fargate container that runs `/api/**` server-renders the React UI and ships static assets. This page covers the frontend-specific concerns on AWS: build-time variables, caching layers, the domain/TLS setup, staging, and where rollback and troubleshooting live.

---

## 1. One container, one port

```text
ALB (443) ──▶ ECS Fargate task ──▶ Next.js 16 standalone server :3000
                                     ├── React 19 UI (SSR + client)
                                     └── /_next/static/* (immutable hashed assets)
```

- Image: built from the repo `Dockerfile` (see [`../03-docker.md`](../03-docker.md)) — `output: 'standalone'`, port 3000, binds `0.0.0.0`.
- The ALB target group treats UI and API identically (single target group, [`networking.md`](./networking.md) §4). There is no static hosting bucket to keep in sync; the Node process serves everything.

## 2. Build-time vs runtime variables (the #1 frontend gotcha)

| Kind | Examples | Where set | Change procedure |
| --- | --- | --- | --- |
| **Build-time** (`NEXT_PUBLIC_*`, inlined into client JS at build) | `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_APP_VERSION` | Passed to `docker build` in CI (or your machine) | Rebuild + push image + redeploy |
| **Runtime** (everything else) | `APP_PUBLIC_URL`, `JWT_SECRET`, `DATABASE_URL`, provider keys | Task definition `environment` + `secrets` (from Secrets Manager) | Update secret/env → redeploy service (§ [`secrets.md`](./secrets.md) §6) |

`NEXT_PUBLIC_APP_URL` is inlined into the browser bundle during `next build`; changing the secret manager value afterwards does **nothing** for client code. Two rules:

1. **Never pass secrets as build args.** Build args are recorded in image history and are effectively public. Only non-secret values (`NEXT_PUBLIC_APP_URL`, version strings) go here:

   ```bash
   docker build \
     --build-arg NEXT_PUBLIC_APP_URL="https://app.yourdomain.com" \
     -t ${ECR_URI}:${GIT_SHA} .
   ```

   (Add an `ARG`/`ENV` pair in the builder stage if your Dockerfile does not declare it yet — keep it in the builder, not the runner.)
2. **Set both URL vars to the same value.** Server code resolves URLs via headers then `APP_PUBLIC_URL` (runtime, task def); client code uses the build-time `NEXT_PUBLIC_APP_URL`. Same value everywhere removes all ambiguity ([`../01-architecture.md`](../01-architecture.md) §2.2).

Consequence for CI: `docker build` runs **in the pipeline** with the non-secret build args, then pushes to ECR; runtime secrets are attached only at the ECS layer. See [`../05-cicd.md`](../05-cicd.md) and [`terraform.md`](./terraform.md) §8.

## 3. Caching: ALB / optional CloudFront vs the app's own headers

The app already sends correct `Cache-Control` headers; the AWS layers must not fight them:

| Content | App sends | ALB does | Optional CloudFront behavior |
| --- | --- | --- | --- |
| `/_next/static/*` (hashed JS/CSS) | `public, max-age=31536000, immutable` | passes through | **Cache** (long TTL or respect origin headers) — safe, files are fingerprinted |
| Rendered pages / `/_next/data` | varies (`private`, short TTLs) | passes through | bypass or very short TTL; never cache authenticated pages |
| `/api/*` | `no-store` family | passes through | **CachingDisabled** + forward all headers (incl. `Host`) |
| `/api/events/*` (SSE) | streamed | idle timeout 3600 s, no buffering (ALB default) | prefer bypass; verify no buffering if you route it through the edge ([`networking.md`](./networking.md) §6) |

ALB is a pass-through router — it adds no caching and does not strip `Cache-Control`. That makes it the safe default: correct behavior comes for free, and CloudFront is an **OPTIONAL** optimization for static assets only. If you add it, scope it per §6 of [`networking.md`](./networking.md) — the failure modes of caching `/api/*` (broken webhooks, stale auth, dead SSE) are worse than the win.

Header reminders (they are frontend-relevant): the ALB forwards `Host` and `X-Forwarded-Proto` by default, which is what SSR code uses to build absolute URLs; `APP_PUBLIC_URL`/`NEXT_PUBLIC_APP_URL` are the deterministic override.

## 4. Custom domain + TLS for the UI

- Domain: `app.yourdomain.com` (the single-host pattern — UI and API share it; see [`../06-dns-and-domains.md`](../06-dns-and-domains.md) §3).
- Certificate: **ACM** in the ALB's region, DNS-validated ([`manual-deployment.md`](./manual-deployment.md) §11). Renewal is automatic; the only way to break it is deleting the validation record.
- Records: A/AAAA ALIAS → ALB (Route 53) or CNAME at your registrar.
- `AUTH` cookies are `secure` in production — the site must be served **HTTPS only** (that is why the 80→443 redirect listener matters).

## 5. CORS: not needed (same origin)

The UI calls `/api/**` on the same host it is served from, so no CORS configuration exists on AWS or in the app for same-origin use. Two notes:

- If you later expose an API for a different origin, that is an app-level change — do not "fix" it with ALB/CloudFront header hacks.
- The OPTIONAL S3 uploads bucket uses its own bucket CORS policy (repo Terraform `aws_s3_bucket_cors_configuration` allows `https://${var.domain}`) — that is for browser-to-S3 access, not for the app's API.

## 6. Staging = separate ECS service + separate database

Do not share a container or a database between staging and production. The cheap, correct shape:

- **Separate task definition revision family** (e.g. `acquisitionos-staging`) with `APP_PUBLIC_URL=https://staging.yourdomain.com`, staging secrets (`acquisitionos/staging/*` in Secrets Manager), and Single-AZ RDS.
- **Separate ECS service** (e.g. `acquisitionos-staging`) in the same cluster, desired count 1.
- **Separate target group** on a second ALB listener rule or a second path/hostname (`staging.yourdomain.com` with its own ACM cert), so production capacity is never occupied by staging tests.
- Terraform: the `environments/dev` and `environments/staging` directories from [`terraform.md`](./terraform.md) §3 make this a parameter difference, not a copy-paste exercise.

## 7. CI/CD pointer

The frontend deploys exactly like the backend — there is only one artifact. Pipeline shape: PR checks (`npm test`, `npm run lint`, docker build) → on `main`: build with `--build-arg NEXT_PUBLIC_APP_URL` → push `:GIT_SHA` to ECR → new task definition revision → `aws ecs update-service` (circuit breaker with rollback on). Reference workflow: [`../05-cicd.md`](../05-cicd.md) §4; AWS-specific apply job with OIDC: [`terraform.md`](./terraform.md) §8.

## 8. Rollback pointer

Because images are immutable and task definitions are versioned, frontend rollback = **redeploy the previous task definition revision**:

```bash
aws ecs update-service --cluster acquisitionos-prod --service acquisitionos-app \
  --task-definition acquisitionos-prod:<PREVIOUS_REVISION>
```

Details, including what *cannot* roll back (schema changes), live in `rollback.md` (when written) and the cloud-agnostic pattern in [`../05-cicd.md`](../05-cicd.md) §7. The deployment circuit breaker gives you this automatically for a failed new revision.

## 9. Troubleshooting pointers (symptom → where to look)

| Symptom | First checks | Details |
| --- | --- | --- |
| Page loads but "bad gateway" from ALB | target health (`UnHealthyHostCount`), container logs (`aws logs tail /acquisitionos/production`) | `troubleshooting.md` (when written), [`manual-deployment.md`](./manual-deployment.md) §9 |
| Static assets 404 / stale | wrong image deployed? `describe-services` shows current task def revision | [`../03-docker.md`](../03-docker.md) §8 |
| SSE bell disconnects every ~60 s | idle timeout still 60 s — raise it | [`networking.md`](./networking.md) §4 |
| Magic links/OAuth redirect to the wrong host | `APP_PUBLIC_URL` env + `NEXT_PUBLIC_APP_URL` build arg mismatch; headers forwarded? | [`../01-architecture.md`](../01-architecture.md) §2.2 |
| Client shows old URL after rename | `NEXT_PUBLIC_*` is build-time — rebuild the image | §2 above |
| Styles broken after deploy | cached HTML referencing old hashed assets — purge/bypass cache for HTML | §3 |

## 10. Official Documentation

- Next.js static output & caching (`output`, standalone) — https://nextjs.org/docs/app/api-reference/config/next-config-js/output
- Next.js caching (App Router) — https://nextjs.org/docs/app/building-your-application/caching
- CloudFront caching based on request headers — https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/header-caching.html
- CloudFront cache policies — https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/controlling-the-cache-key.html
- ACM DNS validation — https://docs.aws.amazon.com/acm/latest/userguide/dns-validation.html
