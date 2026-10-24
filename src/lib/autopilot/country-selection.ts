// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Autopilot Country Selection (Phase 21)
//
// Canonical server-side authority for the Autopilot multi-country
// selection. ONE definition, reused by the API validation, the
// persistence layer, the runner, and the catalog route — the UI only
// mirrors what this module allows.
//
// Reuses (never duplicates) the existing country logic:
//   - src/lib/countries.ts — the complete ISO 3166-1 catalog (249
//     entries: alpha-2 codes, canonical names, alias resolution,
//     case-insensitive search) + the WORLDWIDE sentinel.
//   - the Phase 8/9 discovery targeting machinery (countries[] input,
//     niche×country combo matrix, per-combo attribution, cross-combo
//     dedup) — this module only VALIDATES and RESOLVES selections.
//
// Selection semantics (deterministic, never silent):
//   Worldwide  = absent/empty selection, or the explicit "Worldwide"
//                sentinel alone → global discovery (no country
//                constraint). Mutually exclusive with individual
//                countries.
//   Countries  = one or more catalog entries (canonical name, alias,
//                or ISO alpha-2 code — all resolve to the SAME
//                canonical identity) → country-specific discovery.
//   - duplicates collapse (case-insensitive, post-normalization)
//   - ordering is canonicalized to CATALOG order (deterministic,
//     independent of input order)
//   - unknown/invalid entries are REJECTED with the offending values
//     listed — never silently substituted, never silently dropped
//   - AUTOPILOT_MAX_COUNTRIES bounds the individual-country selection
//     (Worldwide is the intended global scope and is never capped)
// ═══════════════════════════════════════════════════════════════════

import {
  COUNTRIES,
  WORLDWIDE_SENTINEL,
  countryByCode,
  normalizeCountryName,
  searchCountries,
  type CountryEntry,
} from '@/lib/countries';
import { AUTOPILOT_MAX_COUNTRIES } from './constants';

/** The shape persisted in AutopilotWorkflow.geography (JSON column). */
export interface AutopilotGeoSelection {
  /** Legacy single-country field (Phase ≤20 rows) — kept verbatim for
   * backward compatibility; superseded by `countries` when present. */
  country?: string;
  city?: string;
  /** Phase 21 — canonical country names in catalog order. Absent or
   * empty = Worldwide (global discovery). */
  countries?: string[];
}

export type CountrySelectionResult =
  | {
      ok: true;
      /** Canonical country names, catalog order. EMPTY when Worldwide. */
      countries: string[];
      /** True when the selection means global discovery. */
      worldwide: boolean;
    }
  | { ok: false; error: string };

function isWorldwideToken(value: string): boolean {
  return value.trim().toLowerCase() === WORLDWIDE_SENTINEL.toLowerCase();
}

/** Lower-cased canonical name → entry (exact, diacritics preserved). */
const NAME_LC_MAP = new Map(COUNTRIES.map((c) => [c.name.toLowerCase(), c]));

/** Resolve ONE raw entry to its canonical catalog name (null = invalid). */
function resolveOne(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // 1) Exact canonical name, case-insensitive — the catalog's own names
  //    (including diacritic forms like "Åland Islands" / "Türkiye") must
  //    always resolve: normalizeCountryName's punctuation-folded key
  //    cannot round-trip them.
  const exact = NAME_LC_MAP.get(trimmed.toLowerCase());
  if (exact) return exact.name;
  // 2) Known alias (USA, UK, UAE, …) via the shared normalizer.
  const byName = normalizeCountryName(trimmed);
  if (byName) return byName;
  // 3) ISO 3166-1 alpha-2 code ("IN", "ae").
  const byCode = countryByCode(trimmed);
  if (byCode) return byCode.name;
  return null;
}

/**
 * Validate + normalize + deduplicate + order a raw country selection.
 * Accepts:
 *   - undefined / null                     → Worldwide (legacy default)
 *   - []                                   → Worldwide (explicit)
 *   - ["Worldwide"] (any casing)           → Worldwide (explicit sentinel)
 *   - ["India", "AE", "UK", …]             → individual countries
 * Rejection (deterministic error, never silent substitution):
 *   - non-array input, non-string entries
 *   - Worldwide mixed with individual countries
 *   - any entry that resolves to no catalog country
 *   - more than AUTOPILOT_MAX_COUNTRIES individual countries
 */
export function resolveCountrySelection(raw: unknown): CountrySelectionResult {
  if (raw === undefined || raw === null) {
    return { ok: true, countries: [], worldwide: true };
  }
  if (!Array.isArray(raw)) {
    return {
      ok: false,
      error: 'geography.countries must be an array of country names, ISO codes, or ["Worldwide"]',
    };
  }
  const entries: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') {
      return {
        ok: false,
        error: `geography.countries entries must be strings (received ${typeof item})`,
      };
    }
    const trimmed = item.trim();
    if (!trimmed) {
      return { ok: false, error: 'geography.countries entries must be non-empty' };
    }
    entries.push(trimmed);
  }
  if (entries.length === 0) {
    return { ok: true, countries: [], worldwide: true };
  }

  const worldwideTokens = entries.filter(isWorldwideToken);
  if (worldwideTokens.length > 0) {
    if (entries.length !== worldwideTokens.length) {
      return {
        ok: false,
        error:
          '"Worldwide" cannot be combined with individual countries — choose either Worldwide or a list of countries',
      };
    }
    return { ok: true, countries: [], worldwide: true };
  }

  // Resolve every entry; collect the INVALID ones verbatim for the error.
  const invalid: string[] = [];
  const canonicalNames = new Set<string>();
  for (const entry of entries) {
    const canonical = resolveOne(entry);
    if (!canonical) {
      invalid.push(entry);
      continue;
    }
    canonicalNames.add(canonical);
  }
  if (invalid.length > 0) {
    const shown = invalid.slice(0, 5).map((v) => `"${v}"`).join(', ');
    return {
      ok: false,
      error: `Unknown country selection: ${shown}${invalid.length > 5 ? ` (and ${invalid.length - 5} more)` : ''} — choose countries from the catalog or Worldwide`,
    };
  }
  if (canonicalNames.size > AUTOPILOT_MAX_COUNTRIES) {
    return {
      ok: false,
      error: `Too many countries selected (${canonicalNames.size}) — the maximum is ${AUTOPILOT_MAX_COUNTRIES}. Use Worldwide for global discovery.`,
    };
  }

  // Deterministic order: CATALOG order (ISO alpha-2 code sequence),
  // independent of the input order.
  const countries = COUNTRIES.filter((c) => canonicalNames.has(c.name)).map((c) => c.name);
  return { ok: true, countries, worldwide: false };
}

