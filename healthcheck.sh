#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# AcquisitionOS — Service Health Check
# ═══════════════════════════════════════════════════════════════════════════════
#
# Checks health of ALL AcquisitionOS services and prints a status report:
#   1. Next.js app:           curl http://localhost:3000/api/health
#   2. Realtime service:      check port 3003
#   3. PostgreSQL:            pg_isready or docker exec
#   4. Redis:                 redis-cli ping or docker exec
#   5. Mailpit:               curl http://localhost:8025
#   6. Stripe CLI:            check if process running
#   7. Database (Prisma):     check Prisma can connect
#   8. Environment:           verify .env.local exists and has required vars
#
# Usage:
#   ./healthcheck.sh              # Full report with colors
#   ./healthcheck.sh --quiet      # Just exit code (0=healthy, 1=issues)
#   ./healthcheck.sh --json       # Machine-readable JSON output
#
# Exit codes:
#   0 — All services healthy
#   1 — One or more services unhealthy
#
# ═══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

# ── Colors ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m' # No Color

# ── Constants ─────────────────────────────────────────────────────────────────
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TOTAL_SERVICES=8

# ── Flags ─────────────────────────────────────────────────────────────────────
QUIET=false
JSON_MODE=false

# ── Parse Arguments ───────────────────────────────────────────────────────────
for arg in "$@"; do
  case "$arg" in
    --quiet)  QUIET=true ;;
    --json)   JSON_MODE=true ;;
    -h|--help)
      echo -e "${BOLD}AcquisitionOS — Service Health Check${NC}"
      echo ""
      echo "Usage: ./healthcheck.sh [OPTIONS]"
      echo ""
      echo "Options:"
      echo "  --quiet    Only output exit code (0=healthy, 1=issues)"
      echo "  --json     Machine-readable JSON output"
      echo "  -h, --help Show this help message"
      echo ""
      echo "Checks ${TOTAL_SERVICES} services: Next.js, Realtime, PostgreSQL, Redis,"
      echo "Mailpit, Stripe CLI, Database (Prisma), Environment"
      exit 0
      ;;
    *)
      echo -e "${RED}Unknown option: ${arg}${NC}" >&2
      exit 1
      ;;
  esac
done

cd "$PROJECT_DIR"

# ── Result Tracking ───────────────────────────────────────────────────────────
# Each check function sets: check_status, check_url, check_notes
# Status: "healthy", "unhealthy", "warning"

declare -a SERVICE_NAMES=()
declare -a SERVICE_STATUSES=()
declare -a SERVICE_URLS=()
declare -a SERVICE_NOTES=()

add_result() {
  local name="$1"
  local status="$2"
  local url="$3"
  local notes="$4"
  SERVICE_NAMES+=("$name")
  SERVICE_STATUSES+=("$status")
  SERVICE_URLS+=("$url")
  SERVICE_NOTES+=("$notes")
}

# ── Health Check Functions ────────────────────────────────────────────────────

check_nextjs() {
  local name="Next.js App"
  local url="http://localhost:3000"
  local status="unhealthy"
  local notes=""

  local http_code
  http_code=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 --max-time 10 "http://localhost:3000/api/health" 2>/dev/null) || true

  if [[ "$http_code" == "200" ]]; then
    status="healthy"
    notes="HTTP 200 — API responding"
  elif [[ "$http_code" == "503" ]]; then
    status="warning"
    notes="HTTP 503 — App up but degraded (check DB/Redis)"
  elif [[ "$http_code" == "000" ]]; then
    status="unhealthy"
    notes="Connection refused — server not running"
  else
    status="unhealthy"
    notes="HTTP ${http_code} — unexpected response"
  fi

  add_result "$name" "$status" "$url" "$notes"
}

check_realtime() {
  local name="Realtime Service"
  local url="localhost:3003"
  local status="unhealthy"
  local notes=""

  if lsof -i :3003 -sTCP:LISTEN &>/dev/null; then
    # Try to hit the health endpoint
    local http_code
    http_code=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 --max-time 10 "http://localhost:3003/health" 2>/dev/null) || true

    if [[ "$http_code" == "200" ]]; then
      status="healthy"
      notes="Socket.IO healthy — port 3003 listening"
    else
      status="warning"
      notes="Port 3003 listening but health check returned HTTP ${http_code}"
    fi
  else
    status="unhealthy"
    notes="Not listening on port 3003"
  fi

  add_result "$name" "$status" "$url" "$notes"
}

