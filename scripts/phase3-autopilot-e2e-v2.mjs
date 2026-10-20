// Phase 3 — Autopilot E2E re-verification AFTER the execution fixes.
// New workflow (move_to_stage + add_tag + create_notification) linked to a
// new autopilot (fresh niche) — exercises discovery → poll → ledger →
// workflow executions through BOTH step executors (native + canonical).
import jwt from 'jsonwebtoken';
import { readFileSync } from 'fs';

const BASE = 'http://localhost:3000';
const USER_ID = 'cmtuc4av20000npbje6elo5ic';

const env = readFileSync('/home/z/my-project/.env', 'utf8');
const line = env.split('\n').find((l) => l.startsWith('JWT_SECRET='));
const secret = line.slice('JWT_SECRET='.length).trim().replace(/^["']|["']$/g, '');
const token = jwt.sign(
  { sub: USER_ID, email: 'testfix@test.local', role: 'owner', plan: 'pro', orgId: null, type: 'access' },
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
const log = (label, r) => console.log(`\n=== ${label} → HTTP ${r.status} ===\n` + JSON.stringify(r.json ?? r.text, null, 2).slice(0, 1500));

// 1. Create ACTIVE workflow: native steps + one canonical-delegated step
const create = await api('POST', '/api/workflows', {
  name: 'QA Phase3 Autopilot Workflow v2',
  description: 'Disposable QA workflow — autopilot re-verification post-fix',
  triggerType: 'manual',
  status: 'active',
  nodes: [
    { id: 'trigger', type: 'trigger', title: 'Manual', config: {} },
    { id: 'a1', type: 'action', title: 'Mark contacted', config: { actionType: 'move_to_stage', targetStage: 'contacted' } },
    { id: 'a2', type: 'action', title: 'Tag phase3v2', config: { actionType: 'add_tag', tag: 'phase3-autopilot-v2' } },
    { id: 'a3', type: 'action', title: 'Notify done', config: { actionType: 'create_notification', title: 'Autopilot run', message: 'Processed {{leadId}}' } },
  ],
  edges: [],
});
log('POST /api/workflows (create v2)', create);
const wfId = create.json?.id;
if (!wfId) { console.error('CREATE FAILED'); process.exit(1); }

// 2. Create + activate a NEW autopilot with a fresh niche
const ap = await api('POST', '/api/autopilot', {
  name: 'QA Phase3 Autopilot v2',
  niches: ['stationery shops'],
  geography: { country: 'India', city: 'Pune' },
  workflowId: wfId,
  schedule: 'daily',
  activate: true,
});
log('POST /api/autopilot (activate v2)', ap);
const apId = ap.json?.id;
if (!apId) { console.error('AUTOPILOT CREATE FAILED'); process.exit(1); }

// 3. Manual run — the full real path
console.log('\n--- triggering manual run (may take minutes) ---');
const t0 = Date.now();
const run = await api('POST', `/api/autopilot/${apId}/run`);
log(`POST /api/autopilot/${apId}/run (${Math.round((Date.now() - t0) / 1000)}s)`, run);

// 4. State after run
const apAfter = await api('GET', '/api/autopilot');
const mine = (apAfter.json?.autopilots || []).filter(a => a.id === apId);
console.log('\nAUTOPILOT STATE AFTER RUN:', JSON.stringify(mine, null, 2));

console.log(`\nSUMMARY: workflowId=${wfId} autopilotId=${apId} runId=${run.json?.runId ?? 'NONE'} status=${run.json?.status} execs=${run.json?.executionsCreated}`);
