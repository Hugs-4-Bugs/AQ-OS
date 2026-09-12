"""
AcquisitionOS — Analytics & Competitor Intelligence Celery Tasks (Phase 13)
Production implementations with real database queries, Redis caching,
anomaly detection, prediction generation, and insight creation.

Queues: analytics, reports, competitors, maintenance
"""

import asyncio
import csv
import io
import json
import logging
import os
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from celery import shared_task
from sqlalchemy import delete, func, select, and_, or_, text
from sqlalchemy.dialects.sqlite import insert as sqlite_insert

from app.database import get_db_context
from app.models import (
    AiChatSession,
    AnalyticsAnomaly,
    AnalyticsInsight,
    AnalyticsPrediction,
    AnalyticsSnapshot,
    AuditLog,
    CompetitorAnalysis,
    CompetitorData,
    CompetitorSnapshot,
    CreditsLedger,
    DashboardShare,
    DiscoveryJob,
    Lead,
    LeadAnalysis,
    Notification,
    OutreachMessage,
    OutreachSequence,
    Report,
    SequenceEnrollment,
    Subscription,
    UsageTracking,
    User,
    WorkflowDefinition,
    WorkflowExecution,
)
from app.redis_client import (
    cache_set_json,
    cache_get_json,
    cache_delete,
    get_redis,
    cache_analytics,
    cache_competitor,
)

logger = logging.getLogger(__name__)

# ── Environment-based configuration ──────────────────────────────────
COMPETITOR_SCAN_LIMIT = int(os.getenv("COMPETITOR_SCAN_LIMIT", "10"))
REPORT_RETENTION_DAYS = int(os.getenv("REPORT_RETENTION_DAYS", "90"))
ANALYTICS_CACHE_TTL = int(os.getenv("ANALYTICS_CACHE_TTL", "300"))
COMPETITOR_CACHE_TTL = int(os.getenv("COMPETITOR_CACHE_TTL", "1800"))
ANOMALY_DEVIATION_THRESHOLD = float(os.getenv("ANOMALY_DEVIATION_THRESHOLD", "0.25"))
PREDICTION_EXPIRY_DAYS = int(os.getenv("PREDICTION_EXPIRY_DAYS", "90"))
INSIGHT_VALIDITY_DAYS = int(os.getenv("INSIGHT_VALIDITY_DAYS", "30"))

# ── Redis cache key prefixes ────────────────────────────────────────
ANALYTICS_CACHE_PREFIX = "analytics_cache"
REPORT_CACHE_PREFIX = "report_cache"
COMPETITOR_CACHE_PREFIX = "competitor_cache"


def _run_async(coro):
    """Run an async coroutine from a synchronous Celery task context."""
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


# ═════════════════════════════════════════════════════════════════════
# 1. ANALYTICS AGGREGATE — Runs hourly
# ═════════════════════════════════════════════════════════════════════


async def _compute_leads_metrics(session, user_id: str, period_start: datetime, period_end: datetime) -> dict:
    """Compute lead-related analytics metrics for a user."""
    # Total active leads
    total_leads = await session.scalar(
        select(func.count(Lead.id)).where(
            Lead.userId == user_id,
            Lead.isActive == True,
            Lead.deletedAt.is_(None),
            Lead.createdAt >= period_start,
            Lead.createdAt <= period_end,
        )
    ) or 0

    # Leads by stage
    stage_result = await session.execute(
        select(Lead.stage, func.count(Lead.id)).where(
            Lead.userId == user_id,
            Lead.isActive == True,
            Lead.deletedAt.is_(None),
        ).group_by(Lead.stage)
    )
    leads_by_stage = {row[0]: row[1] for row in stage_result.all()}

    # Average conversion score
    avg_conversion = await session.scalar(
        select(func.avg(Lead.conversionScore)).where(
            Lead.userId == user_id,
            Lead.isActive == True,
            Lead.deletedAt.is_(None),
        )
    ) or 0.0

    # Leads by source
    source_result = await session.execute(
        select(Lead.source, func.count(Lead.id)).where(
            Lead.userId == user_id,
            Lead.isActive == True,
            Lead.deletedAt.is_(None),
            Lead.createdAt >= period_start,
            Lead.createdAt <= period_end,
        ).group_by(Lead.source)
    )
    leads_by_source = {row[0] or "unknown": row[1] for row in source_result.all()}

    # Leads by niche
    niche_result = await session.execute(
        select(Lead.niche, func.count(Lead.id)).where(
            Lead.userId == user_id,
            Lead.isActive == True,
            Lead.deletedAt.is_(None),
            Lead.createdAt >= period_start,
            Lead.createdAt <= period_end,
        ).group_by(Lead.niche)
    )
    leads_by_niche = {row[0] or "unknown": row[1] for row in niche_result.all()}

    # Closed won
    closed_won = await session.scalar(
        select(func.count(Lead.id)).where(
            Lead.userId == user_id,
            Lead.stage == "closed_won",
            Lead.createdAt >= period_start,
            Lead.createdAt <= period_end,
        )
    ) or 0

    # Closed lost
    closed_lost = await session.scalar(
        select(func.count(Lead.id)).where(
            Lead.userId == user_id,
            Lead.stage == "closed_lost",
            Lead.createdAt >= period_start,
            Lead.createdAt <= period_end,
        )
    ) or 0

    # Average scores
    avg_reply = await session.scalar(
        select(func.avg(Lead.replyScore)).where(
            Lead.userId == user_id,
            Lead.isActive == True,
            Lead.deletedAt.is_(None),
        )
    ) or 0.0

    avg_urgency = await session.scalar(
        select(func.avg(Lead.urgencyScore)).where(
            Lead.userId == user_id,
            Lead.isActive == True,
            Lead.deletedAt.is_(None),
        )
    ) or 0.0

    avg_revenue = await session.scalar(
        select(func.avg(Lead.revenuePotentialScore)).where(
            Lead.userId == user_id,
            Lead.isActive == True,
            Lead.deletedAt.is_(None),
        )
    ) or 0.0

    return {
        "totalLeads": total_leads,
        "leadsByStage": leads_by_stage,
        "leadsBySource": leads_by_source,
        "leadsByNiche": leads_by_niche,
        "avgConversionScore": round(avg_conversion, 2),
        "avgReplyScore": round(avg_reply, 2),
        "avgUrgencyScore": round(avg_urgency, 2),
        "avgRevenueScore": round(avg_revenue, 2),
        "closedWon": closed_won,
        "closedLost": closed_lost,
        "winRate": round(closed_won / max(closed_won + closed_lost, 1) * 100, 1),
    }


async def _compute_ai_metrics(session, user_id: str, period_start: datetime, period_end: datetime) -> dict:
    """Compute AI-related analytics metrics."""
    # AI chat sessions
    ai_sessions = await session.scalar(
        select(func.count(AiChatSession.id)).where(
            AiChatSession.userId == user_id,
            AiChatSession.createdAt >= period_start,
            AiChatSession.createdAt <= period_end,
        )
    ) or 0

    # Lead analyses
    analyses = await session.scalar(
        select(func.count(LeadAnalysis.id)).join(
            Lead, LeadAnalysis.leadId == Lead.id
        ).where(
            Lead.userId == user_id,
            LeadAnalysis.createdAt >= period_start,
            LeadAnalysis.createdAt <= period_end,
        )
    ) or 0

    # Discovery jobs
    discovery_jobs = await session.scalar(
        select(func.count(DiscoveryJob.id)).where(
            DiscoveryJob.userId == user_id,
            DiscoveryJob.createdAt >= period_start,
            DiscoveryJob.createdAt <= period_end,
        )
    ) or 0

    # Successful discoveries
    successful_discoveries = await session.scalar(
        select(func.count(DiscoveryJob.id)).where(
            DiscoveryJob.userId == user_id,
            DiscoveryJob.status == "completed",
            DiscoveryJob.createdAt >= period_start,
            DiscoveryJob.createdAt <= period_end,
        )
    ) or 0

    # AI-generated outreach messages
    ai_outreach = await session.scalar(
        select(func.count(OutreachMessage.id)).where(
            OutreachMessage.userId == user_id,
            OutreachMessage.generatedByAI == True,
            OutreachMessage.createdAt >= period_start,
            OutreachMessage.createdAt <= period_end,
        )
    ) or 0

    return {
        "aiChatSessions": ai_sessions,
        "leadAnalyses": analyses,
        "discoveryJobs": discovery_jobs,
        "successfulDiscoveries": successful_discoveries,
        "aiGeneratedOutreach": ai_outreach,
        "discoverySuccessRate": round(
            successful_discoveries / max(discovery_jobs, 1) * 100, 1
        ),
    }


async def _compute_messaging_metrics(session, user_id: str, period_start: datetime, period_end: datetime) -> dict:
    """Compute messaging-related analytics metrics."""
    # Outreach messages by status
    status_result = await session.execute(
        select(OutreachMessage.status, func.count(OutreachMessage.id)).where(
            OutreachMessage.userId == user_id,
            OutreachMessage.createdAt >= period_start,
            OutreachMessage.createdAt <= period_end,
        ).group_by(OutreachMessage.status)
    )
    messages_by_status = {row[0]: row[1] for row in status_result.all()}

    # Outreach by channel
    channel_result = await session.execute(
        select(OutreachMessage.channel, func.count(OutreachMessage.id)).where(
            OutreachMessage.userId == user_id,
            OutreachMessage.createdAt >= period_start,
            OutreachMessage.createdAt <= period_end,
        ).group_by(OutreachMessage.channel)
    )
    messages_by_channel = {row[0]: row[1] for row in channel_result.all()}

    # Active sequences
    active_sequences = await session.scalar(
        select(func.count(OutreachSequence.id)).where(
            OutreachSequence.userId == user_id,
            OutreachSequence.status == "active",
        )
    ) or 0

    # Active enrollments
    active_enrollments = await session.scalar(
        select(func.count(SequenceEnrollment.id)).join(
            OutreachSequence, SequenceEnrollment.sequenceId == OutreachSequence.id
        ).where(
            OutreachSequence.userId == user_id,
            SequenceEnrollment.status == "active",
        )
    ) or 0

    # Reply rate
    total_sent = await session.scalar(
        select(func.count(OutreachMessage.id)).where(
            OutreachMessage.userId == user_id,
            OutreachMessage.status.in_(["sent", "delivered", "opened", "replied"]),
            OutreachMessage.createdAt >= period_start,
            OutreachMessage.createdAt <= period_end,
        )
    ) or 0

    total_replied = await session.scalar(
        select(func.count(OutreachMessage.id)).where(
            OutreachMessage.userId == user_id,
            OutreachMessage.status == "replied",
            OutreachMessage.createdAt >= period_start,
            OutreachMessage.createdAt <= period_end,
        )
    ) or 0

    total_opened = await session.scalar(
        select(func.count(OutreachMessage.id)).where(
            OutreachMessage.userId == user_id,
            OutreachMessage.openedAt.isnot(None),
            OutreachMessage.createdAt >= period_start,
            OutreachMessage.createdAt <= period_end,
        )
    ) or 0

    return {
        "messagesByStatus": messages_by_status,
        "messagesByChannel": messages_by_channel,
        "activeSequences": active_sequences,
        "activeEnrollments": active_enrollments,
        "totalSent": total_sent,
        "totalReplied": total_replied,
        "totalOpened": total_opened,
        "replyRate": round(total_replied / max(total_sent, 1) * 100, 1),
        "openRate": round(total_opened / max(total_sent, 1) * 100, 1),
    }


