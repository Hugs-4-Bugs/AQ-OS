### Q8-2: What is your approach to API versioning (deep-dive with the real v1→v2 case)
**DIFFICULTY:** Medium
**CATEGORY TAG:** REST API

**ANSWER:**
Path-versioned majors (`/api/v1`, `/api/v2`), additive-only within a major, enforced by contract tests. The real case that shaped the policy: our leads list moved from offset pagination + nested score objects (v1) to cursor pagination + flattened scores (v2). Mechanically it worked because of a discipline I'd defend in any interview: **one service layer, N DTO assemblers** — `LeadQueryService` is version-agnostic (returns domain rows); `LeadV1Assembler` wraps scores nested + maps offset params; `LeadV2Assembler` flattens and consumes cursors. Business logic never forks; version drift lives entirely at the shape boundary, which is the only sustainable way to run two versions — forked logic doubles every bug fix for a year.

The compatibility mechanics that make "additive-only" enforceable rather than aspirational: consumer-driven contract tests (each frontend/integration maintains a contract pack — expected fields, types, semantics; CI runs provider-side against all packs, so a "harmless" field rename fails the build before consumers do), response-field sunsetting marked with `@Deprecated` in the OpenAPI spec + a `Deprecation`/`Sunset` header phase (60-day public window), and a per-caller traffic dashboard that gates final removal (v1 shut when its share fell under 1% for 2 weeks — data kills politics in the removal conversation). Small-version evolution (`v1.3`) we deliberately DON'T expose — the minor version is internal changelog, not API surface, because clients can't be trusted to feature-detect on minor numbers, and optional-response-field feature detection IS the additive path.

Header-versioning and query-param versioning were evaluated and rejected with reasons I can articulate: headers hide intent from logs/CDNs and break shareable URLs; query params pollute cache keys and invite clients to "just change the param" without contract awareness. Content-negotiation versioning (`Accept: application/vnd.acq.v2+json`) is REST-purist-correct and operationally annoying — error pages, webhooks, and browser debugging all get harder. Path wins on boring operability; boring is a feature in API design.

**KEY TERMS TO MENTION:**
- One service layer + per-version assemblers (no logic fork)
- Consumer-driven contract tests enforcing additive-only
- Deprecation/Sunset headers + traffic-gated removal
- No exposed minor versions (additive evolution via optional fields)
- Header/query versioning rejection rationale

**FOLLOW-UP QUESTIONS:**
1. How do you version WEBHOOK payloads (the push side)?
2. A client refuses to migrate off v1 — escalation path?

**FOLLOW-UP ANSWERS:**
1. Webhooks carry `event-type` + `api-version` fields and a version header; delivery is per-subscriber versioned (each endpoint pins the version it registered with), replayed events replay in their ORIGINAL version (history is immutable), and upgrades happen per-endpoint via the dashboard with a test-fire feature. Push-side versioning is stricter than request-side because you can't 404 a bad listener — you can only stop sending.
2. The path is: usage data shows their exact endpoints/fields → a migration engineer (we did this for our top-3 API consumers) → timeline commitments with the Sunset header as the contractual backstop → finally, if a paying enterprise truly cannot move, a paid extended-support flag extends THEIR keys' v1 window while everyone else's expires. Versioning ends in business decisions sometimes; the engineering job is making the data and mechanics ready for that conversation.

**RED FLAGS TO AVOID:**
- Forking service logic per version (maintenance death spiral)
- Removal by decree with no traffic data
- "We version in headers" without the operability trade-offs

---

### Q8-3: How did you handle pagination in list APIs (offset vs cursor — the full decision)
**DIFFICULTY:** Hard
**CATEGORY TAG:** REST API / Performance

