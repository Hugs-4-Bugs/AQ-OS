// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Email Sequence Automation Engine
// Complete outreach sequence/campaign engine with step progression,
// enrollment management, credit deduction, and analytics.
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { deductCredits, checkCreditSufficiency, CREDIT_COSTS } from '@/lib/credit-service';
import { sendEmail } from '@/lib/email';

// ===== TYPES =====

export interface CreateSequenceParams {
  name: string;
  description?: string;
  channel?: string;
  steps: SequenceStepInput[];
}

export interface SequenceStepInput {
  channel: string;
  subject?: string;
  template: string;
  delayDays?: number;
  delayHours?: number;
}

export interface UpdateSequenceParams {
  name?: string;
  description?: string;
  channel?: string;
  steps?: SequenceStepInput[];
  status?: string;
}

export interface ListSequencesFilters {
  status?: string;
  page?: number;
  limit?: number;
  search?: string;
}

export interface SequenceAnalytics {
  sequenceId: string;
  sequenceName: string;
  totalEnrolled: number;
  activeCount: number;
  completedCount: number;
  pausedCount: number;
  optedOutCount: number;
  totalSteps: number;
  stepStats: StepAnalytics[];
  overallOpenRate: number;
  overallReplyRate: number;
}

export interface StepAnalytics {
  stepOrder: number;
  stepId: string;
  sentCount: number;
  deliveredCount: number;
  openCount: number;
  replyCount: number;
  bouncedCount: number;
  failedCount: number;
  openRate: number;
  replyRate: number;
}

export interface BulkEnrollResult {
  enrolled: string[];
  skipped: Array<{ leadId: string; reason: string }>;
  failed: Array<{ leadId: string; reason: string }>;
}

export interface SequenceDetail {
  id: string;
  name: string;
  description: string | null;
  status: string;
  channel: string;
  steps: Array<{
    id: string;
    order: number;
    channel: string;
    subject: string | null;
    template: string;
    delayDays: number;
    delayHours: number;
  }>;
  enrollments: Array<{
    id: string;
    leadId: string;
    leadName: string | null;
    leadEmail: string | null;
    currentStep: number;
    nextSendAt: string | null;
    status: string;
    createdAt: string;
  }>;
  enrollmentCounts: {
    active: number;
    completed: number;
    paused: number;
    optedOut: number;
    total: number;
  };
}

// ===== CREDIT COST =====

const SEQUENCE_STEP_CREDIT_COST = CREDIT_COSTS.outreach_message || 2;
const SEQUENCE_ENROLL_CREDIT_COST = CREDIT_COSTS.outreach_sequence || 8;

// ===== HELPER FUNCTIONS =====

function computeNextSendAt(delayDays: number, delayHours: number): Date {
  const now = new Date();
  return new Date(now.getTime() + (delayDays * 24 * 60 * 60 * 1000) + (delayHours * 60 * 60 * 1000));
}

// ===== SEQUENCE CRUD =====

/**
 * Create a new outreach sequence with steps.
 * Creates both the OutreachSequence record and individual SequenceStep records.
 */
export async function createSequence(
  userId: string,
  params: CreateSequenceParams
) {
  if (!params.name || !params.name.trim()) {
    return { success: false, error: 'Sequence name is required' };
  }

  if (!params.steps || params.steps.length === 0) {
    return { success: false, error: 'At least one step is required' };
  }

  if (params.steps.length > 20) {
    return { success: false, error: 'Maximum 20 steps per sequence' };
  }

  try {
    const sequence = await db.$transaction(async (tx) => {
      // Create the sequence
      const seq = await tx.outreachSequence.create({
        data: {
          userId,
          name: params.name.trim(),
          description: params.description?.trim() || null,
          status: 'draft',
          channel: params.channel || 'email',
          steps: JSON.stringify(params.steps),
        },
      });

      // Create individual SequenceStep records
      for (let i = 0; i < params.steps.length; i++) {
        const step = params.steps[i];
        await tx.sequenceStep.create({
          data: {
            sequenceId: seq.id,
            order: i,
            channel: step.channel || params.channel || 'email',
            subject: step.subject || null,
            template: step.template,
            delayDays: step.delayDays ?? (i === 0 ? 0 : 1),
            delayHours: step.delayHours ?? 0,
          },
        });
      }

      return seq;
    });

    // Fetch with steps
    const fullSequence = await db.outreachSequence.findUnique({
      where: { id: sequence.id },
      include: {
        sequenceSteps: { orderBy: { order: 'asc' } },
      },
    });

    return { success: true, sequence: fullSequence };
  } catch (error) {
    console.error('[EmailSequenceService] Create sequence error:', error);
    return { success: false, error: 'Failed to create sequence' };
  }
}

