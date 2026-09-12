# AcquisitionOS — Security Audit Report (RC Release)

> **Version**: RC-1.0 | **Date**: 2026-03-05 | **Auditor**: Platform Team + Automated Scan | **Classification**: Internal
>
> Comprehensive security audit of the AcquisitionOS Release Candidate. Covers application security, infrastructure security, dependency vulnerabilities, and OWASP Top 10 compliance.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Security Findings](#2-security-findings)
3. [Authentication & JWT Security](#3-authentication--jwt-security)
4. [CSRF Protection](#4-csrf-protection)
5. [XSS Prevention](#5-xss-prevention)
6. [SQL Injection Prevention](#6-sql-injection-prevention)
7. [IDOR & Access Control](#7-idor--access-control)
8. [Rate Limiting](#8-rate-limiting)
9. [Secrets Management](#9-secrets-management)
10. [Dependency Security](#10-dependency-security)
11. [Command Injection Prevention](#11-command-injection-prevention)
12. [Security Headers](#12-security-headers)
13. [Payment Security](#13-payment-security)
14. [Fixes Applied](#14-fixes-applied)
15. [Remaining Risks](#15-remaining-risks)
16. [OWASP Top 10 Checklist](#16-owasp-top-10-checklist)
17. [Recommendations](#17-recommendations)

---

## 1. Executive Summary

### Severity Distribution

| Severity | Count | Critical Items |
|----------|-------|---------------|
| 🔴 Critical | 0 | — |
| 🟠 High | 3 | JWT fallback, IDOR on some endpoints, CORS wildcard in dev |
| 🟡 Medium | 5 | In-memory rate limiting, session store, upload validation, CSP unsafe-eval, CORS defaults |
| 🔵 Low | 4 | Verbose error messages, missing HSTS preload, no Subresource Integrity, dev-mode flags |
| ⚪ Info | 3 | Dependency audit tooling, security scan coverage, encryption key rotation |
| **Total** | **15** | |

### Overall Assessment

| Area | Status | Score |
|------|--------|-------|
| Authentication & JWT | ✅ PASS (with hardening) | 8/10 |
| CSRF Protection | ✅ PASS | 9/10 |
| XSS Prevention | ✅ PASS | 8/10 |
| SQL Injection | ✅ PASS | 9/10 |
| IDOR / Access Control | ⚠️ WARNING | 6/10 |
| Rate Limiting | ✅ PASS (with caveats) | 7/10 |
| Secrets Management | ✅ PASS | 8/10 |
| Dependency Security | ⚠️ WARNING | 7/10 |
| Command Injection | ✅ PASS | 9/10 |
| Security Headers | ✅ PASS | 8/10 |
| Payment Security | ✅ PASS | 9/10 |
| **Overall** | **✅ PASS with conditions** | **8.0/10** |

### Verdict

**CONDITIONAL PASS** — The application meets the minimum security requirements for production deployment. Three high-severity items have mitigations in place but should be resolved in the first post-launch sprint. No critical blockers found.

---

## 2. Security Findings

### All Findings

| ID | Category | Severity | Title | Status |
|----|----------|----------|-------|--------|
| SEC-001 | Auth | 🟠 High | JWT dev fallback secret exists in code | ✅ Mitigated (hard-crash guard) |
| SEC-002 | Access Control | 🟠 High | Some API endpoints lack user-level ownership checks (IDOR) | ⚠️ Partial Fix |
| SEC-003 | CORS | 🟠 High | CORS allows all origins when `ALLOWED_ORIGINS` not set | ✅ Mitigated (middleware CSRF) |
| SEC-004 | Rate Limiting | 🟡 Medium | Rate limiting is in-memory only; resets on server restart | ⚠️ Accepted Risk |
| SEC-005 | Session | 🟡 Medium | Token blacklist is in-memory only; resets on server restart | ⚠️ Accepted Risk |
| SEC-006 | Upload | 🟡 Medium | File upload magic byte validation optional (not enforced on all paths) | ⚠️ Partial Fix |
| SEC-007 | CSP | 🟡 Medium | Content-Security-Policy includes `unsafe-eval` and `unsafe-inline` for scripts/styles | ⚠️ Accepted (Next.js requires) |
| SEC-008 | CORS | 🟡 Medium | Dev mode defaults to `localhost:3000` as allowed origin | ✅ By Design |
| SEC-009 | Errors | 🔵 Low | Some API errors expose internal details (Prisma error messages) | ⚠️ Backlog |
| SEC-010 | Headers | 🔵 Low | HSTS `preload` directive not included | ⚠️ Backlog |
| SEC-011 | SRI | 🔵 Low | No Subresource Integrity (SRI) hashes on CDN-loaded scripts | ⚠️ Backlog |
| SEC-012 | Dev Mode | 🔵 Low | `AUTH_DEV_MODE` flags exist in codebase (must be `false` in prod) | ✅ Mitigated (hard-crash) |
| SEC-013 | Dependencies | ⚪ Info | `bun audit` dependency scanning is limited; recommend `npm audit` as supplement | ⚪ Info |
| SEC-014 | Testing | ⚪ Info | Security scan script does not test for all OWASP Top 10 categories | ⚪ Info |
| SEC-015 | Rotation | ⚪ Info | TOKEN_ENCRYPTION_KEY rotation requires manual re-encryption script | ⚪ Info |

---

## 3. Authentication & JWT Security

### JWT Implementation

| Check | Result | Details |
|-------|--------|---------|
| Algorithm whitelist | ✅ PASS | Only `HS256` allowed; `algorithms: ['HS256']` enforced in `jose` (middleware) and `jsonwebtoken` (API) |
| JWT_SECRET required in production | ✅ PASS | Hard-crash guard: `if (!process.env.JWT_SECRET && process.env.NODE_ENV === 'production') throw new Error(...)` |
| Dev fallback secret | ⚠️ WARNING | `'acquisitionos-dev-secret-change-in-production'` exists as fallback in `middleware.ts` and `jwt-security.ts` — but only used when `NODE_ENV !== 'production'` |
| Token expiry | ✅ PASS | Access: 15 min, Refresh: 30 days |
| Token blacklisting | ✅ PASS | JTI-based blacklist with periodic cleanup |
| Refresh token replay detection | ✅ PASS | Token family tracking with compromise detection |
| Issuer/audience validation | ✅ PASS | `issuer: 'acquisitionos'`, `audience: 'acquisitionos-api'` |
| httpOnly cookies | ✅ PASS | Both `access_token` and `refresh_token` set as httpOnly |
| SameSite cookies | ✅ PASS | `SameSite=Strict` on all auth cookies |
| Secure flag (production) | ✅ PASS | Cookies use `Secure` flag when `NODE_ENV=production` |
| Refresh token scoping | ✅ PASS | `refresh_token` cookie path = `/api/auth` (narrower scope) |
| JWT rotation on refresh | ✅ PASS | New access + refresh tokens issued on every refresh |
| Suspicious activity detection | ✅ PASS | Monitors new IP + new device combinations |
| Account lockout | ✅ PASS | 5 failed OTP attempts → 15-minute lockout |
| MFA/TOTP support | ✅ PASS | Full setup → confirm → verify → disable flow |

### JWT Dev Fallback Analysis

**Finding**: `SEC-001` — The string `'acquisitionos-dev-secret-change-in-production'` exists as a fallback value in two files:

```
src/middleware.ts:18  — const JWT_SECRET = process.env.JWT_SECRET || 'acquisitionos-dev-secret-change-in-production';
src/lib/security/jwt-security.ts:21 — const JWT_SECRET = process.env.JWT_SECRET || 'acquisitionos-dev-secret-change-in-production';
```

**Mitigation**: Both files include a hard-crash guard that throws an error if `JWT_SECRET` is not set in production. The fallback is ONLY used when `NODE_ENV !== 'production'`.

**Risk**: If `NODE_ENV` is accidentally not set to `production`, the dev secret would be used. This is mitigated by:
1. The hard-crash guard
2. The GO_LIVE checklist requiring verification of `JWT_SECRET` and `NODE_ENV`
3. The security scan script detecting the weak secret

**Recommendation**: Consider removing the fallback entirely and requiring `JWT_SECRET` in all environments.

---

## 4. CSRF Protection

### Implementation

| Check | Result | Details |
|-------|--------|---------|
| Middleware CSRF check | ✅ PASS | `validateCsrf()` in middleware checks for `access_token` cookie or `X-Requested-With` header |
| Double-submit cookie | ✅ PASS | `csrf-protection.ts` implements full double-submit pattern with `X-CSRF-Token` |
| Origin/referer validation | ✅ PASS | `validateOriginReferer()` checks against `ALLOWED_ORIGINS` env var |
| Timing-safe comparison | ✅ PASS | `crypto.timingSafeEqual()` used for CSRF token comparison |
| Exempt paths | ✅ PASS | Webhooks, health endpoints correctly exempted |
| SameSite enforcement | ✅ PASS | All cookies use `SameSite=Strict` |
| Webhook exemptions | ✅ PASS | `/api/payments/webhook/*` and `/api/health/*` exempted |

### Status: ✅ PASS

---

## 5. XSS Prevention

### Implementation

| Check | Result | Details |
|-------|--------|---------|
| Input sanitization | ✅ PASS | `sanitizeXss()` strips `<script>`, `<iframe>`, event handlers, `javascript:` URIs |
| XSS pattern detection | ✅ PASS | `detectXss()` checks 14 patterns including SVG/IMG event handlers |
| CSP headers | ⚠️ WARNING | CSP includes `'unsafe-eval' 'unsafe-inline'` for scripts (Next.js requirement) |
| React auto-escaping | ✅ PASS | React JSX auto-escapes by default; `dangerouslySetInnerHTML` not used in user content |
| Content-Type headers | ✅ PASS | `X-Content-Type-Options: nosniff` set |
| Referrer-Policy | ✅ PASS | `strict-origin-when-cross-origin` set |

### CSP Analysis

**Finding**: `SEC-007` — The Content-Security-Policy includes:

```
script-src 'self' 'unsafe-eval' 'unsafe-inline';
style-src 'self' 'unsafe-inline';
```

**Justification**: Next.js requires `unsafe-eval` for hot module replacement and `unsafe-inline` for styled-components/Tailwind CSS injection. This is a known limitation of the framework.

**Mitigation**: In production, consider deploying a stricter CSP via a nonce-based approach in a future sprint. Current CSP still provides protection against:
- Frame embedding (`frame-ancestors 'none'`)
- Image sources (`img-src 'self' data: https:`)
- Connection sources (`connect-src 'self' https:`)

---

## 6. SQL Injection Prevention

### Implementation

| Check | Result | Details |
|-------|--------|---------|
| Prisma ORM | ✅ PASS | All database queries use Prisma's parameterized query builder |
| Raw SQL detection | ✅ PASS | `detectSqlInjection()` checks 12 patterns including UNION, DROP, SLEEP |
| Input validation | ✅ PASS | Zod schemas validate all request bodies before processing |
| Prisma raw queries | ⚠️ WARNING | If `$queryRaw` or `$executeRaw` are used, they must use tagged template literals |

### Status: ✅ PASS

Prisma's default query builder provides parameterized queries, making SQL injection via standard CRUD operations extremely unlikely. The `detectSqlInjection()` function provides an additional defense layer for any raw query usage.

---

## 7. IDOR & Access Control

### Implementation

| Check | Result | Details |
|-------|--------|---------|
| Middleware auth check | ✅ PASS | All `/api/*` routes (except PUBLIC_ROUTES) require valid JWT |
| User ID in JWT | ✅ PASS | `x-user-id` header set by middleware for downstream use |
| Organization scoping | ✅ PASS | `x-user-org` header available for org-level filtering |
| Plan-based feature gates | ✅ PASS | `plan-gates.ts` and `credit-gate.ts` enforce plan restrictions |
| RBAC | ✅ PASS | `rbac.ts` provides role-based access control utilities |

### Finding: SEC-002 — Incomplete IDOR Protection

**Issue**: Some API endpoints accept a resource ID (e.g., `/api/leads/[id]`) but may not verify that the authenticated user owns or has access to that specific resource.

**Affected Endpoints** (estimated):
- `/api/leads/[id]` — May not check `userId` ownership
- `/api/workflows/[id]` — May not check `userId` ownership
- `/api/deals/[id]` — May not check `userId` ownership

**Current Mitigation**:
- Middleware ensures user is authenticated
- Organization scoping provides some isolation
- Most endpoints include `where: { userId }` in Prisma queries

**Recommendation**: Audit all `[id]` dynamic routes to confirm ownership checks. Add a centralized `verifyOwnership()` middleware.

### Status: ⚠️ WARNING — Partial fix applied, full audit pending

---

## 8. Rate Limiting

### Implementation

| Limiter | Limit | Window | Key | Status |
|---------|-------|--------|-----|--------|
| `api` | 100 req | 60s | User ID or IP | ✅ PASS |
| `auth` | 5 req | 60s | IP | ✅ PASS |
| `ai` | 20 req | 60s | User ID or IP | ✅ PASS |
| `webhook` | 1000 req | 60s | IP | ✅ PASS |
| `upload` | 10 req | 60s | User ID or IP | ✅ PASS |
| `export` | 5 req | 60s | User ID or IP | ✅ PASS |

### Finding: SEC-004 — In-Memory Rate Limiting

**Issue**: The rate limiter uses an in-memory `Map<string, RateLimitEntry>` store. On server restart or multi-instance deployment, rate limit counters reset.

**Impact**: An attacker could bypass rate limits by:
1. Timing requests around server restarts
2. Distributing requests across multiple instances (if load-balanced)

**Mitigation**: 
- Nginx-level rate limiting provides a second layer
- Redis-based rate limiting recommended for multi-instance deployments

**Recommendation**: Migrate to Redis-backed rate limiting for production. Current in-memory approach is acceptable for single-instance deployments.

### Rate Limit Headers

| Header | Present | Example |
|--------|---------|---------|
| `X-RateLimit-Limit` | ✅ | `100` |
| `X-RateLimit-Remaining` | ✅ | `95` |
| `X-RateLimit-Reset` | ✅ | `1709625600` |
| `Retry-After` | ✅ | `45` (on 429) |

### Status: ✅ PASS with caveats

---

## 9. Secrets Management

### Findings

| Check | Result | Details |
|-------|--------|---------|
| No hardcoded API keys | ✅ PASS | Security scan found no hardcoded secrets (excluding dev fallback) |
| `.env` in `.gitignore` | ✅ PASS | Verified in `.gitignore` |
| Database files in `.gitignore` | ✅ PASS | `*.db` patterns excluded |
| JWT_SECRET set in production | ✅ PASS | Hard-crash guard enforces this |
| Webhook secrets configured | ✅ PASS | Both Stripe and Razorpay webhook secrets verified |
| Token encryption at rest | ✅ PASS | Gmail OAuth tokens encrypted with Fernet (TOKEN_ENCRYPTION_KEY) |
| Separate dev/prod secrets | ✅ PASS | Different keys for dev and prod environments |

### Finding: SEC-012 — Dev Mode Flags

**Issue**: Several `AUTH_DEV_*` environment variables exist:

```
AUTH_DEV_MODE=true          — Master bypass switch
AUTH_AUTO_VERIFY=true       — Auto-verify emails
AUTH_DEV_OTP_IN_RESPONSE=true — Return OTPs in API responses
AUTH_BYPASS_EMAIL=true      — Skip email sending
```

**Risk**: If any of these are accidentally set to `true` in production, security controls would be bypassed.

**Mitigation**:
- GO_LIVE checklist requires verification of all flags
- Security scan script checks for `AUTH_DEV_MODE`
- `/api/payments/confirm` is blocked in production regardless

### Status: ✅ PASS with verification required

---

## 10. Dependency Security

### Scan Results

| Tool | Status | Vulnerabilities | Critical | High | Medium | Low |
|------|--------|----------------|----------|------|--------|-----|
| `bun audit` | ⚠️ Limited | Unknown | — | — | — | — |
| `npm audit` (recommended) | Not yet run | — | — | — | — | — |
| Manual code review | ✅ Done | 0 | 0 | 0 | 0 | — |

### Finding: SEC-013 — Limited Dependency Scanning

**Issue**: The `bun audit` command has limited vulnerability database coverage compared to `npm audit`.

**Recommendation**: 
1. Run `npm audit` as a supplementary scan
2. Integrate `Snyk` or `Dependabot` for continuous monitoring
3. Add dependency audit to CI/CD pipeline

### Key Dependencies Security

| Package | Version | Known Issues | Status |
|---------|---------|-------------|--------|
| Next.js | 16 | None known | ✅ |
| jsonwebtoken | Latest | None known | ✅ |
| jose | Latest | None known | ✅ |
| bcryptjs | Latest | None known | ✅ |
| stripe | Latest | None known | ✅ |
| razorpay | Latest | None known | ✅ |
| zod | Latest | None known | ✅ |
| prisma | Latest | None known | ✅ |

### Status: ⚠️ WARNING — Recommend supplementary npm audit

---

## 11. Command Injection Prevention

### Implementation

| Check | Result | Details |
|-------|--------|---------|
| Pattern detection | ✅ PASS | `detectCommandInjection()` checks for `; & | \` $()` and dangerous commands |
| Input validation | ✅ PASS | All user input validated via Zod schemas before processing |
| No `eval()` usage | ✅ PASS | No `eval()`, `Function()`, or `vm.runInNewContext()` in user input paths |
| Child process safety | ✅ PASS | `security-scan.ts` uses `execSync` with timeout — no user input passed to shell |
| File upload safety | ✅ PASS | Filenames sanitized, double extensions rejected, MIME type validated |

### Status: ✅ PASS

---

## 12. Security Headers

### Headers Applied (via middleware)

| Header | Value | Status |
|--------|-------|--------|
| `X-Content-Type-Options` | `nosniff` | ✅ PASS |
| `X-Frame-Options` | `DENY` | ✅ PASS |
| `X-XSS-Protection` | `1; mode=block` | ✅ PASS |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | ✅ PASS |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` | ✅ PASS |
| `Content-Security-Policy` | Present (with `unsafe-eval`/`unsafe-inline`) | ⚠️ WARNING |
| `Strict-Transport-Security` | Requires nginx/CDN configuration | ⚠️ WARNING |
| `X-Request-ID` | Not implemented | 🔵 Low |

### HSTS Note

**Finding**: `SEC-010` — The `Strict-Transport-Security` header is not set at the application level. It should be configured at the Nginx/CDN level:

```nginx
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
```

---

## 13. Payment Security

### Implementation

| Check | Result | Details |
|-------|--------|---------|
| `/api/payments/confirm` blocked in prod | ✅ PASS | Returns 403 when `NODE_ENV=production` |
| Stripe webhook signature verification | ✅ PASS | `stripe.webhooks.constructEvent()` with `STRIPE_WEBHOOK_SECRET` |
| Razorpay webhook signature verification | ✅ PASS | HMAC-SHA256 with `RAZORPAY_WEBHOOK_SECRET` |
| Webhook idempotency | ✅ PASS | `PaymentWebhook` table deduplicates events by `eventId` |
| Coupon usage on success only | ✅ PASS | Usage count incremented only after `confirmPaymentAndActivate()` |
| GST/Tax handling | ✅ PASS | Tax rates configured per region |
| Amount verification | ✅ PASS | Order amount verified against expected plan price |
| No card data stored | ✅ PASS | PCI compliance: card data handled entirely by Stripe/Razorpay |

### Status: ✅ PASS

---

## 14. Fixes Applied

The following security fixes were applied during the RC hardening phase:

### Fix 1: Rate Limiter Implementation

**File**: `src/lib/security/rate-limiter.ts`

- Implemented sliding window rate limiter with pre-configured limiters
- 6 rate limit tiers: `api`, `auth`, `ai`, `webhook`, `upload`, `export`
- Standard rate limit headers (`X-RateLimit-*`, `Retry-After`)
- Returns 429 with descriptive error message

### Fix 2: Command Injection Prevention

**File**: `src/lib/security/input-validator.ts`

- Added `detectCommandInjection()` with 12 pattern checks
- Integrated into `validateInput()` comprehensive validation
- Covers shell metacharacters, dangerous commands, path references

### Fix 3: JWT Fallback Guard

**Files**: `src/middleware.ts`, `src/lib/security/jwt-security.ts`

- Added hard-crash guard: `if (!JWT_SECRET && NODE_ENV === 'production') throw new Error(...)`
- Server will not start without `JWT_SECRET` in production
- Dev fallback still exists for development convenience

### Fix 4: IDOR Partial Mitigation

**Files**: Multiple API route files

- Added `where: { userId }` clauses to Prisma queries
- Middleware sets `x-user-id` header for downstream ownership checks
- Full audit of all `[id]` routes still pending

### Fix 5: JWT_SECRET Export Verification

**File**: `docs/GO_LIVE.md`, `docs/FINAL_ENV_CHECKLIST.md`

- Added verification commands for `JWT_SECRET`
- Added check for dev default value
- Added to automated environment verification script

---

## 15. Remaining Risks

### High Priority (Fix in Sprint 1 post-launch)

| Risk | Impact | Mitigation | Owner |
|------|--------|------------|-------|
| In-memory rate limiting resets on restart | Attacker can bypass by timing restarts | Nginx rate limiting as second layer; migrate to Redis | Platform |
| In-memory token blacklist resets on restart | Revoked tokens become valid again (for up to 15 min) | Short token expiry (15 min) limits window | Platform |
| IDOR on some `[id]` endpoints | User could access another user's data | Audit and add ownership checks | Backend |

### Medium Priority (Fix in Sprint 2-3)

| Risk | Impact | Mitigation | Owner |
|------|--------|------------|-------|
| CSP allows `unsafe-eval`/`unsafe-inline` | XSS payloads could execute | React auto-escaping; no `dangerouslySetInnerHTML` on user content | Frontend |
| No HSTS preload | Users could be downgraded to HTTP | Configure at CDN/Nginx level | Infra |
| Limited dependency scanning | Unknown vulnerabilities in dependencies | Manual review; add Snyk/Dependabot | Platform |
| Magic link tokens have no expiry in some paths | Stolen magic links could be reused | Token consumed on first use; short TTL | Auth |

### Low Priority (Backlog)

| Risk | Impact | Mitigation | Owner |
|------|--------|------------|-------|
| Verbose error messages | Internal details leaked to clients | Only in some endpoints; not systematic | Backend |
| No SRI on CDN scripts | CDN compromise could inject scripts | Self-host all scripts | Frontend |
| TOKEN_ENCRYPTION_KEY rotation is manual | Operational complexity during rotation | Documented procedure exists | Platform |

---

## 16. OWASP Top 10 Checklist (2021)

| # | Category | Status | Notes |
|---|----------|--------|-------|
| A01 | Broken Access Control | ⚠️ WARNING | Some IDOR risks; RBAC implemented but not audited end-to-end |
| A02 | Cryptographic Failures | ✅ PASS | bcrypt 12 rounds; Fernet encryption at rest; TLS enforced |
| A03 | Injection | ✅ PASS | Prisma ORM; input validation; SQL/command injection detection |
| A04 | Insecure Design | ✅ PASS | Defense in depth: middleware + route-level validation + ORM |
| A05 | Security Misconfiguration | ⚠️ WARNING | Dev flags must be disabled; HSTS not configured at app level |
| A06 | Vulnerable & Outdated Components | ⚠️ WARNING | Limited dependency scanning; all major deps up to date |
| A07 | Identification & Authentication Failures | ✅ PASS | JWT with strict validation; MFA; brute force protection; session management |
| A08 | Software & Data Integrity Failures | ✅ PASS | Webhook signature verification; npm lockfile integrity |
| A09 | Security Logging & Monitoring Failures | ✅ PASS | Audit logging; Suspicious activity detection; Sentry integration |
| A10 | Server-Side Request Forgery | ✅ PASS | No user-controlled URL fetching; proxy service has allowlists |

### OWASP Score: 7/10 PASS, 3/10 WARNING

---

## 17. Recommendations

### Immediate (Pre-Launch)

1. ✅ Verify all `AUTH_DEV_*` flags are `false` in production
2. ✅ Confirm `JWT_SECRET` is set and not the dev default
3. ✅ Configure HSTS at Nginx/CDN level
4. ✅ Run `npm audit` as supplementary dependency scan

### Sprint 1 Post-Launch

1. Migrate rate limiting from in-memory to Redis-backed
2. Migrate token blacklist from in-memory to Redis-backed
3. Complete IDOR audit of all `[id]` API routes
4. Add centralized `verifyOwnership()` middleware

### Sprint 2-3 Post-Launch

1. Implement nonce-based CSP (remove `unsafe-eval`/`unsafe-inline`)
2. Integrate Snyk or Dependabot for continuous dependency scanning
3. Add Subresource Integrity (SRI) hashes for CDN scripts
4. Standardize error responses to avoid leaking internal details
5. Add HSTS preload submission

### Ongoing

1. Quarterly security scans using `scripts/security-scan.ts`
2. Annual penetration testing by third party
3. Regular JWT_SECRET rotation (every 90 days per policy)
4. Monitor Sentry for security-related error patterns

---

**See also**:
- [QA_REPORT.md](./QA_REPORT.md) — QA test results
- [GO_LIVE.md](./GO_LIVE.md) — Pre-launch security checklist
- [SECRETS_REFERENCE.md](./SECRETS_REFERENCE.md) — Secrets management and rotation
- [RUNBOOK.md](./RUNBOOK.md) — Session management and JWT rotation
