# Security Policy — AcquisitionOS

> Owner: Engineering + Security. Status: Living document. Last reviewed: 2026-09-09.
> Source: `src/lib/security/*`, `src/lib/auth.ts`, `src/lib/auth-middleware.ts`, `src/proxy.ts`, `prisma/schema.prisma`.

## 1. Overall Security Posture

AcquisitionOS is a **B2B SaaS handling PII (user + lead contact data) and payment information**. Security is treated as a first-class product requirement, not an afterthought. The posture is:

- **Defence in depth** — multiple layers (network, proxy, auth, RBAC, input validation, audit log). No single layer is trusted alone.
- **Least privilege** — every role, API key scope, and DB access path is granted the minimum needed.
- **Assume breach** — design so that a compromise of one layer doesn't cascade (per-user email sending, per-key scopes, isolated sessions).
- **Audit everything** — `AuditLog` is append-only; security-relevant actions (login, MFA change, key rotation, payment, data export) are recorded.
- **Fail safe** — errors default to denying access, not granting it.

## 2. What Is Protected and How

| Asset | Threat | Protection |
|---|---|---|
| User passwords | Theft, brute force | bcrypt-hashed (`src/lib/auth.ts` `hashPassword`); never logged; never returned by any API |
| User sessions | Hijack, CSRF | httpOnly + Secure + SameSite=strict cookies; 15-min access / 30-day refresh; refresh-token rotation; revocable sessions (`UserSession` table) |
| MFA secrets | Theft | TOTP secret stored in `MfaConfig`; backup codes bcrypt-hashed; never returned after setup |
| API keys | Theft, misuse | SHA-256 hashed (`ApiKey.keyHash`); scoped (`scopes` JSON); rate-limited per key; expiry; rotate/revoke; revealed ONCE at creation |
| Lead / prospect data | Data exfiltration | Per-user ownership (`lead.userId`); RBAC on every route; `withAuth` enforces; audit log on access? (partial — see gaps) |
| Payment data | Theft, fraud | Stripe/Razorpay hold the card data; we never see it. Webhooks are signature-verified + idempotent. `PaymentOrder` holds only the provider order ID, never the card. |
| OAuth tokens (Gmail, Calendar) | Theft | AES-256-GCM encrypted at rest (`src/lib/encryption.ts`, `src/lib/crypto.ts`); `googleCalendarToken.accessToken`, `emailAccount.accessToken` encrypted |
| Email content (outreach, replies) | Interception, leak | Transport: SMTP TLS / HTTPS (Gmail API / Resend). At rest: stored in `Communication` / `EmailMessage` (plaintext — see gaps) |
| Audit logs | Tampering | Append-only; no UPDATE/DELETE on `AuditLog` (enforced by Prisma model — no update/delete routes exist) |
| Secrets / env vars | Leak | Stored in `.env` (chmod 600); `env-safeguard.ts` validates on boot; never logged; `email-ethereal.ts` redacts in logs |
| Admin endpoints | Privilege escalation | `withAuth` + role check (`admin`); `CRON_SECRET` for cron endpoints; admin endpoints under `/api/admin/*` |
| Public endpoints (webhooks, OAuth callbacks) | Forgery | Stripe signature verification; Google Pub/Sub token verification; OAuth `state` parameter (CSRF) |

## 3. Who Is Responsible for Security

