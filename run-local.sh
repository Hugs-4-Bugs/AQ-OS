#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# AcquisitionOS — Local Development Starter
# ═══════════════════════════════════════════════════════════════════════════════
#
# Starts ALL local services in the correct order:
#   1. Docker infrastructure (PostgreSQL, Redis, Mailpit)
#   2. Wait for PostgreSQL and Redis to be healthy (with timeout)
#   3. Push Prisma schema if needed
#   4. Start realtime-service mini-service (port 3003) in background
#   5. Start Next.js dev server (port 3000) in foreground
#
# Usage:
#   ./run-local.sh                     # Start everything
#   ./run-local.sh --no-docker         # Skip Docker (use existing/SQLite)
#   ./run-local.sh --no-redis          # Skip Redis requirement
#   ./run-local.sh --skip-infra        # Skip Docker + Redis + Prisma push
#
# PID files:
#   /tmp/acquisitionos-nextjs.pid
#   /tmp/acquisitionos-realtime.pid
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
PID_DIR="/tmp"
NEXTJS_PID_FILE="${PID_DIR}/acquisitionos-nextjs.pid"
REALTIME_PID_FILE="${PID_DIR}/acquisitionos-realtime.pid"
HEALTH_TIMEOUT=60          # seconds to wait for each service
HEALTH_INTERVAL=2          # seconds between health checks

# ── Flags ─────────────────────────────────────────────────────────────────────
NO_DOCKER=false
NO_REDIS=false
SKIP_INFRA=false

# ── Parse Arguments ───────────────────────────────────────────────────────────
for arg in "$@"; do
  case "$arg" in
    --no-docker)   NO_DOCKER=true ;;
    --no-redis)    NO_REDIS=true ;;
    --skip-infra)  SKIP_INFRA=true; NO_DOCKER=true; NO_REDIS=true ;;
    -h|--help)
      echo -e "${BOLD}AcquisitionOS — Local Development Starter${NC}"
      echo ""
      echo "Usage: ./run-local.sh [OPTIONS]"
      echo ""
      echo "Options:"
      echo "  --no-docker    Skip Docker infrastructure (use existing/SQLite)"
      echo "  --no-redis     Skip Redis requirement check"
      echo "  --skip-infra   Skip Docker + Redis + Prisma push (quick start)"
      echo "  -h, --help     Show this help message"
      echo ""
      echo "PID files are written to /tmp/acquisitionos-*.pid"
      exit 0
      ;;
    *)
      echo -e "${RED}Unknown option: ${arg}${NC}"
      echo "Run './run-local.sh --help' for usage information."
      exit 1
      ;;
  esac
done

# ── Helper Functions ──────────────────────────────────────────────────────────

banner() {
  echo ""
  echo -e "${CYAN}╔══════════════════════════════════════════════════════════════╗${NC}"
  echo -e "${CYAN}║${NC}  ${BOLD}AcquisitionOS — Local Development Starter${NC}                  ${CYAN}║${NC}"
  echo -e "${CYAN}╚══════════════════════════════════════════════════════════════╝${NC}"
  echo ""
}

step() {
  local num="$1"
  local label="$2"
  echo -e "${BLUE}▸${NC} ${BOLD}Step ${num}:${NC} ${label}"
}

ok() {
  echo -e "  ${GREEN}✓${NC} $1"
}

warn() {
  echo -e "  ${YELLOW}⚠${NC} $1"
}

fail() {
  echo -e "  ${RED}✗${NC} $1"
}

info() {
  echo -e "  ${DIM}→${NC} $1"
}

cleanup_on_error() {
  echo ""
  echo -e "${RED}${BOLD}Error detected. Cleaning up...${NC}"
  # Kill realtime service if started
  if [[ -f "$REALTIME_PID_FILE" ]]; then
    local pid
    pid=$(cat "$REALTIME_PID_FILE" 2>/dev/null || echo "")
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
      warn "Killed realtime-service (PID $pid)"
    fi
    rm -f "$REALTIME_PID_FILE"
  fi
  echo -e "${YELLOW}Run './stop-local.sh --force' to clean up all services.${NC}"
  exit 1
}

trap cleanup_on_error ERR

wait_for_postgres() {
  local elapsed=0
  info "Waiting for PostgreSQL to be healthy (timeout: ${HEALTH_TIMEOUT}s)..."
  while (( elapsed < HEALTH_TIMEOUT )); do
    if docker exec acquisitionos-postgres pg_isready -U acquisitionos -d acquisitionos &>/dev/null; then
      ok "PostgreSQL is ready"
      return 0
    fi
    sleep "$HEALTH_INTERVAL"
    elapsed=$((elapsed + HEALTH_INTERVAL))
  done
  fail "PostgreSQL did not become healthy within ${HEALTH_TIMEOUT}s"
  return 1
}

