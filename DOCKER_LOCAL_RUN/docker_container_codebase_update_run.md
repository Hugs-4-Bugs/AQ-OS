# Run AQ-OS with Latest Code Using Docker

This guide explains how to run the AQ-OS backend using the latest codebase, including the latest Workflow and Autopilot implementation.

## 1. Go to the AQ-OS project root

```bash
cd /path/to/AQ-OS
```

## 2. Pull the latest GitHub code

```bash
git pull origin main
```

Verify the current commit:

```bash
git log -1 --oneline
```

Make sure this is the latest commit containing the current Workflow + Autopilot implementation.

## 3. Rebuild the Docker image

If an existing Docker container is running an older build, restarting it will not automatically include the latest source code.

Rebuild the image:

```bash
docker compose build --no-cache
```

## 4. Start the updated containers

```bash
docker compose up -d
```

This starts the containers using the newly built image containing the latest code.

## 5. Verify running containers

```bash
docker compose ps
```

Confirm that the required backend container is running.

## 6. Check backend logs

```bash
docker compose logs -f
```

Check for startup errors or application failures.

Press `Ctrl+C` to stop following the logs. This does not stop the containers.

## 7. Run the frontend

The frontend is started separately:

```bash
npm run dev
```

Then open the local frontend URL shown by the development server.

## Important Rules

### Do NOT reset or delete the database

Do not run commands that reset, recreate, delete, or replace the existing database.

Do not blindly run migrations.

Existing users, subscriptions, credits, leads, payment history, workflow data, Autopilot data, and other application data must be preserved.

### Do NOT assume an existing container has the latest code

If the container was created from an older Docker image, simply running:

```bash
docker compose start
```

or restarting the existing container will not rebuild it with the latest source code.

The correct flow is:

```text
Latest GitHub Code
       ↓
git pull origin main
       ↓
Docker Image Rebuild
       ↓
docker compose build --no-cache
       ↓
Updated Container
       ↓
docker compose up -d
       ↓
Backend runs latest code
```

## Verify Docker Configuration

If the exact Docker service names or configuration are unknown, run:

```bash
docker compose ps
```

and:

```bash
docker compose config --services
```

These commands show the currently configured Docker services and their status.

## Standard Command Sequence

For a normal update from GitHub to the Docker runtime:

```bash
git pull origin main
git log -1 --oneline
docker compose build --no-cache
docker compose up -d
docker compose ps
docker compose logs -f
```

Then start the frontend separately:

```bash
npm run dev
```

## Safety Rule

Never use Docker commands that remove application data or volumes unless the impact has been explicitly verified first.

The objective is simple:

**Run the latest AQ-OS code in Docker without losing or resetting any existing application data.**