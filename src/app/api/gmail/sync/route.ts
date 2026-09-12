// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — POST /api/gmail/sync
// Phase 9: Gmail Integration — Trigger Inbox Sync
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { syncInbox } from '@/lib/gmail-inbox-service';
import { scheduleInboxSync } from '@/lib/gmail-job-service';
import { getConnectedAccounts } from '@/lib/gmail-oauth-service';
import { logGmailEvent } from '@/lib/gmail-audit-service';

export async function POST(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const body = await request.json().catch(() => ({}));
      const { emailAccountId } = body;

      if (emailAccountId) {
        // Sync specific account
        try {
          // Schedule background job
          const jobId = scheduleInboxSync(user.id, emailAccountId);

          // Also trigger immediate sync (non-blocking)
          syncInbox(emailAccountId).catch(err => {
            console.error('[Gmail API] Background sync failed:', err);
          });

          // Audit log
          await logGmailEvent({
            userId: user.id,
            action: 'gmail_inbox_synced',
            details: `Inbox sync triggered for account: ${emailAccountId}`,
            resourceId: emailAccountId,
            metadata: { jobId },
          });

          return NextResponse.json({ syncStarted: true, jobId });
        } catch (error) {
          if (error instanceof Error && 'statusCode' in error) {
            const customError = error as Error & { statusCode: number; code: string };
            if (customError.statusCode === 409) {
              // Sync already in progress
              return NextResponse.json(
                { error: 'Sync already in progress for this account', syncStarted: false },
                { status: 409 }
              );
            }
            if (customError.statusCode === 429) {
              return NextResponse.json(
                { error: error.message, syncStarted: false },
                { status: 429 }
              );
            }
            throw error;
          }
          throw error;
        }
      } else {
        // Sync all connected accounts
        const accounts = await getConnectedAccounts(user.id);

        if (accounts.length === 0) {
          return NextResponse.json(
            { error: 'No connected Gmail accounts found', syncStarted: false },
            { status: 400 }
          );
        }

        const jobIds: string[] = [];
        for (const account of accounts) {
          if (account.isActive) {
            const jobId = scheduleInboxSync(user.id, account.id);
            jobIds.push(jobId);

            // Trigger immediate sync for each account (non-blocking)
            syncInbox(account.id).catch(err => {
              console.error(`[Gmail API] Background sync failed for ${account.id}:`, err);
            });
          }
        }

        // Audit log
        await logGmailEvent({
          userId: user.id,
          action: 'gmail_inbox_synced',
          details: `Inbox sync triggered for ${jobIds.length} accounts`,
          metadata: { accountCount: jobIds.length, jobIds },
        });

        return NextResponse.json({
          syncStarted: true,
          accountsSynced: jobIds.length,
          jobIds,
        });
      }
    } catch (error) {
      console.error('[Gmail API] Sync error:', error);

      if (error instanceof Error && 'statusCode' in error) {
        const customError = error as Error & { statusCode: number; code: string };
        return NextResponse.json(
          { error: error.message, code: customError.code },
          { status: customError.statusCode }
        );
      }

      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Internal server error' },
        { status: 500 }
      );
    }
  });
}
