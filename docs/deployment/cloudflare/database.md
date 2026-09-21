# Database — External PostgreSQL + Hyperdrive

The database is the one component this guide deliberately does **not** put on Cloudflare. This page explains where it lives, how the Worker reaches it through **Hyperdrive**, how migrations bypass Hyperdrive, and what changes in Prisma code when running on Workers.

**The rule stated once:** AcquisitionOS keeps its **Prisma 6 + PostgreSQL** stack (`prisma/schema.production.prisma`, 53+ models) exactly as on every other cloud. **D1 is not applicable** ([`architecture.md`](./architecture.md) §4). The only Cloudflare-native piece is the *connection path*: Workers → Hyperdrive → your Postgres.

---

## 1. Why the database stays external

- **Schema reality:** the app ships a PostgreSQL Prisma schema. D1 is SQLite — migrating means rewriting the schema and re-validating every query. Rejected (see [`architecture.md`](./architecture.md) §4 and [`../README.md`](../README.md) §5).
- **Portability:** the same database serves local development, CI, staging, production, and any future cloud move. Only the connection string changes.
- **Operational maturity:** backups, PITR, read replicas, and monitoring come from a Postgres provider, not from a new experiment.

---

## 2. Provider options (pick one)

Any managed PostgreSQL 14+ works. Serverless-style providers pair especially well with Hyperdrive because Hyperdrive absorbs their aggressive connection limits.

| Provider | Notes for AcquisitionOS |
| --- | --- |
| **Neon** | Serverless Postgres; frequently used with Hyperdrive (Workers docs list it as an integration); autosuspending compute pairs well with pooled edge connections. |
| **Supabase** | The repository's own comments document Supabase usage (`prisma/schema.production.prisma`) — a smooth default. Use the **connection pooler** hostname for runtime, the direct hostname for migrations (§5). |
| **Amazon RDS for PostgreSQL** | Same choice as the AWS guide ([`../aws/`](../aws/README.md) path); reachable from Cloudflare over TLS. |
| **Google Cloud SQL** | Same as the GCP guide; enable public IP + TLS, or verify Cloudflare-side connectivity options. |
| **Azure Flexible Server** | Same as the Azure guide. |

**What to create:** database `acquisitionos`, least-privilege user `app_user` (owner of the app schema, not the instance superuser — [`../02-environment-variables-and-secrets.md`](../02-environment-variables-and-secrets.md) §11.5), TLS enforced. Record host/port/user/password.

**Verify:** `psql "postgresql://app_user:PASSWORD@HOST:5432/acquisitionos?sslmode=require" -c "select version();"` from your machine (this same direct reachability is what migrations use in §5).

Backups/PITR: enable on the provider (§7).

---

## 3. Hyperdrive deep dive

**What it is:** a Cloudflare service that sits between your Worker and your external database. It (a) **pools** connections close to the edge so requests reuse warm connections to Postgres, and (b) **caches** eligible read query results near the Worker. Docs: https://developers.cloudflare.com/hyperdrive/.

**What it is not:** a database, a proxy you must run, or a place your data is stored. Your data remains solely in your Postgres provider.

**Public vs binding — two ways to consume a Hyperdrive config:**

| Mechanism | What you get | Used by AcquisitionOS for |
| --- | --- | --- |
| **Worker binding** (`env.HYPERDRIVE`) | `env.HYPERDRIVE.connectionString` — a connection string reachable **only from your Worker** | Runtime queries. Recommended: keep the secret-avoiding binding; the origin password is stored server-side in the config. |
| Connection string passed to other tools | Not the model here — the Hyperdrive-hosted string is not a general public endpoint | Migrations use the **direct** origin connection instead (§5). |

**Create it** (also in [`manual-deployment.md`](./manual-deployment.md) §3):

```bash
npx wrangler hyperdrive create acquisitionos-pg \
  --connection-string="postgresql://app_user:YOUR_DB_PASSWORD@your-db-host.provider.com:5432/acquisitionos?sslmode=require"
```

**Expected output:** confirmation JSON containing the config `id`. **Verify:** `npx wrangler hyperdrive list`.

**Bind it** (`wrangler.jsonc`):

```jsonc
"hyperdrive": [
  { "binding": "HYPERDRIVE", "id": "PASTE_THE_ID_HERE" }
]
```

