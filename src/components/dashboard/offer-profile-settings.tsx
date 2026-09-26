'use client';

// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Settings → My Offer
// Lets the user list the services they sell (web development,
// marketing, AI automation, SaaS, …). Stored via
// /api/prospecting/offer-profile → UserSettings.servicesOffered.
// Consumed by STEP 3 (Offer Profile Match) of the prospect pipeline.
// ═══════════════════════════════════════════════════════════════════

import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Plus, Save, Trash2, Briefcase, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { OfferService } from '@/lib/prospecting/types';

const CATEGORY_OPTIONS = [
  { value: 'web', label: 'Web Development' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'ai_automation', label: 'AI Automation' },
  { value: 'saas', label: 'SaaS' },
  { value: 'seo', label: 'SEO' },
  { value: 'social_media', label: 'Social Media' },
  { value: 'ecommerce', label: 'E-Commerce' },
  { value: 'booking_systems', label: 'Booking Systems' },
  { value: 'branding', label: 'Branding & Design' },
  { value: 'consulting', label: 'Consulting' },
  { value: 'general', label: 'Other' },
];

const QUICK_ADD: Array<{ label: string; category: string; description: string }> = [
  {
    label: 'Web Development',
    category: 'web',
    description: 'Modern, mobile-friendly websites that convert visitors into customers',
  },
  {
    label: 'Online Booking System',
    category: 'booking_systems',
    description: '24/7 online appointment booking that stops lead leakage',
  },
  {
    label: 'AI Automation',
    category: 'ai_automation',
    description: 'Automated follow-ups, chatbots and workflows that save staff hours',
  },
  {
    label: 'SEO & Local Search',
    category: 'seo',
    description: 'Rank higher on Google for the searches your customers already make',
  },
  {
    label: 'Digital Marketing',
    category: 'marketing',
    description: 'Targeted ads and campaigns that bring qualified leads',
  },
  {
    label: 'Social Media Management',
    category: 'social_media',
    description: 'Consistent presence and content across the platforms your buyers use',
  },
];

function emptyOffer(): OfferService {
  return {
    id: `offer_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    label: '',
    category: 'general',
    description: '',
  };
}

export default function OfferProfileSettings() {
  const [services, setServices] = useState<OfferService[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/prospecting/offer-profile');
        if (!res.ok) throw new Error('load failed');
        const data = await res.json();
        if (!cancelled) setServices(Array.isArray(data.services) ? data.services : []);
      } catch {
        if (!cancelled) toast.error('Could not load your offer profile');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const save = async (next: OfferService[]) => {
    setSaving(true);
    try {
      const res = await fetch('/api/prospecting/offer-profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ services: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || 'Failed to save offer profile');
        return;
      }
      setServices(next);
      toast.success('Offer profile saved', {
        description: 'The prospect pipeline will now match gaps to these offers.',
      });
    } finally {
      setSaving(false);
    }
  };

  const update = (idx: number, patch: Partial<OfferService>) => {
    setServices((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  };

  const remove = (idx: number) => {
    setServices((prev) => prev.filter((_, i) => i !== idx));
  };

  const quickAddLabel = (label: string) =>
    services.some((s) => s.label.toLowerCase() === label.toLowerCase());

  if (loading) {
    return (
      <Card>
        <CardContent className="pt-6 flex items-center justify-center py-10 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading offer profile…
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Quick add chips */}
      <Card>
        <CardContent className="pt-4 pb-4 space-y-3">
          <p className="text-xs text-muted-foreground">
            Quick add a common offer, then edit the description to match how you sell it:
          </p>
          <div className="flex flex-wrap gap-1.5">
            {QUICK_ADD.map((q) => {
              const added = quickAddLabel(q.label);
              return (
                <Button
                  key={q.label}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1"
                  disabled={added}
                  onClick={() =>
                    setServices((prev) => [
                      ...prev,
                      {
                        id: `offer_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
                        label: q.label,
                        category: q.category,
                        description: q.description,
                      },
                    ])
                  }
                >
                  {added ? <Check className="h-3 w-3" /> : <Plus className="h-3 w-3" />} {q.label}
                </Button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Offer list */}
      {services.length === 0 ? (
        <Card>
          <CardContent className="pt-6 pb-6 text-center space-y-2">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-muted">
              <Briefcase className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">No offers configured yet</p>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              Add at least one service above so the AI prospect pipeline can say
              &ldquo;Company X has gap Y &rarr; you offer Z&rdquo;.
            </p>
          </CardContent>
        </Card>
      ) : (
        services.map((service, idx) => (
          <Card key={service.id || idx}>
            <CardContent className="pt-4 pb-4 space-y-2.5">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase">
                  Offer {idx + 1}
                </span>
                {service.category && (
                  <Badge variant="secondary" className="text-[10px]">
                    {CATEGORY_OPTIONS.find((c) => c.value === service.category)?.label || service.category}
                  </Badge>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 ml-auto"
                  onClick={() => remove(idx)}
                  aria-label={`Remove ${service.label || 'offer'}`}
                >
                  <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                </Button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div className="space-y-1">
                  <label className="text-xs font-medium">Service name</label>
                  <Input
                    value={service.label}
                    onChange={(e) => update(idx, { label: e.target.value })}
                    placeholder="e.g. Web Development"
                    className="h-9"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium">Category</label>
                  <Select
                    value={service.category || 'general'}
                    onValueChange={(v) => update(idx, { category: v })}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORY_OPTIONS.map((c) => (
                        <SelectItem key={c.value} value={c.value}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">One-line description</label>
                <Input
                  value={service.description}
                  onChange={(e) => update(idx, { description: e.target.value })}
                  placeholder="What outcome does the client get?"
                  className="h-9"
                />
              </div>
            </CardContent>
          </Card>
        ))
      )}

      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => setServices((prev) => [...prev, emptyOffer()])}
          disabled={services.length >= 20}
        >
          <Plus className="h-3.5 w-3.5" /> Add custom offer
        </Button>
        <Button size="sm" className="gap-1.5" onClick={() => save(services)} disabled={saving}>
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Save Offer Profile
        </Button>
      </div>
    </div>
  );
}
