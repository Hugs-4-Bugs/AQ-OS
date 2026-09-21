// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — GET/PUT/DELETE /api/leads/[id]
// Phase 7: Full lead details, update, soft delete
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { db } from '@/lib/db';
import { logAuditEvent } from '@/lib/lead-audit';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async (user) => {
    try {
      const { id } = await params;

      const lead = await db.lead.findFirst({
        where: { id, isActive: true },
        include: {
          leadNotes: {
            orderBy: { createdAt: 'desc' },
            take: 50,
            include: {
              user: { select: { id: true, name: true, email: true } },
            },
          },
          leadAnalysis: true,
          activities: {
            orderBy: { createdAt: 'desc' },
            take: 30,
          },
          leadScores: {
            orderBy: { scoredAt: 'desc' },
            take: 10,
          },
        },
      });

      if (!lead) {
        return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
      }

      // Check authorization — owner, or member of the same org.
      // Org sharing requires BOTH sides to have a real (non-null) orgId
      // that matches. The previous `lead.orgId !== user.orgId` check
      // failed OPEN when both were null, letting any user access any
      // lead that had no org — a cross-tenant leak.
      const canAccessLead =
        lead.userId === user.id ||
        (!!user.orgId && !!lead.orgId && lead.orgId === user.orgId);
      if (!canAccessLead) {
        return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
      }

      return NextResponse.json({ lead });
    } catch (error) {
      console.error('[API /leads/[id]] GET Error:', error);
      return NextResponse.json({ error: 'Failed to fetch lead' }, { status: 500 });
    }
  });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async (user) => {
    try {
      const { id } = await params;

      // Fetch existing lead
      const existing = await db.lead.findFirst({ where: { id, isActive: true } });
      if (!existing) {
        return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
      }

      // Check authorization — owner, or member of the same org
      // (both orgIds must be non-null and equal; never fail open).
      const canUpdateLead =
        existing.userId === user.id ||
        (!!user.orgId && !!existing.orgId && existing.orgId === user.orgId);
      if (!canUpdateLead) {
        return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
      }

      const body = await request.json();

      // Build update data with validation
      const updateData: Record<string, unknown> = {};

      const allowedFields = [
        'businessName', 'ownerName', 'website', 'email', 'phone', 'whatsapp',
        'linkedin', 'instagram', 'facebook', 'googleMapsListing', 'reviews',
        'city', 'country', 'niche', 'notes', 'stage', 'emailStatus',
        'estimatedQuality', 'estimatedRevenue', 'bestContactPerson',
        'bestChannel', 'bestTiming', 'outreachStyle', 'opportunityNotes',
        'digitalWeaknesses', 'followUpAt', 'websiteQuality',
      ];

      for (const field of allowedFields) {
        if (body[field] !== undefined) {
          const value = body[field];
          // Sanitize string values
          if (typeof value === 'string') {
            updateData[field] = value.trim().substring(0, 2000);
          } else if (value === null) {
            updateData[field] = null;
          } else {
            updateData[field] = value;
          }
        }
      }

      // Handle rating separately (numeric)
      if (body.rating !== undefined) {
        updateData.rating = typeof body.rating === 'number' ? Math.min(5, Math.max(0, body.rating)) : null;
      }

      // Handle tags (JSON array)
      if (body.tags !== undefined) {
        if (Array.isArray(body.tags)) {
          updateData.tags = JSON.stringify(body.tags.filter((t: unknown) => typeof t === 'string'));
        }
      }

      // Handle hasWebsite
      if (body.website !== undefined) {
        updateData.hasWebsite = !!body.website;
      }

      // Update lead
      const updated = await db.lead.update({
        where: { id },
        data: updateData,
      });

      // Audit log
      await logAuditEvent(user.id, 'lead_updated', {
        leadId: id,
        updatedFields: Object.keys(updateData),
        businessName: existing.businessName,
      });

      return NextResponse.json({ lead: updated });
    } catch (error) {
      console.error('[API /leads/[id]] PUT Error:', error);
      return NextResponse.json({ error: 'Failed to update lead' }, { status: 500 });
    }
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async (user) => {
    try {
      const { id } = await params;

      // IMPORTANT: Look up the lead WITHOUT the `isActive: true` filter.
      // The leads list (GET /api/leads) returns every lead regardless of
      // isActive, so users can see & select inactive/archived leads for
      // deletion. A hard delete must succeed for any lead row that exists.
      // Filtering on isActive here would 404 on soft-deleted leads and
      // break the "Delete" / "Bulk delete" UI flows.
      const lead = await db.lead.findFirst({ where: { id } });
      if (!lead) {
        // Machine-readable code lets the UI distinguish "already deleted"
        // (e.g. a stale browser list) from other failures. The client
        // treats this case as an idempotent success and refreshes the list.
        return NextResponse.json(
          { error: 'Lead not found', code: 'LEAD_NOT_FOUND' },
          { status: 404 }
        );
      }

      // Check authorization — owner, or member of the same org
      // (both orgIds must be non-null and equal; never fail open).
      const canDeleteLead =
        lead.userId === user.id ||
        (!!user.orgId && !!lead.orgId && lead.orgId === user.orgId);
      if (!canDeleteLead) {
        return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
      }

      // Hard delete: remove the lead and all related records atomically.
      // Foreign-key constraints on related tables can block a plain
      // db.lead.delete() if any child row references the lead, so we
      // explicitly delete every related record first inside a single
      // $transaction. Relations that are already onDelete: Cascade are
      // deleted here too for clarity and to guarantee atomicity.
      await db.$transaction(async (tx) => {
        await tx.leadActivity.deleteMany({ where: { leadId: id } });
        await tx.leadNote.deleteMany({ where: { leadId: id } });
        await tx.leadScore.deleteMany({ where: { leadId: id } });
        await tx.leadAnalysis.deleteMany({ where: { leadId: id } });
        await tx.followUpReminder.deleteMany({ where: { leadId: id } });
        await tx.communication.deleteMany({ where: { leadId: id } });
        await tx.outreachMessage.deleteMany({ where: { leadId: id } });
        await tx.sequenceEnrollment.deleteMany({ where: { leadId: id } });
        await tx.conversation.deleteMany({ where: { leadId: id } });
        await tx.broadcastTarget.deleteMany({ where: { leadId: id } });
        await tx.deal.deleteMany({ where: { leadId: id } });
        // Meetings reference the lead via an optional leadId — clear/null
        // the link so the FK does not block deletion of the lead row.
        await tx.meeting.updateMany({ where: { leadId: id }, data: { leadId: null } });
        await tx.lead.delete({ where: { id } });
      });

      // Audit log
      await logAuditEvent(user.id, 'lead_deleted', {
        leadId: id,
        businessName: lead.businessName,
        softDelete: false,
      });

      return NextResponse.json({ success: true, message: 'Lead deleted successfully' });
    } catch (error) {
      console.error('[API /leads/[id]] DELETE Error:', error);
      const message = error instanceof Error ? error.message : 'Failed to delete lead';
      return NextResponse.json({ error: message }, { status: 500 });
    }
  });
}
