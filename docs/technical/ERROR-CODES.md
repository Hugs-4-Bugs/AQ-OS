# Error Codes — AcquisitionOS

> Owner: Engineering. Status: Living document. Last reviewed: 2026-09-09.
> Source: every API route returns JSON `{ error: string, code?: string }` with an HTTP status. This document catalogues the codes by category.

## HTTP Status Code Conventions

| Status | Meaning | When we use it |
|---|---|---|
| 200 | OK | Successful GET / successful POST that returns a resource |
| 201 | Created | Successful POST that creates a resource |
| 204 | No Content | Successful DELETE / successful action with no body |
| 400 | Bad Request | Validation failure, missing required field, malformed body |
| 401 | Unauthorized | Missing/invalid session or API key |
| 402 | Payment Required | Insufficient credits |
| 403 | Forbidden | Authenticated but not allowed (wrong role, dev-only in prod, MFA required) |
| 404 | Not Found | Resource doesn't exist or not owned by user |
| 405 | Method Not Allowed | Wrong HTTP method on a known path |
| 409 | Conflict | Concurrent update, duplicate unique field |
| 429 | Too Many Requests | Rate limit (per-IP auth, per-API-key) or monthly lead quota |
| 500 | Internal Server Error | Unhandled exception (logged) |
| 502 | Bad Gateway | Upstream provider failure (SMTP, Stripe, Google API) |
| 503 | Service Unavailable | Email service not configured, AI provider down |
| 504 | Gateway Timeout | Long-running job timed out |

## Error Code Catalog (alphabetical by `code`)

### AUTH
| `code` | HTTP | Message | Cause | Fix |
|---|---|---|---|---|
| `AUTH_INVALID_CREDENTIALS` | 401 | "Invalid email or password" | Wrong password / no such user | User retries; we don't reveal which |
| `AUTH_EMAIL_NOT_VERIFIED` | 401 | "Email not verified" | Sign-in attempt before OTP verification | User clicks the verify link / enters OTP |
| `AUTH_OTP_INVALID` | 400 | "Invalid or expired OTP" | Wrong OTP / expired | User requests a new OTP |
| `AUTH_OTP_LOCKED` | 429 | "Too many attempts. Account locked." | 5+ failed OTP attempts | Wait `otpLockedUntil` or contact support |
| `AUTH_MAGIC_LINK_INVALID` | 400 | "Invalid or expired magic link" | Token mismatch / already used / expired | Request a new magic link |
| `AUTH_MAGIC_LINK_EXPIRED` | 400 | "Magic link has expired" | >15 min since request | Request a new magic link |
| `AUTH_SESSION_EXPIRED` | 401 | "Session expired" | Access-token JWT expired | `use-token-refresh` hook calls `/api/auth/refresh` |
| `AUTH_MFA_REQUIRED` | 403 | "MFA code required" | User has MFA enabled, didn't provide TOTP | Client prompts for MFA |
| `AUTH_MFA_INVALID` | 400 | "Invalid MFA code" | Wrong TOTP / wrong backup code | Retry; if backup codes exhausted, contact support |
| `AUTH_ACCOUNT_INACTIVE` | 403 | "Account is not active" | `User.isActive=false` (post-Google-backfill this is rare) | Contact support |

### RATE LIMIT / QUOTA
| `code` | HTTP | Message | Cause | Fix |
|---|---|---|---|---|
| `RATE_LIMITED` | 429 | "Rate limit exceeded" | >N requests/hour for this API key or >5 auth/min for this IP | Wait for `X-RateLimit-Reset`; upgrade plan for higher limit |
| `LEAD_LIMIT_EXCEEDED` | 429 | "Monthly lead limit exceeded for your plan" | API-key-created leads this month ≥ plan limit (Free 50, Pro 500, Elite 2000) | Wait for next month, buy add-on, or upgrade |
| `CREDITS_INSUFFICIENT` | 402 | "Insufficient credits. Need X, have Y." | Action cost > credit balance | Buy credit pack or upgrade |

### VALIDATION
| `code` | HTTP | Message | Cause | Fix |
|---|---|---|---|---|
| `VALIDATION_ERROR` | 400 | (varies) | Missing required field, wrong type, malformed body | Client fixes the request |
| `INVALID_EMAIL` | 400 | "Invalid email format" | `validateEmail` failed | Client corrects the email |
| `INVALID_DATE_FORMAT` | 400 | "Invalid date format. Use ISO 8601." | Date not parseable | Client sends ISO-8601 |
| `INVALID_DURATION` | 400 | "Meeting duration must be between 5 and 480 minutes" | Out-of-range duration | Client corrects |
| `INVALID_WORKING_DAYS` | 400 | "Working days must be an array of numbers 1-7" | Bad shape | Client corrects |
| `INVALID_AUTONOMY_MODE` | 400 | "Autonomy mode must be one of: approval, assisted, autonomous" | Bad value | Client corrects |

