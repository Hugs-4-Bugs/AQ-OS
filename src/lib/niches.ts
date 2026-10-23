// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Canonical Niche Service (Phase 20)
//
// ONE server-side authority for the Autopilot niche vocabulary:
//   • predefined niches  — the app's canonical NICHE_OPTIONS list
//     (same source the Discover/Create-Lead/Onboarding UIs use — never
//     a second hard-coded list)
//   • custom niches      — user-owned saved niches (CustomNiche rows),
//     identified by normalized key (userId, nicheKey) with DB-level
//     duplicate prevention
//   • niche selection resolution — what the Autopilot configuration
//     accepts: a predefined niche (any casing), one of the caller's OWN
//     saved custom niches (by name or by `custom:<id>` reference), and
//     nothing else. Foreign users' niches are indistinguishable from
//     missing ones (no cross-user existence leak).
//
// Users can never submit another user's niche: every lookup is scoped
// by userId, and unknown values are rejected before any Autopilot
// configuration row, discovery job, or charge is created.
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { NICHE_OPTIONS } from '@/lib/types';
import { AUTOPILOT_NICHE_MAX_LEN } from '@/lib/autopilot/constants';

// ===== NORMALIZED IDENTITY =====

/**
 * Canonical niche identity: trimmed, internal whitespace collapsed to
 * single spaces, lowercased. " Dental Clinics ", "Dental  Clinics" and
 * "DENTAL CLINICS" all normalize to "dental clinics" — the same logical
 * niche for one user. Mirrors the discovery vocabulary's cleanArray()
 * semantics (lead-discovery/normalization.ts).
 */
export function normalizeNicheKey(raw: string | null | undefined): string {
  if (!raw || typeof raw !== 'string') return '';
  return raw.trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Predefined niches keyed by their normalized identity (single source: NICHE_OPTIONS). */
const PREDEFINED_BY_KEY: ReadonlyMap<string, string> = new Map(
  NICHE_OPTIONS.map((n) => [normalizeNicheKey(n), n])
);

/** True when the value (any casing) is one of the predefined niches. */
export function isPredefinedNiche(value: string): boolean {
  return PREDEFINED_BY_KEY.has(normalizeNicheKey(value));
}

/** Reference form for an explicit saved-custom-niche selection. */
export const CUSTOM_NICHE_REF_PREFIX = 'custom:';

// ===== CUSTOM NICHE PERSISTENCE =====

export interface CustomNicheItem {
  id: string;
  name: string;
  nicheKey: string;
  createdAt: string;
}

/**
 * The caller's saved custom niches (active only), alphabetical. User-
 * scoped: another user's niches are never visible. Niches are NOT
 * deleted or archived because they are unselected — they persist until
 * the user explicitly acts (Phase 20 exposes create + list only).
 */
export async function listCustomNiches(userId: string): Promise<CustomNicheItem[]> {
  const rows = await db.customNiche.findMany({
    where: { userId, status: 'active' },
    orderBy: [{ name: 'asc' }, { createdAt: 'asc' }],
    select: { id: true, name: true, nicheKey: true, createdAt: true },
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    nicheKey: r.nicheKey,
    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
  }));
}

export type CustomNicheCreateResult =
  | { ok: true; niche: CustomNicheItem }
  | { ok: false; code: 'VALIDATION' | 'DUPLICATE' | 'PREDEFINED'; error: string };

/**
 * Save a custom niche for the caller. Duplicate prevention is canonical:
 * the (userId, nicheKey) identity — "Dental Clinics", "dental clinics",
 * "DENTAL CLINICS" and " dental clinics " are the SAME logical niche, so
 * a second save is rejected (existing data is never overwritten). A name
 * that duplicates a PREDEFINED niche is also rejected (it already exists
 * in the app's vocabulary). A DB unique-constraint race surfaces as the
 * same friendly duplicate error.
 */
