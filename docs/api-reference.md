# AcquisitionOS API Reference

> **Version**: 3.0.0  
> **Base URL**: `https://your-domain.com/api`  
> **Auth**: Bearer token (JWT) or API Key (`x-api-key` header)  
> **Content-Type**: `application/json`

---

## Table of Contents

- [Authentication](#authentication)
- [Rate Limiting](#rate-limiting)
- [Error Handling](#error-handling)
- [Auth](#auth)
- [Leads](#leads)
- [Pipeline](#pipeline)
- [Workflows](#workflows)
- [Messaging](#messaging)
- [Payments](#payments)
- [Subscriptions](#subscriptions)
- [Settings](#settings)
- [Credits](#credits)
- [Deals](#deals)
- [Insights](#insights)
- [Competitor](#competitor)
- [AI](#ai)
- [GDPR](#gdpr)
- [Health](#health)
- [Audit](#audit)
- [Admin](#admin)

---

## Authentication

All authenticated endpoints require either:

1. **JWT Bearer Token** — Obtained via `/api/auth/signin` or `/api/auth/signup`. Sent as:
   - `Authorization: Bearer <access_token>` header, OR
   - `access_token` and `refresh_token` cookies (set automatically on sign-in)

2. **API Key** — Created via Settings → API Keys. Sent as:
   - `x-api-key: <api_key>` header

API Key auth supports org-level isolation and scoped permissions. JWT auth operates at the user level.

### Token Lifecycle

| Token | Expiry | Purpose |
|-------|--------|---------|
| Access Token | 15 minutes | API request authorization |
| Refresh Token | 7 days | Obtain new access tokens |
| MFA Session Token | 5 minutes | Temporary token pending TOTP verification |

---

## Rate Limiting

Rate limits are applied per IP address using a sliding window algorithm.

| Limiter | Window | Max Requests | Applies To |
|---------|--------|--------------|------------|
| `auth` | 1 minute | 5 | All `/api/auth/*` POST endpoints |
| `api` | 1 minute | 60 | General API endpoints |
| `ai` | 1 minute | 10 | `/api/ai/*`, `/api/leads/*/analyze` |
| `webhook` | 1 minute | 100 | Webhook endpoints |
| `upload` | 1 minute | 10 | File upload endpoints |
| `export` | 1 hour | 5 | `/api/leads/export`, `/api/gdpr/export` |
| `mfa` | 1 minute | 3 | `/api/auth/mfa/verify` |

When rate limited, the API returns `429 Too Many Requests` with a `Retry-After` header.

---

## Error Handling

All errors follow a consistent JSON structure:

```json
{
  "error": "Human-readable error message",
  "code": "ERROR_CODE"
}
```

### Common HTTP Status Codes

| Code | Meaning |
|------|---------|
| 400 | Bad Request — validation error or malformed input |
| 401 | Unauthorized — missing or invalid authentication |
| 402 | Payment Required — insufficient credits |
| 403 | Forbidden — insufficient permissions or email not verified |
| 404 | Not Found — resource does not exist |
| 409 | Conflict — duplicate resource (e.g., email already exists) |
| 423 | Locked — account locked due to too many failed attempts |
| 429 | Too Many Requests — rate limit exceeded |
| 500 | Internal Server Error |

---

## Auth

### POST /api/auth/signin

Sign in with email and password. If MFA is enabled, returns an MFA challenge instead of tokens.

**Authentication**: None required

**Rate Limit**: `auth` (5 req/min)

**Request Body**:
```json
{
  "email": "user@example.com",
  "password": "securePassword123"
}
```

**Response (200)** — Standard login:
```json
{
  "message": "Signed in successfully",
  "user": {
    "id": "clx...",
    "email": "user@example.com",
    "name": "John Doe",
    "role": "owner",
    "plan": "pro",
    "orgId": null,
    "emailVerified": true,
    "mfaEnabled": false,
    "avatarUrl": null
  }
}
```

**Response (200)** — MFA required:
```json
{
  "mfaRequired": true,
  "mfaSessionToken": "eyJ...",
  "message": "MFA verification required"
}
```

**Error Responses**:
- `400` — OAuth-only account (Google login required)
- `401` — Invalid email or password
- `403` — Email not verified (`requiresVerification: true`)
- `423` — Account temporarily locked

---

### POST /api/auth/signup

Create a new account. Starts a 14-day free trial.

**Authentication**: None required

**Rate Limit**: `auth` (5 req/min)

**Request Body**:
```json
{
  "name": "John Doe",
  "email": "user@example.com",
  "password": "SecureP@ss1"
}
```

**Password Requirements**: Minimum 8 characters, at least one uppercase, one lowercase, one number, one special character.

**Response (201)** — Email verification required:
```json
{
  "message": "Account created! Please check your email for a verification code.",
  "requiresVerification": true,
  "email": "user@example.com"
}
```

**Response (201)** — Auto-verified (dev mode):
```json
{
  "message": "Account created successfully. Welcome to AcquisitionOS!",
  "requiresVerification": false,
  "user": {
    "id": "clx...",
    "email": "user@example.com",
    "name": "John Doe",
    "role": "owner",
    "plan": "free",
    "emailVerified": true,
    "mfaEnabled": false
  }
}
```

**Error Responses**:
- `400` — Validation error (name, email format, password strength)
- `409` — Email already registered

---

### GET /api/auth/me

Get the currently authenticated user's profile.

**Authentication**: Required (JWT or API Key)

**Response (200)**:
```json
{
  "user": {
    "id": "clx...",
    "email": "user@example.com",
    "name": "John Doe",
    "role": "owner",
    "plan": "pro",
    "orgId": null,
    "emailVerified": true,
    "mfaEnabled": false,
    "avatarUrl": null
  }
}
```

---

### POST /api/auth/signout

Sign out the current user. Revokes the refresh token and clears auth cookies.

**Authentication**: Optional (always succeeds)

**Query Parameters**:
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `allDevices` | boolean | `false` | Revoke all sessions across all devices |

**Response (200)**:
```json
{
  "message": "Signed out successfully"
}
```

---

### POST /api/auth/refresh

Rotate the refresh token pair. The old refresh token is revoked and a new pair is issued.

**Authentication**: Refresh token cookie

**Response (200)**:
```json
{
  "message": "Token refreshed successfully",
  "user": {
    "id": "clx...",
    "email": "user@example.com",
    "name": "John Doe",
    "role": "owner",
    "plan": "pro",
    "orgId": null,
    "emailVerified": true,
    "mfaEnabled": false,
    "avatarUrl": null
  }
}
```

**Error Responses**:
- `401` — No refresh token, invalid token, or session revoked

---

### POST /api/auth/verify-email

Verify email address using OTP sent during signup.

**Authentication**: None required

**Request Body**:
```json
{
  "email": "user@example.com",
  "otp": "123456"
}
```

**Response (200)**:
```json
{
  "message": "Email verified successfully",
  "user": { "id": "clx...", "email": "user@example.com" }
}
```

---

### POST /api/auth/resend-verification

Resend email verification OTP.

**Request Body**:
```json
{
  "email": "user@example.com"
}
```

---

### POST /api/auth/forgot-password

Request a password reset OTP.

**Request Body**:
```json
{
  "email": "user@example.com"
}
```

---

### POST /api/auth/reset-password

Reset password using the OTP from forgot-password.

**Request Body**:
```json
{
  "email": "user@example.com",
  "otp": "123456",
  "newPassword": "NewSecureP@ss1"
}
```

---

### POST /api/auth/otp/request

Request a one-time password for passwordless login.

**Request Body**:
```json
{
  "email": "user@example.com"
}
```

---

### POST /api/auth/otp/verify

Verify OTP and complete passwordless login.

**Request Body**:
```json
{
  "email": "user@example.com",
  "otp": "123456"
}
```

---

### POST /api/auth/magic-link/request

Request a magic link for passwordless login.

**Request Body**:
```json
{
  "email": "user@example.com"
}
```

---

### POST /api/auth/magic-link/verify

Verify a magic link token (from email click).

**Request Body**:
```json
{
  "token": "magic_link_token_value"
}
```

---

### POST /api/auth/mfa/setup

Initialize MFA setup. Returns a TOTP secret and QR code URI.

**Authentication**: Required

**Response (200)**:
```json
{
  "secret": "JBSWY3DPEHPK3PXP",
  "qrCodeUri": "otpauth://totp/AcquisitionOS:user@example.com?secret=JBSWY3DPEHPK3PXP&issuer=AcquisitionOS",
  "backupCodes": ["abc123", "def456", "..."]
}
```

---

### POST /api/auth/mfa/verify

Verify TOTP code to complete MFA setup or during login.

**Rate Limit**: `mfa` (3 req/min)

**Request Body**:
```json
{
  "code": "123456",
  "mfaSessionToken": "eyJ..."
}
```

---

### POST /api/auth/mfa/confirm

Confirm MFA setup with a valid TOTP code.

---

### POST /api/auth/mfa/disable

Disable MFA. Requires the current TOTP code.

**Request Body**:
```json
{
  "code": "123456"
}
```

---

### GET /api/auth/google/callback

Google OAuth callback. Redirects to Google for authentication.

---

### GET /api/auth/callback/google

Handles the Google OAuth callback after user consent. Creates or links the user account and sets auth cookies.

---

### GET /api/auth/security/alerts

Get security alerts for the authenticated user.

**Authentication**: Required

---

### GET /api/auth/security/devices

Get list of known devices for the authenticated user.

**Authentication**: Required

---

### GET /api/auth/security/lock-status

Check if the user's account is currently locked.

**Authentication**: Required

---

## Leads

### GET /api/leads

List leads with filtering, sorting, and pagination.

**Authentication**: Required (`leads:read`)

**Query Parameters**:
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `stage` | string | — | Filter by pipeline stage |
| `niche` | string | — | Filter by niche (partial match) |
| `country` | string | — | Filter by country (partial match) |
| `search` | string | — | Search business name, owner, email, city, niche |
| `sortBy` | string | `createdAt` | Sort field |
| `sortOrder` | string | `desc` | `asc` or `desc` |
| `page` | number | `1` | Page number (1-indexed) |
| `limit` | number | `20` | Items per page (max 100) |

**Valid Sort Fields**: `createdAt`, `updatedAt`, `businessName`, `stage`, `replyScore`, `conversionScore`, `urgencyScore`, `revenuePotentialScore`, `rating`

**Response (200)**:
```json
{
  "leads": [
    {
      "id": "clx...",
      "businessName": "Acme Corp",
      "ownerName": "Jane Smith",
      "email": "jane@acme.com",
      "stage": "discovered",
      "replyScore": 75,
      "conversionScore": 60,
      "urgencyScore": 40,
      "revenuePotentialScore": 80,
      "niche": "SaaS",
      "country": "US",
      "createdAt": "2026-01-15T10:30:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 156,
    "totalPages": 8
  }
}
```

---

### POST /api/leads

Create a new lead. Requires `leads:write` permission and `lead_discovery` entitlement.

**Authentication**: Required (`leads:write`)

**Request Body**:
```json
{
  "businessName": "Acme Corp",
  "ownerName": "Jane Smith",
  "website": "https://acme.com",
  "email": "jane@acme.com",
  "phone": "+1234567890",
  "whatsapp": "+1234567890",
  "linkedin": "https://linkedin.com/company/acme",
  "instagram": "https://instagram.com/acme",
  "facebook": "https://facebook.com/acme",
  "city": "San Francisco",
  "country": "US",
  "niche": "SaaS",
  "stage": "discovered",
  "tags": ["hot", "enterprise"],
  "notes": "Met at SaaS conference",
  "source": "google_search"
}
```

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `businessName` | Yes | string | Business/company name |
| `ownerName` | No | string | Contact person name |
| `website` | No | string | Business website URL |
| `email` | No | string | Contact email |
| `phone` | No | string | Phone number |
| `whatsapp` | No | string | WhatsApp number |
| `linkedin` | No | string | LinkedIn profile URL |
| `city` | No | string | City |
| `country` | No | string | Country |
| `niche` | No | string | Industry/niche |
| `stage` | No | string | Pipeline stage (default: `discovered`) |
| `tags` | No | string[] | Tags for categorization |
| `notes` | No | string | Internal notes |
| `source` | No | string | Lead source |

**Response (201)**: Returns the created lead object.

---

### GET /api/leads/[id]

Get detailed lead information including notes, analysis, activities, and scores.

**Authentication**: Required (`leads:read`)

**Response (200)**:
```json
{
  "lead": {
    "id": "clx...",
    "businessName": "Acme Corp",
    "leadNotes": [
      { "id": "...", "content": "Follow up next week", "pinned": false, "user": { "name": "John" }, "createdAt": "..." }
    ],
    "leadAnalysis": { "websiteQualityScore": 45, "digitalMaturityScore": 30, "weaknesses": "..." },
    "activities": [
      { "id": "...", "type": "note_added", "description": "Note added", "createdAt": "..." }
    ],
    "leadScores": [
      { "scoreType": "reply", "score": 75, "explanation": "High engagement likelihood" }
    ]
  }
}
```

---

### PUT /api/leads/[id]

Update a lead. Only allowed fields are accepted; string values are sanitized.

**Authentication**: Required (`leads:write`)

**Request Body**: Partial update with any allowed field:
```json
{
  "businessName": "Acme Corp Updated",
  "stage": "contacted",
  "notes": "Updated notes",
  "tags": ["hot", "enterprise", "priority"]
}
```

**Allowed Fields**: `businessName`, `ownerName`, `website`, `email`, `phone`, `whatsapp`, `linkedin`, `instagram`, `facebook`, `googleMapsListing`, `reviews`, `city`, `country`, `niche`, `notes`, `stage`, `emailStatus`, `estimatedQuality`, `estimatedRevenue`, `bestContactPerson`, `bestChannel`, `bestTiming`, `outreachStyle`, `opportunityNotes`, `digitalWeaknesses`, `followUpAt`, `websiteQuality`, `rating`, `tags`

---

### DELETE /api/leads/[id]

Soft delete a lead. Sets `isActive: false` and `deletedAt` timestamp.

**Authentication**: Required (`leads:write`)

**Response (200)**:
```json
{
  "success": true,
  "message": "Lead deleted"
}
```

---

### POST /api/leads/[id]/analyze

Trigger AI analysis for a lead. Costs credits.

**Authentication**: Required

---

### POST /api/leads/[id]/analyze-website

Analyze a lead's website for quality, tech stack, and weaknesses.

**Authentication**: Required

---

### POST /api/leads/[id]/enrich

Enrich lead data using AI-powered data enrichment.

**Authentication**: Required

---

### GET /api/leads/[id]/explain-scores

Get detailed explanations for a lead's scoring metrics.

**Authentication**: Required

---

### POST /api/leads/[id]/outreach

Generate personalized outreach messages for a lead across multiple channels.

**Authentication**: Required

---

### GET /api/leads/[id]/communications

Get all communications for a lead.

**Authentication**: Required

---

### POST /api/leads/[id]/communications

Add a new communication record for a lead.

**Authentication**: Required

---

### GET /api/leads/[id]/notes

Get notes for a lead.

**Authentication**: Required

---

### POST /api/leads/[id]/notes

Add a note to a lead.

**Request Body**:
```json
{
  "content": "Follow up next week about the proposal",
  "pinned": false
}
```

---

### GET /api/leads/[id]/activities

Get activity timeline for a lead.

**Authentication**: Required

---

### GET /api/leads/[id]/reminders

Get follow-up reminders for a lead.

**Authentication**: Required

---

### POST /api/leads/[id]/reminders

Create a follow-up reminder for a lead.

**Request Body**:
```json
{
  "remindAt": "2026-02-01T09:00:00Z",
  "message": "Follow up on proposal"
}
```

---

### GET /api/leads/[id]/deals

Get deals associated with a lead.

**Authentication**: Required

---

### POST /api/leads/[id]/move-stage

Move a lead to a different pipeline stage.

**Request Body**:
```json
{
  "stage": "contacted"
}
```

---

### POST /api/leads/discover

Start an AI-powered lead discovery search.

**Authentication**: Required

**Request Body**:
```json
{
  "query": "SaaS companies in San Francisco",
  "filters": {
    "niche": "SaaS",
    "country": "US",
    "city": "San Francisco"
  },
  "maxResults": 20
}
```

---

### GET /api/leads/discover/status/[jobId]

Check the status of a lead discovery job.

---

### GET /api/leads/discover/suggestions

Get AI-suggested search queries for lead discovery.

---

### POST /api/leads/search

Advanced lead search with complex filters.

---

### GET /api/leads/stats

Get aggregated lead statistics (counts by stage, scores, etc.).

---

### POST /api/leads/import

Import leads from CSV or JSON data.

**Request Body**:
```json
{
  "leads": [
    { "businessName": "Acme Corp", "email": "jane@acme.com" }
  ],
  "format": "json"
}
```

---

### POST /api/leads/export

Export leads to CSV or JSON format.

**Rate Limit**: `export` (5 req/hour)

---

### POST /api/leads/merge

Merge duplicate leads into one.

**Request Body**:
```json
{
  "primaryLeadId": "clx_primary",
  "duplicateLeadIds": ["clx_dup1", "clx_dup2"]
}
```

---

### GET /api/leads/scraping-metrics

Get web scraping performance metrics.

---

### GET /api/leads/proxy-pool

Get proxy pool status for distributed scraping.

---

## Pipeline

### GET /api/pipeline

Get the pipeline view — leads grouped by stage.

**Authentication**: Required (`leads:read`)

**Query Parameters**:
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `stage` | string | — | Get leads for a specific stage only |
| `niche` | string | — | Filter by niche |
| `country` | string | — | Filter by country |
| `page` | number | `1` | Page number |
| `limit` | number | `50` | Items per page (max 100) |

**Response (200)** — Full pipeline view:
```json
{
  "stages": [
    {
      "name": "discovered",
      "label": "Discovered",
      "order": 1,
      "color": "#64748b",
      "leads": [...],
      "count": 45
    },
    {
      "name": "analyzed",
      "label": "Analyzed",
      "order": 2,
      "color": "#06b6d4",
      "leads": [...],
      "count": 23
    }
  ],
  "totalLeads": 156,
  "totalValue": 45000
}
```

---

## Workflows

### GET /api/workflows

List all workflows.

**Authentication**: Required (`pipeline:read`)

**Query Parameters**:
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `status` | string | — | Filter by status: `draft`, `active`, `paused`, `archived` |
| `triggerType` | string | — | Filter by trigger type |
| `search` | string | — | Search by name |
| `page` | number | `1` | Page number |
| `limit` | number | `20` | Items per page |

---

### POST /api/workflows

Create a new workflow. Requires `workflow_access` entitlement.

**Authentication**: Required (`pipeline:write`)

**Request Body**:
```json
{
  "name": "Auto-nurture new leads",
  "description": "Automatically nurture leads when they enter discovered stage",
  "triggerType": "lead_stage_change",
  "triggerConfig": { "stage": "discovered" },
  "steps": [
    {
      "type": "action",
      "name": "Send welcome email",
      "config": { "template": "welcome", "channel": "email" },
      "order": 1
    },
    {
      "type": "delay",
      "name": "Wait 3 days",
      "config": { "delayDays": 3 },
      "order": 2
    }
  ]
}
```

**Trigger Types**: `lead_stage_change`, `lead_reply`, `score_change`, `manual`, `scheduled`, `payment_received`

**Step Types**: `action`, `condition`, `delay`, `ai_action`

---

### GET /api/workflows/[id]

Get a specific workflow definition.

---

### PUT /api/workflows/[id]

Update a workflow definition.

---

### DELETE /api/workflows/[id]

Delete (archive) a workflow.

---

### POST /api/workflows/[id]/execute

Manually trigger a workflow execution.

**Request Body**:
```json
{
  "triggerData": {
    "leadId": "clx...",
    "stage": "contacted"
  },
  "idempotencyKey": "unique-key-123"
}
```

---

### POST /api/workflows/[id]/pause

Pause a running workflow execution.

---

### POST /api/workflows/[id]/resume

Resume a paused workflow execution.

---

### POST /api/workflows/[id]/cancel

Cancel a workflow execution.

---

### GET /api/workflows/templates

List available workflow templates.

**Query Parameters**:
| Param | Type | Description |
|-------|------|-------------|
| `category` | string | Filter: `nurture`, `follow_up`, `alert`, `onboarding`, `enrichment`, `outreach` |

---

### GET /api/workflows/executions

List workflow executions with status and timing.

**Query Parameters**:
| Param | Type | Description |
|-------|------|-------------|
| `workflowId` | string | Filter by workflow |
| `status` | string | `running`, `completed`, `failed`, `cancelled`, `paused` |

---

### GET /api/workflows/metrics

Get workflow execution metrics (success rate, average duration, etc.).

---

### GET /api/workflows/logs

Get workflow execution logs.

---

### POST /api/workflows/webhook/[id]

Webhook endpoint for external triggers. Receives and processes webhook payloads for a specific workflow.

---

## Messaging

### GET /api/messaging/broadcasts

List broadcast campaigns.

**Authentication**: Required (`outreach:read`)

**Query Parameters**:
| Param | Type | Description |
|-------|------|-------------|
| `status` | string | `draft`, `scheduled`, `running`, `paused`, `completed`, `cancelled` |
| `page` | number | Page number |
| `limit` | number | Items per page |

---

### POST /api/messaging/broadcasts

Create a new broadcast campaign.

**Authentication**: Required (`outreach:write`)

**Request Body**:
```json
{
  "name": "Q1 Outreach Campaign",
  "channel": "email",
  "audienceFilter": {
    "stages": ["discovered", "analyzed"],
    "niches": ["SaaS"]
  },
  "messageContent": "Hi {{ownerName}}, I noticed your business...",
  "templateId": null,
  "scheduledAt": "2026-02-01T09:00:00Z"
}
```

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `name` | Yes | string | Campaign name |
| `channel` | Yes | string | `whatsapp`, `telegram`, or `email` |
| `audienceFilter` | Yes | object | Filter criteria for recipients |
| `messageContent` | Yes | string | Message body (supports `{{variable}}` placeholders) |
| `templateId` | No | string | Use a saved template |
| `scheduledAt` | No | string (ISO 8601) | Schedule for future delivery |

---

### GET /api/messaging/broadcasts/[id]

Get a specific broadcast with delivery stats.

---

### GET /api/messaging/templates

List message templates.

---

### POST /api/messaging/templates

Create a message template.

**Request Body**:
```json
{
  "name": "Cold Outreach - SaaS",
  "channel": "email",
  "subject": "Quick question about {{businessName}}",
  "content": "Hi {{ownerName}}, I noticed..."
}
```

---

### GET /api/messaging/templates/[id]

Get a specific template.

---

### PUT /api/messaging/templates/[id]

Update a message template.

---

### DELETE /api/messaging/templates/[id]

Delete a message template.

---

### GET /api/messaging/media/[id]

Get media file metadata.

---

### GET /api/messaging/analytics

Get messaging analytics (delivery rates, open rates, reply rates).

---

## Payments

### POST /api/payments/create-order

Create a payment order for a plan upgrade.

**Authentication**: Required

**Request Body**:
```json
{
  "plan": "pro",
  "billingCycle": "monthly",
  "currency": "INR",
  "couponCode": "LAUNCH20",
  "idempotencyKey": "unique-key-123"
}
```

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `plan` | Yes | string | `pro` or `elite` |
| `billingCycle` | No | string | `monthly` (default) or `yearly` |
| `currency` | No | string | `INR` (default) or `USD` |
| `couponCode` | No | string | Discount coupon |
| `idempotencyKey` | No | string | Prevents duplicate orders |

**Plan Pricing**:
| Plan | INR Monthly | INR Yearly | USD Monthly | USD Yearly | Credits/Month |
|------|-------------|------------|-------------|------------|---------------|
| Free | ₹0 | ₹0 | $0 | $0 | 50 |
| Pro | ₹2,499 | ₹23,990 | $29 | $279 | 200 |
| Elite | ₹7,999 | ₹76,790 | $89 | $849 | 500 |

**GST**: 18% applied for INR payments.

**Response (200)** — Razorpay (INR):
```json
{
  "orderId": "clx...",
  "amount": 2949.82,
  "currency": "INR",
  "subtotal": 2499,
  "discountAmount": 0,
  "taxAmount": 449.82,
  "gstRate": 0.18,
  "plan": "pro",
  "billingCycle": "monthly",
  "creditsAllocated": 200,
  "provider": "razorpay",
  "providerConfigured": true,
  "razorpayOrderId": "order_abc123",
  "razorpayKeyId": "rzp_live_...",
  "razorpayAmount": 294982,
  "userName": "John Doe",
  "userEmail": "john@example.com"
}
```

**Response (200)** — Stripe (USD):
```json
{
  "orderId": "clx...",
  "amount": 29,
  "currency": "USD",
  "subtotal": 29,
  "taxAmount": 0,
  "plan": "pro",
  "billingCycle": "monthly",
  "creditsAllocated": 200,
  "provider": "stripe",
  "providerConfigured": true,
  "stripeCheckoutUrl": "https://checkout.stripe.com/..."
}
```

---

### POST /api/payments/confirm

Confirm a payment after provider callback.

**Request Body**:
```json
{
  "orderId": "clx...",
  "providerPaymentId": "pay_abc123",
  "providerOrderId": "order_abc123",
  "signature": "abc123..."
}
```

---

### POST /api/payments/refund

Request a refund for a completed payment.

**Request Body**:
```json
{
  "orderId": "clx...",
  "reason": "Not satisfied with service",
  "amount": null
}
```

---

### POST /api/payments/validate-coupon

Validate a coupon code without creating an order.

**Request Body**:
```json
{
  "code": "LAUNCH20",
  "plan": "pro",
  "baseAmount": 2499
}
```

**Response (200)**:
```json
{
  "valid": true,
  "discountType": "percent",
  "discountValue": 20,
  "discountAmount": 499.8,
  "finalAmount": 1999.2,
  "couponCode": "LAUNCH20"
}
```

---

### GET /api/payments/credit-addons

List available credit addon packages.

---

### POST /api/payments/credit-addons

Purchase additional credits.

---

### GET /api/payments/invoice/[id]

Download a specific invoice as PDF.

---

### POST /api/payments/webhook/stripe

Stripe webhook endpoint. Verifies signature and processes events.

**Authentication**: Stripe signature verification (no JWT required)

---

### POST /api/payments/webhook/razorpay

Razorpay webhook endpoint. Verifies signature using `crypto.timingSafeEqual`.

**Authentication**: Razorpay HMAC-SHA256 signature verification (no JWT required)

---

### POST /api/payments/webhook-replay

Replay a previously received webhook event.

---

### GET /api/payments/stripe-portal

Get a Stripe Customer Portal URL for managing billing.

---

## Subscriptions

### GET /api/subscriptions/current

Get current subscription status, plan details, trial info, and credit balance.

**Authentication**: Required

**Response (200)**:
```json
{
  "subscription": {
    "id": "clx...",
    "plan": "pro",
    "status": "active",
    "currentPeriodStart": "2026-01-01T00:00:00Z",
    "currentPeriodEnd": "2026-02-01T00:00:00Z",
    "cancelAtPeriodEnd": false,
    "scheduledPlanChange": null
  },
  "planDetails": {
    "name": "Pro",
    "credits": 200,
    "features": ["lead_discovery", "deep_analysis", "outreach_generation", "workflow_access"]
  },
  "trialInfo": {
    "isTrial": false,
    "trialEndsAt": null,
    "isActive": true,
    "isExpired": false,
    "hasUsedTrial": true,
    "daysRemaining": 0
  },
  "creditBalance": {
    "total": 150,
    "monthly": 200,
    "rollover": 0,
    "addons": 0,
    "plan": "pro",
    "percentage": 75
  }
}
```

---

### GET /api/subscriptions/entitlements

Get plan entitlements and feature limits for the current user.

---

### GET /api/subscriptions/trial

Get detailed trial status.

---

### GET /api/subscriptions/usage

Get feature usage for the current billing period.

---

### GET /api/subscriptions/upgrade-preview

Preview an upgrade including prorated charges and new credit allocation.

**Query Parameters**:
| Param | Type | Description |
|-------|------|-------------|
| `plan` | string | Target plan (`pro`, `elite`) |
| `billingCycle` | string | `monthly` or `yearly` |

---

### GET /api/subscriptions/downgrade-preview

Preview a downgrade including effective date and credit changes.

**Query Parameters**:
| Param | Type | Description |
|-------|------|-------------|
| `plan` | string | Target plan (`free`, `pro`) |

---

## Settings

### GET /api/settings/profile

Get user profile information.

**Authentication**: Required

**Response (200)**:
```json
{
  "profile": {
    "name": "John Doe",
    "email": "john@example.com",
    "phone": "+1234567890",
    "country": "US",
    "company": "Acme Inc",
    "timezone": null,
    "avatar": "https://..."
  }
}
```

---

### PUT /api/settings/profile

Update user profile.

**Request Body**:
```json
{
  "name": "John Doe",
  "phone": "+1234567890",
  "country": "US",
  "avatar": "https://..."
}
```

---

### PUT /api/settings/password

Change password. Requires current password.

**Request Body**:
```json
{
  "currentPassword": "OldP@ss1",
  "newPassword": "NewP@ss2"
}
```

---

### GET /api/settings/notifications

Get notification preferences.

---

### PUT /api/settings/notifications

Update notification preferences.

**Request Body**:
```json
{
  "inAppEnabled": true,
  "emailEnabled": true,
  "telegramEnabled": false,
  "whatsappEnabled": false,
  "dndStartTime": "22:00",
  "dndEndTime": "07:00",
  "dndTimezone": "America/New_York"
}
```

---

### GET /api/settings/sessions

List active sessions.

---

### POST /api/settings/sessions/revoke-all

Revoke all active sessions (sign out all devices).

---

### GET /api/settings/api-keys

List API keys (key values are masked).

---

### POST /api/settings/api-keys

Create a new API key.

**Request Body**:
```json
{
  "name": "Integration Key",
  "scopes": ["leads:read", "leads:write"],
  "expiresInDays": 90
}
```

---

### GET /api/settings/api-keys/[id]

Get a specific API key.

---

### DELETE /api/settings/api-keys/[id]

Revoke an API key.

---

### POST /api/settings/api-keys/[id]/rotate

Rotate an API key (generates a new key value).

---

### POST /api/settings/api-keys/[id]/revoke

Revoke an API key (alias for DELETE).

---

### GET /api/settings/api-keys/analytics

Get API key usage analytics.

---

### GET /api/settings/api-keys/docs

Get API key documentation and scopes.

---

### GET /api/settings/org

Get organization settings.

---

### PUT /api/settings/org

Update organization settings.

---

### GET /api/settings/org/branding

Get organization branding settings.

---

### PUT /api/settings/org/branding

Update organization branding (primary color, accent color, logo, hide default branding).

---

### GET /api/settings/org/white-label

Get white-label configuration.

---

### PUT /api/settings/org/white-label

Update white-label configuration.

---

### GET /api/settings/org/invites

List organization invitations.

---

### POST /api/settings/org/invites

Invite a user to the organization.

**Request Body**:
```json
{
  "email": "newuser@example.com",
  "role": "member"
}
```

---

### DELETE /api/settings/org/invites/[id]

Cancel or remove an organization invitation.

---

### POST /api/settings/team/invite

Invite a team member (alias for org invites).

---

### POST /api/settings/clear-data

Request account data deletion.

---

## Credits

### GET /api/credits

Get credit balance, warning status, and plan entitlements.

**Authentication**: Required (`billing:read`)

**Response (200)**:
```json
{
  "credits": 150,
  "creditsMonthly": 200,
  "rolloverCredits": 0,
  "addonCredits": 0,
  "plan": "pro",
  "isTrial": true,
  "creditWarning": "ok",
  "percentage": 75,
  "creditActionEntitlements": {
    "lead_discovery": { "cost": 5, "enabled": true, "limit": null },
    "deep_analysis": { "cost": 10, "enabled": true, "limit": null },
    "outreach_generation": { "cost": 3, "enabled": true, "limit": null },
    "competitor_analysis": { "cost": 8, "enabled": true, "limit": null },
    "website_analysis": { "cost": 5, "enabled": true, "limit": null },
    "ai_chat_message": { "cost": 1, "enabled": true, "limit": null },
    "lead_enrichment": { "cost": 3, "enabled": true, "limit": null },
    "broadcast_message": { "cost": 1, "enabled": true, "limit": null }
  }
}
```

**Credit Warning Levels**:
- `ok` — Above 20% of monthly allocation
- `low` — Below 20% of monthly allocation
- `zero` — No credits remaining

---

### POST /api/credits

Deduct credits for an action. Uses atomic, idempotent operations.

**Authentication**: Required (`billing:write`)

**Request Body**:
```json
{
  "action": "lead_discovery",
  "idempotencyKey": "unique-key-123",
  "referenceId": "clx_lead_id"
}
```

**Valid Actions**: `lead_discovery` (5), `deep_analysis` (10), `outreach_generation` (3), `competitor_analysis` (8), `website_analysis` (5), `ai_chat_message` (1), `lead_enrichment` (3), `broadcast_message` (1)

**Response (200)**:
```json
{
  "success": true,
  "credits": 145,
  "deducted": 5,
  "action": "lead_discovery",
  "alreadyProcessed": false,
  "ledgerEntryId": "clx...",
  "creditWarning": "ok",
  "percentage": 72
}
```

**Error Responses**:
- `400` — Invalid action or missing parameters
- `402` — Insufficient credits (includes `required` and `available` fields)

---

### GET /api/credits/history

Get credit transaction history.

**Query Parameters**:
| Param | Type | Description |
|-------|------|-------------|
| `action` | string | Filter by action type |
| `page` | number | Page number |
| `limit` | number | Items per page |

---

## Deals

### GET /api/deals

List all deals with associated lead information.

**Authentication**: Required (`deals:read`)

**Response (200)**:
```json
[
  {
    "id": "clx...",
    "leadId": "clx_lead...",
    "projectType": "Website Redesign",
    "proposedPrice": 5000,
    "finalPrice": 4500,
    "currency": "USD",
    "status": "negotiation",
    "createdAt": "2026-01-20T10:00:00Z",
    "lead": {
      "id": "clx_lead...",
      "businessName": "Acme Corp",
      "ownerName": "Jane Smith",
      "niche": "SaaS"
    }
  }
]
```

---

### POST /api/deals

Create a new deal.

---

### GET /api/deals/[id]

Get deal details.

---

### PUT /api/deals/[id]

Update a deal (change status, price, etc.).

---

### DELETE /api/deals/[id]

Delete a deal.

---

## Insights

### GET /api/insights

Get comprehensive business insights, analytics, and AI recommendations.

**Authentication**: Required (`insights:read`)

**Response (200)**:
```json
{
  "bestChannels": [
    { "channel": "email", "sent": 150, "replies": 45, "successRate": 30 }
  ],
  "conversionByNiche": [
    { "niche": "SaaS", "total": 30, "won": 8, "rate": 27 }
  ],
  "performanceByCountry": [
    { "country": "US", "leads": 45, "won": 12, "conversion": 27, "replyRate": 45 }
  ],
  "stageFunnel": [
    { "stage": "discovered", "label": "Discovered", "count": 45, "percentage": 29, "color": "#64748b" }
  ],
  "scoreDistribution": [
    { "range": "0-25", "count": 20, "percentage": 13, "fill": "#ef4444" }
  ],
  "weeklyPerformance": [
    { "week": "Jan 6", "newLeads": 12, "dealsClosed": 2 }
  ],
  "avgDealValue": 4500,
  "avgClosedDealValue": 5200,
  "replyRate": 30,
  "closeRate": 25,
  "topLeadsToContact": [
    { "id": "clx...", "businessName": "Acme Corp", "avgScore": 72, "bestChannel": "email" }
  ],
  "followUpsNeeded": [
    { "id": "clx...", "businessName": "Beta Inc", "daysSinceContact": 5, "bestChannel": "whatsapp" }
  ],
  "urgentOpportunities": [
    { "id": "clx...", "businessName": "Gamma LLC", "urgencyScore": 85, "stage": "discovered" }
  ],
  "dealPipeline": {
    "draft": 3, "sent": 5, "reviewed": 2, "negotiation": 4, "accepted": 8, "rejected": 1
  },
  "recommendations": [
    { "id": "rec-followup", "text": "5 lead(s) need follow-up", "priority": "high", "icon": "clock", "actionTab": "outreach" }
  ],
  "sourceEffectiveness": [
    { "source": "google_search", "leadCount": 50, "avgConversionScore": 65, "dealsWon": 5, "pipelineValue": 25000 }
  ],
  "leadScoreHeatmap": [
    { "niche": "SaaS", "country": "US", "avgScore": 72, "leadCount": 15 }
  ],
  "performanceTrends": {
    "leads": { "current": 12, "previous": 8, "trend": 50 },
    "deals": { "current": 3, "previous": 2, "trend": 50 },
    "reply": { "current": 5, "previous": 3, "trend": 67 },
    "pipeline": { "current": 15000, "previous": 12000, "trend": 25 }
  },
  "summary": {
    "totalLeads": 156,
    "totalCommunications": 340,
    "totalDeals": 23,
    "totalPipelineValue": 45000
  }
}
```

---

## Competitor

### GET /api/competitor

List all competitor analyses.

**Authentication**: Required (`competitors:read`)

Requires `competitor_analysis` entitlement.

---

### POST /api/competitor

Create a new competitor analysis using AI.

**Authentication**: Required (`competitors:write`)

**Request Body**:
```json
{
  "competitorName": "CompetitorX",
  "competitorUrl": "https://competitorx.com",
  "yourBusinessName": "My Business",
  "yourWebsiteUrl": "https://mybusiness.com"
}
```

**Response (201)**:
```json
{
  "id": "clx...",
  "competitorName": "CompetitorX",
  "competitorUrl": "https://competitorx.com",
  "seoScore": 65,
  "socialScore": 55,
  "threatLevel": "medium",
  "strengths": ["Established brand", "Good content strategy"],
  "weaknesses": ["Slow website", "Poor mobile UX"],
  "opportunities": ["Underserved niches", "Weak local SEO"],
  "techStack": ["React", "Node.js", "Cloudflare"],
  "pricingModel": "Freemium with paid tiers starting at $29/month",
  "estimatedTrafficTier": "medium",
  "differentiationOpportunities": ["Superior support", "Niche targeting"],
  "analysisData": { ... }
}
```

---

### GET /api/competitor/[id]

Get a specific competitor analysis.

---

### PUT /api/competitor/[id]

Update a competitor analysis.

---

### DELETE /api/competitor/[id]

Delete a competitor analysis.

---

## AI

### POST /api/ai/rag/context

Upload file context for RAG (Retrieval-Augmented Generation).

**Authentication**: Required (`assistant:read`)

**Request Body**:
```json
{
  "userId": "clx...",
  "fileName": "proposal.pdf",
  "fileContent": "Base64 or text content...",
  "mimeType": "application/pdf",
  "leadId": "clx_lead...",
  "metadata": { "source": "upload" }
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `userId` | Yes | User ID |
| `fileName` | Yes | File name |
| `fileContent` | Yes | File content (max 5MB) |
| `mimeType` | No | MIME type |
| `leadId` | No | Associate with a lead |
| `metadata` | No | Additional metadata |

---

### GET /api/ai/rag/context

Get file contexts for a lead.

**Query Parameters**:
| Param | Required | Description |
|-------|----------|-------------|
| `leadId` | Yes | Lead ID |
| `userId` | Yes | User ID |

---

### GET /api/ai/costs

Get AI usage costs and token consumption.

---

### POST /api/ai/vector-search

Perform a vector similarity search across stored contexts.

---

### GET /api/ai/prompts

Get available AI prompt templates.

---

## GDPR

### GET /api/gdpr/dpa

Download the Data Processing Agreement.

---

### GET /api/gdpr/export

Export all user data (full GDPR portability).

**Authentication**: Required

**Rate Limit**: 1 export per 24 hours

**Response (200)**:
```json
{
  "exportId": "clx...",
  "exportDate": "2026-01-20T10:00:00Z",
  "user": { "id": "clx...", "email": "...", "name": "...", "plan": "...", "role": "..." },
  "data": {
    "profile": { ... },
    "sessions": [...],
    "loginHistory": [...],
    "mfaConfig": { ... },
    "subscriptions": [...],
    "creditsLedger": [...],
    "paymentOrders": [...],
    "leads": [...],
    "aiChatSessions": [...],
    "notifications": [...],
    "auditLogs": [...]
  },
  "notice": "This export contains all personal data held by AcquisitionOS..."
}
```

---

### GET /api/gdpr/policies

Get GDPR-related policies and their current versions.

---

### GET /api/gdpr/retention

Get data retention policies and schedules.

---

### POST /api/gdpr/consent

Record or update user consent preferences.

---

### POST /api/gdpr/delete

Request account deletion (GDPR right to be forgotten).

---

## Health

### GET /api/health

Fast health check for load balancers. No authentication required.

**Response (200)**:
```json
{
  "status": "healthy",
  "service": "acquisitionos",
  "version": "2.0.0",
  "timestamp": "2026-01-20T10:00:00Z",
  "latencyMs": 12.34,
  "checks": [
    { "name": "database", "ok": true, "latencyMs": 5.21 },
    { "name": "memory", "ok": true, "latencyMs": 85.5 },
    { "name": "env_vars", "ok": true }
  ]
}
```

**Response (503)** — When any check fails:
```json
{
  "status": "unhealthy",
  "checks": [
    { "name": "database", "ok": false, "error": "Connection refused" }
  ]
}
```

---

### GET /api/health/detailed

Detailed health check with component-level status. No authentication required.

**Response (200)**:
```json
{
  "status": "healthy",
  "version": "2.0.0",
  "environment": "production",
  "uptime": 86400,
  "timestamp": "2026-01-20T10:00:00Z",
  "components": {
    "database": { "status": "healthy", "latencyMs": 5.21, "details": "Database connection is active" },
    "memory": { "status": "healthy", "details": "Heap usage normal: 45.2% (180MB / 400MB)", "latencyMs": 250.5 },
    "disk": { "status": "healthy", "details": "Database file: 52.3MB, data directory writable" },
    "process": { "status": "healthy", "details": "Process running for 1d 0h 0m 0s", "latencyMs": 86400000 },
    "envVars": { "status": "healthy", "details": "All critical and recommended environment variables are set" },
    "providers": { "status": "degraded", "details": "Configured: email, google-oauth. Missing: stripe" }
  },
  "metrics": {
    "activeUsers": 42,
    "totalLeads": 1560,
    "queueDepth": 3
  }
}
```

**Component Statuses**: `healthy`, `degraded`, `unhealthy`

---

## Audit

### GET /api/audit

Query audit logs. Admin/owner only.

**Authentication**: Required (admin role)

**Query Parameters**:
| Param | Type | Description |
|-------|------|-------------|
| `userId` | string | Filter by user |
| `action` | string | Filter by action type (partial match) |
| `resource` | string | Filter by resource type |
| `resourceId` | string | Filter by resource ID |
| `startDate` | string (ISO 8601) | Filter from date |
| `endDate` | string (ISO 8601) | Filter to date |
| `ipAddress` | string | Filter by IP address |
| `search` | string | Full-text search |
| `page` | number | Page number |
| `limit` | number | Items per page (max 200) |

**Response (200)**:
```json
{
  "logs": [
    {
      "id": "clx...",
      "userId": "clx_user...",
      "userEmail": "john@example.com",
      "userName": "John Doe",
      "userRole": "owner",
      "action": "lead_updated",
      "details": { "leadId": "clx...", "updatedFields": ["stage", "notes"] },
      "ipAddress": "192.168.1.1",
      "userAgent": "Mozilla/5.0...",
      "resource": "lead",
      "resourceId": "clx_lead...",
      "createdAt": "2026-01-20T10:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 1250,
    "hasMore": true,
    "totalPages": 25
  },
  "filters": {
    "actions": ["signin", "signout", "lead_created", "lead_updated", "payment_initiated"],
    "resources": ["auth", "lead", "payment", "workflow"]
  }
}
```

---

### GET /api/audit/export

Export audit logs as CSV.

**Authentication**: Required (admin role)

---

## Admin

### GET /api/admin/backup

List available backups.

**Authentication**: Required (admin role)

---

### POST /api/admin/backup

Trigger a manual backup.

---

### GET /api/admin/backup/[id]

Get backup details or download.

---

### POST /api/admin/backup/[id]

Restore from a backup.

---

### GET /api/metrics/dashboard

Get comprehensive monitoring dashboard data (system health, API metrics, database metrics, business metrics, alerts, logs, traces).

**Authentication**: Required (admin role)

**Response (200)**:
```json
{
  "system": {
    "cpu": { "usage": 35 },
    "memory": { "total": 16384, "used": 8192, "percentage": 50, "rss": 512 },
    "uptime": 86400
  },
  "api": {
    "requests": { "total": 15000, "lastHour": 250 },
    "errors": { "rate": 0.02, "total5xx": 12 },
    "responseTime": { "p50": 120, "p95": 450, "p99": 1200 },
    "statusCodes": { "200": 14000, "400": 500, "401": 200, "500": 12 },
    "topEndpoints": [...],
    "slowEndpoints": [...]
  },
  "database": {
    "queries": { "total": 45000, "slow": 23 },
    "operationBreakdown": { "SELECT": 30000, "INSERT": 8000, "UPDATE": 5000, "DELETE": 2000 },
    "slowQueries": [...]
  },
  "business": {
    "activeUsers": 42,
    "leads": 1560,
    "deals": 23,
    "credits": { "consumed": 12000, "remaining": 8000 },
    "workflows": { "active": 15, "running": 3 }
  },
  "alerts": { "active": [], "summary": { "critical": 0, "high": 0, "medium": 1, "low": 2 } },
  "logs": [...],
  "traces": [...]
}
```

---

## SSE Event Streams

### GET /api/events/payments

Server-Sent Events stream for payment events.

---

### GET /api/events/messages

SSE stream for new message events.

---

### GET /api/events/ai

SSE stream for AI processing events.

---

### GET /api/events/notifications

SSE stream for notification events.

---

### GET /api/events/workflows

SSE stream for workflow execution events.

---

## Entitlements

### GET /api/entitlements

Get all entitlements for the current user's plan.

---

### GET /api/entitlements/quota

Get feature quota usage for the current billing period.

---

### POST /api/entitlements/check-credits

Check if a user has enough credits for a specific action.

---

## Billing

### GET /api/billing/analytics

Get billing analytics (revenue, MRR, churn).

---

### POST /api/billing/recovery

Recover a failed or abandoned payment.

---

## Cron

### POST /api/cron/expire-api-keys

Cron job endpoint to expire API keys past their expiration date.

**Response (200)**:
```json
{
  "success": true,
  "expired": 3,
  "errors": 0
}
```

---

*Last updated: 2026-03-05 • AcquisitionOS v3.0.0*
