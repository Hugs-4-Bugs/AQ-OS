// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Pipeline Service
// Phase 7: Pipeline stage management, lead movement, kanban view
//
// Default stages: discovered → analyzed → contacted → replied →
//   interested → negotiation → proposal_sent → closed_won / closed_lost
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { logAuditEvent } from '@/lib/lead-audit';
import { recalcLeadScores } from '@/lib/lead-score-recalc';

// ===== TYPES =====

export interface PipelineStageWithCount {
  id: string;
  name: string;
  order: number;
  color: string | null;
  isDefault: boolean;
  orgId: string | null;
  leadCount: number;
}

export interface PipelineView {
  stages: PipelineStageWithCount[];
  totalLeads: number;
}

export interface MoveResult {
  success: boolean;
  leadId: string;
  fromStage: string;
  toStage: string;
  error?: string;
}

// ===== DEFAULT STAGES =====

const DEFAULT_STAGES = [
  { name: 'discovered', order: 0, color: '#94a3b8' },
  { name: 'analyzed', order: 1, color: '#60a5fa' },
  { name: 'contacted', order: 2, color: '#f59e0b' },
  { name: 'replied', order: 3, color: '#10b981' },
  { name: 'interested', order: 4, color: '#8b5cf6' },
  { name: 'negotiation', order: 5, color: '#ec4899' },
  { name: 'proposal_sent', order: 6, color: '#f97316' },
  { name: 'closed_won', order: 7, color: '#22c55e' },
  { name: 'closed_lost', order: 8, color: '#ef4444' },
];

// ===== SEED DEFAULT STAGES =====

/**
 * Ensure default pipeline stages exist.
 * Called on first access.
 */
export async function seedDefaultStages(): Promise<void> {
  const existing = await db.pipelineStage.count({ where: { isDefault: true } });

  if (existing === 0) {
    await db.pipelineStage.createMany({
      data: DEFAULT_STAGES.map((stage) => ({
        ...stage,
        isDefault: true,
        orgId: null,
      })),
    });
  }
}

// ===== GET PIPELINE STAGES =====

/**
 * Get pipeline stages with lead counts.
 * Includes org-specific stages if orgId provided.
 */
export async function getPipelineStages(orgId?: string): Promise<PipelineStageWithCount[]> {
  // Ensure defaults exist
  await seedDefaultStages();

  // Get stages (default + org-specific)
  const where: Record<string, unknown> = {};
  if (orgId) {
    where.OR = [{ isDefault: true, orgId: null }, { orgId }];
  } else {
    where.isDefault = true;
    where.orgId = null;
  }

  const stages = await db.pipelineStage.findMany({
    where,
    orderBy: { order: 'asc' },
  });

  // Get lead counts per stage
  const stagesWithCounts = await Promise.all(
    stages.map(async (stage) => {
      const leadWhere: Record<string, unknown> = { isActive: true, stage: stage.name };
      if (orgId) leadWhere.orgId = orgId;

      const leadCount = await db.lead.count({ where: leadWhere });

      return {
        id: stage.id,
        name: stage.name,
        order: stage.order,
        color: stage.color,
        isDefault: stage.isDefault,
        orgId: stage.orgId,
        leadCount,
      };
    })
  );

  return stagesWithCounts;
}

// ===== MOVE LEAD TO STAGE =====

/**
 * Move a lead to a different pipeline stage.
 * Creates audit log entry.
 */
