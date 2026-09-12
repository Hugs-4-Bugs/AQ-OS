// ═══════════════════════════════════════════════════════════════════
// Unit Tests: Credit Service (src/lib/credit-service.ts)
// Tests core credit operations: deduct, add, refund, balance, sufficiency
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the billing audit module
vi.mock('@/lib/billing-audit', () => ({
  logCreditEvent: vi.fn().mockResolvedValue(undefined),
}));

// Mock the entitlement-service module
vi.mock('@/lib/entitlement-service', () => ({
  PLAN_CREDITS: { free: 50, pro: 500, elite: 2000 },
}));

// Use vi.hoisted to create mockPrisma before vi.mock hoisting
const mockPrisma = vi.hoisted(() => {
  const mp = {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    creditsLedger: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    creditAddon: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
    },
    $transaction: vi.fn((fn: unknown) => {
      if (typeof fn === 'function') {
        return fn(mp);
      }
      return Promise.resolve(fn);
    }),
  };
  return mp;
});

vi.mock('@/lib/db', () => ({
  db: mockPrisma,
}));

// Import after mocking
import { deductCredits, addCredits, getCreditBalance, checkCreditSufficiency, refundCredits, addCreditAddon, getActionCost, getAllCreditCosts } from '@/lib/credit-service';