export async function createCustomNiche(
  userId: string,
  rawName: unknown
): Promise<CustomNicheCreateResult> {
  if (typeof rawName !== 'string') {
    return { ok: false, code: 'VALIDATION', error: 'Niche name must be a string' };
  }
  const name = rawName.trim().replace(/\s+/g, ' ').slice(0, AUTOPILOT_NICHE_MAX_LEN);
  const nicheKey = normalizeNicheKey(name);
  if (!name || !nicheKey) {
    return { ok: false, code: 'VALIDATION', error: 'Niche name is required' };
  }
  if (PREDEFINED_BY_KEY.has(nicheKey)) {
    return {
      ok: false,
      code: 'PREDEFINED',
      error: `"${PREDEFINED_BY_KEY.get(nicheKey)}" is already a predefined niche — select it directly`,
    };
  }
  const existing = await db.customNiche.findFirst({
    where: { userId, nicheKey },
    select: { id: true, name: true, nicheKey: true, createdAt: true },
  });
  if (existing) {
    return {
      ok: false,
      code: 'DUPLICATE',
      error: `You already saved the custom niche "${existing.name}"`,
    };
  }
  try {
    const row = await db.customNiche.create({ data: { userId, name, nicheKey } });
    return {
      ok: true,
      niche: {
        id: row.id,
        name: row.name,
        nicheKey: row.nicheKey,
        createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
      },
    };
  } catch (err) {
    // Unique-constraint race (or an archived row holding the same key):
    // identical friendly duplicate error — no state leaked.
    if (err && typeof err === 'object' && 'code' in err && (err as { code?: string }).code === 'P2002') {
      return {
        ok: false,
        code: 'DUPLICATE',
        error: `You already saved the custom niche "${name}"`,
      };
    }
    throw err;
  }
}

// ===== NICHE SELECTION RESOLUTION (Autopilot configuration authority) =====

export type NicheSelectionResult =
  | { ok: true; niches: string[] }
  | { ok: false; code: 'VALIDATION' | 'NOT_FOUND'; error: string };

/**
 * Resolve the niche selection submitted to the Autopilot configuration.
 * Never trusts frontend names or IDs — everything is re-verified against
 * server-side state. Each entry may be:
 *
 *   "Dental"                      a predefined niche (any casing → canonical form)
 *   "AI SaaS companies"           one of the caller's OWN saved custom niches
 *                                 (matched by normalized key; the SAVED display
 *                                 form is used)
 *   "custom:<customNicheId>"      an explicit reference to one of the caller's
 *                                 OWN saved custom niches. A foreign user's id
 *                                 and a missing id are deliberately
 *                                 indistinguishable (NOT_FOUND) — no
 *                                 cross-user existence leak.
 *
 * Anything else is rejected with a clear VALIDATION error — the caller
 * creates no Autopilot row, starts no discovery, and pays no credits.
 * The resolved list is deduplicated case-insensitively (a predefined
 * entry and a custom reference can resolve to the same niche).
 */