check_postgres() {
  local name="PostgreSQL"
  local url="localhost:5432"
  local status="unhealthy"
  local notes=""

  # Try docker exec first
  if command -v docker &>/dev/null && docker info &>/dev/null 2>&1; then
    if docker exec acquisitionos-postgres pg_isready -U acquisitionos -d acquisitionos &>/dev/null; then
      status="healthy"
      notes="PostgreSQL ready (Docker container)"
    elif docker ps --filter "name=acquisitionos-postgres" --format "{{.Names}}" | grep -q "acquisitionos-postgres"; then
      status="unhealthy"
      notes="Container running but PostgreSQL not ready"
    else
      # Try pg_isready directly (might be installed locally)
      if command -v pg_isready &>/dev/null; then
        if pg_isready -h localhost -p 5432 -U acquisitionos -d acquisitionos &>/dev/null; then
          status="healthy"
          notes="PostgreSQL ready (local)"
        else
          status="unhealthy"
          notes="Docker container not found, local PostgreSQL not ready"
        fi
      else
        status="unhealthy"
        notes="Docker container not running"
      fi
    fi
  else
    # No Docker — try pg_isready
    if command -v pg_isready &>/dev/null; then
      if pg_isready -h localhost -p 5432 -U acquisitionos -d acquisitionos &>/dev/null; then
        status="healthy"
        notes="PostgreSQL ready (local)"
      else
        status="unhealthy"
        notes="PostgreSQL not ready (no Docker, pg_isready failed)"
      fi
    else
      # Check if port is open
      if lsof -i :5432 -sTCP:LISTEN &>/dev/null; then
        status="healthy"
        notes="Port 5432 listening (likely PostgreSQL)"
      else
        status="unhealthy"
        notes="PostgreSQL not available (no Docker, no local)"
      fi
    fi
  fi

  add_result "$name" "$status" "$url" "$notes"
}

check_redis() {
  local name="Redis"
  local url="localhost:6379"
  local status="unhealthy"
  local notes=""

  # Try docker exec first
  if command -v docker &>/dev/null && docker info &>/dev/null 2>&1; then
    if docker exec acquisitionos-redis redis-cli ping &>/dev/null; then
      status="healthy"
      notes="Redis PONG (Docker container)"
    elif docker ps --filter "name=acquisitionos-redis" --format "{{.Names}}" | grep -q "acquisitionos-redis"; then
      status="unhealthy"
      notes="Container running but Redis not responding"
    else
      # Try redis-cli directly
      if command -v redis-cli &>/dev/null; then
        if redis-cli -h localhost -p 6379 ping &>/dev/null; then
          status="healthy"
          notes="Redis PONG (local)"
        else
          status="unhealthy"
          notes="Docker container not found, local Redis not responding"
        fi
      else
        status="unhealthy"
        notes="Docker container not running"
      fi
    fi
  else
    # No Docker — try redis-cli
    if command -v redis-cli &>/dev/null; then
      if redis-cli -h localhost -p 6379 ping &>/dev/null; then
        status="healthy"
        notes="Redis PONG (local)"
      else
        status="unhealthy"
        notes="Redis not responding"
      fi
    else
      # Check if port is open
      if lsof -i :6379 -sTCP:LISTEN &>/dev/null; then
        status="healthy"
        notes="Port 6379 listening (likely Redis)"
      else
        status="unhealthy"
        notes="Redis not available (no Docker, no local)"
      fi
    fi
  fi

  add_result "$name" "$status" "$url" "$notes"
}

check_mailpit() {
  local name="Mailpit"
  local url="http://localhost:8025"
  local status="unhealthy"
  local notes=""

  local http_code
  http_code=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 --max-time 10 "http://localhost:8025" 2>/dev/null) || true

  if [[ "$http_code" =~ ^2 ]]; then
    status="healthy"
    notes="Mailpit UI responding (SMTP: localhost:1025)"
  elif [[ "$http_code" =~ ^3 ]]; then
    status="healthy"
    notes="Mailpit responding with redirect"
  elif [[ "$http_code" == "000" ]]; then
    status="unhealthy"
    notes="Not running — email delivery won't work locally"
  else
    status="unhealthy"
    notes="HTTP ${http_code}"
  fi

  add_result "$name" "$status" "$url" "$notes"
}

check_stripe_cli() {
  local name="Stripe CLI"
  local url="—"
  local status="unhealthy"
  local notes=""

  # Check if stripe process is running
  if pgrep -f "stripe listen" &>/dev/null || pgrep -f "stripe start" &>/dev/null; then
    status="healthy"
    notes="Stripe CLI listener running"
  elif pgrep -f "stripe" &>/dev/null; then
    status="warning"
    notes="Stripe process found (may not be forwarding webhooks)"
  else
    status="warning"
    notes="Not running — webhook forwarding disabled"
  fi

  add_result "$name" "$status" "$url" "$notes"
}

