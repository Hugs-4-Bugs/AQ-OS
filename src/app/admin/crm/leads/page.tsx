'use client';

// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Admin CRM Leads Workspace
//
// Searchable, filtered, paginated lead table with detail drawer.
// Filters: stage, source, search, hot-only, stale-only, has-email.
// Click a row to open the detail drawer (activities, outreach, meetings,
// deals, follow-ups, analysis).
// ═══════════════════════════════════════════════════════════════════

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, Flame, Clock, Mail, ExternalLink, ChevronLeft, ChevronRight,
  MapPin, Phone, Linkedin, Instagram, Globe, BrainCircuit, Send,
  Calendar, Handshake, BellRing, Activity as ActivityIcon,
} from 'lucide-react';
import { CrmShell } from '@/components/admin/crm/crm-shell';
import { CrmLoadingSkeleton, CrmErrorState, CrmEmptyState } from '@/components/admin/crm/crm-states';
import {
  useFetch, fmtInt, fmtDateTime, fmtMoney, timeAgo, humanize,
} from '@/components/admin/crm/crm-utils';
import { FUNNEL_STAGES, TERMINAL_STAGES, STAGE_LABELS, type CanonicalStage } from '@/lib/admin/crm/crm-stage-vocabulary';
import type { LeadListResult, LeadListItem } from '@/lib/admin/crm/crm-types';
import type { LeadDetail } from '@/lib/admin/crm/crm-lead-service';

const STAGE_FILTER_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'all', label: 'All stages' },
  ...FUNNEL_STAGES.map((s) => ({ value: s, label: STAGE_LABELS[s] })),
  ...TERMINAL_STAGES.map((s) => ({ value: s, label: STAGE_LABELS[s] })),
];

const PAGE_SIZE = 25;

