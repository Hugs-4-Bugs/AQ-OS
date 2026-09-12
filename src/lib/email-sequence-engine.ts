// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Email Sequence Engine
// Phase 3: Complete sequence automation engine
//
// Provides:
// - Create sequences with ordered steps
// - Enroll leads in sequences
// - Process due steps (cron-driven)
// - Pause / resume enrollments
// - Sequence analytics aggregation
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { sendEmail } from '@/lib/email';
import { logger } from '@/lib/observability/logger';

// ===== TYPES =====

export interface CreateSequenceInput {
  name: string;
  description?: string;
  channel?: string;
  steps: Array<{
    order: number;
    channel: string;
    subject?: string;
    template: string;
    delayDays: number;
    delayHours?: number;
  }>;
}

export interface SequenceAnalytics {
  totalEnrolled: number;
  activeEnrolled: number;
  completedEnrolled: number;
  optedOutEnrolled: number;
  optOutRate: number;
  stepStats: Array<{
    stepOrder: number;
    sent: number;
    opened: number;
    replied: number;
    bounced: number;
  }>;
}

// ===== ENGINE =====

export class EmailSequenceEngine {
  // ── Create a new sequence with steps ──────────────────────────

  async createSequence(userId: string, data: CreateSequenceInput) {
    // Create the sequence and its steps in a transaction
    const sequence = await db.outreachSequence.create({
      data: {
        userId,
        name: data.name,
        description: data.description,
        channel: data.channel || 'email',
        status: 'draft',
        steps: JSON.stringify(
          data.steps.map((s) => ({
            order: s.order,
            channel: s.channel,
            subject: s.subject,
            template: s.template,
            delayDays: s.delayDays,
            delayHours: s.delayHours || 0,
          }))
        ),
        sequenceSteps: {
          create: data.steps.map((s) => ({
            order: s.order,
            channel: s.channel,
            subject: s.subject,
            template: s.template,
            delayDays: s.delayDays,
            delayHours: s.delayHours || 0,
          })),
        },
      },
      include: {
        sequenceSteps: {
          orderBy: { order: 'asc' },
        },
      },
    });

    logger.info('Sequence created', undefined, {
      sequenceId: sequence.id,
      userId,
      stepCount: data.steps.length,
    });

    return sequence;
  }

  // ── Enroll a lead in a sequence ───────────────────────────────

  async enrollLead(sequenceId: string, leadId: string) {
    // Verify the sequence exists and is active
    const sequence = await db.outreachSequence.findUnique({
      where: { id: sequenceId },
      include: {
        sequenceSteps: { orderBy: { order: 'asc' } },
      },
    });

    if (!sequence) {
      throw new Error('Sequence not found');
    }

    if (sequence.status !== 'active') {
      throw new Error(`Sequence is not active (status: ${sequence.status})`);
    }

    // Check if lead is already enrolled in this sequence
    const existingEnrollment = await db.sequenceEnrollment.findFirst({
      where: {
        sequenceId,
        leadId,
        status: { in: ['active', 'paused'] },
      },
    });

    if (existingEnrollment) {
      throw new Error('Lead is already enrolled in this sequence');
    }

    // Check if lead has an email (required for email sequences)
    const lead = await db.lead.findUnique({
      where: { id: leadId },
    });

    if (!lead) {
      throw new Error('Lead not found');
    }

    if (!lead.email && sequence.channel === 'email') {
      throw new Error('Lead does not have an email address');
    }

    // Check if lead has unsubscribed
    if (lead.emailStatus === 'unsubscribed') {
      throw new Error('Lead has unsubscribed from emails');
    }

    // Calculate first step send time
    const firstStep = sequence.sequenceSteps[0];
    let nextSendAt: Date | null = null;

    if (firstStep) {
      nextSendAt = new Date();
      nextSendAt.setDate(nextSendAt.getDate() + firstStep.delayDays);
      nextSendAt.setHours(nextSendAt.getHours() + (firstStep.delayHours || 0));
    }

    const enrollment = await db.sequenceEnrollment.create({
      data: {
        sequenceId,
        leadId,
        currentStep: 0,
        nextSendAt,
        status: 'active',
      },
    });

    logger.info('Lead enrolled in sequence', undefined, {
      enrollmentId: enrollment.id,
      sequenceId,
      leadId,
      nextSendAt: nextSendAt?.toISOString(),
    });

    return enrollment;
  }

