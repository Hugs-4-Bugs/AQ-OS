### Q11-2: How did you containerize the application (Docker for Spring Boot)
**DIFFICULTY:** Medium
**CATEGORY TAG:** DevOps

**ANSWER:**
Multi-stage Dockerfile with layered-jar extraction — the two things that separate a real production image from a tutorial. **Stage 1 (build)**: `maven:3.9-eclipse-temurin-17` — `mvn -DskipTests package` + `jarmode=layertools` extraction (BOOT-INF/layers.idx splits dependencies/ snapshot-dependencies/ application/ into image layers). **Stage 2 (runtime)**: `eclipse-temurin:17-jre-jammy` (JRE only — 60% smaller than JDK, smaller CVE surface), non-root user (uid 10001 — the image runs as nobody-writable filesystem; a container escape lands on a user with no home), and dependency layers copied FIRST so dependency-only rebuilds (90% of builds) push one thin layer — registry storage and pull times drop accordingly. JVM flags in the image: `-XX:MaxRAMPercentage=75` (container-memory-aware heap — the hard-coded `-Xmx2g` on a 3GB container is the OOMKill tutorial), `-XX:+UseG1GC`, `-XX:MaxGCPauseMillis=200`, and `JAVA_TOOL_OPTIONS` left open for env-level overrides.

Build/push mechanics: CI builds with the Spring Boot buildpack alternative NOT chosen (jib/Dockerfile debate — we chose Dockerfile for transparency; jib's daemonless builds are genuinely nice, the ADR records both); images tagged with git SHA + semver (never `latest` in deploys — the roll-back story needs immutable tags); SBOM generated (syft) + scanned (trivy) in CI — CRITICAL CVEs fail the build with a waiver path (documented, expiring); and `.dockerignore` (target/, .git, node_modules of the frontend) keeping context uploads fast. Runtime posture: `readOnlyRootFilesystem: true` with tmpfs mounts for /tmp (Hikari/Java need scratch space), healthchecks hitting the management port, `stopGracePeriod` tuned to the executor drain window (30s — Q3-9's graceful shutdown), and resource limits matching the JVM (memory limit = heap ÷ 0.75 + 512MB metaspace/stack headroom — the container JVM memory contract, which I can draw: heap + metaspace + code cache + threads + direct buffers ≤ limit, or the kernel kills you).

**KEY TERMS TO MENTION:**
- Multi-stage + layertools layered jars (thin dependency-only pushes)
- JRE-only, non-root, readOnlyRootFilesystem + tmpfs
- MaxRAMPercentage (container memory contract: heap+non-heap ≤ limit)
- SHA + semver tags (immutable, rollback-able), never latest
- SBOM + trivy scan in CI with waiver discipline

**FOLLOW-UP QUESTIONS:**
1. Why did your container get OOMKilled with -Xmx set below the limit — real story?
2. Dockerfile vs Jib vs Buildpacks — defend the choice.

**FOLLOW-UP ANSWERS:**
1. It did: heap was 2g in a 2.5g container — heap fit, but metaspace (200m) + code cache (100m) + thread stacks (200 threads × 1m) + direct buffers (NIO/HTTPS) blew past. The kernel OOMKills on TOTAL process memory, not heap. Fix: MaxRAMPercentage=75 + thread-pool sizing review (the async pools were over-provisioned) — the lesson is the JVM memory map, which I can sketch, and it's why "Xmx below limit" is necessary-not-sufficient.
2. Dockerfile won on: auditability (every layer reviewable in the PR), zero build-plugin magic, portability across CI systems. Jib would remove the Docker daemon dependency and speed builds ~20%; buildpacks give auto-base-image patching (real security value). If CI were slower or daemon management painful, jib; if platform-team-run, buildpacks. Choice recorded with revisit criteria — that's the ADR habit I'd bring to any team.

**RED FLAGS TO AVOID:**
- Root user + latest tag + hardcoded Xmx (the trifecta of tutorial images)
- No memory-contract awareness (heap ≠ container memory)
- Single-stage builds shipping JDK + build tools to prod

---

### Q11-3: What is your CI/CD pipeline (walk it stage by stage)
**DIFFICULTY:** Medium
**CATEGORY TAG:** DevOps

