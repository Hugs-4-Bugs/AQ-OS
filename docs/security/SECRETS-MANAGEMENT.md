# Secrets Management — AcquisitionOS

> Owner: Security + Operations. Status: Living document. Last reviewed: 2026-09-09.
> Source: `.env` (chmod 600), `ensure-env.sh`, `src/lib/env-safeguard.ts`, `src/lib/email-ethereal.ts`, `prisma/schema.prisma`.

## 1. Where Secrets Are Stored

### Production
- **`.env`** at the deployment platform (Aliyun FC / Vercel / Railway / Supabase) — the canonical store. File mode `600` (owner read/write only).
- **`ensure-env.sh`** restores `.env` from a hardcoded template + preserves a set of "preserved" secrets (see §4) when the sandbox wipes the file.
- **`env-safeguard.ts`** validates on boot — refuses to start in production if critical secrets are missing.
- **No secrets in git.** `.env` is gitignored. `.env.example` (if present) has placeholder values only.
- **No secrets in code.** All secrets read via `process.env.*`; no hardcoded keys.
- **No secrets in logs.** `email-ethereal.ts` redacts secrets in the diagnostic logs (`[AUTH-CONFIG] ... SMTP_PASSWORD: SET` — not the value).

### Sub-processors
- **Stripe / Razorpay** hold the card data (we never see it).
- **Google** holds the OAuth user accounts (we hold encrypted OAuth tokens, not Google passwords).
- **Z-AI** is configured at the runtime environment (no per-user key).
- **Resend** holds the API key in `.env`.
- **Sentry** holds the DSN in `.env`.

## 2. The Secrets Inventory

### Critical (compromise = total breach)
| Secret | Where | Purpose | Compromise impact |
|---|---|---|---|
| `JWT_SECRET` | `.env` | Signs access tokens (HS256) | All access tokens forgeable → any user can be impersonated |
| `JWT_REFRESH_SECRET` | `.env` | Signs refresh tokens (HS256) | Refresh tokens forgeable → persistent impersonation |
| `STRIPE_SECRET_KEY` | `.env` | Stripe API access | Charges / refunds / customer data access |
| `STRIPE_WEBHOOK_SECRET` | `.env` | Stripe webhook signature verification | Forged webhooks → free upgrades |
| `RAZORPAY_KEY_SECRET` | `.env` | Razorpay API access | Charges / refunds |
| `GOOGLE_CLIENT_SECRET` | `.env` | Google OAuth token exchange | Forge auth flows, impersonate the OAuth client |
| `CRON_SECRET` | `.env` | Cron endpoint auth (`Bearer` token) | Trigger cron jobs (data mutation: expire keys, run SDR pipeline, etc.) |

### High (compromise = significant damage)
| Secret | Where | Purpose |
|---|---|---|
| `SMTP_PASSWORD` (or `GMAIL_APP_PASSWORD`) | `.env` | Send emails as `SMTP_USER` (Gmail) |
| `RESEND_API_KEY` | `.env` | Send emails via Resend |
| `GOOGLE_SEARCH_API_KEY` | `.env` | Google Custom Search (lead discovery) |
| `SENTRY_DSN` | `.env` | Error reporting |

### Medium (compromise = limited damage)
| Secret | Where | Purpose |
|---|---|---|
| `GOOGLE_SEARCH_CX` | `.env` | Custom Search Engine ID (not really secret; identifies the CSE) |
| `NEXT_PUBLIC_APP_URL` | `.env` | Public URL (public by definition) |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | `.env` | Stripe publishable key (public by design) |

