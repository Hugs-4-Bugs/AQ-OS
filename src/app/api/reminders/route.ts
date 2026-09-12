import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withPermission } from '@/lib/auth-middleware';

export async function GET(request: NextRequest) {
  return withPermission(request, 'leads:read', async () => {
  try {
    const { searchParams } = new URL(request.url);
    const overdue = searchParams.get('overdue') === 'true';

    const now = new Date();

    const where = {
      completed: false,
      ...(overdue ? { dueAt: { lt: now } } : {}),
    };

    const reminders = await db.followUpReminder.findMany({
      where,
      include: {
        lead: {
          select: {
            id: true,
            businessName: true,
            niche: true,
            country: true,
            stage: true,
          },
        },
      },
      orderBy: { dueAt: 'asc' },
    });

    return NextResponse.json(reminders);
  } catch (error) {
    console.error('Failed to fetch reminders:', error);
    return NextResponse.json({ error: 'Failed to fetch reminders' }, { status: 500 });
  }
  });
}
