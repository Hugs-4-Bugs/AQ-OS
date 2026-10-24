// ═══════════════════════════════════════════════════════════════════
// Phase 21 E2E — DB-level verification of the REAL multi-country runs
// (run 1 + dedup run 2 executed server-side by the watchdog-supervised
// dev server; the API-driver script was reaped mid-flow, so this
// resumes every remaining assertion straight from the source of truth)
// ═══════════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

const BASE = 'http://localhost:3000';
const db = new PrismaClient();

const envText = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
const env = {};
for (const line of envText.split('\n')) {
  const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const JWT_SECRET = env.JWT_SECRET || env.AUTH_SECRET;

function mintAccessToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role, plan: user.plan,
      orgId: user.orgId ?? null, isTrial: false, trialEndsAt: null, type: 'access' },
    JWT_SECRET,
    { expiresIn: '15m', issuer: 'acquisitionos', audience: 'acquisitionos-api' }
  );
}
async function api(token, method, urlPath, body, timeoutMs = 60000) {
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
  } finally { clearTimeout(t); }
}
function logStep(name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${name}] ${detail}`);
  if (!ok) process.exitCode = 1;
}

(async () => {
  const userA = await db.user.findUnique({ where: { email: 'mailtoprabhat72@gmail.com' } });
  const tokenA = mintAccessToken(userA);
  // The multi-country autopilot from the E2E main run (name-stamped).
  const ap = await db.autopilotWorkflow.findFirst({
    where: { name: { startsWith: 'E2E P21 Multi-Country' } },
    orderBy: { createdAt: 'desc' },
  });
  if (!ap) { console.log('FAIL  [setup] multi-country autopilot row not found'); process.exit(1); }
  const runs = await db.autopilotRun.findMany({
    where: { autopilotId: ap.id },
    orderBy: { createdAt: 'asc' },
    select: { id: true, status: true, discovered: true, saved: true, processed: true, executionsCreated: true, executionId: true, config: true, createdAt: true },
  });
  const run1 = runs[0];
  const run2 = runs[1];
  console.log(`ap=${ap.id.slice(-8)} runs=${runs.length} run1=${run1?.id.slice(-8)}(${run1?.status},${run1?.saved}saved) run2=${run2?.id.slice(-8)}(${run2?.status},${run2?.saved}saved)`);

  // ── 10. per-run country targeting (DB evidence) ──
  let cfg1 = {};
  try { cfg1 = JSON.parse(run1.config); } catch { /* ignore */ }
  logStep('10. Run 1 snapshot: immutable country selection recorded',
    JSON.stringify(cfg1.countries) === JSON.stringify(['United Arab Emirates', 'United Kingdom', 'India'])
      && cfg1.worldwide === false,
    `countries=${JSON.stringify(cfg1.countries)} worldwide=${cfg1.worldwide}`);

  // ── 13. Phase 20 fields in the same snapshot ──
  const bpA = await db.businessProfile.findFirst({
    where: { name: { startsWith: 'E2E P21 Dental Profile' } },
    orderBy: { createdAt: 'desc' },
  });
  logStep('13. Phase 20 mapping + per-niche profile resolutions in the snapshot',
    cfg1.profileMappings?.dental === bpA?.id
      && Array.isArray(cfg1.nicheProfiles) && cfg1.nicheProfiles.length === 1
      && cfg1.nicheProfiles[0]?.profileId === bpA?.id,
    `mappings=${JSON.stringify(cfg1.profileMappings)} nicheProfiles=${JSON.stringify(cfg1.nicheProfiles || [])}`);

  // ── 10. discovery job targeting plan ──
  const ledger1 = await db.autopilotLead.findMany({ where: { runId: run1.id }, select: { leadId: true } });
  const jobRow = await db.discoveryJob.findFirst({
    where: { userId: userA.id, createdAt: { gte: run1.createdAt } },
    orderBy: { createdAt: 'asc' },
    select: { country: true, targetingJson: true },
  });
  let targeting = {};
  try { targeting = JSON.parse(jobRow?.targetingJson || '{}'); } catch { /* ignore */ }
  logStep('10. Discovery job carried the full 3-country selection (Phase 8/9 plan)',
    Array.isArray(targeting.countries) && targeting.countries.length === 3
      && ['United Arab Emirates', 'United Kingdom', 'India'].every((c) => targeting.countries.includes(c))
      && jobRow?.country === 'United Arab Emirates, United Kingdom, India',
    `job.country="${jobRow?.country}" targeting.countries=${JSON.stringify(targeting.countries)} combos=${targeting.combos}`);

  // ── 11. country attribution of the discovered leads ──
  const leadIds = ledger1.map((l) => l.leadId);
  const leads = leadIds.length
    ? await db.lead.findMany({ where: { id: { in: leadIds } }, select: { country: true, discoveredVia: true, niche: true } })
    : [];
  const selected = ['united arab emirates', 'united kingdom', 'india'];
  const withCountry = leads.filter((l) => l.country);
  const allInSelection = withCountry.every((l) => selected.includes(String(l.country).toLowerCase()));
  const comboLabeled = leads.filter((l) => /in (india|united arab emirates|united kingdom)/i.test(l.discoveredVia || '')).length;
  const dentalNiche = leads.filter((l) => /dental/i.test(l.niche || '')).length;
  logStep('11. Correct country attribution: Lead.country ∈ selection; combo labels in discoveredVia',
    leads.length > 0 && allInSelection && comboLabeled === leads.length && dentalNiche === leads.length,
    `leads=${leads.length} withCountry=${withCountry.length} allInSelection=${allInSelection} comboLabeled=${comboLabeled} dentalNiche=${dentalNiche}`);
  const byCountry = {};
  for (const l of leads) byCountry[l.country || '(none)'] = (byCountry[l.country || '(none)'] || 0) + 1;
  console.log(`        attribution breakdown: ${JSON.stringify(byCountry)}`);

  // ── 14. billing: ONE parent execution + exactly ONE -5 charge ──
  logStep('14. ONE parent execution for the multi-country run',
    run1.executionsCreated === 1 && !!run1.executionId,
    `executionsCreated=${run1.executionsCreated} executionId=${String(run1.executionId).slice(-8)}`);
  const chargeAction1 = `workflow_execution_idempotent_wfexec-run:autopilot-${ap.id}-run-${run1.id}`;
  const charges1 = await db.creditsLedger.findMany({ where: { userId: userA.id, action: chargeAction1 } });
  logStep('14. Multiple countries in ONE run → exactly ONE 5-credit charge',
    charges1.length === 1 && charges1[0]?.credits === -5,
    `charges=${charges1.length} credits=${charges1[0]?.credits}`);

  // ── 11/14. dedup run: no new ledger rows, no execution, no charge ──
  const ledger2 = run2 ? await db.autopilotLead.findMany({ where: { runId: run2.id }, select: { leadId: true } }) : [];
  const overlap = ledger1.map((l) => l.leadId).filter((id) => ledger2.map((x) => x.leadId).includes(id));
  const chargeAction2 = `workflow_execution_idempotent_wfexec-run:autopilot-${ap.id}-run-${run2?.id}`;
  const charges2 = run2 ? await db.creditsLedger.findMany({ where: { userId: userA.id, action: chargeAction2 } }) : [];
  logStep('11. Cross-run dedup across countries: run 2 re-found the SAME businesses (0 re-executed)',
    run2?.status === 'COMPLETED' && run2.saved === 0 && ledger2.length === 0 && overlap.length === 0,
    `run2 saved=${run2?.saved} ledgerRows=${ledger2.length} overlap=${overlap.length}`);
  logStep('14. Dedup run charges ZERO workflow fees (discovery-only = 0 credits)',
    run2?.executionsCreated === 0 && charges2.length === 0,
    `executionsCreated=${run2?.executionsCreated} charges=${charges2.length}`);

  // ── 12. snapshot immutability: post-run config edit never rewrites history ──
  const editRes = await api(tokenA, 'PATCH', `/api/autopilot/${ap.id}`, { geography: { countries: ['Brazil'] } });
  const run1After = await db.autopilotRun.findUnique({ where: { id: run1.id }, select: { config: true } });
  let cfgAfter = {};
  try { cfgAfter = JSON.parse(run1After.config); } catch { /* ignore */ }
  logStep('12. Post-run config edit does NOT mutate the recorded run snapshot',
    editRes.status === 200 && JSON.stringify(cfgAfter.countries) === JSON.stringify(['United Arab Emirates', 'United Kingdom', 'India']),
    `http=${editRes.status} snapshot.countries=${JSON.stringify(cfgAfter.countries)}`);

  // ── 15. runtime log health ──
  const devLog = path.join(__dirname, '..', 'dev.log');
  if (fs.existsSync(devLog)) {
    const tail = fs.readFileSync(devLog, 'utf8');
    const countriesHits = (tail.match(/\/api\/autopilot\/countries/g) || []).length;
    const statusMatches = tail.match(/ (5\d\d) (?:in|-)/g) || [];
    const genuine5xx = statusMatches.filter((m) => !m.includes('/api/health')).length;
    logStep('15. Runtime log: countries endpoint visible, no unexpected 5xx',
      countriesHits >= 3 && genuine5xx === 0,
      `countries requests logged=${countriesHits} raw5xx=${statusMatches.length} genuine5xx=${genuine5xx} (health 503s during recompile windows are non-application)`);
  }

  // persist state for the verify phase (post-restart)
  fs.writeFileSync('/tmp/e2e-p21-state.json', JSON.stringify({
    apMultiId: ap.id, run1Id: run1.id, ts: Date.now(),
  }));
  console.log('\nDB-level verification complete (state saved for the restart-verify phase).');
})().catch((e) => { console.error('fatal:', e); process.exit(1); }).finally(() => db.$disconnect());
