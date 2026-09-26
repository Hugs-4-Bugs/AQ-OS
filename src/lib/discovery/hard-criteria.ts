// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Discovery Hard Criteria (deterministic, AI-independent)
//
// Explicit, objectively-verifiable constraints from a user's natural
// language discovery request (employee ranges, website presence,
// excluded company types) are HARD constraints — never soft preferences.
// This module:
//   1. extractHardCriteria()   — deterministically extracts them from text
//   2. matchHardCriteria()     — validates ONE candidate lead against them
//   3. mergeHardCriteria()     — intersects criteria from two sources
//   4. describeHardCriteria()  — human-readable summary for UI/messages
//
// NOTHING in this module calls an LLM. The validator runs AFTER provider
// results arrive and CANNOT be overridden by AI ranking/relevance scores.
// A company whose employee count is UNKNOWN is NOT a verified match when
// the user explicitly requested an employee range — it is rejected
// (honestly) rather than silently passed through.
// ═══════════════════════════════════════════════════════════════════

// ===== TYPES =====

/** Company types that can be excluded by a hard constraint. */
export type HardExcludeType =
  | 'agency'
  | 'freelancer'
  | 'consultant'
  | 'contractor'
  | 'reseller'
  | 'distributor';

export interface HardCriteria {
  /** Inclusive lower bound for employee count, when a range was requested. */
  employeeMin?: number;
  /** Inclusive upper bound for employee count, when a range was requested. */
  employeeMax?: number;
  /** Exact employee count ("exactly 50 employees"). */
  exactEmployeeCount?: number;
  /**
   * Website presence constraint:
   *   required — the company MUST have a website
   *   absent   — the company must LACK a website (e.g. "find restaurants with no website")
   *   any      — no website constraint
   */
  website: 'required' | 'absent' | 'any';
  /** Company types to exclude. */
  excludeTypes: HardExcludeType[];
  /**
   * SOFT preferences (recorded, used for ranking guidance only — they are
   * not deterministically verifiable, so they can never hard-reject):
   */
  growthSignals: boolean;
  hiringSignals: boolean;
}

export interface HardCriteriaVerdict {
  match: boolean;
  /** Machine-readable rejection reason (only when match === false). */
  reason?: HardRejectReason;
  /** Human-readable rejection detail (only when match === false). */
  detail?: string;
}

export type HardRejectReason =
  | 'employee_count_unverified'
  | 'employee_count_out_of_range'
  | 'employee_count_mismatch'
  | 'website_required_missing'
  | 'website_absent_present'
  | 'excluded_company_type';

/** Shape of a candidate lead the validator needs (works for both
 *  DiscoveredLead and stored Lead records). */
export interface HardCriteriaCandidate {
  businessName: string;
  website?: string | null;
  niche?: string | null;
  employeeCount?: number | null;
  employeeRange?: string | null;
}

export const EMPTY_CRITERIA: HardCriteria = {
  website: 'any',
  excludeTypes: [],
  growthSignals: false,
  hiringSignals: false,
};

// ===== EMPLOYEE-COUNT TEXT PARSING =====

/** Number token: "20", "1,000", "10k", "10K", "2.5k" */
const NUM = '(\\d+(?:,\\d{3})+|\\d+(?:\\.\\d+)?k|\\d+)';

const EMPLOYEE_WORDS = '(?:\\s*(?:full[- ]time\\s+)?(?:employees?|staff(?:\\s+members?)?|people|persons?|heads?|headcount|seats)\\b)';

function parseNum(raw: string): number {
  const cleaned = raw.toLowerCase().replace(/,/g, '');
  if (cleaned.endsWith('k')) {
    const v = parseFloat(cleaned.slice(0, -1));
    return Number.isFinite(v) ? Math.round(v * 1000) : NaN;
  }
  const v = parseFloat(cleaned);
  return Number.isFinite(v) ? Math.round(v) : NaN;
}