/**
 * Update an existing outreach sequence.
 */
export async function updateSequence(
  sequenceId: string,
  userId: string,
  params: UpdateSequenceParams
) {
  try {
    // Verify ownership
    const existing = await db.outreachSequence.findFirst({
      where: { id: sequenceId, userId },
    });

    if (!existing) {
      return { success: false, error: 'Sequence not found' };
    }

    if (existing.status === 'completed') {
      return { success: false, error: 'Cannot update a completed sequence' };
    }

    const updateData: Record<string, unknown> = {};
    if (params.name !== undefined) updateData.name = params.name.trim();
    if (params.description !== undefined) updateData.description = params.description?.trim() || null;
    if (params.channel !== undefined) updateData.channel = params.channel;

    // If steps are provided, replace all steps
    if (params.steps) {
      if (params.steps.length === 0) {
        return { success: false, error: 'At least one step is required' };
      }
      if (params.steps.length > 20) {
        return { success: false, error: 'Maximum 20 steps per sequence' };
      }

      await db.$transaction(async (tx) => {
        // Delete existing steps
        await tx.sequenceStep.deleteMany({ where: { sequenceId } });

        // Create new steps
        for (let i = 0; i < params.steps!.length; i++) {
          const step = params.steps![i];
          await tx.sequenceStep.create({
            data: {
              sequenceId,
              order: i,
              channel: step.channel || params.channel || existing.channel,
              subject: step.subject || null,
              template: step.template,
              delayDays: step.delayDays ?? (i === 0 ? 0 : 1),
              delayHours: step.delayHours ?? 0,
            },
          });
        }

        updateData.steps = JSON.stringify(params.steps);
      });
    }

    // Update status if provided
    if (params.status !== undefined) {
      updateData.status = params.status;
    }

    if (Object.keys(updateData).length > 0) {
      await db.outreachSequence.update({
        where: { id: sequenceId },
        data: updateData,
      });
    }

    const updated = await db.outreachSequence.findUnique({
      where: { id: sequenceId },
      include: { sequenceSteps: { orderBy: { order: 'asc' } } },
    });

    return { success: true, sequence: updated };
  } catch (error) {
    console.error('[EmailSequenceService] Update sequence error:', error);
    return { success: false, error: 'Failed to update sequence' };
  }
}

/**
 * Delete an outreach sequence and all its enrollments.
 */
export async function deleteSequence(
  sequenceId: string,
  userId: string
) {
  try {
    const existing = await db.outreachSequence.findFirst({
      where: { id: sequenceId, userId },
    });

    if (!existing) {
      return { success: false, error: 'Sequence not found' };
    }

    // Delete enrollments first (cascade will handle SequenceStep)
    await db.sequenceEnrollment.deleteMany({
      where: { sequenceId },
    });

    // Delete sequence (cascade handles SequenceStep)
    await db.outreachSequence.delete({
      where: { id: sequenceId },
    });

    return { success: true };
  } catch (error) {
    console.error('[EmailSequenceService] Delete sequence error:', error);
    return { success: false, error: 'Failed to delete sequence' };
  }
}

// ===== ENROLLMENT MANAGEMENT =====

/**
 * Enroll a single lead into a sequence.
 * Checks: lead exists, is active, not already enrolled, sequence exists.
 */
