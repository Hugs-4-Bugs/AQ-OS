# Phase 34 — Schema Drift Migration Test

This directory held the **isolated** test database used to prove that
`prisma/migrations/20261031000000_phase34_schema_drift_additive/migration.sql`
is safe to apply on a fresh deployment.

The fresh DB and result JSON were generated and verified by
`scripts/phase34_test_migration.py` and then deleted (they are
regeneratable test artifacts, not source). The script itself remains in
the repo as the durable evidence:

    python3 scripts/phase34_test_migration.py

Result observed 2026-10-31:
- Fresh DB: `prisma migrate deploy` applied all 6 migrations cleanly.
- After deploy, every column the migration declares was present in the
  fresh DB for Lead, BusinessProfile, AuditLog, DataExport, WorkflowLog.
- Production db/custom.db also carries every column (already applied
  historically via `prisma db push`).

Production application:
- The production DB is managed via `prisma db push` (no
  `_prisma_migrations` table). The migration file is therefore not
  applied against production. It exists to (a) document the schema
  evolution, and (b) ensure fresh deployments via `prisma migrate deploy`
  reproduce the schema correctly.
