'use client';

// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Business Profile Selector (compact)
// Shown wherever discovery / research / outreach needs business context:
// pick which of YOUR business profiles the AI should act as, with the
// campaign override fields (objective, audience, offer, outcome, CTA,
// tone) in an optional expander. Selection + overrides are passed up to
// the caller and persisted with the campaign/job — resolution happens
// server-side in resolveBusinessContext (ownership enforced there).
// ═══════════════════════════════════════════════════════════════════

import React, { useEffect, useState } from 'react';
import { Building2, ChevronDown, Loader2 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { fetchBusinessProfiles, type BusinessProfile } from '@/lib/business-profile';

export interface ProfileSelection {
  /**
   * EXPLICIT None support:
   *  - 'default': nothing chosen yet → the default profile is auto-selected
   *    (server falls back to the default profile for null ids).
   *  - 'profile': an explicit profile is selected.
   *  - 'none': the user explicitly chose NONE — discovery/research/outreach
   *    run WITHOUT business context (never falls back to the default).
   */
  mode: 'default' | 'profile' | 'none';
  businessProfileId: string | null;
  overrides: {
    objective?: string;
    audience?: string;
    offer?: string;
    outcome?: string;
    cta?: string;
    tone?: string;
    instructions?: string;
  };
}

export default function BusinessProfileSelector({
  value,
  onChange,
  compact = false,
}: {
  value: ProfileSelection;
  onChange: (next: ProfileSelection) => void;
  /** compact = select only (no override fields) — for inline toolbars */
  compact?: boolean;
}) {
  const [profiles, setProfiles] = useState<BusinessProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showOverrides, setShowOverrides] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const list = await fetchBusinessProfiles();
        if (cancelled) return;
        setProfiles(list);
        setLoadError(null);
        // Auto-select the default profile only while nothing explicit has
        // been chosen (an explicit None is never overridden).
        if (value.mode === 'default' && !value.businessProfileId && list.length > 0) {
          const def = list.find((p) => p.isDefault) ?? list[0];
          onChange({ ...value, mode: 'profile', businessProfileId: def.id });
        }
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Failed to load profiles');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const selected = profiles.find((p) => p.id === value.businessProfileId) ?? null;
  const setOverride = (k: keyof NonNullable<ProfileSelection['overrides']>) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      onChange({ ...value, overrides: { ...value.overrides, [k]: e.target.value } });

  const activeOverrideCount = Object.values(value.overrides).filter((v) => (v ?? '').trim()).length;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Building2 className="h-4 w-4 text-primary shrink-0" />
        <Select
          value={value.mode === 'none' ? '__none' : (value.businessProfileId ?? undefined)}
          onValueChange={(v) => {
            if (v === '__none') {
              // EXPLICIT None — clears the override entirely; the server is
              // told (useBusinessContext: false) not to fall back to the
              // default profile.
              onChange({ ...value, mode: 'none', businessProfileId: null });
            } else {
              onChange({ ...value, mode: 'profile', businessProfileId: v });
            }
          }}
        >
          <SelectTrigger className="flex-1 h-9 text-sm" aria-label="Business profile">
            {loading ? (
              <span className="flex items-center gap-2 text-muted-foreground text-sm">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading profiles…
              </span>
            ) : (
              <SelectValue placeholder={loadError ? 'Profiles unavailable' : 'Select business profile'} />
            )}
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none">None — no business context</SelectItem>
            {profiles.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.label}{p.industry ? ` · ${p.industry}` : ''}{p.isDefault ? ' (default)' : ''}
              </SelectItem>
            ))}
            {profiles.length === 0 && !loading && (
              <SelectItem value="__empty" disabled>No profiles — create one in Settings → Business Profiles</SelectItem>
            )}
          </SelectContent>
        </Select>
        {!compact && (
          <button
            type="button"
            onClick={() => setShowOverrides((s) => !s)}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 shrink-0"
            aria-expanded={showOverrides}
          >
            {activeOverrideCount > 0 && (
              <span className="inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-primary/15 text-primary text-[10px]">
                {activeOverrideCount}
              </span>
            )}
            Campaign overrides
            <ChevronDown className={`h-3 w-3 transition-transform ${showOverrides ? 'rotate-180' : ''}`} />
          </button>
        )}
      </div>

      {value.mode === 'none' && !compact && (
        <p className="text-[11px] text-muted-foreground -mt-1">
          Discovery, research, and outreach will run <span className="text-foreground font-medium">without any business profile</span> — no company context is applied and no default is substituted.
        </p>
      )}

      {selected && !compact && (
        <p className="text-[11px] text-muted-foreground -mt-1">
          Outreach will be written as <span className="text-foreground font-medium">{selected.companyName || selected.label}</span>
          {selected.industry ? ` (${selected.industry})` : ''} — from your profile defaults, plus any overrides below.
        </p>
      )}

      {showOverrides && !compact && (
        <div className="grid sm:grid-cols-2 gap-2 p-3 rounded-lg bg-muted/30 border border-border/50">
          <Input value={value.overrides.objective ?? ''} onChange={setOverride('objective')} placeholder="Campaign objective (optional)" className="h-8 text-xs" />
          <Input value={value.overrides.audience ?? ''} onChange={setOverride('audience')} placeholder="Target audience for this campaign (optional)" className="h-8 text-xs" />
          <Input value={value.overrides.offer ?? ''} onChange={setOverride('offer')} placeholder="Specific offer to promote (optional)" className="h-8 text-xs" />
          <Input value={value.overrides.outcome ?? ''} onChange={setOverride('outcome')} placeholder="Desired outcome (optional)" className="h-8 text-xs" />
          <Input value={value.overrides.cta ?? ''} onChange={setOverride('cta')} placeholder="Call to action (optional)" className="h-8 text-xs" />
          <Input value={value.overrides.tone ?? ''} onChange={setOverride('tone')} placeholder="Tone override (optional)" className="h-8 text-xs" />
          <Textarea
            value={value.overrides.instructions ?? ''} onChange={setOverride('instructions')} rows={2}
            placeholder="Extra instructions for this campaign only (optional)" className="text-xs sm:col-span-2"
          />
          <p className="text-[10px] text-muted-foreground sm:col-span-2">
            Overrides apply to this campaign only. Everything left blank inherits from
            {selected ? ` "${selected.label}"` : ' your profile'}.
          </p>
        </div>
      )}
    </div>
  );
}
