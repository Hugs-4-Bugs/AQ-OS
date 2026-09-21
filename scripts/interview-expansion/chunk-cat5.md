### Q5-9: What is the Hibernate Session/EntityManager lifecycle and how is it managed in Spring Boot
**DIFFICULTY:** Hard
**CATEGORY TAG:** Hibernate/JPA

**ANSWER:**
The `EntityManager` (Hibernate's `Session` under the hood) is a per-unit-of-work object wrapping a persistence context — the first-level cache of managed entities. In Spring Boot, `SharedEntityManagerCreator` hands every `@PersistenceContext` injection a **thread-safe shared proxy** that creates a transaction-scoped EntityManager per operation: with `@Transactional`, one persistence context spans the method (all repositories called inside share it — that's why a `findById` and a later `save` in one service method see the same managed instances); without a transaction, each repository call gets its own short context (and flushes immediately — surprise point: simple `findById` works without a transaction, but write ops require one).

Entity lifecycle states and their interview value: **transient** (new, no id), **managed** (in the context — dirty checking active), **detached** (context closed — changes NOT tracked), **removed** (scheduled for delete). Dirty checking is the behavior everyone uses and nobody names: within a transaction, mutating a managed entity's field is enough — at flush, Hibernate snapshots managed entities on load and diffs at commit, generating the UPDATE automatically; calling `save()` on an already-managed entity is a no-op signaling ceremony. Detachment is where bugs live: entities returned from a `@Transactional` service become detached when the transaction ends; touching `lead.getActivities()` later throws `LazyInitializationException` — the classic. Our project-level answers to detachment: map to DTOs inside the transaction (never leak entities past the service boundary), or `JOIN FETCH`/`@EntityGraph` what you'll need.

Flush timing: flush (push SQL) happens at transaction commit, before queries that overlap affected tables (flush-auto query synchronization), and on explicit `flush()` — flush ≠ commit (flush sends SQL, commit finalizes; a flush can still roll back). Long conversations would need detached state + merge, but we don't do long conversations — request-scoped transactions only, which keeps the context's memory bounded; the one place we manage contexts manually is batch processing (`EntityManager.clear()` every N rows to prevent a million managed entities from bloating the context into an OOM — the first-level cache is a feature per-request and a liability per-million-rows).

**KEY TERMS TO MENTION:**
- Persistence context = first-level cache; shared proxy per transaction
- States: transient/managed/detached/removed + dirty checking
- `LazyInitializationException` = detached-entity access (DTOs in-transaction fix)
- Flush vs commit distinction; auto-flush before overlapping queries
- `clear()` in batch loops (context bloat prevention)

**FOLLOW-UP QUESTIONS:**
1. Two service methods each `@Transactional` — inner one called from outer: one transaction or two?
2. Why is `save()` sometimes issuing SELECT before INSERT?

**FOLLOW-UP ANSWERS:**
1. One — REQUIRED propagation joins the outer transaction and shares its persistence context; the inner `rollbackOnly` on exception poisons the whole thing. If the inner used REQUIRES_NEW, it suspends the outer and runs its own context — and the outer CANNOT see inner's uncommitted writes (isolation across two transactions) — a subtlety that has bitten real teams when inner creates data outer expects to read.
2. `save()` on an entity with an assigned (non-null) id can't know it's new, so `isNew()` is false → merge semantics → SELECT first, then UPDATE-or-INSERT. With `GenerationType.IDENTITY` (our choice for most tables), id is null until persist, so save is a straight INSERT. Assigned ids (external refs) get `@Version`-based or `Persistable` implementations to skip the probe SELECT — a concrete perf fix I applied on the API-key import path (halved inserts).

**RED FLAGS TO AVOID:**
- Confusing Session with Connection (session borrows a connection lazily)
- Claiming entities stay managed after the transaction ends
- No answer for LazyInitializationException (everyone hits it)

---

### Q5-10: How did you implement pagination and sorting
**DIFFICULTY:** Medium
**CATEGORY TAG:** Hibernate/JPA / REST

**ANSWER:**
Two mechanisms for two access patterns. **Offset pagination** (`Pageable` — `PageRequest.of(page, size, Sort.by("createdAt").descending())`) for admin consoles and small datasets: `Page<Lead>` returns content + total count; Spring Data translates to `LIMIT/OFFSET`. Its cost is structural: OFFSET 10000 forces the DB to walk and discard 10,000 rows, and the total-count query is a second full scan — fine at page < 50, degenerate beyond. **Cursor (keyset) pagination** for the hot paths (leads list, activity feeds): the cursor is the last row's sortable tuple (`created_at, id`), and the query is `WHERE (created_at, id) < (:lastCreatedAt, :lastId) ORDER BY created_at DESC, id DESC LIMIT 50` — index-seek instead of walk-and-discard, constant time at any depth, and stable under concurrent inserts (no page-shifting duplicates that OFFSET produces when a new row lands mid-scroll). The tuple comparison needs the composite index `(org_id, created_at DESC, id DESC)` — index design and cursor design are the same decision.

