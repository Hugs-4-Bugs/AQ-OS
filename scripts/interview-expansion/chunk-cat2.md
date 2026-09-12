### Q2-11: How did you handle background jobs (lead scraping, email sending, reminders)
**DIFFICULTY:** Hard
**CATEGORY TAG:** System Design / Spring Batch

**ANSWER:**
Background work falls into three classes in our system, and each has a different execution model. **Short async tasks** (send a notification, invalidate a cache) run in-process via `@Async` on a dedicated `ThreadPoolTaskExecutor` (core 8, max 16, queue 500, `CallerRunsPolicy` so we apply back-pressure instead of dropping work). **Medium workflows** (outreach email sequences, reply classification, reminder dispatch) go through a DB-backed job table (`job` with status, attempts, next_run_at, payload JSONB) polled by a `@Scheduled` worker every 10 seconds with `SELECT ... SKIP LOCKED` so multiple app instances never pick the same job — that's our poor-man's queue before Kafka. **Heavy pipelines** (lead discovery: scrape → enrich → score → persist for 5,000 businesses) run as **Spring Batch** jobs with chunked steps (chunk size 100), restartability via the `BATCH_JOB_EXECUTION` tables, and skip/retry policies (skippable on parse exceptions, retry 3× with exponential backoff on 429s from scraping targets).

The reason for three models is failure semantics. `@Async` work is fire-and-forget — if the JVM dies, the work is lost, so we only use it for tolerable-loss tasks. The job table gives us at-least-once with visibility into stuck jobs (a monitor alerts when any job stays RUNNING > 15 min) and manual replay (a job can be re-queued with one SQL update). Spring Batch gives us commit-interval checkpointing: a 5,000-lead run that dies at row 3,400 resumes from the last chunk, not from zero. All three write structured events to our audit trail so we can answer "what happened to lead X at 14:32" months later.

Scheduling itself is guarded: every `@Scheduled` method in production runs inside a Redis distributed lock (`SET job:reminders NX PX 300000`) so that when we run 3 app instances behind the ALB, only one fires the 8 AM reminder sweep. We learned this the hard way — early on, users got triple reminders until we added the lock.

**KEY TERMS TO MENTION:**
- Spring Batch (chunk-oriented steps, restartability, skip/retry policy)
- DB-backed job table + `FOR UPDATE SKIP LOCKED` polling
- `@Scheduled` + Redis distributed lock for multi-instance safety
- `ThreadPoolTaskExecutor` tuning + `CallerRunsPolicy` back-pressure
- At-least-once delivery, idempotent handlers, dead-job alerting

**FOLLOW-UP QUESTIONS:**
1. Why not Kafka or RabbitMQ from day one?
2. How do you make a job handler idempotent?
3. What happens when a scraping target blocks your worker mid-batch?

**FOLLOW-UP ANSWERS:**
1. Kafka needs a platform team — ZooKeeper/KRaft ops, partition planning, consumer lag monitoring. At our volume (~50k jobs/day peak) a polled table with indexes gives us the same at-least-once semantics with zero new infrastructure, and SQL gives free visibility ("show me all failed jobs last hour"). The design keeps a `QueuePort` interface, so swapping the poller for a Kafka listener is a config change, not a rewrite.
2. Every handler takes a natural idempotency key from the payload (e.g. `outreach_message_id`); before side effects it checks the outcome table — if a row already exists for that key with status SENT, it returns success without re-sending. Side effects themselves are guarded by unique constraints (message-id column UNIQUE) so a double-execution fails cleanly on insert instead of double-sending.
3. The step's retry policy catches the HTTP 429/403, backs off exponentially; after 3 failures the chunk is skipped and recorded, the proxy-pool rotation kicks in for subsequent chunks, and the job finishes PARTIAL with a completion report showing which domains failed. A follow-up job re-runs only the failed domains the next night.

