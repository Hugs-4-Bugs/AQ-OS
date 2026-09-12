// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Lead Score Recalculation Helper
// FIX 2: Recalculate a lead's conversionScore (and derive rating)
// whenever a LeadActivity is created or the lead's pipeline stage
// changes. The score is based on the lead's current pipeline stage
// plus the number of activities recorded against it, so the leads
// table always reflects live engagement rather than a stale 0.
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';

// Stage → base conversion weight (0–100). Mirrors STAGE_ORDER progression
// from src/lib/types.ts (discovered → analyzed → contacted → replied →
// discussion → proposal → negotiation → won, with lost as a terminal 0).
const STAGE_BASE_WEIGHT: Record<string, number> = {
  discovered: 10,
  analyzed: 20,
  contacted: 35,
  replied: 50,
  discussion: 60,
  proposal: 72,
  negotiation: 85,
  won: 100,
  lost: 0,
};

/**
 * Recalculate and persist a lead's conversionScore + rating.
 *
 * Formula:
 *   base     = STAGE_BASE_WEIGHT[stage] ?? 10
 *   bonus    = min(20, activityCount * 2)   // +2 per activity, capped at 20
 *   convScore = clamp(base + bonus, 0, 100)
 *   rating    = convScore / 20               // 0–5 scale, one decimal
 *
 * Persists BOTH fields to the Lead row so the leads table (which reads
 * live from /api/leads) always shows current values.
 *
 * Never throws — errors are logged so the caller's transaction/activity
 * creation is never blocked by a recalc failure.
 */
export async function recalcLeadScores(leadId: string): Promise<void> {
  try {
    const lead = await db.lead.findUnique({
      where: { id: leadId },
      select: { id: true, stage: true },
    });

    if (!lead) return;

    const activityCount = await db.leadActivity.count({ where: { leadId } });

    const base = STAGE_BASE_WEIGHT[lead.stage] ?? 10;
    const bonus = Math.min(20, activityCount * 2);
    const convScore = Math.max(0, Math.min(100, Math.round(base + bonus)));
    // Derive a 0–5 rating from the conv score (one decimal place).
    const rating = Math.round((convScore / 20) * 10) / 10;

    await db.lead.update({
      where: { id: leadId },
      data: {
        conversionScore: convScore,
        rating,
      },
    });
  } catch (error) {
    // Never block the caller — just log.
    console.error('[lead-score-recalc] Failed to recalc scores for lead', leadId, error);
  }
}
