// ═══════════════════════════════════════════════════════════════════
// Unit Tests: Phase 3 — Workflow Builder / Configuration Integrity
//
// Covers:
//   1. Per-action configuration rules (required fields, anyOf aliases).
//   2. Definition validation: valid workflow, missing required field,
//      malformed/legacy definitions, unsupported action, 0 steps.
//   3. Service gates: create/update reject invalid step config;
//      activation (enable) rejects non-executable definitions.
//   4. Template instantiation cannot produce malformed workflows.
//   5. Run Now pre-flight: /execute returns 422 WORKFLOW_INVALID with
//      repair issues BEFORE creating any execution record.
//   6. Ownership: foreign workflow → 404 (backend, not just frontend).
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ── Shared mocks (hoisted) ────────────────────────────────────────
const mocks = vi.hoisted(() => ({
  state: {
    user: { id: 'user_1', email: 't@t.test', name: 'T', role: 'owner', plan: 'pro', orgId: null },
  },
  db: {
    workflowDefinition: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), count: vi.fn() },
    workflowStep: { createMany: vi.fn(), deleteMany: vi.fn() },
    workflowExecution: { create: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
    workflowTemplate: { findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn(), count: vi.fn(), create: vi.fn() },
    lead: { findFirst: vi.fn(), findMany: vi.fn() },
  },
  executeWorkflow: vi.fn(),
  resolveLeadForExecution: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db: mocks.db }));
vi.mock('@/lib/workflow-credits', () => ({
  checkWorkflowLimit: vi.fn(async () => ({ allowed: true, current: 1, limit: 25 })),
  checkExecutionLimit: vi.fn(async () => ({ allowed: true, current: 1, limit: 500 })),
  // Part 2 — the flat execution fee charged at run acceptance (behavior
  // covered by the dedicated part2 suites; mocked here as succeeding).
  chargeWorkflowExecutionFee: vi.fn(async () => ({ ok: true, alreadyProcessed: false, newBalance: 745 })),
  refundWorkflowExecutionFee: vi.fn(async () => ({ refunded: true, newBalance: 750 })),
  WORKFLOW_EXECUTION_FEE_CREDITS: 5,
}));
vi.mock('@/lib/workflow-audit', () => ({ logWorkflowEvent: vi.fn(async () => {}) }));
vi.mock('@/lib/lead-resolution', () => ({ resolveLeadForExecution: mocks.resolveLeadForExecution }));
vi.mock('@/lib/auth-middleware', () => ({
  withAuth: vi.fn(async (_req: unknown, handler: (u: unknown) => unknown) => handler(mocks.state.user)),
}));
vi.mock('@/lib/entitlement-middleware', () => ({
  checkPlanEntitlement: vi.fn(async () => ({ allowed: true })),
}));
vi.mock('@/lib/workflow-engine', () => ({ executeWorkflow: mocks.executeWorkflow }));

import {
  validateDefinition,
  loadSteps,
  parseStepConfig,
  ACTION_CONFIG_RULES,
} from '@/lib/workflow-validation';
import { createWorkflow, updateWorkflow, activateWorkflow } from '@/lib/workflow-service';
import { instantiateTemplate } from '@/lib/workflow-templates';
import { POST as executeRoute } from '@/app/api/workflows/[id]/execute/route';

// ===== helpers =====

function step(actionType: string, config: Record<string, unknown>, name = actionType) {
  return { type: 'action', name, config: { actionType, ...config }, order: 0 };
}

const VALID_ADD_NOTE = step('add_note', { content: 'Follow up sent' }, 'Record activity');
const VALID_SEND_EMAIL = step('send_email', { subject: 'Hi', body: 'Hello' });

function makeExecuteRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/workflows/wf_1/execute', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function callExecuteRoute(body: unknown) {
  const res = await executeRoute(makeExecuteRequest(body), { params: Promise.resolve({ id: 'wf_1' }) });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

// ═══════════════════════════════════════════════════════════════════
// 1. Per-action configuration rules
// ═══════════════════════════════════════════════════════════════════