API shape: cursor endpoints take `?cursor=<opaque>&limit=50`, return `data` + `next_cursor` (null on end) — the cursor is Base64 of the tuple + a query-hash, so a client can't swap cursors between different filters silently; no `total` (counting 2M rows per page is waste — clients get "has_more" instead). Sorting is allow-listed: a map of client-facing sort keys → whitelisted column expressions (never pass client sort strings into queries — that's an injection/hygiene hole and an index-killer). Validation: `limit` clamped to [1, 100] (a `limit=1000000` is a DoS); count queries for admin offsets run on read replicas. The React frontend drives the list with `useInfiniteQuery` consuming `next_cursor` — the full stack agrees on one contract, which is why our p95 on the leads list stayed ~140ms at 2M rows.

**KEY TERMS TO MENTION:**
- `Pageable`/`Page` (offset) vs keyset cursor `(created_at, id)` tuple
- OFFSET's walk-and-discard cost + page-shifting instability
- Composite index matching the cursor order
- Opaque cursor (Base64 tuple + query-hash), no total count
- Allow-listed sorts, clamped limits

**FOLLOW-UP QUESTIONS:**
1. How do you jump to page 47 in a cursor API (admin wants it)?
2. Why include `id` in the cursor tuple?

**FOLLOW-UP ANSWERS:**
1. You don't — honestly. Admins needing deep jumps get a search/filter-first UX (narrow to the row via criteria, then cursor from there) or a materialized snapshot view with offsets where the dataset is bounded. Deep-offset is a UX smell more than a technical one; the "page 47" request usually means missing filters.
2. Tie-breaking: `created_at` is not unique — 50 leads created in the same millisecond would paginate wrongly (skip/duplicate rows) on a single-column cursor. The unique `id` makes the tuple a strict total order matching the index. Any keyset design without a unique tiebreaker is subtly broken under load.

**RED FLAGS TO AVOID:**
- Offset pagination on the main list with "it's fine" (it isn't at scale)
- Exposing raw total counts on million-row tables (per-request COUNT)
- Passing client sort strings unvalidated into queries

---

### Q5-11: How did you handle database migrations with Flyway
**DIFFICULTY:** Medium
**CATEGORY TAG:** Hibernate/JPA / DevOps

**ANSWER:**
Flyway is the source of truth for schema; Hibernate maps onto it — never the reverse (`hbm2ddl.auto=validate` in every non-dev profile, so a drift between entities and migrations fails boot, not production). Migrations live in `db/migration` as `V<timestamp>__<description>.sql`, versioned strictly forward-only; each PR adds exactly one migration and CI runs it against a disposable Postgres (Testcontainers) both fresh (all migrations from zero — catches broken chains) and upgraded-from-last-release (catches "works only on a fresh DB"). Boot applies pending migrations before serving traffic, under `flyway.clean-disabled=true` (clean = drop-schema; the setting that has nuked databases when misconfigured in prod) and `out-of-order=false` so a branched team can't silently interleave versions.

Zero-downtime discipline (expand → migrate → contract): migrations NEVER mix backward-incompatible steps with the deploy that needs them. Adding a column = one release (nullable + default null); backfill = a batched job (`UPDATE ... WHERE id BETWEEN` in 5k chunks — a single UPDATE on 2M rows takes locks and replication lag spikes); switching reads = next release; dropping old = weeks later behind a check that no code path references it (log-based usage check). Rename example I give: `name` → `business_name` shipped as add-column, dual-write in service, backfill job, switch reads, drop old — five steps across three releases, zero requests lost; the "just rename it" version is a deploy-ordering outage. Destructive ops get extra respect: index builds `CREATE INDEX CONCURRENTLY` (Flyway runs it in its own transaction — `executeInTransaction=false` for those scripts), and we rehearse risky migrations on a production snapshot in staging with `pg_stat_statements` watching for plan regressions.

Team mechanics: migrations are code-reviewed like code (a DBA review label on anything touching big tables), version conflicts surface at CI (two PRs same version fails the chain build), and rollback is "forward fix" — down-migrations are discouraged; a bad migration is reverted by a NEW migration, and if the data damage is done, restore from PITR is the runbook (tested quarterly — an untested backup is a rumor).

**KEY TERMS TO MENTION:**
- Flyway versioned migrations + `hbm2ddl.auto=validate` (drift fails boot)
- Forward-only; CI runs fresh + upgrade paths on Testcontainers
- Expand → backfill (batched) → contract release discipline
- `CREATE INDEX CONCURRENTLY` outside transactions
- Rollback = forward fix; PITR restore as the real safety net (tested)

**FOLLOW-UP QUESTIONS:**
1. Migration fails halfway in prod — what state are you in?
2. How do you handle seed/reference data?

**FOLLOW-UP ANSWERS:**
1. Flyway marks the version FAILED in `flyway_schema_history`; Postgres DDL is transactional so a failed migration inside a transaction auto-rolled back (clean state, fix + retry) — EXCEPT concurrent index builds which can't be transactional; those leave a INVALID index to drop manually before retry. Runbook covers both branches; the failure alert pages because a boot-failed release is an incident.
2. Reference data (plan tiers, credit costs) ships as `R__` repeatable migrations (checksum-driven re-run on change) or versioned inserts with `ON CONFLICT DO NOTHING` — idempotent by construction. Business-editable data (pricing) moved OUT of migrations into tables managed by admin UI — migrations seed the first row, product owns the rest.

**RED FLAGS TO AVOID:**
- Auto-ddl (`update`) in any shared environment
- Single-release renames/drops ("just deploy the schema first" — no)
- Untested restores / no answer for failed-migration state

---

### Q5-12: What is your caching strategy with Hibernate second-level cache
**DIFFICULTY:** Hard
**CATEGORY TAG:** Hibernate/JPA / Redis

**ANSWER:**
We evaluated the second-level cache and adopted it narrowly — L2 caching is powerful and treacherous, and the honest engineering answer is "here's exactly where it pays and where it doesn't." Setup: Ehcache as the L2 provider, `SharedCacheMode.SELECTIVE` — only entities annotated `@Cacheable` + `@Cache(strategy = READ_WRITE)` participate; we cached two classes: **reference data** (`PipelineStage`, `CreditCost` — read-heavy, write-rarely, correctness tolerant to seconds of staleness) and **hot aggregate counters** (org-level lead stats). Everything transactional-critical (leads, deals, balances) is deliberately NOT L2-cached: READ_WRITE L2 on money-adjacent entities adds stale-read risk across JVMs for a gain Redis already gives us more controllably.

The multi-node subtlety I explain: L2 caches are per-JVM; with 3 app instances, a stale window exists unless you add invalidation broadcast (Ehcache RMI/JGroups replication) — that's a distributed-consistency project in itself. Our call: per-JVM L2 for TRUE reference data (version-checked on read: Hibernate validates against the table's timestamp on transactional read — staleness bounded), Redis for everything else with explicit TTLs and explicit invalidation events. Query cache: disabled — `hibernate.cache.use_query_cache` interacts with first-level cache identity and gives subtle duplicate/stale results; our query caching is at the service layer (Spring `@Cacheable` on Redis) where keys and TTLs are explicit and debuggable.

