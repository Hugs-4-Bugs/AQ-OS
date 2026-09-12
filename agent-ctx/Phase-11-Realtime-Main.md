# Phase 11 — Realtime Engine + Redis PubSub Service

**Task ID**: Phase-11-Realtime
**Agent**: Main Agent
**Date**: 2026-05-18

## Work Log

- Read worklog.md, package.json, prisma/schema.prisma, and existing lib files to understand codebase patterns
- Initialized fullstack development environment
- Created `/src/lib/redis-pubsub-service.ts` — Redis PubSub Service (337 lines)
- Created `/src/lib/realtime-engine.ts` — Realtime Engine (786 lines)
- Added Phase 11 env vars to `.env` (REDIS_URL, REALTIME_* configs)
- Fixed lint warning: removed unused eslint-disable directive from redis-pubsub-service.ts
- Fixed lint warning: assigned default export to named variable in realtime-engine.ts
- Fixed TS error: added @ts-expect-error for optional ioredis import in redis-pubsub-service.ts
- Verified: 0 new lint errors, 0 new TS errors in both files
- Dev server running fine

## File 1: redis-pubsub-service.ts

**Purpose**: Cross-process event distribution via Redis pub/sub (optional)

### Features:
- `connect()` — Lazy connection to Redis, idempotent, coalesces concurrent calls
- `disconnect()` — Graceful disconnect with cleanup
- `publish(channel, message)` — Publish to Redis channel, no-op if Redis unavailable
- `subscribe(channel, callback)` — Subscribe to Redis channel with multi-callback support
- `unsubscribe(channel, callback?)` — Unsubscribe, removes all callbacks if none specified
- `isConnected()` — Check connection status
- `isAvailable()` — Check if Redis was ever available
- `getStats()` — Operational stats (publishedCount, subscribedChannels, connected, available)
- `getPublishedCount()` — Simple counter

### Design Decisions:
- **Optional Redis**: If REDIS_URL not set or ioredis not installed, all operations are no-ops
- **Lazy loading**: ioredis is dynamically imported via `@ts-expect-error` — doesn't need to be installed
- **Permanently disabled**: If connection fails, sets `permanentlyDisabled=true` to avoid retrying
- **Warning throttling**: Only logs one warning, subsequent at debug level
- **Singleton pattern**: One `redisPubSub` instance exported globally
- **Dual connections**: Separate publisher and subscriber Redis connections (Redis best practice)

## File 2: realtime-engine.ts

**Purpose**: Server-side event publishing, notification creation, in-memory EventBus, deduplication, history, and rate limiting

### Core Class: EventBus (extends EventEmitter)
- `publishEvent(channel, event)` — Publish to in-process bus + Redis, with dedup + rate-limit checks
- `deduplicateEvent(eventId)` — In-memory Map with 10K max entries, 1-hour TTL
- `getEventHistory(userId, afterEventId?, limit?)` — Per-user event buffer (max 100, 1-hour TTL)
- `_checkRateLimit(userId)` — Max 100 events/second per user
- `_storeHistory(event)` — Stores events per user, newest first
- `_cleanup()` — Periodic cleanup every 5 minutes (dedup, history, rate-limit entries)
- `getStats()` — totalPublished, dedupSize, historyUsers, rateLimitEntries, listenerCounts
- `shutdown()` — Graceful shutdown, clears all state

### Domain-Specific Publishers:
1. `publishLeadEvent(userId, type, payload)` — 7 event types: discovered, stage_changed, analysis_complete, score_updated, import_progress, export_progress, screenshot_progress
2. `publishPaymentEvent(userId, type, payload)` — 6 event types: payment_success, payment_failed, invoice_created, subscription_changed, credits_updated, trial_ending
3. `publishMessageEvent(userId, type, payload)` — 8 event types: gmail_sync, gmail_thread_update, telegram_delivery, telegram_incoming, whatsapp_sent, whatsapp_delivered, whatsapp_read, whatsapp_failed
4. `publishAIEvent(userId, type, payload)` — 6 event types: stream_token, analysis_complete, scoring_complete, outreach_generated, chat_response, cancel
5. `publishWorkflowEvent(userId, type, payload)` — 3 event types: step_completed, execution_completed, step_failed

### Notification System:
- `createAndPublishNotification(params)` — Creates Notification record in DB, checks NotificationPreferences (DND schedule, type-specific prefs, global channel prefs), then publishes notification_created event
- `shouldDeliverNotification(userId, type, channel)` — Internal helper checking DB preferences

### Subscription Helpers (for SSE routes):
- `subscribeToChannel(channel, callback)` — Returns unsubscribe function
- `subscribeToUserEvents(userId, callback)` — Wildcard channel filtered by userId
- `subscribeToUserChannel(userId, channel, callback)` — Specific channel filtered by userId

### Event Structure:
```typescript
{
  eventId: string;    // Unique: evt_{timestamp36}_{random8}
  type: string;       // Domain-specific event type
  userId: string;     // Target user
  orgId?: string;     // Optional org scope
  payload: Record<string, unknown>;
  timestamp: number;  // Date.now()
  channel: EventChannel; // lead_events | payment_events | notification_events | message_events | workflow_events | ai_events
}
```

### Audit Logging:
- Significant events logged to AuditLog table with resource='realtime'
- Lead: discovered, stage_changed, analysis_complete
- Payment: all events
- Message: whatsapp_failed, telegram_delivery
- AI: all except stream_token and cancel
- Workflow: all events
- Notification: all created notifications

### Constants:
- DEDUP_MAX_ENTRIES = 10,000
- DEDUP_TTL_MS = 3,600,000 (1 hour)
- HISTORY_MAX_PER_USER = 100
- HISTORY_TTL_MS = 3,600,000 (1 hour)
- RATE_LIMIT_MAX_PER_SECOND = 100
- RATE_LIMIT_WINDOW_MS = 1,000
- CLEANUP_INTERVAL_MS = 300,000 (5 minutes)

## Files Created (2):
- `src/lib/redis-pubsub-service.ts`
- `src/lib/realtime-engine.ts`

## Files Modified (1):
- `.env` (added REDIS_URL and REALTIME_* configuration variables)

## Quality Checks:
- ESLint: 0 new errors, 0 new warnings
- TypeScript: 0 new errors (ioredis import handled with @ts-expect-error)
- Dev server: Running normally
