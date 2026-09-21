import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withAuth } from '@/lib/auth-middleware';

// POST /api/settings/clear-data - Delete all leads, deals, communications,
// activities and reminders for the AUTHENTICATED USER ONLY.
//
// ACCOUNT ISOLATION: every deleteMany() below previously had NO where
// clause — a single request from any org-level admin wiped those tables
// for EVERY tenant in the database. The deletes are now scoped to leads
// owned by the caller, with child rows scoped through the lead relation.
export async function POST(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const leadScope = { userId: user.id };

      // Delete in order respecting foreign key constraints.
      // Child tables are scoped via `lead: leadScope` so only records that
      // belong to the caller's own leads are removed.
      await db.$transaction([
        db.followUpReminder.deleteMany({ where: { lead: leadScope } }),
        db.leadActivity.deleteMany({ where: { lead: leadScope } }),
        db.communication.deleteMany({ where: { lead: leadScope } }),
        db.deal.deleteMany({ where: { lead: leadScope } }),
        db.lead.deleteMany({ where: leadScope }),
      ]);

      return NextResponse.json({ success: true, message: 'All your data has been cleared' });
    } catch (error) {
      console.error('Error clearing data:', error);
      return NextResponse.json(
        { error: 'Failed to clear data' },
        { status: 500 }
      );
    }
  });
}