**RED FLAGS TO AVOID:**
- Saying "we use cron jobs" for everything with no failure semantics
- Not knowing your own thread-pool numbers or queue capacity
- Claiming Kafka "for scale" when you can't justify why a table wasn't enough
- Forgetting idempotency — at-least-once without idempotency = duplicate emails to customers

---

### Q2-12: How does the Google Calendar integration work end-to-end
**DIFFICULTY:** Hard
**CATEGORY TAG:** System Design / Third-Party Integration

**ANSWER:**
The meeting scheduler's job is: given a lead says "yes, let's talk", find a slot where *our user* is free, book it, and keep both calendars in sync. The flow: user connects their Google account once (OAuth offline access → we store the **refresh token encrypted** (AES-256-GCM with a KMS-held key) in `calendar_connection`). When a lead accepts a proposed slot, `MeetingService.proposeSlots(user, duration)` calls the Calendar API `freebusy` query for the next 14 days against the user's primary calendar, subtracts busy intervals from working hours (configured per user with timezone from their profile), and generates the top 3 gaps respecting a 45-min buffer between meetings. Each candidate slot is written to `meeting_slot` with status PROPOSED.

The booking step is where concurrency matters: the lead gets a booking page; when they click a slot, we do an atomic claim — `UPDATE meeting_slot SET status='BOOKED' WHERE id=:id AND status='PROPOSED'` and check rows-affected (optimistic claim; only one winner) — then call `calendar.events.insert` with the Google event id stored back on the slot row. If the Google call fails after the DB commit, a compensation job finds BOOKED slots with null google_event_id and retries insertion; if Google says the slot now conflicts, we mark the slot CONFLICT and email both parties an apology + new proposals. Both parties get ICS attachments and Google-native invites, so declines propagate back.

Sync is push-based: we register a **Google Calendar watch channel** (PubSub push notification to our `/api/calendar/webhook`). On any change, we re-fetch the changed window via `events.list` with `syncToken`, update our cached busy map in Redis (TTL 30 min, also a read-through cache for `freebusy`), and if an external conflict cancels a booked meeting, we trigger the rescheduling flow automatically. Token lifecycle is handled by a `@Scheduled` sweeper that refreshes tokens expiring within 24h, so users never hit an auth failure mid-booking.

**KEY TERMS TO MENTION:**
- OAuth offline access, encrypted refresh tokens
- `freebusy` API + working-hours subtraction + timezone handling
- Optimistic slot claim (conditional UPDATE, rows-affected check)
- Google watch channels (PubSub push) + `syncToken` incremental sync
- Compensation flow for distributed-write failure (DB committed, Google failed)

**FOLLOW-UP QUESTIONS:**
1. Two leads click the same slot simultaneously — what actually happens?
2. Why store refresh tokens encrypted — they're already OAuth tokens?
3. What if the user's calendar has an event with "free" visibility?

**FOLLOW-UP ANSWERS:**
1. Both requests run the conditional UPDATE; PostgreSQL row-locks the slot row, the second UPDATE matches zero rows (status is no longer PROPOSED), and that request gets a 409 + the next-best slot. The Google insert happens only for the winner. This is the same pattern as our credit deduction — DB-level atomicity, not application-level locks.
2. A refresh token is a permanent credential to the user's calendar — a DB leak would expose every connected user's calendar read/write. We encrypt at rest with envelope encryption, and the encryption key lives outside the DB (env/KMS), so a DB dump alone is useless. Audit logging records every token decryption with the purpose.
3. `freebusy` returns only time blocks, not event details, and respects the event's transparency setting — events marked "free" (transparent) don't block. We also let users overlay external busy maps with per-calendar inclusion toggles. Edge case: recurring events expand — freebusy handles expansion server-side, but we cap the query window at 14 days to keep the response bounded.

**RED FLAGS TO AVOID:**
- Storing access tokens and assuming they never expire
- Claiming the slot in memory or in the DB only without the Google call compensation story
- Ignoring timezones — the classic "meeting at 3 AM IST" bug
- Polling the Calendar API every minute instead of push watch

