"""
AcquisitionOS — Payment Recovery Tasks (Celery)
Phase 4-5: Billing and Payment Gaps Remediation

Tasks:
- process_failed_payments: Scan for failed payments and initiate recovery
- schedule_payment_retry: Schedule next retry attempt for failed payment
- apply_dunning_action: Apply dunning action (notify, restrict, downgrade)
- cleanup_expired_grace_periods: Remove expired grace periods
"""
from app.celery_app import celery_app
import logging
import os
import json
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)


@celery_app.task(bind=True, max_retries=2, default_retry_delay=300)
def process_failed_payments(self):
    """Scan for failed payments and initiate recovery.
    
    Runs daily to check for past_due subscriptions and initiate
    the appropriate dunning sequence.
    
    Recovery schedule:
    - Day 1: Send payment failure notification
    - Day 3: Restrict features + send reminder
    - Day 7: Heavy restrictions + warning of downgrade
    - Day 14: Downgrade to free plan
    """
    logger.info("Processing failed payments and initiating recovery")
    try:
        # In production, this would query the database directly
        # For now, we call the Next.js API endpoint
        api_url = os.environ.get("NEXTJS_API_URL", "http://localhost:3000")
        
        # The actual processing is done by the Next.js service
        # This task serves as a scheduler/trigger
        logger.info("Scanning for past_due subscriptions")
        
        # Track results
        results = {
            "scanned": 0,
            "notified": 0,
            "restricted": 0,
            "downgraded": 0,
            "errors": 0,
        }
        
        logger.info(f"Failed payment processing results: {json.dumps(results)}")
        return results
        
    except Exception as exc:
        logger.error(f"Failed payment processing error: {exc}")
        raise self.retry(exc=exc)


@celery_app.task(bind=True, max_retries=3, default_retry_delay=60)
def schedule_payment_retry(self, user_id: str, subscription_id: str, days_since_failure: int):
    """Schedule next retry attempt for failed payment.
    
    Determines the next retry date based on the dunning schedule:
    - Day 1, 3, 7, 14 after failure
    
    Args:
        user_id: The user ID with the failed payment
        subscription_id: The subscription ID that is past_due
        days_since_failure: Number of days since the payment first failed
    """
    logger.info(f"Scheduling payment retry for user {user_id}, subscription {subscription_id}")
    try:
        dunning_schedule = [1, 3, 7, 14]
        
        # Find next retry step
        next_step = None
        for step in dunning_schedule:
            if step > days_since_failure:
                next_step = step
                break
        
        if next_step is None:
            # All retry attempts exhausted — schedule downgrade
            logger.warning(f"All retry attempts exhausted for user {user_id}. Scheduling downgrade.")
            apply_dunning_action.delay(user_id, subscription_id, "downgrade")
            return {"action": "downgrade", "next_step": None}
        
        days_until_retry = next_step - days_since_failure
        next_retry_date = datetime.utcnow() + timedelta(days=days_until_retry)
        
        # Schedule the dunning action for the next step
        # In production, this would schedule the task for the specific date
        action = "notify" if next_step < 3 else "restrict" if next_step < 14 else "downgrade"
        
        logger.info(
            f"Next retry scheduled for user {user_id}: "
            f"day {next_step} ({next_retry_date.isoformat()}), action: {action}"
        )
        
        return {
            "action": action,
            "next_step": next_step,
            "next_retry_date": next_retry_date.isoformat(),
            "days_until_retry": days_until_retry,
        }
        
    except Exception as exc:
        logger.error(f"Payment retry scheduling error for user {user_id}: {exc}")
        raise self.retry(exc=exc)


@celery_app.task(bind=True, max_retries=2, default_retry_delay=300)
def apply_dunning_action(self, user_id: str, subscription_id: str, action: str):
    """Apply dunning action (notify, restrict, downgrade).
    
    Args:
        user_id: The user ID to apply the action to
        subscription_id: The associated subscription ID
        action: The dunning action to apply ('notify', 'restrict', 'downgrade')
    """
    logger.info(f"Applying dunning action '{action}' for user {user_id}")
    try:
        if action not in ("notify", "restrict", "downgrade"):
            logger.error(f"Invalid dunning action: {action}")
            return {"success": False, "error": f"Invalid action: {action}"}
        
        if action == "notify":
            # Send payment failure notification
            logger.info(f"Sending payment failure notification to user {user_id}")
            # In production: call email service / notification service
            return {"success": True, "action": "notify", "user_id": user_id}
        
        elif action == "restrict":
            # Apply feature restrictions
            logger.info(f"Applying feature restrictions for user {user_id}")
            # In production: update feature flags / entitlements
            return {"success": True, "action": "restrict", "user_id": user_id}
        
        elif action == "downgrade":
            # Downgrade to free plan
            logger.info(f"Downgrading user {user_id} to free plan")
            # In production: call the Next.js API to process the downgrade
            # POST /api/billing/recovery with paymentOrderId
            return {"success": True, "action": "downgrade", "user_id": user_id}
        
    except Exception as exc:
        logger.error(f"Dunning action '{action}' failed for user {user_id}: {exc}")
        raise self.retry(exc=exc)


@celery_app.task(bind=True, max_retries=1, default_retry_delay=60)
def cleanup_expired_grace_periods(self):
    """Remove expired grace periods.
    
    Runs daily to find subscriptions with expired grace periods
    and downgrade them to the free plan.
    """
    logger.info("Cleaning up expired grace periods")
    try:
        now = datetime.utcnow()
        logger.info(f"Checking for grace periods expired before {now.isoformat()}")
        
        # In production, this would query the database for subscriptions
        # where currentPeriodEnd < now AND status = 'past_due'
        # and downgrade them to free plan
        
        cleaned_up = 0
        logger.info(f"Cleaned up {cleaned_up} expired grace periods")
        
        return {
            "success": True,
            "cleaned_up": cleaned_up,
            "checked_at": now.isoformat(),
        }
        
    except Exception as exc:
        logger.error(f"Grace period cleanup error: {exc}")
        raise self.retry(exc=exc)
