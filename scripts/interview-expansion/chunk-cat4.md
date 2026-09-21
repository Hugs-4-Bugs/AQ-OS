### Q4-5: What is your JWT implementation — structure, signing, and storage
**DIFFICULTY:** Hard
**CATEGORY TAG:** Spring Security

**ANSWER:**
We issue a compact pair: a short-lived **access token** (15 min, JWT) and a long-lived **refresh token** (30 days, opaque random 256-bit string stored hashed in `user_session`). Access JWT claims: `sub` (user id), `org` (tenant id — every downstream query filters on it), `role`, `iat`/`exp`, `jti` (unique id), and `kid` (key version for rotation). We deliberately keep claims MINIMAL — no email, no profile data — because JWTs are readable by anyone holding them and tokens end up in logs; identity lookup happens server-side from `sub`. Signing is **HS256 today with a 512-bit key** from the secrets manager, but the code is algorithm-configurable and the `kid` header supports migration to RS256 (useful the day a second service must verify tokens without sharing the secret).

The filter: `JwtAuthenticationFilter extends OncePerRequestFilter` sits early in the `SecurityFilterChain`; it extracts the Bearer token, verifies signature + expiry + not-revoked (a Redis denylist keyed by `jti` with TTL = remaining validity — covering the logout/compromise window), builds `UsernamePasswordAuthenticationToken` with authorities, and sets the `SecurityContext`. Failures return 401 via the `AuthenticationEntryPoint`, never stack traces. Storage on the client: access token in memory (React state/module variable) + refresh token in an `HttpOnly, Secure, SameSite=Strict` cookie — that combination means XSS can steal only a 15-min access token, not the 30-day refresh; CSRF stays defended because the refresh cookie is SameSite=Strict and refresh requires the CSRF double-submit header.

