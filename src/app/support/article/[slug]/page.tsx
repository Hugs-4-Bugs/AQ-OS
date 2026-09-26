'use client';

// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Knowledge Base Article (/support/article/[slug])
//
// Full article view with:
//   • real article content from the DB (verified features only)
//   • Helpful / Not helpful feedback (persisted per user)
//   • related articles navigation
//   • "Didn't find what you were looking for?" escalation →
//     Contact Support / Submit a Ticket (real ticket flow with the
//     article + search context prefilled)
// ═══════════════════════════════════════════════════════════════════

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  ThumbsUp,
  ThumbsDown,
  LifeBuoy,
  Ticket as TicketIcon,
  CalendarDays,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { KB_CATEGORIES } from '@/lib/support-constants';
import { useCurrentUser } from '@/hooks/use-current-user';

interface Article {
  id: string;
  slug: string;
  title: string;
  category: string;
  subcategory: string | null;
  summary: string;
  content: string;
  tags: string[];
  helpfulCount: number;
  notHelpfulCount: number;
  updatedAt: string;
}

interface RelatedArticle {
  slug: string;
  title: string;
  summary: string;
}

/** Minimal markdown-style renderer for **bold** and paragraph breaks. */
function renderContent(content: string) {
  return content.split(/\n\n+/).map((block, i) => {
    const isBullet = block.trimStart().startsWith('- ');
    if (isBullet) {
      const items = block
        .split('\n')
        .map((l) => l.trim().replace(/^- /, ''))
        .filter(Boolean);
      return (
        <ul key={i} className="my-3 space-y-1.5 pl-1">
          {items.map((item, j) => (
            <li key={j} className="flex items-start gap-2 text-sm text-foreground/90">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
              <span className="min-w-0 break-words [overflow-wrap:anywhere]">{renderInline(item)}</span>
            </li>
          ))}
        </ul>
      );
    }
    return (
      <p key={i} className="my-3 text-sm leading-relaxed text-foreground/90">
        {renderInline(block)}
      </p>
    );
  });
}

function renderInline(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={i} className="font-semibold text-foreground">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <React.Fragment key={i}>{part}</React.Fragment>;
  });
}

