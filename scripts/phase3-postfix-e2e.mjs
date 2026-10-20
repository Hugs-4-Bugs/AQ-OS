// Phase 3 — POST-FIX E2E verification via the REAL API route (the same
// route the UI's Run button calls). Repeats the EXACT failing repro:
// workflow "QA Phase3 Autopilot Workflow" (move_to_stage + add_tag)
// against lead "Read and Brew" (already in 'contacted' + already tagged).
// Then Test 2: send_email workflow with NO 'to' (template/AI shape),
// approval-gated so no real email is sent.
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

// ═══ TEST 1: exact UI repro — run move_to_stage + add_tag workflow against
// the SAME lead that previously failed ("Lead is already in this stage").
const LEAD_ID = 'cmvfqcz1l001pm2v3y44wzlqa'; // Read and Brew
const WF1 = 'cmvfqc6o5000nm2v3lrf14g4z';     // QA Phase3 Autopilot Workflow

const t1 = await api('POST', `/api/workflows/${WF1}/execute`, {
  triggerData: { leadId: LEAD_ID, leadName: 'Read and Brew' },
});
log('TEST 1: execute (previously FAILED "Lead is already in this stage")', t1);

if (t1.json?.executionId) {
  await new Promise(r => setTimeout(r, 1500));
  const st = await api('GET', `/api/workflows/executions/${t1.json.executionId}`);
  log('TEST 1: execution status', st);
}

// ═══ TEST 2: send_email workflow with NO 'to' (exactly what templates and
// the AI generator produce), approval-gated → draft instead of real send.
const create2 = await api('POST', '/api/workflows', {
  name: 'QA Phase3 Email Workflow',
  description: 'Disposable QA workflow — send_email step with no explicit recipient (template/AI shape)',
  triggerType: 'manual',
  status: 'active',
  requiresApproval: true,
  nodes: [
    { id: 'trigger', type: 'trigger', title: 'Manual', config: {} },
    { id: 'e1', type: 'action', title: 'Send Welcome Email', config: { actionType: 'send_email', subject: 'Welcome {{leadId}}', body: 'Hi there, we noticed your business and wanted to reach out...' } },
  ],
  edges: [],
});
log('TEST 2: create send_email workflow (no "to")', create2);
const WF2 = create2.json?.id;

if (WF2) {
  const t2 = await api('POST', `/api/workflows/${WF2}/execute`, {
    triggerData: { leadId: LEAD_ID, leadName: 'Read and Brew' },
  });
  log('TEST 2: execute (previously FAILED "Email requires to, subject, and body")', t2);
  if (t2.json?.executionId) {
    await new Promise(r => setTimeout(r, 1500));
    const st = await api('GET', `/api/workflows/executions/${t2.json.executionId}`);
    log('TEST 2: execution status', st);
  }
}

console.log(`\nSUMMARY: t1exec=${t1.json?.executionId ?? 'NONE'} t1status=${t1.json?.status} wf2=${WF2 ?? 'NONE'}`);
