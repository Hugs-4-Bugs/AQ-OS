// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Unit Tests: Credit Service
// Phase 12: Testing
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Create mock DB with vi.hoisted for proper hoisting
const { mockDb } = vi.hoisted(() => {
  const mockDb = {
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    creditsLedger: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      aggregate: vi.fn(),
    },
    creditAddon: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    $transaction: vi.fn((fn: any) => typeof fn === 'function' ? fn(mockDb) : fn),
  };
  return { mockDb };
});

vi.mock('@/lib/db', () => ({ db: mockDb }));

vi.mock('@/lib/billing-audit', () => ({
  logCreditEvent: vi.fn(),
}));

import {
  deductCredits,
  addCredits,
  getCreditBalance,
  checkCreditSufficiency,
  refundCredits,
  getActionCost,
  getAllCreditCosts,
  CREDIT_COSTS,
} from '@/lib/credit-service';

// ═══════════════════════════════════════════════════════════════════
// CREDIT COST MAPPING
// ═══════════════════════════════════════════════════════════════════

describe('Credit Cost Mapping', () => {
  it('should have costs for all defined actions', () => {
    const actions = ['lead_discovery', 'deep_analysis', 'outreach_message', 'outreach_sequence', 'sales_coaching', 'proposal_generation', 'competitor_analysis', 'data_export'];
    actions.forEach(action => {
      expect(CREDIT_COSTS[action as keyof typeof CREDIT_COSTS]).toBeGreaterThan(0);
    });
  });

  it('getActionCost should return cost for known actions', () => {
    expect(getActionCost('lead_discovery')).toBe(1);
    expect(getActionCost('deep_analysis')).toBe(5);
    expect(getActionCost('outreach_message')).toBe(2);
    expect(getActionCost('proposal_generation')).toBe(10);
  });

  it('getActionCost should return 0 for unknown actions', () => {
    expect(getActionCost('unknown_action' as any)).toBe(0);
  });

  it('getAllCreditCosts should return a copy of costs', () => {
    const costs = getAllCreditCosts();
    expect(costs).toEqual(CREDIT_COSTS);
    // Modifying the copy should not affect the original
    costs.lead_discovery = 999;
    expect(CREDIT_COSTS.lead_discovery).toBe(1);
  });

  it('lead_discovery should be the cheapest action', () => {
    expect(CREDIT_COSTS.lead_discovery).toBe(1);
  });

  it('proposal_generation should be the most expensive action', () => {
    const maxCost = Math.max(...Object.values(CREDIT_COSTS));
    expect(CREDIT_COSTS.proposal_generation).toBe(maxCost);
  });
});

// ═══════════════════════════════════════════════════════════════════
// CREDIT DEDUCTION
// ═══════════════════════════════════════════════════════════════════

