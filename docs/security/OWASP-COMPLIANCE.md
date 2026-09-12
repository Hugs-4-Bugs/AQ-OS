# OWASP Top 10 Compliance — AcquisitionOS

> Owner: Security. Status: Living document. Last reviewed: 2026-09-09.
> Reference: OWASP Top 10 (2021). For each: the risk, what is implemented to mitigate it, and what is still missing.

## A01 — Broken Access Control

**Risk:** A user can access or modify data / functionality they're not authorised for (another user's leads, admin endpoints, another org's data).

### Implemented
- **Per-user data ownership:** every `Lead`, `Meeting`, `Communication`, `ApiKey`, etc. has `userId`; queries filter by the authenticated user.
- **RBAC:** `owner` / `admin` / `member` / `viewer` roles via `Organization` + `OrgMember`; `hasPermission` from `src/lib/rbac.ts` checks on every gated route.
- **`withAuth` middleware:** every protected route wraps its handler in `withAuth(request, cb)`; unauthenticated requests get 401.
- **API key scopes:** `withDualAuth` allows session OR API key; API keys have scopes (`leads.read`, `leads.write`, `admin`, etc.) mapped to RBAC permissions via `SCOPE_TO_PERMISSION`.
- **Mass-assignment protection:** route handlers explicitly `select` fields on writes; `plan` and `role` are set server-side only.
- **Org isolation:** `orgId` on leads / data; org members see only their org's data.
- **Admin-only routes:** `/api/admin/*` check `admin` role; `CRON_SECRET` for cron endpoints.

### Missing / Gap
- **No per-tenant authorisation test suite** — the rules are enforced in code but not covered by automated tests; a refactor could break them silently. **Plan:** add an integration test per gated route asserting 403 for wrong-user / wrong-org / wrong-role.
- **Inbound event subscription (when shipped)** will need its own auth (signed webhook endpoints).

---

## A02 — Cryptographic Failures

**Risk:** Sensitive data (passwords, tokens, PII) is exposed because of weak or missing crypto.

### Implemented
- **Passwords:** bcrypt-hashed (`src/lib/auth.ts` `hashPassword`); cost factor adequate; never logged; never returned.
- **MFA backup codes:** bcrypt-hashed.
- **API keys:** SHA-256 hashed at rest (`ApiKey.keyHash`); raw key returned ONCE at creation.
- **OAuth tokens (Gmail, Calendar):** AES-256-GCM encrypted at rest (`src/lib/encryption.ts`, `src/lib/crypto.ts`); `accessToken`, `refreshToken` columns encrypted.
- **JWTs:** HS256 signed with `JWT_SECRET` (access) + `JWT_REFRESH_SECRET` (refresh); 15-min / 30-day TTL.
- **Webhook signatures:** HMAC verification (Stripe, Google Pub/Sub).
- **Transport:** HTTPS enforced (cookies `Secure`); SMTP TLS; Gmail API / Resend over HTTPS.
- **Secrets in `.env`:** chmod 600; `env-safeguard.ts` validates presence on boot.

### Missing / Gap
- **PII at rest unencrypted:** `Communication.content` (outreach email bodies), `EmailMessage.body` (inbox emails), `Lead.email` / `phone` are plaintext in SQLite. **Plan:** encrypt bodies with AES-256-GCM using a per-tenant key (keys in a KMS / env-managed root key).
- **JWT_SECRET is a single point of failure:** if it leaks, all tokens are forgeable. **Plan:** key rotation capability (currently no rotation without invalidating all sessions — acceptable but document).
- **Refresh-token rotation:** the rotated-out token is revoked server-side, but the window between rotation and revocation is the rotation request itself — acceptable (atomic).
- **No forward secrecy** for JWTs (HS256 is symmetric). Acceptable for a same-org trust model.

---

## A03 — Injection

**Risk:** SQL / NoSQL / command / LDAP / XPath / ORM injection.

### Implemented
- **No raw SQL:** every DB access is via Prisma's parameterised query builder. `prisma.$queryRaw` is used in a handful of analytics routes — each audited for parameterisation.
- **Input validation:** `src/lib/security/input-validator.ts` validates email, phone, URL, JSON; route handlers re-validate.
- **React escaping:** no `dangerouslySetInnerHTML` from user input; React escapes by default.
- **Prisma `select`** on writes — only the explicitly-listed fields are set.

### Missing / Gap
- **Audit `prisma.$queryRaw`** — a handful of analytics queries use raw SQL; ensure every one uses `Prisma.sql` tagged templates (parameterised), not string interpolation. **Plan:** grep + audit; convert any interpolation to tagged templates.

---

## A04 — Insecure Design

**Risk:** The architecture itself has flaws that no amount of patching can fix (missing authz model, no audit trail, no rate limit by design).

