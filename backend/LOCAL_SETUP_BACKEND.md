# AcquisitionOS — Backend Local Setup Guide

Complete guide to setting up the AcquisitionOS backend for local development.

---

## Prerequisites

| Requirement | Minimum Version | Notes |
|---|---|---|
| **Python** | 3.11+ | Verify with `python --version` |
| **Redis** | 7+ | Must be running on `localhost:6379` |
| **PostgreSQL** | 16+ | Must be running and accessible |

### Verifying Prerequisites

```bash
python --version        # Should be 3.11+
redis-cli ping          # Should return PONG
psql --version          # Should be 16+
```

> **Tip:** On macOS, use Homebrew: `brew install python redis postgresql`. On Ubuntu: `sudo apt install python3 redis postgresql`.

---

## Dependencies & Installation

### Core Dependencies

| Package | Purpose |
|---|---|
| **FastAPI** | High-performance Python web framework |
| **uvicorn** | ASGI server for FastAPI |
| **Celery** | Distributed task queue |
| **redis** | Python Redis client |
| **SQLAlchemy** | Python SQL toolkit and ORM |
| **alembic** | Database migration tool |
| **pydantic** | Data validation and settings management |
| **python-jose** | JWT token handling |
| **passlib** | Password hashing |
| **httpx** | Async HTTP client |
| **stripe** | Stripe Python SDK |
| **sendgrid** | Email delivery |
| **sentry-sdk** | Error tracking |

### Install Commands

Install all dependencies from the requirements file:

```bash
cd backend
pip install -r requirements.txt
```

Or install core packages individually:

```bash
pip install fastapi uvicorn celery redis sqlalchemy alembic pydantic python-jose passlib httpx stripe sendgrid sentry-sdk
```

> **Recommended:** Use a virtual environment to isolate dependencies:
> ```bash
> python -m venv venv
> source venv/bin/activate   # Linux/macOS
> # venv\Scripts\activate    # Windows
> pip install -r requirements.txt
> ```

---

## Run Commands

### FastAPI Server

```bash
uvicorn app.main:app --reload --port 8000
```

- `--reload` — Auto-restart on code changes (development only).
- `--port 8000` — Default backend port.
- Access the interactive API docs at `http://localhost:8000/docs` (Swagger UI).

### Celery Worker

```bash
celery -A app.celery_app worker --loglevel=info --concurrency=4
```

- `--concurrency 4` — Number of worker processes (adjust based on CPU cores).
- `--loglevel=info` — Set to `debug` for verbose output.

### Celery Beat Scheduler

```bash
celery -A app.celery_app beat --loglevel=info
```

- Runs periodic tasks on a schedule defined in `app.celery_app`.
- Must be running alongside the Celery worker for scheduled tasks to execute.

### Running All Services Together

Use separate terminal windows/tabs for each service:

| Terminal | Service | Command |
|---|---|---|
| 1 | FastAPI | `uvicorn app.main:app --reload --port 8000` |
| 2 | Celery Worker | `celery -A app.celery_app worker --loglevel=info --concurrency=4` |
| 3 | Celery Beat | `celery -A app.celery_app beat --loglevel=info` |

---

## Framework Details

### FastAPI (Python Web Framework)

- **Async-first** — Native `async`/`await` support for high-concurrency endpoints.
- **Auto-generated docs** — Interactive Swagger UI and ReDoc from OpenAPI schemas.
- **Dependency injection** — Clean, testable endpoint composition.
- **Pydantic validation** — Automatic request/response validation with type hints.

### Celery (Distributed Task Queue)

- **Asynchronous task execution** — Offload long-running work from the request cycle.
- **Scheduled tasks** — Periodic jobs via Celery Beat (cron-like scheduling).
- **Retry logic** — Automatic retries with exponential backoff.
- **Task chaining** — Compose complex workflows with `chain`, `group`, and `chord`.

### Redis (Broker + Result Backend)

- **Message broker** — Celery uses Redis to dispatch and receive task messages.
- **Result backend** — Celery stores task results in Redis for retrieval.
- **Cache layer** — Application-level caching for frequently accessed data.
- **Pub/Sub** — Real-time event broadcasting across services.

### SQLAlchemy (ORM for Python)

