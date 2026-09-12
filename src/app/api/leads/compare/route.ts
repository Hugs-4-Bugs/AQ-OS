import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

// POST /api/leads/compare — Compare multiple leads side by side
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    const { leadIds } = (await request.json()) as { leadIds?: string[] };

    if (!Array.isArray(leadIds) || leadIds.length === 0 || leadIds.length > 20) {
      return NextResponse.json(
        { error: 'leadIds must be a non-empty array (max 20)' },
        { status: 400 },
      );
    }

    const leads = await db.lead.findMany({
      where: { id: { in: leadIds }, userId: user.id },
    });

    if (leads.length === 0) {
      return NextResponse.json({ error: 'No leads found' }, { status: 404 });
    }

    // Composite score: average of the four scoring fields
    const score = (l: (typeof leads)[number]) =>
      Math.round(
        ((l.replyScore ?? 0) + (l.conversionScore ?? 0) +
         (l.urgencyScore ?? 0) + (l.revenuePotentialScore ?? 0)) / 4,
      );

    const scored = leads.map((l) => ({ id: l.id, score: score(l) }));

    const avgScore = Math.round(scored.reduce((s, c) => s + c.score, 0) / scored.length);
    const highest = scored.reduce((a, b) => (b.score > a.score ? b : a));

    // Sum estimated revenue (map string tiers to numeric values)
    const tierValues: Record<string, number> = { high: 10_000, medium: 5_000, low: 1_000 };
    const totalValue = leads.reduce((sum, l) => {
      if (typeof l.estimatedRevenue === 'number') return sum + l.estimatedRevenue;
      return sum + (tierValues[String(l.estimatedRevenue)] ?? 0);
    }, 0);

    // Count leads per pipeline stage
    const stages = leads.reduce<Record<string, number>>((acc, l) => {
      const s = l.stage || 'unknown';
      acc[s] = (acc[s] || 0) + 1;
      return acc;
    }, {});

    return NextResponse.json({
      leads,
      comparison: {
        avgScore,
        highestScore: { leadId: highest.id, score: highest.score },
        totalValue,
        stages,
      },
    });
  } catch (error) {
    if (error instanceof Error && 'statusCode' in error) {
      return NextResponse.json(
        { error: error.message },
        { status: (error as { statusCode: number }).statusCode },
      );
    }
    console.error('Error comparing leads:', error);
    return NextResponse.json({ error: 'Failed to compare leads' }, { status: 500 });
  }
}
