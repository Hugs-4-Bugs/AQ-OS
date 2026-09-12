### Q13-2: How did you write unit tests for services (JUnit 5 + Mockito patterns)
**DIFFICULTY:** Medium
**CATEGORY TAG:** Testing

**ANSWER:**
Unit tests target the SERVICE layer's decision logic — the orchestration, branching, policy, and state transitions — with all collaborators mocked. The house style, hardened by review: **one behavior per test, named as the requirement** (`deductCredits_insufficientBalance_throwsAndWritesNoLedger` — the name IS the spec; a failing test's name tells you the broken requirement); **Arrange-Act-Assert with strict structure** (given/when/then comments when non-obvious); **state-based assertions over interaction-counting** (assert the LEDGER ROW and returned result, not "verify(repo,times(1))" — mock-verification is reserved for genuinely unobservable side effects like "emailPort.send was called", where it's the only truth available; over-verified tests break on refactors that preserve behavior — the classic brittleness). **Mockito mechanics that matter**: `@ExtendWith(MockitoExtension.class)` (no PowerMock ever — PowerMock in a stack is a design smell telling you to extract a seam), `lenient()` scoped to setup-wide defaults with STRICT_STUBS default (unused stubs = dead code tests warn about), `ArgumentCaptor` for asserting the PAYLOAD sent to collaborators (the message content, not just "send happened"), and `@Nested` classes grouping by method under test.

The patterns beyond CRUD: **state-machine tests are table-driven** (`@ParameterizedTest` over (from, action, to, allowed?) tuples — the lead-stage machine's 40 transitions are 40 rows, not 40 test methods); **exception-path parity** (every thrown domain exception has a test asserting the mapping contract with the advice layer — error codes are API surface, Q8-4); **clock injection everywhere** (`Clock` bean — expiry, TTL, and business-day logic tested deterministically; `LocalDateTime.now()` in production code is a review-blocked pattern because it's untestable); **time-based tests via MutableClock** (advance the clock in-test — the lockout-expiry test doesn't sleep); and **the coverage honesty rule**: JacCo line coverage is a hygiene floor (85% service-layer), but the reviewed metric is BRANCH coverage on decision-heavy classes + mutation-testing spot checks (PIT on the credit/billing classes — a suite that survives 40% mutations is decoration; our mutation score on billing is 78% and the report gates merges there). What I deliberately do NOT unit test: getters, configuration wiring (integration tests own that), and repositories (Testcontainers integration tests own those — mocking JPA is testing your mock).

**KEY TERMS TO MENTION:**
- Behavior-per-test naming; state over interaction assertions (captor for payloads)
- Strict stubs; ArgumentCaptor; no PowerMock (seam-extraction smell)
- Table-driven state-machine tests + exception-mapping parity tests
- Clock injection (MutableClock) — time logic deterministically tested
- Branch coverage + PIT mutation testing on money classes (78%)

**FOLLOW-UP QUESTIONS:**
1. How do you keep unit tests from breaking on every refactor?
2. When is a test testing the MOCK instead of the code?

**FOLLOW-UP ANSWERS:**
1. By asserting the CONTRACT, not the implementation: state changes, returned values, and emitted EVENTS survive refactors; call-sequences and internal private methods don't. The rule in review: if a pure refactor (same behavior, different structure) breaks tests, the tests were over-specified — fix the tests AND treat it as a signal the production code leaked internals. Interaction verification is quarantined to ports with unobservable effects.
2. Tell: the test passes when the PRODUCTION code is broken but the STUB matches the bug (the mock returns what the broken code expects). Structural defense: mocks return REALISTIC domain data from shared fixtures (not on-the-fly values that mirror the assertion), and the mutation testing on critical classes catches "tests pass with broken logic" systematically — mutation testing is the antivirus for mock-testing's blind spot.

**RED FLAGS TO AVOID:**
- verify(repo, times(1)) everywhere (brittle interaction theater)
- LocalDateTime.now() in tested code paths
- Coverage % as the goal with no mutation/branch honesty

---

### Q13-3: How did you implement integration tests (Spring Boot Test + Testcontainers)
**DIFFICULTY:** Medium
**CATEGORY TAG:** Testing

**ANSWER:**
Integration tests prove the WIRING and the REAL-DEPENDENCY contracts the unit layer can't: HTTP layer (routing, filters, serialization, error mapping), persistence (actual SQL, migrations, constraints), cache behavior (actual Redis semantics — TTLs, Lua atomicity), and config binding. The stack: `@SpringBootTest(webEnvironment = RANDOM_PORT)` + **Testcontainers** (Postgres 15, Redis 7 — real engines, not H2/embedded fakes: H2's SQL dialect divergence masked two real bugs historically — a JSONB operator and a FOR UPDATE SKIP LOCKED behavior — after which embedded databases were banned for anything testing SQL), with containers as SINGLETONS per JVM (`static` containers + reuse) keeping the suite under 4 minutes for 200+ integration tests; Flyway runs the REAL migration chain (every integration boot validates the schema path — the CI catches migration breakage at PR time, Q5-11's fresh+upgrade runs). **Repository tests**: `@DataJpaTest` slices with Testcontainers + the query-budget extension (an interceptor counting statements per test — the N+1 regression guard asserting list endpoints stay ≤ their budget); **API tests**: MockMvc or TestRestTemplate with the security context setup (`@WithMockUser(roles)` / real JWT flows for the auth suite) covering the security-property tests (401/403/404-cross-tenant — Q4-7's suite).

**Data management**: per-test transactions with rollback (`@Transactional` on tests) for speed, EXCEPT where transactions hide behavior (async listeners, AFTER_COMMIT — those tests use explicit commit + cleanup), and the fixture philosophy: builder-pattern test objects (`aLead().withOrg(o).withStatus(HOT).build()` — defaults centralized, variance explicit) replacing SQL dumps; no test depends on test ORDER (ForkJoin random order in CI catches order-dependence). **The external-integration boundary**: WireMock stubs providers (Q13-4) INSIDE integration tests for failure-injection (a 500 from Stripe mid-checkout — the full resilience stack exercised), with contract-verification tests separately pinning our REQUESTS to provider contracts (Q13-7). The pass/fail discipline: integration failures block merge like unit failures (no flake-tolerance — the retry-once-then-fail CI policy with auto-filed flake tickets at > 2%), and the suite runs the PR pipeline in sharded parallel (Testcontainers per shard) keeping the 9-minute gate honest.

**KEY TERMS TO MENTION:**
- Testcontainers real engines; H2/embedded banned (dialect lies)
- Singleton containers + Flyway real-chain validation per boot
- Query-budget extension (N+1 regression guard) + security-property suite
- Builder fixtures + order-independence + @Transactional-with-caveats (AFTER_COMMIT)
- Flake policy: retry-once, auto-ticket at 2%

**FOLLOW-UP QUESTIONS:**
1. Why singleton containers — what breaks with per-test containers?
2. When do you use explicit commit in an integration test?

**FOLLOW-UP ANSWERS:**
1. Per-test = ~10s container spin-up × 200 tests = 30+ minutes of pure Docker wait (the CI budget killer); singletons with per-test data cleanup give engine-realism at unit-test-ish cost. What breaks: test isolation depends on CLEANUP discipline (rollback + explicit deletes for commit-tests) — a leaked fixture pollutes downstream tests, which is why the order-random run exists: it surfaces leakage. Ryuk/container reuse policies are pinned (the dangling-container CI cleanup job exists — Testcontainers hygiene is real ops).
2. When the BEHAVIOR is the commit: AFTER_COMMIT listeners (Q3-11) never fire in a rolled-back test — the transaction is the mechanism under test. Pattern: commit the arrange+act, assert the listener's effects, then cleanup via the builder-fixture delete helper; a comment marks WHY the test commits (the next engineer shouldn't "fix" it back to rollback and silently untest the feature).

