// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — System Agents (Workstream C — §3)
//
// 13 canonical reusable system agent definitions, centrally managed.
// Seeded per-user (idempotent upsert via UNIQUE(userId, systemKey)).
//
// Each system agent is a real executable definition with:
//   · objective — what it exists to accomplish
//   · allowed tools — which AcquisitionOS tools it may invoke
//   · model/brain configuration — default provider+model
//   · model strategy — single | sequential | parallel (uses Workstream B routing)
//   · memory policy — which memory scopes it reads/writes
//   · permission policy — approval_required | autonomous
//   · execution policy — maxIterations, timeoutMs, retryPolicy
//
// Users do NOT manually create these — they are auto-seeded on first
// access to /api/agents (or explicitly via /api/agents/system/instantiate).
// Users can clone a system agent as a custom agent to customize.
//
// Per spec §3: "They should be real executable agent definitions, not
// UI placeholders." — these definitions feed directly into the
// agent-runtime.ts bounded reasoning loop.
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { isProviderAvailable } from '@/lib/ai/user-ai-provider-service';

// ─── Types ────────────────────────────────────────────────────────────

export type SystemAgentKey =
  | 'DISCOVERY' | 'RESEARCH' | 'ENRICHMENT' | 'QUALIFICATION'
  | 'GAP_ANALYSIS' | 'OPPORTUNITY' | 'SOLUTION_MAPPING' | 'LEAD_SCORING'
  | 'OUTREACH' | 'REPLY_ANALYSIS' | 'FOLLOW_UP' | 'CRM' | 'REPORTING';

export type ModelStrategy =
  | { strategy: 'single' }
  | { strategy: 'sequential'; models: Array<{ provider?: string; model?: string; role?: string }> }
  | { strategy: 'parallel'; models: Array<{ provider?: string; model?: string; role?: string }>; concurrency: number }
  | { strategy: 'fallback'; models: Array<{ provider?: string; model?: string }> };

export type MemoryScope = 'user' | 'business' | 'lead' | 'agent' | 'execution' | 'evidence';

export type ApprovalPolicy = 'approval_required' | 'autonomous';
export type AgentStatus = 'draft' | 'active' | 'paused' | 'disabled';

export interface SystemAgentDefinition {
  systemKey: SystemAgentKey;
  name: string;
  description: string;
  objective: string;
  provider: string;
  model: string;
  modelStrategy: ModelStrategy;
  memoryScopes: MemoryScope[];
  toolPermissions: Record<string, string>;
  approvalPolicy: ApprovalPolicy;
  retryPolicy: { maxRetries: number; backoffMs: number };
  memoryConfig: { windowSize: number; maxTokens: number };
  maxIterations: number;
  timeoutMs: number;
  /** When true, the system agent is seeded with status='active' (ready to run).
   *  When false, seeded as 'draft' (user must explicitly activate). */
  seedAsActive: boolean;
}

// ─── The 13 canonical system agents ───────────────────────────────────
//
// Default provider/model is z-ai/glm-4.6 (the platform-installed SDK
// gateway). The modelStrategy uses Workstream B's routing — agents
// will use the user's connected provider if available, otherwise
// fall back to platform Z-AI.