**Caching:** enabled by default for eligible read queries; tune or disable with `--caching-disabled` / `--max-age` (documented at https://developers.cloudflare.com/hyperdrive/). For an app with per-user dashboards (AcquisitionOS analytics), start conservative (short `max_age`) and measure.

---

## 4. Prisma on Workers via OpenNext (what changes in code)

**The source of truth** is the OpenNext "Database & ORM" how-to: https://opennext.js.org/cloudflare/howtos/db. Summary for this app — all four changes are required together:

**(a) `prisma/schema.production.prisma` generator** — driver adapters on, **no custom output dir** (OpenNext patches the generated client):

```prisma
generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["driverAdapters"]
}
```

**(b) `next.config.ts`** — keep `@prisma/client` in `serverExternalPackages` (already there in this repo) and add the generated-client package:

```ts
serverExternalPackages: ["@prisma/client", ".prisma/client", /* existing entries unchanged */],
```

**(c) `src/lib/db.ts`** — replace the module-level global client with a **per-request** client. The OpenNext docs are explicit: a global pooled client reuses connections across requests, which Workers does not allow. Pattern (from the docs, adapted to the Hyperdrive binding):

```ts
import { cache } from "react";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export const getDb = cache(() => {
  const { env } = getCloudflareContext();
  const connectionString = env.HYPERDRIVE.connectionString;
  const adapter = new PrismaPg({ connectionString, maxUses: 1 });
  return new PrismaClient({ adapter });
});
```

Call sites then use `getDb()` instead of importing a shared `db`. If you must keep `src/lib/db.ts`'s export name for compatibility, make `db` a getter/proxy that calls `getDb()` — and run `npm test` ([`../01-architecture.md`](../01-architecture.md) §1 lists the test commands).

**(d) Alternative without code change — Hyperdrive connection string as `DATABASE_URL`:** Hyperdrive also lets the Worker use its connection string via the standard Prisma engine path, and the OpenNext docs describe using `env.HYPERDRIVE.connectionString` with existing drivers/ORMs. If you prefer the env-var pattern, set `DATABASE_URL` to the Hyperdrive-hosted string and verify prepared-statement behavior in staging. **`NEEDS VERIFICATION`** — Prisma-on-Workers guidance evolves; check https://www.prisma.io/docs/orm/prisma-client/deployment and the OpenNext how-to for the currently recommended adapter before choosing between (c) and (d).

**Prisma Accelerate** (managed pool/proxy from Prisma) is an `OPTIONAL` alternative to Hyperdrive doing a similar pooling job; you need one, not both — `NEEDS VERIFICATION` for current guidance/pricing at https://www.prisma.io/docs.

---

## 5. Migrations: DIRECT_URL over the direct connection

**What:** `prisma db push` / `prisma migrate` run from **your machine or CI** against the database's direct (non-Hyperdrive) hostname, using `directUrl`.
**Why:** migrations need prepared statements and DDL sessions that pooled edge connections are not designed for; the schema's `directUrl` exists for exactly this ([`../02-environment-variables-and-secrets.md`](../02-environment-variables-and-secrets.md) §2).

```bash
export DIRECT_URL="postgresql://app_user:YOUR_DB_PASSWORD@your-db-host.provider.com:5432/acquisitionos?sslmode=require"
export DATABASE_URL="$DIRECT_URL"
npx prisma db push --schema=prisma/schema.production.prisma
```

**Expected output:** `The database is now in sync with your Prisma schema.`

**Where each URL lives on this platform:**

| Variable | Value | Where stored |
| --- | --- | --- |
| `DIRECT_URL` | direct provider hostname | CI secret / local shell only — never needed by the Worker |
| `DATABASE_URL` (runtime) | Hyperdrive connection (binding or string — §4) | Worker binding / secrets |

Full migration discipline: [`../../04-database-production.md`](../04-database-production.md).

---

## 6. TLS

**What:** `sslmode=require` on every connection string (both direct and through Hyperdrive's origin config).
**Why:** the Worker→Hyperdrive leg and the Hyperdrive→Postgres leg both cross the public internet; managed providers commonly enforce TLS. Do not weaken this to `sslmode=disable` to "fix" a connectivity error — fix the certificate chain instead.

**Verify:**

```bash
psql "$DIRECT_URL" -c "show ssl;"    # expect: ssl = on (or use \conninfo and look for SSL connection)
```

---

## 7. Backups / PITR — inherited from the provider

**What:** Cloudflare (Hyperdrive) does not back up your data — it is a connection layer. Backup and point-in-time recovery come entirely from the Postgres provider you chose in §2.
**Why:** this is a feature of the "external database" decision: the same backup policy protects the app no matter where the app runs.

**Checklist:** automated daily backups enabled; PITR window (e.g., 7 days) configured; restore **tested** into a scratch database before go-live; the backup/restore runbook in [`../04-database-production.md`](../04-database-production.md) applies verbatim.

---

## 8. Connection budget

**What:** how many database connections this deployment can open, and why the number stays small.

| Path | Connections |
| --- | --- |
| Worker → Hyperdrive | 0 direct — Workers connect to Hyperdrive, not to Postgres |
| Hyperdrive → Postgres | a small pooled set per region (managed by Hyperdrive; not configurable per-request) |
| Migrations/CI → Postgres | 1–2 transient, over `DIRECT_URL` |

**Why it matters:** serverless-style providers (Neon/Supabase pooler) and small RDS instance classes enforce low `max_connections`. Hyperdrive is the pooling layer that makes the edge-scaled Worker fit those limits; without it, each isolate could hold its own Postgres connections. If you see provider-side connection-limit errors, check Hyperdrive is actually bound (`wrangler.jsonc`) and that `src/lib/db.ts` uses the §4 pattern (a stray global client is the usual cause).

**Verify:** on the provider dashboard, observe the steady-state connection count from Cloudflare IPs stays within a small constant while traffic scales; watch for `too many connections` errors in `npx wrangler tail`.

---

## 9. Staging

**What:** a separate database (or separate schema/branch if your provider supports database branching, e.g., Neon branches) + a separate Hyperdrive config (`acquisitionos-pg-staging`) bound to the staging Worker (`acquisitionos-staging`).
**Why:** staging must never share production data or connection budget. See [`frontend.md`](./frontend.md) §7 for the full staging topology.

---

## 10. Official Documentation

- Hyperdrive (overview, create, bindings, caching) — https://developers.cloudflare.com/hyperdrive/
- Hyperdrive + Prisma/ORM guidance (OpenNext) — https://opennext.js.org/cloudflare/howtos/db
- Prisma deployment & Cloudflare guidance — https://www.prisma.io/docs/orm/prisma-client/deployment
- Prisma PostgreSQL connections — https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/databases-connections/postgresql
- Cloudflare Workers + 3rd-party database integrations (Neon, Supabase, ...) — https://developers.cloudflare.com/workers/databases/connect-to-databases/
- D1 (NOT APPLICABLE for AcquisitionOS — linked for completeness) — https://developers.cloudflare.com/d1/
