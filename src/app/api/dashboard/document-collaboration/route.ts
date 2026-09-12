import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const fileContexts = await db.fileContext.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        take: 20,
      });

      return NextResponse.json({
        data: {
          documents: fileContexts.map(f => ({
            id: f.id,
            name: f.fileName || 'Untitled',
            type: f.fileType || 'unknown',
            size: f.content?.length || 0,
            lastModified: f.createdAt.toISOString(),
            sharedWith: [] as string[],
          })),
          stats: {
            totalDocuments: fileContexts.length,
            totalSize: fileContexts.reduce((s, f) => s + (f.content?.length || 0), 0),
            recentEdits: 0,
          },
          collaborators: [] as Array<{ name: string; avatar: string; lastActive: string }>,
          recentActivity: [] as Array<{ action: string; document: string; user: string; timestamp: string }>,
        },
      });
    } catch (error) {
      console.error('[API] Document collaboration error:', error);
      return NextResponse.json({ data: null, error: 'Failed to fetch document collaboration' }, { status: 500 });
    }
  });
}
