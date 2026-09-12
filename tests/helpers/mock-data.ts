// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Realistic Test Data Factories
// Phase 14.1: Comprehensive Testing Suite
// ═══════════════════════════════════════════════════════════════════

import { randomId, daysFromNow, daysAgo } from './test-utils';

// ═══════════════════════════════════════════════════════════════════
// USER FACTORIES
// ═══════════════════════════════════════════════════════════════════

export function createMockUser(overrides: Record<string, unknown> = {}) {
  const id = (overrides.id as string) || randomId();
  return {
    id,
    email: `test-${id}@example.com`,
    name: 'Test User',
    password: '$2a$12$hashedpassword1234567890abcdef', // bcrypt hash of "TestPass123!"
    role: 'member',
    plan: 'free',
    credits: 50,
    creditsMonthly: 50,
    rolloverCredits: 0,
    orgId: null,
    emailVerified: true,
    isActive: true,
    isTrial: false,
    trialEndsAt: null,
    avatar: null,
    otpAttemptCount: 0,
    otpLockedUntil: null,
    magicLinkToken: null,
    magicLinkTokenExpiry: null,
    resetOtp: null,
    resetOtpExpiry: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    mfaConfig: null,
    ...overrides,
  };
}

export function createMockAdminUser(overrides: Record<string, unknown> = {}) {
  return createMockUser({ role: 'admin', ...overrides });
}

export function createMockProUser(overrides: Record<string, unknown> = {}) {
  return createMockUser({ plan: 'pro', credits: 500, creditsMonthly: 500, ...overrides });
}

export function createMockEliteUser(overrides: Record<string, unknown> = {}) {
  return createMockUser({ plan: 'elite', credits: 2000, creditsMonthly: 2000, ...overrides });
}

export function createMockTrialUser(overrides: Record<string, unknown> = {}) {
  return createMockUser({
    plan: 'pro',
    isTrial: true,
    trialEndsAt: daysFromNow(14),
    credits: 500,
    creditsMonthly: 500,
    ...overrides,
  });
}

// ═══════════════════════════════════════════════════════════════════
// SUBSCRIPTION FACTORIES
// ═══════════════════════════════════════════════════════════════════

