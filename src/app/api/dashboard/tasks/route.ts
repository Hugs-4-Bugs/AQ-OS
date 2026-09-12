import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      // No Task model exists in the Prisma schema.
      // Return empty array so the component can show an empty state or
      // use local state for task management.
      return NextResponse.json({
        data: [],
      });
    } catch (error) {
      console.error('[API] Error fetching tasks:', error);
      return NextResponse.json(
        { data: [], error: 'Failed to fetch tasks' },
        { status: 500 }
      );
    }
  });
}
