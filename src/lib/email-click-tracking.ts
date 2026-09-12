// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Email Click Tracking Service
// Phase 9: Gmail Fixes — Link rewriting, click tracking, redirect
//
// Rewrites links in email bodies for tracking, handles click redirect
// requests, records click events, and provides click statistics.
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';

// ===== TYPES =====

export interface RewriteResult {
  html: string;
  trackingLinks: Array<{
    trackingId: string;
    originalUrl: string;
    trackingUrl: string;
  }>;
}

export interface ClickEventResult {
  success: boolean;
  isFirstClick: boolean;
  redirectUrl: string;
  error?: string;
}

export interface ClickStats {
  totalClicks: number;
  uniqueClicks: number;
  clicksByUrl: Record<string, number>;
  clicksByDate: Record<string, number>;
  firstClickAt: Date | null;
  lastClickAt: Date | null;
}

// ===== CONSTANTS =====

// Regex to match href attributes in <a> tags
const HREF_REGEX = /href\s*=\s*["']([^"']+)["']/gi;

// URLs that should NOT be rewritten (internal, mailto, tel, etc.)
const SKIP_URL_PATTERNS = [
  /^mailto:/i,
  /^tel:/i,
  /^#/i,
  /^javascript:/i,
  /^\{/i, // Template variables like {{unsubscribe_url}}
];

// ===== CORE FUNCTIONS =====

/**
 * Rewrite all links in an email HTML body to tracking URLs.
 * Creates EmailTrackingLink records for each rewritten link.
 */
export async function rewriteLinksForTracking(
  html: string,
  emailMessageId?: string,
  outreachMessageId?: string
): Promise<RewriteResult> {
  const trackingLinks: RewriteResult['trackingLinks'] = [];

  // Find the message record for creating tracking links
  let messageIdForLinks = emailMessageId;

  // If we have an outreach message, use its ID
  if (outreachMessageId && !messageIdForLinks) {
    messageIdForLinks = outreachMessageId;
  }

  const rewrittenHtml = html.replace(HREF_REGEX, (match, url: string) => {
    // Skip URLs that shouldn't be tracked
    if (SKIP_URL_PATTERNS.some(pattern => pattern.test(url))) {
      return match;
    }

    // Skip URLs that are already tracking URLs
    if (url.includes('/api/email/tracking/click/')) {
      return match;
    }

    // Generate tracking ID
    const trackingId = `clk_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;

    // Build tracking URL
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || '';
    const trackingUrl = `${baseUrl}/api/email/tracking/click/${trackingId}`;

    trackingLinks.push({
      trackingId,
      originalUrl: url,
      trackingUrl,
    });

    return `href="${trackingUrl}"`;
  });

  // Store tracking links in the database
  if (trackingLinks.length > 0 && messageIdForLinks) {
    try {
      for (const link of trackingLinks) {
        await db.emailTrackingLink.create({
          data: {
            emailMessageId: messageIdForLinks,
            originalUrl: link.originalUrl,
            trackingId: link.trackingId,
            clickCount: 0,
          },
        });
      }
    } catch (error) {
      console.error('[ClickTracking] Failed to store tracking links:', error);
      // Continue — the links will still work for redirect but won't be persisted
    }
  }

  return { html: rewrittenHtml, trackingLinks };
}

/**
 * Handle a click tracking redirect request.
 * Records the click event and redirects the user to the original URL.
 */
export async function handleClickTrackingRequest(
  trackingId: string,
  ipAddress?: string,
  userAgent?: string
): Promise<ClickEventResult> {
  try {
    // Look up the tracking link
    const trackingLink = await db.emailTrackingLink.findFirst({
      where: { trackingId },
    });

    if (!trackingLink) {
      return {
        success: false,
        isFirstClick: false,
        redirectUrl: '/',
        error: 'Tracking link not found',
      };
    }

    // Check if this is the first click
    const existingClicks = await db.emailClickEvent.findMany({
      where: { trackingLinkId: trackingId },
      take: 1,
    });

    const isFirstClick = existingClicks.length === 0;

    // Record the click event
    await recordClickEvent(trackingId, trackingLink.originalUrl, ipAddress, userAgent);

    // Increment click count on the tracking link
    await db.emailTrackingLink.update({
      where: { id: trackingLink.id },
      data: { clickCount: { increment: 1 } },
    });

    return {
      success: true,
      isFirstClick,
      redirectUrl: trackingLink.originalUrl,
    };
  } catch (error) {
    console.error('[ClickTracking] Error handling click:', error);

    // Try to find the original URL for redirect even on error
    try {
      const trackingLink = await db.emailTrackingLink.findFirst({
        where: { trackingId },
        select: { originalUrl: true },
      });

      return {
        success: false,
        isFirstClick: false,
        redirectUrl: trackingLink?.originalUrl || '/',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    } catch {
      return {
        success: false,
        isFirstClick: false,
        redirectUrl: '/',
        error: 'Failed to process click',
      };
    }
  }
}

/**
 * Record a click event with timestamp, URL, IP, user-agent.
 */
export async function recordClickEvent(
  trackingLinkId: string,
  url: string,
  ipAddress?: string,
  userAgent?: string
): Promise<boolean> {
  try {
    await db.emailClickEvent.create({
      data: {
        trackingLinkId,
        url,
        ipAddress: ipAddress || null,
        userAgent: userAgent || null,
      },
    });

    return true;
  } catch (error) {
    console.error('[ClickTracking] Failed to record click event:', error);
    return false;
  }
}

/**
 * Get click statistics for a specific tracking link.
 */
export async function getClickStats(trackingId: string): Promise<ClickStats | null> {
  try {
    const trackingLink = await db.emailTrackingLink.findFirst({
      where: { trackingId },
    });

    if (!trackingLink) return null;

    const events = await db.emailClickEvent.findMany({
      where: { trackingLinkId: trackingId },
      orderBy: { clickedAt: 'asc' },
    });

    if (events.length === 0) {
      return {
        totalClicks: 0,
        uniqueClicks: 0,
        clicksByUrl: {},
        clicksByDate: {},
        firstClickAt: null,
        lastClickAt: null,
      };
    }

    // Calculate unique clicks (by distinct IP + user-agent)
    const uniqueKeys = new Set<string>();
    events.forEach(e => {
      uniqueKeys.add(`${e.ipAddress || 'unknown'}|${e.userAgent || 'unknown'}`);
    });

    // Group by URL
    const clicksByUrl: Record<string, number> = {};
    events.forEach(e => {
      clicksByUrl[e.url] = (clicksByUrl[e.url] || 0) + 1;
    });

    // Group by date
    const clicksByDate: Record<string, number> = {};
    events.forEach(e => {
      const dateKey = e.clickedAt.toISOString().split('T')[0];
      clicksByDate[dateKey] = (clicksByDate[dateKey] || 0) + 1;
    });

    return {
      totalClicks: events.length,
      uniqueClicks: uniqueKeys.size,
      clicksByUrl,
      clicksByDate,
      firstClickAt: events[0].clickedAt,
      lastClickAt: events[events.length - 1].clickedAt,
    };
  } catch (error) {
    console.error('[ClickTracking] Failed to get click stats:', error);
    return null;
  }
}

/**
 * Get aggregate click stats for all tracking links of a user's messages.
 */
export async function getAggregateClickStats(
  userId: string,
  options?: { startDate?: Date; endDate?: Date }
): Promise<{
  totalLinksTracked: number;
  totalClicks: number;
  uniqueClicks: number;
  averageClickRate: number;
  topClickedUrls: Array<{ url: string; clicks: number }>;
}> {
  try {
    // Get outreach messages for this user
    const messages = await db.outreachMessage.findMany({
      where: { userId },
      select: { id: true },
    });

    const messageIds = messages.map(m => m.id);

    if (messageIds.length === 0) {
      return { totalLinksTracked: 0, totalClicks: 0, uniqueClicks: 0, averageClickRate: 0, topClickedUrls: [] };
    }

    // Get tracking links for these messages
    const trackingLinks = await db.emailTrackingLink.findMany({
      where: { emailMessageId: { in: messageIds } },
      select: { trackingId: true, originalUrl: true, clickCount: true },
    });

    const totalLinksTracked = trackingLinks.length;

    if (totalLinksTracked === 0) {
      return { totalLinksTracked: 0, totalClicks: 0, uniqueClicks: 0, averageClickRate: 0, topClickedUrls: [] };
    }

    // Get click events
    const linkIds = trackingLinks.map(l => l.trackingId);

    const clickEvents = await db.emailClickEvent.findMany({
      where: {
        trackingLinkId: { in: linkIds },
        ...(options?.startDate || options?.endDate
          ? {
              clickedAt: {
                ...(options.startDate ? { gte: options.startDate } : {}),
                ...(options.endDate ? { lte: options.endDate } : {}),
              },
            }
          : {}),
      },
      select: { trackingLinkId: true, url: true, ipAddress: true, userAgent: true },
    });

    const totalClicks = clickEvents.length;

    // Unique clicks per tracking link
    const uniquePerLink = new Map<string, Set<string>>();
    clickEvents.forEach(e => {
      if (!uniquePerLink.has(e.trackingLinkId)) {
        uniquePerLink.set(e.trackingLinkId, new Set());
      }
      uniquePerLink.get(e.trackingLinkId)!.add(`${e.ipAddress || 'unknown'}|${e.userAgent || 'unknown'}`);
    });

    const uniqueClicks = Array.from(uniquePerLink.values()).filter(s => s.size > 0).length;
    const averageClickRate = totalLinksTracked > 0 ? uniqueClicks / totalLinksTracked : 0;

    // Top clicked URLs
    const urlCounts: Record<string, number> = {};
    clickEvents.forEach(e => {
      urlCounts[e.url] = (urlCounts[e.url] || 0) + 1;
    });

    const topClickedUrls = Object.entries(urlCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([url, clicks]) => ({ url, clicks }));

    return { totalLinksTracked, totalClicks, uniqueClicks, averageClickRate, topClickedUrls };
  } catch (error) {
    console.error('[ClickTracking] Failed to get aggregate stats:', error);
    return { totalLinksTracked: 0, totalClicks: 0, uniqueClicks: 0, averageClickRate: 0, topClickedUrls: [] };
  }
}
