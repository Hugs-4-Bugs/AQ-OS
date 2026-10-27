// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — AI Provider Connections (Phase 26 v3 — Decisions 1+2)
//
// POST /api/integrations/ai-providers/connect
//   Body: { provider: 'openai'|'anthropic'|'gemini'|'deepseek'|'openrouter', apiKey: string, modelPreferences?: {...} }
//   Encrypts + stores the API key per user. NEVER returns the decrypted key.
//
// POST /api/integrations/ai-providers/disconnect
//   Body: { provider: string }
//   Deletes the user's stored credential for that provider.
//
// POST /api/integrations/ai-providers/validate
//   Body: { provider: string }
//   Tests the stored credential by making a minimal real API call to the
//   provider. Updates status to 'active' or 'invalid' based on the response.
//
// GET /api/integrations/ai-providers
//   (existing — extended in Phase B to include user-connected status)
//
// Security:
//   - Auth required (withAuth)
//   - apiKey is NEVER returned in any response (only the masked hint)
//   - apiKey is NEVER logged in plaintext
//   - One row per (userId, provider) — UNIQUE constraint enforces no duplicates
//   - Per-user isolation: user A cannot read/write user B's credentials
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import {
  connectUserAIProvider,
  disconnectUserAIProvider,
  listUserAIProviders,
} from '@/lib/ai/user-ai-provider-service';

export const dynamic = 'force-dynamic';

// ─── POST /api/integrations/ai-providers/connect ──────────────────────

export async function POST(request: NextRequest) {
  return withAuth(request, async (user) => {
    // Route dispatch by ?action= query param OR by body.action field.
    let body: Record<string, unknown>;
    try { body = await request.json(); }
    catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }

    const action = (body.action as string) || 'connect';
    const provider = body.provider as string | undefined;

    if (!provider || typeof provider !== 'string') {
      return NextResponse.json({ error: 'provider is required' }, { status: 400 });
    }

    if (action === 'connect') {
      const apiKey = body.apiKey as string | undefined;
      if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length < 8) {
        return NextResponse.json({ error: 'apiKey must be at least 8 characters' }, { status: 400 });
      }
      const modelPreferences = body.modelPreferences as
        | { defaultModel?: string; allowedModels?: string[] } | undefined;
      try {
        const row = await connectUserAIProvider({
          userId: user.id,
          provider,
          apiKey,
          modelPreferences,
        });
        return NextResponse.json({ connected: true, provider: row });
      } catch (err) {
        return NextResponse.json({
          error: err instanceof Error ? err.message : 'connect failed',
        }, { status: 400 });
      }
    }

    if (action === 'disconnect') {
      try {
        const result = await disconnectUserAIProvider({ userId: user.id, provider });
        return NextResponse.json(result);
      } catch (err) {
        return NextResponse.json({
          error: err instanceof Error ? err.message : 'disconnect failed',
        }, { status: 400 });
      }
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  });
}

// ─── GET /api/integrations/ai-providers (extended) ────────────────────
//
// Returns the static provider list (from the existing route) PLUS the
// user's connected providers with masked hints. NEVER returns decrypted keys.

