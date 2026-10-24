#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Phase 22 Autopilot Schedule REAL E2E
//
// Phases (invoked via scripts/e2e-phase22-run.sh <phase>):
//   main    — create + persist a timezone-aware schedule → the REAL
//             in-process heartbeat fires the REAL runAutopilot → ONE
//             parent execution + ONE flat -5 charge → next-run advances
//             on the anchored grid → duplicate scheduler invocation
//             (concurrent cron-route ticks during an in-flight run +
//             manual-run race) → stale-slot replay convergence (runKey)
//             → pause stops scheduling → resume recalculates → disable
//             stops scheduling while manual Run still works → re-enable
//             → Phase 21 config preservation + billing neutrality.
//   verify  — after a REAL server kill + watchdog respawn: schedule +
//             next-run survive byte-exact, the heartbeat restarts, and
//             the scheduler STILL fires a new run post-restart.
//   cleanup — removes exactly the rows this E2E created.
//
// The dev server runs with AUTOPILOT_SCHEDULER_INTERVAL_MS=15000 for
// this E2E (fast heartbeat via the watchdog's environment). Ticks are
// additionally drivable through POST /api/cron/autopilot-scheduler
// (CRON_SECRET) — the same shared tick function deployments use.
// ═══════════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

const BASE = 'http://localhost:3000';
const TS = Date.now();
const STATE_FILE = '/tmp/e2e-p22-state.json';

