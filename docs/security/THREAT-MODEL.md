# Threat Model — AcquisitionOS

> Owner: Security. Status: Living document. Last reviewed: 2026-09-09.
> Method: STRIDE (Spoofing, Tampering, Repudiation, Information Disclosure, Denial of Service, Elevation of Privilege) + attacker personas.

## 1. Attacker Personas

| Persona | Motive | Capability | Likelihood |
|---|---|---|---|
| **Opportunistic script kiddie** | Notoriety | Public exploits, automated scanners | High (constant background noise) |
| **Targeted attacker (competitor or disgruntled ex-user)** | Harm the business / steal data | Manual probing, social engineering, public CVEs | Medium |
| **Credential stuffer** | Account takeover (to send spam / steal leads) | Large breached-credential lists, automation | High |
| **API abuser (Liam-gone-bad)** | Free AI / lead quota | Scripting, rate-limit evasion | Medium |
| **Payment fraudster** | Free service / chargeback abuse | Stolen cards, synthetic identities | Medium |
| **Malicious insider (org member)** | Steal org data / sabotage | Valid low-privilege account | Low (but high impact) |
| **Compromised supply chain** | Persistent access | Trojaned npm package, CI/CD compromise | Low (but catastrophic) |
| **Mass scraper / spam bot** | Lead data for resale | Headless browsers, IP rotation | High (the leads themselves are valuable) |

## 2. Threats by STRIDE Category

### Spoofing