/**
 * Deterministic employee-count extraction.
 * Understands: "20 to 200 employees", "between 50 and 100 employees",
 * "20-200 employees", "fewer than 100", "less than 100", "under 100",
 * "more than 500", "over 500", "at least 20", "minimum of 20",
 * "up to 200", "no more than 200", "exactly 50", "500+ employees",
 * "companies with 50 employees" (bare count = exact).
 * The request COUNT ("Find 20 ... companies") is never misread — every
 * pattern must be anchored to employee/staff/people/headcount wording.
 */
export function extractEmployeeCriteria(text: string): {
  employeeMin?: number;
  employeeMax?: number;
  exactEmployeeCount?: number;
} {
  if (!text) return {};
  // Normalize unicode dashes to hyphen so "20–200" and "20—200" work
  const t = text.replace(/[\u2010-\u2015\u2212]/g, '-');

  let employeeMin: number | undefined;
  let employeeMax: number | undefined;
  let exactEmployeeCount: number | undefined;

  // 1. Explicit ranges: "between 20 and 200", "20 to 200", "20-200"
  const between = new RegExp(`between\\s+${NUM}\\s+and\\s+${NUM}${EMPLOYEE_WORDS}`, 'i').exec(t);
  const toRange = new RegExp(`${NUM}\\s*(?:-|to|through|thru)\\s*${NUM}${EMPLOYEE_WORDS}`, 'i').exec(t);
  if (between) {
    const a = parseNum(between[1]);
    const b = parseNum(between[2]);
    if (Number.isFinite(a) && Number.isFinite(b)) {
      employeeMin = Math.min(a, b);
      employeeMax = Math.max(a, b);
    }
  } else if (toRange) {
    const a = parseNum(toRange[1]);
    const b = parseNum(toRange[2]);
    if (Number.isFinite(a) && Number.isFinite(b)) {
      employeeMin = Math.min(a, b);
      employeeMax = Math.max(a, b);
    }
  }

  // 2. Exact: "exactly 50 employees", "precisely 50 employees"
  if (exactEmployeeCount === undefined && employeeMin === undefined) {
    const exact = new RegExp(`(?:exactly|precisely)\\s+${NUM}${EMPLOYEE_WORDS}`, 'i').exec(t);
    if (exact) {
      const v = parseNum(exact[1]);
      if (Number.isFinite(v)) exactEmployeeCount = v;
    }
  }

  // 3. Upper bounds: "fewer than 100" → max 99; "up to 200" → max 200
  if (employeeMin === undefined && exactEmployeeCount === undefined) {
    const strictMax = new RegExp(`(?:fewer than|less than|under|below)\\s+${NUM}${EMPLOYEE_WORDS}`, 'i').exec(t);
    if (strictMax) {
      const v = parseNum(strictMax[1]);
      if (Number.isFinite(v) && v > 0) employeeMax = v - 1;
    } else {
      const looseMax = new RegExp(`(?:up to|no more than|at most|maximum of|max(?:imum)?)\\s+${NUM}${EMPLOYEE_WORDS}`, 'i').exec(t);
      if (looseMax) {
        const v = parseNum(looseMax[1]);
        if (Number.isFinite(v)) employeeMax = v;
      }
    }
  }

  // 4. Lower bounds: "more than 500" → min 501; "at least 20" → min 20; "500+ employees" → min 500
  if (employeeMax === undefined && exactEmployeeCount === undefined) {
    const strictMin = new RegExp(`(?:more than|over|above|greater than)\\s+${NUM}${EMPLOYEE_WORDS}`, 'i').exec(t);
    const looseMin = strictMin
      ? null
      : new RegExp(`(?:at least|minimum of|no fewer than)\\s+${NUM}${EMPLOYEE_WORDS}`, 'i').exec(t);
    const plusMin = strictMin || looseMin
      ? null
      : new RegExp(`${NUM}\\s*\\+${EMPLOYEE_WORDS}`, 'i').exec(t);
    if (strictMin) {
      const v = parseNum(strictMin[1]);
      if (Number.isFinite(v)) employeeMin = v + 1;
    } else if (looseMin) {
      const v = parseNum(looseMin[1]);
      if (Number.isFinite(v)) employeeMin = v;
    } else if (plusMin) {
      const v = parseNum(plusMin[1]);
      if (Number.isFinite(v)) employeeMin = v;
    }
  }

  // 5. Bare count: "companies with 50 employees" / "around 50 employees" → exact.
  //    Only used when no other pattern matched, so it can never hijack
  //    the request COUNT ("Find 20 restaurants..." — 20 is not followed
  //    by an employee word).
  if (
    employeeMin === undefined &&
    employeeMax === undefined &&
    exactEmployeeCount === undefined
  ) {
    const bare = new RegExp(`\\b(?:with|of|around|about|approximately|roughly|sized)\\s+${NUM}${EMPLOYEE_WORDS}`, 'i').exec(t);
    if (bare) {
      const v = parseNum(bare[1]);
      if (Number.isFinite(v)) exactEmployeeCount = v;
    }
  }

  const out: { employeeMin?: number; employeeMax?: number; exactEmployeeCount?: number } = {};
  if (employeeMin !== undefined) out.employeeMin = employeeMin;
  if (employeeMax !== undefined) out.employeeMax = employeeMax;
  if (exactEmployeeCount !== undefined) out.exactEmployeeCount = exactEmployeeCount;
  return out;
}

