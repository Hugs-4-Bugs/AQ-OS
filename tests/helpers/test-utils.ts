// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Test Utilities
// ═══════════════════════════════════════════════════════════════════

import { vi } from 'vitest';

export function createMockPrisma() {
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
    $transaction: vi.fn((fn) => typeof fn === 'function' ? fn() : fn),
    $queryRaw: vi.fn(),
    $executeRaw: vi.fn(),
  };
}

export function createMockRequest(body?: Record<string, unknown>, opts?: {
  method?: string; headers?: Record<string, string>; url?: string;
}) {
  return new Request(opts?.url || 'http://localhost:3000/api/test', {
    method: opts?.method || (body ? 'POST' : 'GET'),
    headers: { 'Content-Type': 'application/json', ...opts?.headers },
    body: body ? JSON.stringify(body) : undefined,
  });
}

export function createTestUser(overrides?: Record<string, unknown>) {
  return {
    id: 'user_test123', email: 'test@acquisitionos.com', name: 'Test User',
    passwordHash: '$2b$10$hashedpassword123', plan: 'pro', credits: 500,
    creditsMonthly: 500, rolloverCredits: 50, emailVerified: true,
    isActive: true, isTrial: false, role: 'owner', orgId: null,
    ...overrides,
  };
}

export function createTestLead(overrides?: Record<string, unknown>) {
  return {
    id: 'lead_test123', businessName: 'Test Business', ownerName: 'John Doe',
    email: 'john@testbusiness.com', phone: '+1234567890',
    website: 'https://testbusiness.com', niche: 'restaurant',
    city: 'Mumbai', country: 'India', stage: 'discovered',
    conversionScore: 75, replyScore: 60, urgencyScore: 40,
    revenuePotentialScore: 80, isActive: true, userId: 'user_test123',
    ...overrides,
  };
}

export function createTestSubscription(overrides?: Record<string, unknown>) {
  return {
    id: 'sub_test123', userId: 'user_test123', plan: 'pro', status: 'active',
    billingCycle: 'monthly', isTrial: false, cancelAtPeriodEnd: false,
    currentPeriodStart: new Date('2024-01-01'), currentPeriodEnd: new Date('2024-02-01'),
    ...overrides,
  };
}

export function createTestWorkflow(overrides?: Record<string, unknown>) {
  return {
    id: 'wf_test123', userId: 'user_test123', name: 'Test Workflow',
    description: 'A test workflow', status: 'active', triggerType: 'lead_discovered',
    triggerConfig: '{}', nodes: '[]', edges: '[]', version: 1,
    runCount: 0, successCount: 0, failureCount: 0,
    ...overrides,
  };
}

export function createTestPaymentOrder(overrides?: Record<string, unknown>) {
  return {
    id: 'po_test123', userId: 'user_test123', provider: 'razorpay',
    amount: 999, currency: 'INR', plan: 'pro', billingCycle: 'monthly',
    status: 'pending', subtotal: 999, taxRate: 18, taxAmount: 179.82,
    ...overrides,
  };
}

export const MOCK_JWT_PAYLOAD = {
  userId: 'user_test123', email: 'test@acquisitionos.com', plan: 'pro', role: 'owner',
};

export function createAuthHeaders(token = 'mock-jwt-token') {
  return { Authorization: `Bearer ${token}`, Cookie: `accessToken=${token}` };
}
