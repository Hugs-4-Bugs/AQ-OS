// Phase 3 — Workflow execution reproduction via the REAL API path.
// Creates a minimal disposable workflow (manual trigger + one wait_delay step),
// executes it, and polls the execution status. No existing records modified.
import jwt from 'jsonwebtoken';
import { readFileSync } from 'fs';

const BASE = 'http://localhost:3000';
const USER_EMAIL = process.env.QA_EMAIL || 'testfix@test.local';
const USER_ID = process.env.QA_USER_ID || 'cmtuc4av20000npbje6elo5ic';

const env = readFileSync('/home/z/my-project/.env', 'utf8');
const line = env.split('\n').find((l) => l.startsWith('JWT_SECRET='));
if (!line) { console.error('JWT_SECRET not found'); process.exit(1); }
const secret = line.slice('JWT_SECRET='.length).trim().replace(/^["']|["']$/g, '');

const token = jwt.sign(
  { sub: USER_ID, email: USER_EMAIL, role: 'owner', plan: 'pro', orgId: null, type: 'access' },
  secret,
  { expiresIn: '2h', issuer: 'acquisitionos', audience: 'acquisitionos-api' }
);

const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

async function api(method, path, body) {
  const res = await fetch(`${BASE}${path}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* keep text */ }
  return { status: res.status, json, text: json ? undefined : text.slice(0, 400) };
}

const log = (label, r) => console.log(`\n=== ${label} → HTTP ${r.status} ===\n` + JSON.stringify(r.json ?? r.text, null, 2).slice(0, 2500));

// 0. Auth check
const me = await api('GET', '/api/auth/me');
log('AUTH /api/auth/me', me);

// 1. List workflows (verify entitlement works)
const list = await api('GET', '/api/workflows');
log('GET /api/workflows', list);

// 2. Create minimal disposable workflow: manual trigger + 1 wait_delay step
const create = await api('POST', '/api/workflows', {
  name: 'QA Phase3 Repro Workflow',
  description: 'Disposable QA workflow for Phase 3 execution repro',
  triggerType: 'manual',
  steps: [
    { type: 'wait_delay', name: 'Wait 1 Second', config: { duration: 1, unit: 'seconds' }, order: 0 },
    { type: 'create_notification', name: 'Mark Done', config: { title: 'QA Repro', message: 'phase3 workflow executed' }, order: 1 },
  ],
});
log('POST /api/workflows (create)', create);
const wfId = create.json?.id;
if (!wfId) { console.error('\nCREATE FAILED — cannot continue'); process.exit(1); }

// 3. Execute it
const exec = await api('POST', `/api/workflows/${wfId}/execute`, { triggerData: { source: 'qa-phase3-repro' } });
log(`POST /api/workflows/${wfId}/execute`, exec);
const execId = exec.json?.executionId;

// 4. Poll execution status
if (execId) {
  for (let i = 0; i < 10; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const st = await api('GET', `/api/workflows/executions/${execId}`);
    log(`GET /api/workflows/executions/${execId} (poll ${i + 1})`, st);
    if (st.json && ['completed', 'failed', 'cancelled'].includes(st.json?.execution?.status ?? st.json?.status)) break;
  }
} else {
  console.log('\nNO executionId returned — checking executions list');
  const ex = await api('GET', `/api/workflows/executions?workflowId=${wfId}`);
  log('GET /api/workflows/executions', ex);
}

console.log(`\n\nSUMMARY: workflowId=${wfId} executionId=${execId ?? 'NONE'}`);
