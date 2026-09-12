# Task: auth-1 — Configure and test auth system, add SMTP warning

## Work Summary
- Tested all 7 auth endpoints via curl (signup, signin, otp/request, magic-link/request, me, signout, config)
- Created `/api/auth/config` public endpoint returning auth configuration status
- Added SMTP warning banner to SignInPage when email delivery is not configured
- Enhanced Google OAuth button with gradient border
- Fixed /api/auth/me Turbopack compilation issue (stale .next cache)

## Files Changed
- `src/app/api/auth/config/route.ts` — NEW: Public config endpoint
- `src/middleware.ts` — Added `/api/auth/config` to PUBLIC_ROUTES
- `src/components/dashboard/auth-pages-v2.tsx` — Added SMTP warning, Google gradient border, auth config fetch

## Test Results
| Endpoint | Method | Status | Notes |
|---|---|---|---|
| /api/auth/signup | POST | 201 ✅ | Creates user, auto-verifies in dev mode |
| /api/auth/signin | POST | 200 ✅ | Returns JWT in httpOnly cookies |
| /api/auth/otp/request | POST | 200 ✅ | Returns devOtp in dev mode |
| /api/auth/magic-link/request | POST | 200 ✅ | Returns devToken + devLink |
| /api/auth/me | GET | 200 ✅ | Requires access_token cookie |
| /api/auth/signout | POST | 200 ✅ | Clears auth cookies |
| /api/auth/config | GET | 200 ✅ | Returns {googleAvailable, smtpConfigured, emailServiceAvailable, devMode} |

## Config Endpoint Response (current)
```json
{
  "googleAvailable": true,
  "smtpConfigured": false,
  "emailServiceAvailable": false,
  "devMode": true
}
```