The numbers that justify the design: reference tables get ~40k reads/min across instances; L2 (in-memory) serves them at ~0 DB load with < 1µs reads vs ~300µs round-trip to Redis — a real win with zero staleness concerns (table timestamps change once a quarter). Lead entities would get a ~30% DB-load reduction but introduce cross-JVM staleness on the exact entity where support teams need truth — bad trade, and I can defend that decision line by line in an interview, which is the actual skill being tested: not "did you turn on L2", but "do you know what it costs".

**KEY TERMS TO MENTION:**
- `SELECTIVE` shared-cache mode + `@Cache(READ_WRITE)` on reference entities only
- Per-JVM L2 → staleness across instances (replication cost awareness)
- Table-timestamp validation bounding staleness
- Query cache disabled (identity/staleness hazards)
- Redis at service layer for transactional-critical caching (explicit keys/TTLs)

**FOLLOW-UP QUESTIONS:**
1. A reference row changes — how do instances converge?
2. When would you switch to cluster-replicated L2?

**FOLLOW-UP ANSWERS:**
1. Hibernate's timestamp-based validation: each transactional read checks the region's last-update timestamp against the table's — a write anywhere invalidates the cached entries for all instances on their NEXT read (no stale-after-write reads within a transaction). Cache writes happen after commit, so the window is bounded to in-flight transactions. Plus our admin UI bumps a version key we can clear manually in < 10s across the fleet.
2. When reference data grows to multi-MB working sets where Redis RTT dominates (or cross-region), I'd add replicated L2 (JGroups/Terracotta) — but only with the monitoring to see hit rates AND staleness incidents per region. The upgrade trigger is measured: DB load on reference tables > 5% of total and Redis RTT visible in p99 — neither true today.

**RED FLAGS TO AVOID:**
- Caching everything L2 "for speed" (staleness on money entities)
- Not knowing L2 is per-JVM (multi-instance answer required)
- Query cache enabled blindly (classic subtle-bug generator)

---

### Q5-13: How did you optimize slow queries (process and tooling)
**DIFFICULTY:** Hard
**CATEGORY TAG:** Hibernate/JPA / PostgreSQL

**ANSWER:**
Process first: query optimization is driven by data, not vibes — every API controller emits a Micrometer timer; anything over its budget creates a trace with SQL timings (datasource-proxy wraps JDBC logging per-statement counts and durations into the trace), and a weekly "top 10 queries by total time" review picks targets. Tooling sequence for a target: reproduce with real-shaped data (production snapshot in staging — plans lie on empty tables), `EXPLAIN (ANALYZE, BUFFERS)` the SQL Hibernate actually ran (show_sql is noise; we log bound-parameter SQL via datasource-proxy), then fix by category.

The categories, each with a real case: **(1) N+1** — leads list issuing one activities query per lead (61 queries/page); fix: `@EntityGraph(attributePaths = {"activities"})` or JOIN FETCH where the graph is bounded; batch fetching (`hibernate.default_batch_fetch_size: 32`) as the global safety net turning N+1 into N/32 + IN-queries. **(2) Missing/incorrect index** — `WHERE org_id = ? AND status = 'HOT' ORDER BY created_at DESC` seq-scanning 2M rows; fix: composite `(org_id, status, created_at DESC)` matching filter-and-order; verified via `pg_stat_user_indexes` idx_scan delta after deploy. **(3) ORM-generated overkill** — `save()` on a large aggregate flushing every managed entity or UPDATE touching all columns; fixes: `@DynamicUpdate` for wide tables, DTO projections (`@Query("select new com.acq.dto.LeadRow(...)")`) for read paths — never load an aggregate to read two columns. **(4) DB-side work in app memory** — a Java loop aggregating 50k activities; replaced with a single GROUP BY window-function query — 40s → 300ms. **(5) Parameter-sniffing plans** — the same query shape flipping between index-scan and seq-scan on data skew; fixed with partial indexes for the hot predicate or `plan_cache_mode=force_custom_plan` for that statement.

