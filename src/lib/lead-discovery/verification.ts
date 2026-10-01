// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Evidence-Based Verification & Website Classification
//
// Spec §6.2 (website quality labels) and §7.2 (verification labels).
//
// HONESTY RULES (spec §7.2 — never a blanket "verified"):
//   - A website URL found in a business listing is DISCOVERED, not verified.
//   - A website that answered successfully was REACHABLE at check time —
//     that is not proof of ownership or of quality.
//   - A phone/email appearing in one listing is DISCOVERED, not confirmed.
//   - A business present in two independent sources has CORROBORATED
//     identity ("partially_verified") — still not field-level proof.
//   - "verified" is only ever set by an explicit verification workflow
//     (website-service probing with corroboration scoring), never inferred.
// ═══════════════════════════════════════════════════════════════════

// ===== VERIFICATION LABELS (spec §7.2) =====

export type VerificationStatus =
  | 'verified'
  | 'partially_verified'
  | 'unverified'
  | 'verification_failed'
  | 'conflicting';

export const VERIFICATION_STATUSES: VerificationStatus[] = [
  'verified',
  'partially_verified',
  'unverified',
  'verification_failed',
  'conflicting',
];

export const VERIFICATION_LABELS: Record<VerificationStatus, string> = {
  verified: 'Verified',
  partially_verified: 'Partially Verified',
  unverified: 'Unverified',
  verification_failed: 'Verification Failed',
  conflicting: 'Conflicting Information',
};

/**
 * Derive the import-time verification status from honest evidence:
 *   - corroboration: the same business identity was returned by 2+
 *     independent sources during this discovery run → partially_verified
 *   - everything else → unverified (discovered, not yet assessed)
 * Field-level details stay attached to their own columns; this label is
 * the honest default and never silently upgraded.
 */
export function deriveImportVerificationStatus(corroborated: boolean): VerificationStatus {
  return corroborated ? 'partially_verified' : 'unverified';
}

// ===== WEBSITE STATUS CATEGORIES (spec §6.2) =====

export type WebsiteStatusCategory =
  | 'no_website_found'
  | 'website_unreachable'
  | 'website_health_issue'
  | 'potential_improvement_opportunity'
  | 'website_appears_functional'
  | 'not_yet_verified';

export interface WebsiteClassification {
  category: WebsiteStatusCategory;
  label: string;
  /** Observable evidence the classification is based on. */
  evidence: string[];
}

export const WEBSITE_CATEGORY_LABELS: Record<WebsiteStatusCategory, string> = {
  no_website_found: 'No Website Found',
  website_unreachable: 'Website Unreachable',
  website_health_issue: 'Website Health Issue',
  potential_improvement_opportunity: 'Potential Improvement Opportunity',
  website_appears_functional: 'Website Appears Functional',
  not_yet_verified: 'Not Yet Verified',
};

export interface WebsiteClassifiableLead {
  website?: string | null;
  hasWebsite?: boolean | null;
  /** website-service lifecycle status: VERIFIED | NOT_FOUND_AFTER_RESEARCH | UNKNOWN | INVALID */
  websiteStatus?: string | null;
  /** Legacy quality bucket from analysis: none | low | medium | high */
  websiteQuality?: string | null;
  /** Real measured quality score when available (website-scorer, 0-100). */
  websiteScore?: number | null;
  /** Scored weakness list (digitalWeaknesses JSON) — optional. */
  weaknessCount?: number | null;
}

/**
 * Classify a lead's website presence from OBSERVED evidence only.
 * A missing response or failed automated check is never treated as proof
 * that a website is "bad" or "outdated" (spec §6.2) — unprobed websites
 * stay "Not Yet Verified", and subjective judgments are labelled as
 * estimates through the evidence strings.
 */
export function classifyWebsite(lead: WebsiteClassifiableLead): WebsiteClassification {
  const evidence: string[] = [];
  const url = (lead.website || '').trim();
  const status = (lead.websiteStatus || '').toUpperCase();
  const quality = (lead.websiteQuality || 'none').toLowerCase();
  const score = typeof lead.websiteScore === 'number' ? lead.websiteScore : null;

  // 1. No website known at all
  if (!url && !lead.hasWebsite) {
    if (status === 'NOT_FOUND_AFTER_RESEARCH') {
      evidence.push('Research ran and found no website for this business');
      return { category: 'no_website_found', label: WEBSITE_CATEGORY_LABELS.no_website_found, evidence };
    }
    evidence.push('No website URL was discovered by any source');
    return { category: 'no_website_found', label: WEBSITE_CATEGORY_LABELS.no_website_found, evidence };
  }

  // 2. A URL exists but probing proved it unreachable/invalid
  if (status === 'INVALID' || status === 'NOT_FOUND_AFTER_RESEARCH') {
    evidence.push(`Website verification result: ${status.toLowerCase().replace(/_/g, ' ')}`);
    return { category: 'website_unreachable', label: WEBSITE_CATEGORY_LABELS.website_unreachable, evidence };
  }

  // 3. Website verified reachable — classify by measured evidence
  if (status === 'VERIFIED') {
    evidence.push('Website responded successfully to health checks');
    if (typeof score === 'number') {
      evidence.push(`Measured quality score: ${score}/100 (estimate from automated checks)`);
      if (score >= 70) {
        return { category: 'website_appears_functional', label: WEBSITE_CATEGORY_LABELS.website_appears_functional, evidence };
      }
      if (score >= 45) {
        return { category: 'potential_improvement_opportunity', label: WEBSITE_CATEGORY_LABELS.potential_improvement_opportunity, evidence };
      }
      return { category: 'website_health_issue', label: WEBSITE_CATEGORY_LABELS.website_health_issue, evidence };
    }
    // No measured score — fall back to the coarse quality bucket, labelled as estimate
    evidence.push('Quality bucket from analysis (estimate): ' + quality);
    if (quality === 'high') {
      return { category: 'website_appears_functional', label: WEBSITE_CATEGORY_LABELS.website_appears_functional, evidence };
    }
    if (quality === 'low' || quality === 'medium') {
      return { category: 'potential_improvement_opportunity', label: WEBSITE_CATEGORY_LABELS.potential_improvement_opportunity, evidence };
    }
    evidence.push('No detailed quality measurement available');
    return { category: 'not_yet_verified', label: WEBSITE_CATEGORY_LABELS.not_yet_verified, evidence };
  }

  // 4. Website URL present but never successfully probed
  evidence.push('Website URL discovered but reachability not yet confirmed');
  return { category: 'not_yet_verified', label: WEBSITE_CATEGORY_LABELS.not_yet_verified, evidence };
}
