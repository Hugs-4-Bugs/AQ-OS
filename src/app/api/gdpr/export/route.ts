// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — GDPR Data Export API
// Phase 14.6: Compliance
// GET: Full data export (all user data from all tables), rate limited 1/24h
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { db } from '@/lib/db';

// Rate limit: 1 export per 24 hours
const EXPORT_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      // Check rate limit — last export within 24h
      const lastExport = await db.dataExport.findFirst({
        where: {
          userId: user.id,
          exportType: 'gdpr_full_export',
          status: 'completed',
          completedAt: { gte: new Date(Date.now() - EXPORT_COOLDOWN_MS) },
        },
        orderBy: { completedAt: 'desc' },
      });

      if (lastExport) {
        const nextAvailable = new Date(
          lastExport.completedAt!.getTime() + EXPORT_COOLDOWN_MS
        ).toISOString();
        return NextResponse.json(
          {
            error: 'Export rate limit exceeded',
            message: `You can request another export after ${nextAvailable}`,
            nextAvailable,
          },
          { status: 429 }
        );
      }

      // Collect all user data from all related tables
      const userData = await collectAllUserData(user.id);

      // Create export record
      const exportRecord = await db.dataExport.create({
        data: {
          userId: user.id,
          exportType: 'gdpr_full_export',
          status: 'completed',
          recordCount: countRecords(userData),
          completedAt: new Date(),
        },
      });

      // Also create GDPR request record
      await db.gdprRequest.create({
        data: {
          userId: user.id,
          requestType: 'portability',
          status: 'completed',
          completedAt: new Date(),
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        },
      });

      // Audit log
      await db.auditLog.create({
        data: {
          userId: user.id,
          action: 'gdpr_data_export',
          details: JSON.stringify({
            exportId: exportRecord.id,
            recordCount: exportRecord.recordCount,
          }),
          resource: 'gdpr',
          resourceId: exportRecord.id,
          ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
          userAgent: request.headers.get('user-agent') || 'unknown',
        },
      });

      return NextResponse.json({
        exportId: exportRecord.id,
        exportDate: new Date().toISOString(),
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          plan: user.plan,
          role: user.role,
        },
        data: userData,
        notice: 'This export contains all personal data held by AcquisitionOS. The download link expires in 30 days.',
      });
    } catch (error) {
      console.error('GDPR export error:', error);
      return NextResponse.json({ error: 'Failed to export data' }, { status: 500 });
    }
  });
}

async function collectAllUserData(userId: string) {
  const [
    profile,
    sessions,
    loginHistory,
    mfaConfig,
    subscriptions,
    creditsLedger,
    creditAddons,
    paymentOrders,
    emailAccounts,
    outreachSequences,
    workflowDefinitions,
    competitorAnalyses,
    aiChatSessions,
    settings,
    auditLogs,
    notifications,
    apiKeys,
    gdprRequests,
    dataExports,
    onboardingProgress,
    emailBounces,
    emailUnsubscribes,
    usageTracking,
    securityAlerts,
    aiCostRecords,
  ] = await Promise.all([
    db.user.findUnique({
      where: { id: userId },
      select: {
        id: true, email: true, name: true, avatar: true,
        emailVerified: true, phone: true, country: true,
        plan: true, credits: true, role: true, orgId: true,
        authProvider: true, isActive: true, lastLoginAt: true,
        createdAt: true, updatedAt: true,
        passwordHash: false, resetOtp: false, resetOtpExpiry: false,
        emailVerificationOtp: false, magicLinkToken: false,
        otpAttemptCount: false, otpLockedUntil: false,
      },
    }),
    db.userSession.findMany({ where: { userId } }),
    db.loginHistory.findMany({ where: { userId }, take: 100 }),
    db.mfaConfig.findUnique({ where: { userId }, select: { isEnabled: true, verifiedAt: true } }),
    db.subscription.findMany({ where: { userId } }),
    db.creditsLedger.findMany({ where: { userId }, take: 500 }),
    db.creditAddon.findMany({ where: { userId } }),
    db.paymentOrder.findMany({ where: { userId } }),
    db.emailAccount.findMany({ where: { userId }, select: { id: true, gmailEmail: true, consentGiven: true, consentGivenAt: true, status: true, mode: true, createdAt: true } }),
    db.outreachSequence.findMany({ where: { userId } }),
    db.workflowDefinition.findMany({ where: { userId } }),
    db.competitorAnalysis.findMany({ where: { userId } }),
    db.aiChatSession.findMany({ where: { userId }, include: { messages: true } }),
    db.userSettings.findUnique({ where: { userId } }),
    db.auditLog.findMany({ where: { userId }, take: 500 }),
    db.notification.findMany({ where: { userId }, take: 200 }),
    db.apiKey.findMany({ where: { userId }, select: { id: true, name: true, keyPrefix: true, isActive: true, lastUsedAt: true, createdAt: true } }),
    db.gdprRequest.findMany({ where: { userId } }),
    db.dataExport.findMany({ where: { userId } }),
    db.onboardingProgress.findUnique({ where: { userId } }),
    db.emailBounce.findMany({ where: { userId } }),
    db.emailUnsubscribe.findMany({ where: { userId } }),
    db.usageTracking.findMany({ where: { userId }, take: 200 }),
    db.securityAlert.findMany({ where: { userId } }),
    db.aiCostRecord.findMany({ where: { userId }, take: 200 }),
  ]);

  // Get leads and related data
  const leads = await db.lead.findMany({
    where: { userId },
    take: 1000,
    include: {
      leadAnalysis: true,
      leadScores: { take: 50 },
      leadNotes: true,
      outreachMessages: true,
    },
  });

  return {
    profile,
    sessions,
    loginHistory,
    mfaConfig,
    subscriptions,
    creditsLedger,
    creditAddons,
    paymentOrders,
    emailAccounts,
    outreachSequences,
    workflowDefinitions,
    competitorAnalyses,
    aiChatSessions,
    settings,
    auditLogs,
    notifications,
    apiKeys,
    gdprRequests,
    dataExports,
    onboardingProgress,
    emailBounces,
    emailUnsubscribes,
    usageTracking,
    securityAlerts,
    aiCostRecords,
    leads,
  };
}

function countRecords(data: Record<string, unknown>): number {
  let count = 0;
  for (const value of Object.values(data)) {
    if (Array.isArray(value)) {
      count += value.length;
    } else if (value && typeof value === 'object') {
      count += 1;
    }
  }
  return count;
}
