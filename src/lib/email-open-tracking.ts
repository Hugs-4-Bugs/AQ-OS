// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Email Open Tracking Service
// Phase 9: Gmail Fixes — Open tracking with pixel, geo, dedup
//
// Generates tracking pixels, handles tracking pixel requests,
// records open events, and provides open statistics.
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';

// ===== TYPES =====

export interface TrackingPixelResult {
  pixelUrl: string;
  trackingPixelId: string;
}

export interface OpenEventResult {
  success: boolean;
  isFirstOpen: boolean;
  error?: string;
}

export interface OpenStats {
  totalOpens: number;
  uniqueOpens: number;
  openRate: number;
  opensByCountry: Record<string, number>;
  opensByCity: Record<string, number>;
  opensByDate: Record<string, number>;
  firstOpenAt: Date | null;
  lastOpenAt: Date | null;
}

// ===== CONSTANTS =====

// 1x1 transparent GIF (43 bytes)
const TRACKING_PIXEL_GIF = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
);

const TRACKING_PIXEL_HEADERS = {
  'Content-Type': 'image/gif',
  'Content-Length': TRACKING_PIXEL_GIF.length.toString(),
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  'Pragma': 'no-cache',
  'Expires': '0',
  'X-Content-Type-Options': 'nosniff',
};

// ===== GEO LOOKUP =====

/**
 * Look up country and city from an IP address.
 * Uses a simple approach — in production, use MaxMind GeoIP2 or similar.
 */
async function lookupGeoFromIp(ipAddress: string): Promise<{ country: string | null; city: string | null }> {
  // Skip local/private IPs
  if (!ipAddress || ipAddress === '127.0.0.1' || ipAddress === '::1' || ipAddress.startsWith('192.168.') || ipAddress.startsWith('10.')) {
    return { country: null, city: null };
  }

  try {
    // Use a free GeoIP API for basic lookups
    const response = await fetch(`http://ip-api.com/json/${ipAddress}?fields=country,city,status`, {
      signal: AbortSignal.timeout(3000), // 3s timeout
    });

    if (!response.ok) return { country: null, city: null };

    const data = await response.json() as { status: string; country?: string; city?: string };
    if (data.status === 'success') {
      return { country: data.country || null, city: data.city || null };
    }
  } catch {
    // Geo lookup failed — continue without geo data
  }

  return { country: null, city: null };
}

// ===== CORE FUNCTIONS =====

/**
 * Generate a tracking pixel URL and trackingPixelId for an outbound email.
 * The pixel should be embedded as an <img> tag in the email HTML.
 */
