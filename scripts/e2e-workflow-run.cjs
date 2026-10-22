#!/usr/bin/env node
/**
 * E2E driver: workflow execution fix verification (Oct 2026 "fetch failed" incident).
 *
 * Phases:
 *   A. Broken config rejection — Run Now on the still-placeholder workflow
 *      must return 422 WORKFLOW_INVALID with the actionable issue, with
 *      ZERO credits charged and NO execution record created.
 *   B. (run separately, see fix-workflow-webhook-config.cjs) config repair.
 *   C. Full 6-step E2E run — real HTTP webhook → real conditions → real AI
 *      outreach → real stage move; exactly 5 credits; step 1→6 progression.
 *   D. Retry of a previously-failed (refunded) execution — completes with
 *      the reconciled actual-start re-charge.
 *
 * Everything is REAL: the running dev server, the real execute/retry API
 * routes, the real engine, the real AI provider, the real database.
 */
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

const BASE = 'http://localhost:3000';
const USER_EMAIL = 'mailtoprabhat72@gmail.com';
const WORKFLOW_ID = 'cmvixoso60009r92hox628irg'; // "Dental Clinic Outreach"
const LEAD_BANGALORE = 'cmtsrc65f000jnpmcwjsum91n'; // The Bangalore Hospital
const RETRY_EXEC = 'cmvj0airs0023r9fr269kdwcf'; // Sagar Hospitals (03:53 batch, refunded)

