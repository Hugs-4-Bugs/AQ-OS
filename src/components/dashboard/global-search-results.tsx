'use client';

import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence, type Variants } from 'framer-motion';
import {
  Users,
  HandshakeIcon,
  Zap,
  BookOpen,
  Search,
  Building2,
  Globe,
  MapPin,
  TrendingUp,
  Plus,
  FileText,
  BarChart3,
  BrainCircuit,
  Keyboard,
  HelpCircle,
  ArrowRight,
  ChevronDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Types ─────────────────────────────────────────────────────

interface GlobalSearchResultsProps {
  query: string;
  isOpen: boolean;
  onClose: () => void;
  onSelect: (type: string, id: string) => void;
}

interface MockLead {
  id: string;
  businessName: string;
  website: string;
  location: string;
  score: number;
  stage: string;
}

interface MockDeal {
  id: string;
  name: string;
  value: string;
  company: string;
  probability: number;
  stage: string;
}

interface MockAction {
  id: string;
  label: string;
  description: string;
  icon: React.ElementType;
  color: string;
}

interface MockHelp {
  id: string;
  label: string;
  description: string;
  icon: React.ElementType;
}

// ─── Data (loaded from API) ──────────────────────────────────

const leads: MockLead[] = [];

const deals: MockDeal[] = [];

const actions: MockAction[] = [];

const helpItems: MockHelp[] = [];

// ─── Helpers ───────────────────────────────────────────────────

function scoreColor(score: number): string {
  if (score >= 70) return 'text-emerald-500';
  if (score >= 40) return 'text-amber-500';
  return 'text-red-500';
}

function scoreBg(score: number): string {
  if (score >= 70) return 'bg-emerald-500/15';
  if (score >= 40) return 'bg-amber-500/15';
  return 'bg-red-500/15';
}

function stageVariant(stage: string): string {
  const map: Record<string, string> = {
    Closing: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
    Proposal: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
    Negotiation: 'bg-violet-500/15 text-violet-600 dark:text-violet-400',
    Discussion: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
    Discovery: 'bg-slate-500/15 text-slate-600 dark:text-slate-400',
    Discovered: 'bg-slate-500/15 text-slate-600 dark:text-slate-400',
    Contacted: 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400',
    Replied: 'bg-sky-500/15 text-sky-600 dark:text-sky-400',
    Analyzed: 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400',
  };
  return map[stage] ?? 'bg-muted text-muted-foreground';
}

function HighlightText({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>;
  const q = query.trim();
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-primary/20 text-foreground rounded px-0.5 font-medium">
        {text.slice(idx, idx + q.length)}
      </mark>
      {text.slice(idx + q.length)}
    </>
  );
}

function probabilityLabel(prob: number): string {
  if (prob >= 80) return 'High';
  if (prob >= 50) return 'Medium';
  return 'Low';
}

function probabilityColor(prob: number): string {
  if (prob >= 80) return 'text-emerald-500';
  if (prob >= 50) return 'text-amber-500';
  return 'text-red-400';
}

// ─── Section Header ────────────────────────────────────────────

function SectionHeader({
  icon: Icon,
  title,
  count,
}: {
  icon: React.ElementType;
  title: string;
  count: number;
}) {
  return (
    <div className="flex items-center gap-2 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground select-none">
      <Icon className="h-3.5 w-3.5" />
      <span>{title}</span>
      {count > 0 && (
        <span className="ml-auto inline-flex items-center justify-center h-5 min-w-[20px] px-1.5 rounded-full bg-primary/10 text-primary text-[10px] font-bold">
          {count}
        </span>
      )}
    </div>
  );
}

// ─── Empty State ───────────────────────────────────────────────

function EmptyState({ query }: { query: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <div className="h-12 w-12 rounded-full bg-muted/60 flex items-center justify-center mb-4">
        <Search className="h-5 w-5 text-muted-foreground" />
      </div>
      <p className="text-sm font-medium text-foreground mb-1">No results found</p>
      <p className="text-xs text-muted-foreground max-w-[220px]">
        No leads, deals, or actions match{' '}
        <span className="font-medium text-foreground/80">&ldquo;{query}&rdquo;</span>
      </p>
      <p className="text-xs text-muted-foreground mt-2">
        Try different keywords or{' '}
        <span className="text-primary cursor-pointer hover:underline">browse all leads</span>
      </p>
    </div>
  );
}

// ─── Animation Variants ────────────────────────────────────────

const panelVariants: Variants = {
  hidden: { opacity: 0, scale: 0.95, y: -8 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { type: 'spring', stiffness: 400, damping: 30 },
  },
  exit: {
    opacity: 0,
    scale: 0.95,
    y: -8,
    transition: { duration: 0.15 },
  },
};

// ─── Main Component ────────────────────────────────────────────

export default function GlobalSearchResults({
  query,
  isOpen,
  onClose,
  onSelect,
}: GlobalSearchResultsProps) {
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // ── Filter data by query ────────────────────────────────────
  const q = query.trim().toLowerCase();

  const filteredLeads = useMemo(
    () =>
      q
        ? leads.filter(
            (l) =>
              l.businessName.toLowerCase().includes(q) ||
              l.website.toLowerCase().includes(q) ||
              l.location.toLowerCase().includes(q) ||
              l.stage.toLowerCase().includes(q)
          )
        : leads,
    [q]
  );

  const filteredDeals = useMemo(
    () =>
      q
        ? deals.filter(
            (d) =>
              d.name.toLowerCase().includes(q) ||
              d.company.toLowerCase().includes(q) ||
              d.stage.toLowerCase().includes(q) ||
              d.value.toLowerCase().includes(q)
          )
        : deals,
    [q]
  );

  const filteredActions = useMemo(
    () =>
      q
        ? actions.filter(
            (a) =>
              a.label.toLowerCase().includes(q) ||
              a.description.toLowerCase().includes(q)
          )
        : actions,
    [q]
  );

  const filteredHelp = useMemo(
    () =>
      q
        ? helpItems.filter(
            (h) =>
              h.label.toLowerCase().includes(q) ||
              h.description.toLowerCase().includes(q)
          )
        : helpItems,
    [q]
  );

  // ── Build flat list for keyboard navigation ──────────────────
  const sections = useMemo(
    () => [
      ...filteredLeads.map((l) => ({ type: 'lead' as const, id: l.id })),
      ...filteredDeals.map((d) => ({ type: 'deal' as const, id: d.id })),
      ...filteredActions.map((a) => ({ type: 'action' as const, id: a.id })),
      ...filteredHelp.map((h) => ({ type: 'help' as const, id: h.id })),
    ],
    [filteredLeads, filteredDeals, filteredActions, filteredHelp]
  );

  const totalResults = sections.length;
  const hasResults = totalResults > 0 || !q;

  // ── Keyboard navigation ──────────────────────────────────────
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!hasResults || sections.length === 0) return;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setActiveIndex((prev) => (prev + 1) % sections.length);
          break;
        case 'ArrowUp':
          e.preventDefault();
          setActiveIndex((prev) => (prev - 1 + sections.length) % sections.length);
          break;
        case 'Enter':
          e.preventDefault();
          if (activeIndex >= 0 && activeIndex < sections.length) {
            const item = sections[activeIndex];
            onSelect(item.type, item.id);
            onClose();
          }
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    },
    [hasResults, sections, activeIndex, onSelect, onClose]
  );

  // Reset active index when query changes
  useEffect(() => {
    setActiveIndex(-1);
  }, [query]);

  // Scroll active item into view
  useEffect(() => {
    if (activeIndex >= 0 && itemRefs.current[activeIndex]) {
      itemRefs.current[activeIndex]?.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIndex]);

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose]);

  // ── Track running index for flat keyboard nav ────────────────
  let runningIndex = 0;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          ref={containerRef}
          variants={panelVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          role="listbox"
          aria-label="Search results"
          tabIndex={-1}
          onKeyDown={handleKeyDown}
          className={cn(
            'absolute top-full left-0 right-0 mt-2 z-50',
            'w-full max-w-2xl',
            'rounded-xl border border-border/50',
            'bg-card/80 backdrop-blur-xl',
            'shadow-lg shadow-black/10 dark:shadow-black/30',
            'overflow-hidden'
          )}
          style={{ maxHeight: '500px' }}
        >
          {/* Subtle border glow */}
          <div className="pointer-events-none absolute inset-0 rounded-xl ring-1 ring-inset ring-primary/5" />

          <div className="overflow-y-auto" style={{ maxHeight: '500px' }}>
            {!hasResults && q ? (
              <EmptyState query={query} />
            ) : (
              <>
                {/* ── Leads Section ─────────────────────────────── */}
                {filteredLeads.length > 0 && (
                  <div>
                    <SectionHeader icon={Users} title="Leads" count={filteredLeads.length} />
                    <div className="px-2 pb-1 space-y-0.5">
                      {filteredLeads.map((lead) => {
                        const idx = runningIndex++;
                        const isActive = activeIndex === idx;
                        return (
                          <button
                            key={lead.id}
                            ref={(el) => { itemRefs.current[idx] = el; }}
                            role="option"
                            aria-selected={isActive}
                            onClick={() => { onSelect('lead', lead.id); onClose(); }}
                            className={cn(
                              'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors',
                              'cursor-pointer outline-none',
                              isActive
                                ? 'bg-primary/5 ring-1 ring-inset ring-primary/20'
                                : 'hover:bg-accent/50'
                            )}
                            onMouseEnter={() => setActiveIndex(idx)}
                          >
                            {/* Left border indicator when active */}
                            {isActive && (
                              <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-primary" />
                            )}
                            {/* Avatar */}
                            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                              <Building2 className="h-4 w-4 text-primary" />
                            </div>
                            {/* Info */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium truncate">
                                  <HighlightText text={lead.businessName} query={query} />
                                </span>
                                <span
                                  className={cn(
                                    'text-[10px] font-mono font-bold px-1.5 py-0.5 rounded',
                                    scoreColor(lead.score),
                                    scoreBg(lead.score)
                                  )}
                                >
                                  {lead.score}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                                <Globe className="h-3 w-3 shrink-0" />
                                <span className="truncate">
                                  <HighlightText text={lead.website} query={query} />
                                </span>
                                <span className="shrink-0">·</span>
                                <MapPin className="h-3 w-3 shrink-0" />
                                <span className="truncate">{lead.location}</span>
                              </div>
                            </div>
                            {/* Stage badge */}
                            <span
                              className={cn(
                                'shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full',
                                stageVariant(lead.stage)
                              )}
                            >
                              {lead.stage}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* ── Deals Section ─────────────────────────────── */}
                {filteredDeals.length > 0 && (
                  <div className="mt-1">
                    <SectionHeader icon={HandshakeIcon} title="Deals" count={filteredDeals.length} />
                    <div className="px-2 pb-1 space-y-0.5">
                      {filteredDeals.map((deal) => {
                        const idx = runningIndex++;
                        const isActive = activeIndex === idx;
                        return (
                          <button
                            key={deal.id}
                            ref={(el) => { itemRefs.current[idx] = el; }}
                            role="option"
                            aria-selected={isActive}
                            onClick={() => { onSelect('deal', deal.id); onClose(); }}
                            className={cn(
                              'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors',
                              'cursor-pointer outline-none',
                              isActive
                                ? 'bg-primary/5 ring-1 ring-inset ring-primary/20'
                                : 'hover:bg-accent/50'
                            )}
                            onMouseEnter={() => setActiveIndex(idx)}
                          >
                            <div className="h-9 w-9 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
                              <HandshakeIcon className="h-4 w-4 text-emerald-500" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium truncate">
                                  <HighlightText text={deal.name} query={query} />
                                </span>
                                <span className="text-xs font-semibold text-foreground">
                                  {deal.value}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                                <Building2 className="h-3 w-3 shrink-0" />
                                <span className="truncate">
                                  <HighlightText text={deal.company} query={query} />
                                </span>
                                <span className="shrink-0">·</span>
                                <TrendingUp className={cn('h-3 w-3 shrink-0', probabilityColor(deal.probability))} />
                                <span className={cn('font-medium', probabilityColor(deal.probability))}>
                                  {probabilityLabel(deal.probability)} ({deal.probability}%)
                                </span>
                              </div>
                            </div>
                            <span
                              className={cn(
                                'shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full',
                                stageVariant(deal.stage)
                              )}
                            >
                              {deal.stage}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* ── Actions Section ───────────────────────────── */}
                {filteredActions.length > 0 && (
                  <div className="mt-1">
                    <SectionHeader icon={Zap} title="Actions" count={filteredActions.length} />
                    <div className="px-2 pb-1 space-y-0.5">
                      {filteredActions.map((action) => {
                        const idx = runningIndex++;
                        const isActive = activeIndex === idx;
                        const Icon = action.icon;
                        return (
                          <button
                            key={action.id}
                            ref={(el) => { itemRefs.current[idx] = el; }}
                            role="option"
                            aria-selected={isActive}
                            onClick={() => { onSelect('action', action.id); onClose(); }}
                            className={cn(
                              'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors',
                              'cursor-pointer outline-none',
                              isActive
                                ? 'bg-primary/5 ring-1 ring-inset ring-primary/20'
                                : 'hover:bg-accent/50'
                            )}
                            onMouseEnter={() => setActiveIndex(idx)}
                          >
                            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                              <Icon className={cn('h-4 w-4', action.color)} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <span className="text-sm font-medium truncate block">
                                <HighlightText text={action.label} query={query} />
                              </span>
                              <span className="text-xs text-muted-foreground block mt-0.5 truncate">
                                {action.description}
                              </span>
                            </div>
                            <ArrowRight className="h-4 w-4 text-muted-foreground/50 shrink-0" />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* ── Help Section ──────────────────────────────── */}
                {filteredHelp.length > 0 && (
                  <div className="mt-1">
                    <SectionHeader icon={BookOpen} title="Help" count={filteredHelp.length} />
                    <div className="px-2 pb-3 space-y-0.5">
                      {filteredHelp.map((help) => {
                        const idx = runningIndex++;
                        const isActive = activeIndex === idx;
                        const Icon = help.icon;
                        return (
                          <button
                            key={help.id}
                            ref={(el) => { itemRefs.current[idx] = el; }}
                            role="option"
                            aria-selected={isActive}
                            onClick={() => { onSelect('help', help.id); onClose(); }}
                            className={cn(
                              'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors',
                              'cursor-pointer outline-none',
                              isActive
                                ? 'bg-primary/5 ring-1 ring-inset ring-primary/20'
                                : 'hover:bg-accent/50'
                            )}
                            onMouseEnter={() => setActiveIndex(idx)}
                          >
                            <div className="h-9 w-9 rounded-lg bg-muted/60 flex items-center justify-center shrink-0">
                              <Icon className="h-4 w-4 text-muted-foreground" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <span className="text-sm font-medium truncate block">
                                <HighlightText text={help.label} query={query} />
                              </span>
                              <span className="text-xs text-muted-foreground block mt-0.5 truncate">
                                {help.description}
                              </span>
                            </div>
                            <ChevronDown className="h-4 w-4 text-muted-foreground/50 -rotate-90 shrink-0" />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* ── Footer ─────────────────────────────────────── */}
                <div className="flex items-center justify-between px-4 py-2 border-t border-border/30 bg-muted/20">
                  <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <kbd className="inline-flex items-center h-4 px-1 rounded bg-muted font-mono text-[9px]">↑</kbd>
                      <kbd className="inline-flex items-center h-4 px-1 rounded bg-muted font-mono text-[9px]">↓</kbd>
                      Navigate
                    </span>
                    <span className="flex items-center gap-1">
                      <kbd className="inline-flex items-center h-4 px-1.5 rounded bg-muted font-mono text-[9px]">↵</kbd>
                      Select
                    </span>
                    <span className="flex items-center gap-1">
                      <kbd className="inline-flex items-center h-4 px-1.5 rounded bg-muted font-mono text-[9px]">esc</kbd>
                      Close
                    </span>
                  </div>
                  <span className="text-[10px] text-muted-foreground">
                    {totalResults} result{totalResults !== 1 ? 's' : ''}
                  </span>
                </div>
              </>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
