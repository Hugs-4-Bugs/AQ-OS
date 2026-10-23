// ═══════════════════════════════════════════════════════════════════
// Phases 11–17 E2E — REAL dev server + REAL routes + REAL engine +
// REAL AI provider + REAL DB (no mocks).
//
// Flow (per requirements):
//  1. Login as User A (app's own JWT shape)
//  2-5. Create/save Context A, Business Profile A, Offer A + second profile
//  6-8. Refresh / logout-login / session reinit → verify persistence
//  9-12. Discovery with explicit profile override → verify snapshot →
//        edit profile → snapshot unchanged
// 13-16. Select multiple leads → ONE workflow execution → per-lead
//        individualized outreach (different content for different leads)
// 17.   Retry/idempotency (replay same runId → same execution, 0 charges)
// 18.   Exactly 5 credits for the successful execution
// 19.   User B cannot access User A's profiles/context/offers
// ═══════════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

const BASE = 'http://localhost:3000';
const USER_A_EMAIL = 'mailtoprabhat72@gmail.com';

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

async function api(token, method, urlPath, body) {
  const res = await fetch(BASE + urlPath, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  let json = null;
  try { json = await res.json(); } catch { /* non-json */ }
  return { status: res.status, json };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TERMINAL = (s) => ['completed', 'failed', 'cancelled', 'exhausted', 'partial'].includes(s);

function logStep(name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${name}] ${detail}`);
  if (!ok) process.exitCode = 1;
}

async function balance(userId) {
  const u = await db.user.findUnique({ where: { id: userId }, select: { credits: true } });
  return u.credits;
}

async function waitFor(executionId, predicate, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = await db.workflowExecution.findUnique({
      where: { id: executionId },
      select: { status: true, currentStep: true, totalSteps: true, error: true, triggerData: true },
    });
    if (predicate(last)) return last;
    await sleep(3000);
  }
  console.log(`   (timeout waiting for ${label}; last state: ${JSON.stringify(last && { status: last.status, currentStep: last.currentStep, error: last.error })})`);
  return last;
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(' Phases 11–17 E2E — real server, real engine, real AI, real DB');
  console.log('═══════════════════════════════════════════════════════════════');

  // 1. Login as User A (fresh JWT = fresh session).
  const userA = await db.user.findUnique({ where: { email: USER_A_EMAIL } });
  const userB = await db.user.findFirst({ where: { NOT: { id: userA.id } }, orderBy: { createdAt: 'asc' } });
  let tokenA = mintAccessToken(userA);
  const tokenB = mintAccessToken(userB);
  const startBalance = await balance(userA.id);
  console.log(`User A: ${userA.email} (elite, ${startBalance} credits)`);
  console.log(`User B: ${userB.email}`);

  // ── 2. Create/save Context A ──
  const ctxBody = {
    whatYouDo: 'I run a healthcare automation agency serving clinics',
    services: 'AI appointment automation, billing integrations, patient portals',
    goals: 'Sign 10 clinic clients this quarter',
    targetAudience: 'Clinic owners with 2-10 staff',
    positioning: 'Fastest deployment in the industry',
  };
  const ctxPut = await api(tokenA, 'PUT', '/api/settings/personal-context', { context: ctxBody });
  logStep('2. Save Context A', ctxPut.status === 200, `PUT ${ctxPut.status}`);
  const ctxGet1 = await api(tokenA, 'GET', '/api/settings/personal-context');
  logStep('2. Context A readable', ctxGet1.status === 200 &&
    ctxGet1.json?.context?.whatYouDo === ctxBody.whatYouDo, `whatYouDo=${ctxGet1.json?.context?.whatYouDo?.slice(0, 40)}`);

  // ── 3. Create/save Business Profile A ──
  const profileABody = {
    name: 'E2E Profile A — Dental Automation',
    industry: 'Healthcare IT',
    description: 'Automation software for dental clinics',
    productsServices: 'AI receptionist, appointment scheduling, billing automation',
    offers: 'Free 30-day trial + free clinic audit',
    valueProposition: 'Cut no-shows by 40% in 30 days',
    targetAudience: 'Dental clinic owners',
    geographicMarket: 'India',
    painPoints: 'Missed calls, manual scheduling, billing errors',
    preferredTone: 'professional',
    preferredLanguage: 'English',
    cta: 'Book a 15-minute demo',
    customInstructions: 'Always mention the free clinic audit',
  };
  const profileAPut = await api(tokenA, 'POST', '/api/business-profiles', profileABody);
  const profileA = profileAPut.json?.profile;
  logStep('3. Save Business Profile A', profileAPut.status === 201 && !!profileA?.id, `id=${profileA?.id} isDefault=${profileA?.isDefault}`);

  // ── 4. Create/save Offer A ──
  const offerBody = { services: [
    { id: 'svc1', label: 'AI Receptionist', category: 'ai_automation', description: '24/7 automated call answering for clinics' },
    { id: 'svc2', label: 'Billing Automation', category: 'saas', description: 'Insurance claim processing automation' },
  ]};
  const offerPut = await api(tokenA, 'PUT', '/api/prospecting/offer-profile', offerBody);
  logStep('4. Save Offer A', offerPut.status === 200 && offerPut.json?.services?.length === 2, `services=${offerPut.json?.services?.length}`);

  // ── 5. Create a SECOND profile ──
  const profileBBody = {
    name: 'E2E Profile B — Ayurveda Retreats',
    industry: 'Wellness Tourism',
    description: 'Marketing services for ayurvedic wellness retreats',
    productsServices: 'Booking funnel optimization, retreat branding',
    preferredTone: 'warm',
    cta: 'Claim your retreat marketing audit',
  };
  const profileBPut = await api(tokenA, 'POST', '/api/business-profiles', profileBBody);
  const profileB = profileBPut.json?.profile;
  logStep('5. Save second profile B', profileBPut.status === 201 && !!profileB?.id, `id=${profileB?.id} (multi-profile coexistence)`);

  // Multiple profiles coexist; A remains the default (first active profile):
  const listA = await api(tokenA, 'GET', '/api/business-profiles');
  logStep('5. Multiple profiles coexist', listA.json?.total === 2 && listA.json?.defaultProfileId === profileA.id,
    `total=${listA.json?.total} default=${String(listA.json?.defaultProfileId).slice(-8)}`);

  // ── 6. REFRESH: brand-new requests (no client state) re-read the DB ──
  const ctxAfterRefresh = await api(mintAccessToken(userA), 'GET', '/api/settings/personal-context');
  const profilesAfterRefresh = await api(mintAccessToken(userA), 'GET', '/api/business-profiles');
  const offerAfterRefresh = await api(mintAccessToken(userA), 'GET', '/api/prospecting/offer-profile');
  logStep('6. Refresh persistence (context)', ctxAfterRefresh.json?.context?.whatYouDo === ctxBody.whatYouDo, 'context survives');
  logStep('6. Refresh persistence (profiles)', profilesAfterRefresh.json?.total === 2, `total=${profilesAfterRefresh.json?.total}`);
  logStep('6. Refresh persistence (offer)', offerAfterRefresh.json?.services?.length === 2, `services=${offerAfterRefresh.json?.services?.length}`);

  // ── 7. LOGOUT/LOGIN: brand-new session (new token) sees the same data ──
  tokenA = mintAccessToken(userA); // new login session
  const ctxAfterLogin = await api(tokenA, 'GET', '/api/settings/personal-context');
  const profilesAfterLogin = await api(tokenA, 'GET', '/api/business-profiles');
  const offerAfterLogin = await api(tokenA, 'GET', '/api/prospecting/offer-profile');
  logStep('7. Logout/login persistence (context)', ctxAfterLogin.json?.context?.goals === ctxBody.goals, 'context survives session change');
  logStep('7. Logout/login persistence (profiles)', profilesAfterLogin.json?.total === 2 && profilesAfterLogin.json?.profiles?.some(p => p.id === profileA.id), 'profiles survive');
  logStep('7. Logout/login persistence (offer)', offerAfterLogin.json?.services?.some(s => s.label === 'AI Receptionist'), 'offer survives');

  // ── 8. Verify the ACTUAL DB records (not only frontend state) ──
  const dbSettings = await db.userSettings.findUnique({ where: { userId: userA.id }, select: { personalContext: true, servicesOffered: true } });
  const dbProfiles = await db.businessProfile.findMany({ where: { userId: userA.id } });
  logStep('8. DB record verification (context)', JSON.parse(dbSettings.personalContext).whatYouDo === ctxBody.whatYouDo, 'DB row carries the context');
  logStep('8. DB record verification (offer)', JSON.parse(dbSettings.servicesOffered).length === 2, 'DB row carries the offer');
  logStep('8. DB record verification (profiles)', dbProfiles.length === 2 && dbProfiles.some(p => p.isDefault), `rows=${dbProfiles.length}`);

  // ── 9. Discovery with EXPLICIT saved profile override ──
  const discBody = {
    niche: 'dental clinics with online booking',
    city: 'Mumbai',
    source: 'ai_search',
    maxResults: 3,
    context: { mode: 'profile', profileId: profileA.id },
  };
  const discRes = await api(tokenA, 'POST', '/api/leads/discover', discBody);
  logStep('9. Discovery with explicit profile override', discRes.status === 202 && !!discRes.json?.jobId, `jobId=${discRes.json?.jobId}`);

  // ── 10. Verify discovery snapshot (full profileSnapshot on the job row) ──
  const jobRow = await db.discoveryJob.findUnique({ where: { id: discRes.json?.jobId } });
  const jobCtx = jobRow?.contextJson ? JSON.parse(jobRow.contextJson) : null;
  logStep('10. Discovery snapshot persisted', jobCtx?.mode === 'profile' && jobCtx?.profileId === profileA.id,
    `mode=${jobCtx?.mode} profileId=${String(jobCtx?.profileId).slice(-8)}`);
  const snap = jobCtx?.profileSnapshot ?? {};
  logStep('10. Snapshot carries full profile fields', snap.description === 'Automation software for dental clinics' && snap.preferredTone === 'professional',
    `description="${String(snap.description).slice(0, 40)}" tone=${snap.preferredTone} offers="${String(snap.offers).slice(0, 30)}"`);
  const snapshotBefore = JSON.stringify(snap);

  // ── 11. EDIT the saved profile ──
  const editRes = await api(tokenA, 'PUT', `/api/business-profiles/${profileA.id}`, {
    description: 'CHANGED DESCRIPTION — enterprise billing suite',
    offers: 'CHANGED — enterprise annual plan',
  });
  logStep('11. Edit profile A', editRes.status === 200 && editRes.json?.profile?.description?.startsWith('CHANGED'), 'PUT ok');

  // ── 12. Previous discovery snapshot did NOT silently change ──
  const jobRowAfter = await db.discoveryJob.findUnique({ where: { id: discRes.json?.jobId } });
  const snapshotAfter = JSON.stringify(JSON.parse(jobRowAfter.contextJson).profileSnapshot);
  logStep('12. Historical snapshot immutable', snapshotBefore === snapshotAfter, 'snapshot unchanged after profile edit');

  // ── 13. Select multiple leads ──
  // Pick two EXISTING leads with DIFFERENT business/niche/city so
  // personalization must differ; create them if none suitable exist.
  let leads = await db.lead.findMany({
    where: { userId: userA.id, niche: { not: null } },
    select: { id: true, businessName: true, niche: true, city: true, country: true, website: true, rating: true, reviews: true, notes: true, source: true, stage: true },
    take: 60,
  });
  // Prefer two leads with distinct niches.
  let lead1 = leads.find((l) => l.niche && l.city);
  let lead2 = leads.find((l) => l.niche && l.city && l.niche !== lead1?.niche);
  if (!lead1 || !lead2) {
    const mk = async (name, niche, city, extra) => db.lead.create({
      data: { userId: userA.id, businessName: name, niche, city, country: 'India', stage: 'discovered', source: 'e2e', ...extra },
    });
    lead1 = lead1 ?? (await mk('E2E Smile Dental Clinic', 'Dental', 'Mumbai', { rating: 4.8, reviews: '220 reviews', website: 'https://smiledental.example', notes: 'Wants appointment automation' }));
    lead2 = lead2 ?? (await mk('E2E Ayur Wellness Retreat', 'Ayurvedic Wellness', 'Kochi', { rating: 3.4, reviews: '45 reviews', website: 'https://ayurretreat.example', notes: 'Losing bookings to online portals' }));
  }
  logStep('13. Multiple leads selected', !!lead1 && !!lead2, `${lead1.businessName} (${lead1.niche}) + ${lead2.businessName} (${lead2.niche})`);

  // ── 14. Run ONE workflow execution over both leads ──
  // Create a temp workflow with a single ai_outreach step (real AI call).
  const wfDef = {
    name: `E2E Personalization ${Date.now()}`,
    description: 'Phases 16-17 verification',
    triggerType: 'manual',
    status: 'active',
    steps: [
      { id: 'node_outreach', type: 'ai_action', name: 'Personalized outreach',
        config: { actionType: 'ai_outreach', channel: 'email', tone: 'professional' } },
    ],
  };
  const wfCreate = await api(tokenA, 'POST', '/api/workflows', {
    name: wfDef.name, description: wfDef.description, triggerType: wfDef.triggerType,
    steps: [
      { type: 'ai_action', name: 'Personalized outreach',
        config: { actionType: 'ai_outreach', channel: 'email', tone: 'professional' }, order: 0 },
    ],
    status: 'active',
  });
  const workflowId = wfCreate.json?.workflow?.id ?? wfCreate.json?.id;
  logStep('14. Temp workflow created', !!workflowId, `id=${workflowId} (${wfCreate.status})`);

  const runKey = `e2e_p1117_${Date.now()}`;
  const runStartedAt = new Date();
  const preRunBalance = await balance(userA.id);
  const runRes = await api(tokenA, 'POST', `/api/workflows/${workflowId}/execute`, {
    target: { mode: 'selected_leads', leadIds: [lead1.id, lead2.id], runId: runKey },
    executionSettings: { profileId: profileA.id },
  });
  logStep('14. Execute ONE run over 2 leads', runRes.status === 202 && !!runRes.json?.executionId, `executionId=${String(runRes.json?.executionId).slice(-10)} status=${runRes.json?.status}`);

  const executionId = runRes.json?.executionId;
  const exec = await waitFor(executionId, (e) => TERMINAL(e?.status), 240000, 'workflow run');
  const leadItems = await db.workflowExecutionLead.findMany({ where: { executionId } });
  logStep('14. ONE execution with per-lead items', exec?.status === 'completed' && leadItems.length === 2,
    `status=${exec?.status} items=${leadItems.length} (${leadItems.map((i) => i.status).join(',')})`);

  // ── 15. Each lead received INDIVIDUALIZED outreach ──
  // Scoped to messages created by THIS run (>= runStartedAt).
  const outreachRows = await db.outreachMessage.findMany({
    where: { leadId: { in: [lead1.id, lead2.id] }, userId: userA.id, createdAt: { gte: runStartedAt } },
    orderBy: { createdAt: 'asc' },
  });
  const msg1 = outreachRows.find((m) => m.leadId === lead1.id);
  const msg2 = outreachRows.find((m) => m.leadId === lead2.id);
  logStep('15. Outreach generated for each lead', outreachRows.length === 2, `messages=${outreachRows.length} (one per lead)`);

  const m1 = (msg1?.content || '').toLowerCase();
  const m2 = (msg2?.content || '').toLowerCase();
  logStep('15. Lead 1 content references ITS data', /dental|mumbai|smile|appoint|clinic/.test(m1), `${m1.slice(0, 80).replace(/\n/g, ' ')}…`);
  logStep('15. Lead 2 content references ITS data', /ayur|wellness|kochi|retreat|booking/.test(m2), `${m2.slice(0, 80).replace(/\n/g, ' ')}…`);

  // ── 16. Different leads → MATERIALLY different personalization ──
  logStep('16. Materially different messages', msg1 && msg2 && msg1.content !== msg2.content,
    `identical=${msg1?.content === msg2?.content} len1=${msg1?.content?.length} len2=${msg2?.content?.length}`);

  // intelligenceConfig snapshot on the execution:
  const trig = exec?.triggerData ? JSON.parse(exec.triggerData) : {};
  logStep('16. intelligenceConfig snapshot on run', trig.intelligenceConfig?.profileId === profileA.id &&
    trig.intelligenceConfig?.profileSource === 'execution-setting',
    `profile=${String(trig.intelligenceConfig?.profileId).slice(-8)} source=${trig.intelligenceConfig?.profileSource}`);

  // ── 17. Retry/idempotency: replay the SAME runId ──
  const replayRes = await api(tokenA, 'POST', `/api/workflows/${workflowId}/execute`, {
    target: { mode: 'selected_leads', leadIds: [lead1.id, lead2.id], runId: runKey },
    executionSettings: { profileId: profileA.id },
  });
  const replayExecutionId = replayRes.json?.executionId;
  const replayItems = await db.workflowExecutionLead.findMany({ where: { executionId: replayExecutionId } });
  const outreachCountAfterReplay = await db.outreachMessage.count({
    where: { leadId: { in: [lead1.id, lead2.id] }, userId: userA.id, createdAt: { gte: runStartedAt } },
  });
  logStep('17. Replay collapses to SAME execution', replayExecutionId === executionId && replayItems.length === 2,
    `sameExecution=${replayExecutionId === executionId}`);
  logStep('17. No duplicate outreach on replay', outreachCountAfterReplay === outreachRows.length,
    `messages=${outreachCountAfterReplay} (was ${outreachRows.length})`);

  // ── 18. Exactly 5 credits for the successful execution ──
  // Scoped to THIS run's charge key (wfexec-run:<runKey>) and THIS run's
  // time window — prior runs' ledger rows can never contaminate the check.
  const postRunBalance = await balance(userA.id);
  const runCharges = await db.creditsLedger.findMany({
    where: { userId: userA.id, action: { contains: `wfexec-run:${runKey}` } },
    orderBy: { createdAt: 'asc' },
  });
  const workflowCharges = runCharges.filter((r) => r.credits < 0);
  const discoveryBetween = await db.creditsLedger.count({
    where: { userId: userA.id, action: { startsWith: 'lead_discovery' }, createdAt: { gte: runStartedAt } },
  });
  const expected = preRunBalance - 5 - discoveryBetween; // discovery imports cost 1 credit/lead (pre-existing rule)
  logStep('18. Exactly 5 credits for the run', postRunBalance === expected,
    `balance ${preRunBalance} → ${postRunBalance} (expected ${expected}: -5 run -${discoveryBetween} discovery-in-window)`);
  logStep('18. One workflow charge in ledger', workflowCharges.length === 1 && workflowCharges.reduce((a, r) => a + Math.abs(r.credits), 0) === 5,
    `charges=${workflowCharges.length} total=${workflowCharges.reduce((a, r) => a + Math.abs(r.credits), 0)} credits (2 leads = one flat fee, not 10)`);

  // ── 19. User B CANNOT access User A's profiles/context/offers ──
  const bProfile = await api(tokenB, 'GET', `/api/business-profiles/${profileA.id}`);
  logStep('19. B GET A-profile → 404', bProfile.status === 404, `status=${bProfile.status}`);
  const bProfilePut = await api(tokenB, 'PUT', `/api/business-profiles/${profileA.id}`, { name: 'HACKED' });
  logStep('19. B PUT A-profile → 404', bProfilePut.status === 404, `status=${bProfilePut.status}`);
  const bProfileDelete = await api(tokenB, 'DELETE', `/api/business-profiles/${profileA.id}`);
  logStep('19. B DELETE A-profile → 404', bProfileDelete.status === 404, `status=${bProfileDelete.status}`);
  const bCtx = await api(tokenB, 'GET', '/api/settings/personal-context');
  logStep('19. B context isolated', bCtx.status === 200 && !bCtx.json?.context?.whatYouDo, `context empty for B=${!bCtx.json?.context?.whatYouDo}`);
  const bOffer = await api(tokenB, 'GET', '/api/prospecting/offer-profile');
  logStep('19. B offer isolated', bOffer.status === 200 && (bOffer.json?.services || []).length === 0, `services=${(bOffer.json?.services || []).length}`);
  const bDiscover = await api(tokenB, 'POST', '/api/leads/discover', {
    niche: 'test', source: 'ai_search', context: { mode: 'profile', profileId: profileA.id },
  });
  logStep('19. B discovery w/ A profileId → 400', bDiscover.status === 400, `status=${bDiscover.status}`);

  // A's profile unchanged by all B attempts:
  const profileAFinal = await db.businessProfile.findUnique({ where: { id: profileA.id } });
  logStep('19. A-profile intact after B probes', profileAFinal.name === profileABody.name, `name="${profileAFinal.name}"`);

  // ── Cleanup: delete temp workflow + e2e leads + profiles + outreach drafts ──
  console.log('\n── Cleanup ──');
  try {
    if (workflowId) { await api(tokenA, 'DELETE', `/api/workflows/${workflowId}`); console.log('temp workflow deleted'); }
    await db.businessProfile.deleteMany({ where: { userId: userA.id, id: { in: [profileA.id, profileB.id] } } });
    console.log('temp profiles deleted (2)');
    await db.lead.deleteMany({ where: { userId: userA.id, businessName: { in: ['E2E Smile Dental Clinic', 'E2E Ayur Wellness Retreat'] } } });
    console.log('temp leads deleted (if created)');
    // Outreach drafts generated by THIS E2E run (both leads):
    const e2eMessageIds = outreachRows.map((m) => m.id);
    if (e2eMessageIds.length > 0) {
      await db.outreachMessage.deleteMany({ where: { id: { in: e2eMessageIds } } });
      console.log(`temp outreach drafts deleted (${e2eMessageIds.length})`);
    }
  } catch (e) {
    console.log('cleanup partial:', e.message);
  }

  console.log(`\nFinal balance: ${postRunBalance} (started ${startBalance})`);
  await db.$disconnect();
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