wait_for_redis() {
  local elapsed=0
  info "Waiting for Redis to be healthy (timeout: ${HEALTH_TIMEOUT}s)..."
  while (( elapsed < HEALTH_TIMEOUT )); do
    if docker exec acquisitionos-redis redis-cli ping &>/dev/null; then
      ok "Redis is ready"
      return 0
    fi
    sleep "$HEALTH_INTERVAL"
    elapsed=$((elapsed + HEALTH_INTERVAL))
  done
  fail "Redis did not become healthy within ${HEALTH_TIMEOUT}s"
  return 1
}

wait_for_port() {
  local port="$1"
  local name="$2"
  local timeout="${3:-30}"
  local elapsed=0
  info "Waiting for ${name} on port ${port} (timeout: ${timeout}s)..."
  while (( elapsed < timeout )); do
    if lsof -i :"$port" -sTCP:LISTEN &>/dev/null; then
      ok "${name} is listening on port ${port}"
      return 0
    fi
    sleep 1
    elapsed=$((elapsed + 1))
  done
  fail "${name} did not start on port ${port} within ${timeout}s"
  return 1
}

# ── Main ──────────────────────────────────────────────────────────────────────

banner

# Show configuration
echo -e "  Configuration:"
echo -e "    Docker:      $([ "$NO_DOCKER" = true ] && echo -e "${YELLOW}SKIP${NC}" || echo -e "${GREEN}ON${NC}")"
echo -e "    Redis:       $([ "$NO_REDIS" = true ] && echo -e "${YELLOW}SKIP${NC}" || echo -e "${GREEN}ON${NC}")"
echo -e "    Infra:       $([ "$SKIP_INFRA" = true ] && echo -e "${YELLOW}SKIP${NC}" || echo -e "${GREEN}ON${NC}")"
echo -e "    Project dir: ${DIM}${PROJECT_DIR}${NC}"
echo ""

cd "$PROJECT_DIR"

# ── Step 1: Docker Infrastructure ────────────────────────────────────────────
step 1 "Docker Infrastructure"

if [[ "$NO_DOCKER" = true ]]; then
  warn "Skipping Docker (--no-docker / --skip-infra)"
else
  if ! command -v docker &>/dev/null; then
    fail "Docker is not installed or not in PATH"
    exit 1
  fi

  if ! docker info &>/dev/null; then
    fail "Docker daemon is not running"
    info "Start Docker Desktop or the Docker service and try again."
    exit 1
  fi

  if [[ -f "docker-compose.local.yml" ]]; then
    info "Starting Docker containers (postgres, redis, mailpit)..."
    docker compose -f docker-compose.local.yml up -d 2>&1 | while IFS= read -r line; do
      echo -e "    ${DIM}${line}${NC}"
    done
    ok "Docker containers started"
  else
    fail "docker-compose.local.yml not found in ${PROJECT_DIR}"
    exit 1
  fi
fi

# ── Step 2: Wait for Infrastructure ──────────────────────────────────────────
step 2 "Infrastructure Health Checks"

if [[ "$NO_DOCKER" = true ]]; then
  warn "Skipping health checks (--no-docker / --skip-infra)"
else
  # Wait for PostgreSQL
  if ! wait_for_postgres; then
    fail "Cannot continue without PostgreSQL"
    info "Check Docker logs: docker logs acquisitionos-postgres"
    exit 1
  fi

  # Wait for Redis
  if [[ "$NO_REDIS" = false ]]; then
    if ! wait_for_redis; then
      warn "Redis is not healthy — realtime-service may not work correctly"
      info "Continuing without Redis. Use --no-redis to skip this check."
    fi
  else
    warn "Skipping Redis health check (--no-redis)"
  fi

  # Check Mailpit (non-critical)
  if docker exec acquisitionos-mailpit echo "ok" &>/dev/null; then
    ok "Mailpit is running (SMTP: localhost:1025, UI: http://localhost:8025)"
  else
    warn "Mailpit is not running — email delivery will not work locally"
  fi
fi

# ── Step 3: Prisma Schema Push ───────────────────────────────────────────────
step 3 "Database Schema"

if [[ "$SKIP_INFRA" = true ]]; then
  warn "Skipping Prisma schema push (--skip-infra)"
else
  info "Pushing Prisma schema to database..."
  if bun run db:push 2>&1 | while IFS= read -r line; do
    echo -e "    ${DIM}${line}${NC}"
  done; then
    ok "Prisma schema is up to date"
  else
    warn "Prisma schema push failed — database may use existing schema"
    info "If this is a fresh database, check your DATABASE_URL in .env.local"
  fi
fi

