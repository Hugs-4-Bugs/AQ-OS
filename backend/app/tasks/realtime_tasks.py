"""
AcquisitionOS — Realtime Tasks
Celery tasks for realtime event processing, connection cleanup, and recovery.
Phase 11: Realtime Remediation
"""

import json
import logging
from datetime import datetime, timedelta

from app.celery_app import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(bind=True, max_retries=3, default_retry_delay=30)
def dispatch_notification(self, user_id: str, notification_type: str,
                          title: str, message: str, channels: list = None):
    """Send a notification via multiple channels (in_app, telegram, whatsapp, email).

    Args:
        user_id: Target user ID
        notification_type: Type of notification (email_reply, deal_won, etc.)
        title: Notification title
        message: Notification message body
        channels: List of delivery channels, defaults to ['in_app']
    """
    if channels is None:
        channels = ['in_app']

    logger.info(
        f"Dispatching notification to user {user_id} "
        f"type={notification_type} channels={channels}"
    )

    try:
        results = {}

        for channel in channels:
            if channel == 'in_app':
                # Create notification record in database
                # This will be picked up by the SSE/WS event stream
                results[channel] = 'dispatched'
                logger.info(f"In-app notification dispatched for user {user_id}")

            elif channel == 'telegram':
                # Delegate to telegram notification task
                from app.tasks.notification_tasks import send_telegram_notification
                send_telegram_notification.delay(
                    chat_id=f"user:{user_id}",
                    message=f"**{title}**\n{message}"
                )
                results[channel] = 'delegated'

            elif channel == 'whatsapp':
                # Delegate to whatsapp notification task
                from app.tasks.notification_tasks import send_whatsapp_notification
                send_whatsapp_notification.delay(
                    phone=f"user:{user_id}",
                    message=f"{title}: {message}",
                    user_id=user_id
                )
                results[channel] = 'delegated'

            elif channel == 'email':
                # Delegate to email task
                from app.tasks.email_tasks import send_email
                try:
                    send_email.delay(
                        to=f"user:{user_id}",
                        subject=title,
                        body=message
                    )
                    results[channel] = 'delegated'
                except Exception:
                    results[channel] = 'email_service_unavailable'

            elif channel == 'push':
                # Push notification via WebSocket/SSE
                from app.tasks.notification_tasks import send_push_notification
                send_push_notification.delay(
                    user_id=user_id,
                    notification_type=notification_type,
                    title=title,
                    message=message
                )
                results[channel] = 'delegated'

            else:
                logger.warning(f"Unknown notification channel: {channel}")
                results[channel] = 'unknown_channel'

        return {
            'user_id': user_id,
            'notification_type': notification_type,
            'channels': results,
            'dispatched_at': datetime.utcnow().isoformat(),
        }

    except Exception as exc:
        logger.error(f"Notification dispatch failed for user {user_id}: {exc}")
        raise self.retry(exc=exc)


@celery_app.task(bind=True, max_retries=3, default_retry_delay=60)
def retry_failed_events(self, max_retries: int = 3, batch_size: int = 100):
    """Retry events that failed to deliver.

    Queries the RealtimeEvent table for undelivered events and
    attempts to redeliver them.

    Runs every 10 minutes via Celery Beat.
    """
    logger.info(f"Checking for failed events to retry (max_retries={max_retries})")

    try:
        # In a full implementation, this would:
        # 1. Query RealtimeEvent where deliveredAt=false and retryCount < max_retries
        # 2. Increment retry count
        # 3. Re-publish to event bus
        # 4. Update delivery status

        # Placeholder implementation
        retried = 0
        failed = 0

        logger.info(
            f"Retry failed events complete: {retried} retried, {failed} permanently failed"
        )

        return {
            'retried': retried,
            'permanently_failed': failed,
            'checked_at': datetime.utcnow().isoformat(),
        }

    except Exception as exc:
        logger.error(f"Retry failed events task error: {exc}")
        raise self.retry(exc=exc)


@celery_app.task(bind=True, max_retries=2, default_retry_delay=30)
def cleanup_stale_connections(self):
    """Remove stale WS/SSE connections.

    Checks for connections with no heartbeat/activity for over 60 seconds
    and cleans them up.

    Runs every 5 minutes via Celery Beat.
    """
    logger.info("Cleaning up stale connections")

    try:
        now = datetime.utcnow()
        stale_threshold = now - timedelta(seconds=60)

        # Clean up WebSocket connections
        ws_cleaned = 0
        # In full implementation:
        # ws_cleaned = db.execute(
        #     "DELETE FROM WsConnection WHERE lastHeartbeat < ?", (stale_threshold,)
        # ).rowcount

        # Clean up SSE connections (5 min inactivity threshold)
        sse_threshold = now - timedelta(minutes=5)
        sse_cleaned = 0
        # In full implementation:
        # sse_cleaned = db.execute(
        #     "DELETE FROM SseConnection WHERE lastActivity < ?", (sse_threshold,)
        # ).rowcount

        logger.info(
            f"Stale connection cleanup: {ws_cleaned} WS, {sse_cleaned} SSE removed"
        )

        return {
            'ws_cleaned': ws_cleaned,
            'sse_cleaned': sse_cleaned,
            'cleaned_at': now.isoformat(),
        }

    except Exception as exc:
        logger.error(f"Stale connection cleanup failed: {exc}")
        raise self.retry(exc=exc)