export function generateTrackingPixel(
  emailMessageId?: string,
  outreachMessageId?: string
): TrackingPixelResult {
  const trackingPixelId = `op_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || '';
  const pixelUrl = `${baseUrl}/api/email/tracking/open/${trackingPixelId}`;

  return { pixelUrl, trackingPixelId };
}

/**
 * Generate the HTML img tag for embedding in outbound emails.
 */
export function generateTrackingPixelHtml(
  emailMessageId?: string,
  outreachMessageId?: string
): { html: string; trackingPixelId: string; pixelUrl: string } {
  const { pixelUrl, trackingPixelId } = generateTrackingPixel(emailMessageId, outreachMessageId);

  const html = `<img src="${pixelUrl}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;" />`;

  return { html, trackingPixelId, pixelUrl };
}

/**
 * Handle a tracking pixel request (GET endpoint).
 * Records the open event and returns the 1x1 GIF.
 */
export async function handleTrackingPixelRequest(
  trackingPixelId: string,
  ipAddress?: string,
  userAgent?: string
): Promise<{
  gif: Buffer;
  headers: Record<string, string>;
  recorded: boolean;
}> {
  try {
    // Record the open event asynchronously (don't block the pixel response)
    const recorded = await recordOpenEvent(trackingPixelId, ipAddress, userAgent);

    return {
      gif: TRACKING_PIXEL_GIF,
      headers: TRACKING_PIXEL_HEADERS,
      recorded,
    };
  } catch (error) {
    console.error('[OpenTracking] Error handling pixel request:', error);
    // Always return the pixel, even if recording fails
    return {
      gif: TRACKING_PIXEL_GIF,
      headers: TRACKING_PIXEL_HEADERS,
      recorded: false,
    };
  }
}

/**
 * Record an open event with timestamp, IP, user-agent, and geo data.
 * Returns whether this was the first open (unique).
 */
export async function recordOpenEvent(
  trackingPixelId: string,
  ipAddress?: string,
  userAgent?: string
): Promise<boolean> {
  try {
    // Check if this tracking pixel has been opened before
    const existingOpens = await db.emailOpenEvent.findMany({
      where: { trackingPixelId },
      take: 1,
    });

    const isFirstOpen = existingOpens.length === 0;

    // Look up geo data from IP
    let country: string | null = null;
    let city: string | null = null;
    if (ipAddress) {
      const geo = await lookupGeoFromIp(ipAddress);
      country = geo.country;
      city = geo.city;
    }

    // Record the open event
    await db.emailOpenEvent.create({
      data: {
        trackingPixelId,
        ipAddress: ipAddress || null,
        userAgent: userAgent || null,
        country,
        city,
      },
    });

    // Update the associated message's openedAt if this is the first open
    if (isFirstOpen) {
      // Try to find the outreach message with this tracking pixel
      const outreachMessage = await db.outreachMessage.findFirst({
        where: { trackingPixelId },
      });

      if (outreachMessage && !outreachMessage.openedAt) {
        await db.outreachMessage.update({
          where: { id: outreachMessage.id },
          data: { openedAt: new Date(), status: 'opened' },
        });
      }

      // Also try to find a scheduled email with this tracking pixel
      const scheduledEmail = await db.scheduledEmail.findFirst({
        where: { trackingPixelId },
      });

      if (scheduledEmail) {
        await db.scheduledEmail.update({
          where: { id: scheduledEmail.id },
          data: { metadata: JSON.stringify({ ...(scheduledEmail.metadata ? JSON.parse(scheduledEmail.metadata) : {}), firstOpenedAt: new Date().toISOString() }) },
        });
      }
    }

    return isFirstOpen;
  } catch (error) {
    console.error('[OpenTracking] Failed to record open event:', error);
    return false;
  }
}

/**
 * Get open statistics for a specific tracking pixel.
 */
export async function getOpenStats(trackingPixelId: string): Promise<OpenStats | null> {
  try {
    const events = await db.emailOpenEvent.findMany({
      where: { trackingPixelId },
      orderBy: { openedAt: 'asc' },
    });

    if (events.length === 0) {
      return {
        totalOpens: 0,
        uniqueOpens: 0,
        openRate: 0,
        opensByCountry: {},
        opensByCity: {},
        opensByDate: {},
        firstOpenAt: null,
        lastOpenAt: null,
      };
    }

    // Calculate unique opens (by distinct IP + user-agent combination)
    const uniqueKeys = new Set<string>();
    events.forEach(e => {
      uniqueKeys.add(`${e.ipAddress || 'unknown'}|${e.userAgent || 'unknown'}`);
    });

    // Group by country
    const opensByCountry: Record<string, number> = {};
    events.forEach(e => {
      const c = e.country || 'Unknown';
      opensByCountry[c] = (opensByCountry[c] || 0) + 1;
    });

    // Group by city
    const opensByCity: Record<string, number> = {};
    events.forEach(e => {
      const c = e.city || 'Unknown';
      opensByCity[c] = (opensByCity[c] || 0) + 1;
    });

    // Group by date
    const opensByDate: Record<string, number> = {};
    events.forEach(e => {
      const dateKey = e.openedAt.toISOString().split('T')[0];
      opensByDate[dateKey] = (opensByDate[dateKey] || 0) + 1;
    });

    return {
      totalOpens: events.length,
      uniqueOpens: uniqueKeys.size,
      openRate: events.length > 0 ? 1 : 0, // For a single email, rate is 0 or 1
      opensByCountry,
      opensByCity,
      opensByDate,
      firstOpenAt: events[0].openedAt,
      lastOpenAt: events[events.length - 1].openedAt,
    };
  } catch (error) {
    console.error('[OpenTracking] Failed to get open stats:', error);
    return null;
  }
}

/**
 * Get the unique open count for a tracking pixel.
 */
export async function getUniqueOpenCount(trackingPixelId: string): Promise<number> {
  try {
    const events = await db.emailOpenEvent.findMany({
      where: { trackingPixelId },
      select: { ipAddress: true, userAgent: true },
    });

    const uniqueKeys = new Set<string>();
    events.forEach(e => {
      uniqueKeys.add(`${e.ipAddress || 'unknown'}|${e.userAgent || 'unknown'}`);
    });

    return uniqueKeys.size;
  } catch {
    return 0;
  }
}

/**
 * Get aggregate open stats across multiple tracking pixels for a user.
 */
export async function getAggregateOpenStats(
  userId: string,
  options?: { startDate?: Date; endDate?: Date }
): Promise<{
  totalEmailsTracked: number;
  totalOpens: number;
  uniqueOpens: number;
  averageOpenRate: number;
}> {
  try {
    const where: Record<string, unknown> = {};
    if (options?.startDate || options?.endDate) {
      where.openedAt = {};
      if (options.startDate) (where.openedAt as Record<string, unknown>).gte = options.startDate;
      if (options.endDate) (where.openedAt as Record<string, unknown>).lte = options.endDate;
    }

    // Get outreach messages for this user that have tracking pixels
    const messages = await db.outreachMessage.findMany({
      where: {
        userId,
        trackingPixelId: { not: null },
      },
      select: { trackingPixelId: true },
    });

    const totalEmailsTracked = messages.length;
    if (totalEmailsTracked === 0) {
      return { totalEmailsTracked: 0, totalOpens: 0, uniqueOpens: 0, averageOpenRate: 0 };
    }

    // Count opens across all tracking pixels
    const pixelIds = messages.map(m => m.trackingPixelId!).filter(Boolean);

    const openEvents = await db.emailOpenEvent.findMany({
      where: {
        trackingPixelId: { in: pixelIds },
        ...(options?.startDate || options?.endDate
          ? {
              openedAt: {
                ...(options.startDate ? { gte: options.startDate } : {}),
                ...(options.endDate ? { lte: options.endDate } : {}),
              },
            }
          : {}),
      },
      select: { trackingPixelId: true, ipAddress: true, userAgent: true },
    });

    const totalOpens = openEvents.length;

    // Unique opens per tracking pixel
    const uniquePerPixel = new Map<string, Set<string>>();
    openEvents.forEach(e => {
      if (!uniquePerPixel.has(e.trackingPixelId)) {
        uniquePerPixel.set(e.trackingPixelId, new Set());
      }
      uniquePerPixel.get(e.trackingPixelId)!.add(`${e.ipAddress || 'unknown'}|${e.userAgent || 'unknown'}`);
    });

    const uniqueOpens = Array.from(uniquePerPixel.values()).filter(s => s.size > 0).length;
    const averageOpenRate = totalEmailsTracked > 0 ? uniqueOpens / totalEmailsTracked : 0;

    return { totalEmailsTracked, totalOpens, uniqueOpens, averageOpenRate };
  } catch (error) {
    console.error('[OpenTracking] Failed to get aggregate stats:', error);
    return { totalEmailsTracked: 0, totalOpens: 0, uniqueOpens: 0, averageOpenRate: 0 };
  }
}
