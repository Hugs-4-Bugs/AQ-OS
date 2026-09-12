# AcquisitionOS — Production Database Migration Report

**Task ID:** L9  
**Date:** 2025-06-07  
**Status:** REPORT ONLY — No code or database changes made

---

## Executive Summary

AcquisitionOS currently runs on **SQLite 3.x** with **88 tables** and **348 indexes** across a 2.6 MB database file. While the schema is well-structured with comprehensive indexing, SQLite is unsuitable for production workloads due to its single-writer concurrency model, lack of true ACID transactions under concurrent access, and absence of production-grade backup/recovery features. This report provides a detailed migration plan to PostgreSQL, along with indexing optimization, connection pooling, and backup strategies.

---

## 1. Current State Analysis

### 1.1 Database Configuration

| Property | Value |
|---|---|
| Engine | SQLite 3.x (version 3046000) |
| Database URL | `file:/home/z/my-project/db/custom.db` |
| File Size | 2.6 MB |
| Total Tables | 88 (excluding `_prisma_migrations`) |
| Total Indexes | 348 |
| Prisma Provider | `sqlite` |
| Connection Method | Direct file I/O |

### 1.2 Data Volume (Current)

| Table | Row Count |
|---|---|
| User | 15 |
| Subscription | 15 |
| AuditLog | 313 |
| PaymentOrder | 4 |
| Notification | 1 |
| Lead | 0 |
| Deal | 0 |
| OutreachMessage | 0 |
| WorkflowExecution | 0 |
| MessageDelivery | 0 |

> **Note:** Database is pre-production (dev/test data only). This is the optimal time to migrate — no production data to preserve.

### 1.3 Schema Model Count

**88 models** organized across these domains:

| Domain | Models | Key Tables |
|---|---|---|
| User & Auth | 4 | User, UserSession, LoginHistory, MfaConfig |
| Organization | 3 | Organization, OrgMember, OrgInvitation |
| Subscription & Billing | 12 | Subscription, CreditsLedger, PaymentOrder, Invoice, Coupon, etc. |
| Feature Flags | 2 | FeatureFlag, PlanEntitlement |
| Lead Management | 4 | Lead, LeadAnalysis, LeadScore, LeadNote |
| Pipeline | 2 | PipelineStage, PipelineCustomStage |
| Outreach | 4 | OutreachMessage, OutreachSequence, SequenceStep, SequenceEnrollment |
| Email Integration | 6 | EmailAccount, EmailThread, EmailMessage, EmailBounce, EmailUnsubscribe, etc. |
| Conversations | 2 | Conversation, ConversationMessage |
| Integration Config | 2 | TelegramConfig, WhatsappConfig |
| Notifications | 2 | Notification, NotificationPreferences |
| AI Chat | 2 | AiChatSession, AiChatMessage |
| Workflows | 5 | WorkflowDefinition, WorkflowStep, WorkflowExecution, WorkflowLog, WorkflowTemplate |
| Competitor Intel | 2 | CompetitorData, CompetitorAnalysis |
| Audit & System | 2 | AuditLog, SystemEvent |
| API Keys | 2 | ApiKey, ApiKeyUsage |
| GDPR & Export | 2 | GdprRequest, DataExport |
| Onboarding | 1 | OnboardingProgress |
| Legacy Compat | 5 | Communication, Deal, LeadActivity, FollowUpReminder, Insight |
| User Settings | 1 | UserSettings |
| Google Calendar | 2 | GoogleCalendarToken, CalendarWatch |
| Meetings | 2 | Meeting, MeetingIntentLog |
| Discovery | 1 | DiscoveryJob |
| Security | 2 | SecurityAlert, KnownDevice |
| System Metrics | 1 | SystemMetrics |
| AI Cost Tracking | 1 | AiCostRecord |
| Prompt Templates | 1 | PromptTemplate |
| File Context | 1 | FileContext |
| Proxy & Scraping | 2 | ProxyEndpoint, ScrapingMetric |
| Realtime Events | 3 | RealtimeEvent, WsConnection, SseConnection |
| Messaging | 5 | MediaFile, MessageBroadcast, BroadcastTarget, MessageTemplateApproval, ScheduledEmail |
| Email Tracking | 3 | EmailOpenEvent, EmailClickEvent, EmailTrackingLink |
| Meeting Reminders | 1 | MeetingReminder |
| Message Delivery | 2 | MessageDelivery, DeliveryDeadLetter |

