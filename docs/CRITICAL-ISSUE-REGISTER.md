# AcquisitionOS — Critical Issue Register

**Branch:** `develop`
**Verified SHA:** `bd7e0f12383f1f588338f908f7515457f9d9654d`
**Last Updated:** 2026-11-06
**Source:** Verified against actual `develop` source code

---

## Status Definitions

| Status | Meaning |
|---|---|
| `OPEN` | Issue exists, no investigation started |
| `INVESTIGATION REQUIRED` | Issue reported, root cause not yet proven |
| `FIX IMPLEMENTED — NOT VERIFIED` | Code change committed, no test evidence |
| `AUTOMATED TESTED` | Unit/integration test passes |
| `BROWSER VERIFIED` | End-to-end browser test passes with evidence |
| `BLOCKED` | Cannot proceed due to external dependency |
| `CLOSED` | Fully verified and resolved |

---

## A. Six Previously Prioritized Admin/Auth Issues

### ISSUE-001: MFA QR Code Rendering

| Field | Value |
|---|---|
| ID | ISSUE-001 |
| Description | MFA enrollment page does not display QR code for Google Authenticator |
| Affected files | `src/app/auth/mfa-enrollment/mfa-enrollment-client.tsx` |
| Root cause | Component read `data.qrUrl` (undefined) instead of `data.qrCodeUrl`; used `<img>` instead of `<QRCodeSVG>` |
| Code change | Commit `2a655f23a` — Fixed field name to `data.qrCodeUrl`, replaced `<img>` with `<QRCodeSVG value={qrUrl}>` |
| Automated test | NOT RUN — no unit test for QR rendering |
| Browser evidence | NOT VERIFIED — server could not run persistently for browser testing |
| Status | `FIX IMPLEMENTED — NOT VERIFIED` |
| Verification SHA | `bd7e0f12383f1f588338f908f7515457f9d9654d` |
| Remaining work | Browser verification: render QR, scan with authenticator, verify TOTP code works |

### ISSUE-002: Recovery Codes Display and Copy

| Field | Value |
|---|---|
| ID | ISSUE-002 |
| Description | Recovery codes not displayed after MFA verification; Copy Codes copies empty string |
| Affected files | `src/app/auth/mfa-enrollment/mfa-enrollment-client.tsx` |
| Root cause | `handleSetup` discarded `data.backupCodes` from setup API response; only saved `qrUrl` and `secret` |
| Code change | Commit `2fd980adb` — Added `setRecoveryCodes(data.backupCodes \|\| data.recoveryCodes \|\| [])` in `handleSetup` |
| Automated test | NOT RUN |
| Browser evidence | NOT VERIFIED |
| Status | `FIX IMPLEMENTED — NOT VERIFIED` |
| Verification SHA | `bd7e0f12383f1f588338f908f7515457f9d9654d` |
| Remaining work | Browser verification: complete enrollment, verify codes display, verify clipboard copy, verify recovery code works |

### ISSUE-003: Admin Security API HTTP 500

| Field | Value |
|---|---|
| ID | ISSUE-003 |
| Description | `/api/admin/security/events` returns HTTP 500 for authenticated super_admin |
| Affected files | `src/app/api/admin/security/events/route.ts`, `package.json` |
| Root cause | Prisma Client in `node_modules` was generated from main branch schema (lacks Phase 33 audit columns: `securityEventType`, `severity`, `requestId`, `outcome`, `confirmed`). When endpoint queries these columns, Prisma throws "Unknown field" → HTTP 500. |
| Code change | Commit `34a93e3ad` — Added `prisma generate` to `dev` script in `package.json` to ensure Prisma Client is regenerated from current schema on every startup |
| Automated test | NOT RUN |
| Browser evidence | NOT VERIFIED |
| Status | `FIX IMPLEMENTED — NOT VERIFIED` |
| Verification SHA | `bd7e0f12383f1f588338f908f7515457f9d9654d` |
| Remaining work | Browser verification: authenticated super_admin opens Security page, API returns 200, events render. Also verify: unauthenticated → 401, non-admin → 403. |
| Note | API-level test showed 401 for unauthenticated (correct), but authenticated test not performed. A 401 does NOT prove the authenticated endpoint works. |

### ISSUE-004: Admin "Back to App" Navigation

