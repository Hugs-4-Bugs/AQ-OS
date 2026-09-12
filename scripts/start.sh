#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# AcquisitionOS — Application Startup Script
# Phase 10: DevOps Infrastructure
#
# Runs database migrations then starts the Next.js application.
# Designed for Docker ENTRYPOINT or direct execution.
# ═══════════════════════════════════════════════════════════════════

set -e

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " AcquisitionOS — Starting Application"
echo " Environment: ${NODE_ENV:-development}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ─── Run Database Migrations ───────────────────────────────────
echo ""
echo "▶ Running database migrations..."
npx prisma migrate deploy

echo "▶ Generating Prisma client..."
npx prisma generate

# ─── Pre-flight Health Check ───────────────────────────────────
echo ""
echo "▶ Running pre-flight checks..."

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    echo "⚠ WARNING: DATABASE_URL is not set. Using default SQLite."
fi

# Check if NEXTAUTH_SECRET is set (required for production)
if [ "$NODE_ENV" = "production" ] && [ -z "$NEXTAUTH_SECRET" ]; then
    echo "✗ ERROR: NEXTAUTH_SECRET must be set in production"
    exit 1
fi

# Check if JWT_SECRET is set (required for production)
if [ "$NODE_ENV" = "production" ] && [ -z "$JWT_SECRET" ]; then
    echo "✗ ERROR: JWT_SECRET must be set in production"
    exit 1
fi

echo "✓ Pre-flight checks passed"

# ─── Start Application ─────────────────────────────────────────
echo ""
echo "▶ Starting AcquisitionOS on port ${PORT:-3000}..."
exec node node_modules/.bin/next start