async def _compute_billing_metrics(session, user_id: str, period_start: datetime, period_end: datetime) -> dict:
    """Compute billing-related analytics metrics."""
    # Current subscription
    sub = await session.execute(
        select(Subscription).where(
            Subscription.userId == user_id,
            Subscription.status.in_(["trialing", "active"]),
        ).order_by(Subscription.createdAt.desc()).limit(1)
    )
    subscription = sub.scalar_one_or_none()

    # Credit transactions
    credit_txns = await session.scalar(
        select(func.count(CreditsLedger.id)).where(
            CreditsLedger.userId == user_id,
            CreditsLedger.createdAt >= period_start,
            CreditsLedger.createdAt <= period_end,
        )
    ) or 0

    # Credits spent
    credits_spent = await session.scalar(
        select(func.sum(CreditsLedger.credits)).where(
            CreditsLedger.userId == user_id,
            CreditsLedger.credits < 0,
            CreditsLedger.createdAt >= period_start,
            CreditsLedger.createdAt <= period_end,
        )
    ) or 0

    # Credits by action
    action_result = await session.execute(
        select(CreditsLedger.action, func.sum(CreditsLedger.credits)).where(
            CreditsLedger.userId == user_id,
            CreditsLedger.credits < 0,
            CreditsLedger.createdAt >= period_start,
            CreditsLedger.createdAt <= period_end,
        ).group_by(CreditsLedger.action)
    )
    credits_by_action = {row[0]: abs(row[1]) for row in action_result.all()}

    # Usage tracking
    usage_result = await session.execute(
        select(UsageTracking.feature, func.sum(UsageTracking.count)).where(
            UsageTracking.userId == user_id,
            UsageTracking.createdAt >= period_start,
            UsageTracking.createdAt <= period_end,
        ).group_by(UsageTracking.feature)
    )
    usage_by_feature = {row[0]: row[1] for row in usage_result.all()}

    return {
        "plan": subscription.plan if subscription else "free",
        "subscriptionStatus": subscription.status if subscription else "none",
        "creditTransactions": credit_txns,
        "creditsSpent": abs(credits_spent),
        "creditsByAction": credits_by_action,
        "usageByFeature": usage_by_feature,
    }


async def _compute_workflows_metrics(session, user_id: str, period_start: datetime, period_end: datetime) -> dict:
    """Compute workflow-related analytics metrics."""
    # Active workflows
    active_workflows = await session.scalar(
        select(func.count(WorkflowDefinition.id)).where(
            WorkflowDefinition.userId == user_id,
            WorkflowDefinition.status == "active",
        )
    ) or 0

    # Total executions
    total_executions = await session.scalar(
        select(func.count(WorkflowExecution.id)).join(
            WorkflowDefinition, WorkflowExecution.workflowId == WorkflowDefinition.id
        ).where(
            WorkflowDefinition.userId == user_id,
            WorkflowExecution.createdAt >= period_start,
            WorkflowExecution.createdAt <= period_end,
        )
    ) or 0

    # Successful executions
    successful_executions = await session.scalar(
        select(func.count(WorkflowExecution.id)).join(
            WorkflowDefinition, WorkflowExecution.workflowId == WorkflowDefinition.id
        ).where(
            WorkflowDefinition.userId == user_id,
            WorkflowExecution.status == "completed",
            WorkflowExecution.createdAt >= period_start,
            WorkflowExecution.createdAt <= period_end,
        )
    ) or 0

    # Failed executions
    failed_executions = await session.scalar(
        select(func.count(WorkflowExecution.id)).join(
            WorkflowDefinition, WorkflowExecution.workflowId == WorkflowDefinition.id
        ).where(
            WorkflowDefinition.userId == user_id,
            WorkflowExecution.status == "failed",
            WorkflowExecution.createdAt >= period_start,
            WorkflowExecution.createdAt <= period_end,
        )
    ) or 0

    # By trigger type
    trigger_result = await session.execute(
        select(WorkflowDefinition.triggerType, func.count(WorkflowDefinition.id)).where(
            WorkflowDefinition.userId == user_id,
        ).group_by(WorkflowDefinition.triggerType)
    )
    workflows_by_trigger = {row[0]: row[1] for row in trigger_result.all()}

    return {
        "activeWorkflows": active_workflows,
        "totalExecutions": total_executions,
        "successfulExecutions": successful_executions,
        "failedExecutions": failed_executions,
        "workflowsByTrigger": workflows_by_trigger,
        "successRate": round(successful_executions / max(total_executions, 1) * 100, 1),
    }


COMPUTE_MAP = {
    "leads": _compute_leads_metrics,
    "ai": _compute_ai_metrics,
    "messaging": _compute_messaging_metrics,
    "billing": _compute_billing_metrics,
    "workflows": _compute_workflows_metrics,
}


@shared_task(bind=True, max_retries=3, default_retry_delay=120, queue="analytics")
def analytics_aggregate(self):
    """Aggregate analytics snapshots for all active users.

    Runs hourly via Celery Beat. For each active user, computes analytics
    snapshots (leads, ai, messaging, billing, workflows) and saves them
    to the AnalyticsSnapshot table. Results are cached in Redis with the
    key pattern: analytics_cache:{userId}:{category}:{period}.

    Returns:
        dict: Summary of aggregation results with user counts and snapshot counts.
    """

    async def _run():
        users_processed = 0
        snapshots_created = 0
        errors = []

        now = datetime.now(timezone.utc)
        period_start = now.replace(minute=0, second=0, microsecond=0)
        period_end = period_start + timedelta(hours=1)

        async with get_db_context() as session:
            # Get all active users (logged in within last 30 days or never logged in but active)
            active_cutoff = now - timedelta(days=30)
            result = await session.execute(
                select(User).where(
                    User.isActive == True,
                    User.deletedAt.is_(None),
                    or_(User.lastLoginAt >= active_cutoff, User.lastLoginAt.is_(None)),
                )
            )
            active_users = result.scalars().all()

            logger.info(f"Found {len(active_users)} active users for analytics aggregation")

            for user in active_users:
                try:
                    for category, compute_fn in COMPUTE_MAP.items():
                        # Compute metrics
                        metrics = await compute_fn(session, user.id, period_start, period_end)

                        # Check if snapshot already exists for this period
                        existing = await session.execute(
                            select(AnalyticsSnapshot).where(
                                AnalyticsSnapshot.userId == user.id,
                                AnalyticsSnapshot.category == category,
                                AnalyticsSnapshot.period == "hourly",
                                AnalyticsSnapshot.periodStart == period_start,
                            )
                        )
                        existing_snapshot = existing.scalar_one_or_none()

                        if existing_snapshot:
                            # Update existing
                            existing_snapshot.metrics = json.dumps(metrics, default=str)
                        else:
                            # Create new snapshot
                            snapshot = AnalyticsSnapshot(
                                id=str(uuid.uuid4()),
                                userId=user.id,
                                orgId=user.orgId,
                                category=category,
                                period="hourly",
                                periodStart=period_start,
                                periodEnd=period_end,
                                metrics=json.dumps(metrics, default=str),
                            )
                            session.add(snapshot)
                            snapshots_created += 1

                        # Cache in Redis
                        await cache_analytics(user.id, category, "hourly", metrics)

                    await session.flush()
                    users_processed += 1

                except Exception as e:
                    logger.error(f"Failed to aggregate analytics for user {user.id}: {e}")
                    errors.append({"userId": user.id, "error": str(e)})
                    continue

        logger.info(
            f"Analytics aggregation complete: {users_processed} users, "
            f"{snapshots_created} snapshots created, {len(errors)} errors"
        )

        return {
            "status": "completed",
            "users_processed": users_processed,
            "snapshots_created": snapshots_created,
            "errors": errors[:10],  # Limit error list
        }

    try:
        return _run_async(_run())
    except Exception as exc:
        logger.error(f"Analytics aggregation failed: {exc}")
        raise self.retry(exc=exc)


# ═════════════════════════════════════════════════════════════════════
# 2. REPORT GENERATOR — Generate scheduled reports
# ═════════════════════════════════════════════════════════════════════


def _evaluate_cron_due(schedule_cron: str, last_run_at: Optional[datetime], now: datetime) -> bool:
    """Simple cron evaluator to check if a scheduled report is due.

    Supports basic cron patterns: minute hour day month day_of_week
    For simplicity, we check if enough time has elapsed since last run
    based on the cron frequency.
    """
    if not schedule_cron:
        return False

    parts = schedule_cron.strip().split()
    if len(parts) != 5:
        return False

    # If never run, it's due
    if last_run_at is None:
        return True

    # Simple heuristic: if cron specifies hourly, daily, weekly intervals
    minute, hour, day, month, dow = parts

    if minute != "*" and hour == "*":
        # Every N minutes
        try:
            interval = int(minute)
            return (now - last_run_at) >= timedelta(minutes=interval)
        except ValueError:
            pass

    if hour != "*" and minute != "*":
        # Specific time of day
        try:
            target_hour = int(hour)
            target_minute = int(minute)
            if now.hour >= target_hour and now.minute >= target_minute:
                if last_run_at.date() < now.date():
                    return True
                # Same day but different hour already passed
                if last_run_at.hour < target_hour:
                    return True
        except ValueError:
            pass

    # Daily at specific time
    if hour != "*" and minute != "*":
        try:
            if last_run_at.date() < now.date():
                return True
        except (ValueError, AttributeError):
            pass

    # Weekly check (dow)
    if dow != "*":
        try:
            target_dow = int(dow)
            current_dow = now.weekday()
            if current_dow == target_dow:
                if last_run_at.date() < now.date():
                    return True
        except ValueError:
            pass

    # Monthly check (day of month)
    if day != "*":
        try:
            target_day = int(day)
            if now.day == target_day:
                if last_run_at.month < now.month or last_run_at.year < now.year:
                    return True
        except ValueError:
            pass

    return False


