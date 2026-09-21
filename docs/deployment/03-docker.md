# Docker & Containerization Guide

AcquisitionOS ships a production-grade multi-stage `Dockerfile` at the repository root. This guide explains how it works, how to build and test the image locally, and **two repository files you must create before the first build succeeds** (they are referenced by the build but currently missing — creating them is a documented manual step, not a code change).

---

## 1. Docker concepts in 90 seconds

- **Image** — an immutable snapshot of your app + runtime. Built from a `Dockerfile`.
- **Container** — a running instance of an image.
- **Multi-stage build** — a Dockerfile with several `FROM` stages: a *builder* stage compiles the app with all dev tools; the final *runner* stage copies only the artifacts needed at runtime. Result: small, secure production images.
- **Registry** — stores images with tags (`registry/app:1.2.3`); clouds pull from it.
- **Tag** — a version label on an image. Strategy used in this handbook: `acquisitionos:<git-sha>` for every build, plus `acquisitionos:latest` pointer.

**Why AcquisitionOS needs Docker:** every cloud in this handbook runs the same container image (Cloud Run, ECS, Container Apps) or the same build via the OpenNext adapter (Cloudflare). One artifact → four platforms → identical behavior.

---

## 2. How AcquisitionOS is containerized

The chain of facts that make the image work:

1. `next.config.ts` sets **`output: 'standalone'`** → `next build` produces `.next/standalone/` — a self-contained server (`server.js` + traced `node_modules` + compiled `.next`), no full `node_modules` needed at runtime.
2. `package.json` build script: `prisma generate && next build && node scripts/clean-standalone.js` — generates the Prisma client, builds Next.js, then whitelists the standalone output (removes `.env*`, docs, scripts, etc. that Next traces by accident).
3. The `Dockerfile` (node:20-alpine) builds with `npm ci`, then copies `standalone + static + public + prisma + .prisma client` into a **non-root** runner stage that exposes **3000** and runs `node server.js`.
4. `HEALTHCHECK` probes `GET /api/health` (unauthenticated, DB + memory + error counts) every 30 s.

### 2.1 The existing `Dockerfile`, explained block by block

```dockerfile
FROM node:20-alpine AS builder          # Stage 1: full toolchain
RUN apk add --no-cache libc6-compat     # native-module support (sharp/swc)
WORKDIR /app
COPY package.json package-lock.json .npmrc ./   # ⚠️ .npmrc MUST EXIST — see §3
COPY prisma ./prisma/                   # schema present before postinstall
RUN npm ci --ignore-scripts             # exact deps; skip postinstall race
RUN npx prisma generate                 # generate Prisma client explicitly
COPY . .                                # ⚠️ requires .dockerignore — see §3
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
ENV NODE_OPTIONS="--max-old-space-size=4096"   # prevents OOM during next build
RUN npm run build                       # prisma generate && next build && clean-standalone

FROM node:20-alpine AS runner           # Stage 2: minimal runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME="0.0.0.0"
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
RUN mkdir -p /app/data && chown nextjs:nodejs /app/data   # writable data dir
USER nextjs                             # non-root (security)
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1
CMD ["node", "server.js"]
```

Key properties to keep intact if you ever edit it: standalone copy (not full app), non-root `USER`, `HOSTNAME=0.0.0.0`, explicit Prisma client copy, health check on `/api/health`.

---

## 3. Before your first build: two required files

The repo currently **lacks** both files below. The Dockerfile and safe builds depend on them. Create them at the repository root (they are gitignored-adjacent config, safe to commit — they contain no secrets).

### 3.1 `.npmrc` — REQUIRED or `docker build` fails immediately

The builder copies `.npmrc`, which does not exist yet → `COPY` errors out. It must enable legacy peer resolution because `next-auth@4` (a vestigial dependency) declares a peer range that conflicts with `nodemailer@8`:

```ini
# .npmrc — required for npm ci to resolve peer-dependency conflicts
legacy-peer-deps=true
```

**Why:** without it `npm ci` aborts with `ERESOLVE`. **Verify:** the build reaches `npx prisma generate`.

### 3.2 `.dockerignore` — REQUIRED for safe, fast builds

Without it, `COPY . .` ships the **entire build context** into the builder: local `node_modules` (gigabytes, wrong platform), `.env` (**your secrets**), databases, logs, screenshots. Add:

```text
# .dockerignore — keep build context minimal and secret-free
node_modules
.next
.git
.env
.env.*
!.env.example
*.log
dev.log
db/
*.db
docs/
download/
scripts/pentest/
scripts/interview-expansion/
monitoring/
deploy/
mini-services/
agent-ctx/
*.png
*.pdf
tsc-fix/
tsc-*.json
tsc-*.done
worklog.md
server.pid
Dockerfile*
docker-compose*
Caddyfile
nginx*.conf
Makefile
```

**Why it matters:** secrets must enter the container through runtime environment variables (cloud secret manager), never through the build context. The build post-processor (`scripts/clean-standalone.js`) further strips `.env*` from the standalone output — so the platform's injected env vars are the only configuration path.

> Note: `clean-standalone.js` contains a whitelist for the sandbox/FC platform that *keeps* a sanitized `.env` if one is present in standalone output. On the clouds in this handbook you deploy **without** a baked `.env` — env vars come from the platform. That is the safer default.

---

## 4. Building the image locally

```bash
cd /path/to/acquisitionos

# Build. Tag with the git SHA for traceability.
export GIT_SHA=$(git rev-parse --short HEAD)
docker build -t acquisitionos:${GIT_SHA} -t acquisitionos:latest .
```

