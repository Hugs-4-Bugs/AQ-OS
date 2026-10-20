# AQ-OS Docker Runbook

## Purpose

This runbook explains how to run and update the AQ-OS backend using Docker while preserving:

- existing application data
- database state
- persistent Docker volumes
- workflow data
- Autopilot data
- users
- subscriptions
- credits
- leads
- payment history
- project source code

The normal workflow does not include destructive Docker or database cleanup operations.

---

# 1. AQ-OS Project Structure

The project may contain:

```text
AQ-OS/
├── backend/
├── frontend/
├── db/
├── db-backups/
├── Dockerfile
├── compose.yaml
├── .env
├── .env.example
├── DOCKER_ENV_CONTEXT.md
├── DOCKER_RUNBOOK.md
└── ...
```

The actual project structure is the source of truth.

---

# 2. First-Time Docker Setup

Use this when there is no existing AQ-OS container/image and the source code is already available locally.

## Step 1 — Go to project root

```bash
cd /path/to/AQ-OS
```

## Step 2 — Inspect Git state

```bash
git status
```

```bash
git log -1 --oneline
```

Do not blindly pull if the working tree contains local changes that must be preserved.

## Step 3 — Verify Compose services

```bash
docker compose config --services
```

This only reads the current Compose configuration and lists its services.

## Step 4 — Verify `.env`

Make sure the project-root `.env` contains the environment variables required by the current AQ-OS application.

Do not print the complete `.env` into the terminal output if it contains secrets.

## Step 5 — Build and start

```bash
docker compose up -d --build
```

## Step 6 — Verify

```bash
docker compose ps
```

## Step 7 — Check logs

```bash
docker compose logs --tail=100
```

For continuous logs:

```bash
docker compose logs -f
```

`Ctrl+C` while following logs only stops the log-following command; it does not stop the containers.

---

# 3. Update Existing AQ-OS Docker Runtime

Situation:

```text
AQ-OS is already running in Docker
+
new backend code is available
+
existing database/application data must remain intact
```

## Step 1 — Go to AQ-OS

```bash
cd /path/to/AQ-OS
```

## Step 2 — Inspect Git state

```bash
git status
```

## Step 3 — Pull intended code

If the working tree is in the expected state:

```bash
git pull origin main
```

## Step 4 — Verify commit

```bash
git log -1 --oneline
```

Confirm that the intended Workflow + Autopilot implementation is present.

## Step 5 — Rebuild/update

```bash
docker compose up -d --build
```

This is the normal code-update path.

## Step 6 — Verify services

```bash
docker compose ps
```

## Step 7 — Check logs

```bash
docker compose logs --tail=100
```

---

# 4. Environment-Only Update

Situation:

```text
Code did not change
+
.env values changed
```

Examples:

- API key changed
- Stripe secret changed
- database credentials changed
- mail credentials changed
- application configuration changed

Use:

```bash
docker compose up -d
```

Then:

```bash
docker compose ps
```

And:

```bash
docker compose logs --tail=100
```

---

# 5. Code + Environment Update

If both Git source code and `.env` changed:

```bash
cd /path/to/AQ-OS
```

```bash
git status
```

```bash
git pull origin main
```

```bash
git log -1 --oneline
```

Then:

```bash
docker compose up -d --build
```

Verify:

```bash
docker compose ps
```

```bash
docker compose logs --tail=100
```

---

# 6. Do Not Make `--no-cache` the Normal Workflow

Normal AQ-OS rebuild/update:

```bash
docker compose up -d --build
```

A no-cache rebuild consumes substantially more disk space and should only be considered after diagnosing a specific stale-build problem and checking available disk space.

---

# 7. Database Preservation

The AQ-OS database must remain persistent.

Before modifying Docker configuration, inspect the current Compose configuration and identify:

```yaml
volumes:
```

and the database service's volume mapping.

Conceptual example:

```yaml
services:
  db:
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
```

The actual AQ-OS database engine and data path may differ.

Do not replace the existing database configuration with an example.

---

# 8. Important Container vs Volume Concept

A Docker container and its persistent database storage are different resources.

Conceptually:

```text
Docker container
       |
       +---- application runtime
       |
       +---- persistent database volume
```

A container can be recreated while a correctly configured persistent volume continues to hold database data.

Therefore, before any Docker lifecycle operation, verify the current Compose volume configuration.

---

# 9. Safe Inspection Commands

These commands inspect state without performing cleanup:

```bash
docker compose ps
```

```bash
docker compose config --services
```

```bash
docker compose images
```

```bash
docker volume ls
```

```bash
docker system df
```

```bash
docker compose logs --tail=100
```

Use inspection before making storage or Docker configuration decisions.

---

# 10. Frontend

If the frontend is not part of the Docker Compose stack, run it separately:

```bash
npm run dev
```

Use the backend URL configured for the local AQ-OS environment.

---

# 11. Standard Workflows

## First-time setup

```text
AQ-OS source
      ↓
Configure .env
      ↓
docker compose up -d --build
      ↓
Verify containers
      ↓
Check logs
```

## Backend code update

```text
GitHub
   ↓
git status
   ↓
git pull origin main
   ↓
git log -1 --oneline
   ↓
docker compose up -d --build
   ↓
Verify
```

## Environment-only update

```text
.env changed
     ↓
docker compose up -d
     ↓
Verify
```

---

# 12. Pre-Update Checklist

Before an AQ-OS Docker update:

```text
[ ] Correct AQ-OS project directory
[ ] git status checked
[ ] Local changes understood
[ ] Intended Git commit verified
[ ] .env exists
[ ] Required environment variables configured
[ ] Database configuration unchanged unless intentionally changing it
[ ] Persistent volume configuration preserved
[ ] Enough disk space available for the build
```

---

# 13. Post-Update Checklist

After:

```bash
docker compose up -d --build
```

check:

```bash
docker compose ps
```

Then:

```bash
docker compose logs --tail=100
```

Confirm:

```text
[ ] Backend container is running
[ ] Database service is healthy/running if database is local
[ ] No startup configuration errors
[ ] No database connection errors
[ ] No authentication/configuration errors
[ ] AQ-OS API responds
[ ] Existing application data is accessible
[ ] Frontend can connect to backend
```

---

# 14. Core AQ-OS Rule

The objective is:

> Run the latest AQ-OS code in Docker without losing or resetting existing application data, database state, persistent volumes, or project state.

Normal code update:

```text
Latest intended code
       ↓
Verify Git state
       ↓
docker compose up -d --build
       ↓
Updated image
       ↓
Updated backend container
       ↓
Existing persistent database/volumes
       ↓
Verify application
```

Normal first-time run:

```text
Source + .env
      ↓
docker compose up -d --build
      ↓
Container
      ↓
Verify
```

This runbook is the standard AQ-OS Docker operating procedure.