- **Engineering team** — implements + maintains the security controls; reviews every PR for security (see [CODE-REVIEW-CHECKLIST.md](../developer/CODE-REVIEW-CHECKLIST.md)).
- **Product owner** — prioritises security work; approves the security roadmap.
- **Platform operator (Ananya persona)** — monitors alerts, runs the on-call rotation, responds to incidents (see [INCIDENT-RESPONSE-PLAN.md](INCIDENT-RESPONSE-PLAN.md)).
- **Every user** — keeps their password + MFA + API keys secret; reports suspicious activity.
- **External researcher** — see [Reporting a Vulnerability](#4-how-to-report-a-vulnerability) below.

## 4. How to Report a Vulnerability

**Email:** `security@acquisitionos.com` (replace with the real address when published).
**PGP:** (publish a key when the program launches).
**Response SLA:** 48 hours for acknowledgement, 7 days for a fix-or-explanation, 90 days for public disclosure (coordinated).

**What to include:**
- Affected endpoint / file / version.
- Steps to reproduce (PoC if possible).
- Impact assessment (who can do what).
- Your suggested fix (optional).

**What we promise:**
- We will not pursue legal action against good-faith reporters.
- We will credit reporters in the changelog (unless they prefer to remain anonymous).
- We will coordinate disclosure timing.

**Out of scope:**
- Social engineering of our team.
- Physical attacks on our infrastructure.
- Denial-of-service against production (test against a local instance).
- Automated scanner output without a verified finding.

## 5. Security Controls Inventory

### Authentication
- bcrypt password hashing.
- Email verification via OTP.
- Passwordless login OTP + Magic Link (15-min TTL, single-use).
- Google OAuth 2.0 with `state` CSRF protection + cross-domain relay JWT (60s TTL).
- TOTP MFA with backup codes.
- Account lockout after 5 failed OTP attempts (`otpLockedUntil`).
- Known-device tracking; security alerts on new devices.

### Authorization
- RBAC: `owner` / `admin` / `member` / `viewer` (Organization + OrgMember).
- Per-route `withAuth` + permission check (`hasPermission` from `src/lib/rbac.ts`).
- Dual auth: session OR API key (`withDualAuth`); API keys have scopes.
- Entitlement gating: `src/lib/entitlement-middleware.ts` + `plan-gates.ts` enforce plan limits (credits, monthly leads, API rate).
- Per-user data ownership: `lead.userId`, `meeting.userId`, etc. — queries always filter by the authenticated user.

### Input Validation
- `src/lib/security/input-validator.ts` — email, phone, URL, JSON validation.
- Zod schemas on most API routes (via `@hookform/resolvers` on the frontend; server-side manual validation in route handlers).
- Prisma parameterised queries (no raw SQL → no SQL injection).
- File upload validation: `src/lib/security/upload-security.ts` (mime, size, magic-byte).

### Rate Limiting
- `src/lib/security/rate-limiter.ts` — in-process (per-IP, per-action). Auth: 5/min. API: per-key (Free 50/hr, Pro 500/hr, Elite 2000/hr).
- Monthly lead quota per API key (Free 50/mo, Pro 500, Elite 2000) — enforced in `POST /api/leads`.
- **Gap:** rate limiter is in-process (not Redis); on multi-instance, a request to instance B isn't counted against instance A. (See [SCALABILITY-PLAN.md](../technical/SCALABILITY-PLAN.md).)

### Crypto
- `src/lib/crypto.ts` — AES-256-GCM for OAuth token encryption at rest.
- `src/lib/encryption.ts` — key derivation.
- bcrypt for passwords + backup codes.
- HS256 for JWTs (`JWT_SECRET`, `JWT_REFRESH_SECRET`).
- HMAC for webhook signatures (Stripe, Google Pub/Sub).

### Logging & Monitoring
- `src/lib/observability/*` — request logs, metrics, traces.
- `src/lib/observability/sentry.ts` — error tracking.
- `AuditLog` — security-relevant actions.
- `SecurityAlert` — suspicious-login alerts.
- `CrashReport` — auto-captured client crashes.

### Headers & Transport
- `src/lib/security/security-headers.ts` — CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy.
- HTTPS enforced in production (cookies `Secure`).
- `src/proxy.ts` (Next 16 proxy) applies headers + routes.

### CSRF
- SameSite=strict cookies (default).
- OAuth `state` parameter.
- Stripe webhook signature verification.
- **Gap:** no CSRF token for state-changing non-OAuth requests; SameSite=strict is the primary defence (acceptable for a same-origin SPA).

### CORS
- `src/lib/security/cors-config.ts` — locked down to the app's origin; dev-only relaxations gated by `NODE_ENV`.

## 6. Security Roadmap (next 6 months)

1. **Redis-backed rate limiter** — current in-process limiter doesn't scale multi-instance.
2. **Outbound webhook signing** — HMAC per endpoint (planned with webhooks).
3. **Audit-log read access** — currently write-only; add a "who accessed what" log for lead PII reads.
4. **Encryption at rest for `Communication` / `EmailMessage`** — currently plaintext in SQLite/PostgreSQL; encrypt the bodies (AES-GCM with a per-user key).
5. **Penetration test** — commission an external pentest; capture findings in [PENETRATION-TESTING-REPORT.md](PENETRATION-TESTING-REPORT.md).
6. **SOC 2 Type 1 readiness** — the org/role/audit-log/backup infrastructure is largely there; formalise the controls + the audit.
7. **DPDP Act full alignment** — data localisation, consent flow, data-fiduciary registration (India).
8. **API versioning v1** — stability contract for external integrators (Liam persona).

## 7. Known Security Gaps (honest, tracked)

See [IMPROVEMENT-RECOMMENDATIONS.md](../IMPROVEMENT-RECOMMENDATIONS.md#section-4--security-improvements) for the full list. The most material:
1. In-process rate limiter (not Redis).
2. PII (lead emails, communication bodies) stored plaintext at rest.
3. No audit-log entry on PII read (only on write).
4. No CSRF token for non-OAuth state changes (SameSite-only defence).
5. Google OAuth callback ignores `mfaConfig.isEnabled` (MFA bypass via Google — see [THREAT-MODEL.md](THREAT-MODEL.md)).
6. `/api/auth/config` hardcodes `googleAvailable: true` (doesn't reflect actual credential presence — defence in depth: credentials validated at token exchange).

---

*See also: [THREAT-MODEL.md](THREAT-MODEL.md), [OWASP-COMPLIANCE.md](OWASP-COMPLIANCE.md), [DATA-PRIVACY-POLICY.md](DATA-PRIVACY-POLICY.md), [INCIDENT-RESPONSE-PLAN.md](INCIDENT-RESPONSE-PLAN.md), [SECRETS-MANAGEMENT.md](SECRETS-MANAGEMENT.md), [PENETRATION-TESTING-REPORT.md](PENETRATION-TESTING-REPORT.md).*