export async function enrollLead(
  sequenceId: string,
  leadId: string,
  userId: string
) {
  try {
    // Verify sequence ownership
    const sequence = await db.outreachSequence.findFirst({
      where: { id: sequenceId, userId },
      include: { sequenceSteps: { orderBy: { order: 'asc' } } },
    });

    if (!sequence) {
      return { success: false, error: 'Sequence not found' };
    }

    if (sequence.status !== 'active' && sequence.status !== 'draft') {
      return { success: false, error: `Cannot enroll leads into a ${sequence.status} sequence` };
    }

    if (sequence.sequenceSteps.length === 0) {
      return { success: false, error: 'Sequence has no steps' };
    }

    // Verify lead
    // ACCOUNT ISOLATION: the lead MUST belong to the sequence owner —
    // previously any lead id in the system could be enrolled (and emailed)
    // by any user.
    const lead = await db.lead.findUnique({
      where: { id: leadId },
    });

    if (!lead || !lead.isActive || lead.userId !== userId) {
      return { success: false, error: 'Lead not found or inactive' };
    }

    if (!lead.email) {
      return { success: false, error: 'Lead has no email address' };
    }

    // Check if already enrolled in this sequence
    const existingEnrollment = await db.sequenceEnrollment.findFirst({
      where: {
        sequenceId,
        leadId,
        status: { in: ['active', 'paused'] },
      },
    });

    if (existingEnrollment) {
      return { success: false, error: 'Lead is already enrolled in this sequence' };
    }

    // Check for opted-out status
    const optedOut = await db.sequenceEnrollment.findFirst({
      where: {
        sequenceId,
        leadId,
        status: 'opted_out',
      },
    });

    if (optedOut) {
      return { success: false, error: 'Lead has opted out of this sequence' };
    }

    // Check credits
    const creditCheck = await checkCreditSufficiency(userId, SEQUENCE_ENROLL_CREDIT_COST);
    if (!creditCheck.sufficient) {
      return { success: false, error: `Insufficient credits. Need ${SEQUENCE_ENROLL_CREDIT_COST}, have ${creditCheck.balance}` };
    }

    // Deduct credits for enrollment
    const deduction = await deductCredits({
      userId,
      action: 'outreach_sequence',
      cost: SEQUENCE_ENROLL_CREDIT_COST,
      referenceId: sequenceId,
      idempotencyKey: `enroll_${sequenceId}_${leadId}`,
    });

    if (!deduction.success) {
      return { success: false, error: deduction.error || 'Failed to deduct enrollment credits' };
    }

    // Get first step delay
    const firstStep = sequence.sequenceSteps[0];
    const nextSendAt = computeNextSendAt(
      firstStep.delayDays ?? 0,
      firstStep.delayHours ?? 0
    );

    // Create enrollment
    const enrollment = await db.sequenceEnrollment.create({
      data: {
        sequenceId,
        leadId,
        currentStep: 0,
        nextSendAt,
        status: 'active',
      },
    });

    // Auto-activate sequence if it was in draft
    if (sequence.status === 'draft') {
      await db.outreachSequence.update({
        where: { id: sequenceId },
        data: { status: 'active' },
      });
    }

    return {
      success: true,
      enrollment,
      creditsDeducted: SEQUENCE_ENROLL_CREDIT_COST,
      newBalance: deduction.newBalance,
    };
  } catch (error) {
    console.error('[EmailSequenceService] Enroll lead error:', error);
    return { success: false, error: 'Failed to enroll lead' };
  }
}

/**
 * Bulk enroll multiple leads into a sequence.
 */
export async function bulkEnroll(
  sequenceId: string,
  leadIds: string[],
  userId: string
): Promise<BulkEnrollResult> {
  const result: BulkEnrollResult = {
    enrolled: [],
    skipped: [],
    failed: [],
  };

  for (const leadId of leadIds) {
    const enrollResult = await enrollLead(sequenceId, leadId, userId);
    if (enrollResult.success) {
      result.enrolled.push(leadId);
    } else if (enrollResult.error?.includes('already enrolled') || enrollResult.error?.includes('opted out')) {
      result.skipped.push({ leadId, reason: enrollResult.error || 'Skipped' });
    } else {
      result.failed.push({ leadId, reason: enrollResult.error || 'Failed' });
    }
  }

  return result;
}

/**
 * Unenroll/opt-out a lead from a sequence.
 */
export async function unenrollLead(
  enrollmentId: string,
  userId: string
) {
  try {
    const enrollment = await db.sequenceEnrollment.findFirst({
      where: { id: enrollmentId },
      include: { sequence: { select: { userId: true } } },
    });

    if (!enrollment) {
      return { success: false, error: 'Enrollment not found' };
    }

    if (enrollment.sequence.userId !== userId) {
      return { success: false, error: 'Not authorized' };
    }

    if (enrollment.status === 'completed' || enrollment.status === 'opted_out') {
      return { success: false, error: `Cannot unenroll from ${enrollment.status} enrollment` };
    }

    await db.sequenceEnrollment.update({
      where: { id: enrollmentId },
      data: { status: 'opted_out', nextSendAt: null },
    });

    return { success: true };
  } catch (error) {
    console.error('[EmailSequenceService] Unenroll error:', error);
    return { success: false, error: 'Failed to unenroll lead' };
  }
}

