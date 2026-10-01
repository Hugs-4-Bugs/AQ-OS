// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — POST /api/leads/discover
// Phase 7: Create discovery job, return job ID immediately
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { startDiscoveryJob, type DiscoverySource } from '@/lib/lead-discovery-service';
import { getEntitlements, type PlanType } from '@/lib/entitlement-service';
import { getFeatureUsage } from '@/lib/entitlement-middleware';
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

      // ── HARD CRITERIA (defense in depth) ─────────────────────────
      // 1. Structured criteria from the client (AI parser output).
      // 2. INDEPENDENT server-side re-extraction from the requirements
      //    text — so even a client that omits criteria (old client,
      //    direct API call) cannot bypass an explicit "20 to 200
      //    employees" constraint. Numeric bounds intersect strictly.
      const clientCriteria = normalizeCriteriaInput(body.criteria);
      const textCriteria = extractHardCriteria(sanitizedRequirements || '');
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
        requirements: sanitizedRequirements,
        criteria: effectiveCriteria ?? EMPTY_CRITERIA,
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
