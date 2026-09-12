// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Lead Discovery API Route
// POST /api/lead-discovery — Run the discovery engine
// GET  /api/lead-discovery — Check discovery engine status
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { runDiscovery, DiscoveryConfig } from '@/lib/lead-discovery/discovery-engine';
import { withAuth } from '@/lib/auth-middleware';

/**
 * POST /api/lead-discovery
 * Run the lead discovery engine.
 *
 * Body: {
 *   niche: string,       // e.g. "restaurants"
 *   location: string,    // e.g. "London UK"
 *   maxLeads: number,    // e.g. 20
 *   targetGap: string    // e.g. "no website"
 * }
 */
export async function POST(request: NextRequest) {
  return withAuth(request, async (user) => {
  try {
    const userId = user.id;

    const body = await request.json();

    // Validate required fields
    const { niche, location, maxLeads, targetGap } = body as Partial<DiscoveryConfig>;

    if (!niche || typeof niche !== 'string' || niche.trim().length === 0) {
      return NextResponse.json(
        { error: 'Missing required field: niche (string)' },
        { status: 400 }
      );
    }

    if (!location || typeof location !== 'string' || location.trim().length === 0) {
      return NextResponse.json(
        { error: 'Missing required field: location (string)' },
        { status: 400 }
      );
    }

    if (!maxLeads || typeof maxLeads !== 'number' || maxLeads < 1) {
      return NextResponse.json(
        { error: 'Missing required field: maxLeads (number, min 1)' },
        { status: 400 }
      );
    }

    if (!targetGap || typeof targetGap !== 'string' || targetGap.trim().length === 0) {
      return NextResponse.json(
        { error: 'Missing required field: targetGap (string)' },
        { status: 400 }
      );
    }

    // Cap maxLeads at 100 to prevent abuse
    const cappedMaxLeads = Math.min(maxLeads, 100);

    const config: DiscoveryConfig = {
      niche: niche.trim(),
      location: location.trim(),
      maxLeads: cappedMaxLeads,
      targetGap: targetGap.trim(),
    };

    console.log(`[DiscoveryAPI] POST /api/lead-discovery — userId=${userId} config=`, config);

    const result = await runDiscovery(userId, config);

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error('[DiscoveryAPI] POST error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
  });
}

/**
 * GET /api/lead-discovery
 * Check discovery engine status and configuration.
 */
export async function GET() {
  const googleSearchKey = !!process.env.GOOGLE_SEARCH_API_KEY;
  const googleEngineId = !!process.env.GOOGLE_SEARCH_ENGINE_ID;
  const serpApiKey = !!process.env.SERPAPI_KEY;

  const hasGoogle = googleSearchKey && googleEngineId;
  const hasSerpApi = serpApiKey;

  let searchProvider = 'none';
  if (hasGoogle) {
    searchProvider = 'google_custom_search';
  } else if (hasSerpApi) {
    searchProvider = 'serpapi';
  }

  return NextResponse.json({
    status: 'available',
    searchProvider,
    configuration: {
      googleCustomSearch: {
        apiKeyConfigured: googleSearchKey,
        engineIdConfigured: googleEngineId,
        ready: hasGoogle,
      },
      serpApi: {
        apiKeyConfigured: serpApiKey,
        ready: hasSerpApi,
      },
    },
    message: !hasGoogle && !hasSerpApi
      ? 'No search API configured. Set GOOGLE_SEARCH_API_KEY + GOOGLE_SEARCH_ENGINE_ID or SERPAPI_KEY in .env'
      : `Search provider: ${searchProvider}`,
  });
}
