import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { db } from '@/lib/db';
import { canUserAccessLead } from '@/lib/lead-resolution';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(_request, async (user) => {
    try {
      const { id } = await params;

      // ACCOUNT ISOLATION: reminders belong to the lead — owner / same
      // non-null org only (previously any lead id was readable).
      const lead = await db.lead.findUnique({
        where: { id },
        select: { id: true, userId: true, orgId: true },
      });
      if (!lead) {
        return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
      }
      if (!canUserAccessLead(lead, user)) {
        return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
      }

      const reminders = await db.followUpReminder.findMany({
        where: { leadId: id },
        orderBy: { dueAt: 'asc' },
      });

      return NextResponse.json(reminders);
    } catch (error) {
      console.error('Failed to fetch lead reminders:', error);
      return NextResponse.json({ error: 'Failed to fetch lead reminders' }, { status: 500 });
    }
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async (user) => {
    try {
      const { id } = await params;
      const body = await request.json();
      const { message, dueAt } = body;

      if (!message || !dueAt) {
        return NextResponse.json({ error: 'Message and dueAt are required' }, { status: 400 });
      }

      // ACCOUNT ISOLATION: same owner/org rule as GET.
      const lead = await db.lead.findUnique({
        where: { id },
        select: { id: true, userId: true, orgId: true },
      });
      if (!lead) {
        return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
      }
      if (!canUserAccessLead(lead, user)) {
        return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
      }

      const reminder = await db.followUpReminder.create({
        data: {
          leadId: id,
          message,
          dueAt: new Date(dueAt),
        },
      });

      // Update lead.followUpAt to the earliest pending reminder
      const earliestReminder = await db.followUpReminder.findFirst({
        where: { leadId: id, completed: false },
        orderBy: { dueAt: 'asc' },
      });

      if (earliestReminder) {
        await db.lead.update({
          where: { id },
          data: { followUpAt: earliestReminder.dueAt },
        });
      }

      return NextResponse.json(reminder, { status: 201 });
    } catch (error) {
      console.error('Failed to create reminder:', error);
      return NextResponse.json({ error: 'Failed to create reminder' }, { status: 500 });
    }
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async (user) => {
    try {
      const { id: leadId } = await params;
      const body = await request.json();
      const { reminderId, completed } = body;

      if (!reminderId) {
        return NextResponse.json({ error: 'reminderId is required' }, { status: 400 });
      }

      // ACCOUNT ISOLATION: the reminder must belong to a lead the caller
      // can access, otherwise any reminder id in the system could be
      // flipped by ID.
      const lead = await db.lead.findUnique({
        where: { id: leadId },
        select: { id: true, userId: true, orgId: true },
      });
      if (!lead) {
        return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
      }
      if (!canUserAccessLead(lead, user)) {
        return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
      }

      const reminder = await db.followUpReminder.update({
        where: { id: reminderId },
        data: { completed: completed ?? true },
      });

      // Defense in depth: the updated reminder must actually belong to
      // the lead in the URL (both were previously unscoped).
      if (reminder.leadId !== leadId) {
        return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
      }

      // Update lead.followUpAt to the next earliest pending reminder
      const earliestReminder = await db.followUpReminder.findFirst({
        where: { leadId, completed: false },
        orderBy: { dueAt: 'asc' },
      });

      await db.lead.update({
        where: { id: leadId },
        data: { followUpAt: earliestReminder?.dueAt ?? null },
      });

      return NextResponse.json(reminder);
    } catch (error) {
      console.error('Failed to update reminder:', error);
      return NextResponse.json({ error: 'Failed to update reminder' }, { status: 500 });
    }
  });
}
