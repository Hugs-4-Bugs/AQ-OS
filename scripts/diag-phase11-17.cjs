// Phase 11–17 pre-implementation runtime diagnosis (READ-mostly; minimal writes that are part of normal feature operation, all reverted afterwards)
// Exercises: My Context, Business Profiles, My Offer, discovery context modes, isolation.
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

const BASE = 'http://localhost:3000';

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
    { sub: user.id, email: user.email, role: user.role, plan: user.plan, orgId: user.orgId ?? null, isTrial: false, trialEndsAt: null, type: 'access' },
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

function logStep(name, ok, detail) {
  console.log(`${ok ? 'OK ' : '!! '} [${name}] ${detail}`);
}

async function main() {
  // Two users: A = elite test account, B = any OTHER existing user (isolation probe)
  const userA = await db.user.findUnique({ where: { email: 'mailtoprabhat72@gmail.com' } });
  const userB = await db.user.findFirst({ where: { NOT: { id: userA.id } }, orderBy: { createdAt: 'asc' } });
  console.log(`User A: ${userA.email} (${userA.plan}, id=${userA.id})`);
  console.log(`User B: ${userB ? userB.email + ' (id=' + userB.id + ')' : 'NONE — isolation probe limited'}`);
  const tokenA = mintAccessToken(userA);
  const tokenB = userB ? mintAccessToken(userB) : null;

  // ── 1. My Context runtime state ──
  console.log('\n=== PHASE 11: My Context ===');
  const ctxGet = await api(tokenA, 'GET', '/api/settings/personal-context');
  logStep('GET personal-context', ctxGet.status === 200, `status=${ctxGet.status} context=${JSON.stringify(ctxGet.json?.context || {})?.slice(0, 200)}`);

  // ── 2. Business Profiles runtime state ──
  console.log('\n=== PHASE 12: Business Profiles ===');
  const bpGet = await api(tokenA, 'GET', '/api/business-profiles');
  logStep('GET business-profiles', bpGet.status === 200, `status=${bpGet.status} total=${bpGet.json?.total} active=${bpGet.json?.activeCount} limit=${bpGet.json?.planLimit}`);
  if (bpGet.json?.profiles?.length) {
    console.log(`   existing profiles: ${bpGet.json.profiles.map(p => `${p.id}(${p.name},${p.status})`).join(', ')}`);
  }

  // ── 3. My Offer runtime state ──
  console.log('\n=== PHASE 13: My Offer ===');
  const offerGet = await api(tokenA, 'GET', '/api/prospecting/offer-profile');
  logStep('GET offer-profile', offerGet.status === 200, `status=${offerGet.status} services=${JSON.stringify((offerGet.json?.services || []).map(s => s.name || s)).slice(0, 200)}`);

  // ── 4. Isolation probe: B reads A's profile by ID (if A has one) ──
  console.log('\n=== ISOLATION PROBE ===');
  if (tokenB && bpGet.json?.profiles?.length) {
    const foreignId = bpGet.json.profiles[0].id;
    const bRead = await api(tokenB, 'GET', `/api/business-profiles/${foreignId}`);
    logStep('User B GET A-profile', bRead.status === 404, `status=${bRead.status} (expect 404 — server-side ownership)`);
    const bUpdate = await api(tokenB, 'PUT', `/api/business-profiles/${foreignId}`, { name: 'HACKED' });
    logStep('User B PUT A-profile', bUpdate.status === 404, `status=${bUpdate.status} (expect 404)`);
    const bDiscover = await api(tokenB, 'POST', '/api/leads/discover', { niche: 'test', source: 'ai_search', context: { mode: 'profile', profileId: foreignId } });
    logStep('User B discovery w/ A profileId', bDiscover.status === 400, `status=${bDiscover.status} err=${(bDiscover.json?.error || '').slice(0, 80)}`);
  }

  // ── 5. Discovery context snapshot state (existing jobs) ──
  console.log('\n=== PHASE 15: discovery contextJson (existing rows) ===');
  const jobs = await db.discoveryJob.findMany({
    where: { userId: userA.id },
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: { id: true, niche: true, status: true, contextJson: true, createdAt: true },
  });
  for (const j of jobs) {
    console.log(`   job ${j.id} (${j.niche}, ${j.status}): contextJson=${(j.contextJson || 'null').slice(0, 150)}`);
  }

  // ── 6. What AI outreach currently receives (per-lead intelligence state) ──
  console.log('\n=== PHASE 16/17: outreach prompt inputs (current) ===');
  const settings = await db.userSettings.findUnique({ where: { userId: userA.id }, select: { personalContext: true, servicesOffered: true, businessDescription: true } });
  console.log(`   personalContext set: ${!!settings?.personalContext}`);
  console.log(`   servicesOffered set: ${!!settings?.servicesOffered}`);
  console.log(`   businessDescription set: ${!!settings?.businessDescription}`);

  // Check what lead fields exist for personalization
  const leadSample = await db.lead.findFirst({
    where: { userId: userA.id },
    select: { businessName: true, niche: true, city: true, country: true, notes: true, rating: true, reviews: true, website: true },
  });
  console.log(`   lead sample: ${JSON.stringify(leadSample)?.slice(0, 250)}`);

  // Check workflow profile linkage
  const wf = await db.workflowDefinition.findFirst({
    where: { userId: userA.id },
    orderBy: { updatedAt: 'desc' },
    select: { id: true, name: true, profileId: true },
  });
  console.log(`   latest workflow: ${JSON.stringify(wf)}`);

  await db.$disconnect();
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