# ── Step 4: Realtime Service ─────────────────────────────────────────────────
step 4 "Realtime Service (port 3003)"

# Check if port 3003 is already in use
if lsof -i :3003 -sTCP:LISTEN &>/dev/null; then
  warn "Port 3003 is already in use"
  existing_pid=$(lsof -t -i :3003 -sTCP:LISTEN 2>/dev/null | head -1 || echo "")
  if [[ -n "$existing_pid" ]]; then
    info "Existing process on port 3003: PID ${existing_pid}"
    echo "$existing_pid" > "$REALTIME_PID_FILE"
    ok "Using existing realtime-service (PID ${existing_pid})"
  fi
else
  if [[ -d "mini-services/realtime-service" ]]; then
    info "Installing realtime-service dependencies..."
    (cd mini-services/realtime-service && bun install 2>&1 | while IFS= read -r line; do
      echo -e "    ${DIM}${line}${NC}"
    done)

    info "Starting realtime-service..."
    (cd mini-services/realtime-service && bun --hot index.ts > /tmp/acquisitionos-realtime.log 2>&1) &
    realtime_pid=$!
    echo "$realtime_pid" > "$REALTIME_PID_FILE"

    # Wait for the service to start
    if wait_for_port 3003 "Realtime Service" 15; then
      ok "Realtime service started (PID ${realtime_pid})"
    else
      warn "Realtime service may not have started — check /tmp/acquisitionos-realtime.log"
    fi
  else
    warn "mini-services/realtime-service not found — skipping"
  fi
fi

# ── Step 5: Next.js Dev Server ───────────────────────────────────────────────
step 5 "Next.js Dev Server (port 3000)"

# Check if port 3000 is already in use
if lsof -i :3000 -sTCP:LISTEN &>/dev/null; then
  warn "Port 3000 is already in use"
  existing_pid=$(lsof -t -i :3000 -sTCP:LISTEN 2>/dev/null | head -1 || echo "")
  if [[ -n "$existing_pid" ]]; then
    info "Existing process on port 3000: PID ${existing_pid}"
    echo "$existing_pid" > "$NEXTJS_PID_FILE"
    ok "Using existing Next.js server (PID ${existing_pid})"
    echo ""
    echo -e "${GREEN}${BOLD}All services are running!${NC}"
    echo ""
    echo -e "  ${CYAN}Next.js:${NC}      http://localhost:3000"
    echo -e "  ${CYAN}Realtime:${NC}     http://localhost:3003"
    if [[ "$NO_DOCKER" = false ]]; then
      echo -e "  ${CYAN}Mailpit UI:${NC}   http://localhost:8025"
      echo -e "  ${CYAN}PostgreSQL:${NC}   localhost:5432"
      echo -e "  ${CYAN}Redis:${NC}        localhost:6379"
    fi
    echo ""
    echo -e "  ${DIM}Stop with: ./stop-local.sh${NC}"
    echo -e "  ${DIM}Check health: ./healthcheck.sh${NC}"
    echo ""
    exit 0
  fi
fi

# Summary before starting Next.js
echo ""
echo -e "${GREEN}${BOLD}Infrastructure is ready. Starting Next.js dev server...${NC}"
echo ""
echo -e "  ${CYAN}Next.js:${NC}      http://localhost:3000"
echo -e "  ${CYAN}Realtime:${NC}     http://localhost:3003"
if [[ "$NO_DOCKER" = false ]]; then
  echo -e "  ${CYAN}Mailpit UI:${NC}   http://localhost:8025"
  echo -e "  ${CYAN}PostgreSQL:${NC}   localhost:5432"
  echo -e "  ${CYAN}Redis:${NC}        localhost:6379"
fi
echo ""
echo -e "  ${DIM}Stop with: ./stop-local.sh${NC}"
echo -e "  ${DIM}Check health: ./healthcheck.sh${NC}"
echo ""
echo -e "${DIM}─────────────────────────────────────────────────────────────${NC}"
echo ""

# Start Next.js in the background and track its PID
# We run it in the foreground so Ctrl+C stops it
bun run dev &
nextjs_pid=$!
echo "$nextjs_pid" > "$NEXTJS_PID_FILE"

# Set up graceful shutdown on Ctrl+C
on_exit() {
  echo ""
  echo -e "${YELLOW}Stopping Next.js dev server...${NC}"
  kill "$nextjs_pid" 2>/dev/null || true
  wait "$nextjs_pid" 2>/dev/null || true
  rm -f "$NEXTJS_PID_FILE"
  echo -e "${YELLOW}Next.js stopped. Run './stop-local.sh' to stop all services.${NC}"
}
trap on_exit EXIT INT TERM

# Wait for Next.js to exit
wait "$nextjs_pid" 2>/dev/null || true