check_database_prisma() {
  local name="Database (Prisma)"
  local url="file:./db/custom.db"
  local status="unhealthy"
  local notes=""

  # Determine the DATABASE_URL
  local db_url=""
  if [[ -f ".env.local" ]]; then
    db_url=$(grep "^DATABASE_URL=" .env.local 2>/dev/null | head -1 | cut -d'=' -f2- || echo "")
  fi

  if [[ -n "$db_url" ]]; then
    url="$db_url"
    # Truncate for display
    if [[ ${#db_url} -gt 40 ]]; then
      url="${db_url:0:37}..."
    fi
  fi

  # Try to run a Prisma query
  if command -v bun &>/dev/null; then
    local result
    result=$(bun run -e "
      const { PrismaClient } = require('@prisma/client');
      const prisma = new PrismaClient();
      prisma.user.count({ take: 1 })
        .then(() => { console.log('OK'); prisma.\$disconnect(); })
        .catch((e) => { console.log('ERROR: ' + e.message); prisma.\$disconnect(); });
    " 2>/dev/null || echo "ERROR")

    if [[ "$result" == *"OK"* ]]; then
      status="healthy"
      notes="Prisma can connect and query"
    else
      status="unhealthy"
      notes="Prisma connection failed"
    fi
  else
    # Fallback: check if SQLite file exists
    if [[ "$db_url" == file:* ]]; then
      local db_path="${db_url#file:}"
      if [[ -f "$db_path" ]]; then
        status="healthy"
        notes="SQLite file exists (${db_path})"
      else
        status="unhealthy"
        notes="SQLite file not found (${db_path})"
      fi
    else
      status="warning"
      notes="Cannot verify (bun not available)"
    fi
  fi

  add_result "$name" "$status" "$url" "$notes"
}

check_environment() {
  local name="Environment"
  local url=".env.local"
  local status="unhealthy"
  local notes=""

  if [[ ! -f ".env.local" ]]; then
    notes="Missing .env.local — copy from .env.example"
    add_result "$name" "$status" "$url" "$notes"
    return
  fi

  # Required variables (critical ones)
  local required_vars=("JWT_SECRET" "NEXTAUTH_SECRET" "DATABASE_URL")
  # Important but optional
  local recommended_vars=("REDIS_URL" "SMTP_HOST" "NEXT_PUBLIC_APP_URL" "STRIPE_SECRET_KEY" "GOOGLE_CLIENT_ID")

  local missing_required=()
  local missing_recommended=()

  for var in "${required_vars[@]}"; do
    local value
    value=$(grep "^${var}=" .env.local 2>/dev/null | head -1 | cut -d'=' -f2- || echo "")
    if [[ -z "$value" ]] || [[ "$value" == your_* ]] || [[ "$value" == YOUR_* ]]; then
      missing_required+=("$var")
    fi
  done

  for var in "${recommended_vars[@]}"; do
    local value
    value=$(grep "^${var}=" .env.local 2>/dev/null | head -1 | cut -d'=' -f2- || echo "")
    if [[ -z "$value" ]] || [[ "$value" == your_* ]] || [[ "$value" == YOUR_* ]]; then
      missing_recommended+=("$var")
    fi
  done

  if [[ ${#missing_required[@]} -gt 0 ]]; then
    status="unhealthy"
    notes="Missing required: ${missing_required[*]}"
  elif [[ ${#missing_recommended[@]} -gt 0 ]]; then
    status="warning"
    notes="Missing optional: ${missing_recommended[*]}"
  else
    status="healthy"
    notes="All required and recommended vars set"
  fi

  add_result "$name" "$status" "$url" "$notes"
}

# ── Run All Checks ────────────────────────────────────────────────────────────

check_nextjs
check_realtime
check_postgres
check_redis
check_mailpit
check_stripe_cli
check_database_prisma
check_environment

# ── Calculate Summary ─────────────────────────────────────────────────────────

healthy_count=0
warning_count=0
unhealthy_count=0

for i in "${!SERVICE_STATUSES[@]}"; do
  case "${SERVICE_STATUSES[$i]}" in
    healthy)   healthy_count=$((healthy_count + 1)) ;;
    warning)   warning_count=$((warning_count + 1)) ;;
    unhealthy) unhealthy_count=$((unhealthy_count + 1)) ;;
  esac
done

# ── Output ────────────────────────────────────────────────────────────────────

# Quiet mode — just exit
if [[ "$QUIET" = true ]]; then
  if [[ "$unhealthy_count" -gt 0 ]]; then
    exit 1
  else
    exit 0
  fi
fi

# JSON mode
if [[ "$JSON_MODE" = true ]]; then
  echo "{"
  echo "  \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\","
  echo "  \"summary\": {"
  echo "    \"total\": ${TOTAL_SERVICES},"
  echo "    \"healthy\": ${healthy_count},"
  echo "    \"warning\": ${warning_count},"
  echo "    \"unhealthy\": ${unhealthy_count}"
  echo "  },"
  echo "  \"services\": ["

  for i in "${!SERVICE_NAMES[@]}"; do
    comma=","
    if [[ "$i" -eq $(( ${#SERVICE_NAMES[@]} - 1 )) ]]; then
      comma=""
    fi

    name="${SERVICE_NAMES[$i]}"
    status="${SERVICE_STATUSES[$i]}"
    url="${SERVICE_URLS[$i]}"
    notes="${SERVICE_NOTES[$i]}"

    # Escape quotes in notes
    notes="${notes//\"/\\\"}"

    echo "    {"
    echo "      \"name\": \"${name}\","
    echo "      \"status\": \"${status}\","
    echo "      \"url\": \"${url}\","
    echo "      \"notes\": \"${notes}\""
    echo -n "    }${comma}"
    echo ""
  done

  echo "  ]"
  echo "}"

  if [[ "$unhealthy_count" -gt 0 ]]; then
    exit 1
  else
    exit 0
  fi
fi

# ── Normal (formatted table) output ──────────────────────────────────────────

echo ""
echo -e "${CYAN}╔══════════════════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║${NC}  ${BOLD}AcquisitionOS — Service Health Report${NC}                                        ${CYAN}║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Table header
printf "  ${BOLD}%-20s %-12s %-30s %s${NC}\n" "SERVICE" "STATUS" "URL/PORT" "NOTES"
printf "  %s\n" "$(printf '%.0s─' {1..85})"

# Table rows
for i in "${!SERVICE_NAMES[@]}"; do
  name="${SERVICE_NAMES[$i]}"
  status="${SERVICE_STATUSES[$i]}"
  url="${SERVICE_URLS[$i]}"
  notes="${SERVICE_NOTES[$i]}"

  # Truncate long values
  if [[ ${#url} -gt 28 ]]; then
    url="${url:0:25}..."
  fi
  if [[ ${#notes} -gt 35 ]]; then
    notes="${notes:0:32}..."
  fi

  # Colorize status
  case "$status" in
    healthy)
      status_display="${GREEN}✓ healthy${NC}  "
      ;;
    warning)
      status_display="${YELLOW}⚠ warning${NC}  "
      ;;
    unhealthy)
      status_display="${RED}✗ unhealthy${NC}"
      ;;
  esac

  printf "  %-20s %b %-28s %s\n" "$name" "$status_display" "$url" "$notes"
done

printf "  %s\n" "$(printf '%.0s─' {1..85})"

# Summary
echo ""
if [[ "$unhealthy_count" -gt 0 ]]; then
  echo -e "  ${RED}${BOLD}✗ ${unhealthy_count} unhealthy${NC}, ${YELLOW}${warning_count} warning${NC}, ${GREEN}${healthy_count} healthy${NC} — ${BOLD}${healthy_count}/${TOTAL_SERVICES} services healthy${NC}"
elif [[ "$warning_count" -gt 0 ]]; then
  echo -e "  ${YELLOW}${BOLD}⚠ ${warning_count} warning${NC}, ${GREEN}${healthy_count} healthy${NC} — ${BOLD}${healthy_count}/${TOTAL_SERVICES} services healthy${NC}"
else
  echo -e "  ${GREEN}${BOLD}✓ All ${TOTAL_SERVICES} services healthy${NC}"
fi
echo ""

# Troubleshooting hints
if [[ "$unhealthy_count" -gt 0 ]] || [[ "$warning_count" -gt 0 ]]; then
  echo -e "  ${DIM}Troubleshooting:${NC}"
  echo -e "  ${DIM}  • Start services:   ./run-local.sh${NC}"
  echo -e "  ${DIM}  • Restart services: ./stop-local.sh --force && ./run-local.sh${NC}"
  echo -e "  ${DIM}  • Docker logs:      docker logs acquisitionos-postgres${NC}"
  echo -e "  ${DIM}  • Realtime logs:    tail -f /tmp/acquisitionos-realtime.log${NC}"
  echo ""
fi

# Exit code
if [[ "$unhealthy_count" -gt 0 ]]; then
  exit 1
else
  exit 0
fi
