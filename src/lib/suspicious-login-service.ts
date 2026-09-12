// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Suspicious Login Detection Service
// Phase 3 Remediation: Auth gaps and edge cases
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { logAuthEvent } from '@/lib/auth';

// ===== CONSTANTS =====

/** Maximum suspicious attempts before auto-lock in a 1-hour window */
const SUSPICIOUS_ATTEMPT_THRESHOLD = 5;

/** Time window for counting suspicious attempts (1 hour) */
const SUSPICIOUS_WINDOW_MS = 60 * 60 * 1000;

/** Speed threshold for impossible travel: km per hour */
const IMPOSSIBLE_TRAVEL_KMH = 800; // ~commercial flight speed

/** Approximate km per degree of latitude */
const KM_PER_DEGREE_LAT = 111;

/** Approximate km per degree of longitude (varies by latitude; using average) */
const KM_PER_DEGREE_LNG = 85;

// ===== TYPES =====

export interface SuspiciousLoginResult {
  isSuspicious: boolean;
  reasons: string[];
  newCountry: boolean;
  newIpRange: boolean;
  impossibleTravel: boolean;
  newDevice: boolean;
}

export interface GeoLocation {
  country?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
}

// ===== MAIN DETECTION FUNCTION =====

/**
 * Detect if a login attempt is suspicious by checking:
 * - New country compared to user's login history
 * - New IP range (/24 for IPv4) compared to history
 * - Impossible travel (2 logins from distant locations within short time)
 * - New device (based on user agent differences)
 *
 * Returns a detailed result with all flags.
 */
