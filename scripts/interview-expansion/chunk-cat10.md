### Q10-2: What are the trade-offs of your monolithic approach — name the real costs you paid
**DIFFICULTY:** Medium
**CATEGORY TAG:** Architecture

**ANSWER:**
I name the costs first because the benefits are well-known — the senior signal is knowing what the monolith actually charged us. **Cost 1 — shared failure domain**: one bad deploy takes everything down; an AI-provider deadlock in the outreach thread pool degraded the LEADS list (thread exhaustion is global inside one JVM) — we mitigated with executor isolation (bulkheads) but the JVM is still one blast radius. **Cost 2 — scaling granularity**: the scraping module is CPU-heavy, the API is I/O-heavy; the monolith scales them TOGETHER — we run 3 identical instances where 2 API + 1 worker would do; the waste is ~30% of compute, and the fix (extract workers) was deferred by design (the ADR records the trigger: infra cost > extraction cost — not yet true). **Cost 3 — team coupling at the code level**: 6 engineers in one repo = merge friction, shared-module ownership disputes, and the temptation for a feature to reach ACROSS bounded contexts (a meeting feature importing lead internals — the dependency-cruiser CI check exists because someone did it); the mitigation is architectural enforcement (context packages, ArchUnit tests), which is discipline cost, not free. **Cost 4 — technology lock-in**: one JVM — the ML scoring prototype in Python had to be re-expressed in Java (or become a side-service; we chose the side-service, which is the monolith admitting its first exception); polyglot freedom is a microservices purchase we didn't make. **Cost 5 — deploy coupling cadence**: the weekly full-app deploy means a one-line notification fix ships with a leads-engine change — bigger test surface, bigger rollback, and release-train pressure; feature flags decouple ENABLEMENT but not CODE shipping.