// ===== EXCLUSION EXTRACTION =====

const EXCLUDE_TYPE_STEMS: Array<{ type: HardExcludeType; stem: string; label: string }> = [
  { type: 'agency', stem: 'agenc', label: 'agencies' },
  { type: 'freelancer', stem: 'freelanc', label: 'freelancers' },
  { type: 'consultant', stem: 'consult', label: 'consultants' },
  { type: 'contractor', stem: 'contractor', label: 'contractors' },
  { type: 'reseller', stem: 'resell', label: 'resellers' },
  { type: 'distributor', stem: 'distribut', label: 'distributors' },
];

const EXCLUSION_TRIGGER = /\b(?:exclude[sd]?|excluding|exclusion|not|no|never|without|avoid|skip|other than|bar|prohibit)\b/i;

function isInExclusionClause(text: string, index: number, window = 60): boolean {
  const start = Math.max(0, index - window);
  return EXCLUSION_TRIGGER.test(text.slice(start, index));
}

export function extractExclusions(text: string): HardExcludeType[] {
  if (!text) return [];
  const out: HardExcludeType[] = [];
  for (const { type, stem } of EXCLUDE_TYPE_STEMS) {
    const re = new RegExp(`\\b${stem}`, 'gi');
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      if (isInExclusionClause(text, m.index)) {
        out.push(type);
        break;
      }
    }
  }
  return out;
}

// ===== WEBSITE REQUIREMENT EXTRACTION =====

const PRESENCE_WEBSITE = /\b(?:with|have|has|having|own(?:s|ing)?)\s+(?:a\s+|an\s+|any\s+|their\s+)?(?:professional\s+|modern\s+|working\s+|functional\s+|proper\s+|real\s+|active\s+|official\s+|good\s+|decent\s+)?websites?\b/gi;
const ABSENCE_WEBSITE = /\b(?:without\s+(?:a\s+|any\s+)?|(?:no|zero)\s+)websites?\b/gi;

/**
 * "Find restaurants with no website"        → 'absent'
 * "must have a professional website"        → 'required'
 * "Exclude companies without a website"     → 'required' (companies lacking
 *                                              websites are the excluded group)
 */
export function extractWebsiteRequirement(text: string): 'required' | 'absent' | 'any' {
  if (!text) return 'any';
  let decision: 'required' | 'absent' | 'any' = 'any';

  const collect = (re: RegExp, polarity: 'presence' | 'absence') => {
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const excluded = isInExclusionClause(text, m.index, 70);
      if (polarity === 'presence') {
        decision = excluded ? 'absent' : 'required';
      } else {
        decision = excluded ? 'required' : 'absent';
      }
    }
  };

  collect(PRESENCE_WEBSITE, 'presence');
  collect(ABSENCE_WEBSITE, 'absence');

  return decision;
}

// ===== GROWTH / HIRING (soft) SIGNALS =====