async def _execute_report_query(session, report: Report) -> dict:
    """Execute the report's query based on its filters and dashboard type."""
    try:
        filters = json.loads(report.filters) if report.filters else {}
    except json.JSONDecodeError:
        filters = {}

    date_range = filters.get("dateRange", "30d")
    now = datetime.now(timezone.utc)

    # Parse date range
    if date_range.endswith("d"):
        days = int(date_range[:-1])
        period_start = now - timedelta(days=days)
    elif date_range.endswith("w"):
        weeks = int(date_range[:-1])
        period_start = now - timedelta(weeks=weeks)
    elif date_range.endswith("m"):
        months = int(date_range[:-1])
        period_start = now - timedelta(days=months * 30)
    else:
        period_start = now - timedelta(days=30)

    metrics = filters.get("metrics", [])
    dimensions = filters.get("dimensions", [])

    result_data = {
        "reportName": report.name,
        "dashboard": report.dashboard,
        "dateRange": date_range,
        "periodStart": period_start.isoformat(),
        "periodEnd": now.isoformat(),
        "generatedAt": now.isoformat(),
        "data": {},
    }

    # Build report data based on dashboard type
    if report.dashboard == "executive" or not report.dashboard:
        # Executive summary
        total_leads = await session.scalar(
            select(func.count(Lead.id)).where(
                Lead.userId == report.userId,
                Lead.isActive == True,
                Lead.deletedAt.is_(None),
                Lead.createdAt >= period_start,
            )
        ) or 0

        closed_won = await session.scalar(
            select(func.count(Lead.id)).where(
                Lead.userId == report.userId,
                Lead.stage == "closed_won",
                Lead.createdAt >= period_start,
            )
        ) or 0

        credits_spent = await session.scalar(
            select(func.sum(CreditsLedger.credits)).where(
                CreditsLedger.userId == report.userId,
                CreditsLedger.credits < 0,
                CreditsLedger.createdAt >= period_start,
            )
        ) or 0

        result_data["data"] = {
            "totalLeads": total_leads,
            "closedWon": closed_won,
            "creditsSpent": abs(credits_spent),
            "winRate": round(closed_won / max(total_leads, 1) * 100, 1),
        }

    elif report.dashboard == "sales":
        # Sales pipeline
        stage_result = await session.execute(
            select(Lead.stage, func.count(Lead.id), func.avg(Lead.conversionScore)).where(
                Lead.userId == report.userId,
                Lead.isActive == True,
                Lead.deletedAt.is_(None),
            ).group_by(Lead.stage)
        )
        pipeline_data = []
        for row in stage_result.all():
            pipeline_data.append({
                "stage": row[0],
                "count": row[1],
                "avgConversionScore": round(row[2] or 0, 2),
            })
        result_data["data"] = {"pipeline": pipeline_data}

    elif report.dashboard == "ai":
        # AI performance
        analyses = await session.scalar(
            select(func.count(LeadAnalysis.id)).join(
                Lead, LeadAnalysis.leadId == Lead.id
            ).where(
                Lead.userId == report.userId,
                LeadAnalysis.createdAt >= period_start,
            )
        ) or 0

        ai_outreach = await session.scalar(
            select(func.count(OutreachMessage.id)).where(
                OutreachMessage.userId == report.userId,
                OutreachMessage.generatedByAI == True,
                OutreachMessage.createdAt >= period_start,
            )
        ) or 0

        result_data["data"] = {
            "analysesPerformed": analyses,
            "aiOutreachGenerated": ai_outreach,
        }

    elif report.dashboard == "ops":
        # Operational metrics
        workflow_executions = await session.scalar(
            select(func.count(WorkflowExecution.id)).join(
                WorkflowDefinition, WorkflowExecution.workflowId == WorkflowDefinition.id
            ).where(
                WorkflowDefinition.userId == report.userId,
                WorkflowExecution.createdAt >= period_start,
            )
        ) or 0

        failed_workflows = await session.scalar(
            select(func.count(WorkflowExecution.id)).join(
                WorkflowDefinition, WorkflowExecution.workflowId == WorkflowDefinition.id
            ).where(
                WorkflowDefinition.userId == report.userId,
                WorkflowExecution.status == "failed",
                WorkflowExecution.createdAt >= period_start,
            )
        ) or 0

        result_data["data"] = {
            "workflowExecutions": workflow_executions,
            "failedWorkflows": failed_workflows,
        }

    return result_data


def _export_to_format(data: dict, fmt: str) -> Optional[str]:
    """Export report data to the specified format. Returns the data string."""
    if fmt == "json":
        return json.dumps(data, indent=2, default=str)
    elif fmt == "csv":
        # Flatten the data for CSV export
        output = io.StringIO()
        writer = csv.writer(output)
        flat = _flatten_dict(data)
        writer.writerow(["Key", "Value"])
        for key, value in flat.items():
            writer.writerow([key, value])
        return output.getvalue()
    elif fmt == "pdf":
        # PDF data is stored as JSON metadata (actual PDF generation requires a library)
        return json.dumps({"format": "pdf", "data": data}, default=str)
    return None


def _flatten_dict(d: dict, parent_key: str = "", sep: str = ".") -> dict:
    """Flatten a nested dict for CSV export."""
    items = []
    for k, v in d.items():
        new_key = f"{parent_key}{sep}{k}" if parent_key else k
        if isinstance(v, dict):
            items.extend(_flatten_dict(v, new_key, sep=sep).items())
        elif isinstance(v, list):
            items.append((new_key, json.dumps(v, default=str)))
        else:
            items.append((new_key, str(v) if v is not None else ""))
    return dict(items)


@shared_task(
    bind=True,
    max_retries=3,
    default_retry_delay=60,
    queue="reports",
)
def report_generator(self, report_id: Optional[str] = None, user_id: Optional[str] = None, export_format: Optional[str] = None):
    """Generate scheduled reports.

    When report_id is provided, generates that specific report.
    When called without arguments, finds all scheduled reports that are due
    and generates them.

    Args:
        report_id: Optional specific report ID to generate.
        user_id: Optional user ID who owns the report.
        export_format: Optional export format override (csv/json/pdf).

    Returns:
        dict: Report generation results.
    """

    async def _run():
        now = datetime.now(timezone.utc)
        reports_generated = 0
        errors = []

        async with get_db_context() as session:
            if report_id:
                # Generate a specific report
                result = await session.execute(
                    select(Report).where(Report.id == report_id)
                )
                reports_to_run = [result.scalar_one_or_none()] if result.scalar_one_or_none() else []
            else:
                # Find all scheduled reports that are due
                result = await session.execute(
                    select(Report).where(
                        Report.scheduleCron.isnot(None),
                        Report.scheduleCron != "",
                    )
                )
                all_scheduled = result.scalars().all()
                reports_to_run = [
                    r for r in all_scheduled
                    if _evaluate_cron_due(r.scheduleCron, r.lastRunAt, now)
                ]

            logger.info(f"Found {len(reports_to_run)} reports to generate")

            for report in reports_to_run:
                try:
                    # Execute the report query
                    report_data = await _execute_report_query(session, report)

                    # Determine export format
                    fmt = export_format or report.exportFormat or "json"

                    # Export to format
                    exported = _export_to_format(report_data, fmt)
                    if exported is None:
                        fmt = "json"
                        exported = json.dumps(report_data, indent=2, default=str)

                    # Store export URL (in production this would upload to S3/R2)
                    export_url = f"/reports/{report.id}/exports/{now.strftime('%Y%m%d%H%M%S')}.{fmt}"

                    # Update report record
                    report.lastRunAt = now

                    # Calculate next run time based on cron
                    # Simplified: set nextRunAt to 1 day from now for daily, 1 hour for hourly
                    cron_parts = (report.scheduleCron or "").split()
                    if len(cron_parts) == 5 and cron_parts[1] != "*":
                        report.nextRunAt = now + timedelta(days=1)
                    elif len(cron_parts) == 5 and cron_parts[0] != "*":
                        report.nextRunAt = now + timedelta(hours=1)
                    else:
                        report.nextRunAt = now + timedelta(days=1)

                    report.lastExportUrl = export_url

                    # Cache the report
                    cache_key = f"{REPORT_CACHE_PREFIX}:{report.id}"
                    await cache_set_json(cache_key, {
                        "reportId": report.id,
                        "exportUrl": export_url,
                        "format": fmt,
                        "generatedAt": now.isoformat(),
                        "dataPreview": report_data,
                    }, 3600)

                    # Create audit log entry
                    audit = AuditLog(
                        id=str(uuid.uuid4()),
                        userId=report.userId,
                        action="report_generated",
                        details=json.dumps({
                            "reportId": report.id,
                            "reportName": report.name,
                            "format": fmt,
                            "exportUrl": export_url,
                        }),
                        resource="report",
                        resourceId=report.id,
                    )
                    session.add(audit)

                    await session.flush()
                    reports_generated += 1

                    logger.info(f"Generated report {report.id} for user {report.userId}")

                except Exception as e:
                    logger.error(f"Failed to generate report {report.id}: {e}")
                    errors.append({"reportId": report.id, "error": str(e)})
                    continue

        return {
            "status": "completed",
            "reports_generated": reports_generated,
            "errors": errors[:10],
        }

    try:
        return _run_async(_run())
    except Exception as exc:
        logger.error(f"Report generation failed: {exc}")
        raise self.retry(exc=exc)


# ═════════════════════════════════════════════════════════════════════
# 3. COMPETITOR SCAN — Scan competitor websites for changes
# ═════════════════════════════════════════════════════════════════════


