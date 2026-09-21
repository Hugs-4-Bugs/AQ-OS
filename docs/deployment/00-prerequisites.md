# Prerequisites — Everything You Need Before Deploying

This chapter assumes you are starting from almost zero. Every tool and concept is explained the same way:

> **What is it? → Why does AcquisitionOS need it? → How do you install it? → How do you verify it? → Example command**

Work through this once, on the machine you will deploy from (your laptop is fine). You do **not** need all four cloud CLIs — install the one(s) matching the platform you chose.

---

## 1. A domain name

**What is it?** The human-readable address users type, e.g. `yourdomain.com`. You buy (register) it from a *registrar* such as Namecheap, GoDaddy, Cloudflare Registrar, or your cloud provider's registrar.

**Why AcquisitionOS needs it:** magic-link emails, OTP links, Google OAuth redirect URIs, Stripe success/cancel URLs, and webhook targets are all built from your public URL (`src/lib/app-url.ts`). A stable domain is the anchor for all of them.

**How to get one:** search for a name at any registrar, pay the annual fee (typically the cost of a coffee per year), and confirm ownership via the registrar's email flow.

**Verify:** whois or the registrar dashboard shows you as the registrant.

```bash
# Example: check that the domain resolves (after you add DNS records later)
dig app.yourdomain.com +short
```

Placeholders used in this handbook: `yourdomain.com` (your domain), `app.yourdomain.com` (where the app is served). **Never** enter a real password or secret anywhere in a registrar UI you do not trust.

---

## 2. DNS basics

**What is it?** The Domain Name System converts names (`app.yourdomain.com`) into addresses (IPs or other names) using *records*. The main record types you will touch:

| Record | Maps | You use it for |
| --- | --- | --- |
| `A` | name → IPv4 address | Pointing `app.yourdomain.com` at a load balancer IP |
| `AAAA` | name → IPv6 address | Same as A, for IPv6 |
| `CNAME` | name → another name | Pointing `www` at `app`, or cloud-assigned hostnames |
| `TXT` | name → text | Domain-ownership verification, SPF (anti-spoofing for your email) |
| `MX` | name → mail servers | Only if you receive email on your domain |

**Why AcquisitionOS needs it:** users reach the app via DNS; email deliverability of OTP/magic-link messages depends on SPF (a TXT record) for your sending domain.

**Concepts to know:** every DNS change has a **TTL** (time-to-live, how long resolvers cache it). Lower TTL (300 s) while setting up; raise it once stable. **Propagation** — resolvers worldwide pick up changes within minutes to hours.

**Verify:**

```bash
dig app.yourdomain.com            # A record lookup
dig app.yourdomain.com CNAME      # CNAME lookup
dig TXT yourdomain.com            # verification / SPF records
```

Deep dive: [`06-dns-and-domains.md`](./06-dns-and-domains.md).

---

## 3. A cloud account (+ billing alerts)

**What is it?** An account on GCP / AWS / Azure / Cloudflare that lets you create resources.

**Why AcquisitionOS needs it:** one platform hosts the container, the database, the secrets, and the scheduler.

**How to set up:**

1. Sign up at the provider (credit card or invoice billing required for most services).
2. **Create a billing alert immediately.** This is the single most important beginner step — it prevents surprise bills.
   - GCP: Billing → Budgets & alerts → budget `YOUR_BUDGET`, alert at 50/90/100%.
   - AWS: Billing → Budgets → Create budget → Cost budget.
   - Azure: Cost Management + Billing → Budgets.
   - Cloudflare: Workers & Pages → usage notifications; account-level spend limits.
3. Enable multi-factor authentication (MFA) on the root/user account.
4. Each cloud guide's `prerequisites.md` walks through project/subscription/account creation specifics.

**Verify:** you can open the provider's console and see an empty (or near-empty) dashboard, and a budget alert exists.

---

## 4. Git

**What is it?** Distributed version control. AcquisitionOS is developed and shipped from Git; CI/CD pipelines are triggered by Git pushes to GitHub.

**Why AcquisitionOS needs it:** deployments build from a Git checkout; the CI/CD chapter uses GitHub Actions; rollback means redeploying a previous Git commit/image tag.

**Install:**

```bash
# Debian/Ubuntu
sudo apt update && sudo apt install -y git
# macOS (Homebrew)
brew install git
# Windows: https://git-scm.com/download/win
```

**Verify & configure:**

```bash
git --version                 # git version 2.x
git config --global user.name "Your Name"
git config --global user.email "you@example.com"
```

**Example:**

```bash
git clone https://github.com/YOUR_ORG/YOUR_REPO.git
cd YOUR_REPO && git log --oneline -3
```

---

## 5. Node.js 20 + npm

**What is it?** Node.js runs JavaScript outside the browser; npm is its package manager.

