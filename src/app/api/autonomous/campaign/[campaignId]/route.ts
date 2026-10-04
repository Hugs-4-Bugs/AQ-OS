// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Autonomous Campaign Detail API
// GET:  Get campaign status
// POST: Control campaign (pause/resume/cancel)
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { getCampaignStatus } from '@/lib/autonomous-outreach-engine';
import { db } from '@/lib/db';

// ===== GET: Get Campaign Status =====

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ campaignId: string }> }
) {
  return withAuth(request, async (user) => {
    try {
      const { campaignId } = await params;

      if (!campaignId) {
        return NextResponse.json(
          { error: 'Campaign ID is required' },
          { status: 400 }
        );
      }

      const status = await getCampaignStatus(campaignId, user.id);

      if (!status) {
        return NextResponse.json(
          { error: 'Campaign not found' },
          { status: 404 }
        );
      }

      return NextResponse.json(status);
    } catch (error) {
      console.error('[CampaignDetailAPI] GET error:', error);
      return NextResponse.json(
        { error: 'Failed to get campaign status' },
        { status: 500 }
      );
    }
  });
}

// ===== POST: Control Campaign (pause/resume/cancel) =====

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ campaignId: string }> }
) {
  return withAuth(request, async (user) => {
    try {
      const { campaignId } = await params;

      if (!campaignId) {
        return NextResponse.json(
          { error: 'Campaign ID is required' },
          { status: 400 }
        );
      }

      const body = await request.json();
      const { action } = body;

      if (!action || !['pause', 'resume', 'cancel'].includes(action)) {
        return NextResponse.json(
          { error: 'Invalid action. Must be one of: pause, resume, cancel' },
          { status: 400 }
        );
      }

      // Fetch campaign with ownership check
      const campaign = await db.acquisitionCampaign.findFirst({
        where: { id: campaignId, userId: user.id },
      });

      if (!campaign) {
        return NextResponse.json(
          { error: 'Campaign not found' },
          { status: 404 }
        );
      }

      // Validate action against current status
      const currentStatus = campaign.status;

      if (action === 'pause') {
        const pausableStatuses = ['parsing', 'discovering', 'analyzing', 'generating', 'sending'];
        if (!pausableStatuses.includes(currentStatus)) {
          return NextResponse.json(
            { error: `Cannot pause campaign in "${currentStatus}" status. Only running campaigns can be paused.` },
            { status: 400 }
          );
        }

        await db.acquisitionCampaign.update({
          where: { id: campaignId },
          data: { status: 'paused' },
        });

        return NextResponse.json({
          success: true,
          campaignId,
          status: 'paused',
          message: 'Campaign paused successfully',
        });
      }

      if (action === 'resume') {
        if (currentStatus !== 'paused') {
          return NextResponse.json(
            { error: `Cannot resume campaign in "${currentStatus}" status. Only paused campaigns can be resumed.` },
            { status: 400 }
          );
        }

        // Resume by setting status back to a processing state
        // Use the campaign phase to determine where to resume
        const resumeStatus = campaign.analyzed > 0
          ? (campaign.outreachGenerated > 0 ? 'sending' : 'generating')
          : (campaign.discovered > 0 ? 'analyzing' : 'discovering');

        await db.acquisitionCampaign.update({
          where: { id: campaignId },
          data: { status: resumeStatus },
        });

        return NextResponse.json({
          success: true,
          campaignId,
          status: resumeStatus,
          message: 'Campaign resumed successfully',
        });
      }

      if (action === 'cancel') {
        const cancellableStatuses = ['parsing', 'discovering', 'analyzing', 'generating', 'sending', 'paused'];
        if (!cancellableStatuses.includes(currentStatus)) {
          return NextResponse.json(
            { error: `Cannot cancel campaign in "${currentStatus}" status.` },
            { status: 400 }
          );
        }

        await db.acquisitionCampaign.update({
          where: { id: campaignId },
          data: {
            status: 'cancelled',
            completedAt: new Date(),
          },
        });

        return NextResponse.json({
          success: true,
          campaignId,
          status: 'cancelled',
          message: 'Campaign cancelled successfully',
        });
      }

      return NextResponse.json(
        { error: 'Unhandled action' },
        { status: 400 }
      );
    } catch (error) {
      console.error('[CampaignDetailAPI] POST error:', error);
      return NextResponse.json(
        { error: 'Failed to control campaign' },
        { status: 500 }
      );
    }
  });
}