export async function detectSuspiciousLogin(params: {
  userId: string;
  ip: string;
  userAgent: string;
  country?: string;
  city?: string;
}): Promise<SuspiciousLoginResult> {
  const reasons: string[] = [];
  let newCountry = false;
  let newIpRange = false;
  let impossibleTravel = false;
  let newDevice = false;

  // Get recent successful logins for this user (last 30 days)
  const recentLogins = await db.loginHistory.findMany({
    where: {
      userId: params.userId,
      success: true,
      createdAt: { gt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  // If no prior logins, nothing to compare against — not suspicious
  if (recentLogins.length === 0) {
    return {
      isSuspicious: false,
      reasons: [],
      newCountry: false,
      newIpRange: false,
      impossibleTravel: false,
      newDevice: false,
    };
  }

  // ── Check 1: New country ──────────────────────────────────────
  const knownCountries = new Set(
    recentLogins.map(l => l.country).filter(Boolean)
  );
  if (params.country && knownCountries.size > 0 && !knownCountries.has(params.country)) {
    newCountry = true;
    reasons.push(`Login from new country: ${params.country}`);
  }

  // ── Check 2: New IP range ─────────────────────────────────────
  const currentIpRange = getIpRange(params.ip);
  const knownIpRanges = new Set(
    recentLogins.map(l => l.ip).filter(Boolean).map(ip => getIpRange(ip!))
  );
  if (currentIpRange && knownIpRanges.size > 0 && !knownIpRanges.has(currentIpRange)) {
    newIpRange = true;
    reasons.push(`Login from new IP range: ${currentIpRange}.x`);
  }

  // ── Check 3: Impossible travel ────────────────────────────────
  const travelCheck = await checkImpossibleTravel({
    userId: params.userId,
    currentIp: params.ip,
    currentCountry: params.country,
    currentCity: params.city,
  });
  if (travelCheck.isImpossible) {
    impossibleTravel = true;
    reasons.push(`Impossible travel detected: ${travelCheck.details}`);
  }

  // ── Check 4: New device (user agent mismatch) ─────────────────
  const knownUserAgents = new Set(
    recentLogins.map(l => l.userAgent).filter(Boolean)
  );
  const currentUaCategory = categorizeUserAgent(params.userAgent);
  const knownUaCategories = new Set(
    [...knownUserAgents].map(ua => categorizeUserAgent(ua!))
  );
  if (
    currentUaCategory !== 'unknown' &&
    knownUaCategories.size > 0 &&
    !knownUaCategories.has(currentUaCategory)
  ) {
    newDevice = true;
    reasons.push(`Login from new device type: ${currentUaCategory}`);
  }

  const isSuspicious = reasons.length > 0;

  return {
    isSuspicious,
    reasons,
    newCountry,
    newIpRange,
    impossibleTravel,
    newDevice,
  };
}

// ===== IMPOSSIBLE TRAVEL CHECK =====

/**
 * Check for impossible travel by comparing the current login location
 * with the most recent login within a short time window.
 * If two logins occurred from distant locations within a short period,
 * the travel speed would exceed what's physically possible.
 */
export async function checkImpossibleTravel(params: {
  userId: string;
  currentIp: string;
  currentCountry?: string;
  currentCity?: string;
}): Promise<{ isImpossible: boolean; details: string }> {
  // Get the most recent login (within the last 2 hours)
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
  const recentLogin = await db.loginHistory.findFirst({
    where: {
      userId: params.userId,
      success: true,
      createdAt: { gt: twoHoursAgo },
      country: { not: null },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!recentLogin || !recentLogin.country) {
    return { isImpossible: false, details: '' };
  }

  // If countries are the same, no impossible travel
  if (recentLogin.country === params.currentCountry) {
    return { isImpossible: false, details: '' };
  }

  // If we don't have the current country, we can't compare
  if (!params.currentCountry) {
    return { isImpossible: false, details: '' };
  }

  // Calculate approximate distance between the two countries
  // Using the login history country and current country
  const distanceKm = estimateDistanceBetweenLocations(
    recentLogin.country,
    recentLogin.city,
    params.currentCountry,
    params.currentCity
  );

  // Calculate time difference in hours
  const timeDiffMs = Date.now() - recentLogin.createdAt.getTime();
  const timeDiffHours = timeDiffMs / (1000 * 60 * 60);

  // If the time difference is too small (< 5 minutes), skip
  // as it might be the same login being recorded twice
  if (timeDiffHours < 5 / 60) {
    return { isImpossible: false, details: '' };
  }

  // Calculate implied travel speed
  const impliedSpeedKmh = distanceKm / timeDiffHours;

  if (impliedSpeedKmh > IMPOSSIBLE_TRAVEL_KMH) {
    return {
      isImpossible: true,
      details: `${distanceKm.toFixed(0)}km in ${(timeDiffHours * 60).toFixed(0)}min (${recentLogin.country} → ${params.currentCountry}), implied speed: ${impliedSpeedKmh.toFixed(0)}km/h`,
    };
  }

  return { isImpossible: false, details: '' };
}

// ===== FLAG SUSPICIOUS ACTIVITY =====

/**
 * Flag a suspicious activity: create a notification, log to audit,
 * and auto-lock the account if the threshold is exceeded.
 */
export async function flagSuspiciousActivity(params: {
  userId: string;
  email: string;
  name: string;
  ip: string;
  userAgent: string;
  reasons: string[];
  country?: string;
  city?: string;
}): Promise<{ locked: boolean }> {
  const reasonsText = params.reasons.join('; ');

  // ── Create notification for the user ─────────────────────────
  try {
    await db.notification.create({
      data: {
        userId: params.userId,
        type: 'security_alert',
        title: 'Suspicious Login Detected',
        message: `Suspicious login detected from IP ${params.ip}. ${reasonsText}`,
        actionUrl: '/settings?tab=security',
        metadata: JSON.stringify({
          ip: params.ip,
          userAgent: params.userAgent,
          country: params.country,
          city: params.city,
          reasons: params.reasons,
        }),
        deliveredVia: 'in_app',
      },
    });
  } catch {
    // Non-blocking — never fail the main flow
  }

  // ── Create a SecurityAlert record (if table exists) ───────────
  try {
    const prisma = db as any;
    if (prisma.securityAlert) {
      await prisma.securityAlert.create({
        data: {
          userId: params.userId,
          alertType: 'suspicious_login',
          ipAddress: params.ip,
          userAgent: params.userAgent,
          country: params.country || null,
          city: params.city || null,
          isResolved: false,
        },
      });
    }
  } catch {
    // Non-blocking
  }

  // ── Log to audit ─────────────────────────────────────────────
  await logAuthEvent({
    userId: params.userId,
    action: 'suspicious_login',
    details: `Suspicious login: ${reasonsText}`,
    ipAddress: params.ip,
    userAgent: params.userAgent,
    resource: 'auth',
  });

  // ── Check if auto-lock is needed ─────────────────────────────
  const suspiciousCount = await countRecentSuspiciousAttempts(params.userId);

  if (suspiciousCount >= SUSPICIOUS_ATTEMPT_THRESHOLD) {
    // Auto-lock the account
    try {
      const { lockAccount } = await import('./account-lock-service');
      await lockAccount({
        userId: params.userId,
        reason: `Auto-locked: ${SUSPICIOUS_ATTEMPT_THRESHOLD} suspicious login attempts in 1 hour`,
        lockedBy: 'system',
      });
      return { locked: true };
    } catch {
      // If account-lock-service isn't available, fall back to isActive=false
      try {
        await db.user.update({
          where: { id: params.userId },
          data: { isActive: false },
        });
      } catch {
        // Non-blocking
      }
      return { locked: true };
    }
  }

  return { locked: false };
}

// ===== HELPER FUNCTIONS =====

/**
 * Count the number of suspicious login attempts for a user
 * within the last hour.
 */
async function countRecentSuspiciousAttempts(userId: string): Promise<number> {
  const windowStart = new Date(Date.now() - SUSPICIOUS_WINDOW_MS);

  const count = await db.auditLog.count({
    where: {
      userId,
      action: 'suspicious_login',
      createdAt: { gt: windowStart },
    },
  });

  return count;
}

/**
 * Get the /24 IP range for an IPv4 address.
 * Returns null for IPv6 or unparseable addresses.
 */
function getIpRange(ip: string): string | null {
  // Handle IPv4
  const parts = ip.split('.');
  if (parts.length === 4) {
    // Return first 3 octets as the /24 range
    return `${parts[0]}.${parts[1]}.${parts[2]}`;
  }
  // For IPv6, return the first 4 hextets (64-bit prefix)
  if (ip.includes(':')) {
    const hextets = ip.split(':');
    if (hextets.length >= 4) {
      return hextets.slice(0, 4).join(':');
    }
  }
  return null;
}

/**
 * Categorize a user agent string into a broad device/browser category.
 * Used for detecting new device types (not exact UA matching).
 */
function categorizeUserAgent(ua: string): string {
  const lower = ua.toLowerCase();

  // Mobile detection
  if (/mobile|android.*mobile|iphone|ipod/.test(lower)) {
    if (/chrome/.test(lower)) return 'mobile_chrome';
    if (/safari/.test(lower) && !/chrome/.test(lower)) return 'mobile_safari';
    if (/firefox/.test(lower)) return 'mobile_firefox';
    return 'mobile_other';
  }

  // Tablet detection
  if (/ipad|android(?!.*mobile)|tablet/.test(lower)) {
    return 'tablet';
  }

  // Desktop detection
  if (/windows/.test(lower)) {
    if (/chrome/.test(lower)) return 'desktop_windows_chrome';
    if (/firefox/.test(lower)) return 'desktop_windows_firefox';
    if (/edg/.test(lower)) return 'desktop_windows_edge';
    return 'desktop_windows_other';
  }
  if (/macintosh|mac os/.test(lower)) {
    if (/chrome/.test(lower)) return 'desktop_mac_chrome';
    if (/safari/.test(lower) && !/chrome/.test(lower)) return 'desktop_mac_safari';
    if (/firefox/.test(lower)) return 'desktop_mac_firefox';
    return 'desktop_mac_other';
  }
  if (/linux/.test(lower)) {
    return 'desktop_linux';
  }

  // Bot / automation detection
  if (/bot|crawler|spider|headless|curl|wget|python|node-fetch|axios/.test(lower)) {
    return 'bot';
  }

  return 'unknown';
}

/**
 * Estimate distance between two locations in kilometers.
 * Uses a simple country-size-based heuristic when exact coordinates
 * are not available.
 */
function estimateDistanceBetweenLocations(
  country1: string,
  city1?: string | null,
  country2?: string,
  city2?: string | null
): number {
  // If same city, minimal distance
  if (city1 && city2 && city1.toLowerCase() === city2.toLowerCase()) {
    return 0;
  }

  // Approximate distances between common country pairs (km)
  // These are rough estimates for the impossible travel check
  const countryDistances: Record<string, Record<string, number>> = {
    'US': { 'IN': 13500, 'GB': 5700, 'DE': 7400, 'JP': 10300, 'AU': 15300, 'CA': 2000, 'BR': 7700 },
    'IN': { 'US': 13500, 'GB': 7400, 'DE': 6500, 'JP': 6700, 'AU': 10300, 'SG': 3500, 'AE': 2600 },
    'GB': { 'US': 5700, 'IN': 7400, 'DE': 900, 'FR': 350, 'AU': 16900, 'JP': 9500 },
    'DE': { 'US': 7400, 'IN': 6500, 'GB': 900, 'FR': 450, 'JP': 9100 },
    'JP': { 'US': 10300, 'IN': 6700, 'GB': 9500, 'AU': 8200, 'KR': 1100, 'CN': 2100 },
    'AU': { 'US': 15300, 'IN': 10300, 'GB': 16900, 'JP': 8200, 'NZ': 2500 },
    'SG': { 'IN': 3500, 'US': 15300, 'AU': 6300, 'MY': 350, 'JP': 5300 },
    'AE': { 'IN': 2600, 'US': 11200, 'GB': 5500, 'SA': 1200 },
  };

  const c1 = country1.toUpperCase();
  const c2 = (country2 || '').toUpperCase();

  if (countryDistances[c1]?.[c2]) {
    return countryDistances[c1][c2];
  }
  if (countryDistances[c2]?.[c1]) {
    return countryDistances[c2][c1];
  }

  // Default: assume a large distance for different countries
  // This ensures we don't miss impossible travel between unknown country pairs
  if (c1 !== c2) {
    return 5000; // 5000km default for different countries
  }

  // Same country, different cities — estimate 500km
  if (city1 && city2 && city1.toLowerCase() !== city2.toLowerCase()) {
    return 500;
  }

  return 0;
}