### 1.4 SQLite Limitations for Production

| Limitation | Impact on AcquisitionOS |
|---|---|
| **Single-writer concurrency** | Only one write at a time; concurrent webhooks (Stripe, Gmail, Telegram) will serialize/block |
| **No row-level locking** | Readers block writers and vice versa under WAL mode edge cases; billing race conditions (already found in Phase 6) |
| **No native JSON type** | Schema uses `String` for JSON fields (preferencesJson, tags, steps, nodes, edges, weaknesses, etc.); no JSON query operators |
| **No full-text search** | Lead search across businessName, email, niche requires `LIKE` queries — full table scans |
| **No materialized views** | Dashboard aggregations (pipeline health, revenue forecast) must be computed on every request |
| **No LISTEN/NOTIFY** | Realtime features (RealtimeEvent, WsConnection, SseConnection) must poll instead of push |
| **No network access** | Database file must be on same host; no read replicas, no horizontal scaling |
| **2GB practical limit** | EmailMessage bodyHtml, CompetitorData websiteHtml will accumulate rapidly |
| **No pg_dump equivalent** | Only file-level backup; no incremental, no point-in-time recovery |
| **No advisory locks** | Cron job deduplication and idempotency must be implemented in application code |

---

## 2. PostgreSQL Migration Path

### 2.1 Schema Changes Required

| Change | SQLite Current | PostgreSQL Target | Impact |
|---|---|---|---|
| **Provider** | `provider = "sqlite"` | `provider = "postgresql"` | `prisma/schema.prisma` line 12 |
| **JSON columns** | `String` with comment `// JSON` | Native `Json` type | ~30 fields across 20+ models |
| **DateTime precision** | SQLite stores as ISO string | PostgreSQL `timestamp(3)` | Automatic via Prisma |
| **Float columns** | SQLite REAL | PostgreSQL `double precision` | Automatic via Prisma |
| **String columns** | SQLite TEXT | PostgreSQL `text` / `varchar` | Automatic via Prisma |
| **Boolean columns** | SQLite INTEGER (0/1) | PostgreSQL `boolean` | Automatic via Prisma |

### 2.2 JSON Field Migration (Critical)

The following fields store JSON as `String` and should be migrated to Prisma `Json` type:

**High-priority (queried frequently):**
- `User.preferencesJson` — user settings, queried on every auth
- `Lead.tags` — filtered in search/list queries
- `WorkflowDefinition.nodes`, `edges` — parsed on every execution
- `OutreachSequence.steps` — parsed on every enrollment
- `OutreachMessage.metadata` — filtering by tracking data

**Medium-priority (stored but rarely queried):**
- `Lead.digitalWeaknesses`, `opportunityNotes`, `techStack`
- `LeadAnalysis.weaknesses`, `outreachMessages`, `recommendedServices`, `decisionMaker`, `scoreExplanations`
- `EmailMessage.labels`
- `ConversationMessage.buyingSignals`, `hesitationReasons`, `metadata`
- `WorkflowDefinition.triggerConfig`
- `WorkflowStep.config`
- `WorkflowExecution.triggerData`, `logs`, `triggerEvent`
- `WorkflowLog.input`, `output`
- `Notification.metadata`
- `AiChatMessage.metadata`
- `Meeting.agenda`, `attendees`, `reminders`, `followUpActions`, `conferenceData`
- `Meeting.actionItems` — already `Json` type
- `MessageBroadcast.audienceFilter`
- `MessageDelivery.contentMetadata`, `metadata`
- `FileContext.chunks`
- `BroadcastTarget` (via MessageBroadcast)
- `ScheduledEmail.metadata`
- `MessageTemplateApproval.metadata`
- `FeatureFlag.plans`
- `Coupon.applicablePlans`
- `UserSettings.notificationPreferences`, `targetNiches`, `targetCountries`, `targetChannels`, `meetingWorkingDays`, `meetingReminderMinutes`
- `SystemMetrics.labels`
- `PromptTemplate.metadata`
- `RealtimeEvent.payload`
- `WsConnection.rooms`

