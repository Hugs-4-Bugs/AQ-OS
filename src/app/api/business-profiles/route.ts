// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Business Profiles API (multi-profile per user)
// GET  /api/business-profiles        — list the caller's profiles
// POST /api/business-profiles        — create (plan-limit enforced)
//
// Business Profiles are a SEPARATE concept from User Personal Context
// (settings/personal-context) and from AcquisitionCampaign. Ownership is
// enforced server-side: every query is scoped to the authenticated user.
//
// PLAN LIMITS (server-side, canonical entitlement service):
//   free=1, starter=1, pro=3, elite=7 ACTIVE profiles.
// The limit applies to ACTIVE profiles only. Downgrades NEVER delete
// profiles — over-limit profiles remain intact (read-only until the user
// archives others or upgrades again).
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { db } from '@/lib/db';
import { canPerformAction, getFeatureLimit, type PlanType } from '@/lib/entitlement-service';

/** Text fields a client may set. name is required; everything else optional. */
const TEXT_FIELDS = [
  'name',
  'industry',
  'description',
  'productsServices',
  'offers',
  'valueProposition',
  'targetAudience',
  'targetIndustries',
  'targetRoles',
  'geographicMarket',
  'painPoints',
  'businessGoals',
  'differentiators',
  'proofPoints',
  'preferredTone',
  'preferredLanguage',
  'cta',
  'commercialConstraints',
  'customInstructions',
  'researchPreferences',
  'outreachPreferences',
] as const;

const MAX_FIELD_LENGTH = 2000;

function pickProfileFields(body: Record<string, unknown>): Record<string, string | null> {
  const data: Record<string, string | null> = {};
  for (const field of TEXT_FIELDS) {
    const value = body[field];
    if (value === undefined) continue;
    if (value === null) {
      if (field === 'name') continue; // name can never be nulled
      data[field] = null;
      continue;
    }
    if (typeof value !== 'string') continue;
    data[field] = value.trim().slice(0, MAX_FIELD_LENGTH);
  }
  return data;
}

export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const profiles = await db.businessProfile.findMany({
        where: { userId: user.id },
        orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
      });

      const plan = (user.plan || 'free') as PlanType;
      const activeCount = profiles.filter((p) => p.status === 'active').length;
      const limit = getFeatureLimit(plan, 'business_profiles');

      return NextResponse.json({
        profiles,
        total: profiles.length,
        activeCount,
        planLimit: limit,
      });
    } catch (error) {
      console.error('[BusinessProfiles] GET failed:', error);
      return NextResponse.json({ error: 'Failed to load business profiles' }, { status: 500 });
    }
  });
}

export async function POST(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const body = await request.json().catch(() => ({}));
      const data = pickProfileFields(body);

      if (!data.name || !String(data.name).trim()) {
        return NextResponse.json(
          { error: 'Profile name is required' },
          { status: 400 }
        );
      }

      // ── Server-side plan limit on ACTIVE profiles ──
      const plan = (user.plan || 'free') as PlanType;
      const activeCount = await db.businessProfile.count({
        where: { userId: user.id, status: 'active' },
      });
      const limitCheck = canPerformAction(plan, 'business_profiles', activeCount);
      if (!limitCheck.allowed) {
        return NextResponse.json(
          {
            error:
              limitCheck.reason ||
              `Your ${plan} plan allows ${limitCheck.limit} active business profile(s). Archive one or upgrade to add more.`,
            code: 'PLAN_LIMIT_REACHED',
            planLimit: limitCheck.limit,
            activeCount,
          },
          { status: 403 }
        );
      }

      const profile = await db.businessProfile.create({
        data: {
          userId: user.id,
          name: String(data.name),
          ...Object.fromEntries(Object.entries(data).filter(([k]) => k !== 'name')),
        },
      });

      return NextResponse.json({ profile }, { status: 201 });
    } catch (error) {
      console.error('[BusinessProfiles] POST failed:', error);
      return NextResponse.json({ error: 'Failed to create business profile' }, { status: 500 });
    }
  });
}
