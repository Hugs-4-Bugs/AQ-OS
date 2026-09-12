# Task 4 — Settings API Routes Agent

## Task
Create ALL missing API routes for the settings system (9 routes total).

## Work Completed

All 9 API routes have been created and verified:

### 1. `/api/settings/appearance` - GET/PUT ✅
- **GET**: Returns user's appearance settings from UserSettings table (theme, compactMode, defaultNiche, defaultCountry). Falls back to theme cookie, then "system" default.
- **PUT**: Updates UserSettings with upsert. Validates theme values (light/dark/system). Sets theme cookie on response. Creates AuditLog entry.

### 2. `/api/settings/api-keys/[id]` - PATCH/DELETE ✅
- **PATCH**: Updates API key name and/or isActive. Verifies key belongs to authenticated user (403 if not). Creates AuditLog entry.
- **DELETE**: Deletes API key after verifying ownership. Deletes related ApiKeyUsage records first (FK constraint). Creates AuditLog entry.

### 3. `/api/settings/export` - POST ✅
- Exports ALL user data as JSON: profile, leads, deals, communications, workflows, analytics, billing (credits ledger, payment orders, invoices), messages (conversation messages), outreach sequences, API keys (without hash).
- Creates DataExport record with status "completed" and record count.
- Returns data with Content-Disposition header for download.
- Creates AuditLog entry.

### 4. `/api/settings/delete-account` - POST ✅
- GDPR-compliant soft deletion. Validates password and "DELETE" confirmation.
- Sets user.isActive=false, user.deletedAt=now.
- Revokes all sessions (isRevoked=true).
- Creates GdprRequest (requestType: "deletion", status: "processing").
- Creates AuditLog entry.
- Clears auth cookies on response.
- Handles Google-only accounts with appropriate error message.

### 5. `/api/settings/integrations` - GET/PUT ✅
- **GET**: Returns integration status from UserSettings, TelegramConfig, WhatsappConfig, EmailAccount tables. Structure: { gmail, telegram, whatsapp, googleCalendar } with connected boolean and details.
- **PUT**: Handles disconnect actions for gmail, telegram, whatsapp, googleCalendar. Updates relevant tables. Creates AuditLog entry.

### 6. `/api/settings/integrations/telegram/link` - POST ✅
- Generates 6-char random link code using crypto.randomBytes.
- Upserts TelegramConfig with linkCode and linkCodeExpiresAt (10 minutes).
- Returns link code with expiry and instructions.

### 7. `/api/settings/integrations/whatsapp/verify` - POST ✅
- Validates phone number format.
- Generates OTP using generateOTP() from auth lib.
- Upserts WhatsappConfig with OTP and otpExpiresAt (10 minutes).
- Returns devOtp in non-production mode for testing.

### 8. `/api/settings/integrations/whatsapp/confirm` - POST ✅
- Verifies OTP using secureCompare() (constant-time comparison).
- Checks OTP expiry.
- Verifies phone number matches.
- Marks WhatsApp as connected in both WhatsappConfig and UserSettings.
- Creates AuditLog entry.

### 9. `/api/billing/history` - GET ✅
- Returns payment orders with invoices for authenticated user.
- Supports pagination with ?page=1&limit=20.
- Returns formatted orders with invoice details.
- Includes pagination metadata (page, limit, totalItems, totalPages, hasMore).

## Code Patterns Used
- All routes use `getAuthUser` from `@/lib/auth` for authentication
- All routes use `db` from `@/lib/db` for database access
- AuditLog entries include: userId, action, details (JSON), ipAddress, userAgent, resource, resourceId
- Error handling with try/catch and proper HTTP status codes
- User data isolation: always filter by userId
- No sensitive data (passwordHash, tokens) exposed in API responses

## Verification
- All 9 routes return proper 401 when unauthenticated
- Lint passes (only pre-existing errors in non-project JS files)
- Dev server compiles and serves all routes successfully
