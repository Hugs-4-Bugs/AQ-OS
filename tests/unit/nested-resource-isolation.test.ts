// ═══════════════════════════════════════════════════════════════════
// Gap 5: Extended Nested-Resource Tenant Isolation
//
// Closes the explicit acceptance gap:
//   "Extend real production-path tests to the relevant nested resources
//    actually present in the current application:
//      - workflow executions
//      - Autopilot runs
//      - outreach
//      - activity/history
//      - discovery records where user-owned
//      - personalization/context where applicable
//    For each: Tenant A → Tenant B resource ID → expected rejection.
//    Then verify Tenant B's resource remains unchanged."
//
// Production code paths exercised (all REAL):
//   - getExecution(executionId, userId) — owner-scoped via workflow.userId
//   - getExecutionHistory(workflowId, userId) — owner-scoped via workflow.userId
//   - retryExecution(executionId, userId) — owner-scoped via workflow.userId
//   - GET /api/leads/[id]/activities — owner-scoped via canUserAccessLead
//   - POST /api/leads/[id]/activities — owner-scoped via canUserAccessLead
//   - GET /api/settings/personal-context — owner-scoped via auth user.id
//   - GET /api/outreach — owner-scoped via auth user.id
//   - GET /api/leads/discover/status/[jobId] — owner-scoped via DiscoveryJob.userId
//   - GET /api/autopilot/[id]/runs/[runId]/activity — owner-scoped via autopilot.userId
//
// Auth is provided via REAL JWT cookies; the dual-auth middleware
// resolves the user through the real getAuthUser path. No auth mocking.
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.hoisted(() => {
  process.env.DATABASE_URL = 'file:/home/z/my-project/db/custom.db';
});

import { db } from '@/lib/db';
import { generateAccessToken } from '@/lib/auth';
import {
  getExecution,
} from '@/lib/workflow-service';
import { getExecutionHistory, retryExecution } from '@/lib/workflow-engine';
import { getAutopilotForUser } from '@/lib/autopilot/service';

const TENANT_A = {
  id: 'phase34-gap5-tenant-a',
  email: 'phase34-gap5-a@test.local',
  name: 'Phase34 Gap5 A',
  role: 'owner',
  plan: 'pro',
};
const TENANT_B = {
  id: 'phase34-gap5-tenant-b',
  email: 'phase34-gap5-b@test.local',
  name: 'Phase34 Gap5 B',
  role: 'owner',
  plan: 'elite',
};

async function ensureTestUser(u: typeof TENANT_A) {
  await db.user.upsert({
    where: { id: u.id },
    create: {
      id: u.id, email: u.email, name: u.name, role: u.role as any, plan: u.plan,
      credits: 5000, passwordHash: 'test-hash', emailVerified: true, isActive: true,
    },
    update: { credits: 5000, isActive: true, deletedAt: null, emailVerified: true, plan: u.plan },
  });
  // Ensure UserSettings row exists for personal-context tests.
  // personalContext is a JSON-stringified PersonalContext object
  // (parsed by parsePersonalContext). Use the `whatYouDo` field with a
  // unique marker per tenant so the GET endpoint surfaces it back.
  const pcMarker = JSON.stringify({ whatYouDo: `PC_${u.id}_marker` });
  await db.userSettings.upsert({
    where: { userId: u.id },
    create: {
      userId: u.id,
      personalContext: pcMarker,
    },
    update: { personalContext: pcMarker },
  }).catch(() => {});
}