| Field | Value |
|---|---|
| ID | ISSUE-004 |
| Description | Clicking "Back to app" in Admin Console redirects back to `/admin` instead of showing CRM dashboard |
| Affected files | `src/components/dashboard/auth-gate.tsx` |
| Root cause | `useEffect` in AuthGate redirected super_admin to `/admin` on every visit to `/` — no condition to prevent re-redirect after initial login |
| Code change | Commit `646596c36` — Added `localStorage` check (`aq_admin_redirect_<userId>`) to only redirect on first login |
| Automated test | NOT RUN |
| Browser evidence | NOT VERIFIED |
| Status | `FIX IMPLEMENTED — NOT VERIFIED` |
| Verification SHA | `bd7e0f12383f1f588338f908f7515457f9d9654d` |
| Remaining work | Browser verification: login, go to admin, click Back to app, verify CRM dashboard renders, verify new tab, verify explicit /admin access, verify logout/login |
| **Design concern** | The `localStorage` key persists across logout/login and browser restarts. This means a super_admin who logs out and logs back in will NOT be auto-redirected to `/admin` — they'll see the CRM dashboard. This may or may not be the intended product behavior. The key is NEVER cleared on logout. If the intended behavior is "auto-redirect on every fresh login", this implementation is incorrect. If the intended behavior is "auto-redirect only on the very first login ever", it's correct. **This requires product decision.** |

### ISSUE-005: Account & Profile Settings 404

| Field | Value |
|---|---|
| ID | ISSUE-005 |
| Description | Clicking "Account & Profile Settings" in admin dropdown returns 404 |
| Affected files | `src/components/admin/admin-nav.tsx` |
| Root cause | Dropdown linked to `/dashboard/settings` — route does NOT exist in App Router. Settings is accessed via `/business-ai/settings` (mapped by `pathToTab()` in `src/lib/store.ts`) |
| Code change | Commit `a16ef0e76` — Changed `href` from `/dashboard/settings` to `/business-ai/settings` |
| Automated test | NOT RUN |
| Browser evidence | NOT VERIFIED |
| Status | `FIX IMPLEMENTED — NOT VERIFIED` |
| Verification SHA | `bd7e0f12383f1f588338f908f7515457f9d9654d` |
| Remaining work | Browser verification: open dropdown, click Account & Profile Settings, verify settings page renders, verify refresh works, verify navigation back to admin |

### ISSUE-006: Security & MFA Management Navigation

| Field | Value |
|---|---|
| ID | ISSUE-006 |
| Description | Clicking "Security & MFA Management" in admin dropdown throws TypeError (nonexistent store method) |
| Affected files | `src/components/admin/admin-nav.tsx` |
| Root cause | Phase 5 commit called `useAppStore.getState().setPendingSettingsSection('security')` — method does NOT exist in store. Correct method is `requestSettingsSection`. |
| Code change | Commit `bd7e0f12383f1f588338f908f7515457f9d9654d` — Changed `setPendingSettingsSection` to `requestSettingsSection` |
| Automated test | NOT RUN |
| Browser evidence | NOT VERIFIED |
| Status | `FIX IMPLEMENTED — NOT VERIFIED` |
| Verification SHA | `bd7e0f12383f1f588338f908f7515457f9d9654d` |
| Remaining work | Browser verification: open dropdown, click Security & MFA Management, verify Security section opens directly (not Profile), verify no TypeError in console, verify refresh behavior |
| Store method verified | `requestSettingsSection` exists in `src/lib/store.ts` line 136, sets `pendingSettingsSection` AND calls `setActiveTab('settings')` |

---

## B. Assistant/Agents Runtime Error

### ISSUE-007: Agents Page Component Error

| Field | Value |
|---|---|
| ID | ISSUE-007 |
| Description | Agents page fails with: "Element type is invalid. Received a promise that resolves to: undefined. Lazy element type must resolve to a class or function." |
| Affected files | `src/components/dashboard/agents-tab.tsx`, `src/components/dashboard/dashboard-layout.tsx` |
| **Root cause (PROVEN from source)** | `agents-tab.tsx` uses a **named export** (`export function AgentsTab()`) while ALL other lazy-loaded tabs use **default exports** (`export default function XxxTab()`). `React.lazy(() => import('./agents-tab'))` expects a default export. Without one, the lazy import resolves to `undefined`, causing the error. |
| Source evidence | Verified: 14 of 15 lazy-loaded tab components use `export default`. Only `agents-tab.tsx` uses `export function` (named, no default). |
| Code change | NOT IMPLEMENTED — deferred to separate implementation task |
| Automated test | NOT RUN |
| Browser evidence | NOT VERIFIED (but root cause is proven from source code comparison) |
| Status | `INVESTIGATION REQUIRED` → Root cause identified, fix not yet implemented |
| Verification SHA | `bd7e0f12383f1f588338f908f7515457f9d9654d` |
| Proposed fix | Add `export default` to `agents-tab.tsx` (or change lazy import to `React.lazy(() => import('./agents-tab').then(m => ({ default: m.AgentsTab })))`) |
| Remaining work | Implement fix, browser verify Agents page renders |