### LEADS / OUTREACH
| `code` | HTTP | Message | Cause | Fix |
|---|---|---|---|---|
| `LEAD_NOT_FOUND` | 404 | "Lead not found" | ID doesn't exist or not owned by user | Client checks the ID |
| `LEAD_NO_EMAIL` | 400 | "This lead has no email address on file. Add an email to the lead before sending outreach." | `lead.email` empty | User adds an email to the lead |
| `OUTREACH_GENERATION_FAILED` | 500 | "Failed to generate outreach" | AI provider error | Retry; if persistent, contact support |
| `EMAIL_SEND_FAILED` | 502 | "Failed to send email: <SMTP error>" | SMTP/Resend returned an error | See the message; check SMTP creds / Gmail quota |
| `EMAIL_NOT_CONFIGURED` | 503 | "Email delivery is not configured on the server. Contact support." | `isEmailServiceConfigured()` false | Admin sets SMTP_USER/PASSWORD or RESEND_API_KEY |

### MEETINGS / CALENDAR
| `code` | HTTP | Message | Cause | Fix |
|---|---|---|---|---|
| `CALENDAR_NOT_CONNECTED` | 400 | "Google Calendar is not connected. Please connect your Google Calendar to create Google Meet meetings." | No `GoogleCalendarToken` for user | User connects Calendar |
| `CALENDAR_TOKEN_EXPIRED` | 401 | "Calendar token expired. Please reconnect your Google Calendar." | Refresh failed | User reconnects |
| `MEETING_SLOT_BUSY` | 409 | "The requested time is busy on your calendar." | (Planned — not yet enforced on creation) | User picks another slot |
| `MEETING_NOT_FOUND` | 404 | "Meeting not found" | ID doesn't exist / not owned | Client checks the ID |
| `MEETING_IN_PAST` | 400 | "Cannot schedule meetings in the past" | Start time < now | Client corrects |
| `MEETING_END_BEFORE_START` | 400 | "End date must be after start date" | endDateTime <= startDateTime | Client corrects |

### BILLING / PAYMENTS
| `code` | HTTP | Message | Cause | Fix |
|---|---|---|---|---|
| `PAYMENT_STRIPE_NOT_CONFIGURED` | 500 | "Stripe is not configured. Set STRIPE_SECRET_KEY." | Missing `STRIPE_SECRET_KEY` | Admin sets the key |
| `PAYMENT_CONFIRM_DISABLED` | 403 | "Direct payment confirmation is disabled in production. Subscriptions are activated automatically by the Stripe/Razorpay webhook." | `/api/payments/confirm` called in prod | Client relies on the webhook; don't call this endpoint in prod |
| `PAYMENT_WEBHOOK_INVALID` | 400 | "Invalid webhook signature" | Stripe signature mismatch | Admin verifies `STRIPE_WEBHOOK_SECRET` |
| `PAYMENT_WEBHOOK_ALREADY_PROCESSED` | 200 | (idempotent) | Stripe retried a processed event | No action |
| `COUPON_INVALID` | 400 | "Invalid or expired coupon" | Code not found / expired / max-redemptions hit | Client removes the coupon |
| `PLAN_NOT_ELIGIBLE` | 400 | "Not eligible for this plan change" | Trial rules / current-plan constraints | Client uses the eligibility endpoint first |

### INTEGRATIONS
| `code` | HTTP | Message | Cause | Fix |
|---|---|---|---|---|
| `GOOGLE_OAUTH_NOT_CONFIGURED` | 503 | "Google OAuth is not configured" | Missing `GOOGLE_CLIENT_ID` | Admin sets the key |
| `GMAIL_NOT_CONNECTED` | 400 | "Gmail is not connected" | No `EmailAccount` for user | User connects Gmail |
| `GMAIL_QUOTA_EXCEEDED` | 429 | "Gmail daily sending limit exceeded" | Gmail 5.4.5 | Wait until tomorrow or use SMTP/Resend |
| `TELEGRAM_NOT_CONNECTED` | 400 | "Telegram is not connected" | No `TelegramConfig` | User connects Telegram |
| `WHATSAPP_NOT_VERIFIED` | 400 | "WhatsApp number not verified" | OTP not verified | User verifies via OTP |

