'use client';

// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Settings → Business Profiles
// Create / edit / select / archive multiple user-owned business profiles.
// The selected profile is the DEFAULT business context for discovery,
// website research and outreach (campaign overrides on top — see
// src/lib/business-profile.ts resolveBusinessContext).
// ═══════════════════════════════════════════════════════════════════

import React, { useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';
import {
  Loader2, Plus, Save, Trash2, Building2, Star, Pencil, X, ChevronDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  fetchBusinessProfiles, createBusinessProfile, updateBusinessProfile, archiveBusinessProfile,
  type BusinessProfile,
} from '@/lib/business-profile';
import { useSubscriptionStore } from '@/lib/subscription-store';
import {
  BUSINESS_PROFILE_LIMITS,
  PLAN_TIER_LABELS,
  nextProfileLimitPlan,
  toPlanTier,
} from '@/lib/plan-feature-limits';

type Draft = {
  label: string;
  companyName: string;
  industry: string;
  website: string;
  description: string;
  valueProposition: string;
  productsServices: string; // one per line: "Name — description"
  targetIndustries: string; // comma-separated
  targetRoles: string; // comma-separated
  icp: string;
  serviceAreas: string; // comma-separated
  goals: string;
  toneStyle: string;
  language: string;
  differentiators: string; // one per line
  preferredCta: string;
  additionalContext: string;
};

const EMPTY_DRAFT: Draft = {
  label: '', companyName: '', industry: '', website: '', description: '',
  valueProposition: '', productsServices: '', targetIndustries: '', targetRoles: '',
  icp: '', serviceAreas: '', goals: '', toneStyle: '', language: '',
  differentiators: '', preferredCta: '', additionalContext: '',
};

function profileToDraft(p: BusinessProfile): Draft {
  return {
    label: p.label || '',
    companyName: p.companyName || '',
    industry: p.industry || '',
    website: p.website || '',
    description: p.description || '',
    valueProposition: p.valueProposition || '',
    productsServices: p.productsServices.map((s) => (s.description ? `${s.name} — ${s.description}` : s.name)).join('\n'),
    targetIndustries: (p.targetAudience.industries || []).join(', '),
    targetRoles: (p.targetAudience.roles || []).join(', '),
    icp: p.targetAudience.icp || '',
    serviceAreas: p.serviceAreas.join(', '),
    goals: p.goals || '',
    toneStyle: p.toneStyle || '',
    language: p.language || '',
    differentiators: p.differentiators.join('\n'),
    preferredCta: p.preferredCta || '',
    additionalContext: p.additionalContext || '',
  };
}

function draftToPayload(d: Draft) {
  const lines = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean);
  const csv = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);
  return {
    label: d.label,
    companyName: d.companyName || null,
    industry: d.industry || null,
    website: d.website || null,
    description: d.description || null,
    valueProposition: d.valueProposition || null,
    productsServices: lines(d.productsServices).map((line) => {
      const idx = line.indexOf(' — ') !== -1 ? line.indexOf(' — ') : line.indexOf(' - ');
      return idx > 0
        ? { name: line.slice(0, idx), description: line.slice(idx + 3) }
        : { name: line };
    }),
    targetAudience: { industries: csv(d.targetIndustries), roles: csv(d.targetRoles), icp: d.icp },
    serviceAreas: csv(d.serviceAreas),
    goals: d.goals || null,
    toneStyle: d.toneStyle || null,
    language: d.language || null,
    differentiators: lines(d.differentiators),
    preferredCta: d.preferredCta || null,
    additionalContext: d.additionalContext || null,
  };
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

