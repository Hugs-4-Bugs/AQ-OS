import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withDualAuthPermission } from '@/lib/auth-middleware';
import { checkPlanEntitlement, getFeatureUsage } from '@/lib/entitlement-middleware';
import { withMonitoring } from '@/lib/observability/middleware';
import { checkApiKeyLeadLimit, recordApiKeyUsage } from '@/lib/api-key-service';

// GET /api/leads - List all leads with filtering, sorting, and pagination
export const GET = withMonitoring(async (request: NextRequest) => {
  return withDualAuthPermission(request, 'leads:read', async (user, apiKeyInfo) => {
    try {
      const { searchParams } = new URL(request.url);

      const stage = searchParams.get('stage');
      const niche = searchParams.get('niche');
      const country = searchParams.get('country');
      const search = searchParams.get('search');
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
      if (niche) where.niche = { contains: niche };
      if (country) where.country = { contains: country };
      if (search) {
        where.OR = [
          { businessName: { contains: search } },
          { ownerName: { contains: search } },
          { email: { contains: search } },
          { city: { contains: search } },
          { niche: { contains: search } },
        ];
      }

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
        tags: body.tags ? (typeof body.tags === 'string' ? body.tags : JSON.stringify(body.tags)) : null,
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