**ANSWER:**
The decision matrix I present: **offset pagination** (`?page=3&size=50`) — human-addressable, random access, total counts; costs O(offset) scan on deep pages, unstable under concurrent writes (insert before your position shifts every row: duplicates and missed rows across pages), and expensive COUNT. **Cursor pagination** (`?cursor=eyJjcmVhdGVkX2F0...`&limit=50) — O(log N) seek at any depth, stable under concurrent writes (the cursor pins your position tuple), no total count; costs no random access, opaque URLs, and requires a unique deterministic sort tuple. Our routing: hot user-facing lists (leads, activities, messages — infinite-scroll UX, concurrent writes, deep access) = cursor; admin consoles (page jumps expected, bounded data, low concurrency) = offset with a max-depth guard (`page × size ≤ 10,000` — beyond that the API demands filters, because deep-offset is a UX smell wearing a technical costume).

Cursor implementation details that make or break it: the tuple must be UNIQUE + indexed in the same order as the sort (`(created_at DESC, id DESC)` with the matching composite index — a single-column cursor on a non-unique column skips/duplicates rows under writes, the bug nobody notices in dev and users notice in week one); the cursor payload is Base64(tuple + filter-hash + version) — filter-hash prevents a client swapping cursors across different queries (they get a 409 with "restart the query"), version enables cursor-format evolution (v2 cursors rejected with a clear error rather than silently wrong results); `limit` clamped [1,100]; and `next_cursor: null` is the end signal — NO `total` field on cursor endpoints (COUNT on 2M rows per page is the tax that makes people think cursors are "hard" — the product gave up totals and gained 140ms p95). Error contract for bad cursors: 400 with machine code `CURSOR_INVALID` vs `CURSOR_EXPIRED` (we expire cursors after 24h when underlying retention moves) — clients handle each differently, so the codes are distinct, tested, and documented in OpenAPI with examples.

**KEY TERMS TO MENTION:**
- Decision matrix per access pattern (hot lists = cursor; admin = offset+guard)
- Unique deterministic tuple + matching composite index
- Cursor payload: tuple + filter-hash + version (409 on cross-query swaps)
- No total on cursor endpoints; null next_cursor as end
- Distinct error codes CURSOR_INVALID vs CURSOR_EXPIRED

**FOLLOW-UP QUESTIONS:**
1. How do you paginate with user-chosen sort fields?
2. Real-time insertion-heavy feed — does cursor pagination still hold?

**FOLLOW-UP ANSWERS:**
1. Allow-listed sort keys each with a pre-declared cursor tuple (the tuple must include a unique tiebreaker regardless of user sort) — the index per sort path must exist, which is why the allow-list is SHORT (5 sorts, 5 indexes, reviewed). Free-form sorting is an anti-feature: unindexable plans + cursor math that can't guarantee stability. The API offers shapes it can serve efficiently — that's the deal.
2. Yes — cursors are actually the ONLY stable option there: OFFSET shifts everything on each insert (users see repeats/skips constantly), while a cursor pinned to `(created_at, id)` keeps the reader anchored; new items appear on refresh at the head, and the standard UX pattern ("N new items — click to load") handles head-growth. The failure people hit is filtering the same query with different filter-sets mid-scroll — the filter-hash 409 exists precisely for that.

**RED FLAGS TO AVOID:**
- Cursor pagination without a unique tiebreaker (subtle skip/dup bugs)
- Total counts on million-row hot endpoints
- Opaque cursor with no version/filter binding (silent wrong results)

---

### Q8-4: What is your error response format (and the contract behind it)
**DIFFICULTY:** Medium
**CATEGORY TAG:** REST API

**ANSWER:**
Every error, every endpoint, one shape — RFC 7807 Problem Details as the base, extended with our fields: `type` (stable machine code: `https://api.acquisitionos.com/errors/LEAD_NOT_FOUND`), `title` (human summary), `status`, `detail` (safe, non-internal message), `instance` (request id — joins to traces), plus our extension: `errors[]` for field-level validation (`{field, code, message}`), `retryable` boolean (clients branch on it — a 429 with retryable=true + Retry-After is automation-friendly; a 500 with retryable=false tells the client to stop and report), and `correlation_id` (same as instance, duplicated at top level because every client library grabs it differently). The shape is enforced mechanically: a single `@RestControllerAdvice` funnel — all exceptions (domain, validation, framework, unknown) map through `ProblemDetail` builders; a test suite asserts every error path in OpenAPI has a registered mapping (an unmapped exception = 500 with a generic body — allowed, but counted: a metric on generic-500s drives the mapping backlog down over time).

