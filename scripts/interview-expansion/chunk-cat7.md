### Q7-2: What data did you cache and why — walk me through the actual cache map
**DIFFICULTY:** Medium
**CATEGORY TAG:** Redis / Caching

**ANSWER:**
Our Redis keyspace is designed as a catalog, not an accident — every key family has an owner, a TTL, and an invalidation story. **Reference/config data** (`config:credit-costs`, `config:plan-features`, TTL 10 min + explicit evict on admin change): read on every AI action; DB is 300µs, Redis 200ns, and the data changes quarterly — classic cache-aside. **Session-adjacent state** (refresh-token denylist `jwt:deny:{jti}` TTL = token remainder, OTP attempt counters `otp:attempts:{emailHash}` TTL 15 min, rate-limit buckets `rl:{route}:{key}` TTL 60s): these are CORRECTNESS caches — losing them is a security event, so they're write-through with no eviction surprises (separate Redis logical DB + `noeviction` policy on that instance). **Computed aggregates** (`stats:org:{orgId}:leads` TTL 60s): dashboard counts that would GROUP BY 2M rows per page view — 60s staleness is invisible to users, DB load drops 70%. **Hot entity reads** (`lead:detail:{id}` TTL 5 min, evict-on-write): the lead detail page is read-heavy/write-light; a write evicts via the AFTER_COMMIT listener so read-after-write stays correct for the WRITER, with 5-min staleness tolerated for others (product-accepted, documented).

