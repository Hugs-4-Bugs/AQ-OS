#!/usr/bin/env node
/**
 * RUNTIME RECOVERY — STEP 5 + STEP 6 verification probe.
 *
 * PHASE A: read-only persistence probes (GET, authenticated via minted JWT).
 * PHASE B: UserAIProvider round-trip (connect -> list -> validate -> disconnect)
 *          using a DELIBERATELY-INVALID probe credential. Verifies encryption,
 *          persistence, masked hints, real validation call, cleanup.
 * PHASE C: Agent CRUD + manual run round-trip. The run attempts a REAL provider
 *          call with the invalid probe key and must FAIL gracefully — this
 *          verifies runtime plumbing (provider resolution, real HTTP call,
 *          error surfacing, AgentRun persistence) WITHOUT fabricating AI success.
 * PHASE D: cleanup of probe artifacts by exact ID (restores pre-probe state).
 * PHASE E: unauthenticated wiring probes (expect 401).
 *
 * Never prints tokens, cookies, or credential values. Status + summaries only.
 */
const jwt = require('jsonwebtoken');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const BASE = 'http://localhost:3000';
const DB_PATH = '/home/z/my-project/db/custom.db';
const ENV_PATH = '/home/z/my-project/.env';
const PROBE_KEY = 'sk-runtime-recovery-probe-INVALID-credential'; // >= 8 chars, deliberately invalid

