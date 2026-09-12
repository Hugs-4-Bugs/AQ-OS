// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Bounce Intelligence Service
// Phase 9: Gmail Fixes — Bounce classification, pattern tracking,
// auto-suppression, and exponential backoff retry
//
// Classifies bounces (hard/soft/complaint/auto-reply), tracks bounce
// patterns per domain, auto-suppresses repeatedly bouncing addresses,
// and suggests when to stop emailing a domain.
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';

// ===== TYPES =====

export type BounceClassification = 'hard_bounce' | 'soft_bounce' | 'complaint' | 'auto_reply';

export interface ClassifyBounceResult {
  classification: BounceClassification;
  confidence: number; // 0-1
  reason: string;
  shouldRetry: boolean;
  suppressAddress: boolean;
  retryDelayMs?: number; // For soft bounces with exponential backoff
}

export interface BouncePattern {
  domain: string;
  totalBounces: number;
  hardBounces: number;
  softBounces: number;
  complaints: number;
  uniqueAddresses: number;
  suppressionRate: number;
  shouldStopEmailing: boolean;
  recommendation: string;
}

export interface BounceIntelligence {
  address: string;
  totalBounces: number;
  lastBounceAt: Date | null;
  classification: BounceClassification;
  isSuppressed: boolean;
  patterns: BouncePattern | null;
}

export interface HandleBounceEventResult {
  success: boolean;
  classification: BounceClassification;
  isSuppressed: boolean;
  error?: string;
}

// ===== BOUNCE CLASSIFICATION PATTERNS =====

const HARD_BOUNCE_PATTERNS = [
  /user not found/i,
  /no such user/i,
  /recipient not found/i,
  /address not found/i,
  /invalid recipient/i,
  /mailbox unavailable/i,
  /mailbox does not exist/i,
  /550.*not.*found/i,
  /550.*invalid/i,
  /553.*not.*found/i,
  /5\.1\.1/i, // SMTP: Bad destination mailbox address
  /5\.2\.1/i, // SMTP: Mailbox disabled
  /5\.4\.1/i, // SMTP: Recipient address rejected
  /delivery failed.*permanent/i,
  /permanent.*failure/i,
  /undeliverable/i,
];

const SOFT_BOUNCE_PATTERNS = [
  /mailbox full/i,
  /over quota/i,
  /quota exceeded/i,
  /temporarily unavailable/i,
  /temporary.*failure/i,
  /4\.2\.2/i, // SMTP: Mailbox full
  /4\.4\.7/i, // SMTP: Message expired
  /4\.7\.1/i, // SMTP: Delivery time expired
  /retry.*later/i,
  /try.*again.*later/i,
  /greylisted/i,
  /deferred/i,
  /throttle/i,
  /rate limit/i,
  /too many.*connections/i,
];

const COMPLAINT_PATTERNS = [
  /complaint/i,
  /spam.*report/i,
  /reported.*spam/i,
  /marked.*spam/i,
  /unsubscribe.*complaint/i,
  /abuse/i,
  /feedback.*report/i,
  /arf/i, // Abuse Reporting Format
  /5\.7\.1/i, // SMTP: Delivery not authorized, message refused
];

const AUTO_REPLY_PATTERNS = [
  /out of office/i,
  /auto.*reply/i,
  /automatic.*response/i,
  /vacation/i,
  /away.*from/i,
  /out.*of.*town/i,
  /on.*leave/i,
  /maternity.*leave/i,
  /sick.*leave/i,
];

// ===== CORE FUNCTIONS =====

/**
 * Classify a bounce based on the bounce reason/message.
 * Returns the classification, confidence, and recommended actions.
 */
