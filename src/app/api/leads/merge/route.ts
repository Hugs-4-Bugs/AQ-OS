// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — POST /api/leads/merge
// Phase 7 Remediation: Merge two leads with field selection
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { db } from '@/lib/db';
import { logAuditEvent } from '@/lib/lead-audit';

export async function POST(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const body = await request.json();
      const { targetLeadId, sourceLeadId, fieldSelections } = body;

      // Validate required fields
      if (!targetLeadId || !sourceLeadId) {
        return NextResponse.json(
          { error: 'targetLeadId and sourceLeadId are required' },
          { status: 400 }
        );
      }

      if (targetLeadId === sourceLeadId) {
        return NextResponse.json(
          { error: 'Cannot merge a lead with itself' },
          { status: 400 }
        );
      }

      // Fetch both leads
      const [target, source] = await Promise.all([
        db.lead.findFirst({
          where: { id: targetLeadId, isActive: true },
        }),
        db.lead.findFirst({
          where: { id: sourceLeadId, isActive: true },
        }),
      ]);

      if (!target) {
        return NextResponse.json(
          { error: 'Target lead not found or inactive' },
          { status: 404 }
        );
      }

      if (!source) {
        return NextResponse.json(
          { error: 'Source lead not found or inactive' },
          { status: 404 }
        );
      }

      // Verify user owns both leads or has org access
      const userOrg = user.orgId;
      const targetOwned = target.userId === user.id || (userOrg && target.orgId === userOrg);
      const sourceOwned = source.userId === user.id || (userOrg && source.orgId === userOrg);

      if (!targetOwned || !sourceOwned) {
        return NextResponse.json(
          { error: 'Not authorized to merge these leads' },
          { status: 403 }
        );
      }

      // Build merged data based on field selections
      const fieldsMerged: string[] = [];
      const updateData: Record<string, unknown> = {};

      const mergeableFields = [
        'businessName', 'ownerName', 'email', 'phone', 'whatsapp', 'website',
        'linkedin', 'instagram', 'facebook', 'googleMapsListing', 'reviews',
        'city', 'country', 'niche', 'estimatedRevenue', 'websiteQuality',
        'digitalWeaknesses', 'opportunityNotes', 'bestContactPerson',
        'bestChannel', 'bestTiming', 'outreachStyle',
      ];

      const numericFields = ['rating', 'replyScore', 'conversionScore', 'urgencyScore', 'revenuePotentialScore'];

      // Apply field selections
      if (fieldSelections && typeof fieldSelections === 'object') {
        // Field selections maps field names to the lead ID whose value should be used
        for (const [field, selectedLeadId] of Object.entries(fieldSelections)) {
          if (selectedLeadId === targetLeadId) {
            // Keep target value — no change needed
            continue;
          }

          if (selectedLeadId === sourceLeadId) {
            // Use source value
            const sourceValue = (source as Record<string, unknown>)[field];
            if (sourceValue !== null && sourceValue !== undefined && sourceValue !== '') {
              updateData[field] = sourceValue;
              fieldsMerged.push(field);
            }
          }
        }
      } else {
        // No explicit selections — use default merge behavior (source fills empty target fields)
        for (const field of mergeableFields) {
          const sourceValue = (source as Record<string, unknown>)[field];
          const targetValue = (target as Record<string, unknown>)[field];

          if (sourceValue && !targetValue) {
            updateData[field] = sourceValue;
            fieldsMerged.push(field);
          }
        }

        // Numeric fields — take higher value
        for (const field of numericFields) {
          const sourceVal = Number((source as Record<string, unknown>)[field]) || 0;
          const targetVal = Number((target as Record<string, unknown>)[field]) || 0;
          if (sourceVal > targetVal) {
            updateData[field] = sourceVal;
            fieldsMerged.push(field);
          }
        }
      }

      // Merge tags (union)
      try {
        const sourceTags = JSON.parse((source.tags as string) || '[]') as string[];
        const targetTags = JSON.parse((target.tags as string) || '[]') as string[];
        const mergedTags = [...new Set([...targetTags, ...sourceTags])];
        if (mergedTags.length > targetTags.length) {
          updateData.tags = JSON.stringify(mergedTags);
          fieldsMerged.push('tags');
        }
      } catch {
        // Tags merge failed, skip
      }

      // Update target lead with merged data
      if (fieldsMerged.length > 0) {
        await db.lead.update({
          where: { id: targetLeadId },
          data: updateData,
        });
      }

      // Soft-delete source lead
      await db.lead.update({
        where: { id: sourceLeadId },
        data: { isActive: false, deletedAt: new Date() },
      });

      // Reassign source lead's notes to target
      await db.leadNote.updateMany({
        where: { leadId: sourceLeadId },
        data: { leadId: targetLeadId },
      });

      // Reassign source lead's activities to target
      try {
        await db.leadActivity.updateMany({
          where: { leadId: sourceLeadId },
          data: { leadId: targetLeadId },
        });
      } catch {
        // LeadActivity may not exist
      }

      // Audit log
      await logAuditEvent(user.id, 'leads_merged', {
        targetId: targetLeadId,
        sourceId: sourceLeadId,
        fieldsMerged,
        targetBusinessName: target.businessName,
        sourceBusinessName: source.businessName,
        fieldSelections: fieldSelections ? 'custom' : 'default',
      });

      return NextResponse.json({
        success: true,
        mergedLeadId: targetLeadId,
        deletedLeadId: sourceLeadId,
        fieldsMerged,
      });
    } catch (error) {
      console.error('[API /leads/merge] Error:', error);
      return NextResponse.json(
        { error: 'Failed to merge leads' },
        { status: 500 }
      );
    }
  });
}