@shared_task(
    bind=True,
    max_retries=3,
    default_retry_delay=300,
    queue="competitors",
)
def competitor_scan(self, competitor_id: Optional[str] = None, user_id: Optional[str] = None):
    """Scan competitor websites for changes.

    When competitor_id is provided, scans that specific competitor.
    When called without arguments, finds all CompetitorData records that
    haven't been scraped in 24h and scans them.

    For each competitor:
    - Take a new snapshot
    - Compare with previous snapshot to detect changes
    - Store change in changeLog
    - Create CompetitorSnapshot record
    - Cache in Redis with key competitor_cache:{competitorId}

    Rate limited: respects COMPETITOR_SCAN_LIMIT env var.

    Args:
        competitor_id: Optional specific competitor ID to scan.
        user_id: Optional user ID for rate limiting.

    Returns:
        dict: Scan result with extracted data summary.
    """

    async def _run():
        now = datetime.now(timezone.utc)
        twenty_four_hours_ago = now - timedelta(hours=24)
        scans_completed = 0
        changes_detected = 0
        errors = []

        async with get_db_context() as session:
            if competitor_id:
                # Scan specific competitor
                result = await session.execute(
                    select(CompetitorData).where(CompetitorData.id == competitor_id)
                )
                competitors = [result.scalar_one_or_none()] if result.scalar_one_or_none() else []
            else:
                # Find all competitors not scraped in 24h
                result = await session.execute(
                    select(CompetitorData).where(
                        or_(
                            CompetitorData.lastScrapedAt.is_(None),
                            CompetitorData.lastScrapedAt < twenty_four_hours_ago,
                        )
                    ).limit(COMPETITOR_SCAN_LIMIT)
                )
                competitors = result.scalars().all()

            logger.info(f"Found {len(competitors)} competitors to scan")

            for competitor in competitors:
                try:
                    # ── Rate limit check ──────────────────────────────
                    # Find the user who owns this competitor via CompetitorAnalysis
                    analysis_result = await session.execute(
                        select(CompetitorAnalysis).where(
                            CompetitorAnalysis.competitorDataId == competitor.id
                        ).limit(1)
                    )
                    analysis = analysis_result.scalar_one_or_none()
                    owner_user_id = analysis.userId if analysis else user_id

                    if owner_user_id:
                        rate_key = f"competitor_scan_rate:{owner_user_id}"
                        redis = await get_redis()
                        current_count = await redis.get(rate_key)
                        if current_count and int(current_count) >= COMPETITOR_SCAN_LIMIT:
                            logger.warning(
                                f"Competitor scan rate limit reached for user {owner_user_id}: "
                                f"{current_count}/{COMPETITOR_SCAN_LIMIT}"
                            )
                            continue
                        pipe = redis.pipeline()
                        pipe.incr(rate_key)
                        pipe.expire(rate_key, 3600)
                        await pipe.execute()

                    # ── Get previous snapshot for comparison ──────────
                    prev_snapshot_result = await session.execute(
                        select(CompetitorSnapshot).where(
                            CompetitorSnapshot.competitorId == competitor.id
                        ).order_by(CompetitorSnapshot.createdAt.desc()).limit(1)
                    )
                    prev_snapshot = prev_snapshot_result.scalar_one_or_none()

                    # ── Build new snapshot data ───────────────────────
                    # In production, this would use web scraping (z-ai-web-dev-sdk)
                    # For now, we capture what we know from the existing data
                    new_snapshot_data = {
                        "competitorName": competitor.competitorName,
                        "competitorUrl": competitor.competitorUrl,
                        "description": competitor.description,
                        "industry": competitor.industry,
                        "lighthouseScore": competitor.lighthouseScore,
                        "pageSpeedScore": competitor.pageSpeedScore,
                        "estimatedTraffic": competitor.estimatedTraffic,
                        "socialProfiles": competitor.socialProfiles,
                        "seoMetadata": competitor.seoMetadata,
                        "techStackData": competitor.techStackData,
                        "pricingPageUrl": competitor.pricingPageUrl,
                        "reviewsSummary": competitor.reviewsSummary,
                        "scrapedAt": now.isoformat(),
                    }

                    # ── Detect changes ────────────────────────────────
                    changes = []
                    if prev_snapshot and prev_snapshot.rawData:
                        try:
                            prev_data = json.loads(prev_snapshot.rawData)
                        except json.JSONDecodeError:
                            prev_data = {}

                        # Compare fields
                        watch_fields = [
                            "description", "lighthouseScore", "pageSpeedScore",
                            "estimatedTraffic", "techStackData", "pricingPageUrl",
                            "reviewsSummary", "socialProfiles",
                        ]
                        for field in watch_fields:
                            old_val = prev_data.get(field)
                            new_val = new_snapshot_data.get(field)
                            if old_val != new_val and new_val is not None:
                                changes.append({
                                    "field": field,
                                    "oldValue": old_val,
                                    "newValue": new_val,
                                    "detectedAt": now.isoformat(),
                                })

                    # ── Update changeLog ──────────────────────────────
                    if changes:
                        try:
                            existing_log = json.loads(competitor.changeLog) if competitor.changeLog else []
                        except json.JSONDecodeError:
                            existing_log = []

                        existing_log.extend(changes)
                        # Keep only the last 100 changes
                        competitor.changeLog = json.dumps(existing_log[-100:], default=str)
                        changes_detected += len(changes)

                    # ── Create CompetitorSnapshot ─────────────────────
                    snapshot = CompetitorSnapshot(
                        id=str(uuid.uuid4()),
                        competitorId=competitor.id,
                        userId=owner_user_id or "system",
                        snapshotType="full",
                        seoScore=competitor.lighthouseScore,
                        techStack=competitor.techStackData,
                        estimatedTraffic="medium" if (competitor.estimatedTraffic or 0) > 1000 else "low",
                        rawData=json.dumps(new_snapshot_data, default=str),
                    )
                    session.add(snapshot)

                    # ── Update CompetitorData ─────────────────────────
                    competitor.lastScrapedAt = now

                    await session.flush()
                    scans_completed += 1

                    # ── Cache in Redis ────────────────────────────────
                    await cache_competitor(competitor.id, {
                        "competitorId": competitor.id,
                        "competitorName": competitor.competitorName,
                        "scanStatus": "completed",
                        "changesDetected": len(changes),
                        "lastScrapedAt": now.isoformat(),
                    })

                    logger.info(
                        f"Scanned competitor {competitor.id}: "
                        f"{len(changes)} changes detected"
                    )

                except Exception as e:
                    logger.error(f"Failed to scan competitor {competitor.id}: {e}")
                    errors.append({"competitorId": competitor.id, "error": str(e)})
                    continue

        return {
            "status": "completed",
            "scans_completed": scans_completed,
            "changes_detected": changes_detected,
            "errors": errors[:10],
        }

    try:
        return _run_async(_run())
    except Exception as exc:
        logger.error(f"Competitor scan failed: {exc}")
        raise self.retry(exc=exc)


# ═════════════════════════════════════════════════════════════════════
# 4. COMPETITOR REFRESH — Daily deep refresh
# ═════════════════════════════════════════════════════════════════════


@shared_task(
    bind=True,
    max_retries=2,
    default_retry_delay=600,
    queue="competitors",
)
def competitor_refresh(self):
    """Daily deep refresh of all active competitor analyses.

    For each active CompetitorAnalysis:
    - Update SEO scores, social scores, pricing data
    - Compute opportunity score
    - Update threat level assessment
    - Create CompetitorSnapshot for tracking

    Returns:
        dict: Summary of refresh results with count.
    """

    async def _run():
        now = datetime.now(timezone.utc)
        refreshed = 0
        errors = []

        async with get_db_context() as session:
            # Find all active CompetitorAnalysis records
            result = await session.execute(
                select(CompetitorAnalysis).where(
                    CompetitorAnalysis.lastAnalyzedAt.is_(None) |
                    (CompetitorAnalysis.lastAnalyzedAt < now - timedelta(days=1))
                ).limit(100)
            )
            analyses = result.scalars().all()

            logger.info(f"Found {len(analyses)} competitor analyses to refresh")

            for analysis in analyses:
                try:
                    # ── Get linked CompetitorData ─────────────────────
                    comp_data = None
                    if analysis.competitorDataId:
                        cd_result = await session.execute(
                            select(CompetitorData).where(
                                CompetitorData.id == analysis.competitorDataId
                            )
                        )
                        comp_data = cd_result.scalar_one_or_none()

                    # ── Update SEO score ─────────────────────────────
                    if comp_data and comp_data.lighthouseScore:
                        # Derive SEO score from lighthouse (0-100)
                        analysis.seoScore = comp_data.lighthouseScore

                    # ── Update social score ───────────────────────────
                    if comp_data and comp_data.socialProfiles:
                        try:
                            profiles = json.loads(comp_data.socialProfiles)
                            # Count active social profiles (0-5 -> 0-100 scale)
                            active_profiles = sum(
                                1 for p in ["twitter", "linkedin", "facebook", "instagram"]
                                if profiles.get(p)
                            )
                            analysis.socialScore = min(active_profiles * 25, 100)
                        except json.JSONDecodeError:
                            pass

                    # ── Update pricing data ───────────────────────────
                    if comp_data and comp_data.reviewsSummary:
                        try:
                            reviews = json.loads(comp_data.reviewsSummary)
                            analysis.reviewsData = json.dumps(reviews, default=str)
                        except json.JSONDecodeError:
                            pass

                    # ── Compute opportunity score ─────────────────────
                    opportunity = 0
                    # Weaknesses = our opportunity
                    if analysis.weaknesses:
                        try:
                            weaknesses = json.loads(analysis.weaknesses)
                            opportunity += len(weaknesses) * 10
                        except json.JSONDecodeError:
                            pass

                    # Low SEO score = opportunity
                    if analysis.seoScore and analysis.seoScore < 50:
                        opportunity += (50 - analysis.seoScore)

                    # Low social score = opportunity
                    if analysis.socialScore and analysis.socialScore < 40:
                        opportunity += (40 - analysis.socialScore)

                    # Differentiation opportunities
                    if analysis.differentiationOpportunities:
                        try:
                            diff_opps = json.loads(analysis.differentiationOpportunities)
                            opportunity += len(diff_opps) * 8
                        except json.JSONDecodeError:
                            pass

                    analysis.opportunityScore = min(max(opportunity, 0), 100)

                    # ── Update threat level assessment ────────────────
                    threat_score = 0
                    # High SEO = threat
                    if analysis.seoScore and analysis.seoScore > 70:
                        threat_score += 30

                    # High social = threat
                    if analysis.socialScore and analysis.socialScore > 60:
                        threat_score += 25

                    # Many strengths = threat
                    if analysis.strengths:
                        try:
                            strengths = json.loads(analysis.strengths)
                            threat_score += min(len(strengths) * 8, 25)
                        except json.JSONDecodeError:
                            pass

                    # High estimated traffic = threat
                    if analysis.estimatedTrafficTier == "high":
                        threat_score += 20
                    elif analysis.estimatedTrafficTier == "medium":
                        threat_score += 10

                    if threat_score >= 60:
                        analysis.threatLevel = "high"
                    elif threat_score >= 30:
                        analysis.threatLevel = "medium"
                    else:
                        analysis.threatLevel = "low"

                    # ── Create CompetitorSnapshot for tracking ────────
                    snapshot = CompetitorSnapshot(
                        id=str(uuid.uuid4()),
                        competitorId=analysis.id,
                        userId=analysis.userId,
                        snapshotType="full",
                        seoScore=analysis.seoScore,
                        socialScore=analysis.socialScore,
                        pricingModel=analysis.pricingModel,
                        techStack=analysis.techStack,
                        strengths=analysis.strengths,
                        weaknesses=analysis.weaknesses,
                        estimatedTraffic=analysis.estimatedTrafficTier,
                        rawData=json.dumps({
                            "opportunityScore": analysis.opportunityScore,
                            "threatLevel": analysis.threatLevel,
                            "threatScore": threat_score,
                            "analyzedAt": now.isoformat(),
                        }, default=str),
                    )
                    session.add(snapshot)

                    # ── Update lastAnalyzedAt ─────────────────────────
                    analysis.lastAnalyzedAt = now

                    await session.flush()
                    refreshed += 1

                    # ── Cache ─────────────────────────────────────────
                    await cache_competitor(analysis.id, {
                        "competitorId": analysis.id,
                        "competitorName": analysis.competitorName,
                        "opportunityScore": analysis.opportunityScore,
                        "threatLevel": analysis.threatLevel,
                        "seoScore": analysis.seoScore,
                        "socialScore": analysis.socialScore,
                        "refreshedAt": now.isoformat(),
                    })

                except Exception as e:
                    logger.error(f"Failed to refresh competitor analysis {analysis.id}: {e}")
                    errors.append({"analysisId": analysis.id, "error": str(e)})
                    continue

        logger.info(f"Competitor refresh complete: {refreshed} analyses refreshed")

        return {
            "status": "completed",
            "refreshed": refreshed,
            "errors": errors[:10],
        }

    try:
        return _run_async(_run())
    except Exception as exc:
        logger.error(f"Competitor refresh failed: {exc}")
        raise self.retry(exc=exc)


# ═════════════════════════════════════════════════════════════════════
# 5. ANALYTICS CLEANUP — Daily cleanup
# ═════════════════════════════════════════════════════════════════════


