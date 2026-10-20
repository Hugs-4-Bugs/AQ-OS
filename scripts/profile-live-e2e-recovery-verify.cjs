#!/usr/bin/env node
/**
 * Live Profile E2E — post-recovery regression verification (read-mostly).
 * Verifies the recovered Profile persistence (My Context / My Offer /
 * Business Profiles) works end-to-end against the LIVE dev server.
 *
 * Conventions (same as scripts/auth-password-e2e.cjs):
 *   - ONE clearly-labeled QA user, additive only, never deleted.
 *   - Random password generated in-process, NEVER printed.
 *   - DB counts reported before/after.
 *   - No credential values of any kind are printed.
 */
const { PrismaClient } = require('/home/z/my-project/node_modules/@prisma/client');
const bcrypt = require('/home/z/my-project/node_modules/bcryptjs');
const crypto = require('crypto');

const BASE = 'http://localhost:3000';
const EMAIL = 'profile-e2e-recovery-20261020@acquisitionos.test';
const NAME = 'Profile Recovery E2E QA User';

const CTX = {
  whatYouDo: 'Recovery verification QA — tests personal context persistence',
  business: 'AcquisitionOS QA Sandbox',
  services: 'verification, regression testing',
  goals: 'prove Profile persistence survived the workspace recovery',
};

const SERVICES = [
  { id: 'offer_e2e_1', label: 'QA Verification Service A', category: 'general', description: 'recovery e2e service one' },
  { id: 'offer_e2e_2', label: 'QA Verification Service B', category: 'qa', description: 'recovery e2e service two' },
];

