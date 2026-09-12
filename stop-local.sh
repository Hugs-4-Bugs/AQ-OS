#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# AcquisitionOS — Local Development Stopper
# ═══════════════════════════════════════════════════════════════════════════════
#
# Stops ALL running AcquisitionOS services:
#   1. Stop Next.js dev server
#   2. Stop realtime-service
#   3. Stop Docker containers
#   4. Kill any remaining processes on ports 3000, 3003
#   5. Clean up PID files
#
# Usage:
#   ./stop-local.sh              # Stop with confirmation
#   ./stop-local.sh --force      # Stop without confirmation
#   ./stop-local.sh --keep-docker  # Stop services but keep Docker running
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

# ── Flags ─────────────────────────────────────────────────────────────────────
FORCE=false
KEEP_DOCKER=false

# ── Parse Arguments ───────────────────────────────────────────────────────────
for arg in "$@"; do
  case "$arg" in
    --force)       FORCE=true ;;
    --keep-docker) KEEP_DOCKER=true ;;
    -h|--help)
      echo -e "${BOLD}AcquisitionOS — Local Development Stopper${NC}"
      echo ""
      echo "Usage: ./stop-local.sh [OPTIONS]"
      echo ""
      echo "Options:"
      echo "  --force        Stop without confirmation prompt"
      echo "  --keep-docker  Stop services but keep Docker containers running"
      echo "  -h, --help     Show this help message"
      echo ""
      echo "PID files are read from /tmp/acquisitionos-*.pid"
      exit 0
      ;;
    *)
      echo -e "${RED}Unknown option: ${arg}${NC}"
      echo "Run './stop-local.sh --help' for usage information."
      exit 1
      ;;
  esac
done

# ── Helper Functions ──────────────────────────────────────────────────────────

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

stop_by_pid_file() {
  local pid_file="$1"
  local service_name="$2"

  if [[ ! -f "$pid_file" ]]; then
    warn "No PID file for ${service_name} (${pid_file})"
    return 1
  fi

  local pid
  pid=$(cat "$pid_file" 2>/dev/null || echo "")

  if [[ -z "$pid" ]]; then
    warn "PID file is empty for ${service_name}"
    rm -f "$pid_file"
    return 1
  fi

  if kill -0 "$pid" 2>/dev/null; then
    info "Stopping ${service_name} (PID ${pid})..."
    kill "$pid" 2>/dev/null || true

    # Wait for graceful shutdown (up to 5 seconds)
    local waited=0
    while kill -0 "$pid" 2>/dev/null && (( waited < 5 )); do
      sleep 1
      waited=$((waited + 1))
    done

    # Force kill if still running
    if kill -0 "$pid" 2>/dev/null; then
      warn "${service_name} did not stop gracefully, force killing..."
      kill -9 "$pid" 2>/dev/null || true
    fi

    ok "${service_name} stopped (was PID ${pid})"
  else
    warn "${service_name} process (PID ${pid}) is not running"
  fi

  rm -f "$pid_file"
  return 0
}

kill_port() {
  local port="$1"
  local service_name="$2"

  if ! lsof -i :"$port" -sTCP:LISTEN &>/dev/null; then
    return 1
  fi

  local pids
  pids=$(lsof -t -i :"$port" -sTCP:LISTEN 2>/dev/null || echo "")

  if [[ -z "$pids" ]]; then
    return 1
  fi

  info "Killing ${service_name} on port ${port} (PIDs: ${pids//$'\n'/,})..."
  for pid in $pids; do
    kill "$pid" 2>/dev/null || true
  done

  # Wait briefly
  sleep 2

  # Force kill if still running
  for pid in $pids; do
    if kill -0 "$pid" 2>/dev/null; then
      kill -9 "$pid" 2>/dev/null || true
    fi
  done

  ok "Port ${port} (${service_name}) freed"
  return 0
}

# ── Main ──────────────────────────────────────────────────────────────────────

echo ""
echo -e "${CYAN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║${NC}  ${BOLD}AcquisitionOS — Local Development Stopper${NC}                  ${CYAN}║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

cd "$PROJECT_DIR"

# ── Confirm ───────────────────────────────────────────────────────────────────
if [[ "$FORCE" = false ]]; then
  echo -e "  ${YELLOW}This will stop ALL AcquisitionOS services:${NC}"
  echo -e "    • Next.js dev server (port 3000)"
  echo -e "    • Realtime service (port 3003)"
  if [[ "$KEEP_DOCKER" = false ]]; then
    echo -e "    • Docker containers (PostgreSQL, Redis, Mailpit)"
  else
    echo -e "    • Docker containers: ${DIM}KEEP RUNNING (--keep-docker)${NC}"
  fi
  echo ""
  read -r -p "  Continue? [y/N] " response
  case "$response" in
    [yY][eE][sS]|[yY]) ;;
    *) echo -e "  ${DIM}Cancelled.${NC}"; exit 0 ;;
  esac
  echo ""
