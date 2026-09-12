# Task: Phase 11 SSE Streaming Routes & Notification API Routes

**Task ID**: Phase-11-SSE-Notification-Routes
**Agent**: Main Agent
**Status**: COMPLETE

## Work Summary

Created 7 API route files for Phase 11: 4 SSE streaming routes and 3 notification CRUD routes.

## Files Created (7)

### SSE Routes (4)

1. **`/src/app/api/events/notifications/route.ts`** — GET SSE stream for notification events
   - Subscribes to `notification_events` channel via `subscribeToUserChannel`
   - Supports `Last-Event-ID` header for resume (replays missed events via `getEventHistory`)
   - Heartbeat every 30 seconds (`: heartbeat\n\n`)
   - Configurable timeout via `SSE_TIMEOUT` env var (default 5 min)
   - Cleanup on abort signal and timeout

2. **`/src/app/api/events/messages/route.ts`** — GET SSE stream for messaging events (Gmail, Telegram, WhatsApp)
   - Subscribes to `message_events` channel
   - Same SSE pattern (resume, heartbeat, timeout, cleanup)
   - Includes delivery status updates

3. **`/src/app/api/events/payments/route.ts`** — GET SSE stream for payment events
   - Subscribes to `payment_events` channel
   - Same SSE pattern

4. **`/src/app/api/events/ai/route.ts`** — GET SSE stream for AI events
   - Subscribes to `ai_events` channel
   - Same SSE pattern

### Notification API Routes (3)

5. **`/src/app/api/notifications/route.ts`** — GET list notifications
   - Query params: `type`, `read`, `page`, `limit`, `startDate`, `endDate`
   - Calls `getNotifications(userId, filters)` from notification-engine
   - Returns paginated results with pagination metadata
   - Validates date format, clamps limit (1-100), page (min 1)

6. **`/src/app/api/notifications/read/route.ts`** — POST mark as read
   - Body: `{ notificationId?: string, all?: boolean }`
   - `all=true` → `markAllAsRead(userId)` returns count
   - `notificationId` → `markAsRead(notificationId, userId)` returns 404 if not found
   - Validates that at least one option is provided

7. **`/src/app/api/notifications/archive/route.ts`** — POST archive notification
   - Body: `{ notificationId: string }` (required)
   - Calls `archiveNotification(notificationId, userId)`
   - Returns 404 if not found or wrong user

## Key Patterns

- All routes use `withAuth` from `@/lib/auth-middleware` for authentication
- All routes use `NextRequest`/`NextResponse` from `next/server`
- All routes have proper try/catch error handling with appropriate HTTP status codes
- SSE routes return `Response` with `as unknown as NextResponse` cast (compatible with `withAuth` return type)
- SSE routes use `ReadableStream` with `TextEncoder` for encoding
- SSE event format: `id: {eventId}\ndata: {JSON.stringify(event)}\n\n`
- No lint errors in any new files (0 errors, 0 warnings)
