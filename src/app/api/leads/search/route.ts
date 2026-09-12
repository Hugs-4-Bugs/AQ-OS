// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — GET /api/leads/search
// Phase 7: Full-text search with backend filtering, pagination, sorting
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const { searchParams } = new URL(request.url);

      // Parse query parameters
      const q = searchParams.get('q') || '';
      const stage = searchParams.get('stage');
      const niche = searchParams.get('niche');
      const country = searchParams.get('country');
      const city = searchParams.get('city');
      const source = searchParams.get('source');
      const minRating = searchParams.get('minRating');
      const sortBy = searchParams.get('sortBy') || 'createdAt';
      const sortOrder = searchParams.get('sortOrder') || 'desc';
      const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
      const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)));
      const offset = (page - 1) * limit;

      // Build where clause
      const where: Record<string, unknown> = { isActive: true };

      // Scope to user or org
      if (user.orgId) {
        where.orgId = user.orgId;
      } else {
        where.userId = user.id;
      }

      // Apply filters
      if (stage) where.stage = stage;
      if (niche) where.niche = niche;
      if (country) where.country = country;
      if (city) where.city = city;
      if (source) where.source = source;
      if (minRating) where.rating = { gte: parseFloat(minRating) };

      // Text search (SQLite LIKE-based)
      if (q.trim()) {
        const searchTerm = `%${q.trim()}%`;
        where.OR = [
          { businessName: { contains: q.trim() } },
          { ownerName: { contains: q.trim() } },
          { email: { contains: q.trim() } },
          { phone: { contains: q.trim() } },
          { niche: { contains: q.trim() } },
          { city: { contains: q.trim() } },
          { country: { contains: q.trim() } },
        ];
      }

      // Validate sort field
      const validSortFields = ['createdAt', 'updatedAt', 'businessName', 'rating', 'replyScore', 'conversionScore', 'urgencyScore', 'revenuePotentialScore', 'stage'];
      const safeSortBy = validSortFields.includes(sortBy) ? sortBy : 'createdAt';
      const safeSortOrder = sortOrder === 'asc' ? 'asc' : 'desc';

      // Query
      const [leads, total] = await Promise.all([
        db.lead.findMany({
          where,
          orderBy: { [safeSortBy]: safeSortOrder },
          take: limit,
          skip: offset,
          select: {
            id: true,
            businessName: true,
            ownerName: true,
            email: true,
            phone: true,
            whatsapp: true,
            website: true,
            linkedin: true,
            instagram: true,
            facebook: true,
            city: true,
            country: true,
            niche: true,
            rating: true,
            reviews: true,
            stage: true,
            source: true,
            estimatedQuality: true,
            estimatedRevenue: true,
            replyScore: true,
            conversionScore: true,
            urgencyScore: true,
            revenuePotentialScore: true,
            hasWebsite: true,
            websiteQuality: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
        db.lead.count({ where }),
      ]);

      return NextResponse.json({
        leads,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      });
    } catch (error) {
      console.error('[API /leads/search] Error:', error);
      return NextResponse.json({ error: 'Search failed' }, { status: 500 });
    }
  });
}
