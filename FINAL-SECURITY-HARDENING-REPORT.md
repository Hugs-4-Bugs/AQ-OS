# FINAL SECURITY HARDENING REPORT — AcquisitionOS

**Date**: 2026-09-22 · **Branch**: `main` · **Starting HEAD**: `efbc216e4f002c7f1b5cbd5354b36783c12cf714` · **Ending HEAD**: unchanged (forward-only edits in working tree)

**Scope**: full security, reliability, functionality, input-validation, payment, webhook, file-upload, authentication, authorization, database, API and production-readiness audit of the CURRENT workspace. Method: 7 parallel read-only audit sweeps (secrets, auth, RBAC/IDOR, validation/rate-limiting, payments/webhooks, uploads/errors/headers, codebase cartography), followed by manual verification, forward-only fixes, and re-testing. No rollback/revert/reset/checkout was used at any point.

---

## 1. Tests Performed

| Area | Method | Result |
|---|---|---|
| Secrets exposure | repo-wide grep sweep + `git ls-files` audit + .env mechanics check | 10 tracked files carried real credentials → purged (§2, H-1) |
| Authentication | all 25 `/api/auth/**` routes read line-by-line; JWT sign/verify paths; cookie flags; OTP/magic-link entropy; lockouts | MFA bypass + Google account-takeover vector found → fixed (H-2, H-3) |
| Authorization/RBAC/IDOR | all 507 routes swept; every admin route checked for `withSuperAdmin`; ownership patterns sampled on every resource type | 1 vertical escalation + realtime cross-tenant leak found → fixed (H-4, H-5) |
| Input validation | sampled 32 high-risk routes; grep for `$queryRawUnsafe`, `exec`, `dangerouslySetInnerHTML`, mass-assignment, path traversal | SSRF found → fixed (H-6); CSV formula injection → fixed (H-12) |
| Rate limiting / abuse | full limiter inventory (12/507 routes protected before) | wired into 8 additional high-cost endpoints (H-9) |
| Payments | Stripe + Razorpay flow deep-dive: webhook signature logic, client-trust paths, credit grants, refunds, coupons, idempotency | free-plan backdoor + self-refund + staging webhook bypass + double-credit race → fixed (H-7, H-8, H-10, H-11) |
| Webhooks | signature enforcement per environment, idempotency model | enforcement now fail-closed outside development (H-10) |
| File uploads | every upload path enumerated (avatar, CSV import, media, branding, feedback) | import size cap added; media path verified dead-code-safe |
| Error handling | grep sweep for raw `e.message` returns (199 occurrences / 144 files) | worst offenders fixed; remainder classified P2 (§5) |
| Session/edge | `src/proxy.ts` logic audit | found ALL edge protections dead code → fixed (H-13) |
| Realtime | Socket.IO mini-services auth + room authorization | any-token acceptance fixed (H-5) |
| Data audit | DB inspection via safe Prisma script | 34 users: 29 test-pattern, 25 deletable, 1 super_admin protected |
| Regression | `tsc --noEmit` (filtered to touched files: 0 errors), `vitest run` (792/824 — identical to pre-existing baseline), `next build` (exit 0), live HTTP smoke tests | all green |

**Live break-tests executed against a running production build** (standalone server, HTTP):

| Test | Expected | Actual |
|---|---|---|
| Unauthenticated `GET /api/leads` | 401 | **401** ✓ |
| Unauthenticated `GET /api/admin/overview` | 401 | **401** ✓ |
| `GET /admin` unauthenticated | redirect, no content leak | **200 (meta-redirect shell, no data)** ✓ |
| super_admin Bearer token → `/api/admin/overview` | 200 | **200** ✓ |
| super_admin Bearer → `POST /api/payments/validate-coupon` (empty body) | 400 (CSRF passes via Authorization header) | **400** ✓ |
| MFA-pending (`type:'mfa'`) token used as API credential | 401 | **401** ✓ (was: 200-level access — P0 closed) |
| Forged token (wrong secret) | 401 | **401** ✓ |
| Unknown workflow webhook trigger | 404 | **404** ✓ |
| `POST /api/payments/confirm` (free-plan backdoor) | blocked | **403** (edge CSRF gate) — route itself returns 404 in production ✓ |
| `GET /api/health`, `/`, `/auth/signin`, `/api/auth/config` | 200 | **200** ✓ |