Verification closes the loop: before/after p95 from the traces, `pg_stat_statements` delta, and a regression guard — the slowest-10 dashboard would have caught each of these within a week instead of a user report.

**KEY TERMS TO MENTION:**
- Trace-driven targeting (Micrometer + datasource-proxy SQL timing)
- `EXPLAIN (ANALYZE, BUFFERS)` on production-shaped data
- `@EntityGraph` / batch-fetch-size / DTO projections / `@DynamicUpdate`
- Composite index design matching filter + ORDER BY
- `pg_stat_statements` + slowest-10 review as regression guard

**FOLLOW-UP QUESTIONS:**
1. Why is EXPLAIN on staging with real data mandatory?
2. How do you detect N+1 automatically?

**FOLLOW-UP ANSWERS:**
1. Plans depend on statistics, data distribution, and cache state — the same query on an empty dev table shows index-scan (fast) while production seq-scans (2M rows, dead tuples).BUFFERS output also shows cache hit ratios you can't fake. Reproducing on a production snapshot is the only way the EXPLAIN describes YOUR problem, not a hypothetical one.
2. datasource-proxy counts statements per request; a threshold rule (any request > 20 statements or any endpoint whose statement count scales with result size) fires a warning trace. Also a test-side detector: a JUnit extension asserting fixture-list endpoints stay under a query budget — N+1 regressions fail CI, not users.

**RED FLAGS TO AVOID:**
- "Add an index" reflex without reading a plan
- Optimizing without production-shaped data
- No post-fix verification (p95 before/after)

---

### Q5-14: How did you implement soft deletes
**DIFFICULTY:** Medium
**CATEGORY TAG:** Hibernate/JPA

**ANSWER:**
Soft deletes exist because CRM data is relational memory — deleting a lead that has activities, messages, and deals cascades into losing business history and breaking foreign references. Mechanism: `deleted_at TIMESTAMPTZ NULL` (+ `deleted_by UUID` for accountability) on user-data tables; visibility enforced at TWO layers. Repository layer: every read method goes through Specifications that append `deletedAt IS NULL` — we made this structural with a base `SoftDeleteSpecification` and by Hibernate 6.4's `@SoftDelete` annotation (strategy DELETED, column `deleted_at`) on newer entities, which pushes the filter into Hibernate itself so even ad-hoc HQL respects it. Unique constraints interact with soft delete: `email UNIQUE` on users would block re-signup of a deleted user's email — solved with partial unique indexes (`CREATE UNIQUE INDEX ... WHERE deleted_at IS NULL`), the Postgres feature that makes soft deletes clean.

Hard-delete lifecycle still exists — soft-deleted rows age out per retention policy (leads 90 days in trash, then a `@Scheduled` job hard-deletes in batches with `pg_replication` awareness; PII columns are scrubbed on day 1 of trash to satisfy GDPR "deleted" semantics while keeping the relational shell for aggregates). Restore is a product feature ("Trash" tab → restore) — trivially `UPDATE ... SET deleted_at = NULL`, which is the entire UX payoff of the pattern. References FROM other entities use the id regardless of deletion (history stays intact — a deal referencing a trashed lead renders the name grayed out), which is why we never cascade real deletes on business tables.

The trade-offs I name proactively: every query carries the predicate (index design must include `deleted_at` in partial indexes, not as a normal column — low-selectivity garbage in b-trees), ORM defaults can leak deleted rows if someone writes raw SQL (code review + a query-coverage test asserting list endpoints filter), and counting queries must agree on scope (a "2,000 leads" dashboard vs trash-inclusive count bug we hit once and fixed by centralizing count logic in the same specification).

**KEY TERMS TO MENTION:**
- `deleted_at`/`deleted_by` + two-layer visibility (specifications / `@SoftDelete`)
- Partial unique indexes (`WHERE deleted_at IS NULL`)
- Retention job: PII scrub day-1, hard-delete day-90 (GDPR + history)
- Restore-as-feature (trash tab)
- Partial-index design + query-coverage test (leak prevention)

**FOLLOW-UP QUESTIONS:**
1. Why partial unique indexes instead of appending deleted_at to the unique key?
2. How do FK constraints coexist with soft deletes?

**FOLLOW-UP ANSWERS:**
1. Composite unique `(email, deleted_at)` breaks on double-delete (two rows with same email + NULL → NULLs are distinct in Postgres → duplicates allowed) and on re-delete cycles. Partial indexes scope uniqueness to live rows exactly — the semantics you mean — and stay small because trashed rows are excluded from the index.
2. FKs point at the shell row (which never physically deletes until retention, and when it does, the retention job deletes children first in the same transaction or the FK is ON DELETE SET NULL for historical references). The pattern: business integrity via soft state, physical integrity via ordered batch deletion — both explicit, neither accidental.

**RED FLAGS TO AVOID:**
- is_deleted BOOLEAN (no when/who — support and compliance need the audit)
- Forgetting the predicate in raw queries (data leaks into reports)
- Uniqueness breaking on re-create (the classic deleted-email bug)

---