fi

# ── Step 1: Stop Next.js Dev Server ──────────────────────────────────────────
echo -e "${BLUE}▸${NC} ${BOLD}Stopping Next.js dev server${NC}"

if ! stop_by_pid_file "$NEXTJS_PID_FILE" "Next.js"; then
  # Fallback: try to kill by port
  if kill_port 3000 "Next.js"; then
    ok "Next.js stopped (via port kill)"
  else
    warn "Next.js is not running"
  fi
fi

# ── Step 2: Stop Realtime Service ────────────────────────────────────────────
echo -e "${BLUE}▸${NC} ${BOLD}Stopping realtime service${NC}"

if ! stop_by_pid_file "$REALTIME_PID_FILE" "Realtime Service"; then
  # Fallback: try to kill by port
  if kill_port 3003 "Realtime Service"; then
    ok "Realtime service stopped (via port kill)"
  else
    warn "Realtime service is not running"
  fi
fi

# ── Step 3: Stop Docker Containers ───────────────────────────────────────────
echo -e "${BLUE}▸${NC} ${BOLD}Stopping Docker containers${NC}"

if [[ "$KEEP_DOCKER" = true ]]; then
  warn "Keeping Docker containers running (--keep-docker)"
else
  if command -v docker &>/dev/null && docker info &>/dev/null; then
    # Check if any AcquisitionOS containers are running
    running_containers=$(docker ps --filter "name=acquisitionos-" --format "{{.Names}}" 2>/dev/null || echo "")

    if [[ -n "$running_containers" ]]; then
      info "Running containers: ${running_containers//$'\n'/, }"

      if [[ -f "docker-compose.local.yml" ]]; then
        info "Stopping via docker-compose..."
        docker compose -f docker-compose.local.yml down 2>&1 | while IFS= read -r line; do
          echo -e "    ${DIM}${line}${NC}"
        done
        ok "Docker containers stopped"
      else
        # Fallback: stop containers individually
        for container in $running_containers; do
          info "Stopping ${container}..."
          docker stop "$container" 2>/dev/null || true
          docker rm "$container" 2>/dev/null || true
        done
        ok "Docker containers stopped"
      fi
    else
      warn "No AcquisitionOS Docker containers are running"
    fi
  else
    warn "Docker is not available — skipping"
  fi
fi

# ── Step 4: Kill Remaining Processes on Ports ────────────────────────────────
echo -e "${BLUE}▸${NC} ${BOLD}Checking for remaining processes${NC}"

remaining=0

for port in 3000 3003; do
  service_name=""
  case "$port" in
    3000) service_name="Next.js" ;;
    3003) service_name="Realtime Service" ;;
  esac

  if lsof -i :"$port" -sTCP:LISTEN &>/dev/null; then
    warn "Process still listening on port ${port} (${service_name})"
    if kill_port "$port" "$service_name"; then
      ok "Killed remaining process on port ${port}"
    else
      fail "Could not kill process on port ${port}"
      remaining=$((remaining + 1))
    fi
  fi
done

if [[ "$remaining" -eq 0 ]]; then
  ok "No remaining processes found"
fi

# ── Step 5: Clean Up PID Files ───────────────────────────────────────────────
echo -e "${BLUE}▸${NC} ${BOLD}Cleaning up PID files${NC}"

cleaned=0
for pid_file in "$PID_DIR"/acquisitionos-*.pid; do
  if [[ -f "$pid_file" ]]; then
    rm -f "$pid_file"
    cleaned=$((cleaned + 1))
  fi
done

if [[ "$cleaned" -gt 0 ]]; then
  ok "Cleaned up ${cleaned} PID file(s)"
else
  warn "No PID files to clean up"
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
if [[ "$remaining" -gt 0 ]]; then
  echo -e "${YELLOW}${BOLD}⚠ Stopped with ${remaining} issue(s)${NC}"
  echo -e "  Some processes could not be terminated. Try:"
  echo -e "    ${DIM}lsof -i :3000 -i :3003${NC}"
  echo -e "    ${DIM}kill -9 <PID>${NC}"
else
  echo -e "${GREEN}${BOLD}✓ All AcquisitionOS services stopped${NC}"
fi
echo ""