---

## 2. Vulnerabilities Found and Fixed

Severity legend: **P0** production blocker · **P1** fix before production · **P2** non-blocking.

| # | Sev | Area | Issue | Root cause | Fix (forward-only) | Verification |
|---|---|---|---|---|---|---|
| H-1 | **P0** | Secrets | Real Google OAuth client secret, Google API key, Gmail app passwords, weak JWT/CRON secrets committed in `ensure-env.sh` (executed by keepalive scripts); 3 more Google secrets + app password in `worklog.md`; SMTP creds in `scripts/test-smtp*.js`; Google secret in `DEPLOYMENT.md`, `scripts/test-google-credentials.js`; known-password account creator in `create-verify-user.ts`; 40 pentest evidence files (live JWTs, forged admin tokens) + SQLite DB backups + user uploads git-tracked | Secrets written into tracked files during debugging | `ensure-env.sh` rewritten: zero embedded secrets, preserves existing `.env`, generates random JWT secrets via `openssl rand`; all tracked secret values redacted to `*-ROTATE-ME` markers; test scripts read `.env`; `git rm --cached` + `.gitignore` for `*.db`, `.restore-backups/`, `scripts/pentest/evidence/`, `/upload/`, `public/feedback-uploads/`, `public/invoices/`, `data/invoices/`. **Current `.env` verified to use a 64-char random `JWT_SECRET` (≠ weak committed value)** | re-grep: zero real-looking secrets in tracked files; smoke tests green |
| H-2 | **P0** | Auth/MFA | `POST /api/auth/signin` returned a full `type:'access'` JWT as `mfaSessionToken` BEFORE TOTP verification — possession = complete API access; MFA decorative | Token generator reused `generateAccessToken` | New `generateMfaSessionToken()` issues a 5-minute `type:'mfa'` JWT; `mfa/verify` accepts only `type==='mfa'`; proxy + `getAuthUser` require `type==='access'` | live test: mfa token on `/api/leads` → 401 |
| H-3 | **P1** | Auth/OAuth | Google callback matched local accounts by email without `email_verified` enforcement → attacker with an unverified Google address could take over an existing account; deactivated (banned) users auto-reactivated on Google sign-in | Email-match lacked verification proof; 2026-09-09 "fix" reintroduced auto-unban | Both callbacks (`/api/auth/callback/google`, `/api/auth/google/callback`): reject `email_verified !== true`; inactive users denied (support reactivation only); legacy-field backfill preserved; full email removed from one remaining log line | code review + typecheck; dev-consent profile unaffected (`email_verified: true`) |
| H-4 | **P1** | RBAC | `POST /api/settings/org/invites` had NO role gate — any member/viewer could invite themselves as org admin (vertical escalation); GET also unguarded | Parallel route `settings/team/invite` had the gate; this one was missed | owner/admin `orgMember` check added to GET+POST, mirroring the gated route | typecheck; pattern identical to verified sibling route |
| H-5 | **P1** | Realtime | `mini-services/realtime-service` + `ws-service` accepted ANY non-empty token and trusted client-claimed `userId` → join `user:<victim>` room and intercept cross-user events; `subscribe` allowed joining any room | Placeholder auth ("In production, validate JWT here") never implemented | `verifySocketIdentity()`: JWT verified with shared `JWT_SECRET` (issuer/audience checked), identity derived from `payload.sub` only, cookie auth supported (frontend uses httpOnly cookies); fail-closed when secret missing; targeted room joins restricted to own user/org | typecheck; both services symmetric |
| H-6 | **P1** | SSRF | `POST /api/ai/rag/ingest-url` fetched arbitrary user URLs server-side (no scheme/host/port checks) → internal network + cloud metadata reachable, response stored in RAG (exfil channel) | Format-only URL check | New `src/lib/security/url-guard.ts`: http/https only, port allowlist, blocks localhost/.internal/.local, resolves DNS and rejects ANY private/loopback/link-local/metadata address (v4+v6, incl. IPv4-mapped), re-validates redirect target, 5 MB cap; route rate-limited; safe 400 on violation | typecheck; unit-testable pure helpers |
| H-7 | **P0** | Payments | `POST /api/payments/confirm` activated ANY pending order with zero provider verification → Elite plan + 2000 credits without paying (frontend no longer calls it, route was live) | Dev-mode helper shipped without `NODE_ENV` gate | Hard-disabled in production (404) AND requires `PAYMENTS_DEV_CONFIRM_ENABLED=true` outside production; header comment points to the 3 legitimate verification paths | live test: blocked at edge (403 CSRF) + route 404 gate verified by code path |
| H-8 | **P0** | Payments | `POST /api/payments/refund` let ANY user trigger a REAL Stripe/Razorpay refund on their own (or repeatable partial) payments | Only ownership checked, no role check; dead code made the "already refunded" guard unreachable | Converted to `withSuperAdmin` (platform policy already reserves cross-tenant payment ops for super admins; `/api/admin/refund` unchanged); admin-refund ledger bug (monetary amount written as credits) fixed to use `PLAN_CREDITS` | no frontend callers (grep); typecheck |
| H-9 | **P2→fixed** | Abuse | Rate limiters defined but wired into only 12/507 routes; coupon brute-force, email-bombing, unbounded exports, RAG cost sink, anonymous website scoring | `withRateLimit` never adopted | Wired into: `resend-verification` (IP), `validate-coupon`, `/api/export`, `ai/rag/ingest-url`, `ai/rag/ingest-csv`, `website-score` (+ `withAuth`), `api_key_burst` full-key hashing; `/api/export` syntax error (`return eaderLine…`) fixed | typecheck; 429 paths exercised by limiter unit tests |
| H-10 | **P1** | Webhooks | Stripe/Razorpay webhook signature verification skipped in EVERY non-production environment (staging/test/unset NODE_ENV) → forged `checkout.session.completed` grants plans | Rejection keyed only on `NODE_ENV === 'production'` | Fail-closed unless `NODE_ENV === 'development'` | code path review; staging now 500s without secret |
| H-11 | **P1** | Payments | Credit-addon double-grant: transaction "idempotency" flipped order status but `addCreditAddon` ran unconditionally → N concurrent verifications = N× credits; verify-session activation lacked the webhook's amount check | Check-then-act outside the transaction | `updateMany({ where: { id, status: 'pending' } })` with `count===1` claim before granting; amount-consistency check added to `verify-session` (mirrors webhook) | concurrency reasoning + typecheck |
| H-12 | **P2→fixed** | Validation | CSV formula injection on export (no `=+-@` neutralization) — exported lead data could execute formulas in Excel; workflow webhook triggers executed with NO secret (HMAC optional) and attacker-controlled idempotency key | Escaper handled quoting only; secret enforced only when configured | Export escaper neutralizes leading `=+-@\t\r`; workflow webhook secret now MANDATORY (403 without), idempotency key derived from signed raw body | typecheck |
| H-13 | **P1** | Edge | `'/'` in proxy `PUBLIC_ROUTES` made EVERY request public → JWT verification, CSRF, admin gate, identity-header injection all dead code (defense relied entirely on per-route checks) | Prefix-matching bug | Proxy rebuilt: explicit public-route allowlist (auth flows, health, cron, provider webhooks, email-client trackers, token-bearing shares, crash reports, payment shims); pages still pass through; CSRF accepts cookie OR any Authorization header OR X-Requested-With; client-supplied `x-user-*` headers stripped on every request; HSTS added in production; production fail-closed guard on missing/public `JWT_SECRET` | live smoke suite: 11/11 boundary tests correct; authenticated flows unaffected |
| H-14 | **P1** | Info leak | `/api/auth/debug` returned full `DATABASE_URL` (twice); `/api/health/detailed` exposed component errors, business metrics, infra details anonymously; magic-link request logged the full login URL; `email-diagnostic` accepted CRON_SECRET via `?key=` query param | Masking regex missed `URL`; debug-first development | DB URL redacted to `SET (redacted)`; detailed health requires auth (anonymous probes get status-only); magic-link token never logged; query-param secret acceptance removed | grep + typecheck |
| H-15 | **P1** | Files | Invoice PDFs (PII) written to statically-served `public/invoices/` with partly sequential names → unauthenticated download by URL guessing; frontend opened `pdfUrl` directly | Public dir used for persistence convenience | PDFs now written to non-public `data/invoices/`; `pdfUrl` is an internal `file:data/invoices/…` marker; downloads only via authenticated `/api/billing/invoices/[id]/download`; tracked PDF artifacts removed from git | grep for openers clean |
| H-16 | **P2→fixed** | Auth | Deactivated users kept API access until access-token expiry (15 min); cron endpoints failed OPEN with public `'acquisitionos-cron-dev'` fallback; magic-link/refresh tokens stored plaintext (see §5) | `getAuthUser` lacked `isActive` check; two routes kept dev fallbacks | `isActive && !deletedAt` enforced in both `getAuthUser` paths; `payment-reconciliation` + `meetings/reminders/process` fail closed; `/api/sequences/process` gated to super-admin; `mint-admin-token.ts` refuses fallback secret | typecheck + code review |
| H-17 | **P2→fixed** | CORS | `/api/ws` sent `Access-Control-Allow-Origin: *` WITH `Access-Control-Allow-Credentials: true` | Copy-paste header set | Credentials header removed (SSE is same-origin; wildcard+credentials is the flagged combo) | grep clean |

