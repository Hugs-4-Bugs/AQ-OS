// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Lead Deduplication Service
// Phase 10: production-safe duplicate prevention across discovery.
//
// Match priority (spec, strict order — first tier that hits wins):
//   1. website DOMAIN        (registrable host, case-insensitive)
//   2. email                 (case-insensitive, shape-validated)
//   3. phone                 (normalized digits, prefix-insensitive)
//   4. normalized business name (legal suffixes stripped, high similarity)
//   5. business name + location (slightly looser name bar, same city/country)
//
// Existing leads are NEVER deleted or destructively overwritten by
// discovery dedup — duplicates resolve to the existing record and only
// EMPTY fields are merge-filled (see mergeFillDuplicate in the discovery
// service). `mergeLeads` below is the separate, explicit USER-initiated
// merge (soft-delete preserving all history) and is unchanged.
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { logAuditEvent } from '@/lib/lead-audit';
import {
  extractDomain,
  normalizeBusinessName,
  normalizeEmail,
  normalizeLocationToken,
  normalizePhoneForMatch,
} from '@/lib/lead-discovery/normalization';

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

/** Minimal lead projection used for in-memory identity matching. */
export interface DedupIndexEntry {
  id: string;
  businessName: string;
  email?: string | null;
  website?: string | null;
  phone?: string | null;
  city?: string | null;
  country?: string | null;
}

/** Candidate shape accepted by the matching core. */
export interface DuplicateCandidate {
  businessName: string;
  website?: string | null;
  email?: string | null;
  phone?: string | null;
  city?: string | null;
  country?: string | null;
}

// ===== MATCHING CORE (pure — single source of truth) =====

/** Name-only similarity bar for tier 4 (normalized forms). */
const NAME_SIMILARITY_THRESHOLD = 0.85;
/** Slightly looser bar for tier 5, which ALSO requires location agreement. */
const NAME_LOCATION_SIMILARITY_THRESHOLD = 0.75;

/**
 * Raw (lowercased, whitespace-collapsed) form of a name — keeps word
 * boundaries, unlike the aggressive match form.
 */
