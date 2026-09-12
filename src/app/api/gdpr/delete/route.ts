// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — GDPR Data Deletion API
// Phase 14.6: Compliance
// POST: Two-step deletion (request → confirm within 24h),
//        anonymize PII, retain financial records
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { db } from '@/lib/db';

const CONFIRMATION_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

export async function POST(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const body = await request.json().catch(() => ({}));
      const step = body.step || 'request'; // request | confirm
      const confirmationCode = body.confirmationCode || '';

      if (step === 'request') {
        // ── Step 1: Request deletion ────────────────────────────────
        // Check if there's already a pending deletion request
        const existingRequest = await db.gdprRequest.findFirst({
          where: {
            userId: user.id,
            requestType: 'deletion',
            status: 'pending',
            createdAt: { gte: new Date(Date.now() - CONFIRMATION_WINDOW_MS) },
          },
        });

        if (existingRequest) {
          return NextResponse.json({
            message: 'Deletion request already pending',
            requestId: existingRequest.id,
            confirmBy: new Date(
              existingRequest.createdAt.getTime() + CONFIRMATION_WINDOW_MS
            ).toISOString(),
            step: 'confirm',
          });
        }

        // Generate confirmation code
        const code = Math.random().toString(36).substring(2, 10).toUpperCase();

        // Create GDPR deletion request
        const gdprRequest = await db.gdprRequest.create({
          data: {
            userId: user.id,
            requestType: 'deletion',
            status: 'pending',
            notes: JSON.stringify({ confirmationCode: code }),
            expiresAt: new Date(Date.now() + CONFIRMATION_WINDOW_MS),
          },
        });

        // Audit log
        await db.auditLog.create({
          data: {
            userId: user.id,
            action: 'gdpr_deletion_requested',
            details: JSON.stringify({ requestId: gdprRequest.id }),
            resource: 'gdpr',
            resourceId: gdprRequest.id,
            ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
            userAgent: request.headers.get('user-agent') || 'unknown',
          },
        });

        return NextResponse.json({
          message: 'Deletion request created. Confirm within 24 hours to proceed.',
          requestId: gdprRequest.id,
          confirmationCode: code,
          confirmBy: new Date(Date.now() + CONFIRMATION_WINDOW_MS).toISOString(),
          step: 'confirm',
        });
      }

      if (step === 'confirm') {
        // ── Step 2: Confirm deletion ────────────────────────────────
        if (!confirmationCode) {
          return NextResponse.json(
            { error: 'Confirmation code is required' },
            { status: 400 }
          );
        }

        // Find the pending deletion request
        const pendingRequest = await db.gdprRequest.findFirst({
          where: {
            userId: user.id,
            requestType: 'deletion',
            status: 'pending',
            createdAt: { gte: new Date(Date.now() - CONFIRMATION_WINDOW_MS) },
          },
        });

        if (!pendingRequest) {
          return NextResponse.json(
            { error: 'No pending deletion request found. Start with step "request".' },
            { status: 404 }
          );
        }

        // Verify confirmation code
        const storedCode = (() => {
          try {
            const notes = JSON.parse(pendingRequest.notes || '{}');
            return notes.confirmationCode;
          } catch {
            return '';
          }
        })();

        if (confirmationCode !== storedCode) {
          return NextResponse.json(
            { error: 'Invalid confirmation code' },
            { status: 400 }
          );
        }

        // Mark request as processing
        await db.gdprRequest.update({
          where: { id: pendingRequest.id },
          data: { status: 'processing' },
        });

        // ── Anonymize PII but retain financial records ──────────────
        const anonymizedEmail = `deleted-${user.id.substring(0, 8)}@gdpr-anonymized.acquisitionos`;
        const anonymizedName = 'Deleted User';

        // Anonymize user record
        await db.user.update({
          where: { id: user.id },
          data: {
            email: anonymizedEmail,
            name: anonymizedName,
            avatar: null,
            phone: null,
            country: null,
            passwordHash: null,
            googleId: null,
            emailVerified: false,
            resetOtp: null,
            resetOtpExpiry: null,
            magicLinkToken: null,
            magicLinkTokenExpiry: null,
            otpAttemptCount: 0,
            otpLockedUntil: null,
            isActive: false,
            deletedAt: new Date(),
          },
        });

        // Delete sessions (auth data)
        await db.userSession.deleteMany({ where: { userId: user.id } });

        // Delete login history
        await db.loginHistory.deleteMany({ where: { userId: user.id } });

        // Delete MFA config
        await db.mfaConfig.deleteMany({ where: { userId: user.id } });

        // Delete notifications
        await db.notification.deleteMany({ where: { userId: user.id } });

        // Delete AI chat sessions and messages
        const chatSessions = await db.aiChatSession.findMany({
          where: { userId: user.id },
          select: { id: true },
        });
        for (const session of chatSessions) {
          await db.aiChatMessage.deleteMany({ where: { sessionId: session.id } });
        }
        await db.aiChatSession.deleteMany({ where: { userId: user.id } });

        // Delete email accounts and associated data
        const emailAccounts = await db.emailAccount.findMany({
          where: { userId: user.id },
          select: { id: true },
        });
        for (const account of emailAccounts) {
          const threads = await db.emailThread.findMany({
            where: { emailAccountId: account.id },
            select: { id: true },
          });
          for (const thread of threads) {
            await db.emailMessage.deleteMany({ where: { threadId: thread.id } });
          }
          await db.emailThread.deleteMany({ where: { emailAccountId: account.id } });
        }
        await db.emailAccount.deleteMany({ where: { userId: user.id } });

        // Delete outreach sequences
        const sequences = await db.outreachSequence.findMany({
          where: { userId: user.id },
          select: { id: true },
        });
        for (const seq of sequences) {
          await db.sequenceStep.deleteMany({ where: { sequenceId: seq.id } });
          await db.sequenceEnrollment.deleteMany({ where: { sequenceId: seq.id } });
        }
        await db.outreachSequence.deleteMany({ where: { userId: user.id } });

        // Delete workflow definitions
        const workflows = await db.workflowDefinition.findMany({
          where: { userId: user.id },
          select: { id: true },
        });
        for (const wf of workflows) {
          const executions = await db.workflowExecution.findMany({
            where: { workflowId: wf.id },
            select: { id: true },
          });
          for (const ex of executions) {
            await db.workflowLog.deleteMany({ where: { executionId: ex.id } });
          }
          await db.workflowExecution.deleteMany({ where: { workflowId: wf.id } });
          await db.workflowStep.deleteMany({ where: { workflowId: wf.id } });
        }
        await db.workflowDefinition.deleteMany({ where: { userId: user.id } });

        // Delete API keys
        await db.apiKey.deleteMany({ where: { userId: user.id } });

        // Delete security alerts
        await db.securityAlert.deleteMany({ where: { userId: user.id } });

        // Delete known devices
        await db.knownDevice.deleteMany({ where: { userId: user.id } });

        // Delete user settings
        await db.userSettings.deleteMany({ where: { userId: user.id } });

        // Delete onboarding progress
        await db.onboardingProgress.deleteMany({ where: { userId: user.id } });

        // Delete email bounces and unsubscribes
        await db.emailBounce.deleteMany({ where: { userId: user.id } });
        await db.emailUnsubscribe.deleteMany({ where: { userId: user.id } });

        // Delete notification preferences
        await db.notificationPreferences.deleteMany({ where: { userId: user.id } });

        // Delete competitor analyses
        await db.competitorAnalysis.deleteMany({ where: { userId: user.id } });

        // Delete lead notes (PII)
        await db.leadNote.deleteMany({ where: { userId: user.id } });

        // Delete usage tracking
        await db.usageTracking.deleteMany({ where: { userId: user.id } });

        // Delete AI cost records
        await db.aiCostRecord.deleteMany({ where: { userId: user.id } });

        // Delete file contexts
        await db.fileContext.deleteMany({ where: { userId: user.id } });

        // Delete API key usage
        await db.apiKeyUsage.deleteMany({ where: { userId: user.id } });

        // Delete conversation messages
        await db.conversationMessage.deleteMany({ where: { userId: user.id } });

        // Delete workflow logs
        await db.workflowLog.deleteMany({ where: { userId: user.id } });

        // ⚠️ RETAIN: Financial records (subscriptions, credits, payment orders, invoices)
        // These are kept for legal/tax compliance but PII is anonymized
        // The user record already has anonymized email/name

        // Mark GDPR request as completed
        await db.gdprRequest.update({
          where: { id: pendingRequest.id },
          data: {
            status: 'completed',
            completedAt: new Date(),
            notes: JSON.stringify({
              confirmationCode: storedCode,
              anonymizedAt: new Date().toISOString(),
              retainedFinancialRecords: true,
            }),
          },
        });

        // Final audit log (will use anonymized user)
        await db.auditLog.create({
          data: {
            userId: user.id,
            action: 'gdpr_deletion_completed',
            details: JSON.stringify({
              requestId: pendingRequest.id,
              financialRecordsRetained: true,
            }),
            resource: 'gdpr',
            resourceId: pendingRequest.id,
            ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
            userAgent: request.headers.get('user-agent') || 'unknown',
          },
        });

        return NextResponse.json({
          message: 'Account deletion completed. Personal data has been anonymized.',
          requestId: pendingRequest.id,
          retainedData: [
            'Anonymized financial records (legal/tax compliance)',
            'Anonymized payment history',
            'Anonymized subscription records',
          ],
          deletedData: [
            'Profile information',
            'Login sessions and history',
            'Email accounts and messages',
            'AI chat history',
            'Outreach sequences',
            'Workflows',
            'API keys',
            'Notifications',
            'Security alerts',
            'User settings',
          ],
        });
      }

      return NextResponse.json({ error: 'Invalid step. Use "request" or "confirm".' }, { status: 400 });
    } catch (error) {
      console.error('GDPR delete error:', error);
      return NextResponse.json({ error: 'Failed to process deletion request' }, { status: 500 });
    }
  });
}
