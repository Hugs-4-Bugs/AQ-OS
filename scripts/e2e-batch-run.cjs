#!/usr/bin/env node
/**
 * E2E driver: multi-lead workflow execution model verification (Oct 2026).
 *
 * Phases:
 *   1. MULTI-LEAD RUN — 4 selected dental leads → ONE WorkflowExecution
 *      with 4 per-lead child items; steps progress 1→6 per lead; exactly
 *      ONE -5 charge; the executions list gains exactly ONE row.
 *   2. REPLAY PROTECTION — the same runId re-submitted → SAME execution,
 *      zero new rows, zero new charges.
 *   3. NICHE RUN — the whole Dental niche (15+ leads) as ONE execution.
 *   4. PAGINATION — server-side paging + search + totals; page changes
 *      never mutate execution state.
 *   5. MISSING NICHE → DISCOVERY — a niche with zero leads transitions
 *      discovering → running → terminal with REAL discovered leads
 *      (deduplicated against existing); fee charged only when leads exist.
 *
 * Everything is REAL: the running dev server, the real execute API routes,
 * the real batch coordinator + engine, the real AI provider, the real
 * discovery pipeline, the real database. No mocks, no fakes.
 */
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

const BASE = 'http://localhost:3000';
const USER_EMAIL = 'mailtoprabhat72@gmail.com';
const WORKFLOW_ID = 'cmvixoso60009r92hox628irg'; // "Dental Clinic Outreach"

// ── env + token ────────────────────────────────────────────────────
const envText = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
const env = {};
for (const line of envText.split('\n')) {
  const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const JWT_SECRET = env.JWT_SECRET || env.AUTH_SECRET;
if (!JWT_SECRET) { console.error('FATAL: JWT_SECRET not found in .env'); process.exit(1); }

const db = new PrismaClient();

function mintAccessToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      role: user.role,
      plan: user.plan,
      orgId: user.orgId ?? null,
      isTrial: false,
      trialEndsAt: null,
      type: 'access',
    },
    JWT_SECRET,
    { expiresIn: '15m', issuer: 'acquisitionos', audience: 'acquisitionos-api' }
  );
}

