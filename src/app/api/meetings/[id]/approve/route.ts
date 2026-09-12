// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Meeting Approve/Reject API
// POST /api/meetings/[id]/approve — Approve or reject a pending meeting
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { withApiLogging } from '@/lib/observability/api-logger';
import { db } from '@/lib/db';
import { validateStageTransition, updateDealAfterMeeting, type CRMAction } from '@/lib/meeting/crm-sync';
import { sendMeetingConfirmationToClient, sendMeetingNotificationToUser } from '@/lib/meeting/meeting-email';

export const POST = withApiLogging(async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  return withAuth(request, async (user) => {
    try {
      const { id: meetingId } = await params;
      const body = await request.json();

      // Validate required action field
      if (!body.action || !['approve', 'reject'].includes(body.action)) {
        return NextResponse.json(
          { error: 'Missing or invalid required field: action (must be "approve" or "reject")' },
          { status: 400 }
        );
      }

      // Fetch the meeting (must belong to the user)
      const meeting = await db.meeting.findFirst({
        where: {
          id: meetingId,
          userId: user.id,
        },
      });

      if (!meeting) {
        return NextResponse.json(
          { error: 'Meeting not found or you do not have access.' },
          { status: 404 }
        );
      }

      if (meeting.approvalStatus !== 'pending') {
        return NextResponse.json(
          { error: `Meeting is not pending approval. Current approval status: ${meeting.approvalStatus}` },
          { status: 400 }
        );
      }

      if (meeting.status !== 'pending_approval') {
        return NextResponse.json(
          { error: `Meeting status is not pending_approval. Current status: ${meeting.status}` },
          { status: 400 }
        );
      }

      let updatedMeeting;

      if (body.action === 'approve') {
        // Apply optional modifications if provided
        const updateData: Record<string, unknown> = {
          approvalStatus: 'approved',
          status: 'scheduled',
        };

        if (body.modifications) {
          if (body.modifications.startDateTime) {
            updateData.startDateTime = new Date(body.modifications.startDateTime);
          }
          if (body.modifications.endDateTime) {
            updateData.endDateTime = new Date(body.modifications.endDateTime);
          }
          if (body.modifications.title) {
            updateData.title = body.modifications.title;
          }
        }

        updatedMeeting = await db.meeting.update({
          where: { id: meeting.id },
          data: updateData,
        });

        // Create audit log
        await db.auditLog.create({
          data: {
            userId: user.id,
            action: 'meeting_approved',
            details: JSON.stringify({
              meetingId: meeting.id,
              title: meeting.title,
              previousApprovalStatus: 'pending',
              newApprovalStatus: 'approved',
              previousStatus: 'pending_approval',
              newStatus: 'scheduled',
              modifications: body.modifications || null,
            }),
            resource: 'meeting',
            resourceId: meeting.id,
          },
        });

        // Send in-app notification
        try {
          await db.notification.create({
            data: {
              userId: user.id,
              type: 'meeting_approved',
              title: 'Meeting Approved',
              message: `"${meeting.title}" has been approved and is now scheduled`,
              actionUrl: `/meetings/${meeting.id}`,
              deliveredVia: 'in_app',
              metadata: JSON.stringify({ meetingId: meeting.id }),
            },
          });
        } catch (notifError) {
          console.error('[Meeting Approve API] Failed to create notification:', notifError);
        }

        // Update lead stage if applicable (using CRM pipeline validation)
        if (meeting.leadId) {
          try {
            const lead = await db.lead.findUnique({ where: { id: meeting.leadId } });
            if (lead) {
              const validation = validateStageTransition(lead.stage, 'meeting_scheduled');
              if (validation.valid) {
                await db.lead.update({
                  where: { id: meeting.leadId },
                  data: {
                    stage: 'meeting_scheduled',
                    lastContactedAt: new Date(),
                  },
                });
              } else {
                console.warn(`[Meeting Approve API] Invalid stage transition for lead ${meeting.leadId}: ${lead.stage} → meeting_scheduled: ${validation.reason}`);
              }
            }
            await db.leadActivity.create({
              data: {
                leadId: meeting.leadId,
                type: 'meeting_scheduled',
                description: `Meeting "${updatedMeeting.title}" approved and scheduled`,
                metadata: JSON.stringify({ meetingId: meeting.id }),
              },
            });
            // Update deal status if linked (CRM sync)
            if (meeting.dealId) {
              try {
                await updateDealAfterMeeting(meeting.id, 'meeting_scheduled' as CRMAction);
              } catch (dealError) {
                console.warn('[Meeting Approve API] Failed to update deal after approval:', dealError);
              }
            }
          } catch {
            // Non-critical
          }
        }

        // Send confirmation email to attendees now that meeting is approved
        try {
          const attendeesList = JSON.parse(meeting.attendees || '[]') as Array<{ email: string; name?: string }>;
          const hostUser = await db.user.findUnique({ where: { id: user.id } });
          const hostName = hostUser?.name || hostUser?.email || 'AcquisitionOS User';
          const hostCompany = hostUser?.company || undefined;

          for (const attendee of attendeesList) {
            await sendMeetingConfirmationToClient({
              meetingId: meeting.id,
              clientEmail: attendee.email,
              clientName: attendee.name || 'Attendee',
              meetingTitle: updatedMeeting.title,
              meetingUrl: updatedMeeting.meetingUrl || undefined,
              startDateTime: new Date(updatedMeeting.startDateTime),
              endDateTime: new Date(updatedMeeting.endDateTime),
              timezone: updatedMeeting.timezone,
              durationMinutes: updatedMeeting.durationMinutes,
              platform: updatedMeeting.platform,
              location: updatedMeeting.location || undefined,
              hostName,
              hostCompany,
            });
          }

          // Notify the meeting owner via email
          const leadInfo = meeting.leadId
            ? await db.lead.findUnique({ where: { id: meeting.leadId }, select: { businessName: true } })
            : null;

          await sendMeetingNotificationToUser({
            userId: user.id,
            meetingId: meeting.id,
            meetingTitle: updatedMeeting.title,
            leadName: leadInfo?.businessName || undefined,
            leadId: meeting.leadId || undefined,
            startDateTime: new Date(updatedMeeting.startDateTime),
            timezone: updatedMeeting.timezone,
            platform: updatedMeeting.platform,
            meetingUrl: updatedMeeting.meetingUrl || undefined,
            calendarSynced: !!updatedMeeting.calendarEventId,
            crmLinked: !!meeting.leadId,
          });
        } catch (emailError) {
          console.error('[Meeting Approve API] Failed to send approval emails:', emailError);
          // Don't fail the approval
        }

        return NextResponse.json({
          meeting: {
            id: updatedMeeting.id,
            title: updatedMeeting.title,
            status: updatedMeeting.status,
            approvalStatus: updatedMeeting.approvalStatus,
            startDateTime: updatedMeeting.startDateTime,
            endDateTime: updatedMeeting.endDateTime,
            platform: updatedMeeting.platform,
            meetingUrl: updatedMeeting.meetingUrl,
          },
          action: 'approved',
        });
      }

      // Reject
      if (body.action === 'reject') {
        updatedMeeting = await db.meeting.update({
          where: { id: meeting.id },
          data: {
            approvalStatus: 'rejected',
            status: 'cancelled',
            cancellationReason: body.reason || 'Rejected during approval',
          },
        });

        // Create audit log
        await db.auditLog.create({
          data: {
            userId: user.id,
            action: 'meeting_rejected',
            details: JSON.stringify({
              meetingId: meeting.id,
              title: meeting.title,
              reason: body.reason || null,
            }),
            resource: 'meeting',
            resourceId: meeting.id,
          },
        });

        // Send in-app notification
        try {
          await db.notification.create({
            data: {
              userId: user.id,
              type: 'meeting_cancelled',
              title: 'Meeting Rejected',
              message: `"${meeting.title}" has been rejected${body.reason ? `: ${body.reason}` : ''}`,
              deliveredVia: 'in_app',
              metadata: JSON.stringify({ meetingId: meeting.id }),
            },
          });
        } catch (notifError) {
          console.error('[Meeting Approve API] Failed to create notification:', notifError);
        }

        // CRM sync on rejection: log activity + update deal
        if (meeting.leadId) {
          try {
            await db.leadActivity.create({
              data: {
                leadId: meeting.leadId,
                type: 'meeting_cancelled',
                description: `Meeting "${meeting.title}" was rejected during approval${body.reason ? `: ${body.reason}` : ''}`,
                metadata: JSON.stringify({ meetingId: meeting.id, reason: body.reason || null }),
              },
            });
          } catch (activityError) {
            console.warn('[Meeting Approve API] Failed to create lead activity for rejection:', activityError);
          }

          // Update deal status if linked (CRM sync)
          if (meeting.dealId) {
            try {
              await updateDealAfterMeeting(meeting.id, 'meeting_cancelled' as CRMAction);
            } catch (dealError) {
              console.warn('[Meeting Approve API] Failed to update deal after rejection:', dealError);
            }
          }
        }

        return NextResponse.json({
          meeting: {
            id: updatedMeeting.id,
            title: updatedMeeting.title,
            status: updatedMeeting.status,
            approvalStatus: updatedMeeting.approvalStatus,
            cancellationReason: updatedMeeting.cancellationReason,
          },
          action: 'rejected',
        });
      }

      return NextResponse.json(
        { error: 'Invalid action' },
        { status: 400 }
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      if (errorMessage.includes('Meeting not found')) {
        return NextResponse.json(
          { error: errorMessage },
          { status: 404 }
        );
      }

      if (errorMessage.includes('not pending approval')) {
        return NextResponse.json(
          { error: errorMessage },
          { status: 400 }
        );
      }

      console.error('[Meeting Approve API] Error:', error);
      return NextResponse.json(
        { error: 'Failed to process meeting approval' },
        { status: 500 }
      );
    }
  });
}, 'meetings/[id]/approve');
