# AcquisitionOS — Multi-Cloud Deployment Handbook

**Audience:** engineers and operators deploying AcquisitionOS to production, **including readers with little or no prior cloud/infrastructure experience**.

**Scope:** Google Cloud Platform (GCP), Amazon Web Services (AWS), Microsoft Azure, and Cloudflare — covering local preparation → cloud account → infrastructure → database → secrets → deployment → DNS → SSL → CI/CD → monitoring → backups → security → scaling → rollback → troubleshooting → production maintenance.

> **This handbook describes the real application.** Every architectural statement here was verified by inspecting this repository (framework, scripts, Prisma schema, auth implementation, API routes, environment variables) at the time of writing. When something is **not** part of AcquisitionOS today, it is explicitly labeled `OPTIONAL` or `FUTURE/ALTERNATIVE` — never presented as a requirement.

---

## 1. What you are deploying (the 60-second version)

AcquisitionOS is a **single Next.js 16 application** that contains **both the website (frontend) and the API (backend)** in one deployable unit:

```text
Browser / Mobile
      │  HTTPS
      ▼
DNS  (app.yourdomain.com)
      │
      ▼
TLS-terminating edge (cloud load balancer / CDN)
      │
      ▼
Next.js 16 standalone Node.js container  ← ONE service, port 3000
  ├── React UI (server-rendered + client)
  ├── REST API  (/api/** route handlers)
  ├── SSE streams (/api/events/**) — real-time updates
  └── cron endpoints (/api/cron/**, Bearer-protected)
      │
      ├──► PostgreSQL (managed service)   ← REQUIRED (Prisma ORM)
      ├──► SMTP or Resend                 ← REQUIRED for email auth (OTP / magic link)
      ├──► Stripe / Razorpay              ← REQUIRED for billing (webhooks come INBOUND)
      ├──► Google OAuth + Gmail/Calendar  ← REQUIRED for those features
      ├──► AI provider                    ← REQUIRED in production (OpenAI / Anthropic / OpenRouter key)
      └──► Redis, object storage          ← OPTIONAL
```

Key consequences that drive every guide in this handbook:

| Fact | Why it matters for deployment |
| --- | --- |
| One Next.js container serves UI **and** API | You deploy **one** service per cloud, not a separate frontend and backend. |
| Production database is **PostgreSQL** via Prisma (`prisma/schema.production.prisma`) | Dev uses SQLite; production must point `DATABASE_URL` at a managed PostgreSQL service. |
| Auth is **custom JWT** (`JWT_SECRET`), plus Google OAuth and email (OTP/magic link) | `JWT_SECRET`, `APP_PUBLIC_URL`/`NEXT_PUBLIC_APP_URL`, and SMTP credentials are mandatory. |
| Public URLs are derived from proxy headers **and** `APP_PUBLIC_URL` (`src/lib/app-url.ts`) | Your load balancer must preserve `Host` + `X-Forwarded-Proto`, and you must set the public URL env var. |
| Real-time updates use **SSE** (long-lived HTTP, 15–30 s heartbeats) | Load balancer idle timeout must be ≥ 120 s; response buffering must be disabled for `/api/events/*`; use ≥ 1 minimum instance. |
| Scheduled jobs are **HTTP endpoints** protected by `Bearer CRON_SECRET` | Every cloud needs an external scheduler (Cloud Scheduler / EventBridge / Functions timer / Cron Triggers). There is **no** in-app scheduler. |
| Uploads are written to the container filesystem (`public/…`) | Containers are ephemeral → plan a volume or object storage strategy (`OPTIONAL` but recommended). |

---

## 2. How to use this handbook

If you are starting from zero, read in this order:

1. **`00-prerequisites.md`** — every tool and concept you need (domain, DNS, cloud account, CLI, Git, Docker, Terraform, Node, secrets, TLS, IAM), each explained as *what → why → install → verify → example*.
2. **`01-architecture.md`** — the verified AcquisitionOS architecture and a factual comparison of the four deployment approaches.
3. **`02-environment-variables-and-secrets.md`** — the complete environment variable inventory with per-variable guidance (required/optional, secret/non-secret, browser-safe or not).
4. **`03-docker.md`** — how AcquisitionOS is containerized (multi-stage Dockerfile, `.npmrc` warning, local testing, registry push).
5. **`04-database-production.md`** — moving from dev SQLite to production PostgreSQL, Prisma migrations, pooling, backups, restore testing.
6. **`05-cicd.md`** — GitHub Actions pipelines, branch strategy, environment protection, deployment verification.
7. **`06-dns-and-domains.md`** — domains, DNS record types, propagation, apex vs `www`, the `app.` / `api.` pattern (and why AcquisitionOS usually needs only one host).
8. **The guide for your chosen cloud** — `gcp/`, `aws/`, `azure/`, or `cloudflare/`. Start at its `README.md` and follow `manual-deployment.md` first; use `terraform.md` once the manual flow makes sense.