**ANSWER:**
GitHub Actions, two pipelines: PR pipeline (gate) and main pipeline (release). **PR pipeline** (~9 min, parallelized): compile + static analysis (SpotBugs, checkstyle, ArchUnit embedded in tests) → unit tests (parallel shards) → integration tests (Testcontainers: Postgres, Redis, WireMock) → OpenAPI diff + contract tests (oasdiff + consumer packs) → image build + trivy scan → a preview environment deployed per-PR (ephemeral namespace, seeded data, auto-URL in the PR — reviewers click, not checkout). **Main pipeline** (on merge): the same gates re-run (merge queue prevents drift between PR-validated code and merged head) → image push (SHA tag) → **staging deploy** → staging smoke suite (API contracts, payment sandbox flow, auth flow — Playwright + API-level) → manual approval gate (1 senior) → **production deploy** — rolling (K8s: readiness gates + maxUnavailable=0), then **post-deploy verification**: the canary checks (synthetic transactions: login, lead-create, webhook replay) run for 10 min against prod; failure = auto-rollback (rollout undo) + page. Total main-pipeline ~25 min to prod, ~35 min to verified.

The design principles behind it: **fast feedback wins over completeness** — PR pipeline is tuned to 9 min (test sharding, Testcontainer reuse, gradle/mvn cache) because 30-minute PR pipelines train engineers to batch changes (the true enemy of quality); **the pipeline is code-reviewed like code** (workflow changes in PRs, no push-to-main edits — supply-chain hygiene: pinned action SHAs, minimal token scopes, no secrets in PR-fork contexts); **every deploy is rollback-ready** (migrations forward-only BUT expand-contract means the previous image runs on the new schema — the invariant that makes rollback a 30-second operation, Q6-6); **databases are the only stateful hazard** — the pipeline REUSES the deploy-time migration run (Flyway at boot) and gates deploys on a migration-dry-run stage (the risky-DDL checklist runs in staging first). Metrics about the pipeline itself (duration trend, flake rate per suite, deploy frequency, change-failure rate — DORA basics) are on the team dashboard: a flaky integration suite gets a maintenance ticket automatically at > 2% flake, because a flaky gate trains people to retry-past-failure, which kills the gate's meaning.

**KEY TERMS TO MENTION:**
- PR gate (9 min, parallel, preview envs) vs main release pipeline (staging → approval → rolling prod → canary verify)
- Merge queue + re-run gates (no drift)
- Supply-chain hygiene: pinned SHAs, scoped tokens, workflow-as-code
- Rollback-ready invariant (expand-contract + previous image on new schema)
- DORA metrics + auto-ticketed flaky suites

**FOLLOW-UP QUESTIONS:**
1. Your canary failed 10 minutes after deploy — walk me through the next 10 minutes.
2. Why a manual approval gate if you have automated verification?