**Low-priority (configuration/reference):**
- `Organization.branding`
- `PaymentWebhook.payload`
- `Invoice.lineItems`, `htmlContent`
- `ProxyEndpoint` (no JSON fields)
- `CompetitorData.websiteHtml` (large raw HTML, consider S3 + URL reference instead)

> **Migration approach:** Change Prisma schema `String` → `Json` for these fields. Prisma will handle the migration automatically via `prisma migrate dev`. Existing JSON strings are valid JSON and will be parsed correctly by PostgreSQL.

### 2.3 CompetitorData.websiteHtml — Special Case

This field stores raw HTML (potentially 100KB+ per row). Consider:
1. Moving to S3/R2 storage with a URL reference instead of storing in DB
2. If kept in DB, PostgreSQL's TOAST mechanism handles large values efficiently (unlike SQLite which stores inline)

### 2.4 Prisma Migration Commands

```bash
# Step 1: Update schema.prisma
# Change: provider = "sqlite" → provider = "postgresql"
# Change: DATABASE_URL in .env to PostgreSQL connection string
# Change: String JSON fields → Json type

# Step 2: Create migration
npx prisma migrate dev --name migrate_to_postgresql --create-only

# Step 3: Review generated migration SQL
# Inspect prisma/migrations/<timestamp>_migrate_to_postgresql/migration.sql

# Step 4: Apply migration
npx prisma migrate deploy

# Step 5: Generate new Prisma client
npx prisma generate

# Step 6: Verify
npx prisma db seed  # if seed script exists
npx prisma studio   # visual verification
```

### 2.5 Data Migration Strategy

Since the current database contains only dev/test data (15 users, 0 leads, 0 deals), there are two approaches:

**Option A: Fresh Start (Recommended)**
- Provision empty PostgreSQL database
- Apply schema via `prisma migrate deploy`
- Run seed scripts to populate FeatureFlag, PlanEntitlement, PipelineStage
- No data migration needed
- **Downtime: 0 minutes** (parallel deployment)

**Option B: Data Migration (if production data exists)**
```bash
# 1. Export from SQLite
sqlite3 db/custom.db ".dump" > sqlite_export.sql

# 2. Convert to PostgreSQL-compatible SQL
# - Replace AUTOINCREMENT with SERIAL/BIGSERIAL
# - Replace TEXT with TEXT (compatible)
# - Replace INTEGER with appropriate types
# - Fix date format strings
# Use tool: https://github.com/dumblob/mysql2sqlite or pgloader

# 3. Alternative: Use pgloader (automated)
# pgloader sqlite://db/custom.db postgresql://user:pass@host:5432/acquisitionos

# 4. Verify row counts match
# 5. Run integrity checks
```

**Recommended: Option A** — This is the best time to migrate (pre-production). No data to lose.

---

## 3. Production Indexing

### 3.1 Existing Indexes (348 total)

The schema already has excellent index coverage. Key models with highest index counts:

| Model | Index Count | Assessment |
|---|---|---|
| Lead | 14 | Comprehensive — covers all query patterns |
| MessageDelivery | 12 | Good — includes composite for retry queue |
| Meeting | 9 | Good — covers scheduling and lookup |
| OutreachMessage | 8 | Good — covers send/status tracking |
| RealtimeEvent | 8 | Adequate |
| User | 7 | Good — covers auth lookups |
| Notification | 6 | Good — covers unread queries |

### 3.2 Recommended Additional Indexes

