# Gmail SMTP Setup Guide

Exact steps to make AcquisitionOS send email (OTP codes, magic links, outreach, invoices, notifications) through Gmail. **This was completed and verified for this deployment** — SMTP AUTH SUCCESS, `emailConfigured:true`. This doc preserves the procedure.

## 1. Enable 2-Factor Authentication (prerequisite)

Google only issues App Passwords to accounts with 2-Step Verification:

1. Go to [myaccount.google.com/security](https://myaccount.google.com/security).
2. **2-Step Verification → Turn on** (follow the prompts; any second factor works).

Without this, step 2 will simply not offer App Passwords.

## 2. Generate the Gmail App Password

1. Go to [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords) (Security → 2-Step Verification → App passwords).
2. Create a password named e.g. `acquisitionos`.
3. Google displays **16 characters in 4 groups**, e.g.:

```
abcd efgh ijkl mnop
```

4. **Store it WITHOUT spaces** in `SMTP_PASSWORD`: `abcdefghijklmnop` (use YOUR generated value — never commit the real password to docs or git). (The display grouping is cosmetic; the server must receive the 16-char string.)

## 3. Login Password vs App Password

| | Gmail login password | App Password |
|---|---|---|
| Purpose | Signs you into Google | Authenticates ONE app over SMTP/IMAP |
| Length/form | User-chosen | 16 chars, generated |
| Scope | Full account | Mail only, revocable independently |
| Needed here | **NO — never put it in SMTP_PASSWORD** | **YES** |

Why required: Google blocks "less secure apps" and basic SMTP auth with the main password; App Passwords are the sanctioned way for server-side mail (when 2FA is on).

## 4. SMTP Settings for the App

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-gmail-address@gmail.com     # the mailbox that owns the app password
SMTP_PASSWORD=abcdefghijklmnop             # YOUR 16-char app password, no spaces
EMAIL_FROM=your-gmail-address@gmail.com    # same as SMTP_USER for Gmail
```

- `587` = STARTTLS (nodemailer config in `src/lib/email-ethereal.ts` uses secure=false + STARTTLS upgrade on this port; 465 implicit TLS also works for Gmail but 587 is what's configured).
- `EMAIL_FROM` MUST equal `SMTP_USER` for Gmail — a different From address causes SPF/DKIM/relay rejections.
- Canonical variable names are `SMTP_USER`/`SMTP_PASSWORD`. The reader accepts aliases (`SMTP_USERNAME`, `GMAIL_USER`, `EMAIL_*`, `MAIL_*`, `SMTP_PASS`, `GMAIL_APP_PASSWORD`, …) but prefer canonical to avoid confusion in diagnostics.

## 5. Test That SMTP Works

```bash
# 1. Capability flag (server running):
curl -s http://localhost:3000/api/auth/config
# → {"googleAvailable":true,"emailConfigured":true}   ← emailConfigured must be true

# 2. Real transport handshake:
node scripts/smtp-verify.js     # standalone nodemailer verify() → expect: SMTP AUTH SUCCESS

# 3. End-to-end: request a login OTP from the UI and confirm the email arrives.

# 4. Diagnostics in server logs at boot:
#    [SMTP-Env-Diag] user : SMTP_USER=SET …
#    [SMTP-Env-Diag] pass : SMTP_PASSWORD=SET …   (shows alias names SET/MISSING, never values)
```

After changing env vars, **restart the server** (env is read at boot).

## 6. Common SMTP Errors and What They Mean

| Error (from nodemailer / Gmail) | Meaning | Fix |
|---|---|---|
| `535 5.7.8 Username and Password not accepted` / `Invalid credentials` | App password wrong (typo, spaces left in) or using the LOGIN password | Re-copy the 16-char password, no spaces, into `SMTP_PASSWORD` |
| `534 5.7.9 Application-specific password required` | Using the account password instead of an App Password | Generate an App Password (step 2) |
| `535 5.7.1 Please log in with your web browser` | Google flagged the sign-in (new region/IP) | Complete the "unusual sign-in" prompt in the Gmail web UI, then retry |
| `ECONNREFUSED` / `ETIMEDOUT` | Outbound port 587 blocked (some sandboxes/hosts) | Check firewall/egress; try 465 with TLS on hosts that allow it |
| `550 5.4.1 Relaying denied` / sender rejected | `EMAIL_FROM` ≠ `SMTP_USER` domain | Set `EMAIL_FROM` to the same Gmail address |
| `421 4.7.0 Too many connections` | Sending volume/rate throttled | Back off, check `Gmail sending limits` below |
| `self signed certificate` chain errors | MITM proxy intercepting TLS | Use a host with clean egress |
| `emailConfigured:false` in `/api/auth/config` | Neither Resend nor SMTP vars resolve | Verify names/values, restart server |

## 7. Gmail Sending Limits

| Account type | Limit |
|---|---|
| Free Gmail | **500 recipients/day** (and ~20 msgs/hour for heavy attachments) |
| Google Workspace | **2,000/day** (external) |

Exceeding triggers temporary blocks (usually 24h). For production outreach volume, either upgrade to Workspace or switch the transport tier to **Resend** (`RESEND_API_KEY`, higher programmatic limits) — the email chain prefers Resend automatically when its key is present. Bounced/limit errors are captured in `EmailBounce` and surfaced in email analytics.

## 8. Security Notes

- The app password grants **mail access to that mailbox** — for the SMTP user mailbox only, revoke from the same App passwords page if leaked.
- Never commit real credentials; they belong in the secrets panel / `.env` (which is wiped periodically in the GLM sandbox — `ensure-env.sh` re-applies the canonical values from the template).
- Diagnostics intentionally log only SET/MISSING per alias — never values.
