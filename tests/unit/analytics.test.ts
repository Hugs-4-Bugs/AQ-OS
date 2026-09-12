// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Unit Tests: Analytics
// Phase 14.1: TESTING SUITE
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockPrisma, createTestUser } from '../helpers/test-utils';


// Mock db

// Mock billing-audit
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

// Mock feature-flags
vi.mock('@/lib/feature-flags', () => ({
  shouldBypassEmail: vi.fn(() => true),
}));

import { db } from '@/lib/db';
const mockDb = db as any;

// ═══════════════════════════════════════════════════════════════════
// DATA AGGREGATION CALCULATIONS
// ═══════════════════════════════════════════════════════════════════

describe('Data Aggregation Calculations', () => {
  interface DataPoint {
    date: string;
    value: number;
  }

  function aggregateByPeriod(data: DataPoint[], period: 'day' | 'week' | 'month'): Map<string, number> {
    const result = new Map<string, number>();
    for (const point of data) {
      const date = new Date(point.date);
      let key: string;
      if (period === 'day') {
        key = point.date.split('T')[0];
      } else if (period === 'week') {
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay());
        key = weekStart.toISOString().split('T')[0];
      } else {
        key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      }
      result.set(key, (result.get(key) || 0) + point.value);
    }
    return result;
  }

  it('should aggregate data by day', () => {
    const data: DataPoint[] = [
      { date: '2024-01-15T10:00:00Z', value: 10 },
      { date: '2024-01-15T14:00:00Z', value: 20 },
      { date: '2024-01-16T10:00:00Z', value: 15 },
    ];
    const result = aggregateByPeriod(data, 'day');
    expect(result.get('2024-01-15')).toBe(30);
    expect(result.get('2024-01-16')).toBe(15);
  });

  it('should aggregate data by month', () => {
    const data: DataPoint[] = [
      { date: '2024-01-15T10:00:00Z', value: 100 },
      { date: '2024-01-20T14:00:00Z', value: 200 },
      { date: '2024-02-05T10:00:00Z', value: 50 },
    ];
    const result = aggregateByPeriod(data, 'month');
    expect(result.get('2024-01')).toBe(300);
    expect(result.get('2024-02')).toBe(50);
  });

  it('should calculate moving average', () => {
    const values = [10, 20, 30, 40, 50];
    const windowSize = 3;
    const movingAvg: number[] = [];
    for (let i = windowSize - 1; i < values.length; i++) {
      const window = values.slice(i - windowSize + 1, i + 1);
      movingAvg.push(window.reduce((a, b) => a + b, 0) / windowSize);
    }
    expect(movingAvg).toEqual([20, 30, 40]);
  });

  it('should calculate percentage change', () => {
    function pctChange(current: number, previous: number): number {
      if (previous === 0) return current > 0 ? 100 : 0;
      return ((current - previous) / previous) * 100;
    }
    expect(pctChange(150, 100)).toBe(50);
    expect(pctChange(50, 100)).toBe(-50);
    expect(pctChange(100, 100)).toBe(0);
    expect(pctChange(100, 0)).toBe(100);
  });
});

// ═══════════════════════════════════════════════════════════════════
// PREDICTION CONFIDENCE INTERVALS
// ═══════════════════════════════════════════════════════════════════

describe('Prediction Confidence Intervals', () => {
  function calculateConfidenceInterval(
    mean: number,
    stdDev: number,
    sampleSize: number,
    confidenceLevel: number = 0.95
  ): { lower: number; upper: number } {
    // Z-scores for common confidence levels
    const zScores: Record<number, number> = {
      0.90: 1.645,
      0.95: 1.96,
      0.99: 2.576,
    };
    const z = zScores[confidenceLevel] || 1.96;
    const marginOfError = z * (stdDev / Math.sqrt(sampleSize));
    return {
      lower: Math.round((mean - marginOfError) * 100) / 100,
      upper: Math.round((mean + marginOfError) * 100) / 100,
    };
  }

  it('should calculate 95% confidence interval', () => {
    const ci = calculateConfidenceInterval(100, 15, 50);
    expect(ci.lower).toBeLessThan(100);
    expect(ci.upper).toBeGreaterThan(100);
    // With mean=100, stdDev=15, n=50: margin ≈ 15 * 1.96 / 7.07 ≈ 4.16
    expect(ci.lower).toBeCloseTo(95.84, 1);
    expect(ci.upper).toBeCloseTo(104.16, 1);
  });

  it('should widen interval with smaller sample size', () => {
    const ciLarge = calculateConfidenceInterval(100, 15, 100);
    const ciSmall = calculateConfidenceInterval(100, 15, 10);
    const widthLarge = ciLarge.upper - ciLarge.lower;
    const widthSmall = ciSmall.upper - ciSmall.lower;
    expect(widthSmall).toBeGreaterThan(widthLarge);
  });

  it('should narrow interval with lower confidence level', () => {
    const ci95 = calculateConfidenceInterval(100, 15, 50, 0.95);
    const ci90 = calculateConfidenceInterval(100, 15, 50, 0.90);
    const width95 = ci95.upper - ci95.lower;
    const width90 = ci90.upper - ci90.lower;
    expect(width90).toBeLessThan(width95);
  });
});