What it bought, stated with the same honesty: single transactional boundary across the whole funnel (lead → deal → billing consistency is ONE `@Transactional`, no sagas), one deploy pipeline, one on-call surface, refactors across contexts in a single PR (we changed the credit-deduction signature across 5 modules in a day — in microservices that's a quarter of coordinated releases), and debugging that's a stack trace, not a trace-id hunt across 8 services. The net: at 50k users / 6 engineers / single-product focus, the trade was correct — and I can name the metric lines where it flips, which is the actual answer.

**KEY TERMS TO MENTION:**
- Real costs: failure domain, scaling granularity (~30% compute waste), team coupling, tech lock-in, deploy cadence
- Mitigations: executor bulkheads, ArchUnit/dependency boundaries, worker extraction plan
- Benefits: single ACID boundary, cross-context refactors, one on-call
- The flip-line metrics (cost > extraction, team > ~15 engineers, independent scaling need)

**FOLLOW-UP QUESTIONS:**
1. How do you keep a monolith from rotting into a big ball of mud?
2. Which cost surprised you most in practice?

**FOLLOW-UP ANSWERS:**
1. Structure enforced by tests, not documents: bounded-context packages with ArchUnit rules (leads cannot import meetings internals; only the events package crosses), a dependency-graph CI check (cruiser), API-style service interfaces between contexts even in-process, and ADRs for every cross-context change. The monolith rots exactly where governance is manual — so governance is automated. Same discipline microservices enforce with network boundaries; we do it with build-time rules.
2. Team coupling — technically everything was solvable, socially the shared code created passive bottlenecks (everyone waits for the one person who owns lead-scoring). The fix was organizational as much as technical: CODEOWNERS per context package, a rotation through context ownership, and the service-interface rule making cross-context requests explicit reviews. The lesson: architecture decisions are also staffing decisions.

**RED FLAGS TO AVOID:**
- Listing only benefits (junior-flavored answer)
- No quantified costs (the ~30% compute number, the thread-exhaustion incident)
- No enforcement story (monolith discipline is build-time, or it's fiction)

---

### Q10-3: How would you migrate this to microservices if needed — walk me through the actual plan
**DIFFICULTY:** Hard
**CATEGORY TAG:** Architecture

**ANSWER:**
Strangler-fig, driven by an extraction scorecard, never a big-bang rewrite. **Phase 0 — make the seams real** (mostly done): bounded contexts with enforced boundaries (ArchUnit), in-process events (`ApplicationEventPublisher`) whose contracts are already Kafka-shaped (id-payload, typed channels), and data ownership per context (context-owned tables, no cross-context FKs — UUID references only). The monolith's discipline IS the migration plan; if boundaries were fictional, I'd fix that FIRST — extracting a tangled module ships the tangle to production with network latency added. **Phase 1 — pick the first extraction by scorecard**: independent scaling need × change frequency × team ownership clarity × data-coupling LOW × blast-radius tolerance. Our scoring picks `ai-gateway` first (LLM calls: scaling profile is I/O-wait heavy and totally different from OLTP, provider churn is frequent, it already sits behind the AiPort interface) — NOT billing (money, transactional coupling, zero scaling pain) and NOT leads (the deepest data web). **Phase 2 — extraction mechanics**: the AiPort interface becomes HTTP/gRPC; the monolith keeps the interface, implementation moves — callers don't change (that's what the port bought us); data: the AI module owns only request/response logs + prompt templates (small, low-coupling — deliberately picked); transaction: no shared transactions existed across this boundary (design-time win); deployment: the service ships with its own pipeline; resilience: timeouts/retries/breakers become REAL network concerns — Resilience4j configs graduate from defensive to mandatory, plus contract tests both directions. **Phase 3 — traffic cutover**: dual-run (monolith calls new service behind a flag, 5% → 50% → 100%, metrics compared: latency, error rate, cost per call), rollback = flag flip. **Phase 4 — event backbone**: as extractions accumulate, `ApplicationEventPublisher` impl swaps to Kafka publisher (same event classes → same JSON contracts); consumers move per-extraction, not big-bang.

The honest map of what stays hard: distributed data needs (a report joining leads + billing across services — the answer is the reporting data-warehouse fed by events, which we ALREADY have for analytics — the warehouse was built monolith-time specifically as the future cross-service query surface); distributed transactions (billing deduction from outreach service — the outbox pattern Q6-11 graduates from in-monolith convenience to inter-service necessity); and ops weight (8 dashboards, service mesh question, on-call rotation per service — the costs of Q10-2 arriving on schedule). The extraction scorecard keeps this honest: we extract when the SCORECARD says, not when the architecture fashion says.

**KEY TERMS TO MENTION:**
- Strangler-fig + extraction scorecard (never big-bang)
- Ports-às-seams: AiPort interface → HTTP without caller changes
- Boundary discipline pre-conditions (ArchUnit, no cross-context FKs, event contracts)
- Dual-run flag cutover with metric comparison + rollback
- Event backbone swap (in-process → Kafka) per-extraction; warehouse for cross-service queries

**FOLLOW-UP QUESTIONS:**
1. Why is billing the WORST first extraction?
2. After extracting 3 services, what does the "monolith" actually become?

**FOLLOW-UP ANSWERS:**
1. Money paths are transactionally entangled with everything (credit deduction inside outreach transactions, subscription state gating features) — extraction means Saga choreography where ACID used to be, the highest-risk migration class, for zero scaling benefit (billing is small-row OLTP — it scales trivially inside the monolith). First extractions should build team confidence on low-coupling/high-benefit targets; billing is the last, if ever.
2. A domain core with satellite services: the monolith retains the transactional heart (leads, deals, billing — the ACID-coupled center) while stateless/scaling-mismatched concerns (AI, notifications, scraping workers, future ML) live as services. That end-state is a legitimate permanent architecture, not a failure to finish migrating — the goal was OPTION VALUE and fit-for-purpose placement, not a service count. I'd defend that end-state in front of any architect.

**RED FLAGS TO AVOID:**
- "Extract everything" big-bang instinct (the classic resume-driven answer)
- No seam pre-conditions (extracting a tangled module)
- No cutover/rollback mechanics (flag-based dual-run or it's hope)

---

### Q10-4: What is your layered architecture structure and the rules between layers
**DIFFICULTY:** Easy
**CATEGORY TAG:** Architecture

**ANSWER:**
Four layers with one-way dependencies, enforced by ArchUnit in CI: **Controller** (`@RestController` — HTTP contract only: mapping, `@Valid`, status codes, DTO in/out — zero business logic, zero entities exposed; a controller is ~30 lines or it's wrong); **Service** (use-case orchestration: transactions, policy checks, event publication, mapping domain↔DTO — the layer with the unit-test weight; services call OTHER SERVICES only through interfaces and never across bounded contexts except via the events package); **Repository** (Spring Data JPA + Specifications — data access only, no business rules; query-shape decisions live here, business decisions don't); **Domain/entities** (JPA entities + value objects + domain exceptions — the model the other layers move). Cross-cutting layers sit beside, not inside: `@RestControllerAdvice` (errors), AOP aspects (audit, rate-limit), integration adapters (ports/impls), configuration.

The rules that make layering real rather than nominal: **dependencies point inward-down** (controller → service → repository → domain; nothing calls up; domain imports NOTHING from Spring Web — entities run in batch jobs without a web context, which we actually exercise); **DTO boundary at the edge** (entities never cross into controllers — MapStruct mapping in the service; this one rule kills the lazy-loading and serialization bug classes, Q5-20); **one use-case, one service method** (`@Transactional` at the service boundary; controllers never open transactions; helper services called WITHIN a use-case join its transaction by REQUIRED — the transaction topology is a designed artifact, reviewed in PRs); **ports at the perimeter** (all external systems behind interfaces in the integration package — the reason Q10-3's extraction is mechanical). The enforcement is the senior part: ArchUnit rules (`noClasses().that().resideInAPackage("..controller..").should().dependOnClassesThat().resideInAPackage("..repository..")`, entities-never-in-controllers, no-field-injection) FAIL the build — layering by convention rots in month three; layering by CI check survives year two. I can also name the deliberate exceptions (a controller query DTO built directly by a read-side projection for a dashboard — documented, performance-motivated, ADR'd), because architecture without documented exceptions becomes dogma people route around secretly.

**KEY TERMS TO MENTION:**
- Controller/Service/Repository/Domain + one-way dependency rule
- ArchUnit CI enforcement (layering as tests, not convention)
- DTO boundary at the edge (entities never reach controllers)
- One use-case one @Transactional service method; REQUIRED joins
- Ports at the perimeter + documented exceptions (ADR'd, not secret)

**FOLLOW-UP QUESTIONS:**
1. Why not skip the service layer for simple CRUD?
2. Where do mappers live and why MapStruct over manual?

**FOLLOW-UP ANSWERS:**
1. Tempting and wrong for us: "simple CRUD" gains business rules within a quarter (validation exceptions, events, permissions, credit checks) — retrofitting the service layer then is a bigger refactor than always having it. The cost we control: services stay thin for genuinely simple cases (delegate + map — 15 lines). What I WOULD concede: for a tiny admin tool, a two-layer (controller + repository) design is defensible; the choice scales with product ambition, and ours grew exactly as predicted.
2. Mappers live beside the service layer (`mapper` package, per-context); MapStruct because mapping is compile-time-checked (a renamed field breaks the build, not production), generated code is debuggable (unlike reflection magic), and performance is zero-overhead (plain getters — vs ModelMapper's runtime reflection cost we measured at ~15% on hot list endpoints). Manual mapping is fine for ≤ 3 fields; above that, generated mapping with tests beats hand-rolled drift.

**RED FLAGS TO AVOID:**
- Layers as folders with no dependency enforcement
- Entities in API responses ("it's faster" — it's just deferred pain)
- No answer for the transaction topology across layers

---

### Q10-5: How did you ensure separation of concerns beyond the layer rules
**DIFFICULTY:** Medium
**CATEGORY TAG:** Architecture

**ANSWER:**
Layering separates TECHNICAL concerns; the harder separation is BUSINESS capability — bounded contexts. The system is divided into six contexts (`auth`, `leads`, `outreach`, `meetings`, `billing`, `ai`) each owning: its tables (no cross-context FKs — UUID refs only, Q6-2), its service interfaces, its domain events, and its exceptions. The enforcement stack, in layers of escalating strictness: package structure (contexts as top packages with public API sub-packages), ArchUnit (context A may not import context B's INTERNALS — only the `api` package), event-mediated collaboration (cross-context reactions via `ApplicationEventPublisher` — auth doesn't CALL billing, it publishes `SubscriptionChangedEvent` that billing listens to; the dependency is on the EVENT CONTRACT, not the module), and the dependency-graph CI report (cruiser visualization reviewed in architecture syncs — drift is visible in a picture, which reviewers actually read).

Concern separation inside a context follows the same principle at smaller scale: policy objects (`leadSecurity` — the canEdit/canView checks) separate AUTHORIZATION from business logic (services orchestrate, policy decides); query/projection separation (read-side DTO projections for dashboards vs write-side aggregates — CQRS-lite where the shape difference is real: the leads LIST reads a projection, lead WRITES go through the aggregate — no framework, just two repository paths); configuration separation (all knobs in `@ConfigurationProperties` classes per context — no magic values in services); and state-machine separation (lead stage, deal stage, message status are explicit state machines in one place each — transitions validated centrally instead of scattered if-chains: the bug class "who moved this to SENT illegally" died when transitions became a closed set).

The proof it works is the refactor record: extracting the AI module (Q10-3) touched 3 files in other contexts (the AiPort binding) — a context extraction that used to be archaeology became mechanical. And the honest cost, which I state before asked: boundary discipline has a tax — a feature spanning two contexts takes slightly longer than reaching across (design the event, the contract, the two-side implementation); I accept that tax because its opposite (cross-context reach) compounds into the big-ball-of-mud trajectory, and the compound interest is what kills systems, not the day-one tax.

**KEY TERMS TO MENTION:**
- Bounded contexts (6) with owned tables/interfaces/events/exceptions
- Event-mediated cross-context collaboration (contract dependency, not module import)
- Policy objects, CQRS-lite projections, explicit state machines inside contexts
- Dependency-graph visualization in CI + architecture syncs
- The boundary tax, stated and accepted (vs compound interest of coupling)

**FOLLOW-UP QUESTIONS:**
1. Give an example where an event contract SAVED you.
2. When is separation of concerns over-engineering?

**FOLLOW-UP ANSWERS:**
1. Adding the hot-lead Telegram alerts: `LeadBecameHotEvent` already existed for analytics — the Telegram listener was a NEW class subscribing to an EXISTING contract; zero changes to lead logic, shipped in a day. The counterfactual without the event: the lead-scoring service would have grown a `telegramSender` dependency, then a notification-config dependency, then... The event was designed for the SECOND listener, and it arrived.
2. When the axis of change is one: a context with one developer, one consumer, one stable shape doesn't need event ceremony — a direct call is clearer. Separation pays per INDEPENDENT axis of change (different teams, different scaling, different release cadences). Our early code had exactly this over-separation (an interface for a one-impl utility — deleted); the discipline is paying separation-debt only where change axes exist, and the ADR records each judgment.

**RED FLAGS TO AVOID:**
- "Separation" meaning only folders (no contracts, no enforcement)
- Event-mediated everything (direct calls where sync semantics are required)
- No cost acknowledgment — dogma is also a red flag

---

### Q10-6: How did you handle cross-cutting concerns (logging, security, audit, metrics)
**DIFFICULTY:** Medium
**CATEGORY TAG:** Architecture / Spring AOP

**ANSWER:**
Cross-cutting concerns are the canonical AOP use case, and our rule is: if a concern must apply UNIFORMLY by policy, it's an aspect or a filter — never call-site code. The inventory: **security** — Spring Security's filter chain (authentication/authorization at the boundary) + method security (`@PreAuthorize`) + policy beans (business-conditional rules); **logging/tracing** — correlation-id filter (MDC) + TaskDecorator propagation + the redaction converter; **audit** — `AuditAspect` (`@Around` on `@Audited`): captures actor/action/args/duration into the audit trail — one aspect, 200 annotations, zero scattered audit calls in services; **metrics** — Micrometer auto-instrumentation (controllers, executors, pools) + `@Timed`/`@Counted` where custom dimensions matter; **rate limiting** — filter (Redis-backed) before controllers + method-level annotation for fine-grained budgets; **idempotency** — an aspect on `@Idempotent(key = "...")` routes: checks the idempotency store before proceeding (Stripe-style request dedup at the application layer); **transaction boundaries** — `@Transactional` itself (the framework's AOP, which I count in the same mental bucket).

The design rules that keep aspects healthy: aspects declare ORDER explicitly (`@Order` — security filter → rate-limit → transaction → audit → metrics; ordering bugs are the subtlest AOP failures — an audit aspect inside a rolled-back transaction records what didn't happen); aspects are TESTED as units with the proxy (an aspect test suite using AspectJ proxy fabric — most teams test aspects never and discover order bugs in production); pointcuts are annotation-driven, not package-wildcard (explicit opt-in per method — `@Audited`, `@Timed` — because wildcard pointcuts silently capture new code, and "silently applies to code that didn't ask" is the AOP failure mode that makes people hate it); and every aspect has a kill-switch config (`@ConditionalOnProperty`) — when an aspect misbehaves in production (the audit aspect's queue backed up once), the flag turns it off while the fix ships, versus a hotfix deploy. The alternative to aspects — base classes, manual calls, decorator wrapping — was rejected with the same reasoning each time: policy-uniform concerns leak when left to call-site discipline, and leaky discipline is how audit gaps happen (the exact gap our CI coverage test exists to prevent).

**KEY TERMS TO MENTION:**
- Aspect/filter inventory: security, correlation, audit, metrics, rate-limit, idempotency
- Explicit @Order (ordering bugs as the subtle AOP failure)
- Annotation-driven pointcuts (opt-in, no wildcard capture)
- Aspect unit tests + kill-switch configs
- "Policy-uniform → aspect" as the deciding rule

**FOLLOW-UP QUESTIONS:**
1. What AOP problems have you actually hit in production?
2. Spring AOP proxy limitations — where do they bite?

**FOLLOW-UP ANSWERS:**
1. Two: the audit-aspect queue backup (async unbounded queue under a log-storm — now bounded + drop-metric + kill-switch) and an ORDER bug where audit ran before the transaction committed, recording actions a concurrent reader couldn't see (flaky "ghost entries" reports) — fixed with AFTER_COMMIT semantics for the publish-path and order pinned in tests. Both are exactly the failures the aspect-testing discipline now catches pre-prod.
2. Self-invocation (the big one — `this.method()` bypasses the proxy for @Transactional/@Async/@Audited alike; our ArchUnit rule bans self-invocation of annotated methods), private/final methods (not proxied), and same-class field access skipping getters. These are why our style rules exist: annotated methods live on beans, called via interfaces, public — the limitations are known, encoded as static checks, not discovered as production mysteries.

**RED FLAGS TO AVOID:**
- Cross-cutting logic copy-pasted or base-classed instead of aspects/filters
- No aspect ordering awareness
- Wildcard pointcuts capturing uninvolved code

---

### Q10-7: How did you manage application startup and initialization
**DIFFICULTY:** Easy
**CATEGORY TAG:** Architecture / Spring Boot

**ANSWER:**
Startup is a designed sequence with fail-fast gates, not "Spring magic happens". The order as the app boots: **(1) Configuration validation** — `@ConfigurationProperties @Validated` beans bind + validate; a custom `EnvironmentPostProcessor` checks profile-required env vars (prod missing `STRIPE_WEBHOOK_SECRET` = boot failure with a NAMED error, not a runtime mystery three days later); **(2) DataSource + Flyway** — Hikari pool initializes, Flyway migrates to head (schema drift fails via `hbm2ddl.auto=validate`); **(3) Redis + connectivity probes** — the health indicators run eagerly once (a down Redis at boot is WARN + degraded mode, not crash — the fail-open tiers keep serving); **(4) Cache warm-up** — the reference-data caches (credit costs, plan features, pipeline stages) pre-load synchronously (a few hundred ms; first-request latency spike avoided — a warm-cache guarantee matters more than fast boot here); **(5) Scheduled/job registration** — schedulers register but jobs acquire their distributed locks before first run (a booting instance doesn't double-fire the sweep the running instance just did); **(6) Readiness flip** — the readiness indicator goes UP only after all gates pass; the ALB routes traffic only then (rolling deploys depend on this honesty — an instance that says ready before caches are warm serves 300ms first-hits and poisons p95).

The code surfaces for boot logic, in preference order: `@ConfigurationProperties` binding (data, validated), `@Bean` factory methods (wiring with dependencies visible in signatures), `ApplicationRunner`/`CommandLineRunner` for sequenced boot tasks (cache warm-up, the denylist re-derivation sweep on boot), and `@PostConstruct` ONLY for intra-bean invariant checks (it runs before the bean's dependencies are necessarily complete — a classic boot-bug source; our style rule limits it). Two production scars that shaped this: an env var typo that surfaced as a NullPointerException in a scheduled job at 2 AM (hence the EnvironmentPostProcessor gate — config errors must die at boot WITH the variable name in the message), and a cache warm-up moved to async "to speed deploys" that created cold-cache p95 spikes every deploy (reverted — boot takes 4 more seconds and p95 stays flat; the trade is written in the ADR).

**KEY TERMS TO MENTION:**
- Fail-fast sequence: config validation → Flyway → probes → warm-up → schedulers → readiness
- EnvironmentPostProcessor named-error config gates
- Eager cache warm-up (boot +4s vs cold p95 spikes — the ADR trade)
- ApplicationRunner sequencing vs @PostConstruct limitation
- Readiness flips only after all gates (rolling-deploy honesty)

**FOLLOW-UP QUESTIONS:**
1. How do you debug a boot failure fast?
2. Why is Redis-down at boot a WARN not a failure?

**FOLLOW-UP ANSWERS:**
1. Boot failures print a structured banner in dev (the failure analyzer from Spring Boot is kept on: named bean, named property, named migration) — the goal is "read the first error, skip the 40-line stack". CI runs boot in every PR (a context-loads test with the real profile matrix), so boot breaks are caught before the deploy, where they'd page someone. The 2 AM NPE class of error is extinct by design.
2. Degradation design (Q7-8): Redis is an accelerator for cache tiers and a fail-closed helper for security tiers — the app is DESIGNED to run degraded, so a boot-time Redis outage should produce a degraded-but-serving instance (alerts fire, on-call fixes Redis, cache re-heats via single-flight). Hard-failing boot on an accelerator turns a Redis blip into a full outage — the availability arithmetic made the decision, not preference.

**RED FLAGS TO AVOID:**
- @PostConstruct-heavy boot logic with ordering assumptions
- Silent config errors surfacing at runtime
- Readiness declared before caches/init complete

---

### Q10-8: TWISTED — Walk me through adding a brand-new feature (SMS channel) end-to-end in this architecture
**DIFFICULTY:** Hard
**CATEGORY TAG:** Architecture / Design Exercise

**ANSWER:**
The feature: SMS as a new outreach/notification channel. **Day 0 — contract design**: `SmsPort` interface in the integration package (`send(SmsMessage): SmsResult`) — the port exists BEFORE the provider decision (the architecture's whole point: channel count grows, port count doesn't); per-channel cost added to `credit_cost` (SMS = 6 credits — costs are data, Q2-13); `notification_channel` gains a `channel_type=SMS` value (enum + migration); the channel router registers the new sender. **Provider phase**: Twilio (already a vendor — Q9-7) — adapter implements `SmsPort` with the standard resilience stack (timeout 10s, retry 2× on 429/5xx with jitter, breaker, idempotency key in our message table); API keys via secrets manager; the adapter is ~150 lines because the pipeline (job table, dedupe, audit, metrics) is inherited infrastructure, not per-channel work. **Domain phase**: opt-in/compliance surface — SMS has legal weight (TCP-style consent rules): `consent` table (per-lead SMS consent flag + source + timestamp), the composer REFUSES SMS without consent (a domain rule enforced in `OutreachFacade`, tested as a first-class case), opt-out keyword handling ("STOP" via the inbound webhook → suppression list — same machinery as email unsubscribes); templates registered per channel in the composer (SMS: 160-char discipline, link shortening with tracking).

**Integration phase**: inbound webhook `/api/webhooks/twilio/sms` through the standard pipeline (Q9-8: raw capture → signature validation → persist → dedupe by MessageSid → handler); replies feed reply-intelligence (the classifier gains an SMS channel — it's channel-agnostic by design, consuming normalized message text); **Surface phase**: frontend gets the channel toggle (feature-flagged rollout: internal orgs → 5% → GA), usage dashboards gain the SMS family (send rate, cost, block/opt-out rates — every channel ships with its health metrics, the WhatsApp block-rate lesson pre-applied), and the audit aspect annotates the new service methods. **Total effort: ~2.5 weeks**, of which maybe 15% touched EXISTING code (enum value, router registration, composer branch, feature flag) — the diff is overwhelmingly NEW files in the integration package + config data. That ratio is the whole architectural argument in one number: the layered + port-based + event-mediated structure makes channel #4 a branch, not a surgery. And the honest caveats: consent/compliance was 40% of the real effort (architecture doesn't absorb LAW), and provider-choice lock-in is confined to the adapter (~150 lines to swap — the port's rent is paid at swap time, not build time).

**KEY TERMS TO MENTION:**
- Port-first design (SmsPort before provider choice); router registration
- Inherited infrastructure: job table, dedupe, audit, metrics, breaker stack
- Compliance as a domain rule (consent gate in the facade, STOP handling)
- Feature-flagged rollout + channel health dashboards from day one
- The diff ratio (~85% new files / ~15% touched) as the architecture metric

**FOLLOW-UP QUESTIONS:**
1. What would have made this feature HARD in your architecture?
2. Where did you consciously NOT generalize?

**FOLLOW-UP ANSWERS:**
1. If channels had been if-branches in the outreach service (channel == 'email' ? ... : ...): every touchpoint (send, dedupe, tracking, compliance, metrics) would need editing, the diff would be invasive, and the regression surface the whole outreach pipeline. The port pattern's rent was paid in week one of the original design — this feature is the dividend. Honest answer includes the counterfactual: architectures prove themselves on feature #4, not feature #1.
2. Two spots: no abstract "MessagingPort" mega-interface (SMS/email/WhatsApp have genuinely different semantics — three ports beat one leaky abstraction with optional methods); and no per-channel database schemas (one `message` table with SINGLE_TABLE inheritance, Q5-17 — subtype columns stayed few). Generalization was applied where variation PROVED recurring (channels multiply), withheld where it was speculative. That restraint is why the clean points stayed clean.

**RED FLAGS TO AVOID:**
- Feature walkthrough with no compliance/legal dimension (SMS without consent = lawsuit architecture)
- Invasive diff ("modified 30 files") — that's the architecture failing the test
- No metrics/rollout story (features ship with observability or not at all)
