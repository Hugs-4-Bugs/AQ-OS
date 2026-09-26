import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { db } from '@/lib/db';

function slugFromUrl(request: NextRequest): string {
  // /api/support/kb/articles/<slug>/feedback
  const parts = request.nextUrl.pathname.split('/').filter(Boolean);
  return parts[parts.length - 2] || '';
}

// ─── POST /api/support/kb/articles/[slug]/feedback — helpful vote ───
// Authenticated users only. One vote per user per article (upsert) so a
// user can change their mind but not inflate the counters.

export async function POST(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const slug = slugFromUrl(request);
      const body = await request.json().catch(() => ({}));
      const helpful = body?.helpful;

      if (typeof helpful !== 'boolean') {
        return NextResponse.json(
          { error: 'Provide { helpful: true } or { helpful: false }.' },
          { status: 400 },
        );
      }

      const article = await db.knowledgeBaseArticle.findUnique({
        where: { slug },
        select: { id: true, published: true },
      });
      if (!article || !article.published) {
        return NextResponse.json({ error: 'Article not found' }, { status: 404 });
      }

      // Determine the previous vote so counters stay accurate on changes.
      const existing = await db.kbArticleFeedback.findUnique({
        where: { articleId_userId: { articleId: article.id, userId: user.id } },
      });

      await db.kbArticleFeedback.upsert({
        where: { articleId_userId: { articleId: article.id, userId: user.id } },
        create: { articleId: article.id, userId: user.id, helpful },
        update: { helpful },
      });

      const updated = await db.knowledgeBaseArticle.update({
        where: { id: article.id },
        data: {
          helpfulCount: {
            increment: helpful ? (existing?.helpful ? 0 : 1) : existing?.helpful ? -1 : 0,
          },
          notHelpfulCount: {
            increment: !helpful ? (!existing || existing.helpful ? 1 : 0) : !existing?.helpful ? -1 : 0,
          },
        },
        select: { helpfulCount: true, notHelpfulCount: true },
      });

      return NextResponse.json({ feedback: helpful, ...updated });
    } catch (err) {
      console.error('[KB] feedback error:', err);
      return NextResponse.json({ error: 'Failed to record feedback' }, { status: 500 });
    }
  });
}

// ─── GET — this user's existing vote for the article ────────────────

export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const slug = slugFromUrl(request);
      const article = await db.knowledgeBaseArticle.findUnique({
        where: { slug },
        select: { id: true },
      });
      if (!article) {
        return NextResponse.json({ error: 'Article not found' }, { status: 404 });
      }
      const feedback = await db.kbArticleFeedback.findUnique({
        where: { articleId_userId: { articleId: article.id, userId: user.id } },
        select: { helpful: true },
      });
      return NextResponse.json({ helpful: feedback?.helpful ?? null });
    } catch (err) {
      console.error('[KB] feedback read error:', err);
      return NextResponse.json({ error: 'Failed to load feedback' }, { status: 500 });
    }
  });
}
