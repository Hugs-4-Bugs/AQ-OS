// ═══════════════════════════════════════════════════════════════════
// Unit Tests: Subscription Store (src/lib/subscription-store.ts)
// Tests plan details, feature access, credit operations, store behavior
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect, beforeEach } from 'vitest';
import { useSubscriptionStore, PLAN_DETAILS, CREDIT_COSTS as STORE_CREDIT_COSTS } from '@/lib/subscription-store';
import { CREDIT_COSTS } from '@/lib/credit-costs';

describe('subscription-store', () => {
  // Reset store before each test
  beforeEach(() => {
    useSubscriptionStore.getState().reset();
  });

  // ── PLAN_DETAILS ───────────────────────────────────────────────

  describe('PLAN_DETAILS', () => {
    it('should have free plan with 50 monthly credits', () => {
      expect(PLAN_DETAILS.free.creditsMonthly).toBe(50);
    });

    it('should have pro plan with 500 monthly credits', () => {
      expect(PLAN_DETAILS.pro.creditsMonthly).toBe(500);
    });

    it('should have elite plan with 2000 monthly credits', () => {
      expect(PLAN_DETAILS.elite.creditsMonthly).toBe(2000);
    });

    it('free plan should have maxLeads = 10', () => {
      expect(PLAN_DETAILS.free.maxLeads).toBe(10);
    });

    it('pro and elite plans should have unlimited leads (null)', () => {
      expect(PLAN_DETAILS.pro.maxLeads).toBeNull();
      expect(PLAN_DETAILS.elite.maxLeads).toBeNull();
    });

    it('free plan price should be 0', () => {
      expect(PLAN_DETAILS.free.priceUSD).toBe(0);
      expect(PLAN_DETAILS.free.priceINR).toBe(0);
    });

    it('pro plan should cost $29/month', () => {
      expect(PLAN_DETAILS.pro.priceUSD).toBe(29);
    });

    it('elite plan should cost $89/month', () => {
      expect(PLAN_DETAILS.elite.priceUSD).toBe(89);
    });

    it('free plan should have disabled features including deep_analysis', () => {
      expect(PLAN_DETAILS.free.disabledFeatures).toContain('Deep lead analysis');
    });

    it('elite plan should have no disabled features', () => {
      expect(PLAN_DETAILS.elite.disabledFeatures).toHaveLength(0);
    });

    it('each plan should have features array', () => {
      expect(PLAN_DETAILS.free.features.length).toBeGreaterThan(0);
      expect(PLAN_DETAILS.pro.features.length).toBeGreaterThan(0);
      expect(PLAN_DETAILS.elite.features.length).toBeGreaterThan(0);
    });
  });

  // ── CREDIT_COSTS consistency ──────────────────────────────────

  describe('CREDIT_COSTS consistency with credit-costs.ts', () => {
    it('store CREDIT_COSTS should match credit-costs.ts values', () => {
      for (const [action, cost] of Object.entries(CREDIT_COSTS)) {
        expect(STORE_CREDIT_COSTS[action as keyof typeof STORE_CREDIT_COSTS]).toBe(cost);
      }
    });
  });

  // ── Default state ─────────────────────────────────────────────

  describe('default state', () => {
    it('should start with free plan', () => {
      const state = useSubscriptionStore.getState();
      expect(state.currentPlan).toBe('free');
    });

    it('should start with subscriptionStatus expired', () => {
      const state = useSubscriptionStore.getState();
      expect(state.subscriptionStatus).toBe('expired');
    });

    it('should start with isTrial = false', () => {
      const state = useSubscriptionStore.getState();
      expect(state.isTrial).toBe(false);
    });

    it('should start with trialDaysRemaining = 0', () => {
      const state = useSubscriptionStore.getState();
      expect(state.trialDaysRemaining).toBe(0);
    });

    it('should start with 50 credits', () => {
      const state = useSubscriptionStore.getState();
      expect(state.credits).toBe(50);
    });

    it('should start with entitlements null', () => {
      const state = useSubscriptionStore.getState();
      expect(state.entitlements).toBeNull();
    });
  });

  // ── hasFeatureAccess ──────────────────────────────────────────

  describe('hasFeatureAccess', () => {
    it('should return false when entitlements are not loaded', () => {
      const state = useSubscriptionStore.getState();
      expect(state.hasFeatureAccess('deep_analysis')).toBe(false);
    });

    it('should return false when entitlement does not exist for a feature', () => {
      useSubscriptionStore.getState().setEntitlements({
        lead_discovery: { limit: null, enabled: true },
      });
      expect(useSubscriptionStore.getState().hasFeatureAccess('nonexistent_feature')).toBe(false);
    });

    it('should return false when entitlement is disabled', () => {
      useSubscriptionStore.getState().setEntitlements({
        deep_analysis: { limit: null, enabled: false },
      });
      expect(useSubscriptionStore.getState().hasFeatureAccess('deep_analysis')).toBe(false);
    });

    it('should return true when entitlement is enabled', () => {
      useSubscriptionStore.getState().setEntitlements({
        deep_analysis: { limit: null, enabled: true },
      });
      expect(useSubscriptionStore.getState().hasFeatureAccess('deep_analysis')).toBe(true);
    });
  });

  // ── canPerform ────────────────────────────────────────────────

  describe('canPerform', () => {
    it('should return false when credits are insufficient', () => {
      useSubscriptionStore.getState().setCredits(0.1, 50);
      expect(useSubscriptionStore.getState().canPerform('lead_discovery')).toBe(false);
    });

    it('should return true when credits are sufficient and entitlement allows', () => {
      useSubscriptionStore.getState().setCredits(50, 50);
      useSubscriptionStore.getState().setEntitlements({
        lead_discovery: { limit: null, enabled: true },
      });
      expect(useSubscriptionStore.getState().canPerform('lead_discovery')).toBe(true);
    });

    it('should return false when entitlement is disabled even with credits', () => {
      useSubscriptionStore.getState().setCredits(50, 50);
      useSubscriptionStore.getState().setEntitlements({
        deep_analysis: { limit: null, enabled: false },
      });
      expect(useSubscriptionStore.getState().canPerform('deep_analysis')).toBe(false);
    });

    it('should return true when credits sufficient and no entitlements loaded', () => {
      useSubscriptionStore.getState().setCredits(50, 50);
      // entitlements are null by default
      expect(useSubscriptionStore.getState().canPerform('lead_discovery')).toBe(true);
    });
  });

  // ── deductCredits (local) ─────────────────────────────────────

  describe('deductCredits (local optimistic)', () => {
    it('should deduct credits and return true when sufficient', () => {
      useSubscriptionStore.getState().setCredits(50, 50);
      const result = useSubscriptionStore.getState().deductCredits('lead_discovery');
      expect(result).toBe(true);
      expect(useSubscriptionStore.getState().credits).toBe(49);
    });

    it('should return false when insufficient credits', () => {
      useSubscriptionStore.getState().setCredits(0.1, 50);
      const result = useSubscriptionStore.getState().deductCredits('lead_discovery');
      expect(result).toBe(false);
      expect(useSubscriptionStore.getState().credits).toBe(0.1); // unchanged
    });

    it('should update credit warning status to zero when credits hit 0', () => {
      useSubscriptionStore.getState().setCredits(1, 50);
      useSubscriptionStore.getState().deductCredits('lead_discovery');
      expect(useSubscriptionStore.getState().creditWarningStatus).toBe('zero');
    });
  });

  // ── getCreditPercentage ────────────────────────────────────────

  describe('getCreditPercentage', () => {
    it('should calculate percentage correctly', () => {
      useSubscriptionStore.getState().setCredits(25, 50);
      expect(useSubscriptionStore.getState().getCreditPercentage()).toBe(50);
    });

    it('should return 0 when monthly is 0', () => {
      useSubscriptionStore.getState().setCredits(25, 0);
      expect(useSubscriptionStore.getState().getCreditPercentage()).toBe(0);
    });

    it('should handle over 100% when credits exceed monthly', () => {
      useSubscriptionStore.getState().setCredits(100, 50);
      expect(useSubscriptionStore.getState().getCreditPercentage()).toBe(200);
    });
  });

  // ── setPlan ────────────────────────────────────────────────────

  describe('setPlan', () => {
    it('should update plan and associated details', () => {
      useSubscriptionStore.getState().setPlan('pro');
      expect(useSubscriptionStore.getState().currentPlan).toBe('pro');
      expect(useSubscriptionStore.getState().creditsMonthly).toBe(500);
      expect(useSubscriptionStore.getState().disabledFeatures).toEqual(PLAN_DETAILS.pro.disabledFeatures);
    });
  });

  // ── setCredits ─────────────────────────────────────────────────

  describe('setCredits', () => {
    it('should update credits and determine warning status', () => {
      useSubscriptionStore.getState().setCredits(10, 50);
      expect(useSubscriptionStore.getState().credits).toBe(10);
      // 10 <= 50*0.2 = 10, so it's "low"
      expect(useSubscriptionStore.getState().creditWarningStatus).toBe('low');
    });

    it('should set warning to zero when credits <= 0', () => {
      useSubscriptionStore.getState().setCredits(0, 50);
      expect(useSubscriptionStore.getState().creditWarningStatus).toBe('zero');
    });

    it('should set warning to ok when credits are healthy', () => {
      useSubscriptionStore.getState().setCredits(45, 50);
      expect(useSubscriptionStore.getState().creditWarningStatus).toBe('ok');
    });
  });

  // ── syncFromBackend ────────────────────────────────────────────

  describe('syncFromBackend', () => {
    it('should sync all fields from backend response', () => {
      useSubscriptionStore.getState().syncFromBackend({
        subscription: {
          id: 'sub-1',
          plan: 'pro',
          status: 'active',
          currentPeriodStart: '2024-01-01T00:00:00Z',
          currentPeriodEnd: '2024-02-01T00:00:00Z',
          cancelAtPeriodEnd: false,
          scheduledPlanChange: null,
        },
        planDetails: PLAN_DETAILS.pro,
        trialInfo: {
          isTrial: false,
          trialEndsAt: null,
          daysRemaining: 0,
        },
        creditBalance: {
          total: 350,
          monthly: 500,
          rollover: 0,
          addons: 0,
          plan: 'pro',
          percentage: 70,
        },
      });

      const state = useSubscriptionStore.getState();
      expect(state.currentPlan).toBe('pro');
      expect(state.subscriptionStatus).toBe('active');
      expect(state.credits).toBe(350);
      expect(state.creditsMonthly).toBe(500);
      expect(state.isTrial).toBe(false);
      expect(state.creditWarningStatus).toBe('ok');
    });
  });

  // ── reset ──────────────────────────────────────────────────────

  describe('reset', () => {
    it('should reset all state to defaults', () => {
      useSubscriptionStore.getState().setPlan('pro');
      useSubscriptionStore.getState().setCredits(500, 500);
      useSubscriptionStore.getState().reset();

      const state = useSubscriptionStore.getState();
      expect(state.currentPlan).toBe('free');
      expect(state.credits).toBe(50);
      expect(state.subscriptionStatus).toBe('expired');
      expect(state.isTrial).toBe(false);
      expect(state.entitlements).toBeNull();
    });
  });
});