---

### Q2-13: How did you design the credit/usage system (metering)
**DIFFICULTY:** Expert
**CATEGORY TAG:** System Design / Billing

**ANSWER:**
Credits are the internal currency: every AI action (email generation, lead scoring, website analysis) costs a configured amount, defined in a `credit_cost` table so product can change prices without deploys. The invariant the system must guarantee: **a user can never spend more credits than their balance, even under concurrent requests** — overspending means we rendered an AI response for free and under-billing compounds. The design: balances live on `user_account.credits` (denormalized for read speed) with an append-only `credit_ledger` table as the source of truth (every debit/credit is a row with reason code, reference id, balance_after). Reads show the denormalized balance; every mutation writes the ledger first-class.

Deduction is atomic at the SQL level: `UPDATE user_account SET credits = credits - :cost WHERE id = :id AND credits >= :cost` — the `credits >= :cost` predicate makes the row itself the guard. Rows-affected = 1 means the spend succeeded; 0 means insufficient balance → we throw a domain exception mapped to 402 Payment Required. Under concurrency PostgreSQL serializes the row update, so two parallel deductions each see a consistent state — no read-modify-write race. For multi-step AI flows (deduct, then call LLM, then persist message) we deduct in the caller's transaction with the ledger row carrying an idempotency key (`ref_type + ref_id` UNIQUE); if the LLM call fails, a compensating ledger entry refunds within the same use-case transaction, so the balance never leaks.

Monthly reset and grants run as `@Scheduled` jobs using the same ledger API — reset is just a ledger entry "MONTHLY_GRANT" + balance update per active user, chunked through a job table. Admin adjustments also go through the ledger with a reason code, so support disputes are auditable end-to-end: "why did user X lose 50 credits on the 3rd?" is one SQL query. Stripe purchase top-ups arrive via webhook → ledger credit with the Stripe session id as idempotency key (replayed webhooks are no-ops). This ledger pattern is the same idea as double-entry bookkeeping — the balance is derivable by summing the ledger, and we run a nightly reconciliation job that asserts `sum(ledger) == balance` per user and alerts on drift.

**KEY TERMS TO MENTION:**
- Conditional atomic UPDATE as the balance guard (no SELECT-then-UPDATE race)
- Append-only credit ledger (source of truth) + denormalized balance for reads
- Idempotency key on ledger entries (ref_type + ref_id UNIQUE)
- Compensating refund entry on downstream failure
- Nightly reconciliation job (ledger sum vs denormalized balance)

**FOLLOW-UP QUESTIONS:**
1. Why pessimistic locking via conditional UPDATE instead of `@Version` optimistic locking?
2. What if the AI call succeeds but the process dies before persisting — user lost credits?
3. How would you migrate this to support team/shared org credit pools?

**FOLLOW-UP ANSWERS:**
1. Optimistic locking retries on conflict — fine for low contention, but hot users (bots, bulk uploads) retry loops add latency and we still need the "insufficient balance" distinction. The conditional UPDATE gives both the atomicity and the business check in one statement with zero retries. We do use `@Version` on entities where conflicts are genuine edit-collisions (deals), not balance decrements.
2. That's the exact reason the ledger has an idempotency key: the request handler reserves the deduction first (PENDING entry), the AI call runs outside the transaction (long), and the message persistence confirms the entry (POSTED). A sweeper reaps PENDING entries older than 5 minutes: if the AI provider call can be verified (we log provider request ids), we refund; the user never permanently loses credits for our crash.
3. Move the balance columns to `organization` and keep user-level spend attribution in the ledger rows (user_id on every entry). The conditional UPDATE then guards org balance; per-user quotas become a second check (aggregate ledger query for the current period, cached in Redis with a short TTL). The ledger schema doesn't change — that's the payoff of designing it append-only from day one.

