// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — AI Providers Integration Panel (Phase 26 v3 — Decision 2)
//
// Settings → Integrations → AI Providers subsection.
//
// Lets the user:
//   - Connect their own API key for each AI provider (OpenAI, Anthropic,
//     Gemini, DeepSeek, OpenRouter). Z-AI uses the platform SDK gateway
//     config — no per-user connection needed.
//   - Validate the stored credential (makes a minimal real API call to
//     the provider and reports back the available models).
//   - Disconnect (deletes the encrypted credential).
//   - See the masked credential hint (e.g. "sk-***...X4f2") — NEVER the
//     actual key value.
//
// Connection method per provider (per Decision 2 + audit findings):
//   - OpenAI / Anthropic / DeepSeek / OpenRouter: API key entry
//     (these providers don't offer user-account OAuth for API access)
//   - Gemini: API key entry (simpler than reusing Google OAuth which
//     would require an additional scope)
//   - Z-AI: platform-provided (no user action needed)
//
// Security:
//   - apiKey input is type="password" — masked in the DOM
//   - After connect, the key is encrypted server-side and NEVER returned
//   - The UI only ever sees the masked hint (credentialHint field)
//   - Validate makes a real API call to verify the key works
// ═══════════════════════════════════════════════════════════════════

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  CheckCircle2, XCircle, Loader2, Key, Trash2, RefreshCw, Plus, ExternalLink,
} from 'lucide-react';

interface AIProvider {
  id: string;
  label: string;
  envVar: string;
  defaultModel: string;
  docUrl: string;
  supportsStreaming: boolean;
  supportsTools: boolean;
  platformConfigured: boolean;
  userConnected: boolean;
  userStatus: string | null;
  userCredentialHint: string | null;
  userLastValidatedAt: string | null;
  userModelPreferences: { defaultModel?: string; allowedModels?: string[] } | null;
  available: boolean;
  source: 'user' | 'platform' | 'none';
}

