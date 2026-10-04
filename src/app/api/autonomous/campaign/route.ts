// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Autonomous Campaign API
// POST: Start an autonomous campaign
// GET:  List user's campaigns
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { startAutonomousCampaign } from '@/lib/autonomous-outreach-engine';
import { checkCreditSufficiency } from '@/lib/credit-service';
import { db } from '@/lib/db';

// ===== POST: Start an Autonomous Campaign =====

export async function POST(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const body = await request.json();

      const {
        niche,
        country,
        city,
        source,
        maxLeads,
        autoOutreach,
        autoResearch,
        tone,
        channel,
        customInstructions,
      } = body;

      // Validate required fields
      if (!niche || typeof niche !== 'string' || !niche.trim()) {
        return NextResponse.json(
          { error: 'Missing required field: niche' },
          { status: 400 }
        );
      }

      if (!country || typeof country !== 'string' || !country.trim()) {
        return NextResponse.json(
          { error: 'Missing required field: country' },
          { status: 400 }
        );
      }

      // Validate maxLeads if provided
      const parsedMaxLeads = maxLeads ? parseInt(String(maxLeads), 10) : 20;
      if (isNaN(parsedMaxLeads) || parsedMaxLeads < 1 || parsedMaxLeads > 200) {
        return NextResponse.json(
          { error: 'maxLeads must be between 1 and 200' },
          { status: 400 }
        );
      }

      // Estimate credit cost:
      // - Research: maxLeads * 5 credits each
      // - Outreach: maxLeads * 0.2 credits each (rounded up per lead = 1 credit)
      // Total estimate: maxLeads * 5 + maxLeads * 1 = maxLeads * 6 (conservative)
      const estimatedResearchCost = parsedMaxLeads * 5;
      const estimatedOutreachCost = Math.ceil(parsedMaxLeads * 0.2) * parsedMaxLeads > 0 ? parsedMaxLeads : 0;
      const estimatedCredits = estimatedResearchCost + estimatedOutreachCost;

      // Check credit sufficiency
      const creditCheck = await checkCreditSufficiency(user.id, estimatedCredits);
      if (!creditCheck.sufficient) {
        return NextResponse.json(
          {
            error: 'Insufficient credits',
            details: {
              estimated: estimatedCredits,
              balance: creditCheck.balance,
              shortfall: creditCheck.shortfall,
            },
          },
          { status: 403 }
        );
      }

      // Start the autonomous campaign
      const result = await startAutonomousCampaign(user.id, {
        niche: niche.trim(),
        country: country.trim(),
        city: city?.trim() || undefined,
        source: source || 'ai_search',
        maxLeads: parsedMaxLeads,
        autoOutreach: autoOutreach ?? false,
        autoResearch: autoResearch ?? true,
        tone: tone || 'professional',
        channel: channel || 'email',
        customInstructions: customInstructions?.trim() || undefined,
      });

      if (result.status === 'failed' || !result.campaignId) {
        return NextResponse.json(
          { error: result.message, success: false },
          { status: 400 }
        );
      }

      return NextResponse.json(
        {
          success: true,
          campaignId: result.campaignId,
          message: result.message,
        },
        { status: 201 }
      );
    } catch (error) {
      console.error('[AutonomousCampaignAPI] POST error:', error);
      return NextResponse.json(
        { error: 'Failed to start autonomous campaign' },
        { status: 500 }
      );
    }
  });
}

// ===== GET: List User's Campaigns =====

export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const url = new URL(request.url);
      const limit = Math.min(parseInt(url.searchParams.get('limit') || '20', 10), 100);
      const offset = parseInt(url.searchParams.get('offset') || '0', 10);
      const status = url.searchParams.get('status') || undefined;

      // Build where clause
      const where: Record<string, unknown> = { userId: user.id };
      if (status) {
        where.status = status;
      }

      // Fetch campaigns with basic stats
      const [campaigns, total] = await Promise.all([
        db.acquisitionCampaign.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          take: limit,
          skip: offset,
          select: {
            id: true,
            niche: true,
            country: true,
            city: true,
            status: true,
            channel: true,
            tone: true,
            maxLeads: true,
            totalLeads: true,
            discovered: true,
            analyzed: true,
            outreachGenerated: true,
            sent: true,
            autoSend: true,
            createdAt: true,
            completedAt: true,
          },
        }),
        db.acquisitionCampaign.count({ where }),
      ]);

      return NextResponse.json({
        campaigns,
        total,
        limit,
        offset,
        hasMore: offset + campaigns.length < total,
      });
    } catch (error) {
      console.error('[AutonomousCampaignAPI] GET error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch campaigns' },
        { status: 500 }
      );
    }
  });
}
