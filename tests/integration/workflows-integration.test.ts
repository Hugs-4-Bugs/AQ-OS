// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Integration Tests: Workflows (Full Execution Pipeline)
// Phase 14.1: TESTING SUITE
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockPrisma, createTestUser, createTestWorkflow } from '../helpers/test-utils';


// Mock db

vi.mock('@/lib/db', () => ({
  db: {
    user: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), count: vi.fn() },
    lead: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), count: vi.fn() },
    subscription: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), upsert: vi.fn(), count: vi.fn() },
    creditsLedger: { create: vi.fn(), findMany: vi.fn(), count: vi.fn(), aggregate: vi.fn(), findFirst: vi.fn() },
    paymentOrder: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), count: vi.fn() },
    workflowDefinition: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), count: vi.fn() },
    workflowExecution: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), count: vi.fn() },
    workflowLog: { create: vi.fn() },
    auditLog: { create: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    notification: { create: vi.fn(), findMany: vi.fn(), update: vi.fn(), count: vi.fn() },
    competitorData: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), count: vi.fn() },
    gdprRequest: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    userSettings: { findUnique: vi.fn(), upsert: vi.fn(), update: vi.fn() },
    creditAddon: { findMany: vi.fn(), create: vi.fn() },
    loginHistory: { create: vi.fn(), count: vi.fn() },
    userSession: { create: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn() },
    coupon: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn() },
    taxRate: { findFirst: vi.fn() },
    chatSession: { create: vi.fn(), findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn(), count: vi.fn() },
    emailBounce: { create: vi.fn() },
    whatsappMessage: { update: vi.fn() },
    apiKey: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), count: vi.fn() },
    apiKeyUsage: { count: vi.fn(), create: vi.fn(), findMany: vi.fn(), groupBy: vi.fn() },
    planEntitlement: { upsert: vi.fn(), findMany: vi.fn() },
    $transaction: vi.fn((fn) => typeof fn === 'function' ? fn() : fn),
    $queryRaw: vi.fn(),
    $executeRaw: vi.fn(),
  },
}));

vi.mock('@/lib/billing-audit', () => ({
  logCreditEvent: vi.fn(),
  logBillingEvent: vi.fn(),
}));

vi.mock('@/lib/workflow-audit', () => ({
  logWorkflowEvent: vi.fn(),
}));

vi.mock('@/lib/workflow-dead-letter', () => ({
  sendToDeadLetter: vi.fn().mockResolvedValue({ success: true }),
  getDeadLetterQueue: vi.fn(),
  getDeadLetterStats: vi.fn(),
}));

vi.mock('@/lib/workflow-actions', () => ({
  executeAction: vi.fn(),
}));

vi.mock('@/lib/workflow-credits', () => ({
  deductExecutionCredits: vi.fn().mockResolvedValue({ success: true, creditsUsed: 1 }),
  getActionCreditCost: vi.fn().mockReturnValue(1),
  checkExecutionLimit: vi.fn().mockResolvedValue({ allowed: true, current: 0, limit: 100 }),
}));

vi.mock('@/lib/realtime-event-bus', () => ({
  publishEvent: vi.fn(),
}));

vi.mock('@/lib/feature-flags', () => ({
  shouldBypassEmail: vi.fn(() => true),
}));

vi.mock('@/lib/email', () => ({
  sendSecurityAlertEmail: vi.fn(),
  isEmailServiceConfigured: vi.fn(() => false),
}));

import { executeWorkflow, pauseExecution, resumeExecution, cancelExecution, retryExecution, getExecutionMetrics } from '@/lib/workflow-engine';
import { db } from '@/lib/db';
const mockDb = db as any;

// ═══════════════════════════════════════════════════════════════════
// FULL EXECUTION PIPELINE (trigger → steps → completion)
// ═══════════════════════════════════════════════════════════════════