Principles behind the contract, which is what interviewers actually probe: **stability** — error codes are versioned API surface; codes never get renamed (add new, deprecate old) because clients branch on them; **security** — `detail` never leaks internals (SQL, class names, stack traces are server-side log material; the log carries the stack, the response carries the correlation id — the two connect in support); **actionability** — every error answers "what can the caller do": 409 CONCURRENT_MODIFICATION says "refresh and retry", 422 VALIDATION says exactly which fields, 429 carries Retry-After, 402 CREDIT_EXHAUSTED links the upgrade endpoint. Consistency across auth errors matters especially: 401 vs 403 semantics are strict (401 = who are you / 403 = not allowed — never conflated), and account-existence is never revealed (forgot-password returns 202 regardless — enumeration protection shapes even status codes).

**KEY TERMS TO MENTION:**
- RFC 7807 ProblemDetail + extensions (errors[], retryable, correlation_id)
- Single @RestControllerAdvice funnel + unmapped-exception metric
- Error codes as versioned surface (never rename; deprecate)
- Actionability per status (Retry-After, refresh-and-retry, upgrade links)
- 401/403 semantics + enumeration-safe responses

**FOLLOW-UP QUESTIONS:**
1. Why not just return the exception message — debugging is easier?
2. How do you handle errors from DOWNSTREAM services in your responses?

**FOLLOW-UP ANSWERS:**
1. Debuggability belongs in logs/traces with full context — responses go to untrusted clients; exception messages leak schema, paths, and library fingerprints (attack-recon material), and they're unstable (every refactor breaks client string-matching — which nobody should do, but everyone does). The correlation_id gives legitimate debugging the SAME power safely: support asks for the id, we pull the full trace. Security and debuggability are both served; just in their proper layers.
2. Translate, don't forward: a downstream 500 (LLM provider) becomes OUR 503 with retryable=true + our code AI_PROVIDER_UNAVAILABLE; downstream 4xx (Stripe card_declined) maps to our 402 with the card code preserved in a structured field (clients need it — it's user-actionable). Never pipe downstream bodies raw (leaks their internals, couples our contract to theirs); every integration has a translation table in its adapter — tested against WireMock-simulated failure modes (Q13-4).

**RED FLAGS TO AVOID:**
- Ad-hoc error shapes per endpoint (client hell, review hell)
- Stack traces or raw exception messages in responses
- 500 as the default for business-rule violations

---

### Q8-5: Did you implement HATEOAS — and be honest about it
**DIFFICULTY:** Medium
**CATEGORY TAG:** REST API

**ANSWER:**
Honest answer: no full HATEOAS, and I can defend the scoped use of hypermedia we did adopt. What we have: **action affordances on stateful resources** — a lead detail response carries an `actions` object (`{"can_advance_stage": {"href": "...", "method": "POST", "schema_ref": "..."}, "can_convert_to_deal": null}`) driven by server-side policy (role, plan tier, lead state) — the frontend renders buttons from server truth instead of duplicating permission logic client-side. That's hypermedia-as-the-engine-of-application-state in miniature, and it EARNED its complexity: when billing rules changed (Elite-only bulk export), zero frontend deploys were needed — the API stopped offering the affordance and UIs adapted. What we rejected: full HAL/JSON:API compliance with link relations everywhere — the payload overhead (2-3× response size), client-side complexity (our React team would hand-write link-following logic that fetch() idioms don't naturally use), and marginal benefit for a first-party frontend + documented public API. Spring HATEOAS exists, we evaluated it, the cost-benefit said no — with the reasoning written in an ADR so the decision is revisit-able, not tribal.

