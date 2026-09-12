# Task 3 — Settings API Routes (Phase 6)

## Work Summary
Rewrote all 18 settings API routes to be production-ready with proper auth, audit logging, input validation, and database operations.

## Key Changes Across All Routes

### Auth System Migration
- **Before**: All routes used `request.headers.get('x-user-id')` for authentication (insecure, easily spoofed)
- **After**: All routes use `requireAuth(request)` from `@/lib/auth` which validates JWT tokens via Bearer header or cookies

### Audit Logging Migration
- **Before**: Direct `db.auditLog.create()` calls with inconsistent action names
- **After**: `logAuthEvent()` from `@/lib/auth` with standardized action names and proper error handling (never fails main flow)

### Audit Action Names (Standardized)
- `profile_updated` (was: `profile_updated` ✓)
- `avatar_changed` (was: `avatar_updated` ✗)
- `password_changed` (was: `password_changed` ✓)
- `session_revoked` (was: `session_revoked` ✓)
- `all_sessions_revoked` (was: `all_sessions_revoked` ✓)
- `org_created` (was: `organization_created` ✗)
- `org_updated` (was: `organization_updated` ✗)
- `team_invite_sent` (was: `team_member_invited` ✗)
- `invite_accepted` (was: `team_invitation_accepted` ✗)
- `invite_revoked` (was: `team_invitation_revoked` ✗)
- `notification_preferences_updated` (was: `notification_preferences_updated` ✓)
- `account_deletion_requested` (was: `account_deletion_requested` ✓)
- `data_export_requested` (was: `data_export_requested` ✓)
- `onboarding_completed` (was: `onboarding_progress_saved` ✗)
- `onboarding_step_completed` (was: `onboarding_progress_saved` ✗)

### Input Validation Added
- Profile: Name max 100 chars, phone max 20, company name max 200
- Password: Check new ≠ current, strength validation
- Notifications: Boolean type coercion, validate at least one field
- Org create: Name trim + max 100 chars
- Org update: Name cannot be empty
- Avatar: Max 2MB, allowed MIME types, URL length max 2048
- Clear-data: Password + "CLEAR_ALL_DATA" confirmation phrase required
- Login history: Pagination with limit/offset
- Onboarding: Step clamped 0-100, boolean coercion

### Bug Fixes
- `/api/settings/clear-data`: Was importing non-existent `withPermission` from `@/lib/auth-middleware` AND deleting ALL data across all users. Fixed to only delete current user's data with proper auth
- `/api/settings/account/delete-request`: Used `type` field instead of `requestType` for GdprRequest model. Fixed to `requestType: 'deletion'`
- `/api/settings/account/export-request`: Used non-existent `requestedAt` field on DataExport. Fixed to use auto-generated `createdAt`. Also used wrong `type` → fixed to `requestType`
- `/api/settings/sessions/[id]`: Now prevents revoking current session (must use sign out instead)
- `/api/settings/onboarding`: Added `data` JSON field support for resume capability. Added `PUT` method (was only `POST`). Added proper `onboarding_completed` and `onboarding_step_completed` audit events
- `/api/settings/checklist`: Added `PUT` method for batch updating checklist items

### Security Improvements
- All routes: Auth via JWT verification, not header spoofing
- Account deletion: Now checks if user is org owner (must transfer first)
- Account deletion: Revokes all sessions after soft-delete
- Session revoke: Cannot revoke current session via DELETE endpoint
- Team invite: Cannot invite yourself; checks if target already in org
- Team invite revoke: Original inviter OR org admin can revoke (not just admin)
- Clear data: Requires password confirmation + explicit confirmation phrase
- Export request: Prevents duplicate pending exports

## Files Modified (18 route files)

1. `/src/app/api/settings/profile/route.ts` — GET/PUT
2. `/src/app/api/settings/password/route.ts` — PUT
3. `/src/app/api/settings/sessions/route.ts` — GET
4. `/src/app/api/settings/sessions/[id]/route.ts` — DELETE
5. `/src/app/api/settings/sessions/revoke-all/route.ts` — DELETE
6. `/src/app/api/settings/login-history/route.ts` — GET
7. `/src/app/api/settings/notifications/route.ts` — GET/PUT
8. `/src/app/api/settings/org/create/route.ts` — POST
9. `/src/app/api/settings/org/route.ts` — PUT
10. `/src/app/api/settings/team/invite/route.ts` — POST
11. `/src/app/api/settings/team/accept/route.ts` — POST
12. `/src/app/api/settings/team/invite/[id]/route.ts` — DELETE
13. `/src/app/api/settings/account/delete-request/route.ts` — POST
14. `/src/app/api/settings/account/export-request/route.ts` — POST
15. `/src/app/api/settings/onboarding/route.ts` — GET/PUT (was GET/POST)
16. `/src/app/api/settings/checklist/route.ts` — GET/PUT
17. `/src/app/api/settings/avatar/route.ts` — POST/PUT
18. `/src/app/api/settings/clear-data/route.ts` — POST

## Lint: 0 errors ✓
## Dev server: Running on port 3000 ✓
