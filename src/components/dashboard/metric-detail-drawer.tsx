'use client';

// ═══════════════════════════════════════════════════════════════════
// MetricDetailDrawer — shared "click a metric card → see its records"
// detail view for the Dashboard and Insights tabs.
//
// Uses the app's existing Sheet drawer pattern (same as LeadDetailPanel)
// and the existing data APIs, so every number shown comes from the same
// source as the card it was opened from:
//  - mode "leads"     : fetchLeads with the metric's exact filter
//  - mode "deals"     : fetchDeals (optionally narrowed client-side)
//  - mode "breakdown" : label/value rows computed from live stats data
//
// SHELL-BOUNDED POSITIONING: the drawer portals into the app shell's
// content region ([data-app-content-region]) and positions itself with
// `absolute` inside it — so it sits ABOVE the page content (dim overlay
// included) but can never cover the topbar, header, footer, or bottom
// navigation on any viewport. If the region cannot be found (defensive
// fallback) it falls back to the default body-portal fixed sheet.
//
// Accessible: Radix Sheet focus handling + ESC + click-outside-to-close,
// rows are real buttons with visible focus rings, and the drawer is
// full-width on small screens.
// ═══════════════════════════════════════════════════════════════════

import React, { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ExternalLink } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { fetchDeals, fetchLeads } from '@/lib/api';
import { useAppStore } from '@/lib/store';
import { STAGE_LABELS, type Deal, type LeadStage } from '@/lib/types';
import { cn } from '@/lib/utils';
import ErrorFallback from './error-fallback';

// Mirrors the stage badge palette used by the Leads tab so records in the
// drawer look identical to the same records in the Leads list.
const STAGE_BADGE_STYLES: Record<string, string> = {
  discovered: 'bg-slate-500/15 text-slate-400 border-slate-500/25',
  analyzed: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/25',
  contacted: 'bg-blue-500/15 text-blue-400 border-blue-500/25',
  replied: 'bg-amber-500/15 text-amber-400 border-amber-500/25',
  discussion: 'bg-orange-500/15 text-orange-400 border-orange-500/25',
  proposal: 'bg-purple-500/15 text-purple-400 border-purple-500/25',
  negotiation: 'bg-pink-500/15 text-pink-400 border-pink-500/25',
  won: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
  lost: 'bg-red-500/15 text-red-400 border-red-500/25',
};

export interface MetricDetail {
  title: string;
  description?: string;
  mode: 'leads' | 'deals' | 'breakdown';
  /** Exact filter params for mode "leads" — mirrors /api/leads/stats semantics */
  leadsParams?: {
    stage?: LeadStage;
    stages?: string[];
    minReplyScore?: number;
  };
  /** Client-side narrowing for mode "deals" (e.g. deals with a proposed price) */
  dealsFilter?: (deal: Deal) => boolean;
  /** Rows for mode "breakdown" — computed by the caller from live data */
  breakdown?: { label: string; value: string | number }[];
}

const DEAL_STATUS_STYLES: Record<string, string> = {
  won: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  accepted: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  negotiating: 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400',
  proposed: 'border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400',
  lost: 'border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400',
  rejected: 'border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400',
};

