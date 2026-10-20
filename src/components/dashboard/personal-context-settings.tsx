'use client';

// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Settings → My Context (User Preference / Personal
// Business Context)
//
// A DISTINCT user-context capability — NOT the Business Profile system
// and NOT the "My Offer" list. Here the user describes THEMSELVES (what
// they do, their business, interests, expertise, goals, target audience,
// positioning, communication preferences). Stored via
// /api/settings/personal-context → UserSettings.personalContext.
// Consumed by AI features (workflow generation, personalized outreach,
// lead analysis) through src/lib/personal-context.ts.
// ═══════════════════════════════════════════════════════════════════

import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Save, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { PersonalContext } from '@/lib/personal-context';

type ContextState = Partial<Record<keyof PersonalContext, string>>;

const FIELDS: Array<{
  key: keyof PersonalContext;
  label: string;
  placeholder: string;
  maxLength: number;
  multiline?: boolean;
}> = [
  {
    key: 'whatYouDo',
    label: 'What I do',
    placeholder: 'e.g. I help local restaurants get more bookings through digital marketing',
    maxLength: 300,
  },
  {
    key: 'business',
    label: 'My business / service',
    placeholder: 'Describe your business, what you sell, and who you serve',
    maxLength: 1000,
    multiline: true,
  },
  {
    key: 'services',
    label: 'Products & services',
    placeholder: 'List your main products or services',
    maxLength: 1000,
    multiline: true,
  },
  {
    key: 'interests',
    label: 'Interests & focus areas',
    placeholder: 'e.g. hospitality tech, local SEO, automation',
    maxLength: 500,
  },
  {
    key: 'expertise',
    label: 'Expertise',
    placeholder: 'e.g. 10 years in B2B SaaS sales, Google Ads certified',
    maxLength: 500,
    multiline: true,
  },
  {
    key: 'goals',
    label: 'Current goals',
    placeholder: 'e.g. sign 5 new retainer clients this quarter',
    maxLength: 500,
    multiline: true,
  },
  {
    key: 'targetAudience',
    label: 'Target audience',
    placeholder: 'e.g. independent restaurant owners in tier-2 cities',
    maxLength: 500,
    multiline: true,
  },
  {
    key: 'positioning',
    label: 'Positioning & differentiators',
    placeholder: 'Why clients choose you over alternatives',
    maxLength: 500,
    multiline: true,
  },
  {
    key: 'communicationContext',
    label: 'Communication preferences',
    placeholder: 'e.g. friendly but professional tone; short emails; avoid jargon',
    maxLength: 500,
    multiline: true,
  },
  {
    key: 'notes',
    label: 'Anything else the AI should know',
    placeholder: 'Optional extra context used when generating workflows, outreach and analysis',
    maxLength: 1000,
    multiline: true,
  },
];

export default function PersonalContextSettings() {
  const [context, setContext] = useState<ContextState>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/settings/personal-context');
        if (!res.ok) throw new Error('load failed');
        const data = await res.json();
        if (!cancelled) setContext(data.context && typeof data.context === 'object' ? data.context : {});
      } catch {
        if (!cancelled) toast.error('Could not load your personal context');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/settings/personal-context', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const details = Array.isArray(data.details) && data.details.length > 0 ? ` — ${data.details[0]}` : '';
        toast.error((data.error || 'Failed to save personal context') + details);
        return;
      }
      toast.success('Personal context saved', {
        description:
          'AI workflow generation, personalized outreach and lead analysis will now use this context.',
      });
    } finally {
      setSaving(false);
    }
  };

  const update = (key: keyof PersonalContext, value: string) => {
    setContext((prev) => ({ ...prev, [key]: value }));
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="pt-6 flex items-center justify-center py-10 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading personal context…
        </CardContent>
      </Card>
    );
  }

  const filledCount = FIELDS.filter((f) => (context[f.key] || '').trim().length > 0).length;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-4 pb-4 flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted">
            <UserRound className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="text-xs text-muted-foreground space-y-1">
            <p>
              Tell AcquisitionOS about <span className="font-medium text-foreground">yourself</span> —
              what you do, your services, goals and how you like to communicate. This is your
              personal AI context.
            </p>
            <p>
              It is used when generating AI workflows, personalized outreach, lead analysis and
              recommendations. It is separate from Business Profiles and from &ldquo;My
              Offer&rdquo;.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4 pb-4 space-y-3.5">
          {FIELDS.map((field) => (
            <div key={field.key} className="space-y-1">
              <label className="text-xs font-medium" htmlFor={`personal-context-${field.key}`}>
                {field.label}
                <span className="ml-1.5 font-normal text-muted-foreground">
                  ({(context[field.key] || '').length}/{field.maxLength})
                </span>
              </label>
              {field.multiline ? (
                <Textarea
                  id={`personal-context-${field.key}`}
                  value={context[field.key] || ''}
                  onChange={(e) => update(field.key, e.target.value)}
                  placeholder={field.placeholder}
                  maxLength={field.maxLength}
                  rows={2}
                  className="min-h-[60px] resize-y"
                />
              ) : (
                <Input
                  id={`personal-context-${field.key}`}
                  value={context[field.key] || ''}
                  onChange={(e) => update(field.key, e.target.value)}
                  placeholder={field.placeholder}
                  maxLength={field.maxLength}
                  className="h-9"
                />
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {filledCount === 0
            ? 'Fill in at least one field so the AI can personalize for you.'
            : `${filledCount} of ${FIELDS.length} fields filled — the more context, the better the personalization.`}
        </p>
        <Button size="sm" className="gap-1.5" onClick={save} disabled={saving}>
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Save My Context
        </Button>
      </div>
    </div>
  );
}
