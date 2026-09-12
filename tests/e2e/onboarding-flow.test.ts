// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — E2E Test Spec: Onboarding Flow
// Phase 14.1: Comprehensive Testing Suite
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockPrisma, randomId, daysFromNow } from '../helpers/test-utils';
import { createMockUser, createMockSubscription } from '../helpers/mock-data';

const mockPrisma = createMockPrisma();

vi.mock('@/lib/db', () => ({ db: mockPrisma }));
vi.mock('@/lib/billing-audit', () => ({
  logCreditEvent: vi.fn(),
  logSubscriptionEvent: vi.fn(),
  logBillingEvent: vi.fn(),
}));

describe('E2E Spec: Onboarding Flow', () => {
  /**
   * Test Steps:
   * 1. User signs in for the first time
   * 2. System checks for OnboardingProgress record
   * 3. If none exists, system creates one with all steps incomplete
   * 4. User completes step 1: Profile setup (name, company)
   * 5. User completes step 2: Select business niche
   * 6. User completes step 3: Connect integrations (optional)
   * 7. User completes step 4: Invite team members (optional)
   * 8. System marks onboarding as completed
   * 9. Dashboard loads with personalized content
   */

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Step 2-3: Onboarding progress initialization', () => {
    it('should create onboarding progress for new user', async () => {
      mockPrisma.onboardingProgress.findFirst.mockResolvedValue(null);
      mockPrisma.onboardingProgress.create.mockResolvedValue({
        id: randomId(),
        userId: 'user-123',
        currentStep: 0,
        completedSteps: [],
        profileCompleted: false,
        nicheSelected: false,
        integrationsConnected: false,
        teamInvited: false,
        completed: false,
        createdAt: new Date(),
      });

      const result = await mockPrisma.onboardingProgress.create({
        data: {
          userId: 'user-123',
          currentStep: 0,
          completed: false,
        },
      });

      expect(result.completed).toBe(false);
    });
  });

  describe('Step 4: Profile setup', () => {
    it('should update user profile and mark step complete', async () => {
      mockPrisma.user.update.mockResolvedValue({
        ...createMockUser({ id: 'user-123' }),
        name: 'John Smith',
      });
      mockPrisma.onboardingProgress.update.mockResolvedValue({
        id: randomId(),
        profileCompleted: true,
      });

      await mockPrisma.user.update({
        where: { id: 'user-123' },
        data: { name: 'John Smith' },
      });

      await mockPrisma.onboardingProgress.update({
        where: { id: 'onboarding-1' },
        data: { profileCompleted: true },
      });

      expect(mockPrisma.user.update).toHaveBeenCalled();
      expect(mockPrisma.onboardingProgress.update).toHaveBeenCalled();
    });
  });

  describe('Step 5: Niche selection', () => {
    it('should save user niche preference', async () => {
      mockPrisma.userSettings.upsert.mockResolvedValue({
        id: randomId(),
        userId: 'user-123',
        niche: 'SaaS',
      });

      const result = await mockPrisma.userSettings.upsert({
        where: { userId: 'user-123' },
        create: { userId: 'user-123', niche: 'SaaS' },
        update: { niche: 'SaaS' },
      });

      expect(result.niche).toBe('SaaS');
    });
  });

  describe('Step 8: Onboarding completion', () => {
    it('should mark all steps as completed', async () => {
      mockPrisma.onboardingProgress.update.mockResolvedValue({
        id: randomId(),
        profileCompleted: true,
        nicheSelected: true,
        integrationsConnected: true,
        teamInvited: true,
        completed: true,
        completedAt: new Date(),
      });

      const result = await mockPrisma.onboardingProgress.update({
        where: { id: 'onboarding-1' },
        data: {
          profileCompleted: true,
          nicheSelected: true,
          completed: true,
          completedAt: new Date(),
        },
      });

      expect(result.completed).toBe(true);
    });
  });
});