  // ── Process all due sequence steps (called by cron) ───────────

  async processDueSteps(): Promise<{ processed: number; errors: number }> {
    const now = new Date();

    // Find all active enrollments where nextSendAt <= now
    const dueEnrollments = await db.sequenceEnrollment.findMany({
      where: {
        status: 'active',
        nextSendAt: { lte: now },
      },
      include: {
        sequence: {
          include: {
            sequenceSteps: { orderBy: { order: 'asc' } },
          },
        },
        lead: true,
      },
    });

    let processed = 0;
    let errors = 0;

    for (const enrollment of dueEnrollments) {
      try {
        const steps = enrollment.sequence.sequenceSteps;
        const currentStepIndex = enrollment.currentStep;

        // Check if we've passed all steps
        if (currentStepIndex >= steps.length) {
          await db.sequenceEnrollment.update({
            where: { id: enrollment.id },
            data: {
              status: 'completed',
              nextSendAt: null,
            },
          });
          processed++;
          continue;
        }

        const step = steps[currentStepIndex];
        if (!step) {
          // Step missing — mark enrollment as completed
          await db.sequenceEnrollment.update({
            where: { id: enrollment.id },
            data: {
              status: 'completed',
              nextSendAt: null,
            },
          });
          processed++;
          continue;
        }

        // Execute the step
        await this.executeStep(enrollment, step);

        // Advance enrollment
        await this.advanceEnrollment(enrollment.id, steps);

        processed++;
      } catch (err) {
        errors++;
        logger.error('Failed to process enrollment step', undefined, {
          error: err,
          enrollmentId: enrollment.id,
          sequenceId: enrollment.sequenceId,
          leadId: enrollment.leadId,
          currentStep: enrollment.currentStep,
        });
      }
    }

    logger.info('Sequence processing complete', undefined, {
      processed,
      errors,
      totalDue: dueEnrollments.length,
    });

    return { processed, errors };
  }

  // ── Advance a specific enrollment to next step ────────────────

  async advanceEnrollment(enrollmentId: string, steps?: Array<{ id: string; order: number; delayDays: number; delayHours: number }>): Promise<void> {
    const enrollment = await db.sequenceEnrollment.findUnique({
      where: { id: enrollmentId },
      include: {
        sequence: {
          include: {
            sequenceSteps: { orderBy: { order: 'asc' } },
          },
        },
      },
    });

    if (!enrollment) {
      throw new Error('Enrollment not found');
    }

    const allSteps = steps || enrollment.sequence.sequenceSteps;
    const nextStepIndex = enrollment.currentStep + 1;

    // If this was the last step, mark enrollment as completed
    if (nextStepIndex >= allSteps.length) {
      await db.sequenceEnrollment.update({
        where: { id: enrollmentId },
        data: {
          status: 'completed',
          nextSendAt: null,
          currentStep: nextStepIndex,
        },
      });

      logger.info('Enrollment completed — all steps done', undefined, {
        enrollmentId,
        totalSteps: allSteps.length,
      });
      return;
    }

    // Calculate next send time based on the next step's delay
    const nextStep = allSteps[nextStepIndex];
    const nextSendAt = new Date();
    nextSendAt.setDate(nextSendAt.getDate() + nextStep.delayDays);
    nextSendAt.setHours(nextSendAt.getHours() + nextStep.delayHours);

    await db.sequenceEnrollment.update({
      where: { id: enrollmentId },
      data: {
        currentStep: nextStepIndex,
        nextSendAt,
      },
    });

    logger.info('Enrollment advanced to next step', undefined, {
      enrollmentId,
      fromStep: enrollment.currentStep,
      toStep: nextStepIndex,
      nextSendAt: nextSendAt.toISOString(),
    });
  }

  // ── Pause an enrollment ───────────────────────────────────────

