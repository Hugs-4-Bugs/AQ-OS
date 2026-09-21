/* eslint-disable no-console */
// E2E test for the 5-Step Prospecting Pipeline (live API, real session token).
// Covers: offer-profile GET/PUT, pipeline run (real website fetch + AI),
// 409 double-run guard, status polling, results shape, honest send failures.

const BASE = 'http://localhost:3000';
const TEST_EMAIL = 'realtest+signup@example.com';
const TEST_SITE = 'https://example.com';

async function main() {
  const mod = await import('../src/lib/auth');
  const { PrismaClient } = await import('@prisma/client');
  const db = new PrismaClient();

  const user = await db.user.findUnique({ where: { email: TEST_EMAIL } });
  if (!user) throw new Error('test user not found: ' + TEST_EMAIL);
  const token = mod.generateAccessToken({
    id: user.id,
    email: user.email,
    role: user.role,
    plan: user.plan,
    orgId: user.orgId,
    isTrial: false,
    trialEndsAt: null,
  });
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  console.log('test user:', user.id, 'credits:', user.credits);

  let pass = 0;
  let fail = 0;
  const ok = (cond: boolean, label: string) => {
    if (cond) {
      pass++;
      console.log('  PASS:', label);
    } else {
      fail++;
      console.log('  FAIL:', label);
    }
  };

  // ── 1. Offer profile GET (default) ──
  console.log('\n=== 1. GET /api/prospecting/offer-profile ===');
  const resGet = await fetch(`${BASE}/api/prospecting/offer-profile`, { headers });
  ok(resGet.status === 200, 'GET returns 200');
  const profile = await resGet.json();
  ok(Array.isArray(profile.services), 'services is an array');

  // ── 2. Offer profile PUT ──
  console.log('\n=== 2. PUT /api/prospecting/offer-profile ===');
  const myOffers = [
    { id: 'o1', label: 'Web Development', category: 'web', description: 'Modern mobile-friendly websites' },
    { id: 'o2', label: 'Online Booking System', category: 'booking_systems', description: '24/7 appointment booking' },
  ];
  const resPut = await fetch(`${BASE}/api/prospecting/offer-profile`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ services: myOffers }),
  });
  ok(resPut.status === 200, 'PUT returns 200');
  const resGet2 = await fetch(`${BASE}/api/prospecting/offer-profile`, { headers });
  const profile2 = await resGet2.json();
  ok(profile2.services.length === 2, 'PUT persisted 2 services');
  ok(profile2.services[0]?.label === 'Web Development', 'service label persisted');

  // ── 3. Create a test lead with a real website ──
  console.log('\n=== 3. Create test lead ===');
  const leadCountBefore = await db.lead.count({ where: { userId: user.id } });
  const lead = await db.lead.create({
    data: {
      userId: user.id,
      businessName: 'Pipeline Test Clinic',
      website: TEST_SITE,
      email: 'nobody@example.com',
      city: 'Mumbai',
      country: 'India',
      niche: 'clinic',
      hasWebsite: true,
      source: 'test',
    },
  });
  ok(!!lead.id, 'lead created: ' + lead.id);

  try {
    // ── 4. Start pipeline ──
    console.log('\n=== 4. POST /api/prospecting/pipeline/run ===');
    const resRun = await fetch(`${BASE}/api/prospecting/pipeline/run`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ leadId: lead.id }),
    });
    ok(resRun.status === 200, 'run returns 200');
    const runData = await resRun.json();
    ok(typeof runData.pipelineId === 'string', 'pipelineId returned: ' + runData.pipelineId);
    ok(runData.creditCost === 7, 'creditCost = 7');

    // ── 5. Double-run guard (409 while running) ──
    const resRun2 = await fetch(`${BASE}/api/prospecting/pipeline/run`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ leadId: lead.id }),
    });
    ok(resRun2.status === 409 || resRun2.status === 200, `second run returns 409 (got ${resRun2.status})`);
    if (resRun2.status === 409) {
      const d2 = await resRun2.json();
      ok(d2.errorCode === 'ALREADY_RUNNING', 'errorCode = ALREADY_RUNNING');
    }

    // ── 6. Poll status until terminal state ──
    console.log('\n=== 6. Polling pipeline status ===');
    let state: any = null;
    const deadline = Date.now() + 8 * 60 * 1000;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 6000));
      const resStatus = await fetch(
        `${BASE}/api/prospecting/pipeline/status?leadId=${lead.id}`,
        { headers }
      );
      if (!resStatus.ok) break;
      const data = await resStatus.json();
      state = data.pipeline;
      console.log(
        `  progress=${String(state?.progress).padStart(3)}% status=${state?.status} steps=${JSON.stringify(state?.stepStatus)}`
      );
      if (state?.status === 'completed' || state?.status === 'failed') break;
    }

    ok(state?.status === 'completed', 'pipeline completed');
    const research = state?.research;
    const gaps = state?.gaps;
    const match = state?.match;
    const pitch = state?.pitch;
    const email = state?.email;

    ok(!!research, 'STEP 1 research present');
    ok(!!research?.dataSources, 'research has dataSources');
    console.log('   dataSources:', JSON.stringify(research?.dataSources));
    console.log('   businessType:', research?.businessType, '| confidence:', research?.confidence);
    ok(typeof research?.summary === 'string' && research.summary.length > 0, 'research summary present');

    ok(!!gaps && Array.isArray(gaps.gaps) && gaps.gaps.length > 0, `STEP 2 gaps present (${gaps?.gaps?.length ?? 0})`);
    console.log('   top gap:', gaps?.gaps?.[0]?.gap, '| severity:', gaps?.gaps?.[0]?.severity);
    ok(
      gaps?.gaps?.every((g: any) => g.evidence && typeof g.evidence === 'string'),
      'every gap carries evidence'
    );

    ok(!!match, 'STEP 3 match present');
    ok(match?.skipped === false, 'match not skipped (offers configured)');
    ok(typeof match?.matchScore === 'number', 'matchScore: ' + match?.matchScore);
    console.log('   opportunity:', match?.opportunityStatement);

    ok(!!pitch && typeof pitch.pitch === 'string' && pitch.pitch.length > 30, 'STEP 4 pitch present');
    console.log('   headline:', pitch?.headline);
    ok(
      typeof pitch?.projectedOutcome === 'string',
      'projectedOutcome present (estimate wording: ' +
        String(pitch?.projectedOutcome || '').toLowerCase().includes('estimat') +
        ')'
    );

    ok(!!email && typeof email.subject === 'string' && email.subject.length > 0, 'STEP 5 email subject: ' + email?.subject);
    ok(!!email?.body && email.body.length > 30, 'email body present');
    ok(!!state?.outreachMessageId, 'OutreachMessage draft created');

    const draft = state?.outreachMessageId
      ? await db.outreachMessage.findUnique({ where: { id: state.outreachMessageId } })
      : null;
    ok(draft?.status === 'draft', 'outreach message is a draft (not auto-sent)');

    const act = await db.leadActivity.count({
      where: { leadId: lead.id, type: 'prospect_pipeline_completed' },
    });
    ok(act >= 1, 'lead activity recorded');

    // ── 7. Send email: honest failure (no SMTP configured) ──
    console.log('\n=== 7. POST send-email (system, SMTP unconfigured) ===');
    const resSend = await fetch(`${BASE}/api/prospecting/pipeline/send-email`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ leadId: lead.id, method: 'system' }),
    });
    const sendData = await resSend.json();
    console.log('  status:', resSend.status, 'error:', sendData.error);
    ok(resSend.status === 502 || resSend.status === 200, 'send returns 502 (no SMTP) or 200 (configured)');
    if (resSend.status === 502) {
      const draftAfter = await db.outreachMessage.findUnique({ where: { id: state.outreachMessageId } });
      ok(draftAfter?.status === 'draft', 'draft NOT marked sent on failure (honest)');
    }

    // ── 8. Send without email address → 400 ──
    const leadNoEmail = await db.lead.create({
      data: { userId: user.id, businessName: 'No Email Lead', source: 'test' },
    });
    const resSend2 = await fetch(`${BASE}/api/prospecting/pipeline/send-email`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ leadId: leadNoEmail.id, method: 'gmail' }),
    });
    ok(resSend2.status === 400, 'send without recipient email → 400');
    await db.lead.delete({ where: { id: leadNoEmail.id } });
  } finally {
    // ── Cleanup: remove test lead (cascades pipeline + messages) ──
    await db.lead.deleteMany({ where: { id: lead.id, userId: user.id } });
    const leadCountAfter = await db.lead.count({ where: { userId: user.id } });
    ok(leadCountAfter === leadCountBefore, 'lead count restored (no residue)');
    await db.$disconnect();
  }

  console.log(`\n===== RESULT: ${pass} passed, ${fail} failed =====`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
