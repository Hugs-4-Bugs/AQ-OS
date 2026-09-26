'use client';

// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Support Ticket Form (shared, client)
//
// ONE real submission flow used everywhere:
//   • the SupportRequestDialog (opened from the pricing modal /
//     billing page / knowledge-base escalation buttons)
//   • the /support/new standalone page
//
// Submits POST /api/support/tickets. On success shows the generated
// ticket reference number. NO mock submissions, NO fake toasts.
// ═══════════════════════════════════════════════════════════════════

import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Send, CheckCircle2, AlertCircle, LifeBuoy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import {
  SUPPORT_CATEGORIES,
  PRIORITY_LABELS,
  findCategory,
} from '@/lib/support-constants';

export interface SupportTicketFormPrefill {
  category?: string;
  subcategory?: string | null;
  subject?: string;
  currentPlan?: string | null;
  requestedPlan?: string | null;
  billingCycle?: string | null;
  priority?: string;
  source?: string;
  /** Hidden context stored on the ticket (e.g. kb article slug / search query). */
  metadata?: Record<string, unknown>;
}

interface Props extends SupportTicketFormPrefill {
  /** Called after successful submission with the created ticket. */
  onSubmitted?: (ticket: { id: string; ticketNumber: string; subject: string }) => void;
  /** Hide the built-in success screen (the host renders its own). */
  hideSuccessScreen?: boolean;
}

const PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const;

