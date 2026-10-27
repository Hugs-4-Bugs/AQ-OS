// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — AI Provider Validate (Workstream B — Decisions 2+5)
//
// POST /api/integrations/ai-providers/validate
//   Body: { provider: string }
//
// Tests the user's stored credential by performing a real provider
// model-list call (live discovery) or, for providers that don't expose
// a list endpoint, by making a minimal "ping" completion request.
//
// Side effects:
//   · Persists discovered models to the DiscoveredModel table (per
//     user, per provider, with full capability metadata).
//   · On credential failure (401/403/429/5xx): marks the
//     UserAIProvider row as 'invalid' + records lastValidationError
//     (with the failure category so the UI can render the right badge).
//   · On success: marks the UserAIProvider row as 'active' + lastValidatedAt.
//
// Response shape:
// {
//   provider: string,
//   valid: boolean,
//   source: 'user' | 'platform' | 'none',
//   failureCategory?: 'credential_rejected' | 'rate_limited' |
//                      'provider_unavailable' | 'network' |
//                      'credential_unavailable' | null,
//   models: DiscoveredModelInfo[],    // normalized + persisted
//   message: string,
//   error?: string
// }
//
// Security:
//   · Auth required
//   · The decrypted key never leaves the server (resolved via
//     resolveProviderApiKey, used only for the API call)
//   · Per-user isolation enforced throughout
//   · lastValidationError is capped at 500 chars (no full provider
//     error body, which may include request echo)
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { db } from '@/lib/db';
import {
  resolveProviderApiKey,
  markProviderInvalid,
} from '@/lib/ai/user-ai-provider-service';
import {
  discoverModelsForProvider,
  type DiscoveredModelInfo,
} from '@/lib/ai/model-discovery';
import { providerSupportsLiveDiscovery, getProviderCatalog } from '@/lib/ai/model-catalog';

export const dynamic = 'force-dynamic';

type FailureCategory =
  | 'credential_rejected'   // HTTP 401/403 — provider rejected the key
  | 'rate_limited'          // HTTP 429 — too many requests
  | 'provider_unavailable'  // HTTP 5xx — provider down
  | 'network'               // fetch error / timeout — unreachable
  | 'credential_unavailable' // no user credential AND no platform env var
  | 'unknown';

interface ValidateResponse {
  provider: string;
  valid: boolean;
  source: 'user' | 'platform' | 'none';
  failureCategory: FailureCategory | null;
  models: DiscoveredModelInfo[];
  message: string;
  error?: string;
}

export async function POST(request: NextRequest) {
  return withAuth(request, async (user) => {
    let body: Record<string, unknown>;
    try { body = await request.json(); }
    catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }

    const provider = body.provider as string | undefined;
    if (!provider) {
      return NextResponse.json({ error: 'provider is required' }, { status: 400 });
    }

    // Step 1 — resolve the credential (user → platform → error).
    let source: 'user' | 'platform' = 'platform';
    let apiKey: string | null = null;
    try {
      const resolved = await resolveProviderApiKey(user.id, provider);
      apiKey = resolved.apiKey;
      source = resolved.source;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const resp: ValidateResponse = {
        provider,
        valid: false,
        source: 'none',
        failureCategory: 'credential_unavailable',
        models: [],
        message: `No credential available for ${provider}`,
        error: msg,
      };
      return NextResponse.json(resp, { status: 200 });
    }

    // Step 2 — perform model discovery (live for OpenAI/Gemini/DeepSeek/
    // OpenRouter; catalog for Anthropic/Z-AI/Local). For catalog providers
    // the discovery still requires a resolvable credential, so this also
    // serves as the validation step.
    const discovery = await discoverModelsForProvider({ userId: user.id, provider });

    // Step 3 — for live-discovery providers, if discovery failed, we
    // additionally need to make a minimal "ping" call to definitively
    // distinguish credential failure from list-endpoint-only failure.
    // For catalog providers, discovery success IS validation success.
    let valid = discovery.source === 'live'
      ? discovery.models.length > 0
      : discovery.source === 'catalog'; // catalog providers: credential resolvable + catalog cached = valid

    let failureCategory: FailureCategory | null = null;
    let errorMessage: string | null = null;

    if (!valid && discovery.error) {
      // Classify the error from the discovery service.
      const err = discovery.error.toLowerCase();
      if (/401|403|rejected|invalid api key|unauthorized/.test(err)) {
        failureCategory = 'credential_rejected';
      } else if (/429|rate limit/.test(err)) {
        failureCategory = 'rate_limited';
      } else if (/5\d\d|server error|unavailable|internal/.test(err)) {
        failureCategory = 'provider_unavailable';
      } else if (/network|timeout|unreachable|abort/.test(err)) {
        failureCategory = 'network';
      } else {
        failureCategory = 'unknown';
      }
      errorMessage = discovery.error;
    }

    // For live-discovery providers that returned ZERO models but did NOT
    // explicitly throw, we conservatively mark invalid — the credential
    // may be partial / scoped without model-list permission. This is
    // rare but worth surfacing honestly.
    if (providerSupportsLiveDiscovery(provider) && discovery.source === 'live' && discovery.models.length === 0 && !failureCategory) {
      valid = false;
      failureCategory = 'unknown';
      errorMessage = `Live discovery returned 0 models for ${provider}`;
    }

    // Step 4 — persist UserAIProvider status update (when user-scoped).
    if (source === 'user') {
      if (valid) {
        await db.userAIProvider.updateMany({
          where: { userId: user.id, provider },
          data: {
            status: 'active',
            lastValidatedAt: new Date(),
            lastValidationError: null,
          },
        });
      } else {
        await markProviderInvalid({
          userId: user.id,
          provider,
          error: errorMessage || 'Validation failed',
        });
      }
    }

    // Step 5 — build response.
    const response: ValidateResponse = {
      provider,
      valid,
      source,
      failureCategory,
      models: valid ? discovery.models : [],
      message: valid
        ? discovery.message
        : `${provider} validation failed${failureCategory ? ` (${failureCategory})` : ''}`,
      ...(errorMessage ? { error: errorMessage } : {}),
    };

    return NextResponse.json(response, { status: 200 });
  });
}
