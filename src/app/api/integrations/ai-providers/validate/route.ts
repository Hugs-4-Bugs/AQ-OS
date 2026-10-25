// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — AI Provider Validate (Phase 26 v3 — Decision 2)
//
// POST /api/integrations/ai-providers/validate
//   Body: { provider: string }
//   Tests the user's stored credential by making a MINIMAL real API call
//   to the provider. Updates status to 'active' or 'invalid' based on the
//   response.
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { db } from '@/lib/db';
import { resolveProviderApiKey, markProviderInvalid } from '@/lib/ai/user-ai-provider-service';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  return withAuth(request, async (user) => {
    let body: Record<string, unknown>;
    try { body = await request.json(); }
    catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }

    const provider = body.provider as string | undefined;
    if (!provider) {
      return NextResponse.json({ error: 'provider is required' }, { status: 400 });
    }

    let apiKey: string;
    let source: 'user' | 'platform';
    try {
      const resolved = await resolveProviderApiKey(user.id, provider);
      apiKey = resolved.apiKey;
      source = resolved.source;
    } catch (err) {
      return NextResponse.json({
        provider, valid: false, source: 'none',
        error: err instanceof Error ? err.message : 'No credential available',
      }, { status: 200 });
    }

    try {
      const result = await validateProviderCredential(provider, apiKey);
      if (source === 'user') {
        await db.userAIProvider.updateMany({
          where: { userId: user.id, provider },
          data: { status: 'active', lastValidatedAt: new Date(), lastValidationError: null },
        });
      }
      return NextResponse.json({
        provider, valid: true, source,
        models: result.models, message: result.message,
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      if (source === 'user') {
        await markProviderInvalid({ userId: user.id, provider, error: errorMsg });
      }
      return NextResponse.json({
        provider, valid: false, source, error: errorMsg,
      }, { status: 200 });
    }
  });
}

async function validateProviderCredential(
  provider: string, apiKey: string,
): Promise<{ models: string[]; message: string }> {
  switch (provider) {
    case 'openai': {
      const res = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => 'Unknown');
        throw new Error(`OpenAI API ${res.status}: ${errText.slice(0, 200)}`);
      }
      const data = await res.json();
      const models: string[] = (data.data || []).map((m: { id: string }) => m.id).slice(0, 50);
      return { models, message: `OpenAI credential valid — ${models.length} models available` };
    }
    case 'anthropic': {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'claude-3-haiku-20240307', max_tokens: 1, messages: [{ role: 'user', content: 'Hi' }] }),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => 'Unknown');
        throw new Error(`Anthropic API ${res.status}: ${errText.slice(0, 200)}`);
      }
      return { models: ['claude-3-haiku-20240307', 'claude-3-sonnet-20240229', 'claude-3-opus-20240229', 'claude-sonnet-4-20250514'], message: 'Anthropic credential valid' };
    }
    case 'gemini': {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`, {
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => 'Unknown');
        throw new Error(`Gemini API ${res.status}: ${errText.slice(0, 200)}`);
      }
      const data = await res.json();
      const models: string[] = (data.models || []).map((m: { name: string }) => m.name.replace('models/', '')).slice(0, 50);
      return { models, message: `Gemini credential valid — ${models.length} models available` };
    }
    case 'deepseek': {
      const res = await fetch('https://api.deepseek.com/v1/models', {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => 'Unknown');
        throw new Error(`DeepSeek API ${res.status}: ${errText.slice(0, 200)}`);
      }
      const data = await res.json();
      const models: string[] = (data.data || []).map((m: { id: string }) => m.id).slice(0, 50);
      return { models, message: `DeepSeek credential valid — ${models.length} models available` };
    }
    case 'openrouter': {
      const res = await fetch('https://openrouter.ai/api/v1/models', {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => 'Unknown');
        throw new Error(`OpenRouter API ${res.status}: ${errText.slice(0, 200)}`);
      }
      const data = await res.json();
      const models: string[] = (data.data || []).map((m: { id: string }) => m.id).slice(0, 50);
      return { models, message: `OpenRouter credential valid — ${models.length} models available` };
    }
    case 'z-ai':
      return { models: ['glm-4.6'], message: 'Z-AI uses SDK gateway config (no per-user validation needed)' };
    case 'local': {
      const endpoint = process.env.AI_LOCAL_ENDPOINT;
      if (!endpoint) throw new Error('AI_LOCAL_ENDPOINT not set');
      const res = await fetch(endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'local-default', messages: [{ role: 'user', content: 'Hi' }], max_tokens: 1 }),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) throw new Error(`Local LLM ${res.status}`);
      return { models: ['local-default'], message: 'Local LLM endpoint reachable' };
    }
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}
