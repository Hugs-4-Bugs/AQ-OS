// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Workflow AI Step Config (Phase 26 v3 — Decisions 3+4)
//
// Embeds inside the Workflow Builder's action node editor. Appears when
// the selected action type is AI-capable (generate_ai_message, ai_analysis,
// ai_outreach, score_lead). Lets the user configure:
//
//   - Provider dropdown (z-ai, openai, anthropic, gemini, deepseek,
//     openrouter, local) — only providers that are AVAILABLE (user-
//     connected OR platform-configured) are selectable; others are
//     shown as disabled with "Connect in Settings → Integrations"
//   - Model dropdown (provider-specific defaults; user can type a custom
//     model id)
//   - Execution strategy: Single | Sequential | Parallel
//   - Multi-model selection (for Sequential/Parallel): checkbox list
//     of available providers
//   - Concurrency (for Parallel): 1-4 worker pool size
//   - Fallback toggle (when enabled, failed providers fall back to the
//     next available provider in the chain — opt-in, never silent)
//   - Temperature slider (0.0-1.0)
//
// The configuration is persisted into the workflow node's `config`
// field as JSON: { provider, model, models, orchestration, concurrency,
// fallback, temperature }. The existing orchestrator (Phase 26 v1) reads
// these fields via buildModelCallSpecs + parseOrchestrationMode +
// parseConcurrencyLimit — NO backend change needed.
// ═══════════════════════════════════════════════════════════════════

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Loader2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

export interface AIStepConfig {
  provider?: string;
  model?: string;
  models?: Array<{ provider?: string; model?: string; role?: string }>;
  orchestration?: 'single' | 'sequential' | 'parallel';
  concurrency?: number;
  fallback?: boolean;
  temperature?: number;
}

interface ProviderInfo {
  id: string;
  label: string;
  defaultModel: string;
  available: boolean;
  source: 'user' | 'platform' | 'none';
}

const PROVIDER_DEFAULT_MODELS: Record<string, string[]> = {
  'z-ai': ['glm-4.6', 'glm-4-plus', 'glm-4-air'],
  openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-5'],
  anthropic: ['claude-sonnet-4-20250514', 'claude-3-opus-20240229', 'claude-3-sonnet-20240229', 'claude-3-haiku-20240307'],
  gemini: ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-2.0-flash'],
  deepseek: ['deepseek-chat', 'deepseek-reasoner'],
  openrouter: ['openai/gpt-4o', 'anthropic/claude-3-sonnet', 'google/gemini-1.5-pro'],
  local: ['local-default'],
};