/**
 * Runner-side resolution of the persisted geography into the effective
 * country list for a run:
 *   - Phase 21 `countries` (when the key exists and is a non-empty
 *     array) is authoritative
 *   - legacy rows without `countries` fall back to the single
 *     `country` field (normalized when resolvable, raw otherwise —
 *     same tolerance the discovery route applies)
 *   - neither → Worldwide (empty list)
 */
export function runCountriesFromGeography(geography: {
  country?: string;
  city?: string;
  countries?: string[];
}): string[] {
  if (Array.isArray(geography.countries)) {
    const cleaned = geography.countries
      .filter((c): c is string => typeof c === 'string')
      .map((c) => c.trim())
      .filter(Boolean);
    if (cleaned.length > 0) {
      // Legacy rows written before Phase 21 validation may carry raw
      // values; normalize each to its canonical name where resolvable
      // (raw kept otherwise — never guessed, never silently dropped).
      return cleaned.map((c) => normalizeCountryName(c) || c);
    }
    // Explicitly-empty countries array = Worldwide.
    return [];
  }
  if (geography.country && typeof geography.country === 'string' && geography.country.trim()) {
    return [normalizeCountryName(geography.country) || geography.country.trim()];
  }
  return [];
}

/**
 * Build the persisted geography JSON shape from a validated selection.
 * Worldwide persists WITHOUT a countries key (byte-identical to the
 * legacy worldwide shape); individual countries persist as the
 * canonical-name array in catalog order. The legacy single `country`
 * key is dropped whenever a Phase 21 selection supersedes it.
 */
export function buildPersistedGeography(
  selection: { countries: string[]; worldwide: boolean },
  city?: string | null
): AutopilotGeoSelection {
  const geo: AutopilotGeoSelection = {};
  if (city && typeof city === 'string' && city.trim()) {
    geo.city = city.trim().substring(0, 100);
  }
  if (!selection.worldwide && selection.countries.length > 0) {
    geo.countries = [...selection.countries];
  }
  return geo;
}

/**
 * Human-readable summary of a persisted geography for list/detail UIs:
 * "Worldwide", "India", "India + 2 more", "Mumbai, India + 2 more".
 */
export function geographySummary(geography: AutopilotGeoSelection): string {
  const countries = Array.isArray(geography.countries)
    ? geography.countries.filter((c): c is string => typeof c === 'string' && !!c.trim())
    : [];
  const city = typeof geography.city === 'string' ? geography.city.trim() : '';
  if (countries.length > 0) {
    const head = [city, countries[0]].filter(Boolean).join(', ');
    return countries.length > 1 ? `${head} + ${countries.length - 1} more` : head;
  }
  if (geography.country && typeof geography.country === 'string' && geography.country.trim()) {
    // Legacy single-country row.
    return [city, geography.country.trim()].filter(Boolean).join(', ');
  }
  return city ? city : 'Worldwide';
}

// ===== CATALOG API SHAPE (Phase 21) =====

export interface CountryCatalogEntry {
  /** ISO 3166-1 alpha-2 — the stable selection identifier. */
  code: string;
  /** Canonical English short name (what discovery + leads store). */
  name: string;
}

export interface CountryCatalogResponse {
  /** The Worldwide selection entry (special: global discovery). */
  worldwide: { value: string; label: string };
  /** Full catalog in deterministic ISO-code order. */
  countries: CountryCatalogEntry[];
  total: number;
  /** Server-enforced selection bound for individual countries. */
  maxSelection: number;
}

/**
 * The canonical catalog payload served by /api/autopilot/countries.
 * Pure and deterministic — identical output for identical input, so the
 * UI can safely cache it.
 */
export function countryCatalog(): CountryCatalogResponse {
  return {
    worldwide: { value: WORLDWIDE_SENTINEL, label: WORLDWIDE_SENTINEL },
    countries: COUNTRIES.map(({ code, name }) => ({ code, name })),
    total: COUNTRIES.length,
    maxSelection: AUTOPILOT_MAX_COUNTRIES,
  };
}

/**
 * Server-side search over the catalog (name, alias, or ISO code),
 * deterministic catalog order preserved. Used by the catalog API's
 * `?q=` filter and reusable by any consumer.
 */
export function searchCountryEntries(query: string, limit = 250): CountryCatalogEntry[] {
  return searchCountries(query, limit).map(({ code, name }) => ({ code, name }));
}

/** Catalog lookup helper for tests + UI hydration (name → entry). */
export function catalogEntryFor(name: string): CountryEntry | null {
  const canonical = normalizeCountryName(name);
  if (!canonical) return null;
  return COUNTRIES.find((c) => c.name === canonical) ?? null;
}
