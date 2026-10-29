// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Part 3: Auth Diagnostic Endpoint
//
// Safe, read-only diagnostic that shows what the RUNNING PROCESS
// actually sees for auth-related env vars. Compares local-vs-GLM
// without exposing secret values.
//
// Output per variable:
//   - name
//   - present: yes/no
//   - length: number of chars in the value
//   - fingerprint: first 4 chars + "…" + last 4 chars (for comparison)
//   - isDevFallback: true if value matches the known dev fallback
//
// NEVER outputs full secret values.
// ═══════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const DEV_FALLBACK_JWT_SECRET = 'acquisitionos-dev-secret-change-in-production';

function fingerprint(value: string | undefined): { present: boolean; length: number; fingerprint: string; isDevFallback: boolean } {
  if (!value || value.length === 0) {
    return { present: false, length: 0, fingerprint: '', isDevFallback: false };
  }
  const fp = value.length <= 8
    ? `${value.slice(0, 2)}…${value.slice(-2)}`
    : `${value.slice(0, 4)}…${value.slice(-4)}`;
  return {
    present: true,
    length: value.length,
    fingerprint: fp,
    isDevFallback: value === DEV_FALLBACK_JWT_SECRET,
  };
}

export async function GET() {
  try {
    const envVars = {
      NODE_ENV: process.env.NODE_ENV || '(unset)',
      AUTH_DEV_MODE: process.env.AUTH_DEV_MODE || '(unset)',
    };

    const authVars = {
      JWT_SECRET: fingerprint(process.env.JWT_SECRET),
      AUTH_SECRET: fingerprint(process.env.AUTH_SECRET),
      NEXTAUTH_SECRET: fingerprint(process.env.NEXTAUTH_SECRET),
      GOOGLE_CLIENT_ID: fingerprint(process.env.GOOGLE_CLIENT_ID),
      GOOGLE_CLIENT_SECRET: fingerprint(process.env.GOOGLE_CLIENT_SECRET),
      SMTP_HOST: { value: process.env.SMTP_HOST || '(unset)' },
      SMTP_PORT: { value: process.env.SMTP_PORT || '(unset)' },
      SMTP_USER: fingerprint(process.env.SMTP_USER),
      SMTP_PASSWORD: fingerprint(process.env.SMTP_PASSWORD),
      SMTP_FROM: { value: process.env.SMTP_FROM || '(unset)' },
      NEXT_PUBLIC_APP_URL: { value: process.env.NEXT_PUBLIC_APP_URL || '(unset)' },
      APP_URL: { value: process.env.APP_URL || '(unset)' },
      APP_PUBLIC_URL: { value: process.env.APP_PUBLIC_URL || '(unset)' },
      NEXTAUTH_URL: { value: process.env.NEXTAUTH_URL || '(unset)' },
      DATABASE_URL: { value: process.env.DATABASE_URL ? `[redacted, length=${process.env.DATABASE_URL.length}]` : '(unset)' },
    };

    // Check if JWT_SECRET is using the dev fallback
    const resolvedJwtSecret = process.env.JWT_SECRET || process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || DEV_FALLBACK_JWT_SECRET;
    const jwtUsingDevFallback = resolvedJwtSecret === DEV_FALLBACK_JWT_SECRET;
    const jwtSecretSource = process.env.JWT_SECRET ? 'JWT_SECRET'
      : process.env.AUTH_SECRET ? 'AUTH_SECRET'
      : process.env.NEXTAUTH_SECRET ? 'NEXTAUTH_SECRET'
      : 'DEV_FALLBACK';

    // Database check
    let dbInfo: Record<string, unknown> = {};
    try {
      const userCount = await db.user.count();
      dbInfo = {
        connected: true,
        userCount,
        message: userCount > 0 ? 'DB has user records' : 'DB is empty — no users',
      };
    } catch (dbErr) {
      dbInfo = {
        connected: false,
        error: dbErr instanceof Error ? dbErr.message.slice(0, 200) : String(dbErr).slice(0, 200),
      };
    }

    // Diagnosis
    const diagnosis: string[] = [];
    if (jwtUsingDevFallback && process.env.NODE_ENV === 'production') {
      diagnosis.push('CRITICAL: JWT_SECRET is using the DEV FALLBACK in production mode. ensureJwtSecret() will THROW on token generation. FIX: restart the server after updating .env — JWT_SECRET is read at module-load time and stale processes use the fallback.');
    }
    if (jwtUsingDevFallback && process.env.NODE_ENV !== 'production') {
      diagnosis.push('WARNING: JWT_SECRET is using the DEV FALLBACK. In dev mode this works (tokens are signed with the fallback), but sessions will not survive a server restart with a different secret. FIX: set JWT_SECRET in .env and restart the server.');
    }
    if (!process.env.GOOGLE_CLIENT_ID) {
      diagnosis.push('WARNING: GOOGLE_CLIENT_ID is not set. Google OAuth will not work.');
    }
    if (!process.env.GOOGLE_CLIENT_SECRET) {
      diagnosis.push('WARNING: GOOGLE_CLIENT_SECRET is not set. Google OAuth will not work.');
    }
    if (!process.env.SMTP_USER || !process.env.SMTP_PASSWORD) {
      diagnosis.push('WARNING: SMTP_USER or SMTP_PASSWORD is not set. OTP/Magic Link email delivery will fail.');
    }

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      runtime: {
        nodeEnv: envVars.NODE_ENV,
        authDevMode: envVars.AUTH_DEV_MODE,
        isProduction: process.env.NODE_ENV === 'production',
      },
      jwt: {
        resolvedSecretSource: jwtSecretSource,
        usingDevFallback: jwtUsingDevFallback,
        willThrowInProduction: jwtUsingDevFallback && process.env.NODE_ENV === 'production',
        ...authVars.JWT_SECRET,
      },
      envVars,
      database: dbInfo,
      diagnosis,
    });
  } catch (error) {
    return NextResponse.json({
      error: 'Diagnostic failed',
      detail: error instanceof Error ? error.message.slice(0, 200) : String(error).slice(0, 200),
    }, { status: 500 });
  }
}
