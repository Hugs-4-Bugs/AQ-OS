# Google Cloud Console Setup Guide

Complete setup for everything Google in AcquisitionOS: **sign-in OAuth**, **Gmail sending**, **Google Custom Search (lead discovery)**, and the integration scopes for Calendar/Gmail. All redirect paths below match the actual code (`/api/auth/google/state`, `/api/auth/callback/google`, `/api/calendar/*`, `/api/gmail/*`).

## 1. Create a Google Cloud Project

1. Go to [console.cloud.google.com](https://console.cloud.google.com).
2. Top bar → project picker → **New Project** → name it (e.g. `acquisitionos`) → Create.
3. Make sure the new project is selected before doing anything below.

## 2. Configure the OAuth Consent Screen

*APIs & Services → OAuth consent screen*

1. User type: **External** (Internal only works for Workspace domains).
2. Fill app name, support email, developer contact email.
3. Scopes: add the ones the app uses — `openid`, `email`, `profile`, `https://www.googleapis.com/auth/calendar`, `https://www.googleapis.com/auth/gmail.send`, `https://www.googleapis.com/auth/gmail.readonly` (Calendar/Gmail integrations).
4. Test users: while the consent screen is in *Testing*, ONLY listed test users can log in — add every email you'll test with. For public launch, either publish the app (may trigger Google verification if using sensitive scopes) or keep the user list current.
5. **Verify it's configured:** the consent screen shows Publishing status and scopes; a quick functional test is attempting a login — you should see your app name (not "unverified app" warning for test users).

## 3. Enable Required APIs

*APIs & Services → Library*, enable each:

| API | Used by |
|---|---|
| **Custom Search API** | Lead discovery (`GOOGLE_SEARCH_API_KEY`) |
| **Google Calendar API** | `/api/calendar/*` — availability, events, meeting orchestration |
| **Gmail API** | `/api/gmail/*` — connect mailbox, send, sync, reply processing |
| **People API** (optional) | Profile enrichment |

(OAuth 2.0 itself is not an API to enable — it's the Credentials system.)

## 4. Create OAuth 2.0 Credentials (Web Application)

*APIs & Services → Credentials → Create Credentials → OAuth client ID → Web application*

**Authorized JavaScript origins** — add every domain the app is served from:

```
http://localhost:3000
https://acquisition.space-z.ai
https://preview-chat-ab88c1b0-d6fd-4199-b9d5-ec3a018502fc.space-z.ai   (current GLM preview — changes per session)
https://your-production-domain.com
```

**Authorized redirect URIs** — exact paths (no trailing slash, correct scheme):

```
http://localhost:3000/api/auth/callback/google          # local dev sign-in
https://acquisition.space-z.ai/api/auth/callback/google # deployed URL sign-in
https://preview-chat-ab88c1b0-d6fd-4199-b9d5-ec3a018502fc.space-z.ai/api/auth/callback/google  # current preview sign-in
https://your-production-domain.com/api/auth/callback/google
```

Integration callbacks (only if you use those features):

```
https://your-domain/api/calendar/callback    # Google Calendar connect
https://your-domain/api/gmail/callback       # Gmail mailbox connect
```

After creating, copy:
- `GOOGLE_CLIENT_ID` (ends in `.apps.googleusercontent.com`)
- `GOOGLE_CLIENT_SECRET` (`GOCSPX-…`)

**Dynamic redirect note:** the app now builds `redirect_uri` from the incoming request's domain (x-forwarded-host), so the SAME code serves preview + production — but Google still requires **every unique redirect URI to be pre-registered** exactly. A new preview session domain = a new URI to add here.

## 5. Create the API Key for Custom Search (discovery)

1. Credentials → **Create Credentials → API key**.
2. Restrict it: *API restrictions → Restrict key → Custom Search API*.
3. This is `GOOGLE_SEARCH_API_KEY`.
4. Create the search engine at [programmablesearchengine.google.com](https://programmablesearchengine.google.com): **Create engine → Search the entire web = ON**. Copy the **Search engine ID** → this is `GOOGLE_SEARCH_ENGINE_ID` (the env template stores it as `GOOGLE_SEARCH_CX`; the code reads `GOOGLE_SEARCH_ENGINE_ID` — set both to the same value to be safe).

## 6. Get a Gmail App Password (for SMTP sending)

This is for the **platform's outbound email** (OTP codes, outreach, invoices) — different from the Gmail API:

1. Use a normal Google account (Workspace admins must allow App Passwords).
2. Go to [myaccount.google.com/security](https://myaccount.google.com/security) → enable **2-Step Verification** (prerequisite, cannot skip).
3. Visit **App passwords**: [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords) (or Security → 2-Step Verification → App passwords).
4. Create one (name e.g. `acquisitionos`) → Google shows **16 characters** grouped for display like `abcd efgh ijkl mnop`.
5. Store it in `SMTP_PASSWORD` **without spaces**: e.g. `abcdefghijklmnop` (use YOUR generated 16-char value — never commit the real one to docs). This is NOT the account's login password and cannot be used to sign in to Gmail — that's the point (revocable, mail-only).
6. Verify with a real send test or `node scripts/smtp-verify.js` → expect SMTP AUTH SUCCESS.

## 7. The Two Classic OAuth Errors

### `Error 400: redirect_uri_mismatch`

- **Cause:** the `redirect_uri` the app sent is not byte-identical to one in *Authorized redirect URIs*. Common mismatches: trailing slash, `http` vs `https`, wrong subdomain, new preview domain not added, or `/api/auth/callback/google` typo'd.
- **How to find the exact offending URI:** open `/api/auth/google/redirect-uri` **on the same domain where login fails** — the diagnostic route returns the precise redirect_uri this deployment generates. Or check server logs — the state route logs `resolvedOrigin`.
- **Fix:** add that exact string in Credentials → your OAuth client → Authorized redirect URIs → save → wait ~1–5 min for propagation → retry.

### `Error 403: access_blocked` / "app has not completed verification"

- **Cause:** consent screen in Testing and the signing-in user is not a test user; or sensitive scopes + unverified app for outside users.
- **Fix:** add the user under *Test users*, or publish the app and complete verification (required at public launch with Gmail/Calendar scopes). For intra-team use, keeping test users is fine.
- Also check the OAuth client is type **Web application** (Desktop/Other types reject web redirect URIs).

## 8. Checklist Before Leaving This Page

- [ ] Consent screen: app name, support email, test users added
- [ ] APIs enabled: Custom Search, Calendar, Gmail
- [ ] OAuth client (Web): origins + all redirect URIs for localhost/preview/production
- [ ] `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` in secrets panel → `googleAvailable:true` on `/api/auth/config`
- [ ] Custom Search API key (restricted) + engine ID → discovery works
- [ ] Gmail App Password (2FA enabled first) → `emailConfigured:true`, real test email arrives
