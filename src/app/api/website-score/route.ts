// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Website Score API Route
// POST /api/website-score — Analyze a website's quality
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { withRateLimit } from '@/lib/security/rate-limiter';
import { analyzeWebsite } from '@/lib/lead-discovery/website-scorer';

/**
 * POST /api/website-score
 * Analyze a website and return a comprehensive quality score.
 *
 * Body: {
 *   url: string,         // e.g. "https://example.com"
 *   companyName: string, // e.g. "Acme Corp"
 *   niche: string        // e.g. "restaurants"
 * }
 */
export async function POST(request: NextRequest) {
  // SECURITY HARDENING: this endpoint triggers web fetching + AI scoring.
  // It was fully unauthenticated — an anonymous compute-cost sink.
  const rateLimitResult = withRateLimit(request, 'ai');
  if (rateLimitResult) return rateLimitResult;

  return withAuth(request, async (user) => {
    try {
    const body = await request.json();

    const { url, companyName, niche } = body as {
      url?: string;
      companyName?: string;
      niche?: string;
    };

    if (!url || typeof url !== 'string' || url.trim().length === 0) {
      return NextResponse.json(
        { error: 'Missing required field: url (string)' },
        { status: 400 }
      );
    }

    if (!companyName || typeof companyName !== 'string' || companyName.trim().length === 0) {
      return NextResponse.json(
        { error: 'Missing required field: companyName (string)' },
        { status: 400 }
      );
    }

    if (!niche || typeof niche !== 'string' || niche.trim().length === 0) {
      return NextResponse.json(
        { error: 'Missing required field: niche (string)' },
        { status: 400 }
      );
    }

    console.log(`[WebsiteScoreAPI] POST /api/website-score — url=${url} companyName=${companyName} niche=${niche}`);

    const result = await analyzeWebsite(url.trim(), companyName.trim(), niche.trim());

        return NextResponse.json(result, { status: 200 });
      } catch (error) {
        console.error('[WebsiteScoreAPI] POST error:', error);
        return NextResponse.json({ error: 'Website analysis failed' }, { status: 500 });
      }
  });
}