### WORKFLOWS
| `code` | HTTP | Message | Cause | Fix |
|---|---|---|---|---|
| `WORKFLOW_NOT_FOUND` | 404 | "Workflow not found" | ID doesn't exist / not owned | Client checks the ID |
| `WORKFLOW_VALIDATION_FAILED` | 400 | (varies) | Bad step config | Client fixes the workflow |
| `WORKFLOW_EXECUTION_FAILED` | 500 | "Workflow execution failed" | Step threw | Check `WorkflowLog`; replay from DLQ |
| `WORKFLOW_DLQ_ITEM_NOT_FOUND` | 404 | "Dead-letter item not found" | ID doesn't exist | Client checks the ID |

### API KEYS
| `code` | HTTP | Message | Cause | Fix |
|---|---|---|---|---|
| `API_KEY_INVALID` | 401 | "Invalid API key" | Hash mismatch / revoked / expired | Client rotates the key |
| `API_KEY_EXPIRED` | 401 | "API key expired" | `expiresAt` passed | Client creates a new key |
| `API_KEY_SCOPE_INSUFFICIENT` | 403 | "Insufficient scope" | Key lacks the required scope | Client creates a key with the right scope |
| `API_KEY_LIMIT_EXCEEDED` | 429 | "Maximum API keys for your plan" | `PLAN_KEY_LIMITS` hit (Free 1, Pro 5, Elite 50) | Revoke an unused key or upgrade |
| `API_KEY_NAME_TAKEN` | 409 | "An API key with this name already exists" | Duplicate name | Rename |

### ADMIN / OPS
| `code` | HTTP | Message | Cause | Fix |
|---|---|---|---|---|
| `ADMIN_REQUIRED` | 403 | "Admin access required" | Non-admin hit an admin endpoint | Use an admin account |
| `BACKUP_FAILED` | 500 | "Backup failed" | Backup script error | Check logs; retry |
| `REFUND_FAILED` | 502 | "Refund failed" | Stripe refund API error | Check Stripe dashboard; retry |

### CRON
| `code` | HTTP | Message | Cause | Fix |
|---|---|---|---|---|
| `CRON_UNAUTHORIZED` | 401 | "Unauthorized" | Missing/wrong `Authorization: Bearer <CRON_SECRET>` | Verify the secret |
| `CRON_ERROR` | 500 | (varies) | Job threw | Check logs; the job is idempotent (safe to re-run) |

### GENERIC
| `code` | HTTP | Message | Cause | Fix |
|---|---|---|---|---|
| `NOT_FOUND` | 404 | "Not found" | Generic 404 | Client checks the path |
| `INTERNAL_ERROR` | 500 | "Internal server error" | Unhandled exception | Logged; user retries; if persistent, support |
| `SERVICE_UNAVAILABLE` | 503 | "Service unavailable" | AI provider / SMTP / upstream down | Retry with backoff |
| `BAD_GATEWAY` | 502 | "Upstream provider failure" | Stripe / Google / SMTP error | See the message; retry |

## Error Response Shape

```json
{
  "error": "Insufficient credits. Need 5, have 2.",
  "code": "CREDITS_INSUFFICIENT",
  "required": 5,
  "balance": 2,
  "action": "discovery"
}
```

Not all responses include `code` or extra fields; the `code` is included for the catalogued errors above so clients can branch on it.

## Client Guidance

- **401 (AUTH_*)**: the `use-token-refresh` hook auto-refreshes once; if refresh fails, the user is redirected to sign-in. Don't auto-reload the page (the old `setTimeout(reload,1500)` was removed — ADR).
- **429 (RATE_LIMITED / LEAD_LIMIT_EXCEEDED)**: respect `X-RateLimit-Reset` (Unix timestamp). For monthly lead quota, show the upgrade CTA.
- **402 (CREDITS_INSUFFICIENT)**: show the buy-credits CTA + the cost preview so the user knows what they're buying.
- **502 / 503**: retry with exponential backoff (1s, 2s, 4s); surface the underlying message to the user if it persists.

---

*See also: [API-REFERENCE.md](API-REFERENCE.md), [DEBUGGING-GUIDE.md](../developer/DEBUGGING-GUIDE.md), [TROUBLESHOOTING-GUIDE.md](../support/TROUBLESHOOTING-GUIDE.md).*