| Model | Proposed Index | Justification |
|---|---|---|
| `Lead` | `@@index([userId, niche])` | Dashboard lead-sources filters by user + niche |
| `Lead` | `@@index([userId, country])` | Territory map filters by user + country |
| `Lead` | `@@index([stage, createdAt])` | Pipeline funnel velocity queries |
| `Lead` | `@@index([emailStatus])` | Email status filtering for outreach campaigns |
| `Deal` | `@@index([leadId, status])` | Lead detail page loads deals by status |
| `Deal` | `@@index([createdAt])` | Revenue trend time-series queries |
| `CreditsLedger` | `@@index([userId, createdAt])` | Credit history with pagination |
| `OutreachMessage` | `@@index([leadId, status])` | Lead detail: message history by status |
| `OutreachMessage` | `@@index([sentAt, status])` | Email performance analytics time-series |
| `WorkflowExecution` | `@@index([workflowId, status])` | Workflow detail: executions by status |
| `WorkflowExecution` | `@@index([startedAt, status])` | Execution timeline analytics |
| `Notification` | `@@index([userId, type, createdAt])` | Notification filtering by type with pagination |
| `AuditLog` | `@@index([userId, action, createdAt])` | Audit log filtering with pagination |
| `ConversationMessage` | `@@index([conversationId, createdAt])` | Message pagination within conversation |
| `EmailThread` | `@@index([emailAccountId, lastMessageAt])` | Thread listing sorted by recency |
| `AiCostRecord` | `@@index([userId, createdAt])` | Cost tracking time-series per user |
| `MessageDelivery` | `@@index([userId, createdAt])` | Delivery history with pagination |
| `Subscription` | `@@index([userId, status])` | Active subscription lookup (already has separate indexes) |

**PostgreSQL-specific optimization:**
- Add `CONCURRENTLY` when creating indexes on production data
- Consider partial indexes: `CREATE INDEX idx_notification_unread ON Notification(userId, createdAt) WHERE read = false`
- Consider GIN indexes for JSON fields: `CREATE INDEX idx_lead_tags ON Lead USING GIN (tags)` (after migrating to `Json` type)

### 3.3 N+1 Query Risk Assessment

**Identified N+1 patterns in the codebase:**

| Pattern | Location | Risk |
|---|---|---|
| **Lead list → LeadAnalysis** | Dashboard lead-scoring route fetches leads then individually loads analyses | HIGH — Lead list page queries N+1 |
| **Lead list → LeadScore** | Lead detail pages load scores after loading lead | HIGH — Each lead detail is N+1 |
| **Conversation list → ConversationMessages** | Messaging hub loads conversations then messages per conversation | HIGH — Chat UI N+1 |
| **Workflow list → WorkflowSteps** | Workflow detail loads definition then steps separately | MEDIUM |
| **Sequence list → SequenceSteps** | Sequence execution loads sequence then steps | MEDIUM |
| **Email thread list → EmailMessages** | Gmail inbox loads threads then messages | MEDIUM |
| **Lead detail → Communications** | Lead detail page loads communications separately | MEDIUM |
| **Dashboard aggregation queries** | Multiple dashboard routes make 5-8 separate queries | MEDIUM — Should use `$queryRaw` or materialized views |

**Mitigation strategies:**
1. Use Prisma `include` for eager loading (already used in ~110 locations)
2. Add DataLoader pattern for repeated individual lookups
3. Use `$queryRaw` for complex dashboard aggregations
4. Consider materialized views for dashboard metrics (PostgreSQL supports these)

---

## 4. Connection Pooling

### 4.1 Current State

| Property | Value |
|---|---|
| Connection method | Direct SQLite file I/O |
| Pool size | N/A (single-file access) |
| Max connections | 1 concurrent writer |
| Connection timeout | N/A |

### 4.2 PostgreSQL Connection Pooling Strategy

**Option A: Prisma Built-in Connection Pool (Recommended for initial launch)**
```
DATABASE_URL=postgresql://user:pass@host:5432/acquisitionos?connection_limit=10&pool_timeout=30
```

| Parameter | Value | Justification |
|---|---|---|
| `connection_limit` | 10 | Next.js serverless functions; 10 concurrent Prisma connections |
| `pool_timeout` | 30s | Wait up to 30s for connection from pool |

**Option B: PgBouncer (Recommended for scale >100 concurrent users)**
```ini
; pgbouncer.ini
[databases]
acquisitionos = host=db.internal port=5432 dbname=acquisitionos

[pgbouncer]
pool_mode = transaction
max_client_conn = 200
default_pool_size = 20
reserve_pool_size = 5
reserve_pool_timeout = 3
server_idle_timeout = 300
```

```env
DATABASE_URL=postgresql://user:pass@127.0.0.1:6432/acquisitionos?pgbouncer=true
```

| Setting | Value | Justification |
|---|---|---|
| `pool_mode` | `transaction` | Release connections between transactions; optimal for serverless |
| `max_client_conn` | 200 | Support 200 concurrent HTTP requests |
| `default_pool_size` | 20 | 20 PostgreSQL backend connections per database |
| `pgbouncer=true` | In URL | Tells Prisma to use PgBouncer-compatible mode |