@shared_task(
    bind=True,
    max_retries=2,
    default_retry_delay=300,
    queue="maintenance",
)
def analytics_cleanup(self):
    """Clean up old analytics data, report exports, and cache entries.

    Runs daily. Performs the following:
    1. Remove AnalyticsSnapshot records older than 90 days
    2. Remove AnalyticsAnomaly records older than 30 days (resolved ones)
    3. Remove AnalyticsPrediction records that have expired
    4. Remove AnalyticsInsight records past their validUntil date
    5. Remove DashboardShare records that have expired
    6. Clean up Redis cache keys older than TTL

    Returns:
        dict: Summary of cleanup results with deletion counts.
    """

    async def _run():
        now = datetime.now(timezone.utc)
        retention_cutoff = now - timedelta(days=REPORT_RETENTION_DAYS)

        async with get_db_context() as session:
            # ── 1. Delete old AnalyticsSnapshot records (90 days) ───
            snapshot_result = await session.execute(
                delete(AnalyticsSnapshot).where(
                    AnalyticsSnapshot.createdAt < retention_cutoff
                )
            )
            deleted_snapshots = snapshot_result.rowcount

            # ── 2. Delete resolved AnalyticsAnomaly records (30 days) ─
            anomaly_cutoff = now - timedelta(days=30)
            anomaly_result = await session.execute(
                delete(AnalyticsAnomaly).where(
                    AnalyticsAnomaly.status == "resolved",
                    AnalyticsAnomaly.resolvedAt < anomaly_cutoff,
                )
            )
            deleted_anomalies = anomaly_result.rowcount

            # ── 3. Remove expired AnalyticsPrediction records ────────
            prediction_result = await session.execute(
                delete(AnalyticsPrediction).where(
                    AnalyticsPrediction.expiresAt < now
                )
            )
            deleted_predictions = prediction_result.rowcount

            # ── 4. Remove AnalyticsInsight records past validUntil ───
            insight_result = await session.execute(
                delete(AnalyticsInsight).where(
                    AnalyticsInsight.validUntil < now
                )
            )
            deleted_insights = insight_result.rowcount

            # ── 5. Remove expired DashboardShare records ─────────────
            share_result = await session.execute(
                delete(DashboardShare).where(
                    DashboardShare.expiresAt < now,
                    DashboardShare.isActive == True,
                )
            )
            # Also deactivate expired shares instead of deleting
            expired_shares = await session.execute(
                select(DashboardShare).where(
                    DashboardShare.expiresAt < now,
                    DashboardShare.isActive == True,
                )
            )
            for share in expired_shares.scalars().all():
                share.isActive = False
            deactivated_shares = len(expired_shares.scalars().all())

            # ── 6. Clean up old CompetitorSnapshot records ───────────
            # Keep only the last 10 snapshots per competitor
            competitor_ids_result = await session.execute(
                select(CompetitorSnapshot.competitorId).distinct()
            )
            deleted_competitor_snapshots = 0
            for (comp_id,) in competitor_ids_result.all():
                snapshots_result = await session.execute(
                    select(CompetitorSnapshot).where(
                        CompetitorSnapshot.competitorId == comp_id
                    ).order_by(CompetitorSnapshot.createdAt.desc())
                )
                all_snapshots = snapshots_result.scalars().all()
                if len(all_snapshots) > 10:
                    for snapshot in all_snapshots[10:]:
                        await session.delete(snapshot)
                        deleted_competitor_snapshots += 1

            await session.flush()

        # ── 7. Clean up Redis cache keys ─────────────────────────────
        expired_cache = 0
        try:
            redis = await get_redis()
            for prefix in [ANALYTICS_CACHE_PREFIX, REPORT_CACHE_PREFIX, COMPETITOR_CACHE_PREFIX]:
                pattern = f"{prefix}:*"
                keys = await redis.keys(pattern)
                for key in keys:
                    ttl = await redis.ttl(key)
                    # -1 = no expiry, -2 = doesn't exist
                    if ttl == -1:
                        # Key has no TTL — set one to prevent permanent caching
                        await redis.expire(key, ANALYTICS_CACHE_TTL)
                    elif ttl == -2:
                        expired_cache += 1
        except Exception as e:
            logger.warning(f"Redis cache cleanup error (non-critical): {e}")

        total_deleted = (
            deleted_snapshots
            + deleted_anomalies
            + deleted_predictions
            + deleted_insights
            + deactivated_shares
            + deleted_competitor_snapshots
        )

        logger.info(
            f"Analytics cleanup complete: "
            f"{deleted_snapshots} snapshots, "
            f"{deleted_anomalies} anomalies, "
            f"{deleted_predictions} predictions, "
            f"{deleted_insights} insights, "
            f"{deactivated_shares} shares deactivated, "
            f"{deleted_competitor_snapshots} competitor snapshots, "
            f"{expired_cache} expired cache entries "
            f"({total_deleted} total)"
        )

        return {
            "status": "completed",
            "deleted_snapshots": deleted_snapshots,
            "deleted_anomalies": deleted_anomalies,
            "deleted_predictions": deleted_predictions,
            "deleted_insights": deleted_insights,
            "deactivated_shares": deactivated_shares,
            "deleted_competitor_snapshots": deleted_competitor_snapshots,
            "expired_cache_entries": expired_cache,
            "total_deleted": total_deleted,
        }

    try:
        return _run_async(_run())
    except Exception as exc:
        logger.error(f"Analytics cleanup failed: {exc}")
        raise self.retry(exc=exc)


# ═════════════════════════════════════════════════════════════════════
# 6. PREDICTIONS GENERATE — Generate predictions (every 6 hours)
# ═════════════════════════════════════════════════════════════════════


async def _generate_lead_predictions(session, user_id: str) -> int:
    """Generate lead-related predictions for a user."""
    now = datetime.now(timezone.utc)
    predictions_created = 0

    # ── Lead velocity prediction ─────────────────────────────────────
    # Count leads created in last 7, 14, 30 days
    for days, horizon in [(7, "7d"), (14, "14d"), (30, "30d")]:
        period_start = now - timedelta(days=days)
        lead_count = await session.scalar(
            select(func.count(Lead.id)).where(
                Lead.userId == user_id,
                Lead.isActive == True,
                Lead.deletedAt.is_(None),
                Lead.createdAt >= period_start,
            )
        ) or 0

        # Simple linear projection
        daily_rate = lead_count / days
        predicted_value = daily_rate * days * 1.05  # 5% growth assumption

        prediction = AnalyticsPrediction(
            id=str(uuid.uuid4()),
            userId=user_id,
            category="lead",
            predictionType="lead_velocity",
            predictedValue=round(predicted_value, 1),
            confidence=round(max(0.3, min(0.9, lead_count / 50)), 2),
            modelVersion="v1",
            inputData=json.dumps({
                "days": days,
                "leadCount": lead_count,
                "dailyRate": round(daily_rate, 2),
            }),
            predictionHorizon=horizon,
            expiresAt=now + timedelta(days=PREDICTION_EXPIRY_DAYS),
        )
        session.add(prediction)
        predictions_created += 1

    # ── Conversion probability for active leads ──────────────────────
    active_leads_result = await session.execute(
        select(Lead).where(
            Lead.userId == user_id,
            Lead.isActive == True,
            Lead.deletedAt.is_(None),
            Lead.stage.notin_(["closed_won", "closed_lost"]),
            Lead.conversionScore > 0,
        ).limit(20)
    )
    for lead in active_leads_result.scalars().all():
        # Predict based on current conversion score
        conv_prob = min(lead.conversionScore / 100, 1.0)
        prediction = AnalyticsPrediction(
            id=str(uuid.uuid4()),
            userId=user_id,
            category="lead",
            predictionType="conversion_probability",
            targetEntityId=lead.id,
            predictedValue=round(conv_prob, 3),
            confidence=round(min(0.85, conv_prob + 0.2), 2),
            modelVersion="v1",
            inputData=json.dumps({
                "leadId": lead.id,
                "currentStage": lead.stage,
                "conversionScore": lead.conversionScore,
                "replyScore": lead.replyScore,
                "urgencyScore": lead.urgencyScore,
            }),
            predictionHorizon="30d",
            expiresAt=now + timedelta(days=PREDICTION_EXPIRY_DAYS),
        )
        session.add(prediction)
        predictions_created += 1

    # ── Expected revenue prediction ──────────────────────────────────
    closed_won = await session.scalar(
        select(func.count(Lead.id)).where(
            Lead.userId == user_id,
            Lead.stage == "closed_won",
            Lead.createdAt >= now - timedelta(days=30),
        )
    ) or 0

    active_in_pipeline = await session.scalar(
        select(func.count(Lead.id)).where(
            Lead.userId == user_id,
            Lead.isActive == True,
            Lead.deletedAt.is_(None),
            Lead.stage.notin_(["closed_won", "closed_lost"]),
        )
    ) or 0

    if active_in_pipeline > 0:
        # Expected revenue based on pipeline conversion
        avg_conv = await session.scalar(
            select(func.avg(Lead.conversionScore)).where(
                Lead.userId == user_id,
                Lead.isActive == True,
                Lead.deletedAt.is_(None),
                Lead.stage.notin_(["closed_won", "closed_lost"]),
            )
        ) or 0

        expected_conversions = active_in_pipeline * (avg_conv / 100)
        prediction = AnalyticsPrediction(
            id=str(uuid.uuid4()),
            userId=user_id,
            category="lead",
            predictionType="expected_revenue",
            predictedValue=round(expected_conversions, 1),
            confidence=round(min(0.75, expected_conversions / 10), 2),
            modelVersion="v1",
            inputData=json.dumps({
                "pipelineSize": active_in_pipeline,
                "avgConversionScore": round(avg_conv, 2),
                "recentClosedWon": closed_won,
            }),
            predictionHorizon="30d",
            expiresAt=now + timedelta(days=PREDICTION_EXPIRY_DAYS),
        )
        session.add(prediction)
        predictions_created += 1

    return predictions_created


async def _generate_billing_predictions(session, user_id: str) -> int:
    """Generate billing-related predictions for a user."""
    now = datetime.now(timezone.utc)
    predictions_created = 0

    # ── Future credits usage forecast ────────────────────────────────
    credits_7d = await session.scalar(
        select(func.sum(CreditsLedger.credits)).where(
            CreditsLedger.userId == user_id,
            CreditsLedger.credits < 0,
            CreditsLedger.createdAt >= now - timedelta(days=7),
        )
    ) or 0

    credits_30d = await session.scalar(
        select(func.sum(CreditsLedger.credits)).where(
            CreditsLedger.userId == user_id,
            CreditsLedger.credits < 0,
            CreditsLedger.createdAt >= now - timedelta(days=30),
        )
    ) or 0

    if credits_30d != 0:
        daily_rate_7d = abs(credits_7d) / 7
        daily_rate_30d = abs(credits_30d) / 30
        # Weight recent usage more heavily
        predicted_daily = (daily_rate_7d * 0.7 + daily_rate_30d * 0.3)
        predicted_30d = predicted_daily * 30

        prediction = AnalyticsPrediction(
            id=str(uuid.uuid4()),
            userId=user_id,
            category="billing",
            predictionType="future_credits",
            predictedValue=round(predicted_30d, 1),
            confidence=round(min(0.8, abs(credits_30d) / 100), 2),
            modelVersion="v1",
            inputData=json.dumps({
                "credits7d": abs(credits_7d),
                "credits30d": abs(credits_30d),
                "dailyRate7d": round(daily_rate_7d, 2),
                "dailyRate30d": round(daily_rate_30d, 2),
            }),
            predictionHorizon="30d",
            expiresAt=now + timedelta(days=PREDICTION_EXPIRY_DAYS),
        )
        session.add(prediction)
        predictions_created += 1

    # ── Churn prediction ─────────────────────────────────────────────
    # Check subscription status and activity
    sub_result = await session.execute(
        select(Subscription).where(
            Subscription.userId == user_id,
            Subscription.status.in_(["active", "trialing"]),
        ).limit(1)
    )
    subscription = sub_result.scalar_one_or_none()

    if subscription:
        # Simple churn signal: low usage in last 7 days
        recent_usage = await session.scalar(
            select(func.count(CreditsLedger.id)).where(
                CreditsLedger.userId == user_id,
                CreditsLedger.createdAt >= now - timedelta(days=7),
            )
        ) or 0

        # Days since last login
        user_result = await session.execute(
            select(User.lastLoginAt).where(User.id == user_id)
        )
        last_login = user_result.scalar_one_or_none()
        days_since_login = (now - last_login).days if last_login else 999

        # Churn probability increases with inactivity
        churn_prob = 0.0
        if days_since_login > 14:
            churn_prob += 0.3
        if days_since_login > 30:
            churn_prob += 0.3
        if recent_usage < 3:
            churn_prob += 0.2
        if subscription.isTrial and subscription.trialEndsAt and subscription.trialEndsAt < now + timedelta(days=3):
            churn_prob += 0.2
        churn_prob = min(churn_prob, 0.95)

        prediction = AnalyticsPrediction(
            id=str(uuid.uuid4()),
            userId=user_id,
            category="billing",
            predictionType="churn_prediction",
            predictedValue=round(churn_prob, 3),
            confidence=0.6,  # Low confidence for simple model
            modelVersion="v1",
            inputData=json.dumps({
                "daysSinceLogin": days_since_login,
                "recentUsageCount": recent_usage,
                "isTrial": subscription.isTrial,
                "plan": subscription.plan,
            }),
            predictionHorizon="30d",
            expiresAt=now + timedelta(days=PREDICTION_EXPIRY_DAYS),
        )
        session.add(prediction)
        predictions_created += 1

    return predictions_created


