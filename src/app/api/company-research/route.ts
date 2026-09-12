// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Company Research API Route
// POST /api/company-research — AI-powered company research
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { researchCompany, type LeadInput, type UserProfile } from '@/lib/lead-discovery/company-researcher';
import { analyzeWebsite, type WebsiteScore } from '@/lib/lead-discovery/website-scorer';
import { db } from '@/lib/db';

/**
 * POST /api/company-research
 * Run AI-powered research on a company.
 *
 * Body: {
 *   leadId: string,                 // ID of existing Lead in DB
 *   userProfile: {
 *     name: string,
 *     businessType: string,
 *     services: string,
 *     location: string
 *   },
 *   websiteScore?: WebsiteScore     // Optional: pre-computed score. If omitted, auto-analyzed.
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const { leadId, userProfile, websiteScore: providedScore } = body as {
      leadId?: string;
      userProfile?: UserProfile;
      websiteScore?: WebsiteScore;
    };

    // Validate leadId
    if (!leadId || typeof leadId !== 'string') {
      return NextResponse.json(
        { error: 'Missing required field: leadId (string)' },
        { status: 400 }
      );
    }

    // Validate userProfile
    if (!userProfile || !userProfile.name || !userProfile.services) {
      return NextResponse.json(
        { error: 'Missing required fields: userProfile.name and userProfile.services' },
        { status: 400 }
      );
    }

    // Fetch the lead from DB
    const lead = await db.lead.findFirst({
      where: { id: leadId, isActive: true },
    });

    if (!lead) {
      return NextResponse.json(
        { error: 'Lead not found or inactive' },
        { status: 404 }
      );
    }

    const leadInput: LeadInput = {
      id: lead.id,
      userId: lead.userId || 'unknown',
      businessName: lead.businessName,
      website: lead.website,
      niche: lead.niche,
      city: lead.city,
      country: lead.country,
      email: lead.email,
      phone: lead.phone,
      stage: lead.stage,
      techStack: lead.techStack,
    };

    // Get or compute website score
    let websiteScore: WebsiteScore;

    if (providedScore && typeof providedScore.overallScore === 'number') {
      websiteScore = providedScore;
    } else {
      // Auto-analyze the website
      const url = lead.website || '';
      websiteScore = await analyzeWebsite(url, lead.businessName, lead.niche || 'business');
    }

    console.log(`[CompanyResearchAPI] POST — leadId=${leadId} company=${lead.businessName} ws=${websiteScore.overallScore}`);

    const result = await researchCompany(leadInput, websiteScore, userProfile);

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error('[CompanyResearchAPI] POST error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
