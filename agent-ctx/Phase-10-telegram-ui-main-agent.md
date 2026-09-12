---
Task ID: Phase-10-telegram-ui
Agent: Main Agent
Task: Create Telegram UI components for Phase 10

Work Log:
- Read worklog.md for project context (AcquisitionOS - Next.js 16 SaaS with 10 phases of development)
- Read existing Gmail components (gmail-connect-card, gmail-compose-dialog, gmail-sync-status) for styling patterns
- Analyzed Prisma schema for TelegramConfig model fields
- Noted project conventions: sonner for toasts, emerald/teal color scheme, framer-motion, shadcn/ui

Files Created (4):
1. src/components/dashboard/telegram-connect-card.tsx
   - Disconnected state: Bot token input with show/hide toggle, connect button, benefits list, privacy notice
   - Connected state: Bot details grid (username, bot ID, chat ID, mode), link code generation with copy + expiry, disconnect with AlertDialog confirmation
   - Auto-refresh status on mount via fetchTelegramStatus
   - Loading skeleton during data fetch
   - Framer Motion entrance animations

2. src/components/dashboard/telegram-send-dialog.tsx
   - Chat ID input (prefilled from leadContext.telegram or defaultChatId)
   - Parse mode selector with 3 visual cards (Plain Text, Markdown, HTML)
   - Message textarea with character counter (4096 limit)
   - Reply-to message ID optional input
   - Compose/Preview tabs with live markdown/HTML rendering
   - Character usage progress bar with color thresholds
   - Lead context badge
   - Ctrl+Enter keyboard shortcut to send
   - Sheet on mobile, Dialog on desktop
   - API: POST /api/telegram/send

3. src/components/dashboard/telegram-status-card.tsx
   - Connection status with colored indicators
   - Health status badge (healthy/degraded/down/unknown) with color-coded header bar
   - Webhook info section (URL, verified status, pending updates, last webhook time)
   - Reconnect attempts counter
   - Pause/resume toggle
   - Health check button
   - Error message display
   - Auto-refresh every 30 seconds when connected
   - Expandable/collapsible TelegramHealthView section
   - Loading skeletons

4. src/components/dashboard/telegram-health-view.tsx
   - Uptime indicator with progress bar
   - Webhook response time with color-coded thresholds
   - Error rate with percentage and visual indicator
   - Error rate bar chart (12-hour buckets, grouped by hour)
   - Recent webhook events list (scrollable)
   - Reconnection log with success/failure indicators
   - Webhook test result display
   - Quick actions: Force Reconnect, Clear Errors, Test Webhook
   - All actions with loading states and toast notifications

Files Modified (1):
- src/lib/api.ts: Added Telegram API functions section with:
  - TelegramStatus interface (15 fields matching Prisma schema)
  - TelegramHealthDetail interface (with uptime, responseTime, errorRate, recentErrors, recentWebhookEvents, reconnectionLog)
  - TelegramSendMessageResult interface
  - 10 API functions: fetchTelegramStatus, connectTelegramBot, disconnectTelegramBot, generateTelegramLinkCode, sendTelegramMessage, checkTelegramHealth, toggleTelegramPause, forceTelegramReconnect, clearTelegramErrors, testTelegramWebhook, fetchTelegramHealthDetail

Lint: 0 new errors (all pre-existing errors are from server.js/proxy/process-manager)
Dev server: Running normally
