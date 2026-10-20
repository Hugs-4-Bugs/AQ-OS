// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — User Preference / Personal Business Context API
// GET /api/settings/personal-context
// PUT /api/settings/personal-context  body: PersonalContext (object)
//
// DISTINCT capability — NOT the Business Profile system and NOT the Offer
// Profile. Persists the user's self-description in
// UserSettings.personalContext (JSON string, per-field length caps).
// Consumed by AI features via src/lib/personal-context.ts helpers.
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { withApiLogging } from '@/lib/observability/api-logger';
import { db } from '@/lib/db';
import {
  parsePersonalContext,
  sanitizePersonalContext,
} from '@/lib/personal-context';

export const GET = withApiLogging(async (request: NextRequest) => {
  return withAuth(request, async (user) => {
    try {
      const settings = await db.userSettings.findUnique({
        where: { userId: user.id },
        select: { personalContext: true },
      });
      return NextResponse.json({ context: parsePersonalContext(settings?.personalContext) });
    } catch (err) {
      console.error('[PersonalContext:GET] Unexpected error:', err);
      return NextResponse.json({ error: 'Failed to load personal context' }, { status: 500 });
    }
  });
}, 'settings/personal-context');

export const PUT = withApiLogging(async (request: NextRequest) => {
  return withAuth(request, async (user) => {
    try {
      const body = await request.json().catch(() => ({}));
      const { context, errors } = sanitizePersonalContext(body?.context ?? body);

      if (errors.length > 0) {
        return NextResponse.json(
          { error: 'Invalid personal context', details: errors },
          { status: 400 }
        );
      }

      const stored = Object.keys(context).length > 0 ? JSON.stringify(context) : null;

      await db.userSettings.upsert({
        where: { userId: user.id },
        update: { personalContext: stored },
        create: { userId: user.id, personalContext: stored },
      });

      return NextResponse.json({ success: true, context });
    } catch (err) {
      console.error('[PersonalContext:PUT] Unexpected error:', err);
      return NextResponse.json({ error: 'Failed to save personal context' }, { status: 500 });
    }
  });
}, 'settings/personal-context');
