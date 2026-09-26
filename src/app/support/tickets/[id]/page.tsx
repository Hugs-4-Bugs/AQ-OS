'use client';

// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Support Ticket Detail (/support/tickets/[id])
//
// Real conversation UI backed by the API (NOT local state):
//   • reads ticket + messages from GET /api/support/tickets/[id]
//   • replies via POST /api/support/tickets/[id]/messages
//   • close / reopen via PATCH (owner transitions only)
//   • refresh preserves the conversation (persisted in the DB)
//
// AUTHORIZATION: the API returns 404 for tickets the caller does not
// own — the page shows "Ticket not found" instead of leaking access.
// ═══════════════════════════════════════════════════════════════════

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  ArrowLeft,
  Send,
  Loader2,
  Lock,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  LifeBuoy,
  ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  STATUS_LABELS,
  PRIORITY_LABELS,
  findCategory,
  type TicketStatus,
  type TicketPriority,
} from '@/lib/support-constants';
import { useCurrentUser } from '@/hooks/use-current-user';

interface TicketDetail {
  id: string;
  ticketNumber: string;
  subject: string;
  description: string;
  status: string;
  priority: string;
  category: string;
  subcategory: string | null;
  currentPlan: string | null;
  requestedPlan: string | null;
  billingCycle: string | null;
  assignedToName: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  closedAt: string | null;
  messages: TicketMessage[];
}

interface TicketMessage {
  id: string;
  authorId: string;
  authorRole: string;
  content: string;
  isInternal: boolean;
  createdAt: string;
}

const STATUS_STYLES: Record<string, string> = {
  OPEN: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30',
  IN_PROGRESS: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30',
  WAITING_FOR_USER: 'bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/30',
  RESOLVED: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
  CLOSED: 'bg-muted text-muted-foreground border-border',
};