**RED FLAGS TO AVOID:**
- SELECT balance → check in Java → UPDATE (classic race condition answer)
- Mutable balance with no audit trail — support nightmares
- Deducting inside the same transaction as a 10-second LLM call (long lock hold)
- Not having an answer for refunds/idempotency — real billing systems live on this

---

### Q2-14: Your notification system works for 3k orgs — redesign it for 100k orgs sending 10M notifications/day
**DIFFICULTY:** Expert
**CATEGORY TAG:** System Design / Twisted Variant

**ANSWER:**
The current design (in-process `@Async` fan-out + job-table queue + direct channel calls) breaks at three points: the fan-out competes with request threads on the same JVM, the polled table becomes the hottest table in the DB, and a channel outage (Twilio slowdown) backs up the whole pipeline. The 100k-org redesign separates concerns into stages. **Ingestion**: API writes a `notification` row (status QUEUED) and publishes to Kafka topic `notifications.outbound` (partition key = org_id for per-org ordering); the API returns 202 immediately — no channel call on the request path. **Dispatch**: a consumer group (3-6 pods, one partition per hot org) applies per-org rate limits (Redis token bucket: e.g. 50/min/org for WhatsApp), renders templates, and writes to `notifications.dispatching` with the channel provider call wrapped in Resilience4j (circuit breaker per channel, bulkhead isolating WhatsApp from email so one slow provider can't starve the rest). **Receipts**: provider webhooks (Twilio, SES) update delivery status through a dedicated consumer — status transitions are an append-only state machine (QUEUED → DISPATCHED → DELIVERED/BOUNDED/FAILED), which makes analytics a simple stream aggregation.

Persistence changes too: the `notification` table at 3B rows/year moves to monthly partitions with a 13-month retention (older partitions archived to S3 Parquet for analytics); the job-table queue is retired (Kafka is the queue); deduplication uses a Redis Bloom filter front-door (user+template+dedup-window) to cut accidental duplicate storms before they consume queue throughput. Delivery-time SLO (p95 < 30s from accept to provider-handoff) is enforced via consumer lag alerts (Kafka consumer lag > 5 min pages on-call) and per-channel success-rate dashboards.

The invariant I'd protect through the migration: at-least-once + idempotent handlers, exactly as today — providers themselves dedupe on our client message ids, so a redelivered Kafka record never double-sends. And the migration itself is the strangler pattern: route 5% of orgs through the new pipeline behind a feature flag, compare delivery latency + loss metrics, ramp to 100%, then delete the old poller.

**KEY TERMS TO MENTION:**
- Kafka partitioning by org_id (ordering + parallelism)
- Bulkhead + circuit breaker per channel (isolation of provider failures)
- Partitioned notification table + S3 archive (lifecycle)
- Consumer lag as the scaling signal; token-bucket per-org rate limits
- Strangler-fig migration behind feature flag

**FOLLOW-UP QUESTIONS:**
1. Why Kafka partitions per org — what breaks if a partition is hot?
2. How do you guarantee a notification is never lost during a consumer crash?
3. What's your dedup window and how do you choose it?

**FOLLOW-UP ANSWERS:**
1. One org doing 500k sends/day would serialize behind one partition. Mitigation: composite key `org_id + campaign_id` for fan-out-heavy orgs (ordering only matters within a campaign), and split-to-more-partitions runbook since we control producer keys. Hot-partition alerting is on write throughput per partition.
2. Consumer commits the offset only after the provider handoff is durably recorded; a crash before commit = redelivery = handler idempotency (client message id UNIQUE at provider). Lost-notification risk is actually on the ingest side — so ingest writes to Kafka AND the DB row in the same request (DB is the reconciliation source; a hourly job re-enqueues QUEUED rows older than X that never got a DISPATCHED event).
3. Dedup window is per-template semantics: OTPs are 60s (a resend must go through), marketing is 24h, transactional receipts are never deduped (losing one is worse than doubling). The window is a column on the template, not a global constant — because the cost of a duplicate and the cost of a loss differ per notification type.

**RED FLAGS TO AVOID:**
- Jumping to "just add Kafka" without saying what breaks today
- Per-channel isolation forgotten — one Twilio outage freezing all email
- No mention of partitioning/archival — 10M/day = 3.6B rows/year
- Claiming exactly-once without idempotency plumbing to back it

---

### Q2-15: TWISTED — Users received the same outreach email twice this morning. Walk me through your live debugging from API call to DB row.
**DIFFICULTY:** Expert
**CATEGORY TAG:** System Design / Debugging Scenario

**ANSWER:**
I'd structure this as containment → hypothesis tree → evidence. **Containment first**: pause the outreach dispatcher (flip a feature flag / `UPDATE job SET status='PAUSED' WHERE type='outreach'`) — a duplicate-send bug burns user trust with every minute, and pausing is one action, reversible. Then scope: is it one user or a pattern? Query `lead_communication` for messages where the same `(lead_id, template_id)` appears twice within a short window — GROUP BY to see if duplicates cluster on one worker, one time window, or one channel.

The hypothesis tree for duplicate sends, ordered by prior probability: (1) **at-least-once redelivery without idempotency** — a job retried after a timeout whose success actually landed (we send, the SMTP call times out at 30s, the job framework marks FAILED and retries, but the first send actually went through — the classic distributed-systems false-negative); (2) **a deploy restart racing an in-flight batch** — `@Async`/queue messages in memory lost their state machine and got re-enqueued; (3) **a unique-constraint regression** — someone dropped the `(lead_id, message_key)` uniqueness in a migration, so double-insert now succeeds silently. Evidence for each: check the job execution rows for the affected messages (two executions for one job id → redelivery), check deploy timeline vs duplicate timestamps, and `information_schema` for the constraint still existing.

The actual incident we had was (1): the Gmail send had a 30s timeout but Gmail's p99 is 28s — retries under load turned latency into duplicates. Fix was three layers: client-generated idempotency key (`message_key` = UUID generated at enqueue, passed as the SMTP custom header and stored UNIQUE in DB), timeout raised to 60s with the circuit breaker absorbing provider slowness, and a reconciliation query that runs every 5 min matching provider message-ids back to DB rows so a "FAILED" job whose send actually landed gets marked SENT, not retried. Postmortem action: added a synthetic test that injects provider latency > timeout to prove the pipeline stays duplicate-free.

**KEY TERMS TO MENTION:**
- Containment before diagnosis (pause dispatcher, then investigate)
- At-least-once delivery + false-negative timeout = the classic duplicate
- Idempotency key end-to-end (enqueue → DB UNIQUE → provider header)
- Evidence from job-execution rows, deploy timeline, constraint inspection
- Reconciliation job as the safety net

**FOLLOW-UP QUESTIONS:**
1. Why not just make SMTP sends idempotent at Gmail's side?
2. How do you write the postmortem — what's the format?
3. Could this have been caught in staging?

**FOLLOW-UP ANSWERS:**
1. You don't control the provider — Gmail has no idempotency API for send. The idempotency must live on OUR side: we decide the key, we enforce the UNIQUE constraint, and we treat the provider as a black box that may or may not have executed any given attempt. That's the general rule for every external call in the system.
2. Timeline (detection → containment → root cause), impact (users affected, duplicate count), root cause chain (why the timeout allowed false negatives, why no idempotency existed), what worked (flag-based pause took 2 min), and action items each with an owner and a verification test — a postmortem without a regression test is a wish list.
3. The load tests hit throughput but not latency-injection — that's the gap. Since the incident, staging runs k6 with fault injection (toxiproxy adding 35s latency to SMTP) so the false-negative path is exercised on every release candidate.

**RED FLAGS TO AVOID:**
- Debugging before containing — more duplicate emails while you read logs
- Guessing a root cause without evidence from the job/deploy data
- Fixing only the symptom (retrying less) instead of adding idempotency
- No postmortem/regression-test story — interviewers want systemic fixes