describe('credit-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── deductCredits ──────────────────────────────────────────────

  describe('deductCredits', () => {
    it('should deduct credits successfully when balance is sufficient', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ credits: 50, plan: 'free' });
      mockPrisma.user.update.mockResolvedValue({ credits: 49 });
      mockPrisma.creditsLedger.create.mockImplementation((args: { data: { userId: string; action: string; credits: number; balance: number } }) => {
        const entry = { id: 'ledger-1', ...args.data };
        return entry;
      });

      const result = await deductCredits({
        userId: 'user-1',
        action: 'lead_discovery',
        cost: 1,
      });

      expect(result.success).toBe(true);
      expect(result.newBalance).toBe(49);
      expect(result.ledgerEntryId).toBe('ledger-1');
    });

    it('should fail when credits are insufficient', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ credits: 0.5, plan: 'free' });

      const result = await deductCredits({
        userId: 'user-1',
        action: 'lead_discovery',
        cost: 1,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Insufficient credits');
    });

    it('should fail when cost is 0 or negative', async () => {
      const result = await deductCredits({
        userId: 'user-1',
        action: 'free_action',
        cost: 0,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('greater than 0');
    });

    it('should return alreadyProcessed when idempotency key matches', async () => {
      mockPrisma.creditsLedger.findFirst.mockResolvedValue({
        id: 'existing-ledger-1',
        balance: 45,
        action: 'lead_discovery_idempotent_key123',
      });

      const result = await deductCredits({
        userId: 'user-1',
        action: 'lead_discovery',
        cost: 1,
        idempotencyKey: 'key123',
      });

      expect(result.success).toBe(true);
      expect(result.alreadyProcessed).toBe(true);
      expect(result.newBalance).toBe(45);
    });

    it('should fail when user is not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const result = await deductCredits({
        userId: 'nonexistent',
        action: 'lead_discovery',
        cost: 1,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  // ── addCredits ─────────────────────────────────────────────────

  describe('addCredits', () => {
    it('should add credits successfully', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ credits: 50 });
      mockPrisma.user.update.mockResolvedValue({ credits: 100 });
      mockPrisma.creditsLedger.create.mockImplementation((args: { data: { userId: string; action: string; credits: number; balance: number } }) => {
        return { id: 'ledger-add-1', ...args.data };
      });
      mockPrisma.creditsLedger.findFirst.mockResolvedValue(null);

      const result = await addCredits({
        userId: 'user-1',
        amount: 50,
        source: 'monthly_reset',
      });

      expect(result.success).toBe(true);
      expect(result.newBalance).toBe(100);
    });

    it('should fail when amount is 0 or negative', async () => {
      const result = await addCredits({
        userId: 'user-1',
        amount: 0,
        source: 'test',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('greater than 0');
    });

    it('should detect duplicate within 5 minutes', async () => {
      mockPrisma.creditsLedger.findFirst.mockResolvedValue({
        id: 'existing-1',
        balance: 100,
      });

      const result = await addCredits({
        userId: 'user-1',
        amount: 50,
        source: 'monthly_reset',
        referenceId: 'ref-1',
      });

      expect(result.success).toBe(true);
      expect(result.duplicate).toBe(true);
    });

    it('should fail when user is not found', async () => {
      mockPrisma.creditsLedger.findFirst.mockResolvedValue(null);
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const result = await addCredits({
        userId: 'nonexistent',
        amount: 50,
        source: 'monthly_reset',
      });

      expect(result.success).toBe(false);
    });
  });

  // ── getCreditBalance ──────────────────────────────────────────

  describe('getCreditBalance', () => {
    it('should return correct balance breakdown', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        credits: 150,
        creditsMonthly: 100,
        rolloverCredits: 30,
        plan: 'pro',
      });
      mockPrisma.creditAddon.findMany.mockResolvedValue([
        { credits: 20, expiresAt: new Date(Date.now() + 86400000) },
      ]);

      const balance = await getCreditBalance('user-1');

      expect(balance.total).toBe(150);
      expect(balance.monthly).toBe(100);
      expect(balance.rollover).toBe(30);
      expect(balance.addons).toBe(20);
      expect(balance.plan).toBe('pro');
    });

    it('should return zeros for nonexistent user', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const balance = await getCreditBalance('nonexistent');

      expect(balance.total).toBe(0);
      expect(balance.monthly).toBe(0);
      expect(balance.rollover).toBe(0);
      expect(balance.addons).toBe(0);
      expect(balance.plan).toBe('free');
    });
  });

  // ── checkCreditSufficiency ────────────────────────────────────

  describe('checkCreditSufficiency', () => {
    it('should return sufficient when balance >= amount', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ credits: 50 });

      const result = await checkCreditSufficiency('user-1', 10);

      expect(result.sufficient).toBe(true);
      expect(result.balance).toBe(50);
      expect(result.shortfall).toBe(0);
    });

    it('should return insufficient when balance < amount', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ credits: 5 });

      const result = await checkCreditSufficiency('user-1', 10);

      expect(result.sufficient).toBe(false);
      expect(result.shortfall).toBe(5);
    });

    it('should handle nonexistent user', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const result = await checkCreditSufficiency('nonexistent', 10);

      expect(result.sufficient).toBe(false);
      expect(result.balance).toBe(0);
      expect(result.shortfall).toBe(10);
    });
  });

  // ── refundCredits ──────────────────────────────────────────────

  describe('refundCredits', () => {
    it('should refund credits successfully', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ credits: 45 });
      mockPrisma.user.update.mockResolvedValue({ credits: 46 });
      mockPrisma.creditsLedger.create.mockImplementation((args: { data: { userId: string; action: string; credits: number; balance: number } }) => {
        return { id: 'refund-1', ...args.data };
      });

      const result = await refundCredits({
        userId: 'user-1',
        amount: 1,
        originalAction: 'lead_discovery',
      });

      expect(result.success).toBe(true);
      expect(result.newBalance).toBe(46);
    });

    it('should fail when refund amount is 0 or negative', async () => {
      const result = await refundCredits({
        userId: 'user-1',
        amount: -1,
        originalAction: 'lead_discovery',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('greater than 0');
    });
  });

  // ── addCreditAddon ─────────────────────────────────────────────

  describe('addCreditAddon', () => {
    it('should add credits from addon purchase', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ credits: 50 });
      mockPrisma.user.update.mockResolvedValue({ credits: 150 });
      mockPrisma.creditAddon.create.mockImplementation((args: { data: Record<string, unknown> }) => ({
        id: 'addon-1',
        ...args.data,
      }));
      mockPrisma.creditsLedger.create.mockImplementation((args: { data: Record<string, unknown> }) => ({
        id: 'addon-ledger-1',
        ...args.data,
      }));

      const result = await addCreditAddon({
        userId: 'user-1',
        credits: 100,
        pricePaid: 10,
        currency: 'USD',
      });

      expect(result.success).toBe(true);
      expect(result.newBalance).toBe(150);
      expect(result.addonId).toBe('addon-1');
    });
  });

  // ── getActionCost / getAllCreditCosts ──────────────────────────

  describe('utility functions', () => {
    it('getActionCost returns correct cost for known action', () => {
      expect(getActionCost('lead_discovery')).toBe(1);
      expect(getActionCost('deep_analysis')).toBe(1.5);
    });

    it('getActionCost returns 0 for unknown action', () => {
      expect(getActionCost('unknown' as 'lead_discovery')).toBe(0);
    });

    it('getAllCreditCosts returns a copy', () => {
      const costs = getAllCreditCosts();
      expect(costs.lead_discovery).toBe(1);
      expect(Object.keys(costs)).toHaveLength(8);
    });
  });
});