export async function moveLeadToStage(
  leadId: string,
  newStage: string,
  userId: string
): Promise<MoveResult> {
  try {
    const lead = await db.lead.findFirst({
      where: { id: leadId, isActive: true },
    });

    if (!lead) {
      return {
        success: false,
        leadId,
        fromStage: '',
        toStage: newStage,
        error: 'Lead not found',
      };
    }

    if (lead.stage === newStage) {
      return {
        success: false,
        leadId,
        fromStage: lead.stage,
        toStage: newStage,
        error: 'Lead is already in this stage',
      };
    }

    const fromStage = lead.stage;

    // Update lead stage
    await db.lead.update({
      where: { id: leadId },
      data: { stage: newStage },
    });

    // Create lead activity record
    await db.leadActivity.create({
      data: {
        leadId,
        type: 'stage_change',
        description: `Stage changed from "${fromStage}" to "${newStage}"`,
        metadata: JSON.stringify({ fromStage, toStage: newStage, changedBy: userId }),
      },
    });

    // FIX 2: Recalculate convScore + rating since the pipeline stage
    // (and therefore the base weight) changed and a new activity was
    // recorded. Fire-and-forget — never block the stage move.
    void recalcLeadScores(leadId).catch((err) => {
      console.error('[pipeline-service] recalcLeadScores failed:', err);
    });

    // Audit log
    await logAuditEvent(userId, 'stage_changed', {
      leadId,
      fromStage,
      toStage: newStage,
      businessName: lead.businessName,
    });

    return {
      success: true,
      leadId,
      fromStage,
      toStage: newStage,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      leadId,
      fromStage: '',
      toStage: newStage,
      error: message,
    };
  }
}

// ===== PIPELINE VIEW =====

/**
 * Get full pipeline view: leads grouped by stage.
 */
export async function getPipelineView(
  userId: string,
  options?: {
    orgId?: string;
    niche?: string;
    country?: string;
    search?: string;
    page?: number;
    limit?: number;
  }
): Promise<PipelineView> {
  // Ensure defaults exist
  await seedDefaultStages();

  // Get user's orgId if not provided
  let orgId = options?.orgId;
  if (!orgId) {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { orgId: true },
    });
    orgId = user?.orgId || undefined;
  }

  // Get stages with counts
  const stages = await getPipelineStages(orgId);

  // Build base where clause for leads
  const baseWhere: Record<string, unknown> = {
    isActive: true,
  };

  if (orgId) {
    baseWhere.orgId = orgId;
  } else {
    baseWhere.userId = userId;
  }

  if (options?.niche) baseWhere.niche = options.niche;
  if (options?.country) baseWhere.country = options.country;

  // Get total count
  const totalLeads = await db.lead.count({ where: baseWhere });

  return {
    stages,
    totalLeads,
  };
}

/**
 * Get leads for a specific stage with pagination.
 */
export async function getLeadsByStage(
  userId: string,
  stage: string,
  options?: {
    orgId?: string;
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }
): Promise<{
  leads: Array<{
    id: string;
    businessName: string;
    ownerName: string | null;
    email: string | null;
    phone: string | null;
    city: string | null;
    country: string | null;
    niche: string | null;
    rating: number | null;
    replyScore: number;
    conversionScore: number;
    urgencyScore: number;
    revenuePotentialScore: number;
    stage: string;
    source: string | null;
    createdAt: Date;
  }>;
  total: number;
  page: number;
  totalPages: number;
}> {
  const page = options?.page || 1;
  const limit = Math.min(options?.limit || 50, 100);
  const offset = (page - 1) * limit;

  let orgId = options?.orgId;
  if (!orgId) {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { orgId: true },
    });
    orgId = user?.orgId || undefined;
  }

  const where: Record<string, unknown> = {
    isActive: true,
    stage,
  };

  if (orgId) {
    where.orgId = orgId;
  } else {
    where.userId = userId;
  }

  const sortBy = options?.sortBy || 'createdAt';
  const sortOrder = options?.sortOrder || 'desc';

  const [leads, total] = await Promise.all([
    db.lead.findMany({
      where,
      orderBy: { [sortBy]: sortOrder },
      take: limit,
      skip: offset,
      select: {
        id: true,
        businessName: true,
        ownerName: true,
        email: true,
        phone: true,
        city: true,
        country: true,
        niche: true,
        rating: true,
        replyScore: true,
        conversionScore: true,
        urgencyScore: true,
        revenuePotentialScore: true,
        stage: true,
        source: true,
        createdAt: true,
      },
    }),
    db.lead.count({ where }),
  ]);

  return {
    leads,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  };
}