The why behind what we did NOT cache: the leads LIST (filters × orgs × pages — key explosion, hit rate < 20% in staging measurement, so it stayed un-cached and got fast via indexes instead — measure before caching, always), user permission sets (security-critical, changed via admin — we cache with 60s TTL accepting documented propagation delay, verified against DB for privileged ops), and anything under active development shape-wise (cache keys freeze response contracts; caching a shape you'll change in 2 weeks creates migration debt). Cache HIT-RATE dashboards per key family turn this from folklore into engineering: families under 50% hit rate get re-reviewed monthly — either fix the key design or delete the cache (a cache nobody hits is pure liability: latency + staleness + invalidation bugs for nothing).

**KEY TERMS TO MENTION:**
- Key-family catalog: owner, TTL, invalidation per family
- Correctness caches (denylist, rate limits) isolated with noeviction
- Aggregate caching with product-accepted TTL staleness
- Measured decision NOT to cache the list endpoint (hit-rate math)
- Per-family hit-rate dashboards; delete caches that don't earn

**FOLLOW-UP QUESTIONS:**
1. How do you decide TTL for a new cache family?
2. What's the blast radius of a full Redis flush in your design?

**FOLLOW-UP ANSWERS:**
1. Three inputs: staleness tolerance of the product decision (dashboard numbers: 60s OK; permissions: 60s with privileged re-check), write frequency (high-write data needs short TTL or write-through evict — otherwise hit rate dies and staleness accumulates), and failure mode on miss (DB stampede risk → shorter TTL + jitter + single-flight). TTL is a product + load-shape decision written into the key-family doc, not a guess.
2. By design: correctness data (denylists, locks) lives on a separate instance with noeviction — flush of the CACHE instance costs a 60-second DB load spike (all TTL families regenerate via cache-aside; single-flight request coalescing turns the thundering herd into per-key single misses — the "cache warm-up" runbook is a documented 2-minute procedure, not an incident).

**RED FLAGS TO AVOID:**
- "We cache everything" with no key catalog or hit-rate data
- TTLs picked at random with no staleness-tolerance reasoning
- Security-state and disposable-cache mixed on one eviction-policy instance

---

### Q7-3: How did you handle cache invalidation
**DIFFICULTY:** Hard
**CATEGORY TAG:** Redis / Caching

**ANSWER:**
Invalidation strategy per write shape, because the failure modes differ. **Point writes** (lead updated): delete the exact key (`lead:detail:{id}`) in an `@TransactionalEventListener(AFTER_COMMIT)` — AFTER_COMMIT because deleting inside the transaction re-populates the cache from the NOT-YET-COMMITTED DB (the classic stale-resurrection bug: cache-aside refills from the old committed value, and your delete "didn't work"). **Collection writes** (a lead's stage affects org stats): bump a generation token — the stats cache key embeds a version (`stats:org:{id}:leads:v{gen}`), the writer INCRs `gen`, readers fetch gen then key — old generation keys expire naturally via TTL (no delete storms, no stale windows beyond one read; the cost is brief dual-cached generations, the benefit is no read-modify-write races on invalidation lists). **Fan-out writes** (credit-cost config change): the admin UI calls `CacheAdmin.evictFamily("config:credit-costs")` which publishes an evict event through Redis PubSub — every app instance subscribes and drops its local in-memory L1 + the shared key; PubSub is fire-and-forget, so the belt-and-suspenders is the 10-min TTL that bounds any missed message.

The honest corner: **cache-aside + read-replica** interaction — a replica-lagged read repopulates the cache with STALE data post-evict (evict → read hits replica → writes old value back → stale for full TTL). Our fixes: the hottest cached reads route primary (they're single-key by id — cheap on primary), and the stats family's generation scheme self-heals (next write re-bumps). The general doctrine I state in interviews: invalidation correctness = (delete AFTER commit) + (assume your delete can race a refill) + (TTL as the final backstop on every family — no infinite-TTL keys exist in the codebase, enforced by a CI check on our RedisTemplate wrapper which REQUIRES a TTL argument). Race-window acceptance: between write-commit and evict, a reader can serve ≤ one stale read — measured in milliseconds, product-accepted, and the alternative (write-through with distributed locks on every write) costs 10× latency for a window that's already invisible.

**KEY TERMS TO MENTION:**
- Delete AFTER_COMMIT (stale-resurrection bug explanation)
- Generation-token pattern for collection invalidation
- PubSub fan-out + TTL backstop (no infinite TTLs — CI-enforced)
- Replica-lag repopulation hazard and routing answer
- Accepted ≤ 1 stale read race window (ms-scale, documented)

**FOLLOW-UP QUESTIONS:**
1. Why delete instead of update-the-cache on write?
2. When would you choose write-through instead?

**FOLLOW-UP ANSWERS:**
1. Delete is idempotent, race-tolerant, and lazy — the next read rebuilds from authoritative DB. Cache-update requires computing the new cached shape inside/around the transaction (extra coupling, more bugs), races with concurrent readers (last-writer-wins on the CACHE too), and dead-ends when the cached shape is an aggregate. Delete-on-write is the pattern that survives refactors; update-on-write survives nothing.
2. Write-through when the cost of a cache miss is severe (stampede-prone hot key) or when reads vastly dominate writes AND the write path already computes the new state (ledgers, counters). We use it for rate-limit buckets and counters — always-consistent, and the write rate is bounded. For read-optimized entities, cache-aside won on simplicity; the trade is decided per family with numbers.

**RED FLAGS TO AVOID:**
- Evicting inside the transaction (the resurrection bug)
- Infinite-TTL keys with manual invalidation only
- No answer for the replica-repopulation race

---

### Q7-4: What Redis data structures did you use and why
**DIFFICULTY:** Medium
**CATEGORY TAG:** Redis

**ANSWER:**
Choosing the right Redis structure is the difference between O(1) and O(N) per operation — our catalog: **Strings** (counters via INCR — rate-limit buckets, attempt counters; atomic and auto-creating), **Hashes** (object-ish state: `session:{id}` → {userId, device, lastSeen} — field-level access without serializing the whole object; HINCRBY for per-field counters), **Sets** (org membership in feature-flag cohorts `cohort:{flag}` — SISMEMBER O(1) for flag checks; uniqueness by nature), **Sorted Sets** (the workhorse for anything ordered: reminder schedule `reminders:due` scored by epoch-ms — the sweeper does ZRANGEBYSCORE now → +60s and ZREM atomically per item; leaderboards for usage stats; dedup windows scored by timestamp with ZREMRANGEBYSCORE cleanup), **Streams** (the notification event log pre-Kafka — XADD consumer groups with XACK gave us at-least-once with replay; we kept Streams for the audit event fan-out even after Kafka arrived for the heavy flows, because Streams need zero extra infra), and **Bloom filters** (via module on the dedup path — `bf.exists seen:{campaignId}` pre-checks before the DB unique-constraint catch, cutting duplicate-write DB load ~80%).

Anti-patterns I actively avoided: storing JSON blobs where a Hash fits (serialize-deserialize per touch + whole-object rewrite per field change), using KEYS in production (O(N) full-keyspace scan — SCAN with MATCH for admin tooling only), unbounded LISTs as queues (no ack semantics — Streams/Sorted Sets exist for that), and one-giant-key-with-everything (hot-key concentration — keys are sharded by natural ids). Every structure choice maps to a complexity bound I can state: reminders ZADD O(log N), flag check SISMEMBER O(1), dedup BF.EXISTS O(k). When a candidate quotes structures WITH the operation complexity and the eviction interaction (volatile-ttl on the cache instance favors short-TTL keys), they've operated Redis, not read about it.

**KEY TERMS TO MENTION:**
- Strings=atomic counters, Hashes=field-level state, Sets=membership O(1)
- Sorted Sets for time-ordered work (reminders) — ZRANGEBYSCORE + ZREM atomic
- Streams for at-least-once event fan-out with consumer groups
- Bloom filter pre-check ahead of DB unique-constraint dedup
- Complexity-per-op + KEYS-forbidden / SCAN-only discipline

**FOLLOW-UP QUESTIONS:**
1. Why did you keep Redis Streams after adding Kafka?
2. How do you handle a hot Sorted Set (reminders) at scale?

**FOLLOW-UP ANSWERS:**
1. Different tiers of traffic: Kafka carries the high-throughput business flows (notifications, analytics events) with real ops investment; Streams carry low-volume internal fan-out (audit events, cache evicts) where a Kafka topic's operational cost exceeds the value. Two systems is itself a cost — the ADR sets the migration trigger (audit volume > 5k/s or cross-region replication needs).
2. Partition the schedule: `reminders:due:{shard0..7}` sharded by org_id at ENQUEUE time (the sweeper iterates shards, workers per shard) — ZADD/ZRANGEBYSCORE stay O(log N) per shard as N grows. Plus per-shard monitoring (ZCARD) so a skewed shard (one whale org) gets its own worker. The general lesson: Redis structures are fast until they're single-point — shard by natural key before it hurts.

**RED FLAGS TO AVOID:**
- Strings-only Redis (JSON blobs everywhere = misuse)
- KEYS in production paths
- No complexity bounds quoted with structure choices

---

### Q7-5: How did you implement distributed locking with Redis
**DIFFICULTY:** Hard
**CATEGORY TAG:** Redis

**ANSWER:**
Distributed locks in our system protect two things: scheduled-job execution (one instance fires the 8 AM sweep) and multi-step resource claims (batch job slots). The core pattern — single-instance Redis, which is the honest scope of our locking: `SET lock:{name} {instanceId} NX PX {ttl}` — NX (only if absent), PX (expiry in ms — a crash can't hold the lock forever; TTL is the crash-safety), value = unique token (instanceId + uuid) for safe release. Release is a Lua script (GET-compare-DEL atomically): you must NOT delete a lock you don't own — instance A slowed past its TTL, B acquires, A finishes and deletes B's lock (the classic bug; the Lua check makes release owner-verified). Renewal: jobs expected to run near TTL use a watchdog thread extending the lock (Lua check-and-PEXPIRE) — same idea as Redlock's watchdog, implemented in 30 lines.

Where I DON'T use Redis locks, and why that answer matters more: **DB-row claims** use the DB itself — conditional UPDATE / FOR UPDATE SKIP LOCKED (Q6-13) — because the resource lives in Postgres and the transaction is the lock (a Redis lock around a DB transaction adds a second failure domain for no benefit). **Multi-resource atomic claims across instances** (the Redlock scenario — locks on independent Redis masters) we don't have: our Redis is single-master with a replica for reads; I can articulate why Redlock's quorum doesn't magically fix clock/fencing debates (Kleppmann's critique: without fencing tokens, a paused process can still write after lock loss) and where our usage is safe within that critique — locks guard IDEMPOTENT work (double-run of a sweep is harmless by design; the lock is an efficiency, not a correctness crutch). That distinction is the senior answer: locks-that-must-be-correct live in the DB as constraints/transactions; Redis locks guard best-effort deduplication where double-execution is tolerable — and our job handlers are idempotent because of exactly this reasoning.

**KEY TERMS TO MENTION:**
- `SET NX PX` + unique token + Lua-owner-verified release (safe release)
- TTL as crash safety; watchdog renewal for long jobs
- DB-native locking for DB-resident resources (SKIP LOCKED)
- Redlock caveats (fencing tokens, pause-after-lock-loss) and scope honesty
- Locks guard idempotent work — efficiency, not correctness

**FOLLOW-UP QUESTIONS:**
1. Redis master fails over mid-job — what happens to the lock?
2. Why a unique value in the lock at all?

**FOLLOW-UP ANSWERS:**
1. Replication is async — the failover can lose the lock key while the holder still believes it owns it: two owners briefly. Our design absorbs it: holders' work is idempotent + the DB layer has its own guards (unique constraints catch double-writes). For work where double-execution is NOT tolerable, we don't use Redis locks at all (Q above) — so the failover window costs a duplicated sweep, never duplicated money.
2. Without a unique value, release is blind DEL — the A-slow-past-TTL deletes-B's-lock bug (then C acquires while B still works: three owners). The token + Lua compare-release closes it. It's the difference between a lock and a liability; I've reviewed code where this exact bug caused triple-sent campaigns.

**RED FLAGS TO AVOID:**
- DEL without ownership check (the classic triple-owner bug)
- Locks without TTL (crash = permanent freeze)
- Claiming Redlock solves everything / no awareness of fencing critique

---

### Q7-6: How did you use Redis for rate limiting
**DIFFICULTY:** Hard
**CATEGORY TAG:** Redis / Security

**ANSWER:**
Rate limiting needs distributed counters (3 app instances share the budget) and atomic operations — Redis is the natural substrate. We run two algorithms per route policy. **Fixed window** (`INCR rl:{route}:{key}:{epochMin}` + `EXPIRE 61s`): cheap, good enough for generous budgets (API keys: 600/min); known flaw — boundary burst (2× limit across a window edge) — acceptable where the budget has slack. **Sliding window (approximate)** for tight budgets (auth endpoints: 10/10min/IP): two fixed windows weighted by overlap (`prev_count × (remaining_prev/60) + curr_count`) in a Lua script — one round-trip, atomic, memory O(1) per key, within 2% of true sliding-window (sorted-set ZADD-per-request is exact but O(N) memory per key — wrong cost for per-IP keys that number in millions). All logic in Lua: check-and-consume must be atomic — two instances racing INCR-then-EXPIRE without Lua can leave keys with no TTL (permanent limit) or admit double-budget (the INCR/EXPIRE race — every hand-rolled limiter's first bug).

Keying is policy, not code: anonymous routes key by IP (right-most trusted XFF entry), authenticated by user id, API-keys by key id, and EXPENSIVE routes add org-level budgets (AI generation: per-user 100/day AND per-org 5000/day — two INCRs in one script, both must pass; the script returns which budget failed so the API returns precise 429s with Retry-After computed from window math). Failure posture: Redis unavailable → the limiter FAILS OPEN for cache-tier limits (availability over strictness for generic API limits — a degraded limit beats a dead API) but FAILS CLOSED for the auth brute-force limiter (security limits must not vanish with Redis — a locked instance-level fallback counter with 1/10th budget keeps brute-force protection while Redis recovers). Metrics: rejections per route/key-tier on Grafana — a rejection spike at 3 AM is either an attack or a broken client; both matter, and the per-key top-talkers panel identifies which in seconds.

**KEY TERMS TO MENTION:**
- Fixed window vs weighted two-window sliding (Lua, atomic check-and-consume)
- INCR/EXPIRE race → Lua-only limiter ops
- Layered keying: IP / user / key / org budgets in ONE script
- Fail-open (generic) vs fail-closed (auth) posture with rationale
- Rejection metrics + top-talker panels for incident triage

**FOLLOW-UP QUESTIONS:**
1. Why not local in-memory limiters per instance?
2. A customer's integration hits limits legitimately — what's the product answer?

**FOLLOW-UP ANSWERS:**
1. Three instances = 3× the real budget plus load-balancer skew (one instance eats 80% of a tenant's traffic — their limit trips early; another tenant rides a quiet instance past their cap). Distributed budgets need shared state; Redis's ~200µs cost per check is the price of correct arithmetic. Local limiters survive only as the fail-closed degraded mode (Q above).
2. Limits are a product surface, not just a shield: 429s carry Retry-After + a rate-limit headers (X-RateLimit-Remaining/Limit), the customer dashboard shows their own usage graphs, and tier upgrades are self-serve. The worst answer is a mysterious 429 with no visibility — rate limiting without feedback loops generates support tickets instead of well-behaved clients.

**RED FLAGS TO AVOID:**
- INCR + EXPIRE as two separate ops (the TTL race)
- One algorithm/keying for all routes
- No stated Redis-down posture (fail-open-vs-closed is the senior tell)

---

### Q7-7: Walk me through your cache-aside pattern implementation and its pitfalls
**DIFFICULTY:** Medium
**CATEGORY TAG:** Redis / Caching

**ANSWER:**
Cache-aside (`LazyLoading`) is our default pattern: READ = check Redis → hit: return; miss: query DB → SETEX key TTL → return; WRITE = commit DB transaction → evict key (AFTER_COMMIT, Q7-3). Implemented once, correctly, in a generic `CachePort` wrapper — not sprinkled: `cachePort.getOrLoad("lead:detail:" + id, TTL_5MIN, () -> leadService.loadDetail(id))`. The wrapper enforces the invariants the pattern needs: mandatory TTL argument (compile-time prevention of infinite keys), per-family metrics (hit/miss/load-time/load-failure), single-flight load coalescing (a `ConcurrentHashMap<String, CompletableFuture>` per instance — 50 concurrent misses on one key produce ONE DB query, not 50: our stampede defense at instance level; cross-instance stampede is bounded by TTL jitter — TTLs randomized ±10% so mass-expiry doesn't synchronize), and serialization versioning in the value envelope (`{v:2, data:...}`) so a shape change doesn't serve old deserialized garbage during deploys (version mismatch = treat as miss).

The pitfalls I enumerate from experience, each with its concrete prevention: **stale-resurrection** (evict inside transaction → refill from old committed state) → AFTER_COMMIT evict; **replica-repopulation** (post-evict read from lagging replica writes back stale) → hottest cached reads route primary; **stampede** (hot key expiry = synchronized herd) → single-flight + TTL jitter + for the hottest keys a short "lock-and-double-check" around the load (SET NX guard; losers sleep-and-retry once before loading themselves); **serialization drift** → envelope versioning; **hot-key concentration** (one celebrity key saturating a Redis shard) → key families monitored by QPS per key (top-keys via `--hotkeys` in maintenance windows), worst-case split into sharded sub-keys; **negative caching absent** (nonexistent id hammered → every request misses to DB) → short-TTL tombstones (`lead:detail:{id} = NULL_MARKER, TTL 30s`) for known-not-found — the least famous pitfall and the one that quietly saves you during enumeration attacks. Cache-aside's appeal is decoupling (cache down ≠ app down — degraded latency only) and simplicity of reasoning; the cost is the race windows above, all handled in ONE place (the wrapper) instead of N call sites.

**KEY TERMS TO MENTION:**
- Generic CachePort wrapper enforcing TTL/metrics/single-flight
- AFTER_COMMIT evict + primary-route for hot cached reads
- Stampede defense: single-flight + TTL jitter + lock-and-double-check
- Value envelope versioning (deploy-safe deserialization)
- Negative caching tombstones for not-found

**FOLLOW-UP QUESTIONS:**
1. Cache down completely — what does the user experience?
2. Why TTL jitter matters — walk through the failure without it.

**FOLLOW-UP ANSWERS:**
1. By design: getOrLoad falls back to DB on Redis errors (exceptions never propagate from the cache layer) — p95 degrades from ~40ms to ~300ms on cached endpoints, dashboards fire the Redis-down alarm, and nothing user-facing 500s. That availability decoupling is WHY cache-aside over write-through here: a write-through dependency on Redis makes the DB write path hostage to cache health.
2. Without jitter, all keys of a family set at the same moment expire together (mass import at 10:00, TTL 10 min → 10:10 every key misses simultaneously) → synchronized DB query storm at 10:10 every cycle, DB p99 spikes in a sawtooth exactly matching the TTL. We saw the sawtooth in staging once; ±10% randomization flattens expiry mass, and single-flight absorbs the remainder. Small setting, load-test-visible effect.

**RED FLAGS TO AVOID:**
- Cache logic copy-pasted per call site (invariants drift per site)
- No stampede story ("it'll be fine" at scale)
- Errors from the cache layer propagating to users

---

### Q7-8: How did you handle Redis failover / HA
**DIFFICULTY:** Medium
**CATEGORY TAG:** Redis / DevOps

**ANSWER:**
Redis for us is a cache + ephemeral correctness state, and the HA design follows from that grading. Architecture: **single-master with replica + Sentinel** (managed ElastiCache-equivalent): Sentinel monitors, fails over on quorum (down-after 10s, failover-timeout 60s), clients (Lettuce with topology refresh) follow the new master — write downtime ≈ 10-30s, data loss = unreplicated writes (async replication: seconds). What that loss costs us, tier by tier: cache families — self-heal via cache-aside (Q7-7's degraded-latency story); rate-limit counters — a failover resets buckets (worst case: budgets double for one window — accepted, documented); denylist/attempt counters — the SECURITY tier, which is why that logical DB also has the instance-level fail-closed fallback (Q7-6) and why denylist revocations are ALSO written to the DB session table (Redis is an accelerator there, not the source of truth — a failover cannot un-revoke a session). That tiering — what MUST survive vs what MAY reset — is the entire interview answer in one sentence: HA is not making Redis unkillable, it's grading every key's blast radius and giving each grade a plan.

Operational posture: client-side resilience in Lettuce (command timeout 500ms, retry disabled for cache reads — fail-to-DB fast, retry ONCE for security writes), connection-pool pre-warmed (failover reconnect storms are their own outage if pools cold-start), and runbooks per failure class: master death (auto — verify failover + watch hit rates recover), replica lag (route-shift alerts), full-region loss (Redis rebuilds empty; correctness tier rebuilds from DB — denylists re-derived from revoked session rows in a 2-minute sweep, a job that exists precisely because we refused to make Redis the source of truth). We deliberately did NOT adopt Redis Cluster: 3-shard operational complexity (resharding, multi-key ops break, hash-tag discipline) buys throughput headroom our traffic doesn't need (~15k ops/s peak vs ~100k single-node capacity) — the upgrade trigger (sustained > 40% ops capacity or hot-shard metrics) is written in the ADR.

**KEY TERMS TO MENTION:**
- Sentinel failover (10-30s write gap, async-replication loss acknowledged)
- Key-tier grading: cache (self-heal) vs rate-limit (reset OK) vs security (DB is source of truth)
- Lettuce settings: timeouts, no-retry-reads, pre-warmed pools
- Rebuild-from-DB runbooks (denylist re-derivation sweep)
- No-Cluster decision + explicit upgrade trigger

**FOLLOW-UP QUESTIONS:**
1. Why not make Redis strongly consistent (WAIT / synchronous replication)?
2. During the 10-30s failover gap, what do users see?

**FOLLOW-UP ANSWERS:**
1. WAIT forces acknowledgment per write — latency 2× and still not a transactional guarantee (a failover can lose acknowledged writes under edge cases). The correct pattern for keys that matter is what we did: demote Redis to accelerator for those keys and put truth in Postgres. Strongly-consistent Redis is trying to make the cache into a database — wrong tool, wrong cost.
2. Cache-tier: slow (DB fallback) responses — nothing breaks. Rate limits: fail-open degraded budgets. Security tier: fail-closed local fallbacks (reduced budgets, denylist checks fall back to the DB session table — a ~2ms penalty per auth that tolerates the gap). The user-visible answer is "slightly slower, nothing broken" — which is only true because the tiering work happened BEFORE the incident, not during it.

**RED FLAGS TO AVOID:**
- HA discussion with no data-loss acknowledgment (async replication)
- No per-key-tier blast-radius thinking
- Redis Cluster "because HA" (Cluster is throughput tech, not HA tech)

---

### Q7-9: What is the difference between @Cacheable, @CacheEvict, @CachePut — and where did each fit?
**DIFFICULTY:** Easy
**CATEGORY TAG:** Spring Boot / Caching

**ANSWER:**
The three annotations are Spring's abstraction over cache-aside at the method boundary. **@Cacheable**: check cache by key before executing; on hit, skip the method entirely; on miss, execute and store — the read path (`@Cacheable(value = "leadDetail", key = "#orgId + ':' + #leadId")`). **@CacheEvict**: remove entries — on the write path (`@CacheEvict(value = "leadDetail", key = "...")` for point evicts, `allEntries = true` for family flushes — the blunt instrument that's correct when you can't compute affected keys). **@CachePut**: always execute the method and store the RESULT — for write paths where the method's return IS the fresh cached value; the trap I name in interviews: `@CachePut` on a method whose callers ignore the return value still stores it, and `@CachePut` vs `@Cacheable` key misalignment silently caches under the wrong key (they must share key expressions exactly — a real bug class).

Where each fit — and the honest caveat: we use Spring's annotations ONLY for the in-JVM Caffeine L1 (per-instance micro-cache for reference data, 30s TTL, zero serialization). Our shared Redis layer deliberately bypasses annotations for the `CachePort` wrapper (Q7-7) — because the annotations' semantics were too thin for our needs: no single-flight, no metrics hooks, no envelope versioning, TTLs per-method but no jitter, and the key SpEL gets unwieldy for composite keys. That's a senior-flavored answer: know the annotations cold (including the proxy caveats — self-invocation skips them like `@Transactional`/`@Async`, sync=true for stampede-block, unlessGenerated keys) AND know when the abstraction's ceiling forces a hand-rolled layer. The L1 note: Caffeine under Spring's abstraction gives us reference-data reads at ~100ns with a 30s staleness bound — the two-tier design (Caffeine L1 → Redis L2 → Postgres) where ONLY L1 uses annotations because only L1's needs fit the abstraction.

**KEY TERMS TO MENTION:**
- @Cacheable (skip-on-hit) / @CacheEvict (point + allEntries) / @CachePut (store return)
- Key-expression alignment between Cacheable and CachePut (bug class)
- Proxy/self-invocation caveats + sync=true stampede option
- Annotations for Caffeine L1; CachePort wrapper for Redis L2 (why)
- Two-tier caching with per-tier tooling fit

**FOLLOW-UP QUESTIONS:**
1. When does allEntries=true become the right call?
2. How do the annotations interact with @Transactional?

**FOLLOW-UP ANSWERS:**
1. When affected keys are unbounded (a config change touching N computed entries) or key computation is error-prone — flushing the family costs a brief load spike (bounded by single-flight) versus risking stale keys from a missed computed key. Correctness first, spike second; allEntries on low-traffic families is free, on hot families needs the stampede answer ready.
2. Order: the cache interceptor sits outside the transactional one by default — a @Cacheable method that's also @Transactional opens its transaction on a cache miss and closes before the value is cached (fine), but @CacheEvict inside a ROLLED-BACK transaction evicts anyway (cache flushed, DB unchanged — safe direction, just wasteful) while a @CachePut inside rollback stores uncommitted data (unsafe — needs AFTER_COMMIT semantics the annotations don't express). That's the second reason our Redis layer evicts via TransactionalEventListener — the abstraction couldn't say "after commit".

**RED FLAGS TO AVOID:**
- Reciting definitions without the key-alignment/rollback traps
- Using @CachePut casually on transactional writes
- No awareness of the abstraction's ceiling (sync, metrics, versioning)

---

### Q7-10: TWISTED — Redis goes down at peak traffic. What happens to AcquisitionOS, minute by minute?
**DIFFICULTY:** Expert
**CATEGORY TAG:** Redis / Twisted Scenario

**ANSWER:**
Minute 0-1 (detection): Redis-health alarm fires (health indicator + hit-rate drop + connection-error rate — three signals, one page). The app does NOT alert users; here's why, per tier, because the design decided this in advance: **cache tier** — `CachePort.getOrLoad` catches connection errors and falls through to Postgres; load on DB rises immediately (all cached reads now hit DB); DB has headroom sized for cache-down (we load-test with Redis DISABLED — the "cache-off scenario" is a standard perf-test case, which is the difference between knowing and hoping). Expected effect: p95 on cached endpoints degrades ~7× (40ms → 300ms) but stays under timeout budgets. **Rate limits** — fail-open on generic routes (limits vanish: burst tolerance for ~10 min is accepted vs an outage), fail-closed on auth brute-force (instance-local counters at 1/10 budget — protection degrades, doesn't die). **Session/denylist** — revocation checks fall back to the DB session table (+2ms per auth); OTP attempt counters go instance-local (slightly tighter limits — fail-safe direction).

Minute 1-5 (impact management): the biggest real risk is the DB load spike — mitigation is pre-built: the cache-off load test proved Postgres absorbs full uncached OLTP at 2× peak with the pool math unchanged (pool sizing didn't assume cache hits — a subtle but critical sizing decision); on-call may throttle the most cache-dependent heavy endpoints (feature flag: dashboard analytics read-replica route forced) to protect OLTP. **Background jobs**: distributed locks vanish — sweeps may double-run; handlers are idempotent BY REQUIREMENT (the lock was efficiency, not correctness — Q7-5), so the visible effect is zero, the log effect is "lock acquire failed, proceeding" spam (its own alarm — expected during Redis incidents, pre-acknowledged in the runbook to avoid false panic).

Minute 5-30 (recovery): failover completes (Sentinel) or rebuild-from-empty runs; traffic re-heats the cache organically — the single-flight + jitter machinery (Q7-7) turns the reheat into per-key single misses instead of a synchronized stampede (the warm-up storm IS the next incident if you lack it); correctness tier re-derives from DB (denylist sweep, 2 min). Post-incident: the RCA answers why Sentinel didn't fail over (node death vs network partition vs quota), and the runbook gets the missing rung. The meta-point I land: Redis-down being a 30-minute non-event is a DESIGN OUTPUT — tiered blast radii, idempotent jobs, DB headroom, and rehearsed fallbacks — not luck.

**KEY TERMS TO MENTION:**
- Pre-decided per-tier degradation (cache: DB fallback; limits: fail-open/closed split; security: DB truth)
- Cache-off load testing as the proof of DB headroom
- Idempotent job handlers make lock loss harmless
- Single-flight + jitter = safe cache reheat (no warm-up stampede)
- RCA + runbook iteration as the closing loop

**FOLLOW-UP QUESTIONS:**
1. Which single design decision saved you here, and why?
2. What if Postgres ALSO degraded simultaneously (cascading scenario)?

**FOLLOW-UP ANSWERS:**
1. Grading keys by blast radius at design time. Everything else (fallbacks, idempotency, load tests) executes that grading. Without it, Redis-down is an unknown-unknowns exercise at 3 AM; with it, the incident is a checklist. It costs one column in the key-catalog doc — the cheapest resilience investment in the whole system.
2. That's the real outage — and the honest answer is graceful degradation by product priority: feature flags shed load (analytics heavy endpoints off, batch jobs paused, AI generation queued instead of inline), rate limits tighten globally (protect the core), and the status page communicates. What we DON'T do is let everything degrade equally — cascading failures kill systems through uncontrolled coupling; the flags exist precisely to make shedding load a 30-second decision instead of an architecture debate mid-outage.

**RED FLAGS TO AVOID:**
- "Redis down = site down" (no tiering thought)
- No mention of cache-warm-up stampede on recovery
- Discovery-mode answers (no pre-decided degradation plan)