function rawNameForm(name: string | null | undefined): string {
  return (name || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Branch-marker guard: "Hospital A" vs "Hospital B", "Dental Clinic 1" vs
 * "Dental Clinic 2" share a stem but end in a DIFFERENT short marker
 * (≤2 chars). These are conventionally DISTINCT branches/locations, not
 * the same business — Levenshtein similarity (~0.89) would otherwise
 * false-positive them into one lead. Only fires when everything before
 * the final token is identical AND the final tokens actually differ.
 */
function looksLikeDistinctBranches(a: string, b: string): boolean {
  const ta = a.split(' ').filter(Boolean);
  const tb = b.split(' ').filter(Boolean);
  if (ta.length !== tb.length || ta.length < 2) return false;
  const headA = ta.slice(0, -1).join(' ');
  const headB = tb.slice(0, -1).join(' ');
  if (headA !== headB) return false;
  const lastA = ta[ta.length - 1];
  const lastB = tb[tb.length - 1];
  return lastA !== lastB && Math.min(lastA.length, lastB.length) <= 2;
}

/**
 * Find the existing lead that a candidate duplicates, using the strict
 * priority order above. Pure function over an in-memory entry list so
 * the discovery import loop can reuse one loaded index per run (no
 * per-lead database round-trips, no N+1) while ad-hoc callers pass a
 * freshly loaded set.
 */
export function findDuplicateMatch(
  entries: DedupIndexEntry[],
  candidate: DuplicateCandidate
): DuplicateCheckResult {
  if (!candidate.businessName) {
    return { isDuplicate: false };
  }

  const candidateDomain = extractDomain(candidate.website);
  const candidateEmail = normalizeEmail(candidate.email);
  const candidatePhone = normalizePhoneForMatch(candidate.phone);
  const candidateName = normalizeBusinessName(candidate.businessName);
  const candidateCity = normalizeLocationToken(candidate.city);
  const candidateCountry = normalizeLocationToken(candidate.country);

  const toResult = (
    entry: DedupIndexEntry,
    matchField: string,
    matchScore: number
  ): DuplicateCheckResult => ({
    isDuplicate: true,
    duplicateOf: entry.id,
    matchField,
    matchScore,
    existingLead: {
      id: entry.id,
      businessName: entry.businessName,
      email: entry.email,
      website: entry.website,
    },
  });

  // ── Tier 1: website domain (case-insensitive, www-insensitive) ──
  if (candidateDomain) {
    for (const entry of entries) {
      if (!entry.website) continue;
      const entryDomain = extractDomain(entry.website);
      if (entryDomain && entryDomain === candidateDomain) {
        return toResult(entry, 'domain', 95);
      }
    }
  }

  // ── Tier 2: email (case-insensitive) ──
  if (candidateEmail) {
    for (const entry of entries) {
      const entryEmail = normalizeEmail(entry.email);
      if (entryEmail && entryEmail === candidateEmail) {
        return toResult(entry, 'email', 100);
      }
    }
  }

  // ── Tier 3: phone (normalized digits) ──
  if (candidatePhone) {
    for (const entry of entries) {
      const entryPhone = normalizePhoneForMatch(entry.phone);
      if (entryPhone && entryPhone === candidatePhone) {
        return toResult(entry, 'phone', 85);
      }
    }
  }

  // ── Tiers 4 + 5: normalized business name, location-aware ──────────
  // Tier 4 (name-only, high similarity ≥ 0.85): matches UNLESS the two
  //   records' stated locations flatly CONTRADICT each other (both state
  //   a city/country and they differ) — the same generic chain name in two
  //   different cities is usually two different businesses.
  // Tier 5 (name + location, looser similarity ≥ 0.78): only fires when
  //   the locations explicitly AGREE (same city, or same country with no
  //   conflicting city) — this is what makes the tier distinct and keeps
  //   slightly-different names from merging across geographies.
  if (candidateName) {
    let tier4: { entry: DedupIndexEntry; score: number } | null = null;
    let tier5: { entry: DedupIndexEntry; score: number } | null = null;
    const candidateRaw = rawNameForm(candidate.businessName);

    for (const entry of entries) {
      // Distinct-branch guard FIRST — "Hospital A" vs "Hospital B" must
      // never merge regardless of similarity score.
      if (looksLikeDistinctBranches(candidateRaw, rawNameForm(entry.businessName))) {
        continue;
      }

      const entryName = normalizeBusinessName(entry.businessName);
      if (!entryName) continue;
      const similarity = calculateStringSimilarity(candidateName, entryName);

      const entryCity = normalizeLocationToken(entry.city);
      const entryCountry = normalizeLocationToken(entry.country);
      const sameCity = !!candidateCity && entryCity === candidateCity;
      const sameCountry = !!candidateCountry && entryCountry === candidateCountry;
      const cityContradiction = !!candidateCity && !!entryCity && entryCity !== candidateCity;
      const countryContradiction =
        !!candidateCountry && !!entryCountry && entryCountry !== candidateCountry && !sameCity;
      const locationsContradict = cityContradiction || countryContradiction;

      if (similarity >= NAME_SIMILARITY_THRESHOLD && !locationsContradict) {
        if (!tier4 || similarity > tier4.score) tier4 = { entry, score: similarity };
      } else if (
        similarity >= NAME_LOCATION_SIMILARITY_THRESHOLD &&
        (sameCity || (sameCountry && !cityContradiction))
      ) {
        if (!tier5 || similarity > tier5.score) tier5 = { entry, score: similarity };
      }
    }

    if (tier4) {
      return toResult(tier4.entry, 'normalizedBusinessName', Math.round(tier4.score * 100));
    }
    if (tier5) {
      return toResult(tier5.entry, 'businessNameLocation', Math.round(tier5.score * 100));
    }
  }

  return { isDuplicate: false };
}

// ===== INDEX LOADING (for the discovery import loop) =====

/**
 * Load the dedup index for a user (or their org) ONCE per discovery run.
 * Scope mirrors the ad-hoc checkDuplicate: org members share one pool,
 * standalone users are isolated. Includes every ACTIVE lead so repeated
 * runs, cross-niche queries and cross-country queries all resolve to the
 * same existing records.
 */
export async function buildDedupIndex(userId: string): Promise<DedupIndexEntry[]> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { orgId: true },
  });

  const where: Record<string, unknown> = { isActive: true };
  if (user?.orgId) {
    where.orgId = user.orgId;
  } else {
    where.userId = userId;
  }

  return db.lead.findMany({
    where,
    select: {
      id: true,
      businessName: true,
      email: true,
      website: true,
      phone: true,
      city: true,
      country: true,
    },
  });
}

/**
 * Append a freshly created lead to an in-memory index so later candidates
 * in the SAME run dedupe against it without another database read.
 */
export function addIndexEntry(index: DedupIndexEntry[], entry: DedupIndexEntry): void {
  index.push(entry);
}

// ===== AD-HOC DUPLICATE CHECKING (existing callers unchanged) =====

/**
 * Check if a lead already exists for the given user/org.
 * Same matching core and priority order as the discovery import loop;
 * loads the candidate set once per call (callers are low-volume paths:
 * manual creation, CSV import, legacy engine).
 */
export async function checkDuplicate(
  userId: string,
  leadData: Partial<{
    businessName: string;
    website?: string;
    email?: string;
    phone?: string;
    city?: string;
    country?: string;
  }>
): Promise<DuplicateCheckResult> {
  if (!leadData.businessName) {
    return { isDuplicate: false };
  }

  const entries = await buildDedupIndex(userId);
  return findDuplicateMatch(entries, {
    businessName: leadData.businessName,
    website: leadData.website,
    email: leadData.email,
    phone: leadData.phone,
    city: leadData.city,
    country: leadData.country,
  });
}

// ===== LEAD MERGING (user-initiated — unchanged behaviour) =====

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