export function AIProvidersPanel() {
  const [providers, setProviders] = useState<AIProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [connectingProvider, setConnectingProvider] = useState<string | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState<Record<string, string>>({});
  const [validating, setValidating] = useState<Set<string>>(new Set());

  const loadProviders = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/integrations/ai-providers', { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setProviders(data.providers || []);
    } catch (err) {
      toast.error('Failed to load AI providers', {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadProviders(); }, [loadProviders]);

  const handleConnect = async (providerId: string) => {
    const apiKey = apiKeyInput[providerId]?.trim();
    if (!apiKey || apiKey.length < 8) {
      toast.error('API key must be at least 8 characters');
      return;
    }
    setConnectingProvider(providerId);
    try {
      const res = await fetch('/api/integrations/ai-providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'connect', provider: providerId, apiKey }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      toast.success(`${providerId} connected`, {
        description: 'Credential encrypted + stored. Validate to verify.',
      });
      setApiKeyInput(prev => ({ ...prev, [providerId]: '' }));
      await loadProviders();
    } catch (err) {
      toast.error(`Failed to connect ${providerId}`, {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setConnectingProvider(null);
    }
  };

  const handleDisconnect = async (providerId: string) => {
    if (!confirm(`Disconnect ${providerId}? This deletes your stored API key for this provider.`)) return;
    try {
      const res = await fetch('/api/integrations/ai-providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'disconnect', provider: providerId }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast.success(`${providerId} disconnected`);
      await loadProviders();
    } catch (err) {
      toast.error(`Failed to disconnect ${providerId}`, {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const handleValidate = async (providerId: string) => {
    setValidating(prev => new Set(prev).add(providerId));
    try {
      const res = await fetch('/api/integrations/ai-providers/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ provider: providerId }),
      });
      const data = await res.json();
      if (data.valid) {
        toast.success(`${providerId} credential valid`, {
          description: data.message || 'Credential accepted by provider',
        });
      } else {
        toast.error(`${providerId} credential invalid`, {
          description: data.error || 'Provider rejected the credential',
        });
      }
      await loadProviders();
    } catch (err) {
      toast.error(`Validation failed for ${providerId}`, {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setValidating(prev => {
        const next = new Set(prev);
        next.delete(providerId);
        return next;
      });
    }
  };

  if (loading) {
    return (
      <Card><CardContent className="pt-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading AI providers...
        </div>
      </CardContent></Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-semibold flex items-center gap-2">
            <Key className="h-4 w-4" /> AI Providers
          </h4>
          <p className="text-xs text-muted-foreground mt-1">
            Connect your own AI provider API keys. Keys are encrypted at rest and never exposed after saving.
          </p>
        </div>
      </div>

      {providers.map(p => (
        <Card key={p.id}>
          <CardContent className="pt-5 pb-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium">{p.label}</span>
                  <SourceBadge source={p.source} status={p.userStatus} />
                </div>
                <div className="text-xs text-muted-foreground space-y-0.5">
                  <div>Default model: <code className="text-foreground">{p.defaultModel}</code></div>
                  {p.userConnected && p.userCredentialHint && (
                    <div>Connected key: <code className="text-foreground">{p.userCredentialHint}</code></div>
                  )}
                  {p.userLastValidatedAt && (
                    <div>Last validated: {new Date(p.userLastValidatedAt).toLocaleString()}</div>
                  )}
                  {p.userStatus === 'invalid' && p.userCredentialHint && (
                    <div className="text-red-600 dark:text-red-400">
                      ⚠ Last validation failed — the stored key was rejected. Reconnect or update.
                    </div>
                  )}
                  <a href={p.docUrl} target="_blank" rel="noopener noreferrer"
                     className="inline-flex items-center gap-1 hover:underline mt-1">
                    Get API key <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </div>

              <div className="flex flex-col items-end gap-2 shrink-0">
                {p.userConnected ? (
                  <>
                    <div className="flex gap-2">
                      <Button
                        size="sm" variant="outline"
                        disabled={validating.has(p.id)}
                        onClick={() => handleValidate(p.id)}
                      >
                        {validating.has(p.id) ? (
                          <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Validating...</>
                        ) : (
                          <><RefreshCw className="h-3 w-3 mr-1" /> Validate</>
                        )}
                      </Button>
                      <Button
                        size="sm" variant="outline"
                        disabled={connectingProvider === p.id}
                        onClick={() => handleDisconnect(p.id)}
                      >
                        <Trash2 className="h-3 w-3 mr-1" /> Disconnect
                      </Button>
                    </div>
                    <div className="w-56">
                      <Input
                        type="password"
                        placeholder="Update API key (optional)"
                        value={apiKeyInput[p.id] || ''}
                        onChange={(e) => setApiKeyInput(prev => ({ ...prev, [p.id]: e.target.value }))}
                      />
                      <Button
                        size="sm" variant="ghost"
                        disabled={!apiKeyInput[p.id] || connectingProvider === p.id}
                        onClick={() => handleConnect(p.id)}
                        className="mt-1 h-7 text-xs"
                      >
                        {connectingProvider === p.id ? (
                          <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Updating...</>
                        ) : (
                          <><Plus className="h-3 w-3 mr-1" /> Update key</>
                        )}
                      </Button>
                    </div>
                  </>
                ) : p.id === 'z-ai' ? (
                  <Badge variant="secondary" className="text-xs">
                    Platform-provided (SDK gateway)
                  </Badge>
                ) : p.platformConfigured ? (
                  <Badge variant="outline" className="text-xs">
                    Platform-provided — connect your own to override
                  </Badge>
                ) : (
                  <div className="w-56">
                    <Input
                      type="password"
                      placeholder={`${p.id} API key`}
                      value={apiKeyInput[p.id] || ''}
                      onChange={(e) => setApiKeyInput(prev => ({ ...prev, [p.id]: e.target.value }))}
                    />
                    <Button
                      size="sm" variant="default"
                      disabled={!apiKeyInput[p.id] || apiKeyInput[p.id].length < 8 || connectingProvider === p.id}
                      onClick={() => handleConnect(p.id)}
                      className="mt-1 h-7 text-xs"
                    >
                      {connectingProvider === p.id ? (
                        <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Connecting...</>
                      ) : (
                        <><Plus className="h-3 w-3 mr-1" /> Connect</>
                      )}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function SourceBadge({ source, status }: { source: string; status: string | null }) {
  if (source === 'user' && status === 'active') {
    return <Badge variant="default" className="text-xs bg-green-600"><CheckCircle2 className="h-3 w-3 mr-1" /> Connected</Badge>;
  }
  if (source === 'user' && status === 'invalid') {
    return <Badge variant="destructive" className="text-xs"><XCircle className="h-3 w-3 mr-1" /> Invalid</Badge>;
  }
  if (source === 'platform') {
    return <Badge variant="outline" className="text-xs">Platform</Badge>;
  }
  return <Badge variant="secondary" className="text-xs">Not configured</Badge>;
}