**Why AcquisitionOS needs it:** the app is Next.js 16 on Node 20 (`Dockerfile` uses `node:20-alpine`); you need Node locally to install dependencies, run Prisma, and produce builds.

**Install (use Node 20 LTS):**

```bash
# nvm (recommended — lets you pin versions)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
# restart your shell, then:
nvm install 20 && nvm use 20
```

**Verify:**

```bash
node -v    # v20.x
npm -v     # 10.x
```

**Example (inside the repo):**

```bash
npm ci                      # install exact dependency versions (needs package-lock.json)
npx prisma generate         # generate the Prisma client from prisma/schema.prisma
```

> Note: the repository also contains a `bun.lock`, but the production Docker path uses **npm** (`npm ci`) — stay with npm for deployment work.

---

## 6. Docker

**What is it?** A tool that builds and runs **containers** — portable, immutable packages of your app + its runtime. Clouds accept container images almost universally.

**Why AcquisitionOS needs it:** every cloud guide deploys the app as a container built from the repo's `Dockerfile` (Next.js standalone output). See [`03-docker.md`](./03-docker.md).

**Install:** Docker Desktop (macOS/Windows) or Docker Engine (Linux) — https://docs.docker.com/engine/install/

**Verify:**

```bash
docker --version          # Docker version 2x
docker run hello-world    # pulls and runs a test image
```

**Example (build AcquisitionOS locally):**

```bash
docker build -t acquisitionos:local .
docker run --rm -p 3000:3000 --env-file .env acquisitionos:local
# open http://localhost:3000/api/health
```

---

## 7. Terraform

**What is it?** Infrastructure-as-Code (IaC): you describe cloud resources in `.tf` files; Terraform creates/updates/destroys them predictably.

**Why AcquisitionOS needs it:** optional but recommended for repeatable environments (dev/staging/prod). The AWS guide aligns with the existing `deploy/terraform/main.tf` in this repository; other clouds get equivalent Terraform in their guides.

**Install:** https://developer.hashicorp.com/terraform/install

```bash
# Debian/Ubuntu (HashiCorp repo) — see official page for current instructions
# macOS
brew tap hashicorp/tap && brew install hashicorp/tap/terraform
```

**Verify:**

```bash
terraform -version        # Terraform v1.x
```

**Example:**

```bash
cd terraform/environments/dev
terraform init      # download providers
terraform plan      # preview changes — NEVER skip
terraform apply     # create resources (type "yes")
```

Fundamentals (state, variables, modules, when **not** to `destroy`) are covered per-cloud in `gcp/terraform.md`, `aws/terraform.md`, `azure/terraform.md`, `cloudflare/terraform.md`.

---

## 8. Cloud CLI tools (install the one you need)

You do **not** need all of these. Each cloud guide repeats the relevant install.

| CLI | For | Verify |
| --- | --- | --- |
| `gcloud` | GCP | `gcloud --version` |
| `aws` (v2) | AWS | `aws --version` |
| `az` | Azure | `az --version` |
| `wrangler` | Cloudflare | `wrangler --version` (run via `npx wrangler --version` is fine) |

**Example — authenticating (GCP):**

```bash
gcloud auth login                     # browser sign-in
gcloud config set project YOUR_PROJECT_ID
```

**Example — authenticating (AWS):**

```bash
aws configure
# AWS Access Key ID:     YOUR_ACCESS_KEY_ID
# AWS Secret Access Key: YOUR_SECRET_ACCESS_KEY
# Default region name:   us-east-1
```

**Principle:** CLI credentials live in your home directory (`~/.config/gcloud`, `~/.aws`) — never commit them, never put them in `.env` of the app.

---

## 9. Database CLI (psql)

**What is it?** The PostgreSQL command-line client — the standard tool for connecting to your production database to run checks.

**Why AcquisitionOS needs it:** verifying connectivity, SSL, and running read-only queries during troubleshooting. Prisma itself handles migrations.

**Install:**

```bash
# Debian/Ubuntu
sudo apt install -y postgresql-client
# macOS
brew install libpq && brew link --force libpq
```

**Verify & example:**

```bash
psql --version
psql "postgresql://USER:PASSWORD@HOST:5432/DBNAME?sslmode=require" -c "SELECT version();"
```

> `sslmode=require` matters: production databases must be connected over TLS. Cloud consoles give you the exact connection string (password goes in your secret manager, not in shell history — prefer `psql` with a connection *URL from an environment variable*).

---

## 10. SSH (only for VM-based troubleshooting)

**What is it?** Secure Shell — encrypted remote terminal access to servers.

**Why AcquisitionOS *may* need it:** the primary deployment is fully managed (containers) and needs no SSH. It is used only if you choose VM-based hosting (the repo ships `deploy/ec2/`) or need to debug a bastion. `OPTIONAL`.

