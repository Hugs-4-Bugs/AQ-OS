// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Server-Side Admin Session Guard
//
// Server-component counterpart of `withSuperAdmin` (auth-middleware.ts).
// Reads the `access_token` cookie via next/headers, verifies the JWT,
// loads the user from the database, and enforces the PLATFORM
// `super_admin` role.
//
// ACCOUNT ISOLATION: org-level `owner` / `admin` roles are tenant-scoped
// and must NEVER reach platform-wide admin pages — same policy as the
// withSuperAdmin API middleware. The DB is the single source of truth;
// the JWT only identifies which user record to load.
// ═══════════════════════════════════════════════════════════════════

import { cookies } from 'next/headers';
import { db } from '@/lib/db';
import { verifyToken } from '@/lib/auth';

export interface AdminSessionUser {
  id: string;
  email: string;
  name: string;
  role: string;
  avatarUrl: string | null;
}

/**
 * Resolve the current server-side session and return the user ONLY if
 * they are an active, non-deleted platform `super_admin`. Returns null
 * for everyone else (unauthenticated, expired token, non-admin roles,
 * deactivated accounts).
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
      },
    });

    if (!user || !user.isActive || user.deletedAt) return null;
    if (user.role !== 'super_admin') return null;

    return {
      id: user.id,
      email: user.email,
      name: user.name || '',
      role: user.role,
      avatarUrl: user.avatar,
    };
  } catch {
    return null;
  }
}