| Threat | Impact | Mitigation | Status |
|---|---|---|---|
| Password guessing | Account takeover | bcrypt + account lockout after 5 OTP fails + rate limit (5 auth/min/IP) | ✅ |
| Credential stuffing | Account takeover | Rate limit; breach-password check (not yet built — gap) | 🟡 |
| Session hijack (cookie theft) | Account takeover | httpOnly + Secure + SameSite=strict; short access-token TTL; refresh rotation | ✅ |
| Google OAuth CSRF | Forced auth to attacker's account | `state` parameter with nonce (CSRF token); cross-domain relay JWT | ✅ |
| API key theft (replay) | Unauthorized API use | Key is SHA-256 hashed at rest; rate limit per key; rotate/revoke; revealed once | ✅ |
| Webhook forgery (Stripe / Gmail Pub/Sub) | Fake payment activation / fake reply | HMAC signature verification (Stripe `STRIPE_WEBHOOK_SECRET`, Google Pub/Sub token) | ✅ |
| MFA bypass via Google OAuth | Account takeover without TOTP | (Gap — Google callback doesn't check `mfaConfig.isEnabled`) | ❌ |
| Magic link replay | Account takeover if token leaked | Single-use (token cleared on use); 15-min TTL; constant-time compare | ✅ |

### Tampering

| Threat | Impact | Mitigation | Status |
|---|---|---|---|
| SQL injection | Data theft / destruction | Prisma parameterised queries; no raw SQL anywhere | ✅ |
| XSS (stored) | Script in lead data → admin executes | React escapes by default; `dangerouslySetInnerHTML` audited (none in lead display); CSP header | ✅ (verify) |
| XSS (reflected) | Script in URL → user executes | React escapes; no `dangerouslySetInnerHTML` from URL params | ✅ |
| CSRF (state change) | Unauthorized action as user | SameSite=strict cookies; OAuth `state`; (no CSRF token — gap) | 🟡 |
| Mass assignment | User sets fields they shouldn't (e.g. `plan`, `role`) | Prisma `select` on writes; explicit field allowlists in route handlers | ✅ (audit per route) |
| Lead data tampering (another user edits my lead) | Data corruption | `lead.userId` filter on every query; `withAuth` enforces | ✅ |
| Webhook payload tampering (MITM) | Fake event accepted | HTTPS + HMAC signature | ✅ |
| Audit log tampering | Hide malicious activity | Append-only; no UPDATE/DELETE routes on `AuditLog` | ✅ |
| Tampered JWT (forged claims) | Elevation of privilege | HS256 with `JWT_SECRET`; signature verified on every request | ✅ (depends on `JWT_SECRET` secrecy — see [SECRETS-MANAGEMENT.md](SECRETS-MANAGEMENT.md)) |

### Repudiation

| Threat | Impact | Mitigation | Status |
|---|---|---|---|
| User denies sending an outreach | Dispute | `Communication` record + `LeadActivity` + SMTP `messageId` logged | ✅ |
| User denies a payment | Chargeback abuse | Stripe webhook + `PaymentOrder` + `PaymentWebhook` (idempotent) + `Invoice` | ✅ |
| Admin denies an action | No accountability | `AuditLog` records userId, action, IP, UA, timestamp | ✅ |
| User denies data access (DSAR) | Regulatory issue | `GdprRequest` + `DataExport` + audit log of the export | ✅ |

### Information Disclosure

| Threat | Impact | Mitigation | Status |
|---|---|---|---|
| Lead PII exposed to wrong user | Data breach | `lead.userId` filter; `withAuth`; RBAC | ✅ |
| Lead PII exposed via API without auth | Mass data theft | All `/api/leads/*` require auth (session or API key) | ✅ |
| Error message leaks secrets | Disclosure | Error messages generic; env vars redacted in logs (`email-ethereal.ts`) | ✅ |
| Log file leaks PII | Disclosure | Logs scrub PII (email bodies not logged); `dev.log` is gitignored | ✅ |
| PII at rest unencrypted | Disclosure on DB theft | (Gap — `Communication` / `EmailMessage` bodies plaintext in SQLite) | ❌ |
| API response over-discloses (returns fields the user shouldn't see) | Disclosure | Prisma `select` on read; explicit field allowlists | ✅ (audit per route) |
| `/api/auth/debug` public endpoint leaks env status | Reconnaissance | Endpoint returns only SET/MISSING booleans, not values; (gap: still exposes internal hostnames — see roadmap) | 🟡 |
| OAuth token theft from DB | Account takeover on Google | AES-256-GCM encrypted at rest (`encryption.ts`) | ✅ |
| API key theft from DB | Unauthorized API use | SHA-256 hashed at rest (only the hash is stored; raw key returned once) | ✅ |

### Denial of Service

| Threat | Impact | Mitigation | Status |
|---|---|---|---|
| Auth flood (brute force / credential stuff) | Service degradation | Per-IP rate limit (5 auth/min); account lockout | ✅ (in-process; Redis gap) |
| API rate-limit evasion (rotate IPs) | Free AI / lead quota | Per-key rate limit (not just per-IP); monthly lead quota per key | ✅ (in-process; Redis gap) |
| Expensive AI call flood (authenticated) | AI cost spike | Credits system — every AI call costs credits; user can't spend beyond balance | ✅ |
| Discovery flood (authenticated) | Server CPU + search-API cost | Credits + monthly lead quota; per-user throttle | ✅ |
| Stripe webhook flood | Idempotency table bloat | `PaymentWebhook` keyed on event ID; Stripe retries are no-ops; (gap: no per-IP rate limit on webhook endpoint — but Stripe IP range is known) | 🟡 |
| Slowloris / connection exhaustion | Service unavailable | Next.js + the gateway handle timeouts; (gap: no explicit connection limit) | 🟡 |
| DDoS on the public endpoint | Service unavailable | Gateway / CDN (Cloudflare/Vercel) absorbs | ✅ (when behind CDN) |
| DB write contention (malicious or accidental) | Service degradation | SQLite single-writer; (PostgreSQL + connection pooling on roadmap) | 🟡 |

### Elevation of Privilege

| Threat | Impact | Mitigation | Status |
|---|---|---|---|
| User sets their own `plan` / `role` | Free upgrade | Mass-assignment protection; `plan` and `role` only set server-side (signup default; webhook; admin) | ✅ |
| User sets another user's data | Cross-tenant access | `userId` filter on every query; `withAuth` | ✅ |
| Org member accesses owner-only data | Privilege escalation | RBAC (`hasPermission`); owner/admin endpoints check role | ✅ |
| API key with broad scope used for narrow action | Over-privileged access | Scope-to-permission mapping (`SCOPE_TO_PERMISSION` in `auth-middleware.ts`); `admin` scope grants all | ✅ |
| JWT claim tampering (forge `plan: elite`) | Free upgrade | HS256 signature; `JWT_SECRET` not disclosed | ✅ (depends on `JWT_SECRET` secrecy) |
| Admin endpoint accessed by non-admin | Privilege escalation | `withAuth` + `admin` role check; `CRON_SECRET` for cron | ✅ |
| Path traversal in `[id]` params | File read | No file reads from user input; `[id]` is a cuid matched against DB | ✅ |
| SSRF in website-scraper | Internal network probe | Scraper fetches user-supplied URLs; (gap: no SSRF allowlist — see below) | ❌ |

## 3. High-Impact Scenarios (ranked)

### Scenario A — Credential stuffing leads to mass lead theft
- **Attacker:** credential stuffer with a breached list.
- **Path:** try `email:password` pairs against `/api/auth/signin`. Rate limit is 5/min/IP; attacker rotates IPs. Account lockout triggers after 5 OTP fails — but password signin doesn't lock (only OTP). A successful match → lead export via `/api/leads/export`.
- **Impact:** mass lead PII theft (emails, phones, business names) across compromised accounts.
- **Mitigation gap:** no breach-password check (haveibeenpwned API); no password-signin lockout; rate limit is per-IP not per-account.
- **Priority:** P1 — add per-account lockout on password signin + breach-password check.

### Scenario B — AI cost abuse via a single account
- **Attacker:** API abuser (Liam-gone-bad) on Elite plan.
- **Path:** create API key → loop `POST /api/ai/outreach/generate` at the Elite rate (2000 req/hr) → each burns credits → but credits have a monthly cap, so the worst case is the user exhausts their own credits. **The real risk:** a user on Free/Pro with stolen credits, or a self-serve refund after burning credits.
- **Impact:** AI cost > revenue for that user (margin negative).
- **Mitigation:** credits hard-cap the AI cost per user; refunds require admin approval (`/api/admin/refund`). Acceptable.
- **Priority:** P2 — monitor per-tenant AI cost; auto-flag when cost > 3× revenue.

### Scenario C — SSRF via the website scraper
- **Attacker:** any authenticated user.
- **Path:** create a lead with `website: http://169.254.169.254/latest/meta-data/` (AWS metadata) → trigger `analyze-website` → scraper fetches it → returns AWS instance credentials.
- **Impact:** cloud credential theft if the app runs on AWS EC2 with IMDSv1.
- **Mitigation gap:** no SSRF allowlist on the scraper (`src/lib/lead-discovery/website-scorer.ts`); fetches any URL.
- **Priority:** P0 — add an SSRF allowlist (reject private IP ranges, link-local, loopback, cloud-metadata endpoints); enforce IMDSv2 on the EC2 host.

### Scenario D — Payment fraud via fake webhook
- **Attacker:** attacker who can hit `/api/payments/webhook/stripe` with a forged body.
- **Path:** forge a `checkout.session.completed` event with `metadata.order_id` = a real pending order → activate a subscription without payment.
- **Impact:** free Pro/Elite access.
- **Mitigation:** Stripe signature verification (`STRIPE_WEBHOOK_SECRET`); idempotency on `PaymentWebhook`; amount verification. Forging the signature requires the secret.
- **Priority:** ✅ mitigated; ensure `STRIPE_WEBHOOK_SECRET` is rotated + never logged.

### Scenario E — MFA bypass via Google OAuth
- **Attacker:** attacker who has the user's Google password.
- **Path:** user has TOTP MFA enabled on AcquisitionOS; attacker signs in via "Continue with Google" → the Google callback doesn't check `mfaConfig.isEnabled` → session created without TOTP.
- **Impact:** MFA defeated by the Google path.
- **Mitigation gap:** the Google callback (`callback/google/route.ts`) doesn't enforce MFA even when enabled.
- **Priority:** P1 — after Google login, if `mfaConfig.isEnabled`, prompt for TOTP before setting the session cookie.

### Scenario F — Supply chain compromise (npm)
- **Attacker:** attacker who trojans a popular npm package we depend on.
- **Path:** `bun install` → malicious `postinstall` exfiltrates `.env` → attacker has JWT_SECRET, Stripe keys, etc.
- **Impact:** total compromise.
- **Mitigation:** `bun.lock` pins versions; (gap: no SBOM, no `audit-ci`, no allowlist). 
- **Priority:** P1 — add `bun audit` to CI; SBOM generation; review `postinstall` scripts.

## 4. Mitigations in Place (summary)

- bcrypt password hashing; OTP / magic link / Google OAuth / MFA.
- httpOnly + Secure + SameSite=strict cookies; refresh rotation; revocable sessions.
- RBAC + per-user data ownership + dual auth (session or API key with scopes).
- Prisma parameterised queries (no SQL injection).
- React escaping + CSP header (XSS).
- SameSite=strict + OAuth `state` (CSRF).
- Rate limiting (in-process; Redis on roadmap).
- AES-256-GCM encryption for OAuth tokens at rest.
- HMAC signature verification for webhooks.
- Append-only audit log.
- Credits system caps AI cost per user.
- Stripe signature + idempotency + amount verification.
- Security headers (CSP, HSTS, X-Frame-Options, X-Content-Type-Options).
- `env-safeguard.ts` validates env on boot.

## 5. Mitigations Missing (summary, ranked)

1. **SSRF allowlist on the website scraper** (P0).
2. **MFA enforcement on the Google OAuth path** (P1).
3. **Per-account lockout on password signin** (P1).
4. **Breach-password check (haveibeenpwned)** (P1).
5. **Redis-backed rate limiter** (P1 — for multi-instance).
6. **PII encryption at rest** (Communication, EmailMessage bodies) (P1).
7. **Audit log on PII read** (P1).
8. **`bun audit` + SBOM + postinstall review** (P1).
9. **CSRF token for non-OAuth state changes** (P2 — SameSite=strict is the current defence).
10. **`/api/auth/debug` internal-hostname redaction** (P2).

---

*See also: [SECURITY-POLICY.md](SECURITY-POLICY.md), [OWASP-COMPLIANCE.md](OWASP-COMPLIANCE.md), [SECRETS-MANAGEMENT.md](SECRETS-MANAGEMENT.md), [INCIDENT-RESPONSE-PLAN.md](INCIDENT-RESPONSE-PLAN.md), [SECURITY improvements](../IMPROVEMENT-RECOMMENDATIONS.md#section-4--security-improvements).*