What to expect: 3–10 minutes (npm ci is the longest step). Successful final line: `naming to ...acquisitionos:<sha>`.

**If the build fails:**

| Error | Cause | Fix |
| --- | --- | --- |
| `COPY failed: ... .npmrc: not found` | §3.1 not done | create `.npmrc` |
| `ERESOLVE` in `npm ci` | `.npmrc` missing `legacy-peer-deps=true` | fix `.npmrc` |
| Build OOM / `Killed` | memory cap during `next build` | keep `NODE_OPTIONS=--max-old-space-size=4096` or raise Docker Desktop memory |
| `prisma generate` cannot find schema | `prisma/` not copied before `npm ci` | keep the `COPY prisma ./prisma/` line order |

---

## 5. Testing the container locally

```bash
# Minimal smoke run (DB unreachable → /api/health reports database:unhealthy, that's OK)
docker run --rm -p 3000:3000 \
  -e NODE_ENV=production \
  -e JWT_SECRET=$(openssl rand -hex 32) \
  -e DATABASE_URL="file:./db/custom.db" \
  acquisitionos:latest

curl -i http://localhost:3000/api/health
# expect HTTP 200 with JSON; "database" may be unhealthy without a real DB — check the JSON parses

# Realistic run against local Postgres (docker compose style)
docker network create aos-net
docker run -d --name aos-pg --network aos-net \
  -e POSTGRES_PASSWORD=YOUR_DB_PASSWORD -e POSTGRES_DB=acquisitionos postgres:16
docker run --rm -p 3000:3000 --network aos-net \
  -e NODE_ENV=production \
  -e JWT_SECRET=$(openssl rand -hex 32) \
  -e DATABASE_URL="postgresql://postgres:YOUR_DB_PASSWORD@aos-pg:5432/acquisitionos" \
  acquisitionos:latest
```

**Verify before moving on:** `/api/health` returns 200; `database.status` is `healthy`; the app loads in a browser.

---

## 6. Production hygiene

### 6.1 Environment variables & secrets

- Provide **everything at runtime** (`-e`, task definition, Cloud Run YAML, Container Apps secrets) — see [`02-environment-variables-and-secrets.md`](./02-environment-variables-and-secrets.md).
- Never `ENV SECRET=...` in a Dockerfile; image registries are effectively public to everyone with pull access.
- `NEXT_PUBLIC_APP_URL` is build-time: rebuild the image when it changes.

### 6.2 Prisma inside the image

- The image contains the generated client + `prisma/` schema. It does **not** auto-migrate at boot.
- Run migrations as a **separate step** after deploy: `npx prisma db push --schema=prisma/schema.production.prisma` (or `migrate deploy`) from CI or a one-off job — see [`04-database-production.md`](./04-database-production.md).

### 6.3 Image tagging & scanning

```bash
docker tag acquisitionos:${GIT_SHA} REGISTRY_HOST/YOUR_PROJECT/acquisitionos:${GIT_SHA}
# Scan before push (any one of):
docker scout cves acquisitionos:${GIT_SHA}        # Docker Desktop
trivy image acquisitionos:${GIT_SHA}              # Aqua Trivy (brew install trivy)
```

Patch base images regularly (`node:20-alpine` → current patch) and rebuild; registry scanning (Artifact Registry / ECR / ACR) adds a second layer of detection.

### 6.4 Pushing to registries

| Cloud | Registry | Login example |
| --- | --- | --- |
| GCP | Artifact Registry | `gcloud auth configure-docker REGION-docker.pkg.dev` |
| AWS | ECR | `aws ecr get-login-password --region REGION \| docker login --username AWS --password-stdin ACCOUNT.dkr.ecr.REGION.amazonaws.com` |
| Azure | ACR | `az acr login --name YOUR_REGISTRY` |
| Cloudflare | Workers build (no classic registry) or any registry the adapter pulls from | see `cloudflare/` guide |

Push both tags:

```bash
docker push REGISTRY_HOST/YOUR_PROJECT/acquisitionos:${GIT_SHA}
docker push REGISTRY_HOST/YOUR_PROJECT/acquisitionos:latest
```

---

## 7. docker-compose (local full-stack)

The repo's `docker-compose.yml` is a local convenience (app + Postgres + optional monitoring). Read it before use; treat it as **development** scaffolding, not a production topology — production uses the managed services in each cloud guide.

---

## 8. Docker troubleshooting quick table

| Symptom | Cause | Diagnosis | Fix | Prevention |
| --- | --- | --- | --- | --- |
| Build fails at `COPY ... .npmrc` | file missing (§3.1) | `ls -la .npmrc` | create it | keep it committed |
| Container exits instantly | env var missing (e.g. `DATABASE_URL`) | `docker logs CONTAINER` | add required env | verify with `/api/health` in CI |
| `502` from platform | app crashed or health check failing | `docker logs`, platform logs | fix root cause | always run image locally first |
| Health check flapping after deploy | `--start-period` too short for cold start | timing in logs | keep `start-period=40s` | provision small instance ≥1 vCPU |
| Image huge (>2 GB) | `.dockerignore` missing (§3.2) | `docker history IMAGE` | add `.dockerignore` | keep context minimal |
| `Cannot find module '@prisma/client-...'` | Prisma client not externalized | check `next.config.ts` `serverExternalPackages` | don't remove the entry | documented in next.config comments |
