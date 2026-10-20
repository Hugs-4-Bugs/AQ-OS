'use client';

// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Settings → Business Profiles (multi-profile per user)
//
// A DISTINCT capability — NOT the user's Personal Context ("My Context")
// and NOT the "My Offer" service list. A Business Profile describes ONE
// business/niche the user operates: industry, offers, target market,
// goals, tone, CTA, custom instructions. Users can create, view, edit,
// archive and delete profiles. ACTIVE profiles are limited by plan
// (free=1, starter=1, pro=3, elite=7) — enforced SERVER-SIDE via
// /api/business-profiles + the canonical entitlement service. Downgrades
// never delete profiles.
// ═══════════════════════════════════════════════════════════════════

import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Archive,
  ArchiveRestore,
  Building2,
  Loader2,
  Pencil,
  Plus,
  Save,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface BusinessProfile {
  id: string;
  name: string;
  status: string;
  [key: string]: unknown;
}

type ProfileForm = Record<string, string>;

const EMPTY_FORM: ProfileForm = {
  name: '',
  industry: '',
  description: '',
  productsServices: '',
  offers: '',
  valueProposition: '',
  targetAudience: '',
  targetIndustries: '',
  targetRoles: '',
  geographicMarket: '',
  painPoints: '',
  businessGoals: '',
  differentiators: '',
  proofPoints: '',
  preferredTone: '',
  preferredLanguage: '',
  cta: '',
  commercialConstraints: '',
  customInstructions: '',
  researchPreferences: '',
  outreachPreferences: '',
};

const FIELD_GROUPS: Array<{
  title: string;
  fields: Array<{ key: string; label: string; placeholder: string; multiline?: boolean; maxLength?: number }>;
}> = [
  {
    title: 'Identity',
    fields: [
      { key: 'name', label: 'Profile name', placeholder: 'e.g. Dental Clinic Outreach — Mumbai', maxLength: 100 },
      { key: 'industry', label: 'Industry / niche', placeholder: 'e.g. healthcare, SaaS, hospitality', maxLength: 200 },
      { key: 'description', label: 'Business description', placeholder: 'What this business does and who it serves', multiline: true },
    ],
  },
  {
    title: 'Offering',
    fields: [
      { key: 'productsServices', label: 'Products / services', placeholder: 'Main products or services offered', multiline: true },
      { key: 'offers', label: 'Current offers', placeholder: 'e.g. free audit, 20% first-month discount', multiline: true },
      { key: 'valueProposition', label: 'Value proposition', placeholder: 'Why customers should choose this business', multiline: true },
    ],
  },
  {
    title: 'Target market',
    fields: [
      { key: 'targetAudience', label: 'Target audience', placeholder: 'e.g. clinic owners with 2-10 staff', multiline: true },
      { key: 'targetIndustries', label: 'Target industries', placeholder: 'Industries to focus on for acquisition', maxLength: 300 },
      { key: 'targetRoles', label: 'Target roles', placeholder: 'e.g. owner, practice manager, marketing head', maxLength: 300 },
      { key: 'geographicMarket', label: 'Geographic market', placeholder: 'e.g. Mumbai + Pune, India', maxLength: 300 },
    ],
  },
  {
    title: 'Strategy & proof',
    fields: [
      { key: 'painPoints', label: 'Customer pain points addressed', placeholder: 'The problems this business solves', multiline: true },
      { key: 'businessGoals', label: 'Business goals', placeholder: 'e.g. 10 new clients/quarter', multiline: true },
      { key: 'differentiators', label: 'Differentiators', placeholder: 'What sets this business apart', multiline: true },
      { key: 'proofPoints', label: 'Proof points', placeholder: 'e.g. case studies, certifications, results', multiline: true },
    ],
  },
  {
    title: 'Communication & instructions',
    fields: [
      { key: 'preferredTone', label: 'Preferred tone', placeholder: 'e.g. warm, professional, no hype', maxLength: 200 },
      { key: 'preferredLanguage', label: 'Preferred language', placeholder: 'e.g. English, Hindi, or both', maxLength: 100 },
      { key: 'cta', label: 'Call to action', placeholder: 'e.g. book a 15-minute discovery call', maxLength: 300 },
      { key: 'commercialConstraints', label: 'Commercial constraints', placeholder: 'e.g. min project size, discount limits', multiline: true },
      { key: 'customInstructions', label: 'Custom instructions for discovery / outreach', placeholder: 'Anything the AI should always follow for this profile', multiline: true },
      { key: 'researchPreferences', label: 'Research preferences', placeholder: 'e.g. prioritize websites without online booking', multiline: true },
      { key: 'outreachPreferences', label: 'Outreach preferences', placeholder: 'e.g. email first, follow up after 3 days', multiline: true },
    ],
  },
];

