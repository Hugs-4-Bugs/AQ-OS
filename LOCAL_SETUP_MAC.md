# AcquisitionOS — Mac Local Setup Guide

> Complete guide to setting up AcquisitionOS on macOS for local development.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Install Order](#2-install-order)
3. [Project Setup Commands](#3-project-setup-commands)
4. [Environment Configuration](#4-environment-configuration)
5. [Port Reference](#5-port-reference)
6. [Run Order (Startup Sequence)](#6-run-order-startup-sequence)
7. [Verification Steps](#7-verification-steps)
8. [Quick Start (TL;DR)](#8-quick-start-tldr)
9. [Troubleshooting Quick Reference](#9-troubleshooting-quick-reference)

---

## 1. Prerequisites

| Requirement | Details |
|---|---|
| **macOS** | 13+ (Ventura or later recommended; Sonoma fully supported) |
| **Processor** | Apple Silicon (M1/M2/M3/M4) or Intel Mac |
| **RAM** | Minimum 8 GB; 16 GB recommended (Docker + IDE + browser stack) |
| **Disk Space** | 10 GB free (node_modules, Docker images, databases) |
| **Internet** | Required for package installs, Docker pulls, and API connectivity |

### Verify Your Mac

```bash
sw_versions          # macOS version
sysctl -n machdep.cpu.brand_string   # CPU type
sysctl hw.memsize    # Total RAM (bytes, divide by 1073741824 for GB)
df -h /              # Available disk space
```

---

## 2. Install Order

Install tools **in this exact order** to avoid dependency conflicts.

### Step 1 — Xcode Command Line Tools

Provides `git`, `make`, `gcc`, and other build essentials.

```bash
xcode-select --install
```

A system prompt will appear — click **Install**. After installation, verify:

```bash
xcode-select -p
# Expected: /Library/Developer/CommandLineTools
```

> **Note:** You do **not** need the full Xcode IDE unless you plan to build iOS/macOS native apps.

---

### Step 2 — Homebrew

The macOS package manager. Required for everything that follows.

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

**Apple Silicon (M-series) extra steps:**

After installation, Homebrew will prompt you to add it to your `PATH`. Run the two commands it displays (typically):

```bash
echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
eval "$(/opt/homebrew/bin/brew shellenv)"
```

**Intel Mac** — Homebrew installs to `/usr/local` and is automatically on your `PATH`.

Verify:

```bash
brew --version
# Expected: Homebrew 4.x.x
```

---

### Step 3 — Node.js 20+

AcquisitionOS requires Node.js 20 or later.

**Option A — Via Homebrew (simplest):**

```bash
brew install node
```

**Option B — Via nvm (recommended for version switching):**

```bash
brew install nvm
echo 'export NVM_DIR="$HOME/.nvm"' >> ~/.zshrc
echo '[ -s "/opt/homebrew/opt/nvm/nvm.sh" ] && \. "/opt/homebrew/opt/nvm/nvm.sh"' >> ~/.zshrc
source ~/.zshrc
nvm install 20
nvm use 20
nvm alias default 20
```

Verify:

```bash
node --version   # v20.x.x or later
npm --version    # 10.x.x or later
```

---

### Step 4 — Bun

Bun is the **primary runtime** for AcquisitionOS — used for running the dev server, scripts, and all package management.

```bash
curl -fsSL https://bun.sh/install | bash
```

After installation, restart your terminal or run:

```bash
source ~/.zshrc   # or ~/.bashrc if using Bash
```

Verify:

```bash
bun --version
# Expected: 1.x.x
```

> **Tip:** If you get "command not found: bun", close and reopen your terminal completely.

---

### Step 5 — Docker Desktop

Required for PostgreSQL, Redis, Mailpit, and any containerized services.

```bash
brew install --cask docker
```

After installation:

1. Open **Docker Desktop** from your Applications folder (or Spotlight).
2. Complete the first-run setup (accept terms, allow privileges).
3. Wait for the Docker engine to start (whale icon in menu bar stops animating).

Verify:

```bash
docker --version
# Expected: Docker 24.x.x or later
docker compose version
# Expected: Docker Compose version v2.x.x
```

> **Apple Silicon note:** Docker Desktop runs Linux ARM64 containers natively. If any image fails, ensure you're using multi-arch or ARM64-compatible images.

---

### Step 6 — Redis 7

Used by the realtime-service for pub/sub messaging.

**Option A — Via Homebrew (native, no Docker needed):**

```bash
brew install redis
brew services start redis
```

**Option B — Via Docker (recommended if you want parity with production):**

Redis will be started via `docker-compose.local.yml` (see [Run Order](#6-run-order-startup-sequence)).

Verify:

```bash
redis-cli ping
# Expected: PONG
```

---

### Step 7 — PostgreSQL 16

Primary production database; optional for local dev (SQLite is the default).

**Option A — Via Homebrew (native):**

```bash
brew install postgresql@16
brew services start postgresql@16
```

Add to `PATH`:

```bash
echo 'export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

**Option B — Via Docker (recommended for isolation):**

PostgreSQL will be started via `docker-compose.local.yml`.

Verify:

```bash
pg_isready
# Expected: /tmp:5432 - accepting connections
```

---

### Step 8 — Git

Usually installed with Xcode CLT, but ensure you have the latest version:

```bash
brew install git
git --version
# Expected: git version 2.x.x
```

Configure your identity:

```bash
git config --global user.name "Your Name"
git config --global user.email "you@example.com"
```

---

### Step 9 — Stripe CLI

For forwarding Stripe webhooks to your local server during development.

```bash
brew install stripe/stripe-cli/stripe
```

Verify:

```bash
stripe version
# Expected: stripe x.x.x
```

Log in to your Stripe account:

```bash
stripe login
```

This will open a browser window to authorize the CLI.

---

### Step 10 — jq

Lightweight command-line JSON processor. Used by setup scripts and health checks.

```bash
brew install jq
jq --version
# Expected: jq-1.7 or later
```

---

### Step 11 — watchman (Optional)

File watching service that can improve HMR (Hot Module Replacement) performance with large codebases.

```bash
brew install watchman
watchman --version
```

> **Optional:** Only install if you experience slow file-watching in your IDE or Next.js HMR reloads.

---

### Step 12 — Python 3.11+ (For Backend)

Required **only** if you plan to run the optional Python FastAPI backend with Celery.

```bash
brew install python@3.11
```

Verify:

```bash
python3.11 --version
# Expected: Python 3.11.x
```

Set up a virtual environment (inside the project later):

```bash
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

> **Skip this step** if you're only running the Next.js frontend and Node.js services.

---

## 3. Project Setup Commands

### Clone and Enter the Repository

```bash
git clone <repo-url> && cd AcquisitionOS
```

Replace `<repo-url>` with the actual repository URL (HTTPS or SSH).

### Automated Setup (Recommended)

```bash
cp .env.example .env.local
./setup.sh
```

The `setup.sh` script will:
1. Verify all required tools are installed
2. Install Node.js dependencies via `bun install`
3. Generate the Prisma client (`bun run db:generate`)
4. Push the database schema (`bun run db:push`)
5. Run basic health checks

### Manual Setup

If `setup.sh` fails or you prefer step-by-step control:

```bash
# 1. Create your local environment file
cp .env.example .env.local

# 2. Install all JavaScript/TypeScript dependencies
bun install

# 3. Generate the Prisma client from the schema
bun run db:generate

# 4. Push the Prisma schema to create the SQLite database
bun run db:push

# 5. (Optional) Seed the database with sample data
bun run db:seed
```

### First-Time Git Hooks

If the project uses Husky or lint-staged, hooks are installed automatically with `bun install`. Verify:

```bash
ls -la .husky/
```

---

## 4. Environment Configuration

All environment variables go in `.env.local` (this file is gitignored). Start from the example template:

```bash
cp .env.example .env.local
```

Open `.env.local` in your editor and fill in each section below.

---

### 4.1 — JWT & NextAuth Secrets

Generate cryptographically secure secrets:

```bash
# Generate JWT secret
openssl rand -base64 48

# Generate NextAuth secret
openssl rand -base64 48
```

Copy each output into `.env.local`:

```env
JWT_SECRET=<paste-first-output-here>
NEXTAUTH_SECRET=<paste-second-output-here>
NEXTAUTH_URL=http://localhost:3000
```

> **Warning:** Never commit real secrets to the repository. `.env.local` is gitignored by default.

---

### 4.2 — SMTP / Email (Gmail App Password)

AcquisitionOS uses Nodemailer with SMTP for transactional emails. For local development with Gmail:

**Step 1:** Go to your Google Account → [Security settings](https://myaccount.google.com/security).

**Step 2:** Ensure **2-Step Verification** is enabled. (App Passwords require 2FA.)

**Step 3:** Navigate to **App Passwords** (search "App Passwords" in the Google Account search bar, or go to `https://myaccount.google.com/apppasswords`).

**Step 4:** In the "App name" field, enter something descriptive like `AcquisitionOS Dev`.

**Step 5:** Click **Create**. Google will display a 16-character password in the format `xxxx xxxx xxxx xxxx`.

**Step 6:** Copy the password (without spaces) and add it to `.env.local`:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=<16-char-app-password>
EMAIL_FROM=your-email@gmail.com
```

> **Alternative — Resend API:** If you prefer Resend for email delivery:
>
> ```env
> RESEND_API_KEY=re_xxxxxxxxxxxx
> EMAIL_FROM=noreply@yourdomain.com
> ```
>
> Sign up at [resend.com](https://resend.com), create an API key, and paste above.

> **Alternative — Mailpit (local inbox):** For development without sending real emails, use the Mailpit Docker container (see [Port Reference](#5-port-reference)). Configure:
>
> ```env
> SMTP_HOST=localhost
> SMTP_PORT=1025
> SMTP_SECURE=false
> SMTP_USER=
> SMTP_PASSWORD=
> ```
>
> Then view emails at http://localhost:8025.

---

### 4.3 — Google OAuth Setup

Required for the "Sign in with Google" feature.

**Step 1:** Go to the [Google Cloud Console](https://console.cloud.google.com/).

**Step 2:** Create a new project (or select an existing one). Name it `AcquisitionOS Dev`.

**Step 3:** Navigate to **APIs & Services** → **Credentials**.

**Step 4:** Click **+ CREATE CREDENTIALS** → **OAuth client ID**.

**Step 5:** Configure the OAuth consent screen if prompted:
   - User Type: **External**
   - App name: `AcquisitionOS Dev`
   - Add your email as a test user
   - Skip optional fields, click **Save and Continue** through each step

**Step 6:** On the Credentials page, create the OAuth client ID:
   - Application type: **Web application**
   - Name: `AcquisitionOS Dev Client`
   - **Authorized JavaScript origins:** `http://localhost:3000`
   - **Authorized redirect URIs:** `http://localhost:3000/api/auth/callback/google`

**Step 7:** Click **Create**. You'll see your **Client ID** and **Client Secret**.

**Step 8:** Copy both values into `.env.local`:

```env
GOOGLE_CLIENT_ID=<your-client-id>.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=<your-client-secret>
```

> **Important:** Never use production Google OAuth credentials in local development. Create a separate project for dev.

---

### 4.4 — Stripe API Keys (Test Mode)

For payment integration testing. Always use **test mode** keys in local development.

**Step 1:** Go to the [Stripe Dashboard](https://dashboard.stripe.com/).

**Step 2:** Toggle **Test mode** on (switch in the top-right corner).

**Step 3:** Navigate to **Developers** → **API keys**.

**Step 4:** Copy the **Publishable key** (starts with `pk_test_`) and **Secret key** (starts with `sk_test_`).

```env
STRIPE_PUBLIC_KEY=pk_test_xxxxxxxxxxxx
STRIPE_SECRET_KEY=sk_test_xxxxxxxxxxxx
```

> **Security:** The secret key (`sk_test_`) must never be committed to the repository or shared publicly.

---

### 4.5 — Stripe Webhook Secret

Stripe webhooks allow your local app to receive payment events in real time.

**Step 1:** Install and log in to the Stripe CLI (already done in [Install Order Step 9](#step-9--stripe-cli)):

```bash
stripe login
```

**Step 2:** Start forwarding webhooks to your local server:

```bash
stripe listen --forward-to localhost:3000/api/payments/webhook/stripe
```

**Step 3:** The CLI will output a **webhook signing secret** (starts with `whsec_`). Copy it.

**Step 4:** Add it to `.env.local`:

```env
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxx
```

> **Tip:** The webhook secret changes each time you run `stripe listen`. Keep the CLI running during development, or update `.env.local` each time you restart it.

---

### 4.6 — Razorpay (India/INR Payments)

Only needed if you're testing Indian payment flows (UPI, netbanking, etc.).

**Step 1:** Create a Razorpay account at [dashboard.razorpay.com](https://dashboard.razorpay.com).

**Step 2:** Navigate to **Settings** → **API Keys**.

**Step 3:** Generate a new key pair for **Test Mode**.

```env
RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxxxx
RAZORPAY_KEY_SECRET=<your-test-secret>
RAZORPAY_WEBHOOK_SECRET=<from-webhook-settings>
```

> **Skip this section** if you're not testing INR/India-specific payment flows.

---

### 4.7 — Database URL (SQLite vs PostgreSQL)

**Default — SQLite (zero config, recommended for quick start):**

```env
DATABASE_URL="file:./dev.db"
```

**PostgreSQL (for production parity):**

```env
DATABASE_URL="postgresql://acquisitionos:acquisitionos@localhost:5432/acquisitionos?schema=public"
```

After changing the database provider, regenerate the Prisma client and push the schema:

```bash
bun run db:generate
bun run db:push
```

---

### 4.8 — Redis URL

```env
REDIS_URL=redis://localhost:6379
```

If Redis requires a password (Docker compose sets one by default):

```env
REDIS_URL=redis://:yourpassword@localhost:6379
```

---

### 4.9 — Realtime Service

```env
REALTIME_SERVICE_URL=http://localhost:3003
NEXT_PUBLIC_REALTIME_URL=http://localhost:3003
```

---

### 4.10 — Complete `.env.local` Template

```env
# ─── Core ────────────────────────────────────────────────
NODE_ENV=development
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=<openssl rand -base64 48>
JWT_SECRET=<openssl rand -base64 48>

# ─── Database ────────────────────────────────────────────
DATABASE_URL="file:./dev.db"
# DATABASE_URL="postgresql://acquisitionos:acquisitionos@localhost:5432/acquisitionos?schema=public"

# ─── Redis ───────────────────────────────────────────────
REDIS_URL=redis://localhost:6379

# ─── Auth: Google OAuth ─────────────────────────────────
GOOGLE_CLIENT_ID=<your-google-client-id>
GOOGLE_CLIENT_SECRET=<your-google-client-secret>

# ─── Email: SMTP ────────────────────────────────────────
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=<16-char-app-password>
EMAIL_FROM=your-email@gmail.com

# ─── Email: Resend (alternative) ────────────────────────
# RESEND_API_KEY=re_xxxxxxxxxxxx

# ─── Payments: Stripe ───────────────────────────────────
STRIPE_PUBLIC_KEY=pk_test_xxxxxxxxxxxx
STRIPE_SECRET_KEY=sk_test_xxxxxxxxxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxx

# ─── Payments: Razorpay ─────────────────────────────────
# RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxxxx
# RAZORPAY_KEY_SECRET=<your-test-secret>
# RAZORPAY_WEBHOOK_SECRET=<from-webhook-settings>

# ─── Realtime ───────────────────────────────────────────
REALTIME_SERVICE_URL=http://localhost:3003
NEXT_PUBLIC_REALTIME_URL=http://localhost:3003
```

---

## 5. Port Reference

| Service | Port | URL | Notes |
|---|---|---|---|
| **Next.js App** | 3000 | http://localhost:3000 | Main application server |
| **Realtime Service** | 3003 | http://localhost:3003 | Socket.IO mini-service |
| **PostgreSQL** | 5432 | `localhost:5432` | Only when using PostgreSQL (not SQLite) |
| **Redis** | 6379 | `localhost:6379` | Required for realtime pub/sub |
| **Mailpit SMTP** | 1025 | `localhost:1025` | Local SMTP sink (Docker) |
| **Mailpit Web** | 8025 | http://localhost:8025 | View captured emails in browser |
| **FastAPI Backend** | 8000 | http://localhost:8000 | Optional Python backend |
| **Prisma Studio** | 5555 | http://localhost:5555 | Visual DB browser (`bun run db:studio`) |
| **Docker API** | — | — | Docker Desktop must be running |

### Common Port Conflicts

If a port is already in use, find and kill the process:

```bash
# Find process on port 3000
lsof -ti:3000

# Kill it
lsof -ti:3000 | xargs kill

# Or use a different port
PORT=3001 bun run dev
```

---

## 6. Run Order (Startup Sequence)

Start services in this order to ensure all dependencies are ready.

### Step 1 — Start Docker Services

Launch Docker Desktop first (if not already running), then start all containerized services:

```bash
docker compose -f docker-compose.local.yml up -d
```

This starts: PostgreSQL, Redis, Mailpit (if configured in the compose file).

### Step 2 — Wait for Health Checks

Verify all containers are healthy before proceeding:

```bash
docker compose -f docker-compose.local.yml ps
```

You should see all services with status `healthy` or `running`. If any are still starting, wait a few seconds and re-run the command.

Quick health checks:

```bash
redis-cli ping          # → PONG
pg_isready              # → accepting connections (if using PostgreSQL)
```

### Step 3 — Start the Realtime Service

In a separate terminal (or background it):

```bash
cd mini-services/realtime-service && bun --hot index.ts &
```

The `--hot` flag enables auto-restart when source files change.

> **Important:** The realtime service requires Redis to be running before it starts.

### Step 4 — Start the Stripe Webhook Listener

In a separate terminal (or background it):

```bash
stripe listen --forward-to localhost:3000/api/payments/webhook/stripe &
```

Keep this running to receive Stripe events locally. Note the `whsec_` output and ensure `STRIPE_WEBHOOK_SECRET` in `.env.local` matches.

> **Skip this step** if you're not testing payment flows.

### Step 5 — Start the Next.js Application

```bash
bun run dev
```

The application will start on http://localhost:3000. You should see:

```
  ▲ Next.js 16.x.x
  - Local:        http://localhost:3000
  - Environments: .env.local

 ✓ Ready in X.Xs
```

### Step 6 — (Optional) Start the Python Backend

Only if you're running the FastAPI backend:

```bash
cd backend
source .venv/bin/activate
uvicorn app.main:app --reload --port 8000
```

### All-in-One Script

Alternatively, use the provided startup script (if available):

```bash
./run-local.sh
```

This script runs all the steps above in the correct order, with health checks between each step.

---

## 7. Verification Steps

After starting all services, run these checks to confirm everything is working.

### Application Health

```bash
# Basic health check
curl http://localhost:3000/api/health
# Expected: {"status":"ok"}

# Detailed health check (includes DB, Redis, service status)
curl http://localhost:3000/api/health/detailed
# Expected: JSON with all services showing "healthy"
```

### Infrastructure Health

```bash
# Redis
redis-cli ping
# Expected: PONG

# PostgreSQL (if using)
pg_isready
# Expected: accepting connections

# Docker containers
docker compose -f docker-compose.local.yml ps
# Expected: All services running/healthy
```

### End-to-End Smoke Tests

| Test | Command / Action | Expected Result |
|---|---|---|
| Homepage loads | Open http://localhost:3000 | App renders without errors |
| Auth page loads | Navigate to `/login` | Login form visible |
| Google OAuth | Click "Sign in with Google" | Redirects to Google consent screen |
| API health | `curl localhost:3000/api/health` | `{"status":"ok"}` |
| WebSocket | Check browser console for Socket.IO connection | Connected to `:3003` |
| Email capture | Trigger a signup with Mailpit SMTP config | Email appears at http://localhost:8025 |
| Stripe payment | Complete a test checkout | Webhook received, event logged |
| Prisma Studio | `bun run db:studio` | Opens http://localhost:5555 |

### Automated Health Check Script

```bash
./healthcheck.sh
```

This script checks all services and outputs a green/red status for each. All green = you're good to go.

---

## 8. Quick Start (TL;DR)

The fastest path to a running local instance:

```bash
# 1. Clone & enter
git clone <repo-url> && cd AcquisitionOS

# 2. Install tools (if missing)
brew install bun redis && brew install --cask docker

# 3. Setup project
cp .env.example .env.local && bun install && bun run db:generate && bun run db:push

# 4. Start infrastructure
docker compose -f docker-compose.local.yml up -d && redis-cli ping

# 5. Run the app
bun run dev
```

Then open http://localhost:3000 in your browser.

---

## 9. Troubleshooting Quick Reference

### Port Already in Use

```bash
# Find process on a specific port
lsof -ti:3000

# Kill the process
lsof -ti:3000 | xargs kill

# Kill forcefully if needed
lsof -ti:3000 | xargs kill -9

# Common ports to check
lsof -ti:3003 | xargs kill   # Realtime service
lsof -ti:5432 | xargs kill   # PostgreSQL
lsof -ti:6379 | xargs kill   # Redis
```

### HMR Cache Corruption

If Hot Module Replacement stops working or you see stale content:

```bash
rm -rf .next && bun run dev
```

This clears the Next.js build cache and starts fresh.

### Prisma Client Errors

If you see errors like `PrismaClient could not be located` or `prisma generate` warnings:

```bash
# Regenerate the Prisma client
bun run db:generate

# If schema changed, push updates to the database
bun run db:push

# Nuclear option — reset everything
bun run db:reset
```

### Docker Not Running

If `docker compose` commands fail:

1. Open **Docker Desktop** from Applications
2. Wait for the engine to start (whale icon stops animating)
3. Verify: `docker ps`

If Docker Desktop won't start:

```bash
# Reset Docker
killall Docker && open -a Docker
```

### Redis Connection Refused

```bash
# Check if Redis is running
redis-cli ping

# If not, start it
brew services start redis

# Or via Docker
docker compose -f docker-compose.local.yml up -d redis

# Check Redis logs
redis-cli info server
```

### PostgreSQL Connection Refused

```bash
# Check if PostgreSQL is running
pg_isready

# Start via Homebrew
brew services start postgresql@16

# Or via Docker
docker compose -f docker-compose.local.yml up -d postgres

# Connect and verify
psql -U acquisitionos -d acquisitionos -c "SELECT 1;"
```

### Bun Install Fails

```bash
# Clear Bun cache
rm -rf ~/.bun/install/cache

# Clear node_modules and reinstall
rm -rf node_modules && bun install

# If lockfile is corrupted
rm bun.lockb && bun install
```

### `bun run dev` Crashes Immediately

```bash
# 1. Check your Node.js version
node --version   # Must be 20+

# 2. Check environment file
cat .env.local | head -5

# 3. Clear all caches
rm -rf .next node_modules/.cache

# 4. Reinstall and restart
bun install && bun run dev
```

### Google OAuth Redirect Mismatch

Ensure your Google Cloud Console OAuth client has **both** of these configured:

- **Authorized JavaScript origins:** `http://localhost:3000`
- **Authorized redirect URIs:** `http://localhost:3000/api/auth/callback/google`

Any typo or extra slash will cause a `redirect_uri_mismatch` error.

### Stripe Webhooks Not Received

```bash
# 1. Verify Stripe CLI is listening
stripe listen --forward-to localhost:3000/api/payments/webhook/stripe

# 2. Check webhook secret matches
# The whsec_ value from `stripe listen` must match STRIPE_WEBHOOK_SECRET in .env.local

# 3. Test with a trigger
stripe trigger payment_intent.succeeded

# 4. Check Next.js server logs for incoming webhook requests
```

### Realtime Service Won't Connect

```bash
# 1. Check if the service is running
curl http://localhost:3003/health

# 2. Ensure Redis is available
redis-cli ping

# 3. Restart the service
cd mini-services/realtime-service && bun --hot index.ts

# 4. Check browser console for Socket.IO errors
```

### Apple Silicon — `npm install` Native Module Errors

Some packages ship x86_64 native binaries. Rosetta 2 usually handles this, but if you see architecture errors:

```bash
# Install Rosetta 2 (if not already)
softwareupdate --install-rosetta

# Force reinstall native modules
rm -rf node_modules && bun install
```

### Permission Denied on `setup.sh` or `run-local.sh`

```bash
chmod +x setup.sh run-local.sh healthcheck.sh
```

---

## Appendix — Useful Development Commands

| Command | Description |
|---|---|
| `bun run dev` | Start Next.js dev server |
| `bun run lint` | Run ESLint checks |
| `bun run db:generate` | Generate Prisma client |
| `bun run db:push` | Push schema changes to database |
| `bun run db:studio` | Open Prisma Studio (visual DB browser) |
| `bun run db:seed` | Seed database with sample data |
| `bun run db:reset` | Reset database (drops all data) |
| `bun run db:migrate` | Run Prisma migrations (PostgreSQL) |
| `docker compose -f docker-compose.local.yml up -d` | Start all Docker services |
| `docker compose -f docker-compose.local.yml down` | Stop all Docker services |
| `docker compose -f docker-compose.local.yml logs -f` | Stream Docker service logs |
| `stripe listen --forward-to localhost:3000/api/payments/webhook/stripe` | Forward Stripe webhooks |
| `stripe trigger payment_intent.succeeded` | Trigger a test Stripe event |
| `redis-cli monitor` | Watch all Redis commands in real time |
| `redis-cli pubsub channels *` | List active Redis pub/sub channels |

---

*Last updated: 2025-03-05 · AcquisitionOS v1.0*