**RED FLAGS TO AVOID:**
- H2 "integration tests" (dialect theater)
- Test-order dependence / fixture leakage
- Mocking the repository in integration tests (unit-test cosplay)

---

### Q13-4: How did you test external API integrations (WireMock)
**DIFFICULTY:** Medium
**CATEGORY TAG:** Testing

**ANSWER:**
External providers are tested at two boundaries: OUR REQUESTS against THEIR CONTRACT (consumer tests) and OUR HANDLING of their responses (WireMock scenarios). **WireMock layer**: each provider (Stripe, Twilio, Google, LLM gateways) gets a stub server in the integration context with scenario-based stubs: success paths (200 with REAL response captures — recorded from sandbox, structure-verified), the FULL failure ladder (429 with Retry-After → assert backoff+retry count; 401 → assert NO retry + NEEDS_REAUTH marking; 500×3 → assert breaker OPEN + fallback engaged; timeout — WireMock's fixed-delay — assert the false-negative path + idempotency key present; malformed body → assert parse-failure path), and STATEFUL scenarios (`/__admin/scenarios` — the "first call fails, retry succeeds" sequence the retry tests need). Assertions go past status codes: `verify(postRequestedFor(urlEqualTo("/v1/charges")).withRequestBody(matchingJsonPath("$.idempotency_key")))` — the idempotency-key presence on side-effecting calls is a TESTED CONTRACT, not a convention (Q9-10's lesson, enforced in CI).