- **Declarative models** — Define database tables as Python classes.
- **Async session** — Non-blocking database queries with `asyncio`.
- **Alembic migrations** — Version-controlled schema changes.
- **Relationship mapping** — One-to-many, many-to-many, and polymorphic associations.

---

## Queue Configuration

### Celery Queues (8 specialized queues)

| Queue | Purpose |
|---|---|
| `billing` | Subscription renewals, invoice generation, payment processing |
| `email` | Send emails, track opens and clicks, process bounces |
| `lead` | Lead discovery, data enrichment, scoring updates |
| `maintenance` | Database cleanup, data retention, log rotation |
| `notification` | Push notifications, in-app alerts, SMS delivery |
| `payment_recovery` | Retry failed payments, dunning sequences, card update requests |
| `realtime` | Broadcast events, WebSocket message dispatch |
| `workflow` | Execute workflow steps, trigger automations, condition evaluation |

### Redis Database Mapping

| Redis DB | Purpose | Key Patterns |
|---|---|---|
| **DB 0** | Cache & Pub/Sub | `cache:*`, `session:*` |
| **DB 1** | Celery Broker | Celery internal message queues |
| **DB 2** | Celery Result Backend | `celery-task-meta-*` |
| **DB 3** | Realtime Pub/Sub | Channel subscriptions for live updates |

### Celery Configuration Snippet

```python
# app/celery_config.py

CELERY_BROKER_URL = "redis://localhost:6379/1"
CELERY_RESULT_BACKEND = "redis://localhost:6379/2"

CELERY_TASK_ROUTES = {
    "app.tasks.billing.*":      {"queue": "billing"},
    "app.tasks.email.*":        {"queue": "email"},
    "app.tasks.lead.*":         {"queue": "lead"},
    "app.tasks.maintenance.*":  {"queue": "maintenance"},
    "app.tasks.notification.*": {"queue": "notification"},
    "app.tasks.payment_recovery.*": {"queue": "payment_recovery"},
    "app.tasks.realtime.*":     {"queue": "realtime"},
    "app.tasks.workflow.*":     {"queue": "workflow"},
}

CELERY_QUEUE_NAMES = [
    "billing",
    "email",
    "lead",
    "maintenance",
    "notification",
    "payment_recovery",
    "realtime",
    "workflow",
]
```

---

## Environment Variables

Create a `.env` file in the `backend/` directory:

```env
# ─── Database ───────────────────────────────────────────
DATABASE_URL=postgresql://acquisitionos:password@localhost:5432/acquisitionos

# ─── Redis ──────────────────────────────────────────────
REDIS_URL=redis://localhost:6379/0

# ─── Security ───────────────────────────────────────────
SECRET_KEY=your-secret-key-min-32-chars
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30

# ─── SMTP (Email) ──────────────────────────────────────
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASSWORD=your-sendgrid-api-key
EMAIL_FROM=noreply@acquisitionos.com

# ─── Stripe ─────────────────────────────────────────────
STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx

# ─── Google OAuth ───────────────────────────────────────
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# ─── Sentry ─────────────────────────────────────────────
SENTRY_DSN=https://xxx@sentry.io/xxx

# ─── Miscellaneous API Keys ─────────────────────────────
OPENAI_API_KEY=sk-xxx
CLEARBIT_API_KEY=sk_xxx
HUNTER_API_KEY=xxx
```

> **Security Warning:** Never commit `.env` files to version control. Add `.env` to `.gitignore`.

---

## Celery Tasks

### Billing Queue

| Task | Description | Schedule |
|---|---|---|
| `billing.renew_subscription` | Process subscription renewals | Daily at midnight |
| `billing.generate_invoice` | Create invoices for billing cycles | On renewal |
| `billing.process_payment` | Charge customer payment methods | On invoice creation |
| `billing.update_subscription_status` | Sync status with payment provider | On webhook |

### Email Queue

| Task | Description | Schedule |
|---|---|---|
| `email.send_email` | Deliver transactional or marketing emails | Immediate |
| `email.track_open` | Record email open events | On webhook |
| `email.track_click` | Record link click events | On webhook |
| `email.process_bounce` | Handle bounced emails | On webhook |

### Lead Queue