export default function SupportTicketForm({
  category: prefillCategory,
  subcategory: prefillSubcategory,
  subject: prefillSubject,
  currentPlan,
  requestedPlan,
  billingCycle,
  priority: prefillPriority = 'NORMAL',
  source = 'support_center',
  metadata,
  onSubmitted,
  hideSuccessScreen = false,
}: Props) {
  const validPrefill = findCategory(prefillCategory || '')?.value;
  const [category, setCategory] = useState<string>(validPrefill || '');
  const [subcategory, setSubcategory] = useState<string>(prefillSubcategory || '');
  const [subject, setSubject] = useState(prefillSubject || '');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<string>(
    PRIORITIES.includes(prefillPriority as never) ? prefillPriority : 'NORMAL',
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState<{
    id: string;
    ticketNumber: string;
    subject: string;
  } | null>(null);

  const categoryInfo = useMemo(() => findCategory(category), [category]);

  // Reset subcategory when the category changes and no prefill matches.
  useEffect(() => {
    if (category && prefillSubcategory) {
      const ok = findCategory(category)?.subcategories.some(
        (s) => s.value === prefillSubcategory,
      );
      if (ok) setSubcategory(prefillSubcategory);
    }
  }, [category]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!category) {
      setError('Please choose a category.');
      return;
    }
    if (subject.trim().length < 5) {
      setError('Please add a subject (at least 5 characters).');
      return;
    }
    if (description.trim().length < 20) {
      setError('Please describe your issue in at least 20 characters.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/support/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          category,
          subcategory: subcategory || null,
          subject: subject.trim(),
          description: description.trim(),
          priority,
          requestedPlan: requestedPlan || null,
          billingCycle: billingCycle || null,
          source,
          metadata,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const msg = data.error || 'Failed to submit your request. Please try again.';
        setError(msg);
        return;
      }

      setCreated(data.ticket);
      toast.success(`Your support request has been submitted. Reference: ${data.ticket.ticketNumber}`);
      onSubmitted?.(data.ticket);
    } catch {
      setError('Network error. Please check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Success screen with the generated reference number ───────────
  if (created && !hideSuccessScreen) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-8 text-center px-4">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10">
          <CheckCircle2 className="h-6 w-6 text-emerald-500" />
        </span>
        <h3 className="text-lg font-bold text-foreground">Your support request has been submitted.</h3>
        <p className="text-sm text-muted-foreground max-w-sm">
          Our support team will reply to your ticket. You will be notified in the app when they respond.
        </p>
        <div className="mt-1 rounded-lg border border-border bg-muted/40 px-4 py-2.5">
          <p className="text-xs text-muted-foreground">Your reference number</p>
          <p className="font-mono text-base font-bold text-foreground select-all">{created.ticketNumber}</p>
        </div>
        <div className="mt-2 flex flex-col sm:flex-row gap-2 w-full max-w-xs">
          <Button asChild className="flex-1">
            <a href={`/support/tickets/${created.id}`}>View your ticket</a>
          </Button>
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => {
              setCreated(null);
              setSubject('');
              setDescription('');
              setPriority('NORMAL');
            }}
          >
            Submit another request
          </Button>
        </div>
      </div>
    );
  }

  // ─── Form ─────────────────────────────────────────────────────────
  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      {prefillCategory === 'billing' && prefillSubcategory === 'downgrade_plan' && (
        <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
          <p className="flex items-start gap-2 text-muted-foreground">
            <LifeBuoy className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span>
              Downgrade requests are processed by our support team through the official
              subscription flow. Your subscription is <strong className="text-foreground">not</strong> changed
              by submitting this form.
            </span>
          </p>
        </div>
      )}

      {/* Category + subcategory */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5 min-w-0">
          <Label htmlFor="st-category">Category *</Label>
          <Select value={category} onValueChange={(v) => { setCategory(v); setSubcategory(''); }}>
            <SelectTrigger id="st-category" className="w-full" aria-label="Support category">
              <SelectValue placeholder="Select a category" />
            </SelectTrigger>
            <SelectContent>
              {SUPPORT_CATEGORIES.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5 min-w-0">
          <Label htmlFor="st-subcategory">Subcategory</Label>
          <Select
            value={subcategory || 'none'}
            onValueChange={(v) => setSubcategory(v === 'none' ? '' : v)}
            disabled={!category}
          >
            <SelectTrigger id="st-subcategory" className="w-full" aria-label="Support subcategory">
              <SelectValue placeholder={category ? 'Select (optional)' : 'Choose a category first'} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Not applicable</SelectItem>
              {categoryInfo?.subcategories.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Plan context (read-only, from the pricing flow) */}
      {(currentPlan || requestedPlan) && (
        <div className="flex flex-wrap gap-2 text-xs" aria-label="Plan context">
          {currentPlan && (
            <span className="rounded-md border border-border bg-muted/40 px-2 py-1 text-muted-foreground">
              Current plan: <strong className="text-foreground capitalize">{currentPlan}</strong>
            </span>
          )}
          {requestedPlan && (
            <span className="rounded-md border border-border bg-muted/40 px-2 py-1 text-muted-foreground">
              Requested plan: <strong className="text-foreground capitalize">{requestedPlan}</strong>
            </span>
          )}
          {billingCycle && (
            <span className="rounded-md border border-border bg-muted/40 px-2 py-1 text-muted-foreground">
              Billing cycle: <strong className="text-foreground capitalize">{billingCycle}</strong>
            </span>
          )}
        </div>
      )}

      {/* Subject */}
      <div className="space-y-1.5">
        <Label htmlFor="st-subject">Subject *</Label>
        <Input
          id="st-subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Briefly describe the issue"
          maxLength={200}
          required
        />
      </div>

      {/* Description */}
      <div className="space-y-1.5">
        <Label htmlFor="st-description">Description *</Label>
        <Textarea
          id="st-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Tell us what happened, what you expected and when it occurred. The more detail, the faster we can help."
          rows={5}
          maxLength={10000}
          required
          className="resize-y min-h-[110px]"
        />
        <p className="text-[11px] text-muted-foreground">{description.length}/10,000</p>
      </div>

      {/* Priority */}
      <div className="space-y-1.5">
        <Label htmlFor="st-priority">Priority</Label>
        <Select value={priority} onValueChange={setPriority}>
          <SelectTrigger id="st-priority" className="w-full sm:w-56" aria-label="Ticket priority">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PRIORITIES.map((p) => (
              <SelectItem key={p} value={p}>
                {PRIORITY_LABELS[p]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Error */}
      {error && (
        <p className="flex items-start gap-1.5 text-sm text-red-500" role="alert">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </p>
      )}

      {/* Submit */}
      <Button type="submit" className="w-full gap-2" disabled={submitting}>
        {submitting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Submitting...
          </>
        ) : (
          <>
            <Send className="h-4 w-4" />
            Submit request
          </>
        )}
      </Button>
      <p className="text-[11px] text-muted-foreground text-center">
        Only you and our support team can see this ticket.
      </p>
    </form>
  );
}
