# ═══════════════════════════════════════════════════════════════════
# AcquisitionOS — Production Dockerfile (Multi-Stage Build)
# 2-stage build: builder → runner (optimised for GLM cloud)
# ═══════════════════════════════════════════════════════════════════

# ── Stage 1: Builder ───────────────────────────────────────────────
FROM node:20-alpine AS builder

# libc6-compat needed by some native modules (sharp, swc)
RUN apk add --no-cache libc6-compat

WORKDIR /app

# Copy package.json, package-lock.json, AND .npmrc.
# - npm ci REQUIRES package-lock.json (NOT bun.lock) — this was the #1
#   deployment blocker on GLM cloud.
# - .npmrc sets legacy-peer-deps=true (needed because next-auth@4 expects
#   nodemailer@^7 but project uses nodemailer@8). Without this, npm ci
#   fails with ERESOLVE — this was blocker #2.
COPY package.json package-lock.json .npmrc ./

# Copy prisma schema BEFORE npm ci so prisma generate can find it.
# Without this, npm ci's postinstall (prisma generate) fails because
# schema.prisma doesn't exist yet.
COPY prisma ./prisma/

# Install ALL dependencies (including dev for build).
# --ignore-scripts prevents the postinstall (prisma generate) from running
# during npm ci, which avoids race conditions. We run prisma generate
# explicitly in the next step.
RUN npm ci --ignore-scripts

# Generate Prisma client explicitly (after deps are installed)
RUN npx prisma generate

# Copy source code
COPY . .

# Set environment for build
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
# Increase Node memory limit for the Next.js build step (prevents OOM
# kills on memory-constrained cloud build environments like GLM cloud)
ENV NODE_OPTIONS="--max-old-space-size=4096"

# Build Next.js with standalone output (configured in next.config.ts)
RUN npm run build

# ── Stage 2: Runner (Production) ───────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

# Set production environment
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Security: Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy only necessary files from builder
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma

# Copy standalone build output (next.config.ts has output: 'standalone')
# This includes a traced node_modules with only the needed packages.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copy Prisma client (already in standalone trace, but copy explicitly
# as a safety net in case the trace misses engine binaries)
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# Create data directory for SQLite with proper ownership
RUN mkdir -p /app/data && chown nextjs:nodejs /app/data

# Switch to non-root user
USER nextjs

# Expose port
EXPOSE 3000

# Health check using the dedicated health endpoint
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

# Start the application using standalone server
CMD ["node", "server.js"]