export function classifyBounce(bounceReason: string, smtpCode?: string): ClassifyBounceResult {
  const reason = `${bounceReason} ${smtpCode || ''}`.trim();

  // Check each classification in priority order

  // 1. Complaint (highest priority — must suppress immediately)
  for (const pattern of COMPLAINT_PATTERNS) {
    if (pattern.test(reason)) {
      return {
        classification: 'complaint',
        confidence: 0.95,
        reason: 'Recipient reported email as spam/abuse',
        shouldRetry: false,
        suppressAddress: true,
      };
    }
  }

  // 2. Hard bounce (permanent failure — should suppress)
  for (const pattern of HARD_BOUNCE_PATTERNS) {
    if (pattern.test(reason)) {
      return {
        classification: 'hard_bounce',
        confidence: 0.9,
        reason: 'Permanent delivery failure — address likely invalid',
        shouldRetry: false,
        suppressAddress: true,
      };
    }
  }

  // 3. Auto-reply (not a real bounce)
  for (const pattern of AUTO_REPLY_PATTERNS) {
    if (pattern.test(reason)) {
      return {
        classification: 'auto_reply',
        confidence: 0.85,
        reason: 'Auto-reply / out-of-office — not a real bounce',
        shouldRetry: false,
        suppressAddress: false,
      };
    }
  }

  // 4. Soft bounce (temporary failure — may retry)
  for (const pattern of SOFT_BOUNCE_PATTERNS) {
    if (pattern.test(reason)) {
      return {
        classification: 'soft_bounce',
        confidence: 0.8,
        reason: 'Temporary delivery failure — may succeed on retry',
        shouldRetry: true,
        suppressAddress: false,
        retryDelayMs: 3600000, // Default 1 hour — will be adjusted by exponential backoff
      };
    }
  }

  // Default: classify as soft bounce with low confidence
  return {
    classification: 'soft_bounce',
    confidence: 0.4,
    reason: 'Unclassified bounce — treating as temporary failure',
    shouldRetry: true,
    suppressAddress: false,
    retryDelayMs: 3600000,
  };
}

/**
 * Calculate exponential backoff delay for soft bounce retries.
 * @param retryCount - Number of previous retries
 * @param baseDelayMs - Base delay in milliseconds (default: 1 hour)
 * @param maxDelayMs - Maximum delay cap (default: 72 hours)
 */
export function calculateExponentialBackoff(
  retryCount: number,
  baseDelayMs: number = 3600000,
  maxDelayMs: number = 72 * 3600000
): number {
  // Exponential backoff with jitter: base * 2^retry + random jitter
  const delay = baseDelayMs * Math.pow(2, retryCount);
  const jitter = Math.random() * baseDelayMs * 0.1; // 10% jitter
  return Math.min(delay + jitter, maxDelayMs);
}

/**
 * Track bounce patterns for a specific email domain.
 * Returns analysis including whether to stop emailing that domain.
 */
export async function trackBouncePattern(domain: string): Promise<BouncePattern> {
  try {
    const emailSuffix = `@${domain}`;

    // Get all bounces for this domain
    const bounces = await db.emailBounce.findMany({
      where: { email: { endsWith: emailSuffix } },
      select: { email: true, bounceType: true, bounceReason: true, createdAt: true },
    });

    const totalBounces = bounces.length;
    const hardBounces = bounces.filter(b => b.bounceType === 'hard').length;
    const softBounces = bounces.filter(b => b.bounceType === 'soft').length;
    const complaints = bounces.filter(b =>
      b.bounceReason && COMPLAINT_PATTERNS.some(p => p.test(b.bounceReason || ''))
    ).length;

    // Count unique addresses
    const uniqueAddresses = new Set(bounces.map(b => b.email)).size;

    // Calculate suppression rate
    const suppressedAddresses = await db.emailUnsubscribe.findMany({
      where: { email: { endsWith: emailSuffix } },
      select: { email: true },
    });
    const suppressionRate = uniqueAddresses > 0 ? suppressedAddresses.length / uniqueAddresses : 0;

    // Determine if we should stop emailing this domain
    const shouldStopEmailing =
      complaints >= 3 || // 3+ spam complaints
      (hardBounces >= 5 && hardBounces / totalBounces > 0.5) || // >50% hard bounces with 5+ total
      suppressionRate > 0.8; // >80% of addresses suppressed

    // Generate recommendation
    let recommendation: string;
    if (shouldStopEmailing) {
      if (complaints >= 3) {
        recommendation = `STOP: ${complaints} spam complaints from ${domain} — legal risk. Cease all emailing immediately.`;
      } else if (hardBounces / totalBounces > 0.5) {
        recommendation = `STOP: >50% hard bounce rate on ${domain}. Domain may have aggressive filtering. Verify addresses before resuming.`;
      } else {
        recommendation = `STOP: >80% of addresses at ${domain} are suppressed. Very low deliverability expected.`;
      }
    } else if (hardBounces / totalBounces > 0.3) {
      recommendation = `CAUTION: ${hardBounces} hard bounces on ${domain}. Consider double-checking email list quality.`;
    } else if (softBounces > hardBounces * 2) {
      recommendation = `MONITOR: High soft bounce ratio on ${domain} — may indicate temporary infrastructure issues.`;
    } else {
      recommendation = `OK: Bounce rate for ${domain} is within acceptable limits.`;
    }

    return {
      domain,
      totalBounces,
      hardBounces,
      softBounces,
      complaints,
      uniqueAddresses,
      suppressionRate,
      shouldStopEmailing,
      recommendation,
    };
  } catch (error) {
    console.error('[BounceIntel] Failed to track bounce pattern:', error);
    return {
      domain,
      totalBounces: 0,
      hardBounces: 0,
      softBounces: 0,
      complaints: 0,
      uniqueAddresses: 0,
      suppressionRate: 0,
      shouldStopEmailing: false,
      recommendation: 'Error analyzing bounce patterns.',
    };
  }
}