The interview value is the reasoning discipline: HATEOAS is level 3 of the Richardson maturity model, and most production APIs — including big public ones — live at level 2 (resources + verbs + status codes) because the decoupling HATEOAS buys matters most for UNKNOWN/evolving clients (public ecosystems, third-party crawlers), less for first-party pairs. Our affordance pattern captures ~70% of the practical benefit (server-driven UI capability, no client permission drift) at ~10% of the cost. I can also name when I'd go full HATEOAS: a public API ecosystem where third parties build against us long-term and breaking-change coordination is the bottleneck — then link-relations as contract earn their overhead.

**KEY TERMS TO MENTION:**
- Richardson maturity levels; level 2 + scoped hypermedia affordances
- Server-driven `actions` object from policy (no client permission drift)
- Real benefit case: billing-rule change with zero frontend deploys
- Rejected full HAL with cost-benefit reasoning in an ADR
- When full HATEOAS would be justified (unknown third-party clients)

**FOLLOW-UP QUESTIONS:**
1. Doesn't the actions object couple the frontend to your shapes anyway?
2. How does this interact with API versioning?

**FOLLOW-UP ANSWERS:**
1. It couples to the actions CONTRACT (a small, stable schema: href/method/schema_ref) — much smaller than coupling to resource shapes or, worse, to permission RULES. Coupling is a spectrum, not a binary; the design question is which coupling is cheapest to maintain. Server-side policy changes flow through a stable affordance schema; that ratio (rule-changes : contract-changes) has been ~20:1 for us.
2. The affordance schema is versioned with the API (v2 actions can add fields additively — same rules as the rest). Removed capabilities become null affordances (not absent fields) so clients can render disabled states during sunset windows — the actions object double-serves as a deprecation surface, which we discovered in practice and wrote into the API guidelines.

**RED FLAGS TO AVOID:**
- Claiming full HATEOAS without knowing its costs
- "HATEOAS is useless" without the affordance-level middle path
- No ADR/revisit story for the decision

---

### Q8-6: How did you document your APIs (OpenAPI/Swagger)
**DIFFICULTY:** Easy
**CATEGORY TAG:** REST API

