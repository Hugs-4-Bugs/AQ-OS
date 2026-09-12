import { withAuth } from '@/lib/auth-middleware';
import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const { searchParams } = new URL(request.url);
      const status = searchParams.get('status');
      const page = parseInt(searchParams.get('page') || '1', 10);
      const limit = parseInt(searchParams.get('limit') || '20', 10);
      const skip = (page - 1) * limit;

      // Build where clause
      const where: Record<string, unknown> = {
        userId: user.id,
      };

      if (status) {
        where.status = status;
      }

      const [sequences, total] = await Promise.all([
        db.outreachSequence.findMany({
          where,
          include: {
            sequenceSteps: {
              orderBy: { order: 'asc' },
            },
            enrollments: {
              select: {
                id: true,
                status: true,
              },
            },
          },
          orderBy: { updatedAt: 'desc' },
          skip,
          take: limit,
        }),
        db.outreachSequence.count({ where }),
      ]);

      // Enrich with enrollment counts
      const enriched = sequences.map((seq) => ({
        ...seq,
        enrollmentCounts: {
          total: seq.enrollments.length,
          active: seq.enrollments.filter((e) => e.status === 'active').length,
          paused: seq.enrollments.filter((e) => e.status === 'paused').length,
          completed: seq.enrollments.filter((e) => e.status === 'completed').length,
          optedOut: seq.enrollments.filter((e) => e.status === 'opted_out').length,
        },
      }));

      return NextResponse.json({
        success: true,
        data: {
          sequences: enriched,
          pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
          },
        },
      });
    } catch (error) {
      console.error('[Sequences/List] Error:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to list sequences' },
        { status: 500 }
      );
    }
  });
}