**Option C: Managed Provider Pooling (Supabase/Neon/Railway)**
- Supabase: Built-in PgBouncer (Supavisor) at port 6543
- Neon: Built-in connection pooling via `-pooler` endpoint
- Railway: Built-in PgBouncer add-on

```env
# Supabase example
DATABASE_URL=postgresql://postgres:pass@db.project.supabase.co:6543/postgres?pgbouncer=true

# Neon example
DATABASE_URL=postgresql://user:pass@ep-xxx.us-east-2.aws.neon.tech/acquisitionos?sslmode=require
```

### 4.3 Recommended Configuration by Scale

| Scale | Users | Strategy | Pool Size | DB Connections |
|---|---|---|---|---|
| Launch | <100 | Prisma built-in | 10 | 10 |
| Growth | 100-1,000 | PgBouncer transaction mode | 20 | 20 |
| Scale | 1,000-10,000 | PgBouncer + read replica | 50 primary + 20 replica | 50+20 |
| Enterprise | 10,000+ | PgBouncer + multiple replicas + Pgpool-II | 100+ | Custom |

---

## 5. Backup Strategy

### 5.1 Current State

| Property | Value |
|---|---|
| Method | File-level copy of `db/custom.db` |
| Frequency | Manual (none automated) |
| Retention | None |
| Point-in-time recovery | Not possible |
| Restore time | File copy (~seconds for 2.6 MB) |

### 5.2 PostgreSQL Backup Strategy

**Tier 1: Automated pg_dump (Minimum Viable)**

```bash
#!/bin/bash
# backup.sh — Daily full backup
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR=/backups/acquisitionos
DATABASE_URL="postgresql://user:pass@host:5432/acquisitionos"

# Full backup with custom format (compressable, parallelizable)
pg_dump $DATABASE_URL -Fc -f $BACKUP_DIR/full_$TIMESTAMP.dump

# Keep last 30 days
find $BACKUP_DIR -name "full_*.dump" -mtime +30 -delete

# Verify backup
pg_restore --list $BACKUP_DIR/full_$TIMESTAMP.dump > /dev/null 2>&1
if [ $? -ne 0 ]; then
    echo "BACKUP CORRUPT: $BACKUP_DIR/full_$TIMESTAMP.dump"
    # Alert via notification system
fi
```

| Property | Value |
|---|---|
| Frequency | Daily at 02:00 UTC |
| Format | Custom (`-Fc`) — compressed, parallelizable restore |
| Retention | 30 days |
| Storage | S3/R2 bucket (encrypted, cross-region) |
| Verification | Automated `pg_restore --list` check |

**Tier 2: WAL Archiving + Point-in-Time Recovery (Production)**

```ini
# postgresql.conf
wal_level = replica
archive_mode = on
archive_command = 'aws s3 cp %p s3://acquisitionos-wal-archive/%f'
archive_timeout = 300  # Force archive every 5 minutes
```

| Property | Value |
|---|---|
| WAL archiving | Every 5 minutes to S3 |
| PITR granularity | 5 minutes |
| Base backup frequency | Weekly (via `pg_basebackup`) |
| WAL retention | 7 days in S3 |
| Base backup retention | 4 weeks |

**Tier 3: Managed Provider Backup (Recommended for most cases)**

| Provider | Backup Feature | PITR | Retention | Cost |
|---|---|---|---|---|
| Supabase | Automatic daily | 7-day PITR (Pro plan) | 7 days (Free), 30 days (Pro) | Included |
| Neon | Automatic | Branch-based | 7 days (Free), 30 days (Pro) | Included |
| Railway | Automatic daily | No PITR | 7 days | Included |
| AWS RDS | Automated snapshots | Configurable | 35 days default | $0.095/GB-month |

### 5.3 Restore Procedures

**Procedure 1: Full Database Restore from pg_dump**
```bash
# 1. Stop application
pm2 stop acquisitionos  # or systemctl stop acquisitionos

# 2. Create fresh database
dropdb -h host -U user acquisitionos
createdb -h host -U user acquisitionos

# 3. Restore from backup
pg_restore -h host -U user -d acquisitionos -j 4 backup_file.dump

# 4. Verify
psql -h host -U user acquisitionos -c "SELECT COUNT(*) FROM \"User\";"

# 5. Restart application
pm2 start acquisitionos
```

