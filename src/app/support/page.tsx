'use client';

// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Support Center (main page, /support)
//
// Professional SaaS support layout:
//   A. "How can we help?" search (searches the REAL knowledge base)
//   B. Quick support categories (KB taxonomy)
//   C. Popular / recent articles
//   D. My Tickets (the user's own tickets — server-scoped)
//   E. Escalation: Contact Support / Submit a Ticket
//
// Mobile-first responsive: single column on phones, two-column
// category/article layout from md, internal scrolling, no page-level
// horizontal overflow at any width.
// ═══════════════════════════════════════════════════════════════════

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Search,
  Rocket,
  SearchCheck,
  Send,
  Sparkles,
  Zap,
  CreditCard,
  ShieldCheck,
  Wrench,
  Plug,
  ArrowLeft,
  ArrowRight,
  LifeBuoy,
  FileText,
  Loader2,
  ChevronRight,
  Inbox,
  Ticket as TicketIcon,
  MessageSquare,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { KB_CATEGORIES, STATUS_LABELS, type TicketStatus } from '@/lib/support-constants';
import { useCurrentUser, type AuthState } from '@/hooks/use-current-user';

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Rocket,
  Search: SearchCheck,
  Send,
  Sparkles,
  Zap,
  CreditCard,
  ShieldCheck,
  Wrench,
  Plug,
};

interface KbArticleLite {
  id: string;
  slug: string;
  title: string;
  category: string;
  summary: string;
  tags: string[];
  helpfulCount?: number;
}

interface TicketLite {
  id: string;
  ticketNumber: string;
  subject: string;
  category: string;
  status: string;
  priority: string;
  createdAt: string;
  lastActivityAt: string;
  assignedToName: string | null;
  messageCount: number;
}

const STATUS_STYLES: Record<string, string> = {
  OPEN: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30',
  IN_PROGRESS: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30',
  WAITING_FOR_USER: 'bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/30',
  RESOLVED: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
  CLOSED: 'bg-muted text-muted-foreground border-border',
};

// debounced fetch helper for search
function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

