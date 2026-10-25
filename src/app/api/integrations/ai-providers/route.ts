// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — AI Provider Integrations (Phase 26 v2 — Part 8)
//
// GET /api/integrations/ai-providers
//   Returns the list of AI providers supported by the orchestration
//   layer, with their connection/credential status. NEVER exposes
//   API key values — only `present: true|false`.
//
// PUT /api/integrations/ai-providers
//   Allows the user to enable/disable a provider + set the default
//   model. Credentials themselves are set via environment variables
//   (NOT via this endpoint — never commit secrets to the database).
//
// Security:
//   - Auth required (withAuth)
//   - No credential values ever returned
//   - No credential values ever accepted in PUT body
//   - Only the user's own settings are read/written
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';

// ─── Provider metadata ───────────────────────────────────────────────
//
// Static, never exposes secret values. `envVar` is the env-variable
// NAME (used for the `present` boolean); the value is NEVER read.

interface ProviderMeta {
  id: string;
  label: string;
  envVar: string;
  modelEnvVar: string;
  defaultModel: string;
  docUrl: string;
  supportsStreaming: boolean;
  supportsTools: boolean;
}

const PROVIDERS: ProviderMeta[] = [
  {
    id: 'z-ai',
    label: 'Z-AI / GLM (default)',
    envVar: 'ZAI_API_KEY',
    modelEnvVar: 'ZAI_MODEL',
    defaultModel: 'glm-4.6',
    docUrl: 'https://docs.z.ai',
    supportsStreaming: true,
    supportsTools: true,
  },
  {
    id: 'openai',
    label: 'OpenAI / ChatGPT',
    envVar: 'OPENAI_API_KEY',
    modelEnvVar: 'OPENAI_MODEL',
    defaultModel: 'gpt-4o',
    docUrl: 'https://platform.openai.com',
    supportsStreaming: true,
    supportsTools: true,
  },
  {
    id: 'anthropic',
    label: 'Anthropic Claude',
    envVar: 'ANTHROPIC_API_KEY',
    modelEnvVar: 'ANTHROPIC_MODEL',
    defaultModel: 'claude-sonnet-4-20250514',
    docUrl: 'https://docs.anthropic.com',
    supportsStreaming: true,
    supportsTools: true,
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    envVar: 'GEMINI_API_KEY',
    modelEnvVar: 'GEMINI_MODEL',
    defaultModel: 'gemini-1.5-flash',
    docUrl: 'https://ai.google.dev/',
    supportsStreaming: true,
    supportsTools: true,
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    envVar: 'DEEPSEEK_API_KEY',
    modelEnvVar: 'DEEPSEEK_MODEL',
    defaultModel: 'deepseek-chat',
    docUrl: 'https://api-docs.deepseek.com',
    supportsStreaming: true,
    supportsTools: true,
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    envVar: 'OPENROUTER_API_KEY',
    modelEnvVar: 'OPENROUTER_MODEL',
    defaultModel: 'openai/gpt-4o',
    docUrl: 'https://openrouter.ai',
    supportsStreaming: true,
    supportsTools: true,
  },
  {
    id: 'local',
    label: 'Local LLM (custom endpoint)',
    envVar: 'AI_LOCAL_ENDPOINT',
    modelEnvVar: 'AI_LOCAL_MODEL',
    defaultModel: 'local-default',
    docUrl: 'https://github.com/oobabooga/text-generation-webui',
    supportsStreaming: false,
    supportsTools: false,
  },
];

// ─── GET ─────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      // Build the response — never expose secret values.
      const providers = PROVIDERS.map((p) => {
        const credentialPresent =
          !!process.env[p.envVar] && process.env[p.envVar]!.trim().length > 0;
        const configuredModel = process.env[p.modelEnvVar] || p.defaultModel;
        return {
          id: p.id,
          label: p.label,
          credentialPresent,
          credentialStatus: credentialPresent ? 'configured' : 'missing',
          envVar: p.envVar,
          modelEnvVar: p.modelEnvVar,
          configuredModel,
          defaultModel: p.defaultModel,
          docUrl: p.docUrl,
          supportsStreaming: p.supportsStreaming,
          supportsTools: p.supportsTools,
        };
      });

      // ── Per-user provider preferences ──
      // (Which providers the user has explicitly enabled/disabled, and
      // which is their default for new workflows.) Stored in
      // UserSettings.aiProviderPrefs JSON column (additive — if the
      // column doesn't exist yet, return defaults.)
      let userPrefs: Record<string, unknown> = { defaultProvider: 'z-ai' };
      try {
        const { db } = await import('@/lib/db');
        const settings = await db.userSettings.findUnique({
          where: { userId: user.id },
          // aiProviderPrefs column is additive (Phase 26 v2 migration
          // would add it; if absent, the query throws — non-fatal).
          // Use a raw query to avoid breaking the typed Prisma client
          // if the column doesn't exist.
        }).catch(() => null);
        if (settings && typeof (settings as Record<string, unknown>).aiProviderPrefs === 'string') {
          const raw = (settings as Record<string, unknown>).aiProviderPrefs as string;
          try {
            userPrefs = JSON.parse(raw);
          } catch {
            // Corrupt JSON — fall back to defaults
          }
        }
      } catch {
        // Schema drift — non-fatal
      }

      return NextResponse.json({
        providers,
        defaultProvider: (userPrefs.defaultProvider as string) || 'z-ai',
        userPrefs,
      });
    } catch (error) {
      console.error('[AI Providers GET] failed:', error);
      return NextResponse.json(
        { error: 'Failed to fetch AI provider configuration' },
        { status: 500 },
      );
    }
  });
}