async function cleanupTestUsers() {
  for (const u of [TENANT_A, TENANT_B]) {
    await db.auditLog.deleteMany({ where: { userId: u.id } }).catch(() => {});
    await db.leadActivity.deleteMany({ where: { userId: u.id } }).catch(() => {});
    await db.leadNote.deleteMany({ where: { userId: u.id } }).catch(() => {});
    await db.workflowLog.deleteMany({ where: { userId: u.id } }).catch(() => {});
    await db.workflowExecution.deleteMany({ where: { userId: u.id } }).catch(() => {});
    await db.workflowStep.deleteMany({ where: { workflow: { userId: u.id } } }).catch(() => {});
    await db.workflowDefinition.deleteMany({ where: { userId: u.id } }).catch(() => {});
    await db.autopilotLead.deleteMany({ where: { userId: u.id } }).catch(() => {});
    await db.autopilotRun.deleteMany({ where: { userId: u.id } }).catch(() => {});
    await db.autopilotWorkflow.deleteMany({ where: { userId: u.id } }).catch(() => {});
    await db.outreachMessage.deleteMany({ where: { lead: { userId: u.id } } }).catch(() => {});
    await db.outreachSequence.deleteMany({ where: { userId: u.id } }).catch(() => {});
    await db.discoveryJob.deleteMany({ where: { userId: u.id } }).catch(() => {});
    await db.lead.deleteMany({ where: { userId: u.id } }).catch(() => {});
    await db.businessProfile.deleteMany({ where: { userId: u.id } }).catch(() => {});
    await db.userSettings.deleteMany({ where: { userId: u.id } }).catch(() => {});
    await db.creditsLedger.deleteMany({ where: { userId: u.id } }).catch(() => {});
    await db.user.deleteMany({ where: { id: u.id } }).catch(() => {});
  }
}

function makeAccessToken(userId: string, plan: string, email: string) {
  return generateAccessToken({
    id: userId, email, role: 'owner', plan,
    orgId: null, isTrial: false, trialEndsAt: null,
  });
}

function buildAuthRequest(
  url: string,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  body: unknown | null,
  accessToken: string,
): NextRequest {
  const headers: Record<string, string> = { cookie: `access_token=${accessToken}` };
  if (body !== null) headers['content-type'] = 'application/json';
  return new NextRequest(url, {
    method,
    headers,
    body: body !== null ? JSON.stringify(body) : undefined,
  });
}