/**
 * Pause a specific enrollment.
 */
export async function pauseEnrollment(
  enrollmentId: string,
  userId: string
) {
  try {
    const enrollment = await db.sequenceEnrollment.findFirst({
      where: { id: enrollmentId },
      include: { sequence: { select: { userId: true } } },
    });

    if (!enrollment) {
      return { success: false, error: 'Enrollment not found' };
    }

    if (enrollment.sequence.userId !== userId) {
      return { success: false, error: 'Not authorized' };
    }

    if (enrollment.status !== 'active') {
      return { success: false, error: 'Only active enrollments can be paused' };
    }

    await db.sequenceEnrollment.update({
      where: { id: enrollmentId },
      data: { status: 'paused' },
    });

    return { success: true };
  } catch (error) {
    console.error('[EmailSequenceService] Pause enrollment error:', error);
    return { success: false, error: 'Failed to pause enrollment' };
  }
}

/**
 * Resume a paused enrollment.
 * Recalculates nextSendAt based on current step delay.
 */
export async function resumeEnrollment(
  enrollmentId: string,
  userId: string
) {
  try {
    const enrollment = await db.sequenceEnrollment.findFirst({
      where: { id: enrollmentId },
      include: { sequence: { select: { userId: true } } },
    });

    if (!enrollment) {
      return { success: false, error: 'Enrollment not found' };
    }

    if (enrollment.sequence.userId !== userId) {
      return { success: false, error: 'Not authorized' };
    }

    if (enrollment.status !== 'paused') {
      return { success: false, error: 'Only paused enrollments can be resumed' };
    }

    // Get current step's delay
    const step = await db.sequenceStep.findFirst({
      where: {
        sequenceId: enrollment.sequenceId,
        order: enrollment.currentStep,
      },
    });

    const nextSendAt = step
      ? computeNextSendAt(step.delayDays, step.delayHours)
      : new Date();

    await db.sequenceEnrollment.update({
      where: { id: enrollmentId },
      data: { status: 'active', nextSendAt },
    });

    return { success: true };
  } catch (error) {
    console.error('[EmailSequenceService] Resume enrollment error:', error);
    return { success: false, error: 'Failed to resume enrollment' };
  }
}

// ===== SEQUENCE-LEVEL PAUSE/RESUME =====

/**
 * Pause an entire sequence (pauses all active enrollments).
 */
export async function pauseSequence(
  sequenceId: string,
  userId: string
) {
  try {
    const sequence = await db.outreachSequence.findFirst({
      where: { id: sequenceId, userId },
    });

    if (!sequence) {
      return { success: false, error: 'Sequence not found' };
    }

    if (sequence.status !== 'active') {
      return { success: false, error: 'Only active sequences can be paused' };
    }

    await db.$transaction([
      db.outreachSequence.update({
        where: { id: sequenceId },
        data: { status: 'paused' },
      }),
      db.sequenceEnrollment.updateMany({
        where: { sequenceId, status: 'active' },
        data: { status: 'paused' },
      }),
    ]);

    return { success: true };
  } catch (error) {
    console.error('[EmailSequenceService] Pause sequence error:', error);
    return { success: false, error: 'Failed to pause sequence' };
  }
}

/**
 * Resume a paused sequence (resumes all paused enrollments that belong to it).
 */
