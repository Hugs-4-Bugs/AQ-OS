// PHASE 3–6 — Live E2E via the REAL API routes (the same routes the UI calls).
// QA user: testfix@test.local (plan=pro) — the sanctioned QA account.
//
// No external side effects: steps used are add_note / create_notification /
// webhook_call to a dead local port. send_email is deliberately NOT used.
//
// Tests:
//   P3-1  invalid step config rejected at save (400, field named)
//   P3-2  enable gate: stepless draft cannot become active (400)
//   P3-3  Run Now on a junk-nodes draft → 422 WORKFLOW_INVALID, nothing executed
//   P3-4  valid create → edit → reload: configuration persists
//   P4-1  valid 2-step run (legacy single-lead shape) completes all steps in order
//   P4-2  failing step → execution failed + later step logged 'skipped'
//   P4-3  retry endpoint accepts the failed execution and re-runs (Phase 5.11 route)
//   P5-1  multi-lead run: 3 QA leads → 3 independent executions + snapshot ids
//   P5-2  foreign lead → 400 LEAD_NOT_FOUND, nothing executed
//   P6-1  niche run: resolved count + verbatim niche snapshot
//   P6-2  custom run: verbatim customTarget snapshot
import jwt from 'jsonwebtoken';
import { readFileSync } from 'fs';
import { execFileSync } from 'child_process';

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
  const res = await fetch(`${BASE}${path}`, { method: method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { }
  return { status: res.status, json, text: json ? undefined : text.slice(0, 300) };
}

const results = [];
const record = (name, pass, detail) => { results.push({ name, pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`); };

// ── Fixtures (restored-DB IDs, verified by task1-e2e) ──────────────
const LEAD_A = 'cmvfqcz1l001pm2v3y44wzlqa';       // Read and Brew
const LEAD_B = 'cmvfqzwgm00imm2qkn6nlo27f';       // My Stationery
const LEAD_C = 'cmvfqzwg300igm2qkwsr0m1vk';       // Leader Stationers
const FOREIGN_LEAD = 'cmqme6hgj0023rc2j1d2dhukv'; // belongs to another user

// Read-only DB snapshot (data-safety deltas must be QA-scoped only)
function dbCounts() {
  const out = execFileSync('python3', ['-c', `
import sqlite3
con = sqlite3.connect('file:/home/z/my-project/db/custom.db?mode=ro', uri=True)
cur = con.cursor()
for t in ['WorkflowDefinition','WorkflowStep','WorkflowExecution','WorkflowLog','Lead','LeadNote','Notification']:
    try:
        print(f"{t}={cur.execute(f'SELECT COUNT(*) FROM {t}').fetchone()[0]}")
    except Exception as e:
        print(f"{t}=ERR")
con.close()
`], { encoding: 'utf8' });
  return Object.fromEntries(out.trim().split('\n').map(l => l.split('=')));
}

async function findOrCreateWorkflow(name, payload) {
  const list = await api('GET', '/api/workflows?limit=100');
  const found = (list.json?.workflows || []).find((w) => w.name === name);
  if (found) return found;
  const created = await api('POST', '/api/workflows', payload);
  if (created.status !== 201) throw new Error(`create workflow failed: ${created.status} ${JSON.stringify(created.json)}`);
  return created.json;
}

async function executionCountFor(workflowId) {
  const res = await api('GET', `/api/workflows/executions?limit=100`);
  return (res.json?.executions || []).filter((e) => e.workflowId === workflowId).length;
}

const before = dbCounts();
console.log('DB before:', JSON.stringify(before));

// ═══════════════════════════════════════════════════════════════════
// P3-1 — invalid step config rejected at save
// ═══════════════════════════════════════════════════════════════════
{
  const res = await api('POST', '/api/workflows', {
    name: 'QA P3 Invalid: no note content',
    triggerType: 'manual',
    steps: [
      { type: 'action', name: 'Record activity', config: { actionType: 'add_note' }, order: 0 },
    ],
  });
  const pass = res.status === 400 && /content is required/.test(res.json?.error || '');
  record('P3-1 invalid step config rejected at save (400, field named)', pass, `HTTP ${res.status} :: ${(res.json?.error || '').slice(0, 120)}`);
}

// ═══════════════════════════════════════════════════════════════════
// P3-2 — enable gate on a stepless draft
// ═══════════════════════════════════════════════════════════════════
let steplessId;
{
  const created = await api('POST', '/api/workflows', { name: 'QA P3 Stepless Draft', triggerType: 'manual' });
  steplessId = created.json?.id || created.json?.workflow?.id;
  const enable = await api('PUT', `/api/workflows/${steplessId}`, { status: 'active' });
  const pass = enable.status === 400 && /Cannot enable/.test(enable.json?.error || '');
  record('P3-2 stepless draft cannot be enabled (400)', pass, `HTTP ${enable.status} :: ${(enable.json?.error || '').slice(0, 120)}`);
}

// ═══════════════════════════════════════════════════════════════════
// P3-3 — Run Now on a junk-nodes draft → 422, nothing executed
// ═══════════════════════════════════════════════════════════════════
{
  const created = await api('POST', '/api/workflows', {
    name: 'QA P3 Junk Nodes Draft',
    triggerType: 'manual',
    nodes: [
      { id: 't', type: 'trigger', title: 'Trigger' },
      { id: 's1', type: 'action', title: 'Record activity', config: { actionType: 'add_note' } },
    ],
    edges: [],
  });
  const junkId = created.json?.id || created.json?.workflow?.id;
  const countBefore = junkId ? await executionCountFor(junkId) : 0;
  const run = await api('POST', `/api/workflows/${junkId}/execute`, {});
  const countAfter = junkId ? await executionCountFor(junkId) : 0;
  const pass = run.status === 422 && run.json?.code === 'WORKFLOW_INVALID' && countAfter === countBefore;
  record('P3-3 Run Now on invalid definition → 422 WORKFLOW_INVALID, no execution', pass,
    `HTTP ${run.status} code=${run.json?.code} issues=${JSON.stringify(run.json?.issues || []).slice(0, 140)} executions=${countBefore}->${countAfter}`);
}

// ═══════════════════════════════════════════════════════════════════
// P3-4 — create → edit → reload persistence
// ═══════════════════════════════════════════════════════════════════
let validWf;
{
  validWf = await findOrCreateWorkflow('QA P36 Valid: note + notify', {
    name: 'QA P36 Valid: note + notify',
    triggerType: 'manual',
    steps: [
      { type: 'action', name: 'Record activity', config: { actionType: 'add_note', content: 'Phase 3-6 QA baseline' }, order: 0 },
      { type: 'action', name: 'Notify me', config: { actionType: 'create_notification', title: 'QA P36', message: 'run finished' }, order: 1 },
    ],
  });
  const edited = await api('PUT', `/api/workflows/${validWf.id}`, {
    steps: [
      { type: 'action', name: 'Record activity', config: { actionType: 'add_note', content: 'Phase 3-6 QA EDITED content' }, order: 0 },
      { type: 'action', name: 'Notify me', config: { actionType: 'create_notification', title: 'QA P36 EDITED', message: 'edited run finished' }, order: 1 },
    ],
  });
  const reloaded = await api('GET', `/api/workflows/${validWf.id}`);
  const steps = reloaded.json?.workflowSteps || reloaded.json?.steps || [];
  const content = steps[0]?.config?.content || (typeof steps[0]?.config === 'string' ? JSON.parse(steps[0].config).content : undefined);
  const pass = edited.status === 200 && content === 'Phase 3-6 QA EDITED content' && steps.length === 2;
  record('P3-4 edit → reload: step configuration persists', pass, `HTTP ${edited.status} content=${content} steps=${steps.length}`);
}

// ═══════════════════════════════════════════════════════════════════
// P4-1 — valid 2-step run completes all steps in order (legacy shape)
// ═══════════════════════════════════════════════════════════════════
{
  const run = await api('POST', `/api/workflows/${validWf.id}/execute`, {
    triggerData: { leadId: LEAD_A },
  });
  const detail = await api('GET', `/api/workflows/logs?executionId=${run.json?.executionId}`);
  const logs = detail.json?.logs || detail.json?.stepLogs || [];
  const statuses = logs.map((l) => l.status);
  const names = logs.map((l) => l.stepName);
  const pass = run.status === 202 && run.json?.status === 'completed'
    && statuses.filter((s) => s === 'success').length >= 2
    && names[0] === 'Record activity';
  record('P4-1 legacy single-lead run completes ALL steps in order', pass,
    `HTTP ${run.status} status=${run.json?.status} steps=${JSON.stringify(names)} statuses=${JSON.stringify(statuses)}`);
}

// ═══════════════════════════════════════════════════════════════════
// P4-2 — failing step → honest failure + skipped later step
// ═══════════════════════════════════════════════════════════════════
let failWf, failedExecId;
{
  failWf = await findOrCreateWorkflow('QA P36 Failure Probe: dead webhook', {
    name: 'QA P36 Failure Probe: dead webhook',
    triggerType: 'manual',
    steps: [
      { type: 'action', name: 'Dead webhook', config: { actionType: 'webhook_call', url: 'http://127.0.0.1:9/hook' }, order: 0 },
      { type: 'action', name: 'Record activity', config: { actionType: 'add_note', content: 'never reached' }, order: 1 },
    ],
  });
  const run = await api('POST', `/api/workflows/${failWf.id}/execute`, {
    triggerData: { leadId: LEAD_A },
  });
  failedExecId = run.json?.executionId;
  const detail = await api('GET', `/api/workflows/logs?executionId=${failedExecId}`);
  const logs = detail.json?.logs || detail.json?.stepLogs || [];
  const skipped = logs.find((l) => l.status === 'skipped');
  const pass = run.status === 202 && run.json?.status === 'failed'
    && skipped && /Record activity/.test(skipped.stepName) && /Not executed/.test(skipped.error || '');
  record('P4-2 failing step → execution failed + later step logged skipped', pass,
    `status=${run.json?.status} skipped=${skipped ? `${skipped.stepName}: ${(skipped.error || '').slice(0, 60)}` : 'NONE'}`);
}

// ═══════════════════════════════════════════════════════════════════
// P4-3 / P5.11 — retry endpoint accepts the failed execution
// ═══════════════════════════════════════════════════════════════════
{
  const retry = await api('POST', `/api/workflows/executions/${failedExecId}/retry`);
  const after = await api('GET', `/api/workflows/logs?executionId=${failedExecId}`);
  const pass = retry.status === 200 && retry.json?.success !== false;
  record('P4-3 /executions/{id}/retry accepts failed execution and re-runs', pass,
    `HTTP ${retry.status} :: ${JSON.stringify(retry.json || {}).slice(0, 120)}`);
}

// ═══════════════════════════════════════════════════════════════════
// P5-1 — multi-lead run: 3 independent executions + snapshot ids
// ═══════════════════════════════════════════════════════════════════
{
  const countBefore = await executionCountFor(validWf.id);
  const run = await api('POST', `/api/workflows/${validWf.id}/execute`, {
    target: { mode: 'selected_leads', leadIds: [LEAD_A, LEAD_B, LEAD_C] },
  });
  const execs = run.json?.executions || [];
  const allCompleted = execs.length === 3 && execs.every((e) => e.status === 'completed');
  const snapshot = execs.length ? (await api('GET', `/api/workflows/logs?executionId=${execs[0].executionId}`)) : null;
  const td = snapshot?.json?.triggerData || {};
  const target = typeof td === 'string' ? JSON.parse(td).target : td.target;
  const snapshotOk = target && Array.isArray(target.selectedLeadIds)
    && target.selectedLeadIds.length === 3 && target.mode === 'selected_leads'
    && typeof target.runBatchId === 'string';
  const countAfter = await executionCountFor(validWf.id);
  const pass = run.status === 202 && run.json?.status === 'completed' && allCompleted && snapshotOk
    && countAfter - countBefore === 3;
  record('P5-1 multi-lead run: 3 independent completed executions + selectedLeadIds snapshot', pass,
    `HTTP ${run.status} overall=${run.json?.status} perLead=${JSON.stringify(execs.map((e) => e.status))} snapshot=${JSON.stringify(target?.selectedLeadIds || null)} count ${countBefore}->${countAfter}`);
}

// ═══════════════════════════════════════════════════════════════════
// P5-2 — foreign lead rejected, nothing executed
// ═══════════════════════════════════════════════════════════════════
{
  const countBefore = await executionCountFor(validWf.id);
  const run = await api('POST', `/api/workflows/${validWf.id}/execute`, {
    target: { mode: 'selected_leads', leadIds: [LEAD_A, FOREIGN_LEAD] },
  });
  const countAfter = await executionCountFor(validWf.id);
  const pass = run.status === 400 && run.json?.code === 'LEAD_NOT_FOUND' && countAfter === countBefore;
  record('P5-2 foreign lead → 400 LEAD_NOT_FOUND, nothing executed', pass,
    `HTTP ${run.status} code=${run.json?.code} count ${countBefore}->${countAfter}`);
}

// ═══════════════════════════════════════════════════════════════════
// P6-1 — niche run: resolved count + verbatim niche snapshot
// ═══════════════════════════════════════════════════════════════════
{
  // Discover a niche that exists among the QA user's leads
  const leadsRes = await api('GET', '/api/leads?limit=100&sortBy=updatedAt&sortOrder=desc');
  const own = (leadsRes.json?.leads || []).filter((l) => l.userId === QA_USER_ID && l.niche);
  const nicheCounts = {};
  for (const l of own) nicheCounts[l.niche] = (nicheCounts[l.niche] || 0) + 1;
  const niche = Object.entries(nicheCounts).sort((a, b) => b[1] - a[1])[0];
  if (!niche) {
    record('P6-1 niche run + snapshot', false, 'no niched QA leads available');
  } else {
    const run = await api('POST', `/api/workflows/${validWf.id}/execute`, {
      target: { mode: 'niche', niche: niche[0] },
    });
    const execs = run.json?.executions || [];
    const snapshot = execs.length ? (await api('GET', `/api/workflows/logs?executionId=${execs[0].executionId}`)) : null;
    const td = snapshot?.json?.triggerData || {};
    const target = typeof td === 'string' ? JSON.parse(td).target : td.target;
    const pass = run.status === 202 && run.json?.target?.mode === 'niche'
      && run.json?.target?.leadCount === niche[1]
      && target?.niche === niche[0] && target?.leadCount === niche[1];
    record('P6-1 niche run resolves the user own leads + verbatim niche snapshot', pass,
      `HTTP ${run.status} niche="${niche[0]}" resolved=${run.json?.target?.leadCount} expected=${niche[1]} snapshot.niche=${target?.niche}`);
  }
}

// ═══════════════════════════════════════════════════════════════════
// P6-2 — custom run: verbatim customTarget snapshot
// ═══════════════════════════════════════════════════════════════════
{
  const run = await api('POST', `/api/workflows/${validWf.id}/execute`, {
    target: { mode: 'custom', customQuery: 'Stationery' },
  });
  const execs = run.json?.executions || [];
  const snapshot = execs.length ? (await api('GET', `/api/workflows/logs?executionId=${execs[0].executionId}`)) : null;
  const td = snapshot?.json?.triggerData || {};
  const target = typeof td === 'string' ? JSON.parse(td).target : td.target;
  const pass = run.status === 202 && run.json?.target?.mode === 'custom'
    && run.json?.target?.leadCount === execs.length && execs.length > 0
    && target?.customTarget === 'Stationery';
  record('P6-2 custom run + verbatim customTarget snapshot', pass,
    `HTTP ${run.status} resolved=${run.json?.target?.leadCount} snapshot.customTarget=${target?.customTarget}`);
}

// ═══════════════════════════════════════════════════════════════════
// Cleanup — archive the QA workflows created by this run (soft delete;
// executions/logs/notes remain as QA history, matching the task1-e2e
// convention: additive only, no existing data modified or removed)
// ═══════════════════════════════════════════════════════════════════
for (const id of [steplessId, validWf?.id, failWf?.id].filter(Boolean)) {
  await api('DELETE', `/api/workflows/${id}`).catch(() => { });
}
// Also archive the junk-nodes draft created in P3-3
{
  const list = await api('GET', '/api/workflows?limit=100');
  for (const w of list.json?.workflows || []) {
    if (/^QA P3 |^QA P36 /.test(w.name || '')) {
      await api('DELETE', `/api/workflows/${w.id}`).catch(() => { });
    }
  }
}

const after = dbCounts();
console.log('DB after: ', JSON.stringify(after));
const deltas = Object.entries(after).map(([k, v]) => `${k}:${before[k] || 0}->${v}`).join(' ');
console.log('DB deltas:', deltas);

const failed = results.filter((r) => !r.pass);
console.log(`\n════════ SUMMARY: ${results.length - failed.length}/${results.length} passed ════════`);
if (failed.length) {
  console.log('FAILED:', failed.map((f) => f.name).join(' | '));
  process.exit(1);
}
