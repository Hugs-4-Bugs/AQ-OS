'use client';

// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Admin Console: Support Tickets (/admin/support)
//
// Staff-side ticket management (super_admin only — the /admin layout
// server-guards the page and the API re-checks the role):
//   • list with search + status/priority/category filters + stats
//   • ticket detail: conversation incl. internal support notes
//   • reply publicly (notifies the user) or internally (never shown
//     to customers)
//   • change status / priority / assignment
//
// Follows the same data conventions as the admin feedback page.
// ═══════════════════════════════════════════════════════════════════

import React, { useCallback, useEffect, useState } from 'react';
import {
  Search,
  Loader2,
  Inbox,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  MessageSquarePlus,
  Lock,
  ArrowLeft,
  Filter,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  SUPPORT_CATEGORIES,
  TICKET_STATUSES,
  TICKET_PRIORITIES,
  STATUS_LABELS,
  PRIORITY_LABELS,
  findCategory,
} from '@/lib/support-constants';

interface AdminTicket {
  id: string;
  ticketNumber: string;
  ownerName: string;
  ownerEmail: string;
  category: string;
  subcategory: string | null;
  subject: string;
  description: string;
  status: string;
  priority: string;
  currentPlan: string | null;
  requestedPlan: string | null;
  billingCycle: string | null;
  assignedTo: string | null;
  assignedToName: string | null;
  createdAt: string;
  lastActivityAt: string;
  messageCount: number;
}

interface AdminMessage {
  id: string;
  authorId: string;
  authorRole: string;
  content: string;
  isInternal: boolean;
  createdAt: string;
  author?: { name: string; email: string } | null;
}

