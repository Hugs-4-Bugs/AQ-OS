# =============================================================================
# AcquisitionOS — Makefile for Local Development
# =============================================================================
# A comprehensive task runner for the AcquisitionOS monorepo.
# Run `make help` to see all available targets.
# =============================================================================

# ── Shell Configuration ──────────────────────────────────────────────────────
SHELL := /bin/bash
.DEFAULT_GOAL := help

# ── Color Codes ──────────────────────────────────────────────────────────────
RESET   := \033[0m
BOLD    := \033[1m
DIM     := \033[2m
RED     := \033[31m
GREEN   := \033[32m
YELLOW  := \033[33m
BLUE    := \033[34m
MAGENTA := \033[35m
CYAN    := \033[36m
WHITE   := \033[37m

# ── Icons ────────────────────────────────────────────────────────────────────
CHECK   := "\u2713"
ARROW   := "\u25B6"
WARN    := "\u26A0"
CROSS   := "\u2717"

# ── Project Paths ────────────────────────────────────────────────────────────
ROOT_DIR       := $(shell pwd)
NEXT_DIR       := $(ROOT_DIR)
BACKEND_DIR    := $(ROOT_DIR)/backend
REALTIME_DIR   := $(ROOT_DIR)/mini-services/realtime-service
PROXY_DIR      := $(ROOT_DIR)/mini-services/proxy
SCRIPTS_DIR    := $(ROOT_DIR)/scripts
PRISMA_DIR     := $(ROOT_DIR)/prisma
DB_DIR         := $(ROOT_DIR)/db

# ── Docker Compose ───────────────────────────────────────────────────────────
DC_LOCAL := docker compose -f docker-compose.local.yml

# ── Ports ────────────────────────────────────────────────────────────────────
PORT_NEXT     := 3000
PORT_PROXY    := 3001
PORT_REALTIME := 3003
PORT_BACKEND  := 8000
PORT_REDIS    := 6379
PORT_POSTGRES := 5432
PORT_MAILPIT  := 8025

# =============================================================================
# Setup
# =============================================================================

.PHONY: setup install install-backend env secrets

setup: ## Full first-time setup (install deps, setup DB, copy env)
	@echo -e "$(BOLD)$(CYAN)===============================================================================$(RESET)"
	@echo -e "$(BOLD)$(CYAN) AcquisitionOS - First-Time Setup$(RESET)"
	@echo -e "$(BOLD)$(CYAN)===============================================================================$(RESET)"
	@echo ""
	@$(MAKE) env
	@$(MAKE) install
	@$(MAKE) install-backend
	@$(MAKE) db-generate
	@$(MAKE) db-push
	@echo ""
	@echo -e "$(BOLD)$(GREEN)$(CHECK) Setup complete!$(RESET)"
	@echo -e "$(DIM)Run $(BOLD)make dev$(RESET)$(DIM) to start the development server.$(RESET)"

install: ## Install all Node.js dependencies
	@echo -e "$(ARROW) $(BOLD)Installing Node.js dependencies...$(RESET)"
	@cd $(NEXT_DIR) && bun install
	@cd $(REALTIME_DIR) && bun install
	@cd $(PROXY_DIR) && bun install
	@echo -e "$(GREEN)$(CHECK) Node.js dependencies installed$(RESET)"

install-backend: ## Install Python backend dependencies
	@echo -e "$(ARROW) $(BOLD)Installing Python backend dependencies...$(RESET)"
	@if command -v pip3 >/dev/null 2>&1; then \
		pip3 install -r $(BACKEND_DIR)/requirements.txt; \
		echo -e "$(GREEN)$(CHECK) Python dependencies installed$(RESET)"; \
	else \
		echo -e "$(YELLOW)$(WARN) pip3 not found - skipping Python deps$(RESET)"; \
		echo -e "$(DIM)  Install Python 3 and pip to use the backend service.$(RESET)"; \
	fi

env: ## Copy .env.example to .env.local if not exists
	@if [ ! -f $(ROOT_DIR)/.env.local ]; then \
		echo -e "$(ARROW) $(BOLD)Creating .env.local from .env.example...$(RESET)"; \
		if [ -f $(ROOT_DIR)/.env.example ]; then \
			cp $(ROOT_DIR)/.env.example $(ROOT_DIR)/.env.local; \
			echo -e "$(GREEN)$(CHECK) .env.local created from .env.example$(RESET)"; \
		else \
			echo -e "$(YELLOW)$(WARN) .env.example not found - creating empty .env.local$(RESET)"; \
			touch $(ROOT_DIR)/.env.local; \
			echo -e "$(GREEN)$(CHECK) Empty .env.local created$(RESET)"; \
		fi; \
	else \
		echo -e "$(DIM)$(CHECK) .env.local already exists - skipping$(RESET)"; \
	fi

secrets: ## Generate JWT_SECRET, NEXTAUTH_SECRET, CRON_SECRET
	@echo -e "$(ARROW) $(BOLD)Generating application secrets...$(RESET)"
	@JWT_VAL=$$(openssl rand -base64 48) ; \
	NEXTAUTH_VAL=$$(openssl rand -base64 48) ; \
	CRON_VAL=$$(openssl rand -hex 24) ; \
	echo "" ; \
	echo -e "$(YELLOW)Add these to your .env.local:$(RESET)" ; \
	echo "" ; \
	echo "  JWT_SECRET=$$JWT_VAL" ; \
	echo "  NEXTAUTH_SECRET=$$NEXTAUTH_VAL" ; \
	echo "  CRON_SECRET=$$CRON_VAL" ; \
	echo "" ; \
	echo -e "$(GREEN)$(CHECK) Secrets generated - copy them into .env.local$(RESET)"

# =============================================================================
# Database
# =============================================================================

.PHONY: db-push db-generate db-migrate db-reset db-seed db-studio db-backup db-restore

db-push: ## Push Prisma schema to DB
	@echo -e "$(ARROW) $(BOLD)Pushing Prisma schema to database...$(RESET)"
	@cd $(NEXT_DIR) && bun run db:push
	@echo -e "$(GREEN)$(CHECK) Schema pushed$(RESET)"

db-generate: ## Generate Prisma client
	@echo -e "$(ARROW) $(BOLD)Generating Prisma client...$(RESET)"
	@cd $(NEXT_DIR) && bun run db:generate
	@echo -e "$(GREEN)$(CHECK) Prisma client generated$(RESET)"

db-migrate: ## Run Prisma migrations
	@echo -e "$(ARROW) $(BOLD)Running Prisma migrations...$(RESET)"
	@cd $(NEXT_DIR) && bun run db:migrate
	@echo -e "$(GREEN)$(CHECK) Migrations applied$(RESET)"

db-reset: ## Reset database (destroys all data!)
	@echo -e "$(RED)$(WARN) This will DESTROY all data in the database!$(RESET)"
	@read -p "  Are you sure? [y/N] " confirm && [ "$$confirm" = "y" ] || (echo "Aborted." && exit 1)
	@echo -e "$(ARROW) $(BOLD)Resetting database...$(RESET)"
	@cd $(NEXT_DIR) && bun run db:reset
	@echo -e "$(GREEN)$(CHECK) Database reset$(RESET)"

db-seed: ## Seed development data
	@echo -e "$(ARROW) $(BOLD)Seeding database with development data...$(RESET)"
	@cd $(NEXT_DIR) && bun run scripts/seed.ts
	@echo -e "$(GREEN)$(CHECK) Database seeded$(RESET)"

db-studio: ## Open Prisma Studio
	@echo -e "$(ARROW) $(BOLD)Opening Prisma Studio...$(RESET)"
	@cd $(NEXT_DIR) && npx prisma studio

db-backup: ## Run backup script
	@echo -e "$(ARROW) $(BOLD)Running database backup...$(RESET)"
	@cd $(NEXT_DIR) && bash scripts/backup/backup.sh
	@echo -e "$(GREEN)$(CHECK) Backup complete$(RESET)"

db-restore: ## Run restore script (pass FILE=<path> for specific backup)
	@echo -e "$(ARROW) $(BOLD)Running database restore...$(RESET)"
	@if [ -n "$(FILE)" ]; then \
		cd $(NEXT_DIR) && bash scripts/backup/restore.sh "$(FILE)"; \
	else \
		echo -e "$(YELLOW)Usage: make db-restore FILE=./backups/acquisitionos_YYYYMMDD_HHMMSS.db$(RESET)"; \
		echo -e "$(DIM)  For PostgreSQL: DB_TYPE=postgres make db-restore FILE=./backups/acquisitionos_YYYYMMDD_HHMMSS.sql.gz$(RESET)"; \
	fi

# =============================================================================
# Docker (Local Infrastructure)
# =============================================================================

.PHONY: docker-up docker-down docker-logs docker-ps docker-redis docker-postgres

docker-up: ## Start PostgreSQL + Redis + Mailpit via docker-compose
	@echo -e "$(ARROW) $(BOLD)Starting Docker infrastructure...$(RESET)"
	@$(DC_LOCAL) up -d
	@echo ""
	@echo -e "$(GREEN)$(CHECK) Docker infrastructure started$(RESET)"
	@echo -e "$(DIM)  PostgreSQL : localhost:$(PORT_POSTGRES)$(RESET)"
	@echo -e "$(DIM)  Redis      : localhost:$(PORT_REDIS)$(RESET)"
	@echo -e "$(DIM)  Mailpit UI : http://localhost:$(PORT_MAILPIT)$(RESET)"

docker-down: ## Stop all Docker services
	@echo -e "$(ARROW) $(BOLD)Stopping Docker infrastructure...$(RESET)"
	@$(DC_LOCAL) down
	@echo -e "$(GREEN)$(CHECK) Docker services stopped$(RESET)"

docker-logs: ## Tail Docker service logs
	@$(DC_LOCAL) logs -f

docker-ps: ## List running Docker services
	@echo -e "$(ARROW) $(BOLD)Docker services status:$(RESET)"
	@$(DC_LOCAL) ps

docker-redis: ## Connect to Redis CLI
	@echo -e "$(ARROW) $(BOLD)Connecting to Redis CLI...$(RESET)"
	@docker exec -it acquisitionos-redis redis-cli

docker-postgres: ## Connect to PostgreSQL CLI
	@echo -e "$(ARROW) $(BOLD)Connecting to PostgreSQL CLI...$(RESET)"
	@docker exec -it acquisitionos-postgres psql -U acquisitionos -d acquisitionos

# =============================================================================
# Development
# =============================================================================

.PHONY: dev dev-bg realtime backend celery-worker celery-beat all

dev: ## Start Next.js dev server on port 3000
	@echo -e "$(ARROW) $(BOLD)Starting Next.js dev server on port $(PORT_NEXT)...$(RESET)"
	@cd $(NEXT_DIR) && bun run dev

dev-bg: ## Start dev server in background
	@echo -e "$(ARROW) $(BOLD)Starting Next.js dev server in background...$(RESET)"
	@cd $(NEXT_DIR) && mkdir -p .next && nohup bun run dev > .next/dev-server.log 2>&1 &
	@echo -e "$(GREEN)$(CHECK) Dev server running in background (PID: $$!)$(RESET)"
	@echo -e "$(DIM)  Logs: .next/dev-server.log$(RESET)"
	@echo -e "$(DIM)  Stop: make stop$(RESET)"

realtime: ## Start realtime-service mini-service on port 3003
	@echo -e "$(ARROW) $(BOLD)Starting realtime-service on port $(PORT_REALTIME)...$(RESET)"
	@cd $(REALTIME_DIR) && bun run dev

backend: ## Start Python FastAPI backend
	@echo -e "$(ARROW) $(BOLD)Starting FastAPI backend on port $(PORT_BACKEND)...$(RESET)"
	@if [ -d "$(BACKEND_DIR)" ] && [ -f "$(BACKEND_DIR)/app/main.py" ]; then \
		cd $(BACKEND_DIR) && uvicorn app.main:app --reload --host 0.0.0.0 --port $(PORT_BACKEND); \
	else \
		echo -e "$(YELLOW)$(WARN) Backend not found at $(BACKEND_DIR)$(RESET)"; \
	fi

celery-worker: ## Start Celery worker
	@echo -e "$(ARROW) $(BOLD)Starting Celery worker...$(RESET)"
	@cd $(BACKEND_DIR) && celery -A app.celery_app worker --loglevel=info --concurrency=2

celery-beat: ## Start Celery beat scheduler
	@echo -e "$(ARROW) $(BOLD)Starting Celery beat scheduler...$(RESET)"
	@cd $(BACKEND_DIR) && celery -A app.celery_app beat --loglevel=info

all: ## Start all services (docker + dev + realtime + stripe)
	@echo -e "$(BOLD)$(CYAN)===============================================================================$(RESET)"
	@echo -e "$(BOLD)$(CYAN) AcquisitionOS - Starting All Services$(RESET)"
	@echo -e "$(BOLD)$(CYAN)===============================================================================$(RESET)"
	@echo ""
	@echo -e "$(ARROW) Starting Docker infrastructure..."
	@$(MAKE) docker-up
	@echo ""
	@echo -e "$(ARROW) Starting realtime-service in background..."
	@cd $(REALTIME_DIR) && nohup bun run dev > $(ROOT_DIR)/.next/realtime-service.log 2>&1 &
	@echo -e "$(DIM)  Realtime PID: $$!$(RESET)"
	@echo ""
	@echo -e "$(ARROW) Starting Stripe webhook listener in background..."
	@-(nohup stripe listen --forward-to localhost:$(PORT_NEXT)/api/payments/webhook/stripe > $(ROOT_DIR)/.next/stripe-listen.log 2>&1 &) || echo -e "$(DIM)  Stripe CLI not available - skipping$(RESET)"
	@echo ""
	@echo -e "$(BOLD)$(GREEN)$(CHECK) All background services started$(RESET)"
	@echo ""
	@echo -e "$(BOLD)Starting Next.js dev server (foreground)...$(RESET)"
	@echo -e "$(DIM)Press Ctrl+C to stop. Background services persist - run $(BOLD)make stop$(RESET)$(DIM) to clean up.$(RESET)"
	@echo ""
	@cd $(NEXT_DIR) && bun run dev

# =============================================================================
# Stripe
# =============================================================================

.PHONY: stripe-login stripe-listen stripe-trigger

stripe-login: ## Login to Stripe CLI
	@echo -e "$(ARROW) $(BOLD)Logging in to Stripe CLI...$(RESET)"
	@stripe login
	@echo -e "$(GREEN)$(CHECK) Stripe CLI authenticated$(RESET)"

stripe-listen: ## Forward Stripe webhooks to local server
	@echo -e "$(ARROW) $(BOLD)Forwarding Stripe webhooks to localhost:$(PORT_NEXT)...$(RESET)"
	@stripe listen --forward-to localhost:$(PORT_NEXT)/api/payments/webhook/stripe

stripe-trigger: ## Trigger test payment event
	@echo -e "$(ARROW) $(BOLD)Triggering test payment event...$(RESET)"
	@stripe trigger payment_intent.succeeded
	@echo -e "$(GREEN)$(CHECK) Test event triggered$(RESET)"

# =============================================================================
# Testing
# =============================================================================

.PHONY: test test-unit test-integration test-watch lint health

test: ## Run all tests
	@echo -e "$(ARROW) $(BOLD)Running all tests...$(RESET)"
	@cd $(NEXT_DIR) && bun run test
	@echo -e "$(GREEN)$(CHECK) All tests complete$(RESET)"

test-unit: ## Run unit tests
	@echo -e "$(ARROW) $(BOLD)Running unit tests...$(RESET)"
	@cd $(NEXT_DIR) && bun run test:unit
	@echo -e "$(GREEN)$(CHECK) Unit tests complete$(RESET)"

test-integration: ## Run integration tests
	@echo -e "$(ARROW) $(BOLD)Running integration tests...$(RESET)"
	@cd $(NEXT_DIR) && bun run test:integration
	@echo -e "$(GREEN)$(CHECK) Integration tests complete$(RESET)"

test-watch: ## Run tests in watch mode
	@echo -e "$(ARROW) $(BOLD)Running tests in watch mode...$(RESET)"
	@cd $(NEXT_DIR) && bun run test:watch

lint: ## Run ESLint
	@echo -e "$(ARROW) $(BOLD)Running ESLint...$(RESET)"
	@cd $(NEXT_DIR) && bun run lint
	@echo -e "$(GREEN)$(CHECK) Linting complete$(RESET)"

health: ## Check all service health endpoints
	@echo -e "$(ARROW) $(BOLD)Checking service health...$(RESET)"
	@echo ""
	@echo -e "$(DIM)--- Next.js -----------------------------------------------------------------$(RESET)"
	@curl -sf http://localhost:$(PORT_NEXT)/api/health > /dev/null 2>&1 && echo -e "  $(GREEN)$(CHECK) Next.js        : http://localhost:$(PORT_NEXT)/api/health$(RESET)" || echo -e "  $(RED)$(CROSS) Next.js        : unreachable$(RESET)"
	@echo -e "$(DIM)--- Realtime Service --------------------------------------------------------$(RESET)"
	@curl -sf http://localhost:$(PORT_REALTIME)/health > /dev/null 2>&1 && echo -e "  $(GREEN)$(CHECK) Realtime       : http://localhost:$(PORT_REALTIME)/health$(RESET)" || echo -e "  $(RED)$(CROSS) Realtime       : unreachable$(RESET)"
	@echo -e "$(DIM)--- Backend API -------------------------------------------------------------$(RESET)"
	@curl -sf http://localhost:$(PORT_BACKEND)/health > /dev/null 2>&1 && echo -e "  $(GREEN)$(CHECK) Backend API    : http://localhost:$(PORT_BACKEND)/health$(RESET)" || echo -e "  $(RED)$(CROSS) Backend API    : unreachable$(RESET)"
	@echo -e "$(DIM)--- Docker Services ---------------------------------------------------------$(RESET)"
	@-docker exec acquisitionos-postgres pg_isready -U acquisitionos > /dev/null 2>&1 && echo -e "  $(GREEN)$(CHECK) PostgreSQL     : localhost:$(PORT_POSTGRES)$(RESET)" || echo -e "  $(RED)$(CROSS) PostgreSQL     : not running$(RESET)"
	@-docker exec acquisitionos-redis redis-cli ping > /dev/null 2>&1 && echo -e "  $(GREEN)$(CHECK) Redis          : localhost:$(PORT_REDIS)$(RESET)" || echo -e "  $(RED)$(CROSS) Redis          : not running$(RESET)"
	@-curl -sf http://localhost:$(PORT_MAILPIT) > /dev/null 2>&1 && echo -e "  $(GREEN)$(CHECK) Mailpit UI     : http://localhost:$(PORT_MAILPIT)$(RESET)" || echo -e "  $(RED)$(CROSS) Mailpit UI     : not running$(RESET)"
	@echo ""

# =============================================================================
# Cleanup
# =============================================================================

.PHONY: clean clean-all stop

clean: ## Remove .next, node_modules/.cache
	@echo -e "$(ARROW) $(BOLD)Cleaning build artifacts...$(RESET)"
	@rm -rf $(NEXT_DIR)/.next
	@rm -rf $(NEXT_DIR)/node_modules/.cache
	@echo -e "$(GREEN)$(CHECK) Build artifacts removed$(RESET)"

clean-all: ## Remove .next, all caches, and generated files
	@echo -e "$(RED)$(WARN) This removes .next, caches, and generated Prisma client!$(RESET)"
	@read -p "  Are you sure? [y/N] " confirm && [ "$$confirm" = "y" ] || (echo "Aborted." && exit 1)
	@echo -e "$(ARROW) $(BOLD)Cleaning everything...$(RESET)"
	@rm -rf $(NEXT_DIR)/.next
	@rm -rf $(NEXT_DIR)/node_modules/.cache
	@rm -rf $(NEXT_DIR)/node_modules/.prisma
	@rm -rf $(NEXT_DIR)/node_modules/@prisma/client
	@rm -rf $(NEXT_DIR)/.tsbuildinfo
	@rm -rf $(NEXT_DIR)/coverage
	@echo -e "$(GREEN)$(CHECK) All caches and generated files removed$(RESET)"
	@echo -e "$(DIM)  Run $(BOLD)make install$(RESET)$(DIM) and $(BOLD)make db-generate$(RESET)$(DIM) to restore.$(RESET)"

stop: ## Stop all services (Docker, background processes)
	@echo -e "$(ARROW) $(BOLD)Stopping all services...$(RESET)"
	@echo -e "$(DIM)  Stopping Docker infrastructure...$(RESET)"
	@-$(DC_LOCAL) down 2>/dev/null || true
	@echo -e "$(DIM)  Killing background Node/Bun processes...$(RESET)"
	@-pkill -f "next dev" 2>/dev/null || true
	@-pkill -f "bun.*realtime-service" 2>/dev/null || true
	@-pkill -f "bun.*proxy" 2>/dev/null || true
	@-pkill -f "stripe listen" 2>/dev/null || true
	@-pkill -f "uvicorn" 2>/dev/null || true
	@-pkill -f "celery" 2>/dev/null || true
	@echo -e "$(GREEN)$(CHECK) All services stopped$(RESET)"

# =============================================================================
# Help
# =============================================================================

.PHONY: help

help: ## Show all available targets with descriptions
	@echo ""
	@echo -e "$(BOLD)$(CYAN)===============================================================================$(RESET)"
	@echo -e "$(BOLD)$(CYAN)  AcquisitionOS - Makefile Commands$(RESET)"
	@echo -e "$(BOLD)$(CYAN)===============================================================================$(RESET)"
	@echo ""
	@echo -e "$(BOLD)$(YELLOW)  Setup$(RESET)"
	@echo -e "$(DIM)  -----------------------------------------------------------------------------$(RESET)"
	@echo -e "  $(GREEN)make setup$(RESET)            Full first-time setup (install deps, setup DB, copy env)"
	@echo -e "  $(GREEN)make install$(RESET)           Install all Node.js dependencies"
	@echo -e "  $(GREEN)make install-backend$(RESET)   Install Python backend dependencies"
	@echo -e "  $(GREEN)make env$(RESET)               Copy .env.example to .env.local if not exists"
	@echo -e "  $(GREEN)make secrets$(RESET)           Generate JWT_SECRET, NEXTAUTH_SECRET, CRON_SECRET"
	@echo ""
	@echo -e "$(BOLD)$(YELLOW)  Database$(RESET)"
	@echo -e "$(DIM)  -----------------------------------------------------------------------------$(RESET)"
	@echo -e "  $(GREEN)make db-push$(RESET)           Push Prisma schema to DB"
	@echo -e "  $(GREEN)make db-generate$(RESET)       Generate Prisma client"
	@echo -e "  $(GREEN)make db-migrate$(RESET)        Run Prisma migrations"
	@echo -e "  $(GREEN)make db-reset$(RESET)          Reset database (destroys all data!)"
	@echo -e "  $(GREEN)make db-seed$(RESET)           Seed development data"
	@echo -e "  $(GREEN)make db-studio$(RESET)         Open Prisma Studio"
	@echo -e "  $(GREEN)make db-backup$(RESET)         Run backup script"
	@echo -e "  $(GREEN)make db-restore$(RESET)        Run restore script (FILE=<path>)"
	@echo ""
	@echo -e "$(BOLD)$(YELLOW)  Docker (Local Infrastructure)$(RESET)"
	@echo -e "$(DIM)  -----------------------------------------------------------------------------$(RESET)"
	@echo -e "  $(GREEN)make docker-up$(RESET)         Start PostgreSQL + Redis + Mailpit"
	@echo -e "  $(GREEN)make docker-down$(RESET)       Stop all Docker services"
	@echo -e "  $(GREEN)make docker-logs$(RESET)       Tail Docker service logs"
	@echo -e "  $(GREEN)make docker-ps$(RESET)         List running Docker services"
	@echo -e "  $(GREEN)make docker-redis$(RESET)      Connect to Redis CLI"
	@echo -e "  $(GREEN)make docker-postgres$(RESET)   Connect to PostgreSQL CLI"
	@echo ""
	@echo -e "$(BOLD)$(YELLOW)  Development$(RESET)"
	@echo -e "$(DIM)  -----------------------------------------------------------------------------$(RESET)"
	@echo -e "  $(GREEN)make dev$(RESET)               Start Next.js dev server on port 3000"
	@echo -e "  $(GREEN)make dev-bg$(RESET)            Start dev server in background"
	@echo -e "  $(GREEN)make realtime$(RESET)          Start realtime-service on port 3003"
	@echo -e "  $(GREEN)make backend$(RESET)           Start Python FastAPI backend"
	@echo -e "  $(GREEN)make celery-worker$(RESET)     Start Celery worker"
	@echo -e "  $(GREEN)make celery-beat$(RESET)       Start Celery beat scheduler"
	@echo -e "  $(GREEN)make all$(RESET)               Start all services (docker + dev + realtime + stripe)"
	@echo ""
	@echo -e "$(BOLD)$(YELLOW)  Stripe$(RESET)"
	@echo -e "$(DIM)  -----------------------------------------------------------------------------$(RESET)"
	@echo -e "  $(GREEN)make stripe-login$(RESET)      Login to Stripe CLI"
	@echo -e "  $(GREEN)make stripe-listen$(RESET)     Forward Stripe webhooks to local server"
	@echo -e "  $(GREEN)make stripe-trigger$(RESET)    Trigger test payment event"
	@echo ""
	@echo -e "$(BOLD)$(YELLOW)  Testing$(RESET)"
	@echo -e "$(DIM)  -----------------------------------------------------------------------------$(RESET)"
	@echo -e "  $(GREEN)make test$(RESET)              Run all tests"
	@echo -e "  $(GREEN)make test-unit$(RESET)         Run unit tests"
	@echo -e "  $(GREEN)make test-integration$(RESET)  Run integration tests"
	@echo -e "  $(GREEN)make test-watch$(RESET)        Run tests in watch mode"
	@echo -e "  $(GREEN)make lint$(RESET)              Run ESLint"
	@echo -e "  $(GREEN)make health$(RESET)            Check all service health endpoints"
	@echo ""
	@echo -e "$(BOLD)$(YELLOW)  Cleanup$(RESET)"
	@echo -e "$(DIM)  -----------------------------------------------------------------------------$(RESET)"
	@echo -e "  $(GREEN)make clean$(RESET)             Remove .next, node_modules/.cache"
	@echo -e "  $(GREEN)make clean-all$(RESET)         Remove .next, all caches, generated files"
	@echo -e "  $(GREEN)make stop$(RESET)              Stop all services (Docker, background processes)"
	@echo ""
	@echo -e "$(BOLD)$(CYAN)===============================================================================$(RESET)"
	@echo ""
