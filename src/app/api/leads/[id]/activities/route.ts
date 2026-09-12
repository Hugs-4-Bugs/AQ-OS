import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { recalcLeadScores } from '@/lib/lead-score-recalc';

// GET /api/leads/[id]/activities - Get all activities for a lead
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const lead = await db.lead.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    const activities = await db.leadActivity.findMany({
      where: { leadId: id },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(activities);
  } catch (error) {
    console.error('Error fetching lead activities:', error);
    return NextResponse.json(
      { error: 'Failed to fetch activities' },
      { status: 500 }
    );
  }
}

// POST /api/leads/[id]/activities - Create a new activity for a lead
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const lead = await db.lead.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    if (!body.type || !body.description) {
      return NextResponse.json(
        { error: 'type and description are required' },
        { status: 400 }
      );
    }

    const activity = await db.leadActivity.create({
      data: {
        leadId: id,
        type: body.type,
        description: body.description,
        metadata: body.metadata || null,
      },
    });

    // FIX 2: Recalculate the lead's convScore + rating now that a new
    // activity has been recorded. Fire-and-forget — never block the
    // response or fail the activity creation if the recalc errors.
    void recalcLeadScores(id).catch((err) => {
      console.error('[activities POST] recalcLeadScores failed:', err);
    });

    return NextResponse.json(activity, { status: 201 });
  } catch (error) {
    console.error('Error creating lead activity:', error);
    return NextResponse.json(
      { error: 'Failed to create activity' },
      { status: 500 }
    );
  }
}
