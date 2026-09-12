// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Deal Update API
// Phase 3: PATCH /api/deals/[id] with auth + side effects
//
// Side effects on status change:
//   1. Create LeadActivity record (if deal has associated leadId)
//   2. Create AuditLog entry
//   3. Dispatch notification via notification-engine
//   Mirrors the pattern used in pipeline-service.ts → moveLeadToStage()
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withAuth } from '@/lib/auth-middleware';
import { logAuditEvent } from '@/lib/lead-audit';
import { sendNotification } from '@/lib/notification-engine';

// Valid deal statuses in progression order
const VALID_STATUSES = ['draft', 'sent', 'viewed', 'negotiating', 'accepted', 'rejected'];

// PATCH /api/deals/[id] - Update deal (status, price, etc.)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async (user) => {
    try {
      const { id } = await params;
      const body = await request.json();

      // Check if deal exists AND belongs to this user
      const existing = await db.deal.findFirst({
        where: { id, lead: { userId: user.id } },
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
              stage: true,
              userId: true,
            },
          },
        },
      });

      if (!existing) {
        return NextResponse.json({ error: 'Deal not found' }, { status: 404 });
      }

      // Validate status if provided
      if (body.status !== undefined && !VALID_STATUSES.includes(body.status)) {
        return NextResponse.json(
          { error: `Invalid status. Valid statuses: ${VALID_STATUSES.join(', ')}` },
          { status: 400 }
        );
      }

      // Track whether this is a status change for side effects
      const isStatusChange = body.status !== undefined && body.status !== existing.status;
      const previousStatus = existing.status;

      // Build update data
      const updateData: Record<string, unknown> = {};

      if (body.status !== undefined) updateData.status = body.status;
      if (body.proposedPrice !== undefined) updateData.proposedPrice = body.proposedPrice;
      if (body.finalPrice !== undefined) updateData.finalPrice = body.finalPrice;
      if (body.projectType !== undefined) updateData.projectType = body.projectType;
      if (body.projectScope !== undefined) updateData.projectScope = body.projectScope;
      if (body.currency !== undefined) updateData.currency = body.currency;
      if (body.implementationTimeline !== undefined) updateData.implementationTimeline = body.implementationTimeline;
      if (body.maintenancePlan !== undefined) updateData.maintenancePlan = body.maintenancePlan;
      if (body.proposalContent !== undefined) updateData.proposalContent = body.proposalContent;
      if (body.notes !== undefined) updateData.notes = body.notes;

      const deal = await db.deal.update({
        where: { id },
        data: updateData,
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
              stage: true,
            },
          },
        },
      });

      // ── SIDE EFFECTS on status change ──
      // Mirror the pattern used in pipeline-service.ts → moveLeadToStage()
      if (isStatusChange) {
        const newStatus = body.status as string;
        const leadId = deal.leadId;

        // 1. Create LeadActivity record (if deal has associated leadId)
        if (leadId) {
          try {
            await db.leadActivity.create({
              data: {
                leadId,
                type: 'stage_change',
                description: `Deal ${deal.id} status changed from "${previousStatus}" to "${newStatus}"`,
                metadata: JSON.stringify({
                  dealId: id,
                  fromStatus: previousStatus,
                  toStatus: newStatus,
                  changedBy: user.id,
                  changedAt: new Date().toISOString(),
                }),
              },
            });
          } catch (activityError) {
            console.error('[DealsAPI] Failed to create LeadActivity (non-blocking):', activityError);
          }
        }

        // 2. Create AuditLog entry
        try {
          await logAuditEvent(user.id, 'deal_status_changed', {
            dealId: id,
            fromStatus: previousStatus,
            toStatus: newStatus,
            leadId: leadId || null,
            leadName: deal.lead?.businessName || null,
          }, id);
        } catch (auditError) {
          console.error('[DealsAPI] Failed to create AuditLog (non-blocking):', auditError);
        }

        // 3. Dispatch notification
        try {
          const notifType = newStatus === 'accepted' ? 'deal_accepted' :
                           newStatus === 'rejected' ? 'deal_rejected' :
                           'deal_updated';

          const notifTitle = newStatus === 'accepted' ? 'Deal Accepted! 🎉' :
                            newStatus === 'rejected' ? 'Deal Rejected' :
                            `Deal ${newStatus.charAt(0).toUpperCase() + newStatus.slice(1)}`;

          const leadName = deal.lead?.businessName || deal.lead?.ownerName || 'Unknown';

          await sendNotification({
            userId: user.id,
            type: notifType,
            title: notifTitle,
            message: `Deal with ${leadName} changed from ${previousStatus} to ${newStatus}`,
            actionUrl: `/deals/${id}`,
            metadata: {
              dealId: id,
              leadId: leadId || null,
              fromStatus: previousStatus,
              toStatus: newStatus,
            },
          });
        } catch (notifError) {
          console.error('[DealsAPI] Failed to send notification (non-blocking):', notifError);
        }

        // 4. Update lead stage for key deal status changes
        if (leadId) {
          try {
            // If deal is accepted, move lead to closed_won
            if (newStatus === 'accepted') {
              await db.lead.update({
                where: { id: leadId },
                data: { stage: 'closed_won', lastContactedAt: new Date() },
              });
            }
            // If deal is rejected, move lead to closed_lost
            else if (newStatus === 'rejected') {
              await db.lead.update({
                where: { id: leadId },
                data: { stage: 'closed_lost', lastContactedAt: new Date() },
              });
            }
            // If deal is negotiating, move lead to negotiation
            else if (newStatus === 'negotiating') {
              const currentStage = deal.lead?.stage;
              // Only advance if not already further ahead
              const stageOrder: Record<string, number> = {
                discovered: 0, analyzed: 1, contacted: 2, replied: 3,
                interested: 4, negotiation: 5, meeting_scheduled: 4,
                proposal_sent: 6, closed_won: 7, closed_lost: -1,
              };
              const currentLevel = stageOrder[currentStage || 'discovered'] ?? 0;
              if (currentLevel < 5) {
                await db.lead.update({
                  where: { id: leadId },
                  data: { stage: 'negotiation' },
                });
              }
            }
          } catch (leadUpdateError) {
            console.error('[DealsAPI] Failed to update lead stage (non-blocking):', leadUpdateError);
          }
        }
      }

      return NextResponse.json(deal);
    } catch (error) {
      console.error('Error updating deal:', error);
      return NextResponse.json(
        { error: 'Failed to update deal' },
        { status: 500 }
      );
    }
  });
}
