import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { createNotification } from '@/lib/notification-service';
import { checkRateLimit, CRASH_RATE_LIMIT } from '@/lib/feedback/rate-limiter';

// ─── Helpers ───────────────────────────────────────────────────────

function truncate(s: unknown, max: number): string {
  if (s == null) return '';
  const str = String(s);
  return str.length > max ? str.slice(0, max) : str;
}

function getClientIP(request: NextRequest): string {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  const xri = request.headers.get('x-real-ip');
  if (xri) return xri;
  return 'unknown';
}

// ─── POST /api/feedback/crash ──────────────────────────────────────
// No auth required — crashes can happen before auth completes.

export async function POST(request: NextRequest) {
  try {
    // Rate limit by IP: 50/hr
    const ip = getClientIP(request);
    const rl = checkRateLimit(
      `crash:ip:${ip}`,
      CRASH_RATE_LIMIT.limit,
      CRASH_RATE_LIMIT.windowMs,
    );
    if (!rl.allowed) {
      return NextResponse.json(
        { success: false, error: 'Rate limit exceeded' },
        { status: 429 },
      );
    }

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: true }, { status: 200 });
    }

    const message = truncate(body.message, 1000) || 'Unknown crash';
    const stack = truncate(body.stack, 2000);
    const userId = body.userId ? truncate(body.userId, 100) : null;
    const componentName = body.componentName ? truncate(body.componentName, 200) : null;
    const pageUrl = body.pageUrl ? truncate(body.pageUrl, 2000) : null;
    const userAgent = body.userAgent ? truncate(body.userAgent, 500) : null;

    // ── Server-side noise filter (FIX: M_ID crash flood) ──────────
    // Browser extensions (Chrome/Edge/Firefox/Safari) throw errors from
    // injected scripts (e.g. "Cannot read properties of undefined (reading
    // 'M_ID')" from chrome-extension frames). These are NOT app bugs —
    // reject them here so the CrashReport table stays clean even when
    // older clients without the client-side filter report them.
    const NOISE_PATTERN =
      /(chrome-extension|moz-extension|safari-extension|safari-web-extension|edge-extension|extensions::)/i;
    const source = typeof body.source === 'string' ? body.source : '';
    if (
      NOISE_PATTERN.test(message) ||
      NOISE_PATTERN.test(stack) ||
      NOISE_PATTERN.test(source)
    ) {
      // Silently accept but do not persist — report as success so the
      // client's fire-and-forget reporter does not queue for retry.
      return NextResponse.json({ success: true, filtered: 'extension-noise' });
    }

    // Save crash report
    const crash = await db.crashReport.create({
      data: {
        userId,
        errorMessage: message,
        stackTrace: stack || null,
        componentName,
        pageUrl,
        userAgent,
        sessionData: Prisma.DbNull,
      },
    });

    // Check if this same error has occurred >5 times in the last hour.
    // If so, send an urgent admin notification (only once per error per hour window).
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentCount = await db.crashReport.count({
      where: {
        errorMessage: message,
        createdAt: { gte: oneHourAgo },
      },
    });

    // Notify admin only at the threshold (5) to avoid spamming
    if (recentCount === 5) {
      try {
        const admins = await db.user.findMany({
          where: { role: { in: ['super_admin', 'owner', 'admin'] }, isActive: true },
          select: { id: true },
        });
        for (const admin of admins) {
          await createNotification({
            userId: admin.id,
            type: 'system',
            // SAFE USER-FACING MESSAGE (requirement: never expose raw
            // exceptions in the notification UI). The raw crash text is
            // available to admins in the Feedback/Reports console and in the
            // notification metadata (which is never rendered in the UI).
            title: 'System stability alert',
            message: `An application issue was detected ${recentCount} times in the last hour. The details have been logged for the team — no action is required from you.`,
            actionUrl: '/admin/feedback',
            metadata: { crashId: crash.id, errorMessage: message, recentCount, urgent: true },
          });
        }
      } catch {
        // ignore notification failure
      }
    }

    // Always return 200 — crash reporter must never crash
    return NextResponse.json({ success: true, crashId: crash.id });
  } catch (err) {
    console.error('[CrashReport] POST error:', err);
    // Always return 200 to prevent the crash reporter itself from crashing
    return NextResponse.json({ success: true }, { status: 200 });
  }
}
