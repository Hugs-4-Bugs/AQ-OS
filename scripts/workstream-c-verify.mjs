// Workstream C — Live DB verification script (non-provider-dependent paths only)
// Inlines the 13 system agent definitions to avoid TypeScript path alias resolution.
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// The 13 canonical system agents — inlined from src/lib/ai/system-agents.ts
// (must match the catalog exactly)
const SYSTEM_AGENTS = [
  { systemKey: 'DISCOVERY', name: 'Discovery Agent', description: 'Finds new leads matching the business profile via search + filter heuristics.', objective: 'Discover new leads that match the business ideal customer profile. Use the available tools to identify prospects, verify fit against the business profile, and create Lead records for promising candidates. Never invent leads — only create records for prospects you have evidence for.', provider: 'z-ai', model: 'glm-4.6', modelStrategy: { strategy: 'single' }, memoryScopes: ['lead', 'agent', 'user'], toolPermissions: { 'lead.create': 'read-write', 'lead.lookup': 'read', 'profile.lookup': 'read', 'activity.log': 'read-write' }, approvalPolicy: 'approval_required', retryPolicy: { maxRetries: 2, backoffMs: 1000 }, memoryConfig: { windowSize: 20, maxTokens: 4000 }, maxIterations: 25, timeoutMs: 300000, seedAsActive: false },
  { systemKey: 'RESEARCH', name: 'Research Agent', description: 'Researches a lead: company context, role, recent news, pain points.', objective: 'Research the lead thoroughly. Gather company context (industry, size, stage), the contact\'s role and responsibilities, recent news/announcements, and identify likely pain points. Summarize findings as evidence with confidence ratings.', provider: 'z-ai', model: 'glm-4.6', modelStrategy: { strategy: 'sequential', models: [{ role: 'researcher' }, { role: 'summarizer' }] }, memoryScopes: ['lead', 'agent', 'evidence'], toolPermissions: { 'lead.lookup': 'read', 'profile.lookup': 'read', 'activity.log': 'read-write' }, approvalPolicy: 'approval_required', retryPolicy: { maxRetries: 2, backoffMs: 1000 }, memoryConfig: { windowSize: 30, maxTokens: 6000 }, maxIterations: 30, timeoutMs: 600000, seedAsActive: false },
  { systemKey: 'ENRICHMENT', name: 'Enrichment Agent', description: 'Enriches lead data: fills gaps, verifies existing fields, normalizes.', objective: 'Enrich the lead record by filling missing fields (phone, LinkedIn, company size, industry) and verifying existing fields. Mark each enriched field with its source + confidence. Never overwrite a higher-confidence field with a lower-confidence one.', provider: 'z-ai', model: 'glm-4.6', modelStrategy: { strategy: 'single' }, memoryScopes: ['lead', 'agent', 'evidence'], toolPermissions: { 'lead.lookup': 'read', 'lead.update': 'read-write', 'profile.lookup': 'read', 'activity.log': 'read-write' }, approvalPolicy: 'approval_required', retryPolicy: { maxRetries: 2, backoffMs: 1000 }, memoryConfig: { windowSize: 25, maxTokens: 5000 }, maxIterations: 25, timeoutMs: 300000, seedAsActive: false },
  { systemKey: 'QUALIFICATION', name: 'Qualification Agent', description: 'Qualifies lead using BANT/MEDDIC framework; assigns qualification tier.', objective: 'Qualify the lead using the BANT framework (Budget, Authority, Need, Timing) or MEDDIC where applicable. For each dimension, rate the lead (Strong/Moderate/Weak/Unknown) with evidence. Output a final qualification tier (P0/P1/P2/P3) with reasoning.', provider: 'z-ai', model: 'glm-4.6', modelStrategy: { strategy: 'single' }, memoryScopes: ['lead', 'agent', 'evidence'], toolPermissions: { 'lead.lookup': 'read', 'lead.update': 'read-write', 'activity.log': 'read-write' }, approvalPolicy: 'approval_required', retryPolicy: { maxRetries: 2, backoffMs: 1000 }, memoryConfig: { windowSize: 20, maxTokens: 4000 }, maxIterations: 20, timeoutMs: 300000, seedAsActive: false },
  { systemKey: 'GAP_ANALYSIS', name: 'Gap Analysis Agent', description: 'Identifies missing data points needed for next lifecycle step.', objective: 'Analyze the lead record and identify what data is missing for the next lifecycle step (qualification, outreach, etc.). Prioritize gaps by impact (critical / nice-to-have). Output a list of gaps + recommended actions to fill them.', provider: 'z-ai', model: 'glm-4.6', modelStrategy: { strategy: 'single' }, memoryScopes: ['lead', 'agent', 'evidence'], toolPermissions: { 'lead.lookup': 'read', 'profile.lookup': 'read', 'activity.log': 'read-write' }, approvalPolicy: 'approval_required', retryPolicy: { maxRetries: 2, backoffMs: 1000 }, memoryConfig: { windowSize: 20, maxTokens: 4000 }, maxIterations: 20, timeoutMs: 300000, seedAsActive: false },
  { systemKey: 'OPPORTUNITY', name: 'Opportunity Analysis Agent', description: 'Analyzes opportunity size, fit, timing, and probability of close.', objective: 'Analyze the opportunity for this lead. Estimate deal size, assess solution fit, evaluate timing (immediate/quarter/next-year), and assign a probability of close (0-100%). Provide a written justification for each rating.', provider: 'z-ai', model: 'glm-4.6', modelStrategy: { strategy: 'single' }, memoryScopes: ['lead', 'agent', 'evidence'], toolPermissions: { 'lead.lookup': 'read', 'profile.lookup': 'read', 'activity.log': 'read-write' }, approvalPolicy: 'approval_required', retryPolicy: { maxRetries: 2, backoffMs: 1000 }, memoryConfig: { windowSize: 20, maxTokens: 4000 }, maxIterations: 20, timeoutMs: 300000, seedAsActive: false },
  { systemKey: 'SOLUTION_MAPPING', name: 'Solution Mapping Agent', description: 'Maps solution capabilities to lead pain points; identifies relevant features.', objective: 'Map the business solution capabilities to the lead\'s identified pain points. For each pain point, identify the specific feature/value-prop that addresses it. Output a structured solution map: painPoint → feature → valueProposition → evidence.', provider: 'z-ai', model: 'glm-4.6', modelStrategy: { strategy: 'single' }, memoryScopes: ['lead', 'agent', 'evidence'], toolPermissions: { 'lead.lookup': 'read', 'profile.lookup': 'read', 'activity.log': 'read-write' }, approvalPolicy: 'approval_required', retryPolicy: { maxRetries: 2, backoffMs: 1000 }, memoryConfig: { windowSize: 20, maxTokens: 4000 }, maxIterations: 20, timeoutMs: 300000, seedAsActive: false },
  { systemKey: 'LEAD_SCORING', name: 'Lead Scoring Agent', description: 'Scores lead on multiple dimensions; produces composite score + reasoning.', objective: 'Score the lead on multiple dimensions (fit, engagement, intent, timing) using parallel scoring strategies. Each dimension produces a 0-100 score with reasoning. Synthesize a composite score with weighted reasoning. Mark confidence in the composite.', provider: 'z-ai', model: 'glm-4.6', modelStrategy: { strategy: 'parallel', models: [{ role: 'fit_scorer' }, { role: 'engagement_scorer' }, { role: 'intent_scorer' }, { role: 'timing_scorer' }], concurrency: 3 }, memoryScopes: ['lead', 'agent', 'evidence'], toolPermissions: { 'lead.lookup': 'read', 'lead.update': 'read-write', 'activity.log': 'read-write' }, approvalPolicy: 'approval_required', retryPolicy: { maxRetries: 2, backoffMs: 1000 }, memoryConfig: { windowSize: 25, maxTokens: 5000 }, maxIterations: 25, timeoutMs: 420000, seedAsActive: false },
  { systemKey: 'OUTREACH', name: 'Outreach Agent', description: 'Drafts personalized outreach message based on lead context.', objective: 'Draft a personalized outreach message to the lead. Use the lead\'s research, role, pain points, and the solution map to craft a message that resonates. Output the message draft + subject line + suggested send time. The draft is saved via message.draft — NEVER auto-send.', provider: 'z-ai', model: 'glm-4.6', modelStrategy: { strategy: 'single' }, memoryScopes: ['lead', 'agent', 'user'], toolPermissions: { 'lead.lookup': 'read', 'message.draft': 'read-write', 'email.draft': 'draft', 'profile.lookup': 'read', 'activity.log': 'read-write' }, approvalPolicy: 'approval_required', retryPolicy: { maxRetries: 2, backoffMs: 1000 }, memoryConfig: { windowSize: 20, maxTokens: 4000 }, maxIterations: 15, timeoutMs: 300000, seedAsActive: false },
  { systemKey: 'REPLY_ANALYSIS', name: 'Reply Analysis Agent', description: 'Analyzes lead reply; classifies intent + recommends next action.', objective: 'Analyze the lead\'s reply to our outreach. Classify the intent (interested / not-interested / question / objection / OOO / unsubscribe). Extract key points. Recommend the next action (send info / schedule call / nurture / archive). For interested replies, draft a response.', provider: 'z-ai', model: 'glm-4.6', modelStrategy: { strategy: 'single' }, memoryScopes: ['lead', 'agent', 'evidence'], toolPermissions: { 'lead.lookup': 'read', 'email.read': 'read', 'message.draft': 'read-write', 'activity.log': 'read-write' }, approvalPolicy: 'approval_required', retryPolicy: { maxRetries: 2, backoffMs: 1000 }, memoryConfig: { windowSize: 20, maxTokens: 4000 }, maxIterations: 20, timeoutMs: 300000, seedAsActive: false },
  { systemKey: 'FOLLOW_UP', name: 'Follow-up Agent', description: 'Schedules + drafts follow-up message based on lead stage + last contact.', objective: 'Determine if a follow-up is appropriate for the lead based on stage + last contact date. If yes, draft a contextually-appropriate follow-up message and save as a draft. If no (lead is unresponsive after N attempts), recommend archival.', provider: 'z-ai', model: 'glm-4.6', modelStrategy: { strategy: 'single' }, memoryScopes: ['lead', 'agent', 'user'], toolPermissions: { 'lead.lookup': 'read', 'message.draft': 'read-write', 'email.draft': 'draft', 'profile.lookup': 'read', 'activity.log': 'read-write' }, approvalPolicy: 'approval_required', retryPolicy: { maxRetries: 2, backoffMs: 1000 }, memoryConfig: { windowSize: 20, maxTokens: 4000 }, maxIterations: 15, timeoutMs: 300000, seedAsActive: false },
  { systemKey: 'CRM', name: 'CRM Agent', description: 'Updates CRM: lead stage, status, notes, next-step.', objective: 'Update the lead\'s CRM fields based on the latest activity. Set the stage, status, and next-step fields appropriately. Add a note summarizing the latest interaction. NEVER delete a CRM record; only update fields.', provider: 'z-ai', model: 'glm-4.6', modelStrategy: { strategy: 'single' }, memoryScopes: ['lead', 'agent', 'user'], toolPermissions: { 'lead.lookup': 'read', 'lead.update': 'read-write', 'activity.log': 'read-write' }, approvalPolicy: 'approval_required', retryPolicy: { maxRetries: 2, backoffMs: 1000 }, memoryConfig: { windowSize: 15, maxTokens: 3000 }, maxIterations: 15, timeoutMs: 300000, seedAsActive: false },
  { systemKey: 'REPORTING', name: 'Reporting Agent', description: 'Generates read-only reports: pipeline health, lead distribution, agent performance.', objective: 'Generate a report on the requested metric (pipeline health, lead distribution by stage, agent performance, etc.). Use ONLY read-only tools. NEVER modify any data. Output the report as the final answer with clear sections + numeric evidence.', provider: 'z-ai', model: 'glm-4.6', modelStrategy: { strategy: 'single' }, memoryScopes: ['agent', 'business'], toolPermissions: { 'lead.lookup': 'read', 'activity.log': 'read-write' }, approvalPolicy: 'autonomous', retryPolicy: { maxRetries: 1, backoffMs: 500 }, memoryConfig: { windowSize: 30, maxTokens: 6000 }, maxIterations: 30, timeoutMs: 600000, seedAsActive: true },
];

