// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Lead Deduplication Service
// Phase 7: Fuzzy matching, duplicate detection, lead merging
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { logAuditEvent } from '@/lib/lead-audit';

// ===== TYPES =====

export interface DuplicateCheckResult {
  isDuplicate: boolean;
  duplicateOf?: string;
  matchField?: string;
  matchScore?: number;
  existingLead?: {
    id: string;
    businessName: string;
    email?: string | null;
    website?: string | null;
  };
}

export interface MergeResult {
  success: boolean;
  mergedLeadId: string;
  deletedLeadId: string;
  fieldsMerged: string[];
  error?: string;
}

// ===== DUPLICATE CHECKING =====

/**
 * Check if a lead already exists for the given user/org.
 * Fuzzy matching on business name, website, email, phone.
 * Org-level dedup scope (all org members share the same lead pool).
 */
export async function checkDuplicate(
  userId: string,
  leadData: Partial<{
    businessName: string;
    website?: string;
    email?: string;
    phone?: string;
  }>
): Promise<DuplicateCheckResult> {
  if (!leadData.businessName) {
    return { isDuplicate: false };
  }

  // Get user's org for org-level scoping
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { orgId: true },
  });

  // Build where clause scoped to user or org
  const where: Record<string, unknown> = {
    isActive: true,
  };

  if (user?.orgId) {
    where.orgId = user.orgId;
  } else {
    where.userId = userId;
  }

  // Check exact email match (highest priority)
  if (leadData.email && leadData.email.trim()) {
    const emailMatch = await db.lead.findFirst({
      where: {
        ...where,
        email: leadData.email.trim().toLowerCase(),
      },
      select: { id: true, businessName: true, email: true, website: true },
    });

    if (emailMatch) {
      return {
        isDuplicate: true,
        duplicateOf: emailMatch.id,
        matchField: 'email',
        matchScore: 100,
        existingLead: emailMatch,
      };
    }
  }

  // Check website domain match
  if (leadData.website && leadData.website.trim()) {
    const domain = extractDomain(leadData.website);
    if (domain) {
      const allLeads = await db.lead.findMany({
        where: {
          ...where,
          website: { not: null },
        },
        select: { id: true, businessName: true, email: true, website: true },
      });

      for (const existing of allLeads) {
        if (existing.website) {
          const existingDomain = extractDomain(existing.website);
          if (existingDomain && existingDomain === domain) {
            return {
              isDuplicate: true,
              duplicateOf: existing.id,
              matchField: 'website',
              matchScore: 90,
              existingLead: existing,
            };
          }
        }
      }
    }
  }

  // Check phone match
  if (leadData.phone && leadData.phone.trim()) {
    const normalizedPhone = normalizePhone(leadData.phone);
    if (normalizedPhone) {
      const allLeads = await db.lead.findMany({
        where: {
          ...where,
          phone: { not: null },
        },
        select: { id: true, businessName: true, email: true, website: true, phone: true },
      });

      for (const existing of allLeads) {
        if (existing.phone) {
          const existingPhone = normalizePhone(existing.phone);
          if (existingPhone && existingPhone === normalizedPhone) {
            return {
              isDuplicate: true,
              duplicateOf: existing.id,
              matchField: 'phone',
              matchScore: 85,
              existingLead: existing,
            };
          }
        }
      }
    }
  }

  // Fuzzy business name match
  const allLeads = await db.lead.findMany({
    where,
    select: { id: true, businessName: true, email: true, website: true },
    take: 500,
  });

  for (const existing of allLeads) {
    const similarity = calculateStringSimilarity(
      leadData.businessName.toLowerCase().trim(),
      existing.businessName.toLowerCase().trim()
    );

    if (similarity >= 0.85) {
      return {
        isDuplicate: true,
        duplicateOf: existing.id,
        matchField: 'businessName',
        matchScore: Math.round(similarity * 100),
        existingLead: existing,
      };
    }
  }

  return { isDuplicate: false };
}

// ===== LEAD MERGING =====

/**
 * Merge source lead into target lead.
 * Non-empty fields from source fill empty fields in target.
 * Source lead is soft-deleted after merge.
 */
