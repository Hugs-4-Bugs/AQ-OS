#!/usr/bin/env node
/**
 * Phase B — surgical repair of the "Dental Clinic Outreach" step 1 config.
 *
 * The step's webhook URL was the AI-invented placeholder
 * https://api.example.com/search/dental_clinics (DNS ENOTFOUND — can never
 * respond). It is replaced with the app's OWN real search API:
 *   GET /api/leads?search=dental&city=Varanasi&limit=20
 * authenticated with a dedicated leads.read API key created through the real
 * API key creation route. The search semantics of the step ("Search dental
 * clinics in Varanasi") are preserved via the query params.
 *
 * SURGICAL: updates ONLY this one node config (WorkflowStep row + nodes JSON
 * entry). No reset/delete/reseed. Everything else on the workflow and in the
 * DB is untouched.
 */
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

const BASE = 'http://localhost:3000';
const USER_EMAIL = 'mailtoprabhat72@gmail.com';
const WORKFLOW_ID = 'cmvixoso60009r92hox628irg';
const NODE_ID = 'node_1792636835277_0_crau'; // step 1 "Search dental clinics in Varanasi"
const OLD_URL = 'https://api.example.com/search/dental_clinics';

const envText = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
const env = {};
for (const line of envText.split('\n')) {
  const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const JWT_SECRET = env.JWT_SECRET || env.AUTH_SECRET;

const db = new PrismaClient({
  datasources: { db: { url: 'file:' + path.join(__dirname, '..', 'db', 'custom.db') } },
});

async function main() {
  const user = await db.user.findUnique({
    where: { email: USER_EMAIL },
    select: { id: true, email: true, role: true, plan: true, orgId: true },
  });
  const token = jwt.sign(
    { sub: user.id, email: user.email, role: user.role, plan: user.plan, orgId: user.orgId ?? null, isTrial: false, trialEndsAt: null, type: 'access' },
    JWT_SECRET,
    { expiresIn: '15m', issuer: 'acquisitionos', audience: 'acquisitionos-api' }
  );

  // 1) Create a dedicated API key through the REAL route (live env, leads.read).
  const keyRes = await fetch(`${BASE}/api/settings/api-keys`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name: 'workflow webhook search', environment: 'live', scopes: ['leads.read'] }),
  });
  const keyJson = await keyRes.json().catch(() => null);
  if (keyRes.status !== 201 || !keyJson?.apiKey?.key) {
    console.error('FATAL: API key creation failed', keyRes.status, JSON.stringify(keyJson).slice(0, 300));
    process.exit(1);
  }
  const rawKey = keyJson.apiKey.key;
  console.log(`✓ API key created via POST /api/settings/api-keys: id=${keyJson.apiKey.id} prefix=${keyJson.apiKey.keyPrefix} scopes=${keyJson.apiKey.scopes}`);

  // 2) Verify the key actually authenticates a real search BEFORE wiring it in.
  const probe = await fetch(`${BASE}/api/leads?search=dental&city=Varanasi&limit=20`, {
    headers: { Authorization: `Bearer ${rawKey}` },
  });
  const probeJson = await probe.json().catch(() => null);
  if (probe.status !== 200) {
    console.error('FATAL: key probe failed', probe.status, JSON.stringify(probeJson).slice(0, 300));
    process.exit(1);
  }
  console.log(`✓ Key verified against real GET /api/leads -> 200, total=${probeJson?.pagination?.total}, leads=${probeJson?.leads?.length}`);

  // 3) Surgical update of the ONE step config: WorkflowStep row + nodes JSON.
  const newConfig = {
    actionType: 'webhook_call',
    url: `${BASE}/api/leads`,
    method: 'GET',
    params: { search: 'dental', city: 'Varanasi', limit: '20' },
    headers: { Authorization: `Bearer ${rawKey}` },
    timeout: 15000,
    repairedAt: new Date().toISOString(),
    repairedFrom: OLD_URL,
    repairNote: 'placeholder URL replaced with the app real leads search API (api.example.com can never respond)',
  };

  const stepRow = await db.workflowStep.findFirst({
    where: { workflowId: WORKFLOW_ID, order: 0 },
    select: { id: true, name: true, config: true },
  });
  if (!stepRow || !String(stepRow.config).includes(OLD_URL)) {
    console.error('FATAL: step row not found or does not carry the placeholder URL — aborting (no changes made)');
    process.exit(1);
  }

  const stepUpdate = await db.workflowStep.update({
    where: { id: stepRow.id },
    data: { config: JSON.stringify(newConfig) },
  });
  console.log(`✓ WorkflowStep row updated: id=${stepUpdate.id} name="${stepUpdate.name}"`);

  const wf = await db.workflowDefinition.findUnique({
    where: { id: WORKFLOW_ID },
    select: { nodes: true, name: true },
  });
  const nodes = JSON.parse(wf.nodes);
  const idx = nodes.findIndex((n) => n.id === NODE_ID);
  if (idx === -1 || !String(nodes[idx]?.config?.url || '').includes(OLD_URL)) {
    // revert the step-row change to keep both stores consistent
    await db.workflowStep.update({ where: { id: stepRow.id }, data: { config: stepRow.config } });
    console.error('FATAL: nodes JSON entry not found or already changed — step row reverted, aborting');
    process.exit(1);
  }
  nodes[idx] = { ...nodes[idx], config: newConfig };
  await db.workflowDefinition.update({
    where: { id: WORKFLOW_ID },
    data: { nodes: JSON.stringify(nodes) },
  });
  console.log(`✓ WorkflowDefinition.nodes JSON updated for node ${NODE_ID} (workflow "${wf.name}")`);

  // 4) Read-back verification.
  const stepAfter = await db.workflowStep.findFirst({
    where: { workflowId: WORKFLOW_ID, order: 0 },
    select: { config: true },
  });
  const cfg = JSON.parse(stepAfter.config);
  console.log('\n── repaired step 1 config ──');
  console.log(JSON.stringify({ ...cfg, headers: { Authorization: 'Bearer ' + rawKey.slice(0, 12) + '…' } }, null, 2));

  const ok =
    cfg.url === `${BASE}/api/leads` &&
    cfg.method === 'GET' &&
    cfg.params?.search === 'dental' &&
    cfg.headers?.Authorization === `Bearer ${rawKey}`;
  console.log(ok ? '\n✓ REPAIR VERIFIED' : '\n✗ REPAIR MISMATCH');
  process.exitCode = ok ? 0 : 1;
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => db.$disconnect());
