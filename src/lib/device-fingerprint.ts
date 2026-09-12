// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Device Fingerprinting Service
// Phase 3 Remediation: Auth gaps and edge cases
// ═══════════════════════════════════════════════════════════════════

import crypto from 'crypto';
import { db } from '@/lib/db';
import { logAuthEvent } from '@/lib/auth';

// ===== TYPES =====

export interface DeviceInfo {
  browser: string;
  browserVersion: string;
  os: string;
  osVersion: string;
  deviceType: string; // desktop, mobile, tablet, bot, unknown
  isMobile: boolean;
  isTablet: boolean;
  isBot: boolean;
}

export interface DeviceFingerprintResult {
  fingerprint: string;
  deviceInfo: DeviceInfo;
  isKnown: boolean;
  isNewDevice: boolean;
}

// ===== PARSE USER AGENT =====

/**
 * Parse a user-agent string into structured device info.
 * Uses regex-based parsing instead of external libraries for zero dependencies.
 */
export function parseUserAgent(userAgent: string): DeviceInfo {
  const ua = userAgent || '';
  const lower = ua.toLowerCase();

  // ── Browser detection ─────────────────────────────────────────
  let browser = 'Unknown';
  let browserVersion = '';

  // Order matters: check specific browsers before generic ones
  if (/edg\//.test(lower)) {
    browser = 'Edge';
    const match = ua.match(/Edg\/(\d+[\.\d]*)/);
    browserVersion = match?.[1] || '';
  } else if (/opr\/|opera/.test(lower)) {
    browser = 'Opera';
    const match = ua.match(/(?:OPR|Opera)\/(\d+[\.\d]*)/);
    browserVersion = match?.[1] || '';
  } else if (/vivaldi/.test(lower)) {
    browser = 'Vivaldi';
    const match = ua.match(/Vivaldi\/(\d+[\.\d]*)/);
    browserVersion = match?.[1] || '';
  } else if (/firefox/.test(lower)) {
    browser = 'Firefox';
    const match = ua.match(/Firefox\/(\d+[\.\d]*)/);
    browserVersion = match?.[1] || '';
  } else if (/chrome/.test(lower) && !/chromium/.test(lower)) {
    browser = 'Chrome';
    const match = ua.match(/Chrome\/(\d+[\.\d]*)/);
    browserVersion = match?.[1] || '';
  } else if (/chromium/.test(lower)) {
    browser = 'Chromium';
    const match = ua.match(/Chromium\/(\d+[\.\d]*)/);
    browserVersion = match?.[1] || '';
  } else if (/safari/.test(lower) && !/chrome/.test(lower)) {
    browser = 'Safari';
    const match = ua.match(/Version\/(\d+[\.\d]*)/);
    browserVersion = match?.[1] || '';
  }

  // ── OS detection ──────────────────────────────────────────────
  let os = 'Unknown';
  let osVersion = '';

  if (/windows nt/.test(lower)) {
    os = 'Windows';
    const match = ua.match(/Windows NT (\d+\.\d+)/);
    const versionMap: Record<string, string> = {
      '10.0': '10/11',
      '6.3': '8.1',
      '6.2': '8',
      '6.1': '7',
      '6.0': 'Vista',
      '5.1': 'XP',
    };
    osVersion = match ? (versionMap[match[1]] || match[1]) : '';
  } else if (/mac os x/.test(lower)) {
    os = 'macOS';
    const match = ua.match(/Mac OS X (\d+[._]\d+[._]?\d*)/);
    osVersion = match ? match[1].replace(/_/g, '.') : '';
  } else if (/android/.test(lower)) {
    os = 'Android';
    const match = ua.match(/Android (\d+[\.\d]*)/);
    osVersion = match?.[1] || '';
  } else if (/iphone|ipad|ipod/.test(lower)) {
    os = 'iOS';
    const match = ua.match(/OS (\d+[._]\d+[._]?\d*)/);
    osVersion = match ? match[1].replace(/_/g, '.') : '';
  } else if (/linux/.test(lower)) {
    os = 'Linux';
    const match = ua.match(/Linux (\d+[\.\d]*)/);
    osVersion = match?.[1] || '';
  } else if (/cros/.test(lower)) {
    os = 'ChromeOS';
    osVersion = '';
  }

  // ── Device type detection ─────────────────────────────────────
  const isMobile = /mobile|android.*mobile|iphone|ipod/.test(lower);
  const isTablet = /ipad|android(?!.*mobile)|tablet/.test(lower);
  const isBot = /bot|crawler|spider|headless|curl|wget|python|node-fetch|axios|postman/i.test(ua);

  let deviceType = 'desktop';
  if (isMobile) deviceType = 'mobile';
  else if (isTablet) deviceType = 'tablet';
  else if (isBot) deviceType = 'bot';

  return {
    browser,
    browserVersion,
    os,
    osVersion,
    deviceType,
    isMobile,
    isTablet,
    isBot,
  };
}