  async pauseEnrollment(enrollmentId: string): Promise<void> {
    const enrollment = await db.sequenceEnrollment.findUnique({
      where: { id: enrollmentId },
    });

    if (!enrollment) {
      throw new Error('Enrollment not found');
    }

    if (enrollment.status !== 'active') {
      throw new Error(`Cannot pause enrollment with status: ${enrollment.status}`);
    }

    await db.sequenceEnrollment.update({
      where: { id: enrollmentId },
      data: { status: 'paused' },
    });

    logger.info('Enrollment paused', undefined, { enrollmentId });
  }

  // ── Resume an enrollment ──────────────────────────────────────

  async resumeEnrollment(enrollmentId: string): Promise<void> {
    const enrollment = await db.sequenceEnrollment.findUnique({
      where: { id: enrollmentId },
      include: {
        sequence: {
          include: {
            sequenceSteps: { orderBy: { order: 'asc' } },
          },
        },
      },
    });

    if (!enrollment) {
      throw new Error('Enrollment not found');
    }

    if (enrollment.status !== 'paused') {
      throw new Error(`Cannot resume enrollment with status: ${enrollment.status}`);
    }

    // Recalculate nextSendAt based on current step
    const steps = enrollment.sequence.sequenceSteps;
    const currentStep = steps[enrollment.currentStep];
    let nextSendAt: Date | null = null;

    if (currentStep) {
      nextSendAt = new Date();
      nextSendAt.setDate(nextSendAt.getDate() + currentStep.delayDays);
      nextSendAt.setHours(nextSendAt.getHours() + currentStep.delayHours);
    }

    await db.sequenceEnrollment.update({
      where: { id: enrollmentId },
      data: {
        status: 'active',
        nextSendAt,
      },
    });

    logger.info('Enrollment resumed', undefined, {
      enrollmentId,
      currentStep: enrollment.currentStep,
      nextSendAt: nextSendAt?.toISOString(),
    });
  }

  // ── Get sequence analytics ────────────────────────────────────

  async getAnalytics(sequenceId: string): Promise<SequenceAnalytics> {
    const sequence = await db.outreachSequence.findUnique({
      where: { id: sequenceId },
      include: {
        sequenceSteps: { orderBy: { order: 'asc' } },
        enrollments: true,
      },
    });

    if (!sequence) {
      throw new Error('Sequence not found');
    }

    const enrollments = sequence.enrollments;
    const totalEnrolled = enrollments.length;
    const activeEnrolled = enrollments.filter((e) => e.status === 'active').length;
    const completedEnrolled = enrollments.filter((e) => e.status === 'completed').length;
    const optedOutEnrolled = enrollments.filter((e) => e.status === 'opted_out').length;
    const optOutRate = totalEnrolled > 0 ? (optedOutEnrolled / totalEnrolled) * 100 : 0;

    // Build step stats from OutreachMessage records
    const stepStats: SequenceAnalytics['stepStats'] = [];

    for (const step of sequence.sequenceSteps) {
      const messages = await db.outreachMessage.findMany({
        where: { sequenceStepId: step.id },
      });

      stepStats.push({
        stepOrder: step.order,
        sent: messages.filter((m) => ['sent', 'delivered', 'opened', 'replied'].includes(m.status)).length,
        opened: messages.filter((m) => m.status === 'opened' || m.openedAt !== null).length,
        replied: messages.filter((m) => m.status === 'replied' || m.repliedAt !== null).length,
        bounced: messages.filter((m) => m.status === 'bounced' || m.bouncedAt !== null).length,
      });
    }

    return {
      totalEnrolled,
      activeEnrolled,
      completedEnrolled,
      optedOutEnrolled,
      optOutRate: Math.round(optOutRate * 100) / 100,
      stepStats,
    };
  }

  // ── Execute a single step (send the email/message) ────────────

