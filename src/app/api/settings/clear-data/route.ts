import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withPermission } from '@/lib/auth-middleware';

// POST /api/settings/clear-data - Delete all leads, deals, communications, activities, reminders
export async function POST(request: NextRequest) {
  return withPermission(request, 'admin:access', async () => {
    try {
      // Delete in order respecting foreign key constraints
      await db.$transaction([
        db.followUpReminder.deleteMany(),
        db.leadActivity.deleteMany(),
        db.communication.deleteMany(),
        db.deal.deleteMany(),
        db.lead.deleteMany(),
      ]);

      return NextResponse.json({ success: true, message: 'All data cleared' });
    } catch (error) {
      console.error('Error clearing data:', error);
      return NextResponse.json(
        { error: 'Failed to clear data' },
        { status: 500 }
      );
    }
  });
}