// ===== GENERATE DEVICE FINGERPRINT =====

/**
 * Generate a device fingerprint hash from device characteristics.
 * The fingerprint is a SHA-256 hash of the combination of:
 * - OS name and version
 * - Browser name and version
 * - Device type
 *
 * Note: Screen resolution is collected client-side and can be
 * included in the fingerprintString parameter.
 */
export function generateDeviceFingerprint(params: {
  userAgent: string;
  screenResolution?: string; // e.g., "1920x1080" — collected client-side
}): string {
  const deviceInfo = parseUserAgent(params.userAgent);

  // Build a fingerprint string from device characteristics
  const fingerprintParts = [
    deviceInfo.os,
    deviceInfo.osVersion,
    deviceInfo.browser,
    deviceInfo.browserVersion,
    deviceInfo.deviceType,
    params.screenResolution || '',
  ].join('|');

  return crypto
    .createHash('sha256')
    .update(fingerprintParts)
    .digest('hex')
    .substring(0, 32); // Use first 32 chars for brevity
}

// ===== CHECK IF DEVICE IS KNOWN =====

/**
 * Check if a device fingerprint is known for a user.
 * Returns the KnownDevice record if found, null otherwise.
 */
export async function isKnownDevice(params: {
  userId: string;
  fingerprint: string;
  userAgent: string;
}): Promise<{ known: boolean; trusted: boolean; deviceName: string | null }> {
  try {
    const prisma = db as any;
    if (!prisma.knownDevice) {
      // Table doesn't exist yet — fall back to user-agent-based check
      const recentSessions = await db.userSession.findMany({
        where: {
          userId: params.userId,
          isRevoked: false,
          userAgent: params.userAgent,
        },
        take: 1,
      });
      return {
        known: recentSessions.length > 0,
        trusted: false,
        deviceName: null,
      };
    }

    const knownDevice = await prisma.knownDevice.findFirst({
      where: {
        userId: params.userId,
        deviceFingerprint: params.fingerprint,
      },
    });

    if (knownDevice) {
      // Update lastSeenAt
      await prisma.knownDevice.update({
        where: { id: knownDevice.id },
        data: { lastSeenAt: new Date() },
      });
      return {
        known: true,
        trusted: knownDevice.isTrusted,
        deviceName: knownDevice.deviceName,
      };
    }

    return { known: false, trusted: false, deviceName: null };
  } catch {
    // Fall back gracefully
    return { known: false, trusted: false, deviceName: null };
  }
}

// ===== REGISTER A NEW DEVICE =====

/**
 * Register a device fingerprint for a user.
 * Creates a KnownDevice record and sends a notification about the new device.
 */
