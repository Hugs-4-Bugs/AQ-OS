// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Known Devices API Route
// GET: List known devices for current user
// DELETE: Revoke a device session
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { db } from '@/lib/db';
import { logAuthEvent } from '@/lib/auth';
import type { AuthUser } from '@/lib/auth';

/**
 * GET /api/auth/security/devices
 * List known devices for the current user
 */
export async function GET(request: NextRequest) {
  return withAuth(request, async (user: AuthUser) => {
    try {
      const { getKnownDevices } = await import('@/lib/device-fingerprint');
      const devices = await getKnownDevices(user.id);

      // Also get active sessions for cross-referencing
      const activeSessions = await db.userSession.findMany({
        where: {
          userId: user.id,
          isRevoked: false,
          expiresAt: { gt: new Date() },
        },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          deviceInfo: true,
          ipAddress: true,
          userAgent: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      // Enrich devices with session info
      const enrichedDevices = devices.map(device => {
        // Find matching session by device info
        const matchingSession = activeSessions.find(s => {
          // Match by device name if it matches user agent substring
          if (device.deviceName && s.userAgent) {
            return device.deviceName.includes(s.userAgent.substring(0, 30));
          }
          return false;
        });

        return {
          id: device.id,
          deviceFingerprint: device.deviceFingerprint,
          deviceName: device.deviceName,
          lastSeenAt: device.lastSeenAt,
          isTrusted: device.isTrusted,
          isCurrentlyActive: !!matchingSession,
          sessionId: matchingSession?.id || null,
          ipAddress: matchingSession?.ipAddress || null,
        };
      });

      // Also include sessions that don't match any known device
      const matchedSessionIds = new Set(
        enrichedDevices
          .filter(d => d.sessionId)
          .map(d => d.sessionId)
      );

      const unmatchedSessions = activeSessions.filter(
        s => !matchedSessionIds.has(s.id)
      );

      const sessionDevices = unmatchedSessions.map(s => ({
        id: s.id,
        deviceFingerprint: '',
        deviceName: s.deviceInfo || s.userAgent?.substring(0, 60) || 'Unknown Device',
        lastSeenAt: s.updatedAt,
        isTrusted: false,
        isCurrentlyActive: true,
        sessionId: s.id,
        ipAddress: s.ipAddress,
      }));

      return NextResponse.json({
        devices: [...enrichedDevices, ...sessionDevices],
        activeSessionCount: activeSessions.length,
        maxSessions: 5,
      });
    } catch (error) {
      console.error('Security devices GET error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch known devices' },
        { status: 500 }
      );
    }
  });
}

/**
 * DELETE /api/auth/security/devices
 * Revoke a device session
 *
 * Body:
 * - deviceId: string — ID of the device/session to revoke
 * - deviceFingerprint?: string — fingerprint of the device to revoke (alternative)
 */
export async function DELETE(request: NextRequest) {
  return withAuth(request, async (user: AuthUser) => {
    try {
      const body = await request.json();
      const { deviceId, deviceFingerprint } = body;

      if (!deviceId && !deviceFingerprint) {
        return NextResponse.json(
          { error: 'deviceId or deviceFingerprint is required' },
          { status: 400 }
        );
      }

      let revokedCount = 0;

      // If deviceFingerprint is provided, revoke by fingerprint
      if (deviceFingerprint) {
        // Find and revoke sessions associated with this fingerprint
        const sessions = await db.userSession.findMany({
          where: {
            userId: user.id,
            isRevoked: false,
            expiresAt: { gt: new Date() },
          },
        });

        for (const session of sessions) {
          // Check if session's deviceInfo matches the fingerprint
          if (session.deviceInfo?.includes(deviceFingerprint)) {
            await db.userSession.update({
              where: { id: session.id },
              data: { isRevoked: true },
            });
            revokedCount++;
          }
        }

        // Also remove from KnownDevice table if it exists
        try {
          const prisma = db as any;
          if (prisma.knownDevice) {
            await prisma.knownDevice.deleteMany({
              where: {
                userId: user.id,
                deviceFingerprint,
              },
            });
          }
        } catch {
          // Non-blocking
        }
      }

      // If deviceId is provided, revoke by session ID
      if (deviceId) {
        const session = await db.userSession.findFirst({
          where: {
            id: deviceId,
            userId: user.id,
            isRevoked: false,
          },
        });

        if (session) {
          await db.userSession.update({
            where: { id: session.id },
            data: { isRevoked: true },
          });
          revokedCount++;
        }
      }

      // Log the device revocation
      await logAuthEvent({
        userId: user.id,
        action: 'session_revoked',
        details: `Device session revoked: ${deviceFingerprint || deviceId}`,
        resource: 'auth',
      });

      if (revokedCount === 0) {
        return NextResponse.json(
          { error: 'No active sessions found for this device' },
          { status: 404 }
        );
      }

      return NextResponse.json({
        message: `Revoked ${revokedCount} session(s) for this device`,
        revokedCount,
      });
    } catch (error) {
      console.error('Security devices DELETE error:', error);
      return NextResponse.json(
        { error: 'Failed to revoke device session' },
        { status: 500 }
      );
    }
  });
}
