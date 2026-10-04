// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — POST /api/leads/discover
// Phase 7: Create discovery job, return job ID immediately
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import {
  startDiscoveryJob,
  type DiscoverySource,
  type DiscoveryJobContext,
} from '@/lib/lead-discovery-service';
import { getEntitlements, type PlanType } from '@/lib/entitlement-service';
import { getFeatureUsage } from '@/lib/entitlement-middleware';
import { db } from '@/lib/db';
import {
  extractHardCriteria,
  hasEnforceableCriteria,
  mergeHardCriteria,
  normalizeCriteriaInput,
  EMPTY_CRITERIA,
} from '@/lib/discovery/hard-criteria';

const VALID_SOURCES: DiscoverySource[] = [
  'all',
  'ai_search', 'google_maps', 'google_business', 'justdial', 'indiamart',
  'yelp', 'yellow_pages', 'sulekha', 'linkedin', 'instagram', 'facebook',
];

export async function POST(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const body = await request.json();

      const { niche, country, city, source, maxResults, requirements } = body;

      // Validate required fields
      if (!niche || typeof niche !== 'string' || niche.trim().length === 0) {
        return NextResponse.json({ error: 'niche is required' }, { status: 400 });
      }

      // Country is OPTIONAL (worldwide search, spec §5) — but when present
      // it must be a non-empty string.
      if (country !== undefined && country !== null && (typeof country !== 'string' || !country.trim())) {
        return NextResponse.json({ error: 'country must be a non-empty string when provided' }, { status: 400 });
      }

      if (!source || !VALID_SOURCES.includes(source)) {
        return NextResponse.json(
          { error: `source must be one of: ${VALID_SOURCES.join(', ')}` },
          { status: 400 }
        );
      }

      // Sanitize inputs
      const sanitizedNiche = niche.trim().substring(0, 200);
      const sanitizedCountry = country && typeof country === 'string' ? country.trim().substring(0, 100) : undefined;
      const sanitizedCity = city ? String(city).trim().substring(0, 100) : undefined;
      // Upper bound 500 — the effective ceiling stays RESULTS_PER_JOB (200
      // unless env-overridden) inside the service; the route bound only
      // rejects absurd inputs (spec §3.1: no tiny hardcoded caps).
      const sanitizedMaxResults = maxResults ? Math.min(Math.max(parseInt(String(maxResults), 10) || 10, 1), 500) : undefined;
      const sanitizedRequirements = requirements ? String(requirements).trim().substring(0, 1000) : undefined;

      // ── CONTEXT / CAMPAIGN SELECTOR (additive, optional) ─────────
      // body.context: { mode: 'none'|'campaign'|'business', campaignId? }
      // 'campaign' → the campaign's customInstructions merge into the
      //   discovery requirements; campaign niche/country/city FILL EMPTY
      //   fields only (user-entered values always win). Ownership is
      //   verified server-side — cross-user campaign ids are rejected.
      // 'business' → the user's own business context (Settings → My
      //   Context + My Offer) becomes discovery instructions.
      // 'none'/absent → unchanged behaviour.
      let context: DiscoveryJobContext | null = null;
      let contextInstructions: string | undefined;
      const rawContext = body?.context;
      if (rawContext && typeof rawContext === 'object' && !Array.isArray(rawContext)) {
        const mode = rawContext.mode;
        if (mode === 'campaign') {
          const campaignId = typeof rawContext.campaignId === 'string' ? rawContext.campaignId.trim() : '';
          if (!campaignId) {
            return NextResponse.json(
              { error: 'context.campaignId is required when context.mode is "campaign"' },
              { status: 400 }
            );
          }
          const campaign = await db.acquisitionCampaign.findFirst({
            where: { id: campaignId, userId: user.id },
            select: { id: true, niche: true, country: true, city: true, customInstructions: true },
          });
          if (!campaign) {
            return NextResponse.json(
              { error: 'Selected campaign not found for this account' },
              { status: 400 }
            );
          }
          contextInstructions = campaign.customInstructions
            ? String(campaign.customInstructions).trim().substring(0, 500)
            : undefined;
          context = {
            mode: 'campaign',
            campaignId: campaign.id,
            campaignNiche: campaign.niche ? String(campaign.niche).substring(0, 200) : undefined,
            instructions: contextInstructions,
          };
          // Campaign targeting FILLS EMPTY discovery fields only — explicit
          // user input on the Discover form always takes precedence.
          if (!sanitizedNiche && campaign.niche) context.campaignNiche = String(campaign.niche).substring(0, 200);
        } else if (mode === 'business') {
          const settings = await db.userSettings.findUnique({
            where: { userId: user.id },
            select: { businessDescription: true, servicesOffered: true, personalContext: true },
          });
          const parts: string[] = [];
          if (settings?.businessDescription?.trim()) {
            parts.push(`User business: ${settings.businessDescription.trim().substring(0, 300)}`);
          }
          if (settings?.personalContext?.trim()) {
            try {
              const pc = JSON.parse(settings.personalContext) as Record<string, unknown>;
              const pcBits = [pc.targetAudience, pc.whatYouDo, pc.goals, pc.positioning]
                .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
                .map((v) => v.trim().substring(0, 150));
              if (pcBits.length > 0) parts.push(`User context: ${pcBits.join('; ')}`);
            } catch {
              // Malformed personal context must never block discovery.
            }
          }
          contextInstructions = parts.length > 0 ? parts.join(' | ').substring(0, 500) : undefined;
          context = { mode: 'business', instructions: contextInstructions };
        } else if (mode === 'profile') {
          const profileId = typeof rawContext.profileId === 'string' ? rawContext.profileId.trim() : '';
          if (!profileId) {
            return NextResponse.json(
              { error: 'context.profileId is required when context.mode is "profile"' },
              { status: 400 }
            );
          }
          const profile = await db.businessProfile.findFirst({
            where: { id: profileId, userId: user.id },
            select: {
              id: true, name: true, status: true, industry: true, description: true,
              productsServices: true, offers: true, valueProposition: true,
              targetAudience: true, targetIndustries: true, geographicMarket: true,
              painPoints: true, customInstructions: true,
            },
          });
          if (!profile) {
            return NextResponse.json(
              { error: 'Selected business profile not found for this account' },
              { status: 400 }
            );
          }
          if (profile.status !== 'active') {
            return NextResponse.json(
              { error: 'Selected business profile is archived — activate it or choose another' },
              { status: 400 }
            );
          }
          const bits: string[] = [];
          if (profile.description?.trim()) bits.push(`Business: ${profile.description.trim().substring(0, 200)}`);
          if (profile.industry?.trim()) bits.push(`Industry: ${profile.industry.trim().substring(0, 100)}`);
          if (profile.productsServices?.trim()) bits.push(`Offering: ${profile.productsServices.trim().substring(0, 200)}`);
          if (profile.offers?.trim()) bits.push(`Offers: ${profile.offers.trim().substring(0, 150)}`);
          if (profile.valueProposition?.trim()) bits.push(`Value prop: ${profile.valueProposition.trim().substring(0, 150)}`);
          if (profile.targetAudience?.trim()) bits.push(`Targets: ${profile.targetAudience.trim().substring(0, 150)}`);
          if (profile.geographicMarket?.trim()) bits.push(`Market: ${profile.geographicMarket.trim().substring(0, 100)}`);
          if (profile.painPoints?.trim()) bits.push(`Pain points addressed: ${profile.painPoints.trim().substring(0, 150)}`);
          if (profile.customInstructions?.trim()) bits.push(`Instructions: ${profile.customInstructions.trim().substring(0, 200)}`);
          contextInstructions = bits.length > 0 ? bits.join(' | ').substring(0, 500) : undefined;
          context = { mode: 'profile', profileId: profile.id, instructions: contextInstructions };
        } else if (mode !== 'none' && mode !== undefined && mode !== null) {
          return NextResponse.json(
            { error: 'context.mode must be one of: none, campaign, business, profile' },
            { status: 400 }
          );
        }
      }

      // Merge context instructions into the requirements text so the whole
      // existing discovery pipeline (queries + hard-criteria extraction)
      // consumes them without any change to its internals.
      const effectiveRequirements = contextInstructions
        ? [sanitizedRequirements, contextInstructions].filter(Boolean).join(' | ').substring(0, 1500)
        : sanitizedRequirements;

      // ── HARD CRITERIA (defense in depth) ─────────────────────────
      // 1. Structured criteria from the client (AI parser output).
      // 2. INDEPENDENT server-side re-extraction from the requirements
      //    text — so even a client that omits criteria (old client,
      //    direct API call) cannot bypass an explicit "20 to 200
      //    employees" constraint. Numeric bounds intersect strictly.
      const clientCriteria = normalizeCriteriaInput(body.criteria);
      // Extracted from the EFFECTIVE (context-merged) text so constraints
      // inside campaign/business context instructions are enforced too.
      const textCriteria = extractHardCriteria(effectiveRequirements || '');
      const mergedCriteria = mergeHardCriteria(clientCriteria, textCriteria);
      const effectiveCriteria = hasEnforceableCriteria(mergedCriteria) ? mergedCriteria : null;

      // ── PLAN ENTITLEMENT (server-side, spec §11.2/§12) ────────────
      // lead_discovery limits (free 10 / starter 25) were previously only
      // enforced on manual lead creation — discovery bypassed them. The
      // remaining allowance CAPS this job's result target; an exhausted
      // allowance blocks the job with an actionable upgrade message.
      // Pro/Elite are unlimited (limit: null) and unchanged.
      let effectiveMaxResults = sanitizedMaxResults;
      const planType = ((user as { plan?: string }).plan || 'free') as PlanType;
      const discoveryEntitlement = getEntitlements(planType).lead_discovery;
      if (discoveryEntitlement.enabled && discoveryEntitlement.limit !== null) {
        const currentUsage = await getFeatureUsage(user.id, 'lead_discovery');
        const remaining = discoveryEntitlement.limit - currentUsage;
        if (remaining <= 0) {
          return NextResponse.json(
            {
              error: `Your ${planType} plan includes ${discoveryEntitlement.limit} discovered leads and your account already has ${currentUsage}. Upgrade your plan to discover more.`,
              code: 'LEAD_DISCOVERY_LIMIT_REACHED',
              feature: 'lead_discovery',
              limit: discoveryEntitlement.limit,
              used: currentUsage,
              plan: planType,
            },
            { status: 429 }
          );
        }
        if (effectiveMaxResults === undefined || effectiveMaxResults > remaining) {
          effectiveMaxResults = remaining;
        }
      }

      // Start discovery job
      const result = await startDiscoveryJob(user.id, {
        niche: sanitizedNiche,
        country: sanitizedCountry || undefined,
        city: sanitizedCity,
        source,
        maxResults: effectiveMaxResults,
        requirements: effectiveRequirements,
        criteria: effectiveCriteria ?? EMPTY_CRITERIA,
        context,
      }, user.orgId ?? undefined);

      if (result.status === 'failed') {
        return NextResponse.json({ error: result.message }, { status: 400 });
      }

      return NextResponse.json({
        jobId: result.jobId,
        status: result.status,
        message: result.message,
      }, { status: 202 }); // 202 Accepted — job started
    } catch (error) {
      console.error('[API /leads/discover] Error:', error);
      return NextResponse.json({ error: 'Failed to start discovery job' }, { status: 500 });
    }
  });
}
