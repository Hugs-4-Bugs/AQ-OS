"""
AcquisitionOS — Celery Configuration
Production-grade Celery with retry, backoff, queue separation, and Beat scheduling
"""

import logging
from celery import Celery
from celery.schedules import crontab

from app.config import settings

logger = logging.getLogger(__name__)

# Create Celery app
celery_app = Celery(
    "acquisitionos",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
)

# Celery configuration
celery_app.conf.update(
    # Serialization
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",

    # Timezone
    timezone="UTC",
    enable_utc=True,

    # Task execution
    task_track_started=True,
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    worker_prefetch_multiplier=1,

    # Retry defaults
    task_default_retry_delay=60,  # 1 minute
    task_default_max_retries=3,

    # Queue separation
    task_routes={
        "app.tasks.email_tasks.*": {"queue": "email"},
        "app.tasks.billing_tasks.*": {"queue": "billing"},
        "app.tasks.lead_tasks.*": {"queue": "scraping"},
        "app.tasks.notification_tasks.*": {"queue": "notifications"},
        "app.tasks.maintenance_tasks.*": {"queue": "maintenance"},
        "app.tasks.workflow_tasks.*": {"queue": "workflows"},
        "app.tasks.realtime_tasks.*": {"queue": "realtime"},
    },

    # Beat schedule — periodic tasks
    beat_schedule={
        # Check for expiring subscriptions every day at 9 AM UTC
        "check-expiring-subscriptions": {
            "task": "app.tasks.billing_tasks.check_expiring_subscriptions",
            "schedule": crontab(hour=9, minute=0),
        },
        # Send trial ending reminders daily at 10 AM UTC
        "send-trial-ending-reminders": {
            "task": "app.tasks.billing_tasks.send_trial_ending_reminders",
            "schedule": crontab(hour=10, minute=0),
        },
        # Check overdue follow-up reminders every 30 minutes
        "check-overdue-reminders": {
            "task": "app.tasks.notification_tasks.check_overdue_reminders",
            "schedule": crontab(minute="*/30"),
        },
        # Renew Gmail watch (expires every 7 days) daily at 2 AM UTC
        "renew-gmail-watches": {
            "task": "app.tasks.email_tasks.renew_gmail_watches",
            "schedule": crontab(hour=2, minute=0),
        },
        # Process sequence steps every 15 minutes
        "process-sequence-steps": {
            "task": "app.tasks.email_tasks.process_sequence_steps",
            "schedule": crontab(minute="*/15"),
        },
        # Clean up expired sessions daily at 3 AM UTC
        "cleanup-expired-sessions": {
            "task": "app.tasks.maintenance_tasks.cleanup_expired_sessions",
            "schedule": crontab(hour=3, minute=0),
        },
        # Reset monthly WhatsApp quotas on the 1st of each month
        "reset-whatsapp-quotas": {
            "task": "app.tasks.maintenance_tasks.reset_whatsapp_quotas",
            "schedule": crontab(day_of_month=1, hour=0, minute=0),
        },
        # ── Phase 11: Realtime tasks ────────────────────────────────────
        # Cleanup stale WS/SSE connections every 5 minutes
        "cleanup-stale-connections": {
            "task": "app.tasks.realtime_tasks.cleanup_stale_connections",
            "schedule": crontab(minute="*/5"),
        },
        # Compact replay store daily at 4 AM UTC
        "compact-replay-store": {
            "task": "app.tasks.realtime_tasks.compact_replay_store",
            "schedule": crontab(hour=4, minute=0),
        },
        # Retry failed events every 10 minutes
        "retry-failed-events": {
            "task": "app.tasks.realtime_tasks.retry_failed_events",
            "schedule": crontab(minute="*/10"),
        },
        # ── Phase 12: Workflow tasks ──────────────────────────────────────
        # Process scheduled workflow triggers every minute
        "workflow-scheduler": {
            "task": "workflow_scheduler",
            "schedule": crontab(minute="*"),
        },
        # Recover stuck workflow executions every 5 minutes
        "workflow-recovery": {
            "task": "workflow_recovery",
            "schedule": crontab(minute="*/5"),
        },
        # Clean up old workflow executions daily at 3 AM UTC
        "workflow-cleanup": {
            "task": "workflow_cleanup",
            "schedule": crontab(hour=3, minute=0),
        },
        # Process dead letter queue hourly
        "workflow-deadletter": {
            "task": "workflow_deadletter",
            "schedule": crontab(minute=0),
        },
    },

    # Result expiration
    result_expires=3600,

    # Worker concurrency
    worker_concurrency=4,
)

# Auto-discover tasks
celery_app.autodiscover_tasks(["app.tasks"])