let pass = 0, fail = 0;
const check = (name, ok, detail) => {
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name}${detail ? ' — ' + detail : ''}`);
  ok ? pass++ : fail++;
};

async function main() {
  const db = new PrismaClient();
  const before = {
    users: await db.user.count(),
    bps: await db.businessProfile.count(),
  };

  // 1. Create (or reuse) the clearly-labeled QA user — additive only
  const password = crypto.randomBytes(12).toString('base64url') + 'Aa1!';
  const hash = await bcrypt.hash(password, 12);
  const existing = await db.user.findUnique({ where: { email: EMAIL } });
  if (existing) {
    await db.user.update({ where: { email: EMAIL }, data: { passwordHash: hash, emailVerified: true } });
    console.log(`QA user reused (password reset in place): ${EMAIL}`);
  } else {
    await db.user.create({ data: { email: EMAIL, name: NAME, passwordHash: hash, role: 'owner', plan: 'free', emailVerified: true } });
    console.log(`QA user created: ${EMAIL} (clearly-labeled test account)`);
  }

  const post = async (path, body, cookies) => {
    const res = await fetch(BASE + path, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...(cookies ? { cookie: cookies } : {}) },
      body: JSON.stringify(body),
    });
    const jar = {};
    for (const sc of (res.headers.getSetCookie ? res.headers.getSetCookie() : [])) {
      const m = sc.match(/^([^=]+)=([^;]*)/); if (m) jar[m[1]] = m[2];
    }
    let json = null; try { json = await res.json(); } catch {}
    return { status: res.status, json, jar };
  };
  const put = async (path, body, cookies) => {
    const res = await fetch(BASE + path, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', ...(cookies ? { cookie: cookies } : {}) },
      body: JSON.stringify(body),
    });
    let json = null; try { json = await res.json(); } catch {}
    return { status: res.status, json };
  };
  const get = async (path, cookies) => {
    const res = await fetch(BASE + path, { headers: cookies ? { cookie: cookies } : {} });
    let json = null; try { json = await res.json(); } catch {}
    return { status: res.status, json };
  };
  const jarHeader = (jar) => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');

  // 2. Sign in (real email/password path)
  const signin = await post('/api/auth/signin', { email: EMAIL, password });
  check('signin (email/password, live)', signin.status === 200, `HTTP ${signin.status}`);
  const cookies = jarHeader(signin.jar);

  // 3. My Context round-trip
  const ctx0 = await get('/api/settings/personal-context', cookies);
  check('GET personal-context (baseline)', ctx0.status === 200, `HTTP ${ctx0.status}`);
  const putCtx = await put('/api/settings/personal-context', CTX, cookies);
  check('PUT personal-context', putCtx.status === 200, `HTTP ${putCtx.status}${putCtx.json?.errors ? ' errors=' + JSON.stringify(putCtx.json.errors) : ''}`);
  const ctx1 = await get('/api/settings/personal-context', cookies);
  const ctxOk = ctx1.status === 200 && ctx1.json?.context?.whatYouDo === CTX.whatYouDo && ctx1.json?.context?.goals === CTX.goals;
  check('GET personal-context persists saved values', ctxOk, ctxOk ? 'whatYouDo+goals round-trip verified' : `got: ${JSON.stringify(ctx1.json?.context || {}).slice(0, 120)}`);

  // 4. My Offer round-trip
  const off0 = await get('/api/prospecting/offer-profile', cookies);
  check('GET offer-profile (baseline)', off0.status === 200, `HTTP ${off0.status}`);
  const putOff = await put('/api/prospecting/offer-profile', { services: SERVICES }, cookies);
  check('PUT offer-profile', putOff.status === 200, `HTTP ${putOff.status}`);
  const off1 = await get('/api/prospecting/offer-profile', cookies);
  const offOk = off1.status === 200 && Array.isArray(off1.json?.services) && off1.json.services.length === 2 &&
    off1.json.services[0].label === SERVICES[0].label && off1.json.services[1].label === SERVICES[1].label;
  check('GET offer-profile persists 2 services', offOk, offOk ? 'both labels round-trip verified' : `got ${JSON.stringify(off1.json?.services || []).slice(0, 120)}`);

  // 5. Business Profiles round-trip (free plan → limit 1 active)
  const bp0 = await get('/api/business-profiles', cookies);
  check('GET business-profiles (baseline empty)', bp0.status === 200 && bp0.json?.total === 0, `HTTP ${bp0.status} total=${bp0.json?.total}`);
  const bpName = 'QA Recovery Verify Profile';
  const bpPost = await post('/api/business-profiles', { name: bpName, industry: 'software', city: 'Pune', country: 'India' }, cookies);
  check('POST business-profiles (create)', bpPost.status >= 200 && bpPost.status < 300, `HTTP ${bpPost.status}`);
  const bp1 = await get('/api/business-profiles', cookies);
  const bpOk = bp1.status === 200 && bp1.json?.total === 1 && bp1.json?.profiles?.[0]?.name === bpName && bp1.json?.profiles?.[0]?.userId;
  check('GET business-profiles lists created profile (user-scoped)', bpOk, `total=${bp1.json?.total} activeCount=${bp1.json?.activeCount} planLimit=${bp1.json?.planLimit}`);

  // 6. Cross-session persistence (the core of the Profile persistence task)
  const so = await post('/api/auth/signout', {}, cookies);
  check('signout', so.status >= 200 && so.status < 300, `HTTP ${so.status}`);
  const signin2 = await post('/api/auth/signin', { email: EMAIL, password });
  check('signin again (fresh session)', signin2.status === 200, `HTTP ${signin2.status}`);
  const cookies2 = jarHeader(signin2.jar);
  const ctx2 = await get('/api/settings/personal-context', cookies2);
  const ctxPersist = ctx2.status === 200 && ctx2.json?.context?.whatYouDo === CTX.whatYouDo;
  check('personal-context persists ACROSS sessions', ctxPersist, ctxPersist ? 'value identical after logout/login' : 'VALUE LOST');
  const off2 = await get('/api/prospecting/offer-profile', cookies2);
  const offPersist = off2.status === 200 && off2.json?.services?.length === 2;
  check('offer-profile persists ACROSS sessions', offPersist, offPersist ? '2 services identical after logout/login' : 'VALUE LOST');
  const bp2 = await get('/api/business-profiles', cookies2);
  const bpPersist = bp2.status === 200 && bp2.json?.total === 1 && bp2.json?.profiles?.[0]?.name === bpName;
  check('business-profile persists ACROSS sessions', bpPersist, bpPersist ? 'profile identical after logout/login' : 'VALUE LOST');

  // 7. DB safety — additive only
  const after = {
    users: await db.user.count(),
    bps: await db.businessProfile.count(),
  };
  const userDelta = after.users - before.users;
  const bpDelta = after.bps - before.bps;
  check('DB additive-only safety',
    (userDelta === 0 || userDelta === 1) && (bpDelta === 0 || bpDelta === 1),
    `users ${before.users}->${after.users} (delta ${userDelta}${existing ? ' reused' : ' new QA user'}), businessProfiles ${before.bps}->${after.bps} (delta ${bpDelta} QA profile)`);

  await db.$disconnect();
  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}
main().catch(e => { console.error('E2E error:', e.message); process.exit(1); });