describe('deductCredits', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should reject deduction with cost <= 0', async () => {
    const result = await deductCredits({ userId: 'user_1', action: 'test', cost: 0 });
    expect(result.success).toBe(false);
    expect(result.error).toContain('greater than 0');
  });

  it('should reject deduction with negative cost', async () => {
    const result = await deductCredits({ userId: 'user_1', action: 'test', cost: -5 });
    expect(result.success).toBe(false);
    expect(result.error).toContain('greater than 0');
  });

  it('should successfully deduct credits when balance is sufficient', async () => {
    // Mock the $transaction callback
    mockDb.$transaction.mockImplementation(async (fn: any) => {
      const tx = {
        user: {
          findUnique: vi.fn().mockResolvedValue({ credits: 100, plan: 'pro' }),
          update: vi.fn().mockResolvedValue({}),
        },
        creditsLedger: {
          create: vi.fn().mockResolvedValue({ id: 'ledger_1' }),
        },
      };
      return fn(tx);
    });

    const result = await deductCredits({ userId: 'user_1', action: 'lead_discovery', cost: 1 });
    expect(result.success).toBe(true);
    expect(result.newBalance).toBe(99);
  });

  it('should reject deduction when balance is insufficient', async () => {
    mockDb.$transaction.mockImplementation(async (fn: any) => {
      const tx = {
        user: {
          findUnique: vi.fn().mockResolvedValue({ credits: 3, plan: 'pro' }),
          update: vi.fn(),
        },
        creditsLedger: {
          create: vi.fn(),
        },
      };
      return fn(tx);
    });

    const result = await deductCredits({ userId: 'user_1', action: 'deep_analysis', cost: 5 });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Insufficient credits');
  });

  it('should handle idempotency key — return existing result if already processed', async () => {
    mockDb.creditsLedger.findFirst.mockResolvedValue({
      id: 'ledger_existing',
      balance: 95,
    });

    const result = await deductCredits({
      userId: 'user_1',
      action: 'lead_discovery',
      cost: 5,
      idempotencyKey: 'idem_123',
    });

    expect(result.success).toBe(true);
    expect(result.newBalance).toBe(95);
    expect(result.alreadyProcessed).toBe(true);
    expect(result.ledgerEntryId).toBe('ledger_existing');
  });

  it('should handle user not found in transaction', async () => {
    mockDb.$transaction.mockImplementation(async (fn: any) => {
      const tx = {
        user: {
          findUnique: vi.fn().mockResolvedValue(null),
          update: vi.fn(),
        },
        creditsLedger: {
          create: vi.fn(),
        },
      };
      return fn(tx);
    });

    const result = await deductCredits({ userId: 'nonexistent', action: 'lead_discovery', cost: 1 });
    expect(result.success).toBe(false);
    // The error is wrapped as "Failed to deduct credits" in the catch block
    expect(result.error).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════════
// ADD CREDITS
// ═══════════════════════════════════════════════════════════════════

describe('addCredits', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should reject adding credits with amount <= 0', async () => {
    const result = await addCredits({ userId: 'user_1', amount: 0, source: 'test' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('greater than 0');
  });

  it('should successfully add credits', async () => {
    mockDb.$transaction.mockImplementation(async (fn: any) => {
      const tx = {
        user: {
          findUnique: vi.fn().mockResolvedValue({ credits: 100 }),
          update: vi.fn().mockResolvedValue({}),
        },
        creditsLedger: {
          create: vi.fn().mockResolvedValue({ id: 'ledger_add_1' }),
        },
      };
      return fn(tx);
    });

    const result = await addCredits({ userId: 'user_1', amount: 50, source: 'addon_purchase' });
    expect(result.success).toBe(true);
    expect(result.newBalance).toBe(150);
    expect(result.ledgerEntryId).toBe('ledger_add_1');
  });

  it('should detect duplicate within 5 minutes', async () => {
    mockDb.creditsLedger.findFirst.mockResolvedValue({
      id: 'ledger_dup',
      balance: 150,
    });

    const result = await addCredits({
      userId: 'user_1',
      amount: 50,
      source: 'addon_purchase',
      referenceId: 'ref_123',
    });

    expect(result.success).toBe(true);
    expect(result.duplicate).toBe(true);
    expect(result.newBalance).toBe(150);
  });

  it('should handle user not found', async () => {
    mockDb.$transaction.mockImplementation(async (fn: any) => {
      const tx = {
        user: {
          findUnique: vi.fn().mockResolvedValue(null),
          update: vi.fn(),
        },
        creditsLedger: {
          create: vi.fn(),
        },
      };
      return fn(tx);
    });

    const result = await addCredits({ userId: 'nonexistent', amount: 50, source: 'test' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Failed to add credits');
  });
});

// ═══════════════════════════════════════════════════════════════════
// CREDIT BALANCE
// ═══════════════════════════════════════════════════════════════════

describe('getCreditBalance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return correct balance for existing user', async () => {
    mockDb.user.findUnique.mockResolvedValue({
      credits: 500,
      creditsMonthly: 450,
      rolloverCredits: 50,
      plan: 'pro',
    });
    mockDb.creditAddon.findMany.mockResolvedValue([]);

    const result = await getCreditBalance('user_1');
    expect(result.total).toBe(500);
    expect(result.monthly).toBe(450);
    expect(result.rollover).toBe(50);
    expect(result.addons).toBe(0);
    expect(result.plan).toBe('pro');
  });

  it('should include addon credits in balance', async () => {
    mockDb.user.findUnique.mockResolvedValue({
      credits: 600,
      creditsMonthly: 500,
      rolloverCredits: 50,
      plan: 'pro',
    });
    mockDb.creditAddon.findMany.mockResolvedValue([
      { credits: 100 },
      { credits: 50 },
    ]);

    const result = await getCreditBalance('user_1');
    expect(result.addons).toBe(150);
  });

  it('should return zeroed balance for non-existent user', async () => {
    mockDb.user.findUnique.mockResolvedValue(null);

    const result = await getCreditBalance('nonexistent');
    expect(result.total).toBe(0);
    expect(result.monthly).toBe(0);
    expect(result.rollover).toBe(0);
    expect(result.addons).toBe(0);
    expect(result.plan).toBe('free');
  });
});

// ═══════════════════════════════════════════════════════════════════
// CREDIT SUFFICIENCY CHECK
// ═══════════════════════════════════════════════════════════════════

describe('checkCreditSufficiency', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return sufficient=true when user has enough credits', async () => {
    mockDb.user.findUnique.mockResolvedValue({ credits: 100 });

    const result = await checkCreditSufficiency('user_1', 50);
    expect(result.sufficient).toBe(true);
    expect(result.balance).toBe(100);
    expect(result.shortfall).toBe(0);
  });

  it('should return sufficient=false when user lacks credits', async () => {
    mockDb.user.findUnique.mockResolvedValue({ credits: 3 });

    const result = await checkCreditSufficiency('user_1', 10);
    expect(result.sufficient).toBe(false);
    expect(result.balance).toBe(3);
    expect(result.shortfall).toBe(7);
  });

  it('should handle non-existent user (0 balance)', async () => {
    mockDb.user.findUnique.mockResolvedValue(null);

    const result = await checkCreditSufficiency('nonexistent', 10);
    expect(result.sufficient).toBe(false);
    expect(result.balance).toBe(0);
    expect(result.shortfall).toBe(10);
  });

  it('should return sufficient=true for exact balance match', async () => {
    mockDb.user.findUnique.mockResolvedValue({ credits: 10 });

    const result = await checkCreditSufficiency('user_1', 10);
    expect(result.sufficient).toBe(true);
    expect(result.shortfall).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════
// CREDIT REFUND
// ═══════════════════════════════════════════════════════════════════

describe('refundCredits', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should reject refund with amount <= 0', async () => {
    const result = await refundCredits({
      userId: 'user_1',
      amount: 0,
      originalAction: 'lead_discovery',
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('greater than 0');
  });

  it('should successfully refund credits', async () => {
    mockDb.$transaction.mockImplementation(async (fn: any) => {
      const tx = {
        user: {
          findUnique: vi.fn().mockResolvedValue({ credits: 95 }),
          update: vi.fn().mockResolvedValue({}),
        },
        creditsLedger: {
          create: vi.fn().mockResolvedValue({ id: 'ledger_refund_1' }),
        },
      };
      return fn(tx);
    });

    const result = await refundCredits({
      userId: 'user_1',
      amount: 5,
      originalAction: 'deep_analysis',
    });
    expect(result.success).toBe(true);
    expect(result.newBalance).toBe(100);
  });

  it('should handle user not found during refund', async () => {
    mockDb.$transaction.mockImplementation(async (fn: any) => {
      const tx = {
        user: {
          findUnique: vi.fn().mockResolvedValue(null),
          update: vi.fn(),
        },
        creditsLedger: {
          create: vi.fn(),
        },
      };
      return fn(tx);
    });

    const result = await refundCredits({
      userId: 'nonexistent',
      amount: 5,
      originalAction: 'deep_analysis',
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Failed to refund credits');
  });
});

// ═══════════════════════════════════════════════════════════════════
// CREDIT WARNING THRESHOLDS (tested via deduction)
// ═══════════════════════════════════════════════════════════════════

describe('Credit Warning Thresholds', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should log credit_zero when balance reaches 0 after deduction', async () => {
    const { logCreditEvent } = await import('@/lib/billing-audit');

    mockDb.$transaction.mockImplementation(async (fn: any) => {
      const tx = {
        user: {
          findUnique: vi.fn().mockResolvedValue({ credits: 5, plan: 'pro' }),
          update: vi.fn().mockResolvedValue({}),
        },
        creditsLedger: {
          create: vi.fn().mockResolvedValue({ id: 'ledger_1' }),
        },
      };
      return fn(tx);
    });

    await deductCredits({ userId: 'user_1', action: 'deep_analysis', cost: 5 });

    // Should have logged credit_zero event
    expect(logCreditEvent).toHaveBeenCalledWith('user_1', 'credit_zero', expect.objectContaining({
      amount: 0,
      balance: 0,
    }));
  });

  it('should log credit_warning when balance is between 1 and 10', async () => {
    const { logCreditEvent } = await import('@/lib/billing-audit');

    mockDb.$transaction.mockImplementation(async (fn: any) => {
      const tx = {
        user: {
          findUnique: vi.fn().mockResolvedValue({ credits: 8, plan: 'pro' }),
          update: vi.fn().mockResolvedValue({}),
        },
        creditsLedger: {
          create: vi.fn().mockResolvedValue({ id: 'ledger_1' }),
        },
      };
      return fn(tx);
    });

    await deductCredits({ userId: 'user_1', action: 'lead_discovery', cost: 1 });

    expect(logCreditEvent).toHaveBeenCalledWith('user_1', 'credit_warning', expect.objectContaining({
      balance: 7,
    }));
  });
});
