// Phase 3 — Test 2 retry: approval-gated send_email against a lead WITH an email.
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { readFileSync } from 'fs';

const db = new PrismaClient();
const BASE = 'http://localhost:3000';
const USER_ID = 'cmtuc4av20000npbje6elo5ic';
const WF_ID = 'cmvfqpxbu000zm2qkovbk0iic';

// 1. Find a QA lead for this user that HAS an email address
const lead = await db.lead.findFirst({
  where: { userId: USER_ID, isActive: true, email: { not: null } },
  select: { id: true, businessName: true, email: true },
});
console.log('LEAD WITH EMAIL:', JSON.stringify(lead));

// 2. Enable the approval gate on the disposable QA email workflow
//    (the app's own human-approval feature — send actions become drafts,
//    so NO real email is sent during verification)
await db.workflowDefinition.update({
  where: { id: WF_ID },
  data: { requiresApproval: true },
});
console.log('WORKFLOW requiresApproval: true (set)');

// 3. Execute through the REAL API route
const env = readFileSync('/home/z/my-project/.env', 'utf8');
const line = env.split('\n').find((l) => l.startsWith('JWT_SECRET='));
const secret = line.slice('JWT_SECRET='.length).trim().replace(/^["']|["']$/g, '');
const token = jwt.sign(
  { sub: USER_ID, email: 'testfix@test.local', role: 'owner', plan: 'pro', orgId: null, type: 'access' },
  secret,
  { expiresIn: '2h', issuer: 'acquisitionos', audience: 'acquisitionos-api' }
);
const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

const res = await fetch(`${BASE}/api/workflows/${WF_ID}/execute`, {
  method: 'POST', headers: H,
  body: JSON.stringify({ triggerData: { leadId: lead.id, leadName: lead.businessName } }),
});
const execResult = await res.json();
console.log('\nEXECUTE HTTP', res.status, JSON.stringify(execResult, null, 2));

// 4. Poll the execution status via the REAL API
await new Promise(r => setTimeout(r, 2000));
const st = await fetch(`${BASE}/api/workflows/executions/${execResult.executionId}`, { headers: H });
const stJson = await st.json();
console.log('\nEXECUTION STATUS HTTP', st.status);
console.log(JSON.stringify({
  id: stJson.id, status: stJson.status, error: stJson.error,
  currentStep: stJson.currentStep, totalSteps: stJson.totalSteps,
  stepLogs: (stJson.stepLogs || []).map(l => ({ step: l.stepName, status: l.status, out: l.output, err: l.error })),
}, null, 2));

await db.$disconnect();
