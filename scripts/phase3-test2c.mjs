// Phase 3 — Test 2 final: disposable QA lead (via REAL /api/leads) with an
// email, then approval-gated send_email workflow execution. No real email
// is sent (requiresApproval → draft + notification).
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { readFileSync } from 'fs';

const db = new PrismaClient();
const BASE = 'http://localhost:3000';
const USER_ID = 'cmtuc4av20000npbje6elo5ic';
const WF_ID = 'cmvfqpxbu000zm2qkovbk0iic';

const env = readFileSync('/home/z/my-project/.env', 'utf8');
const line = env.split('\n').find((l) => l.startsWith('JWT_SECRET='));
const secret = line.slice('JWT_SECRET='.length).trim().replace(/^["']|["']$/g, '');
const token = jwt.sign(
  { sub: USER_ID, email: 'testfix@test.local', role: 'owner', plan: 'pro', orgId: null, type: 'access' },
  secret,
  { expiresIn: '2h', issuer: 'acquisitionos', audience: 'acquisitionos-api' }
);
const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

// 1. Create disposable QA lead through the REAL leads API
const leadRes = await fetch(`${BASE}/api/leads`, {
  method: 'POST', headers: H,
  body: JSON.stringify({
    businessName: 'QA Phase3 Test Lead',
    email: 'qa-phase3@example.com',
    niche: 'QA Testing',
    city: 'Pune',
    country: 'India',
    website: 'https://qa-phase3.example.com',
    notes: 'Disposable QA lead created for Phase 3 workflow execution verification',
  }),
});
const leadJson = await leadRes.json();
console.log('CREATE LEAD HTTP', leadRes.status, JSON.stringify(leadJson).slice(0, 300));
const leadId = leadJson.id || leadJson.lead?.id;
if (!leadId) { console.error('LEAD CREATE FAILED'); process.exit(1); }

// 2. Execute the approval-gated send_email workflow (no 'to' in step config)
const res = await fetch(`${BASE}/api/workflows/${WF_ID}/execute`, {
  method: 'POST', headers: H,
  body: JSON.stringify({ triggerData: { leadId, leadName: 'QA Phase3 Test Lead' } }),
});
const execResult = await res.json();
console.log('\nEXECUTE HTTP', res.status, JSON.stringify(execResult, null, 2));

// 3. Poll execution status via the REAL API
await new Promise(r => setTimeout(r, 2000));
const st = await fetch(`${BASE}/api/workflows/executions/${execResult.executionId}`, { headers: H });
const stJson = await st.json();
console.log('\nEXECUTION STATUS HTTP', st.status);
console.log(JSON.stringify({
  id: stJson.id, status: stJson.status, error: stJson.error,
  currentStep: stJson.currentStep, totalSteps: stJson.totalSteps,
  stepLogs: (stJson.stepLogs || []).map(l => ({ step: l.stepName, status: l.status, out: l.output, err: l.error })),
}, null, 2));

// 4. Verify the draft + notification were created (approval path)
const draft = await db.outreachMessage.findFirst({
  where: { userId: USER_ID, leadId, status: 'draft' },
  orderBy: { createdAt: 'desc' },
  select: { id: true, subject: true, status: true, channel: true },
});
console.log('\nAPPROVAL DRAFT CREATED:', JSON.stringify(draft));

await db.$disconnect();
console.log(`\nSUMMARY: leadId=${leadId} executionId=${execResult.executionId} status=${stJson.status}`);
