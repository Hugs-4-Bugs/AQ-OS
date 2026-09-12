// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Mock DB for vi.hoisted()
// This file MUST NOT import from other test files.
// It provides a factory function that can be used inside vi.hoisted()
// since vi.hoisted() runs before imports are resolved.
// ═══════════════════════════════════════════════════════════════════

import { vi } from 'vitest';

export function createHoistedMockDb() {
  return {
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
    loginHistory: { create: vi.fn(), count: vi.fn() },
    userSession: { create: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn() },
    creditAddon: { findMany: vi.fn() },
    $transaction: vi.fn((fn: any) => typeof fn === 'function' ? fn() : fn),
    $queryRaw: vi.fn(),
    $executeRaw: vi.fn(),
  };
}
