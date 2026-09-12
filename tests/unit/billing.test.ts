// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Unit Tests: Billing (Credits, Subscriptions, Coupons, Tax)
// Phase 14.1: TESTING SUITE
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  deductCredits,
  addCredits,
  getCreditBalance,
  checkCreditSufficiency,
  refundCredits,
  rolloverCredits,
  resetMonthlyCredits,
  getActionCost,
  getAllCreditCosts,
  CREDIT_COSTS,
  type CreditAction,
} from '@/lib/credit-service';
import {
  ENTITLEMENTS,
  PLAN_CREDITS,
  getEntitlements,
  checkEntitlement,
  getFeatureLimit,
  hasFeatureAccess,
  canPerformAction,
  getPlanLevel,
  isValidPlanChange,
  getPlanChangeDirection,
  comparePlans,
  getDisabledFeatures,
  getEnabledFeatures,
  getUpgradeRequiredPlan,
  type PlanType,
  type FeatureKey,
} from '@/lib/entitlement-service';
import {
  validateCoupon,
  applyCoupon,
  validateAndApplyCoupon,
  incrementCouponUsage,
  createCoupon,
} from '@/lib/coupon-service';
import {
  calculateTax,
  getTaxRate,
  validateTaxExemption,
  type TaxRegion,
} from '@/lib/tax-service';
import {
  handleSubscriptionStateTransition,
  VALID_TRANSITIONS,
  type SubscriptionStatus,
} from '@/lib/subscription-service';
import { createMockPrisma, createTestUser, createTestSubscription } from '../helpers/test-utils';

// Use vi.hoisted to avoid hoisting issues with factory functions

// Mock db - inline factory to avoid hoisting issues
vi.mock('@/lib/db', () => ({
  db: {
    user: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), count: vi.fn() },
    lead: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), count: vi.fn() },
    subscription: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), upsert: vi.fn(), count: vi.fn() },
    creditsLedger: { create: vi.fn(), findMany: vi.fn(), count: vi.fn(), aggregate: vi.fn(), findFirst: vi.fn() },
    paymentOrder: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), count: vi.fn() },
    workflowDefinition: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), count: vi.fn() },
    workflowExecution: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), count: vi.fn() },
    auditLog: { create: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    notification: { create: vi.fn(), findMany: vi.fn(), update: vi.fn(), count: vi.fn() },
    competitorData: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), count: vi.fn() },
    gdprRequest: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    userSettings: { findUnique: vi.fn(), upsert: vi.fn(), update: vi.fn() },
    creditAddon: { findMany: vi.fn(), create: vi.fn() },
    coupon: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn() },
    taxRate: { findFirst: vi.fn() },
    $transaction: vi.fn((fn: any) => typeof fn === 'function' ? fn() : fn),
    $queryRaw: vi.fn(),
    $executeRaw: vi.fn(),
  },
}));

// Mock billing-audit
vi.mock('@/lib/billing-audit', () => ({
  logCreditEvent: vi.fn(),
  logSubscriptionEvent: vi.fn(),
  logBillingEvent: vi.fn(),
  logEntitlementEvent: vi.fn(),
  logCouponEvent: vi.fn(),
  logPaymentEvent: vi.fn(),
}));

// Mock workflow-engine (used by subscription service)
vi.mock('@/lib/workflow-engine', () => ({
  executeWorkflow: vi.fn(),
  getExecutionMetrics: vi.fn(),
}));

// Mock workflow-dead-letter
vi.mock('@/lib/workflow-dead-letter', () => ({
  sendToDeadLetter: vi.fn(),
}));

// Mock realtime-event-bus
vi.mock('@/lib/realtime-event-bus', () => ({
  publishEvent: vi.fn(),
}));

// Mock workflow-audit
vi.mock('@/lib/workflow-audit', () => ({
  logWorkflowEvent: vi.fn(),
}));

// Mock workflow-actions
vi.mock('@/lib/workflow-actions', () => ({
  executeAction: vi.fn(),
}));

// Mock workflow-credits
vi.mock('@/lib/workflow-credits', () => ({
  deductExecutionCredits: vi.fn(),
  getActionCreditCost: vi.fn(),
  checkExecutionLimit: vi.fn(),
}));

// Mock email
vi.mock('@/lib/email', () => ({
  sendSecurityAlertEmail: vi.fn(),
  isEmailServiceConfigured: vi.fn(() => false),
}));