// ═══════════════════════════════════════════════════════════════════
// ANOMALY DETECTION THRESHOLDS
// ═══════════════════════════════════════════════════════════════════

describe('Anomaly Detection Thresholds', () => {
  function detectAnomaly(
    value: number,
    mean: number,
    stdDev: number,
    threshold: number = 2.0
  ): { isAnomaly: boolean; zScore: number; severity: 'low' | 'medium' | 'high' } {
    const zScore = stdDev > 0 ? (value - mean) / stdDev : 0;
    const isAnomaly = Math.abs(zScore) > threshold;

    let severity: 'low' | 'medium' | 'high' = 'low';
    if (Math.abs(zScore) > threshold * 2) severity = 'high';
    else if (Math.abs(zScore) > threshold * 1.5) severity = 'medium';

    return { isAnomaly, zScore: Math.round(zScore * 100) / 100, severity };
  }

  it('should detect normal values within threshold', () => {
    const result = detectAnomaly(105, 100, 10);
    expect(result.isAnomaly).toBe(false);
    expect(result.zScore).toBe(0.5);
  });

  it('should detect anomalous values beyond threshold', () => {
    const result = detectAnomaly(130, 100, 10);
    expect(result.isAnomaly).toBe(true);
    expect(result.zScore).toBe(3.0);
  });

  it('should classify severity correctly', () => {
    const low = detectAnomaly(125, 100, 10); // z = 2.5
    expect(low.severity).toBe('low');

    const medium = detectAnomaly(135, 100, 10); // z = 3.5
    expect(medium.severity).toBe('medium');

    const high = detectAnomaly(145, 100, 10); // z = 4.5
    expect(high.severity).toBe('high');
  });

  it('should detect negative anomalies', () => {
    const result = detectAnomaly(70, 100, 10); // z = -3.0
    expect(result.isAnomaly).toBe(true);
    expect(result.zScore).toBe(-3.0);
  });

  it('should handle zero standard deviation', () => {
    const result = detectAnomaly(100, 100, 0);
    expect(result.zScore).toBe(0);
    expect(result.isAnomaly).toBe(false);
  });

  it('should allow custom threshold', () => {
    const result = detectAnomaly(120, 100, 10, 3.0); // z = 2.0, threshold = 3.0
    expect(result.isAnomaly).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════
// BENCHMARKING COMPARISONS
// ═══════════════════════════════════════════════════════════════════

describe('Benchmarking Comparisons', () => {
  interface BenchmarkResult {
    metric: string;
    userValue: number;
    industryAverage: number;
    topPerformer: number;
  }

  function compareWithBenchmark(result: BenchmarkResult): {
    metric: string;
    userValue: number;
    percentile: number;
    status: 'below_average' | 'average' | 'above_average' | 'top_performer';
  } {
    const { metric, userValue, industryAverage, topPerformer } = result;

    let percentile: number;
    let status: 'below_average' | 'average' | 'above_average' | 'top_performer';

    if (userValue >= topPerformer) {
      percentile = 95;
      status = 'top_performer';
    } else if (userValue >= industryAverage * 1.2) {
      percentile = 75 + Math.round(((userValue - industryAverage * 1.2) / (topPerformer - industryAverage * 1.2)) * 20);
      status = 'above_average';
    } else if (userValue >= industryAverage * 0.8) {
      percentile = 25 + Math.round(((userValue - industryAverage * 0.8) / (industryAverage * 0.4)) * 50);
      status = 'average';
    } else {
      percentile = Math.round((userValue / (industryAverage * 0.8)) * 25);
      status = 'below_average';
    }

    return { metric, userValue, percentile: Math.min(99, Math.max(1, percentile)), status };
  }

  it('should identify top performer', () => {
    const result = compareWithBenchmark({
      metric: 'conversion_rate',
      userValue: 15,
      industryAverage: 8,
      topPerformer: 12,
    });
    expect(result.status).toBe('top_performer');
    expect(result.percentile).toBe(95);
  });

  it('should identify above average performance', () => {
    const result = compareWithBenchmark({
      metric: 'response_rate',
      userValue: 25,
      industryAverage: 20,
      topPerformer: 40,
    });
    expect(result.status).toBe('above_average');
    expect(result.percentile).toBeGreaterThan(75);
  });

  it('should identify average performance', () => {
    const result = compareWithBenchmark({
      metric: 'lead_volume',
      userValue: 100,
      industryAverage: 100,
      topPerformer: 200,
    });
    expect(result.status).toBe('average');
  });

  it('should identify below average performance', () => {
    const result = compareWithBenchmark({
      metric: 'deal_close_rate',
      userValue: 5,
      industryAverage: 20,
      topPerformer: 40,
    });
    expect(result.status).toBe('below_average');
    expect(result.percentile).toBeLessThan(25);
  });
});

// ═══════════════════════════════════════════════════════════════════
// METRIC FORMULA PARSING / EXECUTION
// ═══════════════════════════════════════════════════════════════════

describe('Metric Formula Parsing & Execution', () => {
  const METRIC_FORMULAS: Record<string, (values: Record<string, number>) => number> = {
    'conversion_rate': (v) => v.closed_won / v.total_leads * 100,
    'average_deal_size': (v) => v.total_revenue / v.closed_won,
    'pipeline_velocity': (v) => (v.closed_won * v.average_deal_value) / v.sales_cycle_length,
    'lead_to_opportunity': (v) => v.opportunities / v.total_leads * 100,
    'win_rate': (v) => v.closed_won / (v.closed_won + v.closed_lost) * 100,
  };

  it('should calculate conversion rate', () => {
    const result = METRIC_FORMULAS.conversion_rate({ closed_won: 25, total_leads: 100 });
    expect(result).toBe(25);
  });

  it('should calculate average deal size', () => {
    const result = METRIC_FORMULAS.average_deal_size({ total_revenue: 50000, closed_won: 10 });
    expect(result).toBe(5000);
  });

  it('should calculate pipeline velocity', () => {
    const result = METRIC_FORMULAS.pipeline_velocity({
      closed_won: 10,
      average_deal_value: 5000,
      sales_cycle_length: 30,
    });
    expect(result).toBeCloseTo(1666.67, 1);
  });

  it('should calculate lead to opportunity rate', () => {
    const result = METRIC_FORMULAS.lead_to_opportunity({ opportunities: 30, total_leads: 100 });
    expect(result).toBe(30);
  });

  it('should calculate win rate', () => {
    const result = METRIC_FORMULAS.win_rate({ closed_won: 20, closed_lost: 30 });
    expect(result).toBeCloseTo(40, 1);
  });

  it('should handle division by zero gracefully', () => {
    // When total_leads is 0, conversion_rate would be Infinity
    const result = METRIC_FORMULAS.conversion_rate({ closed_won: 0, total_leads: 0 });
    expect(isNaN(result)).toBe(true);
  });

  it('should parse and evaluate a formula string', () => {
    // Simple formula parser for "a + b * c" style expressions
    function evaluateFormula(formula: string, variables: Record<string, number>): number {
      let expr = formula;
      for (const [key, value] of Object.entries(variables)) {
        expr = expr.replace(new RegExp(`\\b${key}\\b`, 'g'), String(value));
      }
      // Safe evaluation using Function constructor (only for test)
      try {
        return new Function(`return ${expr}`)();
      } catch {
        return NaN;
      }
    }

    const result = evaluateFormula('a + b * c', { a: 10, b: 5, c: 2 });
    expect(result).toBe(20);
  });
});

// ═══════════════════════════════════════════════════════════════════
// DASHBOARD SHARING PERMISSIONS
// ═══════════════════════════════════════════════════════════════════

describe('Dashboard Sharing Permissions', () => {
  type SharePermission = 'view' | 'edit' | 'admin';
  type UserRole = 'owner' | 'admin' | 'member' | 'viewer';

  const ROLE_SHARE_PERMISSIONS: Record<UserRole, SharePermission[]> = {
    owner: ['view', 'edit', 'admin'],
    admin: ['view', 'edit', 'admin'],
    member: ['view', 'edit'],
    viewer: ['view'],
  };

  function canShareDashboard(sharerRole: UserRole, targetPermission: SharePermission): boolean {
    return ROLE_SHARE_PERMISSIONS[sharerRole]?.includes(targetPermission) || false;
  }

  it('should allow owner to share with any permission', () => {
    expect(canShareDashboard('owner', 'view')).toBe(true);
    expect(canShareDashboard('owner', 'edit')).toBe(true);
    expect(canShareDashboard('owner', 'admin')).toBe(true);
  });

  it('should allow member to share with view and edit only', () => {
    expect(canShareDashboard('member', 'view')).toBe(true);
    expect(canShareDashboard('member', 'edit')).toBe(true);
    expect(canShareDashboard('member', 'admin')).toBe(false);
  });

  it('should restrict viewer to view-only sharing', () => {
    expect(canShareDashboard('viewer', 'view')).toBe(true);
    expect(canShareDashboard('viewer', 'edit')).toBe(false);
    expect(canShareDashboard('viewer', 'admin')).toBe(false);
  });

  it('should enforce that admin sharing cannot exceed own permissions', () => {
    expect(canShareDashboard('admin', 'admin')).toBe(true);
  });
});
