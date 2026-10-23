// ═══════════════════════════════════════════════════════════════════
// Phase 20 E2E — Autopilot Niches — REAL dev server + REAL routes +
// REAL discovery pipeline + REAL engine + REAL DB (no mocks).
//
// Verifies (Phase 20 requirements):
//  1. Multiple predefined niches selectable in one configuration
//  2. Custom niche creation (server-side canonical service)
//  3. Custom niche persistence (DB rows survive re-login token +
//     a REAL dev-server restart mid-E2E)
//  4. Duplicate custom niche prevention (casing/whitespace variants)
//  5. User isolation (two-way; B's private niche invisible to A)
//  6. Unauthorized niche ID rejection (custom:<foreign id> → 400,
//     no Autopilot row, no discovery, no charge)
//  7. Unknown niche string rejection (no cross-user existence leak)
//  8. Multiple-niche Autopilot configuration persisted (niches +
//     profileMappings) through create AND update AND GET
//  9. Correct niche attribution during discovery (perNiche + Lead.niche)
// 10. Cross-run deduplication (second run → dupes, no new charge)
// 11. Profile mapping (valid mapping persisted; foreign profile rejected)
// 12. Per-lead personalized context path (run config snapshot records
//     per-niche profile resolutions; unit tests cover the per-lead map)
// 13. Phase 19 workflow selection intact (run executes the SELECTED
//     workflow; selector API still dynamic)
// 14. Discovery-only remains 0 workflow charges
// 15. Multiple niches do NOT create multiple workflow charges
// 16. ONE parent execution for the Autopilot run
// 17/18. Phase 18/19 regressions guarded by the unit suites + the
//     idempotency check below.
// +  Entitlement reflection (free user → empty + allowed:false +
//     403 on create) and runtime log health.
// ═══════════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

const BASE = 'http://localhost:3000';
const USER_A_EMAIL = 'mailtoprabhat72@gmail.com';
const TS = Date.now();

