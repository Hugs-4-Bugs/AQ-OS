### Q3-8: How did you implement request validation (@Valid, @Validated)
**DIFFICULTY:** Medium
**CATEGORY TAG:** Spring Boot

**ANSWER:**
Three layers of validation. **Layer 1 — DTO constraints**: request DTOs carry Bean Validation annotations (`@NotBlank`, `@Email`, `@Size`, `@Pattern` for phone) and controllers take `@Valid @RequestBody CreateLeadRequest` — MethodArgumentNotValidException is then handled in the `@RestControllerAdvice` and converted to a 400 with field-level errors (`{"errors":[{"field":"email","message":"must be valid"}]}`) so the frontend can render inline errors. **Layer 2 — cross-field rules**: "endDate after startDate" can't be a field annotation, so we write class-level custom constraints (`@ValidDateRange` with a `ConstraintValidator<...>` implementation) — reusable, testable, and the violation surfaces at the same 400 boundary. **Layer 3 — domain invariants**: business rules that need the DB (email uniqueness within org, stage transition legality) live in the service layer and throw domain exceptions (`DuplicateLeadException` → 409), never validated at the controller because they're transactions-dependent.

The subtle part interviewers probe: `@Valid` vs `@Validated`. `@Valid` (JSR-380) triggers cascade validation into nested objects and works on `@RequestBody`; `@Validated` (Spring) enables group-based validation and method-level validation on `@Service` classes (e.g. `@Validated public void archive(@NotNull UUID id)` fails-fast on internal calls, not just HTTP entry). We also validate configuration at startup — `@ConfigurationProperties` beans with `@Validated` fail the boot if an env var is malformed (bad SMTP port kills the app in dev, not at first email). One rule we enforce in review: **never trust a DTO past the controller** — services take domain objects assembled from validated DTOs, so an internal caller can't bypass HTTP-layer validation accidentally.

**KEY TERMS TO MENTION:**
- Bean Validation (JSR 380) annotations + `@Valid` on `@RequestBody`
- `@RestControllerAdvice` → structured 400 with field-level errors
- Custom `ConstraintValidator` for cross-field rules
- `@Validated` groups + method-level validation on services
- Startup config validation via `@ConfigurationProperties @Validated`

**FOLLOW-UP QUESTIONS:**
1. Why validate in the service too if the controller already validated?
2. How do you keep validation messages consistent for the frontend?

**FOLLOW-UP ANSWERS:**
1. Controllers only guard the HTTP door — services are called by schedulers, other services, and tests too. Domain invariants (stage transitions, uniqueness) are transactional facts, not shape facts, so they belong in the service. Shape at the edge, invariants at the core.
2. Error codes, not prose: each constraint carries a stable code (`LEAD.EMAIL.DUPLICATE`) and i18n-able parameters; the frontend maps codes to copy. Free-text exception messages leaking to clients is a review-blocking issue — they leak internals and break on refactor.

**RED FLAGS TO AVOID:**
- Validating only with if-statements scattered in controllers
- Leaking raw exception messages/validation internals to clients
- DB-dependent checks in Bean Validation annotations (slow, transactional hazards)

---

### Q3-9: How did you handle async operations (@Async, CompletableFuture)
**DIFFICULTY:** Hard
**CATEGORY TAG:** Spring Boot

**ANSWER:**
First rule I state in interviews: **`@Async` only works through a Spring proxy called from outside the bean** — a self-invocation (`this.asyncMethod()`) bypasses the proxy and runs synchronously, silently. We always put async methods on separate beans (e.g. `NotificationDispatcher`) and call them via the injected interface. Second rule: **never the default SimpleAsyncTaskExecutor** — every `@Async` is bound to an explicit `ThreadPoolTaskExecutor` bean; we run three pools by workload: `ioPool` (external calls: core 12/max 24, queue 200), `cpuPool` (scoring: core = cores), `notifyPool` (core 4/max 8) — isolation so a Gmail slowdown can't consume the threads that scoring needs (bulkhead pattern).

For composing flows we use `CompletableFuture.allOf(...)` where a page needs lead + score + calendar data from three services in parallel — each supplier runs on `ioPool`, overall timeout via `orTimeout(800ms)` (Java 9+), and a fallback chain (`exceptionally`) renders partial data rather than a 500. The critical interaction interviewers drill: **`@Async` + `@Transactional`** — an async method runs on a different thread, so the caller's transaction is NOT visible; if the async method needs a transaction it opens its own (`@Transactional` on the async method), and data written by the caller may not be committed yet when the async task starts (race). Our pattern: publish async work only AFTER the transaction commits — `@TransactionalEventListener(phase = AFTER_COMMIT)` calls the dispatcher, which guarantees the row exists before any consumer reads it.

