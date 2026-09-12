// ═══════════════════════════════════════════════════════════════════
// POST /api/competitors/analyze — Trigger competitor analysis
// Phase 13: Full or partial competitor analysis
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { analyzeCompetitor } from '@/lib/competitor-intelligence-service';
import { db } from '@/lib/db';

export async function POST(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const body = await request.json();
      const { competitorId, analysisType } = body;

      // Validate required fields
      if (!competitorId) {
        return NextResponse.json(
          { error: 'Missing required field: competitorId' },
          { status: 400 }
        );
      }

      // Validate analysis type
      const validTypes = ['full', 'seo', 'pricing', 'social', 'reviews', 'techstack', 'pagespeed'];
      const type = analysisType || 'full';
      if (!validTypes.includes(type)) {
        return NextResponse.json(
          { error: `Invalid analysisType. Must be one of: ${validTypes.join(', ')}` },
          { status: 400 }
        );
      }

      // Verify competitor exists and belongs to user
      const existing = await db.competitorAnalysis.findFirst({
        where: { id: competitorId, userId: user.id },
      });

      if (!existing) {
        return NextResponse.json(
          { error: 'Competitor not found' },
          { status: 404 }
        );
      }

      // Run analysis
      const analysis = (await analyzeCompetitor(competitorId, user.id)) as {
        seoScore?: number;
        socialScore?: number;
        pricingModel?: string | null;
        techStack?: string[] | null;
        strengths?: string[] | null;
        weaknesses?: string[] | null;
        estimatedTrafficTier?: string | null;
        opportunityScore?: number;
        threatLevel?: string;
      } | null;

      if (!analysis) {
        return NextResponse.json(
          { error: 'Analysis failed' },
          { status: 500 }
        );
      }

      // Take a snapshot after analysis
      await db.competitorSnapshot.create({
        data: {
          competitorId,
          userId: user.id,
          snapshotType: type,
          seoScore: analysis.seoScore,
          socialScore: analysis.socialScore,
          pricingModel: analysis.pricingModel,
          techStack: analysis.techStack ? JSON.stringify(analysis.techStack) : null,
          strengths: analysis.strengths ? JSON.stringify(analysis.strengths) : null,
          weaknesses: analysis.weaknesses ? JSON.stringify(analysis.weaknesses) : null,
          estimatedTraffic: analysis.estimatedTrafficTier,
          rawData: JSON.stringify({
            opportunityScore: analysis.opportunityScore,
            threatLevel: analysis.threatLevel,
            analysisType: type,
          }),
        },
      });

      // Audit log
      await db.auditLog.create({
        data: {
          userId: user.id,
          action: 'competitor_analyzed',
          details: JSON.stringify({
            competitorId,
            competitorName: existing.competitorName,
            analysisType: type,
            threatLevel: analysis.threatLevel,
            opportunityScore: analysis.opportunityScore,
          }),
          resource: 'competitor',
          resourceId: competitorId,
        },
      }).catch(() => {});

      const message = type === 'full'
        ? 'Full competitor analysis completed successfully'
        : `${type.charAt(0).toUpperCase() + type.slice(1)} analysis completed successfully`;

      return NextResponse.json({
        analysis,
        message,
      });
    } catch (error) {
      console.error('[POST /api/competitors/analyze] Error:', error);
      return NextResponse.json(
        { error: 'Failed to analyze competitor' },
        { status: 500 }
      );
    }
  });
}