async function api(token, method, urlPath, body) {
  const res = await fetch(BASE + urlPath, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  let json = null;
  try { json = await res.json(); } catch { /* non-json */ }
  return { status: res.status, json };
}

async function balance(userId) {
  const u = await db.user.findUnique({ where: { id: userId }, select: { credits: true } });
  return u.credits;
}

async function ledgerSince(userId, sinceIso) {
  return db.creditsLedger.findMany({
    where: { userId, createdAt: { gte: new Date(sinceIso) } },
    orderBy: { createdAt: 'asc' },
    select: { action: true, credits: true, balance: true, createdAt: true, description: true },
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(executionId, predicate, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = await db.workflowExecution.findUnique({
      where: { id: executionId },
      select: { status: true, currentStep: true, totalSteps: true, error: true },
    });
    if (predicate(last)) return last;
    await sleep(2000);
  }
  console.log(`   (timeout waiting for ${label}; last state: ${JSON.stringify(last)})`);
  return last;
}

const TERMINAL = (s) => ['completed', 'failed', 'cancelled', 'exhausted', 'partial'].includes(s);

function logStep(name, ok, detail) {
  console.log(`\n${ok ? 'PASS' : 'FAIL'}  [${name}] ${detail}`);
  if (!ok) process.exitCode = 1;
}

// ── main ───────────────────────────────────────────────────────────
async function main() {
  const phase = process.argv[2] || 'all';
  const user = await db.user.findUnique({
    where: { email: USER_EMAIL },
    select: { id: true, email: true, role: true, plan: true, orgId: true, credits: true },
  });
  if (!user) { console.error('FATAL: test user not found'); process.exit(1); }
  const token = mintAccessToken(user);
  console.log(`\n====== E2E multi-lead execution model (phase ${phase}) ======`);
  console.log(`user: ${user.email} (${user.plan}) credits=${user.credits}`);

  const me = await api(token, 'GET', '/api/health');
  logStep('auth-token', me.status === 200, `GET /api/health -> ${me.status}`);

  const execRowsBefore = await db.workflowExecution.count({ where: { workflow: { userId: user.id } } });
  const itemRowsBefore = await db.workflowExecutionLead.count();
  console.log(`baseline: execution rows=${execRowsBefore}, lead-item rows=${itemRowsBefore}`);

  // ════════════════════════════════════════════════════════════════
  // PHASE 1 — multi-lead run over 4 selected leads
  // ════════════════════════════════════════════════════════════════
  if (phase === 'all' || phase === '1') {
    console.log('\n──── PHASE 1: 4 selected leads → ONE execution ────');
    const dental = await db.lead.findMany({
      where: { userId: user.id, isActive: true, deletedAt: null, niche: { contains: 'ental' } },
      select: { id: true, businessName: true, stage: true },
      take: 4,
    });
    if (dental.length < 4) { console.error('FATAL: not enough dental leads'); process.exit(1); }
    const runKey = `e2ebatch1-${Date.now().toString(36)}`;
    const t0 = new Date().toISOString();
    const balBefore = await balance(user.id);

    const res = await api(token, 'POST', `/api/workflows/${WORKFLOW_ID}/execute`, {
      target: { mode: 'selected_leads', leadIds: dental.map((l) => l.id), runId: runKey },
    });
    logStep('accept', res.status === 202, `POST execute -> ${res.status} status=${res.json?.status}`);
    const executionId = res.json?.executionId;
    logStep('one-execution-id', Boolean(executionId), `executionId=${executionId}`);

    // The batch may still be running — wait for the terminal state.
    const final = await waitFor(executionId, (e) => TERMINAL(e?.status), 240000, 'phase 1 terminal');
    logStep('terminal', TERMINAL(final?.status), `status=${final?.status} steps=${final?.currentStep}/${final?.totalSteps}${final?.error ? ' error=' + final.error.slice(0, 120) : ''}`);

    // ONE execution row + 4 child items — never 4 execution rows.
    const newRows = await db.workflowExecution.count({ where: { workflow: { userId: user.id }, startedAt: { gte: new Date(t0) } } });
    logStep('one-row', newRows === 1, `execution rows created: ${newRows} (expected 1)`);
    const items = await db.workflowExecutionLead.findMany({
      where: { executionId },
      orderBy: { createdAt: 'asc' },
      select: { leadId: true, leadName: true, status: true, attempts: true, error: true, durationMs: true, stepSummary: true },
    });
    logStep('four-items', items.length === 4, `lead items: ${items.length} (expected 4)`);
    for (const item of items) {
      const summary = item.stepSummary ? JSON.parse(item.stepSummary) : [];
      const done = summary.filter((s) => s.status === 'success').length;
      console.log(`   lead ${item.leadName}: ${item.status} attempts=${item.attempts} steps=${done} dur=${item.durationMs}ms${item.error ? ' err=' + String(item.error).slice(0, 80) : ''}`);
    }
    const completed = items.filter((i) => i.status === 'completed').length;
    logStep('per-lead-progress', completed >= 1 && final?.currentStep > 0, `${completed}/4 leads completed; overall steps=${final?.currentStep}/${final?.totalSteps}`);

    // Billing: exactly ONE -5 charge for the whole 4-lead run.
    const ledger = await ledgerSince(user.id, t0);
    const charges = ledger.filter((r) => r.action.startsWith('workflow_execution_idempotent_') && r.credits < 0);
    const refunds = ledger.filter((r) => r.credits > 0);
    const balAfter = await balance(user.id);
    logStep('billing-flat', charges.length === 1 && refunds.length === 0,
      `charges=${charges.length} refunds=${refunds.length} balance ${balBefore} → ${balAfter} (delta ${balAfter - balBefore})`);
    logStep('billing-key', charges[0]?.action?.includes(`wfexec-run:${runKey}`) ?? false, `charge key on ledger: ${charges[0]?.action?.slice(-60)}`);

    // The executions list gains exactly ONE row for this run.
    const list = await api(token, 'GET', '/api/workflows/executions?page=1&limit=10');
    const row = (list.json?.executions || []).find((e) => e.id === executionId);
    logStep('list-row', Boolean(row) && (row.leadCount ?? 0) === 4,
      `executions list row: leadCount=${row?.leadCount} leadSummary=${JSON.stringify(row?.leadSummary)}`);

    PHASE1 = { runKey, executionId };
  }

  // ════════════════════════════════════════════════════════════════
  // PHASE 2 — replay protection (same run identity)
  // ════════════════════════════════════════════════════════════════
  if (phase === 'all' || phase === '2') {
    console.log('\n──── PHASE 2: replay of the same run identity ────');
    // Standalone mode: reconstruct the phase-1 run identity from the most
    // recent e2ebatch1 execution (idempotencyKey batch_e2ebatch1-*).
    if (!PHASE1) {
      const recent = await db.workflowExecution.findFirst({
        where: { workflow: { userId: user.id }, idempotencyKey: { startsWith: 'batch_e2ebatch1-' } },
        orderBy: { startedAt: 'desc' },
        select: { id: true, idempotencyKey: true },
      });
      if (recent) {
        PHASE1 = { runKey: recent.idempotencyKey.replace(/^batch_/, ''), executionId: recent.id };
        console.log(`   replaying phase-1 run: runKey=${PHASE1.runKey} executionId=${PHASE1.executionId}`);
      }
    }
    if (PHASE1) {
    const rowsBefore = await db.workflowExecution.count({ where: { workflow: { userId: user.id } } });
    const itemsBefore = await db.workflowExecutionLead.count({ where: { executionId: PHASE1.executionId } });
    const balBefore = await balance(user.id);
    const t0 = new Date().toISOString();

    const res = await api(token, 'POST', `/api/workflows/${WORKFLOW_ID}/execute`, {
      target: { mode: 'selected_leads', leadIds: (await db.lead.findMany({ where: { userId: user.id, isActive: true, deletedAt: null, niche: { contains: 'ental' } }, select: { id: true }, take: 4 })).map((l) => l.id), runId: PHASE1.runKey },
    });
    const rowsAfter = await db.workflowExecution.count({ where: { workflow: { userId: user.id } } });
    const itemsAfter = await db.workflowExecutionLead.count({ where: { executionId: PHASE1.executionId } });
    const balAfter = await balance(user.id);
    const ledger = await ledgerSince(user.id, t0);
    logStep('replay-no-duplicate', res.json?.executionId === PHASE1.executionId && rowsAfter === rowsBefore && itemsAfter === itemsBefore,
      `replay same-execution=${res.json?.executionId === PHASE1.executionId}; rows ${rowsBefore}→${rowsAfter}; items ${itemsBefore}→${itemsAfter}`);
    logStep('replay-no-charge', balAfter === balBefore && ledger.length === 0,
      `balance ${balBefore} → ${balAfter}; ledger rows in window: ${ledger.length}`);
    } else {
      logStep('replay-skipped', false, 'no phase-1 run found to replay — run phase 1 first');
    }
  }

  // ════════════════════════════════════════════════════════════════
  // PHASE 3 — niche run (whole Dental niche as ONE execution)
  // ════════════════════════════════════════════════════════════════
  if (phase === 'all' || phase === '3') {
    console.log('\n──── PHASE 3: niche run (Dental) → ONE execution ────');
    const rowsBefore = await db.workflowExecution.count({ where: { workflow: { userId: user.id } } });
    const dentalCount = await db.lead.count({ where: { userId: user.id, isActive: true, deletedAt: null, niche: { contains: 'ental' } } });
    const t0 = new Date().toISOString();
    const balBefore = await balance(user.id);

    const res = await api(token, 'POST', `/api/workflows/${WORKFLOW_ID}/execute`, {
      target: { mode: 'niche', niche: 'Dental', runId: `e2eniche-${Date.now().toString(36)}` },
    });
    logStep('niche-accept', res.status === 202 && Boolean(res.json?.executionId),
      `POST execute niche -> ${res.status} status=${res.json?.status} leadCount=${res.json?.target?.leadCount}`);
    const executionId = res.json?.executionId;

    const final = await waitFor(executionId, (e) => TERMINAL(e?.status), 600000, 'niche run terminal');
    logStep('niche-terminal', TERMINAL(final?.status), `status=${final?.status} steps=${final?.currentStep}/${final?.totalSteps}`);

    const rowsAfter = await db.workflowExecution.count({ where: { workflow: { userId: user.id } } });
    const items = await db.workflowExecutionLead.count({ where: { executionId } });
    logStep('niche-one-row', rowsAfter === rowsBefore + 1, `execution rows ${rowsBefore} → ${rowsAfter} (+1 for ${dentalCount} leads)`);
    logStep('niche-items', items === dentalCount, `lead items: ${items} (dental niche size: ${dentalCount})`);

    const ledger = await ledgerSince(user.id, t0);
    const charges = ledger.filter((r) => r.action.startsWith('workflow_execution_idempotent_') && r.credits < 0);
    const balAfter = await balance(user.id);
    logStep('niche-billing', charges.length === 1 && balBefore - balAfter === 5,
      `charges=${charges.length}; balance ${balBefore} → ${balAfter} (delta ${balAfter - balBefore}; ${dentalCount} leads must NOT cost ${dentalCount * 5})`);
  }

  // ════════════════════════════════════════════════════════════════
  // PHASE 4 — server-side pagination
  // ════════════════════════════════════════════════════════════════
  if (phase === 'all' || phase === '4') {
    console.log('\n──── PHASE 4: executions pagination ────');
    const rowsBefore = await db.workflowExecution.count({ where: { workflow: { userId: user.id } } });

    const p1 = await api(token, 'GET', '/api/workflows/executions?page=1&limit=5');
    const p2 = await api(token, 'GET', '/api/workflows/executions?page=2&limit=5');
    logStep('page-shape', p1.status === 200 && (p1.json?.executions?.length ?? 0) === 5 && p2.status === 200,
      `page1: ${p1.json?.executions?.length} rows; page2: ${p2.json?.executions?.length} rows; total=${p1.json?.total} totalPages=${p1.json?.totalPages}`);
    const ids1 = new Set((p1.json?.executions || []).map((e) => e.id));
    const ids2 = (p2.json?.executions || []).map((e) => e.id);
    logStep('page-disjoint', ids2.length > 0 && ids2.every((id) => !ids1.has(id)), 'page 2 rows are distinct from page 1');

    const searched = await api(token, 'GET', '/api/workflows/executions?page=1&limit=50&search=Dental Clinic Outreach');
    const allNames = (searched.json?.executions || []).map((e) => e.workflowName);
    logStep('search-filter', searched.status === 200 && allNames.length > 0 && allNames.every((n) => String(n).toLowerCase().includes('dental clinic outreach')),
      `search 'Dental Clinic Outreach' → ${searched.json?.total} rows, all matching`);

    // Paging must never mutate execution state.
    await api(token, 'GET', '/api/workflows/executions?page=3&limit=5');
    await api(token, 'GET', '/api/workflows/executions?page=1&limit=5&status=failed');
    const rowsAfter = await db.workflowExecution.count({ where: { workflow: { userId: user.id } } });
    logStep('pagination-no-mutation', rowsAfter === rowsBefore, `execution rows ${rowsBefore} → ${rowsAfter} (unchanged)`);
  }

  // ════════════════════════════════════════════════════════════════
  // PHASE 5 — missing niche → discovery → execution
  // ════════════════════════════════════════════════════════════════
  if (phase === 'all' || phase === '5') {
    console.log('\n──── PHASE 5: missing niche → discovery bridge ────');
    const DISCOVERY_NICHE = 'Ayurvedic Wellness Center';
    const existing = await db.lead.count({ where: { userId: user.id, isActive: true, deletedAt: null, niche: { contains: 'Ayurvedic' } } });
    logStep('niche-empty', existing === 0, `leads matching "${DISCOVERY_NICHE}" before: ${existing}`);
    const t0 = new Date().toISOString();
    const balBefore = await balance(user.id);
    const rowsBefore = await db.workflowExecution.count({ where: { workflow: { userId: user.id } } });

    const res = await api(token, 'POST', `/api/workflows/${WORKFLOW_ID}/execute`, {
      target: { mode: 'niche', niche: DISCOVERY_NICHE, runId: `e2edisc-${Date.now().toString(36)}` },
    });
    logStep('discovering-accept', res.status === 202 && res.json?.status === 'discovering',
      `POST execute -> ${res.status} status=${res.json?.status} creditsCharged=${res.json?.creditsCharged}`);
    const executionId = res.json?.executionId;

    // Nothing charged yet; no execution rows beyond the discovering one.
    const balAtAccept = await balance(user.id);
    logStep('discovering-no-upfront-charge', balAtAccept === balBefore, `balance at accept: ${balAtAccept} (unchanged)`);

    // Wait for the discovery phase to resolve (real web search + extraction).
    const final = await waitFor(executionId, (e) => TERMINAL(e?.status), 600000, 'discovery run terminal');
    logStep('discovery-terminal', TERMINAL(final?.status), `status=${final?.status} steps=${final?.currentStep}/${final?.totalSteps}${final?.error ? ' error=' + String(final.error).slice(0, 160) : ''}`);

    const exec = await db.workflowExecution.findUnique({ where: { id: executionId }, select: { status: true, triggerData: true, currentStep: true, totalSteps: true } });
    const trigger = exec?.triggerData ? JSON.parse(exec.triggerData) : {};
    const discovery = trigger.discovery || {};
    console.log(`   discovery phase: status=${discovery.status} jobId=${discovery.jobId} discovered=${discovery.discovered} imported=${discovery.imported} duplicates=${discovery.duplicates}`);

    const items = await db.workflowExecutionLead.findMany({ where: { executionId }, select: { leadId: true, leadName: true, status: true } });
    console.log(`   resolved lead items: ${items.length}`);
    for (const item of items.slice(0, 5)) console.log(`     - ${item.leadName}: ${item.status}`);

    const ledger = await ledgerSince(user.id, t0);
    const charges = ledger.filter((r) => r.action.startsWith('workflow_execution_idempotent_') && r.credits < 0);
    const refunds = ledger.filter((r) => r.credits > 0);
    // The discovery pipeline charges 1 credit per IMPORTED lead (the
    // pre-existing Phase 7-10 rule, idempotent on jobId:lead:N) — expected
    // alongside the flat 5-credit workflow execution fee.
    const discoveryCredits = ledger
      .filter((r) => r.action.startsWith('lead_discovery_idempotent_') && r.credits < 0)
      .reduce((a, r) => a + Math.abs(r.credits), 0);
    const balAfter = await balance(user.id);
    if (items.length > 0) {
      logStep('discovery-continued', exec?.status !== 'discovering' && items.length > 0,
        `run continued with ${items.length} discovered lead(s); status=${exec?.status}`);
      logStep('discovery-billing',
        charges.length === 1 && refunds.length === 0 && balBefore - balAfter === 5 + discoveryCredits,
        `workflow charges=${charges.length} (flat 5) + discovery credits=${discoveryCredits} (1/imported lead, pre-existing rule); refunds=${refunds.length}; balance ${balBefore} → ${balAfter}`);
    } else {
      // Honest zero-result discovery: failed execution, 0 credits.
      logStep('discovery-zero-honest', exec?.status === 'failed' && charges.length === 0 && balAfter === balBefore,
        `discovery found nothing → status=${exec?.status}, charges=${charges.length}, balance unchanged`);
    }
    // Dedup: discovered leads are real persisted Lead rows for this user.
    const discoveredLeads = await db.lead.count({ where: { userId: user.id, isActive: true, deletedAt: null, niche: { contains: 'Ayurvedic' } } });
    logStep('discovery-real-leads', discoveredLeads > 0 || items.length === 0,
      `persisted "${DISCOVERY_NICHE}" leads after discovery: ${discoveredLeads}`);
  }

  await db.$disconnect();
  console.log('\n====== E2E COMPLETE ======');
}

let PHASE1 = null;
main().catch(async (e) => {
  console.error('E2E FATAL:', e);
  await db.$disconnect();
  process.exit(1);
});