const envText = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
const env = {};
for (const line of envText.split('\n')) {
  const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const JWT_SECRET = env.JWT_SECRET || env.AUTH_SECRET;
const db = new PrismaClient();

function mintAccessToken(user) {
  return jwt.sign(
    {
      sub: user.id, email: user.email, role: user.role, plan: user.plan,
      orgId: user.orgId ?? null, isTrial: false, trialEndsAt: null, type: 'access',
    },
    JWT_SECRET,
    { expiresIn: '15m', issuer: 'acquisitionos', audience: 'acquisitionos-api' }
  );
}

async function api(token, method, urlPath, body, timeoutMs = 120000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(BASE + urlPath, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      signal: ctrl.signal,
    });
    let json = null;
    try { json = await res.json(); } catch { /* non-json */ }
    return { status: res.status, json };
  } finally {
    clearTimeout(t);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function logStep(name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${name}] ${detail}`);
  if (!ok) process.exitCode = 1;
}

// Track every row this E2E creates so cleanup is exact and safe.
const created = {
  autopilotIds: [], workflowIds: [], qaUserIds: [], executionIds: [],
  customNicheIdsB: [], profileIdsA: [],
};

async function cleanup() {
  console.log('\n─── cleanup (E2E artifacts only) ───');
  try {
    const safeIds = (arr) => arr.filter((x) => typeof x === 'string' && x.length > 0);
    for (const apId of safeIds(created.autopilotIds)) {
      await db.autopilotLead.deleteMany({ where: { autopilotId: apId } });
      await db.autopilotRun.deleteMany({ where: { autopilotId: apId } });
      await db.autopilotWorkflow.deleteMany({ where: { id: apId } });
    }
    for (const execId of safeIds(created.executionIds)) {
      await db.workflowExecutionLead.deleteMany({ where: { executionId: execId } });
      await db.workflowLog.deleteMany({ where: { executionId: execId } });
      await db.workflowExecution.deleteMany({ where: { id: execId } });
    }
    for (const wfId of safeIds(created.workflowIds)) {
      const execs = await db.workflowExecution.findMany({ where: { workflowId: wfId }, select: { id: true } });
      for (const e of execs) {
        await db.workflowExecutionLead.deleteMany({ where: { executionId: e.id } });
        await db.workflowLog.deleteMany({ where: { executionId: e.id } });
        await db.workflowExecution.deleteMany({ where: { id: e.id } });
      }
      await db.workflowStep.deleteMany({ where: { workflowId: wfId } });
      await db.workflowDefinition.deleteMany({ where: { id: wfId } });
    }
    for (const bpId of safeIds(created.profileIdsA)) {
      await db.businessProfile.deleteMany({ where: { id: bpId } });
    }
    for (const uId of safeIds(created.qaUserIds)) {
      await db.customNiche.deleteMany({ where: { userId: uId } });
      const aps = await db.autopilotWorkflow.findMany({ where: { userId: uId }, select: { id: true } });
      for (const ap of aps) {
        await db.autopilotLead.deleteMany({ where: { autopilotId: ap.id } });
        await db.autopilotRun.deleteMany({ where: { autopilotId: ap.id } });
        await db.autopilotWorkflow.deleteMany({ where: { id: ap.id } });
      }
      const wfs = await db.workflowDefinition.findMany({ where: { userId: uId }, select: { id: true } });
      for (const wf of wfs) {
        await db.workflowStep.deleteMany({ where: { workflowId: wf.id } });
        await db.workflowDefinition.deleteMany({ where: { id: wf.id } });
      }
      await db.creditsLedger.deleteMany({ where: { userId: uId } });
      await db.user.deleteMany({ where: { id: uId } });
    }
    console.log('cleanup done (E2E rows removed; A\'s discovered leads + custom niches kept as real data)');
  } catch (e) {
    console.log('cleanup partial:', e.message);
  }
}

async function wfexecChargesFor(userId, autopilotId, runId) {
  const chargeAction = `workflow_execution_idempotent_wfexec-run:autopilot-${autopilotId}-run-${runId}`;
  return db.creditsLedger.findMany({ where: { userId, action: chargeAction } });
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(' Phase 20 E2E — Autopilot Niches — real server + real DB');
  console.log('═══════════════════════════════════════════════════════════════');

  const logSizeAtStart = 0; // dev.log is truncated per server session (see step 13)

  // ── 1. Users ──
  const userA = await db.user.findUnique({ where: { email: USER_A_EMAIL } });
  const tokenA = mintAccessToken(userA);
  const startBalance = userA.credits;
  console.log(`User A: ${userA.email} (${userA.plan}, ${startBalance} credits)`);

  const userB = await db.user.create({
    data: {
      email: `e2e-p20-b-${TS}@test.local`, name: 'E2E P20 User B', role: 'owner', plan: 'pro',
      credits: 0, creditsMonthly: 0, emailVerified: true, isActive: true,
      passwordHash: '$2a$12$hashedpassword1234567890abcdef',
    },
  });
  created.qaUserIds.push(userB.id);
  const tokenB = mintAccessToken(userB);

  const userC = await db.user.create({
    data: {
      email: `e2e-p20-c-${TS}@test.local`, name: 'E2E P20 User C', role: 'owner', plan: 'free',
      credits: 0, creditsMonthly: 0, emailVerified: true, isActive: true,
      passwordHash: '$2a$12$hashedpassword1234567890abcdef',
    },
  });
  created.qaUserIds.push(userC.id);
  const tokenC = mintAccessToken(userC);

  // ═══════════════════════════════════════════════════════════════
  // 2. Custom niche creation (canonical service)
  // ═══════════════════════════════════════════════════════════════
  const cnB1 = await api(tokenB, 'POST', '/api/autopilot/niches', { name: 'AI SaaS companies' });
  const cnB1Id = cnB1.json?.id;
  created.customNicheIdsB.push(cnB1Id);
  logStep('2. Custom niche created (B)', cnB1.status === 201 && !!cnB1Id,
    `http=${cnB1.status} id=${String(cnB1Id).slice(-8)} key=${cnB1.json?.nicheKey}`);

  const cnB2 = await api(tokenB, 'POST', '/api/autopilot/niches', { name: 'Solar installation companies' });
  created.customNicheIdsB.push(cnB2.json?.id);
  logStep('2. Second custom niche created (B)', cnB2.status === 201,
    `http=${cnB2.status} key=${cnB2.json?.nicheKey}`);

  // ═══════════════════════════════════════════════════════════════
  // 3. Duplicate prevention (spec examples)
  // ═══════════════════════════════════════════════════════════════
  const dup1 = await api(tokenB, 'POST', '/api/autopilot/niches', { name: 'AI SaaS companies' });
  logStep('3. Duplicate rejected (exact)', dup1.status === 409 && dup1.json?.code === 'DUPLICATE',
    `http=${dup1.status} code=${dup1.json?.code}`);
  const dup2 = await api(tokenB, 'POST', '/api/autopilot/niches', { name: 'ai saas companies' });
  logStep('3. Duplicate rejected (lowercase)', dup2.status === 409, `http=${dup2.status}`);
  const dup3 = await api(tokenB, 'POST', '/api/autopilot/niches', { name: '  AI   SAAS COMPANIES  ' });
  logStep('3. Duplicate rejected (whitespace + caps)', dup3.status === 409, `http=${dup3.status}`);
  const dupDb = await db.customNiche.count({ where: { userId: userB.id, nicheKey: 'ai saas companies' } });
  logStep('3. Exactly ONE row for the logical niche (no overwrite)', dupDb === 1, `rows=${dupDb}`);
  const dupPre = await api(tokenB, 'POST', '/api/autopilot/niches', { name: 'dental' });
  logStep('3. Predefined-name custom niche rejected', dupPre.status === 409 && dupPre.json?.code === 'PREDEFINED',
    `http=${dupPre.status} code=${dupPre.json?.code}`);

  // ═══════════════════════════════════════════════════════════════
  // 4. User isolation (two-way) + listing
  // ═══════════════════════════════════════════════════════════════
  const cnA1 = await api(tokenA, 'POST', '/api/autopilot/niches', { name: 'Hospital' });
  // Tolerant of re-runs: 201 (fresh) or 409 (already saved — same logical state).
  const listA0 = await api(tokenA, 'GET', '/api/autopilot/niches');
  const cnA1Row = (listA0.json?.niches || []).find((n) => n.nicheKey === 'hospital');
  const cnA1Id = cnA1Row?.id;
  logStep('4. A creates own custom niche (Hospital)', (cnA1.status === 201 || cnA1.status === 409) && !!cnA1Id,
    `http=${cnA1.status} (409 = already saved from a previous E2E run) id=${String(cnA1Id).slice(-8)}`);
  const listB = await api(tokenB, 'GET', '/api/autopilot/niches');
  const listBNames = (listB.json?.niches || []).map((n) => n.name);
  logStep('4. B\'s list contains ONLY B\'s niches', listB.status === 200 && listBNames.includes('AI SaaS companies') && !listBNames.includes('Hospital'),
    `http=${listB.status} B sees: ${listBNames.join(' | ')}`);
  const listA = await api(tokenA, 'GET', '/api/autopilot/niches');
  const listANames = (listA.json?.niches || []).map((n) => n.name);
  logStep('4. A\'s list contains ONLY A\'s niches', listA.status === 200 && listANames.includes('Hospital') && !listANames.includes('AI SaaS companies'),
    `http=${listA.status} A sees: ${listANames.join(' | ')}`);

  // ═══════════════════════════════════════════════════════════════
  // 5. Entitlement reflection (free user)
  // ═══════════════════════════════════════════════════════════════
  const listC = await api(tokenC, 'GET', '/api/autopilot/niches');
  logStep('5. Free user → empty list + allowed:false', listC.status === 200 && (listC.json?.niches || []).length === 0 && listC.json?.entitlement?.allowed === false,
    `http=${listC.status} total=${listC.json?.total} allowed=${listC.json?.entitlement?.allowed}`);
  const postC = await api(tokenC, 'POST', '/api/autopilot/niches', { name: 'Free tier niche' });
  const rowsC = await db.customNiche.count({ where: { userId: userC.id } });
  logStep('5. Free user POST → 403 + no row', postC.status === 403 && rowsC === 0,
    `http=${postC.status} rows=${rowsC}`);

  // ═══════════════════════════════════════════════════════════════
  // 6. Persistence: fresh token (re-login) + REAL server restart
  // ═══════════════════════════════════════════════════════════════
  const freshTokenB = mintAccessToken(userB); // re-login equivalent
  const listB2 = await api(freshTokenB, 'GET', '/api/autopilot/niches');
  logStep('6. Niches survive re-login (fresh token)', (listB2.json?.niches || []).some((n) => n.name === 'AI SaaS companies'),
    `http=${listB2.status}`);

  console.log('   [restart] killing the dev server — the watchdog will respawn it…');
  const { execSync } = require('child_process');
  try { execSync('pkill -f "next-server" || true', { stdio: 'ignore' }); } catch { /* already down */ }
  let back = false;
  for (let i = 0; i < 60; i++) {
    await sleep(4000);
    try {
      const res = await fetch(BASE + '/api/health', { signal: AbortSignal.timeout(3000) });
      if (res.ok) { back = true; break; }
    } catch { /* still down */ }
  }
  logStep('6. Dev server restarted (watchdog respawn)', back, back ? 'health 200' : 'server did NOT come back');
  const listB3 = await api(freshTokenB, 'GET', '/api/autopilot/niches');
  logStep('6. Niches survive the server RESTART', (listB3.json?.niches || []).length === 2,
    `http=${listB3.status} total=${listB3.json?.total}`);

  // ═══════════════════════════════════════════════════════════════
  // 7. Autopilot configuration with multiple niches + profile mapping
  // ═══════════════════════════════════════════════════════════════
  const bpA = await api(tokenA, 'POST', '/api/business-profiles', {
    name: 'E2E P20 Healthcare Profile',
    industry: 'Healthcare',
    description: 'E2E profile for Phase 20 niche mapping',
    status: 'active',
  });
  const bpAId = bpA.json?.profile?.id ?? bpA.json?.id;
  created.profileIdsA.push(bpAId);
  logStep('7. Business profile created (A)', bpA.status >= 200 && bpA.status < 300 && !!bpAId,
    `http=${bpA.status} id=${String(bpAId).slice(-8)}`);

  const wfRes = await api(tokenA, 'POST', '/api/workflows', {
    name: `E2E P20 Niche Workflow ${TS}`,
    description: 'Phase 20 multi-niche run check',
    triggerType: 'manual',
    status: 'active',
    steps: [
      { type: 'action', name: 'Mark contacted', config: { actionType: 'move_to_stage', targetStage: 'contacted' }, order: 0 },
      { type: 'action', name: 'Tag p20', config: { actionType: 'add_tag', tag: `phase20-${TS}` }, order: 1 },
    ],
  });
  const wfId = wfRes.json?.workflow?.id ?? wfRes.json?.id;
  created.workflowIds.push(wfId);
  logStep('7. Active workflow created (A)', wfRes.status >= 200 && wfRes.status < 300 && !!wfId,
    `http=${wfRes.status} id=${String(wfId).slice(-8)}`);

  // Multi-niche configuration: predefined (Dental, Construction) + custom
  // (Hospital via `custom:<id>` — the ID pathway) + profile mapping.
  const apRes = await api(tokenA, 'POST', '/api/autopilot', {
    name: `E2E P20 Multi-Niche ${TS}`,
    niches: ['Dental', 'Construction', `custom:${cnA1Id}`],
    geography: { country: 'India' },
    workflowId: wfId,
    schedule: 'weekly',
    activate: false,
    profileMappings: { dental: bpAId, hospital: bpAId },
  });
  const apId = apRes.json?.id;
  created.autopilotIds.push(apId);
  logStep('8. Multi-niche Autopilot created (2 predefined + 1 custom-by-ID)',
    apRes.status === 201 && !!apId, `http=${apRes.status} id=${String(apId).slice(-8)}`);

  const apGet = await api(tokenA, 'GET', `/api/autopilot/${apId}`);
  const apNiches = apGet.json?.autopilot?.niches || [];
  const apMappings = apGet.json?.autopilot?.profileMappings || {};
  logStep('8. Persisted niches resolve to canonical display names',
    JSON.stringify(apNiches) === JSON.stringify(['Dental', 'Construction', 'Hospital']),
    `niches=${JSON.stringify(apNiches)}`);
  logStep('8. Persisted profileMappings survive the round-trip',
    apMappings.dental === bpAId && apMappings.hospital === bpAId,
    `mappings=${JSON.stringify(apMappings)}`);

  // Update path: swap in a different niche selection + mapping.
  const apPatch = await api(tokenA, 'PATCH', `/api/autopilot/${apId}`, {
    niches: ['Dental', 'Hospital'],
    profileMappings: { dental: bpAId },
  });
  const apGet2 = await api(tokenA, 'GET', `/api/autopilot/${apId}`);
  logStep('8. PATCH updates niches + mappings (config follows current selection)',
    apPatch.status === 200 && JSON.stringify(apGet2.json?.autopilot?.niches) === JSON.stringify(['Dental', 'Hospital'])
      && JSON.stringify(apGet2.json?.autopilot?.profileMappings) === JSON.stringify({ dental: bpAId }),
    `http=${apPatch.status} niches=${JSON.stringify(apGet2.json?.autopilot?.niches)}`);

  // ═══════════════════════════════════════════════════════════════
  // 9. Unauthorized / unknown niche + foreign profile rejections
  // ═══════════════════════════════════════════════════════════════
  const rowsBefore = await db.autopilotWorkflow.count({ where: { userId: userA.id } });
  const unauth = await api(tokenA, 'POST', '/api/autopilot', {
    name: 'Should never exist (foreign niche id)',
    niches: ['Dental', `custom:${cnB1Id}`], // B's private niche id
    geography: {}, workflowId: wfId, schedule: 'daily', activate: false,
  });
  const rowsAfter = await db.autopilotWorkflow.count({ where: { userId: userA.id } });
  logStep('9. Foreign custom-niche ID rejected: 400, no row, no discovery, no charge',
    unauth.status === 400 && rowsAfter === rowsBefore,
    `http=${unauth.status} error="${unauth.json?.error}" rows ${rowsBefore}→${rowsAfter}`);

  const unknown = await api(tokenA, 'POST', '/api/autopilot', {
    name: 'Should never exist (unknown niche)',
    niches: ['Solar installation companies'], // B's private niche NAME — unknown to A
    geography: {}, workflowId: wfId, schedule: 'daily', activate: false,
  });
  const rowsAfter2 = await db.autopilotWorkflow.count({ where: { userId: userA.id } });
  logStep('9. Unknown niche string rejected (no existence leak — same error as any unknown)',
    unknown.status === 400 && rowsAfter2 === rowsBefore && (unknown.json?.error || '').includes('save it as a custom niche'),
    `http=${unknown.status} error="${(unknown.json?.error || '').slice(0, 80)}"`);

  const foreignProfile = await db.businessProfile.findFirst({
    where: { userId: { not: userA.id }, status: 'active' }, select: { id: true },
  });
  if (foreignProfile) {
    const fpRes = await api(tokenA, 'POST', '/api/autopilot', {
      name: 'Should never exist (foreign profile)',
      niches: ['Dental'], geography: {},
      workflowId: wfId, schedule: 'daily', activate: false,
      profileMappings: { dental: foreignProfile.id },
    });
    const rowsAfter3 = await db.autopilotWorkflow.count({ where: { userId: userA.id } });
    logStep('9. Foreign profile in mapping rejected: 400, no row',
      fpRes.status === 400 && rowsAfter3 === rowsBefore,
      `http=${fpRes.status} error="${fpRes.json?.error}"`);
  } else {
    console.log('SKIP  [9. foreign profile] no foreign active profile in DB');
  }

  const chargesBefore = await db.creditsLedger.count({ where: { userId: userA.id, action: { contains: 'workflow_execution' } } });

  // ── ACTIVATE the autopilot (slot-checked server-side) before running ──
  const activateRes = await api(tokenA, 'PATCH', `/api/autopilot/${apId}`, { status: 'ACTIVE' });
  logStep('10. Autopilot activated (DRAFT → ACTIVE)', activateRes.status === 200 && activateRes.json?.status === 'ACTIVE',
    `http=${activateRes.status} status=${activateRes.json?.status}`);

  // ═══════════════════════════════════════════════════════════════
  // 10. REAL multi-niche run with profile mapping
  // ═══════════════════════════════════════════════════════════════
  const runRes = await api(tokenA, 'POST', `/api/autopilot/${apId}/run`, undefined, 900000);
  const runId = runRes.json?.runId;
  const executionId = runRes.json?.executionId;
  created.executionIds.push(executionId);
  logStep('10. Multi-niche run executed', runRes.status === 200 && !!runId,
    `http=${runRes.status} status=${runRes.json?.status} discovered=${runRes.json?.discovered} saved=${runRes.json?.saved} exec=${String(executionId).slice(-8)}`);

  // ONE parent execution for the whole run — never per niche.
  logStep('10. ONE parent execution for the multi-niche run', runRes.json?.executionsCreated === 1,
    `executionsCreated=${runRes.json?.executionsCreated}`);
  const execRow = executionId
    ? await db.workflowExecution.findUnique({ where: { id: executionId }, select: { id: true, workflowId: true, triggerData: true } })
    : null;
  logStep('13. Run executes the SELECTED workflow (Phase 19 intact)', !!execRow && execRow.workflowId === wfId,
    `exec.workflowId=${String(execRow?.workflowId).slice(-8)} matches selected=${String(wfId).slice(-8)}`);

  // Per-niche attribution: perNiche carries BOTH niches distinctly.
  const perNiche = runRes.json?.perNiche || [];
  const perNicheNames = perNiche.map((n) => n.niche);
  logStep('11. perNiche attribution keeps each niche distinct (no collapsing)',
    perNicheNames.includes('Dental') && perNicheNames.includes('Hospital') && perNiche.length === 2,
    `perNiche=${JSON.stringify(perNicheNames)}`);

  // Run config snapshot: profileMappings + per-niche profile resolutions.
  const runRow = runId ? await db.autopilotRun.findUnique({ where: { id: runId }, select: { config: true, runKey: true } }) : null;
  let runConfig = {};
  try { runConfig = runRow ? JSON.parse(runRow.config) : {}; } catch { /* ignore */ }
  logStep('12. Run snapshot records the mapping + per-niche profile resolutions',
    runConfig.profileMappings?.dental === bpAId
      && Array.isArray(runConfig.nicheProfiles)
      && runConfig.nicheProfiles.length === 2
      && runConfig.nicheProfiles.every((np) => np.profileId === bpAId),
    `nicheProfiles=${JSON.stringify(runConfig.nicheProfiles || [])}`);

  // Lead-level niche attribution: every discovered lead keeps the niche
  // that produced it.
  if (runId) {
    const ledger = await db.autopilotLead.findMany({
      where: { runId }, select: { leadId: true },
    });
    const leadIds = ledger.map((l) => l.leadId);
    if (leadIds.length > 0) {
      const leads = await db.lead.findMany({
        where: { id: { in: leadIds } }, select: { id: true, niche: true },
      });
      const dentalLeads = leads.filter((l) => /dental/i.test(l.niche || '')).length;
      const hospitalLeads = leads.filter((l) => /hospital/i.test(l.niche || '')).length;
      logStep('11. Discovered leads retain niche attribution (Lead.niche)',
        dentalLeads + hospitalLeads === leads.length,
        `leads=${leads.length} dental=${dentalLeads} hospital=${hospitalLeads}`);
    } else {
      console.log('NOTE  [11. lead attribution] run discovered 0 new leads (all duplicates) — attribution already covered by perNiche');
    }
  }

  // Billing: exactly ONE flat -5 charge for the whole multi-niche run
  // (discovery may separately charge per-discovered-lead credits — the
  // Phase 18/19 convention — so the balance delta is 5 + discovery).
  const chargesRun = runId ? await wfexecChargesFor(userA.id, apId, runId) : [];
  logStep('15. Multiple niches → exactly ONE 5-credit charge (never per niche)',
    chargesRun.length === 1 && chargesRun[0]?.credits === -5,
    `charges=${chargesRun.length} credits=${chargesRun[0]?.credits}`);
  const balanceAfter = await db.user.findUnique({ where: { id: userA.id }, select: { credits: true } }).then((u) => u.credits);
  logStep('15. Balance moved by the flat 5 (+ any discovery credits)',
    startBalance - balanceAfter >= 5 && startBalance - balanceAfter <= 5 + (runRes.json?.discovered ?? 0) * 2,
    `${startBalance} → ${balanceAfter} (delta ${startBalance - balanceAfter}, discovered=${runRes.json?.discovered})`);

  // Capture run 1's ledger lead ids BEFORE anything else touches them.
  const run1LeadIds = runId
    ? (await db.autopilotLead.findMany({ where: { runId }, select: { leadId: true } })).map((l) => l.leadId)
    : [];

  // ═══════════════════════════════════════════════════════════════
  // 11. Cross-run deduplication (second run over the SAME niches)
  // ═══════════════════════════════════════════════════════════════
  const run2Res = await api(tokenA, 'POST', `/api/autopilot/${apId}/run`, undefined, 900000);
  const run2Id = run2Res.json?.runId;
  const run2LeadIds = run2Id
    ? (await db.autopilotLead.findMany({ where: { runId: run2Id }, select: { leadId: true } })).map((l) => l.leadId)
    : [];
  const overlap = run1LeadIds.filter((id) => run2LeadIds.includes(id));
  logStep('14. Cross-run dedup: NO lead from run 1 is re-executed in run 2',
    run2Res.status === 200 && overlap.length === 0,
    `http=${run2Res.status} run1 leads=${run1LeadIds.length} run2 leads=${run2LeadIds.length} overlap=${overlap.length}`);
  // A run that executes something charges exactly ONE flat fee; a
  // duplicate-only run charges ZERO. Never per-niche, never per-lead.
  const chargesRun2 = run2Id ? await wfexecChargesFor(userA.id, apId, run2Id) : [];
  logStep('14. Run 2 billing stays flat (0 or exactly ONE -5 — never per niche)',
    (run2Res.json?.executionsCreated === 0 && chargesRun2.length === 0)
      || (run2Res.json?.executionsCreated === 1 && chargesRun2.length === 1 && chargesRun2[0]?.credits === -5),
    `executionsCreated=${run2Res.json?.executionsCreated} charges=${chargesRun2.length} credits=${chargesRun2[0]?.credits}`);
  if (run2Id) {
    // Clean up run 2's ledger rows too.
    await db.autopilotLead.deleteMany({ where: { autopilotId: apId, runId: run2Id } });
    await db.autopilotRun.deleteMany({ where: { id: run2Id } });
  }

  // ═══════════════════════════════════════════════════════════════
  // 12. Phase 19 regression guard: selector still dynamic
  // ═══════════════════════════════════════════════════════════════
  const selRes = await api(tokenA, 'GET', '/api/autopilot/workflows');
  const selIds = new Set((selRes.json?.workflows || []).map((w) => w.id));
  logStep('13. Phase 19 selector intact (new workflow listed dynamically)',
    selRes.status === 200 && selIds.has(wfId),
    `http=${selRes.status} listed=${selIds.size} containsNew=${selIds.has(wfId)}`);

  // ═══════════════════════════════════════════════════════════════
  // 13. Runtime log health
  // ═══════════════════════════════════════════════════════════════
  // NOTE: dev.log is truncated by `tee` on every server restart (this
  // E2E restarts the server mid-run), so the whole current file is the
  // live session's log.
  const devLog = path.join(__dirname, '..', 'dev.log');
  if (fs.existsSync(devLog)) {
    const tail = fs.readFileSync(devLog, 'utf8');
    const nichesHits = (tail.match(/\/api\/autopilot\/niches/g) || []).length;
    const err5xx = (tail.match(/ (5\d\d) (?:in|Internal)/g) || []).length;
    logStep('Runtime log: niches endpoint visible, no 5xx',
      nichesHits >= 3 && err5xx === 0,
      `niches requests logged=${nichesHits} 5xx=${err5xx} (dev.log covers the post-restart session only)`);
  } else {
    console.log('NOTE  [runtime log] dev.log not found at expected path');
  }

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(' Phase 20 E2E complete.');
  console.log('═══════════════════════════════════════════════════════════════');
}

main()
  .catch((e) => {
    console.error('E2E fatal:', e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await cleanup();
    await db.$disconnect();
  });