---

## 3. Security Controls Verified (no changes needed)

- **Admin surface**: all 14 `/api/admin/*` routes call `withSuperAdmin` (DB-role check) before data access; `/admin` pages guarded server-side by `getSuperAdminSession`; zero missed routes; audit log written on every admin mutation; self-deactivation/self-credit-change blocked.
- **Signup role safety**: role is hardcoded `'owner'` in every account-creation path (email, Google, OTP, invite); no endpoint accepts `role/plan/credits/orgId` from client bodies (grepped across 507 routes).
- **JWT mechanics**: HS256 with issuer+audience enforced in both edge (`jose`) and Node (`jsonwebtoken`); `alg:none` and refresh-as-access rejected; cookies `httpOnly + secure(prod) + SameSite=strict`; refresh flow rotates tokens and checks DB revocation; signout revokes sessions.
- **OTP / magic link**: CSPRNG 6-digit OTP (`crypto.randomInt`), 10-min expiry, 5-attempt lock, constant-time compare, single-use; magic token 256-bit, single-use; password bcrypt cost 12 with timing equalization; lockout on 5 failures/15 min.
- **Tenant isolation**: leads, workflows, credits, payments, files, API keys, notifications, feedback, exports, sequences, analytics — all queries carry `userId`/org scoping with fail-closed `canUserAccessLead`-style checks (12+ lead sub-routes verified individually).
- **Razorpay verify**: HMAC(`order_id|payment_id`, key_secret) with `timingSafeEqual` + gateway re-fetch + amount check — correct.
- **Stripe webhook (production)**: raw-body `constructEvent`, amount verification, `PaymentWebhook.eventId @unique` idempotency — correct in production.
- **Avatar upload**: MIME allowlist + 5 MB cap + sharp re-encode to JPEG — polyglot-proof.
- **Client secrets**: zero non-`NEXT_PUBLIC` env reads in client components; no tokens in localStorage/sessionStorage.
- **Path traversal**: no user-controlled paths in fs operations (invoice filenames server-generated; media names `ts_sha256`).
- **Raw SQL**: no `$queryRawUnsafe`/`$executeRawUnsafe` with interpolated user input in any live path (one dead-code site flagged for deletion, §5).
- **Error pages**: generic 404/500; `error.tsx`/`not-found.tsx` leak nothing.

