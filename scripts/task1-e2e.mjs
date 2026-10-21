// TASK 1 — Live E2E via the REAL API routes (the same routes the UI calls).
// QA user: testfix@test.local (plan=pro) — the sanctioned QA account.
// All test activity is ADDITIVE (new workflows + executions for the QA user);
// existing leads' owner/stage/status are guarded by the DB snapshot script.
//
// Tests:
//   A  — existing workflow executes end-to-end (legacy single-lead shape)
//   A2 — the REPORTED bug: 4-step workflow (wait → ai_outreach → move →
//        Record activity with NO content) completes ALL steps
//   B  — multi-lead execution: 3 selected leads, one execution each,
//        no unrelated lead executed
//   B2 — PLAN-ENTITLEMENT regression: PRO user selects 26 leads — ALLOWED
//        (proves the arbitrary 25 hard cap is gone; the entitlement system
//        gives Pro/Elite unlimited leads — Free=10, Starter=25)
//   C  — user isolation: foreign leadId → rejected, nothing executed
//   D  — failure handling: send_email with no recipient & lead without
//        email → honest failed status + error surfaced
//   E  — persistence: workflow config unchanged after runs; execution
//        records persist the target snapshot (mode + batch + leadId)
import jwt from 'jsonwebtoken';
import { readFileSync } from 'fs';

