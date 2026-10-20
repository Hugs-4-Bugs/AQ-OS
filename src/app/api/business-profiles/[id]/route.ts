// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Single Business Profile API
// GET    /api/business-profiles/[id] — load (owner only)
// PUT    /api/business-profiles/[id] — update / archive / re-activate
// DELETE /api/business-profiles/[id] — delete (owner only)
//
// Ownership is enforced server-side on EVERY operation (where userId).
// Re-activating an archived profile respects the ACTIVE-profile plan limit.
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { db } from '@/lib/db';
import { canPerformAction, type PlanType } from '@/lib/entitlement-service';

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
      if (field === 'name') continue;
      data[field] = null;
      continue;
    }
    if (typeof value !== 'string') continue;
    data[field] = value.trim().slice(0, MAX_FIELD_LENGTH);
  }
  return data;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async (user) => {
    try {
      const { id } = await params;
      const profile = await db.businessProfile.findFirst({
        where: { id, userId: user.id },
      });

      if (!profile) {
        return NextResponse.json(
          { error: 'Business profile not found' },
          { status: 404 }
        );
      }

      return NextResponse.json({ profile });
    } catch (error) {
      console.error('[BusinessProfile] GET failed:', error);
      return NextResponse.json({ error: 'Failed to load business profile' }, { status: 500 });
    }
  });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async (user) => {
    try {
      const { id } = await params;
      const body = await request.json().catch(() => ({}));

      const profile = await db.businessProfile.findFirst({
        where: { id, userId: user.id },
      });

      if (!profile) {
        return NextResponse.json(
          { error: 'Business profile not found' },
          { status: 404 }
        );
      }

      const data = pickProfileFields(body);

      // Status transitions: 'active' | 'archived'. Re-activation respects the
      // ACTIVE-profile plan limit (server-side, canonical entitlement service).
      if (body.status !== undefined) {
        if (body.status !== 'active' && body.status !== 'archived') {
          return NextResponse.json(
            { error: "status must be 'active' or 'archived'" },
            { status: 400 }
          );
        }
        if (body.status === 'active' && profile.status !== 'active') {
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
                  `Your ${plan} plan allows ${limitCheck.limit} active business profile(s). Archive another profile or upgrade to activate this one.`,
                code: 'PLAN_LIMIT_REACHED',
                planLimit: limitCheck.limit,
                activeCount,
              },
              { status: 403 }
            );
          }
        }
        (data as Record<string, unknown>).status = body.status;
      }

      if ('name' in data && (!data.name || !String(data.name).trim())) {
        return NextResponse.json({ error: 'Profile name cannot be empty' }, { status: 400 });
      }
      if (Object.keys(data).length === 0) {
        return NextResponse.json({ error: 'No changes provided' }, { status: 400 });
      }

      const updated = await db.businessProfile.update({
        where: { id: profile.id },
        data,
      });

      return NextResponse.json({ profile: updated });
    } catch (error) {
      console.error('[BusinessProfile] PUT failed:', error);
      return NextResponse.json({ error: 'Failed to update business profile' }, { status: 500 });
    }
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async (user) => {
    try {
      const { id } = await params;

      const profile = await db.businessProfile.findFirst({
        where: { id, userId: user.id },
      });

      if (!profile) {
        return NextResponse.json(
          { error: 'Business profile not found' },
          { status: 404 }
        );
      }

      // Workflows associated with this profile keep running with
      // profileId = null (onDelete: SetNull) — nothing is orphaned.
      await db.businessProfile.delete({ where: { id: profile.id } });

      return NextResponse.json({ success: true });
    } catch (error) {
      console.error('[BusinessProfile] DELETE failed:', error);
      return NextResponse.json({ error: 'Failed to delete business profile' }, { status: 500 });
    }
  });
}