/**
 * Check if an email address should be suppressed (stop sending).
 * Considers: hard bounces, complaints, and domain-level patterns.
 */
export async function shouldSuppressAddress(email: string): Promise<{
  suppress: boolean;
  reason: string;
}> {
  try {
    // Check if already unsubscribed/suppressed
    const existing = await db.emailUnsubscribe.findFirst({
      where: { email },
    });

    if (existing) {
      return { suppress: true, reason: 'Address is already in suppression list' };
    }

    // Check hard bounces for this address
    const bounces = await db.emailBounce.findMany({
      where: { email },
      select: { bounceType: true, bounceReason: true, createdAt: true },
    });

    // Any hard bounce → suppress
    const hardBounces = bounces.filter(b => b.bounceType === 'hard');
    if (hardBounces.length > 0) {
      return { suppress: true, reason: `Address has ${hardBounces.length} hard bounce(s) — likely invalid` };
    }

    // Check for complaints
    const complaints = bounces.filter(b =>
      b.bounceReason && COMPLAINT_PATTERNS.some(p => p.test(b.bounceReason || ''))
    );
    if (complaints.length > 0) {
      return { suppress: true, reason: `Address has ${complaints.length} spam complaint(s) — legal risk` };
    }

    // Check domain-level pattern
    const domain = email.split('@')[1];
    if (domain) {
      const pattern = await trackBouncePattern(domain);
      if (pattern.shouldStopEmailing) {
        return { suppress: true, reason: `Domain ${domain} flagged: ${pattern.recommendation}` };
      }
    }

    // Multiple soft bounces — check count
    const softBounces = bounces.filter(b => b.bounceType === 'soft');
    if (softBounces.length >= 5) {
      return { suppress: true, reason: `Address has ${softBounces.length} soft bounces — persistently undeliverable` };
    }

    return { suppress: false, reason: 'Address is deliverable' };
  } catch (error) {
    console.error('[BounceIntel] Suppression check failed:', error);
    return { suppress: false, reason: 'Could not check suppression status' };
  }
}

/**
 * Get comprehensive bounce intelligence for an email address.
 */
export async function getBounceIntelligence(email: string): Promise<BounceIntelligence> {
  try {
    const bounces = await db.emailBounce.findMany({
      where: { email },
      orderBy: { createdAt: 'desc' },
    });

    const suppressed = await db.emailUnsubscribe.findFirst({
      where: { email },
    });

    // Determine primary classification from most recent bounce
    let classification: BounceClassification = 'soft_bounce';
    if (bounces.length > 0) {
      const latestBounce = bounces[0];
      if (latestBounce.bounceType === 'hard') {
        classification = 'hard_bounce';
      } else if (latestBounce.bounceReason && COMPLAINT_PATTERNS.some(p => p.test(latestBounce.bounceReason || ''))) {
        classification = 'complaint';
      } else if (latestBounce.bounceReason && AUTO_REPLY_PATTERNS.some(p => p.test(latestBounce.bounceReason || ''))) {
        classification = 'auto_reply';
      }
    }

    // Get domain pattern
    const domain = email.split('@')[1];
    const patterns = domain ? await trackBouncePattern(domain) : null;

    return {
      address: email,
      totalBounces: bounces.length,
      lastBounceAt: bounces.length > 0 ? bounces[0].createdAt : null,
      classification,
      isSuppressed: !!suppressed,
      patterns,
    };
  } catch (error) {
    console.error('[BounceIntel] Failed to get intelligence:', error);
    return {
      address: email,
      totalBounces: 0,
      lastBounceAt: null,
      classification: 'soft_bounce',
      isSuppressed: false,
      patterns: null,
    };
  }
}

/**
 * Handle a bounce event: classify, record, and take action.
 * This is the main entry point for processing bounces.
 */
