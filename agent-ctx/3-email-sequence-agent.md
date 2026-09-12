# Email Sequence Engine — Task 3-email-sequence

## Task
Implement the complete email sequence automation engine for AcquisitionOS.

## Work Summary

### Files Created (9 total):

1. **`/src/lib/email-sequence-engine.ts`** — Core engine with `EmailSequenceEngine` class:
   - `createSequence()` — Creates sequence with steps in a single Prisma transaction
   - `enrollLead()` — Enrolls lead with full validation (active sequence, no duplicate, has email, not unsubscribed)
   - `processDueSteps()` — Processes all enrollments where `nextSendAt <= now` and `status === 'active'`
   - `advanceEnrollment()` — Increments currentStep, calculates nextSendAt, marks completed on last step
   - `pauseEnrollment()` / `resumeEnrollment()` — Status transitions with nextSendAt recalculation
   - `getAnalytics()` — Aggregates enrollment counts and per-step OutreachMessage stats
   - `executeStep()` — Sends email, creates OutreachMessage record, updates lead status
   - `processTemplate()` — Replaces `{{variable}}` placeholders

2. **`/src/app/api/sequences/create/route.ts`** — POST /api/sequences/create
3. **`/src/app/api/sequences/list/route.ts`** — GET /api/sequences/list
4. **`/src/app/api/sequences/[id]/route.ts`** — GET/PUT/DELETE /api/sequences/[id]
5. **`/src/app/api/sequences/enroll/route.ts`** — POST /api/sequences/enroll (single + bulk)
6. **`/src/app/api/sequences/pause/route.ts`** — POST /api/sequences/pause
7. **`/src/app/api/sequences/resume/route.ts`** — POST /api/sequences/resume
8. **`/src/app/api/sequences/analytics/route.ts`** — GET /api/sequences/analytics
9. **`/src/app/api/cron/sequence-processing/route.ts`** — POST /api/cron/sequence-processing

### Key Decisions:
- Used `NextRequest` type (not `Request`) to match `withAuth` middleware signature
- Template variables: `{{businessName}}`, `{{ownerName}}`, `{{leadEmail}}`
- Email tracking pixel embedded in each sequence email
- Bulk enrollment via `leadIds` array with per-lead success/failure results
- Cron auth via Bearer token (CRON_SECRET env var, defaults to `acquisitionos-cron-dev`)

### Verification:
- TypeScript: 0 errors
- ESLint: 0 new errors (only pre-existing warnings in unrelated files)