**Procedure 2: Point-in-Time Recovery (WAL)**
```bash
# 1. Stop PostgreSQL
sudo systemctl stop postgresql

# 2. Restore base backup
pg_basebackup -D /var/lib/postgresql/data -h backup-host -U replicator

# 3. Configure recovery target
echo "restore_command = 'aws s3 cp s3://acquisitionos-wal-archive/%f %p'" >> /var/lib/postgresql/data/recovery.conf
echo "recovery_target_time = '2025-06-07 14:30:00 UTC'" >> /var/lib/postgresql/data/recovery.conf

# 4. Start PostgreSQL (begins recovery)
sudo systemctl start postgresql

# 5. Verify data integrity
# 6. Promote to primary when confirmed
```

**Procedure 3: Managed Provider Restore**
- Supabase: Dashboard → Database → Backups → Select timestamp → Restore
- Neon: Dashboard → Branches → Create branch from timestamp
- Railway: Dashboard → Database → Backups → Restore

### 5.4 Backup Frequency Recommendations

| Data Type | Frequency | Retention | RPO | RTO |
|---|---|---|---|---|
| Full database | Daily | 30 days | 24 hours | 1 hour |
| WAL archives | Continuous (5-min) | 7 days | 5 minutes | 30 minutes |
| Pre-migration snapshot | Before each migration | 90 days | N/A | 15 minutes |
| Seed data (FeatureFlag, PlanEntitlement, PipelineStage) | On change | Git versioned | N/A | 5 minutes |

---

## 6. Migration Strategy

### 6.1 Step-by-Step Migration Plan

#### Phase 0: Pre-Migration (Day -7 to Day -1)

| Step | Task | Duration | Risk |
|---|---|---|---|
| 0.1 | Provision PostgreSQL database (Supabase/Neon/Railway) | 30 min | Low |
| 0.2 | Create migration branch in git | 5 min | None |
| 0.3 | Update `prisma/schema.prisma`: change provider to `postgresql` | 15 min | Low |
| 0.4 | Convert JSON `String` fields to `Json` type | 2 hours | Medium |
| 0.5 | Review and update all raw SQL queries for PostgreSQL compatibility | 1 hour | Medium |
| 0.6 | Update `.env` with PostgreSQL `DATABASE_URL` | 5 min | None |
| 0.7 | Run `npx prisma migrate dev --name init_postgresql --create-only` | 5 min | Low |
| 0.8 | Review generated migration SQL | 30 min | Low |
| 0.9 | Run `npx prisma migrate deploy` against staging database | 5 min | Low |
| 0.10 | Run seed scripts | 10 min | Low |
| 0.11 | Run full test suite | 30 min | Medium |

#### Phase 1: Staging Validation (Day 0)

| Step | Task | Duration | Risk |
|---|---|---|---|
| 1.1 | Deploy to staging with PostgreSQL | 15 min | Low |
| 1.2 | Smoke test all API endpoints | 30 min | Low |
| 1.3 | Test auth flow (signup, login, OTP, magic link) | 15 min | Medium |
| 1.4 | Test billing flow (Stripe webhook, credit deduction) | 15 min | High |
| 1.5 | Test lead discovery and enrichment | 15 min | Medium |
| 1.6 | Test outreach sequences | 15 min | Medium |
| 1.7 | Test workflow engine | 15 min | Medium |
| 1.8 | Test dashboard APIs | 15 min | Low |
| 1.9 | Load test with 50 concurrent users | 1 hour | Medium |
| 1.10 | Verify connection pooling behavior | 30 min | Medium |

#### Phase 2: Production Migration (Day 1)

| Step | Task | Duration | Risk |
|---|---|---|---|
| 2.1 | Announce maintenance window | N/A | None |
| 2.2 | Take pre-migration SQLite backup | 1 min | None |
| 2.3 | Deploy updated code with PostgreSQL | 5 min | Medium |
| 2.4 | Run `npx prisma migrate deploy` on production PostgreSQL | 2 min | Low |
| 2.5 | Run seed scripts (FeatureFlag, PlanEntitlement, PipelineStage) | 5 min | Low |
| 2.6 | Verify health endpoint (`/api/health`) | 1 min | None |
| 2.7 | Smoke test production | 10 min | Medium |
| 2.8 | Monitor error rates for 1 hour | 1 hour | Low |

