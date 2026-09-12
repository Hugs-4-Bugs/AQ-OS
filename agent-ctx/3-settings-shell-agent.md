# Task 3: Production Settings Shell Rewrite

## Agent: settings-shell-agent

## Summary
Completely rewrote `/src/components/dashboard/settings-shell.tsx` from a dummy/static component to a production-grade settings page that fetches ALL data from real APIs. Also created 6 missing API route files to support the new settings features.

## Work Log

### 1. Created Missing API Routes

- **`/api/settings/appearance/route.ts`** — GET/PUT for theme (light/dark/system), compact mode, default country, default niche. Uses `db.userSettings.upsert`. Sets theme cookie on PUT. Validates theme values.

- **`/api/settings/integrations/route.ts`** — GET/PUT for Gmail, Telegram, WhatsApp, Google Calendar integrations. GET returns connection status from `EmailAccount`, `TelegramConfig`, `WhatsappConfig` models. PUT handles: gmail disconnect, telegram disconnect/generate_code, whatsapp disconnect/send_otp/verify_otp, googleCalendar disconnect.

- **`/api/settings/export/route.ts`** — POST endpoint that exports all user data (profile, leads, communications, deals, activities, credits, API keys) as JSON. Logs the export in AuditLog.

- **`/api/settings/delete-account/route.ts`** — POST endpoint for account deletion. Requires password verification and "DELETE" confirmation. Soft-deletes user account. Logs action in AuditLog.

- **`/api/billing/history/route.ts`** — GET endpoint that fetches completed payment orders with invoice data. Returns up to 20 most recent orders.

- **`/api/settings/api-keys/[id]/route.ts`** — PATCH (revoke/rename) and DELETE individual API keys. Verifies ownership before any operation.

### 2. Rewrote settings-shell.tsx (2,078 lines)

**Architecture Changes:**
- All data comes from real APIs via `useQuery` with proper `staleTime`
- All mutations use `useMutation` with toast feedback and query invalidation
- Zero dummy/mock/hardcoded data
- Used `useSyncExternalStore` for client-only mount detection (lint-safe)
- Derived form state from query data with overlay edits (no useEffect+setState pattern)

**8 Sections Implemented:**

1. **Profile** — Fetches from GET `/api/settings/profile`, avatar initials from real user name, email read-only, timezone select, bio textarea, save calls PUT API.

2. **Notifications** — Fetches from GET `/api/settings/notifications`, toggle switches for In-App/Email/Telegram/WhatsApp, DND time range inputs, type-specific preferences, each channel toggle calls PUT immediately.

3. **Billing** — Real plan/credits/trial data from `useSubscriptionStore`, payment history from GET `/api/billing/history`, credit progress bar, trial countdown, upgrade button opens UpgradeModal.

4. **Security** — Password change form with validation (8 chars, uppercase, lowercase, number, special), calls POST `/api/settings/password`, 2FA status badge, active sessions from GET `/api/settings/sessions`, revoke all sessions button.

5. **Appearance** — Fetches from GET `/api/settings/appearance`, theme selector (Light/Dark/System) applies immediately via `next-themes` setTheme, compact mode toggle, default country/niche inputs, save calls PUT API.

6. **Integrations** — Fetches from GET `/api/settings/integrations`, Gmail/Telegram/WhatsApp/Google Calendar with connected/disconnected states, "Coming Soon" badge when Google OAuth not configured, Telegram link code flow, WhatsApp OTP flow.

7. **API Keys** — Fetches from GET `/api/settings/api-keys`, create with name input, one-time key display dialog with copy button, revoke (PATCH) and delete (DELETE) with confirmation dialogs, active/inactive badges.

8. **Data & Privacy** — Export data button downloads JSON, delete account with password + "DELETE" confirmation + alert dialog, GDPR rights info, data retention info.

**Style:**
- Purple accent colors matching existing settings-panel.tsx
- Responsive: stacks on mobile, side-by-side on desktop
- `overflow-x-hidden` on root
- All inputs `w-full`, buttons `w-full sm:w-auto`
- Loading skeletons during data fetch
- Error states with retry buttons

### 3. Lint Verification
- All 9 remaining lint errors are pre-existing (in custom-server.js, proxy/index.js, process-manager.js, server.js)
- Zero new lint errors in src/ directory
- No `useEffect` + `setState` patterns (lint rule: react-hooks/set-state-in-effect)
- No ref access during render (lint rule: react-hooks/refs)
