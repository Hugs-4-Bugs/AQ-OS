# AcquisitionOS — API Routes Reference (v0.2.0)

> Comprehensive reference for every API route under `src/app/api/`. Organized by group.
> All routes are Next.js App Router handlers (Next 16.1.1). Prisma 6.19 is the ORM.
> Auth is cookie-based (jose JWT) + optional API key (Bearer header). RBAC enforced via `src/lib/rbac.ts` + `src/lib/auth-middleware.ts`.

## Auth Legend

| Marker | Meaning |
|---|---|
| **no** | Public — no authentication required |
| **yes** | Cookie session (JWT access token via `access_token` cookie, or Bearer `Authorization` header) |
| **yes (requireAuth)** | Same as `yes`, but the route uses `requireAuth()` from `@/lib/auth` (throws AuthError → 401) |
| **admin** | Session auth AND `User.role` ∈ {`super_admin`, `owner`, `admin`} (`withAdmin` middleware) |
| **permission: <perm>** | Session auth AND `hasPermission(role, perm)` (`withPermission` middleware) |
| **dual: <perm>** | Either a valid cookie session OR an API key with the matching scope (`withDualAuthPermission`) |
| **cron-secret** | Protected by `Authorization: Bearer <CRON_SECRET>` env var |
| **webhook** | External-service webhook — caller verified via signature/token, not session auth |

## Standard Error Envelope

All error responses follow this shape (verified across every route read):

```json
{ "error": "Human-readable message" }
```

Status codes used throughout: `200 OK`, `201 Created`, `202 Accepted`, `204 No Content`, `400 Bad Request`, `401 Unauthorized`, `402 Payment Required` (insufficient credits), `403 Forbidden` (RBAC), `404 Not Found`, `409 Conflict`, `423 Locked` (account/OTP lockout), `429 Too Many Requests`, `500 Internal Server Error`, `502 Bad Gateway`, `503 Service Unavailable`.

## Cookie Names

- `access_token` — JWT, 15-minute expiry (set by `setAuthCookies` in `src/lib/auth.ts`).
- `refresh_token` — JWT, 30-day expiry. Stored in `UserSession` table; revocable.

---

## 1. Authentication & Sessions — `/api/auth/*`

### Response shapes (canonical)

`POST /api/auth/signin` → 200:
```json
{
  "message": "Signed in successfully",
  "user": { "id": "uuid", "email": "user@example.com", "name": "User", "role": "owner", "plan": "free", "orgId": null, "emailVerified": true, "mfaEnabled": false, "avatarUrl": null }
}
```
Sets cookies: `access_token`, `refresh_token`.

`POST /api/auth/signin` (MFA required) → 200:
```json
{ "mfaRequired": true, "mfaSessionToken": "<short-lived JWT>", "message": "MFA verification required" }
```

`POST /api/auth/signup` → 201:
```json
{ "message": "Account created! Please check your email for a verification code.", "requiresVerification": true, "email": "user@example.com" }
```

`GET /api/auth/me` → 200:
```json
{ "user": { "id": "uuid", "email": "...", "name": "...", "role": "owner", "plan": "free", "orgId": null, "emailVerified": true, "mfaEnabled": false, "avatarUrl": null } }
```

`GET /api/auth/config` → 200:
```json
{ "googleAvailable": true, "emailConfigured": true }
```

`POST /api/auth/refresh` → 200: same shape as `/auth/me` (`{ message, user }`) + refreshed cookies.

`POST /api/auth/signout?allDevices=true` → 200: `{ "message": "Signed out (all devices) successfully" }` + clears auth cookies.

`POST /api/auth/mfa/setup` → 200:
```json
{ "message": "MFA setup initiated. Verify with a TOTP code to complete setup.", "secret": "<base32>", "qrCodeUrl": "otpauth://totp/...", "backupCodes": ["8-char codes × 8"] }
```

### Routes

| Route path | Method | Auth | Request body fields | What it does |
|---|---|---|---|---|
| `/api/auth/signup` | POST | no | `name`, `email`, `password` | Create a new email/password account; send verification OTP via SMTP. 14-day trial auto-created. Rate-limited 5/min/IP. |
| `/api/auth/signin` | POST | no | `email`, `password` | Sign in with email+password. If MFA enabled → returns `mfaSessionToken` instead of full session. Account lockout after 5 failed attempts / 15 min. |
| `/api/auth/signout` | POST | yes (optional) | none | Revoke refresh token session + clear auth cookies. `?allDevices=true` revokes all sessions for user. |
| `/api/auth/refresh` | POST | refresh_token cookie | none | Rotate refresh token, issue new access token. Old session revoked. |
| `/api/auth/me` | GET | yes | none | Return current authenticated user's profile. |
| `/api/auth/config` | GET | no | none | Return `{ googleAvailable, emailConfigured }` for frontend boot. `googleAvailable` is permanently `true`. |
| `/api/auth/otp/request` | POST | no | `email` | Email 6-digit login OTP (10-min expiry). Anti-enumeration: returns same message regardless of account existence. |
| `/api/auth/otp/verify` | POST | no | `email`, `otp` | Verify login OTP and create session. Constant-time compare. Lockout after 5 attempts. |
| `/api/auth/magic-link/request` | POST | no | `email` | Generate a 15-min magic-link token; email it. Throttled to one new link per 60s. |
| `/api/auth/magic-link/verify` | GET | no | query: `token`, `email` | Browser-click flow: verify token, set cookies, redirect to `/`. |
| `/api/auth/magic-link/verify` | POST | no | `email`, `token` | API-based magic-link verification (same logic, returns JSON). |
| `/api/auth/google` | GET | no | none | Redirect user to Google OAuth consent screen. State encodes `redirectUri` + `origin` (dynamic). |
| `/api/auth/google/state` | GET | no | query: `origin` (optional) | Return `{ authUrl, state, googleEnabled }` for client-side OAuth initiation. |
| `/api/auth/google/callback` | GET | no | none | Legacy alias for `/api/auth/callback/google`. |
| `/api/auth/google/relay` | GET | no | query: `token` | Cross-domain session relay — sets cookies on the originating domain after OAuth completes. |
| `/api/auth/google/redirect-uri` | GET | no | none | Return computed `redirectUri` for Google Cloud Console setup. |
| `/api/auth/callback/google` | GET | no | query: `code`, `state` | Google redirects here with the authorization code. Exchanges code for tokens, upserts user, creates session, redirects to `/` (or relays across domains). |
| `/api/auth/callback/google` | POST | no | `code` | Programmatic code exchange for SPAs/mobile clients. Returns JSON `{ message, user }` + sets cookies. |
| `/api/auth/mfa/setup` | POST | yes (requireAuth) | `password` | Verify current password, generate TOTP secret + 8 backup codes, return QR URI. MFA stays disabled until `/mfa/confirm` is called. |
| `/api/auth/mfa/verify` | POST | no | `mfaSessionToken`, `code` | Verify TOTP/backup code from `/signin` MFA flow; completes login, sets cookies. |
| `/api/auth/mfa/confirm` | POST | yes (requireAuth) | `code` | Confirm MFA setup (mark `isEnabled=true`) after `/mfa/setup`. |
| `/api/auth/mfa/disable` | POST | yes (requireAuth) | `password`, `code` | Disable MFA after re-verifying password + current TOTP code. |
| `/api/auth/forgot-password` | POST | no | `email` | Generate reset OTP (10-min expiry) and email it. Anti-enumeration. |
| `/api/auth/reset-password` | POST | no | `email`, `otp`, `newPassword` | Verify reset OTP, hash & update password, revoke all sessions. |
| `/api/auth/verify-email` | POST | no | `email`, `otp` | Verify the email-verification OTP sent at signup. Marks `emailVerified=true`. |
| `/api/auth/resend-verification` | POST | no | `email` | Re-send the email-verification OTP. |
| `/api/auth/security/devices` | GET | yes | none | List user's known devices (fingerprint/IP/UA + last-seen). |
| `/api/auth/security/alerts` | GET | yes | none | List security alerts (suspicious logins, etc.). |
| `/api/auth/security/lock-status` | GET | yes | none | Return whether the user's account or OTP is currently locked. |
| `/api/auth/debug` | GET | yes (requireAuth) | none | Internal: dump JWT payload, cookie state, and effective auth user. (Disable in prod via env.) |
| `/api/auth/email-diagnostic` | GET | yes (requireAuth) | none | Check SMTP configuration + send a test email. |

---

## 2. User Settings & Profile — `/api/settings/*`

All routes in this group require cookie-session auth (yes / `requireAuth` / `getAuthUser`). None require admin.