### Q5-15: Optimistic vs pessimistic locking — when did you use each
**DIFFICULTY:** Hard
**CATEGORY TAG:** Hibernate/JPA

**ANSWER:**
The decision rule: optimistic for low-contention correctness (edit collisions), pessimistic for high-contention resource consumption (spending a shared balance). **Optimistic (`@Version`)**: `deal` entities carry a `version BIGINT`; JPA increments it on every UPDATE and `WHERE version = ?` gates the write — two agents editing the same deal, the second commit gets `OptimisticLockException` → user sees "someone changed this, refresh" (we map it to 409 with the fresh copy). Cost: zero DB locks, one extra column; requirement: retry-or-conflict UX. We also use `@Version` for the import path where duplicate imports race.

**Pessimistic**: credit deduction was the forcing case (Q2-13's conditional UPDATE is the ledger-side guard, but the AGGREGATE operations — monthly reset, bulk top-up, admin adjustments — read-modify-write the balance row). There we use `@Lock(PESSIMISTIC_WRITE)` on the repository method (`SELECT ... FOR UPDATE`), in a short transaction: lock row → read balance → write adjustment + ledger entry → commit, sub-10ms holds. FOR UPDATE NOWAIT on the interactive path (admin UI shows "someone else is adjusting this account" instead of hanging) and SKIP LOCKED for the batch sweeper (workers grab distinct pending entries without blocking — the job-poll pattern). The mistake I warn about: pessimistic locking + long transactions = lock queues and deadlocks — our rule is FOR UPDATE only inside transactions that do no external I/O (no HTTP, no Redis inside the lock; the LLM call case deducts via the conditional-UPDATE pattern precisely so no lock spans the provider call).

Deadlock discipline even so: consistent lock ordering everywhere (balance rows sorted by user_id in multi-row operations), lock timeouts (`SET LOCAL lock_timeout='2s'`) so a stuck lock fails fast instead of piling connections, and a deadlock-retry wrapper (Postgres deadlocks are retryable — catch 40P01, re-run with jitter; logged as a metric because a rising deadlock rate is a design smell). Interview one-liner I use: optimistic buys concurrency with retry UX; pessimistic buys certainty with throughput — pick per contention profile, never per fashion.

**KEY TERMS TO MENTION:**
- `@Version` + OptimisticLockException → 409 conflict UX
- `@Lock(PESSIMISTIC_WRITE)` = SELECT FOR UPDATE, short transactions only
- NOWAIT (interactive) / SKIP LOCKED (batch worker) variants
- No external I/O inside pessimistic locks (LLM-call case)
- lock_timeout + deadlock retry + ordering discipline

**FOLLOW-UP QUESTIONS:**
1. Why not pessimistic everywhere for simplicity?
2. How does `@Version` interact with detached entities and merge?

**FOLLOW-UP ANSWERS:**
1. Throughput and failure modes: every writer serializes behind row locks — a bulk campaign touching 5k balances would hold lock queues for seconds; lock timeouts convert load spikes into user-facing 500s. Pessimistic locking is also the primary deadlock generator when transaction shapes drift. Optimistic's retry cost is near-zero at our contention levels, so paying pessimistic's tax buys nothing.
2. Merge on a detached entity whose version lags the DB throws OptimisticLockException at flush — correct behavior, but teams confuse it with "save broken". Our DTO-in/out pattern (entities never cross the transaction boundary) means merges are rare and version conflicts surface as explicit conflict responses, not mysterious flush errors.

**RED FLAGS TO AVOID:**
- Using both without articulating the selection rule
- FOR UPDATE spanning external calls (the LLM-call trap)
- No lock_timeout/deadlock story (production freezes)

---

### Q5-16: How did you handle large data sets (batch processing)
**DIFFICULTY:** Hard
**CATEGORY TAG:** Hibernate/JPA / Spring Batch

**ANSWER:**
Two meanings of "batch" — bulk DML and chunked pipelines — and both have ORM traps. **Bulk DML**: JPQL `@Modifying` UPDATE/DELETE statements (`UPDATE lead l SET l.stage = :s WHERE ...`) bypass the persistence context entirely — no entity loads, no dirty checking, one SQL round-trip; the trap is stale first-level cache: entities already managed in the same transaction don't reflect bulk changes, so bulk DML runs FIRST in a transaction or in its own (we standardize: bulk ops in dedicated `@Transactional(propagation = REQUIRES_NEW)` methods + `clearAutomatically = true`). For multi-million-row maintenance (retention deletes), the single statement is the enemy — 2M-row DELETE = long lock + WAL spike + replica lag; the batched loop (`WHERE id IN (SELECT id ... LIMIT 5000)` in a loop with `pg_sleep` between chunks) keeps each transaction milliseconds, replication healthy, and interruptible/resumable.

**Chunked pipelines** (imports, enrichment): Spring Batch chunk-oriented steps with `chunk(100)` — read 100 (JPA cursor/paged reader, `fetchSize` matched to JDBC), process, write in ONE flushed transaction per chunk. Hibernate settings that make this survive: `hibernate.jdbc.batch_size: 50` (driver batches INSERTs — without it, "batching" is theater with per-row round-trips), order-inserts enabled (grouped statements unlock driver batching), `EntityManager.clear()` every chunk (or StatelessSession for pure streaming — no dirty checking, no L1 bloat), and IDENTITY generation OFF for batch inserts (it disables JDBC batching — sequences/TableGenerator for batch-heavy tables; a subtlety that separates people who've actually profiled this). Metrics per run: items/sec, chunk commit time, skip counts; a 1M-row import runs ~18 min with DB load flat and the API p95 unaffected (batch transactions short + read replica for reads + batch runs off-peak by scheduler).

**KEY TERMS TO MENTION:**
- `@Modifying` bulk DML bypasses context (stale-cache discipline + REQUIRES_NEW)
- Chunked loops for million-row maintenance (locks, WAL, replica lag)
- Spring Batch chunk(100), read/process/write per-chunk transaction
- `jdbc.batch_size` + ordered inserts + IDENTITY-disables-batching trap
- `clear()`/StatelessSession for context hygiene; per-run metrics

**FOLLOW-UP QUESTIONS:**
1. Why does IDENTITY id generation disable JDBC batching?
2. How do you make a crashed 40-minute import resumable?

**FOLLOW-UP ANSWERS:**
1. IDENTITY requires executing the INSERT immediately to obtain the generated key (Postgres RETURNING) — the driver can't defer and group statements it must execute one-by-one for key retrieval. SEQUENCE with allocationSize lets Hibernate reserve a range and batch the INSERTs. It's an invisible config until the first 100k-row import takes 4× longer than designed.
2. Spring Batch's metadata tables checkpoint every chunk commit — restart resumes from the last committed chunk (the job operator re-launches with the same job parameters; `allow-start-if-complete=false` semantics guard double-runs). For our custom job-table pipelines, the payload cursor column plays the same role. Design rule: any long job must persist progress granularly, because "restart from zero" is not a plan.

**RED FLAGS TO AVOID:**
- Loading entities to update one column in bulk
- Claiming batch processing without batch_size/ordering/IDENTITY awareness
- Single-statement million-row DML with no lock/lag awareness

---

### Q5-17: Explain your entity inheritance strategy
**DIFFICULTY:** Medium
**CATEGORY TAG:** Hibernate/JPA

**ANSWER:**
We have one real inheritance hierarchy — the communication record domain: `EmailMessage`, `WhatsAppMessage`, `TelegramMessage` extend `AbstractMessage` (shared: id, org, lead, direction, status, timestamps, provider ref). Strategy choice per option: **SINGLE_TABLE** (all in one `message` table + discriminator) — fastest joins, NULL-heavy columns for type-specific fields; **JOINED** (class-per-table, joins on read) — normalized but a join tax per polymorphic read; **TABLE_PER_CLASS** (concrete tables, UNION queries) — polymorphic queries are unions (index-unfriendly, rarely worth it). We chose **SINGLE_TABLE** with the discipline of keeping type-specific columns FEW (≤ 6 per subtype): messaging metadata is small (email: smtp_message_id, thread_id; whatsapp: twilio_sid, media_url), and the hot query — "all messages for a lead in chronological order" — is a single-table scan with an index, no joins, exactly what an activity timeline needs. NULL bloat is bounded by column count, and `CHECK` constraints (`discriminator = 'EMAIL' → smtp_message_id NOT NULL`) keep integrity where the ORM won't.

What I explicitly avoided: forcing inheritance where composition fits. `Deal` vs `Lead` are NOT a hierarchy (a deal HAS a lead, different lifecycles) — inheritance-shaped modeling of association-shaped reality is a classic ORM mistake; the discriminator test I apply: "is X a kind of Y in the business language, or does X reference Y?" Where inheritance WOULD have hurt: had WhatsApp messages carried 20+ unique columns, JOINED or separate tables with a common view would win — the strategy is revisit-able because repositories hide it (`MessageRepository` interface; callers don't care about table shape). For polymorphic behavior (per-channel send/format), we use the Strategy pattern at the service layer rather than polymorphic entity methods — entities stay data, behavior lives in services, which keeps entities serializable and tests light.

**KEY TERMS TO MENTION:**
- THREE strategies + their trade-offs (NULL bloat vs joins vs unions)
- SINGLE_TABLE with ≤ 6 subtype columns + CHECK constraints
- Discriminator test: "is-a" vs "has-a" (Deal ≠ subclass of Lead)
- Repository layer hiding strategy (revisit-able)
- Polymorphic behavior via service-layer Strategy, not entity methods

**FOLLOW-UP QUESTIONS:**
1. When would you switch to JOINED?
2. How do you query ONLY WhatsApp messages efficiently?

**FOLLOW-UP ANSWERS:**
1. If subtype columns grew (> ~8 each) making rows sparse-wide, or a subtype needs its own index-heavy access patterns (media attachments per WhatsApp row), JOINED normalizes the table and indexes. The migration is mechanical (split table + view for compatibility) — but I'd need the measured pain first; speculative normalization is as costly as speculative denormalization.
2. Discriminator is indexed: `WHERE discriminator = 'WHATSAPP' AND org_id = ?` → composite `(org_id, discriminator, created_at)` index → index-range scan, no full-table filter. The general lesson: SINGLE_TABLE's polymorphic-query strength doesn't cost single-type queries IF the discriminator participates in composite indexes.

**RED FLAGS TO AVOID:**
- Naming strategies without the trade-off table
- Modeling associations as inheritance (or vice versa) with no test
- "Never use SINGLE_TABLE" cargo cult (or its opposite)

---

### Q5-18: How did you implement audit fields (createdAt, updatedAt, createdBy)
**DIFFICULTY:** Easy
**CATEGORY TAG:** Hibernate/JPA

**ANSWER:**
Auditable columns are uniform across ~30 tables, so the mechanism is centralized — no per-entity boilerplate. An `Auditable` mapped-superclass (or `@Embedded` `AuditEmbeddable` — we chose embeddable so entities can also extend business base classes) carries `createdAt`, `updatedAt` (both `TIMESTAMPTZ NOT NULL`), `createdBy`, `updatedBy` (UUID, nullable for system actions). Population: `@EntityListeners(AuditingEntityListener.class)` + `@EnableJpaAuditing(auditorAwareRef = "auditorProvider")` — `@CreatedDate`/`@LastModifiedDate` set timestamps (Hibernate-managed, DB-agnostic), and `AuditorAware` supplies the current actor from the `SecurityContext` (user id; API-key calls attribute the key id; scheduled jobs attribute "system:job-name" via a context decorator — attribution without a thread-pool leak, using a scoped holder rather than a static). DB-level backstop: `DEFAULT now()` on created_at so even a rogue non-JPA write is stamped, and a migration guarantee that all tables got the columns (Flyway + a schema test asserting every table in the user-data set has the four columns — drift fails CI).

TheupdatedAt nuance worth mentioning in interviews: Hibernate's dirty checking updates `@LastModifiedDate` only when something else actually changed — no-change saves don't bump the timestamp (correct behavior; a naive `SET updated_at = now()` trigger would lie about change). `updatedBy` has a similar subtlety with bulk `@Modifying` updates — they bypass the context, so the audit listener never fires; our bulk-update service methods set the column explicitly in the JPQL (`SET l.updatedAt = CURRENT_TIMESTAMP, l.updatedBy = :actor`) — the kind of gap that surfaces in a "who changed this" investigation, which is exactly why we test bulk paths against the audit contract. Display layer maps audit fields into API responses where useful (lead detail shows "updated 2h ago by Sarah") — audit plumbing doubling as product UX.

**KEY TERMS TO MENTION:**
- `@EnableJpaAuditing` + `AuditorAware` (user/api-key/system attribution)
- `@Embedded` audit block + TIMESTAMPTZ NOT NULL + DB defaults backstop
- Dirty-check interplay (no-change saves don't bump updated_at)
- Bulk `@Modifying` bypass → explicit stamping in JPQL
- Schema test asserting audit columns exist everywhere (CI drift guard)

**FOLLOW-UP QUESTIONS:**
1. Why an embeddable over a mapped superclass?
2. How do you audit DELETE given rows disappear?

**FOLLOW-UP ANSWERS:**
1. Java single inheritance: entities often need to extend a domain base (or nothing); an embeddable composes without spending the "extends" slot and can be unit-tested as a value object. Superclass works too — it's a style call; the non-negotiable is ONE mechanism, not which one.
2. Deletes are audited at the EVENT level, not the row level: the `AuditAspect` logs DELETE actions (actor, id, snapshot of key fields) to the append-only `audit_event` table before the transaction commits — the row's own tombstone is the soft-delete columns (`deleted_by`/`deleted_at`), and hard deletes (retention) are batch jobs whose runs are themselves audited events. Two layers: state on the row, history in the event log.

**RED FLAGS TO AVOID:**
- Hand-written `setCreatedAt(new Date())` in every service (drift + misses)
- `TIMESTAMP` without timezone or JS `Date`-vs-instant confusion
- No story for bulk-update audit gaps

---

### Q5-19: Explain persist vs merge vs detach (and save vs saveAndFlush)
**DIFFICULTY:** Medium
**CATEGORY TAG:** Hibernate/JPA

**ANSWER:**
`persist(entity)`: register a TRANSIENT entity with the current persistence context — INSERT at flush, the SAME instance becomes managed (identity set if IDENTITY). It fails on a detached entity (NotSerializableException-adjacent `EntityExistsException`/detached passed to persist) — persist is "make new thing managed, in place". `merge(detached)`: copy the detached entity's state onto a MANAGED instance (SELECT to load current row if present, then diff-copy); returns the NEW managed instance — the original detached object is NOT managed afterward (the #1 interview trap: `merged = em.merge(detached); detached.setFoo(x)` does nothing). Merge is for reattaching state that left the context (HTTP round-trip, cross-service DTO→entity rebuild); our architecture barely uses it because DTOs go in and services load-then-mutate managed entities — merge survives only in a couple of import paths.

`detach(entity)` / `evict`: remove from the context — dirty checking stops; useful in batch loops between clears, or to opt a heavy entity out of snapshot cost. `clear()` detaches EVERYTHING (batch hygiene); `close()` (context end) detaches implicitly. `remove()` schedules DELETE (must be managed; removing a detached entity needs merge or a fresh reference). Then the Spring Data pair: `save()` = persist-if-new else merge (a convenience with merge semantics for non-null ids — the SELECT-before-INSERT probe covered in Q5-9), and `saveAndFlush()` = save + immediate flush — needed when subsequent code IN THE SAME transaction must see the row via JPQL/native SQL (auto-flush covers native-query overlaps only sometimes; explicit flush is the deterministic choice) or when you need generated keys/DB-side triggers' effects before continuing. Outside that, `save()` + commit-time flush is right — flushing eagerly per save is a perf smell (multiple round-trips where one would do).

The state-model summary I draw on whiteboards: persist = transient→managed (same instance); merge = detached→managed (new instance, state copied); detach/evict = managed→detached; remove = managed→removed. If a candidate can place every method on that diagram, they own the persistence context.

**KEY TERMS TO MENTION:**
- persist: same-instance transient→managed; fails on detached
- merge: state copy onto a NEW managed instance (return value trap)
- detach/evict/clear in batch hygiene
- `save()` = persist-or-merge + the IDENTITY/assigned-id probe behavior
- `saveAndFlush` only for same-transaction visibility needs

**FOLLOW-UP QUESTIONS:**
1. What happens if you modify a managed entity and then call save() on it?
2. merge() issues SELECT — can you avoid it?

**FOLLOW-UP ANSWERS:**
1. Nothing extra — the entity is already managed; dirty checking will emit the UPDATE at flush regardless, and save() (merge path for managed instance) is a no-op on a managed instance's identity. It's ceremony, not a bug — though it misleads readers into thinking "save" did something. Code review marks it noise.
2. With a `@Version`-carrying entity and correct id/version set, merge still SELECTs to diff. Avoiding the SELECT means not using merge: load via `getReferenceById` (lazy proxy, no SELECT) inside a transaction and set fields — flush UPDATEs by dirty checking; or bulk JPQL when the change is scalar and unconditional. That's our default service pattern: load (or reference) → mutate → commit; merge is the exception path.

**RED FLAGS TO AVOID:**
- Thinking merge manages the original instance (the classic bug)
- saveAndFlush sprinkled everywhere "to be safe"
- persisting detached entities / removing detached entities confusion

---

### Q5-20: How did you handle circular references in entity serialization
**DIFFICULTY:** Easy
**CATEGORY TAG:** Hibernate/JPA

**ANSWER:**
Short answer: we don't serialize entities — the circular-reference problem is a symptom of doing so, and the cure is architectural. Entities model bidirectional relationships (`Lead.activities`, `Activity.lead`) because navigation is natural in the domain; JSON serialization then chases the cycle (`lead → activities → lead → ...` → StackOverflowError or a 4MB payload). Every fix that operates AT the serializer is a patch: `@JsonIgnore` on the back-reference (breaks cycles, but silently drops data depending on serialization direction), `@JsonManagedReference`/`@JsonBackReference` (pairwise cycle-breaker, still shape-driven), `@JsonIdentityInfo` (id-refs instead of nesting — output shape clients hate). We use `@JsonIgnore` sparingly on true back-refs and rely on the real boundary: **DTOs mapped inside the transaction** (`LeadDetailDto` with explicitly chosen `activities` collection flattened to `ActivityDto` rows, each carrying `leadId` scalar instead of the lead object). The mapping (`MapStruct`-generated, compile-time-checked) is where the response SHAPE is designed — a product decision — rather than an accident of entity structure.

This also solves the lazy-loading half of the same disease: serializing a detached entity with lazy associations throws `LazyInitializationException` mid-response (or worse, with open-session-in-view enabled, silently fires N+1 queries during serialization — OSIV being ON by default in Spring Boot is a trap I name explicitly; we set `spring.jpa.open-in-view=false` and let the absence of session-in-view force correct fetch design). So the interview answer has two layers: mechanically, cycles are broken by mapping to acyclic DTOs; fundamentally, response shape and persistence shape are different concerns and conflating them causes BOTH circular serialization AND lazy-loading disasters. The one place entities touch JSON is internal admin tooling with `@JsonIgnore` back-refs and OSIV tolerated — bounded, low-traffic, explicit.

**KEY TERMS TO MENTION:**
- DTO boundary inside the transaction (MapStruct mapping) as the structural fix
- `@JsonIgnore`/`@JsonManagedReference` as serializer-level patches (with caveats)
- `open-in-view=false` — OSIV masks lazy-loading bugs as serialization bugs
- Response shape is a product decision, not entity leakage
- N+1-during-serialization (OSIV silent trap)

**FOLLOW-UP QUESTIONS:**
1. Why turn off open-session-in-view — isn't it convenient?
2. If forced to serialize entities, what's the least-bad setup?

**FOLLOW-UP ANSWERS:**
1. OSIV keeps a session (and DB connection) per REQUEST — connection held through view rendering, controller-level slow calls (an LLM retry inside a request) keep connections checked out, pool exhaustion under load; and it hides missing fetch plans (N+1 fires at render time where traces blame the wrong layer). Convenience now, unpredictability at scale — we disabled it in week one and the fetch discipline it forces (EntityGraph/JOIN FETCH/DTO) is a net win.
2. Bounded and explicit: `@JsonIdentityInfo` (id-refs, no infinite nesting), all LAZY associations either initialized or `@JsonIgnore`d, Jackson module configured to FAIL on lazy-no-session (fail fast, not silently empty), and OSIV explicitly off with the knowledge documented. It's acceptable for admin tooling; it would never be the public API contract.

**RED FLAGS TO AVOID:**
- Reach for @JsonIgnore everywhere without understanding directionality
- Not knowing OSIV exists / its costs (Spring Boot default ON)
- Circular-reference "fix" that changes API shape invisibly