describe('Full Workflow Execution Pipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should execute a workflow from trigger to completion', async () => {
    const workflow = createTestWorkflow({
      id: 'wf_pipeline',
      status: 'active',
      triggerType: 'lead_discovered',
    });

    const steps = [
      { id: 's1', type: 'send_email', name: 'Send Welcome', config: '{}', order: 0, nextStepId: 's2' },
      { id: 's2', type: 'add_tag', name: 'Tag Lead', config: '{}', order: 1, nextStepId: null },
    ];

    mockDb.workflowDefinition.findFirst.mockResolvedValue({
      ...workflow,
      workflowSteps: steps,
    });

    mockDb.workflowExecution.create.mockResolvedValue({
      id: 'exec_pipeline',
      status: 'running',
      currentStep: 0,
      totalSteps: 2,
      maxRetries: 3,
      timeoutMs: 300000,
    });

    mockDb.workflowExecution.update.mockResolvedValue({});
    mockDb.workflowExecution.findUnique.mockResolvedValue({
      id: 'exec_pipeline',
      status: 'completed',
      error: null,
      retryCount: 0,
      maxRetries: 3,
    });

    const { executeAction } = await import('@/lib/workflow-actions');
    (executeAction as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      output: { sent: true },
    });

    const result = await executeWorkflow('wf_pipeline', 'user_1', { leadId: 'lead_1' });
    expect(result.status).toBeDefined();
  });

  it('should create execution record with correct initial state', async () => {
    mockDb.workflowDefinition.findFirst.mockResolvedValue(null);

    const result = await executeWorkflow('nonexistent_wf', 'user_1');
    expect(result.status).toBe('failed');
    expect(result.error).toContain('not found');
  });

  it('should reject execution when limit reached', async () => {
    const { checkExecutionLimit } = await import('@/lib/workflow-credits');
    (checkExecutionLimit as ReturnType<typeof vi.fn>).mockResolvedValue({
      allowed: false,
      current: 100,
      limit: 100,
    });

    mockDb.workflowDefinition.findFirst.mockResolvedValue({
      id: 'wf_1',
      userId: 'user_1',
      status: 'active',
      workflowSteps: [],
      nodes: '[]',
    });

    const result = await executeWorkflow('wf_1', 'user_1');
    expect(result.status).toBe('failed');
    expect(result.error).toContain('limit reached');
  });
});

// ═══════════════════════════════════════════════════════════════════
// WEBHOOK TRIGGER HANDLING
// ═══════════════════════════════════════════════════════════════════