export default function SupportCenterPage() {
  const { user, state } = useCurrentUser();
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounced(query, 300);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [articles, setArticles] = useState<KbArticleLite[] | null>(null);
  const [articlesLoading, setArticlesLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [tickets, setTickets] = useState<TicketLite[] | null>(null);
  const [ticketsLoading, setTicketsLoading] = useState(true);
  const resultsRef = useRef<HTMLDivElement | null>(null);

  const isSearch = debouncedQuery.trim().length > 0;

  // ─── Load articles (browse or search) ─────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams();
    if (activeCategory) params.set('category', activeCategory);
    if (isSearch) params.set('q', debouncedQuery.trim());
    params.set('limit', '30');

    if (isSearch) setSearching(true);
    else setArticlesLoading(true);

    fetch(`/api/support/kb/articles?${params.toString()}`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : { articles: [] }))
      .then((data) => {
        if (cancelled) return;
        setArticles(data.articles || []);
      })
      .catch(() => {
        if (!cancelled) setArticles([]);
      })
      .finally(() => {
        if (cancelled) return;
        setArticlesLoading(false);
        setSearching(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, activeCategory, isSearch]);

  // ─── Load the user's tickets ──────────────────────────────────────
  const loadTickets = useCallback(() => {
    if (state !== 'authenticated') {
      setTickets(null);
      setTicketsLoading(false);
      return;
    }
    setTicketsLoading(true);
    fetch('/api/support/tickets?pageSize=10', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : { tickets: [] }))
      .then((data) => setTickets(data.tickets || []))
      .catch(() => setTickets([]))
      .finally(() => setTicketsLoading(false));
  }, [state]);

  useEffect(() => {
    loadTickets();
  }, [loadTickets]);

  const categoryArticles = useMemo(() => {
    if (!articles || isSearch || activeCategory) return null;
    // Group by category for the browse view (first 3 per category).
    const byCat: Record<string, KbArticleLite[]> = {};
    for (const a of articles) {
      (byCat[a.category] ||= []).push(a);
    }
    return byCat;
  }, [articles, isSearch, activeCategory]);

  // ─── Sign-in gate ─────────────────────────────────────────────────
  if (state === 'unauthenticated') {
    return (
      <main className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <LifeBuoy className="h-6 w-6 text-primary" />
          </span>
          <h1 className="mt-4 text-lg font-bold text-foreground">Sign in to use the Support Center</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            The Support Center is available to signed-in AcquisitionOS users.
          </p>
          <Button asChild className="mt-5 w-full">
            <a href="/?next=/support">Go to sign in</a>
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background">
      {/* ─── Header band ──────────────────────────────────────────── */}
      <header className="border-b border-border bg-gradient-to-b from-primary/5 via-card to-card">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 pt-6 pb-8">
          <div className="flex items-center justify-between gap-3">
            <a
              href="/"
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground min-h-[40px]"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to app
            </a>
            <Button asChild size="sm" className="gap-2 min-h-[40px]">
              <a href="/support/new">
                <LifeBuoy className="h-4 w-4" />
                Submit a Ticket
              </a>
            </Button>
          </div>

          <div className="mt-6 text-center">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              How can we help?
            </h1>
            <p className="mt-1.5 text-sm sm:text-base text-muted-foreground">
              Search for answers, guides, and troubleshooting — or reach our support team.
            </p>
          </div>

          {/* Search — real KB search */}
          <div className="relative mx-auto mt-5 max-w-2xl">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search for answers, guides, and troubleshooting..."
              aria-label="Search the knowledge base"
              className="h-12 rounded-xl pl-10 pr-4 text-base shadow-sm"
            />
            {searching && (
              <Loader2 className="absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 sm:px-6 py-8">
        {/* ─── Search results ───────────────────────────────────────── */}
        {isSearch ? (
          <section ref={resultsRef} aria-live="polite">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {articlesLoading || searching
                ? 'Searching...'
                : `${articles?.length ?? 0} result${articles?.length === 1 ? '' : 's'} for “${debouncedQuery.trim()}”`}
            </h2>
            <div className="mt-4 space-y-3">
              {articlesLoading || searching ? (
                Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)
              ) : articles && articles.length > 0 ? (
                articles.map((a) => (
                  <a
                    key={a.id}
                    href={`/support/article/${a.slug}`}
                    className="block rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-muted/30"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="font-semibold text-foreground break-words">{a.title}</h3>
                        <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{a.summary}</p>
                      </div>
                      <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                    </div>
                    <Badge variant="outline" className="mt-2 text-[10px] whitespace-normal max-w-full">
                      {KB_CATEGORIES.find((c) => c.value === a.category)?.label || a.category}
                    </Badge>
                  </a>
                ))
              ) : (
                <div className="rounded-xl border border-dashed border-border bg-muted/20 p-8 text-center">
                  <p className="text-base font-semibold text-foreground">We couldn&apos;t find an answer.</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Try different keywords, or let our support team help you directly.
                  </p>
                  <Button asChild className="mt-4 gap-2">
                    <a href={`/support/new?subject=${encodeURIComponent(debouncedQuery.trim())}&category=&prefillQuery=${encodeURIComponent(debouncedQuery.trim())}`}>
                      <LifeBuoy className="h-4 w-4" />
                      Create a Support Ticket
                    </a>
                  </Button>
                </div>
              )}
            </div>
          </section>
        ) : activeCategory ? (
          /* ─── Category article list ──────────────────────────────── */
          <section>
            <button
              onClick={() => setActiveCategory(null)}
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground min-h-[40px]"
            >
              <ArrowLeft className="h-4 w-4" />
              All categories
            </button>
            <h2 className="mt-2 text-xl font-bold text-foreground flex items-center gap-2">
              {(() => {
                const Icon = ICONS[KB_CATEGORIES.find((c) => c.value === activeCategory)?.icon || 'Rocket'] || Rocket;
                return <Icon className="h-5 w-5 text-primary" />;
              })()}
              {KB_CATEGORIES.find((c) => c.value === activeCategory)?.label}
            </h2>
            <div className="mt-4 space-y-3">
              {articlesLoading ? (
                Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)
              ) : articles && articles.length > 0 ? (
                articles.map((a) => (
                  <a
                    key={a.id}
                    href={`/support/article/${a.slug}`}
                    className="block rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-muted/30"
                  >
                    <h3 className="font-semibold text-foreground break-words">{a.title}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{a.summary}</p>
                  </a>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No articles in this category yet.</p>
              )}
            </div>
          </section>
        ) : (
          /* ─── Browse: categories + popular articles ────────────────── */
          <>
            <section aria-label="Support categories">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Browse by category
              </h2>
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {KB_CATEGORIES.map((cat) => {
                  const Icon = ICONS[cat.icon] || Rocket;
                  return (
                    <button
                      key={cat.value}
                      onClick={() => setActiveCategory(cat.value)}
                      className="group rounded-xl border border-border bg-card p-4 text-left transition-all hover:border-primary/40 hover:shadow-sm min-h-[96px]"
                    >
                      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                        <Icon className="h-4.5 w-4.5 text-primary" />
                      </span>
                      <h3 className="mt-2.5 font-semibold text-foreground">{cat.label}</h3>
                      <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{cat.description}</p>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Popular articles — top 6 across all categories */}
            <section className="mt-8" aria-label="Popular articles">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Popular articles
              </h2>
              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                {articlesLoading ? (
                  Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)
                ) : (
                  (articles || []).slice(0, 6).map((a) => (
                    <a
                      key={a.id}
                      href={`/support/article/${a.slug}`}
                      className="flex items-start justify-between gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-muted/30"
                    >
                      <div className="min-w-0">
                        <h3 className="font-medium text-foreground break-words">{a.title}</h3>
                        <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{a.summary}</p>
                      </div>
                      <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    </a>
                  ))
                )}
              </div>
            </section>
          </>
        )}

        {/* ─── My Tickets ─────────────────────────────────────────── */}
        <section className="mt-10" aria-label="My support tickets">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              My Tickets
            </h2>
            <Button asChild variant="ghost" size="sm" className="gap-1.5 min-h-[36px]">
              <a href="/support/new">
                <MessageSquare className="h-3.5 w-3.5" />
                New request
              </a>
            </Button>
          </div>

          {state === 'loading' || ticketsLoading ? (
            <div className="mt-4 space-y-2">
              <Skeleton className="h-16 w-full rounded-xl" />
              <Skeleton className="h-16 w-full rounded-xl" />
            </div>
          ) : !tickets || tickets.length === 0 ? (
            <div className="mt-4 rounded-xl border border-dashed border-border bg-muted/20 p-6 text-center">
              <Inbox className="mx-auto h-6 w-6 text-muted-foreground" />
              <p className="mt-2 text-sm text-muted-foreground">
                No support tickets yet. When you contact support, your tickets appear here.
              </p>
            </div>
          ) : (
            <ul className="mt-4 space-y-2">
              {tickets.map((t) => (
                <li key={t.id}>
                  <Link
                    href={`/support/tickets/${t.id}`}
                    className="block rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-muted/30"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium text-foreground break-words">{t.subject}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          <span className="font-mono">{t.ticketNumber}</span>
                          {' · '}
                          {new Date(t.createdAt).toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
                          {t.assignedToName ? ` · Agent: ${t.assignedToName}` : ''}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Badge
                          variant="outline"
                          className={cn('text-[10px] whitespace-normal', STATUS_STYLES[t.status] || '')}
                        >
                          {STATUS_LABELS[t.status as TicketStatus] || t.status}
                        </Badge>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ─── Escalation band ──────────────────────────────────────── */}
        <section className="mt-10" aria-label="Contact support">
          <div className="rounded-2xl border border-border bg-gradient-to-r from-primary/10 via-card to-card p-6 sm:p-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="min-w-0">
                <h2 className="text-lg font-bold text-foreground">Didn&apos;t find what you were looking for?</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Our support team is ready to help — most tickets get a reply within one business day.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-2 shrink-0">
                <Button asChild variant="outline" className="gap-2 min-h-[44px]">
                  <a href="/support/new">
                    <TicketIcon className="h-4 w-4" />
                    Contact Support
                  </a>
                </Button>
                <Button asChild className="gap-2 min-h-[44px]">
                  <a href="/support/new">
                    <LifeBuoy className="h-4 w-4" />
                    Submit a Ticket
                  </a>
                </Button>
              </div>
            </div>
          </div>
        </section>

        {/* Footer spacing for sticky-footer layout */}
        <div className="h-10" aria-hidden="true" />
      </div>
    </main>
  );
}