export default function BusinessProfilesSettings() {
  const [profiles, setProfiles] = useState<BusinessProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null); // null = closed, 'new' = creating
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<BusinessProfile | null>(null);
  const [expanded, setExpanded] = useState(false);

  // Plan Eligibility Correction: active profiles are capped per plan
  // (Free 1 · Starter 1 · Pro 3 · Elite 7). The meter below is advisory —
  // the server-side POST /api/business-profiles check is authoritative.
  const currentPlan = useSubscriptionStore((s) => s.currentPlan);
  const planTier = toPlanTier(currentPlan);
  const profileLimit = BUSINESS_PROFILE_LIMITS[planTier];
  const atProfileLimit = profiles.length >= profileLimit;
  const upgradePlan = nextProfileLimitPlan(planTier);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setProfiles(await fetchBusinessProfiles());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load profiles');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const startCreate = () => { setDraft(EMPTY_DRAFT); setEditingId('new'); setExpanded(true); };
  const startEdit = (p: BusinessProfile) => { setDraft(profileToDraft(p)); setEditingId(p.id); setExpanded(true); };
  const closeEditor = () => { setEditingId(null); setExpanded(false); };

  const save = async () => {
    if (!draft.label.trim()) { toast.error('Profile name is required'); return; }
    setSaving(true);
    try {
      const payload = draftToPayload(draft);
      if (editingId === 'new') {
        await createBusinessProfile(payload);
        toast.success('Business profile created');
      } else if (editingId) {
        await updateBusinessProfile(editingId, payload);
        toast.success('Business profile updated');
      }
      closeEditor();
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  const setDefault = async (p: BusinessProfile) => {
    try {
      await updateBusinessProfile(p.id, { isDefault: true } as Partial<BusinessProfile>);
      toast.success(`"${p.label}" is now the default profile`);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to set default');
    }
  };

  const doArchive = async () => {
    if (!deleteTarget) return;
    try {
      await archiveBusinessProfile(deleteTarget.id);
      toast.success(`"${deleteTarget.label}" archived`);
      setDeleteTarget(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to archive profile');
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading profiles…
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          The selected profile tells the AI what your business offers, who you target and how to
          communicate — for discovery, website research and outreach. Campaigns can override
          individual fields.
        </p>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <div className="flex items-center gap-2">
            <span
              className="text-xs text-muted-foreground whitespace-nowrap"
              aria-live="polite"
              data-testid="profile-limit-meter"
            >
              {profiles.length}/{profileLimit} active · {PLAN_TIER_LABELS[planTier]} plan
            </span>
            <Button
              size="sm"
              onClick={startCreate}
              disabled={atProfileLimit}
              className="gap-1.5"
              aria-label={atProfileLimit ? 'Profile limit reached — archive one or upgrade to create' : 'Create a new business profile'}
            >
              <Plus className="h-3.5 w-3.5" /> New Profile
            </Button>
          </div>
          {atProfileLimit && upgradePlan && (
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent('open-upgrade-modal'))}
              className="text-xs text-primary underline underline-offset-2 hover:text-primary/80"
            >
              Limit reached — upgrade to {PLAN_TIER_LABELS[upgradePlan]} for up to{' '}
              {BUSINESS_PROFILE_LIMITS[upgradePlan]} active profiles
            </button>
          )}
        </div>
      </div>

      {profiles.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-10 text-center">
            <Building2 className="h-10 w-10 text-muted-foreground/40 mb-3" />
            <p className="font-medium mb-1">No business profiles yet</p>
            <p className="text-sm text-muted-foreground mb-4 max-w-sm">
              Create a profile so outreach is written from YOUR business — not a generic template.
            </p>
            <Button size="sm" onClick={startCreate} disabled={atProfileLimit && profiles.length > 0} className="gap-1.5"><Plus className="h-3.5 w-3.5" /> Create your first profile</Button>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {profiles.map((p) => (
          <Card key={p.id} className={p.isDefault ? 'border-primary/40' : ''}>
            <CardContent className="py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium truncate">{p.label}</span>
                    {p.isDefault && (
                      <Badge className="text-[10px] bg-primary/10 text-primary border-primary/30">
                        <Star className="h-2.5 w-2.5 mr-0.5" /> Default
                      </Badge>
                    )}
                    {p.industry && <Badge variant="secondary" className="text-[10px]">{p.industry}</Badge>}
                  </div>
                  {(p.description || p.companyName) && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                      {p.companyName && p.companyName !== p.label ? `${p.companyName} · ` : ''}{p.description}
                    </p>
                  )}
                  {p.productsServices.length > 0 && (
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Offers: {p.productsServices.map((s) => s.name).join(', ')}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {!p.isDefault && (
                    <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setDefault(p)} title="Set as default">
                      <Star className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => startEdit(p)} title="Edit">
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost" size="sm" className="h-8 text-xs text-destructive"
                    onClick={() => setDeleteTarget(p)} title="Archive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              {editingId === p.id && expanded && (
                <ProfileEditor
                  draft={draft} setDraft={setDraft} saving={saving}
                  onSave={save} onCancel={closeEditor}
                />
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {editingId === 'new' && expanded && (
        <Card className="border-primary/40">
          <CardContent className="py-4">
            <div className="flex items-center justify-between mb-3">
              <span className="font-medium text-sm">New business profile</span>
              <Button variant="ghost" size="sm" className="h-8" onClick={closeEditor}><X className="h-4 w-4" /></Button>
            </div>
            <ProfileEditor draft={draft} setDraft={setDraft} saving={saving} onSave={save} onCancel={closeEditor} />
          </CardContent>
        </Card>
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive &quot;{deleteTarget?.label}&quot;?</AlertDialogTitle>
            <AlertDialogDescription>
              The profile is hidden from pickers and campaigns. History and any campaigns that used
              it are preserved. You can create a new profile at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={doArchive}>
              Archive
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ProfileEditor({
  draft, setDraft, saving, onSave, onCancel,
}: {
  draft: Draft;
  setDraft: React.Dispatch<React.SetStateAction<Draft>>;
  saving: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  const set = (k: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setDraft((d) => ({ ...d, [k]: e.target.value }));
  const [showAll, setShowAll] = useState(false);

  return (
    <div className="space-y-3 mt-3">
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Profile name *">
          <Input value={draft.label} onChange={set('label')} placeholder="e.g. Wellness Studio" />
        </Field>
        <Field label="Company / trading name">
          <Input value={draft.companyName} onChange={set('companyName')} placeholder="e.g. Serenity Wellness Ltd" />
        </Field>
        <Field label="Industry">
          <Input value={draft.industry} onChange={set('industry')} placeholder="e.g. Health & Wellness" />
        </Field>
        <Field label="Website">
          <Input value={draft.website} onChange={set('website')} placeholder="https://…" />
        </Field>
      </div>
      <Field label="What does the business do?">
        <Textarea value={draft.description} onChange={set('description')} rows={2} placeholder="Products, services, company details…" />
      </Field>
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Value proposition">
          <Textarea value={draft.valueProposition} onChange={set('valueProposition')} rows={2} placeholder="Why customers choose you…" />
        </Field>
        <Field label="Business goals / preferred outreach outcomes">
          <Textarea value={draft.goals} onChange={set('goals')} rows={2} placeholder="e.g. Book discovery calls with clinic managers…" />
        </Field>
      </div>
      <Field label="Products / services / offers (one per line: Name — description)">
        <Textarea value={draft.productsServices} onChange={set('productsServices')} rows={3} placeholder={'Corporate massage packages — on-site for offices\nPhysiotherapy sessions — 1:1 treatment'} />
      </Field>

      {!showAll ? (
        <Button variant="ghost" size="sm" className="text-xs" onClick={() => setShowAll(true)}>
          <ChevronDown className="h-3.5 w-3.5 mr-1" /> More options (audience, areas, tone, CTA…)
        </Button>
      ) : (
        <div className="space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Target industries (comma-separated)">
              <Input value={draft.targetIndustries} onChange={set('targetIndustries')} placeholder="hospitals, corporate offices" />
            </Field>
            <Field label="Target roles (comma-separated)">
              <Input value={draft.targetRoles} onChange={set('targetRoles')} placeholder="HR managers, practice owners" />
            </Field>
            <Field label="Ideal customer profile">
              <Input value={draft.icp} onChange={set('icp')} placeholder="e.g. mid-size clinics in metro areas" />
            </Field>
            <Field label="Geographic service areas (comma-separated)">
              <Input value={draft.serviceAreas} onChange={set('serviceAreas')} placeholder="Mumbai, Pune, remote" />
            </Field>
            <Field label="Communication tone / style">
              <Input value={draft.toneStyle} onChange={set('toneStyle')} placeholder="e.g. warm, professional, no hype" />
            </Field>
            <Field label="Outreach language">
              <Input value={draft.language} onChange={set('language')} placeholder="e.g. English" />
            </Field>
          </div>
          <Field label="Differentiators / proof points (one per line)">
            <Textarea value={draft.differentiators} onChange={set('differentiators')} rows={2} placeholder={'12 years serving 40+ clinics\nCertified practitioners'} />
          </Field>
          <Field label="Preferred call to action">
            <Input value={draft.preferredCta} onChange={set('preferredCta')} placeholder="e.g. book a 15-minute intro call" />
          </Field>
          <Field label="Additional context / custom instructions">
            <Textarea value={draft.additionalContext} onChange={set('additionalContext')} rows={2} placeholder="Anything else the AI should know when writing for this business…" />
          </Field>
        </div>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <Button variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
        <Button size="sm" onClick={onSave} disabled={saving} className="gap-1.5">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Save Profile
        </Button>
      </div>
    </div>
  );
}