**ANSWER:**
Documentation is generated, tested, and published — a pipeline, not a wiki. Source of truth: **springdoc-openapi** generates the spec from code — annotations where they add value (`@Operation(summary, description)`, `@ApiResponse` codes with examples, `@Schema` on DTOs) and structural derivation for the rest (paths, params, DTO fields, validation constraints auto-reflected: `@Size(max=100)` shows up in the spec — docs that can't drift from validation). The generated `openapi.json` is a CI artifact with gates: **spec completeness test** (every public endpoint has description, all error responses documented — a coverage report fails builds under threshold), **breaking-change detection** (oasdiff against last release — removed/renamed fields fail CI unless tagged with a deprecation label, the same gate as contract tests), and **example validation** (documented examples are schema-valid — examples rot fastest and lie loudest). Publishing: versioned static docs (Redoc/Stoplight-style render) per API version at `developers.acquisitionos.com` — PUBLIC consumers get the polished site; internal devs get the interactive Swagger UI in staging (with seeded sandbox auth).

The discipline that keeps docs true: documentation changes ship IN THE SAME PR as code changes (the completeness diff makes doc-only PRs visible — you can't change an endpoint without touching its docs because the spec diff shows in review), DTO fields carry `@Schema(description)` written for humans not restated names, and enums document every value's semantics (we audit that quarterly — enum values are the most-under-documented, most-misused surface). The honest limitation I state: annotation-based docs still drift in MEANING even when structurally complete — "what does `score` actually weight?" lives in prose descriptions that can rot; our mitigation is examples + a link from the spec to the scoring ADR, and a docs-ownership section in the code-review checklist (reviewer confirms semantic accuracy, not just presence).

**KEY TERMS TO MENTION:**
- springdoc-openapi generation + validation-constraint reflection
- CI gates: completeness, breaking-change detection (oasdiff), example validation
- Docs in the same PR (spec diff in review)
- Public dev-portal vs internal Swagger UI with sandbox auth
- Semantic-drift mitigation: ADR links + review checklist

**FOLLOW-UP QUESTIONS:**
1. Code-first vs design-first — where do you land?
2. How do you document webhook schemas and error semantics?

**FOLLOW-UP ANSWERS:**
1. Code-first for a first-party product moving fast (docs as a build artifact can't lag the code); design-first when the API is the product (public platform, multiple teams consume the spec before implementation, SDK generation leads). We're code-first with design-first DEVIATIONS for new public surfaces: the spec for a new public module is drafted and reviewed as a doc BEFORE implementation — best of both without dogma.
2. Webhooks get their own spec section (payload schemas per event type + version, signing scheme, retry semantics, replay behavior) — generated from the same DTO classes so payloads can't drift; error semantics get a per-endpoint error table IN the spec (`@ApiResponse` with examples of every business error code) — the translation-table discipline from Q8-4 makes this derivable rather than hand-maintained.

**RED FLAGS TO AVOID:**
- Swagger UI as "the docs" (no gates, no review = rot)
- Docs updated in a follow-up PR that never comes
- No breaking-change detection (spec drift becomes silent contract breaks)

---

### Q8-7: How did you design the file upload API
**DIFFICULTY:** Medium
**CATEGORY TAG:** REST API

**ANSWER:**
Two protocols by file size, one contract. **Small uploads (≤ 10MB)**: `POST /api/leads/import` with `multipart/form-data` — `@RequestPart("file") MultipartFile` + metadata part; server validates (magic-byte sniff via Tika, allow-list per endpoint, size caps enforced at Tomcat multipart layer before the app reads bytes), streams to object storage, persists metadata row (key, sha256, size, content_type, owner), returns 201 with the upload resource — client polls the import job endpoint for row-level results (parsing is async — a 500k-row CSV is a Spring Batch job, not a request lifetime). **Large uploads (> 10MB)**: direct-to-storage protocol — client requests a session (`POST /uploads/sessions` → presigned PUT parts + upload_id), uploads parts straight to S3 (bypassing our JVM entirely — the API never becomes a byte proxy), then `POST /uploads/sessions/{id}/complete` → we verify size/checksum, run validation, mark ready. The contract nuance that matters: both paths end in the SAME upload resource shape, so clients and downstream features don't care which protocol ran.

Cross-cutting API concerns: **limits are explicit in errors** — 413 with the actual limit and measured size; **virus scanning** is a status on the upload resource (`scanning → clean/quarantined`) — consumers get 202 until scan completes for user-to-user surfaces (Q3-15's quarantine story, exposed honestly in the API rather than hidden); **idempotent completion** — the complete call carries a client idempotency key (double-click protection is the CLIENT's dedupe, not a hope); **resumability** on the direct path comes free from S3 multipart (part-level retry — a 2GB upload on hotel wifi succeeds); and **CORS** for the direct path is configured on the BUCKET (the browser PUTs to storage origin — preflight handled there, another reason the app is out of the byte path). Rate limits: upload endpoints count bytes in the limiter (a 10MB upload costs 10 units vs 1 for a JSON call — the limiter is bandwidth-aware or a tenant can exhaust everything with uploads).

**KEY TERMS TO MENTION:**
- Size-split protocols: multipart (≤10MB) vs presigned direct-to-storage (>10MB)
- Same upload-resource contract for both paths
- Async parse (Spring Batch) + 202 + polling; AV scan status exposed
- Idempotent completion + bandwidth-aware rate limiting
- CORS on the bucket (app out of the byte path)

**FOLLOW-UP QUESTIONS:**
1. Why not route everything through the server for simplicity?
2. How do you validate a 500k-row CSV without blocking anything?

**FOLLOW-UP ANSWERS:**
1. Through-server costs: JVM heap pressure (streaming helps but still occupies connections), doubles egress bills, adds latency (two hops), and couples our deploy/autoscaling to byte throughput. Direct-to-storage removes all four; the cost is a slightly smarter client flow — worth it above a threshold that we measured (latency + cost curves cross around 5-10MB for our payload shapes).
2. The API never parses synchronously: upload → 202 + job id → Spring Batch reads from storage in chunks (mem: constant), validates per-row (schema, dupes, transforms), writes results to an import-report resource with per-row errors downloadable as CSV; the client polls or subscribes (SSE) — progress is a first-class API resource (`processed: 240k / 500k, 1,204 rows rejected`), which turns a black-box wait into a product experience.

**RED FLAGS TO AVOID:**
- Loading files into memory (`byte[] fileBytes` — the OOM interview signal)
- Synchronous parse-and-return on large files
- No idempotency on completion (double-click = double import)

---

### Q8-8: What is your approach to API rate limiting (design across all layers)
**DIFFICULTY:** Hard
**CATEGORY TAG:** REST API

**ANSWER:**
Rate limiting is a PRODUCT surface with an infrastructure backbone — the design spans five layers, each with a different job. **Layer 1 — edge (WAF/ingress)**: volumetric DDoS shedding (per-IP global, known-bad patterns) — coarse, cheap, no business semantics. **Layer 2 — application limiter** (Q7-6's Redis design): per-route policies keyed by identity (IP/user/key/org), algorithms chosen per budget shape (fixed-window for generous, weighted-sliding for tight), Lua-atomic. **Layer 3 — resource-cost limiting**: not all requests cost equal — the limiter is bandwidth- and compute-aware (uploads cost units by MB, AI generation by credits, exports by rows) — flat per-request limits are gameable and unfair to light users. **Layer 4 — quota product**: monthly quotas per plan (separate from burst limits — burst protects infra, quota IS the business model), exposed via headers AND a usage dashboard; overage behavior is plan-specific (hard-stop for Free, grace + overage-billing for paid). **Layer 5 — fairness within tenant**: one org's runaway script shouldn't starve its own users — org-internal per-user sub-limits on shared pools (AI credits are the natural currency here — the credit system IS the intra-org fair-share mechanism, which is why we metered compute in credits rather than inventing a parallel budget).

The API-facing contract makes limits a feature: every response carries `X-RateLimit-Limit/Remaining/Reset` (clients self-regulate — the well-behaved-client flywheel), 429s carry `Retry-After` + a machine code distinguishing `RATE_LIMIT_BURST` vs `RATE_LIMIT_QUOTA` vs `RATE_LIMIT_ORG` (different remediations: wait vs upgrade vs talk to your admin), and the developer portal documents every endpoint's limits explicitly. Observability: rejection metrics by layer/key-tier/route with top-talker panels — a rejection spike triages in seconds (attack vs broken loop vs viral customer). The anti-pattern I actively avoided: silent limits (undocumented thresholds that 429 randomly) — they generate support tickets and distrust; visible, self-served, metered limits generate well-behaved integrations.

**KEY TERMS TO MENTION:**
- Five layers: edge volumetric → app policy → cost-aware → quota product → intra-org fairness
- Burst vs quota separation (infra protection vs business model)
- Bandwidth/compute-aware unit costs (flat limits are gameable)
- Rate-limit headers + typed 429s (BURST/QUOTA/ORG remediation paths)
- Credits as the intra-org fair-share currency

**FOLLOW-UP QUESTIONS:**
1. How do you set the actual NUMBERS for a new endpoint's limit?
2. A top customer keeps hitting org limits — throttle or accommodate?

**FOLLOW-UP ANSWERS:**
1. Start from three measurements: the endpoint's cost profile (p50/p99 server cost — the unit basis), the product's intended usage shape (what does a power user legitimately do per minute — from beta telemetry), and downstream capacity (what burst can the DB/LLM budget absorb). Then set limit = legitimate-power-usage × 2 (headroom), load-test at 5× to find the cliff, and instrument from day one — the first month's telemetry adjusts the number; limits are hypotheses with dashboards, not eternal truths.
2. Accommodate as a product motion, protect as an engineering default: the limiter applies uniformly (no snowflake exceptions — they rot into security holes), but the customer's CSM gets the usage data, the upgrade path (Elite tier / purchased credit packs / temporarily raised quota with expiry), and if their workload is genuinely architectural (a polling loop we could webhook instead), we fix the integration — the best rate-limit story is often deleting the calls, and our webhook product exists because of this exact conversation.

**RED FLAGS TO AVOID:**
- Only a global per-IP limiter (no identity, no cost-awareness)
- Secret undocumented limits
- Burst limits conflated with billing quotas

---

### Q8-9: How did you implement request/response logging and correlation
**DIFFICULTY:** Medium
**CATEGORY TAG:** REST API / Observability

**ANSWER:**
The goal: any single request reconstructable from logs alone, and any user complaint traceable across services in seconds. Mechanism: a servlet **filter generates the correlation id** (accepts inbound `X-Request-Id` from the LB or mints a UUID), stuffs it into **MDC** (logback pattern renders `%X{reqId}` on every line) and echoes it back in the response header — the id travels: client → LB → app → SQL logs (datasource-proxy injects it as a comment into statements — DB-side slow-query logs self-correlate) → async threads (TaskDecorator copies MDC — Q3-9) → downstream HTTP calls (client interceptor sets the header) → error responses (Q8-4's correlation_id field). One id, whole-trace breadcrumbs across every log surface, zero trace-tooling dependency for the first mile of debugging — the "paste me the request id" workflow that support actually uses.

Request/response logging is deliberately ASYMMETRIC: requests log at INFO (method, path, status, duration, user id, org id, key dims — body NEVER at INFO: PII/secrets/payload bloat); response BODIES log at DEBUG with redaction (a masking converter scrubs Authorization, password, token, otp fields by pattern — the scrubber is tested against a fixtures file of real-ish payloads; logging an OTP once is a security incident). Payload caps: bodies truncated at 4KB with a size note (a 2MB JSON in logs is an ELK bill and a grep hazard). The access-log line is structured JSON (logstash encoder) so ingestion needs no regex: `{ts, level, reqId, method, path, status, durMs, userId, orgId, ip, ua}` — fielded queries ("all 500s for org X in the last hour") are instant. Sampling strategy: 100% of 4xx/5xx and slow (>1s) requests at INFO with bodies; healthy 2xx bodies only in staging — production DEBUG is opt-in per-request (a debug header honored for support sessions, rate-limited) because always-on full logging is a cost/PII hazard dressed as observability.

**KEY TERMS TO MENTION:**
- Correlation id lifecycle: filter → MDC → response header → SQL comments → async propagation
- Asymmetric logging: metadata INFO, bodies DEBUG + redaction converter
- PII/secret scrubbing with tested patterns; payload caps
- Structured JSON access logs (fielded queries, no regex)
- Opt-in per-request debug mode for support

**FOLLOW-UP QUESTIONS:**
1. Correlation ids vs distributed tracing (W3C traceparent) — why both?
2. A field you log turns out to be PII under GDPR — now what?

**FOLLOW-UP ANSWERS:**
1. Correlation ids are the cheap universal token every surface accepts (even the DB and third-party ticket systems); tracing adds structure (spans, timing trees, service graphs) via OpenTelemetry — we have both: the filter ALSO propagates traceparent, and the reqId is recorded as a span attribute, so ELK greps and Tempo lookups cross-reference. Correlation ids work when tracing breaks and vice versa — redundancy in the identity layer is deliberate.
2. Treat as a logging incident: stop logging the field (converter + code change), assess exposure window (who accessed ELK, was it exported), purge where possible (ELK ILM re-index/delete within retention), document in the RoPA (records of processing), and fix the classification gap (our field-classification checklist for log lines). The systemic answer: log-field additions go through a lightweight review — the checklist exists because of the incident you just described happening to us once.

**RED FLAGS TO AVOID:**
- Full request/response bodies at INFO in production
- Unredacted auth fields in logs (instant audit finding)
- Logs without structured fields (grep-only debugging at scale)

---

### Q8-10: How did you handle backwards compatibility of the API
**DIFFICULTY:** Hard
**CATEGORY TAG:** REST API

**ANSWER:**
Compatibility is enforced by MACHINERY, not intentions. The gates: **consumer-driven contracts** (every frontend/integration's expected requests+responses run against every PR — a breaking change fails CI naming the broken consumer), **spec-level breaking detection** (oasdiff on the OpenAPI artifact: removed/renamed/retyped fields, new REQUIRED request fields, narrowed enums — all fails unless wrapped in a version bump), and **canary consumers in CI** (staging cron jobs replay recorded production traffic weekly and diff responses against recorded shapes — catches the breaks contracts missed, like serialization quirks). The taxonomy of safe-vs-unsafe I keep the team aligned on: SAFE — adding optional response fields, adding endpoints, adding optional request fields, widening validations (accept more), error-code ADDITIONS (clients must handle unknown codes as generic — documented requirement); UNSAFE — removing/renaming anything, tightening validation, changing field semantics ("score now 0-10" under the same field is a break even if the type matches), adding required request fields, and enum value removals (the sneakiest — clients match-exhaustively).

Semantic stability gets its own discipline: field meanings are contracts too — documented invariants ("createdAt never changes after creation", "total = sum of items") carry a conformance test (property-based checks on live responses) because the most expensive breaks are semantic, invisible to schema diffs. The lived example: we deprecated `lead.score` (composite) in favor of three component scores — the path was: add new fields (safe) → mark old `@Deprecated` + Sunset header + docs (6 months) → telemetry gate on old-field usage by caller → move default response to exclude it in v2 while v1 keeps serving it (the assembler split Q8-2 enables) → post-sunset audit confirms zero references before the field leaves the codebase. Client guidance ships with every change: migration notes with before/after examples generated from the spec diff — a breaking change without a migration note is a support incident you scheduled.

**KEY TERMS TO MENTION:**
- Triple machinery: contract tests + oasdiff spec gate + recorded-traffic canaries
- Safe/unsafe taxonomy (including semantic changes and enum removals)
- Documented invariants with conformance tests (semantic stability)
- Deprecation path: add → deprecate → telemetry gate → version split → audit
- Migration notes generated from spec diffs

**FOLLOW-UP QUESTIONS:**
1. An internal frontend wants a breaking change NOW — do the gates apply?
2. How do you make unknown-error-code handling actually happen in clients?

**FOLLOW-UP ANSWERS:**
1. Yes — but with a faster lane: internal consumers can bump a contract pack in the same PR (the consumer is in the room), which is exactly what makes CDC workable: internal breakage is a coordinated refactor, external breakage is forbidden without versioning. The gates exist to force the CONVERSATION, and internally that conversation is one PR review; the discipline stays, the latency adapts.
2. By design and by test: the API guideline REQUIRES tolerant clients (unknown codes → generic handling) and our SDKs implement it (a base ClientException for unmapped codes) — we control both ends for first-party. For external consumers, the docs state it, examples demonstrate it, and the contract-test tooling we publish lets THEM verify their handler (we ship the test kit). You can't force third-party hygiene; you can make the correct path the easy, documented, tool-supported one.

**RED FLAGS TO AVOID:**
- "We're careful" as the compatibility strategy (no machinery)
- Schema-only thinking (semantic breaks slip through)
- Breaking changes without migration notes and telemetry gates
