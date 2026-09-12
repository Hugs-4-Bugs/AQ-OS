import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withAuth } from '@/lib/auth-middleware';

// ─── GET /api/feedback/[id] — detail view for user ────────────────

export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const id = request.nextUrl.pathname.split('/').pop();

      const feedback = await db.feedbackReport.findUnique({
        where: { id },
        include: {
          comments: {
            where: { isInternal: false },
            orderBy: { createdAt: 'asc' },
          },
          statusHistory: {
            orderBy: { createdAt: 'asc' },
          },
        },
      });

      if (!feedback) {
        return NextResponse.json({ error: 'Feedback not found' }, { status: 404 });
      }

      if (feedback.userId !== user.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
      }

      return NextResponse.json({ feedback });
    } catch (err) {
      console.error('[Feedback] GET detail error:', err);
      return NextResponse.json({ error: 'Failed to load feedback' }, { status: 500 });
    }
  });
}