#### Phase 3: Post-Migration (Day 2-7)

| Step | Task | Duration | Risk |
|---|---|---|---|
| 3.1 | Add PostgreSQL-specific indexes (CONCURRENTLY) | 30 min | Low |
| 3.2 | Set up automated backups | 1 hour | Low |
| 3.3 | Configure WAL archiving (if self-hosted) | 2 hours | Medium |
| 3.4 | Set up monitoring (connection pool, query performance) | 2 hours | Medium |
| 3.5 | Optimize N+1 queries identified in Section 3.3 | 4 hours | Medium |
| 3.6 | Add materialized views for dashboard aggregations | 2 hours | Low |

### 6.2 Testing Approach

| Test Type | Scope | Tool | Frequency |
|---|---|---|---|
| **Unit tests** | Prisma queries with PostgreSQL | Jest + test DB | Every commit |
| **Integration tests** | Full API routes with PostgreSQL | Jest + test DB | Every PR |
| **Migration tests** | Schema migration correctness | Prisma migrate + diff | Before deploy |
| **Load tests** | 100 concurrent users | k6 / Artillery | Pre-migration |
| **Data integrity** | Row counts, constraint validation | Custom scripts | Post-migration |
| **Rollback test** | Restore from backup | Manual | Pre-migration |

### 6.3 Rollback Plan

**Scenario 1: Migration fails during deployment**
```
1. Revert code deployment to previous version
2. Restore .env DATABASE_URL to SQLite
3. Restart application
4. Investigate failure in PostgreSQL migration logs
```

**Scenario 2: PostgreSQL issues after deployment**
```
1. Take pre-migration SQLite backup
2. Switch DATABASE_URL back to SQLite
3. Redeploy previous code version
4. Investigate PostgreSQL issue
5. Estimated rollback time: 5-10 minutes
```

**Scenario 3: Data corruption in PostgreSQL**
```
1. Stop application immediately
2. Restore from most recent pg_dump backup
3. Verify data integrity
4. Restart application
5. Estimated RTO: 1 hour (from pg_dump), 30 min (from WAL PITR)
```

**Critical rollback note:** Since the database is pre-production with minimal data, rollback risk is extremely low. The SQLite file remains intact throughout the migration and can be reconnected at any time.

### 6.4 Estimated Timeline

| Phase | Duration | Cumulative |
|---|---|---|
| Phase 0: Pre-Migration | 5 hours | Day -7 to Day -1 |
| Phase 1: Staging Validation | 4 hours | Day 0 |
| Phase 2: Production Migration | 2 hours | Day 1 |
| Phase 3: Post-Migration | 12 hours | Day 2-7 |
| **Total** | **~23 hours** | **~7 calendar days** |

**Estimated downtime: 0 minutes** (parallel deployment, switch DNS/env at cutover)

---

## 7. Schema Quality Assessment

### 7.1 Strengths

1. **Comprehensive indexing** — 348 indexes across 88 tables; every FK column is indexed
2. **Proper cascade deletes** — Phase L5 added 11 missing cascade rules
3. **Composite indexes** — Smart composites like `[userId, stage]`, `[userId, status]`, `[status, nextRetryAt]`
4. **Unique constraints** — Proper dedup on email, tokens, subscription IDs, idempotency keys
5. **Soft deletes** — Lead has `deletedAt`, User has `deletedAt` (preserves data for compliance)

### 7.2 Remaining Issues from Prior Audits

| Issue | Severity | From Task | Status |
|---|---|---|---|
| 20+ models missing direct `userId` (must join through Lead) | MEDIUM | L5 | Documented, not fixed |
| WsConnection/SseConnection have `userId` but no `@relation` | MEDIUM | L5 | By design (transient) |
| Credit mismatch (User.credits vs Subscription.creditsRemaining) | HIGH | L3 | Documented, not fixed |
| Missing seed data (PipelineStage, FeatureFlag, PlanEntitlement) | HIGH | L3 | Requires seed script |
| 30+ JSON fields stored as `String` | MEDIUM | This report | Needs migration |
| CompetitorData.websiteHtml stored inline | LOW | This report | Consider S3 |

