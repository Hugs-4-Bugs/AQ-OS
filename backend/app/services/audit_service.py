"""
AcquisitionOS — Audit Logging Service Foundation
Records sensitive actions for compliance and security
"""

import json
import logging
from datetime import datetime
from typing import Optional, Any

logger = logging.getLogger(__name__)


async def log_audit_event(
    user_id: str,
    action: str,
    details: Optional[dict] = None,
    ip_address: Optional[str] = None,
    user_agent: Optional[str] = None,
    resource: Optional[str] = None,
    resource_id: Optional[str] = None,
) -> None:
    """Record an audit log entry.

    Actions include: login, logout, plan_change, gmail_connect, gmail_revoke,
    email_sent, lead_data_export, gdpr_request, api_key_created, etc.

    Phase 2 will implement database persistence. Currently logs to structured logging.
    """
    log_entry = {
        "timestamp": datetime.utcnow().isoformat(),
        "user_id": user_id,
        "action": action,
        "details": details or {},
        "ip_address": ip_address,
        "user_agent": user_agent,
        "resource": resource,
        "resource_id": resource_id,
    }

    logger.info(f"AUDIT | {json.dumps(log_entry, default=str)}")

    # Phase 2: Persist to audit_logs table via database
    # async with get_db_context() as db:
    #     db_audit = AuditLog(
    #         user_id=user_id,
    #         action=action,
    #         details=json.dumps(details) if details else None,
    #         ip_address=ip_address,
    #         user_agent=user_agent,
    #         resource=resource,
    #         resource_id=resource_id,
    #     )
    #     db.add(db_audit)
    #     await db.flush()


# ── Predefined Audit Action Constants ──────────────────────────────
class AuditActions:
    """Standard audit action names for consistency."""
    # Auth
    LOGIN_SUCCESS = "login_success"
    LOGIN_FAILED = "login_failed"
    LOGOUT = "logout"
    SIGNUP = "signup"
    EMAIL_VERIFIED = "email_verified"
    PASSWORD_RESET_REQUESTED = "password_reset_requested"
    PASSWORD_RESET_COMPLETED = "password_reset_completed"
    MFA_ENABLED = "mfa_enabled"
    MFA_DISABLED = "mfa_disabled"
    ACCOUNT_LOCKED = "account_locked"

    # Subscription & Billing
    PLAN_CHANGED = "plan_changed"
    PAYMENT_COMPLETED = "payment_completed"
    PAYMENT_FAILED = "payment_failed"
    COUPON_APPLIED = "coupon_applied"
    TRIAL_STARTED = "trial_started"
    TRIAL_EXPIRED = "trial_expired"

    # Integrations
    GMAIL_CONNECTED = "gmail_connected"
    GMAIL_REVOKED = "gmail_revoked"
    TELEGRAM_CONNECTED = "telegram_connected"
    TELEGRAM_DISCONNECTED = "telegram_disconnected"
    WHATSAPP_CONNECTED = "whatsapp_connected"
    WHATSAPP_DISCONNECTED = "whatsapp_disconnected"

    # Data
    LEAD_EXPORTED = "lead_exported"
    DEAL_CREATED = "deal_created"
    EMAIL_SENT = "email_sent"
    GDPR_REQUEST = "gdpr_request"

    # Admin
    API_KEY_CREATED = "api_key_created"
    API_KEY_REVOKED = "api_key_revoked"
    FEATURE_FLAG_CHANGED = "feature_flag_changed"
    USER_SUSPENDED = "user_suspended"
