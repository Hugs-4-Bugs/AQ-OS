// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Google Integration Disconnect
// POST /api/integrations/google/disconnect
// Revokes Gmail + Calendar tokens and updates user settings
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { db } from '@/lib/db';
import { decrypt } from '@/lib/encryption';

export async function POST(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const userId = user.id;

      // Security: Decrypt and revoke email account tokens with Google before marking revoked
      const emailAccounts = await db.emailAccount.findMany({
        where: { userId, status: 'active' },
      });

      for (const account of emailAccounts) {
        try {
          const decryptedAccessToken = decrypt(account.accessToken);
          await fetch(`https://oauth2.googleapis.com/revoke?token=${decryptedAccessToken}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          });
        } catch (revokeError) {
          console.warn('[Google Disconnect] Failed to revoke email token:', revokeError);
          // Continue even if revoke fails
        }
      }

      // Revoke all active EmailAccount records
      await db.emailAccount.updateMany({
        where: { userId, status: 'active' },
        data: { status: 'revoked' },
      });

      // Security: Decrypt and revoke calendar tokens with Google before deleting
      const calendarTokens = await db.googleCalendarToken.findMany({
        where: { userId },
      });

      for (const token of calendarTokens) {
        try {
          const decryptedAccessToken = decrypt(token.accessToken);
          await fetch(`https://oauth2.googleapis.com/revoke?token=${decryptedAccessToken}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          });
        } catch (revokeError) {
          console.warn('[Google Disconnect] Failed to revoke calendar token:', revokeError);
          // Continue even if revoke fails
        }
      }

      // Delete all GoogleCalendarToken records
      await db.googleCalendarToken.deleteMany({
        where: { userId },
      });

      // Update UserSettings — clear Gmail and Calendar connection flags
      await db.userSettings.upsert({
        where: { userId },
        update: {
          gmailConnected: false,
          gmailEmail: null,
          googleCalendarConnected: false,
        },
        create: {
          userId,
          gmailConnected: false,
          gmailEmail: null,
          googleCalendarConnected: false,
        },
      });

      // Create audit log
      await db.auditLog.create({
        data: {
          userId,
          action: 'integration_disconnect',
          details: 'Disconnected Gmail and Google Calendar',
          resource: 'integration',
          resourceId: 'google',
        },
      });

      console.log('[Google Integration] Disconnected for user:', userId);

      return NextResponse.json({
        success: true,
        message: 'Google integration disconnected successfully',
      });
    } catch (error) {
      console.error('[Google Integration] Disconnect error:', error);
      return NextResponse.json(
        { error: 'Failed to disconnect Google integration' },
        { status: 500 }
      );
    }
  });
}
