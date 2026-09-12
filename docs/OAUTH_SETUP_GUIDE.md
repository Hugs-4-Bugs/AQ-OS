# AcquisitionOS — OAuth Setup Guide

Complete guide for setting up OAuth providers for AcquisitionOS, covering Google Sign-In and Gmail API integration.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Google OAuth Setup (Sign-In)](#2-google-oauth-setup-sign-in)
3. [Gmail API-Specific Setup](#3-gmail-api-specific-setup)
4. [OAuth Security Best Practices](#4-oauth-security-best-practices)
5. [Troubleshooting OAuth Issues](#5-troubleshooting-oauth-issues)

---

## 1. Overview

AcquisitionOS uses two separate Google OAuth configurations:

| Purpose | OAuth Client | Scopes | Used By |
|---|---|---|---|
| **Google Sign-In** | Login OAuth Client | `openid`, `profile`, `email` | Phase 3 — User authentication |
| **Gmail Integration** | Gmail OAuth Client | `https://mail.google.com/`, `pubsub` | Phase 9 — Email sync and outreach |

> **Important**: These are **separate** OAuth 2.0 clients in Google Cloud Console. This separation allows different consent screens and access policies for each function.

---

## 2. Google OAuth Setup (Sign-In)

### Step 1: Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click **Select a project** → **New Project**
3. Enter project name: `AcquisitionOS Auth` (or your preferred name)
4. Click **Create**
5. Select the newly created project

### Step 2: Configure OAuth Consent Screen

1. Navigate to **APIs & Services** → **OAuth consent screen**
2. Select user type:
   - **External** — Available to any Google account (recommended for SaaS)
   - **Internal** — Only available to Google Workspace accounts
3. Fill in the required information:

| Field | Value |
|---|---|
| App name | `AcquisitionOS` |
| User support email | Your support email |
| App logo | Upload your logo (120×120px) |
| Application home page | `https://your-domain.com` |
| Application privacy policy link | `https://your-domain.com/privacy` |
| Application terms of service link | `https://your-domain.com/terms` |
| Authorized domains | `your-domain.com` |
| Developer contact email | Your developer email |

4. Click **Save and Continue**

5. **Scopes page**: Add the following scopes:
   - `.../auth/userinfo.email` — See your email address
   - `.../auth/userinfo.profile` — See your personal info
   - `openid` — Authenticate with Google

6. Click **Save and Continue**

7. **Test users** (if External and in testing mode):
   - Add email addresses of test users
   - Click **Save and Continue**

8. Review and click **Back to Dashboard**

### Step 3: Create OAuth 2.0 Credentials

1. Navigate to **APIs & Services** → **Credentials**
2. Click **+ CREATE CREDENTIALS** → **OAuth client ID**
3. Configure:

| Field | Value |
|---|---|
| Application type | Web application |
| Name | `AcquisitionOS Sign-In` |

4. **Authorized JavaScript origins**:
   - `http://localhost:3000` (development)
   - `https://your-domain.com` (production)

5. **Authorized redirect URIs**:
   - `http://localhost:3000/api/auth/google/callback` (development)
   - `https://your-domain.com/api/auth/google/callback` (production)

6. Click **Create**
7. **Save the Client ID and Client Secret** — you'll need them for `.env`

### Step 4: Configure Environment Variables

```env
# Frontend / NextAuth
GOOGLE_CLIENT_ID="123456789-abc.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="GOCSPX-xxxxxxxxxxxx"
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="<generate-with-openssl-rand-base64-32>"

# Enable Google OAuth
ENABLE_GOOGLE_OAUTH="true"
```

For the backend (if using separate backend auth):

```env
# Backend
GOOGLE_LOGIN_CLIENT_ID="123456789-abc.apps.googleusercontent.com"
GOOGLE_LOGIN_CLIENT_SECRET="GOCSPX-xxxxxxxxxxxx"
GOOGLE_LOGIN_REDIRECT_URI="http://localhost:8000/api/auth/google/callback"
```

### Step 5: Test Google OAuth Flow

1. Start the application: `bun run dev`
2. Navigate to the login page
3. Click **Sign in with Google**
4. You should be redirected to Google's consent screen
5. After consent, you should be redirected back and logged in

**Verify**:
- User is created in the database with `authProvider: "google"`
- `googleId` is set on the user record
- `emailVerified` is `true` (Google-verified emails)
- JWT tokens are set as cookies

---

## 3. Gmail API-Specific Setup

Gmail integration uses a **separate** OAuth 2.0 client with broader scopes for email access and Pub/Sub notifications.

### Step 1: Enable Required APIs

In the same Google Cloud Project (or a new one):

1. Navigate to **APIs & Services** → **Library**
2. Search for and enable:
   - **Gmail API**
   - **Cloud Pub/Sub API**

### Step 2: Create Gmail OAuth Client

1. Navigate to **APIs & Services** → **Credentials**
2. Click **+ CREATE CREDENTIALS** → **OAuth client ID**
3. Configure:

| Field | Value |
|---|---|
| Application type | Web application |
| Name | `AcquisitionOS Gmail` |

4. **Authorized redirect URIs**:
   - `http://localhost:8000/api/integrations/gmail/callback` (development)
   - `https://your-domain.com/api/integrations/gmail/callback` (production)

5. Click **Create**
6. **Save the Client ID and Client Secret**

### Step 3: Configure Gmail OAuth Consent

The Gmail OAuth client needs additional scopes:

1. Go back to **OAuth consent screen**
2. Add the following scopes:
   - `https://www.googleapis.com/auth/gmail.modify` — Read, compose, and modify emails
   - `https://www.googleapis.com/auth/gmail.readonly` — Read emails (alternative, less permissive)
   - `https://www.googleapis.com/auth/pubsub` — Manage Pub/Sub subscriptions

3. If using `gmail.modify` scope with **sensitive data access**, you may need Google verification:
   - Submit for verification if the app is in production mode
   - Testing mode works without verification for up to 100 test users

### Step 4: Configure Environment Variables

```env
# Gmail Integration
GMAIL_CLIENT_ID="987654321-xyz.apps.googleusercontent.com"
GMAIL_CLIENT_SECRET="GOCSPX-yyyyyyyyyyyy"
GMAIL_REDIRECT_URI="http://localhost:8000/api/integrations/gmail/callback"
ENABLE_GMAIL_INTEGRATION="true"

# Pub/Sub (for push notifications)
GOOGLE_PUBSUB_TOPIC="projects/your-project/topics/gmail-notifications"
GOOGLE_PUBSUB_SUBSCRIPTION="projects/your-project/subscriptions/gmail-notifications-sub"
```

### Step 5: Create Pub/Sub Topic for Gmail Notifications

Gmail push notifications use Google Cloud Pub/Sub to deliver real-time email events.

#### 5.1 Create the Topic

```bash
# Install gcloud CLI if not already installed
# https://cloud.google.com/sdk/docs/install

# Authenticate
gcloud auth login

# Set project
gcloud config set project your-project-id

# Create topic
gcloud pubsub topics create gmail-notifications
```

Or via the [Google Cloud Console](https://console.cloud.google.com/cloudpubsub/topic/list):

1. Navigate to **Pub/Sub** → **Topics**
2. Click **Create Topic**
3. Topic ID: `gmail-notifications`
4. Click **Create**

#### 5.2 Create the Subscription

```bash
# Create push subscription (for production)
gcloud pubsub subscriptions create gmail-notifications-sub \
  --topic=gmail-notifications \
  --push-endpoint=https://your-domain.com/api/integrations/gmail/push \
  --push-auth-service-account=your-service-account@your-project.iam.gserviceaccount.com

# Create pull subscription (for development)
gcloud pubsub subscriptions create gmail-notifications-sub \
  --topic=gmail-notifications
```

Or via Console:
1. Navigate to **Pub/Sub** → **Subscriptions**
2. Click **Create Subscription**
3. Subscription ID: `gmail-notifications-sub`
4. Select topic: `gmail-notifications`
5. Delivery type:
   - **Push** (production): Enter your endpoint URL
   - **Pull** (development): Application pulls messages
6. Click **Create**

#### 5.3 Grant Gmail API Permission to Publish

```bash
# Grant the Gmail service account publish access to the topic
gcloud pubsub topics add-iam-policy-binding gmail-notifications \
  --member="serviceAccount:gmail-api-push@system.gserviceaccount.com" \
  --role="roles/pubsub.publisher"
```

### Step 6: Watch Gmail for New Messages

After a user connects their Gmail account via OAuth, call the Gmail API `watch` method to start receiving push notifications:

```python
# backend/app/services/gmail_watch.py
from googleapiclient.discovery import build

def watch_gmail(credentials, topic_name, label_id="INBOX"):
    """Start watching a Gmail account for new messages."""
    service = build('gmail', 'v1', credentials=credentials)
    
    request = {
        'labelIds': [label_id],
        'topicName': topic_name,
    }
    
    result = service.users().watch(
        userId='me',
        body=request
    ).execute()
    
    return result
    # Returns: { 'historyId': '123456', 'expiration': '1234567890000' }
```

**Important**: Gmail watch expires after 7 days. You must renew it before expiration. Use a Celery Beat task to auto-renew:

```python
# Add to Celery Beat schedule
'gmail-renew-watches': {
    'task': 'app.tasks.email_tasks.renew_gmail_watches',
    'schedule': crontab(hour='*/6'),  # Every 6 hours
}
```

### Step 7: Token Refresh Handling

Gmail OAuth tokens expire after 1 hour. The refresh token must be used to obtain new access tokens.

```python
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request

def refresh_gmail_token(refresh_token, client_id, client_secret):
    """Refresh an expired Gmail access token."""
    credentials = Credentials(
        token=None,
        refresh_token=refresh_token,
        client_id=client_id,
        client_secret=client_secret,
        token_uri='https://oauth2.googleapis.com/token',
    )
    
    credentials.refresh(Request())
    
    return {
        'access_token': credentials.token,
        'expiry': credentials.expiry,
    }
```

**Token storage**: Access and refresh tokens are encrypted with `TOKEN_ENCRYPTION_KEY` (Fernet) before being stored in the `EmailAccount` database table.

### Step 8: Verify Push Notifications

1. Connect a Gmail account through the AcquisitionOS UI
2. Send a test email to the connected account
3. Check Pub/Sub subscription for the notification:
   ```bash
   gcloud pubsub subscriptions pull gmail-notifications-sub --limit=1
   ```
4. Verify the push notification arrives at your endpoint

---

## 4. OAuth Security Best Practices

### Client Secret Protection

- **Never** expose client secrets in client-side code
- **Never** commit client secrets to version control
- **Store** secrets in environment variables or a secrets manager
- **Use** different OAuth clients for development and production
- **Restrict** redirect URIs to only your known domains

### Redirect URI Security

- Always use **exact** redirect URI matching
- Use **HTTPS** for all production redirect URIs
- **Never** use wildcard or overly broad URIs
- Validate the `state` parameter to prevent CSRF attacks

### Token Handling

- **Access tokens**: Short-lived (1 hour for Google), never store permanently
- **Refresh tokens**: Long-lived, encrypt at rest with Fernet
- **ID tokens**: Verify signature and issuer before trusting claims
- **Token storage**: Always encrypt before storing in database

### Scope Minimization

- Only request the **minimum scopes** needed for each function
- Use `gmail.modify` instead of `mail.google.com` when possible
- Review scopes periodically and remove unused ones
- Document why each scope is required

### Consent Screen

- Keep the consent screen **up to date** with accurate information
- List all requested scopes clearly
- Provide links to privacy policy and terms of service
- If your app requests sensitive scopes, submit for Google verification

### Monitoring

- Log all OAuth token operations (issue, refresh, revoke)
- Monitor for unusual token refresh patterns
- Alert on failed OAuth flows (possible credential stuffing)
- Track consent screen denial rates

---

## 5. Troubleshooting OAuth Issues

### Common Google Sign-In Errors

#### `redirect_uri_mismatch`

**Cause**: The redirect URI in the auth request doesn't match any authorized URI in Google Console.

**Fix**:
1. Check the exact URL in the error message
2. Go to Google Cloud Console → Credentials → [Your OAuth Client]
3. Add the exact redirect URI (including trailing slashes, port numbers)
4. Wait a few minutes for changes to propagate

#### `access_denied`

**Cause**: User denied consent or app is in testing mode and user is not a test user.

**Fix**:
1. If in testing mode, add the user's email to test users in OAuth consent screen
2. If in production, verify your consent screen is published
3. Check that requested scopes are appropriate

#### `invalid_client`

**Cause**: Client ID or client secret is incorrect.

**Fix**:
1. Verify `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` match exactly
2. Check for extra whitespace or newlines in env vars
3. Regenerate the client secret if needed

#### `invalid_grant`

**Cause**: Authorization code has expired or already been used.

**Fix**:
1. Authorization codes are single-use and expire after 10 minutes
2. Ensure your callback handler processes the code immediately
3. Don't cache or reuse authorization codes

### Gmail-Specific Issues

#### Gmail API `403 Forbidden`

**Cause**: Gmail API not enabled or insufficient scopes.

**Fix**:
1. Verify Gmail API is enabled in Google Cloud Console
2. Check that the OAuth token has `gmail.modify` or `mail.google.com` scope
3. Re-authenticate the user to obtain new tokens with correct scopes

#### Pub/Sub Not Receiving Notifications

**Cause**: Missing IAM permissions or incorrect topic configuration.

**Fix**:
1. Verify `gmail-api-push@system.gserviceaccount.com` has `roles/pubsub.publisher` on the topic
2. Check that the subscription is active
3. Verify the Gmail watch hasn't expired (7-day TTL)
4. Check Pub/Sub metrics in Google Cloud Console

#### Token Refresh Failing

**Cause**: Refresh token revoked or expired.

**Fix**:
1. Google refresh tokens can be revoked by users or expire after 6 months of inactivity
2. Re-authenticate the user to obtain new tokens
3. Implement automatic re-auth prompt when refresh fails
4. Log refresh failures for monitoring

#### Watch Expiration

**Cause**: Gmail watch expires after 7 days.

**Fix**:
1. Implement a Celery Beat task to renew watches every 6 hours
2. Track watch expiration in the `EmailAccount` table
3. Re-establish watches on server restart

### OAuth Token Encryption Issues

#### Decryption Fails After Key Rotation

**Cause**: Token was encrypted with the old `TOKEN_ENCRYPTION_KEY` but you're using the new key.

**Fix**:
1. Keep `TOKEN_ENCRYPTION_KEY_PREVIOUS` for 7 days after rotation
2. Try decrypting with the current key first, then the previous key
3. Run the rotation script to re-encrypt all tokens with the new key

### General Debugging Tips

1. **Check Google Cloud Console logs**: APIs & Services → Credentials → [Client] → Usage
2. **Use Google's OAuth 2.0 Playground**: [developers.google.com/oauthplayground](https://developers.google.com/oauthplayground)
3. **Verify token contents**: Decode JWT tokens at [jwt.io](https://jwt.io)
4. **Check API quotas**: Google Cloud Console → APIs & Services → Dashboard → Quotas
5. **Enable debug logging**: Set `GOOGLE_OAUTH_DEBUG=true` in environment for verbose logging