**Install:** preinstalled on macOS/Linux; Windows has OpenSSH client built in.

**Verify & example:**

```bash
ssh -V
ssh -i ~/.ssh/YOUR_KEY.pem ubuntu@YOUR_SERVER_IP
```

Keys: `ssh-keygen -t ed25519` creates `~/.ssh/id_ed25519` (private — never share) and `.pub` (public — upload to your cloud).

---

## 11. Environment variables & secrets

**What is it?** Configuration passed to a program as `NAME=value` pairs. *Secrets* are the subset that must stay confidential (passwords, keys).

**Why AcquisitionOS needs it:** `DATABASE_URL`, `JWT_SECRET`, `SMTP_PASSWORD`, payment and AI keys are all environment variables. The full inventory lives in [`02-environment-variables-and-secrets.md`](./02-environment-variables-and-secrets.md).

**Local usage:**

```bash
# .env at the project root (gitignored — .gitignore already excludes .env*)
DATABASE_URL="postgresql://..."
JWT_SECRET="YOUR_SECRET_HERE"
```

**The three rules:**

1. `.env` files are for **local development only** — never commit, never ship in the image.
2. Production values go into the cloud's **secret manager** and are injected at runtime.
3. Anything with `NEXT_PUBLIC_` in the name is embedded into browser-visible JavaScript — it must **never** hold a secret.

**Verify:** `printenv | grep DATABASE_URL` after exporting, or start the app and check `GET /api/health`.

---

## 12. TLS / SSL (HTTPS)

**What is it?** TLS (successor of SSL) encrypts traffic between browsers and your app; certificates prove your domain's identity.

**Why AcquisitionOS needs it:** auth cookies are flagged `secure` when `NODE_ENV=production` (they are only sent over HTTPS); Google OAuth requires `https` redirect URIs; browsers flag non-HTTPS logins as unsafe.

**What you will actually do:** use your cloud's **managed certificate** (Google Certificate Manager, AWS ACM, Azure Front Door managed certs, Cloudflare Universal SSL) — you request a cert for `app.yourdomain.com`, prove domain ownership via a DNS record, and the cloud renews it automatically. No manual OpenSSL needed.

**Verify:** `curl -I https://app.yourdomain.com/api/health` shows a 200 and a valid certificate chain (no `-k` flag needed).

---

## 13. Container registry

**What is it?** Storage for built container images, versioned by tags — GCR/Artifact Registry (GCP), ECR (AWS), ACR (Azure), CF registry (Cloudflare).

**Why AcquisitionOS needs it:** you build the image once (CI or locally), push it to the registry, and the cloud runs *that exact image*. Rollback = redeploy an older tag.

**Example flow (naming is cloud-specific; concepts identical):**

```bash
docker build -t REGISTRY/acquisitionos:GIT_SHA .
docker push REGISTRY/acquisitionos:GIT_SHA
```

**Verify:** the image appears in your registry console with the tag you pushed.

---

## 14. IAM and least privilege

**What is it?** Identity & Access Management — who (user, service, pipeline) can do what (permission) on which resource. *Least privilege* = grant the minimum permissions needed, nothing more.

**Why AcquisitionOS needs it:**

- Your **deploy pipeline** needs permission to push images and update the running service — not to delete databases.
- The **app runtime** needs permission to read its secrets (and, on GCP, to receive Pub/Sub pushes) — nothing else.
- **You** as administrator should use an admin identity only for setup, not day-to-day.

**How it appears per cloud:** GCP *service accounts* + roles; AWS *IAM roles/policies* (the app task role vs the deploy role are different roles); Azure *managed identities* + RBAC; Cloudflare *API tokens* scoped to specific permissions.

**Beginner rules that prevent disasters:**

1. Never do daily work as the root/account owner.
2. Give CI/CD a dedicated credential scoped to deploy-only (see `05-cicd.md`).
3. Prefer **roles attached to the workload** (service account/managed identity/task role) over long-lived keys baked into env vars.
4. Audit quarterly: every key/credential should still have a purpose.

---

## 15. Pre-flight checklist

```text
[ ] Domain purchased and registrar access working
[ ] Cloud account created, MFA enabled, billing alert configured
[ ] Git installed, repo cloned, git status clean
[ ] Node 20 + npm working (node -v → v20.x)
[ ] Docker installed and running (docker run hello-world works)
[ ] npm ci && npx prisma generate succeed in the repo
[ ] Cloud CLI installed and authenticated (the one for your platform)
[ ] psql installed (for database checks)
[ ] Read 02-environment-variables-and-secrets.md and know which secrets you must create
[ ] Terraform installed (only if you plan to use the IaC path)
```

Next: [`01-architecture.md`](./01-architecture.md) — what AcquisitionOS actually consists of, and how the four clouds compare.
