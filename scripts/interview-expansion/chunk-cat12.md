### Q12-2: How did you optimize the lead discovery pipeline
**DIFFICULTY:** Hard
**CATEGORY TAG:** Performance / Spring Batch

**ANSWER:**
The pipeline (discover → scrape → enrich → score → persist) went from 22 min/1k leads to 6.5 min/1k leads across four optimization waves, each measured. **Wave 1 — parallelism done right**: the scrape step was single-threaded I/O-bound; Spring Batch's `taskExecutor` on the step + `throttleLimit` gave 8-way concurrency, BUT the naive version hammered targets (429 storms) — the real design is per-target politeness: domain-keyed rate limiter (Redis token bucket per domain — 1 req/2s/domain) + a proxy pool rotation (residential proxies on 429) — parallelism WITH manners outperformed raw threads because retries were the actual bottleneck (28% of calls were retries before; 3% after). **Wave 2 — batch-write discipline**: JPA-per-entity inserts were 500/s ceiling; switched to the Q5-16 stack (jdbc batch_size 50, SEQUENCE generation, clear() per chunk) → 4,200/s persist rate; the scorer consumed pre-computed features via DTO projection instead of loading aggregates (the classic "load 9 columns to read 2"). **Wave 3 — LLM-call economics**: enrichment's Gemini calls were 60% of wall time; added (a) response caching (business identity hash → enrichment, 30-day TTL — 35% of leads re-query known businesses), (b) batching to the batch-API endpoint (half cost, same latency class), and (c) the fallback chain so non-critical enrichments degrade to heuristic scoring instead of blocking the pipeline. **Wave 4 — back-pressure and fairness**: a shared worker pool meant a big run starved interactive discovery (users waiting on their 50-lead search behind a 50k-lead batch) — work classes were split (interactive queue preempts batch, bulkhead per class, Q3-9) with fairness metrics proving interactive p95 stayed < 8s during batch runs.

Measurement wrapped every wave: per-step Micrometer timers (discover/scrape/enrich/score/persist as separate gauges — "the pipeline is slow" is always ONE step; the step-level view finds it in seconds), items/sec + retry-rate + provider-cost per run in the batch execution metadata, and a regression guard (nightly synthetic run against a fixture set — throughput drops > 15% page). The meta-lesson I share: three of the four waves were NOT code speed — they were politeness (rate limits), economics (caching/batching), and fairness (back-pressure); production performance is systems engineering wearing a profiler's clothes.

**KEY TERMS TO MENTION:**
- Per-domain rate limiting + proxy rotation (parallelism with manners; retries were the bottleneck)
- Jdbc batch_size + SEQUENCE + clear() (4,200/s persist) + DTO-projection scoring
- LLM economics: identity-hash caching (35% hits) + batch API + heuristic fallback
- Work-class bulkheads (interactive vs batch fairness — interactive p95 < 8s)
- Per-step metrics + nightly synthetic regression runs

**FOLLOW-UP QUESTIONS:**
1. Why did the naive thread-pool parallelism make things WORSE?
2. The pipeline is still the product's cost center — where does cost optimization go next?

**FOLLOW-UP ANSWERS:**
1. 8 threads × no per-domain pacing = 429/403 storms; each retry consumed a thread-slot for its backoff, the pool saturated on RETRIES rather than first-attempts, throughput halved, and two scraping targets banned our egress IPs for an hour. The fix inverted the model: pacing is per-RESOURCE (domain), parallelism per-WORKER — threads multiply against the pacers, not against the targets. It's the difference between concurrency and vandalism.
2. By marginal-cost ranking: enrichment LLM calls (~62% of run cost) → cache hit-rate improvements (the identity-hash keying can improve to ~50% with better normalization), then model right-sizing (score-tier models per lead class — small model for obvious-rejects), then batch-API share (currently 40%, can go 80%). Scraping bandwidth (~25%) → cache politeness and source-prioritization. Every line item has a dashboard, so this conversation is a query, not a debate — cost optimization is an analytics product at this point.

**RED FLAGS TO AVOID:**
- Threads-first thinking without rate-limit/retry analysis
- Unmeasured waves ("it felt faster")
- No fairness story (batch starving interactive users is a product bug)

---

### Q12-3: How did you handle high traffic scenarios (launch spike, viral moment)
**DIFFICULTY:** Hard
**CATEGORY TAG:** Performance / Scaling