// Mock feature-flags
vi.mock('@/lib/feature-flags', () => ({
  shouldBypassEmail: vi.fn(() => true),
}));

import { db } from '@/lib/db';
const mockDb = db as any;

// ═══════════════════════════════════════════════════════════════════
// CREDIT DEDUCTION (Atomic, Idempotency)
// ═══════════════════════════════════════════════════════════════════

describe('Credit Deduction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should deduct credits atomically', async () => {
    mockDb.user.findUnique.mockResolvedValue({ credits: 100, plan: 'pro' });
    mockDb.user.update.mockResolvedValue({ credits: 95 });
    mockDb.creditsLedger.create.mockResolvedValue({ id: 'ledger_1', balance: 95 });
    mockDb.$transaction.mockImplementation(async (fn: (tx: any) => Promise<any>) => {
      const tx = {
        user: { findUnique: vi.fn().mockResolvedValue({ credits: 100, plan: 'pro' }), update: vi.fn().mockResolvedValue({ credits: 95 }) },
        creditsLedger: { create: vi.fn().mockResolvedValue({ id: 'ledger_1', balance: 95 }) },
      };
      return fn(tx);
    });

    const result = await deductCredits({
      userId: 'user_1',
      action: 'deep_analysis',
      cost: 5,
    });
    expect(result.success).toBe(true);
    expect(result.newBalance).toBe(95);
  });

  it('should reject deduction with zero or negative cost', async () => {
    const result = await deductCredits({
      userId: 'user_1',
      action: 'test',
      cost: 0,
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('greater than 0');
  });

  it('should reject deduction when insufficient credits', async () => {
    mockDb.$transaction.mockImplementation(async (fn: (tx: any) => Promise<any>) => {
      const tx = {
        user: { findUnique: vi.fn().mockResolvedValue({ credits: 2, plan: 'free' }), update: vi.fn() },
        creditsLedger: { create: vi.fn() },
      };
      try {
        return await fn(tx);
      } catch (e: any) {
        throw e;
      }
    });

    const result = await deductCredits({
      userId: 'user_1',
      action: 'deep_analysis',
      cost: 5,
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Insufficient credits');
  });

  it('should handle idempotency key — return existing result on duplicate', async () => {
    const existingLedger = { id: 'ledger_existing', balance: 95 };
    mockDb.creditsLedger.findFirst.mockResolvedValue(existingLedger);

    const result = await deductCredits({
      userId: 'user_1',
      action: 'deep_analysis',
      cost: 5,
      idempotencyKey: 'idem_123',
    });
    expect(result.success).toBe(true);
    expect(result.alreadyProcessed).toBe(true);
    expect(result.newBalance).toBe(95);
  });

  it('should proceed with deduction when idempotency key not seen before', async () => {
    mockDb.creditsLedger.findFirst.mockResolvedValue(null);
    mockDb.$transaction.mockImplementation(async (fn: (tx: any) => Promise<any>) => {
      const tx = {
        user: { findUnique: vi.fn().mockResolvedValue({ credits: 100, plan: 'pro' }), update: vi.fn().mockResolvedValue({}) },
        creditsLedger: { create: vi.fn().mockResolvedValue({ id: 'ledger_new', balance: 95 }) },
      };
      return fn(tx);
    });

    const result = await deductCredits({
      userId: 'user_1',
      action: 'deep_analysis',
      cost: 5,
      idempotencyKey: 'idem_new',
    });
    expect(result.success).toBe(true);
    expect(result.alreadyProcessed).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════
// CREDIT ADDITION (Duplicate Detection)
// ═══════════════════════════════════════════════════════════════════

describe('Credit Addition', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should add credits atomically', async () => {
    mockDb.creditsLedger.findFirst.mockResolvedValue(null);
    mockDb.$transaction.mockImplementation(async (fn: (tx: any) => Promise<any>) => {
      const tx = {
        user: { findUnique: vi.fn().mockResolvedValue({ credits: 50 }), update: vi.fn().mockResolvedValue({}) },
        creditsLedger: { create: vi.fn().mockResolvedValue({ id: 'ledger_add', balance: 150 }) },
      };
      return fn(tx);
    });

    const result = await addCredits({
      userId: 'user_1',
      amount: 100,
      source: 'addon_purchase',
      description: 'Purchased 100 credits',
    });
    expect(result.success).toBe(true);
    expect(result.newBalance).toBe(150);
  });

  it('should reject zero or negative amounts', async () => {
    const result = await addCredits({
      userId: 'user_1',
      amount: -10,
      source: 'test',
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('greater than 0');
  });

  it('should detect duplicate additions within 5 minutes', async () => {
    const duplicateEntry = { id: 'ledger_dup', balance: 150 };
    mockDb.creditsLedger.findFirst.mockResolvedValue(duplicateEntry);

    const result = await addCredits({
      userId: 'user_1',
      amount: 100,
      source: 'addon_purchase',
      referenceId: 'ref_123',
    });
    expect(result.success).toBe(true);
    expect(result.duplicate).toBe(true);
    expect(result.newBalance).toBe(150);
  });

  it('should allow addition when no duplicate detected', async () => {
    mockDb.creditsLedger.findFirst.mockResolvedValue(null);
    mockDb.$transaction.mockImplementation(async (fn: (tx: any) => Promise<any>) => {
      const tx = {
        user: { findUnique: vi.fn().mockResolvedValue({ credits: 50 }), update: vi.fn() },
        creditsLedger: { create: vi.fn().mockResolvedValue({ id: 'new_ledger', balance: 150 }) },
      };
      return fn(tx);
    });

    const result = await addCredits({
      userId: 'user_1',
      amount: 100,
      source: 'addon_purchase',
      referenceId: 'ref_new',
    });
    expect(result.success).toBe(true);
    expect(result.duplicate).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════
// SUBSCRIPTION LIFECYCLE
// ═══════════════════════════════════════════════════════════════════

describe('Subscription Lifecycle', () => {
  it('should allow trialing → active transition', () => {
    expect(VALID_TRANSITIONS.trialing).toContain('active');
  });

  it('should allow trialing → expired transition', () => {
    expect(VALID_TRANSITIONS.trialing).toContain('expired');
  });

  it('should allow active → past_due transition', () => {
    expect(VALID_TRANSITIONS.active).toContain('past_due');
  });

  it('should allow active → canceled transition', () => {
    expect(VALID_TRANSITIONS.active).toContain('canceled');
  });

  it('should allow past_due → active transition (recovery)', () => {
    expect(VALID_TRANSITIONS.past_due).toContain('active');
  });

  it('should allow canceled → expired transition', () => {
    expect(VALID_TRANSITIONS.canceled).toContain('expired');
  });

  it('should NOT allow expired → any transition', () => {
    expect(VALID_TRANSITIONS.expired).toHaveLength(0);
  });

  it('should NOT allow direct expired → active transition', () => {
    expect(VALID_TRANSITIONS.expired).not.toContain('active');
  });

  it('should NOT allow active → trialing transition', () => {
    expect(VALID_TRANSITIONS.active).not.toContain('trialing');
  });
});

// ═══════════════════════════════════════════════════════════════════
// COUPON VALIDATION
// ═══════════════════════════════════════════════════════════════════

describe('Coupon Validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const activeCoupon = {
    id: 'coupon_1',
    code: 'SAVE20',
    discountType: 'percent',
    discountValue: 20,
    maxUses: null,
    usedCount: 0,
    expiresAt: null,
    applicablePlans: '[]',
    active: true,
  };

  it('should validate an active coupon', async () => {
    mockDb.coupon.findUnique.mockResolvedValue(activeCoupon);
    const result = await validateCoupon({ code: 'SAVE20', plan: 'pro' });
    expect(result.valid).toBe(true);
    expect(result.coupon).not.toBeNull();
  });

  it('should reject a non-existent coupon', async () => {
    mockDb.coupon.findUnique.mockResolvedValue(null);
    const result = await validateCoupon({ code: 'NOEXIST', plan: 'pro' });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('should reject an inactive coupon', async () => {
    mockDb.coupon.findUnique.mockResolvedValue({ ...activeCoupon, active: false });
    const result = await validateCoupon({ code: 'SAVE20', plan: 'pro' });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('no longer active');
  });

  it('should reject an expired coupon', async () => {
    mockDb.coupon.findUnique.mockResolvedValue({
      ...activeCoupon,
      expiresAt: new Date('2020-01-01'),
    });
    const result = await validateCoupon({ code: 'SAVE20', plan: 'pro' });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('expired');
  });

  it('should reject a maxed-out coupon', async () => {
    mockDb.coupon.findUnique.mockResolvedValue({
      ...activeCoupon,
      maxUses: 100,
      usedCount: 100,
    });
    const result = await validateCoupon({ code: 'SAVE20', plan: 'pro' });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('limit has been reached');
  });

  it('should reject a coupon not applicable to the plan', async () => {
    mockDb.coupon.findUnique.mockResolvedValue({
      ...activeCoupon,
      applicablePlans: '["elite"]',
    });
    const result = await validateCoupon({ code: 'SAVE20', plan: 'pro' });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('not applicable');
  });
});

// ═══════════════════════════════════════════════════════════════════
// COUPON APPLICATION (Percent / Fixed)
// ═══════════════════════════════════════════════════════════════════

describe('Coupon Application', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should apply a percent discount correctly', async () => {
    mockDb.coupon.findUnique.mockResolvedValue({
      discountType: 'percent',
      discountValue: 20,
    });
    const result = await applyCoupon({ code: 'SAVE20', baseAmount: 100, plan: 'pro' });
    expect(result.discountAmount).toBe(20);
    expect(result.finalAmount).toBe(80);
    expect(result.originalAmount).toBe(100);
  });

  it('should apply a fixed discount correctly', async () => {
    mockDb.coupon.findUnique.mockResolvedValue({
      discountType: 'fixed',
      discountValue: 15,
    });
    const result = await applyCoupon({ code: 'FLAT15', baseAmount: 100, plan: 'pro' });
    expect(result.discountAmount).toBe(15);
    expect(result.finalAmount).toBe(85);
  });

  it('should not allow discount to exceed base amount', async () => {
    mockDb.coupon.findUnique.mockResolvedValue({
      discountType: 'fixed',
      discountValue: 200,
    });
    const result = await applyCoupon({ code: 'TOOBIG', baseAmount: 100, plan: 'pro' });
    expect(result.discountAmount).toBe(100);
    expect(result.finalAmount).toBe(0);
  });

  it('should handle 100% discount', async () => {
    mockDb.coupon.findUnique.mockResolvedValue({
      discountType: 'percent',
      discountValue: 100,
    });
    const result = await applyCoupon({ code: 'FREE', baseAmount: 50, plan: 'pro' });
    expect(result.discountAmount).toBe(50);
    expect(result.finalAmount).toBe(0);
  });

  it('should return original amount for non-existent coupon', async () => {
    mockDb.coupon.findUnique.mockResolvedValue(null);
    const result = await applyCoupon({ code: 'NOEXIST', baseAmount: 100, plan: 'pro' });
    expect(result.discountAmount).toBe(0);
    expect(result.finalAmount).toBe(100);
  });
});

// ═══════════════════════════════════════════════════════════════════
// PLAN ENTITLEMENTS
// ═══════════════════════════════════════════════════════════════════

describe('Plan Entitlements', () => {
  it('free plan should have limited features', () => {
    expect(checkEntitlement('free', 'deep_analysis')).toBe(false);
    expect(checkEntitlement('free', 'outreach_sequences')).toBe(false);
    expect(checkEntitlement('free', 'workflow_access')).toBe(false);
    expect(checkEntitlement('free', 'lead_discovery')).toBe(true);
  });

  it('pro plan should have most features', () => {
    expect(checkEntitlement('pro', 'deep_analysis')).toBe(true);
    expect(checkEntitlement('pro', 'workflow_access')).toBe(true);
    expect(checkEntitlement('pro', 'whatsapp_integration')).toBe(false);
    expect(checkEntitlement('pro', 'white_label')).toBe(false);
  });

  it('elite plan should have all features', () => {
    expect(checkEntitlement('elite', 'whatsapp_integration')).toBe(true);
    expect(checkEntitlement('elite', 'white_label')).toBe(true);
    expect(checkEntitlement('elite', 'custom_integrations')).toBe(true);
  });

  it('should return correct plan credits', () => {
    expect(PLAN_CREDITS.free).toBe(50);
    expect(PLAN_CREDITS.pro).toBe(500);
    expect(PLAN_CREDITS.elite).toBe(2000);
  });

  it('should get feature limits correctly', () => {
    expect(getFeatureLimit('free', 'lead_discovery')).toBe(10);
    expect(getFeatureLimit('pro', 'lead_discovery')).toBeNull(); // unlimited
    expect(getFeatureLimit('free', 'deep_analysis')).toBe(0); // disabled
  });

  it('canPerformAction should allow within limits', () => {
    const result = canPerformAction('free', 'lead_discovery', 5);
    expect(result.allowed).toBe(true);
  });

  it('canPerformAction should block at limit', () => {
    const result = canPerformAction('free', 'lead_discovery', 10);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Usage limit reached');
  });

  it('canPerformAction should allow unlimited features on pro/elite', () => {
    const result = canPerformAction('pro', 'lead_discovery', 9999);
    expect(result.allowed).toBe(true);
  });

  it('should validate plan changes correctly', () => {
    expect(isValidPlanChange('free', 'pro')).toBe(true);
    expect(isValidPlanChange('pro', 'elite')).toBe(true);
    expect(isValidPlanChange('pro', 'pro')).toBe(false);
  });

  it('should determine plan change direction', () => {
    expect(getPlanChangeDirection('free', 'pro')).toBe('upgrade');
    expect(getPlanChangeDirection('elite', 'pro')).toBe('downgrade');
    expect(getPlanChangeDirection('pro', 'pro')).toBe('same');
  });

  it('should compare plans correctly', () => {
    const diff = comparePlans('free', 'pro');
    expect(diff.gained.length).toBeGreaterThan(0);
    expect(diff.lost.length).toBe(0);
    expect(diff.limitIncreases.length).toBeGreaterThan(0);
  });

  it('should return correct disabled features', () => {
    const freeDisabled = getDisabledFeatures('free');
    expect(freeDisabled).toContain('deep_analysis');
    expect(freeDisabled).toContain('workflow_access');

    const eliteEnabled = getEnabledFeatures('elite');
    expect(eliteEnabled.length).toBeGreaterThan(10);
  });

  it('should suggest correct upgrade plan', () => {
    expect(getUpgradeRequiredPlan('free', 'deep_analysis')).toBe('pro');
    expect(getUpgradeRequiredPlan('pro', 'whatsapp_integration')).toBe('elite');
  });
});

// ═══════════════════════════════════════════════════════════════════
// CREDIT WARNINGS
// ═══════════════════════════════════════════════════════════════════

describe('Credit Warnings & Sufficiency', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should check credit sufficiency correctly', async () => {
    mockDb.user.findUnique.mockResolvedValue({ credits: 100 });
    const result = await checkCreditSufficiency('user_1', 50);
    expect(result.sufficient).toBe(true);
    expect(result.balance).toBe(100);
    expect(result.shortfall).toBe(0);
  });

  it('should detect insufficient credits', async () => {
    mockDb.user.findUnique.mockResolvedValue({ credits: 10 });
    const result = await checkCreditSufficiency('user_1', 50);
    expect(result.sufficient).toBe(false);
    expect(result.shortfall).toBe(40);
  });

  it('should get credit balance with breakdown', async () => {
    mockDb.user.findUnique.mockResolvedValue({
      credits: 550,
      creditsMonthly: 500,
      rolloverCredits: 50,
      plan: 'pro',
    });
    mockDb.creditAddon.findMany.mockResolvedValue([]);
    const result = await getCreditBalance('user_1');
    expect(result.total).toBe(550);
    expect(result.monthly).toBe(500);
    expect(result.rollover).toBe(50);
    expect(result.plan).toBe('pro');
  });

  it('should handle missing user in getCreditBalance', async () => {
    mockDb.user.findUnique.mockResolvedValue(null);
    const result = await getCreditBalance('nonexistent');
    expect(result.total).toBe(0);
    expect(result.plan).toBe('free');
  });
});

// ═══════════════════════════════════════════════════════════════════
// GST CALCULATION
// ═══════════════════════════════════════════════════════════════════

describe('GST / Tax Calculation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should calculate Indian GST at 18%', async () => {
    mockDb.taxRate.findFirst.mockResolvedValue(null);
    const result = await calculateTax({
      amount: 1000,
      currency: 'INR',
      country: 'IN',
      plan: 'pro',
      userId: 'user_1',
    });
    expect(result.success).toBe(true);
    expect(result.taxRate).toBe(0.18);
    expect(result.taxAmount).toBe(180);
    expect(result.totalWithTax).toBe(1180);
  });

  it('should split GST into CGST + SGST for intrastate India', async () => {
    mockDb.taxRate.findFirst.mockResolvedValue(null);
    const result = await calculateTax({
      amount: 1000,
      currency: 'INR',
      country: 'IN',
      region: 'MH',
      plan: 'pro',
      userId: 'user_1',
    });
    expect(result.success).toBe(true);
    expect(result.breakdown?.cgst).toBe(90);
    expect(result.breakdown?.sgst).toBe(90);
  });

  it('should apply IGST for interstate India', async () => {
    mockDb.taxRate.findFirst.mockResolvedValue(null);
    const result = await calculateTax({
      amount: 1000,
      currency: 'INR',
      country: 'IN',
      region: 'XX',
      plan: 'pro',
      userId: 'user_1',
    });
    expect(result.success).toBe(true);
    expect(result.breakdown?.igst).toBe(180);
  });

  it('should exempt US SaaS from tax', async () => {
    mockDb.taxRate.findFirst.mockResolvedValue(null);
    const result = await calculateTax({
      amount: 100,
      currency: 'USD',
      country: 'US',
      plan: 'pro',
      userId: 'user_1',
    });
    expect(result.isExempt).toBe(true);
    expect(result.taxAmount).toBe(0);
  });

  it('should calculate EU VAT', async () => {
    mockDb.taxRate.findFirst.mockResolvedValue(null);
    const result = await calculateTax({
      amount: 100,
      currency: 'EUR',
      country: 'DE',
      plan: 'pro',
      userId: 'user_1',
    });
    expect(result.success).toBe(true);
    expect(result.taxRate).toBe(0.19);
    expect(result.taxName).toBe('VAT');
    expect(result.breakdown?.vat).toBe(19);
  });

  it('should apply reverse charge for EU B2B with VAT number', async () => {
    mockDb.taxRate.findFirst.mockResolvedValue(null);
    const result = await calculateTax({
      amount: 100,
      currency: 'EUR',
      country: 'DE',
      isB2B: true,
      vatNumber: 'DE123456789',
      plan: 'pro',
      userId: 'user_1',
    });
    expect(result.isReverseCharge).toBe(true);
    expect(result.taxAmount).toBe(0);
    expect(result.totalWithTax).toBe(100);
  });

  it('should exempt SEZ units in India', async () => {
    mockDb.taxRate.findFirst.mockResolvedValue(null);
    const result = await validateTaxExemption({
      country: 'IN',
      isB2B: true,
      gstNumber: '27SEZ123456789',
    });
    expect(result.isExempt).toBe(true);
    expect(result.reason).toContain('SEZ');
  });

  it('should apply tax exemption certificate', async () => {
    mockDb.taxRate.findFirst.mockResolvedValue(null);
    const result = await validateTaxExemption({
      country: 'IN',
      isB2B: false,
      taxExemptionCertificate: 'CERT-123',
    });
    expect(result.isExempt).toBe(true);
    expect(result.reason).toContain('certificate');
  });
});

// ═══════════════════════════════════════════════════════════════════
// CREDIT COSTS MAPPING
// ═══════════════════════════════════════════════════════════════════

describe('Credit Costs', () => {
  it('should have costs for all action types', () => {
    const actions: CreditAction[] = [
      'lead_discovery', 'deep_analysis', 'outreach_message',
      'outreach_sequence', 'sales_coaching', 'proposal_generation',
      'competitor_analysis', 'data_export',
    ];
    for (const action of actions) {
      expect(getActionCost(action)).toBeGreaterThan(0);
    }
  });

  it('should return 0 for unknown action', () => {
    expect(getActionCost('unknown_action' as CreditAction)).toBe(0);
  });

  it('should return a copy of all credit costs', () => {
    const costs1 = getAllCreditCosts();
    const costs2 = getAllCreditCosts();
    expect(costs1).toEqual(costs2);
    expect(costs1).not.toBe(costs2); // Different reference
  });

  it('should have correct specific costs', () => {
    expect(CREDIT_COSTS.lead_discovery).toBe(1);
    expect(CREDIT_COSTS.deep_analysis).toBe(5);
    expect(CREDIT_COSTS.outreach_message).toBe(2);
    expect(CREDIT_COSTS.proposal_generation).toBe(10);
  });
});
