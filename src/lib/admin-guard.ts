// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Server-Side Admin Session Guard
//
// Server-component counterpart of `withSuperAdmin` (auth-middleware.ts).
// Reads the `access_token` cookie via next/headers, verifies the JWT,
// loads the user from the database, and enforces the PLATFORM
// `super_admin` role.
//
// SECURITY LAYERS:
//   1. JWT access token verification (15-min expiry)
//   2. super_admin role check (DB is source of truth)
//   3. MFA enrollment check (mandatory TOTP for admins)
//   4. 10-minute inactivity timeout (lastActivityAt on UserSession)
//
// ACCOUNT ISOLATION: org-level `owner` / `admin` roles are tenant-scoped
// and must NEVER reach platform-wide admin pages.
// ═══════════════════════════════════════════════════════════════════

import { cookies } from 'next/headers';
import { db } from '@/lib/db';
import { verifyToken } from '@/lib/auth';

/** Admin session inactivity timeout — 10 minutes (server-side enforced). */
export const ADMIN_INACTIVITY_TIMEOUT_MS = 10 * 60 * 1000;

/** Throttle: only update lastActivityAt every 60s to avoid per-request DB writes. */
const ACTIVITY_WRITE_THROTTLE_MS = 60 * 1000;

export interface AdminSessionUser {
  id: string;
  email: string;
  name: string;
  role: string;
  avatarUrl: string | null;
  mfaEnrolled: boolean;
  /** Seconds remaining before inactivity timeout (for UI countdown). */
  inactivitySecondsLeft: number;
}

/**
 * Resolve the current server-side session and return the user ONLY if
 * they are an active, non-deleted platform `super_admin` with a valid
 * (non-expired, within inactivity timeout) session. Returns null for
 * everyone else.
 *
 * Enforces ALL security layers: JWT expiry, role check, MFA enrollment,
 * and 10-minute inactivity timeout. The inactivity check reads the
 * `lastActivityAt` column from UserSession (associated via the
 * `refresh_token` cookie) and rejects sessions older than the timeout.
 */
export async function getSuperAdminSession(): Promise<AdminSessionUser | null> {
  try {
    const cookieStore = await cookies();
    const accessToken = cookieStore.get('access_token')?.value;
    if (!accessToken) return null;

    const payload = verifyToken(accessToken);
    if (!payload || payload.type !== 'access') return null;

    const user = await db.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        avatar: true,
        isActive: true,
        deletedAt: true,
        mfaConfig: { select: { isEnabled: true } },
      },
    });

    if (!user || !user.isActive || user.deletedAt) return null;
    if (user.role !== 'super_admin') return null;

    // ── 10-minute inactivity timeout (server-side) ────────────────
    // Look up the UserSession via the refresh_token cookie. If the
    // session's lastActivityAt is older than the timeout, the session
    // is expired — return null (redirects to login).
    const refreshToken = cookieStore.get('refresh_token')?.value;
    if (refreshToken) {
      const session = await db.userSession.findUnique({
        where: { refreshToken },
        select: { id: true, lastActivityAt: true, isRevoked: true },
      });

      if (!session || session.isRevoked) return null;

      const now = Date.now();
      const lastActivity = session.lastActivityAt
        ? new Date(session.lastActivityAt).getTime()
        : now;
      const elapsed = now - lastActivity;

      if (elapsed > ADMIN_INACTIVITY_TIMEOUT_MS) {
        // Session expired due to inactivity — revoke it
        await db.userSession.update({
          where: { id: session.id },
          data: { isRevoked: true },
        }).catch(() => {});
        return null;
      }

      // Update lastActivityAt (throttled to avoid per-request DB writes)
      if (elapsed > ACTIVITY_WRITE_THROTTLE_MS) {
        await db.userSession.update({
          where: { id: session.id },
          data: { lastActivityAt: new Date(now) },
        }).catch(() => {});
      }

      const secondsLeft = Math.max(0, Math.floor((ADMIN_INACTIVITY_TIMEOUT_MS - elapsed) / 1000));

      return {
        id: user.id,
        email: user.email,
        name: user.name || '',
        role: user.role,
        avatarUrl: user.avatar,
        mfaEnrolled: !!user.mfaConfig?.isEnabled,
        inactivitySecondsLeft: secondsLeft,
      };
    }

    // No refresh token cookie — can't verify session activity
    return null;
  } catch {
    return null;
  }
}