// ── env + token ────────────────────────────────────────────────────
const envText = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
const env = {};
for (const line of envText.split('\n')) {
  const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const JWT_SECRET = env.JWT_SECRET || env.AUTH_SECRET;
if (!JWT_SECRET) { console.error('FATAL: JWT_SECRET not found in .env'); process.exit(1); }

const db = new PrismaClient({
  datasources: { db: { url: 'file:' + path.join(__dirname, '..', 'db', 'custom.db') } },
});

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
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
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

async function latestLedger(userId, sinceIso, take = 10) {
  return db.creditsLedger.findMany({
    where: { userId, createdAt: { gte: new Date(sinceIso) } },
    orderBy: { createdAt: 'desc' },
    take,
    select: { action: true, credits: true, balance: true, createdAt: true, description: true },
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForTerminal(executionId, timeoutMs = 120000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const e = await db.workflowExecution.findUnique({
      where: { id: executionId },
      select: { status: true, currentStep: true, totalSteps: true, error: true },
    });
    if (['completed', 'failed', 'cancelled', 'exhausted'].includes(e?.status)) return e;
    await sleep(1000);
  }
  return null;
}

function logStep(name, ok, detail) {
  console.log(`\n${ok ? '✓' : '✗ FAIL'}  [${name}] ${detail}`);
  if (!ok) process.exitCode = 1;
}

// ── main ───────────────────────────────────────────────────────────
async function main() {
  const phase = process.argv[2] || 'A';
  const user = await db.user.findUnique({
    where: { email: USER_EMAIL },
    select: { id: true, email: true, role: true, plan: true, orgId: true, credits: true },
  });
  if (!user) { console.error('FATAL: test user not found'); process.exit(1); }
  const token = mintAccessToken(user);
  console.log(`\n════════ E2E PHASE ${phase} ════════`);
  console.log(`user: ${user.email} (${user.plan}) id=${user.id}`);

  // sanity: token actually authenticates
  const me = await api(token, 'GET', '/api/health');
  logStep('auth-token', me.status === 200, `GET /api/health -> ${me.status}`);

  if (phase === 'A') {
    const before = await balance(user.id);
    const execCountBefore = await db.workflowExecution.count({ where: { workflowId: WORKFLOW_ID } });
    const t0 = new Date().toISOString();

    const res = await api(token, 'POST', `/api/workflows/${WORKFLOW_ID}/execute`, {
      target: { mode: 'selected_leads', leadIds: [LEAD_BANGALORE], runId: `e2ephA-${Date.now()}` },
    });

    console.log('\nHTTP', res.status);
    console.log(JSON.stringify(res.json, null, 2).slice(0, 1200));

    const is422 = res.status === 422 && res.json?.code === 'WORKFLOW_INVALID';
    const hasIssue = (res.json?.issues || []).some(
      (i) => typeof i.message === 'string' && i.message.includes('reserved documentation domain')
    );
    logStep('A1-rejection', is422, `Run Now rejected with 422 WORKFLOW_INVALID`);
    logStep('A2-actionable', hasIssue, `issue names the placeholder domain with repair guidance`);

    const after = await balance(user.id);
    const execCountAfter = await db.workflowExecution.count({ where: { workflowId: WORKFLOW_ID } });
    const ledgerRows = await latestLedger(user.id, t0);
    logStep('A3-zero-charge', after === before && ledgerRows.length === 0,
      `balance ${before} -> ${after} (unchanged), ledger rows since start: ${ledgerRows.length}`);
    logStep('A4-no-execution', execCountAfter === execCountBefore,
      `execution count ${execCountBefore} -> ${execCountAfter} (no record created — nothing was charged or run)`);
  }

  if (phase === 'C') {
    const before = await balance(user.id);
    const leadBefore = await db.lead.findUnique({
      where: { id: LEAD_BANGALORE },
      select: { stage: true, businessName: true },
    });
    const outreachBefore = await db.outreachMessage.count({ where: { leadId: LEAD_BANGALORE } });
    console.log(`balance before: ${before}; lead stage before: ${leadBefore.stage}; outreach msgs before: ${outreachBefore}`);

    const t0 = new Date().toISOString();
    const runId = `e2efix-${Date.now().toString(36)}`;
    const res = await api(token, 'POST', `/api/workflows/${WORKFLOW_ID}/execute`, {
      target: { mode: 'selected_leads', leadIds: [LEAD_BANGALORE], runId },
    });
    console.log(`\nHTTP ${res.status}`);
    console.log(JSON.stringify(res.json, null, 2).slice(0, 1500));

    const execId = res.json?.executions?.[0]?.executionId;
    if (!execId) { logStep('C1-kick', false, 'no executionId in response'); return; }
    const final = await waitForTerminal(execId);
    logStep('C1-kick', Boolean(final), `execution ${execId} -> status=${final?.status} step=${final?.currentStep}/${final?.totalSteps} error=${final?.error ?? 'null'}`);
    logStep('C2-completed', final?.status === 'completed', `full run reached terminal COMPLETED state`);
    logStep('C3-all-steps', final?.currentStep === final?.totalSteps, `currentStep === totalSteps (${final?.currentStep}/${final?.totalSteps})`);

    const logs = await db.workflowLog.findMany({
      where: { executionId: execId },
      orderBy: { createdAt: 'asc' },
      select: { stepName: true, stepType: true, status: true, error: true, output: true, durationMs: true },
    });
    console.log('\n── step logs ──');
    for (const l of logs) {
      console.log(`  [${l.status}] ${l.stepName} (${l.durationMs}ms)${l.error ? ' — ' + String(l.error).slice(0, 120) : ''}`);
    }
    const step1 = logs.find((l) => l.stepName === 'Search dental clinics in Varanasi');
    logStep('C4-step1-real-http', step1?.status === 'success', `step 1 succeeded — output: ${String(step1?.output).slice(0, 300)}`);
    const step5 = logs.find((l) => l.stepName === 'Create personalized outreach message');
    logStep('C5-step5-ai', step5?.status === 'success', `AI outreach step ${step5?.status} — output: ${String(step5?.output).slice(0, 200)}`);
    const step6 = logs.find((l) => l.stepName === 'Move to contacted stage');
    logStep('C6-step6-move', step6?.status === 'success', `move_lead_stage step ${step6?.status}`);

    const outreachAfter = await db.outreachMessage.count({ where: { leadId: LEAD_BANGALORE } });
    const leadAfter = await db.lead.findUnique({ where: { id: LEAD_BANGALORE }, select: { stage: true } });
    logStep('C7-ai-message-row', outreachAfter === outreachBefore + 1,
      `outreachMessage rows ${outreachBefore} -> ${outreachAfter} (real AI-generated draft stored)`);
    logStep('C8-lead-stage', leadAfter.stage === 'contacted', `lead stage ${leadBefore.stage} -> ${leadAfter.stage}`);

    const after = await balance(user.id);
    const ledgerRows = await latestLedger(user.id, t0);
    const charges = ledgerRows.filter((r) => r.credits < 0);
    const refunds = ledgerRows.filter((r) => r.credits > 0);
    logStep('C9-billing', after === before - 5 && charges.length === 1 && refunds.length === 0,
      `balance ${before} -> ${after} (exactly 5 credits; charges=${charges.length}, refunds=${refunds.length})`);
    for (const r of ledgerRows) {
      console.log(`    ledger: ${r.createdAt.toISOString()} ${r.action} credits=${r.credits} balance=${r.balance}`);
    }
  }

  if (phase === 'D') {
    const before = await balance(user.id);
    const execBefore = await db.workflowExecution.findUnique({
      where: { id: RETRY_EXEC },
      select: { status: true, currentStep: true, retryCount: true, error: true },
    });
    console.log(`balance before: ${before}; execution before: status=${execBefore.status} step=${execBefore.currentStep} retryCount=${execBefore.retryCount} error=${execBefore.error}`);

    const t0 = new Date().toISOString();
    const res = await api(token, 'POST', `/api/workflows/executions/${RETRY_EXEC}/retry`);
    console.log(`\nHTTP ${res.status}`);
    console.log(JSON.stringify(res.json, null, 2).slice(0, 800));

    const final = await waitForTerminal(RETRY_EXEC);
    logStep('D1-retry-runs', Boolean(final), `retried execution -> status=${final?.status} step=${final?.currentStep}/${final?.totalSteps} error=${final?.error ?? 'null'}`);
    logStep('D2-completed', final?.status === 'completed', `retry completed the full workflow`);

    const logs = await db.workflowLog.findMany({
      where: { executionId: RETRY_EXEC, createdAt: { gte: new Date(t0) } },
      orderBy: { createdAt: 'asc' },
      select: { stepName: true, status: true, error: true },
    });
    console.log('\n── retry step logs ──');
    for (const l of logs) console.log(`  [${l.status}] ${l.stepName}${l.error ? ' — ' + String(l.error).slice(0, 100) : ''}`);

    const execAfter = await db.workflowExecution.findUnique({
      where: { id: RETRY_EXEC },
      select: { retryCount: true },
    });
    logStep('D3-retry-count', execAfter.retryCount === execBefore.retryCount + 1, `retryCount ${execBefore.retryCount} -> ${execAfter.retryCount}`);

    const after = await balance(user.id);
    const ledgerRows = await latestLedger(user.id, t0);
    const recharge = ledgerRows.find((r) => r.action.includes('wfexec-started'));
    logStep('D4-billing-reconciled', after === before - 5 && Boolean(recharge),
      `balance ${before} -> ${after} (actual-start re-charge of exactly 5, reconciled with the earlier never-started refund)`);
    for (const r of ledgerRows) {
      console.log(`    ledger: ${r.createdAt.toISOString()} ${r.action} credits=${r.credits} balance=${r.balance}`);
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => db.$disconnect());
