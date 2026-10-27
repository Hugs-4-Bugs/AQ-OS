// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — GET /api/integrations/ai-providers/models
// Workstream B — Decision 5: Live Model Discovery (read API)
//
// Returns the cached discovered models for a provider. If `?refresh=1`
// is passed, performs a fresh live discovery (catalog fallback when
// the provider has no list endpoint) BEFORE returning.
//
// Query params:
//   provider (required) — openai | anthropic | gemini | deepseek |
//                        openrouter | z-ai | local
//   refresh (optional)  — "1" forces a fresh discovery round
//
// Response shape (200):
// {
//   provider: "openai",
//   source: "live" | "catalog" | "none",
//   exercisedCredential: boolean,  // true if a real API call was made
//   models: [ { modelId, displayName, source, contextLength,
//               supportsVision, supportsTools, supportsStructuredOutput,
//               supportsReasoning, inputModalities, outputModalities,
//               availability, lastVerifiedAt } ],
//   message: string,
//   error?: string                  // present when source === 'none'
// }
//
// Security:
//   · Auth required (withAuth)
//   · Per-user scoping — only the caller's own discovered models are
//     returned
//   · Never returns credentials or auth tokens
//   · rawMetadata is NOT surfaced (debug-only field, may contain
//     provider-internal info that should not leak to the browser)
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import {
  discoverModelsForProvider,
  getCachedDiscoveredModels,
} from '@/lib/ai/model-discovery';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    const url = new URL(request.url);
    const provider = url.searchParams.get('provider');
    const refresh = url.searchParams.get('refresh') === '1';

    if (!provider) {
      return NextResponse.json(
        { error: 'provider query param is required' },
        { status: 400 }
      );
    }

    // If refresh requested, perform a fresh discovery round.
    if (refresh) {
      const result = await discoverModelsForProvider({ userId: user.id, provider });
      return NextResponse.json({
        provider: result.provider,
        source: result.source,
        exercisedCredential: result.exercisedCredential,
        models: result.models,
        message: result.message,
        ...(result.error ? { error: result.error } : {}),
      });
    }

    // Default: return cached state (fast, no network).
    const cached = await getCachedDiscoveredModels(user.id, provider);
    if (cached.length === 0) {
      // No cached models. Surface an honest "not yet discovered" state
      // so the UI can prompt the user to validate / refresh.
      return NextResponse.json({
        provider,
        source: 'none',
        exercisedCredential: false,
        models: [],
        message: `No cached models for ${provider}. Validate the credential or pass ?refresh=1 to discover now.`,
        error: 'no_cached_models',
      });
    }

    return NextResponse.json({
      provider,
      source: cached[0].source, // 'live' or 'catalog' (uniform across rows for one provider)
      exercisedCredential: false, // we did not make an API call this request
      models: cached,
      message: `Cached ${cached.length} models for ${provider} (last verified ${cached[0].lastVerifiedAt.toISOString()})`,
    });
  });
}