const GROWTH_RE = /\b(?:actively\s+growing|growing|growth|expanding|expansion|scaling|momentum|recent growth)\b/i;
const HIRING_RE = /\b(?:hiring|recruiting|recruitment|job openings?|open roles?|vacanc|adding (?:staff|heads|team members))\b/i;

// ===== TOP-LEVEL EXTRACTION =====

export function extractHardCriteria(text: string): HardCriteria {
  const employees = extractEmployeeCriteria(text);
  return {
    ...employees,
    website: extractWebsiteRequirement(text),
    excludeTypes: extractExclusions(text),
    growthSignals: GROWTH_RE.test(text),
    hiringSignals: HIRING_RE.test(text),
  };
}

// ===== VALIDATION (the hard gate) =====

/**
 * Parse a provider/LLM employee RANGE string honestly:
 *   "51-100" → { min: 51, max: 100 }
 *   "10,000+" / "10000+" → { min: 10000, max: null }
 *   "1-10" → { min: 1, max: 10 }
 */
function parseEmployeeRange(raw: string | null | undefined): { min: number; max: number | null } | null {
  if (!raw) return null;
  const t = String(raw).replace(/[\u2010-\u2015\u2212]/g, '-').trim();
  const plus = /^(\d[\d,]*)\s*\+/.exec(t);
  if (plus) {
    const v = parseNum(plus[1]);
    return Number.isFinite(v) ? { min: v, max: null } : null;
  }
  const range = /^(\d[\d,]*)\s*-\s*(\d[\d,]*)$/.exec(t);
  if (range) {
    const a = parseNum(range[1]);
    const b = parseNum(range[2]);
    if (Number.isFinite(a) && Number.isFinite(b)) return { min: Math.min(a, b), max: Math.max(a, b) };
  }
  const single = /^(\d[\d,]*)$/.exec(t.replace(/,/g, ''));
  if (single) {
    const v = parseNum(single[1]);
    if (Number.isFinite(v)) return { min: v, max: v };
  }
  return null;
}

function hasEnforceableEmployeeConstraint(c: HardCriteria): boolean {
  return c.exactEmployeeCount !== undefined || c.employeeMin !== undefined || c.employeeMax !== undefined;
}

/** True when an explicit employee-count constraint (range or exact) exists. */
export function hasEmployeeConstraint(c: HardCriteria): boolean {
  return hasEnforceableEmployeeConstraint(c);
}

/**
 * Validate ONE candidate against the hard criteria.
 * Rules:
 *  - Employee constraint present + employeeCount UNKNOWN + employeeRange
 *    UNKNOWN → REJECT (employee_count_unverified). We never present an
 *    unverified company as a match for an explicit employee range.
 *  - Employee constraint present + a RANGE is known (e.g. "51-100"):
 *      * range entirely outside the requested bounds → REJECT
 *      * range fully inside the requested bounds → PASS (honest range match)
 *      * range partially overlapping → REJECT (cannot verify compliance)
 *  - Employee constraint present + exact count known → numeric comparison.
 *  - Website constraint enforced from lead.website presence.
 *  - Excluded types matched by word stem against business name + niche.
 */
