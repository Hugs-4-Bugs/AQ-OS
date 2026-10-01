import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withDualAuthPermission } from '@/lib/auth-middleware';
import { checkPlanEntitlement, getFeatureUsage } from '@/lib/entitlement-middleware';
import { withMonitoring } from '@/lib/observability/middleware';
import { checkApiKeyLeadLimit, recordApiKeyUsage } from '@/lib/api-key-service';
import { aliasesFor } from '@/lib/countries';
import { STAGE_ORDER, type LeadStage } from '@/lib/types';

// GET /api/leads - List all leads with filtering, sorting, and pagination
export const GET = withMonitoring(async (request: NextRequest) => {
  return withDualAuthPermission(request, 'leads:read', async (user, apiKeyInfo) => {
    try {
      const { searchParams } = new URL(request.url);

      const stage = searchParams.get('stage');
      // stages=contacted,replied — comma-separated multi-stage filter. Used by
      // dashboard/insights metric cards whose metric is defined over several
      // stages (e.g. "Contacted" = contacted..negotiation in /api/leads/stats).
      // Backward compatible: when absent, the single `stage` param applies.
      const stagesParam = searchParams.get('stages');
      // minReplyScore=71 — lower-bound reply-score filter ("Hot Leads" in
      // /api/leads/stats is replyScore > 70). Additive, backward compatible.
      const minReplyScoreParam = searchParams.get('minReplyScore');
      const niche = searchParams.get('niche');
      const country = searchParams.get('country');
      const search = searchParams.get('search');
      // Qualification filters (spec §9) — applied to actual stored rows
      const source = searchParams.get('source');
      const city = searchParams.get('city');
      const hasEmail = searchParams.get('hasEmail');
      const hasPhone = searchParams.get('hasPhone');
      const hasWebsite = searchParams.get('hasWebsite');
      const verificationStatus = searchParams.get('verificationStatus');
      const websiteStatus = searchParams.get('websiteStatus');
      const sortBy = searchParams.get('sortBy') || 'createdAt';
      const sortOrder = searchParams.get('sortOrder') || 'desc';
      const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
      const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20')));
      const skip = (page - 1) * limit;

      const where: Record<string, unknown> = {};
      if (apiKeyInfo?.orgId) {
        // Org-scoped API key → all leads in the organization
        where.orgId = apiKeyInfo.orgId;
      } else {
        // Session auth or personal API key → ONLY the user's own leads.
        // Multi-tenant isolation: a user must never see another
        // account's leads (execution paths like the AI pipeline are
        // owner-scoped, so the list must match or leads appear
        // "visible but not found").
        where.userId = user.id;
      }
      if (stage) where.stage = stage;
      if (!stage && stagesParam) {
        // Multi-stage filter — only valid values, unknown tokens ignored so a
        // malformed request cannot silently return everything. "interested"
        // is a legacy stage value (String column, present in the stats
        // endpoint's stage sets) and is accepted for metric parity.
        const allowedStages: string[] = [...STAGE_ORDER, 'interested'];
        const stageList = stagesParam
          .split(',')
          .map((s) => s.trim())
          .filter((s) => allowedStages.includes(s));
        if (stageList.length > 0) where.stage = { in: stageList };
        else where.stage = { in: [] };
      }
      if (minReplyScoreParam) {
        const minReplyScore = Number(minReplyScoreParam);
        if (Number.isFinite(minReplyScore)) {
          where.replyScore = { ...(where.replyScore as object | undefined), gte: minReplyScore };
        }
      }
      if (niche) where.niche = { contains: niche };
      if (source) where.source = source;
      if (city) where.city = { contains: city };
      if (hasEmail === 'true') where.email = { not: null };
      if (hasPhone === 'true') where.phone = { not: null };
      if (hasWebsite === 'true') {
        where.hasWebsite = true;
        where.website = { not: null };
      }
      if (verificationStatus) where.verificationStatus = verificationStatus;
      if (websiteStatus) where.websiteStatus = websiteStatus;
      // Country filter with alias tolerance (spec §5): legacy saved leads may
      // store "USA"/"UAE"/"UK" while the worldwide selector sends canonical
      // ISO names. Match the canonical name AND every known alias — existing
      // saved lead locations are preserved, never rewritten.
      const andConds: Array<Record<string, unknown>> = [];
      if (country) {
        andConds.push({ OR: aliasesFor(country).map((v) => ({ country: { contains: v } })) });
      }
      if (search) {
        andConds.push({
          OR: [
            { businessName: { contains: search } },
            { ownerName: { contains: search } },
            { email: { contains: search } },
            { city: { contains: search } },
            { niche: { contains: search } },
          ],
        });
      }
      if (andConds.length > 0) where.AND = andConds;

      const validSortFields = ['createdAt', 'updatedAt', 'businessName', 'stage', 'replyScore', 'conversionScore', 'urgencyScore', 'revenuePotentialScore', 'rating'];
      const orderByField = validSortFields.includes(sortBy) ? sortBy : 'createdAt';
      const orderBy = { [orderByField]: sortOrder === 'asc' ? 'asc' : 'desc' };

      const [leads, total] = await Promise.all([
        db.lead.findMany({ where, orderBy, skip, take: limit }),
        db.lead.count({ where }),
      ]);

      return NextResponse.json({ leads, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
    } catch (error) {
      console.error('Error fetching leads:', error);
      return NextResponse.json({ error: 'Failed to fetch leads' }, { status: 500 });
    }
  });
}, '/api/leads');

// POST /api/leads - Create a new lead
export const POST = withMonitoring(async (request: NextRequest) => {
  return withDualAuthPermission(request, 'leads:write', async (user, apiKeyInfo) => {
    try {
      // Entitlement check: lead_discovery feature
      const currentUsage = await getFeatureUsage(user.id, 'lead_discovery');
      const entitlementCheck = await checkPlanEntitlement(user.id, user.plan, 'lead_discovery', currentUsage);
      if (!entitlementCheck.allowed) return entitlementCheck.response!;

      // Per-month lead limit enforcement for API key requests.
      // Free plan keys: 50 leads/month, Pro: 500/month, Elite: 2000/month.
      // Session-authenticated requests are not subject to this check.
      if (apiKeyInfo) {
        const leadLimit = await checkApiKeyLeadLimit(apiKeyInfo.id, user.plan);
        if (!leadLimit.allowed) {
          return NextResponse.json(
            {
              error: `Monthly lead creation limit reached for this API key (${leadLimit.used}/${leadLimit.limit} this month on the ${user.plan} plan). Upgrade your plan for a higher limit.`,
              code: 'LEAD_LIMIT_EXCEEDED',
              limit: leadLimit.limit,
              used: leadLimit.used,
              plan: user.plan,
              resetInDays: 30,
            },
            {
              status: 429,
              headers: {
                'X-RateLimit-Limit': String(leadLimit.limit),
                'X-RateLimit-Remaining': '0',
                'X-RateLimit-Reset': String(
                  Math.floor((Date.now() + 30 * 24 * 60 * 60 * 1000) / 1000)
                ),
              },
            }
          );
        }
      }

      const body = await request.json();
      if (!body.businessName || typeof body.businessName !== 'string' || !body.businessName.trim()) {
        return NextResponse.json({ error: 'businessName is required' }, { status: 400 });
      }

      const leadData: Record<string, unknown> = {
        businessName: body.businessName.trim(),
        ownerName: body.ownerName?.trim() || null,
        website: body.website?.trim() || null,
        email: body.email?.trim() || null,
        phone: body.phone?.trim() || null,
        whatsapp: body.whatsapp?.trim() || null,
        linkedin: body.linkedin?.trim() || null,
        instagram: body.instagram?.trim() || null,
        facebook: body.facebook?.trim() || null,
        googleMapsListing: body.googleMapsListing?.trim() || null,
        reviews: body.reviews || null,
        rating: body.rating ?? null,
        estimatedQuality: body.estimatedQuality || 'medium',
        estimatedRevenue: body.estimatedRevenue || 'medium',
        city: body.city?.trim() || null,
        country: body.country?.trim() || null,
        niche: body.niche?.trim() || null,
        stage: body.stage || 'discovered',
        hasWebsite: body.hasWebsite ?? !!body.website,
        websiteQuality: body.websiteQuality || 'none',
        digitalWeaknesses: body.digitalWeaknesses ? (typeof body.digitalWeaknesses === 'string' ? body.digitalWeaknesses : JSON.stringify(body.digitalWeaknesses)) : null,
        opportunityNotes: body.opportunityNotes ? (typeof body.opportunityNotes === 'string' ? body.opportunityNotes : JSON.stringify(body.opportunityNotes)) : null,
        bestContactPerson: body.bestContactPerson?.trim() || null,
        bestChannel: body.bestChannel?.trim() || null,
        bestTiming: body.bestTiming?.trim() || null,
        outreachStyle: body.outreachStyle?.trim() || null,
        source: body.source?.trim() || null,
        notes: body.notes?.trim() || null,
        tags: body.tags ? (typeof body.tags === 'string' ? body.tags : JSON.stringify(body.tags)) : undefined,
        replyScore: body.replyScore ?? 0,
        conversionScore: body.conversionScore ?? 0,
        urgencyScore: body.urgencyScore ?? 0,
        revenuePotentialScore: body.revenuePotentialScore ?? 0,
      };

      // ACCOUNT ISOLATION: every lead MUST have an owner. Session and
      // personal-API-key creates are owned by the authenticated user;
      // org-API-key creates are stamped with the key's org (org-shared)
      // AND the key owner as the owning user. Previously session creates
      // produced ownerless leads that no list could show and that the
      // fail-open org checks treated as accessible to everyone.
      if (apiKeyInfo?.orgId) {
        leadData.orgId = apiKeyInfo.orgId;
      }
      if (user?.id) {
        leadData.userId = user.id;
      }

      const lead = await db.lead.create({ data: leadData as never });

      // Record a dedicated ApiKeyUsage entry for the successful creation so
      // the per-month lead limit counter (status 201) can find it. Fire and
      // forget — must never block the response.
      if (apiKeyInfo) {
        recordApiKeyUsage({
          apiKeyId: apiKeyInfo.id,
          userId: apiKeyInfo.userId,
          endpoint: '/api/leads',
          method: 'POST',
          statusCode: 201,
        }).catch(() => {});
      }

      return NextResponse.json(lead, { status: 201 });
    } catch (error) {
      console.error('Error creating lead:', error);
      return NextResponse.json({ error: 'Failed to create lead' }, { status: 500 });
    }
  });
}, '/api/leads');
