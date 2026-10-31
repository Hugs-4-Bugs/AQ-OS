// ═══════════════════════════════════════════════════════════════════
// Phase 34 — Gap 2: Redeploy / Build Persistence
//
// Closes the explicit Phase 34 acceptance gap:
//   "Prove that an application build/redeploy does NOT recreate/reset
//    the persistent database."
//
// Production build command (package.json):
//   "build": "prisma generate && next build --webpack && node scripts/clean-standalone.js"
//
// Three steps; each must be checked for DB impact:
//   1. `prisma generate`  — generates TS client from schema.prisma.
//                           Does NOT touch the DB file at all.
//   2. `next build`       — compiles the Next.js app. Reads schema.prisma
//                           for type generation; does NOT touch the DB file.
//   3. `scripts/clean-standalone.js` — copies db/custom.db INTO the
//                           standalone build output (.next/standalone/db/)
//                           via fs.copyFileSync (READ-ONLY on the source).
//                           This is the ONLY step that touches the DB area.
//
// This test runs the actual production DB-touching step
// (`node scripts/clean-standalone.js`) and verifies:
//   - Source DB file sha256 is byte-identical before/after.
//   - Source DB file size is identical.
//   - Every durable record type the user listed (User, Profile, Lead,
//     Workflow, Execution, Subscription, Credits, AuditLog) is unchanged
//     by primary-key + key fields.
//
// `next build` itself cannot be run end-to-end in this sandbox due to
// memory limits, but its source code path is reviewed and documented:
//   - next.config.ts does not write to db/.
//   - next build writes only to .next/ (build cache + output).
//   - prisma generate writes only to node_modules/.prisma/client/.
//
// The test ALSO exercises `prisma generate` directly to prove step 1
// is non-destructive.
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, statSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { db } from '@/lib/db';

vi.hoisted(() => {
  process.env.DATABASE_URL = 'file:/home/z/my-project/db/custom.db';
});

const REPO = '/home/z/my-project';
const DB_PATH = join(REPO, 'db', 'custom.db');
const STANDALONE_DIR = join(REPO, '.next', 'standalone');

function sha256OfFile(p: string): string {
  const buf = readFileSync(p);
  return createHash('sha256').update(buf).digest('hex');
}

function snapshotDB() {
  const stat = statSync(DB_PATH);
  return {
    path: DB_PATH,
    size: stat.size,
    mtimeMs: stat.mtimeMs,
    sha256: sha256OfFile(DB_PATH),
  };
}

// Durable records chosen to span every entity the user listed.
// We pick stable, pre-existing rows (real production data) so the test
// doesn't have to create anything and the assertion is "production data
// survived the build".
async function snapshotDurableRecords() {
  // Pick the two known preserved users from the Phase 33 baseline.
  const katty = await db.user.findUnique({
    where: { email: 'kattyboy785@gmail.com' },
    select: { id: true, email: true, plan: true, credits: true, name: true, isActive: true, deletedAt: true, createdAt: true },
  });
  const prabhat = await db.user.findUnique({
    where: { email: 'mailtoprabhat72@gmail.com' },
    select: { id: true, email: true, plan: true, credits: true, name: true, isActive: true, deletedAt: true, createdAt: true },
  });

  // A business profile (any one)
  const profile = await db.businessProfile.findFirst({
    orderBy: { createdAt: 'asc' },
    select: { id: true, userId: true, name: true, industry: true, isDefault: true, createdAt: true, updatedAt: true },
  });

  // A lead (any one)
  const lead = await db.lead.findFirst({
    orderBy: { createdAt: 'asc' },
    select: { id: true, userId: true, businessName: true, email: true, stage: true, isActive: true, createdAt: true },
  });

  // A workflow definition
  const workflow = await db.workflowDefinition.findFirst({
    orderBy: { createdAt: 'asc' },
    select: { id: true, userId: true, name: true, status: true, triggerType: true, createdAt: true },
  });

  // A workflow execution
  const execution = await db.workflowExecution.findFirst({
    orderBy: { createdAt: 'asc' },
    select: { id: true, workflowId: true, userId: true, status: true, currentStep: true, createdAt: true },
  });

  // A subscription
  const subscription = await db.subscription.findFirst({
    orderBy: { createdAt: 'asc' },
    select: { id: true, userId: true, plan: true, status: true, createdAt: true },
  });

  // Credits ledger entry
  const credit = await db.creditsLedger.findFirst({
    orderBy: { createdAt: 'asc' },
    select: { id: true, userId: true, action: true, credits: true, balance: true, description: true, createdAt: true },
  });

  // An audit log entry
  const audit = await db.auditLog.findFirst({
    orderBy: { createdAt: 'asc' },
    select: { id: true, userId: true, action: true, resource: true, createdAt: true },
  });

  // Counts of every durable table
  const counts = {
    User: await db.user.count(),
    BusinessProfile: await db.businessProfile.count(),
    Lead: await db.lead.count(),
    WorkflowDefinition: await db.workflowDefinition.count(),
    WorkflowExecution: await db.workflowExecution.count(),
    WorkflowLog: await db.workflowLog.count(),
    Subscription: await db.subscription.count(),
    CreditsLedger: await db.creditsLedger.count(),
    PaymentOrder: await db.paymentOrder.count(),
    Invoice: await db.invoice.count(),
    AuditLog: await db.auditLog.count(),
    AutopilotRun: await db.autopilotRun.count(),
    AutopilotWorkflow: await db.autopilotWorkflow.count(),
    LeadActivity: await db.leadActivity.count(),
    OutreachMessage: await db.outreachMessage.count(),
    UserSession: await db.userSession.count(),
  };

  return {
    katty, prabhat, profile, lead, workflow, execution,
    subscription, credit, audit, counts,
  };
}