export async function mergeLeads(
  sourceId: string,
  targetId: string,
  userId: string
): Promise<MergeResult> {
  try {
    const [source, target] = await Promise.all([
      db.lead.findFirst({ where: { id: sourceId, isActive: true } }),
      db.lead.findFirst({ where: { id: targetId, isActive: true } }),
    ]);

    if (!source || !target) {
      return {
        success: false,
        mergedLeadId: targetId,
        deletedLeadId: sourceId,
        fieldsMerged: [],
        error: 'Source or target lead not found',
      };
    }

    // Merge: non-empty source fields fill empty target fields
    const fieldsMerged: string[] = [];
    const updateData: Record<string, unknown> = {};

    const mergeFields = [
      'ownerName', 'website', 'email', 'phone', 'whatsapp', 'linkedin',
      'instagram', 'facebook', 'googleMapsListing', 'reviews', 'city',
      'country', 'niche', 'notes', 'bestContactPerson', 'bestChannel',
      'bestTiming', 'outreachStyle', 'opportunityNotes', 'digitalWeaknesses',
    ] as const;

    for (const field of mergeFields) {
      const sourceValue = source[field];
      const targetValue = target[field];

      if (sourceValue && !targetValue) {
        updateData[field] = sourceValue;
        fieldsMerged.push(field);
      }
    }

    // Handle numeric fields — take higher value
    if ((source.rating || 0) > (target.rating || 0)) {
      updateData.rating = source.rating;
      fieldsMerged.push('rating');
    }

    // Merge tags
    try {
      const sourceTags = JSON.parse(source.tags || '[]') as string[];
      const targetTags = JSON.parse(target.tags || '[]') as string[];
      const mergedTags = [...new Set([...targetTags, ...sourceTags])];
      if (mergedTags.length > targetTags.length) {
        updateData.tags = JSON.stringify(mergedTags);
        fieldsMerged.push('tags');
      }
    } catch {
      // Tags merge failed, skip
    }

    // Take higher scores
    const scoreFields = ['replyScore', 'conversionScore', 'urgencyScore', 'revenuePotentialScore'] as const;
    for (const field of scoreFields) {
      if ((source[field] || 0) > (target[field] || 0)) {
        updateData[field] = source[field];
        fieldsMerged.push(field);
      }
    }

    // Update target with merged data
    if (fieldsMerged.length > 0) {
      await db.lead.update({
        where: { id: targetId },
        data: updateData,
      });
    }

    // Soft-delete source lead
    await db.lead.update({
      where: { id: sourceId },
      data: { isActive: false, deletedAt: new Date() },
    });

    // Reassign source lead's notes to target
    await db.leadNote.updateMany({
      where: { leadId: sourceId },
      data: { leadId: targetId },
    });

    // Reassign source lead's activities to target
    await db.leadActivity.updateMany({
      where: { leadId: sourceId },
      data: { leadId: targetId },
    });

    // Audit log
    await logAuditEvent(userId, 'leads_merged', {
      sourceId,
      targetId,
      fieldsMerged,
      sourceBusinessName: source.businessName,
      targetBusinessName: target.businessName,
    });

    return {
      success: true,
      mergedLeadId: targetId,
      deletedLeadId: sourceId,
      fieldsMerged,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown merge error';
    return {
      success: false,
      mergedLeadId: targetId,
      deletedLeadId: sourceId,
      fieldsMerged: [],
      error: message,
    };
  }
}

// ===== UTILITY FUNCTIONS =====

/**
 * Extract domain from URL.
 */
function extractDomain(url: string): string | null {
  try {
    const normalized = url.startsWith('http') ? url : `https://${url}`;
    const parsed = new URL(normalized);
    return parsed.hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Normalize phone number for comparison.
 * Removes all non-digit characters and leading country code zeros.
 */
function normalizePhone(phone: string): string | null {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 7) return null;
  // Remove leading country code indicators
  if (digits.startsWith('00')) return digits.substring(2);
  if (digits.startsWith('1') && digits.length === 11) return digits.substring(1);
  return digits;
}

/**
 * Calculate string similarity using Levenshtein distance ratio.
 * Returns value between 0 and 1 (1 = identical).
 */
function calculateStringSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;

  // Quick check: if one string contains the other
  if (a.includes(b) || b.includes(a)) {
    return Math.min(a.length, b.length) / Math.max(a.length, b.length);
  }

  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  const maxLength = Math.max(a.length, b.length);
  return 1 - matrix[b.length][a.length] / maxLength;
}