**FOLLOW-UP ANSWERS:**
1. Auto-rollback fires immediately (the rollout undoes; the flag-based features mean user-visible state is mostly unchanged), the migration question is checked FIRST (did this deploy migrate? if yes — is the previous image compatible? expand-contract says yes, verified by the pipeline's compatibility stage), canary traces get pulled (which synthetic failed and WHY), and the incident channel gets a timeline. Total: rollback at min 11, RCA draft by min 20. The deploy that failed becomes a PR with the canary evidence attached — the pipeline's job is to make failure cheap and legible, not rare by gate-theater.
2. The gate isn't a rubber stamp for "does it work" (automation answers that) — it's the human checkpoint for JUDGMENT calls automation can't make: is this the right WEEK to ship a billing change (business timing), is the on-call staffed for a risky-but-passing deploy, does this interact with the incident from yesterday. Fully-automated deploys are the end-state for low-risk paths (we auto-deploy frontend-only changes); the approval is scoped to risk class, documented, and shrinking as canary coverage grows — the trend line matters more than the gate.

**RED FLAGS TO AVOID:**
- 30+ min PR pipelines with no sharding story
- Deploys without automated post-deploy verification + rollback
- Manual workflow edits on main (supply-chain sloppiness)

---

### Q11-4: How did you deploy on AWS — the actual topology
**DIFFICULTY:** Medium
**CATEGORY TAG:** DevOps / Cloud

**ANSWER:**
The topology, tier by tier: **edge** — Route53 → CloudFront (static assets + frontend; the API goes direct to the ALB for websockets) → AWS WAF (volumetric rules + bot control) → ALB (TLS termination, path routing: `/api/*` → app target group, management port in an internal-only target group). **Compute** — ECS Fargate (3+ tasks, 2 vCPU/3GB, auto-scale on CPU 60% + request-count target tracking; Fargate over EKS chosen for ops-weight: 6 engineers don't run a control plane — the K8s migration trigger is in the ADR: multi-service orchestration needs if microservices extraction proceeds); tasks run in private subnets, egress via NAT gateway. **Data** — RDS PostgreSQL (Multi-AZ, db.m6g.xlarge, read replica for analytics, automated backups + PITR per Q6-9) in private subnets with security-group chaining (only the app SG can reach 5432 — no SG-wide opens); ElastiCache Redis (replication group, Multi-AZ) for cache/session tiers; S3 for object storage (uploads, backups with object-lock, archives) + lifecycle rules. **Secrets** — Secrets Manager + IAM roles (task roles grant least-privilege access per service — the app role reads its secret path and nothing else; instance profiles never hold DB creds). **Async** — SQS for the low-volume queues we didn't build Kafka for (email bounce events), EventBridge for cron-like triggers where ECS-scheduled tasks don't fit.

The networking discipline: three-subnet VPC design (public: ALB/CDN origins only; private-app: tasks; private-data: RDS/Redis — data tier has NO route to the internet, not even NAT), VPC endpoints for S3/Secrets (traffic never leaves the AWS backbone — latency + security), and flow logs → CloudWatch for audit. Cost-shaping (interviewers increasingly ask): Fargate right-sizing from CloudWatch p95 memory (we resized 4GB→3GB saving 25% with headroom data), NAT gateway was the surprise line item (VPC endpoints killed 40% of it), S3 lifecycle tiers archives to Glacier after 90 days, and the RDS replica exists for both performance AND the analytics isolation that lets the primary stay right-sized. Everything is Terraform (modules per tier, state in S3 + locking) — the `deploy/terraform` in the repo is real: an engineer can rebuild the environment from code, which is the actual disaster-recovery plan beneath the backup plan.

**KEY TERMS TO MENTION:**
- Route53 → CloudFront/WAF → ALB → ECS Fargate (auto-scale) → private data tier
- SG-chaining + three-subnet design + VPC endpoints (no internet route for data)
- RDS Multi-AZ + replica; ElastiCache Multi-AZ; S3 lifecycle/object-lock
- Task-role least privilege; Secrets Manager
- Terraform-everything (rebuildable env = the DR layer under backups)

**FOLLOW-UP QUESTIONS:**
1. Why Fargate over EKS — and what flips the decision?
2. Your AWS bill doubled month-over-month — debug walk-through?

**FOLLOW-UP ANSWERS:**
1. Fargate: no control-plane ops, per-task pricing, simpler IAM — right for a monolith + few workers at our scale. EKS flips when: service count grows (the Q10-3 extraction path), we need service-mesh/advanced traffic policy, GPU/daemonset workloads, or multi-team namespace governance. The ADR holds both the current choice AND the trigger conditions — cloud decisions are pricing-and-team-shape decisions, revisited on evidence.
2. Cost explorer grouped by service → tag, then diff the delta: usual suspects in order — data transfer (a new cross-AZ chatter: the analytics job moved to same-AZ reads or got a VPC endpoint), NAT processing (a new pod egressing to internet — S3 access without endpoint), logs (a DEBUG flag left on — the ELK volume graph shows it instantly), autoscaling thrash (scale-policy oscillation — target-tracking cooldown misconfigured). The discipline: costs are tagged by service + env from day one (Terraform defaults), so "what doubled" is a GROUP BY, not archaeology. We've run this play for real on the NAT line item.

**RED FLAGS TO AVOID:**
- Public-subnet databases ("it has a security group" — no)
- Untagged resources (cost and audit blindness)
- Console-clicked infrastructure (no Terraform = no DR, no review)

---

### Q11-5: How did you manage environment-specific configurations
**DIFFICULTY:** Easy
**CATEGORY TAG:** DevOps / Spring Boot

**ANSWER:**
The configuration matrix has three axes — environment (dev/staging/prod), sensitivity (public/internal/secret), and change-rate (immutable-per-deploy/runtime-tunable) — and each cell has a home. **Environment diffs** live in `application-{profile}.yml` for non-secret infra shaping (pool sizes, log levels, provider endpoints — staging points at sandbox providers) with parity discipline (same image, different profile — Q3-17); **secrets** never touch git — Secrets Manager → sidecar → env (Q3-19), rotated per policy; **public config** (feature-flag defaults, API base URLs baked for the frontend) ships in the image; **runtime-tunable behavior** lives in the DB-backed feature-flag/admin-config service (changes without deploy, audited, rolled back in the UI — the "tune the rate limit at 3 AM" path). Drift control: the actuator `/env` endpoint (sanitized) is hashed into a config-fingerprint per instance — a Grafana panel alerts when instances of one service diverge (stuck rollouts, hand-edits), and a daily job diffs effective config against git (the "someone edited it live" detector).

Per-environment bootstrap is scripted: `make setup` (dev: Docker Compose Postgres/Redis, Flyway, seed data — Q1-15's onboarding flow), staging deploys the same image with a profile + sandbox credentials, prod adds the approval gate. The subtle one I emphasize: **config-as-frontend-contract** — the React app gets its API base/feature exposure via a `/api/config` bootstrap endpoint (server-rendered from flags) rather than build-time env baking — one image serves all envs, and config changes reach the frontend without rebuilds; the build-time-bake pattern (REACT_APP_* at build) was rejected because it forks images per env and breaks the staging-parity invariant. Validation closes the loop: boot-time `EnvironmentPostProcessor` gates (named errors on missing vars per profile), the secret-source audit (a known-secret resolved from a non-secret source fails boot — Q3-19), and the config-change runbook (which changes are deploy-gated vs flag-flippable is documented per config key — the operations team knows the blast radius before touching anything).

**KEY TERMS TO MENTION:**
- Three-axis config matrix (env × sensitivity × change-rate) with a home per cell
- Profile yml for infra shaping; secrets via Secrets Manager; flags for runtime behavior
- Config-fingerprint drift panel + daily git-diff job
- `/api/config` bootstrap over build-time env baking (one image, all envs)
- Boot-time named-error validation + secret-source audit

**FOLLOW-UP QUESTIONS:**
1. A config change caused an incident — how does your system limit that class?
2. How do you onboard a new environment (a client's dedicated deployment)?

**FOLLOW-UP ANSWERS:**
1. Three layers: the change itself is flag-gated where possible (flags roll back in seconds, no deploy), the exposure is canary'd (flag rollouts step 5% → 50% with error-rate watch), and the drift-fingerprint panel catches out-of-band edits (the human-touching-prod-yml scenario) within a day. Post-incident, the config key gets a documented blast-radius note — the runbook learns per key. Config incidents are usually process incidents wearing a config costume.
2. The Terraform modules take a variable set (region, sizing tier, domain, provider keys) and emit the whole stack; the new env gets: its profile yml (diffs only — parity defaults), its Secrets Manager prefix, its sandbox/provider credentials, a smoke-suite run against it, and a parity check (the config-diff job compares effective config shape vs prod — missing keys fail, not silently default). Day-one cost ~1 day of engineering; that's the payoff of config discipline compounding.

**RED FLAGS TO AVOID:**
- Environment logic in if-statements scattered in code (vs profiles/flags)
- Build-time-baked frontend config (image forks per env)
- No drift detection (hand-edits and stuck rollouts live forever)

---

### Q11-6: How did you implement health checks (liveness/readiness/startup)
**DIFFICULTY:** Easy
**CATEGORY TAG:** DevOps / Spring Boot

**ANSWER:**
Three probe types, three different questions, three different behaviors — conflating them is the classic K8s outage. **Liveness** (`/actuator/health/liveness`): "is the JVM wedged?" — answers UP if the process responds; NO dependency checks (a Redis outage must not restart pods — restarts fix nothing and churn the fleet; the one exception: an OOM-deadlocked executor set trips a custom liveness guard — self-detected heap-lessness, where restart IS the fix). **Readiness** (`/readiness`): "can I serve traffic?" — aggregates DB (validation query), Redis ping, disk space (upload scratch), job-poller lag (custom), cache-warm flag (boot gate, Q10-7); false → ALB/K8s pulls the instance from rotation — dependency outage drains traffic WITHOUT restarting anything. **Startup** (`/startup`): guards the boot window — failureThreshold × period accommodates the warm-up sequence (Flyway on a big migration can take minutes; without a startup probe, the liveness probe would kill a HEALTHY-but-migrating pod in a loop — the classic Flyway-plus-K8s self-destruction).

K8s/ECS wiring: probes on the MANAGEMENT port (internal-only target group, Q3-18), liveness `periodSeconds=10, failureThreshold=3` (30s to declare wedged — balance: fast detection vs GC-pause false positives; G1 pause target 200ms makes 10s generous), readiness `periodSeconds=5` (drain latency is user-facing), and the ECS variant: ALB health checks = readiness, no liveness equivalent (ECS restarts on task failure — the checks that matter are the ALB's + the service's own watchdog). The subtlety that shows depth: **readiness during deploys** — the new version's readiness includes the cache-warm flag, so traffic shifts only to warm instances (the cold-start p95 spike eliminated at the load-balancer layer, not by hoping); and **readiness flapping** — a dependency flapping at 80% success made an instance flap in/out of rotation historically (user-visible 502 blips); the fix was hysteresis in the custom indicators (consecutive-failure counting — 3 strikes over 15s before going unready) because binary flapping is worse than degraded-but-stable.

**KEY TERMS TO MENTION:**
- Liveness (process-only, no deps) vs readiness (deps + warm-up) vs startup (boot window guard)
- Flyway-migration + liveness-probe self-destruction scenario
- Management-port separation; probe timing knobs with GC-pause awareness
- Cache-warm readiness gate (cold-start spike eliminated at the LB)
- Hysteresis against readiness flapping (consecutive-failure counting)

**FOLLOW-UP QUESTIONS:**
1. All instances go unready simultaneously (Redis down) — what does the user see?
2. Would you make readiness include the AI provider's health?

**FOLLOW-UP ANSWERS:**
1. The fleet drains to zero → ALB 502/503s — this is exactly why readiness ≠ availability for DEPENDENCY outages: if EVERY instance shares the dependency, readiness gating is fleet-wide self-DoS. Our answer is tiered: hard-dependency (DB) unready is correct (we can't serve), soft-dependency (Redis) readiness reports DEGRADED-but-UP (serve with fallbacks — Q7-8's design), so a Redis outage degrades latency, not availability. The probe semantics per dependency were decided in the Q3-18 design, and this question is precisely why.
2. No — the AI provider is a degradation path (template fallback, Q3-12), not a serving prerequisite; including it would take the whole API down when OpenAI blinks. The breaker + fallback + banner handles it. The rule: readiness includes what makes you UNABLE to serve, not what makes you IMPERFECT — the distinction is a product conversation encoded into probe config, and I can walk our dependency list one by one through it.

**RED FLAGS TO AVOID:**
- Dependency checks in liveness (the fleet-churn self-DoS)
- No startup probe with migrations (kill-loop on healthy pods)
- Binary readiness on flapping dependencies (no hysteresis)

---

### Q11-7: How did you handle zero-downtime deployments
**DIFFICULTY:** Hard
**CATEGORY TAG:** DevOps

**ANSWER:**
Zero-downtime is a CONTRACT between four subsystems, and each has obligations. **Schema (Flyway)**: expand-contract — the schema at every moment supports N and N+1 app versions (Q6-6), the precondition for everything else. **App (rolling deploy)**: K8s rolling update `maxSurge=1, maxUnavailable=0` — a new pod becomes ready (including cache-warm gate, Q11-6) BEFORE an old one drains; ECS variant: two-step deregister. **Connections (drain)**: old pods get SIGTERM → executor drains (Q3-9's `waitForTasksToCompleteOnShutdown`, 30s grace) → ALB connection draining (30s) → in-flight requests complete; the readiness flip + deregistration ORDER (stop accepting BEFORE draining — the deregister-then-sleep sequence, not sleep-then-deregister — a subtle ordering bug that manifests as a burst of 502s during deploys). **Clients (resilience to the handover)**: idempotency keys on all state-changing calls (a request that dies mid-deploy is retried SAFELY — the deploy is just another transient failure class), websocket/SSE clients auto-reconnect with backoff (the real-time layer survives pod rotation with a reconnect burst handled by jittered backoff), and long-running REQUESTS are bounded (no request exceeds ~30s by design — a 10-minute "synchronous report" endpoint would make rolling deploys impossible; long work belongs in jobs — the API design respects the deploy model).

The DB-connection handover is the least-discussed failure: rolling deploys create connection churn (old pods' pools close, new pools open) — Hikari's maxLifetime + the pool's initial-size pre-warm (open connections at boot, not lazily) prevent the post-deploy latency blip; and PgBouncer was evaluated for exactly this if task counts grow. Verification: deploy-event markers in Grafana annotate every rollout — the p95/p99/error-rate graph during deploys is a FLAT LINE and that flatness is an SLO we track ("deploy transparency": error budget consumed by deploys < 0.5%); regressions there (we had one: the readiness-gate skip during a hotfix) become postmortems like any outage. Blue-green remains in the back pocket for schema-risky releases (full fleet flip with instant rollback — the cost is 2× capacity for the window; rolling covers 95% of deploys safely, and the expand-contract discipline is what keeps it that way).

**KEY TERMS TO MENTION:**
- Four-subsystem contract: schema (expand-contract) + rolling (maxUnavailable=0) + drain ordering + client idempotency
- Deregister-THEN-drain ordering (the 502-burst ordering bug)
- Connection-pool pre-warm (post-deploy latency blip prevention)
- Bounded request times as an API design constraint for deployability
- Deploy-transparency SLO (flat p95 during deploys, tracked)

**FOLLOW-UP QUESTIONS:**
1. A deploy must change something NOT expand-contract compatible — now what?
2. Websocket-heavy product + rolling deploys — how do you not dump everyone?

**FOLLOW-UP ANSWERS:**
1. You pay for blue-green + a freeze window: deploy the schema expand step + new image to the IDLE fleet, verify, flip traffic at the boundary, keep the old fleet warm for rollback, contract later. The cost is capacity and coordination, which is exactly why expand-contract is the default and this path is the exception — the exception is rehearsed (game day) because unrehearsed exceptions are outages.
2. Jittered reconnect backoff (2-10s random — a synchronized reconnect stampede IS a self-outage), connection-state recovery (clients resubscribe with a last-event-id — the event bus replays missed events server-side, so a reconnect is a resume, not a data loss), and pod-affinity spreading (connections distributed so a rotation touches a fraction at a time). With those, a rolling deploy shows users a sub-second flicker in the worst case, invisible in practice — measured by the reconnect-burst metric, which we keep under 2% of connections per rotation.

**RED FLAGS TO AVOID:**
- Zero-downtime claims resting on the app layer alone (schema + clients matter)
- Drain ordering wrong (deregister AFTER sleep)
- Unbounded request durations making rolling deploys structurally impossible

---

### Q11-8: What is your monitoring and alerting strategy
**DIFFICULTY:** Medium
**CATEGORY TAG:** DevOps / Observability

**ANSWER:**
The strategy is SLO-first with symptom-based paging — not the CPU-dashboard theater. **The four golden signals** per service tier: latency (p50/p95/p99 per endpoint), traffic (RPM), errors (4xx/5xx rates + business-error classes), saturation (pool usage, queue depth, CPU) — all Micrometer → Prometheus → Grafana, with deploy annotations. **SLOs**: user-journey-level (lead-list p95 < 300ms over 28 days with 99.9% availability; checkout success > 99.5%; webhook processing lag p95 < 60s) — error budgets drive priorities (budget burn > 2× in an hour pages; exhausted budget freezes feature deploys for reliability work — the mechanism that makes SLOs real, not wall art). **Alert taxonomy**: P1 (pages, 24/7): symptom alerts only — SLO burn, 5xx rate, queue-lag breach, webhook freshness (Q9-8), cert expiry < 7 days; P2 (Slack, next-day): saturation trends, slow-query digests, cache hit-rate decay; everything else is dashboards, NOT alerts (alert fatigue kills paging systems — the rule: if an alert doesn't require a human DECISION, it's a dashboard).

Runbook discipline: every P1 alert links its runbook IN the alert payload (symptom → check list → mitigation → escalation) — unrunbooked alerts get demoted automatically until documented (the system enforces its own hygiene); game days rehearse the top runbooks quarterly (the Redis-down drill from Q7-10 is literally a scheduled exercise). Tracing (OpenTelemetry → Tempo-style backend) covers cross-boundary diagnosis: request → SQL timings → external calls on one waterfall, correlated with logs via reqId/traceId (Q8-9). The meta-layer is reviewed monthly: alert precision (what % of pages were actionable — target > 80%; we retired two noisy alerts last quarter after this review) and coverage (every incident postmortem asks "which signal SHOULD have caught this" — new signals come from incidents, which is how monitoring grows toward reality instead of toward vendor checklists).

**KEY TERMS TO MENTION:**
- Four golden signals + SLOs with error budgets (burn-rate paging, budget-freeze)
- Symptom-based P1 paging vs dashboard-only P3s (alert-fatigue economics)
- Runbook-in-alert + auto-demotion of unrunbooked alerts
- OTel tracing correlated with logs (reqId/traceId bridge)
- Monthly meta-review: precision + incident-derived coverage growth

**FOLLOW-UP QUESTIONS:**
1. Your error budget froze feature deploys — the product manager is furious. Walk me through that conversation.
2. A P1 fires with NO runbook hit — what actually happened and what did you change?

**FOLLOW-UP ANSWERS:**
1. With data, not policy: the budget burn graph, the user-impact numbers (checkout failures during the burn window), and the pre-agreed freeze rule from the SLO charter the PM co-signed. Then the negotiation the charter also pre-agreed: ship the revenue-critical feature behind a flag at 5% while reliability work proceeds, or accept a documented budget exception with a make-up reliability sprint. The SLO isn't anti-product; it's the shared language that stops reliability being endlessly traded for shipping. PMs respect a system that binds ENGINEERS first — we've eaten the freeze ourselves.
2. Real case: the webhook freshness alarm fired on a provider whose events silently stopped — no runbook existed (new integration, alarm added with the feature, runbook lagged). The incident itself went fine (the alarm's diagnostic payload listed the reconciliation sweep we ran manually), and the changes were: runbook written same-day (enforced by the auto-demotion rule), the alarm payload gained the exact curl-able replay commands, and the quarterly game-day list gained the scenario. The meta-answer: monitoring failures are process failures with good manners — they always end in runbook or signal changes.

**RED FLAGS TO AVOID:**
- CPU/memory alerts as the P1 story (cause-based paging)
- SLOs without error-budget enforcement (wall art)
- No runbook linkage / alert-fatigue blindness

---

### Q11-9: How did you handle logging in production (the ELK-shaped pipeline)
**DIFFICULTY:** Medium
**CATEGORY TAG:** DevOps / Observability

**ANSWER:**
The pipeline: **emit** (Logback, structured JSON via logstash-encoder — every line a field map, not a regex target; MDC carries reqId/traceId/userId/orgId so every line is joinable, Q8-9) → **collect** (Filebeat sidecar/DaemonSet tailing stdout — containers log to stdout, the platform ships it; apps never manage files) → **ship** (Kafka-buffered Logstash or Vector — the buffer absorbs Elastic downtime without app-side backpressure: logging must never slow the app, so the shipper decouples with disk-buffered retry) → **index** (Elasticsearch with ILM: hot 7 days (replicas, fast storage) → warm 30 → cold 90 → delete; audit-trail parity handled separately per Q6-14's compliance tier) → **view** (Kibana saved searches per runbook + the exec view). Field discipline: a schema doc for log fields (owned, versioned — new fields through review, because 40 teams inventing field names is how "user_id"/"userId"/"uid" happens; ours standardized in month one).

Volume economics and hygiene: log levels per package tuned per environment (INFO prod, DEBUG staging), request-body logging DEBUG-only + redaction (Q8-9), and SAMPLING for the noisy middle (healthy 2xx access lines 100% — they're small and load-bearing; high-frequency internal events sampled 10% with a rate-limited always-log for errors). Costs are monitored as an SLO (ingest GB/day per service — a 3× spike usually means a bug logging inside a loop; the volume alert has caught two such bugs, making it a reliability signal, not just a bill). Access: SSO-gated Kibana with role scoping (support sees app logs, not infra; PII-field access is a separate audited role), and the retention question is answered by policy: operational logs 90 days, security-relevant per the audit trail's 400-day + archive tier — retention is a compliance surface, not an Elastic default.

The design tension I name honestly: structured logging trades grep-culture for field-culture — the migration had real friction (engineers mourning `grep 'timeout'`), solved by Kibana-saved-search enablement + the query cookbook in the runbook; and the deepest lesson: logs are for QUESTIONS, so we maintain a "top 10 support questions → exact saved query" mapping — if a question can't be answered in under a minute by the on-call, the logging has a gap, and that gap list drives the logging backlog. Logging without a question inventory is storage with anxiety attached.

**KEY TERMS TO MENTION:**
- Structured JSON + MDC joinability (reqId/traceId/userId/orgId)
- stdout → Filebeat → buffered shipper (logging never backpressures the app)
- ILM tiers (hot/warm/cold/delete) + retention as compliance policy
- Volume-as-signal (GB/day spike = bug detector) + level/sampling hygiene
- Question-inventory-driven logging backlog (top-10 → saved queries)

**FOLLOW-UP QUESTIONS:**
1. Elasticsearch is down 2 hours — what do users and on-call experience?
2. A log field carries PII you missed — remediation?

**FOLLOW-UP ANSWERS:**
1. Nothing user-visible (the decoupled shipper buffers to disk, apps log happily — the pipeline is designed so observability infrastructure failures NEVER touch the product); on-call loses search for 2 hours — the runbooks degrade to metric-based triage (Grafana answers the P1 questions) + the latest indexed window for context. Ingest catches up on recovery (Kafka buffer sizing covers 24h of volume). The design goal is literally "ELK can burn and the pager stays quiet" — that's what buffer decoupling buys.
2. Same play as Q8-9's variant with pipeline specifics: stop the emission (field removed, deploy or hot level-change), assess the indexed exposure (which indices, what retention — ILM will age it out; an expedited delete-by-query for sensitive classes), check who accessed (Kibana audit), document in the RoPA, and add the field to the pre-production PII scan (we run a pattern-scan over sampled prod logs weekly — the miss means the pattern list needs the new entry). The systemic fix is always the scanner, not the vigilance.

**RED FLAGS TO AVOID:**
- App-side file logging with rotation inside containers (stdout or nothing)
- Logging pipeline that can backpressure the app (no buffer decoupling)
- Unstructured logs + regex-only culture at this scale

---

### Q11-10: How did you manage secrets in production
**DIFFICULTY:** Medium
**CATEGORY TAG:** DevOps / Security

**ANSWER:**
The secrets lifecycle, stage by stage. **Generation/storage**: AWS Secrets Manager as the single source (per-service paths, versioned — a rotation publishes a new version without deleting the old, enabling the two-valid-window pattern); nothing secret in git (gitleaks pre-commit + CI scan — historical scan included), in images (multi-stage hygiene + a final-image secret-scan), or in CI variables beyond references (CI holds ARNs, not values). **Delivery**: init sidecar fetches at container start → exports env vars → `@ConfigurationProperties` binds → boot validation fails on missing (named errors, Q10-7); the app reads secrets ONLY from env/config — no secret-fetching code scattered in business logic (fetching is infrastructure's job). **Use**: in-memory only, masking converters on all log paths (Q3-19), no secrets in error messages (the exception-sanitizer strips config values — an NPE once tried to print a connection string with credentials; the sanitizer exists because of it). **Rotation**: DB creds quarterly (dual-valid window + rolling restart, Q3-19), JWT keys `kid`-versioned, provider keys per Q9-9's census; rotation is rehearsed (a game-day rotation of the DB secret — the first rehearsal found the Hikari pool didn't pick up new creds without a recycle, which became a documented step and then a fixed behavior). **Access**: IAM task-roles scoped per service (the app role reads `/acq/app/*`, never `/acq/analytics/*`), Kibana/secret-admin separate audited roles, and break-glass access (2-person rule, time-boxed, alerted).

**Breach drill** (the question behind the question — "a secret leaked, now what?" is Q9-9's runbook, and at the infra layer it's: rotate FIRST at the provider/manager (invalidate the leak), then history-purge, then access-audit the misuse window, then postmortem the pipeline gap). The census job (Q9-9) extends infra-side: it inventories secrets-manager entries, cross-checks against IAM grants, flags entries unused for 60 days (zombie credentials), and verifies every entry has a rotation policy — the report goes to the security review. The principle I close with: secrets management is measured by its BORINGNESS — rotation happens on schedule without ceremony, leaks are contained by rotation-not-panic, and no engineer can casually acquire a production secret; the day secret handling becomes an adventure is the day the design failed.

**KEY TERMS TO MENTION:**
- Secrets Manager single source + versioned rotation (two-valid windows)
- Sidecar → env → typed config delivery; no secret-fetching in business code
- gitleaks CI + final-image scans + CI holds references not values
- Rehearsed rotations (game-day found the Hikari recycle gap)
- Census job: zombie detection, grant cross-check, rotation-policy verification

**FOLLOW-UP QUESTIONS:**
1. Why env vars at all — why not the app fetching directly from Secrets Manager?
2. KMS key rotation — does it re-encrypt everything?

**FOLLOW-UP ANSWERS:**
1. Direct-fetch couples app code to AWS SDK + adds failure modes inside business boot paths; the sidecar keeps the app portable (runs in dev with env files, in prod with the sidecar — same code), centralizes IAM in the platform layer, and the env/config boundary matches Spring's native model. The trade (env vars are process-visible via /proc) is mitigated by container isolation + readOnlyRootFilesystem + non-root. Fetch-in-app is the right call when you need dynamic refresh mid-process — we handle that class with flags, not secrets.
2. KMS key rotation doesn't touch existing ciphertexts — new encrypts use the new key material, old ciphertexts still decrypt (KMS keeps versions); rotation is therefore SAFE-by-default but doesn't reduce exposure of old data — for the envelope-encrypted user tokens (Q9-9) we run a scheduled re-wrap job (decrypt-with-old, re-encrypt-with-new, batched) annually; the job is boring and rehearsed, which is the entire point of the design.

**RED FLAGS TO AVOID:**
- Secrets in git/images/CI-values (any one is an audit finding)
- Un-rehearsed rotation (the first real rotation should not be during an incident)
- No zombie-key census (you can't secure an inventory you don't have)
