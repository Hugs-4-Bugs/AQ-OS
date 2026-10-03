// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Business Profiles API
// GET  /api/business-profiles        — list the authenticated user's profiles
// POST /api/business-profiles        — create a new profile
//
// OWNERSHIP: every query is scoped by the authenticated user's id. A user can
// never list, read, or modify another user's profiles — enforcement happens
// HERE (server-side), not in the frontend.
//
// Lazy default seed: if the user has no profiles yet, the GET synthesizes a
// first profile from whatever business data already exists in their
// UserSettings/onboarding answers (non-destructive — creates a new row, never
// overwrites existing data).
//
// Plan Eligibility Correction: the number of ACTIVE (non-archived) profiles
// is capped per plan — Free 1 · Starter 1 · Pro 3 · Elite 7 (enforced in
// POST; limits apply to profiles/niches, never to leads). Existing profiles
// are never auto-archived or deleted: a user already over their plan's cap
// keeps their profiles but cannot create more until they archive one or
// upgrade.
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import {
  BUSINESS_PROFILE_LIMITS,
  PLAN_TIER_LABELS,
  nextProfileLimitPlan,
  toPlanTier,
} from '@/lib/plan-feature-limits';

// Mirrors the BusinessProfile model's stringified-JSON columns.
export interface BusinessProfilePayload {
  id: string;
  label: string;
  companyName: string | null;
  industry: string | null;
  website: string | null;
  description: string | null;
  valueProposition: string | null;
  productsServices: Array<{ name: string; description?: string }>;
  targetAudience: { industries?: string[]; roles?: string[]; icp?: string };
  serviceAreas: string[];
  goals: string | null;
  toneStyle: string | null;
  language: string | null;
  differentiators: string[];
  preferredCta: string | null;
  additionalContext: string | null;
  isDefault: boolean;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export function safeParse<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    return (parsed ?? fallback) as T;
  } catch {
    return fallback;
  }
}

export function serializeProfile(p: {
  id: string;
  label: string;
  companyName: string | null;
  industry: string | null;
  website: string | null;
  description: string | null;
  valueProposition: string | null;
  productsServices: string | null;
  targetAudience: string | null;
  serviceAreas: string | null;
  goals: string | null;
  toneStyle: string | null;
  language: string | null;
  differentiators: string | null;
  preferredCta: string | null;
  additionalContext: string | null;
  isDefault: boolean;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): BusinessProfilePayload {
  return {
    id: p.id,
    label: p.label,
    companyName: p.companyName,
    industry: p.industry,
    website: p.website,
    description: p.description,
    valueProposition: p.valueProposition,
    productsServices: safeParse<Array<{ name: string; description?: string }>>(p.productsServices, []),
    targetAudience: safeParse<{ industries?: string[]; roles?: string[]; icp?: string }>(p.targetAudience, {}),
    serviceAreas: safeParse<string[]>(p.serviceAreas, []),
    goals: p.goals,
    toneStyle: p.toneStyle,
    language: p.language,
    differentiators: safeParse<string[]>(p.differentiators, []),
    preferredCta: p.preferredCta,
    additionalContext: p.additionalContext,
    isDefault: p.isDefault,
    archivedAt: p.archivedAt ? p.archivedAt.toISOString() : null,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

/** Validate + normalize a create/update payload. Returns field errors. */
export function validateProfileInput(body: unknown): { errors: string[]; data: Record<string, unknown> } {
  const errors: string[] = [];
  const data: Record<string, unknown> = {};
  const b = (body ?? {}) as Record<string, unknown>;

  if (b.label !== undefined) {
    const label = typeof b.label === 'string' ? b.label.trim() : '';
    if (!label) errors.push('label is required and must be a non-empty string');
    else if (label.length > 100) errors.push('label must be at most 100 characters');
    else data.label = label;
  }

  const strFields = [
    'companyName', 'industry', 'website', 'description', 'valueProposition',
    'goals', 'toneStyle', 'language', 'preferredCta', 'additionalContext',
  ] as const;
  for (const f of strFields) {
    if (b[f] !== undefined) {
      if (b[f] === null) { data[f] = null; continue; }
      if (typeof b[f] !== 'string') { errors.push(`${f} must be a string or null`); continue; }
      if ((b[f] as string).length > 5000) { errors.push(`${f} must be at most 5000 characters`); continue; }
      data[f] = (b[f] as string).trim() || null;
    }
  }

  if (b.productsServices !== undefined) {
    if (!Array.isArray(b.productsServices)) {
      errors.push('productsServices must be an array');
    } else {
      const items = (b.productsServices as unknown[])
        .filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null)
        .slice(0, 50)
        .map((x) => ({
          name: String(x.name ?? '').trim().slice(0, 200),
          description: String(x.description ?? '').trim().slice(0, 1000) || undefined,
        }))
        .filter((x) => x.name);
      data.productsServices = JSON.stringify(items);
    }
  }

  if (b.targetAudience !== undefined) {
    if (typeof b.targetAudience !== 'object' || b.targetAudience === null || Array.isArray(b.targetAudience)) {
      errors.push('targetAudience must be an object');
    } else {
      const ta = b.targetAudience as Record<string, unknown>;
      const arr = (v: unknown): string[] =>
        Array.isArray(v) ? (v as unknown[]).map((x) => String(x).trim().slice(0, 200)).filter(Boolean).slice(0, 50) : [];
      data.targetAudience = JSON.stringify({
        industries: arr(ta.industries),
        roles: arr(ta.roles),
        icp: typeof ta.icp === 'string' ? ta.icp.trim().slice(0, 2000) : '',
      });
    }
  }

  if (b.serviceAreas !== undefined) {
    if (!Array.isArray(b.serviceAreas)) {
      errors.push('serviceAreas must be an array');
    } else {
      data.serviceAreas = JSON.stringify(
        (b.serviceAreas as unknown[]).map((x) => String(x).trim().slice(0, 200)).filter(Boolean).slice(0, 50),
      );
    }
  }

  if (b.differentiators !== undefined) {
    if (!Array.isArray(b.differentiators)) {
      errors.push('differentiators must be an array');
    } else {
      data.differentiators = JSON.stringify(
        (b.differentiators as unknown[]).map((x) => String(x).trim().slice(0, 500)).filter(Boolean).slice(0, 50),
      );
    }
  }

  if (b.isDefault !== undefined) {
    data.isDefault = Boolean(b.isDefault);
  }

  return { errors, data };
}

// GET — list profiles for the authenticated user (with lazy default seed)
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request);

    let profiles = await db.businessProfile.findMany({
      where: { userId: user.id, archivedAt: null },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });

    // Lazy default seed — first visit with no profiles: synthesize one from
    // the user's existing onboarding/settings business data (never overwrites
    // anything; purely additive).
    if (profiles.length === 0) {
      const [settings, userRecord] = await Promise.all([
        db.userSettings.findUnique({ where: { userId: user.id } }),
        db.user.findUnique({ where: { id: user.id }, select: { name: true, company: true } }),
      ]);

      const companyName =
        settings?.companyName || userRecord?.company || userRecord?.name || 'My Business';
      const niches = safeParse<string[]>(settings?.targetNiches, []);
      const services = safeParse<Array<{ label?: string; description?: string }>>(settings?.servicesOffered, []);

      const seeded = await db.businessProfile.create({
        data: {
          userId: user.id,
          label: companyName,
          companyName,
          industry: niches[0] || null,
          description: settings?.businessDescription || null,
          productsServices: JSON.stringify(
            services.slice(0, 20).map((s) => ({ name: s.label || 'Service', description: s.description })),
          ),
          serviceAreas: JSON.stringify(safeParse<string[]>(settings?.targetCountries, [])),
          isDefault: true,
        },
      });
      profiles = [seeded];
    }

    return NextResponse.json({ profiles: profiles.map(serializeProfile) });
  } catch (error) {
    if (error instanceof Error && 'statusCode' in error) {
      return NextResponse.json({ error: error.message }, { status: (error as { statusCode: number }).statusCode });
    }
    console.error('Error listing business profiles:', error);
    return NextResponse.json({ error: 'Failed to load business profiles' }, { status: 500 });
  }
}