export function matchHardCriteria(candidate: HardCriteriaCandidate, criteria: HardCriteria): HardCriteriaVerdict {
  if (!hasEnforceableCriteria(criteria)) return { match: true };

  // ── Employee count ────────────────────────────────────────────────
  if (hasEnforceableEmployeeConstraint(criteria)) {
    const exact = candidate.employeeCount;
    const range =
      exact === null || exact === undefined || !Number.isFinite(exact)
        ? parseEmployeeRange(candidate.employeeRange)
        : null;

    if (exact !== null && exact !== undefined && Number.isFinite(exact)) {
      if (criteria.exactEmployeeCount !== undefined && exact !== criteria.exactEmployeeCount) {
        return {
          match: false,
          reason: 'employee_count_mismatch',
          detail: `employee count ${exact} ≠ requested ${criteria.exactEmployeeCount}`,
        };
      }
      if (criteria.employeeMin !== undefined && exact < criteria.employeeMin) {
        return {
          match: false,
          reason: 'employee_count_out_of_range',
          detail: `${exact} employees < minimum ${criteria.employeeMin}`,
        };
      }
      if (criteria.employeeMax !== undefined && exact > criteria.employeeMax) {
        return {
          match: false,
          reason: 'employee_count_out_of_range',
          detail: `${exact} employees > maximum ${criteria.employeeMax}`,
        };
      }
    } else if (range) {
      const lo = range.min;
      const hi = range.max;
      const reqMin = criteria.exactEmployeeCount ?? criteria.employeeMin ?? 0;
      const reqMax = criteria.exactEmployeeCount ?? criteria.employeeMax ?? Number.POSITIVE_INFINITY;
      // Entirely outside → definite reject
      if (hi !== null && hi < reqMin) {
        return {
          match: false,
          reason: 'employee_count_out_of_range',
          detail: `employee range ${candidate.employeeRange} is below requested minimum ${reqMin}`,
        };
      }
      if (lo > reqMax) {
        return {
          match: false,
          reason: 'employee_count_out_of_range',
          detail: `employee range ${candidate.employeeRange} starts above requested maximum ${reqMax}`,
        };
      }
      // Fully inside → honest pass
      const fullyInside =
        lo >= reqMin && hi !== null && hi <= reqMax;
      if (!fullyInside) {
        return {
          match: false,
          reason: 'employee_count_unverified',
          detail: `employee range ${candidate.employeeRange} cannot be verified against the requested bounds`,
        };
      }
    } else {
      return {
        match: false,
        reason: 'employee_count_unverified',
        detail: 'employee count unknown — cannot verify against the requested range',
      };
    }
  }

  // ── Website presence ──────────────────────────────────────────────
  if (criteria.website === 'required') {
    const hasSite = Boolean(candidate.website && String(candidate.website).trim());
    if (!hasSite) {
      return { match: false, reason: 'website_required_missing', detail: 'no website found' };
    }
  } else if (criteria.website === 'absent') {
    if (candidate.website && String(candidate.website).trim()) {
      return { match: false, reason: 'website_absent_present', detail: 'has a website but none was requested' };
    }
  }

  // ── Excluded company types ────────────────────────────────────────
  if (criteria.excludeTypes.length > 0) {
    const haystack = `${candidate.businessName || ''} ${candidate.niche || ''}`.toLowerCase();
    for (const type of criteria.excludeTypes) {
      const stem = EXCLUDE_TYPE_STEMS.find((s) => s.type === type);
      if (stem && new RegExp(`\\b${stem.stem}`, 'i').test(haystack)) {
        return {
          match: false,
          reason: 'excluded_company_type',
          detail: `matches excluded type "${type}"`,
        };
      }
    }
  }

  return { match: true };
}

// ===== MERGING / HELPERS =====

/** True when at least one deterministically enforceable constraint exists. */
export function hasEnforceableCriteria(c: HardCriteria | null | undefined): boolean {
  if (!c) return false;
  return (
    c.exactEmployeeCount !== undefined ||
    c.employeeMin !== undefined ||
    c.employeeMax !== undefined ||
    c.website === 'required' ||
    c.website === 'absent' ||
    (Array.isArray(c.excludeTypes) && c.excludeTypes.length > 0)
  );
}

const KNOWN_EXCLUDE_TYPES = new Set(EXCLUDE_TYPE_STEMS.map((s) => s.type));

function sanitizeExcludeTypes(list: unknown): HardExcludeType[] {
  if (!Array.isArray(list)) return [];
  return Array.from(
    new Set(
      list
        .map((v) => String(v).trim().toLowerCase())
        .filter((v): v is HardExcludeType => KNOWN_EXCLUDE_TYPES.has(v as HardExcludeType))
    )
  );
}

function sanitizePositiveInt(v: unknown, max = 5_000_000): number | undefined {
  const n = typeof v === 'string' ? parseInt(v, 10) : typeof v === 'number' ? v : NaN;
  // 0 is never a meaningful employee constraint (a company with "exactly
  // 0 employees" or "0 minimum" would reject every candidate) — treat
  // zero as "no constraint", same as null/undefined/garbage.
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.min(Math.round(n), max);
}

