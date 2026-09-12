# Task: Rewrite Notification Center Component

## Task ID: notification-center-rewrite
## Agent: Main Agent

## Work Log:
- Read worklog.md, existing notification-center.tsx, use-notifications.ts, use-websocket.ts, store.ts
- Read notification API routes: /api/notifications (GET), /api/notifications/read (POST), /api/notifications/archive (POST)
- Read settings/notifications API route (GET/PUT for preferences)
- Read notification-engine.ts to understand archive behavior (sets metadata.archived=true, doesn't delete)
- Read all relevant shadcn/ui components: skeleton, tabs, switch, collapsible, dropdown-menu, input, tooltip, popover, sheet

### Rewrite Completed:

1. **Realtime Dropdown** (Desktop: Popover, Mobile: Sheet)
   - Bell icon with animated unread count badge (red dot for 1-9, "9+" for 10+)
   - Desktop uses Popover, mobile uses Sheet
   - Connection status indicator (green = connected via emerald dot, red = disconnected)
   - Real-time updates via useNotifications hook (which wraps useWebSocket)

2. **Notification List**
   - Each notification: type-based icon, title, message, relative time, read/unread indicator
   - Click to mark as read and navigate (if actionUrl)
   - Hover actions: mark read, archive, dismiss (desktop)
   - Mobile context menu via DropdownMenu
   - Skeleton loading state (NotificationSkeleton / NotificationListSkeleton)
   - Empty state with appropriate illustration (different for archived, search, default)

3. **Filters Bar**
   - All | Unread | Archived tabs
   - Category filter dropdown: Lead Updates, Payments, Messages, AI, Workflows, System
   - Search input (filter by title/message) with clear button

4. **Actions**
   - "Mark all as read" button (in header + footer)
   - "Archive all read" button (in footer)
   - Individual: mark read, archive, dismiss

5. **Notification Preferences** (separate Popover)
   - Sound toggle
   - Mute 1h / Unmute
   - Channel toggles: In-App, Email, Telegram, WhatsApp (saves via PUT /api/settings/notifications)
   - DND schedule: start time, end time, timezone (collapsible)
   - Per-type preferences (collapsible, 6 categories with in-app toggle each)

6. **Mobile Fullscreen Mode**
   - Sheet that takes 95vh on mobile
   - Swipe to dismiss individual notifications (framer-motion drag + onDragEnd)
   - Swipe left = archive, swipe right = mark read
   - Pull to refresh (touch event tracking + visual indicator)
   - Bottom safe area padding (pb-safe)

7. **Notification History** (expandable)
   - Load more button (pagination via page + hasMore from API)
   - Date grouping (Today, Yesterday, This Week, Older)
   - Sticky date group headers

### Key Architecture Decisions:
- Removed ALL simulation code (SIMULATION_TEMPLATES, generateSampleNotifications, getRandomSimulation, setInterval)
- Uses useNotifications hook for WebSocket realtime + DND + auto-refresh
- Additionally fetches from GET /api/notifications for initial data + pagination
- Merges API data with real-time store notifications (store takes precedence for newer items)
- Archived items tracked locally (archivedIds Set + archivedItems array) since backend uses metadata.archived=true
- Emerald/teal color scheme throughout (no indigo/blue)
- All notification types from both legacy store and Phase 11 engine mapped with icons/colors
- Kept Web Audio API notification sound chime

### Files Modified:
- `/home/z/my-project/src/components/dashboard/notification-center.tsx` (complete rewrite)

### Lint Results:
- 0 new errors (9 pre-existing errors in server.js/proxy/process-manager are unrelated)
- Fixed conditional useTransform hook call (moved to component top level)

### Dev Server:
- Compiles successfully, page loads with 200 status
