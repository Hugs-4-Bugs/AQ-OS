// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — AI Providers Integration Panel (Workstream B)
//
// Settings → Integrations → AI Providers subsection.
//
// Lets the user:
//   - Connect their own API key for each AI provider (OpenAI, Anthropic,
//     Gemini, DeepSeek, OpenRouter). Z-AI uses the platform SDK gateway
//     config — no per-user connection needed.
//   - Validate the stored credential (performs a real provider call:
//     live model-list for OpenAI/Gemini/DeepSeek/OpenRouter; minimal
//     ping for catalog providers). Persists discovered models + status.
//   - Disconnect (deletes the encrypted credential).
//   - See the masked credential hint (e.g. "sk-***...X4f2") — NEVER the
//     actual key value.
//   - See Available Models with capability metadata (vision / tools /
//     structured output / reasoning / context length).
//
// Workstream B §3 (OpenAI distinction):
//   The UI surfaces `consumerNote` for each provider — clarifying
//   that OpenAI Platform API is NOT the ChatGPT consumer product
//   (and Anthropic Console API is NOT Claude.ai, etc.).
//
// Workstream B §4 (UX states):
//   not_connected | connecting | connected | validation_failed |
//   credential_expired | rate_limited | temporarily_unavailable
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
  CheckCircle2, XCircle, Loader2, Key, Trash2, RefreshCw, Plus,
  ExternalLink, AlertTriangle, Eye, Brain, Wrench, Image as ImageIcon,
  ListChecks, Sparkles,
} from 'lucide-react';

interface AIProvider {
  id: string;
  label: string;
  kind: 'api-key' | 'platform-sdk';
  consumerNote: string;
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
  userLastError: string | null;
  userModelPreferences: { defaultModel?: string; allowedModels?: string[] } | null;
  available: boolean;
  source: 'user' | 'platform' | 'none';
}

interface DiscoveredModel {
  modelId: string;
  displayName: string | null;
  source: 'live' | 'catalog';
  contextLength: number | null;
  supportsVision: boolean;
  supportsTools: boolean;
  supportsStructuredOutput: boolean;
  supportsReasoning: boolean;
  inputModalities: string[];
  outputModalities: string[];
  availability: string | null;
  lastVerifiedAt: string;
}

interface ValidationResponse {
  provider: string;
  valid: boolean;
  source: 'user' | 'platform' | 'none';
  failureCategory: string | null;
  models: DiscoveredModel[];
  message: string;
  error?: string;
}

// ─── UX state machine ───────────────────────────────────────────────
//
// Per Workstream B §4: not_connected / connecting / connected /
// validation_failed / credential_expired / rate_limited /
// temporarily_unavailable
//
// Derived from (userStatus, platformConfigured, userLastError, lastValidatedAt).

type UXState =
  | 'not_connected'
  | 'connecting'
  | 'connected'
  | 'validation_failed'
  | 'credential_expired'
  | 'rate_limited'
  | 'temporarily_unavailable'
  | 'platform_only';

function deriveUXState(
  p: AIProvider,
  connecting: boolean,
  validating: boolean
): { state: UXState; reason?: string } {
  if (connecting) return { state: 'connecting' };

  // User-connected credential
  if (p.userConnected) {
    if (validating) return { state: 'connected' }; // keep showing connected while revalidating
    if (p.userStatus === 'active') return { state: 'connected' };
    if (p.userStatus === 'invalid') {
      const err = (p.userLastError || '').toLowerCase();
      if (/429|rate limit/.test(err)) return { state: 'rate_limited', reason: p.userLastError || undefined };
      if (/5\d\d|server error|unavailable|internal/.test(err)) return { state: 'temporarily_unavailable', reason: p.userLastError || undefined };
      if (/expired|revoked/.test(err)) return { state: 'credential_expired', reason: p.userLastError || undefined };
      return { state: 'validation_failed', reason: p.userLastError || undefined };
    }
  }

  // Platform-provided only
  if (p.platformConfigured && !p.userConnected) {
    return { state: 'platform_only' };
  }

  return { state: 'not_connected' };
}

// ─── Component ───────────────────────────────────────────────────────