export async function registerDevice(params: {
  userId: string;
  fingerprint: string;
  userAgent: string;
  ipAddress: string;
  deviceName?: string;
}): Promise<void> {
  const deviceInfo = parseUserAgent(params.userAgent);
  const name = params.deviceName || buildDeviceName(deviceInfo);

  try {
    const prisma = db as any;
    if (prisma.knownDevice) {
      // Upsert the device record
      const existing = await prisma.knownDevice.findFirst({
        where: {
          userId: params.userId,
          deviceFingerprint: params.fingerprint,
        },
      });

      if (existing) {
        // Update lastSeenAt and device name
        await prisma.knownDevice.update({
          where: { id: existing.id },
          data: {
            lastSeenAt: new Date(),
            deviceName: name,
          },
        });
      } else {
        // Create new device record
        await prisma.knownDevice.create({
          data: {
            userId: params.userId,
            deviceFingerprint: params.fingerprint,
            deviceName: name,
            lastSeenAt: new Date(),
            isTrusted: false,
          },
        });

        // Notify user about new device login
        await db.notification.create({
          data: {
            userId: params.userId,
            type: 'security_alert',
            title: 'New Device Login',
            message: `Your account was accessed from a new device: ${name} (IP: ${params.ipAddress}). If this wasn't you, please secure your account.`,
            actionUrl: '/settings?tab=security',
            metadata: JSON.stringify({
              deviceFingerprint: params.fingerprint,
              deviceName: name,
              ipAddress: params.ipAddress,
              userAgent: params.userAgent,
              deviceInfo,
            }),
            deliveredVia: 'in_app',
          },
        });

        // Log new device to audit
        await logAuthEvent({
          userId: params.userId,
          action: 'suspicious_login',
          details: `New device login: ${name} from IP ${params.ipAddress}`,
          ipAddress: params.ipAddress,
          userAgent: params.userAgent,
          resource: 'auth',
        });
      }
    }
  } catch {
    // Non-blocking — never fail the main auth flow
  }

  // Also update the UserSession's deviceInfo field
  try {
    const deviceInfoJson = JSON.stringify(deviceInfo);
    await db.userSession.updateMany({
      where: {
        userId: params.userId,
        isRevoked: false,
        userAgent: params.userAgent,
      },
      data: {
        deviceInfo: deviceInfoJson,
      },
    });
  } catch {
    // Non-blocking
  }
}

// ===== GET KNOWN DEVICES FOR USER =====

/**
 * Get all known devices for a user.
 */
export async function getKnownDevices(userId: string): Promise<
  Array<{
    id: string;
    deviceFingerprint: string;
    deviceName: string;
    lastSeenAt: Date;
    isTrusted: boolean;
  }>
> {
  try {
    const prisma = db as any;
    if (prisma.knownDevice) {
      return await prisma.knownDevice.findMany({
        where: { userId },
        orderBy: { lastSeenAt: 'desc' },
      });
    }
  } catch {
    // Fall back
  }

  // Fall back to active sessions as device proxy
  const sessions = await db.userSession.findMany({
    where: {
      userId,
      isRevoked: false,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      deviceInfo: true,
      ipAddress: true,
      userAgent: true,
      createdAt: true,
    },
  });

  return sessions.map(s => ({
    id: s.id,
    deviceFingerprint: '',
    deviceName: s.deviceInfo || s.userAgent?.substring(0, 60) || 'Unknown Device',
    lastSeenAt: s.createdAt,
    isTrusted: false,
  }));
}

// ===== TRUST A DEVICE =====

/**
 * Mark a device as trusted.
 */
export async function trustDevice(userId: string, deviceFingerprint: string): Promise<boolean> {
  try {
    const prisma = db as any;
    if (prisma.knownDevice) {
      await prisma.knownDevice.updateMany({
        where: {
          userId,
          deviceFingerprint,
        },
        data: { isTrusted: true },
      });
      return true;
    }
  } catch {
    // Non-blocking
  }
  return false;
}

// ===== HELPER: Build human-readable device name =====

function buildDeviceName(info: DeviceInfo): string {
  const parts: string[] = [];

  if (info.browser !== 'Unknown') {
    parts.push(info.browser);
    if (info.browserVersion) parts.push(info.browserVersion);
  }

  if (info.os !== 'Unknown') {
    parts.push(`on ${info.os}`);
    if (info.osVersion) parts.push(info.osVersion);
  }

  if (info.deviceType !== 'desktop') {
    parts.push(`(${info.deviceType})`);
  }

  return parts.length > 0 ? parts.join(' ') : 'Unknown Device';
}
