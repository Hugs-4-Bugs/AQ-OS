import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { findKbCategory } from '@/lib/support-constants';

// ─── GET /api/support/kb/articles — list & search the knowledge base ─
//
// Public-to-authenticated-app content (published articles only).
// Search scoring considers: title, summary, content, category label,
// tags and keywords — with weighted phrase/prefix matching so useful
// results appear without requiring exact title matches.
//
// Query params:
//   q        — free-text search (optional)
//   category — filter by category value (optional)
//   limit    — max results (default 30, max 50)

interface ScoredArticle {
  id: string;
  slug: string;
  title: string;
  category: string;
  subcategory: string | null;
  summary: string;
  tags: string[];
  helpfulCount: number;
  notHelpfulCount: number;
  updatedAt: Date;
  score: number;
}

function parseJsonArray(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const q = (url.searchParams.get('q') || '').trim().toLowerCase();
    const category = url.searchParams.get('category') || '';
    const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') || '30', 10) || 30));

    const where = {
      published: true,
      ...(category ? { category } : {}),
    };

    const articles = await db.knowledgeBaseArticle.findMany({
      where,
      select: {
        id: true,
        slug: true,
        title: true,
        category: true,
        subcategory: true,
        summary: true,
        content: true,
        tags: true,
        keywords: true,
        helpfulCount: true,
        notHelpfulCount: true,
        updatedAt: true,
        sortOrder: true,
      },
      orderBy: [{ sortOrder: 'asc' }, { updatedAt: 'desc' }],
    });

    let results: ScoredArticle[] = articles.map((a) => ({
      id: a.id,
      slug: a.slug,
      title: a.title,
      category: a.category,
      subcategory: a.subcategory,
      summary: a.summary,
      tags: parseJsonArray(a.tags),
      helpfulCount: a.helpfulCount,
      notHelpfulCount: a.notHelpfulCount,
      updatedAt: a.updatedAt,
      score: 0,
    }));

    if (q) {
      const terms = q.split(/\s+/).filter(Boolean).slice(0, 12);
      results = results
        .map((a) => {
          const original = articles.find((row) => row.id === a.id)!;
          const content = original.content.toLowerCase();
          const tags = a.tags.map((t) => t.toLowerCase());
          const keywords = parseJsonArray(original.keywords).map((k) => k.toLowerCase());
          const categoryLabel = (findKbCategory(a.category)?.label || a.category).toLowerCase();

          let score = 0;
          for (const term of terms) {
            // Title matches weigh most (exact phrase > prefix > word).
            if (a.title.toLowerCase().includes(term)) score += 12;
            if (a.title.toLowerCase().startsWith(term)) score += 6;
            if (a.summary.toLowerCase().includes(term)) score += 6;
            if (categoryLabel.includes(term)) score += 4;
            if (tags.some((t) => t.includes(term))) score += 5;
            if (keywords.some((k) => k.includes(term))) score += 4;
            if (content.includes(term)) score += 2;
          }
          if (score <= 0) return { ...a, score: 0 };
          // Small popularity boost so well-voted articles rank higher on
          // ties — applied ONLY when the article actually matched a term.
          score += Math.min(2, a.helpfulCount * 0.1);
          return { ...a, score };
        })
        .filter((a) => a.score > 0)
        .sort((x, y) => y.score - x.score);
      results = results.slice(0, limit);
    } else {
      // No query: category listing order (sortOrder) then recency.
      results = results.slice(0, limit).map(({ score: _score, ...rest }) => rest);
    }

    // Strip the raw score from the public payload when searching.
    const payload = results.map((a) => {
      const { score: _score, ...rest } = a as ScoredArticle & { score: number };
      return rest;
    });

    return NextResponse.json({
      articles: payload,
      query: q || null,
      total: payload.length,
    });
  } catch (err) {
    console.error('[KB] search error:', err);
    return NextResponse.json({ error: 'Failed to search knowledge base' }, { status: 500 });
  }
}