interface TicketDetail {
  ticket: AdminTicket & {
    messages: AdminMessage[];
    owner: { id: string; name: string; email: string } | null;
  };
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

export default function AdminSupportPage() {
  const [tickets, setTickets] = useState<AdminTicket[]>([]);
  const [stats, setStats] = useState<{ byStatus: Record<string, number>; byPriority: Record<string, number> }>({ byStatus: {}, byPriority: {} });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [priority, setPriority] = useState('all');
  const [category, setCategory] = useState('all');

  // Detail view
  const [selected, setSelected] = useState<TicketDetail['ticket'] | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [reply, setReply] = useState('');
  const [internalNote, setInternalNote] = useState(false);
  const [sending, setSending] = useState(false);
  const [newPriority, setNewPriority] = useState('NORMAL');
  const [newStatus, setNewStatus] = useState('OPEN');

  const loadTickets = useCallback(
    (p = page) => {
      setLoading(true);
      const params = new URLSearchParams({ page: String(p), pageSize: '25' });
      if (search.trim()) params.set('search', search.trim());
      if (status !== 'all') params.set('status', status);
      if (priority !== 'all') params.set('priority', priority);
      if (category !== 'all') params.set('category', category);

      fetch(`/api/admin/support/tickets?${params.toString()}`, { credentials: 'include' })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (!data) {
            toast.error('Could not load support tickets.');
            return;
          }
          setTickets(data.tickets || []);
          setStats(data.stats || { byStatus: {}, byPriority: {} });
          setTotalPages(data.pagination?.totalPages || 1);
          setPage(data.pagination?.page || p);
        })
        .catch(() => toast.error('Network error loading tickets.'))
        .finally(() => setLoading(false));
    },
    [search, status, priority, category]
  );

  useEffect(() => {
    loadTickets(1);
  }, [status, priority, category]);

  const openTicket = async (id: string) => {
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/support/tickets/${id}`, { credentials: 'include' });
      if (!res.ok) {
        toast.error('Could not open the ticket.');
        return;
      }
      const data: TicketDetail = await res.json();
      setSelected(data.ticket);
      setNewPriority(data.ticket.priority);
      setNewStatus(data.ticket.status);
    } catch {
      toast.error('Network error opening the ticket.');
    } finally {
      setDetailLoading(false);
    }
  };

  const sendMessage = async () => {
    if (!selected || !reply.trim()) return;
    setSending(true);
    try {
      const res = await fetch(`/api/support/tickets/${selected.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ content: reply.trim(), isInternal: internalNote }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || 'Could not send the message.');
        return;
      }
      setReply('');
      toast.success(internalNote ? 'Internal note added.' : 'Reply sent — the user has been notified.');
      await openTicket(selected.id);
    } catch {
      toast.error('Network error sending the message.');
    } finally {
      setSending(false);
    }
  };

  const applyTicketUpdate = async (body: Record<string, unknown>, successMsg: string) => {
    if (!selected) return;
    try {
      const res = await fetch(`/api/support/tickets/${selected.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || 'Update failed.');
        return;
      }
      toast.success(successMsg);
      await openTicket(selected.id);
      loadTickets(page);
    } catch {
      toast.error('Network error updating the ticket.');
    }
  };

  // ─── Detail view ───────────────────────────────────────────────────
  if (detailLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        Loading ticket...
      </div>
    );
  }

  if (selected) {
    const catLabel = findCategory(selected.category)?.label || selected.category;
    return (
      <div className="mx-auto max-w-4xl">
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 min-h-[36px]"
          onClick={() => {
            setSelected(null);
            loadTickets(page);
          }}
        >
          <ArrowLeft className="h-4 w-4" />
          Back to tickets
        </Button>

        {/* Header */}
        <div className="mt-3 rounded-xl border border-border bg-card p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-mono text-xs text-muted-foreground">{selected.ticketNumber}</p>
              <h1 className="mt-1 text-lg sm:text-xl font-bold text-foreground break-words">{selected.subject}</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {selected.owner?.name || selected.ownerName} · {selected.owner?.email || selected.ownerEmail}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className={cn('text-[10px]', STATUS_STYLES[selected.status] || '')}>
                {STATUS_LABELS[selected.status as never] || selected.status}
              </Badge>
              <Badge variant="outline" className={cn('text-[10px]', PRIORITY_STYLES[selected.priority] || '')}>
                {PRIORITY_LABELS[selected.priority as never] || selected.priority}
              </Badge>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
            <span className="rounded-md border border-border bg-muted/40 px-2 py-0.5">
              {catLabel}
              {selected.subcategory && selected.subcategory !== 'other'
                ? ` → ${findCategory(selected.category)?.subcategories.find((s) => s.value === selected.subcategory)?.label || selected.subcategory}`
                : ''}
            </span>
            <span className="rounded-md border border-border bg-muted/40 px-2 py-0.5">Created {formatDateTime(selected.createdAt)}</span>
            {selected.currentPlan && (
              <span className="rounded-md border border-border bg-muted/40 px-2 py-0.5">Plan: <strong className="text-foreground capitalize">{selected.currentPlan}</strong></span>
            )}
            {selected.requestedPlan && (
              <span className="rounded-md border border-border bg-muted/40 px-2 py-0.5">Requested: <strong className="text-foreground capitalize">{selected.requestedPlan}</strong></span>
            )}
            {selected.billingCycle && (
              <span className="rounded-md border border-border bg-muted/40 px-2 py-0.5">Cycle: <strong className="text-foreground capitalize">{selected.billingCycle}</strong></span>
            )}
            {selected.assignedToName && (
              <span className="rounded-md border border-border bg-muted/40 px-2 py-0.5">Assigned: <strong className="text-foreground">{selected.assignedToName}</strong></span>
            )}
          </div>

          <p className="mt-3 whitespace-pre-wrap rounded-lg bg-muted/30 p-3 text-sm text-foreground/90 break-words">
            {selected.description}
          </p>

          {/* Staff controls */}
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3 border-t border-border pt-4">
            <div className="space-y-1.5">
              <Label htmlFor="ad-status" className="text-xs">Status</Label>
              <div className="flex gap-2">
                <Select value={newStatus} onValueChange={setNewStatus}>
                  <SelectTrigger id="ad-status" className="w-full" aria-label="Change status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TICKET_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0"
                  disabled={newStatus === selected.status}
                  onClick={() => applyTicketUpdate({ status: newStatus }, 'Status updated — user notified.')}
                >
                  Set
                </Button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ad-priority" className="text-xs">Priority</Label>
              <div className="flex gap-2">
                <Select value={newPriority} onValueChange={setNewPriority}>
                  <SelectTrigger id="ad-priority" className="w-full" aria-label="Change priority">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TICKET_PRIORITIES.map((p) => (
                      <SelectItem key={p} value={p}>{PRIORITY_LABELS[p]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0"
                  disabled={newPriority === selected.priority}
                  onClick={() => applyTicketUpdate({ priority: newPriority }, 'Priority updated.')}
                >
                  Set
                </Button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ad-assign" className="text-xs">Assign to me</Label>
              <Button
                size="sm"
                variant="outline"
                className="w-full"
                onClick={() => applyTicketUpdate({ assignedTo: 'me' }, 'Ticket assigned.')}
                disabled={!!selected.assignedTo}
              >
                {selected.assignedTo ? `Assigned: ${selected.assignedToName || 'staff'}` : 'Assign to me'}
              </Button>
            </div>
          </div>
        </div>

        {/* Conversation */}
        <section className="mt-5" aria-label="Conversation">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Conversation</h2>
          <ul className="mt-3 space-y-3">
            {selected.messages.map((m) => (
              <li
                key={m.id}
                className={cn(
                  'rounded-xl border p-3.5',
                  m.isInternal
                    ? 'border-amber-500/30 bg-amber-500/5'
                    : m.authorRole === 'admin'
                    ? 'border-emerald-500/20 bg-emerald-500/5'
                    : 'border-border bg-card',
                )}
              >
                <p className="flex flex-wrap items-baseline gap-x-2 text-xs text-muted-foreground">
                  <strong className="text-foreground">{m.authorRole === 'admin' ? 'Staff' : selected.owner?.name || 'User'}</strong>
                  <time>{formatDateTime(m.createdAt)}</time>
                  {m.isInternal && (
                    <Badge variant="outline" className="gap-1 border-amber-500/40 text-[10px] text-amber-600">
                      <Lock className="h-2.5 w-2.5" />
                      Internal note
                    </Badge>
                  )}
                </p>
                <p className="mt-1.5 whitespace-pre-wrap break-words text-sm text-foreground/90">{m.content}</p>
              </li>
            ))}
            {selected.messages.length === 0 && (
              <li className="rounded-xl border border-dashed border-border bg-muted/20 p-4 text-center text-sm text-muted-foreground">
                No messages yet.
              </li>
            )}
          </ul>
        </section>

        {/* Reply form */}
        <section className="mt-5 rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="ad-reply" className="text-sm font-semibold">Reply</Label>
            <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
              <Switch checked={internalNote} onCheckedChange={setInternalNote} aria-label="Internal note toggle" />
              <Lock className="h-3 w-3" />
              Internal note (never shown to the user)
            </label>
          </div>
          <Textarea
            id="ad-reply"
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            rows={4}
            maxLength={10000}
            placeholder={internalNote ? 'Internal note for the support team...' : 'Write a reply to the user...'}
            className="mt-2 resize-y"
          />
          <div className="mt-3 flex justify-end">
            <Button className="gap-2 min-h-[44px]" disabled={sending || !reply.trim()} onClick={sendMessage}>
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquarePlus className="h-4 w-4" />}
              {internalNote ? 'Add internal note' : 'Send reply'}
            </Button>
          </div>
        </section>
      </div>
    );
  }

  // ─── List view ─────────────────────────────────────────────────────
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">Support Tickets</h1>
          <p className="text-sm text-muted-foreground">
            {stats.byStatus['OPEN'] || 0} open · {stats.byStatus['IN_PROGRESS'] || 0} in progress ·{' '}
            {stats.byStatus['WAITING_FOR_USER'] || 0} waiting · {stats.byStatus['RESOLVED'] || 0} resolved ·{' '}
            {stats.byStatus['CLOSED'] || 0} closed
          </p>
        </div>
        <Button variant="outline" size="sm" className="gap-2 min-h-[36px]" onClick={() => loadTickets(page)}>
          <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && loadTickets(1)}
            placeholder="Search number, subject..."
            className="pl-9"
            aria-label="Search tickets"
          />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger aria-label="Filter by status" className="w-full">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {TICKET_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={priority} onValueChange={setPriority}>
          <SelectTrigger aria-label="Filter by priority" className="w-full">
            <SelectValue placeholder="All priorities" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All priorities</SelectItem>
            {TICKET_PRIORITIES.map((p) => (
              <SelectItem key={p} value={p}>{PRIORITY_LABELS[p]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger aria-label="Filter by category" className="w-full">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {SUPPORT_CATEGORIES.map((c) => (
              <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Ticket list */}
      <div className="mt-4 space-y-2">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading tickets...
          </div>
        ) : tickets.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-muted/20 p-10 text-center">
            <Inbox className="mx-auto h-7 w-7 text-muted-foreground" />
            <p className="mt-2 text-sm text-muted-foreground">No tickets match the current filters.</p>
          </div>
        ) : (
          tickets.map((t) => (
            <button
              key={t.id}
              onClick={() => openTicket(t.id)}
              className="block w-full rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-primary/40 hover:bg-muted/30"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium text-foreground break-words">{t.subject}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    <span className="font-mono">{t.ticketNumber}</span>
                    {' · '}
                    {t.ownerName} ({t.ownerEmail})
                    {' · '}
                    {findCategory(t.category)?.label || t.category}
                    {t.subcategory && t.subcategory !== 'other' ? ` → ${t.subcategory}` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                  <Badge variant="outline" className={cn('text-[10px]', STATUS_STYLES[t.status] || '')}>
                    {STATUS_LABELS[t.status as never] || t.status}
                  </Badge>
                  <Badge variant="outline" className={cn('text-[10px]', PRIORITY_STYLES[t.priority] || '')}>
                    {PRIORITY_LABELS[t.priority as never] || t.priority}
                  </Badge>
                </div>
              </div>
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                Created {formatDateTime(t.createdAt)} · Last activity {formatDateTime(t.lastActivityAt)} · {t.messageCount} message{t.messageCount === 1 ? '' : 's'}
              </p>
            </button>
          ))
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => loadTickets(page - 1)} className="gap-1">
            <ChevronLeft className="h-4 w-4" />
            Prev
          </Button>
          <span className="text-xs text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => loadTickets(page + 1)} className="gap-1">
            Next
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
