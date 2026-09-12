# Local Setup — Running AcquisitionOS on Your Machine

> Uses only facts from the repo: `package.json` scripts, `ensure-env.sh`, `prisma/schema.prisma`.

## 1. Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| Node.js | 20+ (Next.js 16 requires Node 18.18+; 20 LTS recommended) | `node -v` |
| npm | 10+ (or bun — the GLM environment uses bun) | `npm -v` |
| Database | SQLite via file URL by default; PostgreSQL optional | No server install needed for dev — SQLite is file-based |
| Git | any | |

Note: although production docs recommend PostgreSQL, the schema's `datasource db` is `provider = "sqlite"` — locally you can run with zero database infrastructure.

## 2. Clone and Install

```bash
git clone <repo-url> acquisitionos
cd acquisitionos
npm install          # postinstall automatically runs `prisma generate`
```

(`npm run dev` also works with bun: `bun install` / `bun run dev`.)

## 3. Environment Variables

```bash
cp .env.example .env    # if .env.example is stale, copy the template block from ensure-env.sh
```

Minimum viable set to boot and log in (see `04-secrets-and-configuration/ALL-SECRETS.md` for the complete table):

```env
DATABASE_URL="file:./dev.db"

JWT_SECRET="<32+ char random>"          # node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
JWT_REFRESH_SECRET="<different random>"

APP_URL="http://localhost:3000"
NEXT_PUBLIC_APP_URL="http://localhost:3000"

# Auth behavior flags (all optional, sensible defaults)
AUTH_DEV_MODE=true           # dev conveniences
AUTH_DEV_OTP_IN_RESPONSE=true # returns OTP in API response when no email is configured
AUTH_BYPASS_EMAIL=true       # skips real email sends
ENABLE_OTP_LOGIN=true
ENABLE_MAGIC_LINK=true
ENABLE_GOOGLE_OAUTH=false    # set true only after GCP setup

# Email (optional locally — Ethereal fallback keeps auth flows working)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=yourgmail@gmail.com
SMTP_PASSWORD=<16-char app password, no spaces>
EMAIL_FROM=yourgmail@gmail.com
```

Gotcha: the email reader accepts many alias names, but the canonical names above are what `ensure-env.sh` writes — use them to avoid ambiguity.

## 4. Database Setup

```bash
npm run db:generate    # prisma generate (client)
npm run db:push        # prisma db push → creates ./prisma/dev.db (SQLite) with all 104 tables
# or, if you prefer migrations:
npm run db:migrate     # prisma migrate dev
```

## 5. Run

```bash
npm run dev            # next dev -p 3000, logs tee'd to dev.log
```

- App: http://localhost:3000
- API config probe: http://localhost:3000/api/auth/config → should show capability flags
- Deep health: http://localhost:3000/api/health/detailed

The root `/` is a client-rendered dashboard behind an auth gate; sign up at `/auth/signup`.

## 6. Optional Integrations

| Feature | Needs | Where |
|---|---|---|
| Google sign-in | `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` + redirect URI `http://localhost:3000/api/auth/callback/google` registered in GCP | docs `GOOGLE-CLOUD-SETUP.md` |
| Real email sending | SMTP vars (above) | docs `GMAIL-SMTP-SETUP.md` |
| Lead discovery | `GOOGLE_SEARCH_API_KEY` + `GOOGLE_SEARCH_ENGINE_ID` (or `SERPAPI_KEY`) | docs `LEAD-DISCOVERY.md` |
| Payments | `STRIPE_SECRET_KEY` + price IDs + webhook secret | docs `STRIPE-SETUP.md` |
| Telegram/WhatsApp alerts | `TELEGRAM_BOT_TOKEN` / `TWILIO_*` | docs `WHATSAPP-SETUP.md` |
| AI (outside GLM sandbox) | `OPENAI_API_KEY` (OpenAI-compatible fallback) | Z-AI SDK needs no key inside GLM |

## 7. Common Local Setup Errors and Fixes

| Error | Cause | Fix |
|---|---|---|
| `Prisma Client did not initialize yet` | Generated client missing | `npm run db:generate` (also runs automatically on `npm install`) |
| `Error: Cannot find module '@prisma/client'` | Install interrupted | Delete `node_modules`, re-run `npm install` |
| `P1003: Database file does not exist` | `db:push` not run | `npm run db:push` |
| Sign-in returns `session init failed` | `JWT_SECRET` missing | Set `JWT_SECRET` (+`JWT_REFRESH_SECRET`), restart |
| OTP never arrives | No email configured | Dev mode: set `AUTH_DEV_MODE=true` + `AUTH_DEV_OTP_IN_RESPONSE=true` → OTP returned in response/log instead of email |
| `redirect_uri_mismatch` on Google login | localhost URI not registered in GCP (or OAuth disabled) | Register `http://localhost:3000/api/auth/callback/google`, set `ENABLE_GOOGLE_OAUTH=true` |
| Port 3000 in use | Stale process | `lsof -ti:3000 \| xargs kill` then re-run |
| Checkout fails instantly | Stripe keys not set (expected — code present, keys optional) | Follow `STRIPE-SETUP.md` |
| TypeScript errors on `npm run build` | Stale generated client or node version | `rm -rf .next && npm run db:generate && npm run build` on Node 20 |
| `next dev` killed after a few seconds (GLM sandbox only) | Sandbox memory/OOM | See `09-troubleshooting/COMMON-ERRORS.md` sandbox section |
