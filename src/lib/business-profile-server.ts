// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Business Profile SERVER context resolution
// (split from business-profile.ts so client bundles never pull in the DB)
//
// resolveBusinessContext — THE single server-side resolver used by
// discovery, website research and outreach. Resolution order:
//   a) the selected business profile (ownership-checked) is the default
//      source of business context;
//   b) explicit campaign overrides win wherever provided;
//   c) profile defaults are retained for everything not overridden;
//   d) nothing is ever substituted from another user, another business,
//      or hardcoded generic assumptions.
// SERVER-ONLY: imports Prisma. Never import from client components.
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
// Re-export the pure prompt-block builder so server consumers have one import.
export { buildBusinessContextBlock } from '@/lib/business-profile';
import type { CampaignOverrides, ResolvedBusinessContext } from '@/lib/business-profile';

function pick(
  override: string | undefined,
  profileValue: string | null | undefined,
  key: string,
  sources: Record<string, 'profile' | 'campaign' | 'none'>,
): string {
  const o = typeof override === 'string' ? override.trim() : '';
  if (o) {
    sources[key] = 'campaign';
    return o;
  }
  const p = (profileValue ?? '').trim();
  sources[key] = p ? 'profile' : 'none';
  return p;
}

/**
 * Resolve the effective business context for a campaign.
 * Ownership-safe: `businessProfileId` is only ever honored when the profile
 * belongs to `userId`; otherwise the user's default profile is used.
 * Never returns another user's data; never invents values.
 */
export async function resolveBusinessContext(
  userId: string,
  businessProfileId: string | null | undefined,
  overrides: CampaignOverrides | null | undefined,
  /** EXPLICIT None (spec §8): when true, resolve to NO context at all —
   * the caller's persisted job recorded that the user chose "None", so
   * the default-profile fallback must NOT apply. */
  opts?: { skip?: boolean }
): Promise<ResolvedBusinessContext | null> {
  if (opts?.skip) return null;
  // Import lazily to avoid pulling Prisma into client bundles that only use
  // the fetch helpers above.
  const { db } = await import('@/lib/db');

  const where = businessProfileId
    ? { id: businessProfileId, userId, archivedAt: null } // ownership check
    : { userId, archivedAt: null, isDefault: true };

  let profile = await db.businessProfile.findFirst({ where });

  if (!profile && businessProfileId) {
    // Requested profile missing/not owned → fall back to the user's default
    // (never to another user's data, never to fabricated context).
    profile = await db.businessProfile.findFirst({
      where: { userId, archivedAt: null, isDefault: true },
    });
  }
  if (!profile) {
    profile = await db.businessProfile.findFirst({
      where: { userId, archivedAt: null },
      orderBy: { createdAt: 'asc' },
    });
  }

  const sources: Record<string, 'profile' | 'campaign' | 'none'> = {};
  const ov = overrides ?? {};

  // Stringified-JSON columns → parsed values (0 = safe fallbacks).
  const parse = <T,>(raw: string | null | undefined, fallback: T): T => {
    if (!raw) return fallback;
    try {
      const v = JSON.parse(raw);
      return (v ?? fallback) as T;
    } catch {
      return fallback;
    }
  };

  const products = parse<Array<{ name: string; description?: string }>>(profile?.productsServices, []);
  const audience = parse<{ industries?: string[]; roles?: string[]; icp?: string }>(profile?.targetAudience, {});
  const areas = parse<string[]>(profile?.serviceAreas, []);
  const differentiators = parse<string[]>(profile?.differentiators, []);

  const audienceLine = [
    audience.industries?.length ? `industries: ${audience.industries.join(', ')}` : '',
    audience.roles?.length ? `roles: ${audience.roles.join(', ')}` : '',
    audience.icp ? `ideal customer: ${audience.icp}` : '',
  ].filter(Boolean).join(' | ');

  const context: ResolvedBusinessContext = {
    profileId: profile?.id ?? null,
    label: profile?.label ?? '',
    companyName: profile?.companyName ?? '',
    industry: profile?.industry ?? '',
    website: profile?.website ?? '',
    description: profile?.description ?? '',
    valueProposition: profile?.valueProposition ?? '',
    productsServices: products,
    targetAudience: audienceLine,
    serviceAreas: areas.join(', '),
    goals: profile?.goals ?? '',
    tone: pick(ov.tone, profile?.toneStyle, 'tone', sources),
    language: pick(ov.language, profile?.language, 'language', sources),
    differentiators,
    preferredCta: pick(ov.cta, profile?.preferredCta, 'preferredCta', sources),
    additionalContext: [
      profile?.additionalContext?.trim() || '',
      ov.instructions?.trim() || '',
    ].filter(Boolean).join('\n'),
    overriddenFields: [],
    sources,
  };
  context.sources.companyName = context.companyName ? 'profile' : 'none';
  context.sources.description = context.description ? 'profile' : 'none';
  context.sources.industry = context.industry ? 'profile' : 'none';
  context.sources.productsServices = products.length > 0 ? 'profile' : 'none';

  // Campaign-specific free-text fields (no profile-default equivalent except
  // where noted — objective falls back to goals, audience to targetAudience,
  // offer to products/services).
  if (ov.objective?.trim()) {
    context.goals = ov.objective.trim();
    context.sources.goals = 'campaign';
    context.overriddenFields.push('objective');
  } else if (context.goals) {
    context.sources.goals = 'profile';
  }

  if (ov.audience?.trim()) {
    context.targetAudience = ov.audience.trim();
    context.sources.targetAudience = 'campaign';
    context.overriddenFields.push('audience');
  } else if (context.targetAudience) {
    context.sources.targetAudience = 'profile';
  }

  if (ov.offer?.trim()) {
    context.productsServices = [{ name: ov.offer.trim() }];
    context.sources.productsServices = 'campaign';
    context.overriddenFields.push('offer');
  } else if (products.length > 0) {
    context.sources.productsServices = 'profile';
  }

  if (ov.outcome?.trim()) {
    context.overriddenFields.push('outcome');
  }

  return context;
}