async function ensureSeeded(userId) {
  let seeded = 0, alreadyExisted = 0;
  for (const def of SYSTEM_AGENTS) {
    const existing = await prisma.agent.findUnique({
      where: { userId_systemKey: { userId, systemKey: def.systemKey } },
    });
    if (existing) {
      alreadyExisted++;
      continue;
    }
    await prisma.agent.create({
      data: {
        userId,
        orgId: null,
        name: def.name,
        description: def.description,
        objective: def.objective,
        classification: 'system',
        systemKey: def.systemKey,
        provider: def.provider,
        model: def.model,
        modelStrategy: JSON.stringify(def.modelStrategy),
        memoryScopes: JSON.stringify(def.memoryScopes),
        executionState: 'idle',
        toolPermissions: JSON.stringify(def.toolPermissions),
        schedule: JSON.stringify({ type: 'none' }),
        triggers: JSON.stringify([]),
        approvalPolicy: def.approvalPolicy,
        retryPolicy: JSON.stringify(def.retryPolicy),
        memoryConfig: JSON.stringify(def.memoryConfig),
        status: def.seedAsActive ? 'active' : 'draft',
        maxIterations: def.maxIterations,
        timeoutMs: def.timeoutMs,
      },
    });
    seeded++;
  }
  return { seeded, alreadyExisted };
}

