// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — POST /api/leads/discover
// Phase 7: Create discovery job, return job ID immediately
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { startDiscoveryJob, type DiscoverySource } from '@/lib/lead-discovery-service';

const VALID_SOURCES: DiscoverySource[] = [
  'ai_search', 'google_maps', 'google_business', 'justdial', 'indiamart',
  'yelp', 'yellow_pages', 'sulekha', 'linkedin', 'instagram', 'facebook',
];

export async function POST(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const body = await request.json();

      const { niche, country, city, source, maxResults } = body;

      // Validate required fields
      if (!niche || typeof niche !== 'string' || niche.trim().length === 0) {
        return NextResponse.json({ error: 'niche is required' }, { status: 400 });
      }

      if (!country || typeof country !== 'string' || country.trim().length === 0) {
        return NextResponse.json({ error: 'country is required' }, { status: 400 });
      }

      if (!source || !VALID_SOURCES.includes(source)) {
        return NextResponse.json(
          { error: `source must be one of: ${VALID_SOURCES.join(', ')}` },
          { status: 400 }
        );
      }

      // Sanitize inputs
      const sanitizedNiche = niche.trim().substring(0, 200);
      const sanitizedCountry = country.trim().substring(0, 100);
      const sanitizedCity = city ? String(city).trim().substring(0, 100) : undefined;
      const sanitizedMaxResults = maxResults ? Math.min(Math.max(parseInt(String(maxResults), 10) || 10, 1), 50) : undefined;

      // Start discovery job
      const result = await startDiscoveryJob(user.id, {
        niche: sanitizedNiche,
        country: sanitizedCountry,
        city: sanitizedCity,
        source,
        maxResults: sanitizedMaxResults,
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