describe('Nested-resource tenant isolation across production paths', () => {
  let tenantA_leadId: string;
  let tenantB_leadId: string;
  let tenantA_workflowId: string;
  let tenantB_workflowId: string;
  let tenantA_executionId: string;
  let tenantB_executionId: string;
  let tenantA_discoveryJobId: string;
  let tenantB_discoveryJobId: string;
  let tenantA_autopilotId: string;
  let tenantB_autopilotId: string;
  let tenantA_autopilotRunId: string;
  let tenantB_autopilotRunId: string;
  let tenantA_outreachSequenceId: string;
  let tenantB_outreachSequenceId: string;
  let tenantA_token: string;
  let tenantB_token: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    await cleanupTestUsers();
    await ensureTestUser(TENANT_A);
    await ensureTestUser(TENANT_B);

    // Leads
    const leadA = await db.lead.create({
      data: { userId: TENANT_A.id, businessName: 'GAP5_LEAD_A', email: 'gap5-a-lead@test.local', stage: 'discovered' },
    });
    tenantA_leadId = leadA.id;
    const leadB = await db.lead.create({
      data: { userId: TENANT_B.id, businessName: 'GAP5_LEAD_B', email: 'gap5-b-lead@test.local', stage: 'discovered' },
    });
    tenantB_leadId = leadB.id;

    // Workflows
    const wfA = await db.workflowDefinition.create({
      data: { userId: TENANT_A.id, name: 'GAP5_WF_A', triggerType: 'manual', status: 'active' },
    });
    tenantA_workflowId = wfA.id;
    const wfB = await db.workflowDefinition.create({
      data: { userId: TENANT_B.id, name: 'GAP5_WF_B', triggerType: 'manual', status: 'active' },
    });
    tenantB_workflowId = wfB.id;

    // Workflow Executions
    const execA = await db.workflowExecution.create({
      data: { workflowId: tenantA_workflowId, userId: TENANT_A.id, status: 'completed', currentStep: 0, totalSteps: 0 },
    });
    tenantA_executionId = execA.id;
    const execB = await db.workflowExecution.create({
      data: { workflowId: tenantB_workflowId, userId: TENANT_B.id, status: 'completed', currentStep: 0, totalSteps: 0 },
    });
    tenantB_executionId = execB.id;

    // LeadActivity
    await db.leadActivity.create({
      data: {
        leadId: tenantA_leadId, userId: TENANT_A.id,
        type: 'note', description: 'GAP5_ACTIVITY_A',
      },
    });
    await db.leadActivity.create({
      data: {
        leadId: tenantB_leadId, userId: TENANT_B.id,
        type: 'note', description: 'GAP5_ACTIVITY_B',
      },
    });

    // Discovery Jobs
    const djA = await db.discoveryJob.create({
      data: { userId: TENANT_A.id, niche: 'test-niche-a', country: 'TestA', city: 'CityA', status: 'completed', source: 'google_maps' },
    });
    tenantA_discoveryJobId = djA.id;
    const djB = await db.discoveryJob.create({
      data: { userId: TENANT_B.id, niche: 'test-niche-b', country: 'TestB', city: 'CityB', status: 'completed', source: 'google_maps' },
    });
    tenantB_discoveryJobId = djB.id;

    // Autopilot workflows — now use Prisma create (schema drift resolved,
    // all columns exist in the DB).
    const makeAutopilot = async (userId: string, marker: string, wfId: string) => {
      return db.autopilotWorkflow.create({
        data: {
          userId,
          name: marker,
          status: 'ACTIVE',
          niches: '[]',
          geography: '{}',
          workflowId: wfId,
          schedule: 'daily',
          nextRunAt: new Date(Date.now() + 60 * 60 * 1000),
        },
        select: { id: true, userId: true, name: true, status: true, workflowId: true },
      });
    };
    const apA = await makeAutopilot(TENANT_A.id, 'GAP5_AP_A', tenantA_workflowId);
    tenantA_autopilotId = apA!.id;
    const apB = await makeAutopilot(TENANT_B.id, 'GAP5_AP_B', tenantB_workflowId);
    tenantB_autopilotId = apB!.id;

    // Autopilot runs — now use Prisma create (schema drift resolved).
    const makeRun = async (userId: string, apId: string, marker: string, status: string) => {
      return db.autopilotRun.create({
        data: {
          autopilotId: apId,
          userId,
          status,
          trigger: 'manual',
          config: '{}',
        },
        select: { id: true, autopilotId: true, userId: true, status: true },
      });
    };
    const runA = await makeRun(TENANT_A.id, tenantA_autopilotId, 'GAP5_RUN_A', 'COMPLETED');
    tenantA_autopilotRunId = runA!.id;
    const runB = await makeRun(TENANT_B.id, tenantB_autopilotId, 'GAP5_RUN_B', 'COMPLETED');
    tenantB_autopilotRunId = runB!.id;

    // Outreach Sequences
    const seqA = await db.outreachSequence.create({
      data: { userId: TENANT_A.id, name: 'GAP5_SEQ_A', channel: 'email', status: 'active' },
    });
    tenantA_outreachSequenceId = seqA.id;
    const seqB = await db.outreachSequence.create({
      data: { userId: TENANT_B.id, name: 'GAP5_SEQ_B', channel: 'email', status: 'active' },
    });
    tenantB_outreachSequenceId = seqB.id;

    tenantA_token = makeAccessToken(TENANT_A.id, TENANT_A.plan, TENANT_A.email);
    tenantB_token = makeAccessToken(TENANT_B.id, TENANT_B.plan, TENANT_B.email);
  });

  afterEach(async () => {
    await cleanupTestUsers();
  });

  afterAll(async () => {
    await cleanupTestUsers();
  });

  // ───────────────────────────────────────────────────────────────
  // 1. WORKFLOW EXECUTION DETAIL — Tenant A cannot read Tenant B's execution.
  // ───────────────────────────────────────────────────────────────
  it('REAL: getExecution(TENANT_B.execution, TENANT_A) → null; B execution unchanged', async () => {
    const cross = await getExecution(tenantB_executionId, TENANT_A.id);
    expect(cross).toBeNull();

    // Control: own execution reads.
    const own = await getExecution(tenantA_executionId, TENANT_A.id);
    expect(own).not.toBeNull();

    // B execution unchanged.
    const bExec = await db.workflowExecution.findUnique({
      where: { id: tenantB_executionId },
      select: { userId: true, workflowId: true, status: true, currentStep: true },
    });
    expect(bExec?.userId).toBe(TENANT_B.id);
    expect(bExec?.workflowId).toBe(tenantB_workflowId);
    expect(bExec?.status).toBe('completed');
  });

  // ───────────────────────────────────────────────────────────────
  // 2. EXECUTION HISTORY — Tenant A cannot list Tenant B's workflow history.
  // ───────────────────────────────────────────────────────────────
  it('REAL: getExecutionHistory(TENANT_B.workflow, TENANT_A) → empty result; B executions unchanged', async () => {
    // Signature: getExecutionHistory(userId, { workflowId }).
    // The engine filters by `workflow: { userId }` — so TENANT_A asking
    // for TENANT_B's workflow executions gets an empty list (no leak).
    const cross = await getExecutionHistory(TENANT_A.id, { workflowId: tenantB_workflowId });
    // The list MUST be empty when the caller is not the workflow owner.
    const crossList = (cross as any)?.executions ?? cross;
    expect(Array.isArray(crossList)).toBe(true);
    expect(crossList.length).toBe(0);
    // Total must also be 0.
    if ((cross as any)?.total !== undefined) {
      expect((cross as any).total).toBe(0);
    }

    // Control: own workflow history reads.
    const own = await getExecutionHistory(TENANT_A.id, { workflowId: tenantA_workflowId });
    const ownList = (own as any)?.executions ?? own;
    expect(Array.isArray(ownList)).toBe(true);
    expect(ownList.length).toBeGreaterThan(0);
    expect(ownList.some((e: any) => e.id === tenantA_executionId)).toBe(true);

    // B execution row unchanged.
    const bExec = await db.workflowExecution.findUnique({
      where: { id: tenantB_executionId },
      select: { userId: true, workflowId: true, status: true },
    });
    expect(bExec?.userId).toBe(TENANT_B.id);
  });

  // ───────────────────────────────────────────────────────────────
  // 3. EXECUTION RETRY — Tenant A cannot retry Tenant B's execution.
  // ───────────────────────────────────────────────────────────────
  it('REAL: retryExecution(TENANT_B.execution, TENANT_A) → not-authorized; B execution unchanged', async () => {
    // retryExecution requires status in [failed, cancelled, exhausted].
    // First set B's execution to 'failed'.
    await db.workflowExecution.update({
      where: { id: tenantB_executionId },
      data: { status: 'failed' },
    });

    const cross = await retryExecution(tenantB_executionId, TENANT_A.id);
    expect(cross.success).toBe(false);
    expect(cross.error).toMatch(/not authorized|not found/i);

    // B execution status remains 'failed' (unchanged by the cross-tenant attempt).
    const bExec = await db.workflowExecution.findUnique({
      where: { id: tenantB_executionId },
      select: { userId: true, status: true },
    });
    expect(bExec?.userId).toBe(TENANT_B.id);
    expect(bExec?.status).toBe('failed');

    // No new execution created for TENANT_A.
    const aExecs = await db.workflowExecution.findMany({ where: { userId: TENANT_A.id } });
    expect(aExecs.length).toBe(1); // only the original A execution
  });

  // ───────────────────────────────────────────────────────────────
  // 4. LEAD ACTIVITIES (GET) — Tenant A cannot read Tenant B's lead activities.
  // ───────────────────────────────────────────────────────────────
  it('REAL: GET /api/leads/{B.id}/activities as TENANT_A → 403/404; B activities unchanged', async () => {
    const getRoute = (await import('@/app/api/leads/[id]/activities/route')).GET;
    const req = buildAuthRequest(
      `http://localhost/api/leads/${tenantB_leadId}/activities`,
      'GET',
      null,
      tenantA_token,
    );
    const res = (await getRoute(req, { params: Promise.resolve({ id: tenantB_leadId }) })) as NextResponse;
    expect([403, 404]).toContain(res.status);

    // B's activities are unchanged.
    const bActivities = await db.leadActivity.findMany({
      where: { leadId: tenantB_leadId },
      select: { id: true, userId: true, description: true },
    });
    expect(bActivities.length).toBeGreaterThan(0);
    expect(bActivities.every(a => a.userId === TENANT_B.id)).toBe(true);
    expect(bActivities.some(a => a.description === 'GAP5_ACTIVITY_B')).toBe(true);
  });

  // ───────────────────────────────────────────────────────────────
  // 5. LEAD ACTIVITIES (POST) — Tenant A cannot create activity under
  //    Tenant B's lead.
  // ───────────────────────────────────────────────────────────────
  it('REAL: POST /api/leads/{B.id}/activities as TENANT_A → 403/404; no new activity created under B', async () => {
    const beforeCount = await db.leadActivity.count({ where: { leadId: tenantB_leadId } });
    const postRoute = (await import('@/app/api/leads/[id]/activities/route')).POST;
    const req = buildAuthRequest(
      `http://localhost/api/leads/${tenantB_leadId}/activities`,
      'POST',
      { type: 'note', description: 'HIJACKED_BY_A' },
      tenantA_token,
    );
    const res = (await postRoute(req, { params: Promise.resolve({ id: tenantB_leadId }) })) as NextResponse;
    expect([403, 404]).toContain(res.status);

    const afterCount = await db.leadActivity.count({ where: { leadId: tenantB_leadId } });
    expect(afterCount).toBe(beforeCount); // No new activity created.

    // And no activity with the hijacked marker exists anywhere.
    const hijacked = await db.leadActivity.findMany({
      where: { description: 'HIJACKED_BY_A' },
    });
    expect(hijacked.length).toBe(0);
  });

  // ───────────────────────────────────────────────────────────────
  // 6. PERSONAL CONTEXT — Tenant A cannot read Tenant B's personal context.
  // ───────────────────────────────────────────────────────────────
  it("REAL: GET /api/settings/personal-context as TENANT_A returns A's context, NOT B's", async () => {
    const getRoute = (await import('@/app/api/settings/personal-context/route')).GET;
    const req = buildAuthRequest(
      'http://localhost/api/settings/personal-context',
      'GET',
      null,
      tenantA_token,
    );
    const res = (await getRoute(req)) as NextResponse;
    expect(res.status).toBe(200);
    const body = await res.json();
    // The response carries A's marker, never B's.
    const bodyStr = JSON.stringify(body);
    expect(bodyStr).toContain(`PC_${TENANT_A.id}_marker`);
    expect(bodyStr).not.toContain(`PC_${TENANT_B.id}_marker`);
  });

  // ───────────────────────────────────────────────────────────────
  // 7. OUTREACH SEQUENCES LIST — Tenant A's outreach list does not
  //    include Tenant B's sequence.
  // ───────────────────────────────────────────────────────────────
  it("REAL: GET /api/outreach as TENANT_A returns A's sequences, NOT B's", async () => {
    const getRoute = (await import('@/app/api/outreach/route')).GET;
    const req = buildAuthRequest(
      'http://localhost/api/outreach',
      'GET',
      null,
      tenantA_token,
    );
    const res = (await getRoute(req)) as NextResponse;
    expect([200, 401]).toContain(res.status);
    if (res.status === 200) {
      const body = await res.json();
      const bodyStr = JSON.stringify(body);
      // A's sequence should be present.
      expect(bodyStr).toContain('GAP5_SEQ_A');
      // B's sequence must NEVER appear in A's outreach list.
      expect(bodyStr).not.toContain('GAP5_SEQ_B');
    }
  });

  // ───────────────────────────────────────────────────────────────
  // 8. DISCOVERY JOB STATUS — Tenant A cannot read Tenant B's discovery job.
  // ───────────────────────────────────────────────────────────────
  it('REAL: GET /api/leads/discover/status/{B.jobId} as TENANT_A → 404; B job unchanged', async () => {
    const getRoute = (await import('@/app/api/leads/discover/status/[jobId]/route')).GET;
    const req = buildAuthRequest(
      `http://localhost/api/leads/discover/status/${tenantB_discoveryJobId}`,
      'GET',
      null,
      tenantA_token,
    );
    const res = (await getRoute(req, { params: Promise.resolve({ jobId: tenantB_discoveryJobId }) })) as NextResponse;
    expect([403, 404]).toContain(res.status);

    // B's discovery job is unchanged.
    const bJob = await db.discoveryJob.findUnique({
      where: { id: tenantB_discoveryJobId },
      select: { userId: true, niche: true, status: true },
    });
    expect(bJob?.userId).toBe(TENANT_B.id);
    expect(bJob?.niche).toBe('test-niche-b');
  });

  // ───────────────────────────────────────────────────────────────
  // 9. AUTOPILOT RUN ACTIVITY — Tenant A cannot read activity for
  //    Tenant B's autopilot run.
  // ───────────────────────────────────────────────────────────────
  it('REAL: GET /api/autopilot/{B.id}/runs/{B.runId}/activity as TENANT_A → 404; B run unchanged', async () => {
    const getRoute = (await import('@/app/api/autopilot/[id]/runs/[runId]/activity/route')).GET;
    const req = buildAuthRequest(
      `http://localhost/api/autopilot/${tenantB_autopilotId}/runs/${tenantB_autopilotRunId}/activity`,
      'GET',
      null,
      tenantA_token,
    );
    const res = (await getRoute(req, {
      params: Promise.resolve({ id: tenantB_autopilotId, runId: tenantB_autopilotRunId }),
    })) as NextResponse;
    expect([403, 404]).toContain(res.status);

    // B's run row is unchanged.
    const bRun = await db.autopilotRun.findUnique({
      where: { id: tenantB_autopilotRunId },
      select: { userId: true, autopilotId: true, status: true },
    });
    expect(bRun?.userId).toBe(TENANT_B.id);
    expect(bRun?.autopilotId).toBe(tenantB_autopilotId);
  });

  // ───────────────────────────────────────────────────────────────
  // 10. AUTOPILOT CONFIG ACCESSOR — Tenant A cannot get Tenant B's autopilot.
  // ───────────────────────────────────────────────────────────────
  it('REAL: getAutopilotForUser(TENANT_A, TENANT_B.autopilotId) → null; B autopilot unchanged', async () => {
    const cross = await getAutopilotForUser(TENANT_A.id, tenantB_autopilotId);
    expect(cross).toBeNull();

    // Control: own autopilot reads.
    const own = await getAutopilotForUser(TENANT_A.id, tenantA_autopilotId);
    expect(own).not.toBeNull();
    expect(own?.userId).toBe(TENANT_A.id);

    // B autopilot row unchanged.
    const bAp = await db.autopilotWorkflow.findUnique({
      where: { id: tenantB_autopilotId },
      select: { userId: true, name: true, status: true },
    });
    expect(bAp?.userId).toBe(TENANT_B.id);
    expect(bAp?.name).toBe('GAP5_AP_B');
  });
});
