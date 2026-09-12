#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# AcquisitionOS — Automated First-Time Setup Script
# ═══════════════════════════════════════════════════════════════════════════════
# Usage:
#   chmod +x setup.sh
#   ./setup.sh
#
# This script is idempotent — safe to run multiple times.
# Supports macOS (primary) and Linux (best-effort).
# ═══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

# ── Color Definitions ─────────────────────────────────────────────────────────
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
RESET='\033[0m'

CHECKMARK="${GREEN}✓${RESET}"
CROSSMARK="${RED}✗${RESET}"
WARNING="${YELLOW}⚠${RESET}"
ARROW="${CYAN}▸${RESET}"

# ── Counters for Summary ─────────────────────────────────────────────────────
PASS_COUNT=0
FAIL_COUNT=0
WARN_COUNT=0
SKIP_COUNT=0

# ── Project Root ──────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$SCRIPT_DIR"

# ── OS Detection ──────────────────────────────────────────────────────────────
OS="$(uname -s)"
IS_MACOS=false
IS_LINUX=false

if [[ "$OS" == "Darwin" ]]; then
    IS_MACOS=true
elif [[ "$OS" == "Linux" ]]; then
    IS_LINUX=true
else
    echo -e "${CROSSMARK} Unsupported operating system: $OS"
    echo "   This script only supports macOS and Linux."
    exit 1
fi

# ── Helper Functions ──────────────────────────────────────────────────────────

print_header() {
    echo ""
    echo -e "${BOLD}${CYAN}═══════════════════════════════════════════════════════════════════════${RESET}"
    echo -e "${BOLD}${CYAN}  $1${RESET}"
    echo -e "${BOLD}${CYAN}═══════════════════════════════════════════════════════════════════════${RESET}"
    echo ""
}

print_step() {
    echo -e "${ARROW} ${BOLD}$1${RESET}"
}

print_success() {
    echo -e "  ${CHECKMARK} $1"
    ((PASS_COUNT++))
}

print_fail() {
    echo -e "  ${CROSSMARK} $1"
    ((FAIL_COUNT++))
}

print_warn() {
    echo -e "  ${WARNING} $1"
    ((WARN_COUNT++))
}

print_skip() {
    echo -e "  ${DIM}⊘ $1${RESET}"
    ((SKIP_COUNT++))
}

print_info() {
    echo -e "  ${CYAN}ℹ $1${RESET}"
}

command_exists() {
    command -v "$1" &>/dev/null
}

version_gte() {
    # Returns 0 if $1 >= $2 (semantic version comparison, major.minor)
    local v1="$1" v2="$2"
    local IFS=.
    read -ra v1_parts <<< "$v1"
    read -ra v2_parts <<< "$v2"
    for i in 0 1 2; do
        local p1="${v1_parts[$i]:-0}"
        local p2="${v2_parts[$i]:-0}"
        if (( p1 > p2 )); then return 0; fi
        if (( p1 < p2 )); then return 1; fi
    done
    return 0
}

ask_yes_no() {
    local prompt="$1"
    local default="${2:-n}"
    local answer=""
    if [[ "$default" == "y" ]]; then
        prompt="$prompt [Y/n] "
    else
        prompt="$prompt [y/N] "
    fi
    read -r -p "$(echo -e "$prompt")" answer
    answer="${answer:-$default}"
    case "$answer" in
        [yY][eE][sS]|[yY]) return 0 ;;
        *) return 1 ;;
    esac
}

# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 1: PREREQUISITES CHECK & INSTALL
# ═══════════════════════════════════════════════════════════════════════════════

install_homebrew() {
    print_header "PHASE 1: Prerequisites Check & Install"

    # ── Homebrew ───────────────────────────────────────────────────────────
    print_step "Checking Homebrew..."
    if command_exists brew; then
        local brew_version
        brew_version=$(brew --version | head -1 | awk '{print $2}')
        print_success "Homebrew installed (v${brew_version})"
    else
        if $IS_MACOS; then
            print_info "Installing Homebrew..."
            /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
            # Add to PATH for Apple Silicon Macs
            if [[ -f /opt/homebrew/bin/brew ]]; then
                eval "$(/opt/homebrew/bin/brew shellenv)"
                echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile 2>/dev/null || true
            fi
            if command_exists brew; then
                print_success "Homebrew installed successfully"
            else
                print_fail "Homebrew installation failed"
                return 1
            fi
        elif $IS_LINUX; then
            print_info "Installing Homebrew (Linux)..."
            /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
            eval "$(/home/linuxbrew/.linuxbrew/bin/brew shellenv)"
            echo 'eval "$(/home/linuxbrew/.linuxbrew/bin/brew shellenv)"' >> ~/.bashrc 2>/dev/null || true
            if command_exists brew; then
                print_success "Homebrew installed successfully"
            else
                print_fail "Homebrew installation failed"
                return 1
            fi
        fi
    fi
}

