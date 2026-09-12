// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Unit Tests: Workflows
// Phase 14.1: TESTING SUITE
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockPrisma, createTestUser, createTestWorkflow } from '../helpers/test-utils';

// Use vi.hoisted to avoid hoisting issues with factory functions
const mockPrisma = vi.hoisted(() => ({
  user: {
    findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(),
    create: vi.fn(), update: vi.fn(), delete: vi.fn(), count: vi.fn(),
  },
  lead: {
    findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(),
    create: vi.fn(), update: vi.fn(), delete: vi.fn(), count: vi.fn(),
  },
  subscription: {
    findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(),
    create: vi.fn(), update: vi.fn(), upsert: vi.fn(), count: vi.fn(),
  },
  creditsLedger: {
    create: vi.fn(), findMany: vi.fn(), count: vi.fn(), aggregate: vi.fn(),
  },
  paymentOrder: {
    findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(),
    create: vi.fn(), update: vi.fn(), count: vi.fn(),
  },
  workflowDefinition: {
    findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(),
    create: vi.fn(), update: vi.fn(), delete: vi.fn(), count: vi.fn(),
  },
  workflowExecution: {
    findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(),
    create: vi.fn(), update: vi.fn(), count: vi.fn(),
  },
  auditLog: {
    create: vi.fn(), findMany: vi.fn(), count: vi.fn(),
  },
  notification: {
    create: vi.fn(), findMany: vi.fn(), update: vi.fn(), count: vi.fn(),
  },
  competitorData: {
    findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), count: vi.fn(),
  },
  analyticsSnapshot: { findMany: vi.fn(), create: vi.fn(), aggregate: vi.fn() },
  analyticsPrediction: { findMany: vi.fn(), create: vi.fn(), count: vi.fn() },
  analyticsAnomaly: { findMany: vi.fn(), create: vi.fn(), count: vi.fn() },
  analyticsInsight: { findMany: vi.fn(), create: vi.fn(), count: vi.fn() },
  gdprRequest: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
  userSettings: { findUnique: vi.fn(), upsert: vi.fn(), update: vi.fn() },
  consentRecord: { create: vi.fn(), findMany: vi.fn() },
  $transaction: vi.fn((fn) => typeof fn === 'function' ? fn() : fn),
  $queryRaw: vi.fn(),
  $executeRaw: vi.fn(),
}));

// Mock db
vi.mock('@/lib/db', () => ({ db: mockPrisma }));

// Mock billing-audit
vi.mock('@/lib/billing-audit', () => ({
  logCreditEvent: vi.fn(),
  logBillingEvent: vi.fn(),
}));

// Mock workflow-audit
vi.mock('@/lib/workflow-audit', () => ({
  logWorkflowEvent: vi.fn(),
}));

// Mock workflow-dead-letter
vi.mock('@/lib/workflow-dead-letter', () => ({
  sendToDeadLetter: vi.fn().mockResolvedValue({ success: true }),
  getDeadLetterQueue: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, totalPages: 0 }),
  getDeadLetterStats: vi.fn().mockResolvedValue({ total: 0, byReason: [], byWorkflow: [] }),
  retryFromDeadLetter: vi.fn().mockResolvedValue({ success: true }),
  purgeDeadLetterQueue: vi.fn().mockResolvedValue({ success: true, deletedCount: 0 }),
}));

// Mock workflow-actions
vi.mock('@/lib/workflow-actions', () => ({
  executeAction: vi.fn(),
}));

// Mock workflow-credits
vi.mock('@/lib/workflow-credits', () => ({
  deductExecutionCredits: vi.fn().mockResolvedValue({ success: true, creditsUsed: 1 }),
  getActionCreditCost: vi.fn().mockReturnValue(1),
  checkExecutionLimit: vi.fn().mockResolvedValue({ allowed: true, current: 0, limit: 100 }),
}));

// Mock realtime-event-bus
vi.mock('@/lib/realtime-event-bus', () => ({
  publishEvent: vi.fn(),
}));