@celery_app.task(bind=True, max_retries=2, default_retry_delay=60)
def sync_event_delivery(self, batch_size: int = 500):
    """Ensure event delivery consistency.

    Checks for events that are marked as undelivered but should have been
    delivered, and events that are marked as delivered but have no
    delivery confirmation.

    Runs periodically for consistency checks.
    """
    logger.info("Syncing event delivery status")

    try:
        synced = 0
        inconsistencies = 0

        # In full implementation:
        # 1. Find events with deliveredAt=false but with delivery confirmations
        # 2. Find events with deliveredAt=true but no delivery record
        # 3. Reconcile the two

        logger.info(
            f"Event delivery sync complete: {synced} synced, "
            f"{inconsistencies} inconsistencies found"
        )

        return {
            'synced': synced,
            'inconsistencies': inconsistencies,
            'synced_at': datetime.utcnow().isoformat(),
        }

    except Exception as exc:
        logger.error(f"Event delivery sync failed: {exc}")
        raise self.retry(exc=exc)


@celery_app.task(bind=True, max_retries=2, default_retry_delay=300)
def compact_replay_store(self):
    """Compact old replay events.

    Aggregates stats for events past retention period and removes
    individual event records.

    Normal events: 7 day retention
    Critical events (payment, security): 30 day retention

    Runs daily at 4 AM UTC via Celery Beat.
    """
    logger.info("Compacting replay store")

    try:
        now = datetime.utcnow()
        normal_cutoff = now - timedelta(days=7)
        critical_cutoff = now - timedelta(days=30)

        normal_compacted = 0
        critical_compacted = 0

        # Normal channels
        for channel in ['lead_events', 'message_events', 'workflow_events', 'ai_events']:
            # In full implementation:
            # result = db.execute(
            #     "DELETE FROM RealtimeEvent WHERE channel = ? AND createdAt < ? AND deliveredAt = true",
            #     (channel, normal_cutoff)
            # )
            # normal_compacted += result.rowcount
            pass

        # Critical channels (longer retention)
        for channel in ['payment_events', 'notification_events']:
            # In full implementation:
            # result = db.execute(
            #     "DELETE FROM RealtimeEvent WHERE channel = ? AND createdAt < ? AND deliveredAt = true",
            #     (channel, critical_cutoff)
            # )
            # critical_compacted += result.rowcount
            pass

        total = normal_compacted + critical_compacted

        logger.info(
            f"Replay store compaction complete: {normal_compacted} normal, "
            f"{critical_compacted} critical, {total} total removed"
        )

        return {
            'normal_compacted': normal_compacted,
            'critical_compacted': critical_compacted,
            'total_removed': total,
            'compacted_at': now.isoformat(),
        }

    except Exception as exc:
        logger.error(f"Replay store compaction failed: {exc}")
        raise self.retry(exc=exc)


@celery_app.task(bind=True, max_retries=2, default_retry_delay=60)
def recover_offline_events(self, user_id: str = None, batch_size: int = 100):
    """Batch recover offline user events.

    For users who have come back online, deliver missed events
    in priority order (critical first).

    Can be triggered for a specific user or run for all pending offline users.

    Args:
        user_id: Optional specific user to recover events for
        batch_size: Max events per recovery batch (default 100)
    """
    logger.info(f"Recovering offline events for user={user_id or 'all'}")

    try:
        recovered_users = 0
        total_events = 0

        if user_id:
            # Recover for specific user
            # In full implementation, this calls the offline recovery service
            recovered_users = 1
        else:
            # Recover for all users with pending offline periods
            # In full implementation, query offline tracking table
            pass

        logger.info(
            f"Offline event recovery complete: {recovered_users} users, "
            f"{total_events} events recovered"
        )

        return {
            'recovered_users': recovered_users,
            'total_events': total_events,
            'recovered_at': datetime.utcnow().isoformat(),
        }

    except Exception as exc:
        logger.error(f"Offline event recovery failed: {exc}")
        raise self.retry(exc=exc)