export function AIProvidersPanel() {
  const [providers, setProviders] = useState<AIProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [connectingProvider, setConnectingProvider] = useState<string | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState<Record<string, string>>({});
  const [validating, setValidating] = useState<Set<string>>(new Set());
  const [discoveredModels, setDiscoveredModels] = useState<Record<string, DiscoveredModel[]>>({});
  const [validatingModels, setValidatingModels] = useState<Set<string>>(new Set());

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

  // Auto-load cached discovered models for connected providers
  const loadCachedModelsForAll = useCallback(async (providerIds: string[]) => {
    const next: Record<string, DiscoveredModel[]> = {};
    await Promise.all(providerIds.map(async (pid) => {
      try {
        const r = await fetch(`/api/integrations/ai-providers/models?provider=${encodeURIComponent(pid)}`, { credentials: 'include' });
        if (!r.ok) return;
        const d = await r.json();
        if (Array.isArray(d.models) && d.models.length > 0) {
          next[pid] = d.models;
        }
      } catch {
        /* non-fatal */
      }
    }));
    setDiscoveredModels(prev => ({ ...prev, ...next }));
  }, []);

  useEffect(() => {
    (async () => {
      await loadProviders();
    })();
  }, [loadProviders]);

  // After providers load, fetch cached discovered models for each
  useEffect(() => {
    if (!loading && providers.length > 0) {
      const idsToLoad = providers
        .filter(p => p.userConnected || p.platformConfigured)
        .map(p => p.id);
      if (idsToLoad.length > 0) loadCachedModelsForAll(idsToLoad);
    }
  }, [loading, providers, loadCachedModelsForAll]);

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
        description: 'Credential encrypted + stored. Validate to discover models.',
      });
      setApiKeyInput(prev => ({ ...prev, [providerId]: '' }));
      await loadProviders();
      // Auto-trigger validate + discovery
      await handleValidate(providerId, true);
    } catch (err) {
      toast.error(`Failed to connect ${providerId}`, {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setConnectingProvider(null);
    }
  };

  const handleDisconnect = async (providerId: string) => {
    if (!confirm(`Disconnect ${providerId}? This deletes your stored API key and all cached discovered models for this provider.`)) return;
    try {
      const res = await fetch('/api/integrations/ai-providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'disconnect', provider: providerId }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast.success(`${providerId} disconnected`);
      setDiscoveredModels(prev => { const n = { ...prev }; delete n[providerId]; return n; });
      await loadProviders();
    } catch (err) {
      toast.error(`Failed to disconnect ${providerId}`, {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const handleValidate = async (providerId: string, silent = false) => {
    setValidating(prev => new Set(prev).add(providerId));
    setValidatingModels(prev => new Set(prev).add(providerId));
    try {
      const res = await fetch('/api/integrations/ai-providers/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ provider: providerId }),
      });
      const data: ValidationResponse = await res.json();
      if (data.valid) {
        if (!silent) toast.success(`${providerId} credential valid`, {
          description: data.message || 'Credential accepted by provider',
        });
        // Persist discovered models in UI state
        if (data.models.length > 0) {
          setDiscoveredModels(prev => ({ ...prev, [providerId]: data.models }));
        }
      } else {
        const desc = data.error || `${providerId} validation failed (${data.failureCategory || 'unknown'})`;
        if (!silent) toast.error(`${providerId} validation failed`, { description: desc });
      }
      await loadProviders();
    } catch (err) {
      if (!silent) toast.error(`Validation failed for ${providerId}`, {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setValidating(prev => { const n = new Set(prev); n.delete(providerId); return n; });
      setValidatingModels(prev => { const n = new Set(prev); n.delete(providerId); return n; });
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

      {providers.map(p => {
        const { state, reason } = deriveUXState(
          p,
          connectingProvider === p.id,
          validating.has(p.id)
        );
        const models = discoveredModels[p.id] || [];
        return (
          <Card key={p.id}>
            <CardContent className="pt-5 pb-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-sm font-medium">{p.label}</span>
                    <UXStateBadge state={state} />
                    {p.kind === 'platform-sdk' && (
                      <Badge variant="secondary" className="text-xs">platform-sdk</Badge>
                    )}
                  </div>

                  {/* consumerNote — surfaces OpenAI API vs ChatGPT distinction (Workstream B §3) */}
                  <div className="text-xs text-muted-foreground space-y-0.5">
                    <div className="text-amber-700 dark:text-amber-300 italic">{p.consumerNote}</div>
                    <div>Default model: <code className="text-foreground">{p.defaultModel}</code></div>
                    {p.userConnected && p.userCredentialHint && (
                      <div>Connected key: <code className="text-foreground">{p.userCredentialHint}</code></div>
                    )}
                    {p.userLastValidatedAt && (
                      <div>Last validated: {new Date(p.userLastValidatedAt).toLocaleString()}</div>
                    )}
                    {state !== 'connected' && state !== 'platform_only' && state !== 'not_connected' && reason && (
                      <div className="text-red-600 dark:text-red-400 flex items-start gap-1 mt-1">
                        <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                        <span className="break-words">{reason.slice(0, 200)}</span>
                      </div>
                    )}
                    <a href={p.docUrl} target="_blank" rel="noopener noreferrer"
                       className="inline-flex items-center gap-1 hover:underline mt-1">
                      Get API key <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>

                  {/* Available Models (post-validation) — Workstream B §4 */}
                  {models.length > 0 && (
                    <div className="mt-3">
                      <div className="text-xs font-semibold mb-1.5 flex items-center gap-1">
                        <ListChecks className="h-3 w-3" /> Available Models
                        <Badge variant="outline" className="text-[10px] ml-1">
                          {models.length} · {models[0].source}
                        </Badge>
                      </div>
                      <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                        {models.map(m => (
                          <ModelRow key={`${p.id}-${m.modelId}`} model={m} />
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex flex-col items-end gap-2 shrink-0">
                  {p.userConnected ? (
                    <>
                      <div className="flex gap-2">
                        <Button
                          size="sm" variant="outline"
                          disabled={validatingModels.has(p.id)}
                          onClick={() => handleValidate(p.id)}
                        >
                          {validatingModels.has(p.id) ? (
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
                  ) : p.kind === 'platform-sdk' ? (
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
        );
      })}
    </div>
  );
}

// ─── UX State Badge ───────────────────────────────────────────────────

function UXStateBadge({ state, reason }: { state: UXState; reason?: string }) {
  switch (state) {
    case 'connected':
      return <Badge variant="default" className="text-xs bg-green-600"><CheckCircle2 className="h-3 w-3 mr-1" /> Connected</Badge>;
    case 'connecting':
      return <Badge variant="secondary" className="text-xs"><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Connecting</Badge>;
    case 'validation_failed':
      return <Badge variant="destructive" className="text-xs" title={reason}><XCircle className="h-3 w-3 mr-1" /> Validation failed</Badge>;
    case 'credential_expired':
      return <Badge variant="destructive" className="text-xs" title={reason}><XCircle className="h-3 w-3 mr-1" /> Credential expired</Badge>;
    case 'rate_limited':
      return <Badge variant="secondary" className="text-xs bg-amber-500 text-white" title={reason}><AlertTriangle className="h-3 w-3 mr-1" /> Rate limited</Badge>;
    case 'temporarily_unavailable':
      return <Badge variant="secondary" className="text-xs bg-orange-500 text-white" title={reason}><AlertTriangle className="h-3 w-3 mr-1" /> Provider unavailable</Badge>;
    case 'platform_only':
      return <Badge variant="outline" className="text-xs">Platform-provided</Badge>;
    case 'not_connected':
    default:
      return <Badge variant="secondary" className="text-xs">Not connected</Badge>;
  }
}

// ─── Model Row ────────────────────────────────────────────────────────

function ModelRow({ model }: { model: DiscoveredModel }) {
  const deprecated = model.availability === 'deprecated';
  return (
    <div className={`text-xs border rounded px-2 py-1.5 ${deprecated ? 'border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20' : 'border-muted'}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="font-mono text-foreground truncate">{model.modelId}</span>
          {model.displayName && model.displayName !== model.modelId && (
            <span className="text-muted-foreground truncate">— {model.displayName}</span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {model.supportsVision && <CapabilityIcon icon="vision" title="Vision" />}
          {model.supportsTools && <CapabilityIcon icon="tools" title="Tool calling" />}
          {model.supportsStructuredOutput && <CapabilityIcon icon="structured" title="Structured output" />}
          {model.supportsReasoning && <CapabilityIcon icon="reasoning" title="Reasoning" />}
        </div>
      </div>
      <div className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-2">
        {model.contextLength && <span>ctx {Math.round(model.contextLength / 1000)}k</span>}
        {model.availability && model.availability !== 'available' && (
          <span className={deprecated ? 'text-amber-700 dark:text-amber-300' : ''}>{model.availability}</span>
        )}
        <span>source: {model.source}</span>
      </div>
    </div>
  );
}

function CapabilityIcon({ icon, title }: { icon: 'vision' | 'tools' | 'structured' | 'reasoning'; title: string }) {
  const Icon = icon === 'vision' ? ImageIcon
    : icon === 'tools' ? Wrench
    : icon === 'structured' ? ListChecks
    : Brain;
  return <Icon className="h-3 w-3 text-cyan-600 dark:text-cyan-400" title={title} />;
}