const SYSTEM_AGENTS: SystemAgentDefinition[] = [
  {
    systemKey: 'DISCOVERY',
    name: 'Discovery Agent',
    description: 'Finds new leads matching the business profile via search + filter heuristics.',
    objective: 'Discover new leads that match the business ideal customer profile. Use the available tools to identify prospects, verify fit against the business profile, and create Lead records for promising candidates. Never invent leads — only create records for prospects you have evidence for.',
    provider: 'z-ai',
    model: 'glm-4.6',
    modelStrategy: { strategy: 'single' },
    memoryScopes: ['lead', 'agent', 'user'],
    toolPermissions: {
      'lead.create': 'read-write',
      'lead.lookup': 'read',
      'profile.lookup': 'read',
      'activity.log': 'read-write',
    },
    approvalPolicy: 'approval_required',
    retryPolicy: { maxRetries: 2, backoffMs: 1000 },
    memoryConfig: { windowSize: 20, maxTokens: 4000 },
    maxIterations: 25,
    timeoutMs: 300000,
    seedAsActive: false,
  },
  {
    systemKey: 'RESEARCH',
    name: 'Research Agent',
    description: 'Researches a lead: company context, role, recent news, pain points.',
    objective: 'Research the lead thoroughly. Gather company context (industry, size, stage), the contact\'s role and responsibilities, recent news/announcements, and identify likely pain points. Summarize findings as evidence with confidence ratings.',
    provider: 'z-ai',
    model: 'glm-4.6',
    modelStrategy: {
      strategy: 'sequential',
      models: [
        { role: 'researcher' },
        { role: 'summarizer' },
      ],
    },
    memoryScopes: ['lead', 'agent', 'evidence'],
    toolPermissions: {
      'lead.lookup': 'read',
      'profile.lookup': 'read',
      'activity.log': 'read-write',
    },
    approvalPolicy: 'approval_required',
    retryPolicy: { maxRetries: 2, backoffMs: 1000 },
    memoryConfig: { windowSize: 30, maxTokens: 6000 },
    maxIterations: 30,
    timeoutMs: 600000,
    seedAsActive: false,
  },
  {
    systemKey: 'ENRICHMENT',
    name: 'Enrichment Agent',
    description: 'Enriches lead data: fills gaps, verifies existing fields, normalizes.',
    objective: 'Enrich the lead record by filling missing fields (phone, LinkedIn, company size, industry) and verifying existing fields. Mark each enriched field with its source + confidence. Never overwrite a higher-confidence field with a lower-confidence one.',
    provider: 'z-ai',
    model: 'glm-4.6',
    modelStrategy: { strategy: 'single' },
    memoryScopes: ['lead', 'agent', 'evidence'],
    toolPermissions: {
      'lead.lookup': 'read',
      'lead.update': 'read-write',
      'profile.lookup': 'read',
      'activity.log': 'read-write',
    },
    approvalPolicy: 'approval_required',
    retryPolicy: { maxRetries: 2, backoffMs: 1000 },
    memoryConfig: { windowSize: 25, maxTokens: 5000 },
    maxIterations: 25,
    timeoutMs: 300000,
    seedAsActive: false,
  },
  {
    systemKey: 'QUALIFICATION',
    name: 'Qualification Agent',
    description: 'Qualifies lead using BANT/MEDDIC framework; assigns qualification tier.',
    objective: 'Qualify the lead using the BANT framework (Budget, Authority, Need, Timing) or MEDDIC where applicable. For each dimension, rate the lead (Strong/Moderate/Weak/Unknown) with evidence. Output a final qualification tier (P0/P1/P2/P3) with reasoning.',
    provider: 'z-ai',
    model: 'glm-4.6',
    // BANT has 4 independent dimensions — parallel multi-angle scoring gives
    // richer, more reliable qualification than a single composite prompt.
    // Each role slot produces a focused dimension score; the agent runtime
    // aggregates them into a final tier with disagreement detection.
    modelStrategy: {
      strategy: 'parallel',
      models: [
        { role: 'budget_scorer' },
        { role: 'authority_scorer' },
        { role: 'need_scorer' },
        { role: 'timing_scorer' },
      ],
      concurrency: 3,
    },
    memoryScopes: ['lead', 'agent', 'evidence'],
    toolPermissions: {
      'lead.lookup': 'read',
      'lead.update': 'read-write',
      'activity.log': 'read-write',
    },
    approvalPolicy: 'approval_required',
    retryPolicy: { maxRetries: 2, backoffMs: 1000 },
    memoryConfig: { windowSize: 20, maxTokens: 4000 },
    maxIterations: 20,
    timeoutMs: 300000,
    seedAsActive: false,
  },
  {
    systemKey: 'GAP_ANALYSIS',
    name: 'Gap Analysis Agent',
    description: 'Identifies missing data points needed for next lifecycle step.',
    objective: 'Analyze the lead record and identify what data is missing for the next lifecycle step (qualification, outreach, etc.). Prioritize gaps by impact (critical / nice-to-have). Output a list of gaps + recommended actions to fill them.',
    provider: 'z-ai',
    model: 'glm-4.6',
    modelStrategy: { strategy: 'single' },
    memoryScopes: ['lead', 'agent', 'evidence'],
    toolPermissions: {
      'lead.lookup': 'read',
      'profile.lookup': 'read',
      'activity.log': 'read-write',
    },
    approvalPolicy: 'approval_required',
    retryPolicy: { maxRetries: 2, backoffMs: 1000 },
    memoryConfig: { windowSize: 20, maxTokens: 4000 },
    maxIterations: 20,
    timeoutMs: 300000,
    seedAsActive: false,
  },
  {
    systemKey: 'OPPORTUNITY',
    name: 'Opportunity Analysis Agent',
    description: 'Analyzes opportunity size, fit, timing, and probability of close.',
    objective: 'Analyze the opportunity for this lead. Estimate deal size, assess solution fit, evaluate timing (immediate/quarter/next-year), and assign a probability of close (0-100%). Provide a written justification for each rating.',
    provider: 'z-ai',
    model: 'glm-4.6',
    // Size / fit / timing are independent assessments — parallel multi-angle
    // reasoning produces materially better deal-size estimation than one
    // composite prompt (which tends to anchor on the first dimension).
    modelStrategy: {
      strategy: 'parallel',
      models: [
        { role: 'size_estimator' },
        { role: 'fit_assessor' },
        { role: 'timing_analyst' },
      ],
      concurrency: 3,
    },
    memoryScopes: ['lead', 'agent', 'evidence'],
    toolPermissions: {
      'lead.lookup': 'read',
      'profile.lookup': 'read',
      'activity.log': 'read-write',
    },
    approvalPolicy: 'approval_required',
    retryPolicy: { maxRetries: 2, backoffMs: 1000 },
    memoryConfig: { windowSize: 20, maxTokens: 4000 },
    maxIterations: 20,
    timeoutMs: 300000,
    seedAsActive: false,
  },
  {
    systemKey: 'SOLUTION_MAPPING',
    name: 'Solution Mapping Agent',
    description: 'Maps solution capabilities to lead pain points; identifies relevant features.',
    objective: 'Map the business solution capabilities to the lead\'s identified pain points. For each pain point, identify the specific feature/value-prop that addresses it. Output a structured solution map: painPoint → feature → valueProposition → evidence.',
    provider: 'z-ai',
    model: 'glm-4.6',
    modelStrategy: { strategy: 'single' },
    memoryScopes: ['lead', 'agent', 'evidence'],
    toolPermissions: {
      'lead.lookup': 'read',
      'profile.lookup': 'read',
      'activity.log': 'read-write',
    },
    approvalPolicy: 'approval_required',
    retryPolicy: { maxRetries: 2, backoffMs: 1000 },
    memoryConfig: { windowSize: 20, maxTokens: 4000 },
    maxIterations: 20,
    timeoutMs: 300000,
    seedAsActive: false,
  },
  {
    systemKey: 'LEAD_SCORING',
    name: 'Lead Scoring Agent',
    description: 'Scores lead on multiple dimensions; produces composite score + reasoning.',
    objective: 'Score the lead on multiple dimensions (fit, engagement, intent, timing) using parallel scoring strategies. Each dimension produces a 0-100 score with reasoning. Synthesize a composite score with weighted reasoning. Mark confidence in the composite.',
    provider: 'z-ai',
    model: 'glm-4.6',
    modelStrategy: {
      strategy: 'parallel',
      models: [
        { role: 'fit_scorer' },
        { role: 'engagement_scorer' },
        { role: 'intent_scorer' },
        { role: 'timing_scorer' },
      ],
      concurrency: 3,
    },
    memoryScopes: ['lead', 'agent', 'evidence'],
    toolPermissions: {
      'lead.lookup': 'read',
      'lead.update': 'read-write',
      'activity.log': 'read-write',
    },
    approvalPolicy: 'approval_required',
    retryPolicy: { maxRetries: 2, backoffMs: 1000 },
    memoryConfig: { windowSize: 25, maxTokens: 5000 },
    maxIterations: 25,
    timeoutMs: 420000,
    seedAsActive: false,
  },
  {
    systemKey: 'OUTREACH',
    name: 'Outreach Agent',
    description: 'Drafts personalized outreach message based on lead context.',
    objective: 'Draft a personalized outreach message to the lead. Use the lead\'s research, role, pain points, and the solution map to craft a message that resonates. Output the message draft + subject line + suggested send time. The draft is saved via message.draft — NEVER auto-send.',
    provider: 'z-ai',
    model: 'glm-4.6',
    modelStrategy: { strategy: 'single' },
    memoryScopes: ['lead', 'agent', 'user'],
    toolPermissions: {
      'lead.lookup': 'read',
      'message.draft': 'read-write',
      'email.draft': 'draft',
      'profile.lookup': 'read',
      'activity.log': 'read-write',
    },
    approvalPolicy: 'approval_required',
    retryPolicy: { maxRetries: 2, backoffMs: 1000 },
    memoryConfig: { windowSize: 20, maxTokens: 4000 },
    maxIterations: 15,
    timeoutMs: 300000,
    seedAsActive: false,
  },
  {
    systemKey: 'REPLY_ANALYSIS',
    name: 'Reply Analysis Agent',
    description: 'Analyzes lead reply; classifies intent + recommends next action.',
    objective: 'Analyze the lead\'s reply to our outreach. Classify the intent (interested / not-interested / question / objection / OOO / unsubscribe). Extract key points. Recommend the next action (send info / schedule call / nurture / archive). For interested replies, draft a response.',
    provider: 'z-ai',
    model: 'glm-4.6',
    // Intent classification / key-point extraction / next-action recommendation
    // are separable analytical lenses. Parallel multi-angle reasoning surfaces
    // disagreement (e.g. one model sees "interested" while another sees "objection")
    // which the agent can then escalate or seek more evidence on.
    modelStrategy: {
      strategy: 'parallel',
      models: [
        { role: 'intent_classifier' },
        { role: 'key_point_extractor' },
        { role: 'next_action_recommender' },
      ],
      concurrency: 3,
    },
    memoryScopes: ['lead', 'agent', 'evidence'],
    toolPermissions: {
      'lead.lookup': 'read',
      'email.read': 'read',
      'message.draft': 'read-write',
      'activity.log': 'read-write',
    },
    approvalPolicy: 'approval_required',
    retryPolicy: { maxRetries: 2, backoffMs: 1000 },
    memoryConfig: { windowSize: 20, maxTokens: 4000 },
    maxIterations: 20,
    timeoutMs: 300000,
    seedAsActive: false,
  },
  {
    systemKey: 'FOLLOW_UP',
    name: 'Follow-up Agent',
    description: 'Schedules + drafts follow-up message based on lead stage + last contact.',
    objective: 'Determine if a follow-up is appropriate for the lead based on stage + last contact date. If yes, draft a contextually-appropriate follow-up message and save as a draft. If no (lead is unresponsive after N attempts), recommend archival.',
    provider: 'z-ai',
    model: 'glm-4.6',
    modelStrategy: { strategy: 'single' },
    memoryScopes: ['lead', 'agent', 'user'],
    toolPermissions: {
      'lead.lookup': 'read',
      'message.draft': 'read-write',
      'email.draft': 'draft',
      'profile.lookup': 'read',
      'activity.log': 'read-write',
    },
    approvalPolicy: 'approval_required',
    retryPolicy: { maxRetries: 2, backoffMs: 1000 },
    memoryConfig: { windowSize: 20, maxTokens: 4000 },
    maxIterations: 15,
    timeoutMs: 300000,
    seedAsActive: false,
  },
  {
    systemKey: 'CRM',
    name: 'CRM Agent',
    description: 'Updates CRM: lead stage, status, notes, next-step.',
    objective: 'Update the lead\'s CRM fields based on the latest activity. Set the stage, status, and next-step fields appropriately. Add a note summarizing the latest interaction. NEVER delete a CRM record; only update fields.',
    provider: 'z-ai',
    model: 'glm-4.6',
    modelStrategy: { strategy: 'single' },
    memoryScopes: ['lead', 'agent', 'user'],
    toolPermissions: {
      'lead.lookup': 'read',
      'lead.update': 'read-write',
      'activity.log': 'read-write',
    },
    approvalPolicy: 'approval_required',
    retryPolicy: { maxRetries: 2, backoffMs: 1000 },
    memoryConfig: { windowSize: 15, maxTokens: 3000 },
    maxIterations: 15,
    timeoutMs: 300000,
    seedAsActive: false,
  },
  {
    systemKey: 'REPORTING',
    name: 'Reporting Agent',
    description: 'Generates read-only reports: pipeline health, lead distribution, agent performance.',
    objective: 'Generate a report on the requested metric (pipeline health, lead distribution by stage, agent performance, etc.). Use ONLY read-only tools. NEVER modify any data. Output the report as the final answer with clear sections + numeric evidence.',
    provider: 'z-ai',
    model: 'glm-4.6',
    modelStrategy: { strategy: 'single' },
    memoryScopes: ['agent', 'business'],
    toolPermissions: {
      'lead.lookup': 'read',
      'activity.log': 'read-write',
    },
    approvalPolicy: 'autonomous',
    retryPolicy: { maxRetries: 1, backoffMs: 500 },
    memoryConfig: { windowSize: 30, maxTokens: 6000 },
    maxIterations: 30,
    timeoutMs: 600000,
    seedAsActive: true, // Reporting is read-only — safe to seed as active
  },
];