export async function resumeSequence(
  sequenceId: string,
  userId: string
) {
  try {
    const sequence = await db.outreachSequence.findFirst({
      where: { id: sequenceId, userId },
      include: { sequenceSteps: { orderBy: { order: 'asc' } } },
    });

    if (!sequence) {
      return { success: false, error: 'Sequence not found' };
    }

    if (sequence.status !== 'paused') {
      return { success: false, error: 'Only paused sequences can be resumed' };
    }

    // Reactivate the sequence
    await db.outreachSequence.update({
      where: { id: sequenceId },
      data: { status: 'active' },
    });

    // Resume all paused enrollments with recalculated nextSendAt
    const pausedEnrollments = await db.sequenceEnrollment.findMany({
      where: { sequenceId, status: 'paused' },
    });

    for (const enrollment of pausedEnrollments) {
      const step = sequence.sequenceSteps.find(
        s => s.order === enrollment.currentStep
      );
      const nextSendAt = step
        ? computeNextSendAt(step.delayDays, step.delayHours)
        : new Date();

      await db.sequenceEnrollment.update({
        where: { id: enrollment.id },
        data: { status: 'active', nextSendAt },
      });
    }

    return { success: true, resumedCount: pausedEnrollments.length };
  } catch (error) {
    console.error('[EmailSequenceService] Resume sequence error:', error);
    return { success: false, error: 'Failed to resume sequence' };
  }
}

// ===== SEQUENCE PROCESSING ENGINE =====

/**
 * Process all pending sequence enrollments that are due.
 * For each due enrollment: send the step message, increment currentStep,
 * set nextSendAt for the next step. If all steps done → mark completed.
 *
 * @param userId - Optional. If provided, only processes enrollments for this user.
 *                 If omitted, processes all users (for cron).
 * @returns Number of enrollments processed.
 */
export async function processPendingEnrollments(userId?: string): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
  skipped: number;
}> {
  let processed = 0;
  let succeeded = 0;
  let failed = 0;
  let skipped = 0;

  try {
    // Build the base where clause
    const where: Record<string, unknown> = {
      status: 'active',
      nextSendAt: { lte: new Date() },
    };

    if (userId) {
      where.sequence = { userId, status: { in: ['active', 'draft'] } };
    } else {
      where.sequence = { status: { in: ['active', 'draft'] } };
    }

    // Find all due enrollments (batch of 200)
    const dueEnrollments = await db.sequenceEnrollment.findMany({
      where,
      include: {
        sequence: {
          include: { sequenceSteps: { orderBy: { order: 'asc' } } },
        },
        lead: {
          select: {
            id: true,
            email: true,
            businessName: true,
            ownerName: true,
            isActive: true,
          },
        },
      },
      take: 200,
    });

    for (const enrollment of dueEnrollments) {
      processed++;

      // Validate preconditions
      if (!enrollment.sequence.userId) {
        skipped++;
        continue;
      }

      if (!enrollment.lead.isActive || !enrollment.lead.email) {
        // Deactivate enrollment for invalid leads
        await db.sequenceEnrollment.update({
          where: { id: enrollment.id },
          data: { status: 'opted_out', nextSendAt: null },
        });
        skipped++;
        continue;
      }

      const steps = enrollment.sequence.sequenceSteps;
      const currentStepIndex = enrollment.currentStep;

      // Check if we have steps for this index
      if (currentStepIndex >= steps.length) {
        await db.sequenceEnrollment.update({
          where: { id: enrollment.id },
          data: { status: 'completed', nextSendAt: null },
        });
        skipped++;
        continue;
      }

      const currentStep = steps[currentStepIndex];
      const seqUserId = enrollment.sequence.userId;

      // Check credits
      const creditCheck = await checkCreditSufficiency(seqUserId, SEQUENCE_STEP_CREDIT_COST);
      if (!creditCheck.sufficient) {
        // Pause enrollment due to insufficient credits
        await db.sequenceEnrollment.update({
          where: { id: enrollment.id },
          data: { status: 'paused' },
        });
        skipped++;
        continue;
      }

      try {
        // Deduct credits
        const deduction = await deductCredits({
          userId: seqUserId,
          action: 'outreach_message',
          cost: SEQUENCE_STEP_CREDIT_COST,
          referenceId: enrollment.id,
          idempotencyKey: `seq_step_${enrollment.id}_${currentStepIndex}`,
        });

        if (!deduction.success) {
          await db.sequenceEnrollment.update({
            where: { id: enrollment.id },
            data: { status: 'paused' },
          });
          skipped++;
          continue;
        }

        // Send the email
        const emailResult = await sendEmail({
          to: enrollment.lead.email,
          subject: currentStep.subject || `Re: ${enrollment.lead.businessName}`,
          html: currentStep.template,
          text: currentStep.template.replace(/<[^>]*>/g, ''),
        });

        // Record the outreach message
        await db.outreachMessage.create({
          data: {
            leadId: enrollment.lead.id,
            userId: seqUserId,
            channel: currentStep.channel || 'email',
            direction: 'outbound',
            subject: currentStep.subject || null,
            content: currentStep.template,
            status: emailResult.sent ? 'sent' : 'failed',
            sentAt: emailResult.sent ? new Date() : null,
            generatedByAI: false,
            sequenceStepId: currentStep.id,
            metadata: JSON.stringify({
              enrollmentId: enrollment.id,
              sequenceId: enrollment.sequenceId,
              stepOrder: currentStepIndex,
            }),
          },
        });

        // Update lead status
        await db.lead.update({
          where: { id: enrollment.lead.id },
          data: {
            emailStatus: emailResult.sent ? 'sent' : 'bounced',
            lastContactedAt: new Date(),
          },
        });

        // Advance step or complete
        const nextStepIndex = currentStepIndex + 1;
        const updateData: Record<string, unknown> = {
          currentStep: nextStepIndex,
        };

        if (nextStepIndex >= steps.length) {
          // All steps completed
          updateData.status = 'completed';
          updateData.nextSendAt = null;
        } else {
          // Set nextSendAt for the next step
          const nextStep = steps[nextStepIndex];
          updateData.nextSendAt = computeNextSendAt(
            nextStep.delayDays,
            nextStep.delayHours
          );
        }

        await db.sequenceEnrollment.update({
          where: { id: enrollment.id },
          data: updateData,
        });

        succeeded++;
      } catch (stepError) {
        console.error(
          `[EmailSequenceService] Error processing enrollment ${enrollment.id}:`,
          stepError
        );
        failed++;
      }
    }
  } catch (error) {
    console.error('[EmailSequenceService] Process pending error:', error);
  }

  return { processed, succeeded, failed, skipped };
}