| Task | Description | Schedule |
|---|---|---|
| `lead.discover` | Find new leads from data sources | Scheduled |
| `lead.enrich` | Enrich lead data from external APIs | On creation |
| `lead.score` | Calculate and update lead scores | On data change |
| `lead.deduplicate` | Merge duplicate lead records | Nightly |

### Maintenance Queue

| Task | Description | Schedule |
|---|---|---|
| `maintenance.cleanup_expired_sessions` | Remove stale session data | Hourly |
| `maintenance.data_retention` | Enforce data retention policies | Daily |
| `maintenance.rotate_logs` | Archive and compress old logs | Weekly |
| `maintenance.vacuum_database` | Optimize PostgreSQL tables | Weekly |

### Notification Queue

| Task | Description | Schedule |
|---|---|---|
| `notification.push` | Send push notifications | Immediate |
| `notification.in_app` | Create in-app alert records | Immediate |
| `notification.sms` | Deliver SMS messages | Immediate |
| `notification.digest` | Send daily/weekly email digests | Scheduled |

### Payment Recovery Queue

| Task | Description | Schedule |
|---|---|---|
| `payment_recovery.retry_failed_payment` | Retry a failed charge attempt | Exponential backoff |
| `payment_recovery.send_dunning_email` | Notify customer of payment failure | On failure |
| `payment_recovery.request_card_update` | Prompt user to update card details | After 2nd failure |
| `payment_recovery.pause_access` | Restrict access after exhausted retries | After final failure |

### Realtime Queue

| Task | Description | Schedule |
|---|---|---|
| `realtime.broadcast_event` | Push event to connected WebSocket clients | Immediate |
| `realtime.update_pipeline` | Broadcast pipeline stage changes | On mutation |
| `realtime.notify_user` | Send targeted real-time notification | On event |

### Workflow Queue

| Task | Description | Schedule |
|---|---|---|
| `workflow.execute_step` | Run a single workflow step | On trigger |
| `workflow.evaluate_condition` | Check a workflow branch condition | On step completion |
| `workflow.trigger_automation` | Fire an automation rule | On matching event |
| `workflow.log_execution` | Record workflow execution history | On step completion |

---

## Health Checks

### FastAPI Health Check

```bash
curl http://localhost:8000/health
```

Expected response:

```json
{
  "status": "healthy",
  "version": "1.0.0",
  "uptime_seconds": 4321
}
```

### Celery Health Check

```bash
celery -A app.celery_app inspect ping
```

Expected output:

```
-> celery@hostname: OK
    pong
```

> **Note:** The Celery worker must be running for the ping to succeed. If no workers respond, check that the worker process is active and the broker (Redis) is reachable.

### Redis Health Check

```bash
redis-cli ping
```

Expected response: `PONG`

### PostgreSQL Health Check

```bash
psql -U acquisitionos -d acquisitionos -c "SELECT 1;"
```

Expected output:

```
 ?column?
----------
        1
(1 row)
```

---

## Troubleshooting

| Issue | Solution |
|---|---|
| **Port 8000 already in use** | Find the process: `lsof -i :8000` and kill it, or use `--port 8001` |
| **Celery worker not picking up tasks** | Verify Redis is running: `redis-cli ping`. Check queue routing matches task names. |
| **Database connection refused** | Verify PostgreSQL is running: `pg_isready`. Check `DATABASE_URL` in `.env`. |
| **Import errors on startup** | Ensure virtual environment is activated: `source venv/bin/activate`. Reinstall: `pip install -r requirements.txt`. |
| **Migrations out of sync** | Run `alembic upgrade head` to apply all pending migrations. |
| **Redis connection refused** | Start Redis: `redis-server` or `brew services start redis`. |

---

## Development Workflow

1. **Start infrastructure** — Ensure Redis and PostgreSQL are running.
2. **Activate virtual environment** — `source venv/bin/activate`
3. **Run database migrations** — `alembic upgrade head`
4. **Start FastAPI** — `uvicorn app.main:app --reload --port 8000`
5. **Start Celery worker** — `celery -A app.celery_app worker --loglevel=info --concurrency=4`
6. **Start Celery beat** — `celery -A app.celery_app beat --loglevel=info`
7. **Verify** — Check `/health` endpoint and Celery ping.
8. **Develop** — FastAPI auto-reloads on code changes. Celery worker requires manual restart for task code changes.

---

*AcquisitionOS Backend Team*