const PRIORITY_STYLES: Record<string, string> = {
  LOW: 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/30',
  NORMAL: 'bg-muted text-muted-foreground border-border',
  HIGH: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/30',
  URGENT: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30',
};

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function TicketDetailPage() {
  const params = useParams<{ id: string }>();
  const ticketId = params?.id;

  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [statusChanging, setStatusChanging] = useState(false);
  const [error, setError] = useState('');
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const loadTicket = useCallback(async () => {
    if (!ticketId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/support/tickets/${ticketId}`, { credentials: 'include' });
      if (res.status === 404) {
        setNotFound(true);
        return;
      }
      if (!res.ok) {
        setError('Could not load the ticket. Please try again.');
        return;
      }
      const data = await res.json();
      setTicket(data.ticket);
      setNotFound(false);
    } catch {
      setError('Network error while loading the ticket.');
    } finally {
      setLoading(false);
    }
  }, [ticketId]);

  useEffect(() => {
    loadTicket();
  }, [loadTicket]);

  const sendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    const content = reply.trim();
    if (!content) return;
    setSending(true);
    setError('');
    try {
      const res = await fetch(`/api/support/tickets/${ticketId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ content }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Could not send your message. Please try again.');
        return;
      }
      setReply('');
      await loadTicket();
      toast.success('Message sent to support.');
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSending(false);
    }
  };

  const changeStatus = async (status: string) => {
    setStatusChanging(true);
    setError('');
    try {
      const res = await fetch(`/api/support/tickets/${ticketId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Could not update the ticket status.');
        return;
      }
      await loadTicket();
      toast.success(
        status === 'CLOSED'
          ? 'Ticket closed. You can reopen it any time.'
          : 'Ticket reopened.',
      );
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setStatusChanging(false);
    }
  };

  // ─── Loading / not-found states ───────────────────────────────────
  if (loading && !ticket) {
    return (
      <main className="min-h-screen bg-background">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 py-8 space-y-4">
          <Skeleton className="h-8 w-44" />
          <Skeleton className="h-24 w-full rounded-2xl" />
          <Skeleton className="h-64 w-full rounded-2xl" />
        </div>
      </main>
    );
  }

  if (notFound) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-8 text-center">
          <h1 className="text-lg font-bold text-foreground">Ticket not found</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            This ticket does not exist or does not belong to your account.
          </p>
          <Button asChild className="mt-5 w-full">
            <a href="/support">Back to Support Center</a>
          </Button>
        </div>
      </main>
    );
  }

  if (!ticket) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-8 text-center">
          <h1 className="text-lg font-bold text-foreground">Something went wrong</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">{error || 'Could not load the ticket.'}</p>
          <Button onClick={loadTicket} className="mt-5 w-full">Try again</Button>
        </div>
      </main>
    );
  }

  const categoryLabel = findCategory(ticket.category)?.label || ticket.category;
  const canClose = !['CLOSED'].includes(ticket.status);
  const canReopen = ticket.status === 'CLOSED' || ticket.status === 'RESOLVED';

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 py-8">
        <a
          href="/support"
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground min-h-[40px]"
        >
          <ArrowLeft className="h-4 w-4" />
          Support Center
        </a>

        {/* ─── Ticket header ──────────────────────────────────────── */}
        <header className="mt-4 rounded-2xl border border-border bg-card p-5 sm:p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-mono text-xs text-muted-foreground">{ticket.ticketNumber}</p>
              <h1 className="mt-1 text-xl sm:text-2xl font-bold tracking-tight text-foreground break-words">
                {ticket.subject}
              </h1>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <Badge variant="outline" className={cn('text-[10px] whitespace-normal', STATUS_STYLES[ticket.status] || '')}>
                {STATUS_LABELS[ticket.status as TicketStatus] || ticket.status}
              </Badge>
              <Badge variant="outline" className={cn('text-[10px] whitespace-normal', PRIORITY_STYLES[ticket.priority] || '')}>
                {PRIORITY_LABELS[ticket.priority as TicketPriority] || ticket.priority}
              </Badge>
            </div>
          </div>

          <dl className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2 text-xs">
            <div>
              <dt className="text-muted-foreground">Category</dt>
              <dd className="mt-0.5 font-medium text-foreground break-words">
                {categoryLabel}
                {ticket.subcategory && ticket.subcategory !== 'other'
                  ? ` → ${findCategory(ticket.category)?.subcategories.find((s) => s.value === ticket.subcategory)?.label || ticket.subcategory}`
                  : ''}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Created</dt>
              <dd className="mt-0.5 font-medium text-foreground">{formatDateTime(ticket.createdAt)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Last updated</dt>
              <dd className="mt-0.5 font-medium text-foreground">{formatDateTime(ticket.updatedAt)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Assigned agent</dt>
              <dd className="mt-0.5 font-medium text-foreground break-words">
                {ticket.assignedToName || 'Support team'}
              </dd>
            </div>
          </dl>

          {(ticket.currentPlan || ticket.requestedPlan) && (
            <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
              {ticket.currentPlan && (
                <span className="rounded-md border border-border bg-muted/40 px-2 py-0.5 text-muted-foreground">
                  Plan: <strong className="text-foreground capitalize">{ticket.currentPlan}</strong>
                </span>
              )}
              {ticket.requestedPlan && (
                <span className="rounded-md border border-border bg-muted/40 px-2 py-0.5 text-muted-foreground">
                  Requested: <strong className="text-foreground capitalize">{ticket.requestedPlan}</strong>
                </span>
              )}
              {ticket.billingCycle && (
                <span className="rounded-md border border-border bg-muted/40 px-2 py-0.5 text-muted-foreground">
                  Cycle: <strong className="text-foreground capitalize">{ticket.billingCycle}</strong>
                </span>
              )}
            </div>
          )}

          {/* Owner status actions */}
          {(canClose || canReopen) && (
            <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
              {canReopen && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 min-h-[40px]"
                  disabled={statusChanging}
                  onClick={() => changeStatus('OPEN')}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Reopen ticket
                </Button>
              )}
              {canClose && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 min-h-[40px]"
                  disabled={statusChanging}
                  onClick={() => changeStatus('CLOSED')}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Close ticket
                </Button>
              )}
            </div>
          )}
        </header>

        {/* ─── Conversation ─────────────────────────────────────────── */}
        <section className="mt-6" aria-label="Ticket conversation">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Conversation</h2>
          <ul className="mt-3 space-y-3">
            {/* Original request */}
            <li className="flex gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <LifeBuoy className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1 rounded-xl rounded-tl-sm border border-border bg-card p-3.5">
                <p className="flex flex-wrap items-baseline gap-x-2 text-xs text-muted-foreground">
                  <strong className="text-foreground">You</strong>
                  <time>{formatDateTime(ticket.createdAt)}</time>
                </p>
                <p className="mt-1.5 whitespace-pre-wrap break-words text-sm text-foreground/90">
                  {ticket.description}
                </p>
              </div>
            </li>

            {ticket.messages.map((m) => {
              const isStaff = m.authorRole === 'admin';
              return (
                <li key={m.id} className="flex gap-3">
                  <span
                    className={cn(
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                      isStaff ? 'bg-emerald-500/10 text-emerald-500' : 'bg-primary/10 text-primary',
                    )}
                  >
                    {isStaff ? <ShieldCheck className="h-4 w-4" /> : <LifeBuoy className="h-4 w-4" />}
                  </span>
                  <div
                    className={cn(
                      'min-w-0 flex-1 rounded-xl border p-3.5',
                      isStaff
                        ? 'rounded-tl-sm border-emerald-500/20 bg-emerald-500/5'
                        : 'rounded-tl-sm border-border bg-card',
                    )}
                  >
                    <p className="flex flex-wrap items-baseline gap-x-2 text-xs text-muted-foreground">
                      <strong className={isStaff ? 'text-emerald-600 dark:text-emerald-400' : 'text-foreground'}>
                        {isStaff ? 'Support Team' : 'You'}
                      </strong>
                      <time>{formatDateTime(m.createdAt)}</time>
                    </p>
                    <p className="mt-1.5 whitespace-pre-wrap break-words text-sm text-foreground/90">{m.content}</p>
                  </div>
                </li>
              );
            })}
          </ul>
          <div ref={bottomRef} />
        </section>

        {/* ─── Reply box ─────────────────────────────────────────────── */}
        {ticket.status !== 'CLOSED' ? (
          <form onSubmit={sendReply} className="mt-6 rounded-2xl border border-border bg-card p-4 sm:p-5">
            <label htmlFor="reply" className="text-sm font-semibold text-foreground">
              Add a reply
            </label>
            <Textarea
              id="reply"
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              placeholder="Type your message to the support team..."
              rows={4}
              maxLength={10000}
              className="mt-2 resize-y"
            />
            {error && (
              <p className="mt-2 flex items-start gap-1.5 text-sm text-red-500" role="alert">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                {error}
              </p>
            )}
            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="text-[11px] text-muted-foreground">Replies are only visible to you and support.</p>
              <Button type="submit" className="gap-2 min-h-[44px]" disabled={sending || !reply.trim()}>
                {sending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    Send reply
                  </>
                )}
              </Button>
            </div>
          </form>
        ) : (
          <div className="mt-6 rounded-2xl border border-dashed border-border bg-muted/20 p-5 text-center">
            <Lock className="mx-auto h-5 w-5 text-muted-foreground" />
            <p className="mt-1.5 text-sm text-muted-foreground">
              This ticket is closed. Reopen it if you still need help.
            </p>
          </div>
        )}

        <div className="h-10" aria-hidden="true" />
      </div>
    </main>
  );
}
