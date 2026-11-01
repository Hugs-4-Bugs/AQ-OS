// ═══════════════════════════════════════════════════════════════════
// Web Property Service
//
// Manages WebProperty records (URLs the user claims as their own
// business web presence). Scoped to BusinessProfile + User.
//
// Ownership: every operation verifies that the BusinessProfile belongs
// to the authenticated user. Cross-tenant access returns null/false,
// never leaks existence.
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';

export interface WebPropertyInput {
  url: string;
  label?: string;
  propertyType?: string;
}

export interface WebPropertyUpdate {
  url?: string;
  label?: string;
  propertyType?: string;
  status?: string;
}

const VALID_PROPERTY_TYPES = ['website', 'portfolio', 'product', 'landing_page', 'personal', 'other'];
const VALID_STATUSES = ['active', 'archived'];
const MAX_URL_LENGTH = 2048;
const MAX_LABEL_LENGTH = 200;

/**
 * Validate and normalize a URL.
 * Returns null if the URL is invalid or dangerous (SSRF guard).
 */
export function validateWebUrl(raw: string): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_URL_LENGTH) return null;

  // Must start with http:// or https://
  if (!/^https?:\/\//i.test(trimmed)) return null;

  try {
    const parsed = new URL(trimmed);
    // SSRF guard: reject loopback, private, and internal addresses
    const hostname = parsed.hostname.toLowerCase();
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '0.0.0.0' ||
      hostname.endsWith('.local') ||
      hostname.endsWith('.internal') ||
      hostname.startsWith('10.') ||
      hostname.startsWith('192.168.') ||
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname)
    ) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

/**
 * Create a WebProperty for a BusinessProfile.
 * Verifies that the BusinessProfile belongs to the user.
 * Prevents duplicate (businessProfileId, url) via DB UNIQUE constraint.
 */
export async function createWebProperty(
  userId: string,
  businessProfileId: string,
  input: WebPropertyInput
): Promise<{ success: boolean; webProperty?: any; error?: string }> {
  // Verify BusinessProfile ownership
  const profile = await db.businessProfile.findFirst({
    where: { id: businessProfileId, userId },
    select: { id: true },
  });
  if (!profile) {
    return { success: false, error: 'Business profile not found' };
  }

  const url = validateWebUrl(input.url);
  if (!url) {
    return { success: false, error: 'Invalid URL. Must be a valid http(s) URL.' };
  }

  const propertyType = input.propertyType || 'website';
  if (!VALID_PROPERTY_TYPES.includes(propertyType)) {
    return { success: false, error: `Invalid property type. Must be one of: ${VALID_PROPERTY_TYPES.join(', ')}` };
  }

  const label = input.label?.trim().slice(0, MAX_LABEL_LENGTH) || null;

  try {
    const webProperty = await db.webProperty.create({
      data: {
        businessProfileId,
        userId,
        url,
        label,
        propertyType,
        status: 'active',
      },
    });
    return { success: true, webProperty };
  } catch (error: any) {
    if (error?.code === 'P2002') {
      return { success: false, error: 'This URL is already associated with this business profile' };
    }
    throw error;
  }
}

/**
 * List WebProperties for a BusinessProfile.
 * Verifies ownership. Returns only active by default.
 */
export async function listWebProperties(
  userId: string,
  businessProfileId: string,
  includeArchived = false
): Promise<any[]> {
  const profile = await db.businessProfile.findFirst({
    where: { id: businessProfileId, userId },
    select: { id: true },
  });
  if (!profile) return [];

  return db.webProperty.findMany({
    where: {
      businessProfileId,
      userId,
      ...(includeArchived ? {} : { status: 'active' }),
    },
    orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
    include: {
      _count: { select: { researchSnapshots: true } },
    },
  });
}

/**
 * Get a single WebProperty by ID.
 * Verifies ownership through the BusinessProfile → User chain.
 */
export async function getWebProperty(
  userId: string,
  webPropertyId: string
): Promise<any | null> {
  return db.webProperty.findFirst({
    where: { id: webPropertyId, userId },
    include: {
      researchSnapshots: {
        orderBy: { researchVersion: 'desc' },
        take: 5,
      },
    },
  });
}

/**
 * Update a WebProperty.
 * Verifies ownership.
 */
export async function updateWebProperty(
  userId: string,
  webPropertyId: string,
  update: WebPropertyUpdate
): Promise<{ success: boolean; webProperty?: any; error?: string }> {
  const existing = await db.webProperty.findFirst({
    where: { id: webPropertyId, userId },
  });
  if (!existing) {
    return { success: false, error: 'Web property not found' };
  }

  const data: any = {};
  if (update.url !== undefined) {
    const url = validateWebUrl(update.url);
    if (!url) {
      return { success: false, error: 'Invalid URL' };
    }
    data.url = url;
  }
  if (update.label !== undefined) {
    data.label = update.label?.trim().slice(0, MAX_LABEL_LENGTH) || null;
  }
  if (update.propertyType !== undefined) {
    if (!VALID_PROPERTY_TYPES.includes(update.propertyType)) {
      return { success: false, error: 'Invalid property type' };
    }
    data.propertyType = update.propertyType;
  }
  if (update.status !== undefined) {
    if (!VALID_STATUSES.includes(update.status)) {
      return { success: false, error: 'Invalid status' };
    }
    data.status = update.status;
  }

  try {
    const webProperty = await db.webProperty.update({
      where: { id: webPropertyId },
      data,
    });
    return { success: true, webProperty };
  } catch (error: any) {
    if (error?.code === 'P2002') {
      return { success: false, error: 'This URL is already associated with this business profile' };
    }
    throw error;
  }
}

/**
 * Delete a WebProperty.
 * Verifies ownership. Cascade deletes associated ResearchSnapshots.
 */
export async function deleteWebProperty(
  userId: string,
  webPropertyId: string
): Promise<{ success: boolean; error?: string }> {
  const existing = await db.webProperty.findFirst({
    where: { id: webPropertyId, userId },
    select: { id: true },
  });
  if (!existing) {
    return { success: false, error: 'Web property not found' };
  }

  await db.webProperty.delete({ where: { id: webPropertyId } });
  return { success: true };
}
