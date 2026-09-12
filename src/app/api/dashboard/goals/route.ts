import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      // No Goal/Milestone tables exist in the schema.
      // Return empty arrays so the component can show an empty state.
      return NextResponse.json({
        data: {
          goals: [],
          milestones: [],
        },
      });
    } catch (error) {
      console.error('[API] Error fetching goals:', error);
      return NextResponse.json(
        { data: { goals: [], milestones: [] }, error: 'Failed to fetch goals' },
        { status: 500 }
      );
    }
  });
}