| Route path | Method | Auth | Request body fields | What it does |
|---|---|---|---|---|
| `/api/settings/profile` | GET | yes | none | Return profile (name, email, phone, country, company, avatar). |
| `/api/settings/profile` | PUT | yes | `name`, `phone`, `country`, `avatar`, `company` | Update profile fields. |
| `/api/settings/password` | PUT | yes | `currentPassword`, `newPassword` | Change password (validates current, hashes new, revokes other sessions). |
| `/api/settings/avatar` | POST | yes | multipart/form-data: `file` | Upload avatar image (stored as URL). |
| `/api/settings/appearance` | GET / PUT | yes | `theme`, `accentColor`, `density` | Read/persist UI appearance preferences. |
| `/api/settings/notifications` | GET / PUT | yes | notification-preference flags (email/in-app/push per category) | Read/update notification preferences. |
| `/api/settings/audit-log` | GET | yes | query: page, limit, action | List user-scoped audit log entries. |
| `/api/settings/login-history` | GET | yes | query: page, limit | List user's login attempts (success + failure + IP/UA). |
| `/api/settings/sessions` | GET | yes | none | List active sessions (UserSession records). |
| `/api/settings/sessions/[id]` | DELETE | yes | none | Revoke a specific session. |
| `/api/settings/sessions/revoke-all` | POST | yes | none | Revoke all sessions except the current. |
| `/api/settings/integrations` | GET | yes | none | List all integration statuses (Gmail, Calendar, WhatsApp, Telegram). |
| `/api/settings/integrations/whatsapp/verify` | POST | yes | `otp` | Verify WhatsApp OTP (sender-number confirmation). |
| `/api/settings/integrations/whatsapp/confirm` | POST | yes | `...` | Confirm WhatsApp configuration. |
| `/api/settings/integrations/telegram/link` | POST | yes | `code` | Link Telegram bot via generated code. |
| `/api/settings/api-keys` | GET | yes | none | List user's API keys. Plan-gated to Pro/Elite. |
| `/api/settings/api-keys` | POST | yes | `name`, `environment`, `scopes`, `expiresAt?`, `rateLimitPerHour?` | Create API key. Returns raw key ONCE. |
| `/api/settings/api-keys/docs` | GET | yes | none | Return markdown API-key usage docs (OpenAPI-style). |
| `/api/settings/api-keys/analytics` | GET | yes | query: page, limit, keyId, startDate, endDate | Per-key usage analytics. |
| `/api/settings/api-keys/[id]` | GET / DELETE | yes | none | Read or revoke a single API key. |
| `/api/settings/api-keys/[id]/revoke` | POST | yes | none | Revoke an API key. |
| `/api/settings/api-keys/[id]/rotate` | POST | yes | none | Rotate an API key (replaces raw key; old key stops working immediately). |
| `/api/settings/org` | GET | yes | none | Return org info (name, logo, branding) for the user's first org membership. |
| `/api/settings/org/create` | POST | yes | `name`, `logo?`, `branding?` | Create a new organization and add the user as owner. |
| `/api/settings/org/white-label` | GET / PUT | yes | white-label config | Read/update white-label settings (owner only). |
| `/api/settings/org/branding` | GET / PUT | yes | branding config | Read/update branding (logo URL, colors, domain). |
| `/api/settings/org/invites` | GET / POST | yes | `email`, `role?` (POST) | List / send pending org-invite emails. |
| `/api/settings/org/invites/[id]` | DELETE | yes | none | Cancel a pending org invite. |
| `/api/settings/team/invite` | POST | yes | `email`, `role` | Invite a teammate by email (sends a magic-link invite). |
| `/api/settings/team/invite/[id]` | GET / DELETE | yes | none | View or revoke a team invite. |
| `/api/settings/team/accept` | POST | yes | `token` | Accept a team invite (current user joins the inviter's org). |
| `/api/settings/meeting-provider` | GET / PUT | yes | `provider`, `defaultPlatform` | Read/update preferred meeting provider (google_meet / zoom / teams). |
| `/api/settings/autonomy-mode` | GET / PUT | yes | `meetingAutonomyMode` (`manual`/`assisted`/`autonomous`) | Read/update SDR autonomy level. |
| `/api/settings/clear-data` | POST | yes | `confirm` (boolean) | Wipe the user's lead/outreach/meeting data (soft reset). |
| `/api/settings/delete-account` | POST | yes | `password` or `confirmationCode` | Two-step account deletion (creates GDPR request). |
| `/api/settings/export` | GET | yes | query: `type` | Download user data export (CSV/JSON). |
| `/api/settings/checklist` | GET / PUT | yes | checklist steps | Onboarding checklist state. |
| `/api/settings/onboarding` | GET / PUT | yes | onboarding step flags | Onboarding progress tracking. |
| `/api/settings/account/export-request` | POST | yes | none | Request a full data-export (async; email delivered when ready). |
| `/api/settings/account/delete-request` | POST | yes | none | Request account deletion (async GDPR pipeline). |

---

## 3. Leads — `/api/leads/*`

### Response shapes (canonical)

`GET /api/leads?page=1&limit=20` → 200:
```json
{ "leads": [Lead], "pagination": { "page": 1, "limit": 20, "total": 123, "totalPages": 7 } }
```

`POST /api/leads` → 201: returns the created `Lead` object (Prisma model).

`GET /api/leads/[id]` → 200:
```json
{ "lead": { /* Lead + relations: leadNotes, leadAnalysis, activities, leadScores */ } }
```

`POST /api/leads/discover` → 202:
```json
{ "jobId": "uuid", "status": "started", "message": "..." }
```

`POST /api/leads/[id]/analyze` → 200:
```json
{ "lead": { /* updated Lead */ }, "analysis": { "replyScore": 0-100, "conversionScore": 0-100, "urgencyScore": 0-100, "revenuePotentialScore": 0-100, "scoreReasoning": "...", "digitalWeaknesses": [...], "bestContactPerson": "...", "bestChannel": "email|whatsapp|linkedin|instagram|phone", "bestTiming": "...", "outreachStyle": "...", "opportunityNotes": "..." } }
```

### Routes

| Route path | Method | Auth | Request body fields | What it does |
|---|---|---|---|---|
| `/api/leads` | GET | dual: `leads:read` | query: stage, niche, country, search, sortBy, sortOrder, page, limit | Paginated lead list (max 100 per page). |
| `/api/leads` | POST | dual: `leads:write` | `businessName` (req), ownerName, website, email, phone, whatsapp, linkedin, instagram, facebook, googleMapsListing, reviews, rating, estimatedQuality, estimatedRevenue, city, country, niche, stage, hasWebsite, websiteQuality, digitalWeaknesses, opportunityNotes, bestContactPerson, bestChannel, bestTiming, outreachStyle, source, notes, tags, replyScore, conversionScore, urgencyScore, revenuePotentialScore | Create a new lead. Entitlement-checked against `lead_discovery`. |
| `/api/leads/[id]` | GET | yes | none | Fetch a lead by id (with notes, analysis, activities, scores). Authorization: owner or same org. |
| `/api/leads/[id]` | PUT | yes | subset of create-body fields (allow-list enforced) | Update a lead. Audit-logged. |
| `/api/leads/[id]` | DELETE | yes | none | Soft-delete a lead (`isActive=false`, `deletedAt=now`). |
| `/api/leads/discover` | POST | yes | `niche` (req), `country` (req), `city?`, `source` (req, one of: ai_search, google_maps, google_business, justdial, indiamart, yelp, yellow_pages, sulekha, linkedin, instagram, facebook), `maxResults?` (1–50) | Start a discovery job. Returns 202 with `jobId`. |
| `/api/leads/discover/status/[jobId]` | GET | yes | none | Poll job status (pending/running/completed/failed + progress). |
| `/api/leads/discover/suggestions` | GET | yes | query: niche, country | Return AI-suggested search queries for that niche+country. |
| `/api/leads/search` | GET | yes | query: q, stage, niche, country, page, limit | Full-text lead search. |
| `/api/leads/hot` | GET | yes | none | List current user's hot leads (urgency score ≥ threshold). |
| `/api/leads/hot/stats` | GET | yes | none | Aggregate stats: counts by urgency, source, niche. |
| `/api/leads/hot/scan` | POST | yes | none | Trigger a hot-lead scan for the user. |
| `/api/leads/hot-leads` | GET | yes | none | Alias for `/api/leads/hot`. |
| `/api/leads/gap-analysis` | GET | yes | query: niche, country | Return gap-analysis (no website / weak SEO / no WhatsApp) counts for a niche. |
| `/api/leads/compare` | POST | yes | `leadIds: string[]` | Side-by-side comparison of up to 5 leads. |
| `/api/leads/merge` | POST | yes | `sourceId`, `targetId` | Merge duplicate leads (notes/activities/deals collapsed into target). |
| `/api/leads/import` | POST | yes | multipart/form-data: `file` (CSV/JSON) | Bulk import leads from file. Returns count + duplicates. |
| `/api/leads/export` | GET | yes | query: stage?, format? | Stream leads as CSV/JSON. |
| `/api/leads/ai-scores` | GET | yes | query: leadId? | Return AI scores for a lead (or all user's leads). |
| `/api/leads/scraping-metrics` | GET | yes | none | Return proxy/scraping health metrics. |
| `/api/leads/proxy-pool` | GET | yes | none | List configured proxy pool + statuses. |
| `/api/leads/stats` | GET | yes | none | Aggregate stats: total leads, by stage, by source, by niche. |
| `/api/leads/reply-intelligence` | GET | yes | query: leadId | Reply-intelligence analytics for a lead's communications. |
| `/api/leads/[id]/analyze` | POST | yes | none | Deep AI analysis (entitlement-checked: `deep_analysis`). Updates lead's scores + analysis fields. |
| `/api/leads/[id]/analyze-website` | POST | yes | none | Run the website scorer on `lead.website`; store `WebsiteScore`. |
| `/api/leads/[id]/research` | POST | yes | none | Deep company research (calls researcher LLM; 5 credits). |
| `/api/leads/[id]/enrich` | POST | yes | none | Enrich lead (find email/phone/LinkedIn via 3rd-party APIs). |
| `/api/leads/[id]/outreach` | POST | yes | `channel?`, `tone?`, `customInstructions?` | Generate AI outreach email for the lead (does NOT send). |
| `/api/leads/[id]/move-stage` | POST | yes | `stage` | Move lead to a new pipeline stage. Audit-logged. |
| `/api/leads/[id]/notes` | GET / POST | yes | `content` (POST) | List/add notes for a lead. |
| `/api/leads/[id]/activities` | GET | yes | query: page, limit, type | List lead activities (emails sent/received, meetings, status changes). |
| `/api/leads/[id]/communications` | GET | yes | none | List all email/WhatsApp/Telegram communications for the lead. |
| `/api/leads/[id]/reminders` | GET / POST | yes | `remindAt`, `message` (POST) | List/schedule follow-up reminders. |
| `/api/leads/[id]/deals` | GET | yes | none | List deals associated with the lead. |
| `/api/leads/[id]/explain-scores` | GET | yes | none | Return AI-generated explanation of why each score was assigned. |

---

## 4. Lead Discovery — `/api/lead-discovery`, `/api/discovery/*`

| Route path | Method | Auth | Request body fields | What it does |
|---|---|---|---|---|
| `/api/lead-discovery` | POST | yes | `niche`, `location`, `maxLeads` (1–100), `targetGap` | Run the discovery engine synchronously (returns discovered + saved + skipped counts). |
| `/api/lead-discovery` | GET | no | none | Return engine status + configured search provider (google_custom_search / serpapi). |
| `/api/discovery/start` | POST | yes | `niche`, `location` or `country`, `maxLeads` (1–100), `targetGap?`, `city?` | Async full pipeline (Discover → Score → Research → Outreach). Returns 200 with `jobId` immediately; processes in background. Credit precheck: ~7 credits per lead. |
| `/api/discovery/status` | GET | yes | query: `jobId` | Poll job status (DiscoveryJob record). |
| `/api/discovery/leads` | GET | yes | query: jobId, page, limit | List leads discovered by a given job. |

`POST /api/discovery/start` → 200:
```json
{ "jobId": "uuid", "status": "started", "message": "Discovery running in background" }
```
`POST /api/lead-discovery` → 200:
```json
{ "discovered": 12, "saved": 9, "skipped": 3, "leads": [/* full Lead objects */] }
```

---

## 5. Pipeline & Deals — `/api/pipeline`, `/api/deals/*`

| Route path | Method | Auth | Request body fields | What it does |
|---|---|---|---|---|
| `/api/pipeline` | GET | yes | query: stage?, niche?, country?, page, limit | Pipeline view (leads grouped by stage). If `stage` provided, returns only leads for that stage. |
| `/api/deals` | GET | permission: `deals:read` | none | List all deals (with lead included). |
| `/api/deals/[id]` | GET / PUT / DELETE | permission: `deals:read` (GET) / `deals:write` (PUT/DELETE) | `status`, `proposedPrice`, `finalPrice`, `expectedCloseDate` (PUT) | CRUD on a single deal. |

`GET /api/deals` → 200: `Deal[]` (with `lead` relation).

---

## 6. Outreach & Sequences — `/api/outreach/*`, `/api/sequences/*`

| Route path | Method | Auth | Request body fields | What it does |
|---|---|---|---|---|
| `/api/outreach` | GET | yes | query: leadId, status, page, limit | List outreach messages sent by the user. |
| `/api/outreach/send` | POST | yes | `leadId` | Generate AI outreach email + send via SMTP/Gmail; auto-move lead to `contacted` stage. |
| `/api/outreach/execute` | POST | yes | `leadId`, `channel?`, `tone?`, `autoGenerate?` | Execute the next-best outreach action for a lead. |
| `/api/outreach/batch` | POST | yes | `leadIds: string[]`, `channel?`, `tone?` | Batch outreach (sequential per-lead generation + send). |
| `/api/outreach/enroll` | POST | yes | `leadId`, `sequenceId` | Enroll a lead in a sequence. |
| `/api/outreach/autonomous` | POST | yes | `leadId?`, `limit?` | Trigger autonomous outreach for one or more leads. |
| `/api/outreach/autonomy-status` | GET | yes | none | Return whether autonomous outreach is enabled + queue length. |
| `/api/sequences` | GET | yes | query: status, page, limit, search | List user's sequences (paginated). |
| `/api/sequences` | POST | yes | `name` (req), `description?`, `channel?`, `steps: [{ channel, subject?, template (req), delayDays?, delayHours? }]` (req) | Create a new outreach sequence. |
| `/api/sequences/create` | POST | yes | same as above | Alias for create. |
| `/api/sequences/list` | GET | yes | same query as `/api/sequences` | Alias for list. |
| `/api/sequences/enroll` | POST | yes | `leadId`, `sequenceId` | Enroll a lead in a sequence. |
| `/api/sequences/enrollments/[id]` | GET / PATCH / DELETE | yes | `status?` (PATCH) | Manage one enrollment (pause/cancel/resume). |
| `/api/sequences/pause` | POST | yes | `sequenceId` | Pause a sequence (stops new sends; existing enrollments held). |
| `/api/sequences/resume` | POST | yes | `sequenceId` | Resume a paused sequence. |
| `/api/sequences/process` | POST | yes | none (or `sequenceId`) | Manually trigger sequence-step processing (also run by cron). |
| `/api/sequences/analytics` | GET | yes | query: sequenceId, startDate, endDate | Per-sequence + per-step analytics (open/click/reply rates). |
| `/api/sequences/[id]` | GET / PUT / DELETE | yes | name, description, steps (PUT) | CRUD on a single sequence. |
| `/api/sequences/[id]/enroll` | POST | yes | `leadId` | Enroll a lead in this specific sequence. |
| `/api/sequences/[id]/pause` | POST | yes | none | Pause this sequence. |
| `/api/sequences/[id]/resume` | POST | yes | none | Resume this sequence. |

`POST /api/outreach/send` → 200:
```json
{ "success": true, "emailId": "uuid", "subject": "...", "creditsDeducted": 2, "newCreditBalance": 488 }
```
`POST /api/sequences` → 201: the created `OutreachSequence` object.

---

## 7. Email & Gmail — `/api/email/*`, `/api/gmail/*`

| Route path | Method | Auth | Request body fields | What it does |
|---|---|---|---|---|
| `/api/email/schedule` | POST | yes | `leadId`, `sendAt`, `subject`, `body` | Schedule an email to be sent later. |
| `/api/email/bounces` | GET | yes | query: page, limit, startDate, endDate | List bounced emails for the user. |
| `/api/email/analytics` | GET | yes | query: startDate, endDate | Aggregate email analytics (sent/delivered/opened/clicked/bounced). |
| `/api/email/tracking/open/[id]` | GET | no | none | Email-open pixel (returns 1×1 GIF; records `email_opened` event). |
| `/api/email/tracking/click/[id]` | GET | no | none | Redirect to original URL after recording `email_clicked` event. |
| `/api/gmail/connect` | POST | yes | none | Generate Gmail OAuth URL; return `{ authUrl, state }`. |
| `/api/gmail/callback` | GET | no | query: `code`, `state` | Gmail OAuth callback — exchanges code, stores tokens on `EmailAccount`. |
| `/api/gmail/disconnect` | POST | yes | none | Revoke Gmail tokens; mark `EmailAccount.status='revoked'`. |
| `/api/gmail/sync` | POST | yes | none | Trigger incremental Gmail sync (new threads since last `historyId`). |
| `/api/gmail/inbox` | GET | yes | query: page, limit, q | List inbox threads. |
| `/api/gmail/threads` | GET | yes | query: labelIds, page, limit | List Gmail threads. |
| `/api/gmail/thread/[id]` | GET | yes | none | Fetch one thread with all messages. |
| `/api/gmail/send` | POST | yes | `to`, `subject`, `body`, `cc?`, `bcc?`, `leadId?` | Send email via connected Gmail account. |
| `/api/gmail/draft` | POST | yes | `to`, `subject`, `body`, `threadId?` | Create Gmail draft. |
| `/api/gmail/reply` | POST | yes | `threadId`, `body`, `leadId?` | Reply to a thread. |
| `/api/gmail/reply-intelligence` | POST | yes | `threadId` or `messageId` | AI classify reply (interested/not_now/objection/auto-reply). |
| `/api/gmail/process-replies` | POST | yes | none | Trigger reply-processing pipeline (fire-and-forget; poll `/status`). |
| `/api/gmail/process-replies/status` | GET | yes | none | Return `enabled`, `isRunning`, last-run timestamps. |
| `/api/gmail/jobs/process` | POST | yes | `jobType?` | Manually invoke the Gmail background-job runner. |
| `/api/gmail/pubsub/webhook` | POST | webhook | PubSub push envelope (no auth) | Receive Gmail Pub/Sub push; queues async processing; always 200. |
| `/api/gmail/pubsub/webhook` | GET | webhook | query: `hub.mode`, `hub.verify_token`, `hub.challenge` | Subscription verification — echo back `hub.challenge`. |
| `/api/gmail/pubsub/setup` | POST | yes | `topicName?` | Set up the Pub/Sub topic + push subscription for the user. |
| `/api/gmail/tracking/pixel/[messageId]` | GET | no | none | Open-pixel for messages sent through AO. |
| `/api/gmail/tracking/click` | GET | no | query: `url`, `messageId` | Click redirect for AO-sent emails. |
| `/api/gmail/accounts` | GET | yes | none | List the user's connected Gmail accounts. |
| `/api/gmail/status` | GET | yes | none | Return connection status + last sync. |
| `/api/gmail/unsubscribe` | GET | no | query: `email`, `token` | One-click unsubscribe (records `EmailUnsubscribe`). |
| `/api/gmail/outreach-to-draft` | POST | yes | `leadId`, `channel?`, `tone?` | Generate AI outreach and save as a Gmail draft (does NOT send). |

---

## 8. Meetings & Calendar — `/api/meetings/*`, `/api/calendar/*`

### Meeting response shape

`GET /api/meetings` → 200:
```json
{ "meetings": [Meeting] }
```
`POST /api/meetings` → 201:
```json
{ "meeting": { "id": "uuid", "title": "...", "meetingUrl": "https://meet.google.com/...", "status": "scheduled", "startDateTime": "ISO", "endDateTime": "ISO", "platform": "google_meet", ... } }
```
`POST /api/meetings/[id]/agenda` → 200:
```json
{ "meetingId": "uuid", "agenda": "<markdown>", "creditsDeducted": 2, "newBalance": 488 }
```
`POST /api/meetings/suggest-slots` → 200:
```json
{ "suggestedSlots": [{ "start": "ISO", "end": "ISO", "confidence": "high|medium|low" }], "count": 5 }
```
`POST /api/meetings/detect-intent` → 200:
```json
{ "intent": "schedule_meeting" | null, "confidence": 0.85, "suggestedAction": { ... } | null, "hasIntent": true }
```

### Routes

| Route path | Method | Auth | Request body fields | What it does |
|---|---|---|---|---|
| `/api/meetings` | GET | yes | query: status, startDate, endDate, leadId | List user's meetings (filtered). |
| `/api/meetings` | POST | yes | `title` (req), `description?`, `meetingType?`, `platform?`, `startDateTime` (req), `endDateTime` (req), `durationMinutes?`, `timezone?`, `agenda?`, `attendees?`, `location?`, `leadId?`, `dealId?`, `createdBy?`, `reminders?` | Create a meeting (Google Meet link generated if Google Calendar connected). |
| `/api/meetings/[id]` | GET / PUT / DELETE | yes | subset of create-body | CRUD on a single meeting. |
| `/api/meetings/[id]/agenda` | POST | yes | none | AI-generate meeting agenda (uses lead + reply history). |
| `/api/meetings/[id]/prep` | POST | yes | none | AI-generate meeting prep (objection-handling, talking points). |
| `/api/meetings/[id]/complete` | POST | yes | `notes?`, `transcript?` | Mark meeting as completed; store notes. |
| `/api/meetings/[id]/follow-up` | POST | yes | none | AI-generate follow-up action plan. |
| `/api/meetings/[id]/follow-up-email` | POST | yes | none | AI-generate follow-up email content (does NOT send). |
| `/api/meetings/[id]/action-items` | GET / POST | yes | `text`, `assignee?`, `dueDate?` (POST) | List/add action items. |
| `/api/meetings/[id]/extract-actions` | POST | yes | none | AI-extract action items from meeting notes/transcript. |
| `/api/meetings/[id]/objections` | GET / POST | yes | `text`, `response?` (POST) | List/add objection handling. |
| `/api/meetings/[id]/sentiment` | POST | yes | none | AI-sentiment analysis of meeting notes/transcript. |
| `/api/meetings/[id]/reschedule` | POST | yes | `newStartDateTime`, `newEndDateTime` | Reschedule + update Google Calendar event. |
| `/api/meetings/[id]/status` | PATCH | yes | `status` | Update meeting status only. |
| `/api/meetings/[id]/approve` | POST | yes | none | Per-meeting approval (alt to `/meetings/approve`). |
| `/api/meetings/detect-intent` | POST | yes | `text` (req), `leadId?`, `sourceType?`, `sourceId?` | Detect meeting-booking intent in a chat/email snippet. |
| `/api/meetings/suggest-slots` | POST | yes | `leadId?`, `durationMinutes?` | AI-suggest meeting slots based on calendar availability. |
| `/api/meetings/check-availability` | POST | yes | `startDateTime`, `endDateTime` | Check Google Calendar free/busy for a window. |
| `/api/meetings/approve` | POST | yes | `meetingId` (req) | Approve a `pending_approval` meeting → `scheduled`. |
| `/api/meetings/stats` | GET | yes | query: startDate, endDate | Meeting analytics (count, duration, by-status). |
| `/api/meetings/settings` | GET / PUT | yes | meeting defaults | Read/update meeting defaults (timezone, default duration, etc.). |
| `/api/meetings/reminders` | GET / POST | yes | `meetingId`, `remindAt`, `channel` (POST) | List/schedule meeting reminders. |
| `/api/meetings/reminders/process` | POST | cron-secret | none | Cron-invoked: send due meeting reminders. |
| `/api/meetings/pending-approvals` | GET | yes | none | List meetings awaiting user approval. |
| `/api/calendar/connect` | POST | yes | none | Generate Google Calendar OAuth URL; return `{ authUrl, message }`. |
| `/api/calendar/callback` | GET | no | query: `code`, `state` | Google Calendar OAuth callback — stores `GoogleCalendarToken`. |
| `/api/calendar/disconnect` | POST | yes | none | Revoke Google Calendar tokens. |
| `/api/calendar/events` | GET | yes | none | List upcoming Google Calendar events. |
| `/api/calendar/events` | POST | yes | `summary` (req), `description?`, `startDateTime` (req), `endDateTime` (req), `attendees?`, `leadId?`, `dealId?`, `timezone?` | Create Google Calendar event with auto-generated Meet link. |
| `/api/calendar/events/[id]` | GET / PUT / DELETE | yes | subset of create-body | CRUD on a single Calendar event. |
| `/api/calendar/watch` | POST | yes | none | Subscribe to Google Calendar push notifications. |
| `/api/calendar/watch/stop` | POST | yes | none | Stop push-notification subscription. |
| `/api/calendar/webhook` | POST | webhook | Google webhook payload | Receive Google Calendar push notifications (always 200). |
| `/api/calendar/intelligence` | GET | yes | query: startDate, endDate | AI-calendar intelligence summary (busy patterns, focus time). |
| `/api/calendar/ai-book` | POST | yes | `leadId` (req), `meetingType` (req), `durationMinutes` (req), `preferredTimeRange?`, `customInstructions?` | AI picks optimal slot and auto-creates the Google Calendar event. |
| `/api/calendar/availability` | GET | yes | query: startDate, endDate | Return user's available time slots. |
| `/api/calendar/reminders` | GET / POST | yes | `eventId`, `remindAt` (POST) | List/create calendar-event reminders. |
| `/api/calendar/[eventId]` | GET / DELETE | yes | none | Fetch/delete a single Calendar event. |

---

## 9. Payments & Billing — `/api/payments/*`, `/api/billing/*`, `/api/subscriptions/*`, `/api/credits/*`, `/api/entitlements/*`

### Response shapes (canonical)

`POST /api/payments/create-stripe-session` → 200:
```json
{
  "orderId": "uuid", "sessionId": "cs_test_...", "url": "https://checkout.stripe.com/...",
  "amount": 29, "currency": "USD", "subtotal": 29, "discountAmount": 0, "taxAmount": 0, "gstRate": 0,
  "plan": "pro", "billingCycle": "monthly", "creditsAllocated": 500
}
```

`GET /api/subscriptions/current` → 200:
```json
{
  "subscription": { "id": "uuid", "plan": "pro", "status": "active", "currentPeriodStart": "ISO", "currentPeriodEnd": "ISO", "cancelAtPeriodEnd": false, "scheduledPlanChange": null, "billingCycle": "monthly", "creditsTotal": 500, "creditsUsed": 12, "creditsRemaining": 488, "creditsResetAt": "ISO" },
  "planDetails": { /* full plan config */ },
  "trialInfo": { "isTrial": false, ... },
  "creditBalance": { "total": 488, "monthly": 500, "rollover": 0, "addons": 0, "plan": "pro", "percentage": 97 }
}
```

`GET /api/credits` → 200:
```json
{ "credits": 488, "creditsMonthly": 500, "rolloverCredits": 0, "addonCredits": 0, "plan": "pro", "creditWarning": "ok", "percentage": 97, "creditActionEntitlements": { "lead_discovery": { "cost": 2, "enabled": true, "limit": null }, ... } }
```

`POST /api/credits` → 200:
```json
{ "success": true, "credits": 486, "deducted": 2, "action": "lead_discovery", "alreadyProcessed": false, "ledgerEntryId": "uuid", "creditWarning": "ok", "percentage": 97 }
```

`POST /api/subscriptions/upgrade-preview` → 200: full preview with pricing breakdown, GST, coupon, credits, feature diff.

`GET /api/entitlements` → 200:
```json
{ "plan": "free", "entitlements": { /* feature map */ }, "enabledFeatures": [...], "disabledFeatures": [...], "upgradeHints": { ... }, "credits": { /* balance */ } }
```

### Routes — Payments

| Route path | Method | Auth | Request body fields | What it does |
|---|---|---|---|---|
| `/api/payments/create-stripe-session` | POST | yes | `plan` (`pro`/`elite`), `billingCycle` (`monthly`/`yearly`), `couponCode?`, `successUrl?`, `cancelUrl?` | Create a Stripe Checkout session. |
| `/api/payments/create-order` | POST | yes | `plan`, `billingCycle`, `provider?` (`stripe`/`razorpay`), `couponCode?` | Create a PaymentOrder row (provider-agnostic). |
| `/api/payments/confirm` | POST | yes | `orderId`, `providerPaymentId` | Confirm a payment (mark PaymentOrder completed; activate subscription). |
| `/api/payments/verify` | POST | yes | `razorpayOrderId`, `razorpayPaymentId`, `razorpaySignature` | Verify Razorpay payment signature. |
| `/api/payments/webhook/stripe` | POST | webhook | Stripe event payload (sig in `Stripe-Signature` header) | Idempotent Stripe webhook handler. |
| `/api/payments/webhook/razorpay` | POST | webhook | Razorpay event payload (sig in `X-Razorpay-Signature` header) | Razorpay webhook handler. |
| `/api/payments/refund` | POST | yes | `orderId`, `amount?`, `reason` | User-initiated refund (full or partial). |
| `/api/payments/retry` | POST | yes | `orderId` | Retry a failed payment. |
| `/api/payments/cancel` | POST | yes | `orderId` or `subscriptionId` | Cancel pending payment or active subscription. |
| `/api/payments/status` | GET | yes | none | Return current user's payment recovery status overview. |
| `/api/payments/history` | GET | yes | query: page, limit | Paginated list of user's PaymentOrders. |
| `/api/payments/invoices` | GET | yes | query: page, limit | List user's invoices. |
| `/api/payments/invoices/[id]` | GET | yes | none | Fetch one invoice (metadata + line items). |
| `/api/payments/invoices/[id]/download` | GET | yes | none | Download invoice PDF (streamed). |
| `/api/payments/invoices/generate` | POST | yes | `orderId` | Generate an invoice PDF for an order. |
| `/api/payments/invoices/resend-email` | POST | yes | `invoiceId` | Re-send the invoice email. |
| `/api/payments/invoice/[id]` | GET | yes | none | Alias for invoice fetch. |
| `/api/payments/credit-addons` | GET / POST | yes | `package` (POST) | List / purchase credit-addon packs. |
| `/api/payments/stripe-portal` | POST | yes | none | Get Stripe Customer Portal URL (manage subscription). |
| `/api/payments/stripe-success` | GET | yes | query: `session_id` | Stripe success-page handler (verifies session + activates). |
| `/api/payments/validate-coupon` | POST | yes | `code`, `baseAmount`, `plan` | Validate a coupon code; return discount details. |
| `/api/payments/process-billing` | POST | yes | `orderId`, `providerPaymentId` | Process a billing event (atomic subscription + credit update). |
| `/api/payments/preview` | POST | yes | `plan`, `billingCycle`, `couponCode?`, `currency?` | Preview billing (no charge). Same shape as `/subscriptions/upgrade-preview`. |
| `/api/payments/sse` | GET | yes | none | SSE stream of payment status updates for the current user. |
| `/api/payments/confirm-payment` | POST | yes | `sessionId` | Client-initiated payment confirmation fallback (used when webhooks fail). Verifies session via Stripe API, activates subscription, generates PDF, sends invoice email. |
| `/api/payments/verify-session` | POST | yes | `sessionId` | Verify a Stripe session status without activating. |
| `/api/payments/webhook-replay` | POST | admin | `webhookId` | Replay a previously-processed webhook (admin only). |
| `/api/payments/provider-status` | GET | yes | none | Return whether Stripe/Razorpay are configured. |

### Routes — Billing

| Route path | Method | Auth | Request body fields | What it does |
|---|---|---|---|---|
| `/api/billing/invoices/[invoiceId]/download` | GET | yes | none | Download an invoice PDF (billing view). |
| `/api/billing/recovery` | GET | yes | none | Return payment-recovery workflow state for the user. |
| `/api/billing/analytics` | GET | yes | query: startDate, endDate | User's billing analytics (revenue, MRR, churn). |
| `/api/billing/history` | GET | yes | query: page, limit | User's billing history (subscription + payment events). |

### Routes — Subscriptions

| Route path | Method | Auth | Request body fields | What it does |
|---|---|---|---|---|
| `/api/subscriptions/current` | GET | yes | none | Full subscription + trial + credit-balance snapshot. |
| `/api/subscriptions/entitlements` | GET | yes | none | Plan-level entitlements + disabled features + plan level. |
| `/api/subscriptions/usage` | GET | yes | none | Current period usage vs plan limits. |
| `/api/subscriptions/trial` | GET | yes | none | Return trial status (active/expired/used + days remaining). |
| `/api/subscriptions/cancel` | POST | yes | `immediate?` (default false) | Cancel subscription (at period end or immediately). |
| `/api/subscriptions/upgrade-preview` | POST | yes | `plan`, `billingCycle`, `couponCode?`, `currency?` | Preview upgrade pricing & credit adjustment. |
| `/api/subscriptions/downgrade-preview` | POST | yes | `plan` | Preview downgrade (effective at period end). |
| `/api/subscriptions/check-eligibility` | GET | yes | query: targetPlan | Is user eligible to switch to targetPlan? |

### Routes — Credits

| Route path | Method | Auth | Request body fields | What it does |
|---|---|---|---|---|
| `/api/credits` | GET | permission: `billing:read` | none | Detailed credit balance + per-action entitlements. |
| `/api/credits` | POST | permission: `billing:write` | `action`, `idempotencyKey?`, `referenceId?` | Atomic, idempotent credit deduction with audit log. |
| `/api/credits/history` | GET | permission: `billing:read` | query: page, limit, action, startDate, endDate | Paginated credit ledger. |

### Routes — Entitlements

| Route path | Method | Auth | Request body fields | What it does |
|---|---|---|---|---|
| `/api/entitlements` | GET | yes | none | Plan + entitlements + enabled/disabled features + upgrade hints + credits. |
| `/api/entitlements/quota` | GET | yes | query: feature | Return current quota + used for a specific feature. |
| `/api/entitlements/check-credits` | GET | yes | query: amount | Return whether the user has `amount` credits available. |

---

## 10. AI Features — `/api/ai/*`

### Response shapes (canonical)

`POST /api/ai/chat` (action=start_session) → 200:
```json
{ "success": true, "session": { "id": "uuid", "userId": "...", "leadId": "...", "salesCoachMode": false, "createdAt": "ISO" } }
```
`POST /api/ai/chat` (action=send_message) → 200:
```json
{ "success": true, "message": { "role": "assistant", "content": "..." }, "creditsDeducted": 1, "newBalance": 487, "meetingIntent": null }
```
`POST /api/ai/outreach/generate` → 200:
```json
{ "success": true, "message": { "subject": "...", "body": "..." }, "creditsDeducted": 2, "newBalance": 485 }
```
`POST /api/ai/analyze` → 200: free-form analysis JSON returned by the LLM.

### Routes

| Route path | Method | Auth | Request body fields | What it does |
|---|---|---|---|---|
| `/api/ai/chat` | POST | yes | `action` (`start_session`/`send_message`/`end_session`), `leadId?`, `salesCoachMode?`, `currentPage?`, `sessionId?`, `message?` | Non-streaming chat. |
| `/api/ai/chat` | GET | yes | query: action (`messages`? else default), sessionId | List sessions OR messages for a session. |
| `/api/ai/chat/stream` | POST | yes | `sessionId`, `message` | SSE-streaming chat completion. |
| `/api/ai/chat/cancel` | POST | yes | `sessionId` | Cancel an in-flight streamed completion. |
| `/api/ai/analyze` | POST | yes | `prompt` or `leadId` + `aspect` | Free-form AI analysis. |
| `/api/ai/score` | POST | yes | `leadId` | Re-score a lead's 4 dimensions via LLM. |
| `/api/ai/outreach/generate` | POST | yes | `leadId` (req), `channel` (req, one of: email, whatsapp, telegram, linkedin, instagram), `tone?` (professional/casual/urgent/friendly/formal), `language?`, `customInstructions?`, `previousMessageId?` | Generate personalized outreach message. |
| `/api/ai/prompts` | GET / POST / PUT / DELETE | yes | `name`, `content`, `variables?` | CRUD on user's saved prompt templates. |
| `/api/ai/costs` | GET | yes | query: startDate, endDate | Aggregate AI cost (USD spent on tokens) by day. |
| `/api/ai/usage` | GET | yes | query: startDate, endDate, action? | AI token-usage analytics. |
| `/api/ai/rag/ingest` | POST | yes | `text`, `metadata?` | Ingest text into the user's RAG vector store. |
| `/api/ai/rag/ingest-url` | POST | yes | `url`, `metadata?` | Fetch URL content + ingest. |
| `/api/ai/rag/ingest-csv` | POST | yes | multipart/form-data: `file` | Bulk-ingest CSV rows. |
| `/api/ai/rag/context` | POST | yes | `query`, `topK?` | Retrieve top-K context chunks for a query. |
| `/api/ai/vector-search` | POST | yes | `query`, `topK?` | Pure vector search (no LLM call). |
| `/api/ai/analysis/[leadId]` | GET | yes | none | Fetch the latest stored AI analysis for a lead. |

---

## 11. Notifications & Realtime — `/api/notifications/*`, `/api/realtime/*`, `/api/events/*`, `/api/ws`

### Response shapes

`GET /api/notifications` → 200:
```json
{ "notifications": [{ "id": "uuid", "type": "system", "title": "...", "message": "...", "read": false, "actionUrl": "/...", "createdAt": "ISO" }], "unreadCount": 3 }
```
`PATCH /api/notifications` (markAllRead) → 200: `{ "success": true, "markedAll": true }`

### Routes

| Route path | Method | Auth | Request body fields | What it does |
|---|---|---|---|---|
| `/api/notifications` | GET | yes | query: limit, unreadOnly | List user's notifications. |
| `/api/notifications` | PATCH | yes | `ids?: string[]` or `markAllRead: boolean` | Mark notifications as read. |
| `/api/notifications/mark-read` | POST | yes | `ids?: string[]` or `markAllRead: boolean` | Same as PATCH (POST alias). |
| `/api/notifications/read` | POST | yes | `ids?: string[]` or `markAllRead: boolean` | Same as PATCH (POST alias). |
| `/api/notifications/archive` | POST | yes | `ids?: string[]` or `archiveAll: boolean` | Archive notifications. |
| `/api/notifications/push/subscribe` | POST | yes | `subscription` (Web Push subscription JSON) | Register browser for Web Push notifications. |
| `/api/notifications/push/vapid-keys` | GET | yes | none | Return public VAPID key for browser subscription. |
| `/api/notifications/[id]` | GET / PATCH / DELETE | yes | `read?`, `archived?` (PATCH) | CRUD on a single notification. |
| `/api/notifications/[id]/read` | POST | yes | none | Mark a single notification as read. |
| `/api/realtime/status` | GET | yes | none | Return WebSocket connection status + last message id. |
| `/api/realtime/recover` | POST | yes | `lastEventId?` | Recover missed realtime events since `lastEventId`. |
| `/api/events/workflows` | GET / POST | yes | query (GET): since, type | Workflow-event stream (also accepts POST for ingestion). |
| `/api/events/ai` | GET / POST | yes | same pattern | AI-event stream. |
| `/api/events/messages` | GET / POST | yes | same pattern | Message-event stream. |
| `/api/events/notifications` | GET / POST | yes | same pattern | Notification-event stream. |
| `/api/events/analytics` | GET / POST | yes | same pattern | Analytics-event stream. |
| `/api/events/payments` | GET / POST | yes | same pattern | Payment-event stream. |
| `/api/ws` | GET | yes | none | WebSocket upgrade endpoint (Next.js route exists for protocol negotiation; real socket handled by socket.io server in some deployments). |

---

## 12. Workflows — `/api/workflows/*`

| Route path | Method | Auth | Request body fields | What it does |
|---|---|---|---|---|
| `/api/workflows` | GET | dual: `pipeline:read` | query: status, triggerType, search, page, limit | List user's workflows. |
| `/api/workflows` | POST | dual: `pipeline:write` | `name`, `description?`, `triggerType`, `triggerConfig?`, `nodes?`, `edges?`, `steps?`, `status?` | Create workflow. Entitlement-checked: `workflow_access`. |
| `/api/workflows/[id]` | GET / PUT / DELETE | dual: `pipeline:read`/`pipeline:write` | subset of create-body | CRUD on a workflow definition. |
| `/api/workflows/[id]/execute` | POST | dual: `pipeline:write` | `input?` | Trigger one workflow run. |
| `/api/workflows/[id]/duplicate` | POST | dual: `pipeline:write` | none | Clone a workflow. |
| `/api/workflows/[id]/pause` | POST | dual: `pipeline:write` | none | Pause all running executions of this workflow. |
| `/api/workflows/[id]/cancel` | POST | dual: `pipeline:write` | none | Cancel all running executions. |
| `/api/workflows/[id]/resume` | POST | dual: `pipeline:write` | none | Resume a paused workflow. |
| `/api/workflows/validate` | POST | dual: `pipeline:read` | `nodes`, `edges`, `steps` | Validate workflow graph (no save). |
| `/api/workflows/trigger` | POST | dual: `pipeline:write` | `workflowId`, `input?` | Trigger workflow by id (alias for `/[id]/execute`). |
| `/api/workflows/metrics` | GET | dual: `pipeline:read` | query: workflowId, startDate, endDate | Aggregate workflow metrics. |
| `/api/workflows/metrics/timeline` | GET | dual: `pipeline:read` | query: workflowId, period | Time-series of execution counts/durations. |
| `/api/workflows/templates` | GET | dual: `pipeline:read` | query: category | List built-in workflow templates. |
| `/api/workflows/templates` | POST | dual: `pipeline:write` | `name`, `definition` | Save a custom template. |
| `/api/workflows/logs` | GET | dual: `pipeline:read` | query: workflowId, executionId, level, page, limit | Query workflow execution logs. |
| `/api/workflows/dead-letter` | GET | dual: `pipeline:read` | query: page, limit | List dead-letter executions. |
| `/api/workflows/dead-letter/[executionId]` | POST | dual: `pipeline:write` | `action` (`retry`/`discard`) | Retry or discard a dead-lettered execution. |
| `/api/workflows/executions` | GET | dual: `pipeline:read` | query: workflowId, status, page, limit | List workflow executions. |
| `/api/workflows/executions/[executionId]` | GET | dual: `pipeline:read` | none | Fetch a single execution with state. |
| `/api/workflows/executions/[executionId]/replay` | POST | dual: `pipeline:write` | none | Re-execute from the beginning (new execution id). |
| `/api/workflows/executions/[executionId]/retry` | POST | dual: `pipeline:write` | `fromStepId?` | Retry from a specific step. |
| `/api/workflows/executions/[executionId]/pause` | POST | dual: `pipeline:write` | none | Pause execution. |
| `/api/workflows/executions/[executionId]/cancel` | POST | dual: `pipeline:write` | none | Cancel execution. |
| `/api/workflows/executions/[executionId]/resume` | POST | dual: `pipeline:write` | none | Resume execution. |
| `/api/workflows/executions/[executionId]/logs` | GET | dual: `pipeline:read` | query: page, limit, level | Per-execution log stream. |
| `/api/workflows/webhook/[id]` | POST | webhook | arbitrary JSON | Trigger a webhook-type workflow by id (signature verified in service). |
| `/api/workflows/webhook/[...path]` | POST | webhook | arbitrary JSON | Trigger by path (catch-all for custom webhook URLs). |

---

## 13. Dashboard & Analytics — `/api/dashboard/*`, `/api/analytics/*`, `/api/metrics/*`

All `/api/dashboard/*` routes are `GET` with `yes` (cookie session) auth and accept query params (`startDate`, `endDate`, `period`, etc.). They return `{ data: ... }` or raw aggregation objects. All `/api/analytics/*` routes are also `GET` with `yes` auth.

### Dashboard routes (40+)

| Route path | Method | Auth | What it returns |
|---|---|---|---|
| `/api/dashboard/revenue-waterfall` | GET | yes | Quarterly revenue waterfall (starting + new business + expansion − churn). |
| `/api/dashboard/tasks` | GET | yes | User's tasks (due today, overdue, completed). |
| `/api/dashboard/credit-usage` | GET | yes | Credit-usage breakdown by action with sparkline data. |
| `/api/dashboard/integration-health` | GET | yes | Status of Gmail, Calendar, WhatsApp, Telegram integrations. |
| `/api/dashboard/email-templates` | GET | yes | List saved email templates with usage counts. |
| `/api/dashboard/engagement-scores` | GET | yes | Lead engagement scores over time. |
| `/api/dashboard/email-performance` | GET | yes | Sent/delivered/opened/clicked/replied rates by period. |
| `/api/dashboard/meetings` | GET | yes | Meeting stats (count, duration, by-status). |
| `/api/dashboard/goals` | GET | yes | Sales goal progress vs target. |
| `/api/dashboard/competitors` | GET | yes | Competitor threat overview. |
| `/api/dashboard/territory-map` | GET | yes | Geographic distribution of leads. |
| `/api/dashboard/compliance-security` | GET | yes | GDPR / audit / security-posture summary. |
| `/api/dashboard/client-onboarding` | GET | yes | New-client onboarding progress. |
| `/api/dashboard/whatsapp` | GET | yes | WhatsApp integration usage stats. |
| `/api/dashboard/account-growth` | GET | yes | Account-growth (new leads/customers) time-series. |
| `/api/dashboard/lead-activities` | GET | yes | Recent lead activities feed. |
| `/api/dashboard/contacts` | GET | yes | Contact list (lead + person-level). |
| `/api/dashboard/pipeline-health` | GET | yes | Pipeline health (stale leads, conversion rates by stage). |
| `/api/dashboard/data-quality` | GET | yes | Lead data-quality scores (missing fields, duplicates). |
| `/api/dashboard/budget` | GET | yes | Sales budget vs actuals. |
| `/api/dashboard/funnel-velocity` | GET | yes | Time-to-advance by stage. |
| `/api/dashboard/churn-risk` | GET | yes | Churn-risk scores per active customer. |
| `/api/dashboard/exports` | GET | yes | List of user's data exports. |
| `/api/dashboard/settings` | GET | yes | Dashboard widget configuration. |
| `/api/dashboard/pipeline-forecast` | GET | yes | AI pipeline forecast (next-period close predictions). |
| `/api/dashboard/audit-logs` | GET | yes | User-scoped audit log (admin sees all). |
| `/api/dashboard/notifications` | GET | yes | Same as `/api/notifications` but dashboard-shaped. |
| `/api/dashboard/search` | GET | yes | Global search across leads, deals, meetings. |
| `/api/dashboard/automation-rules` | GET | yes | List user's automation rules. |
| `/api/dashboard/deal-pipeline` | GET | yes | Deal funnel by stage. |
| `/api/dashboard/team-leaderboard` | GET | yes | Sales-team leaderboard (revenue, meetings, outreach). |
| `/api/dashboard/telegram` | GET | yes | Telegram integration usage. |
| `/api/dashboard/team-workload` | GET | yes | Per-team-member workload distribution. |
| `/api/dashboard/lead-scoring` | GET | yes | Lead-scoring model stats (distribution, top scores). |
| `/api/dashboard/messaging` | GET | yes | Cross-channel messaging stats (email + WhatsApp + Telegram). |
| `/api/dashboard/custom-alerts` | GET | yes | User's custom alert definitions. |
| `/api/dashboard/performance-benchmark` | GET | yes | User's metrics vs industry benchmark. |
| `/api/dashboard/document-collaboration` | GET | yes | Shared-document activity feed. |
| `/api/dashboard/weekly-digest` | GET | yes | Weekly-digest summary (also emailed). |
| `/api/dashboard/workflow-analytics` | GET | yes | Workflow success/failure/run-rate. |
| `/api/dashboard/executive-summary` | GET | yes | One-page executive summary (revenue, pipeline, activities). |
| `/api/dashboard/deal-risk` | GET | yes | At-risk deals (slipped close dates, low engagement). |
| `/api/dashboard/lead-sources` | GET | yes | Leads by source channel. |
| `/api/dashboard/campaigns` | GET | yes | Outreach campaign performance. |
| `/api/dashboard/activities` | GET | yes | Activity timeline. |
| `/api/dashboard/deals-performance` | GET | yes | Deal win/loss + revenue by period. |
| `/api/dashboard/ai-copilot` | GET | yes | AI copilot usage stats. |
| `/api/dashboard/sales-playbook` | GET | yes | AI-generated sales-playbook content. |
| `/api/dashboard/market-analysis` | GET | yes | Market analysis by niche. |
| `/api/dashboard/revenue-forecast` | GET | yes | Revenue forecast (next 30/90/365 days). |

### Analytics routes

| Route path | Method | Auth | What it returns |
|---|---|---|---|
| `/api/analytics` | GET | yes | Top-level dashboard metrics. Query: `dashboard` (executive/sales/ai/ops), `period` (7d/30d/90d/1y), `start?`, `end?`. |
| `/api/analytics/leads` | GET | yes | Lead-only analytics (source, niche, geography). |
| `/api/analytics/workflows` | GET | yes | Workflow execution analytics. |
| `/api/analytics/ai` | GET | yes | AI token-usage + cost analytics. |
| `/api/analytics/billing` | GET | yes | Billing/subscription analytics. |
| `/api/analytics/predictions` | GET | yes | AI prediction list. |
| `/api/analytics/predictions/[id]` | GET | yes | Single prediction detail. |
| `/api/analytics/benchmarks` | GET | yes | Industry benchmarks. |
| `/api/analytics/anomalies` | GET | yes | Detected anomalies (metric, severity, timestamp). |
| `/api/analytics/anomalies/[id]` | GET / DELETE | yes | Read/ack a single anomaly. |
| `/api/analytics/insights` | GET | yes | AI-generated insight list. |
| `/api/analytics/insights/[id]` | GET / DELETE | yes | Read/dismiss a single insight. |
| `/api/analytics/share` | POST | yes | `dashboard`, `period`, `recipientEmails?` | Create a shareable analytics link. |
| `/api/analytics/share/[token]` | GET | no | none | Public shared-analytics view (no auth required). |
| `/api/analytics/formulas` | GET / POST | yes | `name`, `expression`, `variables?` (POST) | List/create custom analytics formulas. |
| `/api/analytics/formulas/[id]` | GET / PUT / DELETE | yes | subset | CRUD on a custom formula. |

### Metrics routes

| Route path | Method | Auth | What it returns |
|---|---|---|---|
| `/api/metrics` | GET | yes | App metrics (Prometheus-style). |
| `/api/metrics/dashboard` | GET | yes | Dashboard-friendly metrics view (latency, error rate, throughput). |

---

## 14. Integrations — `/api/integrations/*`

| Route path | Method | Auth | Request body fields | What it does |
|---|---|---|---|---|
| `/api/integrations/gmail` | GET | yes | none | Return Gmail connection status + labels + stats. |
| `/api/integrations/gmail` | POST | yes | `action` (`connect`/`disconnect`/`sync`/`update_settings`), `...settings` | Multi-action Gmail control (initiates OAuth, disconnects, syncs, updates). |
| `/api/integrations/gmail/connect` | GET | yes | none | Redirect to Google OAuth (integration scopes — Gmail + Calendar). |
| `/api/integrations/gmail/revoke` | POST | yes | none | Revoke Gmail integration. |
| `/api/integrations/whatsapp` | GET / POST | yes | `provider`, `phoneNumber`, `authToken`, ... | Read/update WhatsApp connection config. |
| `/api/integrations/whatsapp/send-otp` | POST | yes | `phoneNumber` | Send WhatsApp OTP to verify number. |
| `/api/integrations/whatsapp/verify-otp` | POST | yes | `phoneNumber`, `otp` | Verify WhatsApp OTP. |
| `/api/integrations/google/connect` | GET | yes | none | Redirect to Google OAuth for Gmail + Calendar integration. |
| `/api/integrations/google/callback` | GET | no | query: `code`, `state` | Google OAuth callback for integration flow. |
| `/api/integrations/google/disconnect` | POST | yes | none | Revoke Gmail + Calendar integration. |
| `/api/integrations/telegram` | GET / POST | yes | `botToken`, `webhookSecret` (POST) | Read/update Telegram connection config. |
| `/api/integrations/telegram/generate-code` | POST | yes | none | Generate a one-time linking code (user DMs the bot with it). |
| `/api/integrations/telegram/disconnect` | POST | yes | none | Disconnect Telegram bot. |

---

## 15. WhatsApp & Telegram — `/api/whatsapp/*`, `/api/telegram/*`

| Route path | Method | Auth | Request body fields | What it does |
|---|---|---|---|---|
| `/api/whatsapp/twilio/webhook` | POST | webhook | form-urlencoded Twilio payload | Twilio WhatsApp webhook. Validates `X-Twilio-Signature` with stored (decrypted) auth token. Always returns `<Response></Response>` XML. |
| `/api/whatsapp/twilio/connect` | POST | yes | `accountSid`, `authToken`, `phoneNumber` | Connect Twilio WhatsApp. |
| `/api/whatsapp/twilio/send` | POST | yes | `to`, `body`, `mediaUrl?` | Send WhatsApp message via Twilio. |
| `/api/whatsapp/meta/webhook` | GET | webhook | query: `hub.mode`, `hub.verify_token`, `hub.challenge` | Meta webhook verification (echo `hub.challenge`). |
| `/api/whatsapp/meta/webhook` | POST | webhook | Meta webhook JSON | Process Meta WhatsApp events. Verifies `X-Hub-Signature-256`. Always returns 200. |
| `/api/whatsapp/meta/connect` | POST | yes | `wabaId`, `phoneNumberId`, `accessToken`, `appSecret`, `verifyToken` | Connect Meta WhatsApp Business API. |
| `/api/whatsapp/meta/send` | POST | yes | `to`, `templateName?`, `body` | Send WhatsApp message via Meta. |
| `/api/telegram/webhook` | POST | webhook | Telegram Update payload (verified via `x-telegram-bot-api-secret-token` header) | Process Telegram bot updates. Always returns 200. |
| `/api/telegram/status` | GET | yes | none | Return Telegram bot connection status. |
| `/api/telegram/connect` | POST | yes | `botToken`, `webhookSecret` | Connect a Telegram bot. |
| `/api/telegram/send` | POST | yes | `chatId`, `text`, `parseMode?` | Send a Telegram message. |

---

## 16. Competitors — `/api/competitors/*`, `/api/competitor/*`

`POST /api/competitors` → 201: `{ "analysis": CompetitorAnalysis }`
`GET /api/competitors` → 200: `{ "data": [CompetitorAnalysis], "total": N, "page": 1, "limit": 20 }`

| Route path | Method | Auth | Request body fields | What it does |
|---|---|---|---|---|
| `/api/competitors` | GET | yes | query: page, limit, threatLevel | List competitors (paginated). |
| `/api/competitors` | POST | yes | `name` (req), `url` (req), `leadId?` | Add a competitor + initial analysis. |
| `/api/competitors/analyze` | POST | yes | `competitorId` or `url` | Re-run AI analysis on a competitor. |
| `/api/competitors/discover` | POST | yes | `niche`, `country?` | Discover competitors in a niche. |
| `/api/competitors/[id]` | GET / PUT / DELETE | yes | subset of fields | CRUD on a competitor. |
| `/api/competitors/[id]/website` | GET | yes | none | Return website snapshot + score. |
| `/api/competitors/[id]/snapshots` | GET | yes | query: limit | List historical snapshots. |
| `/api/competitors/[id]/seo` | GET | yes | none | SEO metrics (keywords, backlinks, DA). |
| `/api/competitors/[id]/opportunities` | GET | yes | none | List identified opportunities (gaps to exploit). |
| `/api/competitors/[id]/pricing` | GET | yes | none | Pricing page scrape results. |
| `/api/competitors/[id]/insights` | GET | yes | none | AI-generated strategic insights. |
| `/api/competitors/[id]/reviews` | GET | yes | none | Reviews aggregator (Google, Yelp, Trustpilot). |
| `/api/competitors/[id]/social` | GET | yes | none | Social-media presence + engagement. |
| `/api/competitors/[id]/compare` | POST | yes | `otherCompetitorId` | Side-by-side comparison. |
| `/api/competitor` | GET | yes | query: niche | Legacy alias for listing competitors by niche. |
| `/api/competitor/[id]` | GET | yes | none | Legacy alias for fetch single competitor. |

---

## 17. Admin — `/api/admin/*`

All routes in this group require `admin` role (`withAdmin` middleware → 403 if not admin).

`GET /api/admin/feedback` → 200:
```json
{ "feedback": [{ "id": "uuid", "ticketNumber": "FB-2024-123456", "type": "bug", "title": "...", "severity": "high", "priority": "medium", "status": "new", "assignedTo": null, "aiSeverity": "high", "aiModule": "auth", "aiDuplicateScore": 0.12, "tags": [], "labels": [], "pageUrl": "...", "browserName": "Chrome", "osName": "macOS", "createdAt": "ISO", "updatedAt": "ISO", "resolvedAt": null, "user": { ... }, "commentCount": 0, "attachmentCount": 0 }], "pagination": { "page": 1, "limit": 20, "total": 42, "totalPages": 3 } }
```

`POST /api/admin/refund` → 200:
```json
{ "success": true, "refundId": "re_...", "refundAmount": 29, "currency": "USD", "isFullRefund": true, "orderId": "uuid" }
```

| Route path | Method | Auth | Request body fields | What it does |
|---|---|---|---|---|
| `/api/admin/backup` | GET | admin | query: type, page, limit | List backups (DB records + filesystem scan). |
| `/api/admin/backup` | POST | admin | `type` (`full`/`sqlite`/`postgres`/`snapshot`), `note?` | Trigger an async backup; returns 202 with backup record id. |
| `/api/admin/backup/[id]` | GET / DELETE | admin | none | Read/delete a backup record (DELETE also removes file). |
| `/api/admin/feedback` | GET | admin | query: status, type, severity, priority, assignedTo, search, page, limit, sortBy | List feedback reports (admin view, with AI triage fields). |
| `/api/admin/feedback/analytics` | GET | admin | query: startDate, endDate | Feedback analytics (by status, severity, type, time). |
| `/api/admin/feedback/crashes` | GET | admin | query: page, limit | List crash reports (with frequency + threshold alerts). |
| `/api/admin/feedback/[id]` | GET / PATCH | admin | `status?`, `priority?`, `assignedTo?`, `severity?` (PATCH) | Read/update a feedback ticket. |
| `/api/admin/feedback/[id]/comment` | POST | admin | `body` | Add an admin comment to a feedback ticket. |
| `/api/admin/refund` | POST | admin | `userId`, `paymentIntentId`, `amount?`, `reason` | Issue Stripe refund (full or partial). Full refund downgrades user to free plan. |
| `/api/admin/billing` | GET | admin | query: action (`overview`/`webhooks`/`failed-payments`/`invoices`/`metrics`/`revenue`), provider, startDate, endDate, plan, period | Admin billing queries. |
| `/api/admin/billing/failed-payments` | GET | admin | query: provider, plan, startDate, endDate, limit, offset | List failed payments. |
| `/api/admin/billing/webhooks` | GET | admin | query: provider, startDate, endDate, limit, offset | Webhook monitoring (last N webhook events + statuses). |

---

## 18. Feedback — `/api/feedback/*`

`POST /api/feedback` → 200:
```json
{ "success": true, "ticketId": "uuid", "ticketNumber": "FB-2024-123456" }
```
`POST /api/feedback/crash` → 200: `{ "success": true, "crashId": "uuid" }` (always 200 to never break the crash reporter).

| Route path | Method | Auth | Request body fields | What it does |
|---|---|---|---|---|
| `/api/feedback` | POST | yes | `type`, `title`, `description`, `severity?`, `pageUrl?`, `previousPageUrl?`, `navigationHistory?`, `userAgent?`, `browserName?`, `browserVersion?`, `osName?`, `osVersion?`, `screenResolution?`, `timezone?`, `locale?`, `networkType?`, `appVersion?`, `sessionId?`, `lastApiRequests?`, `errorLogs?`, `stackTrace?`, `performanceData?`, `attachments?`, `reproSteps?`, `expectedBehavior?`, `actualBehavior?` | Submit a feedback report. Rate-limited 10/user/hour. AI triage runs async. |
| `/api/feedback` | GET | yes | none | List user's own feedback tickets. |
| `/api/feedback/crash` | POST | no | `message`, `stack?`, `userId?`, `componentName?`, `pageUrl?`, `userAgent?` | Auto crash-report (no auth — crashes can happen pre-auth). Rate-limited 50/IP/hr. Admins notified at 5/hr threshold. |
| `/api/feedback/[id]` | GET | yes | none | Fetch one of the user's own feedback tickets. |
| `/api/feedback/[id]/comment` | POST | yes | `body` | Add a comment to one's own ticket (user-side clarification). |

---

## 19. Cron Jobs — `/api/cron/*`

All routes in this group require `Authorization: Bearer <CRON_SECRET>` header (verified against env var). POST-only. Returns 401 if missing/invalid.

`POST /api/cron/credit-renewal` → 200:
```json
{ "success": true, "checked": 42, "expired": 3, "timestamp": "ISO" }
```
`POST /api/cron/sdr-cycle` → 200:
```json
{ "usersProcessed": 5, "results": [{ "userId": "uuid", "success": true, "cycleId": "uuid" }] }
```

| Route path | Method | Auth | What it does |
|---|---|---|---|
| `/api/cron/sdr-cycle` | POST | cron-secret | Run the full SDR cycle for every user with `meetingAutonomyMode` ∈ {`assisted`, `autonomous`}. |
| `/api/cron/hot-lead-scan` | POST | cron-secret | Scan all users for new hot leads; generate alerts. |
| `/api/cron/process-gmail-replies` | POST | cron-secret | Trigger Gmail reply processing for all connected users. |
| `/api/cron/credit-renewal` | POST | cron-secret | Process end-of-period subscription credit renewals (rollover + monthly reset). |
| `/api/cron/autonomous-outreach` | POST | cron-secret | Generate + dispatch autonomous outreach for all opted-in users. |
| `/api/cron/renew-subscriptions` | POST | cron-secret | Renew active subscriptions via Stripe / Razorpay. |
| `/api/cron/sequence-processing` | POST | cron-secret | Process due sequence steps across all users. |
| `/api/cron/expire-api-keys` | POST | cron-secret | Mark expired API keys as `expired` (status transition). |
| `/api/cron/end-of-period` | POST | cron-secret | End-of-period processing (subscription rollover + credits reset + invoicing). |
| `/api/cron/meeting-reminders` | POST | cron-secret | Send due meeting reminders. |
| `/api/cron/process-sequences` | POST | cron-secret | Alias / additional sequence-processing pass. |
| `/api/cron/payment-reconciliation` | POST | cron-secret | Reconcile Stripe/Razorpay webhooks with PaymentOrder records. |

---

## 20. GDPR & Compliance — `/api/gdpr/*`

`POST /api/gdpr/delete` (step=request) → 200:
```json
{ "message": "Deletion request created. Confirm within 24 hours to proceed.", "requestId": "uuid", "confirmationCode": "ABCD1234", "confirmBy": "ISO", "step": "confirm" }
```
`POST /api/gdpr/delete` (step=confirm) → 200:
```json
{ "message": "Account deletion completed. Personal data has been anonymized.", "requestId": "uuid", "retainedData": [...], "deletedData": [...] }
```

| Route path | Method | Auth | Request body fields | What it does |
|---|---|---|---|---|
| `/api/gdpr/delete` | POST | yes | `step` (`request`/`confirm`), `confirmationCode?` (for confirm) | Two-step account deletion (24h confirmation window). Anonymizes PII; retains financial records. |
| `/api/gdpr/export` | POST | yes | `format?` (json/csv) | Request full personal-data export (async; emailed link). |
| `/api/gdpr/consent` | GET / POST / PUT | yes | `consentType`, `granted` (POST/PUT) | Read/record consent state (marketing, analytics, etc.). |
| `/api/gdpr/dpa` | GET | yes | none | Return the Data Processing Agreement PDF/HTML. |
| `/api/gdpr/retention` | GET / PUT | admin (PUT), yes (GET) | `policy` (PUT) | Read/update data-retention policies. |
| `/api/gdpr/policies` | GET | no | none | Public privacy policy + terms (no auth). |

---

## 21. Audit — `/api/audit/*`

`GET /api/audit` → 200:
```json
{
  "logs": [{ "id": "uuid", "userId": "uuid", "userEmail": "...", "userName": "...", "userRole": "owner", "action": "lead_updated", "details": { ... }, "ipAddress": "...", "userAgent": "...", "resource": "lead", "resourceId": "uuid", "createdAt": "ISO" }],
  "pagination": { "page": 1, "limit": 50, "total": 1234, "hasMore": true, "totalPages": 25 },
  "filters": { "actions": [...], "resources": [...] }
}
```

| Route path | Method | Auth | Request body fields | What it does |
|---|---|---|---|---|
| `/api/audit` | GET | admin | query: userId, action, resource, resourceId, startDate, endDate, ipAddress, search, page, limit | Query audit logs (admin/owner only). |
| `/api/audit/export` | GET | admin | query: same as `/api/audit` | Stream audit log as CSV. |

---

## 22. Auth MFA — covered in Group 1

(MFA setup/verify/confirm/disable routes are documented under Group 1.)

---

## 23. Hot Leads — `/api/hot-leads/*`

`POST /api/hot-leads/detect` → 200:
```json
{ "success": true, "data": { "hotLeads": [{ "leadId": "uuid", "urgency": "critical", "reasons": [...] }], "count": 5, "criticalCount": 2, "alertsGenerated": 5 } }
```

| Route path | Method | Auth | Request body fields | What it does |
|---|---|---|---|---|
| `/api/hot-leads/detect` | POST | yes | `generateAlerts?` (boolean) | Run hot-lead detection; optionally create alert notifications. |
| `/api/hot-leads/feed` | GET | yes | query: since, limit | SSE stream of hot-lead alerts for the user. |

---

## 24. Autonomous SDR — `/api/autonomous/*`, `/api/autonomous-outreach/*`, `/api/sdr`, `/api/sales-assistant`

`POST /api/autonomous/research` → 200:
```json
{ "success": true, "research": { /* company research output */ } }
```
`POST /api/sdr` (action=execute_cycle) → 200:
```json
{ "success": true, "cycle": { /* SDR cycle result */ } }
```

| Route path | Method | Auth | Request body fields | What it does |
|---|---|---|---|---|
| `/api/sdr` | POST | yes | `action` (`execute_cycle`/`update_config`/`daily_summary`/`status`), `config?` (for update_config) | Execute SDR actions. |
| `/api/sdr` | GET | yes | none | Return SDR status (config, last cycle, next scheduled). |
| `/api/sales-assistant` | GET / POST | yes | `question` (POST) | Conversational sales assistant (LLM-powered). |
| `/api/autonomous/research` | POST | yes | `leadId` (req) | Deep research on a lead; 3-credit precheck. |
| `/api/autonomous/send-outreach` | POST | yes | `leadId` (req), `subject?`, `body?`, `tone?`, `channel?`, `autoGenerate?` | Generate (if `autoGenerate=true`) and send outreach via Gmail; auto-moves lead to `contacted` stage. |
| `/api/autonomous/pipeline/move` | POST | yes | `leadId`, `toStage`, `reason?` | Move lead in pipeline (autonomous mode). |
| `/api/autonomous/classify-reply` | POST | yes | `messageId` or `text` | AI-classify a reply (interested/objection/not_now/auto). |
| `/api/autonomous/campaign` | POST | yes | `name`, `leadIds?`, `niche?`, `prompt?` | Create an autonomous campaign. |
| `/api/autonomous/campaign/[campaignId]` | GET / DELETE | yes | none | Read/delete a campaign. |
| `/api/autonomous/campaign/parse` | POST | yes | `prompt` | Parse a free-text campaign spec into structured config. |
| `/api/autonomous/campaign/list` | GET | yes | query: status, page, limit | List user's campaigns. |
| `/api/autonomous-outreach/generate` | POST | yes | `leadId`, `channel` (one of: email, whatsapp, linkedin, instagram) | Generate outreach content (no send). |
| `/api/autonomous-outreach/dispatch` | POST | yes | `leadId`, `channel`, `content` | Dispatch pre-generated outreach. |

---

## 25. Messaging & Templates — `/api/messaging/*`, `/api/messages/*`, `/api/templates`

| Route path | Method | Auth | Request body fields | What it does |
|---|---|---|---|---|
| `/api/messaging/analytics` | GET | yes | query: channel, startDate, endDate | Cross-channel messaging analytics. |
| `/api/messaging/media/[id]` | GET | yes | none | Download a media attachment by id. |
| `/api/messaging/templates` | GET / POST | yes | `name`, `channel`, `subject?`, `body`, `variables?` (POST) | List/create messaging templates. |
| `/api/messaging/templates/[id]` | GET / PUT / DELETE | yes | subset | CRUD on a single template. |
| `/api/messaging/broadcasts` | GET / POST | yes | `name`, `templateId`, `audienceFilter` (POST) | List/create broadcasts. |
| `/api/messaging/broadcasts/[id]` | GET / DELETE | yes | none | Read/cancel a broadcast. |
| `/api/messages` | GET / POST | yes | `leadId`, `channel`, `body`, `subject?` (POST) | List/send messages (channel-agnostic). |
| `/api/messages/[id]` | GET / DELETE | yes | none | Read/delete a single message. |
| `/api/templates` | GET / POST | yes | `name`, `content`, `category?` (POST) | Generic template store (used by outreach + meeting prep). |

---

## 26. Reports — `/api/reports/*`

| Route path | Method | Auth | Request body fields | What it does |
|---|---|---|---|---|
| `/api/reports` | GET / POST | yes | `name`, `type`, `config?` (POST) | List/create saved reports. |
| `/api/reports/templates` | GET | yes | none | List built-in report templates. |
| `/api/reports/[id]` | GET / PUT / DELETE | yes | subset | CRUD on a saved report. |
| `/api/reports/[id]/execute` | POST | yes | `params?` | Execute a report synchronously; returns rows. |
| `/api/reports/[id]/schedule` | POST | yes | `cron`, `recipientEmails`, `format` | Schedule a recurring report. |
| `/api/reports/[id]/export` | GET | yes | query: format (csv/pdf/xlsx) | Download the most recent execution. |

---

## 27. Reply Intelligence — `/api/reply-intelligence/*`, `/api/reply-intel/*`, `/api/reply-handler`

| Route path | Method | Auth | Request body fields | What it does |
|---|---|---|---|---|
| `/api/reply-intelligence/analyze` | POST | yes | `messageId` or `text`, `leadId?` | AI-analyze reply (sentiment, buying signals, objections). |
| `/api/reply-intelligence/classify` | POST | yes | `messageId` or `text` | Classify reply (interested/not_now/objection/auto_reply/out_of_office). |
| `/api/reply-intelligence/analytics` | GET | yes | query: startDate, endDate | Reply-intelligence analytics (classification distribution). |
| `/api/reply-intelligence/buying-signals` | GET / POST | yes | `messageId` or `text` (POST) | Extract buying signals from replies. |
| `/api/reply-intel/process` | POST | yes | `messageId` | Process a single reply end-to-end (classify + lead-stage update + auto-respond). |
| `/api/reply-handler` | POST | yes | `messageId`, `action?` | Generic reply-handler dispatch. |

---

## 28. Insights & Reminders & Gap Analysis — `/api/insights`, `/api/reminders`, `/api/gap-analysis/*`

| Route path | Method | Auth | Request body fields | What it does |
|---|---|---|---|---|
| `/api/insights` | GET | yes | query: category, startDate, endDate | List AI-generated insights for the user. |
| `/api/reminders` | GET / POST / DELETE | yes | `leadId`, `remindAt`, `message` (POST) | List/create/delete user reminders. |
| `/api/gap-analysis` | GET | yes | query: niche, country | Niche gap analysis (no website / no SEO / no WhatsApp / no booking). |
| `/api/gap-analysis/remediation` | POST | yes | `leadId`, `gapType` | Generate remediation plan for a specific gap. |
| `/api/gap-analysis/score` | GET | yes | query: leadId or niche | Numeric gap score (0–100). |

---

## 29. Team & Org — `/api/team/*`

| Route path | Method | Auth | Request body fields | What it does |
|---|---|---|---|---|
| `/api/team` | GET / POST | yes | `name`, `description?` (POST) | List/create teams within the user's org. |
| `/api/team/[id]` | GET / PUT / DELETE | yes | subset | CRUD on a team. |
| `/api/team/invite/[token]` | GET / POST | no (GET), yes (POST) | none (GET), `accept: true` (POST) | Get invite details / accept invite. |
| `/api/team/invite/revoke/[id]` | POST | yes | none | Revoke a pending team invite. |

---

## 30. Company Research & Website Score — `/api/company-research`, `/api/website-score`

| Route path | Method | Auth | Request body fields | What it does |
|---|---|---|---|---|
| `/api/company-research` | POST | yes | `leadId` or `url` + `name` | Run deep company research; return structured findings. |
| `/api/website-score` | POST | yes | `url`, `businessName?`, `niche?` | Score a website (SEO, performance, mobile, content, conversion). |

---

## 31. Chat Sessions — `/api/chat-sessions`

| Route path | Method | Auth | Request body fields | What it does |
|---|---|---|---|---|
| `/api/chat-sessions` | GET / POST / DELETE | yes | `leadId?`, `title?` (POST) | List/create/delete AI chat sessions (lightweight wrapper over `AiChatSession`). |

---

## 32. Health — `/api/health`, `/api/health/detailed`, `/api/health/database`, `/api/sentry`

`GET /api/health` → 200:
```json
{
  "status": "healthy" | "degraded" | "down",
  "timestamp": "ISO",
  "version": "2.0.0",
  "uptime": 12345,
  "checks": { "database": { "status": "healthy", "responseTime": 12 }, "memory": { "status": "healthy", "used": "120MB", "total": "256MB" }, "errors": { "status": "healthy", "recentCount": 0, "criticalCount": 0 } },
  "latencyMs": 15
}
```

| Route path | Method | Auth | What it does |
|---|---|---|---|
| `/api/health` | GET | no | Fast health check for load balancers (DB + memory + error counts). |
| `/api/health/detailed` | GET | no | Full component-level health (DB, memory, env vars, SMTP, integrations). |
| `/api/health/database` | GET | no | DB-only health check (latency + connection pool status). |
| `/api/sentry` | POST | no | Sentry tunnel endpoint (proxies client-side Sentry envelopes to avoid CORS / ad blockers). |

---

## 33. Export — `/api/export`, `/api/export/preview`

| Route path | Method | Auth | Request body fields | What it does |
|---|---|---|---|---|
| `/api/export` | POST | yes | `type` (`leads`/`deals`/`meetings`/`messages`/`all`), `format?` (csv/json) | Create a data-export job (async; emailed link). |
| `/api/export/preview` | POST | yes | `type`, `limit?` | Return a small preview (first 10 rows) of an export. |

---

## 34. Root — `/api/route`

| Route path | Method | Auth | What it does |
|---|---|---|---|
| `/api` | GET | no | Returns service metadata (`{ service, version, description, endpoints: { auth, dashboard, crm, outreach, integrations } }`). Used by health-checkers + discovery. |

---

## Appendix A — RBAC Permission Matrix

| Role | Permissions granted |
|---|---|
| `super_admin` | All permissions including `admin:access`. |
| `owner` | All except `admin:access` is conditional (granted on own org). Practically all in the matrix. |
| `admin` | `leads:*`, `pipeline:*`, `discover:*`, `outreach:*`, `assistant:read`, `insights:read`, `deals:*`, `competitors:*`, `settings:*`, `billing:read`, `team:read`, `api:read` (no `admin:access`). |
| `member` | `leads:read+write`, `pipeline:read`, `discover:read`, `outreach:*`, `assistant:read`, `insights:read`, `deals:*`, `competitors:read`, `settings:read`. |
| `viewer` | `leads:read`, `pipeline:read`, `discover:read`, `assistant:read`, `insights:read`, `deals:read`, `competitors:read`, `settings:read` (read-only). |

Full permission list (23): `leads:read`, `leads:write`, `leads:delete`, `pipeline:read`, `pipeline:write`, `discover:read`, `discover:write`, `outreach:read`, `outreach:write`, `assistant:read`, `insights:read`, `deals:read`, `deals:write`, `competitors:read`, `competitors:write`, `settings:read`, `settings:write`, `billing:read`, `billing:write`, `team:read`, `team:write`, `api:read`, `api:write`, `admin:access`.

## Appendix B — API Key Scopes

Scopes are mapped to RBAC permissions in `src/lib/auth-middleware.ts`:

| Scope | Maps to permissions |
|---|---|
| `leads.read` | `leads:read` |
| `leads.write` | `leads:read`, `leads:write` |
| `workflows.read` | `pipeline:read` |
| `workflows.write` | `pipeline:read`, `pipeline:write` |
| `ai.read` | `assistant:read` |
| `ai.write` | `assistant:read`, `discover:write` |
| `billing.read` | `billing:read` |
| `analytics.read` | `insights:read` |
| `competitors.read` | `competitors:read` |
| `competitors.write` | `competitors:read`, `competitors:write` |
| `messages.read` | `outreach:read` |
| `messages.write` | `outreach:read`, `outreach:write` |
| `admin` | all permissions (superuser scope) |

## Appendix C — Common Header Conventions

- `Authorization: Bearer <JWT>` — alternate to cookie auth (used by API key auth + mobile clients).
- `Authorization: Bearer <CRON_SECRET>` — cron endpoints.
- `x-telegram-bot-api-secret-token` — Telegram webhook verification.
- `X-Twilio-Signature` — Twilio webhook verification.
- `X-Hub-Signature-256` — Meta webhook verification.
- `Stripe-Signature` — Stripe webhook verification.
- `x-forwarded-for`, `x-forwarded-host`, `x-forwarded-proto` — used by `getClientIp()` and `getAppUrl()` for proxies (Caddy, Aliyun FC).
- `Origin` / `Referer` — used for dynamic `redirect_uri` resolution in OAuth flows.

## Appendix D — Rate Limiting

Rate-limit groups enforced by `src/lib/security/rate-limiter.ts`:

| Group | Limit | Applies to |
|---|---|---|
| `auth` | 5/min/IP | `/api/auth/signin`, `/api/auth/signup`, `/api/auth/otp/*`, `/api/auth/magic-link/*`, `/api/auth/forgot-password`, `/api/auth/reset-password`, `/api/auth/google`, `/api/auth/google/state` |
| `mfa` | 5/min/IP | `/api/auth/mfa/verify` |
| `feedback` | 10/user/hour | `/api/feedback` (POST) |
| `crash` | 50/IP/hour | `/api/feedback/crash` |

## Appendix E — OpenAPI / Postman

A machine-readable OpenAPI schema is **not** auto-generated. The fastest path to a Postman collection is to import the route tables above as a CSV. The route paths in this document are 1:1 with `src/app/api/.../route.ts` file paths.