### Implemented
- **Defence in depth:** network (CDN) + proxy + auth + RBAC + input validation + audit.
- **Audit log:** `AuditLog` is append-only; security-relevant actions recorded.
- **Rate limiting by design:** per-IP (auth) + per-key (API) + per-tenant (credits).
- **Credits model:** architecturally caps AI cost per user (A04 — limits blast radius of abuse).
- **Per-user email sending (ADR-007):** architecturally isolates deliverability reputation per user (one bad user can't sink the platform).
- **Threat model** exists (this document set).
- **ADRs** record the security implications of every major decision.

### Missing / Gap
- **No formal threat-model review cadence** — the threat model is a living doc but isn't reviewed quarterly. **Plan:** quarterly review.
- **No "abuse case" design** for some features (e.g. the SSRF in the website scraper wasn't considered at design time). **Plan:** add an "abuse cases" section to the design template.

---

## A05 — Security Misconfiguration

**Risk:** Default credentials, open S3 buckets, verbose error messages, unnecessary features enabled.

### Implemented
- **`env-safeguard.ts`** validates env on boot; refuses to start with critical secrets missing in production.
- **Error messages** are generic to users (not "stack trace"); env vars redacted in logs (`email-ethereal.ts`).
- **CORS** locked to the app origin (`src/lib/security/cors-config.ts`); dev relaxations gated by `NODE_ENV`.
- **Security headers** (`src/lib/security/security-headers.ts`): CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy.
- **`AUTH_DEV_MODE=false`, `AUTH_AUTO_VERIFY=false`, `AUTH_BYPASS_EMAIL=false`** in production `.env`.
- **`/api/payments/confirm`** returns 403 in production (dev-only endpoint).
- **No default admin account** — admin role is granted explicitly by an existing admin.
- **Cookie flags** — httpOnly + Secure (prod) + SameSite=strict.

### Missing / Gap
- **`/api/auth/debug`** is public in production (it returns SET/MISSING booleans, not values, but still exposes internal hostnames + DB count). **Plan:** gate behind `CRON_SECRET` or remove from production.
- **`/api/auth/email-diagnostic`** is admin-only (good) but exposed if `CRON_SECRET` leaks — acceptable (rotatable).
- **No `X-Robots-Tag` / `noindex`** on the auth pages (minor).

---

## A06 — Vulnerable & Outdated Components

**Risk:** A dependency has a known CVE that we haven't patched.

### Implemented
- **`bun.lock`** pins versions; reproducible installs.
- **`@next/swc-linux-x64-gnu`** is a pinned binary (the keepalive restores it).

### Missing / Gap
- **No `bun audit` / `npm audit` in CI.** **Plan:** add `bun audit --severity=high` to CI; fail the build on high-severity findings.
- **No SBOM** (software bill of materials). **Plan:** generate SBOM on every release.
- **No `postinstall` script review.** Some packages run scripts on install that could exfiltrate `.env`. **Plan:** review + allowlist.
- **No automated dependency update PRs** (Dependabot / Renovate). **Plan:** enable.
- **Known tsc errors in `crypto.ts` (`require()` style imports)** — pre-existing, not a runtime vuln but a code-smell. **Plan:** convert to ESM.

---

## A07 — Identification and Authentication Failures

**Risk:** Weak auth — credential stuffing, no MFA, weak password policy, session fixation.

### Implemented
- **bcrypt** password hashing.
- **Email verification** via OTP before sign-in (gated in `/api/auth/signin`).
- **Passwordless OTP + Magic Link** with 15-min TTL + single-use + constant-time compare.
- **Google OAuth** with `state` CSRF + cross-domain relay JWT (60s TTL).
- **TOTP MFA** with backup codes (`/api/auth/mfa/*`, `/api/settings/2fa/*`).
- **Account lockout** after 5 failed OTP attempts (`otpLockedUntil`).
- **Known-device tracking** + security alerts on new devices.
- **Rate limit:** 5 auth/min per IP.
- **Refresh-token rotation** + revocation.
- **Login history** (`/api/auth/security/devices`).
- **Strong defaults:** `AUTH_DEV_MODE=false`, etc. in prod.

### Missing / Gap
- **No password-signin lockout** (only OTP). **Plan:** add per-account lockout on password signin (5 fails → 15-min lock).
- **No breach-password check.** **Plan:** integrate HaveIBeenPwned password API (k-anonymity).
- **No password-strength enforcement server-side** (the client has a meter; server doesn't enforce). **Plan:** enforce min 8 chars + not-in-breach.
- **MFA bypass via Google OAuth** (see [THREAT-MODEL.md](THREAT-MODEL.md) Scenario E). **Plan:** after Google login, if MFA enabled, prompt for TOTP.
- **No rate limit per-account** (only per-IP). **Plan:** per-account rate limit on auth endpoints.

---

## A08 — Software and Data Integrity Failures

**Risk:** Tampered software updates, tampered CI/CD, untrusted data ingested.

### Implemented
- **`bun.lock`** pins versions (integrity).
- **Webhook signature verification** (Stripe, Google Pub/Sub) — untrusted event data is verified before processing.
- **Idempotency** on webhook processing (`PaymentWebhook` table).
- **OAuth `state`** ensures the callback corresponds to a request the user initiated.

### Missing / Gap
- **No CI/CD pipeline integrity check** — no signed builds, no SLSA level. **Plan:** add a build-signing step (Sigstore / cosign) when CI is formalised.
- **No `subresource integrity`** on third-party scripts (Razorpay SDK, Stripe.js). **Plan:** add SRI hashes.
- **RAG ingests user-supplied URLs + text** — no integrity check on the content (could be malicious prompt injection). **Plan:** RAG content should be sandboxed / marked untrusted in prompts.

---

## A09 — Security Logging and Monitoring Failures

**Risk:** Breaches happen but we don't notice because logging / alerting is missing.

### Implemented
- **`AuditLog`** — append-only; security-relevant actions (login, MFA change, key rotation, payment, data export, account deletion).
- **`SecurityAlert`** — suspicious-login alerts (new device, new IP, new geo).
- **`CrashReport`** — auto-captured client crashes (with browser-extension noise filtering).
- **`src/lib/observability/*`** — request logs, metrics, traces; OpenTelemetry + Sentry + Prometheus.
- **`/api/auth/security/alerts`** + **`/api/auth/security/devices`** + **`/api/auth/login-history`** — security event visibility for the user.
- **dev.log + structured logging** on every request (`api-logger.ts`).

### Missing / Gap
- **No real-time alerting** on suspicious patterns (e.g. 100 logins from 1 IP in a minute). **Plan:** add Prometheus alert rules for auth anomalies (configs already exist in `deploy/prometheus/alerts.yml` — review + enable).
- **No audit-log entry on PII read** (only on write). **Plan:** log lead-read events.
- **No log retention policy.** **Plan:** 90 days hot, 1 year cold (for security forensics), then deleted (compliance).
- **No SIEM integration.** **Plan:** forward security events to a SIEM (at Stage C).

---

## A10 — Server-Side Request Forgery (SSRF)

**Risk:** The server makes requests to attacker-controlled URLs (e.g. the website scraper fetches `http://169.254.169.254/`).

### Implemented
- **Limited fetch surface:** the only user-controlled URL fetch is the website scraper (`src/lib/lead-discovery/website-scorer.ts`) and RAG URL ingest (`/api/ai/rag/ingest-url`).
- **No file:// / internal scheme** — `fetch` rejects non-http(s).

### Missing / Gap
- **No SSRF allowlist** — the scraper fetches any http(s) URL, including `http://169.254.169.254/` (AWS metadata), `http://localhost:port/`, private IP ranges. **Plan:** add an allowlist that rejects:
  - `169.254.0.0/16` (link-local + cloud metadata)
  - `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `127.0.0.0/8` (private / loopback)
  - `0.0.0.0/8`
  - `*.internal`, `*.local`, `*.localhost`
  - DNS rebinding: resolve the host, check the IP, then fetch (not just the hostname).
- **RAG URL ingest** — same gap. **Plan:** same allowlist.
- **Enforce IMDSv2** on the EC2 host (if we deploy on EC2) — IMDSv2 requires a token, defeating the classic SSRF-to-metadata attack.

---

## Compliance Summary

| OWASP Category | Implemented | Gaps | Priority to Close Gaps |
|---|---|---|---|
| A01 Broken Access Control | Strong | No authz test suite | P2 |
| A02 Cryptographic Failures | Strong | PII at rest unencrypted; JWT rotation | P1 |
| A03 Injection | Strong (no raw SQL) | Audit `$queryRaw` | P2 |
| A04 Insecure Design | Strong (ADRs, threat model) | Quarterly review; abuse-case design | P2 |
| A05 Security Misconfiguration | Strong | `/api/auth/debug` public | P2 |
| A06 Vulnerable Components | Weak | `bun audit`, SBOM, Dependabot | **P0** |
| A07 Auth Failures | Strong | Per-account lockout; breach check; MFA-on-Google | **P1** |
| A08 Integrity Failures | Strong | CI/CD signing; SRI; RAG sandboxing | P2 |
| A09 Logging/Monitoring | Strong | Real-time alerting; PII-read log | P1 |
| A10 SSRF | **Weak** | Allowlist on scraper + RAG | **P0** |

**Top priorities:** A10 (SSRF allowlist), A06 (dependency scanning), A07 (per-account lockout + breach check + MFA-on-Google), A09 (real-time alerting), A02 (PII encryption at rest).

---

*See also: [SECURITY-POLICY.md](SECURITY-POLICY.md), [THREAT-MODEL.md](THREAT-MODEL.md), [INCIDENT-RESPONSE-PLAN.md](INCIDENT-RESPONSE-PLAN.md), and [SECURITY improvements](../IMPROVEMENT-RECOMMENDATIONS.md#section-4--security-improvements).*