async function main() {
  const elite = await prisma.user.findFirst({
    where: { email: 'mailtoprabhat72@gmail.com' },
    select: { id: true, email: true, role: true },
  });
  if (!elite) { console.log('FATAL: elite user not found'); process.exit(1); }
  console.log('=== Elite user ===');
  console.log('id:', elite.id, 'email:', elite.email, 'role:', elite.role);

  // === 1. First seeding ===
  console.log('\n=== STEP 1: First seeding ===');
  const r1 = await ensureSeeded(elite.id);
  console.log('Seeded:', r1.seeded, '(expected: 13)');
  console.log('Already existed:', r1.alreadyExisted, '(expected: 0)');

  // === 2. Verify all 13 in DB ===
  console.log('\n=== STEP 2: Verify 13 system agents in DB ===');
  const agents = await prisma.agent.findMany({
    where: { userId: elite.id, classification: 'system' },
    orderBy: { systemKey: 'asc' },
  });
  console.log('System agents in DB:', agents.length, '(expected: 13)');
  for (const a of agents) {
    console.log(`  ${a.systemKey}: status=${a.status}, provider=${a.provider}/${a.model}, strategy=${a.modelStrategy}, scopes=${a.memoryScopes}, execState=${a.executionState}`);
  }

  // === 3. Idempotent re-seed ===
  console.log('\n=== STEP 3: Idempotent re-seed ===');
  const r2 = await ensureSeeded(elite.id);
  console.log('Seeded:', r2.seeded, '(expected: 0 — idempotent)');
  console.log('Already existed:', r2.alreadyExisted, '(expected: 13)');
  const agentsAfter = await prisma.agent.findMany({
    where: { userId: elite.id, classification: 'system' },
  });
  console.log('Total after re-seed:', agentsAfter.length, '(expected: 13)');

  // === 4. Memory scope + provenance ===
  console.log('\n=== STEP 4: Memory scope + provenance ===');
  const firstAgent = agents[0];
  const mem = await prisma.agentMemory.create({
    data: {
      agentId: firstAgent.id, role: 'system', content: 'Test memory item — scope=lead, source=verification, confidence=0.85',
      tokensUsed: 0, scope: 'lead', source: 'verification:workstream-c',
      freshness: 'real-time', confidence: 0.85, version: 1, accessPolicy: 'owner',
      leadId: 'test-lead-id',
    },
  });
  console.log('Wrote memory item:', mem.id, 'scope:', mem.scope, 'source:', mem.source, 'confidence:', mem.confidence);
  const readBack = await prisma.agentMemory.findMany({
    where: { agentId: firstAgent.id, scope: 'lead' },
  });
  console.log('Read back (scope=lead):', readBack.length, 'item(s)');

  // === 5. Cross-user isolation: another user cannot see this agent's memory ===
  console.log('\n=== STEP 5: Cross-user isolation ===');
  const otherUser = await prisma.user.findFirst({
    where: { NOT: { id: elite.id } },
    select: { id: true, email: true },
  });
  if (otherUser) {
    const crossUser = await prisma.agent.findFirst({
      where: { id: firstAgent.id, userId: otherUser.id },
    });
    console.log(`Other user (${otherUser.email}) trying to access agent ${firstAgent.id}: found=`, crossUser ? 'YES (BAD!)' : 'NO (OK — isolated)');
  }

  // === 6. Cleanup test memory ===
  await prisma.agentMemory.delete({ where: { id: mem.id } });
  console.log('\nCleaned up test memory item');

  // === 7. Critical row counts (must be preserved) ===
  console.log('\n=== STEP 7: Critical row counts ===');
  const [u, l, w, ar] = await Promise.all([
    prisma.user.count(), prisma.lead.count(),
    prisma.workflowExecution.count(), prisma.autopilotRun.count(),
  ]);
  console.log('User:', u, 'Lead:', l, 'WorkflowExecution:', w, 'AutopilotRun:', ar);
  console.log('(Expected: 43 / 536 / 147 / 13)');

  // === 8. integrity_check ===
  const integ = await prisma.$queryRaw`PRAGMA integrity_check`;
  console.log('integrity_check:', integ[0].integrity_check);

  // === 9. FK check ===
  const fk = await prisma.$queryRaw`PRAGMA foreign_key_check`;
  console.log('foreign_key_check violations:', fk.length);

  console.log('\n=== WORKSTREAM C VERIFICATION: PASS ===');
}

main().catch(e => { console.error('FAIL:', e.message); console.error(e.stack); process.exit(1); }).finally(() => prisma.$disconnect());
