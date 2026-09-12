import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import ZAI from 'z-ai-web-dev-sdk';

// GET /api/leads/[id]/deals - Get deals for a lead
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

    const deals = await db.deal.findMany({
      where: { leadId: id },
      orderBy: { createdAt: 'desc' },
      include: {
        lead: {
          select: {
            id: true,
            businessName: true,
            ownerName: true,
            niche: true,
            country: true,
            city: true,
            email: true,
            phone: true,
          },
        },
      },
    });

    return NextResponse.json(deals);
  } catch (error) {
    console.error('Error fetching deals:', error);
    return NextResponse.json(
      { error: 'Failed to fetch deals' },
      { status: 500 }
    );
  }
}

// POST /api/leads/[id]/deals - Create a deal/proposal
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const lead = await db.lead.findUnique({
      where: { id },
      include: {
        communications: { orderBy: { createdAt: 'desc' }, take: 3 },
      },
    });

    if (!lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    // Use LLM to generate professional proposal content
    const zai = await ZAI.create();

    const leadContext = `
Business Name: ${lead.businessName}
Owner: ${lead.ownerName || 'Unknown'}
Niche: ${lead.niche || 'Unknown'}
City: ${lead.city || 'Unknown'}, Country: ${lead.country || 'Unknown'}
Digital Weaknesses: ${lead.digitalWeaknesses || 'Unknown'}
Opportunity Notes: ${lead.opportunityNotes || 'Unknown'}
Recent Communications: ${lead.communications.length > 0 ? lead.communications.map((c) => `[${c.direction}] ${c.content}`).join('\n') : 'None'}
    `.trim();

    const projectType = body.projectType || 'Digital Transformation';
    const projectScope = body.projectScope || 'Full scope to be determined';
    const proposedPrice = body.proposedPrice || 0;
    const implementationTimeline = body.implementationTimeline || '4-8 weeks';
    const maintenancePlan = body.maintenancePlan || 'Monthly maintenance package';

    const completion = await zai.chat.completions.create({
      messages: [
        {
          role: 'assistant',
          content: `You are a professional business proposal writer. Generate a compelling, detailed proposal for a digital transformation project. The proposal should:
- Be specific to the client's business and industry
- Reference their identified digital weaknesses
- Explain the business impact of each proposed solution
- Include clear deliverables and timeline
- Sound professional yet approachable
- Be formatted in markdown

Return the proposal as a string in markdown format.`,
        },
        {
          role: 'user',
          content: `Generate a professional proposal for:

Project Type: ${projectType}
Project Scope: ${projectScope}
Proposed Price: ${proposedPrice} ${body.currency || 'USD'}
Implementation Timeline: ${implementationTimeline}
Maintenance Plan: ${maintenancePlan}

Lead Details:
${leadContext}`,
        },
      ],
      thinking: { type: 'disabled' },
    });

    const proposalContent = completion.choices?.[0]?.message?.content || '';

    // Create the deal
    const deal = await db.deal.create({
      data: {
        leadId: id,
        status: 'draft',
        projectType,
        projectScope,
        proposedPrice: proposedPrice ? Number(proposedPrice) : null,
        currency: body.currency || 'USD',
        implementationTimeline,
        maintenancePlan,
        proposalContent,
      },
    });

    // Update lead stage to proposal if appropriate
    const updatableStages = ['interested', 'discussion', 'replied', 'contacted'];
    if (updatableStages.includes(lead.stage)) {
      await db.lead.update({
        where: { id },
        data: { stage: 'proposal' },
      });
    }

    return NextResponse.json(deal, { status: 201 });
  } catch (error) {
    console.error('Error creating deal:', error);
    return NextResponse.json(
      { error: 'Failed to create deal' },
      { status: 500 }
    );
  }
}