describe('Phase 3 — action configuration rules', () => {
  it('derives rules only from action types the registries actually support', () => {
    // Registry-supported types (main engine switch + legacy aliases)
    const expected = [
      'send_email', 'create_gmail_draft', 'send_gmail_draft', 'send_telegram', 'send_whatsapp',
      'ai_analysis', 'ai_outreach', 'score_lead', 'move_lead_stage', 'move_to_stage',
      'update_tags', 'add_tag', 'add_note', 'create_notification', 'wait_delay',
      'conditional_branch', 'webhook_call', 'export_data', 'notify_low_credits', 'notify_trial_ending',
    ];
    for (const t of expected) expect(ACTION_CONFIG_RULES[t]).toBeDefined();
    expect(ACTION_CONFIG_RULES.not_a_real_action).toBeUndefined();
  });

  it('parses string, object, and empty configs; rejects malformed JSON', () => {
    expect(parseStepConfig('{"a":1}')).toEqual({ a: 1 });
    expect(parseStepConfig({ a: 1 })).toEqual({ a: 1 });
    expect(parseStepConfig('')).toEqual({});
    expect(parseStepConfig(null)).toEqual({});
    expect(parseStepConfig('{not json')).toBeNull();
    expect(parseStepConfig('["array"]')).toBeNull();
  });

  it('send_email requires subject and body', () => {
    expect(validateDefinition([step('send_email', { subject: 's', body: 'b' })], null).valid).toBe(true);
    const missingBody = validateDefinition([step('send_email', { subject: 's' })], null);
    expect(missingBody.valid).toBe(false);
    expect(missingBody.issues[0].message).toContain('body is required');
  });

  it('add_note requires content (the Record Activity payload)', () => {
    expect(validateDefinition([VALID_ADD_NOTE], null).valid).toBe(true);
    const noContent = validateDefinition([step('add_note', {})], null);
    expect(noContent.valid).toBe(false);
    expect(noContent.issues[0].message).toContain('content is required');
  });

  it('move_lead_stage accepts targetStage OR stage; update_tags accepts tags OR tag', () => {
    expect(validateDefinition([step('move_lead_stage', { targetStage: 'contacted' })], null).valid).toBe(true);
    expect(validateDefinition([step('move_lead_stage', { stage: 'contacted' })], null).valid).toBe(true);
    expect(validateDefinition([step('move_lead_stage', {})], null).valid).toBe(false);
    expect(validateDefinition([step('update_tags', { tags: ['a'] })], null).valid).toBe(true);
    expect(validateDefinition([step('update_tags', { tag: 'a' })], null).valid).toBe(true);
    expect(validateDefinition([step('update_tags', {})], null).valid).toBe(false);
  });

  it('wait_delay requires duration; webhook_call requires url; export_data requires dataType', () => {
    expect(validateDefinition([step('wait_delay', { duration: 5 })], null).valid).toBe(true);
    expect(validateDefinition([step('wait_delay', {})], null).valid).toBe(false);
    expect(validateDefinition([step('webhook_call', { url: 'https://x.test' })], null).valid).toBe(true);
    expect(validateDefinition([step('webhook_call', {})], null).valid).toBe(false);
    expect(validateDefinition([step('export_data', { dataType: 'leads' })], null).valid).toBe(true);
    expect(validateDefinition([step('export_data', {})], null).valid).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 2. Definition validation — legacy / malformed handling
// ═══════════════════════════════════════════════════════════════════

describe('Phase 3 — definition validation', () => {
  it('rejects a workflow with zero steps (no silent 0-step execution)', () => {
    const v = validateDefinition([], null);
    expect(v.valid).toBe(false);
    expect(v.issues[0].message).toContain('no steps');
  });

  it('rejects an unsupported action type', () => {
    const v = validateDefinition([step('carrier_pigeon', {})], null);
    expect(v.valid).toBe(false);
    expect(v.issues[0].message).toContain('Unsupported action type');
  });

  it('rejects malformed persisted step config JSON instead of swallowing it', () => {
    const v = validateDefinition(
      [{ type: 'action', name: 'Broken', config: '{not json', order: 0 }],
      null
    );
    expect(v.valid).toBe(false);
    expect(v.issues[0].message).toContain('malformed');
  });

  it('rejects malformed nodes JSON (legacy definitions)', () => {
    const v = validateDefinition([], '{not json');
    expect(v.valid).toBe(false);
    expect(v.issues[0].message).toContain('malformed');
  });

  it('loads legacy nodes definitions (trigger filtered, actionType resolved)', () => {
    const nodes = JSON.stringify([
      { id: 't', type: 'trigger', title: 'Trigger' },
      { id: 's1', type: 'action', title: 'Record', config: { actionType: 'add_note', content: 'x' } },
      { id: 's2', type: 'delay', title: 'Wait', config: { duration: 2 } },
    ]);
    const { steps, issues } = loadSteps([], nodes);
    expect(issues).toEqual([]);
    expect(steps).toHaveLength(2);
    expect(steps[0].actionType).toBe('add_note');
    expect(steps[1].actionType).toBe('wait_delay'); // delay alias resolves
  });

  it('a multi-step workflow validates only when EVERY step is valid', () => {
    const ok = validateDefinition([VALID_SEND_EMAIL, VALID_ADD_NOTE], null);
    expect(ok.valid).toBe(true);
    const bad = validateDefinition([VALID_SEND_EMAIL, step('add_note', {})], null);
    expect(bad.valid).toBe(false);
    expect(bad.issues).toHaveLength(1);
    expect(bad.issues[0].stepName).toBe('add_note');
  });
});

// ═══════════════════════════════════════════════════════════════════
// 3. Service gates — save & enable
// ═══════════════════════════════════════════════════════════════════

describe('Phase 3 — workflow-service gates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.db.workflowDefinition.findFirst.mockReset();
    mocks.db.workflowDefinition.findUnique.mockResolvedValue({ id: 'wf_1', workflowSteps: [] });
    mocks.db.workflowStep.createMany.mockResolvedValue({ count: 1 });
  });

  it('createWorkflow rejects invalid step configuration with the field named', async () => {
    const result = await createWorkflow('user_1', {
      name: 'W', triggerType: 'manual',
      steps: [{ type: 'action', name: 'Record activity', config: { actionType: 'add_note' }, order: 0 }],
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('content is required');
    expect(mocks.db.workflowDefinition.create).not.toHaveBeenCalled();
  });

  it('createWorkflow accepts a valid definition', async () => {
    mocks.db.workflowDefinition.create.mockResolvedValue({ id: 'wf_new' });
    const result = await createWorkflow('user_1', {
      name: 'W', triggerType: 'manual',
      steps: [{ type: 'action', name: 'Record', config: { actionType: 'add_note', content: 'ok' }, order: 0 }],
    });
    expect(result.success).toBe(true);
  });

  it('createWorkflow cannot create an ACTIVE workflow with no steps', async () => {
    const result = await createWorkflow('user_1', { name: 'W', triggerType: 'manual', status: 'active' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('no steps');
  });

  it('updateWorkflow rejects invalid steps on edit (cannot persist unexecutable config)', async () => {
    mocks.db.workflowDefinition.findFirst.mockResolvedValue({
      id: 'wf_1', userId: 'user_1', status: 'draft', version: 1, nodes: '[]', disabledBySubscription: false,
      workflowSteps: [],
    });
    const result = await updateWorkflow('wf_1', 'user_1', {
      steps: [{ type: 'action', name: 'Email', config: { actionType: 'send_email', subject: 'hi' }, order: 0 }],
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('body is required');
    expect(mocks.db.workflowDefinition.update).not.toHaveBeenCalled();
  });

  it('updateWorkflow enable gate: status→active is rejected for an invalid persisted definition', async () => {
    // Persisted definition: one add_note step WITHOUT content (legacy junk row)
    mocks.db.workflowDefinition.findFirst.mockResolvedValue({
      id: 'wf_1', userId: 'user_1', status: 'draft', version: 1, nodes: '[]', disabledBySubscription: false,
      workflowSteps: [
        { id: 's1', type: 'action', name: 'Record', config: JSON.stringify({ actionType: 'add_note' }), order: 0 },
      ],
    });
    const result = await updateWorkflow('wf_1', 'user_1', { status: 'active' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Cannot enable this workflow');
    expect(result.error).toContain('content is required');
    expect(mocks.db.workflowDefinition.update).not.toHaveBeenCalled();
  });

  it('updateWorkflow enable gate passes for a valid persisted definition', async () => {
    mocks.db.workflowDefinition.findFirst.mockResolvedValue({
      id: 'wf_1', userId: 'user_1', status: 'paused', version: 1, nodes: '[]', disabledBySubscription: false,
      workflowSteps: [
        { id: 's1', type: 'action', name: 'Record', config: JSON.stringify({ actionType: 'add_note', content: 'ok' }), order: 0 },
      ],
    });
    const result = await updateWorkflow('wf_1', 'user_1', { status: 'active' });
    expect(result.success).toBe(true);
  });

  it('activateWorkflow rejects enabling an empty/invalid workflow', async () => {
    mocks.db.workflowDefinition.findFirst.mockResolvedValue({
      id: 'wf_1', userId: 'user_1', status: 'draft', disabledBySubscription: false, nodes: '[]',
      workflowSteps: [],
    });
    const result = await activateWorkflow('wf_1', 'user_1');
    expect(result.success).toBe(false);
    expect(result.error).toContain('Cannot enable');
    expect(mocks.db.workflowDefinition.update).not.toHaveBeenCalled();
  });

  it('activateWorkflow rejects a foreign workflow (ownership)', async () => {
    mocks.db.workflowDefinition.findFirst.mockResolvedValue(null);
    const result = await activateWorkflow('wf_1', 'user_1');
    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });
});

// ═══════════════════════════════════════════════════════════════════
// 4. Template instantiation gate
// ═══════════════════════════════════════════════════════════════════

describe('Phase 3 — template instantiation gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.db.workflowTemplate.findFirst.mockReset();
    mocks.db.workflowTemplate.findUnique.mockReset();
  });

  it('rejects a template whose nodes would create an invalid workflow', async () => {
    mocks.db.workflowTemplate.findUnique.mockResolvedValue({
      id: 'tpl_bad', name: 'Bad', description: 'd', triggerType: 'manual',
      nodes: JSON.stringify([
        { id: 't', type: 'trigger' },
        { id: 's1', type: 'action', title: 'Email', config: { actionType: 'send_email', subject: 'hi' } },
      ]),
      edges: '[]', isPremium: false, usageCount: 0,
    });
    const result = await instantiateTemplate('tpl_bad', 'user_1');
    expect(result.success).toBe(false);
    expect(result.error).toContain('invalid workflow');
    expect(result.error).toContain('body is required');
    expect(mocks.db.workflowDefinition.create).not.toHaveBeenCalled();
  });

  it('accepts a template with a valid definition', async () => {
    mocks.db.workflowTemplate.findUnique.mockResolvedValue({
      id: 'tpl_ok', name: 'Ok', description: 'd', triggerType: 'manual',
      nodes: JSON.stringify([
        { id: 't', type: 'trigger' },
        { id: 's1', type: 'action', title: 'Record', config: { actionType: 'add_note', content: 'x' } },
      ]),
      edges: '[]', isPremium: false, usageCount: 0,
    });
    mocks.db.workflowDefinition.create.mockResolvedValue({ id: 'wf_tpl' });
    const result = await instantiateTemplate('tpl_ok', 'user_1');
    expect(result.success).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 5. Run Now pre-flight (422 before any execution record)
// ═══════════════════════════════════════════════════════════════════

describe('Phase 3 — Run Now pre-flight validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.executeWorkflow.mockReset();
  });

  it('returns 422 WORKFLOW_INVALID for a legacy contentless add_note workflow, with repair issues', async () => {
    mocks.db.workflowDefinition.findFirst.mockResolvedValue({
      id: 'wf_1', userId: 'user_1', name: 'Legacy', status: 'active', disabledBySubscription: false,
      nodes: JSON.stringify([
        { id: 't', type: 'trigger' },
        { id: 's1', type: 'action', title: 'Record activity', config: { actionType: 'add_note' } },
      ]),
      workflowSteps: [],
    });
    const { status, json } = await callExecuteRoute({ target: { mode: 'selected_leads', leadIds: ['lead_a'] } });
    expect(status).toBe(422);
    expect(json.code).toBe('WORKFLOW_INVALID');
    expect(json.issues[0].message).toContain('content is required');
    expect(mocks.executeWorkflow).not.toHaveBeenCalled();
  });

  it('returns 422 for a zero-step workflow instead of silently executing nothing', async () => {
    mocks.db.workflowDefinition.findFirst.mockResolvedValue({
      id: 'wf_1', userId: 'user_1', name: 'Empty', status: 'active', disabledBySubscription: false,
      nodes: '[]', workflowSteps: [],
    });
    const { status, json } = await callExecuteRoute({});
    expect(status).toBe(422);
    expect(json.code).toBe('WORKFLOW_INVALID');
    expect(json.issues[0].message).toContain('no steps');
    expect(mocks.executeWorkflow).not.toHaveBeenCalled();
  });

  it('returns 404 for a foreign workflow (backend ownership check)', async () => {
    mocks.db.workflowDefinition.findFirst.mockResolvedValue(null);
    const { status } = await callExecuteRoute({});
    expect(status).toBe(404);
    expect(mocks.executeWorkflow).not.toHaveBeenCalled();
  });

  it('a valid definition proceeds to execution (no 422)', async () => {
    mocks.db.workflowDefinition.findFirst.mockResolvedValue({
      id: 'wf_1', userId: 'user_1', name: 'Good', status: 'active', disabledBySubscription: false,
      nodes: JSON.stringify([
        { id: 't', type: 'trigger' },
        { id: 's1', type: 'action', title: 'Record', config: { actionType: 'add_note', content: 'ok' } },
      ]),
      workflowSteps: [],
    });
    mocks.executeWorkflow.mockResolvedValue({ executionId: 'exec_1', status: 'completed' });
    const { status } = await callExecuteRoute({});
    expect(status).toBe(202);
    expect(mocks.executeWorkflow).toHaveBeenCalled();
  });
});
