'use client';

// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Outreach Status Panel (Phase 27)
//
// Shows the EXACT delivery state of each outbound message. Per the
// "NO FAKE SENT" rule, the UI distinguishes:
//
//   draft → approval_required → queued → sending → provider_accepted →
//     sent → delivered → opened → replied
//
//   failed → retrying → provider_accepted
//
//   rejected / rate_limited / cancelled / provider_blocked (terminal)
//
// "Provider accepted" means the provider API returned 200 + messageId —
// this is NOT the same as "delivered" to the recipient's inbox/device.
// Real delivery happens async via webhook (delivered/read events).
//
// LinkedIn/Instagram attempts always show `provider_blocked` because
// their Messaging APIs require Partner Program / App Review approval
// not available to this application.
// ═══════════════════════════════════════════════════════════════════

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { RefreshCw, Loader2, Mail, Send, AlertCircle } from 'lucide-react';

interface OutreachMessageView {
  id: string;
  leadId: string | null;
  userId: string | null;
  channel: string;
  direction: string;
  subject: string | null;
  content: string;
  status: string;
  providerMessageId: string | null;
  providerAcceptedAt: string | null;
  sentAt: string | null;
  openedAt: string | null;
  repliedAt: string | null;
  bouncedAt: string | null;
  errorCategory: string | null;
  errorMessage: string | null;
  retryCount: number;
  maxRetries: number;
  nextRetryAt: string | null;
  createdAt: string;
  updatedAt: string;
}