export function createMockSubscription(overrides: Record<string, unknown> = {}) {
  const id = (overrides.id as string) || randomId();
  const userId = (overrides.userId as string) || randomId();
  return {
    id,
    userId,
    plan: 'free',
    status: 'trialing',
    billingCycle: 'monthly',
    isTrial: true,
    trialEndsAt: daysFromNow(14),
    currentPeriodStart: new Date(),
    currentPeriodEnd: daysFromNow(30),
    cancelAtPeriodEnd: false,
    scheduledPlanChange: null,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    razorpaySubscriptionId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

export function createMockActiveSubscription(overrides: Record<string, unknown> = {}) {
  return createMockSubscription({
    status: 'active',
    isTrial: false,
    trialEndsAt: null,
    plan: 'pro',
    ...overrides,
  });
}

export function createMockPastDueSubscription(overrides: Record<string, unknown> = {}) {
  return createMockSubscription({ status: 'past_due', isTrial: false, ...overrides });
}

export function createMockCanceledSubscription(overrides: Record<string, unknown> = {}) {
  return createMockSubscription({ status: 'canceled', cancelAtPeriodEnd: true, ...overrides });
}

export function createMockExpiredSubscription(overrides: Record<string, unknown> = {}) {
  return createMockSubscription({ status: 'expired', isTrial: false, ...overrides });
}

// ═══════════════════════════════════════════════════════════════════
// CREDITS / LEDGER FACTORIES
// ═══════════════════════════════════════════════════════════════════

export function createMockCreditsLedger(overrides: Record<string, unknown> = {}) {
  return {
    id: randomId(),
    userId: (overrides.userId as string) || randomId(),
    action: 'lead_discovery',
    credits: -1,
    balance: 49,
    description: 'Deducted 1 credits for lead_discovery',
    referenceId: null,
    createdAt: new Date(),
    ...overrides,
  };
}

export function createMockCreditAddon(overrides: Record<string, unknown> = {}) {
  return {
    id: randomId(),
    userId: (overrides.userId as string) || randomId(),
    credits: 100,
    pricePaid: 10,
    currency: 'USD',
    paymentOrderId: null,
    expiresAt: daysFromNow(90),
    createdAt: new Date(),
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════
// LEAD FACTORIES
// ═══════════════════════════════════════════════════════════════════

export function createMockLead(overrides: Record<string, unknown> = {}) {
  return {
    id: randomId(),
    userId: (overrides.userId as string) || randomId(),
    orgId: null,
    businessName: 'Test Business LLC',
    ownerName: 'John Smith',
    website: 'https://testbusiness.example.com',
    email: 'contact@testbusiness.example.com',
    phone: '+1-555-0100',
    whatsapp: null,
    linkedin: 'https://linkedin.com/company/test-business',
    instagram: null,
    facebook: null,
    googleMapsListing: null,
    reviews: '42 reviews',
    rating: 4.5,
    city: 'San Francisco',
    country: 'US',
    niche: 'SaaS',
    source: 'ai_search',
    stage: 'discovered',
    hasWebsite: true,
    isActive: true,
    emailStatus: null,
    estimatedQuality: null,
    estimatedRevenue: null,
    websiteQuality: null,
    bestContactPerson: null,
    bestChannel: null,
    bestTiming: null,
    outreachStyle: null,
    replyScore: 60,
    conversionScore: 55,
    urgencyScore: 45,
    revenuePotentialScore: 65,
    tags: '[]',
    notes: null,
    scoreReasoning: null,
    digitalWeaknesses: null,
    techStack: null,
    opportunityNotes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════
// WORKFLOW FACTORIES
// ═══════════════════════════════════════════════════════════════════

export function createMockWorkflowDefinition(overrides: Record<string, unknown> = {}) {
  const id = (overrides.id as string) || randomId();
  return {
    id,
    userId: (overrides.userId as string) || randomId(),
    name: 'Test Workflow',
    description: 'A test workflow for unit testing',
    status: 'draft',
    triggerType: 'manual_trigger',
    triggerConfig: null,
    nodes: JSON.stringify([
      { id: 'trigger-1', type: 'trigger', title: 'Trigger', config: {} },
      { id: 'action-1', type: 'send_email', title: 'Send Email', config: { subject: 'Hello', content: 'Test email', leadId: null } },
    ]),
    edges: JSON.stringify([
      { id: 'edge-1', source: 'trigger-1', target: 'action-1', sourceHandle: null },
    ]),
    webhookPath: null,
    isTemplate: false,
    templateCategory: null,
    maxConcurrency: 1,
    timeoutMs: 300000,
    maxRetries: 3,
    orgId: null,
    scheduleCron: null,
    version: 1,
    runCount: 0,
    successCount: 0,
    failureCount: 0,
    avgRuntimeMs: 0,
    lastRunAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    workflowSteps: [],
    ...overrides,
  };
}

export function createMockWorkflowExecution(overrides: Record<string, unknown> = {}) {
  return {
    id: randomId(),
    workflowId: (overrides.workflowId as string) || randomId(),
    userId: (overrides.userId as string) || randomId(),
    status: 'queued',
    triggerData: null,
    currentStep: 0,
    totalSteps: 1,
    maxRetries: 3,
    retryCount: 0,
    error: null,
    isDeadLetter: false,
    deadLetterReason: null,
    durationMs: null,
    idempotencyKey: randomId(),
    startedAt: null,
    completedAt: null,
    pausedAt: null,
    resumedAt: null,
    lastRetryAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════
// COMPETITOR FACTORIES
// ═══════════════════════════════════════════════════════════════════

export function createMockCompetitorAnalysis(overrides: Record<string, unknown> = {}) {
  return {
    id: randomId(),
    userId: (overrides.userId as string) || randomId(),
    leadId: null,
    competitorName: 'Competitor Corp',
    competitorUrl: 'https://competitor.example.com',
    competitorDataId: null,
    techStack: null,
    seoScore: null,
    socialScore: null,
    strengths: null,
    weaknesses: null,
    opportunities: null,
    threats: null,
    threatLevel: 'medium',
    pricingModel: null,
    estimatedTrafficTier: null,
    differentiationOpportunities: null,
    analysisData: null,
    socialProfiles: null,
    pricingDetails: null,
    reviewsData: null,
    lighthouseData: null,
    pageSpeedData: null,
    aiComparisonData: null,
    opportunityScore: null,
    lastAnalyzedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════
// COUPON FACTORIES
// ═══════════════════════════════════════════════════════════════════

export function createMockCoupon(overrides: Record<string, unknown> = {}) {
  return {
    id: randomId(),
    code: 'TEST20',
    discountType: 'percent',
    discountValue: 20,
    maxUses: 100,
    usedCount: 0,
    expiresAt: daysFromNow(30),
    applicablePlans: JSON.stringify(['pro', 'elite']),
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════
// SESSION / AUTH FACTORIES
// ═══════════════════════════════════════════════════════════════════

export function createMockUserSession(overrides: Record<string, unknown> = {}) {
  return {
    id: randomId(),
    userId: (overrides.userId as string) || randomId(),
    refreshToken: randomId() + '_refresh_token',
    deviceInfo: 'Chrome 120 / macOS',
    ipAddress: '192.168.1.1',
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
    expiresAt: daysFromNow(30),
    isRevoked: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

export function createMockLoginHistory(overrides: Record<string, unknown> = {}) {
  return {
    id: randomId(),
    userId: (overrides.userId as string) || randomId(),
    ip: '192.168.1.1',
    userAgent: 'Mozilla/5.0',
    country: 'US',
    city: 'San Francisco',
    success: true,
    failReason: null,
    createdAt: new Date(),
    ...overrides,
  };
}

export function createMockAuditLog(overrides: Record<string, unknown> = {}) {
  return {
    id: randomId(),
    userId: (overrides.userId as string) || randomId(),
    action: 'signin',
    details: null,
    ipAddress: '192.168.1.1',
    userAgent: 'Mozilla/5.0',
    resource: 'auth',
    resourceId: null,
    createdAt: new Date(),
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════
// PAYMENT ORDER FACTORIES
// ═══════════════════════════════════════════════════════════════════

export function createMockPaymentOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: randomId(),
    userId: (overrides.userId as string) || randomId(),
    provider: 'razorpay',
    providerPaymentId: null,
    providerOrderId: null,
    amount: 29,
    currency: 'USD',
    plan: 'pro',
    billingCycle: 'monthly',
    status: 'pending',
    subtotal: 29,
    taxRate: 0,
    taxAmount: 0,
    couponCode: null,
    discountAmount: 0,
    metadata: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════
// MESSAGE / OUTREACH FACTORIES
// ═══════════════════════════════════════════════════════════════════

export function createMockOutreachMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: randomId(),
    leadId: (overrides.leadId as string) || randomId(),
    userId: (overrides.userId as string) || randomId(),
    channel: 'email',
    direction: 'outbound',
    subject: 'Business Opportunity',
    content: 'Hello, I wanted to reach out...',
    status: 'queued',
    generatedByAI: false,
    metadata: null,
    sentAt: null,
    deliveredAt: null,
    openedAt: null,
    clickedAt: null,
    repliedAt: null,
    bouncedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════
// DISCOVERY JOB FACTORIES
// ═══════════════════════════════════════════════════════════════════

export function createMockDiscoveryJob(overrides: Record<string, unknown> = {}) {
  return {
    id: randomId(),
    userId: (overrides.userId as string) || randomId(),
    status: 'pending',
    source: 'ai_search',
    niche: 'SaaS',
    country: 'US',
    city: null,
    totalFound: 0,
    imported: 0,
    duplicates: 0,
    failed: 0,
    errorMessage: null,
    resultData: null,
    startedAt: null,
    completedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════
// AI CHAT FACTORIES
// ═══════════════════════════════════════════════════════════════════

export function createMockAiChatSession(overrides: Record<string, unknown> = {}) {
  return {
    id: randomId(),
    userId: (overrides.userId as string) || randomId(),
    title: 'Sales Strategy Chat',
    context: null,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    messages: [],
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════
// INTEGRATION FACTORIES
// ═══════════════════════════════════════════════════════════════════

export function createMockGmailConfig(overrides: Record<string, unknown> = {}) {
  return {
    id: randomId(),
    userId: (overrides.userId as string) || randomId(),
    email: 'test@gmail.com',
    accessToken: 'mock_access_token',
    refreshToken: 'mock_refresh_token',
    tokenExpiry: daysFromNow(1),
    labelId: null,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

export function createMockTelegramConfig(overrides: Record<string, unknown> = {}) {
  return {
    id: randomId(),
    userId: (overrides.userId as string) || randomId(),
    botToken: '123456:ABC-DEF',
    chatId: '-1001234567890',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

export function createMockWhatsappConfig(overrides: Record<string, unknown> = {}) {
  return {
    id: randomId(),
    userId: (overrides.userId as string) || randomId(),
    provider: 'meta_cloud',
    phoneNumberId: '123456789',
    businessAccountId: '987654321',
    accessToken: 'mock_whatsapp_token',
    webhookVerifyToken: 'verify_token_123',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}