/** Sanitize untrusted (client/body/AI) criteria into a safe HardCriteria. */
export function normalizeCriteriaInput(raw: unknown): HardCriteria {
  const r = (raw ?? {}) as Record<string, unknown>;
  const websiteRaw = String(r.website ?? 'any').toLowerCase();
  const website: HardCriteria['website'] =
    websiteRaw === 'required' || websiteRaw === 'absent' ? (websiteRaw as HardCriteria['website']) : 'any';
  return {
    employeeMin: sanitizePositiveInt(r.employeeMin),
    employeeMax: sanitizePositiveInt(r.employeeMax),
    exactEmployeeCount: sanitizePositiveInt(r.exactEmployeeCount),
    website,
    excludeTypes: sanitizeExcludeTypes(r.excludeTypes),
    growthSignals: r.growthSignals === true,
    hiringSignals: r.hiringSignals === true,
  };
}

/**
 * Intersect two criteria sources (e.g. client-sent criteria + server-side
 * re-extraction from the requirements text). Numbers intersect strictly:
 * min takes the max, max takes the min. Exclusions are unioned.
 */
export function mergeHardCriteria(primary: HardCriteria, secondary: HardCriteria): HardCriteria {
  const employeeMin =
    primary.employeeMin !== undefined && secondary.employeeMin !== undefined
      ? Math.max(primary.employeeMin, secondary.employeeMin)
      : (primary.employeeMin ?? secondary.employeeMin);
  const employeeMax =
    primary.employeeMax !== undefined && secondary.employeeMax !== undefined
      ? Math.min(primary.employeeMax, secondary.employeeMax)
      : (primary.employeeMax ?? secondary.employeeMax);
  const exactEmployeeCount = primary.exactEmployeeCount ?? secondary.exactEmployeeCount;
  const website =
    primary.website !== 'any' ? primary.website : secondary.website;
  return {
    employeeMin,
    employeeMax,
    exactEmployeeCount,
    website,
    excludeTypes: Array.from(new Set([...primary.excludeTypes, ...secondary.excludeTypes])),
    growthSignals: primary.growthSignals || secondary.growthSignals,
    hiringSignals: primary.hiringSignals || secondary.hiringSignals,
  };
}

/** Human-readable summary for UI badges and honest result messages. */
export function describeHardCriteria(c: HardCriteria): string {
  const parts: string[] = [];
  if (c.exactEmployeeCount !== undefined) {
    parts.push(`exactly ${c.exactEmployeeCount} employees`);
  } else if (c.employeeMin !== undefined && c.employeeMax !== undefined) {
    parts.push(`${c.employeeMin}–${c.employeeMax} employees`);
  } else if (c.employeeMin !== undefined) {
    parts.push(`≥ ${c.employeeMin} employees`);
  } else if (c.employeeMax !== undefined) {
    parts.push(`≤ ${c.employeeMax} employees`);
  }
  if (c.website === 'required') parts.push('website required');
  if (c.website === 'absent') parts.push('must have NO website');
  if (c.excludeTypes.length > 0) {
    const labels = c.excludeTypes.map((t) => EXCLUDE_TYPE_STEMS.find((s) => s.type === t)?.label ?? t);
    parts.push(`excludes: ${labels.join(', ')}`);
  }
  return parts.join(' · ');
}

/** Labels for rejection reasons (used in honest job summaries). */
export function describeRejectReason(reason: HardRejectReason): string {
  switch (reason) {
    case 'employee_count_unverified':
      return 'employee count could not be verified';
    case 'employee_count_out_of_range':
      return 'employee count outside the requested range';
    case 'employee_count_mismatch':
      return 'employee count did not match the requested count';
    case 'website_required_missing':
      return 'no website';
    case 'website_absent_present':
      return 'has a website but none was requested';
    case 'excluded_company_type':
      return 'matches an excluded company type';
    default:
      return String(reason);
  }
}