**The response-capture pipeline** keeps stubs honest: sandbox traffic responses are captured, schema-validated against our DTO expectations, and versioned in the repo — a stub lying about provider shape tests our fantasy, not reality (the capture-and-verify step is the difference between mock theater and contract approximation); provider contract drift is caught by the weekly sandbox contract-refresh job (re-capture, diff — a changed Stripe response shape fails the refresh check and flags the adapter for review). **Resilience assertions** mirror Q3-12's stack: each adapter test asserts the Resilience4j config AS BEHAVIOR (attempt counts observed at WireMock, backoff timing bounded, breaker state transitions read from the actuator endpoint), and the fallback path asserts the PRODUCT semantics (template-generated email marked AI_FALLBACK, credits not deducted for fallback — Q3-12's rules as tests). The LLM gateway gets an extra class: response-content fuzzing (well-formed-but-wrong-content responses — the validator layer's rejections tested: JSON-parse failures, schema violations, injected-prompt-marker content) because LLM providers fail DIFFERENTLY than CRUD APIs, and the enrichment pipeline's degradation is the behavior under test.

**KEY TERMS TO MENTION:**
- WireMock scenario statefulness (fail-then-succeed ladders) + fixed-delay timeouts
- Real response captures, schema-verified, versioned (no fantasy stubs)
- Weekly sandbox contract-refresh job (drift detection)
- Idempotency-key presence as a tested request contract
- Resilience behavior assertions (attempt counts, breaker states, fallback semantics)

**FOLLOW-UP QUESTIONS:**
1. WireMock says pass, production says the provider changed — what caught it?
2. How do you test the webhook RECEIVING side as thoroughly?

**FOLLOW-UP ANSWERS:**
1. The weekly contract-refresh (sandbox re-capture + diff) is the drift alarm — it fired once on a Stripe error-body shape change that would have broken our 4xx translation (Q8-4's table); the adapter fix shipped before any customer hit it. Production canaries complete the net: synthetic calls per provider every 5 min (the integration-health dashboard, Q3-18) — drift between refresh cycles surfaces there in minutes, not in customer tickets.
2. The mirror image: WE send Stripe-signed webhooks to OURSELF — a test harness computes valid signatures (Stripe's algorithm with a test secret) and posts the FULL webhook ladder: valid, tampered payload (signature mismatch → 400), stale timestamp (tolerance window → 400), replayed event (dedupe → no-op), unknown type (persist + UNHANDLED), and the crash-after-ack simulation (handler throws → freshness alarm + reconciliation sweep picks it up — Q9-8's war story as a permanent test). The webhook pipeline is money-adjacent; it gets the same ladder discipline as the outbound adapters.

**RED FLAGS TO AVOID:**
- Hand-invented stub responses (fantasy contracts)
- Status-code-only assertions (no request-contract or resilience checks)
- No drift-detection mechanism (stubs age into lies)

---

### Q13-5: How did you achieve code coverage targets (and what do you actually think of them)
**DIFFICULTY:** Easy
**CATEGORY TAG:** Testing

**ANSWER:**
The honest answer first: coverage is a HYGIENE metric, not a quality metric — 85% line coverage with weak assertions is worse than 70% with meaningful ones, because it launders untested code with green badges. Our actual targets and mechanics: **service layer line coverage ≥ 85%** (JacCo in the build, CI-gated per-module — a coverage DROP in a PR fails with the diff report attached, making "what did you not test" a review question), **branch coverage ≥ 70% on decision-heavy classes** (the money/auth/state-machine packages — line coverage lies in branchy code: one test can hit both sides of an || and claim 100% of the line), **mutation score ≥ 70% on the critical packages** (PIT on billing/auth/credit classes — the metric that measures assertion STRENGTH; survived-mutants are listed in the PR report as "behavior changes your tests didn't notice"), and **exemptions are explicit**: generated code (MapStruct), config classes, DTOs — listed in the JacCo excludes with a comment each; unlisted exclusions are review-blocked (the coverage-gaming pattern — excluding the hard stuff — is the actual failure mode of coverage programs).

What the numbers bought us, concretely: the mutation testing found a real gap in the credit-refund path (tests covered "refund happens" but a mutant flipping the sign of the refund AMOUNT survived — the assertion checked existence, not value; the fix tightened assertions across the ledger tests). And what they DIDN'T buy: the 15% uncovered in services is the integration-glue territory (happy-path orchestration with thin logic) — where integration tests already cover the behavior, and double-covering adds maintenance without risk reduction; the coverage report is reviewed WITH that lens (the "covered-elsewhere" annotation convention in the PR description). The trend rule: coverage ratchets UP per module (the floor is max(floor, current-2%) — a module at 91% can't slide to 80% unnoticed), because coverage programs die by erosion, not by decree.

**KEY TERMS TO MENTION:**
- Hygiene-vs-quality framing; per-layer targets (85 line / 70 branch / 70 mutation on criticals)
- PR-level coverage-diff gating + explicit annotated exclusions
- PIT mutation testing as the assertion-strength metric (the refund-sign war story)
- Covered-elsewhere convention (honest double-coverage avoidance)
- Ratchet rule (max(floor, current-2%)) against erosion

**FOLLOW-UP QUESTIONS:**
1. A teammate writes 200 trivial tests to hit the gate — what's your response?
2. Where does coverage mislead most?

**FOLLOW-UP ANSWERS:**
1. The gate is per-module coverage-diff, so trivial tests DO raise the number — the counter-pressure is review (assertion-quality checklist: does the test fail if the behavior breaks? — the mutation mindset as a human check) and the mutation score on critical packages (trivial tests die under PIT, exposing the gap). Structurally: the coverage gate exists to force the CONVERSATION (what's untested and why), not to certify quality — I'd rather have the 200-test PR rejected in review with coaching than have no gate and silent gaps.
2. On branchy code with side effects: 100% line coverage of a state machine where tests never exercise the illegal-transition path (the @ParameterizedTest table exists precisely because lines are shared, branches differ); and on exception paths generally — coverage counts the try block as covered when the exception never fired. The branch + mutation combo exists to cover exactly these blind spots; line coverage alone is a vanity metric in any non-trivial codebase.

**RED FLAGS TO AVOID:**
- Coverage % as the headline ("we have 92%!" with no mutation/branch story)
- Silent exclusions gaming the gate
- No ratchet (coverage decays the moment attention moves)

---

### Q13-6: How did you test security configurations
**DIFFICULTY:** Medium
**CATEGORY TAG:** Testing / Security

**ANSWER:**
Security tests assert the PROPERTY (this access is denied/allowed), not the config text — the config can be wrong while looking right, so the tests treat the running filter chain as the unit under test. **The property suite** (every endpoint × auth-state matrix, generated): unauthenticated → 401 (except the public allow-list); wrong-role → 403; cross-tenant resource → 404 (the enumeration rule, Q4-6); expired JWT → 401; revoked-session refresh → 401 with REFRESH_REUSED semantics (Q4-9); tampered signature → 401 — generated as a table over the OpenAPI path list so NEW endpoints are automatically in scope (an endpoint without security expectations fails the generation check — coverage by construction, the security analog of Q13-5's ratchet). **The public-surface pin**: the permit-all list is asserted EXACTLY (Q4-7's chain-smoke test) — a regex typo adding `/api/admin/**` to public fails the build; this test caught the trailing-slash case for real.

**Injection/XSS classes**: parameterized suites running payloads (SQLi strings through every repository path — asserting JPA parameterization at the integration level; XSS payloads through every stored-text field — asserting encode-on-render client-side + content-type/Disposition server-side per Q3-15; the upload allow-list tested with magic-byte-forgeries: a .jpg-named HTML file MUST be rejected or sandboxed). **Crypto/auth mechanics**: BCrypt round-trip + known-vector tests; JWT forgery attempts (alg-none, alg-confusion HS/RS swap, kid-injection — the JOSE failure modes as tests against OUR verifier's config); the OTP/lockout ladder (5 failures → locked, generic-error assertions — no existence oracle, Q4-11) with the Redis TTL behavior via the MutableClock. **Dependency/config scanning**: OWASP ZAP baseline scan in CI weekly against staging (passive alerts gate on severity), trivy for dependency CVEs (Q11-2), and the secret-scanning trio (gitleaks). The meta-rule: security tests FAIL THE BUILD like any test — security findings in a backlog rot; findings in CI gate. The one gap I name honestly: business-logic authorization (the policy objects) is tested by unit tests per policy (Q13-2's patterns) — the MATRIX-level "no combination grants unintended access" is only as good as the enumerated combinations; the generated matrix from the permission table (Q4-6) is the mechanism, and its completeness is a design property, not a proof.

**KEY TERMS TO MENTION:**
- Property-based suite generated from the OpenAPI path list (new endpoints auto-covered)
- Public-surface pin (chain smoke) — caught a real trailing-slash hole
- Injection suites: SQLi/XSS/magic-byte forgery as parameterized tables
- JWT failure-mode tests: alg-none, alg-confusion, kid-injection
- ZAP baseline + trivy + gitleaks in CI; findings gate, never backlog

**FOLLOW-UP QUESTIONS:**
1. How do you test RATE LIMITING without slowing the suite?
2. A security test is flaky (Redis TTL timing) — how do you fix it honestly?

**FOLLOW-UP ANSWERS:**
1. The limiter's ATOMICITY is unit-tested against an embedded Redis (or testcontainer with short windows — the Lua scripts are the code under test); the HTTP-layer tests assert the CONTRACT (429 + Retry-After + headers) using an overridable limiter facade (test profile injects a deterministic limiter) — testing the wiring without burning real time windows. The full ladder (10 requests → 429) runs once in a dedicated tagged suite, not per-PR.
2. Flaky security tests get FIXED, not retried past — the honest fix here: inject the Clock (Q13-2's MutableClock) into the lockout logic so expiry is deterministic (no sleeping to TTL), and the Redis testcontainer gets a fixed time source where the code supports it (or the test manipulates the TTL key directly via the test Redis client — asserting the SEMANTIC "locked until T" not the wall-clock behavior). A retried-past security test is a hole wearing a green check — the flake policy (Q13-3) treats security-flakes as P1 test bugs.

**RED FLAGS TO AVOID:**
- Testing config FILES instead of running behavior
- Security findings in backlogs (must gate CI)
- No mechanism for new-endpoint coverage (manual security test rot)

---

### Q13-7: How did you implement contract testing
**DIFFICULTY:** Hard
**CATEGORY TAG:** Testing / Architecture

**ANSWER:**
Contract tests exist wherever two independently-deployable things meet: our API ↔ frontend, our adapters ↔ external providers, our services ↔ each other (post-extraction). **Consumer-driven contracts (API ↔ frontend)**: each frontend app maintains a contract pack (Pact-style) — expected interactions for its user journeys (login, lead-list paging, deal-advance); the pack runs against the PROVIDER in CI (the provider replays each consumer's expectations against the running service — a breaking change fails the build NAMING the consumer and journey); verification results publish to a broker-ish registry (a versioned store) — the "can-I-deploy" check gates frontend deploys on their pack's latest verification against the release candidate. The design choice worth defending: contracts cover JOURNEYS not endpoints (an endpoint's contract with nobody is dead weight; a journey's contract is what actually breaks users) — 23 journeys cover ~140 endpoint-interactions with far less maintenance than endpoint-exhaustive contracts.

**Provider-side contracts (us ↔ Stripe/Gmail/Twilio)**: the adapter tests pin OUR request shape to THEIR documented contract (WireMock stubs generated from their OpenAPI/spec artifacts where available, hand-pinned where not) + the weekly sandbox re-capture diff (Q13-4) as the live-drift net — consumer-side contract testing against providers we don't control is fundamentally drift detection, and the mechanism reflects that honestly. **Internal service contracts (post-extraction)**: the event schemas ARE contracts — versioned JSON schemas per event type with a compatibility suite (new schema versions must be backward-compatible per the registered policy — additive-only; a breaking event change requires a version bump + dual-publish window). The failure the mechanism caught that unit tests couldn't: a frontend expected `stage` as an enum string; a backend refactor changed it to an int silently — JSON serialization kept 200s green, unit tests tested the service in isolation, and the consumer pack failed in CI within minutes with the diff visible. That's the entire value proposition: integration reality, caught at PR time, attributed to the exact consumer.

**KEY TERMS TO MENTION:**
- Consumer-driven packs per frontend app; CI replay naming consumer+journey
- can-I-deploy gating on verification registry
- Journey-level (not endpoint-level) contract scope — the maintenance trade
- Provider contracts = drift detection (spec-generated stubs + sandbox re-capture)
- Event schemas as versioned contracts with compatibility suites

**FOLLOW-UP QUESTIONS:**
1. Who owns a failing contract — the provider or consumer team?
2. Contracts for the webhooks we SEND (push side)?

**FOLLOW-UP ANSWERS:**
1. The breaking side owns the fix: CI names the consumer and journey, and the rule (written in the API guidelines) is the provider either restores compatibility or executes the versioning protocol (add + deprecate + sunset — Q8-10) WITH the consumer's migration note. Internal friction is low because the consumer is one PR away (the coordinated-refactor lane, Q8-10's follow-up); the mechanism exists precisely for the day the two sides DON'T share a repo or a deploy train.
2. Symmetric mechanism: our webhook payload schemas are versioned + published (Q8-6's webhook spec section); a "self-consumer" test suite subscribes to a staging webhook endpoint and validates EVERY emitted event against the published schema (schema-drift gate), plus replay-verification for consumers (the dashboard's test-fire sends a canonical example set). Push-side contracts are stricter (no 404 feedback — Q8-2's note), so the schema gate carries more weight than on the request side.

**RED FLAGS TO AVOID:**
- Endpoint-exhaustive contracts (maintenance death) or no contracts at all
- Provider-side stubs with no drift mechanism (fantasy APIs)
- Event schema changes without compatibility gates

---

### Q13-8: How did you handle test data management
**DIFFICULTY:** Medium
**CATEGORY TAG:** Testing

**ANSWER:**
Test data strategy by LAYER, because each layer's needs differ. **Unit tests**: in-memory builders (`aLead().withOrg(...).withStatus(HOT).build()` — the builder catalog centralizes valid-domain defaults so a schema change breaks ONE file, not 400 tests; builders construct VALID objects by default — the "defaults are always-insertable" invariant, tested itself) with shared factory modules per context. **Integration tests**: builders + per-test transactional rollback (Q13-3), with cleanup-only paths for commit-tests; the fixture SEED set (reference data: plans, credit costs, pipeline stages) ships as a Flyway TEST-seed migration — idempotent, versioned with the schema, so integration boots are self-contained (no external seed order dependence). **E2E/staging**: the seeder service (`make seed`) builds realistic estates — 3 orgs × users × 200 leads with DISTRIBUTED shapes (the skew matters: a whale org for the perf tests, Q12-5) — deterministic via seeded RNG (the same seed → the same estate; flaky data is a test bug class we eliminated by construction) and tagged (e2e-owned rows carry a marker column for teardown).

**Production-derived data** for the performance/QA staging: the SAFE path — a sanitized snapshot transform (a job that clones prod schema + PII-scrubs: names → faker-consistent fakes PRESERVING distribution shape, emails → deterministic fakes, tokens/keys nulled, financial figures jittered ±10% keeping statistics) — because prod-shaped DATA finds prod-shaped bugs (the Q12-5 whale-org lesson) while PII never crosses environments (the transform's scrub coverage is itself tested: a canary PII marker planted in prod-shaped fixtures MUST be absent post-transform — the scrubber tests the scrubber). Access discipline: staging is NOT a free-for-all PII zone even post-scrub (the scrub is for leak safety, access is still role-gated); and the GDPR angle: prod data never leaves the prod region unencrypted, transforms run IN-region, outputs encrypted at rest (Q6-9's backup-tier rules apply). The maintenance reality I own: builders drift from schema (a new NOT NULL column breaks builders — that's GOOD, compile/test-time discovery, the drift alarm working as intended), and the seed migrations get the same review as schema migrations (test data IS data).

**KEY TERMS TO MENTION:**
- Builder catalog with valid-by-default invariants (one-file schema-change blast radius)
- Test-seed Flyway migrations (self-contained boots) + deterministic seeded-RNG estates
- Prod-shaped sanitized snapshots (faker-preserving distributions) + the scrubber-tests-itself canary
- E2E tagging for teardown + order-independence
- In-region transform + encrypted outputs (GDPR discipline for test data)

**FOLLOW-UP QUESTIONS:**
1. Why faker-consistent fakes over pure random garbage?
2. A staging incident leaks "scrubbed" data that wasn't — how did your controls respond?

**FOLLOW-UP ANSWERS:**
1. Garbage data hides data-SHAPE bugs: name lengths, email formats, date distributions, and the tenant skew all drive real behavior (indexes, caches, UI rendering, plan-flip plans — Q12-5 again). Fakers preserve the SHAPE (a 40-char company name, a 2-of-1000 conversion funnel) while removing the IDENTITY — the tests see production physics without production persons. Random garbage tests CRUD; shaped fakes test the SYSTEM.
2. The controls would fire in sequence: the canary-marker check is a BLOCKING CI/staging-gate step (the "scrubbed" snapshot cannot be deployed if the canary survives — so the leak means the gate was bypassed or the transform changed post-gate), the access audit (who pulled the snapshot, from where — the artifact store logs), rotate/kill the artifact, and the postmortem lands on the PROCESS gap (the bypass path) with the transform's coverage tests extended to the miss. The design assumption is that scrubbing WILL eventually fail once — controls assume failure and catch it at the gate, not in the wild.

**RED FLAGS TO AVOID:**
- 400 test files with hand-built objects (schema-change explosions)
- Prod data copied raw to staging "just for the demo"
- Random-data e2e suites (flaky by construction)