export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      // Static provider metadata (reuses the existing route's logic).
      //
      // Workstream B §3 (OpenAI distinction): The "openai" provider is
      // the OpenAI Platform API (platform.openai.com API keys). It is
      // NOT the ChatGPT consumer product (chat.openai.com). The UI
      // surfaces this distinction explicitly via `consumerNote`.
      //
      // `kind`: 'api-key' (user supplies an API key) | 'platform-sdk'
      // (uses the platform-installed SDK gateway; no per-user key).
      //
      // `consumerNote`: human-readable string clarifying the
      // relationship (or non-relationship) to a consumer product.
      // Surfaced in the UI panel so the user understands exactly what
      // they are connecting.
      const PROVIDERS = [
        {
          id: 'z-ai',
          label: 'Z-AI / GLM (platform default)',
          kind: 'platform-sdk' as const,
          envVar: 'ZAI_API_KEY',
          modelEnvVar: 'ZAI_MODEL',
          defaultModel: 'glm-4.6',
          docUrl: 'https://docs.z.ai',
          supportsStreaming: true,
          supportsTools: true,
          consumerNote: 'Z-AI is the platform-installed SDK gateway. No per-user API key required; the platform provides the credential.',
        },
        {
          id: 'openai',
          label: 'OpenAI API',
          kind: 'api-key' as const,
          envVar: 'OPENAI_API_KEY',
          modelEnvVar: 'OPENAI_MODEL',
          defaultModel: 'gpt-4o',
          docUrl: 'https://platform.openai.com/api-keys',
          supportsStreaming: true,
          supportsTools: true,
          consumerNote: 'This is the OpenAI Platform API (platform.openai.com) — NOT the ChatGPT consumer product. Use an API key from platform.openai.com, not your ChatGPT login. ChatGPT Plus/Pro subscriptions do NOT grant API access.',
        },
        {
          id: 'anthropic',
          label: 'Anthropic Claude API',
          kind: 'api-key' as const,
          envVar: 'ANTHROPIC_API_KEY',
          modelEnvVar: 'ANTHROPIC_MODEL',
          defaultModel: 'claude-sonnet-4-20250514',
          docUrl: 'https://console.anthropic.com/settings/keys',
          supportsStreaming: true,
          supportsTools: true,
          consumerNote: 'This is the Anthropic Console API (console.anthropic.com) — NOT the Claude.ai consumer product. Use an API key from console.anthropic.com. Claude Pro subscriptions do NOT grant API access.',
        },
        {
          id: 'gemini',
          label: 'Google Gemini API',
          kind: 'api-key' as const,
          envVar: 'GEMINI_API_KEY',
          modelEnvVar: 'GEMINI_MODEL',
          defaultModel: 'gemini-1.5-flash',
          docUrl: 'https://aistudio.google.com/app/apikey',
          supportsStreaming: true,
          supportsTools: true,
          consumerNote: 'This is the Google AI Studio / Gemini API. Generate an API key at aistudio.google.com.',
        },
        {
          id: 'deepseek',
          label: 'DeepSeek API',
          kind: 'api-key' as const,
          envVar: 'DEEPSEEK_API_KEY',
          modelEnvVar: 'DEEPSEEK_MODEL',
          defaultModel: 'deepseek-chat',
          docUrl: 'https://platform.deepseek.com/api_keys',
          supportsStreaming: true,
          supportsTools: true,
          consumerNote: 'Use an API key from platform.deepseek.com (not the consumer chat login).',
        },
        {
          id: 'openrouter',
          label: 'OpenRouter',
          kind: 'api-key' as const,
          envVar: 'OPENROUTER_API_KEY',
          modelEnvVar: 'OPENROUTER_MODEL',
          defaultModel: 'openai/gpt-4o',
          docUrl: 'https://openrouter.ai/keys',
          supportsStreaming: true,
          supportsTools: true,
          consumerNote: 'OpenRouter is an aggregator — one API key routes to many providers. Keys are at openrouter.ai/keys.',
        },
        {
          id: 'local',
          label: 'Local LLM (custom endpoint)',
          kind: 'api-key' as const,
          envVar: 'AI_LOCAL_ENDPOINT',
          modelEnvVar: 'AI_LOCAL_MODEL',
          defaultModel: 'local-default',
          docUrl: 'https://github.com/oobabooga/text-generation-webui',
          supportsStreaming: false,
          supportsTools: false,
          consumerNote: 'Local LLM endpoints (Ollama, LM Studio, text-generation-webui). Supply the full endpoint URL.',
        },
      ];

      // User-connected providers (masked hints only).
      const userProviders = await listUserAIProviders(user.id);
      const userProviderMap = new Map(userProviders.map(p => [p.provider, p]));

      const providers = PROVIDERS.map(p => {
        const userRow = userProviderMap.get(p.id);
        const platformConfigured =
          !!process.env[p.envVar] && process.env[p.envVar]!.trim().length > 0;
        return {
          id: p.id,
          label: p.label,
          kind: p.kind, // 'api-key' | 'platform-sdk' — Workstream B §3
          consumerNote: p.consumerNote, // Workstream B §3 — surfaces OpenAI API vs ChatGPT distinction
          envVar: p.envVar,
          modelEnvVar: p.modelEnvVar,
          defaultModel: p.defaultModel,
          docUrl: p.docUrl,
          supportsStreaming: p.supportsStreaming,
          supportsTools: p.supportsTools,
          // Platform-level (server-wide .env)
          platformConfigured,
          // User-level (encrypted UserAIProvider row)
          userConnected: !!userRow,
          userStatus: userRow?.status || null, // active | inactive | invalid | null
          userCredentialHint: userRow?.credentialHint || null, // masked prefix only
          userLastValidatedAt: userRow?.lastValidatedAt || null,
          userLastError: userRow?.lastValidationError || null,
          userModelPreferences: userRow?.modelPreferences || null,
          // Overall availability (user OR platform)
          available: userRow?.status === 'active' || platformConfigured,
          source: userRow?.status === 'active' ? 'user' : (platformConfigured ? 'platform' : 'none'),
        };
      });

      return NextResponse.json({
        providers,
        defaultProvider: 'z-ai',
      });
    } catch (error) {
      console.error('[AI Providers GET] failed:', error);
      return NextResponse.json({ error: 'Failed to fetch AI provider configuration' }, { status: 500 });
    }
  });
}