### 7.3 PostgreSQL-Specific Benefits for AcquisitionOS

| Feature | Benefit |
|---|---|
| **Native JSON/JSONB** | Query tags, preferences, workflow nodes with `->`, `->>`, `@>` operators |
| **Full-Text Search** | `to_tsvector` on businessName, niche, city for lead search without LIKE |
| **Materialized Views** | Pre-compute dashboard metrics; refresh on schedule |
| **LISTEN/NOTIFY** | Push-based realtime instead of polling RealtimeEvent table |
| **Row-Level Security** | Tenant isolation at DB level (orgId-based) |
| **Advisory Locks** | Cron job deduplication without application-level locks |
| **pg_stat_statements** | Query performance monitoring out of the box |
| **Read Replicas** | Offload dashboard/analytics queries from primary |
| **ILIKE** | Case-insensitive search without `LOWER()` function index |
| **Array types** | Replace `String @default("[]")` with native `String[]` for tags |

---

## 8. Recommended PostgreSQL Provider Comparison

| Provider | Free Tier | Connection Pooling | PITR | Branching | Auto-Scaling | Best For |
|---|---|---|---|---|---|---|
| **Supabase** | 500 MB, 2 cores | Built-in (Supavisor) | 7-day (Pro) | Yes | Manual | Fastest setup, great DX |
| **Neon** | 512 MB, Serverless | Built-in | 7-day (Pro) | Yes (core feature) | Auto | Serverless, branching |
| **Railway** | $5 credit | Add-on | 7-day | No | Auto | Simple deployment |
| **AWS RDS** | None (pay-as-go) | Manual setup | Custom | No | Manual | Enterprise, full control |
| **Self-hosted** | Hardware cost | PgBouncer | Custom | No | Manual | Maximum control |

**Recommendation: Supabase or Neon** for initial launch — zero-config connection pooling, automatic backups, and database branching for testing migrations.

---

## 9. Action Items Summary

| # | Priority | Action | Effort |
|---|---|---|---|
| 1 | **CRITICAL** | Change `provider = "postgresql"` in schema.prisma | 5 min |
| 2 | **CRITICAL** | Convert 30+ JSON `String` fields to `Json` type | 2 hours |
| 3 | **CRITICAL** | Provision PostgreSQL database | 30 min |
| 4 | **HIGH** | Add recommended composite indexes (Section 3.2) | 1 hour |
| 5 | **HIGH** | Fix N+1 queries in dashboard and lead detail routes | 4 hours |
| 6 | **HIGH** | Set up connection pooling (Prisma built-in or PgBouncer) | 1 hour |
| 7 | **HIGH** | Create seed scripts for FeatureFlag, PlanEntitlement, PipelineStage | 2 hours |
| 8 | **MEDIUM** | Configure automated backups | 1 hour |
| 9 | **MEDIUM** | Add materialized views for dashboard aggregations | 2 hours |
| 10 | **MEDIUM** | Consider `String[]` for Lead.tags instead of JSON | 1 hour |
| 11 | **LOW** | Move CompetitorData.websiteHtml to S3 | 2 hours |
| 12 | **LOW** | Implement LISTEN/NOTIFY for realtime features | 4 hours |
| 13 | **LOW** | Set up pg_stat_statements monitoring | 1 hour |

---

## 10. Conclusion

AcquisitionOS has a well-designed database schema with 88 models, 348 indexes, and proper relational integrity. The current SQLite setup works for development but **cannot support production workloads** due to its single-writer limitation and lack of concurrent access support.

The migration to PostgreSQL is **low-risk and straightforward** because:
1. The database is pre-production (minimal data to migrate)
2. Prisma handles most schema translation automatically
3. The main manual work is converting `String` JSON fields to native `Json` type
4. No application logic changes needed beyond the Prisma client regeneration

**Estimated total effort: 23 hours over 7 calendar days**  
**Estimated downtime: 0 minutes** (parallel deployment strategy)  
**Recommended provider: Supabase or Neon** for fastest time-to-production

---

*Report generated by Task L9 — Production Database Migration Report*  
*No code or database changes were made during this analysis.*