Shutdown matters too: executors get `setWaitForTasksToCompleteOnShutdown(true)` + `awaitTermination` so a deploy drains in-flight async tasks instead of killing them mid-send (we still design handlers idempotent, because a 30s drain can't wait forever).

**KEY TERMS TO MENTION:**
- Proxy semantics — self-invocation breaks `@Async`
- Named executors per workload (bulkhead), never the default executor
- `CompletableFuture` composition with `orTimeout` + `exceptionally` fallbacks
- `@TransactionalEventListener(AFTER_COMMIT)` to avoid read-before-commit races
- Graceful shutdown draining (`waitForTasksToCompleteOnShutdown`)

**FOLLOW-UP QUESTIONS:**
1. How do you propagate context (auth user, trace id) to an async thread?
2. What happens if the queue fills up — walk through CallerRunsPolicy trade-offs.

**FOLLOW-UP ANSWERS:**
1. `TaskDecorator` on the executor: it wraps every submitted Runnable, copying `SecurityContext`, MDC (traceId), and tenant context onto the worker thread and clearing after. Without it, async logs have no trace id and security checks fail — the most common async bug in real codebases.
2. With `CallerRunsPolicy`, an overflowed task runs on the caller (Tomcat) thread — back-pressure: the API slows down instead of dropping work, which is right for user-visible flows and wrong for fire-and-forget (it would stall the request). For fire-and-forget we use `AbortPolicy` + a metric alarm, because dropping a notification is better than blocking a request. The policy is a product decision, not a default.

**RED FLAGS TO AVOID:**
- Not knowing self-invocation breaks the proxy
- Using the default executor / unbounded queues (OOM under load)
- Async + transaction interaction confusion (reading uncommitted data)

---

### Q3-10: How did you implement scheduled tasks (@Scheduled, cron)
**DIFFICULTY:** Medium
**CATEGORY TAG:** Spring Boot

**ANSWER:**
We run about a dozen scheduled jobs — monthly credit grants, reminder sweeps, token refreshes, nightly reconciliation, metrics rollups. Mechanics: `@EnableScheduling`, methods annotated `@Scheduled(cron = "0 0 8 * * *", zone = "Asia/Kolkata")` — explicit zone because "8 AM" must mean the customer's business day, not the server's UTC clock. Two production rules beyond the annotation. **Rule 1 — multi-instance safety**: with 3 app replicas behind the ALB, every `@Scheduled` firing would run 3 times; each job body first acquires a Redis lock (`SET job:lock:reminders NX PX <window>`); no lock → skip silently. We considered ShedLock but the raw pattern was 5 lines and dependency-free. **Rule 2 — job-table delegation for anything heavy**: the scheduler's job is only to *enqueue* (insert rows into the job table / flip batch job parameters); the worker pool does the work. That keeps cron methods sub-second (no overlap even if delayed), gives per-item retry/status visibility, and lets us replay a failed night with one SQL statement instead of waiting for tomorrow's cron.

Failure handling: each job wraps its body in try/catch that logs with the job name + duration metric (`SchedulerJobDuration` tagged by job) and increments a failure counter — silent cron deaths are the worst failure mode, so every job emits a heartbeat we alert on absence ("reminder sweep hasn't run in 26h" pages us before users notice). `fixedDelay` vs `cron`: fixedDelay for self-spacing pollers (metrics), cron for business-time events. Testing: scheduler methods are thin, so tests target the service they call; for cron expressions we use a clock-injection (`Clock` bean) to simulate month boundaries in tests — the monthly grant edge case (Feb 28→Mar 1) bit us once.

**KEY TERMS TO MENTION:**
- `@Scheduled` cron + explicit `zone`
- Redis lock per job for multi-instance dedupe (or ShedLock)
- Scheduler enqueues, workers execute (job-table pattern)
- Heartbeat metric + absence alerting (silent death detection)
- `Clock` bean injection for testable time logic

**FOLLOW-UP QUESTIONS:**
1. What if a job takes longer than its schedule interval?
2. Why Redis lock over ShedLock or Quartz?

**FOLLOW-UP ANSWERS:**
1. Cron fires are skipped while the previous one still runs on the same instance (single-threaded scheduler by default), but OTHER instances would start a second run — hence the lock. For the enqueue-only pattern the cron is milliseconds anyway; the heavy worker is decoupled, so overlap becomes a non-issue by design.
2. Quartz = DB-backed clustering but a whole framework to operate; ShedLock = nice abstraction over the same lock idea. Our 5-line Redis pattern had zero new dependencies and the ops team already knew how to inspect Redis keys. If job count grew past ~30 with complex calendars, I'd take ShedLock for the standardization.

**RED FLAGS TO AVOID:**
- No multi-instance story (duplicate emails at 8 AM is the classic war story)
- Heavy logic inside the cron method itself
- No observability — jobs that die silently for weeks

---

### Q3-11: How did you use Spring Events for decoupled communication
**DIFFICULTY:** Medium
**CATEGORY TAG:** Spring Boot

**ANSWER:**
Spring's `ApplicationEventPublisher` is our in-module message bus. Concrete example: when an outreach reply is classified as INTERESTED, `ReplyClassificationService` publishes `LeadBecameHotEvent(leadId, orgId, score)` — it knows nothing about notifications, deals, or analytics. Listeners do their own thing: `NotificationListener` pings the user's Telegram, `AnalyticsListener` increments counters, `CrmSyncListener` bumps the pipeline stage. The publisher stays clean of downstream concerns, and adding a new reaction (say, a Slack integration) is a new `@EventListener` class — zero changes to the classification service (open/closed principle in practice).

The critical correctness point: listeners by default run **synchronously in the publisher's thread and transaction** — a throwing listener would roll back the classification itself. So our rules: side-effect listeners are (a) `@Async` AND (b) `@TransactionalEventListener(phase = AFTER_COMMIT)` — they run after the publisher's commit, on the executor pool, and receive the event payload (ids, never entities — a detached entity across threads is a LazyInitializationException factory). For listeners that must read data written by the committing transaction, AFTER_COMMIT is exactly the guarantee you need; for audit-log listeners that must not lose records even on rollback, plain `@EventListener` inside the transaction is correct (audit of a rolled-back action is legitimate).

Trade-off I admit honestly: events make flow harder to trace — "who reacts to LeadBecameHotEvent?" isn't in the call stack. Mitigations: events live in a dedicated `events` package with a registry test (every event has at least one listener — catches typos silently swallowed), and every listener logs with the event id so a trace id follows the whole reaction chain. If we needed cross-service delivery with durability, the same event classes become Kafka payloads — the seam is already there.

**KEY TERMS TO MENTION:**
- `ApplicationEventPublisher` + `@EventListener`
- `@TransactionalEventListener(AFTER_COMMIT)` + `@Async` (thread + transaction semantics)
- Payload = ids, not entities (detachment + lazy-loading hazards)
- Registry test (every event ≥ 1 listener)
- In-process now, Kafka-shaped later (same contracts)

**FOLLOW-UP QUESTIONS:**
1. What's the failure model — if a listener dies, does the publisher care?
2. Events vs direct service calls — when do you choose which?

**FOLLOW-UP ANSWERS:**
1. Fire-and-forget: a listener exception is logged with the event id and counted; it never affects the publisher. That's why analytics/listeners must be idempotent — redelivery-on-retry is possible. Anything that MUST succeed transactionally (writing the reply record itself) is a direct call, not an event.
2. Direct call when the outcome is part of the use case's contract (validate → save → return id); event when it's a reaction others may extend (notify, analytics). If I can't decide, I ask: "would the caller wait for this result?" Waiting → call; no → event.

**RED FLAGS TO AVOID:**
- Not knowing listeners run synchronously by default
- Publishing entities instead of ids
- Using events for core flow steps that must succeed (hidden async gaps)

---

### Q3-12: How did you implement resilience — circuit breakers, retries, timeouts
**DIFFICULTY:** Hard
**CATEGORY TAG:** Spring Boot / Resilience4j

**ANSWER:**
Every outbound call (LLM provider, Gmail, Twilio, scraping targets) is wrapped in a Resilience4j stack, ordered inner-to-outer: **TimeLimit** (don't wait forever) → **Retry** (transient faults) → **CircuitBreaker** (stop hammering a dead provider) → **RateLimiter** (protect our quota). Defaults per call: timeout 5-30s by provider SLA; retry 3 with exponential backoff + jitter (100ms → 400ms → 1.6s) only on 429/5xx/timeouts — never on 4xx (a 400 will fail identically forever); circuit breaker sliding window of 50 calls, 50% failure rate opens the circuit for 30s with half-open probing.

The design decision that matters most: **fallbacks per use-case, not generic**. When the LLM circuit opens during outreach generation, the user doesn't get a 500 — the generator falls back to a deterministic template engine (merge-fields email) and marks the message `AI_FALLBACK`, so the product degrades in quality, not availability. When the scraping breaker opens, the batch chunk skips and retries next window. Fallback choice is a product decision documented per integration in our ADRs.

Config lives in `application.yml` under `resilience4j.*` with different profiles per environment (staging has aggressive timeouts so tests fail fast). Observability: Resilience4j publishes Micrometer metrics — `resilience4j.circuitbreaker.state` (gauge), call outcomes, retry counts — on our Grafana; the on-call dashboard shows breaker states as traffic lights, and a Slack alert fires when any breaker stays OPEN > 10 min. Interview lesson I share: retries without jitter + breakers cause **retry storms** — a provider hiccup amplified by every client instance retrying in lockstep; the jitter and the open-circuit back-off are what turn retries from a footgun into a tool.

**KEY TERMS TO MENTION:**
- Resilience4j stack order: TimeLimit → Retry → CircuitBreaker → RateLimiter
- Retry only on transient errors, backoff + jitter (retry storm prevention)
- Sliding-window failure-rate breaker, half-open probing
- Use-case-specific fallbacks (template engine fallback for AI)
- Micrometer metrics + breaker-state alerting

**FOLLOW-UP QUESTIONS:**
1. Circuit open on the AI provider — a paying user clicks "generate". Exactly what do they see?
2. Why exponential backoff WITH jitter?

**FOLLOW-UP ANSWERS:**
1. The controller path checks the breaker state first (decorated supplier returns fallback): user gets the template-merged email within normal latency, a subtle "generated from template" tag, and no error. Credits for AI generation aren't deducted for fallback messages (product rule). If the breaker stays open > 15 min, the banner shows degraded AI status; support is notified proactively.
2. Without jitter, N instances that failed at the same instant retry at the same instants forever — synchronized hammering (thundering herd). Jitter randomizes each backoff so retries spread out; combined with the open circuit cutting call volume to zero, the provider gets breathing room to recover instead of a synchronized storm.

**RED FLAGS TO AVOID:**
- Retrying 4xx (non-transient) or infinite retries
- Generic 500 to users when a fallback exists
- No metrics on breaker state — resilience you can't see is theater

---

### Q3-13: What is your approach to API versioning
**DIFFICULTY:** Medium
**CATEGORY TAG:** Spring Boot / REST

**ANSWER:**
We version in the URL path (`/api/v1/leads`, `/api/v2/leads`) — pragmatic reasons: visible in logs and curl, trivial to route (the ALB/ingress can split traffic), zero client-library cleverness, and cache-friendly. Alternatives I can defend but rejected: header versioning (`Accept: application/vnd.acq.v2+json`) keeps URLs clean but is invisible in access logs, easy to misconfigure in browsers/webhooks, and harder to document; query-param versioning pollutes cache keys. Rule-based compatibility: within a major version, changes must be **additive and backward-compatible** (new optional fields, new endpoints) — we verify with consumer-driven contract tests so "v1 never breaks" is enforced, not promised.

A real v2 we ran: the leads list response moved from offset pagination to cursor pagination and flattened the score object. Mechanically: v1 and v2 controllers delegate to the SAME service; only DTO assemblers differ (`LeadV1Assembler` vs `LeadV2Assembler`) — business logic never forks, which is the discipline that keeps two versions maintainable. Deprecation protocol: response header `Deprecation: true` + `Sunset` date on v1 endpoints (monitored — we log which orgs still call v1), direct email to those orgs' admins 60/30/7 days out, and traffic dashboards driving the final removal gate (v1 deleted when < 1% of calls for 2 weeks). Version lifecycle for internal APIs is shorter (2 sprints notice) because we control both sides; public/partner APIs get the full 6-month protocol.

**KEY TERMS TO MENTION:**
- Path versioning + traffic-splitting at the gateway
- Additive-only within a major version (contract tests enforce)
- Shared service, per-version DTO assemblers (no logic fork)
- `Deprecation`/`Sunset` headers + caller dashboards
- Data-driven removal gate (< 1% traffic)

**FOLLOW-UP QUESTIONS:**
1. How do you version a breaking DB schema change that backs both versions?
2. GraphQL solves versioning differently — would you use it here?

**FOLLOW-UP ANSWERS:**
1. Expand-contract: the migration adds the new shape alongside the old (new column/table, dual-write), v2 assemblers read the new shape, v1 keeps reading the old, and the contract step (dropping the old) happens only after v1 sunset. The DB version window can outlive the API version window — that's fine, migrations are forward-only.
2. GraphQL's "no versioning, evolve the schema" works when the consumer mix is internal and schema discipline is high (deprecations enforced). For a public B2B REST API with webhooks, partners, and non-technical integrators, path versioning is simpler to reason about and to support. I'd consider GraphQL for the frontend-heavy dashboard layer, not as the public contract.

**RED FLAGS TO AVOID:**
- "We never needed versions" (means no consumers or no growth)
- Forking business logic between versions (maintenance death)
- No deprecation protocol — "we told everyone once in a blog post"

---

### Q3-14: How did you implement CORS configuration
**DIFFICULTY:** Easy
**CATEGORY TAG:** Spring Boot / Security

**ANSWER:**
CORS is the browser's enforcement of which origins may call the API; the server declares it via headers. In Spring Security 6 we configure it on the `SecurityFilterChain`: a `CorsConfigurationSource` bean with an **explicit allow-list** — production allows exactly our two frontend origins (marketing site + app subdomain), staging allows the staging origin; `allowedMethods` limited to what we actually use (GET/POST/PUT/PATCH/DELETE — no wildcards), `allowedHeaders` explicit (`Authorization`, `Content-Type`, `X-Request-Id`), `allowCredentials(true)` only because our cookie-based CSRF double-submit needs it, and `maxAge(3600)` so browsers cache the preflight and don't re-OPTIONS every call.

Two mistakes I call out from review experience. First, `allowedOrigins("*")` with `allowCredentials(true)` is illegal per spec and Spring rejects it — the "fix" people reach for (`allowedOriginPatterns("*")`) defeats the entire protection; our code review blocks both patterns via a static check. Second, preflight understanding: the browser sends OPTIONS before a non-simple request; if a security filter chain rejects OPTIONS before the CorsFilter, every cross-origin POST dies with a confusing 401 — so the chain order matters (`.cors()` first, and the CORS filter must answer preflights without auth). Webhook endpoints (Stripe → us) are NOT browser calls, so CORS is irrelevant there — server-to-server; common confusion point I clarify preemptively in interviews.

**KEY TERMS TO MENTION:**
- `SecurityFilterChain` + `CorsConfigurationSource` bean
- Explicit origin allow-list (no `*` with credentials)
- Preflight OPTIONS flow + filter-chain ordering
- `maxAge` preflight caching
- Server-to-server calls don't involve CORS at all

**FOLLOW-UP QUESTIONS:**
1. Why is `*` with credentials dangerous?
2. Where does CORS enforcement actually happen?

**FOLLOW-UP ANSWERS:**
1. With credentials allowed and any origin accepted, any malicious site can make the victim's browser call your API WITH their cookies attached and read responses — CSRF-level access with read capability. It converts the Same-Origin Policy (the browser's core defense) into a no-op for your domain.
2. In the browser, not the server — the server only *declares* policy via headers; the browser blocks the response if policy isn't satisfied. That's why curl/Postman "work fine" while the browser fails, and why "it works in Postman" is never a CORS rebuttal.

**RED FLAGS TO AVOID:**
- Suggesting `allowedOriginPatterns("*")` with credentials as a "fix"
- Not knowing who enforces CORS (browser) vs who declares it (server)
- Treating webhook/callback endpoints as CORS concerns

---

### Q3-15: How did you handle file uploads and storage
**DIFFICULTY:** Medium
**CATEGORY TAG:** Spring Boot

**ANSWER:**
Uploads (lead-import CSVs, feedback attachments, brand logos) follow one pipeline regardless of type. Ingestion: `MultipartFile` on a `@PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)` with multipart limits set explicitly (`spring.servlet.multipart.max-file-size=10MB`, `max-request-size=12MB`) and a `MaxUploadSizeExceededException` handler → clean 413. **Validation is content-based, not trust-based**: extension and declared MIME type are advisory only — we sniff magic bytes (Apache Tika) to determine the real type, enforce an allow-list per endpoint (logos: png/jpg/svg-sanitized; feedback: images + pdf + mp4), cap pixel dimensions for images, and never serve user uploads from the app origin — they go to object storage (S3-compatible) under a random UUID key and are served via a separate domain with `Content-Disposition: attachment` + `Content-Type` from the sniffed type, killing stored-XSS via HTML/SVG uploads (we sanitize SVG separately or reject it where not needed).

Large files don't flow through the JVM heap: multipart streaming writes to a temp file (container ephemeral disk) and we stream `InputStream` → S3 multipart upload with a size meter, so a 10MB upload costs ~constant memory. The DB stores only metadata (key, owner, content_type, size, checksum SHA-256) — never bytes; a background job reconciles orphaned objects (uploaded but never claimed) with lifecycle deletion after 24h. Download authorization is enforced by presigned URLs (short-TTL, 5 min) generated only after an ownership check — the object storage is never publicly listable. Antivirus/ClamAV scanning runs async for feedback attachments (user-to-admin surface), holding them in a quarantine bucket until clean.

**KEY TERMS TO MENTION:**
- Magic-byte sniffing (Tika) over client-declared MIME
- Allow-list per endpoint + size/dimension caps
- Separate serving domain + `Content-Disposition: attachment` (stored-XSS defense)
- Streaming to S3, metadata-only in DB, presigned short-TTL downloads
- Quarantine + async AV scan for user-to-user surfaces

**FOLLOW-UP QUESTIONS:**
1. Why is serving uploads from the app domain dangerous?
2. How would you handle a 2GB import file?

**FOLLOW-UP ANSWERS:**
1. Same-origin means an uploaded HTML/SVG executes with your app's origin — cookies, localStorage tokens, same-origin API calls all become available to the attacker's script. A separate "dirty" domain sandboxes the blast radius: even if a payload runs, it's not on your origin and can't touch your cookies.
2. Two-phase: client requests an upload session → we return presigned S3 PUT URLs (direct-to-storage, multipart), the app never touches the bytes; on completion the client notifies the API, we verify checksum + size server-side and enqueue the parse job (Spring Batch reading the CSV from S3 in chunks). Browser→app→storage hops are for small files only.

**RED FLAGS TO AVOID:**
- Trusting client MIME type/extension (the textbook upload vuln)
- Storing bytes in the DB or serving from the app origin
- Public buckets or unexpiring URLs

---

### Q3-16: How did you implement email sending (JavaMailSender)
**DIFFICULTY:** Medium
**CATEGORY TAG:** Spring Boot

**ANSWER:**
Email is async, templated, and provider-abstracted. Abstraction: an `EmailPort` interface (`send(EmailMessage)`), implemented by `SmtpEmailAdapter` (JavaMailSender + Gmail SMTP OAuth2/XOAUTH2 for per-user sending mailboxes) — product notifications use the platform's transactional account; outreach uses the USER's connected mailbox (that's what makes outreach deliverable — it comes from their own domain, not ours). All sends happen on the `notifyPool` executor via the AFTER_COMMIT event pattern — an email that blocks a request thread or rolls back with a transaction is a design bug.

Templating: Thymeleaf templates (`email/order-confirmed.html`) with a strict model contract — templates are unit-tested with a snapshot assertion so a model change that breaks a template fails CI, not production. Every message carries headers for deliverability + tracking: `Message-ID` (stored in DB as the idempotency/tracking key), `List-Unsubscribe` (bulk mail compliance), and custom tracking IDs for open/click pixel correlation. Bounce/complaint handling: Gmail/SES feedback loops post to a webhook that marks the recipient as BOUNCED on the org's send-list — three bounces suppress the address automatically (protecting the user's sender reputation is a product feature, not an ops nicety).

Reliability: sends go through the job table with retry (3×, backoff) on transient SMTP errors (4xx rate limits), immediate fail on 5xx auth errors (retrying a bad credential is noise), and a dead-letter state alerting support when a message fails permanently. Rate: per-mailbox token bucket in Redis (Gmail ~ 500/day/user soft limit) — the enforcer delays sends to next-window rather than failing, because outreach campaigns hitting provider limits is a daily reality, not an exception.

**KEY TERMS TO MENTION:**
- `EmailPort` abstraction + JavaMailSender/XOAUTH2 adapter
- Async AFTER_COMMIT send on a dedicated executor
- Thymeleaf + snapshot-tested templates
- `Message-ID` as idempotency key, bounce webhooks → suppression list
- Redis token bucket per mailbox (provider rate limits)

**FOLLOW-UP QUESTIONS:**
1. SMTP is slow — how do you keep p95 API latency unaffected?
2. How do you prevent your platform being used for spam?

**FOLLOW-UP ANSWERS:**
1. The request path only persists the message row (QUEUED) and publishes an event — SMTP happens later on the worker; the API returns in ~40ms. Delivery status reaches the user via the existing notification channel, not by holding the request.
2. Layered: verified domains only (users connect OAuth mailboxes we can verify), per-mailbox and per-org rate caps, content policy checks (unsubscribe header mandatory on bulk, prohibited-content filter), bounce-driven auto-suppression, and audit logs on every send. Abuse signal = bounce+complaint ratio per org crossing threshold → sends paused pending review. Deliverability protection doubles as abuse control.

**RED FLAGS TO AVOID:**
- Sending email synchronously inside a transaction/request
- No idempotency key → duplicates on retry
- No bounce handling (deliverability death spiral)

---

### Q3-17: How did you use Spring Profiles for different environments
**DIFFICULTY:** Easy
**CATEGORY TAG:** Spring Boot

**ANSWER:**
Four profiles: `dev` (local — H2/in-memory Redis via Testcontainers optional, SQL logging on, fake email transport that writes to a folder, seeded data), `staging` (prod-shaped: real Postgres/Redis, mocked payment providers in sandbox mode, verbose logging), `prod` (real everything, JSON logs, metrics on, secrets from the secrets manager), `test` (slices, mocked ports, deterministic clock). Activation is external: `spring.profiles.active` from env, never hardcoded; profile-specific files `application-{profile}.yml` override `application.yml` defaults, and secrets are NEVER in any yml — they're env/secrets-manager references resolved at boot.

The rules that keep profiles honest: (1) **prod parity** — staging runs the same container image with a different profile, so "works in staging" means something; (2) **fail-fast misconfiguration** — a `@ConfigurationProperties @Validated` bean + an `EnvRequirements` checker at boot asserts required vars per profile (prod without `STRIPE_WEBHOOK_SECRET` refuses to start — better a crash loop at deploy than silent broken webhooks); (3) **no `@Profile`-gated business logic** — profiles switch infrastructure beans (mail transport, provider sandboxes), never product behavior; behavior differences are explicit feature flags with admin UI, because flags are auditable and reversible at runtime while profiles require redeploy. One war story I tell: before the boot-time validator, a staging deploy silently ran without Redis config and fell back to an embedded map — tests passed, the cache was never actually exercised, and prod behavior differed. The validator turned that class of error into a startup failure.

**KEY TERMS TO MENTION:**
- Profile-per-environment + `application-{profile}.yml` layering
- Secrets externalized (never in yml/git)
- Boot-time env validation (fail-fast on missing config)
- Profiles for infrastructure, feature flags for behavior
- Staging = same image, different profile

**FOLLOW-UP QUESTIONS:**
1. How do you handle config that must change without redeploy?
2. Difference between profiles and `@ConditionalOnProperty`?

**FOLLOW-UP ANSWERS:**
1. Two mechanisms: feature flags (behavior, admin UI, instant) and Spring Cloud Config/refresh-scope for infrastructure tunables (pool sizes) — but honestly 95% of "change without deploy" asks are product behavior, which is flags. Config drift is monitored: a daily job diffs effective config (actuator env endpoint, sanitized) against git, so hand-edits surface.
2. `@ConditionalOnProperty` creates beans conditionally at boot — an infrastructure switch; profiles are the environment selector. They compose (a bean can be registered when `cache.enabled=true` AND profile=prod). The anti-pattern is overloading profiles to toggle features — that's what flags are for.

**RED FLAGS TO AVOID:**
- Secrets in yml or @Profile'd business logic
- No boot-time validation (config errors surface at runtime, mid-customer)
- "Staging is a smaller different app" — parity matters more than cost

---

### Q3-18: How did you implement health checks and actuator endpoints
**DIFFICULTY:** Medium
**CATEGORY TAG:** Spring Boot / Observability

**ANSWER:**
Actuator is exposed over a **separate management port** (9090) on the internal interface only — never proxied publicly; the ALB target-group health check hits `/actuator/health` on that port. Health is split: **liveness** (`/actuator/health/liveness`) = "is the JVM wedged" — always up if the process answers; **readiness** (`/readiness`) = "can I serve traffic" — aggregates checked indicators: DB (`DataSourceHealthIndicator` with a cheap validation query), Redis ping, disk space (temp dir for uploads, threshold 20%), and the job-table poller lag (custom indicator: HEALTHY if lag < 60s, DEGRADED 60-300s). Readiness false → instance removed from the ALB (deploy drain, dependency outage) without killing the pod — that's the whole point of the split: restart won't fix a Redis outage, but pulling traffic prevents user-facing errors while on-call fixes Redis.

Beyond health: `/metrics` (Prometheus format — Micrometer counters/histograms/timers for every controller, executor, pool), `/info` (git commit + build time — "what's running" answered in one click during an incident). Security: management port unauthenticated INSIDE the VPC but the info/env endpoints are restricted by an internal network policy; anything config-revealing is env-sanitized (`show-values: never`). Custom indicators I added: `StripeHealthIndicator` (circuit state + last webhook age — a stale webhook age is the earliest signal Stripe connectivity broke) and `AiProviderHealthIndicator` (breaker state), so the ops dashboard answers "which dependency is degraded" without log spelunking. Load balancer checks stay cheap (a `/health` lite variant without dependency checks) to avoid health-check storms doing real work every 5 seconds per instance.

**KEY TERMS TO MENTION:**
- Management port separation + internal-only exposure
- Liveness vs readiness semantics (restart vs drain)
- Custom `HealthIndicator`s (webhook freshness, breaker state)
- Micrometer metrics + git info endpoint
- Cheap LB checks vs full readiness

**FOLLOW-UP QUESTIONS:**
1. During a deploy, what does the ALB see?
2. A dependency is down but the app works without it — ready or not?

**FOLLOW-UP ANSWERS:**
1. New instance starts → readiness false until DB/Redis checks pass → ALB registers it; old instances get deregistered with connection draining (30s) letting in-flight requests finish; zero-downtime because traffic shifts only to instances that declared ready.
2. That's a triage decision encoded per indicator: if the app degrades gracefully (fallbacks), the dependency indicator reports DEGRADED (still ready, dashboard shows yellow, users unaffected); if functionality is genuinely broken without it (DB), it's DOWN and readiness drops. Health is a product statement, not just a ping.

**RED FLAGS TO AVOID:**
- Exposing actuator publicly (classic finding in audits)
- One mega health endpoint conflating liveness with dependencies
- "Green dashboard, broken webhooks" — no freshness indicators

---

### Q3-19: How did you handle configuration externalization and secrets
**DIFFICULTY:** Medium
**CATEGORY TAG:** Spring Boot

**ANSWER:**
Layered config with clear ownership: defaults in `application.yml` (sane, safe), environment overrides via env vars (`SPRING_APPLICATION_JSON` + individual vars from the secrets manager at container start), runtime-tunable behavior in feature flags (DB-backed, admin UI), and secrets in **AWS Secrets Manager** — fetched by an init sidecar that exports them as env vars to the main container; the JVM never reads a secrets file from disk, and the secrets never live in the image, git, or CI logs (CI references, not values). Rotation: DB password rotates quarterly via a two-phase rollout — update secrets manager → rolling restart consumers with both creds valid window (Postgres supports dual-password transitions via pg_hba timing) — and JWT signing keys are versioned (`kid` header) so rotation signs new tokens with the new key while old keys verify until TTL expiry; zero logout storms.

Inside the app, `@ConfigurationProperties` classes (typed, validated, IDE-navigable) bind config — string-pulling `@Value` is banned by review convention beyond trivial one-offs, because typed config is testable and documents itself. Sensitive-value hygiene: actuator env endpoint `show-values: never`; log masking via a Logback converter that scrubs patterns (Bearer tokens, emails in some contexts, card data — we never accept card data anyway, Stripe does); and a boot-time "secret audit" that fails startup if any known-secret-name appears resolved from a non-secrets source (catches the intern putting SMTP_PASSWORD in application-prod.yml — that PR gets rejected by CI, not found in an audit).

**KEY TERMS TO MENTION:**
- Secrets Manager + init sidecar → env vars (no secrets on disk/image/git)
- `@ConfigurationProperties` typed validated binding
- Key rotation with `kid` versioning (JWT), dual-valid window (DB)
- Log masking converter + actuator `show-values: never`
- Boot-time secret-source audit (fail-fast)

**FOLLOW-UP QUESTIONS:**
1. A secret leaked to git history — walk me through your response.
2. Config drift between replicas — how do you detect it?

**FOLLOW-UP ANSWERS:**
1. Treat as compromised, not "delete the commit": (1) rotate the secret immediately (invalidates the leak), (2) purge history + force-push, (3) audit access logs for the secret's misuse window, (4) postmortem the pipeline gap that allowed it (add pre-commit/CI secret scanning — gitleaks — so the next one never lands). Rotation first, because git history is forever once pushed.
2. Config is derived from env at boot, so drift means deploys diverged — the `/info` git commit + a config hash (sha of effective sanitized config) exposed per instance; a Grafana panel alerts when instances of the same service report different hashes. It caught a stuck rollout once where one pod ran yesterday's image.

**RED FLAGS TO AVOID:**
- Secrets in yml/git/CI variables without rotation story
- No masking in logs (secrets end up in ELK, readable by everyone)
- "We'd rotate manually" with no tested procedure

---

### Q3-20: What design patterns did you use in Spring Boot (beyond what the framework gives you)
**DIFFICULTY:** Hard
**CATEGORY TAG:** Spring Boot / Design

**ANSWER:**
I frame the answer as "patterns the framework already gives us" vs "patterns we added". **Framework-provided** (worth naming explicitly to show depth): DI is Service-Locator inverted into constructor injection; `RestTemplate`/`JdbcTemplate` are Template Method (skeleton with pluggable steps); Spring MVC's `HandlerAdapter` is Strategy; `ApplicationEventPublisher` is Observer; proxies (`@Transactional`, `@Async`, `@Cacheable`) are Proxy/Decorator; `Builder` is everywhere in Lombok-generated and Testcontainers-style APIs.

**Patterns we added, with the why:** (1) **Ports & Adapters at integration edges** — `EmailPort`, `SmsPort`, `AiPort` interfaces with per-provider adapters (SMTP adapter, Twilio adapter, OpenAI/Gemini adapters). Payoff: the AI provider fallback chain is literally a list of adapters tried in order; swapping Gemini for Claude is a new class + config, and tests mock the port, not HTTP. (2) **Strategy for pricing** — `PricingStrategy` per plan tier (Flat, Metered, Enterprise) chosen by a registry keyed on plan; adding a plan = new strategy class, no if-chains. (3) **Factory + Registry for channel routing** — notifications route by channel type to `ChannelSender` implementations discovered from the context; the router is closed for modification, open for extension. (4) **Facade for the AI orchestration** — `OutreachFacade` composes prompt-build → provider call → validation → credit deduction behind one method so controllers stay thin and the 6-step flow has one tested home. (5) **Domain exceptions + `@RestControllerAdvice`** as the Exception pattern mapping errors to ProblemDetail codes centrally.

Anti-overengineering caveat I state proactively: we did NOT use AbstractFactoryBuilder nonsense for one-implementation cases — a pattern earns its keep when there's a second implementation on the horizon (there always was: providers multiply in SaaS). Patterns without a forcing function are resume-driven architecture, and I'd rather delete code than polish it.

**KEY TERMS TO MENTION:**
- Recognizing framework patterns (proxy, template method, observer)
- Ports & Adapters on integration edges (provider swap/fallback chains)
- Strategy (pricing), Registry/Factory (channel routing), Facade (AI flow)
- Centralized exception → ProblemDetail mapping
- Pattern discipline — no pattern without a second implementation

**FOLLOW-UP QUESTIONS:**
1. Show how the Strategy pattern concretely reduced complexity.
2. Where did a pattern cost you more than it paid?

**FOLLOW-UP ANSWERS:**
1. Before: `PricingService.calculate()` had nested if/else per plan × per action type × per discount flag — 200 lines, every plan change risked regressions. After: three strategy classes + a registry; unit tests per strategy are table-driven; adding the Enterprise tier was a new class + one registration line, zero diff in existing classes. The tell of a good pattern: the diff for change #3 is tiny.
2. We introduced a Specification pattern for lead filtering when there were 3 filters — pure ceremony over a simple `WHERE`. It was deleted after the criteria stabilized; a plain query builder was clearer. Lesson recorded in our ADR: introduce abstraction at 3+ stable variants, not at 1 speculative one.

**RED FLAGS TO AVOID:**
- Listing GoF names without where/why in YOUR codebase
- Claiming every pattern under the sun (nobody used 15 patterns well)
- No anti-overengineering stance — seniors know when NOT to abstract