## 4. Remaining Risks (genuine, not hidden)

**P1 (should fix before production unless explicitly accepted):**

1. **Credential rotation required** — the secrets removed from tracked files (H-1) were in git history. The *values* remain recoverable from history until scrubbed. **Required rotations**: Google OAuth client secret, Google Search API key, all Gmail App Passwords (they are user-owned Google credentials — cannot be rotated from here). After rotation, update `.env` (never tracked files). A history scrub (BFG/gitleaks) is recommended at the operator's discretion; deliberately NOT done here (history rewrite).
2. **CSP still allows `'unsafe-inline' 'unsafe-eval'`** in `proxy.ts`/`nginx.prod.conf` — Next.js App Router needs nonce-based CSP to remove them; changing blindly risks breaking the app and was deferred. Combined with 14 `dangerouslySetInnerHTML` sites (12 static-safe, 1 user-template preview) XSS defense currently leans on React escaping.
3. **Access tokens are stateless for ≤15 min** — DB revocation is checked only on refresh/signout. `src/lib/security/jwt-security.ts` (jti blacklist) exists but is dead code; wiring it in is a follow-up.
4. **OAuth `state` is unsigned client-side JSON** (login-CSRF / relay-hardening gap; the server-side `oauth-state-store.ts` also exists unused). The exfiltration path was *reduced* (verified-email + no-unban) but the relay (`/api/auth/google/relay`) still delivers tokens to a state-chosen origin. Recommend: adopt `oauth-state-store.ts` + allowlist relay origins before public launch.
5. **199 raw `error.message` returns** across 144 route files can leak provider/DB internals. Fixed the worst offenders (backup, metrics, cron details, refund provider errors, website-score); full rollout of `src/lib/error-handler.ts` (`withErrorHandler` exists, zero importers) is mechanical follow-up work.