const envText = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
const env = {};
for (const line of envText.split('\n')) {
  const m = /^([A-Z_0-9]+)=(.*)$/.exec(line.trim());
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const JWT_SECRET = env.JWT_SECRET || env.AUTH_SECRET;
const CRON_SECRET = env.CRON_SECRET;
const db = new PrismaClient();

function mintAccessToken(user) {
  return jwt.sign(
    {
      sub: user.id, email: user.email, role: user.role, plan: user.plan,
      orgId: user.orgId ?? null, isTrial: false, trialEndsAt: null, type: 'access',
    },
    JWT_SECRET,
    { expiresIn: '60m', issuer: 'acquisitionos', audience: 'acquisitionos-api' }
  );
}

async function api(token, method, urlPath, body, timeoutMs = 180000) {
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

async function cronTick() {
  const res = await fetch(BASE + '/api/cron/autopilot-scheduler', {
    method: 'POST',
    headers: { Authorization: `Bearer ${CRON_SECRET}` },
  });
  let json = null;
  try { json = await res.json(); } catch { /* non-json */ }
  return { status: res.status, json };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function logStep(name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${name}] ${detail}`);
  if (!ok) process.exitCode = 1;
}

/** Current wall time HH:mm in a timezone, optionally offset into the future. */
function istTimeIn(offsetMs = 0) {
  const d = new Date(Date.now() + offsetMs);
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata', hour12: false, hour: '2-digit', minute: '2-digit',
  }).format(d);
}

async function runsFor(apId) {
  return db.autopilotRun.findMany({
    where: { autopilotId: apId },
    orderBy: { createdAt: 'asc' },
    select: { id: true, status: true, trigger: true, runKey: true, executionId: true, discovered: true, error: true, createdAt: true, config: true },
  });
}

async function chargesFor(userId, apId) {
  return db.creditsLedger.findMany({
    where: { userId, action: { contains: `wfexec-run:autopilot-${apId}` } },
    select: { id: true, action: true, credits: true },
  });
}

async function waitFor(desc, fn, { timeoutMs, everyMs = 5000, progressMs = 15000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  let lastProgress = Date.now();
  while (Date.now() < deadline) {
    last = await fn();
    if (last) return last;
    await sleep(everyMs);
    if (Date.now() - lastProgress >= progressMs) {
      console.log(`      … waiting (${desc}) — ${Math.round((deadline - Date.now()) / 1000)}s left`);
      lastProgress = Date.now();
    }
  }
  return null;
}

const state = {};

// ═══════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════

async function main() {
  // ── 0. Health + heartbeat wiring ──
  const health = await fetch(`${BASE}/api/health`).then((r) => r.status).catch(() => 0);
  logStep('0. dev server healthy', health === 200, `GET /api/health → ${health}`);
  const devLog0 = fs.readFileSync(path.join(__dirname, '..', 'dev.log'), 'utf8');
  logStep('0b. scheduler heartbeat is running (startup log line)',
    /\[autopilot-scheduler\] heartbeat enabled/.test(devLog0),
    `interval line present=${/\[autopilot-scheduler\] heartbeat enabled: interval=(\d+)s/.exec(devLog0)?.[1] ?? 'n/a'}s`);

  // ── 1. QA user (pro plan + credits, mirrors the Phase 21 fixture) ──
  const email = `e2e-p22-${TS}@test.local`;
  const user = await db.user.create({
    data: {
      email, name: 'E2E P22 User', role: 'owner', plan: 'pro',
      credits: 500, creditsMonthly: 0, emailVerified: true, isActive: true,
      passwordHash: 'e2e-no-login', orgId: null,
    },
  });
  state.userId = user.id; state.userEmail = email;
  const token = mintAccessToken(user);
  logStep('1. QA user (pro plan, 500 credits) created', !!user.id, `${email}`);

  // ── 2. Active workflow (2 action steps — same as Phase 21 E2E) ──
  const wfRes = await api(token, 'POST', '/api/workflows', {
    name: `E2E P22 Schedule Workflow ${TS}`,
    description: 'Phase 22 scheduled run check',
    triggerType: 'manual',
    status: 'active',
    steps: [
      { type: 'action', name: 'Mark contacted', config: { actionType: 'move_to_stage', targetStage: 'contacted' }, order: 0 },
      { type: 'action', name: 'Tag p22', config: { actionType: 'add_tag', tag: `phase22-${TS}` }, order: 1 },
    ],
  });
  const wfId = wfRes.json?.workflow?.id ?? wfRes.json?.id;
  state.workflowId = wfId;
  logStep('2. active workflow created', wfRes.status >= 200 && wfRes.status < 300 && !!wfId,
    `http=${wfRes.status} id=${String(wfId).slice(-8)}`);

  // ── 3. Create a timezone-aware anchored schedule (Asia/Kolkata) ──
  const startAt = istTimeIn(80_000); // ~80s ahead, minute precision
  const createRes = await api(token, 'POST', '/api/autopilot', {
    name: `E2E P22 Scheduled IST ${TS}`,
    niches: ['Dental'],
    geography: { countries: ['India', 'United Arab Emirates'] },
    workflowId: wfId,
    schedule: { every: 1, unit: 'HOURS', timezone: 'Asia/Kolkata', startAt },
    activate: true,
  });
  const ap1 = createRes.json?.id;
  state.ap1 = ap1; state.ap1StartAt = startAt;
  logStep('3. schedule created via canonical API (hourly @ ' + startAt + ' Asia/Kolkata)',
    createRes.status === 201 && !!ap1, `http=${createRes.status} id=${String(ap1).slice(-8)}`);

  const detail1 = await api(token, 'GET', `/api/autopilot/${ap1}`);
  const cfg1 = detail1.json?.autopilot?.scheduleConfig;
  const next1 = detail1.json?.autopilot?.nextRunAt ? new Date(detail1.json.autopilot.nextRunAt) : null;
  const expectedMinuteMs = Date.now() + 80_000;
  logStep('4. persisted config is canonical (timezone + anchor persisted)',
    cfg1?.every === 1 && cfg1?.unit === 'HOURS' && cfg1?.timezone === 'Asia/Kolkata' && cfg1?.startAt === startAt
      && /^\d{4}-\d{2}-\d{2}$/.test(String(cfg1?.anchorDate)) && cfg1?.enabled === true,
    `scheduleConfig=${JSON.stringify(cfg1)}`);
  logStep('5. next run computed server-side on the IST wall clock (not UTC)',
    !!next1 && next1.getTime() > Date.now() + 30_000 && next1.getTime() < expectedMinuteMs + 60_000,
    `nextRunAt=${next1?.toISOString()} (≈ ${startAt} IST)`);

  // ── 6. The REAL heartbeat fires the REAL runner (no cron driving) ──
  console.log('   … waiting for the in-process heartbeat to fire the scheduled run');
  const fired = await waitFor('heartbeat-fired scheduler run', async () => {
    const rs = await runsFor(ap1);
    return rs.find((r) => r.trigger === 'scheduler') ?? null;
  }, { timeoutMs: 240_000, everyMs: 5000 });
  logStep('6. the scheduler actually triggered the canonical Autopilot runner',
    !!fired, `run=${String(fired?.id).slice(-8)} runKey=${fired?.runKey}`);

  const done1 = await waitFor('run completion', async () => {
    const rs = await runsFor(ap1);
    const r = rs.find((x) => x.id === fired?.id);
    return r && ['COMPLETED', 'FAILED', 'CANCELLED'].includes(r.status) ? r : null;
  }, { timeoutMs: 420_000, everyMs: 10000 });
  logStep('7. the run is persisted and reached a terminal state',
    !!done1, `status=${done1?.status} discovered=${done1?.discovered} error=${done1?.error ?? 'none'}`);

  const ap1RunsAfter = await runsFor(ap1);
  const schedRuns1 = ap1RunsAfter.filter((r) => r.trigger === 'scheduler');
  logStep('8. ONE parent execution for the scheduled run', !!done1?.executionId,
    `executionId=${String(done1?.executionId).slice(-8)}`);
  const cfgSnapshot = done1?.config ? JSON.parse(done1.config) : {};
  logStep('9. run config snapshots the schedule that fired it (immutable)',
    cfgSnapshot?.schedule?.timezone === 'Asia/Kolkata' && cfgSnapshot?.schedule?.startAt === startAt,
    `snapshot.schedule=${JSON.stringify(cfgSnapshot?.schedule)}`);

  // ── 10. Billing: exactly ONE flat -5 charge for the run; 0 for scheduling ──
  const charges1 = await chargesFor(user.id, ap1);
  logStep('10. billing: ONE flat -5 charge for the actual run, none for scheduling',
    charges1.length === 1 && charges1[0].credits === -5,
    `charges=${charges1.length} credits=${charges1[0]?.credits}`);

  // ── 11. next run advanced on the anchored hourly grid ──
  const detail2 = await api(token, 'GET', `/api/autopilot/${ap1}`);
  const next2 = detail2.json?.autopilot?.nextRunAt ? new Date(detail2.json.autopilot.nextRunAt) : null;
  const slotEpoch = Number(String(fired?.runKey).split(':').pop());
  logStep('11. next run persisted on the anchored grid (slot + 1h)',
    !!next2 && Math.abs(next2.getTime() - (slotEpoch + 3600_000)) < 2000,
    `nextRunAt=${next2?.toISOString()} slot=${new Date(slotEpoch).toISOString()}`);

  // ── 12. Second schedule — used for the in-flight duplicate-tick race ──
  const startAt2 = istTimeIn(80_000);
  const create2 = await api(token, 'POST', '/api/autopilot', {
    name: `E2E P22 Concurrent Ticks ${TS}`,
    niches: ['Cafe'],
    geography: { countries: ['Singapore'] },
    workflowId: wfId,
    schedule: { every: 1, unit: 'HOURS', timezone: 'Asia/Kolkata', startAt: startAt2 },
    activate: true,
  });
  const ap2 = create2.json?.id;
  state.ap2 = ap2; state.ap2StartAt = startAt2;
  logStep('12. second schedule created (for the concurrent-tick race)',
    create2.status === 201 && !!ap2, `http=${create2.status} id=${String(ap2).slice(-8)}`);

  // The cron route is wired and shares the SAME tick (sanity: nothing due yet).
  const tickWire = await cronTick();
  logStep('12b. cron route tick responds ok (shared tick function)',
    tickWire.status === 200 && tickWire.json?.ok === true,
    `http=${tickWire.status} due=${tickWire.json?.dueCount} started=${tickWire.json?.started}`);

  // The REAL heartbeat fires ap2's run (same path as ap1).
  console.log('   … waiting for the heartbeat to fire the second scheduled run');
  const fired2 = await waitFor('ap2 scheduler run', async () => {
    const rs = await runsFor(ap2);
    return rs.find((r) => r.trigger === 'scheduler') ?? null;
  }, { timeoutMs: 240_000, everyMs: 5000 });
  logStep('13. second scheduled run fired by the heartbeat',
    !!fired2, `run=${String(fired2?.id).slice(-8)}`);

  // While that run is IN FLIGHT: 3 concurrent cron ticks + a manual run
  // race — all must converge with NO second run and NO second charge.
  const [t2, t3, t4, manualRace] = await Promise.all([
    cronTick(), cronTick(), cronTick(),
    api(token, 'POST', `/api/autopilot/${ap2}/run`, undefined, 30000),
  ]);
  const racingTicks = [t2, t3, t4].filter((t) => t.status === 200);
  logStep('14. concurrent cron ticks during an in-flight run all skip (duplicate prevention)',
    racingTicks.length === 3 && racingTicks.every((t) => (t.json?.started ?? 0) === 0),
    `ticks ok=${racingTicks.length} started=[${racingTicks.map((t) => t.json?.started).join(',')}] skipped=[${racingTicks.map((t) => t.json?.skippedInFlight).join(',')}]`);
  logStep('15. manual run racing the in-flight scheduled run is blocked (no double execution)',
    manualRace.status === 409 && (manualRace.json?.code === 'RUN_IN_PROGRESS' || manualRace.json?.code === 'INVALID_STATE'),
    `http=${manualRace.status} code=${manualRace.json?.code} (the in-flight RUNNING state / open-run guard rejects the manual run)`);

  await waitFor('ap2 run completion', async () => {
    const r = await db.autopilotRun.findUnique({ where: { id: fired2?.id }, select: { status: true } });
    return r && ['COMPLETED', 'FAILED', 'CANCELLED'].includes(r.status) ? r : null;
  }, { timeoutMs: 420_000, everyMs: 10000 });
  const ap2Runs = await runsFor(ap2);
  const charges2 = await chargesFor(user.id, ap2);
  logStep('16. exactly ONE scheduler run + ONE charge survived the 4-tick race',
    ap2Runs.filter((r) => r.trigger === 'scheduler').length === 1 && charges2.length === 1 && charges2[0].credits === -5,
    `runs=${ap2Runs.length} charges=${charges2.length}`);

  // ── 17. Stale-slot replay: re-expose the SAME slot epoch → runKey
  // convergence + Phase 22 self-heal (nextRunAt advances past the slot).
  await db.autopilotWorkflow.update({
    where: { id: ap1 },
    data: { nextRunAt: new Date(slotEpoch) }, // the already-consumed slot, now "due"
  });
  const replayTick = await cronTick();
  await sleep(3000);
  const ap1RunsReplay = await runsFor(ap1);
  const charges1Replay = await chargesFor(user.id, ap1);
  const ap1Row = await db.autopilotWorkflow.findUnique({ where: { id: ap1 }, select: { status: true, nextRunAt: true } });
  logStep('17. stale-slot replay converges on the existing runKey (no new run, no new charge) AND self-heals',
    (replayTick.json?.started ?? 1) === 0 && ap1RunsReplay.length === 1 && charges1Replay.length === 1
      && ap1Row?.status === 'ACTIVE' && !!ap1Row?.nextRunAt && Math.abs(ap1Row.nextRunAt.getTime() - (slotEpoch + 3600_000)) < 5000,
    `tickStarted=${replayTick.json?.started} runs=${ap1RunsReplay.length} charges=${charges1Replay.length} status=${ap1Row?.status} nextRun=${ap1Row?.nextRunAt?.toISOString()}`);

  // ── 18. Pause stops scheduled execution (config preserved) ──
  const pauseRes = await api(token, 'PATCH', `/api/autopilot/${ap1}`, { status: 'PAUSED' });
  const detailP = await api(token, 'GET', `/api/autopilot/${ap1}`);
  logStep('18. pause: nextRunAt cleared, schedule config kept',
    pauseRes.status === 200 && detailP.json?.autopilot?.nextRunAt === null
      && detailP.json?.autopilot?.scheduleConfig?.startAt === startAt
      && detailP.json?.autopilot?.scheduleConfig?.enabled === true,
    `http=${pauseRes.status} nextRunAt=${detailP.json?.autopilot?.nextRunAt}`);
  await sleep(40_000); // ≥ 2 ticks while paused — paused nextRunAt is null → never due
  const runsPaused = await runsFor(ap1);
  logStep('19. no scheduled execution while PAUSED',
    runsPaused.length === 1, `runs=${runsPaused.length}`);

  // ── 20. Resume recalculates the next run canonically ──
  const resumeRes = await api(token, 'PATCH', `/api/autopilot/${ap1}`, { status: 'ACTIVE' });
  const detailR = await api(token, 'GET', `/api/autopilot/${ap1}`);
  const nextR = detailR.json?.autopilot?.nextRunAt ? new Date(detailR.json.autopilot.nextRunAt) : null;
  const nextGrid = slotEpoch + 3600_000; // the upcoming anchored occurrence
  logStep('20. resume: next run recalculated on the schedule\'s timezone grid',
    resumeRes.status === 200 && !!nextR && Math.abs(nextR.getTime() - nextGrid) < 30_000,
    `http=${resumeRes.status} nextRunAt=${nextR?.toISOString()} (grid ${new Date(nextGrid).toISOString()})`);
  await sleep(35_000); // no immediate fire — the resumed next run is an hour out
  const runsResumed = await runsFor(ap1);
  logStep('21. resume does NOT fire an immediate run',
    runsResumed.length === 1, `runs=${runsResumed.length}`);

  // ── 22. Disable stops scheduling; manual Run still works ──
  const disableRes = await api(token, 'PATCH', `/api/autopilot/${ap1}`, {
    schedule: { every: 1, unit: 'HOURS', timezone: 'Asia/Kolkata', startAt, enabled: false },
  });
  const detailD = await api(token, 'GET', `/api/autopilot/${ap1}`);
  logStep('22. disable: scheduling off (nextRunAt null), full config preserved',
    disableRes.status === 200 && detailD.json?.autopilot?.nextRunAt === null
      && detailD.json?.autopilot?.scheduleConfig?.enabled === false
      && detailD.json?.autopilot?.scheduleConfig?.timezone === 'Asia/Kolkata',
    `http=${disableRes.status} enabled=${detailD.json?.autopilot?.scheduleConfig?.enabled} nextRunAt=${detailD.json?.autopilot?.nextRunAt}`);
  await sleep(40_000); // ≥ 2 ticks while disabled
  const runsDisabled = await runsFor(ap1);
  logStep('23. no scheduled execution while the schedule is DISABLED',
    runsDisabled.length === 1, `runs=${runsDisabled.length}`);

  const manualRes = await api(token, 'POST', `/api/autopilot/${ap1}/run`, undefined, 420000);
  const detailM = await api(token, 'GET', `/api/autopilot/${ap1}`);
  const runsM = await runsFor(ap1);
  const charges1M = await chargesFor(user.id, ap1);
  logStep('24. manual Run STILL WORKS while the schedule is disabled',
    manualRes.status === 200 && runsM.some((r) => r.trigger === 'manual'),
    `http=${manualRes.status} status=${manualRes.json?.status}`);
  logStep('25. manual run does NOT mutate the schedule (still disabled, nextRunAt still null)',
    detailM.json?.autopilot?.scheduleConfig?.enabled === false && detailM.json?.autopilot?.nextRunAt === null,
    `enabled=${detailM.json?.autopilot?.scheduleConfig?.enabled} nextRunAt=${detailM.json?.autopilot?.nextRunAt}`);
  logStep('26. the manual run paid the same flat -5 (billing parity)',
    charges1M.length === 2 && charges1M[1].credits === -5,
    `charges=${charges1M.length}`);

  // ── 27. Re-enable ──
  const enableRes = await api(token, 'PATCH', `/api/autopilot/${ap1}`, {
    schedule: { every: 1, unit: 'HOURS', timezone: 'Asia/Kolkata', startAt, enabled: true },
  });
  const detailE = await api(token, 'GET', `/api/autopilot/${ap1}`);
  logStep('27. re-enable: scheduling back on with a fresh canonical next run',
    enableRes.status === 200 && detailE.json?.autopilot?.scheduleConfig?.enabled === true
      && !!detailE.json?.autopilot?.nextRunAt && new Date(detailE.json.autopilot.nextRunAt).getTime() > Date.now(),
    `nextRunAt=${detailE.json?.autopilot?.nextRunAt}`);

  // ── 28. Phase 21 config preservation through every schedule mutation ──
  const geoFinal = detailE.json?.autopilot?.geography;
  logStep('28. Phase 21 multi-country config preserved through all schedule mutations',
    JSON.stringify(geoFinal) === JSON.stringify(detail1.json?.autopilot?.geography)
      && JSON.stringify(detailE.json?.autopilot?.niches) === JSON.stringify(detail1.json?.autopilot?.niches)
      && detailE.json?.autopilot?.workflowId === wfId,
    `geography=${JSON.stringify(geoFinal)} niches=${JSON.stringify(detailE.json?.autopilot?.niches)}`);

  // ── 29. Runtime log evidence ──
  const devLog = fs.readFileSync(path.join(__dirname, '..', 'dev.log'), 'utf8');
  const startedLines = (devLog.match(/\[autopilot-scheduler\] started scheduled run/g) || []).length;
  const nextLines = (devLog.match(/\[autopilot-scheduler\] next run scheduled/g) || []).length;
  const http500 = (devLog.match(/ 500 (?:in|\()/g) || []).length;
  logStep('29. runtime log: scheduler started/next-run lines match the run count, no unexpected 5xx',
    startedLines === 2 && nextLines === 2 && http500 === 0,
    `startedLines=${startedLines} nextLines=${nextLines} http500=${http500}`);

  // ── save state for the verify phase ──
  fs.writeFileSync(STATE_FILE, JSON.stringify({
    ...state, slotEpoch, wfId, userId: user.id,
    scheduleConfigExpected: detailE.json?.autopilot?.scheduleConfig,
    geographyExpected: detailE.json?.autopilot?.geography,
    nichesExpected: detailE.json?.autopilot?.niches,
    runCountAp1: (await runsFor(ap1)).length,
    chargesAp1: (await chargesFor(user.id, ap1)).length,
    ts: TS,
  }, null, 2));
  console.log('\nMAIN PHASE DONE');
}

// ═══════════════════════════════════════════════════════════════════
// VERIFY (after a REAL server kill + watchdog respawn)
// ═══════════════════════════════════════════════════════════════════

async function verify() {
  const saved = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  const user = await db.user.findUnique({ where: { id: saved.userId } });
  const token = mintAccessToken(user);
  const verifyStart = Date.now();

  const health = await fetch(`${BASE}/api/health`).then((r) => r.status).catch(() => 0);
  logStep('30. server respawned healthy after the REAL kill', health === 200, `GET /api/health → ${health}`);

  const devLog = fs.readFileSync(path.join(__dirname, '..', 'dev.log'), 'utf8');
  logStep('31. the scheduler heartbeat RESTARTED with the server (startup line present)',
    /\[autopilot-scheduler\] heartbeat enabled: interval=15s/.test(devLog),
    `heartbeat line present (15s interval)`);

  const detail = await api(token, 'GET', `/api/autopilot/${saved.ap1}`);
  const ap = detail.json?.autopilot;
  logStep('32. schedule config survived the restart byte-exact',
    JSON.stringify(ap?.scheduleConfig) === JSON.stringify(saved.scheduleConfigExpected),
    `scheduleConfig=${JSON.stringify(ap?.scheduleConfig)}`);
  logStep('33. Phase 21 geography/niches/workflow survived the restart',
    JSON.stringify(ap?.geography) === JSON.stringify(saved.geographyExpected)
      && JSON.stringify(ap?.niches) === JSON.stringify(saved.nichesExpected)
      && ap?.workflowId === saved.wfId,
    `geography=${JSON.stringify(ap?.geography)}`);

  // The scheduler STILL fires after the restart: re-anchor ~80s ahead.
  const startAt = istTimeIn(80_000);
  const patchRes = await api(token, 'PATCH', `/api/autopilot/${saved.ap1}`, {
    schedule: { every: 1, unit: 'HOURS', timezone: 'Asia/Kolkata', startAt, enabled: true },
  });
  logStep('34. post-restart schedule edit accepted (canonical validation live)',
    patchRes.status === 200, `http=${patchRes.status} startAt=${startAt}`);

  const fired = await waitFor('post-restart scheduler run', async () => {
    const rs = await runsFor(saved.ap1);
    return rs.find((r) => r.createdAt.getTime() >= verifyStart) ?? null;
  }, { timeoutMs: 240_000, everyMs: 5000 });
  logStep('35. the scheduler STILL fires runs after the restart',
    !!fired, `run=${String(fired?.id).slice(-8)} runKey=${fired?.runKey}`);

  await waitFor('post-restart run completion', async () => {
    const r = await db.autopilotRun.findUnique({ where: { id: fired?.id }, select: { status: true } });
    return r && ['COMPLETED', 'FAILED', 'CANCELLED'].includes(r.status) ? r : null;
  }, { timeoutMs: 420_000, everyMs: 10000 });

  const runsFinal = await runsFor(saved.ap1);
  const chargesFinal = await chargesFor(saved.userId, saved.ap1);
  logStep('36. billing invariant after restart: charges == runs (one flat fee each, nothing for scheduling)',
    chargesFinal.length === runsFinal.length && chargesFinal.every((c) => c.credits === -5),
    `runs=${runsFinal.length} charges=${chargesFinal.length}`);

  console.log('\nVERIFY PHASE DONE');
}

// ═══════════════════════════════════════════════════════════════════
// CLEANUP — removes exactly the rows this E2E created
// ═══════════════════════════════════════════════════════════════════

async function cleanup() {
  let saved = null;
  try { saved = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { /* no state — prefix match below */ }

  // Wait for any in-flight runs to reach a terminal state (delete refuses RUNNING).
  if (saved) {
    for (const apId of [saved.ap1, saved.ap2].filter(Boolean)) {
      await waitFor(`terminal state for ${String(apId).slice(-8)}`, async () => {
        const open = await db.autopilotRun.findFirst({
          where: { autopilotId: apId, status: { in: ['QUEUED', 'RUNNING'] } },
          select: { id: true },
        });
        return !open;
      }, { timeoutMs: 480_000, everyMs: 15000 });
    }
  }

  const aps = await db.autopilotWorkflow.findMany({
    where: { name: { startsWith: 'E2E P22' } }, select: { id: true, name: true },
  });
  for (const ap of aps) {
    await db.autopilotLead.deleteMany({ where: { autopilotId: ap.id } });
    await db.autopilotRun.deleteMany({ where: { autopilotId: ap.id } });
    await db.autopilotWorkflow.deleteMany({ where: { id: ap.id } });
    console.log('removed autopilot:', ap.name);
  }

  const wfs = await db.workflowDefinition.findMany({
    where: { name: { startsWith: 'E2E P22' } }, select: { id: true, name: true },
  });
  for (const wf of wfs) {
    const execs = await db.workflowExecution.findMany({ where: { workflowId: wf.id }, select: { id: true } });
    for (const e of execs) {
      await db.workflowExecutionLead.deleteMany({ where: { executionId: e.id } });
      await db.workflowLog.deleteMany({ where: { executionId: e.id } });
      await db.workflowExecution.deleteMany({ where: { id: e.id } });
    }
    await db.workflowStep.deleteMany({ where: { workflowId: wf.id } });
    await db.workflowDefinition.deleteMany({ where: { id: wf.id } });
    console.log('removed workflow:', wf.name);
  }

  const users = await db.user.findMany({
    where: { email: { startsWith: 'e2e-p22-' } }, select: { id: true, email: true },
  });
  for (const u of users) {
    await db.lead.deleteMany({ where: { userId: u.id } });
    await db.creditsLedger.deleteMany({ where: { userId: u.id } });
    await db.user.deleteMany({ where: { id: u.id } });
    console.log('removed user:', u.email);
  }

  try { fs.unlinkSync(STATE_FILE); } catch { /* already gone */ }
  console.log('\nCLEANUP DONE');
}

// ── entrypoint ──
const phase = process.argv[2] || 'main';
db.$connect()
  .then(() => (phase === 'main' ? main() : phase === 'verify' ? verify() : cleanup()))
  .catch((err) => { console.error(`[${phase}] FATAL`, err); process.exitCode = 1; })
  .finally(() => db.$disconnect());
