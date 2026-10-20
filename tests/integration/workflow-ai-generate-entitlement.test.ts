// ═══════════════════════════════════════════════════════════════════
// Integration Tests: AI Workflow Creation Entitlement (Pro & Elite)
// POST /api/workflows/ai-generate — plan gating via the existing
// 'workflow_access' entitlement (enabled on Pro + Elite, disabled on
// Free + Starter). All externals are mocked: DB, credits, Z-AI, audit.
// No real database, no real credits, no real AI calls.
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock auth: withAuth passes the configurable test user through ──
let mockUser: Record<string, unknown> = { id: 'user_test123', plan: 'pro' };

vi.mock('@/lib/auth-middleware', () => ({
  withAuth: vi.fn((request: unknown, handler: (user: unknown) => Promise<Response>) =>
    handler(mockUser)
  ),
}));

// ── Mock credits (no real credit mutations) ──────────────────────
const deductCreditsMock = vi.fn();

vi.mock('@/lib/credit-service', () => ({
  deductCredits: (...args: unknown[]) => deductCreditsMock(...args),
  refundCredits: vi.fn().mockResolvedValue({ success: true }),
}));

// ── Mock Z-AI SDK (no real AI usage) ─────────────────────────────
vi.mock('z-ai-web-dev-sdk', () => ({
  default: {
    create: vi.fn(async () => ({
      chat: {
        completions: {
          create: vi.fn(async () => ({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    name: 'Follow Up With Leads',
                    description: 'Send a follow-up when a lead is discovered.',
                    triggerType: 'manual',
                    triggerConfig: {},
                    steps: [
                      {
                        nodeType: 'action',
                        actionType: 'create_notification',
                        title: 'Notify me',
                        config: {},
                      },
                    ],
                  }),
                },
              },
            ],
          })),
        },
      },
    })),
  },
}));

// ── Mock audit + db (entitlement-service imports these) ──────────
vi.mock('@/lib/billing-audit', () => ({
  logEntitlementEvent: vi.fn().mockResolvedValue(undefined),
  logBillingEvent: vi.fn().mockResolvedValue(undefined),
  logCreditEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/db', () => ({
  db: {},
}));

import { POST } from '@/app/api/workflows/ai-generate/route';
import { ENTITLEMENTS } from '@/lib/entitlement-service';
import { logEntitlementEvent } from '@/lib/billing-audit';

function makeRequest(description = 'When a lead replies, wait 2 hours, then notify me') {
  return new Request('http://localhost:3000/api/workflows/ai-generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ description }),
  }) as unknown as Parameters<typeof POST>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  deductCreditsMock.mockResolvedValue({ success: true, newBalance: 745 });
  mockUser = { id: 'user_test123', plan: 'pro' };
});

describe('POST /api/workflows/ai-generate — entitlement gate', () => {
  it('allows PRO users to create workflows with AI', async () => {
    mockUser = { id: 'user_pro', plan: 'pro' };
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.generated.name).toBe('Follow Up With Leads');
    expect(body.creditsDeducted).toBe(5);
    expect(deductCreditsMock).toHaveBeenCalledTimes(1);
  });

  it('allows ELITE users to create workflows with AI', async () => {
    mockUser = { id: 'user_elite', plan: 'elite' };
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(deductCreditsMock).toHaveBeenCalledTimes(1);
  });

  it('rejects FREE users with FEATURE_REQUIRED and requiredPlan pro', async () => {
    mockUser = { id: 'user_free', plan: 'free' };
    const res = await POST(makeRequest());
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe('FEATURE_REQUIRED');
    expect(body.feature).toBe('workflow_access');
    expect(body.currentPlan).toBe('free');
    expect(body.requiredPlan).toBe('pro');
    // Blocked BEFORE any credit deduction
    expect(deductCreditsMock).not.toHaveBeenCalled();
    expect(logEntitlementEvent).toHaveBeenCalledWith(
      'user_free',
      'feature_blocked',
      expect.objectContaining({ feature: 'workflow_access', plan: 'free' })
    );
  });

  it('rejects STARTER users with FEATURE_REQUIRED and requiredPlan pro', async () => {
    mockUser = { id: 'user_starter', plan: 'starter' };
    const res = await POST(makeRequest());
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe('FEATURE_REQUIRED');
    expect(body.requiredPlan).toBe('pro');
    expect(deductCreditsMock).not.toHaveBeenCalled();
  });
});

describe('ENTITLEMENTS consistency for workflow_access', () => {
  it('enables workflow_access exactly for pro and elite', () => {
    expect(ENTITLEMENTS.free.workflow_access.enabled).toBe(false);
    expect(ENTITLEMENTS.starter.workflow_access.enabled).toBe(false);
    expect(ENTITLEMENTS.pro.workflow_access.enabled).toBe(true);
    expect(ENTITLEMENTS.elite.workflow_access.enabled).toBe(true);
  });
});