install_git() {
    print_step "Checking Git..."
    if command_exists git; then
        local git_version
        git_version=$(git --version | awk '{print $3}')
        print_success "Git installed (v${git_version})"
    else
        print_info "Installing Git..."
        if command_exists brew; then
            brew install git
            print_success "Git installed via Homebrew"
        elif $IS_LINUX && command_exists apt-get; then
            sudo apt-get update -qq && sudo apt-get install -y -qq git
            print_success "Git installed via apt"
        else
            print_fail "Git not found and no package manager available"
        fi
    fi
}

install_node() {
    print_step "Checking Node.js 20+..."
    if command_exists node; then
        local node_version
        node_version=$(node --version | sed 's/v//')
        if version_gte "$node_version" "20.0.0"; then
            print_success "Node.js ${node_version} installed (meets 20+ requirement)"
        else
            print_warn "Node.js ${node_version} found, but version 20+ is required"
            print_info "Upgrading Node.js..."
            if command_exists nvm; then
                nvm install 20
                nvm use 20
                print_success "Node.js upgraded via nvm"
            elif command_exists brew; then
                brew upgrade node
                print_success "Node.js upgraded via Homebrew"
            else
                print_fail "Could not upgrade Node.js automatically"
            fi
        fi
    else
        print_info "Node.js not found. Installing..."
        # Try nvm first (preferred)
        if ! command_exists nvm; then
            print_info "Installing nvm (Node Version Manager)..."
            curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
            export NVM_DIR="$HOME/.nvm"
            [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
            [ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"
        fi
        if command_exists nvm; then
            nvm install 20
            nvm use 20
            nvm alias default 20
            print_success "Node.js installed via nvm"
        elif command_exists brew; then
            brew install node
            print_success "Node.js installed via Homebrew"
        else
            print_fail "Could not install Node.js"
        fi
    fi
}

install_bun() {
    print_step "Checking Bun..."
    if command_exists bun; then
        local bun_version
        bun_version=$(bun --version)
        print_success "Bun installed (v${bun_version})"
    else
        print_info "Installing Bun via curl..."
        curl -fsSL https://bun.sh/install | bash
        # Add to current session
        export BUN_INSTALL="$HOME/.bun"
        export PATH="$BUN_INSTALL/bin:$PATH"
        if command_exists bun; then
            print_success "Bun installed successfully"
        else
            print_fail "Bun installation failed. Try: curl -fsSL https://bun.sh/install | bash"
        fi
    fi
}

install_docker() {
    print_step "Checking Docker Desktop..."
    if command_exists docker; then
        if docker info &>/dev/null; then
            local docker_version
            docker_version=$(docker --version | awk '{print $3}' | sed 's/,//')
            print_success "Docker installed (v${docker_version}) and running"
        else
            print_warn "Docker installed but not running. Please start Docker Desktop."
            if $IS_MACOS; then
                print_info "You can start it from Applications or run: open -a Docker"
            fi
        fi
    else
        print_warn "Docker Desktop not found"
        echo -e "  ${YELLOW}Docker is optional but recommended for PostgreSQL and Redis.${RESET}"
        if ask_yes_no "  Would you like to install Docker Desktop?" "n"; then
            if $IS_MACOS; then
                print_info "Downloading Docker Desktop for Mac..."
                local docker_dmg="/tmp/Docker.dmg"
                if [[ "$(uname -m)" == "arm64" ]]; then
                    curl -fSL -o "$docker_dmg" "https://desktop.docker.com/mac/main/arm64/Docker.dmg"
                else
                    curl -fSL -o "$docker_dmg" "https://desktop.docker.com/mac/main/amd64/Docker.dmg"
                fi
                if [[ -f "$docker_dmg" ]]; then
                    print_info "Mounting Docker.dmg..."
                    hdiutil attach "$docker_dmg" -quiet
                    cp -R /Volumes/Docker/Docker.app /Applications/ 2>/dev/null || true
                    hdiutil detach /Volumes/Docker -quiet 2>/dev/null || true
                    rm -f "$docker_dmg"
                    print_info "Opening Docker Desktop..."
                    open -a Docker 2>/dev/null || true
                    print_success "Docker Desktop installed. It may take a moment to start."
                    print_info "Re-run this script after Docker is fully started."
                else
                    print_fail "Failed to download Docker Desktop"
                fi
            elif $IS_LINUX; then
                print_info "Installing Docker Engine for Linux..."
                curl -fsSL https://get.docker.com | sudo sh
                sudo usermod -aG docker "$USER"
                print_success "Docker Engine installed. You may need to log out/in for group changes."
            fi
        else
            print_skip "Docker Desktop installation skipped"
        fi
    fi
}

install_redis() {
    print_step "Checking Redis..."
    if command_exists redis-cli; then
        local redis_version
        redis_version=$(redis-cli --version | awk '{print $2}')
        print_success "Redis CLI installed (v${redis_version})"
    elif command_exists redis-server; then
        print_success "Redis server found"
    else
        if ask_yes_no "  Install Redis locally via Homebrew? (Not needed if using Docker)" "n"; then
            if command_exists brew; then
                brew install redis
                if $IS_MACOS; then
                    brew services start redis
                elif $IS_LINUX; then
                    sudo systemctl start redis 2>/dev/null || brew services start redis
                fi
                print_success "Redis installed and started via Homebrew"
            else
                print_fail "Homebrew not available to install Redis"
            fi
        else
            print_skip "Redis installation skipped (will need Docker or manual install)"
        fi
    fi
}

install_postgresql() {
    print_step "Checking PostgreSQL 16..."
    if command_exists psql; then
        local pg_version
        pg_version=$(psql --version | awk '{print $3}')
        if version_gte "$pg_version" "16.0"; then
            print_success "PostgreSQL installed (v${pg_version})"
        else
            print_warn "PostgreSQL ${pg_version} found, but version 16+ is recommended"
        fi
    else
        if ask_yes_no "  Install PostgreSQL 16 locally via Homebrew? (Not needed if using Docker or SQLite)" "n"; then
            if command_exists brew; then
                brew install postgresql@16
                brew link postgresql@16 --force 2>/dev/null || true
                if $IS_MACOS; then
                    brew services start postgresql@16
                elif $IS_LINUX; then
                    sudo systemctl start postgresql 2>/dev/null || brew services start postgresql@16
                fi
                print_success "PostgreSQL 16 installed and started via Homebrew"
            else
                print_fail "Homebrew not available to install PostgreSQL"
            fi
        else
            print_skip "PostgreSQL installation skipped (will use SQLite or Docker)"
        fi
    fi
}

install_stripe_cli() {
    print_step "Checking Stripe CLI..."
    if command_exists stripe; then
        local stripe_version
        stripe_version=$(stripe version 2>/dev/null | head -1 | awk '{print $2}' || echo "unknown")
        print_success "Stripe CLI installed (v${stripe_version})"
    else
        if ask_yes_no "  Install Stripe CLI? (Needed for webhook testing)" "n"; then
            if command_exists brew; then
                brew install stripe/stripe-cli/stripe
                print_success "Stripe CLI installed via Homebrew"
            else
                print_warn "Homebrew not available. Install manually from: https://stripe.com/docs/stripe-cli"
            fi
        else
            print_skip "Stripe CLI installation skipped"
        fi
    fi
}

install_jq() {
    print_step "Checking jq..."
    if command_exists jq; then
        local jq_version
        jq_version=$(jq --version | sed 's/jq-//')
        print_success "jq installed (v${jq_version})"
    else
        print_info "Installing jq..."
        if command_exists brew; then
            brew install jq
            print_success "jq installed via Homebrew"
        elif $IS_LINUX && command_exists apt-get; then
            sudo apt-get update -qq && sudo apt-get install -y -qq jq
            print_success "jq installed via apt"
        else
            print_fail "jq not found and no package manager available"
        fi
    fi
}

install_watchman() {
    print_step "Checking watchman (optional, for HMR)..."
    if command_exists watchman; then
        local wm_version
        wm_version=$(watchman version 2>/dev/null | jq -r '.version' 2>/dev/null || echo "unknown")
        print_success "watchman installed (v${wm_version})"
    else
        if ask_yes_no "  Install watchman for improved HMR? (optional)" "n"; then
            if command_exists brew; then
                brew install watchman
                print_success "watchman installed via Homebrew"
            else
                print_skip "watchman skipped (Homebrew not available)"
            fi
        else
            print_skip "watchman installation skipped"
        fi
    fi
}

run_prerequisites() {
    install_homebrew
    install_git
    install_node
    install_bun
    install_docker
    install_redis
    install_postgresql
    install_stripe_cli
    install_jq
    install_watchman
}

# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 2: PROJECT SETUP
# ═══════════════════════════════════════════════════════════════════════════════

setup_env_file() {
    print_step "Setting up .env.local..."
    local env_local="$PROJECT_ROOT/.env.local"
    local env_example="$PROJECT_ROOT/.env.example"

    if [[ -f "$env_local" ]]; then
        print_success ".env.local already exists"
    else
        if [[ -f "$env_example" ]]; then
            cp "$env_example" "$env_local"
            print_success "Copied .env.example to .env.local"
        else
            print_warn ".env.example not found; creating minimal .env.local"
            cat > "$env_local" <<'ENVEOF'
# AcquisitionOS — Auto-generated minimal environment
AUTH_DEV_MODE=false
DATABASE_URL=file:./db/custom.db
REDIS_URL=redis://localhost:6379
NEXTAUTH_URL=http://localhost:3000
NEXT_PUBLIC_APP_URL=http://localhost:3000
APP_URL=http://localhost:3000
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001
LOG_LEVEL=info
PRISMA_LOG=false
ENVEOF
            print_success "Created minimal .env.local"
        fi
    fi
}

generate_secrets() {
    print_step "Generating secrets..."

    local env_local="$PROJECT_ROOT/.env.local"

    if [[ ! -f "$env_local" ]]; then
        print_fail ".env.local not found — cannot generate secrets"
        return 1
    fi

    # Generate JWT_SECRET if missing
    if rg -q '^JWT_SECRET=\s*$' "$env_local" 2>/dev/null; then
        local jwt_secret
        jwt_secret=$(openssl rand -base64 48)
        if $IS_MACOS; then
            sed -i '' "s|^JWT_SECRET=.*|JWT_SECRET=${jwt_secret}|" "$env_local"
        else
            sed -i "s|^JWT_SECRET=.*|JWT_SECRET=${jwt_secret}|" "$env_local"
        fi
        print_success "Generated JWT_SECRET"
    else
        local existing_jwt
        existing_jwt=$(rg '^JWT_SECRET=(.+)$' "$env_local" 2>/dev/null | sed 's/^JWT_SECRET=//' || true)
        if [[ -n "$existing_jwt" ]]; then
            print_skip "JWT_SECRET already set"
        else
            # Fallback: just append
            local jwt_secret
            jwt_secret=$(openssl rand -base64 48)
            echo "JWT_SECRET=${jwt_secret}" >> "$env_local"
            print_success "Generated JWT_SECRET (appended)"
        fi
    fi

    # Generate NEXTAUTH_SECRET if missing
    if rg -q '^NEXTAUTH_SECRET=\s*$' "$env_local" 2>/dev/null; then
        local nextauth_secret
        nextauth_secret=$(openssl rand -base64 48)
        if $IS_MACOS; then
            sed -i '' "s|^NEXTAUTH_SECRET=.*|NEXTAUTH_SECRET=${nextauth_secret}|" "$env_local"
        else
            sed -i "s|^NEXTAUTH_SECRET=.*|NEXTAUTH_SECRET=${nextauth_secret}|" "$env_local"
        fi
        print_success "Generated NEXTAUTH_SECRET"
    else
        local existing_na
        existing_na=$(rg '^NEXTAUTH_SECRET=(.+)$' "$env_local" 2>/dev/null | sed 's/^NEXTAUTH_SECRET=//' || true)
        if [[ -n "$existing_na" ]]; then
            print_skip "NEXTAUTH_SECRET already set"
        else
            local nextauth_secret
            nextauth_secret=$(openssl rand -base64 48)
            echo "NEXTAUTH_SECRET=${nextauth_secret}" >> "$env_local"
            print_success "Generated NEXTAUTH_SECRET (appended)"
        fi
    fi

    # Generate CRON_SECRET if missing
    if rg -q '^CRON_SECRET=\s*$' "$env_local" 2>/dev/null; then
        local cron_secret
        cron_secret=$(openssl rand -hex 32)
        if $IS_MACOS; then
            sed -i '' "s|^CRON_SECRET=.*|CRON_SECRET=${cron_secret}|" "$env_local"
        else
            sed -i "s|^CRON_SECRET=.*|CRON_SECRET=${cron_secret}|" "$env_local"
        fi
        print_success "Generated CRON_SECRET"
    else
        local existing_cron
        existing_cron=$(rg '^CRON_SECRET=(.+)$' "$env_local" 2>/dev/null | sed 's/^CRON_SECRET=//' || true)
        if [[ -n "$existing_cron" ]] && [[ "$existing_cron" != "your-cron-secret-here" ]]; then
            print_skip "CRON_SECRET already set"
        else
            local cron_secret
            cron_secret=$(openssl rand -hex 32)
            if $IS_MACOS; then
                sed -i '' "s|^CRON_SECRET=.*|CRON_SECRET=${cron_secret}|" "$env_local"
            else
                sed -i "s|^CRON_SECRET=.*|CRON_SECRET=${cron_secret}|" "$env_local"
            fi
            print_success "Generated CRON_SECRET"
        fi
    fi
}

install_dependencies() {
    print_step "Installing Node.js dependencies with Bun..."
    if command_exists bun; then
        cd "$PROJECT_ROOT"
        bun install
        print_success "Dependencies installed (bun install)"
        cd - >/dev/null
    else
        print_fail "Bun not found — cannot install dependencies"
        print_info "Install Bun first: curl -fsSL https://bun.sh/install | bash"
    fi
}

generate_prisma_client() {
    print_step "Generating Prisma client..."
    cd "$PROJECT_ROOT"
    if bun run db:generate 2>/dev/null; then
        print_success "Prisma client generated"
    elif npx prisma generate 2>/dev/null; then
        print_success "Prisma client generated (via npx)"
    else
        print_fail "Failed to generate Prisma client"
    fi
    cd - >/dev/null
}

push_database_schema() {
    print_step "Pushing database schema..."
    cd "$PROJECT_ROOT"
    if bun run db:push 2>/dev/null; then
        print_success "Database schema pushed successfully"
    elif npx prisma db push 2>/dev/null; then
        print_success "Database schema pushed (via npx)"
    else
        print_warn "Database schema push failed — you may need to configure DATABASE_URL"
        print_info "Default is SQLite: file:./db/custom.db"
    fi
    cd - >/dev/null
}

install_mini_services() {
    print_step "Installing mini-service dependencies..."
    local services_dir="$PROJECT_ROOT/mini-services"
    local found_services=0

    if [[ -d "$services_dir" ]]; then
        for service_dir in "$services_dir"/*/; do
            if [[ -f "${service_dir}package.json" ]]; then
                local service_name
                service_name=$(basename "$service_dir")
                ((found_services++))
                print_info "Installing deps for: ${service_name}"
                cd "$service_dir"
                if command_exists bun; then
                    bun install 2>/dev/null && print_success "${service_name} deps installed" || print_warn "${service_name} deps install failed"
                else
                    npm install 2>/dev/null && print_success "${service_name} deps installed (npm)" || print_warn "${service_name} deps install failed"
                fi
                cd - >/dev/null
            fi
        done
    fi

    if [[ $found_services -eq 0 ]]; then
        print_skip "No mini-services found with package.json"
    fi
}

run_project_setup() {
    print_header "PHASE 2: Project Setup"
    setup_env_file
    generate_secrets
    install_dependencies
    generate_prisma_client
    push_database_schema
    install_mini_services
}

# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 3: DOCKER INFRASTRUCTURE (OPTIONAL)
# ═══════════════════════════════════════════════════════════════════════════════

setup_docker_infrastructure() {
    print_header "PHASE 3: Docker Infrastructure (Optional)"

    if ! command_exists docker; then
        print_skip "Docker not installed — skipping Docker infrastructure setup"
        print_info "You can use SQLite (default) and install Redis/Postgres locally instead."
        return
    fi

    if ! docker info &>/dev/null; then
        print_warn "Docker is installed but not running"
        print_info "Please start Docker Desktop and re-run this script."
        return
    fi

    echo -e "  ${CYAN}AcquisitionOS can use Docker for PostgreSQL and Redis, or run them natively.${RESET}"
    echo -e "  ${DIM}Default config uses SQLite (no Docker needed for basic development).${RESET}"
    echo ""

    if ask_yes_no "  Use Docker for PostgreSQL and Redis?" "n"; then
        local compose_file="$PROJECT_ROOT/docker-compose.yml"
        if [[ -f "$compose_file" ]]; then
            print_info "Starting Docker Compose (postgres + redis)..."
            cd "$PROJECT_ROOT"
            if docker compose up -d postgres redis 2>/dev/null; then
                print_success "Docker containers started (PostgreSQL + Redis)"
            elif docker-compose up -d postgres redis 2>/dev/null; then
                print_success "Docker containers started (docker-compose v1)"
            else
                print_fail "Failed to start Docker containers"
                print_info "Try manually: docker compose up -d postgres redis"
            fi
            cd - >/dev/null

            # Wait for containers to be healthy
            print_info "Waiting for containers to be healthy (up to 30s)..."
            local retries=0
            while [[ $retries -lt 15 ]]; do
                if docker compose -f "$compose_file" exec -T postgres pg_isready -U acquisitionos &>/dev/null; then
                    print_success "PostgreSQL container is ready"
                    break
                fi
                sleep 2
                ((retries++))
            done
            if [[ $retries -eq 15 ]]; then
                print_warn "PostgreSQL container may not be ready yet"
            fi

            # Offer to update DATABASE_URL
            local env_local="$PROJECT_ROOT/.env.local"
            if [[ -f "$env_local" ]]; then
                local current_db_url
                current_db_url=$(rg '^DATABASE_URL=' "$env_local" 2>/dev/null | sed 's/^DATABASE_URL=//' || true)
                if [[ "$current_db_url" == "file:"* ]]; then
                    echo ""
                    if ask_yes_no "  Update DATABASE_URL to use Docker PostgreSQL?" "y"; then
                        local new_url="postgresql://acquisitionos:acquisitionos_secret@localhost:5432/acquisitionos?schema=public"
                        if $IS_MACOS; then
                            sed -i '' "s|^DATABASE_URL=.*|DATABASE_URL=${new_url}|" "$env_local"
                        else
                            sed -i "s|^DATABASE_URL=.*|DATABASE_URL=${new_url}|" "$env_local"
                        fi
                        print_success "DATABASE_URL updated to Docker PostgreSQL"
                        # Re-push schema with new database
                        print_info "Re-pushing schema to PostgreSQL..."
                        cd "$PROJECT_ROOT"
                        bun run db:push 2>/dev/null || npx prisma db push 2>/dev/null || print_warn "Schema push to PostgreSQL failed"
                        cd - >/dev/null
                    fi
                else
                    print_skip "DATABASE_URL already configured for external database"
                fi
            fi
        else
            print_warn "docker-compose.yml not found at $compose_file"
            print_skip "Docker Compose setup skipped"
        fi
    else
        print_skip "Docker infrastructure setup skipped"
        echo ""
        echo -e "  ${DIM}If you want to use local services instead:${RESET}"
        echo -e "  ${DIM}  • SQLite is already configured by default (no action needed)${RESET}"
        echo -e "  ${DIM}  • For Redis: brew install redis && brew services start redis${RESET}"
        echo -e "  ${DIM}  • For PostgreSQL: brew install postgresql@16 && brew services start postgresql@16${RESET}"
    fi
}

# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 4: VERIFICATION
# ═══════════════════════════════════════════════════════════════════════════════

run_verification() {
    print_header "PHASE 4: Verification"

    local all_pass=true

    # ── Node.js Version ────────────────────────────────────────────────────
    print_step "Node.js version..."
    if command_exists node; then
        local node_v
        node_v=$(node --version)
        if version_gte "$(echo "$node_v" | sed 's/v//')" "20.0.0"; then
            print_success "Node.js ${node_v}"
        else
            print_fail "Node.js ${node_v} — version 20+ required"
            all_pass=false
        fi
    else
        print_fail "Node.js not found"
        all_pass=false
    fi

    # ── Bun Version ────────────────────────────────────────────────────────
    print_step "Bun version..."
    if command_exists bun; then
        local bun_v
        bun_v=$(bun --version)
        print_success "Bun v${bun_v}"
    else
        print_fail "Bun not found"
        all_pass=false
    fi

    # ── Docker ─────────────────────────────────────────────────────────────
    print_step "Docker status..."
    if command_exists docker; then
        if docker info &>/dev/null; then
            local docker_v
            docker_v=$(docker --version | awk '{print $3}' | sed 's/,//')
            print_success "Docker v${docker_v} (running)"
        else
            print_warn "Docker installed but NOT running"
        fi
    else
        print_skip "Docker not installed (optional)"
    fi

    # ── Prisma Client ──────────────────────────────────────────────────────
    print_step "Prisma client..."
    if [[ -d "$PROJECT_ROOT/node_modules/.prisma/client" ]]; then
        print_success "Prisma client generated"
    else
        print_warn "Prisma client not found — run: bun run db:generate"
        all_pass=false
    fi

    # ── .env.local ─────────────────────────────────────────────────────────
    print_step "Environment file..."
    if [[ -f "$PROJECT_ROOT/.env.local" ]]; then
        print_success ".env.local exists"

        # Check for required secrets
        local missing_secrets=0
        for secret in JWT_SECRET NEXTAUTH_SECRET CRON_SECRET; do
            local val
            val=$(rg "^${secret}=(.+)$" "$PROJECT_ROOT/.env.local" 2>/dev/null | sed "s/^${secret}=//" || true)
            if [[ -z "$val" ]] || [[ "$val" == "your-"* ]] || [[ "$val" == "whsec_YOUR"* ]]; then
                print_warn "${secret} is not set"
                ((missing_secrets++))
            fi
        done
        if [[ $missing_secrets -eq 0 ]]; then
            print_success "All required secrets are generated"
        fi
    else
        print_fail ".env.local not found"
        all_pass=false
    fi

    # ── Database Accessibility ──────────────────────────────────────────────
    print_step "Database accessibility..."
    local db_url
    db_url=$(rg '^DATABASE_URL=' "$PROJECT_ROOT/.env.local" 2>/dev/null | sed 's/^DATABASE_URL=//' || true)

    if [[ "$db_url" == "file:"* ]]; then
        # SQLite
        local db_path
        db_path=$(echo "$db_url" | sed 's|^file:||')
        if [[ -f "$PROJECT_ROOT/$db_path" ]]; then
            print_success "SQLite database accessible at ${db_path}"
        else
            print_warn "SQLite database file not found at ${db_path}"
            print_info "It will be created on first db:push"
        fi
    elif [[ "$db_url" == "postgresql://"* ]]; then
        # PostgreSQL
        if command_exists psql; then
            if psql "$db_url" -c "SELECT 1;" &>/dev/null; then
                print_success "PostgreSQL database is accessible"
            else
                print_warn "Cannot connect to PostgreSQL — check if container is running"
                print_info "Try: docker compose up -d postgres"
            fi
        else
            print_warn "psql not available to verify connection"
        fi
    else
        print_warn "DATABASE_URL not configured or unrecognized format"
    fi

    # ── Redis ──────────────────────────────────────────────────────────────
    print_step "Redis accessibility..."
    local redis_url
    redis_url=$(rg '^REDIS_URL=' "$PROJECT_ROOT/.env.local" 2>/dev/null | sed 's/^REDIS_URL=//' || true)
    if [[ -n "$redis_url" ]]; then
        if command_exists redis-cli; then
            if redis-cli -u "$redis_url" ping &>/dev/null; then
                print_success "Redis is accessible at ${redis_url}"
            else
                print_warn "Cannot connect to Redis at ${redis_url}"
                print_info "Try: brew services start redis  OR  docker compose up -d redis"
            fi
        else
            print_skip "redis-cli not available to verify connection"
        fi
    else
        print_skip "REDIS_URL not configured"
    fi

    # ── Mini-services ──────────────────────────────────────────────────────
    print_step "Mini-service dependencies..."
    local services_ok=true
    local services_dir="$PROJECT_ROOT/mini-services"
    if [[ -d "$services_dir" ]]; then
        for service_dir in "$services_dir"/*/; do
            if [[ -f "${service_dir}package.json" ]]; then
                local service_name
                service_name=$(basename "$service_dir")
                if [[ -d "${service_dir}node_modules" ]]; then
                    print_success "${service_name} — deps installed"
                else
                    print_warn "${service_name} — deps NOT installed"
                    services_ok=false
                fi
            fi
        done
    fi

    # ── Git Status ─────────────────────────────────────────────────────────
    print_step "Git repository..."
    if [[ -d "$PROJECT_ROOT/.git" ]]; then
        print_success "Git repository initialized"
    else
        print_skip "Not a Git repository (or .git not found)"
    fi

    return 0
}

# ═══════════════════════════════════════════════════════════════════════════════
# SUMMARY & NEXT STEPS
# ═══════════════════════════════════════════════════════════════════════════════

print_summary() {
    print_header "Setup Summary"

    echo -e "  ${GREEN}Passed:   ${PASS_COUNT}${RESET}"
    echo -e "  ${RED}Failed:   ${FAIL_COUNT}${RESET}"
    echo -e "  ${YELLOW}Warnings: ${WARN_COUNT}${RESET}"
    echo -e "  ${DIM}Skipped:  ${SKIP_COUNT}${RESET}"
    echo ""

    if [[ $FAIL_COUNT -gt 0 ]]; then
        echo -e "  ${RED}${BOLD}Some checks failed. Please review the output above.${RESET}"
        echo ""
    fi

    echo -e "  ${BOLD}${CYAN}Next Steps:${RESET}"
    echo ""
    echo -e "  ${ARROW} Start the development server:"
    echo -e "    ${DIM}cd $PROJECT_ROOT && bun run dev${RESET}"
    echo ""
    echo -e "  ${ARROW} Start mini-services (if needed):"
    echo -e "    ${DIM}cd mini-services/ws-service && bun run dev${RESET}"
    echo -e "    ${DIM}cd mini-services/realtime-service && bun run dev${RESET}"
    echo ""
    echo -e "  ${ARROW} Start Stripe webhook listener (for payments):"
    echo -e "    ${DIM}stripe listen --forward-to localhost:3000/api/payments/webhook/stripe${RESET}"
    echo ""
    echo -e "  ${ARROW} Configure remaining secrets in .env.local:"
    echo -e "    ${DIM}• SMTP credentials (for email/OTP delivery)${RESET}"
    echo -e "    ${DIM}• Google OAuth credentials (for Google Sign-In)${RESET}"
    echo -e "    ${DIM}• Stripe API keys (for payments)${RESET}"
    echo ""
    echo -e "  ${ARROW} Open the app in your browser:"
    echo -e "    ${DIM}http://localhost:3000${RESET}"
    echo ""

    if [[ $FAIL_COUNT -eq 0 ]]; then
        echo -e "  ${GREEN}${BOLD}✨ AcquisitionOS setup complete! You're ready to develop.${RESET}"
    else
        echo -e "  ${YELLOW}${BOLD}⚠ Setup completed with warnings. See above for details.${RESET}"
    fi
    echo ""
}

# ═══════════════════════════════════════════════════════════════════════════════
# MAIN ENTRY POINT
# ═══════════════════════════════════════════════════════════════════════════════

main() {
    echo ""
    echo -e "${BOLD}${CYAN}═══════════════════════════════════════════════════════════════════════${RESET}"
    echo -e "${BOLD}${CYAN}       AcquisitionOS — Automated First-Time Setup${RESET}"
    echo -e "${BOLD}${CYAN}═══════════════════════════════════════════════════════════════════════${RESET}"
    echo ""
    echo -e "  ${DIM}OS: ${OS}${RESET}"
    echo -e "  ${DIM}Project: ${PROJECT_ROOT}${RESET}"
    echo -e "  ${DIM}This script is idempotent — safe to run multiple times.${RESET}"
    echo ""

    if ! ask_yes_no "  Continue with setup?" "y"; then
        echo -e "\n  ${DIM}Setup cancelled. Run ./setup.sh anytime to start.${RESET}"
        exit 0
    fi

    run_prerequisites
    run_project_setup
    setup_docker_infrastructure
    run_verification
    print_summary
}

main "$@"