export async function resolveNicheSelection(
  userId: string,
  entries: string[]
): Promise<NicheSelectionResult> {
  if (!Array.isArray(entries)) {
    return { ok: false, code: 'VALIDATION', error: 'At least one niche must be selected' };
  }
  if (entries.length === 0) {
    return { ok: false, code: 'VALIDATION', error: 'At least one niche must be selected' };
  }

  const customNeeded = new Set<string>();
  const keyNeeded = new Set<string>();
  for (const entry of entries) {
    if (typeof entry !== 'string') {
      return { ok: false, code: 'VALIDATION', error: 'Each niche must be a string' };
    }
    const value = entry.trim();
    if (!value) {
      return { ok: false, code: 'VALIDATION', error: 'Niches must be non-empty strings' };
    }
    if (value.startsWith(CUSTOM_NICHE_REF_PREFIX)) {
      const id = value.slice(CUSTOM_NICHE_REF_PREFIX.length).trim();
      if (!id) {
        return { ok: false, code: 'VALIDATION', error: 'Invalid custom niche reference' };
      }
      customNeeded.add(id);
    } else if (!PREDEFINED_BY_KEY.has(normalizeNicheKey(value))) {
      keyNeeded.add(normalizeNicheKey(value));
    }
  }

  // ONE batched, user-scoped lookup for every referenced custom niche id
  // and every non-predefined key. Foreign rows can never match here.
  const customById = new Map<string, { id: string; name: string; nicheKey: string }>();
  const customByKey = new Map<string, { id: string; name: string; nicheKey: string }>();
  const ids = [...customNeeded];
  const keys = [...keyNeeded];
  if (ids.length > 0 || keys.length > 0) {
    const where: { userId: string; status: string; OR: object[] } = {
      userId,
      status: 'active',
      OR: [],
    };
    if (ids.length > 0) where.OR.push({ id: { in: ids } });
    if (keys.length > 0) where.OR.push({ nicheKey: { in: keys } });
    const rows = await db.customNiche.findMany({
      where,
      select: { id: true, name: true, nicheKey: true },
    });
    for (const row of rows) {
      customById.set(row.id, row);
      customByKey.set(row.nicheKey, row);
    }
  }

  const resolved: string[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    const value = (entry as string).trim();
    let display: string | null = null;

    if (value.startsWith(CUSTOM_NICHE_REF_PREFIX)) {
      const id = value.slice(CUSTOM_NICHE_REF_PREFIX.length).trim();
      const row = customById.get(id);
      if (!row) {
        // Foreign or missing — indistinguishable by design.
        return { ok: false, code: 'NOT_FOUND', error: 'Custom niche not found for this account' };
      }
      display = row.name;
    } else {
      const key = normalizeNicheKey(value);
      const predefined = PREDEFINED_BY_KEY.get(key);
      if (predefined) {
        display = predefined;
      } else {
        const row = customByKey.get(key);
        if (!row) {
          return {
            ok: false,
            code: 'VALIDATION',
            error: `Unknown niche "${value.slice(0, 60)}" — select a predefined niche or save it as a custom niche first`,
          };
        }
        display = row.name;
      }
    }

    const seenKey = normalizeNicheKey(display);
    if (seen.has(seenKey)) continue;
    seen.add(seenKey);
    resolved.push(display);
  }

  if (resolved.length === 0) {
    return { ok: false, code: 'VALIDATION', error: 'At least one niche must be selected' };
  }
  return { ok: true, niches: resolved };
}

// ===== PROFILE MAPPINGS (niche → Business Profile) =====

export interface ProfileMappings {
  /** normalized niche key → BusinessProfile id */
  [nicheKey: string]: string;
}

/**
 * Shape-validate the profile-mappings payload: an object whose keys are
 * normalized niche keys of the SELECTED niches and whose values are
 * non-empty profile id strings. Unknown keys / bad values are rejected
 * with a clear error — never silently dropped.
 */
export function parseProfileMappings(
  raw: unknown,
  selectedNiches: string[]
): { ok: true; value: ProfileMappings } | { ok: false; error: string } {
  if (raw === undefined || raw === null) return { ok: true, value: {} };
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'profileMappings must be an object { [niche]: profileId }' };
  }
  const validKeys = new Set(selectedNiches.map((n) => normalizeNicheKey(n)));
  const value: ProfileMappings = {};
  for (const [rawKey, rawVal] of Object.entries(raw as Record<string, unknown>)) {
    const key = normalizeNicheKey(rawKey);
    if (!key || !validKeys.has(key)) {
      return {
        ok: false,
        error: 'profileMappings keys must match selected niches',
      };
    }
    if (typeof rawVal !== 'string' || !rawVal.trim()) {
      return { ok: false, error: 'profileMappings values must be a profile id' };
    }
    value[key] = rawVal.trim();
  }
  return { ok: true, value };
}

/**
 * Ownership check for every mapped profile id: the profile must exist,
 * belong to the caller, and be ACTIVE. A foreign user's profile id and a
 * missing id are deliberately indistinguishable (NOT_FOUND) — no
 * cross-user existence leak, and no cross-user mapping can ever be
 * stored. ONE batched, user-scoped query.
 */
export async function validateProfileMappingsOwnership(
  userId: string,
  mappings: ProfileMappings
): Promise<{ ok: boolean; error?: string }> {
  const ids = [...new Set(Object.values(mappings))];
  if (ids.length === 0) return { ok: true };
  const rows = await db.businessProfile.findMany({
    where: { userId, status: 'active', id: { in: ids } },
    select: { id: true },
  });
  if (rows.length !== ids.length) {
    return { ok: false, error: 'Mapped profile not found for this account' };
  }
  return { ok: true };
}
