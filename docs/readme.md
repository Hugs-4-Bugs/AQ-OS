# AcquisitionOS — Documentation Suite

Complete documentation for **AcquisitionOS**, an AI-powered client-acquisition platform built with Next.js. This suite is organized into 10 numbered folders covering everything from product overview to knowledge transfer. All documents are based on the **actual codebase** (schemas, routes, env names and libraries were read from source — nothing is invented).

---

## Table of Contents

### 01-overview
| Document | Description |
|---|---|
| [PRODUCT-OVERVIEW.md](01-overview/PRODUCT-OVERVIEW.md) | What AcquisitionOS is, the problem it solves, target users, full feature list by category, tech stack and product vision. |
| [FEATURE-LIST.md](01-overview/FEATURE-LIST.md) | Every feature in the app with module, what it does, and **honest current status** (working / partial / planned). |

### 02-architecture
| Document | Description |
|---|---|
| [SYSTEM-ARCHITECTURE.md](02-architecture/SYSTEM-ARCHITECTURE.md) | End-to-end architecture: App Router layout, auth flow, SMTP flow, Google OAuth flow, Stripe payment flow, discovery pipeline, meeting orchestration, AI provider chain, notification fan-out. |
| [DATABASE-SCHEMA.md](02-architecture/DATABASE-SCHEMA.md) | All **104 Prisma models** — every field with type, defaults, relations, indexes, and the model's purpose. Generated directly from `prisma/schema.prisma`. |
| [FILE-STRUCTURE.md](02-architecture/FILE-STRUCTURE.md) | Annotated directory tree: `src/app`, `src/lib`, `src/components`, `src/hooks`, `prisma`, `public`. |

### 03-setup-and-deployment
| Document | Description |
|---|---|
| [LOCAL-SETUP.md](03-setup-and-deployment/LOCAL-SETUP.md) | Run the app locally step-by-step, plus common setup errors and fixes. |
| [DEPLOYMENT-GLM.md](03-setup-and-deployment/DEPLOYMENT-GLM.md) | Deploying on the GLM platform: how it works, sandbox limits, Secrets panel, preview vs deployed URLs, known unfixable limitations. |
| [DEPLOYMENT-RAILWAY.md](03-setup-and-deployment/DEPLOYMENT-RAILWAY.md) | Recommended production deployment on Railway: database, env vars, APP_URL, migrations, custom domain, monitoring. |
| [DEPLOYMENT-VERCEL.md](03-setup-and-deployment/DEPLOYMENT-VERCEL.md) | Deploying on Vercel: dashboard env vars, database options, Stripe webhook URL, long-running-process caveats. |

### 04-secrets-and-configuration
| Document | Description |
|---|---|
| [ALL-SECRETS.md](04-secrets-and-configuration/ALL-SECRETS.md) | **The most important file.** Every environment variable with exact name, purpose, where to get it, example format, required/optional. |
| [GOOGLE-CLOUD-SETUP.md](04-secrets-and-configuration/GOOGLE-CLOUD-SETUP.md) | GCP project, APIs, OAuth consent screen, OAuth client, redirect URIs, Custom Search API, Gmail App Password, and the two classic OAuth errors. |
| [STRIPE-SETUP.md](04-secrets-and-configuration/STRIPE-SETUP.md) | Stripe account, products/prices, webhook endpoint and events, test payments, going live. |
| [GMAIL-SMTP-SETUP.md](04-secrets-and-configuration/GMAIL-SMTP-SETUP.md) | Gmail App Password setup for outbound SMTP, settings, testing, common errors, sending limits. |

### 05-features
| Document | Description |
|---|---|
| [AUTHENTICATION.md](05-features/AUTHENTICATION.md) | All four auth methods end-to-end, session management, security measures, known issues, and the meaning/fix of the three classic auth errors. |
| [LEAD-DISCOVERY.md](05-features/LEAD-DISCOVERY.md) | The discovery pipeline: search → scrape → score → AI research → outreach generation, required keys, testing, rate limits. |
| [PAYMENTS-AND-BILLING.md](05-features/PAYMENTS-AND-BILLING.md) | Plans, Stripe checkout, post-payment fulfillment, credits system, webhooks, refunds, common errors. |

### 06-api-reference
| Document | Description |
|---|---|
| [API-ROUTES.md](06-api-reference/API-ROUTES.md) | **All 485 API routes** with methods, auth requirement and description, grouped by feature category. Generated from `src/app/api/`. |

### 07-workflows
| Document | Description |
|---|---|
| [USER-JOURNEYS.md](07-workflows/USER-JOURNEYS.md) | Step-by-step user journeys: signup, first discovery run, upgrading, pipeline management, calendar setup, outreach, reply → meeting. |
| [ADMIN-WORKFLOWS.md](07-workflows/ADMIN-WORKFLOWS.md) | Admin operations: access, user management, feedback moderation, system health, database maintenance, secret rotation. |

### 08-whatsapp-integration
| Document | Description |
|---|---|
| [WHATSAPP-SETUP.md](08-whatsapp-integration/WHATSAPP-SETUP.md) | What WhatsApp does and does **not** do in this app (notifications only), Twilio/Meta setup, credential list, in-app connection, testing, limitations. |

### 09-troubleshooting
| Document | Description |
|---|---|
| [COMMON-ERRORS.md](09-troubleshooting/COMMON-ERRORS.md) | Every known error with cause and exact fix: session_failed, email delivery failed, redirect_uri_mismatch, wrong-domain callback, GLM sandbox death, deployment failed, payment failures. |

### 10-kt-knowledge-transfer
| Document | Description |
|---|---|
| [KT-DOCUMENT.md](10-kt-knowledge-transfer/KT-DOCUMENT.md) | Full developer handover: business context, stack versions, setup, external services, architecture decisions, technical debt, working/broken matrix, codebase map, handover checklist. |
| [LAUNCH-CHECKLIST.md](10-kt-knowledge-transfer/LAUNCH-CHECKLIST.md) | Pre-launch go/no-go checklist: secrets, database, OAuth URIs, Stripe webhook, SMTP, payments, auth, SSL, monitoring, backups, rate limits, credential scrubbing. |

### _legacy (not part of this suite)
Older, ad-hoc documents from earlier development sessions were moved to `[_legacy](_legacy/)` for reference. They are **not maintained** and are superseded by this suite.

---

## Reading order for a new developer

1. `01-overview/PRODUCT-OVERVIEW.md` — what you are working on
2. `02-architecture/SYSTEM-ARCHITECTURE.md` — how it fits together
3. `04-secrets-and-configuration/ALL-SECRETS.md` — what the app needs to run
4. `03-setup-and-deployment/LOCAL-SETUP.md` — get it running
5. `10-kt-knowledge-transfer/KT-DOCUMENT.md` — the deep handover
6. Everything else is reference material, consulted as needed.

## Source of truth

- Database: `prisma/schema.prisma` (104 models — see `DATABASE-SCHEMA.md`)
- API surface: `src/app/api/**/route.ts` (485 routes — see `API-ROUTES.md`)
- Environment variables: `ensure-env.sh` template + `src/lib/env-validation.ts` (see `ALL-SECRETS.md`)
- Dependencies/versions: `package.json` (see `PRODUCT-OVERVIEW.md`)