  private async executeStep(
    enrollment: {
      id: string;
      sequenceId: string;
      leadId: string;
      currentStep: number;
      status: string;
      sequence: {
        userId: string;
        sequenceSteps: Array<{
          id: string;
          order: number;
          channel: string;
          subject: string | null;
          template: string;
          delayDays: number;
          delayHours: number;
        }>;
      };
      lead: {
        id: string;
        email: string | null;
        businessName: string;
        ownerName: string | null;
      };
    },
    step: {
      id: string;
      order: number;
      channel: string;
      subject: string | null;
      template: string;
      delayDays: number;
      delayHours: number;
    }
  ): Promise<void> {
    const lead = enrollment.lead;
    const userEmail = lead.email;

    if (!userEmail) {
      logger.warn('Skipping step — lead has no email', undefined, {
        enrollmentId: enrollment.id,
        leadId: lead.id,
        stepId: step.id,
      });
      return;
    }

    // Generate a tracking pixel ID for open tracking
    const trackingPixelId = `seq-${step.id}-${enrollment.id}-${Date.now()}`;

    // Process template with lead data
    const processedContent = this.processTemplate(step.template, {
      businessName: lead.businessName,
      ownerName: lead.ownerName || 'there',
      leadEmail: userEmail,
    });

    const processedSubject = step.subject
      ? this.processTemplate(step.subject, {
          businessName: lead.businessName,
          ownerName: lead.ownerName || 'there',
          leadEmail: userEmail,
        })
      : `Re: ${lead.businessName}`;

    // Add tracking pixel to HTML content
    // FIX (production): previously fell back to 'http://localhost:3000' which
    // produces an unreachable tracking pixel URL in production. Now falls
    // back to a neutral placeholder so a misconfigured env doesn't silently
    // emit broken localhost URLs in real emails.
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || '';
    if (!appUrl) {
      console.warn('[email-sequence-engine] NEXT_PUBLIC_APP_URL / APP_URL not set — tracking pixel URL will be empty. Configure env vars in production.');
    }
    const trackingPixelHtml = appUrl
      ? `<img src="${appUrl}/api/email/tracking/pixel/${trackingPixelId}" width="1" height="1" alt="" style="display:none;" />`
      : `<!-- tracking pixel ${trackingPixelId} suppressed: APP_URL not set -->`;
    const htmlContent = processedContent.replace('</body>', `${trackingPixelHtml}</body>`).replace('</html>', '');

    // Send the email
    let sendStatus = 'sent';
    let errorMessage: string | null = null;

    try {
      const result = await sendEmail({
        to: userEmail,
        subject: processedSubject,
        html: htmlContent || processedContent,
        text: processedContent.replace(/<[^>]*>/g, ''),
      });

      if (!result.sent) {
        sendStatus = 'failed';
        errorMessage = result.error || 'Unknown send failure';
      }
    } catch (err) {
      sendStatus = 'failed';
      errorMessage = err instanceof Error ? err.message : 'Unknown error';
      logger.error('Failed to send sequence email', undefined, {
        error: err,
        enrollmentId: enrollment.id,
        stepId: step.id,
        leadId: lead.id,
      });
    }

    // Create OutreachMessage record
    await db.outreachMessage.create({
      data: {
        leadId: lead.id,
        userId: enrollment.sequence.userId,
        channel: step.channel,
        direction: 'outbound',
        subject: processedSubject,
        content: processedContent,
        status: sendStatus,
        sentAt: sendStatus === 'sent' ? new Date() : null,
        generatedByAI: false,
        sequenceStepId: step.id,
        trackingPixelId,
        metadata: JSON.stringify({
          sequenceId: enrollment.sequenceId,
          enrollmentId: enrollment.id,
          stepOrder: step.order,
          errorMessage,
        }),
      },
    });

    // Update lead's email status and lastContactedAt
    if (sendStatus === 'sent') {
      await db.lead.update({
        where: { id: lead.id },
        data: {
          emailStatus: 'sent',
          lastContactedAt: new Date(),
        },
      });
    } else {
      // If bounced, mark it
      await db.lead.update({
        where: { id: lead.id },
        data: {
          emailStatus: 'bounced',
          lastContactedAt: new Date(),
        },
      });
    }

    logger.info('Sequence step executed', undefined, {
      enrollmentId: enrollment.id,
      stepId: step.id,
      stepOrder: step.order,
      sendStatus,
      leadId: lead.id,
    });
  }

  // ── Template processing ───────────────────────────────────────

  private processTemplate(
    template: string,
    variables: Record<string, string>
  ): string {
    let result = template;

    // Replace {{variable}} style placeholders
    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g');
      result = result.replace(regex, value);
    }

    return result;
  }
}

// ===== SINGLETON =====

export const emailSequenceEngine = new EmailSequenceEngine();