async def _generate_workflow_predictions(session, user_id: str) -> int:
    """Generate workflow-related predictions for a user."""
    now = datetime.now(timezone.utc)
    predictions_created = 0

    # ── Failure prediction for active workflows ──────────────────────
    active_workflows_result = await session.execute(
        select(WorkflowDefinition).where(
            WorkflowDefinition.userId == user_id,
            WorkflowDefinition.status == "active",
        ).limit(20)
    )

    for workflow in active_workflows_result.scalars().all():
        # Predict failure based on recent failure rate
        if workflow.runCount > 0:
            failure_rate = workflow.failureCount / workflow.runCount
        else:
            failure_rate = 0

        if failure_rate > 0.1:  # Only create prediction if meaningful
            prediction = AnalyticsPrediction(
                id=str(uuid.uuid4()),
                userId=user_id,
                category="workflow",
                predictionType="failure_prediction",
                targetEntityId=workflow.id,
                predictedValue=round(failure_rate, 3),
                confidence=round(min(0.8, workflow.runCount / 20), 2),
                modelVersion="v1",
                inputData=json.dumps({
                    "workflowId": workflow.id,
                    "totalRuns": workflow.runCount,
                    "successCount": workflow.successCount,
                    "failureCount": workflow.failureCount,
                }),
                predictionHorizon="7d",
                expiresAt=now + timedelta(days=PREDICTION_EXPIRY_DAYS),
            )
            session.add(prediction)
            predictions_created += 1

    # ── Throughput prediction ────────────────────────────────────────
    recent_executions = await session.scalar(
        select(func.count(WorkflowExecution.id)).join(
            WorkflowDefinition, WorkflowExecution.workflowId == WorkflowDefinition.id
        ).where(
            WorkflowDefinition.userId == user_id,
            WorkflowExecution.createdAt >= now - timedelta(days=7),
        )
    ) or 0

    if recent_executions > 0:
        daily_rate = recent_executions / 7
        predicted_30d = daily_rate * 30

        prediction = AnalyticsPrediction(
            id=str(uuid.uuid4()),
            userId=user_id,
            category="workflow",
            predictionType="throughput_prediction",
            predictedValue=round(predicted_30d, 1),
            confidence=round(min(0.85, recent_executions / 30), 2),
            modelVersion="v1",
            inputData=json.dumps({
                "executions7d": recent_executions,
                "dailyRate": round(daily_rate, 2),
            }),
            predictionHorizon="30d",
            expiresAt=now + timedelta(days=PREDICTION_EXPIRY_DAYS),
        )
        session.add(prediction)
        predictions_created += 1

    return predictions_created


@shared_task(bind=True, max_retries=2, default_retry_delay=300, queue="analytics")
def predictions_generate(self):
    """Generate predictions for active users.

    Runs every 6 hours via Celery Beat. For each active user
    (logged in within 7 days), generates:
    - Lead velocity predictions
    - Lead conversion probabilities
    - Expected revenue predictions
    - Future credits usage forecast
    - Churn predictions
    - Workflow failure predictions
    - Workflow throughput predictions

    Returns:
        dict: Summary of prediction generation results.
    """

    async def _run():
        now = datetime.now(timezone.utc)
        active_cutoff = now - timedelta(days=7)
        users_processed = 0
        predictions_created = 0
        errors = []

        async with get_db_context() as session:
            # Get users active in last 7 days
            result = await session.execute(
                select(User).where(
                    User.isActive == True,
                    User.deletedAt.is_(None),
                    User.lastLoginAt >= active_cutoff,
                )
            )
            active_users = result.scalars().all()

            logger.info(f"Generating predictions for {len(active_users)} active users")

            for user in active_users:
                try:
                    count = 0

                    # Lead predictions
                    count += await _generate_lead_predictions(session, user.id)

                    # Billing predictions
                    count += await _generate_billing_predictions(session, user.id)

                    # Workflow predictions
                    count += await _generate_workflow_predictions(session, user.id)

                    await session.flush()
                    predictions_created += count
                    users_processed += 1

                except Exception as e:
                    logger.error(f"Failed to generate predictions for user {user.id}: {e}")
                    errors.append({"userId": user.id, "error": str(e)})
                    continue

        logger.info(
            f"Prediction generation complete: {users_processed} users, "
            f"{predictions_created} predictions created"
        )

        return {
            "status": "completed",
            "users_processed": users_processed,
            "predictions_created": predictions_created,
            "errors": errors[:10],
        }

    try:
        return _run_async(_run())
    except Exception as exc:
        logger.error(f"Prediction generation failed: {exc}")
        raise self.retry(exc=exc)


# ═════════════════════════════════════════════════════════════════════
# 7. ANOMALY DETECT — Run anomaly detection (every hour)
# ═════════════════════════════════════════════════════════════════════


async def _detect_lead_anomalies(session, user_id: str) -> List[dict]:
    """Detect lead-related anomalies for a user."""
    now = datetime.now(timezone.utc)
    anomalies = []

    # ── Conversion rate drop ─────────────────────────────────────────
    # Compare this week vs last week
    this_week_start = now - timedelta(days=7)
    last_week_start = now - timedelta(days=14)

    this_week_converted = await session.scalar(
        select(func.count(Lead.id)).where(
            Lead.userId == user_id,
            Lead.stage == "closed_won",
            Lead.createdAt >= this_week_start,
        )
    ) or 0

    this_week_total = await session.scalar(
        select(func.count(Lead.id)).where(
            Lead.userId == user_id,
            Lead.isActive == True,
            Lead.deletedAt.is_(None),
            Lead.createdAt >= this_week_start,
        )
    ) or 0

    last_week_converted = await session.scalar(
        select(func.count(Lead.id)).where(
            Lead.userId == user_id,
            Lead.stage == "closed_won",
            Lead.createdAt >= last_week_start,
            Lead.createdAt < this_week_start,
        )
    ) or 0

    last_week_total = await session.scalar(
        select(func.count(Lead.id)).where(
            Lead.userId == user_id,
            Lead.isActive == True,
            Lead.deletedAt.is_(None),
            Lead.createdAt >= last_week_start,
            Lead.createdAt < this_week_start,
        )
    ) or 0

    this_rate = this_week_converted / max(this_week_total, 1)
    last_rate = last_week_converted / max(last_week_total, 1)

    if last_rate > 0 and this_rate < last_rate:
        deviation = (last_rate - this_rate) / last_rate
        if deviation >= ANOMALY_DEVIATION_THRESHOLD:
            anomalies.append({
                "category": "lead",
                "anomalyType": "conversion_drop",
                "severity": "critical" if deviation > 0.5 else "warning",
                "metricName": "lead_conversion_rate",
                "expectedValue": round(last_rate * 100, 1),
                "actualValue": round(this_rate * 100, 1),
                "deviation": round(deviation * 100, 1),
                "description": (
                    f"Lead conversion rate dropped from {last_rate*100:.1f}% to "
                    f"{this_rate*100:.1f}% (a {deviation*100:.0f}% decrease)"
                ),
            })

    # ── Response rate drop ───────────────────────────────────────────
    this_week_replied = await session.scalar(
        select(func.count(OutreachMessage.id)).where(
            OutreachMessage.userId == user_id,
            OutreachMessage.status == "replied",
            OutreachMessage.createdAt >= this_week_start,
        )
    ) or 0

    this_week_sent = await session.scalar(
        select(func.count(OutreachMessage.id)).where(
            OutreachMessage.userId == user_id,
            OutreachMessage.status.in_(["sent", "delivered", "opened", "replied"]),
            OutreachMessage.createdAt >= this_week_start,
        )
    ) or 0

    last_week_replied = await session.scalar(
        select(func.count(OutreachMessage.id)).where(
            OutreachMessage.userId == user_id,
            OutreachMessage.status == "replied",
            OutreachMessage.createdAt >= last_week_start,
            OutreachMessage.createdAt < this_week_start,
        )
    ) or 0

    last_week_sent = await session.scalar(
        select(func.count(OutreachMessage.id)).where(
            OutreachMessage.userId == user_id,
            OutreachMessage.status.in_(["sent", "delivered", "opened", "replied"]),
            OutreachMessage.createdAt >= last_week_start,
            OutreachMessage.createdAt < this_week_start,
        )
    ) or 0

    this_reply_rate = this_week_replied / max(this_week_sent, 1)
    last_reply_rate = last_week_replied / max(last_week_sent, 1)

    if last_reply_rate > 0 and this_reply_rate < last_reply_rate:
        deviation = (last_reply_rate - this_reply_rate) / last_reply_rate
        if deviation >= ANOMALY_DEVIATION_THRESHOLD:
            anomalies.append({
                "category": "lead",
                "anomalyType": "response_drop",
                "severity": "warning",
                "metricName": "outreach_reply_rate",
                "expectedValue": round(last_reply_rate * 100, 1),
                "actualValue": round(this_reply_rate * 100, 1),
                "deviation": round(deviation * 100, 1),
                "description": (
                    f"Outreach reply rate dropped from {last_reply_rate*100:.1f}% to "
                    f"{this_reply_rate*100:.1f}% (a {deviation*100:.0f}% decrease)"
                ),
            })

    # ── Lead volume spike/drop ───────────────────────────────────────
    if last_week_total > 0 and this_week_total > 0:
        volume_change = (this_week_total - last_week_total) / last_week_total
        if abs(volume_change) >= ANOMALY_DEVIATION_THRESHOLD:
            direction = "spike" if volume_change > 0 else "drop"
            anomalies.append({
                "category": "lead",
                "anomalyType": f"lead_volume_{direction}",
                "severity": "info",
                "metricName": "new_leads_count",
                "expectedValue": last_week_total,
                "actualValue": this_week_total,
                "deviation": round(abs(volume_change) * 100, 1),
                "description": (
                    f"New leads count {'increased' if volume_change > 0 else 'decreased'} "
                    f"from {last_week_total} to {this_week_total} "
                    f"({abs(volume_change)*100:.0f}% change)"
                ),
            })

    return anomalies


