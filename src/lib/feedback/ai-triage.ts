// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — AI Triage for Feedback Reports
// Uses the existing executeAICompletion infrastructure to classify
// incoming feedback. Deducts 1 AI credit per triage.
//
// Runs AFTER the feedback is saved and the API response is returned
// (caller should use setImmediate to invoke this non-blocking).
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { executeAICompletion } from '@/lib/ai/ai-provider';
import { deductCredits } from '@/lib/credit-service';
import { createNotification } from '@/lib/notification-service';
import { logAuditEvent } from '@/lib/lead-audit';

export interface AITriageResult {
  severity: 'low' | 'medium' | 'high' | 'critical';
  affectedModule: string;
  likelyCause: string;
  duplicateProbability: number;
  suggestedPriority: 'low' | 'medium' | 'high' | 'urgent';
  tags: string[];
  requiresImmediateAttention: boolean;
  suggestedAssignee: string;
}

const DEFAULT_RESULT: AITriageResult = {
  severity: 'medium',
  affectedModule: 'unknown',
  likelyCause: 'Unable to analyze — manual review required',
  duplicateProbability: 0,
  suggestedPriority: 'medium',
  tags: [],
  requiresImmediateAttention: false,
  suggestedAssignee: '',
};

interface FeedbackForTriage {
  id: string;
  userId: string;
  ticketNumber: string;
  type: string;
  title: string;
  description: string;
  pageUrl: string | null;
  errorLogs: unknown;
  severity: string;
}

function buildPrompt(report: FeedbackForTriage): string {
  let errorSummary = '';
  if (report.errorLogs && Array.isArray(report.errorLogs)) {
    const logs = report.errorLogs as Array<{ message?: string }>;
    errorSummary = logs
      .slice(0, 3)
      .map((e) => e?.message || '')
      .filter(Boolean)
      .join(' | ')
      .slice(0, 200);
  }

  return `Analyze this user feedback report and classify it.

Title: ${report.title}
Type: ${report.type}
Description: ${report.description.slice(0, 1000)}
Page: ${report.pageUrl || 'unknown'}
Error logs: ${errorSummary || 'none'}

Return ONLY valid JSON (no markdown, no code fences):
{
  "severity": "low" | "medium" | "high" | "critical",
  "affectedModule": "<string — which module likely affected>",
  "likelyCause": "<string — brief likely cause>",
  "duplicateProbability": <number 0-1>,
  "suggestedPriority": "low" | "medium" | "high" | "urgent",
  "tags": ["<string>", ...],
  "requiresImmediateAttention": <boolean>,
  "suggestedAssignee": "<string — role or team>"
}`;
}

