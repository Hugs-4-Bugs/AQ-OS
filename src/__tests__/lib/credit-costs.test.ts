// ═══════════════════════════════════════════════════════════════════
// Unit Tests: Credit Costs (src/lib/credit-costs.ts)
// Single source of truth for all credit cost definitions
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import {
  CREDIT_COSTS,
  ACTION_LABELS,
  PLAN_CREDITS,
  getCreditCost,
  getWorkflowActionCost,
  getAllCreditCosts,
  type CreditAction,
} from '@/lib/credit-costs';

describe('credit-costs', () => {
  // ── CREDIT_COSTS values ────────────────────────────────────────

  describe('CREDIT_COSTS', () => {
    it('should have lead_discovery = 1', () => {
      expect(CREDIT_COSTS.lead_discovery).toBe(1);
    });

    it('should have deep_analysis = 1.5', () => {
      expect(CREDIT_COSTS.deep_analysis).toBe(1.5);
    });

    it('should have outreach_message = 0.2', () => {
      expect(CREDIT_COSTS.outreach_message).toBe(0.2);
    });

    it('should have outreach_sequence = 0.5', () => {
      expect(CREDIT_COSTS.outreach_sequence).toBe(0.5);
    });

    it('should have sales_coaching = 0.5', () => {
      expect(CREDIT_COSTS.sales_coaching).toBe(0.5);
    });

    it('should have proposal_generation = 1.5', () => {
      expect(CREDIT_COSTS.proposal_generation).toBe(1.5);
    });

    it('should have competitor_analysis = 1.5', () => {
      expect(CREDIT_COSTS.competitor_analysis).toBe(1.5);
    });

    it('should have data_export = 0.5', () => {
      expect(CREDIT_COSTS.data_export).toBe(0.5);
    });

    it('should have exactly 8 credit actions', () => {
      expect(Object.keys(CREDIT_COSTS)).toHaveLength(8);
    });

    it('all costs should be positive numbers', () => {
      for (const [action, cost] of Object.entries(CREDIT_COSTS)) {
        expect(cost, `Cost for ${action} should be positive`).toBeGreaterThan(0);
      }
    });

    it('all costs should be finite numbers', () => {
      for (const [action, cost] of Object.entries(CREDIT_COSTS)) {
        expect(Number.isFinite(cost), `Cost for ${action} should be finite`).toBe(true);
      }
    });
  });

  // ── ACTION_LABELS ──────────────────────────────────────────────

  describe('ACTION_LABELS', () => {
    it('should have a label for every credit action', () => {
      for (const action of Object.keys(CREDIT_COSTS) as CreditAction[]) {
        expect(ACTION_LABELS[action], `Label for ${action} should exist`).toBeDefined();
        expect(ACTION_LABELS[action].length, `Label for ${action} should not be empty`).toBeGreaterThan(0);
      }
    });

    it('should have the same keys as CREDIT_COSTS', () => {
      const costKeys = Object.keys(CREDIT_COSTS).sort();
      const labelKeys = Object.keys(ACTION_LABELS).sort();
      expect(labelKeys).toEqual(costKeys);
    });
  });

  // ── PLAN_CREDITS ──────────────────────────────────────────────

  describe('PLAN_CREDITS', () => {
    it('should have free = 50', () => {
      expect(PLAN_CREDITS.free).toBe(50);
    });

    it('should have pro = 500', () => {
      expect(PLAN_CREDITS.pro).toBe(500);
    });

    it('should have elite = 2000', () => {
      expect(PLAN_CREDITS.elite).toBe(2000);
    });

    it('plan credits should increase with plan tier', () => {
      expect(PLAN_CREDITS.free).toBeLessThan(PLAN_CREDITS.pro);
      expect(PLAN_CREDITS.pro).toBeLessThan(PLAN_CREDITS.elite);
    });
  });

  // ── Helper functions ──────────────────────────────────────────

  describe('getCreditCost', () => {
    it('should return the correct cost for a known action', () => {
      expect(getCreditCost('lead_discovery')).toBe(1);
      expect(getCreditCost('deep_analysis')).toBe(1.5);
    });

    it('should return 0 for an unknown action', () => {
      expect(getCreditCost('nonexistent_action' as CreditAction)).toBe(0);
    });
  });

  describe('getWorkflowActionCost', () => {
    it('should return correct cost for known workflow actions', () => {
      expect(getWorkflowActionCost('send_email')).toBe(0.1);
      expect(getWorkflowActionCost('ai_analysis')).toBe(0.15);
      expect(getWorkflowActionCost('wait_delay')).toBe(0);
    });

    it('should return 0.1 as default for unknown workflow actions', () => {
      expect(getWorkflowActionCost('unknown_action')).toBe(0.1);
    });
  });

  describe('getAllCreditCosts', () => {
    it('should return a shallow copy of CREDIT_COSTS', () => {
      const copy = getAllCreditCosts();
      expect(copy).toEqual(CREDIT_COSTS);
      // Verify it's a copy, not the same reference
      copy.lead_discovery = 999;
      expect(CREDIT_COSTS.lead_discovery).toBe(1);
    });
  });
});