async def _detect_billing_anomalies(session, user_id: str) -> List[dict]:
    """Detect billing-related anomalies for a user."""
    now = datetime.now(timezone.utc)
    anomalies = []

    # ── Credit usage spike ───────────────────────────────────────────
    this_week_start = now - timedelta(days=7)
    last_week_start = now - timedelta(days=14)

    this_week_credits = await session.scalar(
        select(func.sum(CreditsLedger.credits)).where(
            CreditsLedger.userId == user_id,
            CreditsLedger.credits < 0,
            CreditsLedger.createdAt >= this_week_start,
        )
    ) or 0

    last_week_credits = await session.scalar(
        select(func.sum(CreditsLedger.credits)).where(
            CreditsLedger.userId == user_id,
            CreditsLedger.credits < 0,
            CreditsLedger.createdAt >= last_week_start,
            CreditsLedger.createdAt < this_week_start,
        )
    ) or 0

    this_week_abs = abs(this_week_credits)
    last_week_abs = abs(last_week_credits)

    if last_week_abs > 0 and this_week_abs > last_week_abs:
        deviation = (this_week_abs - last_week_abs) / last_week_abs
        if deviation >= ANOMALY_DEVIATION_THRESHOLD:
            anomalies.append({
                "category": "billing",
                "anomalyType": "cost_spike",
                "severity": "warning" if deviation < 1.0 else "critical",
                "metricName": "credits_used_weekly",
                "expectedValue": last_week_abs,
                "actualValue": this_week_abs,
                "deviation": round(deviation * 100, 1),
                "description": (
                    f"Credit usage spiked from {last_week_abs} to {this_week_abs} "
                    f"credits this week ({deviation*100:.0f}% increase)"
                ),
            })

    # ── Low credit balance warning ───────────────────────────────────
    user_result = await session.execute(
        select(User).where(User.id == user_id)
    )
    user = user_result.scalar_one_or_none()
    if user and user.credits <= 10:
        anomalies.append({
            "category": "billing",
            "anomalyType": "credit_low",
            "severity": "critical" if user.credits <= 5 else "warning",
            "metricName": "credit_balance",
            "expectedValue": 50,  # Monthly default
            "actualValue": user.credits,
            "deviation": round((1 - user.credits / 50) * 100, 1),
            "description": f"Credit balance is critically low: {user.credits} credits remaining",
        })

    return anomalies


async def _detect_workflow_anomalies(session, user_id: str) -> List[dict]:
    """Detect workflow-related anomalies for a user."""
    now = datetime.now(timezone.utc)
    anomalies = []

    # ── Workflow failure spike ────────────────────────────────────────
    last_24h = now - timedelta(hours=24)
    prev_24h = now - timedelta(hours=48)

    recent_failures = await session.scalar(
        select(func.count(WorkflowExecution.id)).join(
            WorkflowDefinition, WorkflowExecution.workflowId == WorkflowDefinition.id
        ).where(
            WorkflowDefinition.userId == user_id,
            WorkflowExecution.status == "failed",
            WorkflowExecution.createdAt >= last_24h,
        )
    ) or 0

    prev_failures = await session.scalar(
        select(func.count(WorkflowExecution.id)).join(
            WorkflowDefinition, WorkflowExecution.workflowId == WorkflowDefinition.id
        ).where(
            WorkflowDefinition.userId == user_id,
            WorkflowExecution.status == "failed",
            WorkflowExecution.createdAt >= prev_24h,
            WorkflowExecution.createdAt < last_24h,
        )
    ) or 0

    if prev_failures > 0 and recent_failures > prev_failures:
        deviation = (recent_failures - prev_failures) / prev_failures
        if deviation >= ANOMALY_DEVIATION_THRESHOLD:
            anomalies.append({
                "category": "workflow",
                "anomalyType": "failure_spike",
                "severity": "critical" if recent_failures > 5 else "warning",
                "metricName": "workflow_failures_24h",
                "expectedValue": prev_failures,
                "actualValue": recent_failures,
                "deviation": round(deviation * 100, 1),
                "description": (
                    f"Workflow failures spiked from {prev_failures} to {recent_failures} "
                    f"in the last 24 hours ({deviation*100:.0f}% increase)"
                ),
            })
    elif recent_failures >= 3 and prev_failures == 0:
        anomalies.append({
            "category": "workflow",
            "anomalyType": "failure_spike",
            "severity": "warning",
            "metricName": "workflow_failures_24h",
            "expectedValue": 0,
            "actualValue": recent_failures,
            "deviation": 100.0,
            "description": (
                f"{recent_failures} workflow failures in the last 24 hours "
                f"(up from 0 in the previous period)"
            ),
        })

    return anomalies


@shared_task(bind=True, max_retries=2, default_retry_delay=120, queue="analytics")
def anomaly_detect(self):
    """Run anomaly detection for all active users.

    Runs every hour via Celery Beat. For each active user:
    - Detects lead conversion drops
    - Detects outreach response drops
    - Detects lead volume anomalies
    - Detects credit usage spikes
    - Detects low credit balance
    - Detects workflow failure spikes
    - Stores new anomalies in AnalyticsAnomaly table
    - Pushes notifications for critical anomalies

    Returns:
        dict: Summary of anomaly detection results.
    """

    async def _run():
        now = datetime.now(timezone.utc)
        active_cutoff = now - timedelta(days=7)
        users_processed = 0
        anomalies_created = 0
        critical_notifications = 0
        errors = []

        async with get_db_context() as session:
            # Get active users
            result = await session.execute(
                select(User).where(
                    User.isActive == True,
                    User.deletedAt.is_(None),
                    User.lastLoginAt >= active_cutoff,
                )
            )
            active_users = result.scalars().all()

            logger.info(f"Running anomaly detection for {len(active_users)} active users")

            for user in active_users:
                try:
                    all_anomalies = []

                    # Lead anomalies
                    all_anomalies.extend(await _detect_lead_anomalies(session, user.id))

                    # Billing anomalies
                    all_anomalies.extend(await _detect_billing_anomalies(session, user.id))

                    # Workflow anomalies
                    all_anomalies.extend(await _detect_workflow_anomalies(session, user.id))

                    # Store anomalies and create notifications for critical ones
                    for anomaly_data in all_anomalies:
                        # Check if a similar active anomaly already exists
                        existing = await session.execute(
                            select(AnalyticsAnomaly).where(
                                AnalyticsAnomaly.userId == user.id,
                                AnalyticsAnomaly.anomalyType == anomaly_data["anomalyType"],
                                AnalyticsAnomaly.metricName == anomaly_data["metricName"],
                                AnalyticsAnomaly.status == "active",
                            ).limit(1)
                        )
                        if existing.scalar_one_or_none():
                            continue  # Skip duplicate

                        anomaly = AnalyticsAnomaly(
                            id=str(uuid.uuid4()),
                            userId=user.id,
                            category=anomaly_data["category"],
                            anomalyType=anomaly_data["anomalyType"],
                            severity=anomaly_data["severity"],
                            metricName=anomaly_data["metricName"],
                            expectedValue=anomaly_data["expectedValue"],
                            actualValue=anomaly_data["actualValue"],
                            deviation=anomaly_data["deviation"],
                            description=anomaly_data["description"],
                        )
                        session.add(anomaly)
                        anomalies_created += 1

                        # Create notification for critical anomalies
                        if anomaly_data["severity"] == "critical":
                            notification = Notification(
                                id=str(uuid.uuid4()),
                                userId=user.id,
                                type="anomaly_critical",
                                title=f"Critical: {anomaly_data['anomalyType'].replace('_', ' ').title()}",
                                message=anomaly_data["description"],
                                metadata=json.dumps({
                                    "anomalyId": anomaly.id,
                                    "category": anomaly_data["category"],
                                    "anomalyType": anomaly_data["anomalyType"],
                                    "deviation": anomaly_data["deviation"],
                                }),
                                deliveredVia="in_app",
                            )
                            session.add(notification)
                            critical_notifications += 1

                    await session.flush()
                    users_processed += 1

                except Exception as e:
                    logger.error(f"Failed to detect anomalies for user {user.id}: {e}")
                    errors.append({"userId": user.id, "error": str(e)})
                    continue

        logger.info(
            f"Anomaly detection complete: {users_processed} users, "
            f"{anomalies_created} anomalies found, "
            f"{critical_notifications} critical notifications sent"
        )

        return {
            "status": "completed",
            "users_processed": users_processed,
            "anomalies_created": anomalies_created,
            "critical_notifications": critical_notifications,
            "errors": errors[:10],
        }

    try:
        return _run_async(_run())
    except Exception as exc:
        logger.error(f"Anomaly detection failed: {exc}")
        raise self.retry(exc=exc)


# ═════════════════════════════════════════════════════════════════════
# 8. INSIGHTS GENERATE — Generate auto insights (every 4 hours)
# ═════════════════════════════════════════════════════════════════════


async def _generate_lead_insights(session, user_id: str) -> List[dict]:
    """Generate lead-related insights for a user."""
    now = datetime.now(timezone.utc)
    insights = []

    # ── Best performing niche trend ──────────────────────────────────
    niche_result = await session.execute(
        select(Lead.niche, func.count(Lead.id), func.avg(Lead.conversionScore)).where(
            Lead.userId == user_id,
            Lead.isActive == True,
            Lead.deletedAt.is_(None),
            Lead.createdAt >= now - timedelta(days=30),
        ).group_by(Lead.niche).order_by(func.avg(Lead.conversionScore).desc()).limit(1)
    )
    top_niche = niche_result.first()
    if top_niche and top_niche[0]:
        insights.append({
            "category": "lead",
            "insightType": "trend",
            "title": f"Top performing niche: {top_niche[0]}",
            "description": (
                f"Your '{top_niche[0]}' niche is performing best with "
                f"{top_niche[1]} leads and an average conversion score of "
                f"{top_niche[2]:.0f}/100. Consider focusing more discovery efforts here."
            ),
            "impact": "high" if (top_niche[2] or 0) > 60 else "medium",
            "metricName": "avg_conversion_score",
            "metricAfter": round(top_niche[2] or 0, 1),
            "isActionable": True,
            "actionSuggestion": f"Run more discovery jobs targeting the '{top_niche[0]}' niche to capitalize on high conversion rates.",
        })

    # ── Lead stage bottleneck ────────────────────────────────────────
    stage_result = await session.execute(
        select(Lead.stage, func.count(Lead.id)).where(
            Lead.userId == user_id,
            Lead.isActive == True,
            Lead.deletedAt.is_(None),
        ).group_by(Lead.stage).order_by(func.count(Lead.id).desc()).limit(1)
    )
    bottleneck = stage_result.first()
    if bottleneck and bottleneck[1] > 5:
        stage_name = bottleneck[0].replace("_", " ").title()
        insights.append({
            "category": "lead",
            "insightType": "risk",
            "title": f"Pipeline bottleneck at '{stage_name}' stage",
            "description": (
                f"You have {bottleneck[1]} leads stuck in the '{stage_name}' stage. "
                f"This may indicate a process bottleneck that needs attention."
            ),
            "impact": "high" if bottleneck[1] > 10 else "medium",
            "metricName": "leads_in_stage",
            "metricAfter": bottleneck[1],
            "isActionable": True,
            "actionSuggestion": f"Review leads in '{stage_name}' and take action — follow up, enrich, or re-qualify to keep the pipeline moving.",
        })

    # ── Outreach effectiveness opportunity ───────────────────────────
    unreplied = await session.scalar(
        select(func.count(OutreachMessage.id)).where(
            OutreachMessage.userId == user_id,
            OutreachMessage.status == "sent",
            OutreachMessage.sentAt < now - timedelta(days=7),
        )
    ) or 0

    if unreplied > 3:
        insights.append({
            "category": "lead",
            "insightType": "opportunity",
            "title": f"{unreplied} unreplied messages from 7+ days ago",
            "description": (
                f"You have {unreplied} outreach messages sent over a week ago "
                f"with no reply. Consider sending follow-ups or trying a different channel."
            ),
            "impact": "medium",
            "metricName": "unreplied_outreach_7d",
            "metricAfter": unreplied,
            "isActionable": True,
            "actionSuggestion": "Use AI to generate follow-up messages for these leads, or try outreach via a different channel (e.g., WhatsApp instead of email).",
        })

    return insights


