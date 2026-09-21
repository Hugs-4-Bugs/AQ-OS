### Q6-4: How did you handle full-text search for lead search
**DIFFICULTY:** Hard
**CATEGORY TAG:** PostgreSQL

**ANSWER:**
Lead search means: given free text ("dental clinic Mumbai"), match across business_name, owner_name, city, tags — with typo tolerance and fast response over 2M rows. LIKE '%...%' was never an option: unindexable (seq scan per keystroke), no relevance, no typo handling. Our Postgres-native stack has three tiers. **Tier 1 — tsvector full-text**: a generated column `search_tsv tsvector GENERATED ALWAYS AS (setweight(to_tsvector('english', coalesce(business_name,'')), 'A') || setweight(to_tsvector('simple', coalesce(city,'') || ' ' || coalesce(tags_text,'')), 'B')) STORED` with a GIN index; queries use `websearch_to_tsquery` (safe — user input never parsed as query syntax) with `ts_rank` ordering. Generated column keeps index and data in sync with zero triggers. **Tier 2 — trigram fuzzy**: `pg_trgm` GIN index on business_name for typo tolerance (`similarity(name, :q) > 0.35` OR `name % :q`), because FTS won't match "Denist" to "Dentist" — trigrams do. We run trigram as a fallback branch when FTS returns < 5 results, unioned and re-ranked. **Tier 3 — prefix + structured filters**: org_id/status/stage filters stay plain b-tree predicates combined with the text query (GIN + b-tree in one plan works fine; the planner intersects bitmaps).

Ranking is a product decision: score = ts_rank (text relevance) × 0.6 + lead quality score × 0.3 + recency × 0.1 — computed in SQL so pagination is stable. Performance facts I quote: GIN index build on 2M rows ≈ 40s (built CONCURRENTLY), search p95 ≈ 45ms, index size ≈ 30% of table. Why not Elasticsearch at this stage: one more system (ops, sync lag, auth filtering complexity), while 95th-percentile 45ms covers UX; the trigger to move out of Postgres is written in the ADR — sustained search QPS where Postgres CPU dominates, or need for analyzers/ML ranking beyond SQL composition. Sync-based search (ES) also breaks transactional visibility (a saved lead not yet searchable) — our generated column is transactional: a committed lead is instantly searchable, which the product relies on ("import → search → it's there").

**KEY TERMS TO MENTION:**
- Generated tsvector column + GIN index + `websearch_to_tsquery` (injection-safe)
- `pg_trgm` similarity for typos as fallback tier
- Composite ranking (relevance + quality + recency) in SQL
- Transactional visibility (committed = searchable) vs sync-lag systems
- Explicit exit criteria to Elasticsearch in the ADR

**FOLLOW-UP QUESTIONS:**
1. Why 'simple' dictionary for city/tags but 'english' for names?
2. How do you keep the GIN index fast on writes?