**ANSWER:**
Two preparation layers and one reaction playbook. **Preparation 1 — headroom by load-test evidence**: k6 scenarios shape-tested monthly (steady 3× current peak, burst 10× for 5 min) on a staging clone of prod sizing — the tests found our cliffs BEFORE traffic did: the connection-pool math (Q6-5), the Redis ops ceiling (15k/s vs burst projection 40k — fixed by pipeline batching of rate-limit checks), and a Tomcat thread default (200) that queue-collapsed at 6k concurrent — each cliff has a fix recorded with the test that found it; capacity is therefore a NUMBER with evidence, not a hope. **Preparation 2 — graceful degradation plan**: the feature-flag load-shedding ladder, pre-agreed with product (Q7-10): analytics non-essential endpoints → AI generation queued instead of inline → export/batch jobs paused → read-only mode for the least-critical tier; each rung is a flag flip with an owner named in the runbook. **Reaction playbook** (the spike is happening): autoscaling absorbs the first minutes (Fargate target-tracking on request count + CPU, scale-out in ~90s — the pre-warmed image cache and pool warm-up make cold instances ready in < 30s, Q10-7); the traffic dashboard distinguishes LEGITIMATE surge (conversion funnel healthy — scale and enjoy) vs ABUSE (single-source flood — WAF rate rules tighten, specific shreds) vs DEPENDENT-DEGRADATION (downstream slowness — the breaker dashboard shows which), because the three need opposite responses and misreading abuse as demand (or vice versa) is the classic incident amplifier.

The load tests also validated the recovery path (the part most teams skip): release the flood → autoscale-IN has cooldowns (scale-in stabilization 10 min — without it, oscillation: scale-out/scale-in thrash during bursty traffic, each cycle a latency blip); post-spike cost review (Fargate burst costs real money — the spike playbook includes "who approves sustained > 5× spend" — cost is an incident dimension). The launch that tested it: a ProductHunt moment drove 40× signup traffic for 6 hours — the system shed the marketing-page load to CDN (static — already off-app), signups queued gracefully behind a "you're in line" UX (the queue-it pattern via the WAF), and the funnel metrics stayed green; the postmortem was 90% celebration, which is the point of rehearsing.

**KEY TERMS TO MENTION:**
- Monthly k6 shape-tests finding cliffs pre-traffic (pool/Redis/thread numbers as evidence)
- Pre-agreed degradation ladder (flags with owners; analytics → queue AI → pause batch → read-only)
- Surge triage: legitimate vs abuse vs dependent-degradation (opposite responses)
- Scale-in stabilization (oscillation prevention) + cost-as-incident-dimension
- Launch case: 40× spike, CDN + queue-UX + green funnel

**FOLLOW-UP QUESTIONS:**
1. Why target-tracking autoscaling over a fixed over-provisioned fleet?
2. The queue-UX for signups — is that honest engineering or a hack?

**FOLLOW-UP ANSWERS:**
1. The fleet math: 24/7 over-provisioning for a 40×-burst-1-day-a-quarter workload wastes ~85% of compute spend; target-tracking costs pennies of complexity for elasticity (with the stabilization windows handling burstiness). Fixed oversized fleets earn their keep when: scale-out latency is intolerable (sub-second markets), or cold-start cost exceeds idle cost — neither true for us. The hybrid (small always-on core + elastic burst) is exactly what target-tracking IS; I can show the cost curve if asked.
2. It's both, deliberately: a queue with honest position + ETA is the USER-RESPECTFUL way to shed load (they wait informed instead of staring at 503s), and it's real engineering — token-bucket admission at the edge, sticky queue tokens, prioritization for existing customers. The hack version is a silent 503 wall. The pattern (virtual waiting room) is what Ticketmaster-scale systems do; ours is the small-but-honest cousin, and the product team owned the UX so engineering owned the mechanism.

**RED FLAGS TO AVOID:**
- "Kubernetes scales us" with no load-test evidence (cliffs hide everywhere)
- No abuse-vs-demand triage (autoscaling an attack is paying for your DDoS)
- No degradation ladder (everything fails together at the cliff)

---

### Q12-4: What is your approach to async processing (choosing between @Async, queues, and batch)
**DIFFICULTY:** Medium
**CATEGORY TAG:** Performance / Architecture

**ANSWER:**
The selection rule is about DURABILITY and LATENCY tolerance, stated as a decision tree I actually apply. **@Async (in-JVM executor)**: fire-and-forget where losing the work on crash is acceptable AND latency tolerance is immediate — cache evictions, push-notification pre-warm, log shipping; the price of admission: handlers must be idempotent (deploys re-run nothing, but thread-pool overflow with CallerRunsPolicy can re-order) and the work is SHORT (seconds — it occupies a JVM thread). **Job-table queue (DB-backed, SKIP LOCKED)**: work that MUST survive restarts with per-item status/retry/visibility — outreach sends, reminder dispatch, webhook processing; latency tolerance is seconds-to-minutes; the trade: it's not high-throughput (DB poll ceiling ~ hundreds/sec) but it's OPERABLE (SQL visibility, replay, dead-letter states — the Q2-11 reasoning). **Spring Batch**: high-volume, chunk-oriented, restartable DATA processing — imports, enrichment pipelines, retention sweeps; latency tolerance minutes-hours, throughput thousands/sec, checkpointing built-in. **Kafka/SQS**: the durability + throughput tier we added when volume or fan-out outgrew the table (notification fan-out, analytics events) — the ADR records each addition's trigger (Q2-14's migration story).