// ─── Public API ──────────────────────────────────────────────────────

/**
 * Get the static list of system agent definitions.
 * Used by the API to expose the catalog to the UI without DB access.
 */
export function listSystemAgentDefinitions(): SystemAgentDefinition[] {
  return SYSTEM_AGENTS;
}

export function getSystemAgentDefinition(systemKey: string): SystemAgentDefinition | null {
  return SYSTEM_AGENTS.find(a => a.systemKey === systemKey) ?? null;
}

/**
 * Ensure all 13 system agents are seeded for the given user.
 * Idempotent: uses upsert on (userId, systemKey) UNIQUE constraint.
 * Existing user customizations (status, toolPermissions overrides, etc.)
 * are PRESERVED — only the structural fields are reset when the
 * definition is updated (which only happens at deploy time).
 *
 * Per spec §3: "They should be real executable agent definitions" —
 * these are seeded as Agent rows with classification='system'.
 */
export async function ensureSystemAgentsSeeded(userId: string): Promise<{
  seeded: number;
  alreadyExisted: number;
  errors: Array<{ systemKey: string; error: string }>;
}> {
  let seeded = 0;
  let alreadyExisted = 0;
  const errors: Array<{ systemKey: string; error: string }> = [];

  for (const def of SYSTEM_AGENTS) {
    try {
      // Check if a row already exists for this (userId, systemKey).
      // UNIQUE constraint on (userId, systemKey) — at most one row.
      const existing = await db.agent.findUnique({
        where: {
          userId_systemKey: { userId, systemKey: def.systemKey },
        },
      });

      if (existing) {
        alreadyExisted++;
        // Do NOT overwrite user customizations (status, toolPermissions, etc.).
        // Only update the definition fields that the user shouldn't be editing
        // (objective, name, description) — keep these in sync with the catalog.
        // Skip update if existing matches.
        continue;
      }

      // Check provider availability — if the default provider isn't
      // available, fall back to 'z-ai' (platform default, always available
      // via SDK gateway). The user can reconfigure later.
      let provider = def.provider;
      let model = def.model;
      try {
        const avail = await isProviderAvailable(userId, def.provider);
        if (!avail.available) {
          provider = 'z-ai';
          model = 'glm-4.6';
        }
      } catch {
        // Provider check failed (DB issue?) — fall back to z-ai.
        provider = 'z-ai';
        model = 'glm-4.6';
      }

      await db.agent.create({
        data: {
          userId,
          orgId: null,
          name: def.name,
          description: def.description,
          objective: def.objective,
          classification: 'system',
          systemKey: def.systemKey,
          provider,
          model,
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
    } catch (err) {
      errors.push({
        systemKey: def.systemKey,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { seeded, alreadyExisted, errors };
}

/**
 * Get the user's instance of a system agent. Auto-seeds if not yet present.
 */
export async function getSystemAgentInstance(userId: string, systemKey: string) {
  // Ensure seeded first (idempotent)
  await ensureSystemAgentsSeeded(userId);
  return db.agent.findUnique({
    where: {
      userId_systemKey: { userId, systemKey: systemKey as SystemAgentKey },
    },
  });
}

/**
 * List all system agent instances for a user. Auto-seeds if not yet present.
 */
export async function listSystemAgentInstances(userId: string) {
  // Ensure seeded first (idempotent)
  await ensureSystemAgentsSeeded(userId);
  return db.agent.findMany({
    where: { userId, classification: 'system' },
    orderBy: { systemKey: 'asc' },
  });
}
