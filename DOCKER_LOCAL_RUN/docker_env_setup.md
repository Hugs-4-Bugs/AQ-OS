# AQ-OS Docker Environment Variables & Secrets Context

## Purpose

This file defines how AQ-OS environment variables and secrets are organized and passed to Docker.

The goal is to keep secrets outside the Docker image and source code while making them available to the AQ-OS backend at runtime.

---

## 1. Environment Files

Recommended project structure:

```text
AQ-OS/
├── .env
├── .env.example
├── compose.yaml
├── Dockerfile
├── DOCKER_ENV_CONTEXT.md
├── DOCKER_RUNBOOK.md
└── ...
```

### `.env`

The real local environment file.

It contains actual local configuration and secrets required by AQ-OS.

Example:

```dotenv
# =========================
# AQ-OS LOCAL ENVIRONMENT
# =========================

# Application
SPRING_PROFILES_ACTIVE=local
SERVER_PORT=8080

# Database
DB_HOST=
DB_PORT=
DB_NAME=
DB_USERNAME=
DB_PASSWORD=

# Authentication
JWT_SECRET=

# AI / LLM providers
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
GOOGLE_API_KEY=
OPENROUTER_API_KEY=

# Payments
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=

# Email
MAIL_HOST=
MAIL_PORT=
MAIL_USERNAME=
MAIL_PASSWORD=

# Other AQ-OS variables
# Add the variables required by the current application.
```

The actual values must be filled according to the current AQ-OS configuration.

Do not replace existing AQ-OS variable names with the example names above unless the application actually uses those names.

---

## 2. `.env.example`

`.env.example` is the safe template.

It contains variable names but no real secrets.

Example:

```dotenv
SPRING_PROFILES_ACTIVE=local
SERVER_PORT=8080

DB_HOST=
DB_PORT=
DB_NAME=
DB_USERNAME=
DB_PASSWORD=

JWT_SECRET=

OPENAI_API_KEY=
ANTHROPIC_API_KEY=
GOOGLE_API_KEY=
OPENROUTER_API_KEY=

STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=

MAIL_HOST=
MAIL_PORT=
MAIL_USERNAME=
MAIL_PASSWORD=
```

`.env.example` can be committed to Git.

The real `.env` should remain local and must not be committed.

---

## 3. How Docker Receives `.env`

Recommended flow:

```text
.env
  |
  v
Docker Compose
  |
  v
AQ-OS backend container
  |
  v
Spring Boot application
```

The preferred approach is runtime injection.

Application secrets should not normally be baked into the Docker image.

---

## 4. Compose Configuration

A typical backend service can use:

```yaml
services:
  backend:
    build:
      context: .
      dockerfile: Dockerfile

    env_file:
      - .env

    ports:
      - "${SERVER_PORT:-8080}:8080"
```

If the current AQ-OS Compose configuration already uses an `environment:` section, preserve its existing structure and map the required variables.

Example:

```yaml
services:
  backend:
    environment:
      SPRING_PROFILES_ACTIVE: ${SPRING_PROFILES_ACTIVE}
      DB_HOST: ${DB_HOST}
      DB_PORT: ${DB_PORT}
      DB_NAME: ${DB_NAME}
      DB_USERNAME: ${DB_USERNAME}
      DB_PASSWORD: ${DB_PASSWORD}
      JWT_SECRET: ${JWT_SECRET}
      OPENAI_API_KEY: ${OPENAI_API_KEY}
      STRIPE_SECRET_KEY: ${STRIPE_SECRET_KEY}
```

Do not blindly replace the existing AQ-OS Compose configuration.

First inspect the existing configuration and preserve its database, volume, network, and service definitions.

---

## 5. Build-Time vs Runtime Variables

### Build-time

Used while creating the Docker image.

Ordinary private runtime secrets should not be stored in the image.

### Runtime

Used when the container starts.

AQ-OS server secrets should normally be supplied here.

Preferred architecture:

```text
Source code
    |
    v
Docker image
    |
    |  no private runtime secrets baked in
    v
Container starts
    ^
    |
.env / Compose runtime environment
```

---

## 6. Dockerfile Rule

Do not hard-code private credentials in the Dockerfile.

Do not hard-code private credentials in Java/Node source code.

Do not place server-only secrets into frontend browser-exposed variables.

Examples of server-only secrets:

```text
DB_PASSWORD
JWT_SECRET
STRIPE_SECRET_KEY
private AI provider keys
mail passwords
```

These belong in the server runtime environment.

---

## 7. Frontend Warning

Anything exposed to browser-side JavaScript should be treated as public.

Never place private server credentials into frontend environment variables merely because the frontend needs configuration.

The frontend should communicate with the AQ-OS backend, and the backend should handle private credentials.

---

## 8. Database Variables

The exact variable names must come from the current AQ-OS backend and Compose configuration.

Typical examples:

```dotenv
DB_HOST=
DB_PORT=
DB_NAME=
DB_USERNAME=
DB_PASSWORD=
```

Before changing them, verify how the current backend reads database configuration.

Do not change database variables during a Docker update unless the database target is intentionally being changed.

---

## 9. Environment Changes

### Only `.env` changed

Normal flow:

```bash
docker compose up -d
```

Then verify:

```bash
docker compose ps
```

```bash
docker compose logs --tail=100
```

### Code and `.env` changed

Normal flow:

```bash
docker compose up -d --build
```

Then verify:

```bash
docker compose ps
```

```bash
docker compose logs --tail=100
```

---

## 10. Secret Safety Checklist

Real `.env`:

```text
LOCAL ONLY
```

`.env.example`:

```text
SAFE TEMPLATE
```

Do not put real secrets into:

```text
GitHub
Dockerfile
README
source code
frontend bundle
screenshots
logs
documentation
```

Do not paste real secret values into chat.

---

## 11. AQ-OS Environment Rule

The source of truth for the exact environment-variable names is:

1. Current AQ-OS backend configuration
2. Current Compose configuration
3. Current Dockerfile/application configuration

This document defines the structure and safety model. It does not invent missing AQ-OS variables.