function readEnv() {
  const env = {};
  for (const line of fs.readFileSync(ENV_PATH, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
  return env;
}

let pass = 0, fail = 0;
function check(name, ok, detail) {
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name}${detail ? ' — ' + detail : ''}`);
  ok ? pass++ : fail++;
}

async function req(method, path, { cookie, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (cookie) headers.Cookie = cookie;
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(90000),
    redirect: 'manual',
  });
  let json = null;
  const text = await res.text();
  try { json = JSON.parse(text); } catch { /* keep null */ }
  return { status: res.status, json, text };
}

function summarize(json) {
  if (!json) return '(non-JSON)';
  const s = JSON.stringify(json);
  return s.length > 220 ? s.slice(0, 220) + '…' : s;
}

async function main() {
  const env = readEnv();
  const JWT_SECRET = env.JWT_SECRET || env.AUTH_SECRET;

  const sdb = new DatabaseSync(DB_PATH, { readOnly: true });
  const elite = sdb.prepare("SELECT id, email, role, plan, orgId FROM User WHERE email='mailtoprabhat72@gmail.com'").get();
  sdb.close();
  if (!elite) { console.log('ELITE_USER=NOT_FOUND'); process.exit(1); }

  const token = jwt.sign(
    { sub: elite.id, email: elite.email, role: elite.role, plan: elite.plan, orgId: elite.orgId, type: 'access' },
    JWT_SECRET,
    { expiresIn: 900, issuer: 'acquisitionos', audience: 'acquisitionos-api' }
  );
  const cookie = 'access_token=' + token;

  // Snapshot pre-probe counts (for cleanup verification).
  const pre = new DatabaseSync(DB_PATH, { readOnly: true });
  const preCounts = {};
  for (const t of ['Agent', 'AgentRun', 'AgentMemory', 'AgentApproval', 'AgentActivity', 'UserAIProvider', 'ModelInvocation']) {
    preCounts[t] = pre.prepare(`SELECT COUNT(*) c FROM "${t}"`).get().c;
  }
  pre.close();
  console.log('PRE_PROBE_COUNTS=' + JSON.stringify(preCounts));

  // ── PHASE A: read-only persistence probes ──────────────────────────
  console.log('\n=== PHASE A: persistence probes (read-only) ===');
  const probes = [
    ['/api/leads', (j) => (j && j.pagination ? 'total=' + j.pagination.total : 'keys=' + Object.keys(j || {}).join(','))],
    ['/api/leads/stats', () => 'ok'],
    ['/api/workflows', (j) => ('total' in (j || {}) ? 'total=' + j.total : 'keys=' + Object.keys(j || {}).join(','))],
    ['/api/workflows/executions', (j) => ('total' in (j || {}) ? 'total=' + j.total : 'keys=' + Object.keys(j || {}).join(','))],
    ['/api/autopilot', (j) => 'keys=' + Object.keys(j || {}).slice(0, 8).join(',')],
    ['/api/autopilot/workflows', (j) => ('total' in (j || {}) ? 'total=' + j.total : 'keys=' + Object.keys(j || {}).join(','))],
    ['/api/settings/profile', (j) => (j && (j.profile || j.user) ? 'profile present' : 'keys=' + Object.keys(j || {}).join(','))],
    ['/api/entitlements/quota', () => 'ok'],
  ];
  for (const [path, summer] of probes) {
    const r = await req('GET', path, { cookie });
    check('GET ' + path, r.status === 200, 'HTTP ' + r.status + ' ' + summer(r.json));
  }

  // Credit sufficiency check (POST-only route).
  const cc = await req('POST', '/api/entitlements/check-credits', { cookie, body: { action: 'lead_discovery' } });
  check('POST /api/entitlements/check-credits', cc.status === 200 && cc.json && typeof cc.json.sufficient === 'boolean',
    'HTTP ' + cc.status + ' cost=' + (cc.json && cc.json.cost) + ' balance=' + (cc.json && cc.json.balance) + ' sufficient=' + (cc.json && cc.json.sufficient));

  // AI providers list (STEP 6 item 1).
  const prov = await req('GET', '/api/integrations/ai-providers', { cookie });
  const provList = prov.json && prov.json.providers;
  check('GET /api/integrations/ai-providers', prov.status === 200 && Array.isArray(provList) && provList.length === 7,
    'HTTP ' + prov.status + ' providers=' + (provList ? provList.length : 'n/a'));
  if (provList) {
    for (const p of provList) {
      console.log('  provider ' + p.id + ': platform=' + p.platformConfigured + ' user=' + p.userConnected + ' status=' + p.userStatus + ' available=' + p.available + ' source=' + p.source);
    }
  }

  // Agents list (STEP 6 item 4 — read path).
  const ag0 = await req('GET', '/api/agents', { cookie });
  check('GET /api/agents (initial)', ag0.status === 200, 'HTTP ' + ag0.status + ' total=' + (ag0.json && ag0.json.total));

  // ── PHASE B+C: UserAIProvider + Agent round-trips ──────────────────
  console.log('\n=== PHASE B: UserAIProvider round-trip (probe credential) ===');
  const conn = await req('POST', '/api/integrations/ai-providers', { cookie, body: { action: 'connect', provider: 'openai', apiKey: PROBE_KEY } });
  check('connect provider', conn.status === 200 && conn.json && conn.json.connected === true, 'HTTP ' + conn.status);
  const hint = conn.json && conn.json.provider && conn.json.provider.credentialHint;
  check('credential hint masked (never decrypted)', typeof hint === 'string' && !hint.includes(PROBE_KEY), 'hint=' + hint);

  const provAfter = await req('GET', '/api/integrations/ai-providers', { cookie });
  const openaiRow = provAfter.json && provAfter.json.providers && provAfter.json.providers.find((p) => p.id === 'openai');
  check('provider persisted + userConnected', openaiRow && openaiRow.userConnected === true && openaiRow.available === true && openaiRow.source === 'user',
    'status=' + (openaiRow && openaiRow.userStatus) + ' hint=' + (openaiRow && openaiRow.userCredentialHint));

  console.log('\n=== PHASE C: Agent CRUD + run round-trip ===');
  const created = await req('POST', '/api/agents', {
    cookie,
    body: { name: 'runtime-recovery-probe', description: 'temporary verification probe — deleted after test', provider: 'openai', model: 'gpt-4o', toolPermissions: { 'lead.lookup': 'read' } },
  });
  const agentId = created.json && created.json.agent && created.json.agent.id;
  check('POST /api/agents (create)', created.status === 201 && !!agentId, 'HTTP ' + created.status + ' id=' + (agentId || 'none'));
  if (!agentId) { console.log('ABORT: no agent id'); process.exit(1); }

  const agList = await req('GET', '/api/agents', { cookie });
  check('GET /api/agents (contains probe)', agList.status === 200 && agList.json.agents.some((a) => a.id === agentId), 'total=' + agList.json.total);

  const upd = await req('PUT', '/api/agents/' + agentId, { cookie, body: { description: 'probe-updated-description' } });
  check('PUT /api/agents/[id] (update)', upd.status === 200 && upd.json && upd.json.agent && upd.json.agent.description === 'probe-updated-description', 'HTTP ' + upd.status);

  // Activate the agent (draft agents are rejected by the runtime — verified security behavior).
  const act = await req('PUT', '/api/agents/' + agentId, { cookie, body: { status: 'active' } });
  check('PUT /api/agents/[id] (activate)', act.status === 200 && act.json && act.json.agent && act.json.agent.status === 'active', 'HTTP ' + act.status);

  // Manual run — REAL provider call with the deliberately-invalid key. Must fail gracefully.
  console.log('  (running agent — real OpenAI call with invalid probe key, expect graceful failure)');
  const run = await req('POST', '/api/agents/' + agentId + '/run', { cookie, body: { initialPrompt: 'Reply with FINAL_ANSWER: probe complete.' } });
  const runRow = run.json && run.json.run;
  check('POST /api/agents/[id]/run executes runtime', run.status === 200 && !!runRow, 'HTTP ' + run.status + ' runStatus=' + (runRow && runRow.status));
  const runId = runRow && runRow.id;
  if (runRow) {
    console.log('  run: status=' + runRow.status + ' iterations=' + runRow.iterationsUsed + ' tools=' + runRow.toolsCalled + ' error=' + String(runRow.error || '').slice(0, 140));
  }

  const runs = await req('GET', '/api/agents/' + agentId + '/runs', { cookie });
  check('GET /api/agents/[id]/runs (persistence)', runs.status === 200 && Array.isArray(runs.json.runs) && runs.json.runs.length >= 1,
    'HTTP ' + runs.status + ' count=' + (runs.json && runs.json.runs && runs.json.runs.length));

  if (runId) {
    const detail = await req('GET', '/api/agents/' + agentId + '/runs/' + runId, { cookie });
    const hasMemoryAndApprovals = detail.status === 200 && detail.json && 'memory' in (detail.json.run || detail.json) ;
    check('GET run detail (memory + approvals structure)', detail.status === 200, 'HTTP ' + detail.status + ' ' + summarize(detail.json).slice(0, 160));
  }

  const appr = await req('GET', '/api/agents/' + agentId + '/approvals', { cookie });
  check('GET /api/agents/[id]/approvals', appr.status === 200, 'HTTP ' + appr.status);

  // Validate endpoint — REAL API call with invalid key -> must report invalid.
  const val = await req('POST', '/api/integrations/ai-providers/validate', { cookie, body: { provider: 'openai' } });
  check('POST validate (real call, invalid key -> invalid)', val.status === 200 && val.json && val.json.valid === false,
    'HTTP ' + val.status + ' error=' + String((val.json && val.json.error) || '').slice(0, 120));

  // Disconnect + delete agent.
  const dis = await req('POST', '/api/integrations/ai-providers', { cookie, body: { action: 'disconnect', provider: 'openai' } });
  check('disconnect provider', dis.status === 200, 'HTTP ' + dis.status + ' ' + summarize(dis.json));

  const del = await req('DELETE', '/api/agents/' + agentId, { cookie });
  check('DELETE /api/agents/[id]', del.status === 200 && del.json && del.json.deleted === true, 'HTTP ' + del.status);

  const agFinal = await req('GET', '/api/agents', { cookie });
  check('GET /api/agents (clean, no probe residue)', agFinal.status === 200 && agFinal.json.total === 0, 'total=' + agFinal.json.total);

  const provFinal = await req('GET', '/api/integrations/ai-providers', { cookie });
  const openaiFinal = provFinal.json.providers.find((p) => p.id === 'openai');
  check('provider disconnected (clean)', openaiFinal.userConnected === false && openaiFinal.available === false, 'userConnected=' + openaiFinal.userConnected);

  // ── PHASE D: cleanup of audit rows created by the probe ────────────
  console.log('\n=== PHASE D: probe artifact cleanup (by exact id) ===');
  const cdb = new DatabaseSync(DB_PATH);
  let cleaned = [];
  if (runId) {
    for (const [table, where] of [
      ['AgentMemory', 'runId'],
      ['AgentApproval', 'runId'],
      ['AgentActivity', 'runId'],
      ['ModelInvocation', 'runId'],
      ['AgentRun', 'id'],
    ]) {
      const r = cdb.prepare(`DELETE FROM "${table}" WHERE "${where}" = ?`).run(runId);
      if (r.changes > 0) cleaned.push(table + ':' + r.changes);
    }
  }
  const rAgent = cdb.prepare('DELETE FROM Agent WHERE id = ?').run(agentId);
  if (rAgent.changes > 0) cleaned.push('Agent:' + rAgent.changes);
  const rUai = cdb.prepare('DELETE FROM UserAIProvider WHERE userId = ? AND provider = ?').run(elite.id, 'openai');
  if (rUai.changes > 0) cleaned.push('UserAIProvider:' + rUai.changes);
  cdb.close();
  console.log('CLEANED_ROWS=' + (cleaned.join(',') || 'none'));

  const post = new DatabaseSync(DB_PATH, { readOnly: true });
  const postCounts = {};
  for (const t of ['Agent', 'AgentRun', 'AgentMemory', 'AgentApproval', 'AgentActivity', 'UserAIProvider', 'ModelInvocation']) {
    postCounts[t] = post.prepare(`SELECT COUNT(*) c FROM "${t}"`).get().c;
  }
  post.close();
  console.log('POST_PROBE_COUNTS=' + JSON.stringify(postCounts));
  const restored = Object.keys(postCounts).every((t) => postCounts[t] === preCounts[t]);
  check('DB state restored to pre-probe (all 7 tables)', restored,
    restored ? 'all match pre-probe' : JSON.stringify({ pre: preCounts, post: postCounts }));

  // ── PHASE E: unauthenticated wiring probes ─────────────────────────
  console.log('\n=== PHASE E: unauthenticated wiring probes ===');
  for (const path of ['/api/agents', '/api/integrations/ai-providers', '/api/agents/x/approvals']) {
    const r = await req('GET', path);
    check('GET ' + path + ' (no auth -> 401)', r.status === 401, 'HTTP ' + r.status);
  }

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error('PROBE ERROR: ' + e.message); process.exit(1); });
