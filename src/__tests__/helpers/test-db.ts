// ═══════════════════════════════════════════════════════════════════
// Test Helper: Mock Prisma client for testing without a real database
// ═══════════════════════════════════════════════════════════════════

import { vi } from 'vitest';

/**
 * Create a mock Prisma client with all common methods stubbed.
 * Each method returns a vi.fn() that can be configured per-test.
 */
export function createMockPrismaClient() {
  return {
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
      count: vi.fn(),
    },
    creditsLedger: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    creditAddon: {
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    subscription: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    userSession: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    loginHistory: {
      create: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    lead: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    deal: {
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    communication: {
      findMany: vi.fn(),
      create: vi.fn(),
      count: vi.fn(),
    },
    workflowExecution: {
      count: vi.fn(),
    },
    paymentOrder: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    notification: {
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn(),
    },
    emailAccount: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    mfaConfig: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn((fn: unknown) => {
      if (typeof fn === 'function') return fn(createMockPrismaClient());
      return Promise.resolve(fn);
    }),
  };
}

/**
 * Set up the Prisma mock for the db module.
 * Call this in your test file's setup to mock @/lib/db.
 */
export function mockDb() {
  const mockPrisma = createMockPrismaClient();

  vi.mock('@/lib/db', () => ({
    db: mockPrisma,
  }));

  return mockPrisma;
}

/**
 * Reset all mock function calls.
 */
export function resetMockDb(mockPrisma: ReturnType<typeof createMockPrismaClient>) {
  for (const model of Object.values(mockPrisma)) {
    if (typeof model === 'object' && model !== null) {
      for (const [key, fn] of Object.entries(model)) {
        if (typeof fn === 'function' && 'mockReset' in fn) {
          (fn as ReturnType<typeof vi.fn>).mockReset();
        }
      }
    }
  }
}