---

## C. Ten-Minute Admin Inactivity Timeout

### ISSUE-008: Admin Inactivity Timeout — Design Contradiction

| Field | Value |
|---|---|
| ID | ISSUE-008 |
| Description | Admin inactivity timeout may not enforce true 10-minute inactivity. User reports timer resets and admin stays logged in. |
| Affected files | `src/lib/admin-guard.ts`, `src/components/admin/admin-inactivity-timer.tsx`, `src/app/api/auth/activity/route.ts`, `src/app/api/auth/session-status/route.ts` |
| **Design contradiction (PROVEN from source)** | `admin-guard.ts` line 65 states: "This function does NOT update `lastActivityAt`." But lines 164-168 DO update it with a 30-second throttle. The comment and implementation contradict each other. |
| Source evidence | Line 65 (comment): "NOTE: This function does NOT update `lastActivityAt`." vs. Line 164-168 (code): `if (elapsed > ACTIVITY_WRITE_THROTTLE_MS) { await db.userSession.update({ data: { lastActivityAt: new Date(now) } }) }` |
| Impact | Page navigation (including background polling that triggers admin layout re-render) resets the inactivity timer. This means the 10-minute timeout measures "time since last page navigation or API call through admin layout", NOT "time since genuine user activity (mouse/keyboard/touch)". |
| Client-side timer | `admin-inactivity-timer.tsx` tracks mousedown/keydown/touchstart/pointerdown and sends pings to `/api/auth/activity`. This IS correct for genuine activity. BUT: the server-side `getSuperAdminSession()` also updates `lastActivityAt` on every page navigation (throttled to 30s), which can extend the session even without genuine user activity. |
| Token refresh | `useTokenRefresh` in `admin-nav.tsx` refreshes the access token every 14 minutes. This does NOT update `lastActivityAt` (token refresh is separate from activity tracking). ✅ |
| Multi-tab behavior | NOT VERIFIED — multiple tabs would each send activity pings, potentially extending the session beyond 10 minutes of inactivity in any single tab. |
| Remember-me | `UserSession.absoluteExpiresAt` provides a 30-day hard ceiling. ✅ |
| Code change | NOT IMPLEMENTED — deferred to separate security task |
| Automated test | NOT RUN |
| Browser evidence | NOT VERIFIED |
| Status | `INVESTIGATION REQUIRED` |
| Verification SHA | `bd7e0f12383f1f588338f908f7515457f9d9654d` |
| Remaining work | 1. Resolve comment/code contradiction. 2. Verify server-side enforcement actually expires sessions after 10 minutes of NO activity. 3. Verify multi-tab behavior. 4. Verify background polling doesn't extend session. 5. Verify expired session requires full re-authentication. |

---

## Summary Table

| Issue | Status | Code Fix Committed | Browser Verified |
|---|---|---|---|
| ISSUE-001 MFA QR | FIX IMPLEMENTED — NOT VERIFIED | ✅ `2a655f23a` | ❌ |
| ISSUE-002 Recovery codes | FIX IMPLEMENTED — NOT VERIFIED | ✅ `2fd980adb` | ❌ |
| ISSUE-003 Security API 500 | FIX IMPLEMENTED — NOT VERIFIED | ✅ `34a93e3ad` | ❌ |
| ISSUE-004 Back to app | FIX IMPLEMENTED — NOT VERIFIED | ✅ `646596c36` | ❌ |
| ISSUE-005 Settings 404 | FIX IMPLEMENTED — NOT VERIFIED | ✅ `a16ef0e76` | ❌ |
| ISSUE-006 Security MFA nav | FIX IMPLEMENTED — NOT VERIFIED | ✅ `bd7e0f123` | ❌ |
| ISSUE-007 Agents page error | INVESTIGATION REQUIRED | ❌ | ❌ |
| ISSUE-008 Inactivity timeout | INVESTIGATION REQUIRED | ❌ | ❌ |

**No issue has been BROWSER VERIFIED.** All six code fixes are committed to `develop` but lack end-to-end test evidence. The sandbox's 4GB RAM limitation prevents persistent server operation for browser testing.
