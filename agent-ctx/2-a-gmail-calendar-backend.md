# Task 2-a: Gmail/Calendar Backend Agent Work Record

## Task: Implement Gmail and Calendar OAuth + API routes

## Work Done

1. **Created shared helper library** (`src/lib/google-oauth.ts`):
   - `GOOGLE_INTEGRATION_SCOPES` — all required scopes for Gmail send/readonly + Calendar + Calendar events
   - `refreshGoogleToken()` — shared token refresh function
   - `getValidGmailAccessToken()` — gets valid Gmail token, auto-refreshes if expired, updates DB
   - `getValidCalendarAccessToken()` — gets valid Calendar token, auto-refreshes if expired, updates DB
   - `buildGoogleIntegrationAuthUrl()` — builds Google OAuth consent URL with base64-encoded state param
   - `exchangeCodeForTokens()` — exchanges auth code for access+refresh tokens
   - `getGoogleUserInfo()` — fetches user profile from Google userinfo endpoint
   - `base64urlEncode()` — RFC 4648 §5 encoding for Gmail raw messages

2. **Created `/api/integrations/google/connect/route.ts`** (GET):
   - Requires auth via `withAuth`
   - Validates Google OAuth env vars are configured
   - Builds OAuth URL with Gmail+Calendar scopes using `buildGoogleIntegrationAuthUrl()`
   - Redirects user to Google consent screen

3. **Created `/api/integrations/google/callback/route.ts`** (GET):
   - Decodes state param to extract userId and origin
   - Exchanges authorization code for tokens
   - Fetches Google user info (email)
   - Upserts `EmailAccount` record (Gmail tokens)
   - Creates `GoogleCalendarToken` record (Calendar tokens)
   - Updates `UserSettings` with gmailConnected, gmailEmail, googleCalendarConnected
   - Creates audit log entry
   - Redirects to `${origin}/?integration=google_connected`
   - Handles error cases with redirect to `${origin}/?integration_error=...`

4. **Created `/api/integrations/google/disconnect/route.ts`** (POST):
   - Requires auth via `withAuth`
   - Sets all active `EmailAccount` records to status='revoked'
   - Deletes all `GoogleCalendarToken` records
   - Clears `UserSettings` gmailConnected, gmailEmail, googleCalendarConnected
   - Creates audit log

5. **Created `/api/gmail/send/route.ts`** (POST):
   - Requires auth
   - Body: `{ to, subject, body, leadId? }`
   - Validates required fields and email format
   - Gets valid access token (refreshes if expired)
   - Builds RFC 2822 raw email message with base64url encoding
   - Sends via Gmail API `POST /gmail/v1/users/me/messages/send`
   - If leadId provided: creates EmailThread + EmailMessage records in DB
   - Returns `{ success: true, messageId, threadId }`

6. **Created `/api/gmail/inbox/route.ts`** (GET):
   - Requires auth
   - Gets valid access token (refreshes if expired)
   - Calls Gmail API `GET /gmail/v1/users/me/messages?maxResults=20`
   - Fetches headers (From, Subject, Date) and snippet for each message
   - Returns `{ messages: [...], totalUnread }`

7. **Created `/api/calendar/events/route.ts`** (GET + POST):
   - GET: Lists upcoming calendar events via `GET /calendar/v3/calendars/primary/events`
   - POST: Creates new event with `{ summary, description, startDateTime, endDateTime, attendees? }`
   - Both handle token refresh, 401 error marking, audit logging

8. **Created `/api/calendar/reminders/route.ts`** (GET):
   - Fetches upcoming events and filters for "Follow-up" or "follow up" in summary
   - Returns `{ reminders: [...], total }`

## Key Patterns
- All routes use `withAuth` from `@/lib/auth-middleware` for authentication
- All routes use `db` from `@/lib/db` for Prisma access
- Token refresh is handled by shared helpers in `@/lib/google-oauth`
- 401 responses from Google APIs mark accounts as expired
- All routes create audit log entries for important actions