**FOLLOW-UP ANSWERS:**
1. Stemming: 'english' reduces "clinics/clinic" to one lexeme (recall win on names/descriptions); city names and tags are proper nouns/labels — stemming corrupts them ("Mumbai" isn't a word to stem, but 'simple' also avoids lowercase-folding surprises with mixed-language tags). Choosing dictionaries per weight-class is the difference between search that feels smart and one that feels broken.
2. GIN fastupdate on = insert-time pending list (fast writes, slower queries until cleanup); we monitor `gin_pending_list` size and autovacuum cleans it. For our write pattern (~2k leads/min peak) fastupdate ON + autovacuum tuning is the right balance; bulk imports pre-disable and re-index after. Measured, not default.

**RED FLAGS TO AVOID:**
- ILIKE '%term%' with an index claim (it seq-scans)
- Raw tsquery on user input (syntax errors/DoS via malformed queries)
- "We'd add Elasticsearch" with no trigger or trade-off articulated

---

### Q6-5: How did you implement and tune connection pooling (HikariCP)
**DIFFICULTY:** Hard
**CATEGORY TAG:** PostgreSQL / Performance

**ANSWER:**
HikariCP is Spring Boot's default; the interview value is showing the pool is a DESIGN decision, not defaults. Sizing math I present: pool ≈ (cores_effective × 2) + spindle_guess — with RDS db.m6g.xlarge (4 vCPU) and an OLTP mix, the DB's total connection budget matters more than per-instance: 3 app instances × 15 = 45 app connections + migrations + cron workers + analytics = ~55, comfortably under Postgres `max_connections=200` with headroom for superuser reserved. The counterintuitive truth I explain: SMALLER pools often outperform bigger — every connection is a Postgres process; 100 active connections on 4 cores = context-switch thrash and lru churn, throughput DROPS. We load-tested 10/15/25/40 per instance: 15 won on p99 (queue-on-pool adds ~1-3ms but saves seconds of DB thrash at peaks).

Key settings beyond maximumPoolSize: `connectionTimeout=3s` (fail fast under pool exhaustion — a 30s default turns a DB blip into thread-pool exhaustion cascade; 3s + circuit-breaker on DB health converts overload into clean 503s), `maxLifetime=840000` (14 min, deliberately BELOW any LB/firewall idle-kill — stale connection deaths are silent p99 killers), `leakDetectionThreshold=60s` (a stack trace on any connection held > 60s — caught two bugs: a stream not closed in an export path, and a @Transactional method doing an LLM call), `minimumIdle=maximumPoolSize` (fixed-size pool — no resize jitter at peaks). Validation is JDBC4 `isValid()` (no test-query overhead), and `transactionIsolation=READ_COMMITTED` explicit (defaults drift across drivers).

Monitoring closes the loop: HikariCP JMX/Micrometer metrics (active/idle/pending, usage time, connection creation time) on Grafana — the panels that matter: pending > 0 sustained (pool too small OR slow queries — investigate queries FIRST), active near max at peak (headroom check), connection creation spikes (maxLifetime churn or network flaps). The lesson that sticky: the pool is a queue in front of a shared resource — tune the RESOURCE (query performance) before growing the queue, because the DB's core count, not your pool config, is the real ceiling.

**KEY TERMS TO MENTION:**
- Sizing: cores × 2 heuristic + DB-wide connection budget (all consumers)
- Smaller pool outperforms at core saturation (context-switch thrash)
- connectionTimeout=3s fail-fast; maxLifetime < idle-killers; leak detection
- Fixed-size pool (minimumIdle = max)
- Micrometer panels: pending/active/creation-time and what each diagnoses

**FOLLOW-UP QUESTIONS:**
1. Pool exhausted at peak — grow it or do something else?
2. How does PgBouncer change the math?

**FOLLOW-UP ANSWERS:**
1. Diagnose before growing: pending connections + active-at-max means consumers are HOLDING connections — the leak-detection traces and slow-query dashboard tell you which. Growing the pool moves thrash into Postgres. The sequence: find the slow query/long transaction (the LLM-call-in-transaction bug), fix it, keep pool at 15. Scale the pool only when DB CPU is NOT saturated and pending is real demand.
2. PgBouncer (transaction pooling) multiplexes many client connections onto few DB connections — changes the constraint: app pools can be large because they queue at PgBouncer, but it BREAKS session state (prepared statements need `statement_cache_size=0`/protocol-level Paxos handling, SETs, advisory locks). We didn't need it at 45 connections; the trigger would be Lambda-style fan-out or connection storms, and I know the prepared-statement landmine that comes with it.

**RED FLAGS TO AVOID:**
- maxConnections=100 "more is safer"
- No leak detection, no answer for what pending connections mean
- Ignoring the DB-side budget (instances × pool vs max_connections)

---

### Q6-6: How did you handle database migrations in production with zero downtime
**DIFFICULTY:** Hard
**CATEGORY TAG:** PostgreSQL / DevOps

**ANSWER:**
The zero-downtime migration doctrine is expand-contract, aligned with blue-green deploys: **the schema at any moment supports BOTH the old and new app version**, because during a rolling deploy both versions serve traffic simultaneously. Phase 1 (expand): additive-only migration — new table, nullable column, or backfilled column with default; Phase 2 (deploy): code dual-writes or reads the new shape; Phase 3 (backfill): batched job over existing rows (5k/batch, off-peak, `pg_stat_replication` watched); Phase 4 (switch): reads move to the new shape; Phase 5 (contract): drop old only after traces prove zero references (a usage query on pg_stat_user_tables + code search + a release-cycle wait). Every step reverts cleanly — that's the test of a true zero-downtime migration: can you undo THIS step without data loss?

Postgres-specific hazards I enumerate because interviewers probe them: **locking** — `ALTER TABLE ... ADD COLUMN` with a VOLATILE default rewrites the table (ACCESS EXCLUSIVE for the duration); Postgres 11+ fast-defaults make constant defaults metadata-only, but I still verify with `lock_timeout=2s` + `retry` wrapper on every DDL (a migration queuing behind a long transaction blocks EVERYTHING behind it — the migration-induced outage pattern); **index builds** — `CREATE INDEX CONCURRENTLY` (no table lock, can't be in a transaction, leaves INVALID index on failure — drop and retry; a follow-up validity check in CI); **column type changes** (int→bigint) are table rewrites on large tables — plan as dual-column + dual-write; **statement behavior changes** — `NOT NULL` on a big table = full scan + lock → add as CHECK NOT VALID + VALIDATE CONSTRAINT (short lock) then promote.

Operational guardrails: DDL runs with `statement_timeout` and `lock_timeout` set locally, an advisory lock ensures only one migration process runs (Flyway handles it; we ALSO advisory-lock deploy scripts that touch schema), and every risky migration is rehearsed on a production snapshot with timing recorded — "add index on leads took 38s on snapshot" becomes "safe to run at 02:00" or "needs CONCURRENTLY". Rollback doctrine: additive steps need no rollback; contract steps are the point-of-no-return, so they ship a release AFTER the new code is confirmed stable — never in the same deploy.

**KEY TERMS TO MENTION:**
- Expand → deploy (dual-write) → backfill (batched) → switch → contract
- Schema supports two app versions during rolling deploys
- lock_timeout/statement_timeout on DDL + ACCESS EXCLUSIVE queue awareness
- CREATE INDEX CONCURRENTLY + INVALID-index retry discipline
- CHECK NOT VALID + VALIDATE for constraint adds on big tables
- Snapshot rehearsal with recorded timings

**FOLLOW-UP QUESTIONS:**
1. A migration hangs waiting on a lock — what's happening and what do you do?
2. How do you backfill 50M rows without breaking replication?

**FOLLOW-UP ANSWERS:**
1. Postgres DDL takes ACCESS EXCLUSIVE — it queues behind a long-running transaction AND every query behind the DDL queues behind it: a 30-second report query + a 2-second ALTER = an outage. With lock_timeout=2s the ALTER fails fast instead of joining the queue; we then find the blocking transaction (`pg_stat_activity` + `pg_blocking_pids`), kill or wait it out, retry. That's why every DDL wrapper in our repo has the timeouts baked in.
2. Batched writes (5-10k rows/batch) with a sleep between batches keeps WAL generation under the replica's apply rate — watch `pg_stat_replication` replay_lag live during the job and throttle on it. Trigger-based or logical-decoding CDC backfills are the alternative when cutover must be instant, but batched + lag-watch covers 95% of backfills without new infrastructure.

**RED FLAGS TO AVOID:**
- Schema deploy + code deploy assuming perfect simultaneity
- DDL without lock_timeout (the classic self-inflicted outage)
- Contract (drop) in the same release as the new code

---

### Q6-7: How did you implement partitioning for large tables
**DIFFICULTY:** Hard
**CATEGORY TAG:** PostgreSQL

**ANSWER:**
The tables that outgrow single-table Postgres are the append-heavy history tables: `lead_activity` (~40M rows/year), `communication` (similar), `audit_event`. At ~50M rows, even well-indexed queries degrade (b-tree depth, vacuum time, index bloat), and retention deletes of 30M rows are impossible (lock + WAL + vacuum debt). Native **declarative range partitioning by month** on `created_at`: each month a partition, queries with a time predicate prune to relevant partitions (plans show "Subplans Removed"), and retention becomes `DROP TABLE` — O(1) metadata operation replacing a 3-hour DELETE batch; WAL, vacuum, and bloat all shrink with partition size.

Design decisions worth stating: partition key MUST be in every hot query (we enforce via code review + a query-coverage test — a query without the time range scans all partitions and is worse than before); PK/uniques must include the partition key (`(id, created_at)`) — a real modeling cost, meaning id-only lookups need the created_at too (we embed created_at in cursors and secondary lookup paths); local indexes per partition (monthly `created_at` + `(org_id, created_at)` composites) — global indexes don't exist in Postgres, so cross-partition uniques are impossible by design (acceptable: activity rows are append-only facts, uniqueness is per-event id generated with the row). Partition management is automated: a `pg_partman`-style scheduled job pre-creates next month's partitions (a missing partition = insert failure = page), and detach+archive moves 13-month-old partitions to cold storage (S3 Parquet via a read-model export) before dropping.

The migration story (existing 20M-row table): create partitioned twin → dual-write via trigger/decode or app-level → backfill historical months in parallel → switch reads → drop original. We rehearsed on a snapshot; total cutover ≈ 3 days with zero downtime. When NOT to partition I also answer: tables under ~20M rows (complexity tax > benefit), tables whose access pattern isn't time-shaped (partition by org_id hash ONLY for parallelism — different tool), and anything needing cross-partition unique constraints (it can't work — pick id generation or application-level guarantees).

**KEY TERMS TO MENTION:**
- Declarative RANGE partitioning by month on append-only history tables
- Partition pruning requires the key in every query (enforced by tests)
- PK must include partition key — modeling cost acknowledged
- Retention = DROP partition (vs DELETE batches); pre-created partitions
- Cutover via partitioned twin + dual-write + backfill

**FOLLOW-UP QUESTIONS:**
1. Why not hash-partition by org_id instead — multi-tenancy is your shape?
2. What breaks first WITHOUT partitioning at 200M rows?

**FOLLOW-UP ANSWERS:**
1. Hash-by-org fits isolation (per-org queries prune to one partition) but NOT retention (orgs are immortal, months are not) and creates hot-partition risk (one whale org = one overloaded partition). Our dominant maintenance axis is TIME (drop old data), so time wins; the org filter is served by indexes within partitions. If per-org physical isolation ever becomes a compliance requirement, that's the natural-tenant-sharding conversation — a different project.
2. In order: vacuum takes hours (dead tuples from status updates accumulate), index bloat doubles index size and degrades plans, retention deletes can't complete (lock queues), and autovacuum falls behind permanently — the table enters a death spiral of ever-slower maintenance. It's rarely the SELECTs that die first; it's the housekeeping.

**RED FLAGS TO AVOID:**
- Partitioning a 5M-row table (complexity theater)
- Unique constraints without the partition key (impossible — must know this)
- No automated partition pre-creation (inserts start failing at month boundary)

---

### Q6-8: How did you handle JSON data in PostgreSQL (JSONB)
**DIFFICULTY:** Medium
**CATEGORY TAG:** PostgreSQL

**ANSWER:**
JSONB has one legitimate role in our schema: **schema-flexible metadata** — data whose shape varies per row or evolves faster than release cadence. Concrete uses: `lead.tags` (arbitrary key-value enrichment from scrapers), `integration.sync_state` (per-provider cursor blobs — Gmail sync tokens differ from Twilio's), `audit_event.before_after` (field diffs whose columns vary by entity type), `notification.payload` (channel-specific render data). The pattern I enforce: JSONB columns hold SECONDARY attributes — anything that becomes a first-class query/filter/join target gets promoted to a real column (we've promoted 4 fields out of JSONB so far, each a 3-step expand-contract migration). "Everything JSONB" is the schema-death spiral I actively prevent.

Correct usage mechanics: `JSONB` (decomposed binary, indexable) never `JSON` (text with validation only, re-parsed per access); default `'{}'::jsonb NOT NULL` (null-handling uniformity); writes are read-modify-write at the SQL level with the `||` concat operator (`UPDATE lead SET tags = tags || :delta` — atomic merge, no lost updates under concurrency, since read-modify-write in Java would need a row lock). Indexing matches access: `GIN` with `jsonb_path_ops` (smaller, faster for containment `@>` — our dominant predicate: `WHERE tags @> '{"industry": "dental"}'`), and expression indexes for the two hot scalar paths (`(tags->>'size')` where we filter employees). Validation: a `CHECK (jsonb_typeof(tags) = 'object')` plus application-level schema validation (the DTO layer validates the shape — Postgres can't enforce inner structure portably, so the contract lives in code with tests).

What I deliberately did NOT do: store entity payloads as JSONB "for flexibility" (no FK integrity, no migration tooling, every query is a path expression), use JSONB for relationships (arrays of ids — no referential integrity, no index-correct joins), or let query patterns grow on unindexed paths (monitor `pg_stat_statements` for `->>` filters lacking expression indexes — they seq-scan). The interview frame: JSONB is a tool for the SCHEMA-FLEXIBLE 5%, with the discipline to promote the 5% back to columns as soon as it becomes load-bearing.

**KEY TERMS TO MENTION:**
- JSONB for genuinely variable metadata (tags, sync states, diffs)
- Promotion rule: query/join target → real column (expand-contract)
- `||` atomic merge (no app-level read-modify-write races)
- GIN `jsonb_path_ops` for `@>` + expression indexes for hot paths
- CHECK + DTO-layer validation; never relationships in JSON

**FOLLOW-UP QUESTIONS:**
1. jsonb_path_ops vs default GIN ops — the trade-off?
2. A JSONB field now has 3 hot query paths — migrate or index?

**FOLLOW-UP ANSWERS:**
1. jsonb_path_ops indexes only containment queries (no existence `?` operator, no full-key queries) but produces much smaller, faster indexes for `@>` workloads. Default ops index every key/value pair (bigger, supports more operators). Ours is containment-dominated, so path_ops; the choice is workload-shaped, not fashion.
2. Decision test: is the path STRUCTURAL now (appears in most rows, drives joins/unique logic) or occasional? Structural → promote to column (typed, FK-able, statistics-visible — the planner estimates JSONB paths badly). Occasional-but-hot → expression index is proportionate. Our promoted fields all crossed "structural" — the discipline is honest bookkeeping of which world a field lives in.

**RED FLAGS TO AVOID:**
- JSONB as the default modeling tool (schemaless-everything antipattern)
- Storing relations as id-arrays in JSON
- Unindexed `->>` filters appearing in pg_stat_statements top-10

---

### Q6-9: What is your backup and recovery strategy
**DIFFICULTY:** Medium
**CATEGORY TAG:** PostgreSQL / DevOps

**ANSWER:**
The strategy is expressed as two numbers I commit to: **RPO ≈ 5 minutes** (max acceptable data loss) and **RTO ≈ 30 minutes** (max time to restore service) — because backup design without RPO/RTO is just storage. Mechanism: nightly **base backups** (pgBackRest to S3, checksummed, encrypted) + continuous **WAL archiving** (asynchronous, 5s archive_timeout) enabling **PITR** — restore to any point in the last 30 days. Retention tiers: 7 daily, 8 weekly, 12 monthly (compliance), with S3 object-lock (governance mode) so even compromised credentials can't delete backups inside the window — the ransomware-era requirement interviewers increasingly probe.

A backup is a rumor until restored — the operational core is **automated verification**: weekly, a restore job spins a throwaway instance from the latest base backup + WAL replay to a random timestamp, runs checksum + row-count + app-level assertions (login works, lead counts match source snapshot), and posts a pass/fail report; failed verification pages on-call with the same severity as a failed backup. Cross-region copies (S3 cross-region replication) cover region loss; credentials for the backup store are separate from the production DB credentials (blast-radius isolation).

Recovery drills happen twice a year as game days: simulate "DB dropped at 14:32" — restore to 14:31, replay app traffic against it in a shadow environment, measure actual RTO (our last drill: 22 minutes to restored service, 41 minutes to full app validation — the gap told us to automate the app-side smoke suite into the runbook). Application-level recovery complements DB recovery: the append-only credit ledger means even a 5-minute WAL gap can be reconciled manually from provider webhooks (Stripe replay) — layered recovery, not single-point trust. Secrets, env config, and the infra (Terraform state) are all in backup scope — a DB without its secrets is a paperweight.

**KEY TERMS TO MENTION:**
- RPO 5 min / RTO 30 min (explicit, drilled numbers)
- pgBackRest base + WAL archiving → PITR (30-day window)
- Automated weekly restore-verify (row counts, app smoke)
- S3 object-lock + cross-region + separated credentials
- Semi-annual game days with measured (not assumed) RTO

**FOLLOW-UP QUESTIONS:**
1. WAL archiving fails silently for 6 hours — what contains the damage?
2. Why object-lock on your own backups?

**FOLLOW-UP ANSWERS:**
1. Monitoring is the first control: archive-lag metric + a canary that writes a marker row every minute and verifies its archival (detects silent pipeline death, not just errors). Damage window shrinks from 6h to ~15 min detection. Recovery impact: worst case we lose to the last archived WAL (RPO breach) — the credit-ledger reconciliation plus provider webhook replays recover the money-critical state manually; the runbook has that reconciliation procedure written BEFORE the incident.
2. Ransomware and credential compromise: modern worst-cases delete backups BEFORE encrypting production. Object-lock (governance) makes deletes impossible inside the retention window even with admin S3 credentials; combined with separate backup credentials, the attacker must compromise two independent systems in the same window. It's cheap insurance against the scenario that ends companies.

**RED FLAGS TO AVOID:**
- Backups with no restore testing (the #1 real-world failure)
- No RPO/RTO numbers ("we back up daily")
- Same credentials/region for prod and backups

---

### Q6-10: How did you monitor database performance
**DIFFICULTY:** Medium
**CATEGORY TAG:** PostgreSQL / Observability

**ANSWER:**
Database monitoring has four layers, each answering a different question. **Layer 1 — health**: RDS/CloudWatch basics (CPU, connections, disk, replication lag) with alarms on saturation, not averages (p95 CPU over 10 min, lag > 30s). **Layer 2 — query performance**: `pg_stat_statements` (shared library, not an extension you enable after the fire) is the workhorse — total_time, mean_time, calls, rows per normalized query; a weekly review script pulls top-10 by total time and by mean time into a Slack digest; this list drove most of the optimizations in Q5-13. **Layer 3 — operational internals**: the stats views tell the maintenance story — `pg_stat_user_tables` (seq_scan counts → missing indexes; dead tuples → vacuum debt), `pg_stat_user_indexes` (idx_scan=0 → unused index candidates — every index costs write latency, so pruning is performance work), `pg_stat_activity` snapshots during incidents (wait events — `Lock:transactionid` vs `IO:DataFileRead` tell two different stories immediately), `pg_locks` for lock chains. **Layer 4 — the app's view**: per-endpoint SQL timing via datasource-proxy wrapped in traces (Micrometer → Grafana tempo-style), so "the leads API is slow" resolves to the exact statement in one click — the DB dashboard and the app traces share request-id correlation.

Alert thresholds that earned their keep: long-running transactions > 5 min (they block vacuum → bloat spiral — the silent killer), replication lag > 60s (stale reads on replica-routed traffic), connection usage > 80% (pool math breaking), cache hit ratio < 97% (working set exceeding memory — the pre-症状 of everything getting slower). Two dashboards, not twenty: an "is the DB healthy" exec view (5 panels) and an incident-deep-dive view (stats views + waits + top queries) — dashboards nobody opens are debt. The weekly review meeting (15 min, top-queries digest + schema-health output) is where monitoring becomes optimization — dashboards without a review cadence are decoration.

**KEY TERMS TO MENTION:**
- `pg_stat_statements` top-10 digest as the optimization driver
- Wait-event triage via pg_stat_activity (lock vs IO tells the story)
- Long-transaction alert (vacuum-blocking spiral prevention)
- App-side per-endpoint SQL timing correlated with traces
- Two-purposeful-dashboards + weekly review cadence

**FOLLOW-UP QUESTIONS:**
1. Cache hit ratio is 99% but queries are slow — where do you look?
2. How do you catch a query that got slow only for ONE org's data shape?

**FOLLOW-UP ANSWERS:**
1. Hit ratio is an average — it hides statement-level reality. Order: pg_stat_statements mean-time outliers (which statements), then their EXPLAIN (ANALYZE, BUFFERS) (plans + whether reads hit OS cache vs shared buffers), then wait events (IO waits with high hit ratio = working set churn per query, not global). Also check bloat (dead tuples) — 99% hit on a 5× bloated table is still 5× the pages. Averages comfort; distributions and per-statement data diagnose.
2. Per-statement stats normalize queries, so an org-specific plan flip hides in the mean. The trace layer saves us: per-endpoint, per-tenant SQL timings in traces — filter by org and the slow shape appears. Structural fix for the pattern: partial indexes for the hot org predicate, or query-plan hardening (force_custom_plan for that statement), or the org gets its own read path — per-tenant plan variance is a real multi-tenant DB disease and the monitoring has to be tenant-sliced to see it.

**RED FLAGS TO AVOID:**
- Only infra metrics (CPU) with no pg_stat_statements
- No long-transaction alerting (vacuum spiral invisible until outage)
- Dashboards with no review cadence (monitoring as decoration)

---

### Q6-11: How did you handle transactions across multiple tables (and their anomalies)
**DIFFICULTY:** Hard
**CATEGORY TAG:** PostgreSQL / Transactions

**ANSWER:**
Multi-table writes cluster into three patterns in our system, each with its own discipline. **Pattern 1 — single-service ACID**: the majority (lead + activity + score update in one `@Transactional` service method; default `READ_COMMITTED` — Postgres MVCC gives statement-level snapshots; anomalies at this level are lost updates via read-modify-write, solved by conditional UPDATEs or SELECT FOR UPDATE, covered in Q5-15). The rule that keeps it sane: one transaction per use-case, ALL tables touched by one datasource (we never split a business transaction across two DBs — that's Pattern 3 territory with real costs). **Pattern 2 — transaction + async side effects**: events published for notifications/analytics use `@TransactionalEventListener(AFTER_COMMIT)` — the DB transaction stays atomic; side effects fire only after durability (a notification referencing an uncommitted lead is a support ticket generator). The inverse hazard: AFTER_COMMIT tasks run OUTSIDE the original transaction — if they need their own writes, they open a new transaction and must be idempotent (retry-safe) because they can fail independently.

**Pattern 3 — cross-context writes that CAN'T share a transaction**: e.g. lead stage change (leads schema) + Stripe charge (external, HTTP). The pattern is **local transaction + outbox + compensation**: write the stage change + an outbox row (payment instruction) in ONE local transaction; a relay processes the outbox (calling Stripe, marking outcome); failures produce compensating entries or retries — at-least-once with idempotency keys at each step. This is Saga-lite: we deliberately avoided full distributed-Saga frameworks (orchestration/choreography machinery) because our cross-context flows are few; the outbox table + a state machine column per flow gives auditability (every step is a row) without an orchestration server. Anomaly protections standardized across patterns: all money-adjacent multi-row writes carry idempotency keys (UNIQUE), lock ordering is consistent (Q5-15), and isolation escalations (`REPEATABLE_READ` for the report-vs-write races) are per-method exceptions with a comment explaining the anomaly being prevented — blanket SERIALIZABLE would trade throughput for safety we don't need.

**KEY TERMS TO MENTION:**
- One use-case = one transaction, one datasource (no accidental distributed)
- AFTER_COMMIT events + idempotent consumers (transaction boundary vs side effects)
- Outbox pattern for cross-context flows (local atomicity + relay)
- Conditional UPDATE / FOR UPDATE for READ_COMMITTED anomalies
- Per-method isolation escalation with documented anomaly rationale

**FOLLOW-UP QUESTIONS:**
1. Why is READ_COMMITTED enough — when would you need SERIALIZABLE?
2. Outbox relay crashes after calling Stripe but before marking the row — then?

**FOLLOW-UP ANSWERS:**
1. Our anomalies are lost-update shaped (concurrent balance/deal edits) — conditional UPDATE fixes that at READ_COMMITTED with no snapshot-retry machinery. SERIALIZABLE earns its keep when invariant preservation spans MULTIPLE rows read together (e.g., sum-of-parts budgeting) where predicate locks beat manual guarding; we have one reporting path using REPEATABLE_READ for consistent snapshots. Rule: escalate per-proven-anomaly, with the anomaly documented at the method.
2. The Stripe call carries an idempotency key = outbox row id: relay retries safely (Stripe dedupes), and our reconciliation job matches charge outcomes to outbox rows hourly — the "crashed between two systems" window is exactly what idempotency keys exist for. Without the key, you'd need distributed transactions; with it, at-least-once + dedupe is equivalent and simple.

**RED FLAGS TO AVOID:**
- @Transactional on the controller or a 10-step method (scope sprawl)
- Side effects inside transactions (HTTP/LLM calls holding locks)
- Claiming two-phase commit for cross-service flows (nobody does this in 2026 microservice practice — and monolith shouldn't need it either)

---

### Q6-12: What is your approach to read replicas
**DIFFICULTY:** Medium
**CATEGORY TAG:** PostgreSQL

**ANSWER:**
Read replicas solve read-throughput and analytics isolation, and they introduce one tax: replication lag — stale reads. Our routing philosophy: route by CONSISTENCY requirement, not by habit. **Consistency-required reads stay primary**: anything in a read-after-write flow (save lead → list shows it — the user's own expectations), auth (session/permission checks), payments/billing (money math), and any read inside a write transaction. **Lag-tolerant reads go replica**: analytics dashboards (a 5-second-old chart is correct), admin list views, exports, the search-index backfill, ML scoring batch reads. Implementation: two read paths at the REPOSITORY layer — `@Transactional(readOnly = true)` + replica routing via a `RoutingDataSource` keyed on a `@ReadOnlyRoute` annotation (read-only also gets Postgres `default_transaction_read_only` belt-and-suspenders on that connection pool); primary-only is the DEFAULT, replica is opt-in per method with a comment stating the staleness tolerance — explicit opt-in prevents the classic bug where someone routes a permission check to a lagging replica and a user briefly loses access.

Lag management is operational, not theoretical: replay-lag metric with alerting (> 30s pages), the routing layer refuses replica routing when lag exceeds the method's declared tolerance (fallback to primary — correctness over throughput), and dashboards mark replica-served panels ("data may lag ≤ 60s") so support doesn't chase ghosts. Two extra wins from having a replica: heavyweight reporting queries (weekly digests, CSV exports of 500k rows) stopped touching primary CPU entirely — the p95 of OLTP paths dropped ~12% the week we routed exports; and PITR backstops (streaming replication is NOT a backup — wal_level replica streaming protects against hardware loss, not against a bad DELETE — the DELETE replicates too; that distinction is a favorite interview probe and the reason our backup story (Q6-9) is independent).

**KEY TERMS TO MENTION:**
- Route by consistency requirement: read-after-write/auth/money → primary
- `RoutingDataSource` + explicit opt-in annotation with declared tolerance
- Lag alerting + fallback-to-primary on tolerance breach
- Exports/analytics isolated → OLTP p95 improved ~12%
- Streaming replication ≠ backup (bad DELETE replicates too)

**FOLLOW-UP QUESTIONS:**
1. A user complains their new lead "disappeared" — replica routing bug?
2. When do you add a second replica vs scaling primary?

**FOLLOW-UP ANSWERS:**
1. First check routing annotations on the list endpoint (regression), but the more common cause is a frontend filter/state bug — the diagnosis discipline: reproduce with the request-id (traces show which pool served the read), check lag at that timestamp. Prevention: the read-after-write flows are pinned primary by design; a "disappeared lead" bug class we've engineered out, which is why I'd verify the frontend before blaming the DB layer.
2. Second replica when: replica CPU saturates from analytics growth (its own scaling axis) or when we need geo-locality for a regional team. Scaling primary FIRST is usually wrong — CPU on primary is dominated by WRITES and the writes don't care about replicas; a second replica buys read headroom without the write-path risks of a primary resize (failover, connection storms). The decision matrix is workload-shaped: measure which axis saturates first.

**RED FLAGS TO AVOID:**
- Route-everything-to-replica "for performance" (stale permission reads)
- Treating streaming replication as backup
- No lag awareness in product promises (dashboards claiming real-time)

---

### Q6-13: How did you handle concurrent updates (SELECT FOR UPDATE and friends)
**DIFFICULTY:** Hard
**CATEGORY TAG:** PostgreSQL

**ANSWER:**
Concurrent-update strategy per access shape, because "one tool for everything" is where correctness dies. **Shape 1 — atomic scalar mutation** (balance decrement, counter increment, slot claim): conditional UPDATE — `UPDATE ... SET x = x - :n WHERE id = :id AND x >= :n` — the WHERE is the guard, rows-affected is the verdict, zero locks held beyond the statement; this is 80% of our concurrency and needs no locking machinery at all. **Shape 2 — read-modify-write with business logic between** (admin adjusting credits + tier): `SELECT ... FOR UPDATE` inside a short transaction — lock the row, compute, write, commit (Q5-15's discipline: no external I/O inside). Variants matter: `NOWAIT` for interactive paths (admin UI shows "record busy" instead of hanging), `SKIP LOCKED` for worker-pool claiming (job tables — each worker claims distinct rows without contention), plain `FOR UPDATE` for must-serialize flows. **Shape 3 — multi-row invariants** (org seat limits: count users vs plan cap while inserting): the naive check-then-insert races; our answer is a lock on the PARENT row (FOR UPDATE on organization) serializing seat operations per org — coarse but correct, microseconds of hold; SERIALIZABLE would detect the anomaly too but with retry machinery we don't want here.

Failure modes I engineer against: **deadlocks** — consistent ordering (multi-row ops sort ids; parent-before-child), `lock_timeout=2s` local setting so queues fail fast, and a retry wrapper for 40P01 (deadlock) and 55P03 (lock not available) with jitter + metrics — a rising deadlock rate is a design smell that pages review, not something we swallow silently. **Lost updates via ORM** — the silent variant: two transactions load, both dirty-check, second UPDATE overwrites first's field (last-writer-wins) — mitigated by `@Version` on collaboratively-edited entities (deal notes, lead fields) turning silent loss into explicit 409. **Lock vs snapshot confusion** — FOR UPDATE doesn't stop phantom inserts under READ_COMMITTED (a range claim needs SERIALIZABLE or a constraint); our slot-booking uses the UNIQUE constraint (slot_id unique when booked — partial unique index) as the DB-enforced claim, the same philosophy as idempotency keys: make the constraint express the invariant and concurrency becomes the DB's job, not the application's.

**KEY TERMS TO MENTION:**
- Conditional UPDATE as default (WHERE-guard + rows-affected verdict)
- FOR UPDATE shapes: plain / NOWAIT / SKIP LOCKED per access pattern
- Parent-row locking for multi-row invariants (seat-limit case)
- lock_timeout + deadlock retry + ordering; @Version for lost-update UX
- Uniqueness constraints as concurrency control (slot claim, idempotency)

**FOLLOW-UP QUESTIONS:**
1. Why not SERIALIZABLE everywhere and never think about locks?
2. How does FOR UPDATE interact with the connection pool under load?

**FOLLOW-UP ANSWERS:**
1. SERIALIZABLE's predicate-lock machinery buys correctness at the cost of serialization-failure retries across EVERY transaction — retry storms under contention, throughput cliffs, and a failure mode (40001) that must be handled everywhere. Our anomalies are narrow and row-shaped; targeted tools (conditional UPDATE, @Version, parent locks) fix each with microseconds of cost. Broad isolation is a sledgehammer that also breaks the "one transaction per request" latency budget.
2. Held locks pin connections: a pool of 15 with 10 connections parked on FOR UPDATE means 5 available for everything else — lock-heavy code under load becomes pool starvation that LOOKS like a DB outage. Hence the rules: short transactions, no external I/O inside locks, lock_timeout fail-fast, and pool metrics correlated with lock waits (`pg_locks` + Hikari pending together) — the two dashboards side by side is how you see this failure coming.

**RED FLAGS TO AVOID:**
- Check-then-act in Java with no DB guard (the eternal race)
- SKIP LOCKED without understanding it skips (unprocessed rows vanish silently if the query is wrong)
- No lock_timeout anywhere (one stuck transaction freezes the fleet)

---

### Q6-14: How did you implement audit trails in the database
**DIFFICULTY:** Medium
**CATEGORY TAG:** PostgreSQL

**ANSWER:**
The audit trail has to survive the scenarios it exists for — support disputes, compliance reviews, incident forensics — which makes design constraints clear: append-only, actor-attributed, queryable, tamper-evident. **Storage**: `audit_event` table — id, occurred_at, actor_id, actor_type (user/api_key/system), org_id, action (enum: `LEAD.STAGE_CHANGE`), resource_type + resource_id, before/after JSONB (changed fields only), request_id, ip, outcome. Insert-only enforced by GRANTs: the app's DB role has INSERT/SELECT on audit_event — no UPDATE/DELETE possible at the privilege level; even a compromised app process can't rewrite history (the DB does the enforcing, not discipline). **Capture**: dual-path — AOP `@Audited` aspect for method-level business events (explicit, rich diffs) and Hibernate `@PreUpdate/@PreRemove` entity listeners as a safety net for entity mutations not annotated (catches the intern's new service method writing directly); both funnel into one `AuditWriter` with a bounded async queue (CRITICAL events — auth, billing — write synchronously; HIGH-volume — activity logs — batch async with drop-oldest and a counter that alarms on drops).

**Performance and scale**: audit_event grows ~3M rows/month — monthly range partitions (Q6-7 mechanics), 400-day hot retention then detach → Parquet export → S3 (compliance tier retains 7 years); the hot partition indexes `(org_id, occurred_at DESC)` and `(actor_id, occurred_at DESC)` serve the two real query shapes ("this org's activity", "this user's actions"). **Tamper-evidence**: nightly chained hash (each day's batch hashes the previous day's hash + batch content) written to a separate store and to S3 object-lock — editing any row in the DB breaks the next verification run; not blockchain, but provable integrity with 20 lines of code. **The discipline that makes it valuable**: action taxonomy is curated (an enum reviewed in PRs, not free-form strings), diffs exclude secrets (masker on the way in), and a CI coverage test asserts every mutating service method in billing/auth/admin packages emits audit events — silent gaps, the disease of audit systems, are a build failure here.

**KEY TERMS TO MENTION:**
- Append-only via GRANT design (no UPDATE/DELETE privilege)
- Dual capture: AOP aspect + Hibernate listeners safety net
- Partitioned storage + Parquet/S3 cold tier (7-year compliance)
- Chained-hash tamper evidence + object-lock
- Curated action enum + CI coverage test (gap prevention)

**FOLLOW-UP QUESTIONS:**
1. Async audit writes can drop events — is that acceptable?
2. How would an auditor verify your trail end-to-end?

**FOLLOW-UP ANSWERS:**
1. Tiered acceptability: CRITICAL events (auth changes, credit mutations, permission grants) are synchronous — the transaction waits; a few ms is the price of un-losable evidence where money/identity is concerned. HIGH-volume events (activity tracking) accept bounded loss under extreme load with drop-count alarms — a documented, monitored trade-off. What's NOT acceptable is silent loss of either class; the queue metrics make the loss visible either way.
2. The auditor gets: the schema (privilege matrix showing insert-only), a sample reconciliation (pick a day — event count vs business counts: leads deleted vs DELETE events), the hash-chain verification run live (any tamper breaks the chain), and retention/export manifests from S3. End-to-end verifiability is a design output — if you can't demonstrate it in 30 minutes, the trail isn't audit-grade.

**RED FLAGS TO AVOID:**
- App-level "append-only" with DB roles able to UPDATE (trust-the-code isn't a control)
- Free-form action strings (unqueryable mush in 6 months)
- No tamper evidence and no coverage enforcement

---

### Q6-15: TWISTED — The leads table hits 500M rows. What breaks first, and walk me through the fix sequence.
**DIFFICULTY:** Expert
**CATEGORY TAG:** PostgreSQL / Twisted Scenario

**ANSWER:**
Breakage order at 500M rows (and I've watched the early stages at 50M): **first — maintenance, not queries**. Autovacuum can't keep up (dead tuples accumulate from status updates; vacuum on 500M rows takes hours and can't finish between business-hours churn), index bloat doubles index size, plans degrade subtly (b-tree depth + cached-page misses), and any retention DELETE is now impossible (lock + WAL + replication lag + vacuum debt). **second — the hot queries drift**: the leads-list query still hits its composite index (b-tree lookups degrade gracefully, p50 fine) but p99 climbs (cache misses on cold pages, deep index scans) and COUNT-style aggregations time out. **third — operations freeze**: any DDL (index build) takes hours, reindexing blocks writes for too long without CONCURRENTLY, and a restore (which is a 500M-row replay) exceeds RTO — the backup strategy silently breaks its own promise.

Fix sequence, in cost-benefit order. **Week 1 — stop the bleeding**: identify the top-3 queries by total time (pg_stat_statements); most "big table" pain is 3 queries: fix indexes (partial indexes for hot predicates — `WHERE org_id = ? AND deleted_at IS NULL AND status = 'HOT'` partial index is a fraction of the full-index size), kill scans hidden in dashboards (COUNT(*) replaced by estimate-based counters or exact-count materialized refresh), and set autovacuum per-table aggressive (scale_factor 0.01 on the leads table + fillfactor tuning for HOT updates on status changes). **Month 1 — structural**: archive cold leads (no activity 12 months → detach to archive table/S3; in CRM, 70%+ of rows are cold — the hot working set shrinks 5-10×, and the live table behaves like 50M). **Month 2-3 — partition** (Q6-7 playbook): partitioned twin by month or by hash-of-org if retention isn't the axis, dual-write, backfill, cutover. If TENANT growth (not row growth) drove the 500M — 10k orgs × 50k leads — the honest next step is **tenant sharding** (citus-style distribution by org_id or app-level shard routing), which is a different project with different costs, and I'd present both axes (rows vs tenants) before committing — the diagnosis determines the cure, and the twisted value of this question is exactly that distinction.

**KEY TERMS TO MENTION:**
- Breakage order: vacuum/bloat → p99 drift → operational (DDL/restore) freeze
- Partial indexes + dashboard-COUNT elimination as week-1 triage
- Cold-data archival (70% of CRM rows are cold — shrink the working set)
- Partitioning playbook (twin → dual-write → backfill → cutover)
- Rows-vs-tenants diagnosis: partitioning vs sharding decision

**FOLLOW-UP QUESTIONS:**
1. Archive vs partition — why both?
2. How would you know sharding by org_id is justified?

**FOLLOW-UP ANSWERS:**
1. They solve different problems: archival shrinks the WORKING SET (what queries touch — fixes performance now, reversible), partitioning fixes MAINTENANCE mechanics (vacuum/retention/DDL on the remaining rows — structural, forward-looking). Archival first buys time and measures the true hot set, which then sizes the partitioning correctly — doing partitioning first on 500M rows migrates 350M dead rows you should have archived.
2. Evidence, not vibes: (a) primary CPU/IO saturates AFTER the working-set fixes (archival+indexes) — proving it's genuinely scale, not waste; (b) tenant-skew measured (p95 org size vs mean — if one org is 30% of rows, hash-sharding has a hot-shard problem needing a different key or celebrity-tenant handling); (c) cross-org queries are rare (sharding kills cross-shard joins/transactions — product access patterns must confirm); (d) operational will for shard-aware deploys/rebalancing. Sharding is a one-way door; the burden of proof is on the sharding proposal, always.

**RED FLAGS TO AVOID:**
- Jumping to sharding as the first answer (the trap in the question)
- No maintenance-layer awareness (vacuum/bloat is what dies first)
- Fixes without measurement sequence (pg_stat_statements → archive → partition → shard)