Revocation is the honest weak point of stateless JWT, and I name it: an access token can't be "deleted", only denied. Our layers: 15-min TTL bounds the damage; the Redis `jti` denylist covers explicit logout/"log out all devices"; the `org`/`role` claims are re-checked against the DB for admin-critical operations (`@PreAuthorize` at service level reads fresh role), so a stolen token with a stale role can't demote itself into admin actions. Rotation: refresh endpoint rotates the refresh token on every use (old one invalidated, reuse-detection revokes the whole session family — that's the OAuth2 refresh-token rotation pattern, catching token theft when a rotated-out token is replayed).

**KEY TERMS TO MENTION:**
- 15-min access JWT + 30-day opaque refresh token (hashed at rest)
- Minimal claims + `kid` for key rotation; HS256 → RS256 migration path
- `OncePerRequestFilter` + Redis `jti` denylist for revocation
- HttpOnly/SameSite cookie for refresh, memory for access
- Refresh-token rotation with reuse detection (session-family revoke)

**FOLLOW-UP QUESTIONS:**
1. Why opaque refresh tokens instead of a second JWT?
2. A user reports a stolen laptop — what can you actually do?

**FOLLOW-UP ANSWERS:**
1. A refresh JWT would be self-validating for 30 days with no server-side gate except a denylist — the exact property we don't want in a long-lived credential. Opaque tokens force a DB/Redis lookup on every refresh, which is where revocation, device tracking, and reuse-detection live. The lookup is once per 15 min per user — negligible.
2. Revoke all their sessions (session-family revoke by user id), rotate if needed their connected mailboxes' tokens, and the stolen access tokens die within 15 min max. This drill is why sessions carry device metadata — the security page shows devices and a "revoke all" button. The honest limit: any already-issued access token works until TTL — that's the tradeoff we bought with statelessness, priced at 15 minutes.

**RED FLAGS TO AVOID:**
- Storing JWTs in localStorage with long TTL (XSS jackpot)
- PII inside JWT claims
- "JWT is stateless so logout is impossible" with no denylist/mitigation story

---

### Q4-6: How did you implement role-based access control (RBAC)
**DIFFICULTY:** Medium
**CATEGORY TAG:** Spring Security

**ANSWER:**
Three dimensions: **role** (platform-level: USER, ADMIN, OWNER), **permission** (action-level: `lead:delete`, `billing:manage`), and **tenant scope** (org_id — the dimension people forget). Roles map to permission sets in a DB table loaded into the `SecurityContext` at authentication (not hard-coded if-else), so granting "MANAGER" a new permission is data, not a deploy. Enforcement is layered: URL-level rules in the `SecurityFilterChain` (coarse: `/api/admin/**` needs ADMIN), and method-level `@PreAuthorize("hasAuthority('lead:delete')")` on service methods (fine-grained, and on the SERVICE not the controller — internal callers can't bypass). SpEL expressions compose checks: `@PreAuthorize("hasAuthority('lead:edit') and @leadSecurity.canEdit(#leadId, authentication)")` where `leadSecurity` is a bean doing the tenant-scope check (lead belongs to caller's org) — this is the piece that prevents IDOR, the #1 API vuln.

The tenant-scope check is also enforced at the **repository layer** as defense in depth: every lead/deal query method takes `orgId` and the JPA layer appends it (Specifications always `and(orgId eq :orgId)`); an integration test asserts that org-A's authenticated context physically cannot fetch org-B's lead even by guessing UUIDs — we have a dedicated "cross-tenant" test suite that iterates every GET-by-id endpoint with a foreign id and asserts 404 (404, not 403 — don't confirm existence). Ownership vs role: an OWNER can manage the org's users; a USER can only see their own leads unless the org has "shared pipeline" enabled — that's ABAC (attribute-based) flavor on top of RBAC, implemented as policy methods in `leadSecurity` rather than more roles, because permission matrices explode combinatorially when you add roles per attribute.

**KEY TERMS TO MENTION:**
- Role → permission mapping in data, loaded to SecurityContext
- `@PreAuthorize` at service layer with SpEL + policy beans
- Tenant scope as the third RBAC dimension (IDOR prevention)
- Repository-level org filter as defense in depth + cross-tenant test suite
- 404 vs 403 choice for foreign resources

**FOLLOW-UP QUESTIONS:**
1. Why 404 for a foreign lead instead of 403?
2. How do you test permission matrices without combinatorial explosion?

**FOLLOW-UP ANSWERS:**
1. 403 confirms the resource exists ("you may not see lead X" vs "no lead X") — an enumeration oracle for a competitor or ex-employee probing ids. 404 answers identically for missing AND unauthorized, leaking only what a failed guess would leak anyway. Exception: when the user already knows the resource exists (they can see it in a shared list), 403 is fine and more debuggable.
2. The matrix is data, so tests are generated: for each (role × endpoint) pair, a parameterized test asserts expected status from the same permission table the runtime uses — one test class covers ~300 combinations. The trick is the expected values come from the same source of truth as enforcement, so the test verifies wiring, not policy; policy changes update the table and the test expectations together.

**RED FLAGS TO AVOID:**
- RBAC checks only in the frontend (UI hiding ≠ security)
- @PreAuthorize only on controllers (bypassable internally)
- Forgetting tenant scope — role checks alone don't stop cross-org leaks

---

### Q4-7: Walk me through your SecurityFilterChain — how are API endpoints actually secured
**DIFFICULTY:** Hard
**CATEGORY TAG:** Spring Security

**ANSWER:**
The chain (Spring Security 6, component style) in order: (1) `.cors(...)` with the allow-list source — preflights resolve before auth; (2) security context setup (stateless — `SessionCreationPolicy.STATELESS`, we never create HTTP sessions for API calls); (3) **permit-all paths**: `/api/auth/otp/request`, `/otp/verify`, `/magic-link/*`, `/auth/google/*`, `/actuator/health` (internal port), Stripe's `/api/stripe/webhook` — each protected by its OWN mechanism (rate limits, HMAC signatures) instead of session auth, which is the key insight: "permitAll" means "no JWT required", not "no security"; (4) our `JwtAuthenticationFilter` (OncePerRequestFilter) — parses Bearer, verifies, loads authorities, sets context, and populates MDC with userId/orgId for the whole chain's logging; (5) authorization rules — anything else `authenticated()`; (6) exception handling wiring: `AuthenticationEntryPoint` → clean 401 JSON, `AccessDeniedHandler` → 403 JSON (never the default HTML error pages).

Below the filter chain, three more gates a request passes: the `RateLimitFilter` (Redis token bucket keyed by user/org/IP with per-route policies — auth endpoints stricter), the controller's `@Valid` boundary, and method security `@PreAuthorize`. I emphasize the "authn vs authz vs policy" separation because interviews probe it: authentication (who are you) = JWT filter; authorization (what can you do) = PreAuthorize + URL rules; policy (business conditions — "is this lead in YOUR org", "is the trial expired") = policy beans called from SpEL or service code. CSRF: disabled on the JWT-bearing API paths (no cookie auth there — CSRF is irrelevant without ambient credentials) but the auth endpoints that DO use cookies (refresh, logout) keep double-submit CSRF tokens — blanket-disabling CSRF and forgetting cookie endpoints is the classic hole.

Testing the chain: MockMvc tests per security property — unauthenticated → 401, wrong role → 403, cross-tenant → 404, webhook without valid signature → 400; plus one "chain smoke" test asserting permit-all paths are exactly the intended list (a regex slip that accidentally opens `/api/admin/**` fails CI — this actually caught a typo once: a trailing slash made an admin route match the public pattern).

**KEY TERMS TO MENTION:**
- Filter order: CORS → stateless context → permitAll(+own defenses) → JWT filter → authorize
- permitAll ≠ unprotected (rate limits, HMAC per public path)
- AuthenticationEntryPoint / AccessDeniedHandler for clean JSON errors
- CSRF disabled only where no ambient credentials; kept on cookie endpoints
- Chain smoke test pinning the public-path list

**FOLLOW-UP QUESTIONS:**
1. Why stateless sessions — what did you lose?
2. Where does the rate limiter sit and why there?

**FOLLOW-UP ANSWERS:**
1. Lost: instant server-side revocation and session convenience. Gained: horizontal scaling with no sticky sessions or session store on the hot path (Redis only for denylist checks). The trade is deliberate: revocation is re-added at the token layer (denylist + rotation) rather than paying sticky-session scaling tax.
2. After the JWT filter — so limits key on identity when available (user/org) falling back to IP for anonymous, and rejected requests don't consume downstream work. Auth endpoints additionally have an anonymous pre-filter (stricter IP bucket) because they're the brute-force target and identity doesn't exist yet.

**RED FLAGS TO AVOID:**
- permitAll on auth/webhooks with no compensating controls
- Disabling CSRF globally without understanding cookie paths
- HTML default error pages leaking stack traces

---

### Q4-8: How did you prevent CSRF attacks
**DIFFICULTY:** Easy
**CATEGORY TAG:** Spring Security

**ANSWER:**
First, the precise mental model: CSRF exploits **ambient credentials** — cookies the browser attaches automatically — to make a victim's browser send a forged state-changing request. So the defense decision tree starts with "does this endpoint authenticate by cookie?" Our JWT APIs (Bearer header) have zero ambient credentials: a malicious site CANNOT set an Authorization header on a cross-origin request (headers are non-ambient), so CSRF is structurally impossible there and `csrf().disable()` is correct — disabling it everywhere else would be cargo cult, but disabling it on cookie endpoints is a hole. The cookie-authenticated endpoints (refresh-token cookie, logout, the marketing-site session) use **SameSite=Strict cookies** (browser won't attach them on cross-site requests — kills CSRF for modern browsers) PLUS **double-submit CSRF tokens** (a `csrf` cookie readable by our origin's JS + `X-CSRF-Token` header that must match; the attacker's cross-site form can't read our cookie to set the header) as defense for older browsers and non-browser clients (native apps replay the header).

Beyond tokens, request-design hygiene shrinks the attack surface: all state changes are POST/PUT/PATCH/DELETE with JSON bodies (a plain `<form>` GET forgery can't set JSON content-type without a preflight, and preflights fail cross-origin without CORS approval); no state changes via GET (even "resend email" links are POSTs from the app); and CORS allow-list is strict so even a forged XHR from an evil origin is blocked by the browser before hitting us. Defense-in-depth note for interviews: CSRF tokens are compared with constant-time equality, rotate on login (session-fixation adjacent), and the auth endpoints are additionally rate-limited — CSRF protection layered with rate limiting is what actually stops scripted abuse at scale.

**KEY TERMS TO MENTION:**
- CSRF = ambient credentials (cookies), not header-based auth
- SameSite=Strict as the primary modern defense
- Double-submit token pattern for cookie endpoints
- JSON-body-only mutations + strict CORS as structural defenses
- Token rotation on login + constant-time comparison

**FOLLOW-UP QUESTIONS:**
1. CSRF vs XSS — how are they different and how do they interact?
2. Why not SameSite=None ever?

**FOLLOW-UP ANSWERS:**
1. CSRF makes the victim's browser send requests AS the victim without the attacker seeing responses; XSS runs the attacker's code IN your origin and can read everything CSRF can only blindly request. They chain: an XSS hole defeats CSRF tokens (the script reads the token cookie) — which is why token storage choices (HttpOnly where possible) and output encoding are the first line, and CSRF is the second.
2. SameSite=None (attach cookies cross-site) is only for legitimate embedded cross-site usage (payment iframes) and then REQUIRES Secure + the token defenses; we never needed it — our app is first-party, so Strict costs nothing and closes the whole class.

**RED FLAGS TO AVOID:**
- "We disabled CSRF" without the Bearer-header reasoning
- Confusing CSRF (forge requests) with XSS (run code)
- Relying on a single layer (no SameSite, no CORS discipline)

---

### Q4-9: How did you implement session management for a stateless API
**DIFFICULTY:** Medium
**CATEGORY TAG:** Spring Security

**ANSWER:**
"Session management" in our stack means **managing the refresh-token lifecycle**, since access tokens are 15-minute self-contained JWTs. The `user_session` table is the session registry: id, user_id, refresh_token_hash (SHA-256 — DB leak can't mint sessions), device fingerprint (UA + IP hash), created_at, last_used_at, expires_at, revoked_at, and a `family_id` grouping rotated tokens from one login. Sessions are first-class user-facing objects — the security page lists devices ("MacBook · Mumbai · 2h ago") with per-session and "revoke all" buttons, because session management is a product feature, not just plumbing.

Mechanics: refresh endpoint validates the presented token against the registry (hash lookup), checks revocation and expiry, then **rotates**: new refresh token issued, old marked revoked, both sharing family_id. Reuse detection — a revoked token being presented again — signals theft (the legitimate client would use the NEW token); response: revoke the ENTIRE family + security alert email ("new sign-in required everywhere"). Concurrency nuance: legitimate double-tab refresh races exist, so a just-rotated token gets a 30-second grace window (revoked-but-accepted, returns the same new token) — without it, every user with two tabs logs out randomly; with it, real theft (minutes later) still trips rotation. Cleanup: a daily job purges expired/revoked sessions older than 30 days, keeping the table lean and the active-session list meaningful.

Server-side, "stateless" refers to request handling: no HTTP sessions, no sticky load balancing — every request carries its identity. The session REGISTRY is state, but it's consulted only on refresh (once per 15 min), not per request — that's the balance: statelessness where it's hot (per-request), state where control matters (lifecycle).

**KEY TERMS TO MENTION:**
- Session registry = refresh-token lifecycle table (hashed tokens)
- Device fingerprinting + user-facing device list (product feature)
- Rotation with family_id + reuse detection → family revoke
- 30s grace window for legitimate double-tab races
- Registry consulted on refresh only — per-request stays stateless

**FOLLOW-UP QUESTIONS:**
1. Why hash refresh tokens — they're already random?
2. How do you cap "active sessions per user"?

**FOLLOW-UP ANSWERS:**
1. Defense in depth: a DB dump with raw tokens is a session farm — every row is a working login. Hashed, the dump is inert. Randomness protects against guessing; hashing protects against extraction. Same reason we hash OTPs and magic-link tokens.
2. Soft cap: > 10 concurrent sessions triggers a step-up (re-auth + email alert) rather than hard-revoke, because power users with multiple devices are legitimate. The alert is the detection mechanism — session count anomalies (50 sessions in an hour) feed the account-takeover detector, which CAN hard-revoke.

**RED FLAGS TO AVOID:**
- Raw refresh tokens in DB
- No rotation/reuse detection (30-day bearer credentials)
- Saying "stateless" and then having no answer for logout/theft

---

### Q4-10: How did you handle password hashing (BCrypt) when the primary auth is OTP
**DIFFICULTY:** Medium
**CATEGORY TAG:** Spring Security

**ANSWER:**
Passwords are the FALLBACK credential (users who skip Google OAuth), so they exist but are deliberately boring — the interview value is in explaining the parameters and why. Hashing: **BCrypt** (`PasswordEncoder` = `BCryptPasswordEncoder`, strength 12) — cost 12 ≈ 250ms/hash on our hardware: slow enough to make offline cracking expensive, fast enough to not DoS our own login endpoint; BCrypt over SHA-256 because it's *designed* slow + salt built-in (unique per hash, stored inline) so rainbow tables are dead on arrival. The upgrade path question I preempt: why not Argon2id — it's the modern winner (memory-hard); our answer is migration-readiness: hashes are stored with algorithm prefix (`$2a$12$...`) so a future `DelegatingPasswordEncoder` re-hashes transparently on next successful login — the same mechanism that would let us adopt Argon2id without a "reset all passwords" event.

Around the hash, the standard hygiene: password policy via zxcvbn-style strength scoring (length-first, no composition rules — NIST 800-63B guidance), breach-list screening (k-anonymity API check at signup/change), no maxlength paranoia beyond 72 bytes (BCrypt's input limit — we hash a pre-hash for longer inputs), constant-time comparisons everywhere (BCrypt's verify is), login rate limiting + progressive lockout shared with the OTP path, and password reset via signed single-use token (same machinery as magic links, 15-min TTL, invalidated on use + revokes all sessions on completion — a password reset IS a session-kill event). OTP credentials get the same respect: OTPs are 6 digits but random per request, stored hashed with expiry, attempts counted — because a 6-digit OTP is weaker than a good password (10^6 space) and the lockout (5 tries → 15 min) is what makes it acceptable; I explain that pairing honestly in interviews — the math is the answer, not the brand of hashing.

**KEY TERMS TO MENTION:**
- BCrypt strength 12 + unique salts (why slow hashing matters)
- Algorithm-prefixed hashes → `DelegatingPasswordEncoder` upgrade path (Argon2id-ready)
- NIST-aligned policy (length over composition), breach screening
- Reset = single-use signed token + session revocation
- OTP brute-force math: 10^6 space → lockout makes it safe

**FOLLOW-UP QUESTIONS:**
1. Why 250ms per hash isn't a DoS vector on login?
2. Where do you store the pepper, if anywhere?

**FOLLOW-UP ANSWERS:**
1. The 250ms cost is bounded by pre-hash rate limiting (5 attempts/15min/account, IP buckets) — an attacker gets ~20 hashes/min/account, not thousands. Without rate limiting ANY hashing scheme is abusable; with it, cost-per-hash is armor for the DB-leak scenario (offline), which is where bcrypt earns its keep.
2. We don't pepper today; BCrypt's per-hash salt + 12 rounds covers the modeled threat (DB leak + offline cracking). A pepper (HSM/KMS-held secret pre-hashed with the password) is the next rung if we needed DB-leak defense WITHOUT rate-limit assumptions — I can describe the design (HMAC-SHA256(password, pepper) → bcrypt) and its operational cost (rotation = all hashes invalid), which is exactly why it's not free and we deferred it.

**RED FLAGS TO AVOID:**
- MD5/SHA-256 "with salt" for passwords (fast = crackable)
- Not knowing your own cost factor or its latency consequence
- Password policy straight from 2005 (uppercase+symbol rules)

---

### Q4-11: How did you implement rate limiting for auth endpoints
**DIFFICULTY:** Hard
**CATEGORY TAG:** Spring Security / Redis

**ANSWER:**
Auth endpoints are the brute-force front door, so they get a **layered limiter**, each layer keyed differently because each answers a different attack: **Layer 1 — per-IP token bucket** (Redis, `INCR` + `EXPIRE` sliding window): 10 OTP requests / 10 min / IP — stops a single host spraying; behind the ALB the key uses the right-most trusted X-Forwarded-For entry (parsed from a known-proxy chain, never client-supplied blindly — the header-spoofing classic). **Layer 2 — per-account lockout**: 5 failed verifications per phone/email → account locked 15 min with exponential growth on repeat (15 → 60 min); counters in Redis (`otp:attempts:{emailHash}`) with atomic `INCR`-then-check, so concurrent attempts can't race past the cap; this is the layer that makes 6-digit OTPs mathematically safe (10^6 / 5 tries per quarter-hour ≈ centuries for meaningful success probability). **Layer 3 — global anomaly guard**: org-level and platform-level counters that page us when aggregate OTP failure rates spike (a distributed attack from many IPs doesn't trip per-IP or per-account layers — only the aggregate sees it).

Failure semantics matter as much as the numbers: limit responses are generic 429 with `Retry-After` — never "this account is locked" (account-existence oracle) — and the per-account lock applies to the VERIFICATION step, while the request step stays available (a locked account that can't even request an OTP is a DoS handle against a victim's login). Every rejection increments metrics tagged by layer+route; the Grafana auth dashboard is how we noticed an scraper hammering the magic-link endpoint within 20 minutes of its launch. Implementation: a `RateLimitFilter` before the controller (so rejected requests cost nothing) + a small `RateLimiter` service (Redis Lua script for atomic bucket ops — no Lua, no atomicity, race conditions between INCR and EXPIRE).

**KEY TERMS TO MENTION:**
- Layered keys: per-IP bucket, per-account lockout, global anomaly guard
- Correct X-Forwarded-For parsing behind ALB (spoof defense)
- Atomic Redis ops (Lua) — INCR/EXPIRE race
- Generic 429s (no account-existence oracles)
- Verification lockout ≠ request lockout (victim-DoS avoidance)

**FOLLOW-UP QUESTIONS:**
1. Why not rate limit in the load balancer only?
2. Distributed brute force across 10,000 IPs — what defends?

**FOLLOW-UP ANSWERS:**
1. The LB sees IPs and paths, not identities or business semantics — it can't do per-account lockout, can't distinguish OTP-request from OTP-verify cost, and its counters are blunt during incidents (changing LB config mid-attack is slow; our Redis-backed thresholds are tunable live). LB-level (WAF/edge) limits are still useful as the coarse outer net — defense in depth, different granularity.
2. Layer 3 (aggregate anomaly) detects it and trips platform-wide: raise OTP length temporarily, tighten global OTP-request caps, enable CAPTCHA step-up on request endpoints, and page on-call with the attack fingerprint (which orgs/targets). The per-account lockout still caps per-victim damage at 5 guesses/quarter-hour — the math holds even under 10k IPs; what degrades is availability, so the guard's job is protecting the service while the math protects the accounts.

**RED FLAGS TO AVOID:**
- One naive per-IP counter (spoofable XFF, shared-IP collateral)
- Lockout messages that leak account existence
- Non-atomic Redis increment logic (race = bypass)

---

### Q4-12: How did you handle token refresh and expiry strategy
**DIFFICULTY:** Medium
**CATEGORY TAG:** Spring Security

**ANSWER:**
The strategy optimizes for three goals in priority: security (short access life), UX (no random logouts), and simplicity of revocation. **Access tokens: 15 minutes.** At 15 min, a stolen token's value window is bounded, and the renewal cost is invisible — the client refreshes proactively at ~12.5 min (80% of TTL) BEFORE expiry via an interceptor, so no request ever waits on a refresh round-trip. Concurrent-request handling is the subtle part interviewers probe: when the token expires mid-flight with 4 parallel API calls, ALL of them would 401 and ALL would try to refresh — thundering herd on the refresh endpoint and, worse, refresh rotation would revoke the token 3 times (reuse-detection firing on the user's own tabs). Solution: client-side single-flight refresh — a shared promise; the first 401 triggers ONE refresh, other callers await the same promise and retry with the new token; server-side the 30-second rotation grace window absorbs any remaining races.

**Refresh tokens: 30 days sliding.** Each use rotates (covered in Q4-9); `last_used_at` extends nothing — the 30-day expiry is absolute from login, and sliding would mean an active attacker never expires; instead we expire absolute + re-auth on risk signals (new device + new geography + sensitive action → step-up OTP). Backend endpoints: `/auth/refresh` validates the registry entry (hash, revocation, expiry), rotates, returns new pair; failures are 401 with a machine-readable code (`REFRESH_EXPIRED` vs `REFRESH_REUSED`) so the client knows whether to redirect to login silently or show "signed out for your security". Scheduled cleanup + metrics (refresh success rate, rotation-reuse detections — a spike IS an attack signal and alerts) complete the loop. Clock-skew tolerance: verification allows ±30s leeway — a lesson from a deploy where the auth server's clock drifted and every token in the fleet expired 40 seconds "early", an incident I use to explain why skew params exist.

**KEY TERMS TO MENTION:**
- 15-min access + proactive client refresh at 80% TTL
- Single-flight refresh promise (parallel 401 thundering herd)
- Rotation + grace window interplay (double-tab vs theft detection)
- Absolute (not sliding) refresh expiry + risk-based step-up
- Machine-readable 401 codes (silent redirect vs user-visible logout)

**FOLLOW-UP QUESTIONS:**
1. Why not refresh-on-401 only, without proactive refresh?
2. How would you shrink access TTL to 5 min without UX damage?

**FOLLOW-UP ANSWERS:**
1. Reactive-only means the first request of every expiry window pays a serial round-trip (401 → refresh → retry), and parallel callers race — we measured +180ms p95 spikes at expiry boundaries. Proactive refresh moves the cost off the critical path; 401-handling stays as the safety net, not the mechanism.
2. Mechanically trivial (config + TTL math), UX-wise it multiplies refresh traffic 3× and makes the client refresh logic hot — with single-flight that's fine, but the real cost is server-side: refresh endpoint QPS triples. The better trade at that point is moving to RS256 + a dedicated auth service where 5-min tokens are cheap, i.e., changing the architecture when the requirement, not tweaking numbers hoping UX holds.

**RED FLAGS TO AVOID:**
- Long-lived access tokens "for simplicity" (30-min+ JWTs)
- No answer for parallel-refresh races
- Sliding refresh expiry (immortal sessions for active attackers)

---

### Q4-13: What is your approach to API key authentication (service-to-service)
**DIFFICULTY:** Medium
**CATEGORY TAG:** Spring Security

**ANSWER:**
API keys exist in our system for two actors: partner integrations (a customer's backend calling our public API on behalf of their org) and internal cron workers. Design: keys are **random 32-byte secrets, shown once** at creation (`aq_live_<24 chars>` visible prefix for identification), stored **SHA-256 hashed** with a metadata record (org, scopes, created_by, last_used_at, expires_at, rate-tier). Authentication: `X-API-Key` header → `ApiKeyAuthenticationFilter` hashes the presented key and does a constant-time lookup (hash index) → loads the key's authorities (scopes like `leads:read`) into the SecurityContext — so downstream `@PreAuthorize` works identically for keys and users, one authorization model. Lookup-by-hash means the DB never stores a usable secret; a dump can't call us.

Hygiene rules that interviews want: **scopes are least-privilege** (a reporting integration gets `leads:read`, never write), **expiry is mandatory** (90-day default with renewal reminders — eternal keys are how breaches age), **rotation without downtime** (create second key → migrate → revoke first; both valid during the window), and **revocation is instant** (filter checks a `revoked_at` + a Redis-cached status with 30s TTL — revocation propagates in ≤ 30s, documented trade-off). Every key call logs org+key-id in MDC (audit trails attribute actions to the key, not just the org), keys carry their own rate-limit tier, and usage dashboards per key are a product feature — partners can see their own traffic. What I explicitly did NOT build: home-rolled HMAC request signing — that's the right next step for high-security partners (SigV4-style), but key+TLS+scopes+rotation covers our current threat model, and I can explain exactly when I'd upgrade (non-repudiation needs, replay-sensitive endpoints).

**KEY TERMS TO MENTION:**
- Show-once keys + SHA-256 hash storage + visible prefix for identification
- Scopes → same authorities model as users (one authz path)
- Mandatory expiry + zero-downtime rotation
- Constant-time lookup + Redis-cached revocation (≤ 30s)
- Per-key MDC attribution, rate tiers, usage dashboards

**FOLLOW-UP QUESTIONS:**
1. Why hash API keys but not, say, encrypt them?
2. Key in a URL query param — ever acceptable?

**FOLLOW-UP ANSWERS:**
1. Encryption implies we NEED to recover the secret — we never do; verification is hash-compare. Hashing means even we can't leak what we don't store. Encrypting would put a decryption key one config mistake away from turning our DB into a key farm.
2. No — URLs land in access logs, browser history, proxy logs, referrer headers; the key becomes log-file archaeology for anyone with log access. Header-only, TLS-only. If a partner can't set headers, they shouldn't be integrating via API keys at all.

**RED FLAGS TO AVOID:**
- Storing raw keys (or "encrypted" with the key in the same DB)
- Eternal keys with no expiry/rotation story
- Different authorization logic for keys vs users (drift bugs)

---

### Q4-14: How did you prevent brute force attacks beyond rate limiting
**DIFFICULTY:** Medium
**CATEGORY TAG:** Spring Security

**ANSWER:**
Rate limiting caps attempts; brute-force defense is the full toolkit around it. **Entropy first**: OTPs are 6 random digits with no sequential reuse (a new OTP invalidates the old — no accumulation of knowledge across requests), magic-link tokens are 256-bit random with 10-minute TTL and single-use, passwords are breach-screened — you can't brute-force 128 bits of entropy with 5 guesses per 15 minutes; the math IS the defense, and I show it: 5 attempts/quarter-hour × 4 quarters × 24 h × 15-min lockout doubling on repeat ⇒ expected time to hit a 6-digit OTP ≈ 10^6/(20/day) ≈ 137 years. **Progressive friction**: repeated failures escalate cost per attempt — lockout windows double (15 min → 1 h → 6 h), then a CAPTCHA/step-up enters the flow, and a device fingerprint (fingerprint hash of UA/platform/screen — soft signal, never sole factor) entering fresh on a known account triggers email alert + stricter limits.

**Detection as the second line**: every auth event writes to the audit stream (account, ip, device, result, latency); a streaming rule set flags (a) distributed failures against one account across IPs (per-IP limits blind to this), (b) one IP failing across MANY accounts (credential-stuffing shape), (c) success-after-failure-spike (the actual break-in signal). Rule hits raise risk score on the account: next logins require OTP step-up regardless of method, sessions require re-auth for sensitive ops, and at threshold the account is temporarily locked with owner notification — the alert matters as much as the block (a real user locked out without warning is a support ticket; warned, it's trust). **Credential stuffing specifically** (leaked password lists): breach-screening at login (optional, k-anonymity) + step-up OTP on new-device logins means a valid leaked password alone doesn't yield access — second factor is the design answer, and the reason OTP-first auth is genuinely stronger than it sounds.

**KEY TERMS TO MENTION:**
- Entropy math as the primary defense (show the numbers)
- Progressive friction: doubling lockouts → CAPTCHA → step-up
- OTP invalidation on re-request (no knowledge accumulation)
- Streaming detection rules (distributed + stuffing shapes) → risk scoring
- Success-after-failure-spike = the break-in signal that alerts

**FOLLOW-UP QUESTIONS:**
1. An attacker with a botnet of residential IPs — what still works in your defense?
2. Why alert the user on lockout — doesn't that tip off attackers?

**FOLLOW-UP ANSWERS:**
1. IP diversity defeats per-IP limits but not per-account limits (still 5 guesses/quarter-hour on the victim), not entropy (the math is IP-independent), not device-fingerprint shifts (botnet browsers rotate fingerprints predictably — fingerprint instability itself is a risk signal), and not the aggregate anomaly guard — residential botnets are exactly the shape the stuffing rule catches. Defense that doesn't depend on IP identity is what survives botnets.
2. The attacker already knows the account exists (they're attacking it). The alert's value to the defender (user changes password, reports unknown attempts) outweighs the tip-off cost; and the message is generic ("unusual sign-in attempts") — it never confirms whether attempts succeeded or which method was targeted.

**RED FLAGS TO AVOID:**
- "Rate limiting" as the entire answer (IP rotation defeats it)
- No detection layer — blocks without visibility into attack shapes
- Tipping off via specific error messages (method/target leaks)

---

### Q4-15: How did you implement audit logging for security events
**DIFFICULTY:** Medium
**CATEGORY TAG:** Spring Security

**ANSWER:**
The audit log answers "who did what, from where, when" with tamper-evidence — a different animal from application logs (debuggability). Implementation: an `AuditAspect` (Spring AOP, `@Around` on `@Audited`-annotated service methods) plus explicit `AuditService.event(...)` calls for non-method events (auth results, webhook receipts). Every record: actor (user id / api-key id / "system"), actor org, action (verb-noun enum: `LEAD.DELETE`, `AUTH.OTP_FAIL`), resource type + id, before/after diff for updates (JSON of changed fields only), ip, user-agent, request id (correlates with traces), timestamp (UTC), and outcome. Storage: append-only `audit_event` table (no UPDATE grants for the app role — the DB user physically cannot mutate history), monthly partitions, 400-day hot retention then archived to encrypted S3 (compliance-retained). Integrity: nightly Merkle-style chained hash (each record hashes the previous) persisted to a separate store — a deleted/edited row breaks the chain and the verification job alerts; not full blockchain theater, but enough to prove post-hoc tampering for our compliance needs.

Coverage decisions: auth events ALL logged (success AND failure — failures are the attack signal), permission denials logged, admin actions logged with before/after, data exports logged (GDPR subject-access needs the "what left" record), but high-frequency reads NOT logged (noise kills signal; the access-control story covers reads). Query-ability: the admin UI filters by actor/org/action/time — support lives in this tool ("who changed this deal price?" is a 5-second lookup). GDPR interplay: audit rows reference user ids, not PII payloads; the before/after diffs exclude secrets (passwords/OTPs are never diffed — masked by the aspect). Testing: an aspect unit test (annotation → record shape) + a coverage test asserting every service method in the `admin` package carries `@Audited` — coverage of security logging enforced in CI, because the failure mode of audit logging is silent gaps, not bugs.

**KEY TERMS TO MENTION:**
- `@Audited` AOP aspect + explicit events for non-method flows
- Append-only table, app role lacks UPDATE grant (DB-enforced)
- Before/after field-level diffs, secrets masked
- Chained-hash tamper evidence + S3 archive (retention)
- Failure events logged (auth failures = attack signals); CI coverage test

**FOLLOW-UP QUESTIONS:**
1. Why not log everything — what's the cost of over-logging?
2. How does audit logging interact with GDPR deletion requests?

**FOLLOW-UP ANSWERS:**
1. Three costs: signal dilution (10M rows where 100 matter = no forensics), storage/latency (synchronous audit writes on hot paths — ours are async AFTER_COMMIT with a bounded queue and drop-oldest policy for non-critical events, CRITICAL events block on write), and compliance exposure (logging PII creates its own GDPR surface). Audit logs are a curated record, not a backup of reality.
2. We log references, not payloads — an erasure request removes the user's PII from production tables while audit rows keep only the immutable id + action history (which is the legitimate-interest record: proving what the SYSTEM did requires the actor id remain). Diffs that embedded personal data are purged by the retention job on erasure; the chain hash records the deletion itself, auditable, not silent.

**RED FLAGS TO AVOID:**
- Audit logs without tamper protection (anyone with DB access edits history)
- Logging secrets into diffs (audit trail becomes the leak)
- Synchronous audit writes stalling hot paths with no policy