export default function AdminCrmLeadsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [stage, setStage] = useState(searchParams.get('stage') || 'all');
  const [source, setSource] = useState('all');
  const [hotOnly, setHotOnly] = useState(searchParams.get('filter') === 'hot' || searchParams.get('hotOnly') === 'true');
  const [staleOnly, setStaleOnly] = useState(searchParams.get('filter') === 'stale');
  const [hasEmail, setHasEmail] = useState(false);
  const [page, setPage] = useState(0);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(searchParams.get('id'));

  // Sync URL when stage changes (for drilldown links from overview)
  useEffect(() => {
    const urlStage = searchParams.get('stage');
    if (urlStage && urlStage !== stage) setStage(urlStage);
    const urlFilter = searchParams.get('filter');
    if (urlFilter === 'hot' && !hotOnly) setHotOnly(true);
    if (urlFilter === 'stale' && !staleOnly) setStaleOnly(true);
    const urlId = searchParams.get('id');
    if (urlId !== selectedLeadId) setSelectedLeadId(urlId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Debounced search
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const queryParams = useMemo(() => {
    const p = new URLSearchParams();
    if (debouncedSearch) p.set('search', debouncedSearch);
    if (stage && stage !== 'all') p.set('stage', stage);
    if (source && source !== 'all') p.set('source', source);
    if (hotOnly) p.set('hotOnly', 'true');
    if (staleOnly) p.set('staleOnly', 'true');
    if (hasEmail) p.set('hasEmail', 'true');
    p.set('limit', String(PAGE_SIZE));
    p.set('offset', String(page * PAGE_SIZE));
    return p.toString();
  }, [debouncedSearch, stage, source, hotOnly, staleOnly, hasEmail, page]);

  const { data, loading, error, reload } = useFetch<LeadListResult>(`/api/admin/crm/leads?${queryParams}`);

  // Reset page when filters change
  useEffect(() => { setPage(0); }, [debouncedSearch, stage, source, hotOnly, staleOnly, hasEmail]);

  const handleSelectLead = useCallback((leadId: string) => {
    setSelectedLeadId(leadId);
    const p = new URLSearchParams(searchParams.toString());
    p.set('id', leadId);
    router.replace(`/admin/crm/leads?${p.toString()}`, { scroll: false });
  }, [router, searchParams]);

  const handleClearFilters = () => {
    setSearch(''); setStage('all'); setSource('all');
    setHotOnly(false); setStaleOnly(false); setHasEmail(false); setPage(0);
  };

  const activeFilterCount = (stage !== 'all' ? 1 : 0) + (source !== 'all' ? 1 : 0) +
    (hotOnly ? 1 : 0) + (staleOnly ? 1 : 0) + (hasEmail ? 1 : 0) + (debouncedSearch ? 1 : 0);

  return (
    <CrmShell
      title="Leads"
      subtitle="Search, filter, and inspect every lead across all tenants"
      onRefresh={reload}
    >
      <div className="space-y-3">
        {/* Filter bar */}
        <Card>
          <div className="flex flex-wrap items-center gap-2 p-3">
            <div className="relative min-w-[200px] flex-1">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search business, email, niche, city…"
                className="pl-8"
                aria-label="Search leads"
              />
            </div>
            <Select value={stage} onValueChange={setStage}>
              <SelectTrigger className="w-[140px]" aria-label="Filter by stage"><SelectValue /></SelectTrigger>
              <SelectContent>
                {STAGE_FILTER_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={source} onValueChange={setSource}>
              <SelectTrigger className="w-[130px]" aria-label="Filter by source"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sources</SelectItem>
                <SelectItem value="ai_search">AI Search</SelectItem>
                <SelectItem value="google_maps">Google Maps</SelectItem>
                <SelectItem value="linkedin">LinkedIn</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant={hotOnly ? 'default' : 'outline'} size="sm"
              onClick={() => setHotOnly((v) => !v)}
              aria-pressed={hotOnly}
            >
              <Flame className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> Hot
            </Button>
            <Button
              variant={staleOnly ? 'default' : 'outline'} size="sm"
              onClick={() => setStaleOnly((v) => !v)}
              aria-pressed={staleOnly}
            >
              <Clock className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> Stale
            </Button>
            <Button
              variant={hasEmail ? 'default' : 'outline'} size="sm"
              onClick={() => setHasEmail((v) => !v)}
              aria-pressed={hasEmail}
            >
              <Mail className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> Has email
            </Button>
            {activeFilterCount > 0 && (
              <Button variant="ghost" size="sm" onClick={handleClearFilters}>
                Clear ({activeFilterCount})
              </Button>
            )}
          </div>
        </Card>

        {/* Table */}
        {loading ? (
          <CrmLoadingSkeleton variant="table" />
        ) : error ? (
          <CrmErrorState message={error} onRetry={reload} />
        ) : !data || data.leads.length === 0 ? (
          <CrmEmptyState
            title={activeFilterCount > 0 ? 'No leads match your filters' : 'No leads yet'}
            description={activeFilterCount > 0 ? 'Try clearing some filters to widen the search.' : 'Leads will appear here once discovery runs.'}
            action={activeFilterCount > 0 ? <Button variant="outline" size="sm" onClick={handleClearFilters}>Clear filters</Button> : undefined}
          />
        ) : (
          <LeadTable leads={data.leads} onSelectLead={handleSelectLead} />
        )}

        {/* Pagination */}
        {data && (data.total > PAGE_SIZE || page > 0) && (
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Showing {page * PAGE_SIZE + 1}–{page * PAGE_SIZE + data.leads.length} of {fmtInt(data.total)}
            </p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
                <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" /> Prev
              </Button>
              <span className="text-xs text-muted-foreground">Page {page + 1}</span>
              <Button variant="outline" size="sm" disabled={!data.hasMore} onClick={() => setPage((p) => p + 1)}>
                Next <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Detail drawer */}
      <AnimatePresence>
        {selectedLeadId && (
          <LeadDetailDrawer leadId={selectedLeadId} onClose={() => {
            setSelectedLeadId(null);
            const p = new URLSearchParams(searchParams.toString());
            p.delete('id');
            router.replace(`/admin/crm/leads${p.toString() ? `?${p.toString()}` : ''}`, { scroll: false });
          }} />
        )}
      </AnimatePresence>
    </CrmShell>
  );
}

// ── Lead table ────────────────────────────────────────────────────────

function LeadTable({ leads, onSelectLead }: { leads: LeadListItem[]; onSelectLead: (id: string) => void }) {
  return (
    <Card className="overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="pl-4">Business</TableHead>
            <TableHead>Stage</TableHead>
            <TableHead className="hidden md:table-cell">Source</TableHead>
            <TableHead className="hidden lg:table-cell">Location</TableHead>
            <TableHead className="text-right">Reply</TableHead>
            <TableHead className="hidden sm:table-cell text-right">Conv.</TableHead>
            <TableHead className="hidden xl:table-cell text-right">Last contact</TableHead>
            <TableHead className="pr-4"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {leads.map((lead, i) => (
            <TableRow
              key={lead.id}
              onClick={() => onSelectLead(lead.id)}
              className="cursor-pointer"
            >
              <TableCell className="pl-4">
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-[10px] font-semibold uppercase text-primary">
                    {lead.businessName.slice(0, 2)}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium max-w-[200px]">{lead.businessName}</p>
                    <p className="truncate text-[11px] text-muted-foreground max-w-[200px]">
                      {lead.email || lead.ownerName || lead.phone || '—'}
                    </p>
                  </div>
                  {(lead.isStale || lead.isStalled) && (
                    <span className="flex items-center gap-0.5 shrink-0">
                      {lead.isStale && <Clock className="h-3 w-3 text-amber-500" aria-label="Stale" />}
                      {lead.isStalled && <Flame className="h-3 w-3 text-rose-500" aria-label="Stalled" />}
                    </span>
                  )}
                </div>
              </TableCell>
              <TableCell>
                <Badge variant="outline" className="text-[10px] capitalize">{STAGE_LABELS[lead.stage]}</Badge>
              </TableCell>
              <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                {lead.source ? humanize(lead.source) : '—'}
              </TableCell>
              <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">
                {lead.city || lead.country || '—'}
              </TableCell>
              <TableCell className="text-right tabular-nums text-xs">
                <ScoreBadge value={lead.replyScore} />
              </TableCell>
              <TableCell className="hidden sm:table-cell text-right tabular-nums text-xs">
                <ScoreBadge value={lead.conversionScore} />
              </TableCell>
              <TableCell className="hidden xl:table-cell text-right text-[11px] text-muted-foreground">
                {timeAgo(lead.lastContactedAt)}
              </TableCell>
              <TableCell className="pr-4 text-right">
                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

function ScoreBadge({ value }: { value: number }) {
  const tone = value >= 70 ? 'text-emerald-600 dark:text-emerald-400' : value >= 40 ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground';
  return <span className={`tabular-nums ${tone}`}>{Math.round(value)}</span>;
}

// ── Lead detail drawer ────────────────────────────────────────────────

function LeadDetailDrawer({ leadId, onClose }: { leadId: string; onClose: () => void }) {
  const { data, loading, error } = useFetch<LeadDetail>(`/api/admin/crm/leads?id=${leadId}`);

  return (
    <Sheet open onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto" aria-label="Lead detail">
        <SheetHeader>
          <SheetTitle className="text-base">
            {loading ? <Skeleton className="h-5 w-40" /> : data?.businessName || 'Lead detail'}
          </SheetTitle>
          <SheetDescription className="sr-only">Lead details, activities, outreach, meetings, deals, and analysis</SheetDescription>
        </SheetHeader>
        {loading ? (
          <div className="space-y-3 p-4">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : error ? (
          <div className="p-4"><CrmErrorState message={error} /></div>
        ) : !data ? (
          <div className="p-4"><CrmEmptyState title="Lead not found" /></div>
        ) : (
          <LeadDetailContent lead={data} />
        )}
      </SheetContent>
    </Sheet>
  );
}

function LeadDetailContent({ lead }: { lead: LeadDetail }) {
  return (
    <div className="space-y-4 p-4">
      {/* Identity */}
      <section>
        <div className="mb-2 flex items-center gap-2">
          <Badge variant="outline" className="text-[10px]">{STAGE_LABELS[lead.stage]}</Badge>
          {lead.source && <Badge variant="outline" className="text-[10px]">{humanize(lead.source)}</Badge>}
          {lead.isStale && <Badge variant="outline" className="text-[10px] text-amber-600">stale</Badge>}
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          {lead.email && <Field icon={<Mail />} label="Email" value={lead.email} />}
          {lead.phone && <Field icon={<Phone />} label="Phone" value={lead.phone} />}
          {lead.website && <Field icon={<Globe />} label="Website" value={lead.website} link={lead.website.startsWith('http') ? lead.website : `https://${lead.website}`} />}
          {lead.linkedin && <Field icon={<Linkedin />} label="LinkedIn" value={lead.linkedin} link={lead.linkedin.startsWith('http') ? lead.linkedin : `https://${lead.linkedin}`} />}
          {lead.instagram && <Field icon={<Instagram />} label="Instagram" value={lead.instagram} />}
          {(lead.city || lead.country) && <Field icon={<MapPin />} label="Location" value={[lead.city, lead.country].filter(Boolean).join(', ')} />}
        </div>
      </section>

      {/* Scores */}
      <section>
        <SectionTitle icon={<BrainCircuit />} title="Scores" />
        <div className="grid grid-cols-4 gap-2">
          <ScoreTile label="Reply" value={lead.replyScore} />
          <ScoreTile label="Conv." value={lead.conversionScore} />
          <ScoreTile label="Urgency" value={lead.urgencyScore} />
          <ScoreTile label="Revenue" value={lead.revenuePotentialScore} />
        </div>
        {lead.scoreReasoning && (
          <p className="mt-2 text-[11px] text-muted-foreground">{lead.scoreReasoning}</p>
        )}
      </section>

      {/* Analysis */}
      {lead.analysis && (
        <section>
          <SectionTitle icon={<BrainCircuit />} title="AI Analysis" />
          <div className="rounded-md border border-border p-3 text-xs">
            <div className="grid grid-cols-2 gap-2">
              <AnalysisTile label="Website Quality" value={lead.analysis.websiteQualityScore} />
              <AnalysisTile label="Digital Maturity" value={lead.analysis.digitalMaturityScore} />
              <AnalysisTile label="Deal Conv." value={lead.analysis.dealConversionScore} />
              <AnalysisTile label="Revenue Pot." value={lead.analysis.revenuePotentialScore} />
            </div>
            {lead.analysis.estimatedDealValueUsd && (
              <p className="mt-2 text-[11px]">Est. deal value: <span className="font-medium">{fmtMoney(parseFloat(lead.analysis.estimatedDealValueUsd) || 0)}</span></p>
            )}
            {lead.analysis.closingStrategy && (
              <p className="mt-1 text-[11px] text-muted-foreground">{lead.analysis.closingStrategy}</p>
            )}
          </div>
        </section>
      )}

      {/* Activities */}
      <section>
        <SectionTitle icon={<ActivityIcon />} title="Activities" count={lead.activities.length} />
        <ActivityList activities={lead.activities} />
      </section>

      {/* Outreach */}
      <section>
        <SectionTitle icon={<Send />} title="Outreach" count={lead.outreachMessages.length} />
        <SimpleList
          items={lead.outreachMessages}
          render={(m) => (
            <div className="flex items-center justify-between gap-2 text-xs">
              <div className="min-w-0">
                <p className="truncate font-medium">{m.subject || `${humanize(m.channel)} message`}</p>
                <p className="text-[10px] text-muted-foreground">{humanize(m.channel)} · {timeAgo(m.sentAt || m.createdAt)}</p>
              </div>
              <Badge variant="outline" className="text-[10px]">{humanize(m.status)}</Badge>
            </div>
          )}
          emptyText="No outreach sent yet."
        />
      </section>

      {/* Meetings */}
      <section>
        <SectionTitle icon={<Calendar />} title="Meetings" count={lead.meetings.length} />
        <SimpleList
          items={lead.meetings}
          render={(m) => (
            <div className="flex items-center justify-between gap-2 text-xs">
              <div className="min-w-0">
                <p className="truncate font-medium">{m.title}</p>
                <p className="text-[10px] text-muted-foreground">{humanize(m.platform)} · {fmtDateTime(m.startDateTime)}</p>
              </div>
              <Badge variant="outline" className="text-[10px]">{humanize(m.status)}</Badge>
            </div>
          )}
          emptyText="No meetings scheduled."
        />
      </section>

      {/* Deals */}
      <section>
        <SectionTitle icon={<Handshake />} title="Deals" count={lead.deals.length} />
        <SimpleList
          items={lead.deals}
          render={(d) => (
            <div className="flex items-center justify-between gap-2 text-xs">
              <div className="min-w-0">
                <p className="truncate font-medium">{d.title || 'Untitled deal'}</p>
                <p className="text-[10px] text-muted-foreground">{timeAgo(d.createdAt)}</p>
              </div>
              <div className="flex items-center gap-1.5">
                {d.proposedPrice !== null && <span className="text-xs font-medium">{fmtMoney(d.proposedPrice)}</span>}
                <Badge variant="outline" className="text-[10px]">{humanize(d.status)}</Badge>
              </div>
            </div>
          )}
          emptyText="No deals created."
        />
      </section>

      {/* Follow-ups */}
      <section>
        <SectionTitle icon={<BellRing />} title="Follow-up Reminders" count={lead.followUpReminders.length} />
        <SimpleList
          items={lead.followUpReminders}
          render={(f) => (
            <div className="flex items-center justify-between gap-2 text-xs">
              <p className="min-w-0 truncate">{f.message}</p>
              <Badge variant="outline" className="text-[10px]">
                {f.completed ? 'done' : `due ${timeAgo(f.dueAt)}`}
              </Badge>
            </div>
          )}
          emptyText="No follow-ups set."
        />
      </section>
    </div>
  );
}

function Field({ icon, label, value, link }: { icon: React.ReactNode; label: string; value: string; link?: string }) {
  return (
    <div>
      <p className="mb-0.5 flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
        {React.cloneElement(icon as React.ReactElement<{ className?: string }>, { className: 'h-3 w-3' })}
        {label}
      </p>
      {link ? (
        <a href={link} target="_blank" rel="noopener noreferrer" className="block truncate text-xs font-medium hover:underline">{value}</a>
      ) : (
        <p className="truncate text-xs font-medium">{value}</p>
      )}
    </div>
  );
}

function SectionTitle({ icon, title, count }: { icon: React.ReactNode; title: string; count?: number }) {
  return (
    <div className="mb-1.5 flex items-center gap-1.5">
      {React.cloneElement(icon as React.ReactElement<{ className?: string }>, { className: 'h-3.5 w-3.5 text-muted-foreground' })}
      <h4 className="text-xs font-semibold">{title}</h4>
      {count !== undefined && count > 0 && <span className="text-[10px] text-muted-foreground">({count})</span>}
    </div>
  );
}

function ScoreTile({ label, value }: { label: string; value: number }) {
  const tone = value >= 70 ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : value >= 40 ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400' : 'bg-muted text-muted-foreground';
  return (
    <div className={`rounded-md p-2 text-center ${tone}`}>
      <p className="text-sm font-semibold tabular-nums">{Math.round(value)}</p>
      <p className="text-[10px]">{label}</p>
    </div>
  );
}

function AnalysisTile({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold tabular-nums">{value}/100</p>
    </div>
  );
}

function ActivityList({ activities }: { activities: LeadDetail['activities'] }) {
  if (activities.length === 0) return <p className="py-2 text-center text-[11px] text-muted-foreground">No activity recorded.</p>;
  return (
    <ul className="space-y-1.5">
      {activities.map((a) => (
        <li key={a.id} className="flex items-start justify-between gap-2 text-xs">
          <div className="min-w-0">
            <p><span className="font-medium">{humanize(a.type)}</span>{a.actorEmail && <span className="ml-1 text-muted-foreground">· {a.actorEmail}</span>}</p>
            <p className="text-[10px] text-muted-foreground">{a.description}</p>
          </div>
          <span className="shrink-0 text-[10px] text-muted-foreground">{timeAgo(a.createdAt)}</span>
        </li>
      ))}
    </ul>
  );
}

function SimpleList<T>({ items, render, emptyText }: { items: T[]; render: (item: T) => React.ReactNode; emptyText: string }) {
  if (items.length === 0) return <p className="py-2 text-center text-[11px] text-muted-foreground">{emptyText}</p>;
  return <ul className="space-y-1.5">{items.map((item, i) => <li key={i} className="rounded-md border border-border p-2">{render(item)}</li>)}</ul>;
}
