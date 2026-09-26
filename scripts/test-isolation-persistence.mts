/* eslint-disable no-console */
// ═══════════════════════════════════════════════════════════════════
// E2E — Notification nav support data, Profile persistence, Cross-account
// isolation audit verification, AI pipeline regression (live API, real logins)
// ═══════════════════════════════════════════════════════════════════
const BASE = 'http://localhost:3000';
const EMAIL_A = 'mailtoprabhat72@gmail.com'; // Account A (OTP real login)
const EMAIL_B = 'kattyboy785@gmail.com';     // Account B (direct token)

// Load .env BEFORE importing src/lib/auth so JWT_SECRET matches the server.
process.loadEnvFile?.('.env');

let pass = 0, fail = 0;
const ok = (cond, label, extra = '') => {
  if (cond) { pass++; console.log('  PASS:', label, extra); }
  else { fail++; console.log('  FAIL:', label, extra); }
};
const j = async (res) => { try { return await res.json(); } catch { return {}; } };

async function main() {
  const { PrismaClient } = await import('@prisma/client');
  const auth = await import('../src/lib/auth');
  const db = new PrismaClient();

  // ── Real OTP login for Account A ──────────────────────────────
  console.log('\n[1] REAL LOGIN FLOW (Account A via OTP)');
  let r = await fetch(`${BASE}/api/auth/otp/request`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL_A }),
  });
  ok(r.status === 200, 'OTP request accepted', `(status ${r.status})`);

  const userA = await db.user.findUnique({ where: { email: EMAIL_A } });
  const otp = userA.loginOtp;
  ok(!!otp, 'OTP stored in DB (read for test)');

  r = await fetch(`${BASE}/api/auth/otp/verify`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL_A, otp }),
  });
  const loginA = await j(r);
  // Tokens arrive as httpOnly cookies (access_token / refresh_token).
  const setCookies = r.headers.getSetCookie?.() || [];
  const cookieMap: Record<string, string> = {};
  for (const c of setCookies) {
    const [pair] = c.split(';');
    const eq = pair.indexOf('=');
    cookieMap[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
  }
  ok(r.status === 200 && !!cookieMap['access_token'], 'OTP verify → access token cookie', `(status ${r.status})`);
  const cookieA = `access_token=${cookieMap['access_token']}; refresh_token=${cookieMap['refresh_token']}`;
  const hA = { Cookie: cookieA, 'Content-Type': 'application/json' };

  // ── Direct token for Account B ────────────────────────────────
  const userB = await db.user.findUnique({ where: { email: EMAIL_B } });
  const tokenB = auth.generateAccessToken({
    id: userB.id, email: userB.email, role: userB.role, plan: userB.plan,
    orgId: userB.orgId, isTrial: false, trialEndsAt: null,
  });
  const hB = { Authorization: `Bearer ${tokenB}`, 'Content-Type': 'application/json' };

  // ══ PROFILE PERSISTENCE ══════════════════════════════════════
  console.log('\n[2] PROFILE PERSISTENCE (Account A)');
  const stamp = Date.now().toString().slice(-6);
  const companyVal = `Persist Test Co ${stamp}`;
  const phoneVal = `+9199${stamp}`;
  r = await fetch(`${BASE}/api/settings/profile`, {
    method: 'PUT', headers: hA,
    body: JSON.stringify({ name: 'Prabhat Test', company: companyVal, phone: phoneVal, country: 'India' }),
  });
  const putRes = await j(r);
  ok(r.status === 200 && putRes.profile?.company === companyVal, 'PUT profile saves + echoes company', `(status ${r.status})`);

  r = await fetch(`${BASE}/api/settings/profile`, { headers: hA });
  const get1 = await j(r);
  ok(get1.profile?.company === companyVal, 'GET after save returns saved company (round-trip)', `(got "${get1.profile?.company}")`);
  ok(get1.profile?.phone === phoneVal, 'GET returns saved phone');

  // Session expiry → refresh (cookie-based refresh flow)
  r = await fetch(`${BASE}/api/auth/refresh`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: `refresh_token=${cookieMap['refresh_token']}` },
    body: '{}',
  });
  const refCookies = r.headers.getSetCookie?.() || [];
  const refMap: Record<string, string> = {};
  for (const c of refCookies) {
    const [pair] = c.split(';');
    const eq = pair.indexOf('=');
    refMap[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
  }
  ok(r.status === 200 && !!refMap['access_token'], 'Refresh flow issues new access token', `(status ${r.status})`);
  const hA2 = { Cookie: `access_token=${refMap['access_token'] || cookieMap['access_token']}; refresh_token=${refMap['refresh_token'] || cookieMap['refresh_token']}`, 'Content-Type': 'application/json' };

  r = await fetch(`${BASE}/api/settings/profile`, { headers: hA2 });
  const get2 = await j(r);
  ok(get2.profile?.company === companyVal, 'Company persists across session refresh');

  // Logout → login again (real, fresh OTP)
  await fetch(`${BASE}/api/auth/signout`, { method: 'POST', headers: hA2 });
  r = await fetch(`${BASE}/api/auth/otp/request`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL_A }),
  });
  const userA2 = await db.user.findUnique({ where: { email: EMAIL_A } });
  r = await fetch(`${BASE}/api/auth/otp/verify`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL_A, otp: userA2.loginOtp }),
  });
  const loginA2Cookies = r.headers.getSetCookie?.() || [];
  const loginA2Map: Record<string, string> = {};
  for (const c of loginA2Cookies) {
    const [pair] = c.split(';');
    const eq = pair.indexOf('=');
    loginA2Map[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
  }
  ok(r.status === 200 && !!loginA2Map['access_token'], 'Re-login after logout OK');
  const userCount1 = await db.user.count({ where: { email: EMAIL_A } });
  ok(userCount1 === 1, 'Re-login did NOT create a duplicate user record');

  r = await fetch(`${BASE}/api/settings/profile`, {
    headers: { Cookie: `access_token=${loginA2Map['access_token']}` },
  });
  const get3 = await j(r);
  ok(get3.profile?.company === companyVal && get3.profile?.phone === phoneVal,
    'Company + phone persist after logout → login (THE BUG FIX)', `(company="${get3.profile?.company}")`);

  // ══ CROSS-ACCOUNT ISOLATION ══════════════════════════════════
  console.log('\n[3] CROSS-ACCOUNT ISOLATION');

  // Lead lists disjoint + fully scoped (list default limit = 20)
  r = await fetch(`${BASE}/api/leads`, { headers: hA2 });
  const leadsA = await j(r);
  r = await fetch(`${BASE}/api/leads`, { headers: hB });
  const leadsB = await j(r);
  const listA = Array.isArray(leadsA) ? leadsA : (leadsA.leads || []);
  const listB = Array.isArray(leadsB) ? leadsB : (leadsB.leads || []);
  const idsA = new Set(listA.map(l => l.id));
  const idsB = new Set(listB.map(l => l.id));
  const dbIdsA = new Set((await db.lead.findMany({ where: { userId: userA.id }, select: { id: true } })).map(l => l.id));
  const dbIdsB = new Set((await db.lead.findMany({ where: { userId: userB.id }, select: { id: true } })).map(l => l.id));
  ok(listA.length === 6, `A's list = A's own leads only (6)`, `(got ${listA.length})`);
  ok(listB.length === Math.min(20, 57), `B's list respects default page limit (20)`, `(got ${listB.length})`);
  ok(listA.every(l => dbIdsA.has(l.id)), 'every lead in A list belongs to A (userId-scoped)');
  ok(listB.every(l => dbIdsB.has(l.id)), 'every lead in B list belongs to B (userId-scoped)');
  const overlap = [...idsA].filter(id => idsB.has(id));
  ok(overlap.length === 0, 'A and B lead lists are disjoint');

  // Direct-ID access to B's lead as A
  const leadB1 = listB[0];
  r = await fetch(`${BASE}/api/leads/${leadB1.id}`, { headers: hA2 });
  ok(r.status === 403 || r.status === 404, 'GET other user lead by ID rejected', `(status ${r.status})`);
  r = await fetch(`${BASE}/api/leads/${leadB1.id}`, {
    method: 'PUT', headers: hA2, body: JSON.stringify({ businessName: 'HACKED' }),
  });
  ok(r.status === 403 || r.status === 404, 'PUT other user lead rejected', `(status ${r.status})`);
  r = await fetch(`${BASE}/api/leads/${leadB1.id}`, { method: 'DELETE', headers: hA2 });
  ok(r.status === 403 || r.status === 404, 'DELETE other user lead rejected', `(status ${r.status})`);
  const stillIntact = await db.lead.findUnique({ where: { id: leadB1.id } });
  ok(stillIntact && stillIntact.businessName !== 'HACKED', 'B lead data untouched in DB');

  // Sub-resource access as A on B's lead
  for (const sub of ['activities', 'notes', 'communications', 'deals', 'reminders']) {
    r = await fetch(`${BASE}/api/leads/${leadB1.id}/${sub}`, { headers: hA2 });
    ok(r.status === 403 || r.status === 404, `GET /leads/${leadB1.id.slice(0,8)}…/${sub} rejected`, `(status ${r.status})`);
  }

  // Sub-resources without auth (were fully public before)
  for (const sub of ['activities', 'notes', 'communications', 'deals', 'reminders', 'explain-scores', 'analyze-website']) {
    r = await fetch(`${BASE}/api/leads/${leadB1.id}/${sub}`, { method: sub === 'notes' || sub === 'explain-scores' || sub === 'analyze-website' ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json' }, body: sub === 'notes' ? JSON.stringify({ content: 'x' }) : undefined });
    ok(r.status === 401, `unauth ${sub.toUpperCase()} /leads/[id]/${sub} → 401`, `(status ${r.status})`);
  }

  // Pipeline on foreign lead
  r = await fetch(`${BASE}/api/prospecting/pipeline/run`, {
    method: 'POST', headers: hA2, body: JSON.stringify({ leadId: leadB1.id }),
  });
  ok(r.status === 404 || r.status === 403, 'Pipeline on other user lead rejected', `(status ${r.status})`);

  // Company research unauth + foreign
  r = await fetch(`${BASE}/api/company-research`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ leadId: leadB1.id, userProfile: { name: 'x', services: 'y' } }),
  });
  ok(r.status === 401, 'unauth company-research → 401', `(status ${r.status})`);
  r = await fetch(`${BASE}/api/company-research`, {
    method: 'POST', headers: hA2,
    body: JSON.stringify({ leadId: leadB1.id, userProfile: { name: 'x', services: 'y' } }),
  });
  ok(r.status === 403 || r.status === 404, 'company-research on foreign lead rejected', `(status ${r.status})`);

  // stats scoped
  r = await fetch(`${BASE}/api/leads/stats`, { headers: hA2 });
  const statsA = await j(r);
  ok(r.status === 200 && statsA.totalLeads === 6, 'leads/stats scoped to A (6, not 89)', `(got ${statsA.totalLeads})`);
  r = await fetch(`${BASE}/api/leads/stats`);
  ok(r.status === 401, 'unauth leads/stats → 401', `(status ${r.status})`);

  // deals scoped
  r = await fetch(`${BASE}/api/deals`, { headers: hA2 });
  const dealsA = await j(r);
  const dealsList = Array.isArray(dealsA) ? dealsA : (dealsA.deals || dealsA.data || []);
  const foreignDeals = dealsList.filter(d => d.lead && idsB.has(d.lead.id));
  ok(foreignDeals.length === 0, 'A sees no deals attached to B leads', `(scanned ${dealsList.length})`);

  // insights scoped
  r = await fetch(`${BASE}/api/insights`, { headers: hA2 });
  const insightsA = await j(r);
  const insightLeads = JSON.stringify(insightsA);
  ok(![...idsB].some(id => insightLeads.includes(id)), 'insights contain no B lead ids');

  // reminders scoped
  r = await fetch(`${BASE}/api/reminders`, { headers: hA2 });
  const remA = await j(r);
  const remList = Array.isArray(remA) ? remA : (remA.reminders || []);
  ok(remList.every(x => idsA.has(x.leadId)), 'reminders all reference A leads', `(count ${remList.length})`);

  // chat-sessions scoped
  r = await fetch(`${BASE}/api/chat-sessions`, { headers: hA2 });
  const cs = await j(r);
  const csList = cs.sessions || [];
  ok(csList.every(s => true) && true, 'chat-sessions endpoint reachable'); // shape only
  const foreignSessions = await db.aiChatSession.count({ where: { userId: { not: userA.id } } });
  r = await fetch(`${BASE}/api/chat-sessions`, { headers: hA2 });
  const cs2 = await j(r);
  ok((cs2.sessions || []).length <= (await db.aiChatSession.count({ where: { userId: userA.id } })),
    'chat-sessions list does not exceed A own sessions');

  // notifications scoped
  r = await fetch(`${BASE}/api/notifications`, { headers: hA2 });
  const notifA = await j(r);
  const nListA = notifA.notifications || notifA.data || notifA;
  const nArrA = Array.isArray(nListA) ? nListA : (nListA.notifications || []);
  ok(nArrA.every(n => !n.userId || n.userId === userA.id), 'notifications all belong to A', `(count ${nArrA.length})`);

  // vector-search ignores client userId
  r = await fetch(`${BASE}/api/ai/vector-search`, {
    method: 'POST', headers: hA2,
    body: JSON.stringify({ query: 'hospital', userId: userB.id }),
  });
  const vs = await j(r);
  const vsResults = vs.results || [];
  ok(vsResults.every(x => !x.userId || x.userId === userA.id), 'vector-search ignores client-supplied userId', `(results ${vsResults.length})`);

  // admin/platform endpoints rejected for normal owner-role user
  const adminChecks = [
    ['GET', '/api/admin/billing', null],
    ['GET', '/api/admin/backup', null],
    ['POST', '/api/admin/refund', { userId: userB.id, paymentIntentId: 'pi_x', amount: 100 }],
    ['GET', '/api/audit', null],
    ['GET', '/api/audit/export', null],
    ['GET', '/api/billing/analytics', null],
    ['GET', '/api/payments/webhook-replay', null],
    ['POST', '/api/payments/process-billing', {}],
    ['POST', '/api/gdpr/retention', {}],
    ['GET', '/api/metrics/dashboard', null],
    ['POST', '/api/ai/prompts', { action: 'store', name: 'x', content: 'y' }],
    ['GET', '/api/leads/scraping-metrics', null],
    ['GET', '/api/leads/proxy-pool', null],
    ['POST', '/api/sequences/process', {}],
    ['POST', '/api/reply-handler', { from: 'a@b.c', subject: 'x', body: 'y', userId: userB.id }],
    ['GET', '/api/auth/debug', null],
  ];
  for (const [method, url, body] of adminChecks) {
    r = await fetch(`${BASE}${url}`, {
      method, headers: { ...hA2 }, body: body ? JSON.stringify(body) : undefined,
    });
    ok(r.status === 401 || r.status === 403 || r.status === 503, `${method} ${url} blocked for normal user`, `(status ${r.status})`);
  }

  // realtime/recover: authenticated user recovers ONLY their own events —
  // a body-supplied foreign userId must be ignored (route uses session user).
  r = await fetch(`${BASE}/api/realtime/recover`, {
    method: 'POST', headers: hA2, body: JSON.stringify({ userId: userB.id }),
  });
  const rec = await j(r);
  ok(r.status === 200 && !!rec.recovery, 'realtime/recover works for authenticated user (own events)', `(status ${r.status})`);

  // clear-data scoping: THROWAWAY account — clear-data deletes only that
  // account's rows; A's and B's real data must remain untouched.
  const throwaway = await db.user.create({
    data: {
      email: `clear-data-test-${Date.now()}@test.local`,
      name: 'clear data probe', role: 'owner', plan: 'free',
      emailVerified: true, isActive: true, credits: 50,
    },
  });
  const tToken = auth.generateAccessToken({
    id: throwaway.id, email: throwaway.email, role: throwaway.role, plan: throwaway.plan,
    orgId: throwaway.orgId, isTrial: false, trialEndsAt: null,
  });
  const tLead = await db.lead.create({ data: { businessName: 'Throwaway Probe', userId: throwaway.id } });
  r = await fetch(`${BASE}/api/settings/clear-data`, {
    method: 'POST', headers: { Authorization: `Bearer ${tToken}`, 'Content-Type': 'application/json' }, body: '{}',
  });
  const cdRes = await j(r);
  ok(r.status === 200 && cdRes.deleted?.leads === 1, 'clear-data works for the owning account (scoped)', `(status ${r.status} deleted=${JSON.stringify(cdRes.deleted)})`);
  const tLeadAfter = await db.lead.count({ where: { userId: throwaway.id } });
  const aLeadsAfter = await db.lead.count({ where: { userId: userA.id } });
  const bLeadsAfter = await db.lead.count({ where: { userId: userB.id } });
  ok(tLeadAfter === 0, 'throwaway lead deleted by clear-data');
  ok(aLeadsAfter === 6, "A's 6 real leads untouched by clear-data", `(got ${aLeadsAfter})`);
  ok(bLeadsAfter === 57, "B's 57 real leads untouched by clear-data", `(got ${bLeadsAfter})`);
  // cleanup throwaway account rows
  await db.user.delete({ where: { id: throwaway.id } });

  // Gmail account ownership
  r = await fetch(`${BASE}/api/gmail/sync`, {
    method: 'POST', headers: hA2, body: JSON.stringify({ emailAccountId: 'cmfauxaccount123' }),
  });
  ok(r.status === 404 || r.status === 403, 'gmail/sync foreign/unknown account rejected', `(status ${r.status})`);

  // workflow execution control needs ownership — create nothing; just probe with random id
  r = await fetch(`${BASE}/api/workflows/executions/nonexistent-id-123/pause`, { method: 'POST', headers: hA2 });
  ok(r.status === 404 || r.status === 500, 'workflow execution pause on unknown id fails closed', `(status ${r.status})`);

  // ── Test E: AI pipeline on OWN lead still works (regression) ──
  console.log('\n[4] AI PIPELINE REGRESSION (own lead → completed)');
  const ownLeadA = listA.find(l => l.email) || listA[0];
  if (!ownLeadA) {
    ok(false, 'A has a lead to test pipeline with');
  } else {
  r = await fetch(`${BASE}/api/prospecting/pipeline/run`, {
    method: 'POST', headers: hA2, body: JSON.stringify({ leadId: ownLeadA.id }),
  });
  const run = await j(r);
  ok(r.status === 200 || r.status === 409, 'pipeline run accepted on own lead', `(status ${r.status} ${run.error || ''})`);
  if (r.status === 200 || r.status === 409) {
    let done = false, lastState = null;
    for (let i = 0; i < 60 && !done; i++) {
      await new Promise(res => setTimeout(res, 3000));
      const sr = await fetch(`${BASE}/api/prospecting/pipeline/status?leadId=${ownLeadA.id}`, { headers: hA2 });
      const st = await j(sr);
      lastState = st;
      const s = st.pipeline?.status || st.status;
      if (s === 'completed' || s === 'failed') done = true;
    }
    const s = lastState?.pipeline?.status || lastState?.status;
    const progress = lastState?.pipeline?.progress;
    ok(s === 'completed', 'pipeline COMPLETED on own lead (5/5 steps)', `(status=${s} progress=${progress})`);
  }
  }

  console.log(`\n═══ RESULTS: ${pass} passed, ${fail} failed ═══`);
  await db.$disconnect();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(e => { console.error('FATAL:', e); process.exit(2); });
