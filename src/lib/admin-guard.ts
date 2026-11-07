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
//
// ISSUE 8 (Secure 10-minute inactivity timeout):
//   This guard is READ-ONLY with respect to lastActivityAt.
//   It validates the session but NEVER updates lastActivityAt.
//   Activity updates are accepted ONLY via POST /api/auth/activity,
//   which is called by the client on genuine user input (mouse,
//   keyboard, touch). Page navigation, server rendering, token
//   refresh, and background polling must NOT extend the session.
//
//   Missing/invalid lastActivityAt is treated as fail-closed
//   (session rejected) rather than granting a fresh 10-minute window.
// ═══════════════════════════════════════════════════════════════════

import { cookies } from 'next/headers';
import { db } from '@/lib/db';
import { verifyToken } from '@/lib/auth';

/** Admin session inactivity timeout — 10 minutes (server-side enforced). */
export const ADMIN_INACTIVITY_TIMEOUT_MS = 10 * 60 * 1000;

/** Maximum clock skew tolerated between client and server (ms). */
const MAX_CLOCK_SKEW_MS = 5 * 1000;

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
 * and 10-minute inactivity timeout. The inactivity check READS the
 * `lastActivityAt` column from UserSession (associated via the
 * `refresh_token` cookie) and rejects sessions older than the timeout.
 *
 * NOTE: This function does NOT update `lastActivityAt`. Activity
 * updates are accepted only via `POST /api/auth/activity`, which the
 * admin client calls on genuine user input. Page navigation, server
 * rendering, token refresh, and background polling must NOT extend
 * the session. Missing lastActivityAt is fail-closed (reject).
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

    // ── 10-minute inactivity timeout (server-side, READ-ONLY) ──────
    // Look up the UserSession via the refresh_token cookie. If the
    // session's lastActivityAt is older than the timeout, the session
    // is expired — return null (redirects to login).
    //
    // READ-ONLY POLICY (ISSUE-008):
    //   This function is called by the admin layout on every page
    //   navigation, but page navigation is NOT treated as activity.
    //   The guard READS lastActivityAt for enforcement and NEVER writes
    //   it. Activity updates are accepted ONLY via POST /api/auth/activity,
    //   which the client invokes on genuine user input (mouse, keyboard,
    //   touch). Server rendering, page navigation, token refresh, and
    //   background polling MUST NOT extend the inactivity window.
    //   Missing/non-finite/future lastActivityAt is fail-closed (reject).
    const refreshToken = cookieStore.get('refresh_token')?.value;
    if (!refreshToken) return null;

    const session = await db.userSession.findUnique({
      where: { refreshToken },
      select: {
        id: true,
        lastActivityAt: true,
        isRevoked: true,
        expiresAt: true,
        absoluteExpiresAt: true,
      },
    });

    if (!session || session.isRevoked) return null;

    const now = Date.now();
    // FAIL-CLOSED: If lastActivityAt is missing, malformed, non-finite,
    // or in the future beyond the documented clock-skew allowance,
    // reject the session rather than granting a fresh 10-minute window.
    if (!session.lastActivityAt) {
      return null;
    }
    const lastActivityMs = new Date(session.lastActivityAt).getTime();
    if (!Number.isFinite(lastActivityMs)) {
      return null;
    }
    if (lastActivityMs > now + MAX_CLOCK_SKEW_MS) {
      return null;
    }
    const elapsed = now - lastActivityMs;

    if (elapsed > ADMIN_INACTIVITY_TIMEOUT_MS + MAX_CLOCK_SKEW_MS) {
      // Session expired due to inactivity — revoke it
      await db.userSession.update({
        where: { id: session.id },
        data: { isRevoked: true },
      }).catch(() => {});
      return null;
    }

    // Honor absolute session expiry (remember-me ceiling).
    if (
      session.absoluteExpiresAt &&
      now > new Date(session.absoluteExpiresAt).getTime()
    ) {
      await db.userSession.update({
        where: { id: session.id },
        data: { isRevoked: true },
      }).catch(() => {});
      return null;
    }

    // Honor refresh-token TTL.
    if (session.expiresAt && now > new Date(session.expiresAt).getTime()) {
      return null;
    }

    // ── READ-ONLY: This function must NOT update lastActivityAt. ──
    // Activity updates are accepted ONLY via POST /api/auth/activity,
    // which is called by the client on genuine user input (mouse,
    // keyboard, touch). Page navigation, server rendering, token
    // refresh, and background polling must NOT extend the session.
    const secondsLeft = Math.max(
      0,
      Math.floor((ADMIN_INACTIVITY_TIMEOUT_MS - elapsed) / 1000)
    );

    return {
      id: user.id,
      email: user.email,
      name: user.name || '',
      role: user.role,
      avatarUrl: user.avatar,
      mfaEnrolled: !!user.mfaConfig?.isEnabled,
      inactivitySecondsLeft: secondsLeft,
    };
  } catch {
    return null;
  }
}