function formatMoney(amount?: number | null, currency?: string): string {
  if (amount == null) return '—';
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD',
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency || '$'}${amount}`;
  }
}

export default function MetricDetailDrawer({
  detail,
  onClose,
}: {
  detail: MetricDetail | null;
  onClose: () => void;
}) {
  const { setActiveTab, setSelectedLeadId } = useAppStore();
  const open = !!detail;

  // ── Shell-bounded portal target ────────────────────────────────
  // This component renders inside the active tab (inside <main>), so the
  // closest app-content region ancestor is the shell area between the
  // topbar/header and the footer/nav. Resolved once on mount; when found,
  // the drawer + its dim overlay are absolutely positioned within it.
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const region = anchorRef.current?.closest('[data-app-content-region]');
    setPortalContainer(region instanceof HTMLElement ? region : null);
  }, []);

  // ── Leads mode: exact filter fetch ───────────────────────────────
  const leadsQuery = useQuery({
    queryKey: ['metric-detail-leads', detail?.leadsParams],
    queryFn: () =>
      fetchLeads({
        ...detail!.leadsParams,
        sortBy: 'conversionScore',
        sortOrder: 'desc',
        limit: 100,
      }),
    enabled: open && detail?.mode === 'leads',
  });

  // ── Deals mode ───────────────────────────────────────────────────
  const dealsQuery = useQuery({
    queryKey: ['metric-detail-deals'],
    queryFn: () => fetchDeals(),
    enabled: open && detail?.mode === 'deals',
  });

  const openLeadInLeads = (leadId: string) => {
    onClose();
    setSelectedLeadId(leadId);
    setActiveTab('leads');
  };

  const goLeads = () => {
    onClose();
    setActiveTab('leads');
  };

  const goDeals = () => {
    onClose();
    setActiveTab('deals');
  };

  const filteredDeals = detail?.mode === 'deals' && dealsQuery.data
    ? dealsQuery.data.filter((d) => detail.dealsFilter?.(d) ?? true)
    : [];

  return (
    <>
      <span ref={anchorRef} aria-hidden="true" className="hidden" />
      <Sheet open={open} modal={false} onOpenChange={(o) => !o && onClose()}>
        <SheetContent
          side="right"
          container={portalContainer}
          overlayClassName={portalContainer ? '' : undefined}
          className={cn(
            'w-full sm:max-w-md p-0 flex flex-col',
            // Inside the shell region: absolute (bounded by topbar/footer).
            // Body-portal fallback: keep the default fixed positioning.
            portalContainer && 'absolute inset-y-0 right-0 h-full'
          )}
          aria-describedby={undefined}
        >
        {detail && (
          <>
            <SheetHeader className="p-4 pb-3 border-b shrink-0 pr-12">
              <SheetTitle className="text-base">{detail.title}</SheetTitle>
              {detail.description && (
                <SheetDescription className="text-xs text-muted-foreground">
                  {detail.description}
                </SheetDescription>
              )}
            </SheetHeader>

            <ScrollArea className="flex-1 min-h-0 custom-scrollbar">
              <div className="p-4">
                {/* ── Leads mode ── */}
                {detail.mode === 'leads' && (
                  <>
                    {leadsQuery.isLoading ? (
                      <div className="space-y-2" aria-busy="true" aria-label="Loading records">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Skeleton key={i} className="h-14 w-full rounded-lg" />
                        ))}
                      </div>
                    ) : leadsQuery.error ? (
                      <ErrorFallback
                        error={leadsQuery.error instanceof Error ? leadsQuery.error : null}
                        onRetry={() => leadsQuery.refetch()}
                        title="Failed to load records"
                        description="We couldn't load the records for this metric."
                        className="min-h-[200px]"
                      />
                    ) : (leadsQuery.data?.leads.length ?? 0) === 0 ? (
                      <div className="text-center py-10 text-sm text-muted-foreground">
                        No records match this metric yet.
                      </div>
                    ) : (
                      <>
                        <p className="text-[11px] text-muted-foreground mb-2">
                          Showing {leadsQuery.data!.leads.length} of {leadsQuery.data!.pagination.total}
                          {leadsQuery.data!.pagination.total > leadsQuery.data!.leads.length
                            ? ' — open in Leads to see all'
                            : ''}
                        </p>
                        <ul className="space-y-2">
                          {leadsQuery.data!.leads.map((lead) => (
                            <li key={lead.id}>
                              <button
                                type="button"
                                onClick={() => openLeadInLeads(lead.id)}
                                className="w-full text-left flex items-center gap-3 p-2.5 rounded-lg border bg-card hover:bg-accent/50 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-all"
                                aria-label={`Open ${lead.businessName} in Leads`}
                              >
                                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                  <span className="text-xs font-bold text-primary">
                                    {lead.businessName.charAt(0).toUpperCase()}
                                  </span>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium truncate">{lead.businessName}</p>
                                  <p className="text-[11px] text-muted-foreground truncate">
                                    {[lead.city, lead.country].filter(Boolean).join(', ') || 'No location'}
                                  </p>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <Badge
                                    variant="outline"
                                    className={cn('text-[10px] border', STAGE_BADGE_STYLES[lead.stage] ?? '')}
                                  >
                                    {STAGE_LABELS[lead.stage] ?? lead.stage}
                                  </Badge>
                                  <span className="text-xs font-semibold tabular-nums w-8 text-right">
                                    {lead.conversionScore}
                                  </span>
                                </div>
                              </button>
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                  </>
                )}

                {/* ── Deals mode ── */}
                {detail.mode === 'deals' && (
                  <>
                    {dealsQuery.isLoading ? (
                      <div className="space-y-2" aria-busy="true" aria-label="Loading records">
                        {Array.from({ length: 4 }).map((_, i) => (
                          <Skeleton key={i} className="h-14 w-full rounded-lg" />
                        ))}
                      </div>
                    ) : dealsQuery.error ? (
                      <ErrorFallback
                        error={dealsQuery.error instanceof Error ? dealsQuery.error : null}
                        onRetry={() => dealsQuery.refetch()}
                        title="Failed to load deals"
                        description="We couldn't load the deals for this metric."
                        className="min-h-[200px]"
                      />
                    ) : filteredDeals.length === 0 ? (
                      <div className="text-center py-10 text-sm text-muted-foreground">
                        No deals match this metric yet.
                      </div>
                    ) : (
                      <ul className="space-y-2">
                        {filteredDeals.map((deal) => (
                          <li key={deal.id}>
                            <button
                              type="button"
                              onClick={goDeals}
                              className="w-full text-left flex items-center gap-3 p-2.5 rounded-lg border bg-card hover:bg-accent/50 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-all"
                              aria-label={`Open ${deal.lead?.businessName ?? 'deal'} in Deals`}
                            >
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">
                                  {deal.lead?.businessName ?? 'Deal'}
                                </p>
                                <p className="text-[11px] text-muted-foreground truncate">
                                  {deal.projectType || 'Project'} · {new Date(deal.createdAt).toLocaleDateString()}
                                </p>
                              </div>
                              <div className="flex flex-col items-end gap-1 shrink-0">
                                <Badge
                                  variant="outline"
                                  className={cn('text-[10px] capitalize', DEAL_STATUS_STYLES[deal.status] ?? '')}
                                >
                                  {deal.status}
                                </Badge>
                                <span className="text-xs font-semibold tabular-nums">
                                  {formatMoney(deal.proposedPrice ?? deal.finalPrice, deal.currency)}
                                </span>
                              </div>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}

                {/* ── Breakdown mode ── */}
                {detail.mode === 'breakdown' && (
                  <dl className="space-y-2">
                    {(detail.breakdown ?? []).map((row) => (
                      <div
                        key={row.label}
                        className="flex items-center justify-between gap-3 p-3 rounded-lg border bg-card"
                      >
                        <dt className="text-sm text-muted-foreground">{row.label}</dt>
                        <dd className="text-sm font-semibold tabular-nums">{row.value}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </div>
            </ScrollArea>

            {/* Footer CTA — existing navigation pattern (tab switch) */}
            <div className="border-t p-3 shrink-0">
              {detail.mode === 'leads' && (
                <Button variant="outline" size="sm" className="w-full" onClick={goLeads}>
                  <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                  Open in Leads
                </Button>
              )}
              {detail.mode === 'deals' && (
                <Button variant="outline" size="sm" className="w-full" onClick={goDeals}>
                  <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                  Open in Deals
                </Button>
              )}
              {detail.mode === 'breakdown' && detail.leadsParams && (
                <Button variant="outline" size="sm" className="w-full" onClick={goLeads}>
                  <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                  Open in Leads
                </Button>
              )}
            </div>
          </>
        )}
        </SheetContent>
    </Sheet>
    </>
  );
}