export async function handleBounceEvent(params: {
  userId: string;
  email: string;
  bounceReason: string;
  leadId?: string;
  messageId?: string;
  smtpCode?: string;
}): Promise<HandleBounceEventResult> {
  const { userId, email, bounceReason, leadId, messageId, smtpCode } = params;

  try {
    // 1. Classify the bounce
    const classification = classifyBounce(bounceReason, smtpCode);

    // 2. Determine bounce type for storage
    const bounceType = classification.classification === 'hard_bounce' ? 'hard' : 'soft';

    // 3. Record the bounce
    await db.emailBounce.create({
      data: {
        userId,
        email,
        leadId: leadId || null,
        bounceType,
        bounceReason,
        messageId: messageId || null,
      },
    });

    // 4. Take action based on classification
    if (classification.suppressAddress) {
      // Auto-suppress the address
      await autoSuppressAddress(email, userId, classification.classification);
    }

    // 5. Update lead email status if leadId is available
    if (leadId) {
      try {
        const status = classification.classification === 'hard_bounce'
          ? 'bounced'
          : classification.classification === 'complaint'
            ? 'unsubscribed'
            : 'bounced'; // soft bounce also marks as bounced

        await db.lead.update({
          where: { id: leadId },
          data: { emailStatus: status },
        });
      } catch {
        // Lead may not exist or already deleted
      }
    }

    // 6. Update outreach message if messageId is available
    if (messageId) {
      try {
        await db.outreachMessage.updateMany({
          where: { id: messageId },
          data: {
            status: 'bounced',
            bouncedAt: new Date(),
          },
        });
      } catch {
        // Message may not exist
      }
    }

    console.log(`[BounceIntel] Handled bounce for ${email}: ${classification.classification} (suppressed: ${classification.suppressAddress})`);

    return {
      success: true,
      classification: classification.classification,
      isSuppressed: classification.suppressAddress,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error handling bounce';
    console.error('[BounceIntel] Failed to handle bounce event:', message);
    return {
      success: false,
      classification: 'soft_bounce',
      isSuppressed: false,
      error: message,
    };
  }
}

// ===== HELPER FUNCTIONS =====

/**
 * Auto-suppress an email address by adding it to the unsubscribe table.
 */
async function autoSuppressAddress(
  email: string,
  userId: string,
  reason: BounceClassification
): Promise<void> {
  try {
    // Check if already suppressed
    const existing = await db.emailUnsubscribe.findFirst({
      where: { email },
    });

    if (existing) return; // Already suppressed

    // Add to suppression list
    await db.emailUnsubscribe.create({
      data: {
        userId,
        email,
        reason: `Auto-suppressed: ${reason}`,
      },
    });

    console.log(`[BounceIntel] Auto-suppressed: ${email} (${reason})`);
  } catch (error) {
    console.error('[BounceIntel] Failed to auto-suppress:', error);
  }
}

/**
 * Get bounce intelligence summary for a user.
 */
export async function getUserBounceSummary(userId: string): Promise<{
  totalBounces: number;
  hardBounces: number;
  softBounces: number;
  complaints: number;
  autoReplies: number;
  suppressedAddresses: number;
  topBouncingDomains: Array<{ domain: string; bounces: number }>;
}> {
  try {
    const bounces = await db.emailBounce.findMany({
      where: { userId },
      select: { email: true, bounceType: true, bounceReason: true },
    });

    const suppressed = await db.emailUnsubscribe.findMany({
      where: { userId },
      select: { email: true },
    });

    // Classify each bounce
    let hardBounces = 0;
    let softBounces = 0;
    let complaints = 0;
    let autoReplies = 0;

    const domainCounts: Record<string, number> = {};

    for (const b of bounces) {
      const result = classifyBounce(b.bounceReason || '');
      switch (result.classification) {
        case 'hard_bounce': hardBounces++; break;
        case 'soft_bounce': softBounces++; break;
        case 'complaint': complaints++; break;
        case 'auto_reply': autoReplies++; break;
      }

      const domain = b.email.split('@')[1];
      if (domain) {
        domainCounts[domain] = (domainCounts[domain] || 0) + 1;
      }
    }

    const topBouncingDomains = Object.entries(domainCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([domain, bounces]) => ({ domain, bounces }));

    return {
      totalBounces: bounces.length,
      hardBounces,
      softBounces,
      complaints,
      autoReplies,
      suppressedAddresses: suppressed.length,
      topBouncingDomains,
    };
  } catch (error) {
    console.error('[BounceIntel] Failed to get user bounce summary:', error);
    return {
      totalBounces: 0,
      hardBounces: 0,
      softBounces: 0,
      complaints: 0,
      autoReplies: 0,
      suppressedAddresses: 0,
      topBouncingDomains: [],
    };
  }
}
