import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const userId = user.id;

      const analyses = await db.competitorAnalysis.findMany({
        where: { userId },
        select: {
          id: true,
          competitorName: true,
          competitorUrl: true,
          techStack: true,
          seoScore: true,
          socialScore: true,
          strengths: true,
          weaknesses: true,
          opportunities: true,
          threats: true,
          threatLevel: true,
          pricingModel: true,
          estimatedTrafficTier: true,
          differentiationOpportunities: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { createdAt: 'desc' },
      });

      // Parse JSON fields
      const formattedAnalyses = analyses.map(a => ({
        id: a.id,
        userId,
        competitorName: a.competitorName,
        competitorUrl: a.competitorUrl,
        techStack: parseJsonField<string[]>(a.techStack, []),
        seoScore: a.seoScore,
        socialScore: a.socialScore,
        strengths: parseJsonField<string[]>(a.strengths, []),
        weaknesses: parseJsonField<string[]>(a.weaknesses, []),
        opportunities: parseJsonField<string[]>(a.opportunities, []),
        threats: parseJsonField<string[]>(a.threats, []),
        threatLevel: (a.threatLevel as 'low' | 'medium' | 'high') || 'low',
        pricingModel: a.pricingModel,
        estimatedTrafficTier: (a.estimatedTrafficTier as 'low' | 'medium' | 'high') || 'low',
        differentiationOpportunities: parseJsonField<string[]>(a.differentiationOpportunities, []),
        createdAt: a.createdAt.toISOString(),
        updatedAt: a.updatedAt.toISOString(),
      }));

      return NextResponse.json({ data: formattedAnalyses });
    } catch (error) {
      console.error('[API] Competitors error:', error);
      return NextResponse.json({ data: [], error: 'Failed to fetch competitor analyses' }, { status: 500 });
    }
  });
}

function parseJsonField<T>(value: string | null, defaultValue: T): T {
  if (!value) return defaultValue;
  try {
    return JSON.parse(value) as T;
  } catch {
    return defaultValue;
  }
}
