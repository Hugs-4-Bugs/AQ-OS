// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Sequence Processor
// Auto-executes pending outreach sequences
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { checkCreditSufficiency, deductCredits } from './credit-service';
import { sendEmail, type SendEmailParams } from './gmail-delivery-service';

// ===== TYPES =====

interface SequenceProcessResult {
  processed: number;
  sent: number;
  errors: number;
}

// ===== CONSTANTS =====

const MAX_SENDS_PER_RUN = 20; // Daily send limit protection

// ===== MAIN PROCESSOR =====

export async function processPendingSequences(): Promise<SequenceProcessResult> {
  const result: SequenceProcessResult = { processed: 0, sent: 0, errors: 0 };
  const now = new Date();

  // Find all active enrollments where nextSendAt <= now
  const enrollments = await db.sequenceEnrollment.findMany({
    where: {
      status: 'active',
      nextSendAt: { lte: now },
    },
    include: {
      sequence: {
        include: {
          sequenceSteps: {
            orderBy: { order: 'asc' },
          },
        },
      },
      lead: {
        where: { isActive: true },
      },
    },
    orderBy: { nextSendAt: 'asc' },
    take: MAX_SENDS_PER_RUN,
  });

  for (const enrollment of enrollments) {
    if (!enrollment.lead) continue;
    if (enrollment.sequence.sequenceSteps.length === 0) continue;

    try {
      await processEnrollmentStep(enrollment, result);
    } catch (error) {
      console.error(`[SequenceProcessor] Error processing enrollment ${enrollment.id}:`, error);
      result.errors++;

      // Mark as failed if too many errors
      await db.sequenceEnrollment.update({
        where: { id: enrollment.id },
        data: {
          status: 'paused',
        },
      });
    }
  }

  return result;
}

// ===== PROCESS A SINGLE ENROLLMENT STEP =====

async function processEnrollmentStep(
  enrollment: {
    id: string;
    currentStep: number;
    sequenceId: string;
    leadId: string;
    sequence: {
      userId: string;
      channel: string;
      sequenceSteps: Array<{
        id: string;
        order: number;
        channel: string;
        subject?: string | null;
        template: string;
        delayDays: number;
        delayHours: number;
      }>;
    };
    lead: {
      id: string;
      businessName: string;
      email?: string | null;
      ownerName?: string | null;
      website?: string | null;
      niche?: string | null;
      stage: string;
    };
  },
  result: SequenceProcessResult
): Promise<void> {
  const step = enrollment.sequence.sequenceSteps[enrollment.currentStep];

  if (!step) {
    // No more steps — mark completed
    await db.sequenceEnrollment.update({
      where: { id: enrollment.id },
      data: { status: 'completed' },
    });
    return;
  }

  // Check credits (1 credit per sequence step)
  const userId = enrollment.sequence.userId;
  const creditCheck = await checkCreditSufficiency(userId, 1);
  if (!creditCheck.sufficient) {
    console.log(`[SequenceProcessor] User ${userId} has insufficient credits, skipping`);
    return;
  }

  // Deduct credit
  const deduction = await deductCredits({
    userId,
    action: 'outreach_sequence',
    cost: 1,
    referenceId: enrollment.id,
  });

  if (!deduction.success) {
    result.errors++;
    return;
  }

  // Personalize the template
  const personalizedSubject = personalizeTemplate(step.subject || `Re: ${enrollment.lead.businessName}`, enrollment.lead);
  const personalizedBody = personalizeTemplate(step.template, enrollment.lead);

  // Send if lead has email and channel is email
  if (step.channel === 'email' && enrollment.lead.email) {
    try {
      const emailAccount = await db.emailAccount.findFirst({
        where: { userId, status: 'active' },
      });

      if (emailAccount) {
        await sendEmail(emailAccount.id, {
          to: enrollment.lead.email,
          subject: personalizedSubject,
          body: personalizedBody,
        });

        // Create outreach message record
        await db.outreachMessage.create({
          data: {
            leadId: enrollment.leadId,
            userId,
            channel: 'email',
            direction: 'outbound',
            subject: personalizedSubject,
            content: personalizedBody,
            status: 'sent',
            sentAt: new Date(),
            generatedByAI: true,
            sequenceStepId: step.id,
          },
        });

        // Update lead email status
        await db.lead.update({
          where: { id: enrollment.leadId },
          data: {
            emailStatus: 'sent',
            lastContactedAt: new Date(),
          },
        });

        result.sent++;
      }
    } catch (sendError) {
      console.error(`[SequenceProcessor] Failed to send email:`, sendError);
      result.errors++;

      // Create failed outreach record
      await db.outreachMessage.create({
        data: {
          leadId: enrollment.leadId,
          userId,
          channel: 'email',
          direction: 'outbound',
          subject: personalizedSubject,
          content: personalizedBody,
          status: 'failed',
          generatedByAI: true,
          sequenceStepId: step.id,
          metadata: JSON.stringify({
            error: sendError instanceof Error ? sendError.message : 'Send failed',
          }),
        },
      });

      // Advance step anyway (don't retry the same step)
    }
  } else {
    // Non-email channels — create as draft
    await db.outreachMessage.create({
      data: {
        leadId: enrollment.leadId,
        userId,
        channel: step.channel,
        direction: 'outbound',
        content: personalizedBody,
        status: 'draft',
        generatedByAI: true,
        sequenceStepId: step.id,
      },
    });
  }

  // Advance to next step
  const nextStepIndex = enrollment.currentStep + 1;
  const nextStep = enrollment.sequence.sequenceSteps[nextStepIndex];

  if (nextStep) {
    // Calculate next send time
    const nextSendAt = new Date();
    nextSendAt.setDate(nextSendAt.getDate() + (nextStep.delayDays || 1));
    nextSendAt.setHours(nextSendAt.getHours() + (nextStep.delayHours || 0));

    await db.sequenceEnrollment.update({
      where: { id: enrollment.id },
      data: {
        currentStep: nextStepIndex,
        nextSendAt,
      },
    });
  } else {
    // All steps completed
    await db.sequenceEnrollment.update({
      where: { id: enrollment.id },
      data: { status: 'completed', currentStep: nextStepIndex },
    });
  }

  result.processed++;
}

// ===== TEMPLATE PERSONALIZATION =====

function personalizeTemplate(
  template: string,
  lead: {
    businessName: string;
    ownerName?: string | null;
    website?: string | null;
    niche?: string | null;
  }
): string {
  return template
    .replace(/\{\{businessName\}\}/g, lead.businessName)
    .replace(/\{\{ownerName\}\}/g, lead.ownerName || 'there')
    .replace(/\{\{firstName\}\}/g, lead.ownerName?.split(' ')[0] || 'there')
    .replace(/\{\{website\}\}/g, lead.website || '')
    .replace(/\{\{niche\}\}/g, lead.niche || '');
}