export default function BusinessProfileSettings() {
  const [profiles, setProfiles] = useState<BusinessProfile[]>([]);
  const [activeCount, setActiveCount] = useState(0);
  const [planLimit, setPlanLimit] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  /** null = list view; 'new' = creating; profile id = editing that profile */
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<ProfileForm>({ ...EMPTY_FORM });

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/business-profiles');
      if (!res.ok) throw new Error('load failed');
      const data = await res.json();
      setProfiles(Array.isArray(data.profiles) ? data.profiles : []);
      setActiveCount(typeof data.activeCount === 'number' ? data.activeCount : 0);
      setPlanLimit(typeof data.planLimit === 'number' ? data.planLimit : null);
    } catch {
      toast.error('Could not load business profiles');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const startNew = () => {
    setForm({ ...EMPTY_FORM });
    setEditing('new');
  };

  const startEdit = (p: BusinessProfile) => {
    const next: ProfileForm = { ...EMPTY_FORM };
    for (const key of Object.keys(EMPTY_FORM)) {
      const v = p[key];
      if (typeof v === 'string') next[key] = v;
    }
    setForm(next);
    setEditing(p.id);
  };

  const save = async () => {
    if (!form.name.trim()) {
      toast.error('Profile name is required');
      return;
    }
    setSaving(true);
    try {
      const isNew = editing === 'new';
      const res = await fetch(
        isNew ? '/api/business-profiles' : `/api/business-profiles/${editing}`,
        {
          method: isNew ? 'POST' : 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || 'Failed to save business profile');
        return;
      }
      toast.success(isNew ? 'Business profile created' : 'Business profile saved', {
        description: 'Discovery, workflows and outreach can now use this profile.',
      });
      setEditing(null);
      await load();
    } finally {
      setSaving(false);
    }
  };

  const setStatus = async (p: BusinessProfile, status: 'active' | 'archived') => {
    try {
      const res = await fetch(`/api/business-profiles/${p.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || 'Failed to update profile');
        return;
      }
      toast.success(status === 'archived' ? 'Profile archived' : 'Profile activated');
      await load();
    } catch {
      toast.error('Failed to update profile');
    }
  };

  const remove = async (p: BusinessProfile) => {
    if (!window.confirm(`Delete profile "${p.name}"? Workflows using it keep running without it.`)) return;
    try {
      const res = await fetch(`/api/business-profiles/${p.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || 'Failed to delete profile');
        return;
      }
      toast.success('Profile deleted');
      if (editing === p.id) setEditing(null);
      await load();
    } catch {
      toast.error('Failed to delete profile');
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="pt-6 flex items-center justify-center py-10 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading business profiles…
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-4 pb-4 flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted">
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="text-xs text-muted-foreground space-y-1 flex-1">
            <p>
              Business Profiles describe <span className="font-medium text-foreground">each business/niche you operate</span> —
              offers, target market, tone and instructions. They are separate from your
              personal context (&ldquo;My Context&rdquo;) and from &ldquo;My Offer&rdquo;.
            </p>
            <p>
              Select a profile on the Discover page to drive discovery, and associate it with
              workflows. {planLimit !== null && (
                <>Active profiles: <span className="font-medium text-foreground">{activeCount}/{planLimit}</span> on your plan.</>
              )}
            </p>
          </div>
          {editing === null && (
            <Button size="sm" className="gap-1.5 shrink-0" onClick={startNew}>
              <Plus className="h-3.5 w-3.5" /> New profile
            </Button>
          )}
        </CardContent>
      </Card>

      {/* ── Profile list ── */}
      {editing === null && (
        <div className="space-y-2">
          {profiles.length === 0 && (
            <Card>
              <CardContent className="pt-6 pb-6 text-center text-sm text-muted-foreground">
                No business profiles yet. Create one so discovery and workflows can use your
                business context.
              </CardContent>
            </Card>
          )}
          {profiles.map((p) => (
            <Card key={p.id} className={cn(p.status !== 'active' && 'opacity-70')}>
              <CardContent className="pt-3 pb-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate">{p.name}</p>
                    <Badge
                      variant="outline"
                      className={cn(
                        'text-[9px]',
                        p.status === 'active'
                          ? 'border-emerald-500/30 text-emerald-600'
                          : 'border-muted-foreground/30 text-muted-foreground'
                      )}
                    >
                      {p.status}
                    </Badge>
                  </div>
                  {typeof p.industry === 'string' && p.industry && (
                    <p className="text-xs text-muted-foreground truncate">{p.industry}</p>
                  )}
                </div>
                <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Edit ${p.name}`} onClick={() => startEdit(p)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                {p.status === 'active' ? (
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" aria-label={`Archive ${p.name}`} onClick={() => setStatus(p, 'archived')}>
                    <Archive className="h-3.5 w-3.5" />
                  </Button>
                ) : (
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" aria-label={`Activate ${p.name}`} onClick={() => setStatus(p, 'active')}>
                    <ArchiveRestore className="h-3.5 w-3.5" />
                  </Button>
                )}
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" aria-label={`Delete ${p.name}`} onClick={() => remove(p)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ── Create / edit form ── */}
      {editing !== null && (
        <Card>
          <CardContent className="pt-4 pb-4 space-y-5">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold">
                {editing === 'new' ? 'New business profile' : 'Edit business profile'}
              </h4>
              <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>Cancel</Button>
            </div>
            {FIELD_GROUPS.map((group) => (
              <div key={group.title} className="space-y-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {group.title}
                </p>
                {group.fields.map((field) => (
                  <div key={field.key} className="space-y-1">
                    <label className="text-xs font-medium" htmlFor={`bp-${field.key}`}>
                      {field.label}
                    </label>
                    {field.multiline ? (
                      <Textarea
                        id={`bp-${field.key}`}
                        value={form[field.key] || ''}
                        onChange={(e) => setForm((prev) => ({ ...prev, [field.key]: e.target.value }))}
                        placeholder={field.placeholder}
                        maxLength={field.maxLength ?? 2000}
                        rows={2}
                        className="min-h-[60px] resize-y"
                      />
                    ) : (
                      <Input
                        id={`bp-${field.key}`}
                        value={form[field.key] || ''}
                        onChange={(e) => setForm((prev) => ({ ...prev, [field.key]: e.target.value }))}
                        placeholder={field.placeholder}
                        maxLength={field.maxLength ?? 2000}
                        className="h-9"
                      />
                    )}
                  </div>
                ))}
              </div>
            ))}
            <div className="flex justify-end">
              <Button size="sm" className="gap-1.5" onClick={save} disabled={saving}>
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                {editing === 'new' ? 'Create profile' : 'Save changes'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