The anti-patterns the tree prevents, each with a scar: @Async for durable work (a deploy lost 400 queued notifications once — the incident that CREATED the job-table rule: if losing it hurts, it's not @Async); queue for sub-second-latency needs (the UI waited on a queued enrichment — moved inline with a timeout + async refinement); batch for interactive traffic (batch's commit-interval checkpointing adds seconds of latency granularity nobody wants in a request path); and long work in HTTP requests (Q11-7's deployability constraint — a 5-min synchronous LLM chain is a deploy hazard AND a timeout lottery; it became a job with SSE progress). The async surface is also where THREAD-POOL hygiene lives: named pools per work class (Q3-9), queue bounds + rejection policy chosen per class, and pool metrics (active/queue/rejection) as first-class dashboards — async systems fail by QUEUING before they fail by breaking, so the queues are watched like fuel gauges.

**KEY TERMS TO MENTION:**
- Decision tree: durability requirement × latency tolerance × throughput class
- @Async = tolerable-loss short work; job-table = durable operable; Batch = chunked restartable; Kafka = fan-out/throughput tier
- The lost-notifications incident that created the durability rule
- Queues fail by backpressure before code fails — pool/queue metrics as fuel gauges
- Long work never lives in HTTP requests (deployability + timeout lottery)

**FOLLOW-UP QUESTIONS:**
1. How do you decide a queue's retry count and dead-letter policy?
2. When does @Async's CallerRunsPolicy become the wrong choice?

**FOLLOW-UP ANSWERS:**
1. From the WORK's business semantics, not the queue's defaults: each job type declares max attempts + backoff + expiry (a reminder older than its meeting is worthless — TTL; a payment webhook retries for 24h — money). Dead-letter means: surfaced in the admin UI with the failure reason + one-click replay + a metric that pages when the DLQ grows (a growing DLQ is a bug detector wearing a queue costume). Defaults exist per class; the per-job declaration is the review checklist item.
2. When the caller is latency-sensitive (user-facing request): CallerRuns turns a dropped notification into a slow CHECKOUT — the wrong trade. Fire-and-forget classes use Abort + metric (drop and alarm) because losing a cache-warm beat a stalling purchase; durable classes don't run on these pools at all. The policy encodes "which failure can the user tolerate" — a product question wearing a concurrency knob.

**RED FLAGS TO AVOID:**
- One pool/queue for everything (no class separation)
- @Async for anything whose loss hurts
- No queue-depth visibility (discovering backpressure via user complaints)

---

### Q12-5: Your best database query optimization war story — walk me through it end to end
**DIFFICULTY:** Hard
**CATEGORY TAG:** Performance / PostgreSQL

**ANSWER:**
The leads-list p95 regressed from 180ms to 1.9s over three weeks of growth — no deploy correlated, which is what made it interesting. **Detection**: the SLO burn alert (Q11-8) fired; the trace layer (Q8-9) resolved it to ONE statement — the org-scoped leads query with filters. **Reproduction**: staging at equal row counts was FAST (the trap) — production snapshot restored locally reproduced it; `EXPLAIN (ANALYZE, BUFFERS)` showed the plan flipping: the planner chose a `(org_id, created_at)` index for most orgs but SEQ-SCANNED for the largest org (their 400k rows exceeded the random-page-cost tolerance of an index scan given cached-fraction estimates) — parameter-dependent plan flip, the multi-tenant disease (Q6-10's foreshadowing). **Fix options ranked**: (a) force_custom_plan — blunt, punishes every org with parse cost; (b) more RAM — delays the cliff, costs money, doesn't fix shape; (c) THE real fix: the query's filter-set had grown (status IN + owner + search prefix) but the index hadn't — a **partial composite index** `ON lead (org_id, status, created_at DESC) WHERE deleted_at IS NULL` covering the hot path (supporting index-only scans via INCLUDE columns for the SELECT list) turned the whale-org plan into an index-range scan at ANY row count — p95 for the whale org: 1.9s → 95ms; fleet p95 back to 170ms. **Verification**: before/after per-org latency percentiles (not fleet averages — averages HID the whale), `pg_stat_user_indexes` idx_scan delta confirming the new index earns its write cost, `pg_stat_statements` total-time drop, and the regression test added (the plan-flip scenario in the query-budget test suite).

The lessons I extract for interviewers: **averages hide tenants** (per-org percentiles are the multi-tenant monitoring table stakes — the fleet p95 was fine while our biggest customer suffered); **plan instability is a first-class bug** (not "weird Postgres" — it's data-shape evolution meeting a static index set; the weekly pg_stat_statements review catches drift before customers, Q6-10); **index design follows QUERY evolution** (three filters accreted over months; nobody revisited the index — the schema-health cron now flags queries whose filters lack a supporting index shape); and **write-cost accounting** (the new index costs ~4% on lead writes — measured, accepted, documented in the index's comment). One index, four lessons, one customer saved.

**KEY TERMS TO MENTION:**
- Parameter-dependent plan flip (planner + data skew) as the root cause
- Partial composite index + INCLUDE (covering) as the shape fix
- Per-org percentiles (averages hide the whale) — the monitoring lesson
- Verification quartet: per-org p95, idx_scan delta, pg_stat_statements, regression test
- Write-cost accounting for new indexes (~4%, documented)

**FOLLOW-UP QUESTIONS:**
1. Why was staging fast while production crawled — beyond row counts?
2. When is force_custom_plan actually the right answer?

**FOLLOW-UP ANSWERS:**
1. Row count parity but not DISTRIBUTION parity: staging's tenants were uniform; production had the whale. Plans depend on per-tenant data fractions (the planner's estimates drive the flip), plus production's buffer cache held different hot pages. The lesson institutionalized: performance staging uses PRODUCTION SHAPES (skewed tenants, real filter mixes) — uniform fixtures test nothing about plan stability.
2. When the flip is narrow and the hot plan is provably right: a single statement class with known skew (the whale org's report query), where parse overhead is irrelevant and re-planning costs more than it saves — pinned with a comment explaining the shape assumption and a monitoring tripwire (if the skew changes, the pin is wrong). It's a scalpel, not a setting; `plan_cache_mode` globally is how you trade one disease for another.

**RED FLAGS TO AVOID:**
- Diagnosing from averages (fleet p95 healthy, whale suffering)
- "Postgres chose a bad plan" without the BUFFERS-level story
- Adding the index without write-cost accounting or regression tests

---

### Q12-6: How did you reduce API response times (the p95 program)
**DIFFICULTY:** Medium
**CATEGORY TAG:** Performance

**ANSWER:**
As a program with a budget model, not a collection of hacks. **The budget model**: every endpoint gets a latency budget decomposed by layer (auth+filters 15ms → business logic 60% → DB 30% → serialization 10%) — traces show actuals vs budget per span; over-budget endpoints enter the backlog with the trace attached (the performance backlog is DATA-ranked: total user-milliseconds saved per fix, not the loudest complainer). **The quick wins** (measured, cumulative -38% p95): response compression (Brotli for text — 70% payload cut on list endpoints), the DTO projection pattern replacing entity loading on read paths (Q5-13's category 3), connection-pool pre-warm + Hikari tuning (post-deploy blip elimination), Jackson profile (afterburner-style module + DTO shapes that skip reflection-heavy paths), and the N+1 sweep (batch_fetch_size default + EntityGraph on the top 10 reads). **The structural wins**: caching per the Q7 catalog (detail reads, aggregates — the biggest single contributor, -45% on cached families), cursor pagination on the hot lists (Q8-3 — the 1.9s whale case lives here), and async-ization of anything not needed for the response (notifications, audit-high-volume, email — the request thread does the USE-CASE, nothing else).

**The tails are the program**: p50 was always fine — the program's actual work was tail pathology: GC pauses (G1 tuning + heap right-sizing — the Q12-9 story), cold-cache thundering herds (single-flight, Q7-7), lock contention bursts (the FOR UPDATE audit — Q6-13's pool-starvation case), and retry-storm amplification (jitter + breakers). Each tail fix came from tracing distribution SHAPE, not averages: the "hmm, p99 is 12× p50" questions map to exactly those four mechanisms. Sustained discipline: the p95/p99 per-endpoint trend lines on the team dashboard with deploy annotations (Q11-7's deploy-transparency SLO), a latency-budget review in each retrospective for touched endpoints, and performance acceptance criteria in the definition-of-done for new endpoints (budget assigned at design, verified at ship — performance as a requirement, not a post-launch apology). The number that closes it: two quarters of this program took fleet p95 from 420ms to 165ms and p99 from 2.8s to 480ms — with the breakdown per lever preserved in the ADR.

**KEY TERMS TO MENTION:**
- Endpoint latency budgets decomposed by layer; data-ranked backlog (user-ms saved)
- Quick wins: compression, DTO projections, pool pre-warm, Jackson, N+1 sweep
- Structural: caching catalog + cursor pagination + async-ize everything non-response
- Tail pathology quartet: GC, cache herds, lock bursts, retry storms
- DoD performance criteria + deploy-transparency SLO

**FOLLOW-UP QUESTIONS:**
1. Which quick win under-delivered vs expectation — and why?
2. How do you keep the program from eroding after the hero phase?

**FOLLOW-UP ANSWERS:**
1. Caching under-delivered on the LEADS LIST (the highest-traffic endpoint): hit-rate landed at 22% (filter diversity — the Q7-2 honest no-cache decision) despite being the "obvious" cache candidate; the real win there was the index + cursor work instead. The lesson institutionalized: hit-rate PROJECTION before caching (a week of telemetry on filter-cardinality), not cache-first faith — the backlog ranks by evidence, and this entry taught the whole team that lesson cheaply.
2. The erosion defense is the budget-in-DoD + the trend dashboard: new endpoints arrive with budgets (design-time), regressions surface on the trend line with deploy annotations (no archaeology), and the quarterly "latency budget audit" re-ranks the backlog. Hero phases decay everywhere; what persists is the MECHANISM (budgets, traces, trend gates) — the program's output is the immune system, not the heroics.

**RED FLAGS TO AVOID:**
- Optimization without the budget/trace model (whack-a-mole by complaint)
- p50-only reporting (tails are where users live)
- No DoD criteria — performance erodes silently post-program

---

### Q12-7: What is your approach to load testing
**DIFFICULTY:** Medium
**CATEGORY TAG:** Performance / Testing

**ANSWER:**
Load testing is a monthly discipline with shape fidelity, not a pre-launch ritual. **Scenario design from production telemetry**: k6 scripts derive their request mixes from real traffic distributions (endpoint popularity, payload sizes, auth-user ratios, think-time percentiles) — a test with uniform request mix validates nothing (the shape IS the test); scenarios: steady (3× current peak), burst (10×, 5 min — the autoscaling test), soak (2× for 4 hours — the memory-leak/queue-growth test: heap, pool counts, queue depths trended), and spike-recovery (flood → release — the scale-in oscillation test, Q12-3). **Environment fidelity**: staging at prod SIZING (the same task counts/pool sizes — a 1-replica staging load test lies about locks, pools, and contention), production-shaped DATA (row counts AND tenant skew — Q12-5's lesson institutionalized), and the DB as a restored snapshot (fresh-empty DBs make every query look instant). **What we measure**: not just RPS/latency at the client — the full internal picture via metrics during the run: per-endpoint p95s, pool utilizations, queue depths, GC pauses, DB waits (pg_stat_activity snapshots), cache hit rates — the cliffs live INTERNALLY, and the client-side number is the symptom, not the diagnosis.

**The findings ledger**: every load test outputs a ranked cliff list (what saturated first, at what multiplier) with owners and fixes tracked to the next run — over four runs the fleet went from first-cliff at 4× to clean at 10× (fixes: rate-limit Lua batching, pool resize, a Tomcat thread default, one N+1 in the notification path that only manifests under queue pressure). **The safety rules**: load tests never run against production (the "just a little traffic" temptation — staging clones only, with the ONE exception: a 30-second synthetic canary at 1.2× current prod during a maintenance window, explicitly approved, measuring REAL infra — documented as a controlled exception, not a habit); and test teardown is automated (staging restored to baseline — a leaked load-test dataset corrupts the next test's numbers). CI integration: the burst scenario runs on-demand pre-launch (a release-candidate gate for major features), while the full matrix stays monthly — monthly because infrastructure drifts (a dependency upgrade silently changing pool behavior is exactly what run 7 caught).

**KEY TERMS TO MENTION:**
- Telemetry-derived request mixes (shape IS the test); steady/burst/soak/spike-recovery scenarios
- Prod-sizing + prod-shaped-data staging (uniform fixtures validate nothing)
- Internal-first measurement (pools, queues, GC, DB waits — cliffs live inside)
- Findings ledger with ranked cliffs tracked across runs (4× → 10× journey)
- Never-prod rule + the documented controlled exception

**FOLLOW-UP QUESTIONS:**
1. A load test passes but production still fell over at lower load — how?
2. Soak tests found what — concretely?

**FOLLOW-UP ANSWERS:**
1. The gap is always a dimension the test didn't carry: production had the real tenant skew (one whale org), a dep-delayed batch job compounding load, and cache states aged differently. Each miss became a scenario parameter (skew on, background jobs on, cache-cold start) — the ledger treats "prod broke below test load" as a test-design bug, reviewed like code. Load testing is an approximation discipline; the humility loop is what makes it converge.
2. The classic pair: a slow leak in the notification retry path (off-heap via a native buffer not returned — heap graphs looked fine, container memory climbed; the soak's 4-hour memory trend caught it), and unbounded queue growth in the webhook retry backlog (depth trended linearly under sustained 2× — the DLQ policy's TTL was misconfigured). Both are invisible in 15-minute tests — that's WHY the soak exists; nothing else catches time-as-a-variable.

**RED FLAGS TO AVOID:**
- Uniform-request-mix tests ("we hit it with 10k RPS")
- Client-metrics-only reporting (no internal cliff attribution)
- Load-testing prod casually (or never testing at all)

---

### Q12-8: How did you tune the connection pool (HikariCP) — the full exercise
**DIFFICULTY:** Medium
**CATEGORY TAG:** Performance / PostgreSQL

**ANSWER:**
Covered structurally in Q6-5 — the tuning EXERCISE behind it, since interviewers ask for the process: **Step 1 — the DB's total budget**: `max_connections=200` minus superuser/replication reserved (~10) minus known consumers (migrations, cron workers, analytics) = ~170 app-addressable; three app instances → per-instance ceiling ~55 before the DB itself is the constraint. **Step 2 — the workload's shape**: pg_stat_activity during peak showed avg active SQL = 6-8 statements across the fleet at our request rate (OLTP: fast queries, high rate) — the DB can only execute ~4×cores truly-concurrent queries (16 on 4 vCPU); a 100-connection pool is 90 idle-or-queued connections pretending to be capacity. **Step 3 — the sweep**: load-test at pool sizes 10/15/25/40 per instance with k6 at burst shape — p99 latencies: 15 → 41ms, 25 → 38ms, 40 → 63ms (thrash onset: context-switching + buffer churn), 10 → 58ms (queueing onset); 15-20 was the plateau — we shipped 15 fixed-size with the reasoning documented. **Step 4 — the guardrails**: connectionTimeout 3s (fail-fast; a pool-wait exception under overload is a CLEAN 503 via the breaker, not a 30s thread-park cascade — the timeout is a circuit breaker, not a nuisance), leak detection 60s (found two real leaks: an unclosed Stream in an export, and a @Transactional wrapping an LLM call — Q6-5), maxLifetime 14min (below the LB idle-kill), and metrics (pending/active/usage-time) with the interpretation table (pending>0 sustained = investigate QUERIES first, pool second — the pool is a queue in front of a shared resource).

**The counterintuitive conclusion I defend**: smaller pools win because Postgres executes a bounded number of queries truly-concurrently — every connection beyond the compute-curve adds scheduler thrash and buffer-cache pressure; the pool's job is FAIR QUEUEING, not parallelism (parallelism belongs to the DB's own execution). The one scenario that flips it: long-running analytical queries holding connections (the analytics route to the read replica with its OWN pool sizing — 25 on the replica where 3-minute queries are normal — separation of OLTP and analytics pool budgets, which also protects the OLTP p99 from a report's duration). The annual re-check: the sweep re-runs when workload shape shifts (a new chatty endpoint class, instance resize) — pool sizing is a function of the workload, and workloads drift.

**KEY TERMS TO MENTION:**
- DB budget math (max_connections minus consumers) + workload concurrency reality (4×cores)
- Empirical sweep with p99 results (15 optimal, thrash at 40, queueing at 10)
- connectionTimeout-as-breaker + leak detection + fixed-size pool
- OLTP/analytics pool separation (replica gets its own budget)
- Annual re-check discipline (workload drift)

**FOLLOW-UP QUESTIONS:**
1. Pool exhaustion incident — walk me through the on-call diagnosis.
2. Why fixed-size (min=max) over autosizing pools?

**FOLLOW-UP ANSWERS:**
1. Symptom: 503 spike + connectionTimeout exceptions. Order: Hikari metrics (pending vs active — pending high + active at max = saturation), pg_stat_activity grouped by state (active-in-tx long-runners? idle-in-transaction? — the leak detector's stack traces usually name the holder first), traces for the endpoint burst (a batch job's deploy had doubled its connection hold time — the LLM-call-in-transaction bug class). Fix: the code fix + pool math unchanged. The diagnosis took 12 minutes BECAUSE the metrics panels existed pre-incident — that's the actual tuning outcome.
2. Autosizing pools (min < max) create connection-establishment churn at burst (new connections = TLS + auth + Postgres fork — tens of ms, right when you can least afford it) and unpredictably sized load on the DB (the DB budget math needs KNOWN consumer counts). Fixed pools make the DB-side arithmetic stable and the warm connections always present; the memory cost of idle connections is trivial vs the jitter. The pattern is standard for OLTP microservices; autosizing earns its keep on spiky analytics consumers.

**RED FLAGS TO AVOID:**
- "Set it to 100, more is safer" (the thrash inversion)
- No leak detection / no pending-metrics interpretation table
- One shared pool for OLTP + analytics durations

---

### Q12-9: How did you handle memory optimization in the JVM
**DIFFICULTY:** Hard
**CATEGORY TAG:** Performance / JVM

**ANSWER:**
Memory work started with a MAP, not a knob: heap (young/old), metaspace, code cache, thread stacks, direct/native buffers — the container contract (Q11-2) makes the SUM the constraint, so every optimization is ledger-aware. **The dominant fix — entity/context hygiene**: the batch import path held a million managed entities (the first-level cache as a liability, Q5-9) — clear() per chunk + SEQUENCE id generation turned 1.2GB peaks into 180MB; the second fix in the same class: a dashboard query loading FULL lead aggregates for counts (projection-ized to scalar SELECTs). **Heap sizing by evidence**: GC logs (G1: `-Xlog:gc*,gc+heap=debug`) fed a week of production shape — allocation rate ~800MB/s at peak, old-gen promotion modest, humongous allocations (>50% of region size) flagged: the 8MB JSON response buffer of one export endpoint was allocating humongous regions → streaming the export (chunked write to S3, zero heap accumulation) killed the humongous class entirely; MaxRAMPercentage=75 with G1 gave pause targets met (p99 GC pause 38ms, young-heavy workload). **Native-side leaks**: the soak test (Q12-7) caught off-heap growth — Netty direct buffers from an un-released pooled response in a custom WebClient usage; fixed + `-XX:MaxDirectMemorySize` bounded + a container-memory-vs-heap dashboard gap panel (heap-used vs container-used divergence = native growth — the earliest leak signal, watched continuously).

**The diagnostic toolkit** (what I reach for, in order): container/heap gap panel (native vs heap attribution), GC log analysis (allocation rate, promotion rate, pause distribution, humongous counts), heap dumps on demand (`jcmd GC.heap_dump` — triggered by a leak alarm; MAT dominator tree named the retained entity cache in minutes), `jcmd VM.native_memory` (NMT — the direct-buffer attribution), and pmap/proc for the truly native. **The discipline that sustains it**: memory regression tests in the soak suite (heap + container trends under fixed load must be flat — leaks are TREND bugs, invisible in short tests), allocation profiling in the perf backlog (async-profiler in alloc mode on hot endpoints — the DTO explosion class caught at review), and the ledger review per container resize (Q11-4's cost work and memory work are the same meeting). The number that closes it: peak container memory went 3.4GB → 2.1GB at the same traffic — which ALSO let Q11-4 resize the fleet down 25%, making memory work and cost work the same project.

**KEY TERMS TO MENTION:**
- The container memory map (heap + metaspace + code cache + stacks + direct buffers ≤ limit)
- First-level-cache-as-liability fixes (clear()/projections) + humongous-allocation elimination (streaming exports)
- Evidence-driven sizing: GC logs → MaxRAMPercentage=75, G1 pause targets met (38ms p99)
- Native-leak toolkit: heap/container gap panel, NMT, MAT dominator trees
- Soak-suite memory regression tests (leaks are trend bugs)

**FOLLOW-UP QUESTIONS:**
1. Walk me through reading a heap dump dominator tree for this class of bug.
2. G1 vs ZGC here — why G1?

**FOLLOW-UP ANSWERS:**
1. MAT opens the dump → dominator tree sorts by RETAINED size (what THIS object keeps alive exclusively) — the entity-cache bug showed the persistence context retaining 800MB via a single Session → map of entities; the path-to-GC-roots on the dominator showed the batch loop holding it (no clear() call). The skill is reading RETAINED vs SHALLOW (shallow lies — the cache object is small, its retained tree is the leak) and GC-root paths (which live reference anchors the blob). Two dumps Δ-compare (grow-between-dumps) confirms the leak class vs one-off bloat.
2. G1: our allocation profile is young-heavy, modest live-set, pause target 200ms comfortably met — G1's region model + humongous handling gave the diagnostics (humongous counts) that drove real fixes. ZGC's sub-ms pauses matter for latency-critical tail workloads with BIG heaps (we're 2-3GB, 38ms p99 invisible next to 165ms API p95) and cost throughput + container-memory overhead. The revisit trigger is written: heap > 8GB or pause-pp99 > 100ms — ZGC conversation. Tuning follows the workload's numbers, not the conference-talk default.

**RED FLAGS TO AVOID:**
- Knob-first answers (Xmx/collector) without the memory map
- Heap-only thinking (native/direct buffer blindness — the modern leak class)
- No trend-based regression testing (leaks found by customers)

---

### Q12-10: What JVM tuning did you do for production
**DIFFICULTY:** Hard
**CATEGORY TAG:** Performance / JVM

**ANSWER:**
The full flag set, with the reasoning per flag — because reciting flags without WHY is the interview anti-pattern. **Memory**: `-XX:MaxRAMPercentage=75` (container contract: leaves 25% for metaspace+code+stacks+buffers — Q12-9's map; explicit Xmx rejected: it drifts from container limits on resize), `-XX:InitialRAMPercentage=75` (no resize churn at boot — pools pre-warm against final heap), Metaspace bounded (`-XX:MaxMetaspaceSize=320m` — CGLIB proxies + MapStruct + Groovy-free stack lands ~210m; the bound is OOM-early-vs-thrash-late insurance). **GC**: G1 with `-XX:MaxGCPauseMillis=200` (API p95 priority — 38ms actual p99 pause), `-XX:G1HeapRegionSize=4m` (right-sized after the humongous analysis: 8MB buffers became humongous at default region size; at 4m they're still humongous — the REAL fix was streaming, the region size just sharpens the signal), `-XX:+ParallelRefProcEnabled` (reference processing was 30% of a pause trace — the WebSoftReferences from caches), `-XX:+AlwaysPreTouch` (heap touched at boot — first-request latency spikes eliminated; pairs with the pre-warm philosophy). **GC observability**: `-Xlog:gc*:file=/var/log/gc.log:time,uptime,level,tags:filecount=5,filesize=20m` (the evidence stream for Q12-9's entire methodology). **OOM forensics**: `-XX:+HeapDumpOnOutOfMemoryError -XX:HeapDumpPath=/dumps` + `OnOutOfMemoryError` hook that alerts (a heap dump with a timestamp beats an OOM mystery every time). **Flight recording**: `-XX:StartFlightRecording=maxsize=200m,maxage=12h` settings kept available (JFR on-demand via diagnostic port — the async-profiler complement; always-on JFR at low overhead is defensible and we run it in staging).

**What I explicitly did NOT tune and why** — the senior-flavored closer: no `-XX:SurvivorRatio`/`-XX:TenuringThreshold` micro-knobs (G1 adapts these; hand-tuning without a pause-trace-backed reason is cargo cult that bites on workload shifts); no `-XX:+UseStringDeduplication` (our string profile is short-lived request data — dedup targets long-lived duplicate strings, measured benefit ~0); no explicit `-XX:ParallelGCThreads` math (defaults derive from cores correctly in our container sizing). The tuning process itself: baseline → one hypothesis → one flag → measured delta (GC logs + endpoint p95) → keep/revert — a FLAGS EXPERIMENT, documented in the JVM-tuning ADR with the before/after graphs; the current stack is 6 deliberate flags, each with a graph behind it, and the ADR's "flags we tried and reverted" section is half the document — which is exactly what honest tuning looks like.

**KEY TERMS TO MENTION:**
- Memory flags tied to the container contract (RAMPercentage, Metaspace bound)
- GC: G1 + pause target + ParallelRefProcEnabled + AlwaysPreTouch — each with measured why
- Forensics: HeapDumpOnOOM + GC logs as the evidence stream + JFR
- Explicit NOT-tuned list with reasoning (anti-cargo-cult)
- One-flag-at-a-time experiment discipline + ADR with reverted-flags section

**FOLLOW-UP QUESTIONS:**
1. A flag you shipped had to be reverted — the story?
2. How would your tuning change for a BATCH worker vs the API fleet?

**FOLLOW-UP ANSWERS:**
1. `-XX:G1NewSizePercent` lowering (chasing shorter young pauses): pauses dropped 12%, but promotion rate rose (young collections too frequent to age objects) → old-gen growth → mixed-GC frequency up → p99 WORSE over 2 hours (the tail regressed while the average improved — the classic trap). Reverted; the lesson (optimize pause distribution, not pause duration, without promotion telemetry) is in the ADR with both graphs. The revert cost was one config PR; the discipline made it cheap — that's the point of one-flag-at-a-time.
2. Different objective function: batch optimizes THROUGHPUT, not tail latency — larger heap share (85%), G1 pause target relaxed to 500ms (bigger young gens, fewer collections, more throughput), ParallelGC as a legitimate alternative for pure-batch (no tail to protect), and the humongous/allocation analysis matters MORE (batch is allocation-heavy — the SEQUENCE/clear() patterns from Q5-16 are JVM-visible). Same methodology, different objective — flags follow the SLO of the workload, which is the entire meta-lesson of this answer.

**RED FLAGS TO AVOID:**
- Flag recitals without per-flag reasoning or graphs
- Micro-knobs (SurvivorRatio) without trace evidence
- No revert history (real tuning has failed experiments in it)