---

## 3. Folder map

```text
docs/deployment/
├── README.md                              ← you are here (entry point + platform comparison)
├── 00-prerequisites.md                    ← tools & concepts from zero
├── 01-architecture.md                     ← verified app architecture + 4-cloud comparison
├── 02-environment-variables-and-secrets.md← complete env var inventory
├── 03-docker.md                           ← containerization guide
├── 04-database-production.md              ← PostgreSQL + Prisma in production
├── 05-cicd.md                             ← CI/CD pipeline patterns (GitHub Actions)
├── 06-dns-and-domains.md                  ← DNS, domains, SSL basics
├── gcp/       → Google Cloud Platform guide  (18 files, start at gcp/README.md)
├── aws/       → Amazon Web Services guide    (18 files, start at aws/README.md)
├── azure/     → Microsoft Azure guide        (18 files, start at azure/README.md)
└── cloudflare/→ Cloudflare guide             (18 files, start at cloudflare/README.md)
```

Each cloud folder contains:

| File | Contents |
| --- | --- |
| `README.md` | Cloud entry point, component map, architecture diagram, **end-to-end deployment checklist** |
| `architecture.md` | How AcquisitionOS maps onto that cloud's services |
| `prerequisites.md` | Cloud-account, billing, CLI, and quota setup specific to that platform |
| `manual-deployment.md` | Complete click-by-click + command-by-command production deployment |
| `terraform.md` | Infrastructure as Code: basics, project structure, state, variables, CI/CD safety |
| `networking.md` | VPC/network, load balancer, SSE-timeout and header requirements |
| `database.md` | Managed PostgreSQL setup on that cloud (creation, SSL, pooling, migrations) |
| `secrets.md` | The cloud's secret manager and how to store every AcquisitionOS variable |
| `frontend.md` | Serving the Next.js UI (build-time vs runtime variables, CDN, caching) |
| `backend.md` | Running the API side of the same container (health checks, timeouts, scaling) |
| `dns-ssl.md` | Cloud DNS + managed certificates for the app domain |
| `cicd.md` | GitHub Actions deployment for that cloud + environment protection |
| `monitoring.md` | Logs, metrics, alerts, dashboards for that cloud |
| `backups.md` | Database backups, PITR, restore testing, DR checklist |
| `security.md` | IAM, least privilege, network security, secrets handling, what never goes in Git |
| `scaling.md` | Horizontal/vertical scaling, SSE constraints, database scaling |
| `rollback.md` | Application vs database vs infrastructure rollback |
| `troubleshooting.md` | Symptom → Cause → Diagnosis → Fix → Prevention for common failures |

---

## 4. Deployment components required by AcquisitionOS

Verified against the current repository:

| Component | Status | Used by AcquisitionOS for | Where to configure |
| --- | --- | --- | --- |
| Node.js 20 runtime (container) | **REQUIRED** | The Next.js standalone server | `Dockerfile` (see `03-docker.md`) |
| PostgreSQL 14+ | **REQUIRED** | All application data via Prisma (53+ models) | `DATABASE_URL`, `DIRECT_URL` |
| Secret storage | **REQUIRED** | `JWT_SECRET`, DB password, payment/AI keys | Cloud secret manager (`secrets.md`) |
| TLS certificate | **REQUIRED** | All traffic; auth cookies are `secure` in production | `dns-ssl.md` |
| Outbound email (SMTP **or** Resend) | **REQUIRED** for email auth | OTP, magic link, verification, password reset, invoice/notification emails | `SMTP_*` or `RESEND_API_KEY` |
| Payment provider | **REQUIRED** for billing | Stripe (cards/subscriptions) and/or Razorpay (UPI/India) | `STRIPE_*`, `RAZORPAY_*` + `/api/payments/webhook/stripe` · `/api/payments/webhook/razorpay` |
| Google OAuth credentials | **REQUIRED** for Google sign-in / Gmail / Calendar | OAuth 2.0 consent + redirect URIs | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |
| AI provider key | **REQUIRED** in external production | Lead analysis, outreach generation, chat, workflows | `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `OPENROUTER_API_KEY` |
| External scheduler | **REQUIRED** for background jobs | 12+ `/api/cron/*` endpoints (Bearer `CRON_SECRET`) | Cloud Scheduler / EventBridge / Functions timer / Cron Triggers |
| Webhook ingress | **REQUIRED** for billing | Stripe → `POST /api/payments/webhook/stripe`; Razorpay → `POST /api/payments/webhook/razorpay` | Public HTTPS endpoint |
| Redis | `OPTIONAL` | Cross-instance SSE fan-out via `REDIS_URL`; absent → single-process bus | Managed Redis (Memorystore / ElastiCache / Azure Cache / Upstash) |
| Object storage | `OPTIONAL` | Durable storage for `public/` uploads & invoices | GCS / S3 / Azure Blob / R2 |
| Pub/Sub for Gmail push | `OPTIONAL` (feature-level) | Push-based Gmail reply ingestion (`GMAIL_PUBSUB_*`) | Google Cloud Pub/Sub + `/api/gmail/pubsub/webhook` |
| Web Push keys | `OPTIONAL` | Browser push notifications | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` |
| Kubernetes | `FUTURE/ALTERNATIVE` | Not required; `deploy/k8s/*` in the repo contains legacy templates that do **not** match the current Next.js app | — |
| Message queue (SQS/Pub/Sub queues/Service Bus/Queues) | `FUTURE/ALTERNATIVE` | AcquisitionOS runs jobs in-process + HTTP cron today | — |

---

## 5. Platform decision table

No platform is universally "best". Each is a reasonable home for AcquisitionOS; they differ in operational model, managed-database experience, real-time (SSE) behavior, and ecosystem fit.

| Platform | Frontend (Next.js UI) | Backend (API routes) | Database | IaC | CI/CD | Best use |
| --- | --- | --- | --- | --- | --- | --- |
| **GCP** | Cloud Run container (serves UI + API together) | Same Cloud Run service (`/api/**`) | Cloud SQL for PostgreSQL (Private IP optional) | Terraform (`google` provider) | Cloud Build or GitHub Actions → Cloud Run | Simplest fully-managed container path; native fit for the Gmail Pub/Sub push integration; scale-to-zero with min-instances for SSE |
| **AWS** | ECS Fargate task behind an ALB (UI + API in one image) | Same ECS service (`/api/**`) | RDS PostgreSQL (+ RDS Proxy for pooling) | Terraform (`aws` provider; repo already ships `deploy/terraform/main.tf`) | GitHub Actions → ECR → ECS deploy | Fine-grained networking control, mature RDS, aligns with the Terraform already in the repository |
| **Azure** | Azure Container Apps (UI + API in one container) | Same Container App (`/api/**`) | Azure Database for PostgreSQL Flexible Server | Terraform (`azurerm` provider) | GitHub Actions → ACR → Container Apps | Strong enterprise/identity integration; Key Vault + Managed Identity removes long-lived cloud credentials from CI |
| **Cloudflare** | Workers via the OpenNext adapter (`@opennextjs/cloudflare`) serving UI + API | Same Worker (with Node-compat limits — see guide) | **Keep external PostgreSQL** via Hyperdrive (do **not** migrate to D1) | Terraform (`cloudflare` provider) | `wrangler deploy` via GitHub Actions | Lowest latency edge delivery and simple all-in-one billing; most adapter constraints of the four — read `cloudflare/architecture.md` carefully |

Trade-off notes (factual, not ranked):

- **Operational surface:** Cloud Run and Container Apps are the smallest managed surfaces (one container + one database). ECS Fargate exposes more primitives (VPC, subnets, ALB, target groups) — more control, more to configure. Cloudflare Workers removes servers entirely but introduces an adapter layer between Next.js and the runtime.
- **SSE (real-time):** All four can stream SSE. Cloud Run needs `min-instances=1` and CPU always-allocated; ALB needs its idle timeout raised; Front Door needs route-level buffering disabled; Cloudflare Workers supports streaming responses with per-plan duration limits — each guide details the exact settings.
- **Gmail push integration:** AcquisitionOS consumes Google Cloud Pub/Sub notifications for Gmail. On GCP this is same-ecosystem; on the others you simply create a GCP project for Pub/Sub (or fall back to cron-driven polling via `/api/gmail/jobs/process`) — covered in each guide.
- **Database portability:** All four keep the same PostgreSQL + Prisma code; only the connection string changes. Cloudflare additionally offers Hyperdrive pooling for external Postgres.
- **Cost shape:** Cloud Run/Container Apps scale to (near) zero when idle; ECS Fargate tasks bill while running; RDS/Cloud SQL/Flexible Server bill continuously; Workers has a generous free tier then usage-based pricing. See each guide's "Cost considerations" — this handbook deliberately does not quote prices.

---

## 6. The common deployment flow (every cloud)

```text
 1. Buy a domain (any registrar)                       → 06-dns-and-domains.md
 2. Create cloud account + billing alerts             → <cloud>/prerequisites.md
 3. Create managed PostgreSQL + record connection     → 04-database-production.md, <cloud>/database.md
 4. Produce secrets (JWT_SECRET, passwords, keys)     → 02-environment-variables-and-secrets.md, <cloud>/secrets.md
 5. Build & push the container image                  → 03-docker.md, <cloud>/manual-deployment.md
 6. Deploy the container (manual first)               → <cloud>/manual-deployment.md
 7. Run Prisma migrations against production DB       → 04-database-production.md
 8. Wire DNS + managed TLS certificate                → 06-dns-and-domains.md, <cloud>/dns-ssl.md
 9. Register webhooks (Stripe/Razorpay/Gmail/Telegram) → <cloud>/backend.md
10. Schedule the cron endpoints (CRON_SECRET)         → <cloud>/cicd.md (scheduler section)
11. Verify health + login + one real workflow         → <cloud>/README.md checklist
12. Set up CI/CD, monitoring, backups, alerts         → 05-cicd.md, <cloud>/monitoring.md, <cloud>/backups.md
```

Steps 1–11 produce a working production deployment **without** any CI/CD. Step 12 automates it.

---

## 7. Labeling convention used throughout

- **`REQUIRED FOR CURRENT ACQUISITIONOS`** — the application genuinely needs this; deployment will be broken or degraded without it.
- **`OPTIONAL`** — a real integration point exists in the code, but the app degrades gracefully without it (e.g., Redis, object storage, VAPID push, Gmail Pub/Sub).
- **`FUTURE/ALTERNATIVE`** — not used by the current code; documented only as a possible evolution (e.g., Kubernetes, message queues). Never a prerequisite.

When a value could not be verified from the repository or official documentation, the docs say **`NEEDS VERIFICATION`** instead of guessing.

---

## 8. Conventions

- **Placeholders:** `YOUR_PROJECT_ID`, `app.yourdomain.com`, `YOUR_SECRET_HERE` — every value you must replace is written in this style, with a note on where to obtain it.
- **No secrets in Git:** `.env*`, credentials, tokens, and private keys must never be committed (`.gitignore` already excludes `.env*`). Real secrets live in the cloud secret manager of your platform.
- **No invented infrastructure:** if a component appears in a guide, it is either labeled per the convention above or verified in the code.
- **Commands are copy-pasteable** but clearly mark the lines you must customize (`export PROJECT_ID="YOUR_PROJECT_ID"`).
- **Official documentation first:** every cloud guide ends with an *Official Documentation* section linking the platform's own docs, which are the source of truth when behavior changes.

---

## 9. Quick links

- Beginner starting point → [`00-prerequisites.md`](./00-prerequisites.md)
- "How does the app actually work?" → [`01-architecture.md`](./01-architecture.md)
- "What env vars do I need?" → [`02-environment-variables-and-secrets.md`](./02-environment-variables-and-secrets.md)
- "Give me the exact steps for my cloud" → [`gcp/README.md`](./gcp/README.md) · [`aws/README.md`](./aws/README.md) · [`azure/README.md`](./azure/README.md) · [`cloudflare/README.md`](./cloudflare/README.md)
- "I deployed and something is broken" → the `troubleshooting.md` in your cloud folder