// ===== ANALYTICS =====

/**
 * Get detailed analytics for a specific sequence.
 */
export async function getSequenceAnalytics(
  sequenceId: string,
  userId: string
): Promise<{ success: boolean; analytics?: SequenceAnalytics; error?: string }> {
  try {
    const sequence = await db.outreachSequence.findFirst({
      where: { id: sequenceId, userId },
      include: {
        sequenceSteps: { orderBy: { order: 'asc' } },
      },
    });

    if (!sequence) {
      return { success: false, error: 'Sequence not found' };
    }

    // Get enrollment counts
    const enrollments = await db.sequenceEnrollment.findMany({
      where: { sequenceId },
      select: { status: true },
    });

    const totalEnrolled = enrollments.length;
    const activeCount = enrollments.filter(e => e.status === 'active').length;
    const completedCount = enrollments.filter(e => e.status === 'completed').length;
    const pausedCount = enrollments.filter(e => e.status === 'paused').length;
    const optedOutCount = enrollments.filter(e => e.status === 'opted_out').length;

    // Get step-level stats
    const stepStats: StepAnalytics[] = [];
    for (const step of sequence.sequenceSteps) {
      const messages = await db.outreachMessage.findMany({
        where: { sequenceStepId: step.id },
        select: { status: true },
      });

      const sentCount = messages.length;
      const deliveredCount = messages.filter(m => m.status === 'delivered' || m.status === 'sent').length;
      const openCount = messages.filter(m => m.status === 'opened' || m.status === 'replied').length;
      const replyCount = messages.filter(m => m.status === 'replied').length;
      const bouncedCount = messages.filter(m => m.status === 'bounced').length;
      const failedCount = messages.filter(m => m.status === 'failed').length;

      stepStats.push({
        stepOrder: step.order,
        stepId: step.id,
        sentCount,
        deliveredCount,
        openCount,
        replyCount,
        bouncedCount,
        failedCount,
        openRate: sentCount > 0 ? Math.round((openCount / sentCount) * 100) : 0,
        replyRate: sentCount > 0 ? Math.round((replyCount / sentCount) * 100) : 0,
      });
    }

    // Overall rates across all messages for this sequence
    const allMessages = await db.outreachMessage.findMany({
      where: {
        sequenceStepId: { in: sequence.sequenceSteps.map(s => s.id) },
      },
      select: { status: true },
    });

    const totalSent = allMessages.length;
    const totalOpens = allMessages.filter(m => m.status === 'opened' || m.status === 'replied').length;
    const totalReplies = allMessages.filter(m => m.status === 'replied').length;

    const analytics: SequenceAnalytics = {
      sequenceId,
      sequenceName: sequence.name,
      totalEnrolled,
      activeCount,
      completedCount,
      pausedCount,
      optedOutCount,
      totalSteps: sequence.sequenceSteps.length,
      stepStats,
      overallOpenRate: totalSent > 0 ? Math.round((totalOpens / totalSent) * 100) : 0,
      overallReplyRate: totalSent > 0 ? Math.round((totalReplies / totalSent) * 100) : 0,
    };

    return { success: true, analytics };
  } catch (error) {
    console.error('[EmailSequenceService] Analytics error:', error);
    return { success: false, error: 'Failed to get analytics' };
  }
}