function jsonSnap(s: unknown): string {
  return JSON.stringify(s, (_k, v) =>
    v instanceof Date ? v.toISOString() : v
  );
}

describe('[Phase 34 Gap 2] Redeploy/build does NOT recreate or reset the persistent DB', () => {
  let dbBefore: ReturnType<typeof snapshotDB>;
  let dbAfter: ReturnType<typeof snapshotDB>;
  let recordsBefore: Awaited<ReturnType<typeof snapshotDurableRecords>>;
  let recordsAfter: Awaited<ReturnType<typeof snapshotDurableRecords>>;

  // We do all the work in one test so the before/after snapshots are
  // guaranteed to bracket a single build invocation. Nested snapshots
  // would let a build failure leak partial state into the comparison.
  it('REAL: source DB file is byte-identical and every durable record survives the build step', () => {
    // ── BEFORE ──────────────────────────────────────────────────────
    dbBefore = snapshotDB();
    recordsBefore = null as any;
    // sync snapshot of records (Vitest is sync at describe-it boundary
    // for `before`, but the records fn is async — we resolve inside).
    return snapshotDurableRecords().then(async (snap) => {
      recordsBefore = snap;

      // ── RUN THE BUILD STEP THAT TOUCHES THE DB AREA ───────────────
      // `prisma generate` — first build step. Prove it doesn't touch DB.
      execSync('npx prisma generate', { cwd: REPO, stdio: 'pipe', env: process.env });

      // Between prisma generate and clean-standalone, snapshot the DB
      // again to prove step 1 alone didn't touch it.
      const dbMidPrismaGenerate = snapshotDB();
      expect(dbMidPrismaGenerate.sha256).toBe(dbBefore.sha256);
      expect(dbMidPrismaGenerate.size).toBe(dbBefore.size);

      // `next build` cannot run end-to-end in this sandbox (OOM-killed),
      // but it is documented as non-DB-touching. We instead prove the
      // only DB-touching build step directly: `clean-standalone.js`.
      //
      // That script reads db/custom.db via fs.copyFileSync into
      // .next/standalone/db/. It does NOT open the file for write.
      // To run the script, .next/standalone/ must exist (the script
      // populates the whitelist inside that dir).
      if (!existsSync(STANDALONE_DIR)) {
        mkdirSync(STANDALONE_DIR, { recursive: true });
      }
      // `next build` would normally produce server.js + .env + .next/server/
      // inside the standalone dir. In this sandbox `next build` cannot run
      // end-to-end (OOM), so we stub the minimal files clean-standalone.js
      // requires to complete. The DB-copy logic (the only DB-touching
      // part) runs BEFORE the server.js existence check and is the actual
      // subject of this test.
      writeFileSync(join(STANDALONE_DIR, 'server.js'), '// stub\n');
      writeFileSync(join(STANDALONE_DIR, '.env'), 'DATABASE_URL=file:./db/custom.db\nAPP_PUBLIC_URL=http://localhost\n');

      // Run the production DB-touching build step.
      execSync('node scripts/clean-standalone.js', { cwd: REPO, stdio: 'pipe', env: process.env });

      // ── AFTER ──────────────────────────────────────────────────────
      dbAfter = snapshotDB();
      recordsAfter = await snapshotDurableRecords();

      // ── ASSERTIONS: source DB byte-identical ────────────────────────
      expect(dbAfter.sha256).toBe(dbBefore.sha256);
      expect(dbAfter.size).toBe(dbBefore.size);
      // mtime should not advance either (no write happened).
      // Note: copyFileSync opens source in read-only mode — mtime is
      // preserved.
      expect(dbAfter.mtimeMs).toBe(dbBefore.mtimeMs);

      // ── ASSERTIONS: every durable record unchanged ─────────────────
      expect(jsonSnap(recordsAfter.katty)).toBe(jsonSnap(recordsBefore.katty));
      expect(jsonSnap(recordsAfter.prabhat)).toBe(jsonSnap(recordsBefore.prabhat));
      expect(jsonSnap(recordsAfter.profile)).toBe(jsonSnap(recordsBefore.profile));
      expect(jsonSnap(recordsAfter.lead)).toBe(jsonSnap(recordsBefore.lead));
      expect(jsonSnap(recordsAfter.workflow)).toBe(jsonSnap(recordsBefore.workflow));
      expect(jsonSnap(recordsAfter.execution)).toBe(jsonSnap(recordsBefore.execution));
      expect(jsonSnap(recordsAfter.subscription)).toBe(jsonSnap(recordsBefore.subscription));
      expect(jsonSnap(recordsAfter.credit)).toBe(jsonSnap(recordsBefore.credit));
      expect(jsonSnap(recordsAfter.audit)).toBe(jsonSnap(recordsBefore.audit));

      // ── ASSERTIONS: every durable table count unchanged ────────────
      expect(recordsAfter.counts).toEqual(recordsBefore.counts);

      // ── ASSERTIONS: standalone COPY exists and matches source ──────
      const standaloneDbPath = join(STANDALONE_DIR, 'db', 'custom.db');
      expect(existsSync(standaloneDbPath)).toBe(true);
      const standaloneHash = sha256OfFile(standaloneDbPath);
      expect(standaloneHash).toBe(dbBefore.sha256);
    });
  }, 120000);

  // Cleanup the standalone test artifact so we don't leave build output
  // lying around. The artifact is regeneratable via `npm run build`.
  afterAll(() => {
    try {
      if (existsSync(STANDALONE_DIR)) {
        rmSync(STANDALONE_DIR, { recursive: true, force: true });
      }
    } catch {
      // best effort
    }
  });
});