export function WorkflowAIStepConfig({
  config,
  onChange,
}: {
  config: AIStepConfig;
  onChange: (next: AIStepConfig) => void;
}) {
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [loading, setLoading] = useState(true);

  const loadProviders = useCallback(async () => {
    try {
      const res = await fetch('/api/integrations/ai-providers', { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setProviders(data.providers || []);
    } catch (err) {
      // Non-fatal — defaults will be used
      console.warn('[WorkflowAIStepConfig] failed to load providers:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadProviders(); }, [loadProviders]);

  const availableProviders = providers.filter(p => p.available);
  const orchestration = config.orchestration || 'single';
  const isMulti = orchestration === 'sequential' || orchestration === 'parallel';

  const update = (patch: Partial<AIStepConfig>) => {
    onChange({ ...config, ...patch });
  };

  const updateMultiModel = (providerId: string, checked: boolean) => {
    const current = config.models || [];
    let next;
    if (checked) {
      if (!current.find(m => m.provider === providerId)) {
        next = [...current, { provider: providerId, model: PROVIDER_DEFAULT_MODELS[providerId]?.[0] }];
      } else {
        next = current;
      }
    } else {
      next = current.filter(m => m.provider !== providerId);
    }
    update({ models: next });
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
        <Loader2 className="h-3 w-3 animate-spin" /> Loading AI providers...
      </div>
    );
  }

  if (availableProviders.length === 0) {
    return (
      <div className="rounded-md border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 p-3 text-xs">
        <div className="flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
          <div>
            <div className="font-medium text-amber-900 dark:text-amber-200">No AI providers configured</div>
            <div className="text-amber-700 dark:text-amber-300 mt-1">
              Connect at least one AI provider in <strong>Settings → Integrations → AI Providers</strong> to enable AI workflow steps.
              The platform default (Z-AI) will be used as fallback if available.
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-md border border-cyan-200 dark:border-cyan-900 bg-cyan-50/40 dark:bg-cyan-950/20 p-3">
      <div className="flex items-center gap-2 text-xs font-semibold text-cyan-900 dark:text-cyan-200">
        <span>🧠 AI Configuration</span>
        <Badge variant="outline" className="text-[10px]">{availableProviders.length} providers available</Badge>
      </div>

      {/* Execution Strategy */}
      <div>
        <Label className="text-xs font-medium">Execution Strategy</Label>
        <Select
          value={orchestration}
          onValueChange={(v) => update({ orchestration: v as AIStepConfig['orchestration'] })}
        >
          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="single">Single model — one provider/model</SelectItem>
            <SelectItem value="sequential">Sequential — chain outputs (Model A → Model B → ...)</SelectItem>
            <SelectItem value="parallel">Parallel — bounded concurrent calls + synthesis</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Single-model config */}
      {!isMulti && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs font-medium">Provider</Label>
            <Select
              value={config.provider || ''}
              onValueChange={(v) => update({ provider: v, model: PROVIDER_DEFAULT_MODELS[v]?.[0] || '' })}
            >
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select provider" /></SelectTrigger>
              <SelectContent>
                {availableProviders.map(p => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.label} <span className="text-[10px] text-muted-foreground">({p.source})</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs font-medium">Model</Label>
            <Select
              value={config.model || ''}
              onValueChange={(v) => update({ model: v })}
            >
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select model" /></SelectTrigger>
              <SelectContent>
                {(PROVIDER_DEFAULT_MODELS[config.provider || ''] || []).map(m => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
                {config.model && !PROVIDER_DEFAULT_MODELS[config.provider || '']?.includes(config.model) && (
                  <SelectItem value={config.model}>{config.model} (custom)</SelectItem>
                )}
              </SelectContent>
            </Select>
            <Input
              className="h-7 text-xs mt-1"
              placeholder="Or type a custom model id"
              value={config.model || ''}
              onChange={(e) => update({ model: e.target.value })}
            />
          </div>
        </div>
      )}

      {/* Multi-model config (Sequential / Parallel) */}
      {isMulti && (
        <div>
          <Label className="text-xs font-medium">Models ({orchestration})</Label>
          <div className="space-y-1.5 mt-1">
            {availableProviders.map(p => {
              const checked = !!(config.models || []).find(m => m.provider === p.id);
              return (
                <div key={p.id} className="flex items-center gap-2">
                  <Checkbox
                    id={`ai-${p.id}`}
                    checked={checked}
                    onCheckedChange={(v) => updateMultiModel(p.id, v === true)}
                  />
                  <Label htmlFor={`ai-${p.id}`} className="text-xs font-normal cursor-pointer flex-1">
                    {p.label} <span className="text-[10px] text-muted-foreground">({p.source})</span>
                  </Label>
                  {checked && (
                    <Select
                      value={config.models?.find(m => m.provider === p.id)?.model || ''}
                      onValueChange={(v) => {
                        const next = (config.models || []).map(m =>
                          m.provider === p.id ? { ...m, model: v } : m
                        );
                        update({ models: next });
                      }}
                    >
                      <SelectTrigger className="h-7 text-xs w-44"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(PROVIDER_DEFAULT_MODELS[p.id] || []).map(m => (
                          <SelectItem key={m} value={m}>{m}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              );
            })}
            {config.models && config.models.length === 0 && (
              <div className="text-xs text-muted-foreground italic">
                Select at least 2 models for {orchestration} execution.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Parallel: concurrency */}
      {orchestration === 'parallel' && (
        <div>
          <Label className="text-xs font-medium">
            Concurrency (worker pool size): {config.concurrency ?? 3}
          </Label>
          <Slider
            value={[config.concurrency ?? 3]}
            min={1} max={4} step={1}
            onValueChange={([v]) => update({ concurrency: v })}
            className="mt-2"
          />
          <div className="text-[10px] text-muted-foreground mt-1">
            Bounded worker pool — never unlimited fan-out. Each model failure is isolated (Promise.allSettled).
          </div>
        </div>
      )}

      {/* Fallback toggle */}
      <div className="flex items-center gap-2">
        <Checkbox
          id="ai-fallback"
          checked={config.fallback || false}
          onCheckedChange={(v) => update({ fallback: v === true })}
        />
        <Label htmlFor="ai-fallback" className="text-xs font-normal cursor-pointer">
          Enable fallback — if the configured provider fails, retry with the next available provider (opt-in, never silent)
        </Label>
      </div>

      {/* Temperature */}
      <div>
        <Label className="text-xs font-medium">
          Temperature: {config.temperature ?? 0.7}
        </Label>
        <Slider
          value={[config.temperature ?? 0.7]}
          min={0} max={1} step={0.1}
          onValueChange={([v]) => update({ temperature: v })}
          className="mt-2"
        />
      </div>
    </div>
  );
}