// POST — create a profile for the authenticated user
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    const body = await request.json().catch(() => ({}));
    const { errors, data } = validateProfileInput(body);

    if (errors.length > 0 || !('label' in data)) {
      return NextResponse.json(
        { error: errors[0] || 'label is required' },
        { status: 400 },
      );
    }

    const count = await db.businessProfile.count({ where: { userId: user.id, archivedAt: null } });

    // Plan Eligibility Correction: per-plan cap on ACTIVE profiles/niches
    // (Free 1 · Starter 1 · Pro 3 · Elite 7). Grandfathering: users already
    // over their plan's cap keep every existing profile — this gates only
    // NEW creations (no auto-archive, no deletion).
    const planTier = toPlanTier(user.plan);
    const profileLimit = BUSINESS_PROFILE_LIMITS[planTier];
    if (count >= profileLimit) {
      const requiredPlan = nextProfileLimitPlan(planTier);
      return NextResponse.json(
        {
          error: `Your ${PLAN_TIER_LABELS[planTier]} plan includes ${profileLimit} active business profile${profileLimit === 1 ? '' : 's'}. Archive one${requiredPlan ? ` or upgrade to ${PLAN_TIER_LABELS[requiredPlan]}` : ''} to add more.`,
          code: 'PROFILE_LIMIT_REACHED',
          limit: profileLimit,
          activeCount: count,
          requiredPlan: requiredPlan || undefined,
          upgradeUrl: '/api/subscriptions/upgrade-preview',
        },
        { status: 403 },
      );
    }

    const makeDefault = count === 0 || data.isDefault === true;

    const profile = await db.$transaction(async (tx) => {
      if (makeDefault) {
        // Only one default at a time (scoped to this user's profiles).
        await tx.businessProfile.updateMany({ where: { userId: user.id }, data: { isDefault: false } });
      }
      return tx.businessProfile.create({
        data: {
          userId: user.id,
          ...(data as { label: string }),
          isDefault: makeDefault,
        },
      });
    });

    return NextResponse.json({ profile: serializeProfile(profile) }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && 'statusCode' in error) {
      return NextResponse.json({ error: error.message }, { status: (error as { statusCode: number }).statusCode });
    }
    console.error('Error creating business profile:', error);
    return NextResponse.json({ error: 'Failed to create business profile' }, { status: 500 });
  }
}