const STATUS_FLOW: Record<string, { label: string; color: string; description: string }> = {
  draft: { label: 'Draft', color: 'bg-zinc-500/15 text-zinc-600 dark:text-zinc-400', description: 'Message drafted locally, not yet submitted to provider' },
  approval_required: { label: 'Approval Required', color: 'bg-blue-500/15 text-blue-600 dark:text-blue-400', description: 'Awaiting human approval before send' },
  queued: { label: 'Queued', color: 'bg-blue-500/15 text-blue-600 dark:text-blue-400', description: 'In send queue, awaiting provider call' },
  sending: { label: 'Sending', color: 'bg-amber-500/15 text-amber-600 dark:text-amber-400', description: 'Provider call in progress' },
  provider_accepted: { label: 'Provider Accepted', color: 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400', description: 'Provider API returned 200 + messageId. Actual delivery is async via webhook.' },
  sent: { label: 'Sent', color: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400', description: 'Confirmed sent by provider webhook' },
  delivered: { label: 'Delivered', color: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400', description: 'Confirmed delivered to recipient device/inbox by provider webhook' },
  opened: { label: 'Opened', color: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400', description: 'Recipient opened the message (tracking pixel fired / read receipt)' },
  replied: { label: 'Replied', color: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400', description: 'Recipient replied on the thread' },
  bounced: { label: 'Bounced', color: 'bg-red-500/15 text-red-600 dark:text-red-400', description: 'Provider reports recipient rejected (mailbox full, address invalid)' },
  failed: { label: 'Failed', color: 'bg-red-500/15 text-red-600 dark:text-red-400', description: 'Terminal send failure after retries exhausted' },
  rejected: { label: 'Rejected', color: 'bg-red-500/15 text-red-600 dark:text-red-400', description: 'Approval was rejected by the user — no send occurred' },
  rate_limited: { label: 'Rate Limited', color: 'bg-amber-500/15 text-amber-600 dark:text-amber-400', description: 'Provider rate limit hit; backoff scheduled' },
  retrying: { label: 'Retrying', color: 'bg-amber-500/15 text-amber-600 dark:text-amber-400', description: 'Transient error, retry scheduled' },
  cancelled: { label: 'Cancelled', color: 'bg-zinc-500/15 text-zinc-500', description: 'User cancelled before send' },
  provider_blocked: { label: 'Provider Blocked', color: 'bg-amber-500/15 text-amber-600 dark:text-amber-400', description: 'Provider API does not permit this action for the available account type (e.g. LinkedIn/Instagram direct messaging)' },
};

export function OutreachStatusPanel() {
  const [messages, setMessages] = useState<OutreachMessageView[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const url = filter === 'all' ? '/api/outreach/messages?limit=50' : `/api/outreach/messages?status=${filter}&limit=50`;
      const res = await fetch(url, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages || []);
      } else {
        setMessages([]);
      }
    } catch (e) {
      toast.error('Failed to load outreach messages', { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Send className="h-4 w-4" /> Outreach Status
          </CardTitle>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={load} disabled={loading}>
            <RefreshCw className={`h-3 w-3 mr-1 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Each message shows its <strong>accurate</strong> delivery state. <strong>Provider Accepted</strong> ≠ <strong>Delivered</strong> — provider accepted means the provider API returned 200 + message ID. Real delivery is confirmed only when the provider webhook fires (delivered/read events).
        </p>
        <div className="flex flex-wrap gap-1 pt-2">
          <FilterChip label="All" value="all" active={filter === 'all'} onClick={setFilter} />
          <FilterChip label="Active" value="queued,sending,provider_accepted,retrying,rate_limited" active={filter === 'queued,sending,provider_accepted,retrying,rate_limited'} onClick={setFilter} />
          <FilterChip label="Delivered" value="delivered,opened,replied" active={filter === 'delivered,opened,replied'} onClick={setFilter} />
          <FilterChip label="Failed" value="failed,rejected,bounced,provider_blocked" active={filter === 'failed,rejected,bounced,provider_blocked'} onClick={setFilter} />
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading messages…
          </div>
        ) : messages.length === 0 ? (
          <div className="text-sm text-muted-foreground">No outreach messages match this filter.</div>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {messages.map((m) => {
              const statusMeta = STATUS_FLOW[m.status] ?? { label: m.status, color: 'bg-zinc-500/15 text-zinc-500', description: '' };
              return (
                <div key={m.id} className="border rounded-md p-2 text-xs">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        {m.channel === 'email' && <Mail className="h-3 w-3 flex-shrink-0" />}
                        {m.channel === 'whatsapp' && <Send className="h-3 w-3 flex-shrink-0" />}
                        <span className="font-medium truncate">{m.subject || m.content.slice(0, 60) || '(no content)'}</span>
                      </div>
                      <div className="text-muted-foreground mt-0.5">
                        to: <span className="font-mono">{m.leadId?.slice(0, 8)}…</span> · channel: {m.channel} · {new Date(m.createdAt).toLocaleString()}
                      </div>
                      {m.providerMessageId && (
                        <div className="text-muted-foreground text-[10px] mt-0.5">
                          providerMessageId: <span className="font-mono">{m.providerMessageId.slice(0, 50)}{m.providerMessageId.length > 50 ? '…' : ''}</span>
                        </div>
                      )}
                      {m.errorMessage && (
                        <div className="text-red-600 dark:text-red-400 mt-0.5 text-[11px]">
                          <AlertCircle className="inline h-3 w-3 mr-1" />
                          [{m.errorCategory || 'error'}] {m.errorMessage}
                        </div>
                      )}
                      {m.retryCount > 0 && (
                        <div className="text-amber-600 dark:text-amber-400 text-[11px] mt-0.5">
                          retry {m.retryCount}/{m.maxRetries}{m.nextRetryAt ? ` · next at ${new Date(m.nextRetryAt).toLocaleString()}` : ''}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full ${statusMeta.color}`}>
                        {statusMeta.label}
                      </span>
                      <span className="text-[10px] text-muted-foreground" title={statusMeta.description}>ⓘ</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function FilterChip({ label, value, active, onClick }: {
  label: string;
  value: string;
  active: boolean;
  onClick: (v: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onClick(value)}
      className={`text-[11px] px-2 py-0.5 rounded-full border transition-colors ${
        active
          ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 border-zinc-900 dark:border-zinc-100'
          : 'bg-transparent text-zinc-600 dark:text-zinc-400 border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800'
      }`}
    >
      {label}
    </button>
  );
}