**P2 (non-blocking):**

6. Rate limiter is in-memory (single-node monolith: acceptable; multi-instance or restarts reset limits) and trusts `x-forwarded-for` (safe behind a sanitizing gateway only).
7. OTP/magic-link/refresh tokens stored plaintext in DB columns — hash-at-rest hardening recommended.
8. Account-lockout DoS: per-email lockout can be triggered by third parties against known emails.
9. `analyzeQueryPerformance()` in `db-optimizer.ts` builds unsafe SQL via string concat — zero callers; delete it.
10. MFA is not enforced after OTP/magic-link logins (password path only) — inconsistent factor policy.
11. `media-upload-service.ts` allows SVG without sanitization (pipeline currently dead code — fix before reviving).
12. User enumeration side-channels in auth error codes are a deliberate product tradeoff (documented in code).
13. `workflow webhook` endpoints: existing workflows WITHOUT a configured secret will now receive 403 — intended breaking change; operators must configure secrets (documented in route response).
14. Feedback crash reports accept spoofed `userId` from anonymous clients (rate-limited; low impact).
15. `NEXT_PUBLIC_APP_URL`/NEXTAUTH_URL sanitized out of the standalone `.env` by `clean-standalone.js` ("APP_PUBLIC_URL: MISSING" warning) — verify deployment env supplies them.

## 5. Production Gate Classification

| Class | Count | Items |
|---|---|---|
| **P0 — production blockers** | **0 remaining** | H-1, H-2, H-7, H-8 fixed and verified |
| **P1 — fix before production unless accepted** | 5 | credential rotation (§4.1), CSP hardening (§4.2), stateless access tokens (§4.3), OAuth state/relay (§4.4), error-message rollout (§4.5) |
| **P2 — can be addressed later** | 10 | §4 items 6–15 |

**Verdict**: with the four P0 backdoors closed, the platform is *substantially* hardened; the five P1 items above are the honest gap between "hardened" and "launch-ready". Do NOT claim full production readiness until §4.1 credential rotation is complete and §4.4 OAuth state handling is adopted.

## 6. Documentation Updates (this pass)

