import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

function slugFromUrl(request: NextRequest): string {
  // /api/support/kb/articles/<slug>
  const parts = request.nextUrl.pathname.split('/').filter(Boolean);
  return parts[parts.length - 1] || '';
}

// ─── GET /api/support/kb/articles/[slug] — full article ─────────────
// Returns the published article plus related articles from the same
// category (for the "related articles" navigation).

export async function GET(request: NextRequest) {
  try {
    const slug = slugFromUrl(request);

    const article = await db.knowledgeBaseArticle.findUnique({
      where: { slug },
      select: {
        id: true,
        slug: true,
        title: true,
        category: true,
        subcategory: true,
        summary: true,
        content: true,
        tags: true,
        helpfulCount: true,
        notHelpfulCount: true,
        published: true,
        updatedAt: true,
        createdAt: true,
      },
    });

    if (!article || !article.published) {
      return NextResponse.json({ error: 'Article not found' }, { status: 404 });
    }

    const related = await db.knowledgeBaseArticle.findMany({
      where: { published: true, category: article.category, id: { not: article.id } },
      select: { slug: true, title: true, summary: true },
      orderBy: { sortOrder: 'asc' },
      take: 4,
    });

    let tags: string[] = [];
    try {
      const parsed = JSON.parse(article.tags || '[]');
      if (Array.isArray(parsed)) tags = parsed.map(String);
    } catch {
      tags = [];
    }

    return NextResponse.json({
      article: { ...article, tags },
      related,
    });
  } catch (err) {
    console.error('[KB] article error:', err);
    return NextResponse.json({ error: 'Failed to load article' }, { status: 500 });
  }
}
