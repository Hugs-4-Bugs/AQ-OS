// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Auth Diagnostic Endpoint
//
// This endpoint returns detailed diagnostic info about the runtime
// environment to help debug auth issues on Aliyun Function Compute.
//
// It checks:
//   - All critical env vars (SET / MISSING / EMPTY)
//   - DB connectivity (tries to count users)
//   - Request headers (Origin, Referer, Host, x-forwarded-*)
//   - Computed appUrl from getAppUrl()
//   - Google OAuth redirect URI that would be generated
//
// This endpoint is PUBLIC (no auth required) so it can be hit directly
// from a browser to diagnose deployment issues.
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { getAppUrl, buildAppUrl } from '@/lib/app-url';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function envStatus(key: string): { key: string; status: 'SET' | 'MISSING' | 'EMPTY'; preview: string } {
  const val = process.env[key];
  if (val === undefined) return { key, status: 'MISSING', preview: '' };
  if (val === '') return { key, status: 'EMPTY', preview: '' };
  // Show a short preview for debugging, but mask secrets
  const isSecret = /SECRET|PASSWORD|PASS|KEY/i.test(key);
  if (isSecret) {
    return { key, status: 'SET', preview: val.substring(0, 4) + '****' };
  }
  return { key, status: 'SET', preview: val.substring(0, 60) };
}

export async function GET(request: NextRequest) {
  const startTime = Date.now();

  // ── 1. Environment variables ────────────────────────────────────
  const envKeys = [
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'AUTH_SECRET',
    'NEXTAUTH_SECRET',
    'JWT_SECRET',
    'DATABASE_URL',
    'APP_URL',
    'APP_PUBLIC_URL',
    'NEXT_PUBLIC_APP_URL',
    'NEXTAUTH_URL',
    'NODE_ENV',
    'SMTP_HOST',
    'SMTP_PORT',
    'SMTP_USER',
    'SMTP_PASSWORD',
    'SMTP_PASS',
    'EMAIL_FROM',
    'SMTP_FROM',
    'CRON_SECRET',
  ];

  const envVars = envKeys.map(envStatus);

  // ── 2. Request headers ──────────────────────────────────────────
  const headers: Record<string, string> = {};
  const headerKeys = [
    'host',
    'origin',
    'referer',
    'x-forwarded-host',
    'x-forwarded-proto',
    'x-forwarded-for',
    'x-real-ip',
    'user-agent',
    'accept',
  ];
  for (const h of headerKeys) {
    const val = request.headers.get(h);
    if (val) headers[h] = val;
  }

  // ── 3. Computed URLs ────────────────────────────────────────────
  const computedAppUrl = getAppUrl(request);
  const googleRedirectUri1 = buildAppUrl('/api/auth/google/callback', request);
  const googleRedirectUri2 = buildAppUrl('/api/auth/callback/google', request);
  const magicLinkVerifyUrl = buildAppUrl('/api/auth/magic-link/verify', request);

  // ── 4. DB connectivity test ─────────────────────────────────────
  let dbStatus: {
    status: 'healthy' | 'error';
    userCount?: number;
    error?: string;
    databaseUrl: string;
    responseTimeMs: number;
  } = {
    status: 'error',
    databaseUrl: process.env.DATABASE_URL || 'NOT SET',
    responseTimeMs: 0,
  };

  const dbStart = Date.now();
  try {
    // Lazy import to avoid module-load issues
    const { db } = await import('@/lib/db');
    const userCount = await db.user.count();
    dbStatus = {
      status: 'healthy',
      userCount,
      databaseUrl: process.env.DATABASE_URL || 'NOT SET',
      responseTimeMs: Date.now() - dbStart,
    };
  } catch (err) {
    dbStatus = {
      status: 'error',
      error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
      databaseUrl: process.env.DATABASE_URL || 'NOT SET',
      responseTimeMs: Date.now() - dbStart,
    };
  }

  // ── 5. Google OAuth config check ────────────────────────────────
  const googleClientId = process.env.GOOGLE_CLIENT_ID;
  const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const googleConfig = {
    clientIdSet: !!googleClientId,
    clientIdPreview: googleClientId ? googleClientId.substring(0, 20) + '...' : 'MISSING',
    clientSecretSet: !!googleClientSecret,
    clientSecretValid: googleClientSecret ? googleClientSecret.startsWith('GOCSPX-') : false,
    redirectUriUsed: googleRedirectUri2, // The frontend uses /api/auth/callback/google
  };

  // ── 6. Build response ───────────────────────────────────────────
  const response = {
    timestamp: new Date().toISOString(),
    totalTimeMs: Date.now() - startTime,
    runtime: {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      cwd: process.cwd(),
      pid: process.pid,
      nextRuntime: process.env.NEXT_RUNTIME || 'unknown',
    },
    envVars,
    headers,
    computedUrls: {
      appUrl: computedAppUrl,
      googleRedirectUri1, // /api/auth/google/callback
      googleRedirectUri2, // /api/auth/callback/google (used by frontend)
      magicLinkVerifyUrl,
    },
    db: dbStatus,
    google: googleConfig,
    diagnosis: {
      appUrlCorrect: computedAppUrl === 'https://acquisition.space-z.ai',
      googleConfigured: !!googleClientId && !!googleClientSecret,
      dbHealthy: dbStatus.status === 'healthy',
      redirectUriRegistered:
        googleRedirectUri2 === 'https://acquisition.space-z.ai/api/auth/callback/google',
    },
  };

  // Log to server console too (for FC logs)
  console.warn('[Auth Debug] Diagnostic response:', JSON.stringify(response, null, 2));

  return NextResponse.json(response, {
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  });
}