- **Created** `docs/CODEBASE-MAP.md` — verified feature→path map + "where do I change this" table + quirks list (no invented files; dead code explicitly labeled).
- **Created** `FINAL-SECURITY-HARDENING-REPORT.md` (this file) at repo root.
- **Existing docs audited**: the formal `docs/` tree (security/, 04-secrets-and-configuration/, SECRETS_REFERENCE.md, ENV-SECRETS-REFERENCE.md) was scanned — all placeholders, no real credentials; `ADMIN-DASHBOARD-ACCESS.md` clean. No duplicate security documentation created; this report is the single point of truth for the hardening pass.
- **Test/demo data**: `scripts/cleanup-test-data.ts` created (dry-run default; guard rails protect super_admin + paid users). Dry-run verified: 34 users → 29 test-pattern matches → 25 deletable, 0 deleted in this pass (explicit operator action required).

## 7. Git Safety Verification

```text
Starting HEAD:      efbc216e4f002c7f1b5cbd5354b36783c12cf714
Ending HEAD:        efbc216e4f002c7f1b5cbd5354b36783c12cf714 (unchanged)
Branch:             main
Rollback used:      NONE (no reset/revert/checkout/restore/cherry-pick/rebase)
```

Changed files (forward-only edits + additions) — `git status` at completion lists, grouped:

- **Modified (app)**: `src/proxy.ts`, `src/lib/auth.ts`, `src/lib/rag-service.ts`, `src/lib/security/rate-limiter.ts`, `src/lib/security/url-guard.ts` (new), `src/lib/credit-addon-fulfillment.ts`, `src/lib/workflow-executor.ts`, `src/lib/invoice-pdf-service.ts`, `src/lib/invoice-pdf-generator.ts`
- **Modified (API routes)**: auth (signin, mfa/verify, callback/google, google/callback, debug, email-diagnostic, magic-link/request, resend-verification), payments (confirm, refund, webhook/stripe, webhook/razorpay, validate-coupon, create-checkout-session, verify-session, invoices/[id]/download), settings/org/invites, cron/payment-reconciliation, meetings/reminders/process, workflows/webhook/[id] + [...path], ai/rag/ingest-url + ingest-csv, ai/chat, website-score, sequences/process, export, admin/refund, ws, leads/import, health/detailed
- **Modified (frontend)**: `src/components/dashboard/invoice-history.tsx`
- **Modified (mini-services)**: `mini-services/realtime-service/index.ts`, `mini-services/ws-service/index.ts`
- **Modified (scripts/config)**: `ensure-env.sh` (secret-free rewrite), `scripts/test-smtp.js`, `scripts/test-smtp-candidates.js`, `scripts/test-google-credentials.js`, `scripts/create-verify-user.ts`, `scripts/mint-admin-token.ts`, `.gitignore`, `worklog.md` + `DEPLOYMENT.md` (secret redaction)
- **New**: `docs/CODEBASE-MAP.md`, `FINAL-SECURITY-HARDENING-REPORT.md`, `src/lib/security/url-guard.ts`, `scripts/cleanup-test-data.ts`
- **Untracked (git rm --cached; working-tree files untouched)**: `scripts/pentest/evidence/**`, `.restore-backups/**`, `db/custom.db`, `scripts/custom.db.backup-*`, `upload/**`, `public/feedback-uploads/**`, `public/invoices/**`

## 8. Verification Log

| Check | Command | Result |
|---|---|---|
| Typecheck | `npx tsc --noEmit` (filtered to all touched files) | 0 errors in touched files (322 pre-existing project errors unchanged, masked by `ignoreBuildErrors`) |
| Unit/integration tests | `npx vitest run` | **792 passed / 32 failed (8 files)** — identical failure set to pre-change baseline (smtpConfig drift, jwt-security jti bug, mock-db gaps); zero regressions |
| Production build | `npm run build` (`next build --webpack` + clean-standalone) | **exit 0** |
| Live smoke tests | standalone server + curl | 11/11 boundary + positive tests correct (table §1) |
| Prisma schema | validated in build pipeline (`prisma generate`) | OK |
