// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Settings: Session Revoke by ID
// DELETE /api/settings/sessions/[id] — Revoke a specific session
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth, logAuthEvent, getClientIp, getUserAgent } from '@/lib/auth';

// DELETE /api/settings/sessions/[id] - Revoke a specific session
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(request);
    const ip = getClientIp(request);
    const ua = getUserAgent(request);
    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: 'Session ID is required' }, { status: 400 });
    }

    // Verify session belongs to user
    const session = await db.userSession.findFirst({
      where: { id, userId: user.id },
    });

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    // Don't allow revoking current session through this endpoint
    const currentRefreshToken = request.cookies.get('refresh_token')?.value;
    if (session.refreshToken === currentRefreshToken) {
      return NextResponse.json(
        { error: 'Cannot revoke your current session. Use sign out instead.' },
        { status: 400 }
      );
    }

    // Revoke the session
    await db.userSession.update({
      where: { id },
      data: { isRevoked: true },
    });

    // Audit log
    await logAuthEvent({
      userId: user.id,
      action: 'session_revoked',
      details: JSON.stringify({ sessionId: id, deviceInfo: session.deviceInfo, ipAddress: session.ipAddress }),
      ipAddress: ip,
      userAgent: ua,
      resource: 'session',
      resourceId: id,
    });

    return NextResponse.json({ success: true, message: 'Session revoked' });
  } catch (error) {
    if (error instanceof Error && 'statusCode' in error) {
      return NextResponse.json({ error: error.message }, { status: (error as { statusCode: number }).statusCode });
    }
    console.error('Error revoking session:', error);
    return NextResponse.json({ error: 'Failed to revoke session' }, { status: 500 });
  }
}