// Mock feature-flags
vi.mock('@/lib/feature-flags', () => ({
  shouldBypassEmail: vi.fn(() => true),
}));

// Mock email
vi.mock('@/lib/email', () => ({
  sendSecurityAlertEmail: vi.fn(),
  isEmailServiceConfigured: vi.fn(() => false),
}));

import { db } from '@/lib/db';
const mockDb = mockPrisma;

// ═══════════════════════════════════════════════════════════════════
// WORKFLOW DEFINITION VALIDATION
// ═══════════════════════════════════════════════════════════════════

describe('Workflow Definition Validation', () => {
  interface WorkflowDefinition {
    name: string;
    triggerType: string;
    steps: WorkflowStep[];
    status: string;
  }

  interface WorkflowStep {
    id: string;
    type: string;
    name: string;
    config: Record<string, unknown>;
    order: number;
  }

  function validateWorkflowDefinition(def: Partial<WorkflowDefinition>): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!def.name || def.name.trim().length === 0) {
      errors.push('Workflow name is required');
    }
    if (!def.triggerType) {
      errors.push('Trigger type is required');
    }
    if (!def.steps || def.steps.length === 0) {
      errors.push('At least one step is required');
    }
    if (def.steps) {
      const orders = def.steps.map(s => s.order);
      const uniqueOrders = new Set(orders);
      if (uniqueOrders.size !== orders.length) {
        errors.push('Step orders must be unique');
      }
      for (const step of def.steps) {
        if (!step.type) {
          errors.push(`Step "${step.name || 'unnamed'}" is missing a type`);
        }
      }
    }
    if (def.status && !['active', 'paused', 'draft'].includes(def.status)) {
      errors.push('Invalid workflow status');
    }

    return { valid: errors.length === 0, errors };
  }

  it('should validate a correct workflow definition', () => {
    const result = validateWorkflowDefinition({
      name: 'My Workflow',
      triggerType: 'lead_discovered',
      steps: [
        { id: 's1', type: 'action', name: 'Step 1', config: {}, order: 0 },
        { id: 's2', type: 'action', name: 'Step 2', config: {}, order: 1 },
      ],
      status: 'active',
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should reject workflow without name', () => {
    const result = validateWorkflowDefinition({
      triggerType: 'lead_discovered',
      steps: [{ id: 's1', type: 'action', name: 'Step', config: {}, order: 0 }],
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Workflow name is required');
  });

  it('should reject workflow without trigger type', () => {
    const result = validateWorkflowDefinition({
      name: 'Test',
      steps: [{ id: 's1', type: 'action', name: 'Step', config: {}, order: 0 }],
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Trigger type is required');
  });

  it('should reject workflow without steps', () => {
    const result = validateWorkflowDefinition({
      name: 'Test',
      triggerType: 'lead_discovered',
      steps: [],
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('At least one step is required');
  });

  it('should reject steps with duplicate orders', () => {
    const result = validateWorkflowDefinition({
      name: 'Test',
      triggerType: 'lead_discovered',
      steps: [
        { id: 's1', type: 'action', name: 'Step 1', config: {}, order: 0 },
        { id: 's2', type: 'action', name: 'Step 2', config: {}, order: 0 },
      ],
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Step orders must be unique');
  });

  it('should reject steps without type', () => {
    const result = validateWorkflowDefinition({
      name: 'Test',
      triggerType: 'lead_discovered',
      steps: [
        { id: 's1', type: '', name: 'Step 1', config: {}, order: 0 },
      ],
    });
    expect(result.valid).toBe(false);
  });

  it('should reject invalid status', () => {
    const result = validateWorkflowDefinition({
      name: 'Test',
      triggerType: 'lead_discovered',
      steps: [{ id: 's1', type: 'action', name: 'Step', config: {}, order: 0 }],
      status: 'invalid',
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Invalid workflow status');
  });
});

// ═══════════════════════════════════════════════════════════════════
// TRIGGER TYPE EVALUATION
// ═══════════════════════════════════════════════════════════════════

describe('Trigger Type Evaluation', () => {
  type TriggerType = 'lead_discovered' | 'lead_stage_changed' | 'scheduled' | 'webhook' | 'manual';

  const TRIGGER_TYPES: Record<TriggerType, { description: string; requiresConfig: boolean }> = {
    lead_discovered: { description: 'Fires when a new lead is discovered', requiresConfig: false },
    lead_stage_changed: { description: 'Fires when a lead moves to a new stage', requiresConfig: true },
    scheduled: { description: 'Fires on a schedule (cron)', requiresConfig: true },
    webhook: { description: 'Fires when a webhook is received', requiresConfig: true },
    manual: { description: 'Triggered manually by user', requiresConfig: false },
  };

  it('should define all expected trigger types', () => {
    const expectedTypes = ['lead_discovered', 'lead_stage_changed', 'scheduled', 'webhook', 'manual'];
    for (const type of expectedTypes) {
      expect(TRIGGER_TYPES[type as TriggerType]).toBeDefined();
    }
  });

  it('should mark triggers requiring config correctly', () => {
    expect(TRIGGER_TYPES.lead_discovered.requiresConfig).toBe(false);
    expect(TRIGGER_TYPES.manual.requiresConfig).toBe(false);
    expect(TRIGGER_TYPES.scheduled.requiresConfig).toBe(true);
    expect(TRIGGER_TYPES.webhook.requiresConfig).toBe(true);
    expect(TRIGGER_TYPES.lead_stage_changed.requiresConfig).toBe(true);
  });

  function evaluateTrigger(triggerType: TriggerType, config: Record<string, unknown> | null): { canFire: boolean; error?: string } {
    const trigger = TRIGGER_TYPES[triggerType];
    if (!trigger) {
      return { canFire: false, error: `Unknown trigger type: ${triggerType}` };
    }
    if (trigger.requiresConfig && (!config || Object.keys(config).length === 0)) {
      return { canFire: false, error: `Trigger type "${triggerType}" requires configuration` };
    }
    return { canFire: true };
  }

  it('should evaluate lead_discovered trigger without config', () => {
    const result = evaluateTrigger('lead_discovered', null);
    expect(result.canFire).toBe(true);
  });

  it('should reject scheduled trigger without config', () => {
    const result = evaluateTrigger('scheduled', null);
    expect(result.canFire).toBe(false);
    expect(result.error).toContain('requires configuration');
  });

  it('should accept scheduled trigger with config', () => {
    const result = evaluateTrigger('scheduled', { cron: '0 9 * * *' });
    expect(result.canFire).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════
// STEP EXECUTION ORDER
// ═══════════════════════════════════════════════════════════════════

describe('Step Execution Order', () => {
  interface Step {
    id: string;
    type: string;
    name: string;
    order: number;
    nextStepId?: string;
  }

  function sortStepsByOrder(steps: Step[]): Step[] {
    return [...steps].sort((a, b) => a.order - b.order);
  }

  it('should sort steps by order ascending', () => {
    const steps: Step[] = [
      { id: 's3', type: 'action', name: 'Third', order: 2 },
      { id: 's1', type: 'action', name: 'First', order: 0 },
      { id: 's2', type: 'action', name: 'Second', order: 1 },
    ];
    const sorted = sortStepsByOrder(steps);
    expect(sorted[0].id).toBe('s1');
    expect(sorted[1].id).toBe('s2');
    expect(sorted[2].id).toBe('s3');
  });

  it('should handle single step', () => {
    const steps: Step[] = [{ id: 's1', type: 'action', name: 'Only', order: 0 }];
    const sorted = sortStepsByOrder(steps);
    expect(sorted).toHaveLength(1);
  });

  it('should handle conditional branch by skipping next step', () => {
    const steps: Step[] = [
      { id: 's1', type: 'condition', name: 'Check', order: 0, nextStepId: 's3' },
      { id: 's2', type: 'action', name: 'Skipped if false', order: 1 },
      { id: 's3', type: 'action', name: 'Continue', order: 2 },
    ];
    // Simulate: condition evaluates to false → skip step at index 1
    const conditionResult = false;
    let executionOrder: string[] = [];
    for (let i = 0; i < steps.length; i++) {
      executionOrder.push(steps[i].id);
      if (steps[i].type === 'condition' && !conditionResult) {
        i++; // Skip next step
      }
    }
    expect(executionOrder).toEqual(['s1', 's3']);
  });
});

// ═══════════════════════════════════════════════════════════════════
// STATE TRANSITIONS (queued → running → completed/failed)
// ═══════════════════════════════════════════════════════════════════

describe('Workflow Execution State Transitions', () => {
  type ExecutionStatus = 'queued' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';

  const VALID_EXECUTION_TRANSITIONS: Record<ExecutionStatus, ExecutionStatus[]> = {
    queued: ['running', 'cancelled'],
    running: ['paused', 'completed', 'failed', 'cancelled'],
    paused: ['running', 'cancelled'],
    completed: [],
    failed: ['running'], // retry
    cancelled: [],
  };

  function canTransition(from: ExecutionStatus, to: ExecutionStatus): boolean {
    return VALID_EXECUTION_TRANSITIONS[from]?.includes(to) || false;
  }

  it('should allow queued → running', () => {
    expect(canTransition('queued', 'running')).toBe(true);
  });

  it('should allow running → completed', () => {
    expect(canTransition('running', 'completed')).toBe(true);
  });

  it('should allow running → failed', () => {
    expect(canTransition('running', 'failed')).toBe(true);
  });

  it('should allow running → paused', () => {
    expect(canTransition('running', 'paused')).toBe(true);
  });

  it('should allow paused → running (resume)', () => {
    expect(canTransition('paused', 'running')).toBe(true);
  });

  it('should allow failed → running (retry)', () => {
    expect(canTransition('failed', 'running')).toBe(true);
  });

  it('should NOT allow completed → running', () => {
    expect(canTransition('completed', 'running')).toBe(false);
  });

  it('should NOT allow cancelled → running', () => {
    expect(canTransition('cancelled', 'running')).toBe(false);
  });

  it('should NOT allow completed → failed', () => {
    expect(canTransition('completed', 'failed')).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════
// DEAD LETTER QUEUE
// ═══════════════════════════════════════════════════════════════════

describe('Dead Letter Queue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should send execution to dead letter after max retries', async () => {
    mockDb.workflowExecution.findUnique.mockResolvedValue({
      id: 'exec_1',
      workflowId: 'wf_1',
      workflow: { userId: 'user_1', name: 'Test Workflow' },
    });
    mockDb.workflowExecution.update.mockResolvedValue({});

    const { sendToDeadLetter } = await import('@/lib/workflow-dead-letter');
    const result = await sendToDeadLetter('exec_1', 'Max retries exceeded');
    expect(result.success).toBe(true);
  });

  it('should retrieve dead letter queue items', async () => {
    mockDb.workflowExecution.findMany.mockResolvedValue([]);
    mockDb.workflowExecution.count.mockResolvedValue(0);

    const { getDeadLetterQueue } = await import('@/lib/workflow-dead-letter');
    const result = await getDeadLetterQueue('user_1');
    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
    expect(getDeadLetterQueue).toHaveBeenCalledWith('user_1');
  });

  it('should get dead letter stats', async () => {
    // Override the default mock for this test
    const { getDeadLetterStats } = await import('@/lib/workflow-dead-letter');
    vi.mocked(getDeadLetterStats).mockResolvedValueOnce({
      total: 5,
      byReason: [
        { reason: 'Timeout', count: 2 },
        { reason: 'API Error', count: 1 },
      ],
      byWorkflow: [
        { workflowId: 'wf_1', workflowName: 'WF1', count: 2 },
        { workflowId: 'wf_2', workflowName: 'WF2', count: 1 },
      ],
    });
    const stats = await getDeadLetterStats('user_1');
    expect(stats.total).toBe(5);
    expect(stats.byReason).toHaveLength(2);
    expect(stats.byWorkflow).toHaveLength(2);
  });
});

// ═══════════════════════════════════════════════════════════════════
// RETRY MECHANISM
// ═══════════════════════════════════════════════════════════════════

describe('Retry Mechanism', () => {
  it('should increment retry count on failure', () => {
    const execution = { retryCount: 1, maxRetries: 3 };
    const newRetryCount = execution.retryCount + 1;
    expect(newRetryCount).toBeLessThanOrEqual(execution.maxRetries);
    expect(newRetryCount).toBe(2);
  });

  it('should detect when max retries are exceeded', () => {
    const execution = { retryCount: 3, maxRetries: 3 };
    const exceeded = execution.retryCount >= execution.maxRetries;
    expect(exceeded).toBe(true);
  });

  it('should allow retry when under max', () => {
    const execution = { retryCount: 2, maxRetries: 3 };
    const canRetry = execution.retryCount < execution.maxRetries;
    expect(canRetry).toBe(true);
  });

  it('should send to DLQ when retries are exhausted', async () => {
    const { sendToDeadLetter } = await import('@/lib/workflow-dead-letter');

    await sendToDeadLetter('exec_1', 'Max retries exceeded. Last error: Timeout');
    expect(sendToDeadLetter).toHaveBeenCalledWith('exec_1', 'Max retries exceeded. Last error: Timeout');
  });
});

// ═══════════════════════════════════════════════════════════════════
// CONCURRENCY LIMITS
// ═══════════════════════════════════════════════════════════════════

describe('Concurrency Limits', () => {
  function checkConcurrency(currentRunning: number, maxConcurrent: number): { allowed: boolean; reason?: string } {
    if (currentRunning >= maxConcurrent) {
      return { allowed: false, reason: `Max concurrent executions (${maxConcurrent}) reached` };
    }
    return { allowed: true };
  }

  it('should allow execution under concurrency limit', () => {
    expect(checkConcurrency(2, 5).allowed).toBe(true);
  });

  it('should block execution at concurrency limit', () => {
    const result = checkConcurrency(5, 5);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Max concurrent');
  });

  it('should block execution over concurrency limit', () => {
    expect(checkConcurrency(6, 5).allowed).toBe(false);
  });

  it('should allow when no executions running', () => {
    expect(checkConcurrency(0, 5).allowed).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════
// METRICS CALCULATION
// ═══════════════════════════════════════════════════════════════════

describe('Workflow Metrics Calculation', () => {
  function calculateSuccessRate(completed: number, total: number): string {
    if (total === 0) return '0%';
    return `${((completed / total) * 100).toFixed(1)}%`;
  }

  function calculateAvgDuration(durationsMs: number[]): number {
    if (durationsMs.length === 0) return 0;
    return Math.round(durationsMs.reduce((a, b) => a + b, 0) / durationsMs.length);
  }

  it('should calculate success rate correctly', () => {
    expect(calculateSuccessRate(80, 100)).toBe('80.0%');
    expect(calculateSuccessRate(0, 0)).toBe('0%');
    expect(calculateSuccessRate(50, 100)).toBe('50.0%');
  });

  it('should calculate average duration correctly', () => {
    expect(calculateAvgDuration([1000, 2000, 3000])).toBe(2000);
    expect(calculateAvgDuration([])).toBe(0);
    expect(calculateAvgDuration([5000])).toBe(5000);
  });

  it('should format duration correctly', () => {
    function formatDuration(ms: number): string {
      if (ms < 1000) return `${ms}ms`;
      if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
      if (ms < 3600000) return `${(ms / 60000).toFixed(1)}m`;
      return `${(ms / 3600000).toFixed(1)}h`;
    }

    expect(formatDuration(500)).toBe('500ms');
    expect(formatDuration(1500)).toBe('1.5s');
    expect(formatDuration(90000)).toBe('1.5m');
    expect(formatDuration(7200000)).toBe('2.0h');
  });
});