// ===== LISTING & DETAIL =====

/**
 * List sequences for a user with pagination and filtering.
 */
export async function listSequences(
  userId: string,
  filters?: ListSequencesFilters
) {
  try {
    const page = filters?.page || 1;
    const limit = Math.min(100, Math.max(1, filters?.limit || 20));
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { userId };
    if (filters?.status) where.status = filters.status;
    if (filters?.search) {
      where.OR = [
        { name: { contains: filters.search } },
        { description: { contains: filters.search } },
      ];
    }

    const [sequences, total] = await Promise.all([
      db.outreachSequence.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          sequenceSteps: { select: { id: true }, orderBy: { order: 'asc' } },
          enrollments: {
            select: { status: true },
          },
        },
      }),
      db.outreachSequence.count({ where }),
    ]);

    const enriched = sequences.map(seq => ({
      ...seq,
      stepCount: seq.sequenceSteps.length,
      enrollmentCounts: {
        active: seq.enrollments.filter(e => e.status === 'active').length,
        completed: seq.enrollments.filter(e => e.status === 'completed').length,
        paused: seq.enrollments.filter(e => e.status === 'paused').length,
        optedOut: seq.enrollments.filter(e => e.status === 'opted_out').length,
        total: seq.enrollments.length,
      },
      // Remove raw enrollments from response
      enrollments: undefined,
      sequenceSteps: undefined,
    }));

    return {
      success: true,
      sequences: enriched,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  } catch (error) {
    console.error('[EmailSequenceService] List sequences error:', error);
    return { success: false, error: 'Failed to list sequences' };
  }
}

/**
 * Get full sequence detail with enrollments.
 */
export async function getSequenceDetail(
  sequenceId: string,
  userId: string
): Promise<{ success: boolean; detail?: SequenceDetail; error?: string }> {
  try {
    const sequence = await db.outreachSequence.findFirst({
      where: { id: sequenceId, userId },
      include: {
        sequenceSteps: { orderBy: { order: 'asc' } },
        enrollments: {
          include: {
            lead: {
              select: {
                id: true,
                businessName: true,
                ownerName: true,
                email: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!sequence) {
      return { success: false, error: 'Sequence not found' };
    }

    const enrollments = sequence.enrollments.map(e => ({
      id: e.id,
      leadId: e.leadId,
      leadName: e.lead.businessName,
      leadEmail: e.lead.email,
      currentStep: e.currentStep,
      nextSendAt: e.nextSendAt?.toISOString() || null,
      status: e.status,
      createdAt: e.createdAt.toISOString(),
    }));

    const detail: SequenceDetail = {
      id: sequence.id,
      name: sequence.name,
      description: sequence.description,
      status: sequence.status,
      channel: sequence.channel,
      steps: sequence.sequenceSteps.map(s => ({
        id: s.id,
        order: s.order,
        channel: s.channel,
        subject: s.subject,
        template: s.template,
        delayDays: s.delayDays,
        delayHours: s.delayHours,
      })),
      enrollments,
      enrollmentCounts: {
        active: enrollments.filter(e => e.status === 'active').length,
        completed: enrollments.filter(e => e.status === 'completed').length,
        paused: enrollments.filter(e => e.status === 'paused').length,
        optedOut: enrollments.filter(e => e.status === 'opted_out').length,
        total: enrollments.length,
      },
    };

    return { success: true, detail };
  } catch (error) {
    console.error('[EmailSequenceService] Sequence detail error:', error);
    return { success: false, error: 'Failed to get sequence detail' };
  }
}