function parseAIResponse(content: string): AITriageResult {
  try {
    // Strip any markdown code fences
    let cleaned = content.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\s*/, '').replace(/```\s*$/, '');
    }
    const parsed = JSON.parse(cleaned);

    return {
      severity: ['low', 'medium', 'high', 'critical'].includes(parsed.severity)
        ? parsed.severity
        : DEFAULT_RESULT.severity,
      affectedModule: typeof parsed.affectedModule === 'string' ? parsed.affectedModule : DEFAULT_RESULT.affectedModule,
      likelyCause: typeof parsed.likelyCause === 'string' ? parsed.likelyCause : DEFAULT_RESULT.likelyCause,
      duplicateProbability:
        typeof parsed.duplicateProbability === 'number'
          ? Math.max(0, Math.min(1, parsed.duplicateProbability))
          : 0,
      suggestedPriority: ['low', 'medium', 'high', 'urgent'].includes(parsed.suggestedPriority)
        ? parsed.suggestedPriority
        : DEFAULT_RESULT.suggestedPriority,
      tags: Array.isArray(parsed.tags)
        ? parsed.tags.filter((t: unknown) => typeof t === 'string').slice(0, 10)
        : [],
      requiresImmediateAttention: Boolean(parsed.requiresImmediateAttention),
      suggestedAssignee: typeof parsed.suggestedAssignee === 'string' ? parsed.suggestedAssignee : '',
    };
  } catch {
    return DEFAULT_RESULT;
  }
}

/**
 * Run AI triage on a feedback report. Non-blocking — call via setImmediate.
 * Deducts 1 AI credit. Updates the FeedbackReport with results.
 * Sends urgent admin notification if requiresImmediateAttention is true.
 */
export async function triageFeedback(
  feedbackId: string,
  report: FeedbackForTriage,
): Promise<void> {
  try {
    // Deduct 1 credit (best-effort — don't block triage if credit fails)
    // FIX (2026-09-09): deductCredits expects `cost` (per DeductCreditsParams),
    // NOT `amount`. Passing `amount` left `cost` undefined → newBalance = NaN
    // → Prisma "Argument `credits` is missing" error on every triage.
    try {
      await deductCredits({
        userId: report.userId,
        cost: 1,
        action: 'feedback_triage' as never,
        referenceId: feedbackId,
      });
    } catch (creditErr) {
      console.warn('[AI Triage] Credit deduction failed (continuing):', creditErr);
    }

    const prompt = buildPrompt(report);
    const result = await executeAICompletion(
      {
        messages: [
          {
            role: 'system',
            content:
              'You are an expert QA and support engineer for AcquisitionOS, a B2B lead acquisition SaaS. Analyze user feedback and return ONLY valid JSON with the requested fields. No prose, no markdown.',
          },
          { role: 'user', content: prompt },
        ],
        config: { provider: 'z-ai', maxTokens: 600, temperature: 0.3, timeout: 30000, retries: 1 },
      },
      report.userId,
      'feedback_triage',
    );

    const triage: AITriageResult = result.success && result.content
      ? parseAIResponse(result.content)
      : DEFAULT_RESULT;

    // Update feedback record
    // FIX (2026-09-09): MERGE tags instead of replacing. The email
    // delivery layer (src/lib/feedback/admin-email.ts) stores
    // `email-sent:<iso>` / `email-failed:<iso>` status tags on the same
    // field — replacing wholesale erased them and silently disabled the
    // "no feedback email is ever lost" retry sweep. Triage tags are
    // appended after the preserved email-* tags.
    const priorRecord = await db.feedbackReport.findUnique({
      where: { id: feedbackId },
      select: { tags: true },
    });
    const preservedEmailTags = (Array.isArray(priorRecord?.tags) ? priorRecord.tags : [])
      .filter((t): t is string => typeof t === 'string' && t.startsWith('email-'));
    const mergedTags = [
      ...preservedEmailTags,
      ...triage.tags,
    ];

    await db.feedbackReport.update({
      where: { id: feedbackId },
      data: {
        aiClassification: triage as unknown as Record<string, unknown>,
        aiSeverity: triage.severity,
        aiModule: triage.affectedModule,
        aiDuplicateScore: triage.duplicateProbability,
        tags: mergedTags as never,
        priority: triage.suggestedPriority,
      },
    });

    // Audit log
    try {
      await logAuditEvent(
        report.userId,
        'feedback_triaged',
        {
          feedbackId,
          ticketNumber: report.ticketNumber,
          aiSeverity: triage.severity,
          aiModule: triage.affectedModule,
          aiDuplicateScore: triage.duplicateProbability,
          requiresImmediateAttention: triage.requiresImmediateAttention,
        },
        feedbackId,
      );
    } catch {
      // ignore audit failure
    }

    // Urgent admin notification
    if (triage.requiresImmediateAttention) {
      try {
        // Find admins (super_admin, owner, admin)
        const admins = await db.user.findMany({
          where: { role: { in: ['super_admin', 'owner', 'admin'] }, isActive: true },
          select: { id: true },
        });
        for (const admin of admins) {
          await createNotification({
            userId: admin.id,
            type: 'system',
            title: `URGENT feedback: ${report.ticketNumber}`,
            message: `${report.title} — AI flagged as ${triage.severity} severity, module: ${triage.affectedModule}`,
            actionUrl: `/admin/feedback`,
            metadata: { feedbackId, ticketNumber: report.ticketNumber, urgent: true },
          });
        }
      } catch {
        // ignore
      }
    }

    console.info(
      `[AI Triage] Completed for ${report.ticketNumber}: severity=${triage.severity}, module=${triage.affectedModule}`,
    );
  } catch (err) {
    console.error('[AI Triage] Failed for feedback', feedbackId, err);
    // Don't rethrow — this runs in setImmediate and should never crash the process
  }
}
