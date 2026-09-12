# Phase 11 — Notification Engine Service

**Task ID**: 11-notification-engine
**Agent**: Main Agent
**File Created**: `src/lib/notification-engine.ts`

## Work Log

- Read worklog.md and Prisma schema to understand existing models (Notification, NotificationPreferences)
- Reviewed existing service patterns: email.ts, telegram-service.ts, whatsapp-service.ts, lead-audit.ts, billing-audit.ts
- Created comprehensive notification engine with 25 exported functions across 5 categories
- Lint: 0 new errors (all 10 remaining errors are pre-existing in custom-server.js, proxy, process-manager.js, server.js, realtime-service)

## Functions Implemented (25 total)

### Core Dispatch (3)
1. `sendNotification(params)` — Create in-app notification AND dispatch to channels based on preferences
2. `dispatchToChannels(userId, notification, preferences)` — Route to enabled channels (in-app, email, telegram, whatsapp)
3. `batchNotify(params[])` — Batch DB insert + individual channel dispatch

### Channel-Specific (3)
4. `sendEmailNotification(userId, notification)` — Email via SMTP/Resend
5. `sendTelegramNotification(userId, notification)` — Telegram bot via telegram-service
6. `sendWhatsAppNotification(userId, notification)` — WhatsApp via Meta/Twilio

### Preferences (4)
7. `getUserPreferences(userId)` — Get or create default preferences
8. `isChannelEnabled(userId, channel, type?)` — Check global + type-specific channel preferences
9. `isInDND(preferences)` — Check Do Not Disturb window (handles overnight)
10. `updatePreferences(userId, updates)` — Upsert preferences with audit log

### Notification Type Helpers (9)
11. `notifyLeadUpdate(userId, type, data)` — lead_discovered, lead_stage_moved, lead_pipeline_update
12. `notifyPaymentUpdate(userId, type, data)` — payment_success/failed/invoice/subscription/credits/trial
13. `notifyGmailSync(userId, type, data)` — gmail_sync_complete, gmail_thread_update
14. `notifyTelegramDelivery(userId, type, data)` — telegram_delivery_status, telegram_incoming_message
15. `notifyWhatsAppDelivery(userId, type, data)` — whatsapp_sent/delivered/read/failed
16. `notifyAICompletion(userId, type, data)` — ai_analysis/scoring/outreach_complete
17. `notifyWorkflowEvent(userId, type, data)` — workflow_step/execution events
18. `notifyOnboardingEvent(userId, type, data)` — onboarding progress events
19. `notifyFailure(userId, type, data)` — system_failure, integration_error, rate_limit_exceeded

### CRUD (6)
20. `getNotifications(userId, filters?)` — Paginated list with type/read/date filters
21. `markAsRead(notificationId, userId)` — Single notification mark as read
22. `markAllAsRead(userId)` — Mark all unread as read
23. `archiveNotification(notificationId, userId)` — Archive via metadata flag
24. `getUnreadCount(userId)` — Count unread notifications
25. `deleteOldNotifications(userId, olderThanDays?)` — Cleanup old notifications (default 90 days)

## Key Design Decisions

- **NEVER lose events**: DB record created first, then dispatch to channels
- **NEVER skip preferences**: All dispatches check NotificationPreferences (global + type-specific overrides)
- **NEVER block main thread**: Email/Telegram/WhatsApp dispatches are fire-and-forget (async, non-awaited)
- **NEVER skip audit logs**: All events logged to AuditLog with resource='notification'
- **NEVER skip org isolation**: All queries filter by userId
- **Rate limiting**: 50 notifications/minute per user via in-memory sliding window
- **DND handling**: Supports overnight windows (22:00→07:00) with timezone support
- **Realtime events**: Lightweight event bus (`onNotificationEvent`) for socket.io integration
- **27 notification types** across 9 categories with NOTIFICATION_CATEGORY_MAP