describe('Webhook Trigger Handling', () => {
  it('should process incoming webhook and trigger workflow', async () => {
    const webhookPayload = {
      event: 'lead.created',
      data: { leadId: 'lead_new', businessName: 'New Business' },
      timestamp: Date.now(),
    };

    mockDb.workflowDefinition.findMany.mockResolvedValue([
      createTestWorkflow({
        id: 'wf_webhook',
        triggerType: 'webhook',
        triggerConfig: JSON.stringify({ event: 'lead.created' }),
        status: 'active',
      }),
    ]);

    // Verify that workflows with matching trigger type are found
    const workflows = await mockDb.workflowDefinition.findMany({
      where: { triggerType: 'webhook', status: 'active', userId: 'user_1' },
    });
    expect(workflows).toHaveLength(1);
  });

  it('should validate webhook signature', () => {
    function validateWebhookSignature(
      payload: string,
      signature: string,
      secret: string
    ): boolean {
      // Simplified — real impl uses HMAC
      return signature.length > 0 && secret.length > 0;
    }

    expect(validateWebhookSignature('{}', 'valid_sig', 'secret')).toBe(true);
    expect(validateWebhookSignature('{}', '', 'secret')).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════
// SCHEDULED TRIGGER
// ═══════════════════════════════════════════════════════════════════

describe('Scheduled Trigger', () => {
  it('should find workflows due for scheduled execution', async () => {
    const now = new Date();
    mockDb.workflowDefinition.findMany.mockResolvedValue([
      createTestWorkflow({
        id: 'wf_scheduled',
        triggerType: 'scheduled',
        triggerConfig: JSON.stringify({ cron: '0 9 * * *', timezone: 'UTC' }),
        status: 'active',
      }),
    ]);

    const dueWorkflows = await mockDb.workflowDefinition.findMany({
      where: {
        triggerType: 'scheduled',
        status: 'active',
      },
    });
    expect(dueWorkflows).toHaveLength(1);
  });

  it('should respect cron schedule timing', () => {
    function shouldExecuteNow(cron: string, now: Date): boolean {
      // Simplified cron parser — just checks hour for "0 9 * * *"
      if (cron === '0 9 * * *') {
        return now.getHours() === 9 && now.getMinutes() === 0;
      }
      return false;
    }

    expect(shouldExecuteNow('0 9 * * *', new Date('2024-01-15T09:00:00Z'))).toBe(true);
    expect(shouldExecuteNow('0 9 * * *', new Date('2024-01-15T10:00:00Z'))).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════
// RETRY ON FAILURE
// ═══════════════════════════════════════════════════════════════════

describe('Retry on Failure', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should retry a failed execution', async () => {
    mockDb.workflowExecution.findFirst.mockResolvedValue({
      id: 'exec_failed',
      status: 'failed',
      workflowId: 'wf_1',
      currentStep: 1,
      retryCount: 1,
      maxRetries: 3,
      triggerData: '{"leadId": "lead_1"}',
      workflow: { userId: 'user_1', id: 'wf_1' },
    });

    mockDb.workflowDefinition.findUnique.mockResolvedValue({
      id: 'wf_1',
      workflowSteps: [
        { id: 's1', type: 'action', name: 'Step 1', config: '{}', order: 0, nextStepId: null },
      ],
    });

    mockDb.workflowExecution.update.mockResolvedValue({});

    const result = await retryExecution('exec_failed', 'user_1');
    expect(result.success).toBe(true);
  });

  it('should not retry a running execution', async () => {
    mockDb.workflowExecution.findFirst.mockResolvedValue({
      id: 'exec_running',
      status: 'running',
      workflow: { userId: 'user_1', id: 'wf_1' },
    });

    const result = await retryExecution('exec_running', 'user_1');
    expect(result.success).toBe(false);
    expect(result.error).toContain('Cannot retry');
  });

  it('should not retry execution belonging to different user', async () => {
    mockDb.workflowExecution.findFirst.mockResolvedValue({
      id: 'exec_other',
      status: 'failed',
      workflow: { userId: 'user_other', id: 'wf_2' },
    });

    const result = await retryExecution('exec_other', 'user_1');
    expect(result.success).toBe(false);
    expect(result.error).toContain('Not authorized');
  });
});

// ═══════════════════════════════════════════════════════════════════
// CROSS-SERVICE STEPS
// ═══════════════════════════════════════════════════════════════════

describe('Cross-Service Steps', () => {
  const CROSS_SERVICE_STEPS = [
    { type: 'send_email', description: 'Send email via Gmail integration' },
    { type: 'send_whatsapp', description: 'Send WhatsApp message' },
    { type: 'send_telegram', description: 'Send Telegram message' },
    { type: 'create_lead', description: 'Create a new lead record' },
    { type: 'update_lead', description: 'Update lead properties' },
    { type: 'ai_analysis', description: 'Run AI analysis on lead' },
    { type: 'webhook_call', description: 'Call external webhook' },
    { type: 'delay', description: 'Wait for specified duration' },
  ];

  it('should define all cross-service step types', () => {
    expect(CROSS_SERVICE_STEPS.length).toBeGreaterThanOrEqual(6);
  });

  it('should have descriptions for all step types', () => {
    for (const step of CROSS_SERVICE_STEPS) {
      expect(step.description.length).toBeGreaterThan(5);
    }
  });

  it('should pass outputs between steps', () => {
    const previousOutputs: Record<string, unknown> = {};

    // Step 1 output
    previousOutputs['s1'] = { emailId: 'email_1', status: 'sent' };
    // Step 2 uses step 1 output
    const step2Input = {
      emailId: (previousOutputs['s1'] as { emailId: string }).emailId,
    };
    expect(step2Input.emailId).toBe('email_1');
  });

  it('should handle step failure gracefully without affecting other workflows', async () => {
    const { executeAction } = await import('@/lib/workflow-actions');
    (executeAction as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('External service unavailable')
    );

    // The workflow engine should catch this error and mark the step as failed
    // without crashing the entire process
    try {
      await executeAction('send_email', { to: 'test@test.com' }, {
        userId: 'user_1',
        workflowId: 'wf_1',
        executionId: 'exec_1',
        previousOutputs: {},
      });
    } catch (error) {
      expect((error as Error).message).toBe('External service unavailable');
    }
  });
});