export default function ArticlePage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug;
  const { state } = useCurrentUser();

  const [article, setArticle] = useState<Article | null>(null);
  const [related, setRelated] = useState<RelatedArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [myVote, setMyVote] = useState<boolean | null>(null);
  const [voting, setVoting] = useState(false);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    setLoading(true);
    fetch(`/api/support/kb/articles/${slug}`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        if (data?.article) {
          setArticle(data.article);
          setRelated(data.related || []);
        } else {
          setNotFound(true);
        }
      })
      .catch(() => !cancelled && setNotFound(true))
      .finally(() => !cancelled && setLoading(false));

    // Load the user's existing vote (only meaningful when signed in).
    if (state === 'authenticated') {
      fetch(`/api/support/kb/articles/${slug}/feedback`, { credentials: 'include' })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => !cancelled && setMyVote(data?.helpful ?? null))
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [slug, state]);

  const vote = async (helpful: boolean) => {
    if (state !== 'authenticated') {
      toast.error('Sign in to rate this article.');
      return;
    }
    setVoting(true);
    try {
      const res = await fetch(`/api/support/kb/articles/${slug}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ helpful }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || 'Could not record your feedback.');
        return;
      }
      setMyVote(helpful);
      if (article) {
        setArticle({
          ...article,
          helpfulCount: data.helpfulCount,
          notHelpfulCount: data.notHelpfulCount,
        });
      }
      toast.success(helpful ? 'Thanks for your feedback!' : 'Thanks — we will improve this article.');
    } catch {
      toast.error('Network error. Please try again.');
    } finally {
      setVoting(false);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-background">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 py-8 space-y-4">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-10 w-3/4" />
          <Skeleton className="h-64 w-full rounded-2xl" />
        </div>
      </main>
    );
  }

  if (notFound || !article) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-8 text-center">
          <h1 className="text-lg font-bold text-foreground">Article not found</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            This article does not exist or is no longer published.
          </p>
          <Button asChild className="mt-5 w-full">
            <a href="/support">Back to Support Center</a>
          </Button>
        </div>
      </main>
    );
  }

  const categoryLabel = KB_CATEGORIES.find((c) => c.value === article.category)?.label || article.category;

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 py-8">
        <Link
          href="/support"
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground min-h-[40px]"
        >
          <ArrowLeft className="h-4 w-4" />
          Support Center
        </Link>

        <div className="mt-4">
          <Badge variant="outline" className="text-[10px] whitespace-normal max-w-full">
            {categoryLabel}
          </Badge>
          <h1 className="mt-2.5 text-2xl sm:text-3xl font-bold tracking-tight text-foreground break-words">
            {article.title}
          </h1>
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="h-3.5 w-3.5" />
              Updated{' '}
              {new Date(article.updatedAt).toLocaleDateString('en-IN', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </span>
            <span>
              {article.helpfulCount} found this helpful
            </span>
          </p>
        </div>

        {/* Article body */}
        <article className="mt-6 rounded-2xl border border-border bg-card p-5 sm:p-8 shadow-sm">
          <p className="text-base font-medium text-foreground">{article.summary}</p>
          <div className="mt-2">{renderContent(article.content)}</div>

          {article.tags.length > 0 && (
            <div className="mt-6 flex flex-wrap gap-1.5 border-t border-border pt-4">
              {article.tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="text-[10px] whitespace-normal">
                  {tag}
                </Badge>
              ))}
            </div>
          )}
        </article>

        {/* Helpful / Not helpful */}
        <section className="mt-6 rounded-2xl border border-border bg-muted/30 p-5 text-center" aria-label="Article feedback">
          <p className="text-sm font-semibold text-foreground">Was this article helpful?</p>
          <div className="mt-3 flex items-center justify-center gap-3">
            <Button
              variant={myVote === true ? 'default' : 'outline'}
              size="sm"
              className="gap-2 min-h-[44px] px-6"
              disabled={voting}
              onClick={() => vote(true)}
            >
              {voting && myVote !== false ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ThumbsUp className="h-4 w-4" />
              )}
              Yes, helpful
            </Button>
            <Button
              variant={myVote === false ? 'default' : 'outline'}
              size="sm"
              className="gap-2 min-h-[44px] px-6"
              disabled={voting}
              onClick={() => vote(false)}
            >
              {voting && myVote !== true ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ThumbsDown className="h-4 w-4" />
              )}
              Not really
            </Button>
          </div>
        </section>

        {/* Related articles */}
        {related.length > 0 && (
          <section className="mt-8" aria-label="Related articles">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Related articles</h2>
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
              {related.map((r) => (
                <a
                  key={r.slug}
                  href={`/support/article/${r.slug}`}
                  className="group rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-muted/30"
                >
                  <h3 className="font-medium text-foreground break-words group-hover:text-primary">{r.title}</h3>
                  <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{r.summary}</p>
                </a>
              ))}
            </div>
          </section>
        )}

        {/* Escalation — real ticket flow */}
        <section className="mt-8" aria-label="Still need help">
          <div className="rounded-2xl border border-border bg-gradient-to-r from-primary/10 via-card to-card p-6">
            <h2 className="text-base font-bold text-foreground">Didn&apos;t find what you were looking for?</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Our support team can help with anything this article did not solve.
            </p>
            <div className="mt-4 flex flex-col sm:flex-row gap-2">
              <Button asChild variant="outline" className="gap-2 min-h-[44px]">
                <a href={`/support/new?subject=${encodeURIComponent(`Help with: ${article.title}`)}&source=kb_article`}>
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
        </section>

        <div className="h-10" aria-hidden="true" />
      </div>
    </main>
  );
}