### Not secrets (config)
`DATABASE_URL`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `EMAIL_FROM`, `APP_URL`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET` (medium — used for NextAuth if enabled), `ENABLE_*` flags, `AUTH_*` flags.

## 3. Who Has Access

- **Production `.env`:** the platform's secret manager (Aliyun FC Secrets panel, Vercel env vars, Railway variables, Supabase secrets). Access controlled by the platform's IAM.
- **Engineering:** read access for debugging via break-glass (logged). No standing write access to production secrets.
- **Founder:** full access (the only standing admin until the team grows).
- **CI/CD:** (when formalised) — read access to a subset of secrets for deploy + tests; no write access.
- **Sub-processors:** each has access to their own secrets (Stripe's, Google's, etc.); we manage the relationship, not their access.

## 4. Rotation Procedure

### General rotation steps
1. Generate the new secret.
2. Update the secret in the platform's secret manager + `.env` on the running instance.
3. Restart the app (`keepalive-v2.sh`).
4. Verify the app still works (smoke test: signin, discovery, outreach, payment).
5. Invalidate the old secret (e.g. in Stripe Dashboard, revoke the old API key).
6. Update this document + the changelog.

### `JWT_SECRET` + `JWT_REFRESH_SECRET` rotation (high-impact)
- **Impact:** rotating invalidates ALL active sessions. Every user is signed out; they must sign in again.
- **Procedure:**
  1. Announce a maintenance window (or accept the session-reset cost — it's a 5-minute disruption).
  2. Generate new secrets (`openssl rand -hex 32`).
  3. Update `.env` + restart.
  4. The old sessions fail verification → users see the auth-gate → they sign in again.
  5. The `UserSession` table still has the old (hashed) refresh tokens; they fail verification on next `/api/auth/refresh`; users re-auth.
  6. (Optional) truncate the `UserSession` table to clear stale rows.

### `STRIPE_WEBHOOK_SECRET` rotation
- **Impact:** rotating invalidates in-flight webhook deliveries until the new secret is in `.env` + the Stripe Dashboard endpoint.
- **Procedure:**
  1. In the Stripe Dashboard, create a new webhook endpoint signing secret (or rotate the existing one).
  2. Update `.env` + restart.
  3. Stripe retries any webhooks that failed during the window.

### `GOOGLE_CLIENT_SECRET` rotation
- **Impact:** rotating invalidates the OAuth client; existing Google sessions continue (they have tokens), but new Google sign-ins fail until the new secret is in `.env`.
- **Procedure:**
  1. In Google Cloud Console, create a new OAuth client (or rotate the secret of the existing one — Google now allows this).
  2. Update `.env` + restart.
  3. Test a Google sign-in to verify.

### `CRON_SECRET` rotation
- **Impact:** the external scheduler's requests fail with 401 until updated.
- **Procedure:**
  1. Generate the new secret.
  2. Update `.env` + restart.
  3. Update the external scheduler's configuration (the cron-job-gateway or whatever fires the cron endpoints).
  4. Verify the next cron tick succeeds.

### `SMTP_PASSWORD` / `GMAIL_APP_PASSWORD` rotation
- **Impact:** email delivery fails until updated.
- **Procedure:**
  1. Generate a new App Password in the Google Account (Security → App Passwords).
  2. Update `.env` + restart.
  3. Test via `/api/auth/email-diagnostic` (CRON_SECRET-gated).

### `RESEND_API_KEY` rotation
- In the Resend Dashboard, rotate the key; update `.env` + restart.

### Stripe / Razorpay `SECRET_KEY` rotation
- In the provider's dashboard, rotate the key; update `.env` + restart. Existing charges + refunds are unaffected (they're tied to the account, not the key).

## 5. What to Do If a Secret Is Compromised

### Suspected compromise (e.g. secret in a git commit, a leaked log line, a third-party breach)
1. **Rotate immediately** (use the procedure above).
2. **Investigate** how it leaked (git history, logs, CI, a team member's machine).
3. **Audit** for misuse (Stripe API log, Google OAuth log, audit log for actions taken with the compromised secret).
4. **Notify** affected users if their data was accessed with the compromised secret (see [INCIDENT-RESPONSE-PLAN.md](INCIDENT-RESPONSE-PLAN.md)).
5. **Post-mortem** + fix the leak vector.

### Confirmed compromise with evidence of misuse
- Treat as **SEV-1** per the [INCIDENT-RESPONSE-PLAN.md](INCIDENT-RESPONSE-PLAN.md).
- Rotate the secret + ALL secrets that may have been accessible from the same vector (e.g. if `.env` was dumped, rotate everything).
- Force password reset for all users (if `JWT_SECRET` leaked, all sessions are untrustworthy).
- Notify the supervisory authority within 72 h if PII was involved.

## 6. Secrets That Expire / Need Periodic Rotation

| Secret | Rotation cadence | Reason |
|---|---|---|
| `JWT_SECRET` + `JWT_REFRESH_SECRET` | Yearly (or on team turnover) | Limit the blast radius of a leak |
| `STRIPE_WEBHOOK_SECRET` | On team turnover / suspected leak | Limit forgery window |
| `GOOGLE_CLIENT_SECRET` | On team turnover / suspected leak | Limit OAuth client hijack |
| `CRON_SECRET` | On team turnover / suspected leak | Limit cron-trigger abuse |
| `SMTP_PASSWORD` (Gmail App Password) | Yearly | Google best practice |
| `RESEND_API_KEY` | Yearly / on suspected leak | |
| `STRIPE_SECRET_KEY` / `RAZORPAY_KEY_SECRET` | On team turnover / suspected leak | |
| OAuth tokens (per-user Gmail / Calendar) | Auto-refreshed by `getValidGmailAccessToken` / `getValidCalendarAccessToken`; revoke on user disconnect | |

## 7. Secret Hygiene Rules (for the team)

1. **Never commit a real secret to git.** Pre-commit hook (when added) rejects `.env` + known secret patterns.
2. **Never paste a secret into a chat / screenshot / log.** Use the secret manager.
3. **Never share a secret over email / Slack.** Use the platform's secret-sharing (1Password / Vault when added) or rotate-after-share.
4. **Never log a secret.** `email-ethereal.ts` redacts; audit any new `console.log` that touches `process.env`.
5. **Never hardcode a secret in code.** Always `process.env.SECRET_NAME`.
6. **Rotate on team turnover.** When an engineer with production access leaves, rotate every secret they could have seen.
7. **Treat `.env` as read-only in production.** Updates go through the secret manager + `ensure-env.sh` restore.

## 8. The `ensure-env.sh` Restore Pattern

The sandbox periodically wipes `.env`. `ensure-env.sh` restores it from a hardcoded template (`/home/z/my-project/ensure-env.sh`) **and** preserves a set of "preserved" secrets from the existing `.env` before overwriting:

```bash
PRESERVE_KEYS=(
  SMTP_PASSWORD SMTP_PASS GMAIL_APP_PASSWORD GMAIL_PASSWORD
  RESEND_API_KEY
  STRIPE_SECRET_KEY STRIPE_WEBHOOK_SECRET NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
)
```

This means: **if a secret is added that's not in the preserve list, the next `ensure-env.sh` run will wipe it.** When adding a new secret to `.env`:
1. Add it to the template in `ensure-env.sh` (the `cat > .env << 'INNEOF'` block).
2. If it's a "preserved" secret (one that the user sets via the Secrets panel and shouldn't be reset to the template default), add it to the `PRESERVE_KEYS` array.
3. Update `env-safeguard.ts` if it's a critical secret that should block boot if missing.

## 9. Review Cadence

- **Quarterly** — review the secrets inventory, the rotation schedule, the access list.
- **On team turnover** — rotate every secret the departing member could have seen.
- **On any suspected leak** — rotate immediately.
- **On each new secret added** — update this document + `ensure-env.sh` + `env-safeguard.ts`.

---

*See also: [SECURITY-POLICY.md](SECURITY-POLICY.md), [INCIDENT-RESPONSE-PLAN.md](INCIDENT-RESPONSE-PLAN.md), [DATA-PRIVACY-POLICY.md](DATA-PRIVACY-POLICY.md), `docs/04-secrets-and-configuration/ALL-SECRETS.md`.*