async def _generate_billing_insights(session, user_id: str) -> List[dict]:
    """Generate billing-related insights for a user."""
    now = datetime.now(timezone.utc)
    insights = []

    # ── Credit usage trend ───────────────────────────────────────────
    credits_7d = await session.scalar(
        select(func.sum(CreditsLedger.credits)).where(
            CreditsLedger.userId == user_id,
            CreditsLedger.credits < 0,
            CreditsLedger.createdAt >= now - timedelta(days=7),
        )
    ) or 0

    credits_prev_7d = await session.scalar(
        select(func.sum(CreditsLedger.credits)).where(
            CreditsLedger.userId == user_id,
            CreditsLedger.credits < 0,
            CreditsLedger.createdAt >= now - timedelta(days=14),
            CreditsLedger.createdAt < now - timedelta(days=7),
        )
    ) or 0

    this_abs = abs(credits_7d)
    prev_abs = abs(credits_prev_7d)

    if prev_abs > 0 and this_abs != prev_abs:
        change_pct = ((this_abs - prev_abs) / prev_abs) * 100
        direction = "increased" if change_pct > 0 else "decreased"
        insights.append({
            "category": "billing",
            "insightType": "trend",
            "title": f"Credit usage {direction} by {abs(change_pct):.0f}%",
            "description": (
                f"Your credit usage {direction} from {prev_abs} to {this_abs} "
                f"credits per week ({abs(change_pct):.0f}% change)."
            ),
            "impact": "high" if abs(change_pct) > 50 else "medium",
            "metricName": "weekly_credits_used",
            "metricBefore": prev_abs,
            "metricAfter": this_abs,
            "changePercent": round(change_pct, 1),
            "isActionable": change_pct > 30,
            "actionSuggestion": (
                "Consider upgrading your plan for more credits if usage continues to grow."
            ) if change_pct > 0 else None,
        })

    # ── Most used feature ────────────────────────────────────────────
    top_action = await session.execute(
        select(CreditsLedger.action, func.sum(CreditsLedger.credits)).where(
            CreditsLedger.userId == user_id,
            CreditsLedger.credits < 0,
            CreditsLedger.createdAt >= now - timedelta(days=30),
        ).group_by(CreditsLedger.action).order_by(func.sum(CreditsLedger.credits)).limit(1)
    )
    top = top_action.first()
    if top and top[0]:
        insights.append({
            "category": "billing",
            "insightType": "recommendation",
            "title": f"Top credit spend: {top[0].replace('_', ' ').title()}",
            "description": (
                f"Your most credit-intensive action is '{top[0]}' at "
                f"{abs(top[1])} credits in the last 30 days. "
                f"Optimizing this could save credits."
            ),
            "impact": "low",
            "metricName": "credits_by_action",
            "metricAfter": abs(top[1]),
            "isActionable": True,
            "actionSuggestion": f"Review if all {top[0].replace('_', ' ')} operations are necessary. Batch operations together for efficiency.",
        })

    return insights


async def _generate_workflow_insights(session, user_id: str) -> List[dict]:
    """Generate workflow-related insights for a user."""
    now = datetime.now(timezone.utc)
    insights = []

    # ── Workflow success rate insight ────────────────────────────────
    active_workflows = await session.execute(
        select(WorkflowDefinition).where(
            WorkflowDefinition.userId == user_id,
            WorkflowDefinition.status == "active",
            WorkflowDefinition.runCount > 0,
        )
    )

    for wf in active_workflows.scalars().all():
        if wf.runCount > 3:
            success_rate = wf.successCount / wf.runCount * 100
            if success_rate < 70:
                insights.append({
                    "category": "workflow",
                    "insightType": "risk",
                    "title": f"Low success rate: '{wf.name}' workflow",
                    "description": (
                        f"Your '{wf.name}' workflow has a {success_rate:.0f}% success rate "
                        f"({wf.successCount}/{wf.runCount} runs). "
                        f"This may need debugging or adjustment."
                    ),
                    "impact": "high" if success_rate < 40 else "medium",
                    "metricName": "workflow_success_rate",
                    "metricAfter": round(success_rate, 1),
                    "isActionable": True,
                    "actionSuggestion": f"Review the '{wf.name}' workflow configuration and recent execution logs to identify and fix failing steps.",
                })

    # ── Unused workflows ─────────────────────────────────────────────
    unused = await session.scalar(
        select(func.count(WorkflowDefinition.id)).where(
            WorkflowDefinition.userId == user_id,
            WorkflowDefinition.status == "active",
            WorkflowDefinition.runCount == 0,
        )
    ) or 0

    if unused > 0:
        insights.append({
            "category": "workflow",
            "insightType": "recommendation",
            "title": f"{unused} active workflow(s) have never run",
            "description": (
                f"You have {unused} active workflows that have never been executed. "
                f"These may need trigger configuration or could be paused."
            ),
            "impact": "low",
            "metricName": "unused_workflows",
            "metricAfter": unused,
            "isActionable": True,
            "actionSuggestion": "Review these workflows and either configure proper triggers, test them, or pause them to keep your workspace clean.",
        })

    return insights


async def _generate_competitor_insights(session, user_id: str) -> List[dict]:
    """Generate competitor-related insights for a user."""
    now = datetime.now(timezone.utc)
    insights = []

    # ── High opportunity competitors ─────────────────────────────────
    high_opportunity = await session.execute(
        select(CompetitorAnalysis).where(
            CompetitorAnalysis.userId == user_id,
            CompetitorAnalysis.opportunityScore >= 60,
        ).limit(5)
    )

    for comp in high_opportunity.scalars().all():
        insights.append({
            "category": "competitor",
            "insightType": "opportunity",
            "title": f"High opportunity: {comp.competitorName}",
            "description": (
                f"Competitor '{comp.competitorName}' has an opportunity score of "
                f"{comp.opportunityScore}/100. Their weaknesses present opportunities "
                f"for your business to differentiate."
            ),
            "impact": "high" if comp.opportunityScore >= 80 else "medium",
            "metricName": "competitor_opportunity_score",
            "metricAfter": comp.opportunityScore,
            "isActionable": True,
            "actionSuggestion": f"Analyze {comp.competitorName}'s weaknesses and develop targeted campaigns to capture their dissatisfied customers.",
        })

    # ── High threat competitors ──────────────────────────────────────
    high_threat = await session.execute(
        select(CompetitorAnalysis).where(
            CompetitorAnalysis.userId == user_id,
            CompetitorAnalysis.threatLevel == "high",
        ).limit(3)
    )

    for comp in high_threat.scalars().all():
        insights.append({
            "category": "competitor",
            "insightType": "risk",
            "title": f"High threat competitor: {comp.competitorName}",
            "description": (
                f"Competitor '{comp.competitorName}' has been assessed as a high threat. "
                f"Monitor their activities closely and ensure your value proposition remains strong."
            ),
            "impact": "high",
            "metricName": "competitor_threat_level",
            "metricAfter": 1,  # high = 1
            "isActionable": True,
            "actionSuggestion": f"Update your competitive positioning against {comp.competitorName}. Focus on your unique strengths and differentiation.",
        })

    return insights


@shared_task(bind=True, max_retries=2, default_retry_delay=300, queue="analytics")
def insights_generate(self):
    """Generate auto insights for all active users.

    Runs every 4 hours via Celery Beat. For each active user:
    - Generates lead pipeline insights (best niche, bottlenecks, outreach)
    - Generates billing insights (credit trends, top spend)
    - Generates workflow insights (success rates, unused workflows)
    - Generates competitor insights (opportunities, threats)

    Stores insights in AnalyticsInsight table with expiration.

    Returns:
        dict: Summary of insight generation results.
    """

    async def _run():
        now = datetime.now(timezone.utc)
        active_cutoff = now - timedelta(days=7)
        users_processed = 0
        insights_created = 0
        errors = []

        async with get_db_context() as session:
            # Get active users
            result = await session.execute(
                select(User).where(
                    User.isActive == True,
                    User.deletedAt.is_(None),
                    User.lastLoginAt >= active_cutoff,
                )
            )
            active_users = result.scalars().all()

            logger.info(f"Generating insights for {len(active_users)} active users")

            for user in active_users:
                try:
                    all_insights = []

                    # Lead insights
                    all_insights.extend(await _generate_lead_insights(session, user.id))

                    # Billing insights
                    all_insights.extend(await _generate_billing_insights(session, user.id))

                    # Workflow insights
                    all_insights.extend(await _generate_workflow_insights(session, user.id))

                    # Competitor insights
                    all_insights.extend(await _generate_competitor_insights(session, user.id))

                    # Store insights
                    for insight_data in all_insights:
                        # Check for similar recent insight to avoid duplicates
                        existing = await session.execute(
                            select(AnalyticsInsight).where(
                                AnalyticsInsight.userId == user.id,
                                AnalyticsInsight.insightType == insight_data["insightType"],
                                AnalyticsInsight.title == insight_data["title"],
                                AnalyticsInsight.isRead == False,
                            ).limit(1)
                        )
                        if existing.scalar_one_or_none():
                            continue  # Skip duplicate

                        insight = AnalyticsInsight(
                            id=str(uuid.uuid4()),
                            userId=user.id,
                            orgId=user.orgId,
                            category=insight_data["category"],
                            insightType=insight_data["insightType"],
                            title=insight_data["title"],
                            description=insight_data["description"],
                            impact=insight_data.get("impact", "medium"),
                            metricName=insight_data.get("metricName"),
                            metricBefore=insight_data.get("metricBefore"),
                            metricAfter=insight_data.get("metricAfter"),
                            changePercent=insight_data.get("changePercent"),
                            isActionable=insight_data.get("isActionable", False),
                            actionSuggestion=insight_data.get("actionSuggestion"),
                            validUntil=now + timedelta(days=INSIGHT_VALIDITY_DAYS),
                        )
                        session.add(insight)
                        insights_created += 1

                    await session.flush()
                    users_processed += 1

                except Exception as e:
                    logger.error(f"Failed to generate insights for user {user.id}: {e}")
                    errors.append({"userId": user.id, "error": str(e)})
                    continue

        logger.info(
            f"Insight generation complete: {users_processed} users, "
            f"{insights_created} insights created"
        )

        return {
            "status": "completed",
            "users_processed": users_processed,
            "insights_created": insights_created,
            "errors": errors[:10],
        }

    try:
        return _run_async(_run())
    except Exception as exc:
        logger.error(f"Insight generation failed: {exc}")
        raise self.retry(exc=exc)
