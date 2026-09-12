#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# AcquisitionOS — Database Migration Script
# Phase 10: DevOps Infrastructure
#
# Runs Prisma migrations safely for deployment.
# Use this script in CI/CD pipelines or manual deployment.
# ═══════════════════════════════════════════════════════════════════

set -e

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " AcquisitionOS — Database Migration"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ─── Validate Environment ──────────────────────────────────────
if [ -z "$DATABASE_URL" ]; then
    echo "✗ ERROR: DATABASE_URL environment variable is not set"
    echo "  Set it in .env or export it before running this script"
    exit 1
fi

echo ""
echo "▶ DATABASE_URL is configured"
echo "▶ Database type: $(echo "$DATABASE_URL" | sed -E 's/^([^:]+):.*/\1/')"

# ─── Run Migrations ────────────────────────────────────────────
echo ""
echo "▶ Running Prisma migrations (deploy mode)..."
npx prisma migrate deploy

if [ $? -ne 0 ]; then
    echo "✗ ERROR: Prisma migration failed"
    echo "  Check the migration files in prisma/migrations/"
    echo "  For a fresh database, try: npx prisma db push"
    exit 1
fi

echo "✓ Migrations applied successfully"

# ─── Generate Prisma Client ───────────────────────────────────
echo ""
echo "▶ Running Prisma generate..."
npx prisma generate

if [ $? -ne 0 ]; then
    echo "✗ ERROR: Prisma client generation failed"
    exit 1
fi

echo "✓ Prisma client generated"

# ─── Summary ──────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " ✓ Migrations complete"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