const BASE = 'http://localhost:3000';
const QA_USER_ID = 'cmtuc4av20000npbje6elo5ic';
const env = readFileSync('/home/z/my-project/.env', 'utf8');
const secret = env.split('\n').find((l) => l.startsWith('JWT_SECRET=')).slice('JWT_SECRET='.length).trim().replace(/^["']|["']$/g, '');
const token = jwt.sign(
  { sub: QA_USER_ID, email: 'testfix@test.local', role: 'owner', plan: 'pro', orgId: null, type: 'access' },
  secret,
  { expiresIn: '2h', issuer: 'acquisitionos', audience: 'acquisitionos-api' }
);
const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

async function api(method, path, body) {
  const res = await fetch(`${BASE}${path}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { }
  return { status: res.status, json, text: json ? undefined : text.slice(0, 300) };
}
const log = (label, r) => console.log(`\n=== ${label} → HTTP ${r.status} ===\n` + JSON.stringify(r.json ?? r.text, null, 2).slice(0, 1400));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const record = (name, pass, detail) => { results.push({ name, pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`); };

const parseTriggerData = (td) => {
  if (!td) return {};
  if (typeof td === 'string') { try { return JSON.parse(td); } catch { return {}; } }
  return td;
};

// ── Fixtures (restored-DB IDs, verified present) ──────────────────
const EXISTING_WF = 'cmvfqc6o5000nm2v3lrf14g4z'; // QA Phase3 Autopilot Workflow (active)
const LEAD_A = 'cmvfqcz1l001pm2v3y44wzlqa';       // Read and Brew (bookstores, contacted)
const LEAD_B = 'cmvfqzwgm00imm2qkn6nlo27f';       // My Stationery
const LEAD_C = 'cmvfqzwg300igm2qkwsr0m1vk';       // Leader Stationers
const UNRELATED_LEAD = 'cmvfqzwe500i4m2qkh9rsj1ok'; // Popular Stationery — must NOT be executed
const FOREIGN_LEAD = 'cmqme6hgj0023rc2j1d2dhukv'; // belongs to another user
const REPRO_NAME = 'QA Task1 Repro: Record activity bug';
const CAP_NAME = 'QA Task1 Cap Probe: add note only';
const FAIL_NAME = 'QA Task1 Failure Probe: no recipient';

async function findOrCreateWorkflow(name, payload) {
  const list = await api('GET', '/api/workflows?limit=100');
  const found = (list.json?.workflows || []).find((w) => w.name === name);
  if (found) return found;
  const created = await api('POST', '/api/workflows', payload);
  if (created.status !== 201) throw new Error(`create workflow failed: ${created.status} ${JSON.stringify(created.json)}`);
  return created.json;
}

async function findLeadWithoutEmail() {
  const res = await api('GET', '/api/leads?limit=100&sortBy=updatedAt&sortOrder=desc');
  const leads = res.json?.leads || [];
  const noEmail = leads.find((l) => l.userId === QA_USER_ID && !l.email);
  return noEmail || null;
}

async function executionCountFor(workflowId) {
  const res = await api('GET', `/api/workflows/executions?workflowId=${workflowId}&limit=100`);
  return (res.json?.executions || []).length;
}

// ── Setup: create the three QA workflows (idempotent find-or-create) ──
const REPRO = await findOrCreateWorkflow(REPRO_NAME, {
  name: REPRO_NAME,
  description: 'QA Task1: mirrors the reported 4-step broken workflow (contentless Record activity).',
  triggerType: 'manual',
  triggerConfig: {},
  nodes: [
    { id: 'trigger', type: 'trigger', title: 'Manual', config: {} },
    { id: 'n1', type: 'delay', title: 'Wait 2 hours', config: { actionType: 'wait_delay', duration: 2, unit: 'hours' } },
    { id: 'n2', type: 'ai_action', title: 'Send personalized follow-up using AI', config: { actionType: 'ai_outreach' } },
    { id: 'n3', type: 'action', title: 'Move to Contacted stage', config: { actionType: 'move_lead_stage', stage: 'contacted' } },
    { id: 'n4', type: 'action', title: 'Record activity', config: { actionType: 'add_note' } },
  ],
  edges: [
    { id: 'e1', source: 'trigger', target: 'n1' },
    { id: 'e2', source: 'n1', target: 'n2' },
    { id: 'e3', source: 'n2', target: 'n3' },
    { id: 'e4', source: 'n3', target: 'n4' },
  ],
  steps: [
    { type: 'delay', name: 'Wait 2 hours', config: { actionType: 'wait_delay', duration: 2, unit: 'hours' }, order: 0 },
    { type: 'ai_action', name: 'Send personalized follow-up using AI', config: { actionType: 'ai_outreach' }, order: 1 },
    { type: 'action', name: 'Move to Contacted stage', config: { actionType: 'move_lead_stage', stage: 'contacted' }, order: 2 },
    { type: 'action', name: 'Record activity', config: { actionType: 'add_note' }, order: 3 },
  ],
  status: 'draft',
});
record('A2 setup: repro workflow present', Boolean(REPRO?.id), `id=${REPRO?.id}`);

const CAP_WF = await findOrCreateWorkflow(CAP_NAME, {
  name: CAP_NAME,
  description: 'QA Task1: light single-step workflow for the plan-limit regression run.',
  triggerType: 'manual',
  triggerConfig: {},
  nodes: [
    { id: 'trigger', type: 'trigger', title: 'Manual', config: {} },
    { id: 'n1', type: 'action', title: 'Record QA activity', config: { actionType: 'add_note', content: 'QA Task1 cap-probe run.' } },
  ],
  edges: [{ id: 'e1', source: 'trigger', target: 'n1' }],
  steps: [
    { type: 'action', name: 'Record QA activity', config: { actionType: 'add_note', content: 'QA Task1 cap-probe run.' }, order: 0 },
  ],
  status: 'draft',
});
record('B2 setup: cap-probe workflow present', Boolean(CAP_WF?.id), `id=${CAP_WF?.id}`);

const FAIL_WF = await findOrCreateWorkflow(FAIL_NAME, {
  name: FAIL_NAME,
  description: 'QA Task1: forced failure probe (send_email with no recipient).',
  triggerType: 'manual',
  triggerConfig: {},
  nodes: [
    { id: 'trigger', type: 'trigger', title: 'Manual', config: {} },
    { id: 'n1', type: 'action', title: 'Send email', config: { actionType: 'send_email', subject: 'x', body: 'y' } },
  ],
  edges: [{ id: 'e1', source: 'trigger', target: 'n1' }],
  steps: [
    { type: 'action', name: 'Send email', config: { actionType: 'send_email', subject: 'x', body: 'y' }, order: 0 },
  ],
  status: 'draft',
});
record('D setup: failure-probe workflow present', Boolean(FAIL_WF?.id), `id=${FAIL_WF?.id}`);

// ── Test A: existing workflow, legacy single-lead shape ────────────
{
  const r = await api('POST', `/api/workflows/${EXISTING_WF}/execute`, {
    triggerData: { leadId: LEAD_A, leadName: 'Read and Brew' },
  });
  log('A: existing workflow (legacy single-lead)', r);
  record('A: existing workflow executes', r.status === 202 && r.json?.status === 'completed', `status=${r.json?.status} executionId=${r.json?.executionId}`);
}

// ── Test A2: the reported bug — contentless Record activity ───────
{
  const r = await api('POST', `/api/workflows/${REPRO.id}/execute`, {
    triggerData: { leadId: LEAD_B, leadName: 'My Stationery' },
  });
  log('A2: reported-bug repro', r);
  const ok = r.status === 202 && r.json?.status === 'completed' && !r.json?.error;
  record('A2: reported bug fixed — all 4 steps complete', ok, `status=${r.json?.status} error=${r.json?.error}`);

  // Verify the Record-activity step actually succeeded in the execution detail.
  const execs = await api('GET', `/api/workflows/executions?workflowId=${REPRO.id}&limit=5`);
  const latest = (execs.json?.executions || [])[0];
  if (latest) {
    const detail = await api('GET', `/api/workflows/logs?executionId=${latest.id}`);
    const stepLogs = detail.json?.stepLogs || [];
    const noteStep = stepLogs.find((l) => (l.stepName || '').includes('Record activity'));
    record('A2: Record activity step succeeded (was "Note content is required")',
      noteStep?.status === 'success', `noteStep=${noteStep?.status}`);
    const successCount = stepLogs.filter((l) => l.status === 'success').length;
    record('A2: all 4 steps succeeded', successCount === 4, `${successCount}/4 success`);
  } else {
    record('A2: Record activity step succeeded (was "Note content is required")', false, 'execution not found');
  }
}

// ── Test B: multi-lead targeted run ────────────────────────────────
{
  const before = await executionCountFor(REPRO.id);
  const r = await api('POST', `/api/workflows/${REPRO.id}/execute`, {
    target: { mode: 'selected_leads', leadIds: [LEAD_A, LEAD_B, LEAD_C] },
  });
  log('B: multi-lead (3 selected)', r);
  const execs = r.json?.executions || [];
  const targeted = new Set(execs.map((e) => e.leadId));
  record('B: multi-lead run accepted with 3 executions',
    r.status === 202 && r.json?.target?.leadCount === 3 && execs.length === 3,
    `leadCount=${r.json?.target?.leadCount} batch=${r.json?.target?.runBatchId}`);
  record('B: executions targeted exactly the 3 selected leads (no unrelated lead)',
    targeted.has(LEAD_A) && targeted.has(LEAD_B) && targeted.has(LEAD_C) && !targeted.has(UNRELATED_LEAD) && targeted.size === 3,
    [...targeted].map((id) => id.slice(-6)).join(','));

  // Wait for background executions to finish, then re-check statuses.
  let final = execs;
  for (let i = 0; i < 40; i++) {
    await sleep(3000);
    const list = await api('GET', `/api/workflows/executions?workflowId=${REPRO.id}&limit=50`);
    const forWf = list.json?.executions || [];
    const settled = execs.every((e) => {
      const row = forWf.find((f) => f.id === e.executionId);
      return row && (row.status === 'completed' || row.status === 'failed');
    });
    if (settled) {
      final = execs.map((e) => {
        const row = forWf.find((f) => f.id === e.executionId);
        return { ...e, status: row?.status ?? e.status };
      });
      break;
    }
  }
  const statuses = final.map((e) => e.status);
  record('B: all 3 executions completed', statuses.every((s) => s === 'completed'), statuses.join(','));

  // Target snapshot persisted on each execution? (detail API exposes triggerData)
  let snapshotCount = 0;
  for (const e of execs) {
    const detail = await api('GET', `/api/workflows/logs?executionId=${e.executionId}`);
    const td = detail.json?.triggerData;
    if (td?.target?.mode === 'selected_leads' && td?.target?.runBatchId && td?.target?.leadId) snapshotCount++;
  }
  record('E: target snapshot (mode+batch+leadId) persisted on every execution',
    snapshotCount === 3, `snapshots=${snapshotCount}/3`);
  void before;
}

// ── Test B2: plan-entitlement regression — PRO selects 26 leads ───
{
  // Gather 26 of the QA user's own active leads (bookstores niche).
  const res = await api('GET', '/api/leads?limit=100&sortBy=createdAt&sortOrder=asc');
  const own = (res.json?.leads || []).filter((l) => l.userId === QA_USER_ID && l.isActive);
  const twentySix = own.slice(0, 26).map((l) => l.id);
  record('B2 setup: 26 own leads gathered', twentySix.length === 26, `count=${twentySix.length}`);

  const r = await api('POST', `/api/workflows/${CAP_WF.id}/execute`, {
    target: { mode: 'selected_leads', leadIds: twentySix },
  });
  log('B2: 26-lead selection on PRO plan', { ...r, json: { ...r.json, executions: (r.json?.executions || []).length } });
  const accepted = r.status === 202 && r.json?.target?.leadCount === 26;
  record('B2: PRO plan allows 26 selected leads (arbitrary 25 cap is GONE)', accepted,
    `status=${r.status} leadCount=${r.json?.target?.leadCount}${r.json?.code ? ' code=' + r.json?.code : ''}`);

  // The light workflow's executions settle fast; poll briefly.
  let completed = 0;
  for (let i = 0; i < 30; i++) {
    await sleep(2000);
    const list = await api('GET', `/api/workflows/executions?workflowId=${CAP_WF.id}&limit=100`);
    const forWf = list.json?.executions || [];
    if (forWf.length >= 26 && forWf.every((e) => e.status === 'completed' || e.status === 'failed')) {
      completed = forWf.filter((e) => e.status === 'completed').length;
      break;
    }
  }
  record('B2: all 26 executions completed', completed >= 26, `completed=${completed}/26`);
}

// ── Test C: user isolation (all-or-nothing) ────────────────────────
{
  const before = await executionCountFor(REPRO.id);
  const rMixed = await api('POST', `/api/workflows/${REPRO.id}/execute`, {
    target: { mode: 'selected_leads', leadIds: [LEAD_A, FOREIGN_LEAD] },
  });
  log('C: foreign lead mixed into selection', rMixed);
  record('C: foreign lead rejected (400 LEAD_NOT_FOUND)', rMixed.status === 400 && rMixed.json?.code === 'LEAD_NOT_FOUND', `code=${rMixed.json?.code}`);

  const rLegacy = await api('POST', `/api/workflows/${REPRO.id}/execute`, {
    triggerData: { leadId: FOREIGN_LEAD },
  });
  record('C: legacy single foreign lead rejected too', rLegacy.status === 400, `status=${rLegacy.status}`);

  const rMissing = await api('POST', `/api/workflows/${REPRO.id}/execute`, {
    target: { mode: 'selected_leads', leadIds: ['nonexistent-lead-id'] },
  });
  record('C: nonexistent lead rejected', rMissing.status === 400, `status=${rMissing.status}`);

  const after = await executionCountFor(REPRO.id);
  record('C: nothing executed for rejected requests (all-or-nothing)', before === after, `executions before=${before} after=${after}`);
}

// ── Test D: honest failure handling ────────────────────────────────
{
  const noEmailLead = await findLeadWithoutEmail();
  record('D setup: found a QA lead without email', Boolean(noEmailLead), noEmailLead ? `${noEmailLead.businessName} (${noEmailLead.id})` : 'none');
  const r = await api('POST', `/api/workflows/${FAIL_WF.id}/execute`, {
    target: { mode: 'selected_leads', leadIds: [noEmailLead.id] },
  });
  log('D: failure probe (no recipient)', r);
  const exec = (r.json?.executions || [])[0];
  record('D: honest failure — status failed with error surfaced',
    r.json?.status === 'failed' && (r.json?.error || exec?.error), `status=${r.json?.status} error="${(r.json?.error || exec?.error || '').slice(0, 60)}"`);
  record('D: failure NOT reported as success', r.json?.status !== 'completed' && !exec || exec?.status !== 'completed', `execStatus=${exec?.status}`);

  // The failed state is persisted on the execution record.
  const list = await api('GET', `/api/workflows/executions?workflowId=${FAIL_WF.id}&limit=50`);
  const failedRow = (list.json?.executions || []).find((e) => e.workflowId === FAIL_WF.id && e.status === 'failed');
  record('D: failure persisted on the execution record', Boolean(failedRow), failedRow ? `id=${failedRow.id.slice(-8)}` : 'not found');
}

// ── Test E: persistence across reload ──────────────────────────────
{
  const r = await api('GET', `/api/workflows/${REPRO.id}`);
  const wf = r.json;
  const steps = wf?.workflowSteps?.length || 0;
  const nodes = (wf?.nodes || []).filter((n) => n.type !== 'trigger').length;
  record('E: workflow config survives reload (4 steps intact)', steps === 4 && nodes === 4, `steps=${steps} nodes=${nodes}`);

  const noteStep = (wf?.workflowSteps || []).find((s) => JSON.stringify(s.config || {}).includes('add_note'));
  const hasContent = noteStep ? JSON.stringify(noteStep.config || {}).includes('"content"') : false;
  record('E: repro workflow persisted the contentless add_note shape (as created)',
    Boolean(noteStep) && !hasContent, noteStep ? (hasContent ? 'unexpectedly has content' : 'contentless (fix is at execution layer; creation paths now validate)') : 'no note step');
}

// ── Summary ────────────────────────────────────────────────────────
const passed = results.filter((r) => r.pass).length;
console.log(`\n════════ TASK 1 E2E SUMMARY ════════`);
for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}  ${r.detail ? `(${r.detail})` : ''}`);
console.log(`\n${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);
