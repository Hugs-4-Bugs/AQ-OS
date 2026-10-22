// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Lead Discovery Normalization (Phases 7–10)
//
// Single source of truth for canonical normalization of every piece of
// data that flows through the discovery pipeline:
//   • URLs / domains (website extraction + dedup keys)
//   • emails (case-insensitive identity)
//   • phones (display form + match form)
//   • business names (legal-suffix-stripped match form)
//   • niche / country lists (multi-value targeting inputs)
//
// Shared by lead-discovery-service (extraction + import), the dedup
// service (identity matching) and the discover API route (input
// validation) so every layer normalizes identically.
// ═══════════════════════════════════════════════════════════════════

// ===== URL / DOMAIN =====

/**
 * Canonical URL form: trimmed, protocol added when missing, https default.
 * Empty/whitespace input returns '' (caller keeps `undefined` for absence).
 */
export function normalizeUrl(url: string | null | undefined): string {
  if (!url || typeof url !== 'string') return '';
  let normalized = url.trim();
  if (!normalized) return '';
  if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
    normalized = 'https://' + normalized;
  }
  return normalized;
}

/**
 * Registrable host of a URL ('www.' stripped, lowercased).
 * Returns null for unparseable input — never a guess.
 */
export function extractDomain(url: string | null | undefined): string | null {
  if (!url || typeof url !== 'string') return null;
  const raw = url.trim();
  if (!raw) return null;
  try {
    const normalized = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const parsed = new URL(normalized);
    const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
    return host || null;
  } catch {
    return null;
  }
}

// ===== EMAIL =====

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Canonical email: trimmed + lowercased. Null when the value does not even
 * look like an email (extraction noise) — a fake-looking address is never
 * persisted as a "contact".
 */
export function normalizeEmail(email: string | null | undefined): string | null {
  if (!email || typeof email !== 'string') return null;
  const cleaned = email.trim().toLowerCase();
  if (!cleaned || !EMAIL_SHAPE.test(cleaned) || cleaned.length > 254) return null;
  return cleaned;
}

// ===== PHONE =====

/**
 * Display form of a phone number: trimmed, internal whitespace collapsed.
 * Null for values with no digits at all (noise).
 */
export function normalizePhoneDisplay(phone: string | null | undefined): string | null {
  if (!phone || typeof phone !== 'string') return null;
  const cleaned = phone.replace(/\s+/g, ' ').trim();
  if (!cleaned || !/\d/.test(cleaned)) return null;
  return cleaned.slice(0, 40);
}

/**
 * Match form of a phone number: digits only, with the common leading
 * international-prefix forms stripped so '+91 98765 43210',
 * '0091 98765 43210', '91 9876543210' and '9876543210' all collide.
 * Null when fewer than 7 digits remain (too short to be a phone).
 */
export function normalizePhoneForMatch(phone: string | null | undefined): string | null {
  if (!phone || typeof phone !== 'string') return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 7) return null;
  if (digits.startsWith('00')) return digits.substring(2);
  if (digits.startsWith('1') && digits.length === 11) return digits.substring(1);
  return digits;
}

// ===== BUSINESS NAME =====

/**
 * Legal/formal suffixes stripped before business-name comparison. Only
 * widely-used English + Indian forms (this app's dominant markets); the
 * list is intentionally conservative so real name differences survive.
 */
const LEGAL_SUFFIXES = [
  'private limited', 'pvt ltd', 'pvt. ltd.', 'pvt ltd.', 'pvt.',
  'limited', 'ltd.', 'ltd',
  'llp', 'llc', 'l.l.c.', 'inc.', 'inc', 'incorporated',
  'corp.', 'corp', 'corporation', 'co.', 'co', 'company',
  'plc', 'gmbh', 's.a.', 'sa', 'b.v.', 'bv', 'nv', 'ag', 'srl', 'spa',
  'pte', 'pte.', 'l.l.p.', 'and sons', '& sons', 'and co', '& co',
];

const SUFFIX_PATTERN = new RegExp(
  `(?:[\\s,\\.]*(?:${LEGAL_SUFFIXES.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(?=[\\s,\\.]|$))+$`,
  'i'
);

/**
 * Match form of a business name: lowercased, punctuation removed, legal
 * suffixes stripped. 'Apollo Hospitals Pvt Ltd' → 'apollo hospitals'.
 */
export function normalizeBusinessName(name: string | null | undefined): string {
  if (!name || typeof name !== 'string') return '';
  let cleaned = name.trim().toLowerCase();
  // Strip trailing legal-suffix CHAINS ("Co. Pvt. Ltd.", "& Sons Ltd") —
  // one pass handles the whole chain; the loop is defense-in-depth.
  for (let i = 0; i < 4; i++) {
    const next = cleaned.replace(SUFFIX_PATTERN, '').trim();
    if (next === cleaned) break;
    cleaned = next;
  }
  return cleaned.replace(/[^a-z0-9]+/g, '').trim();
}

// ===== LOCATION =====

/**
 * Match form of a city/country label: lowercased, punctuation removed.
 */
export function normalizeLocationToken(location: string | null | undefined): string {
  if (!location || typeof location !== 'string') return '';
  return location.toLowerCase().replace(/[^a-z0-9]+/g, '').trim();
}

/**
 * Do two location labels refer to the same place (case/punctuation
 * insensitive)? Two empty labels are NOT the same place (absence is not
 * evidence) — returns false so absent location never fabricates a match.
 */
export function sameLocation(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  const na = normalizeLocationToken(a);
  const nb = normalizeLocationToken(b);
  if (!na || !nb) return false;
  return na === nb;
}

// ===== MULTI-VALUE TARGETING INPUTS =====

/** Split a raw niche/country field on commas/semicolons into clean values. */
function splitList(raw: string | null | undefined): string[] {
  if (!raw || typeof raw !== 'string') return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(/[,;]/)) {
    const trimmed = part.trim().replace(/\s+/g, ' ');
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

/** Normalize an ARRAY input: keep strings only, trim, dedupe, order kept. */
function cleanArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const trimmed = item.trim().replace(/\s+/g, ' ');
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

export const MAX_NICHES_PER_JOB = 8;
export const MAX_COUNTRIES_PER_JOB = 10;

/**
 * Parse the niche targeting input into independent niches.
 * Accepts the raw string ("hospital, dentist") or a string[] body field.
 * Order is preserved; duplicates (case-insensitive) collapse. The result
 * is capped at MAX_NICHES_PER_JOB — callers reject the job honestly when
 * the cap is exceeded instead of silently dropping targeting.
 */
export function parseNicheList(
  raw: string | string[] | null | undefined,
  max = MAX_NICHES_PER_JOB
): { niches: string[]; truncated: boolean } {
  const list = Array.isArray(raw) ? cleanArray(raw) : splitList(raw);
  const capped = list.map((n) => n.slice(0, 120));
  return { niches: capped.slice(0, max), truncated: list.length > max };
}

/**
 * Parse the country targeting input into independent countries.
 * An empty result means WORLDWIDE (no country constraint) — never a
 * silent substitution in the other direction.
 */
export function parseCountryList(
  raw: string | string[] | null | undefined,
  max = MAX_COUNTRIES_PER_JOB
): { countries: string[]; truncated: boolean } {
  const list = Array.isArray(raw) ? cleanArray(raw) : splitList(raw);
  const capped = list.map((c) => c.slice(0, 100));
  return { countries: capped.slice(0, max), truncated: list.length > max };
}

// ===== RECORD-LEVEL NORMALIZATION (extraction output) =====

/**
 * Field-level normalization applied to EVERY discovered lead before it
 * can enter dedupe/import — regardless of which provider produced it.
 * All transformations are lossy-safe: they only canonicalize formatting
 * and drop values that are provably noise; no value is ever invented.
 */
export function normalizeLeadFields(lead: Record<string, unknown>): Record<string, unknown> {
  const out = { ...lead };

  if (typeof out.website === 'string') {
    const normalized = normalizeUrl(out.website);
    out.website = normalized || undefined;
  }
  if (typeof out.email === 'string') {
    out.email = normalizeEmail(out.email) ?? undefined;
  }
  if (typeof out.phone === 'string') {
    out.phone = normalizePhoneDisplay(out.phone) ?? undefined;
  }
  if (typeof out.whatsapp === 'string') {
    out.whatsapp = normalizePhoneDisplay(out.whatsapp) ?? undefined;
  }
  for (const key of ['linkedin', 'instagram', 'facebook', 'googleMapsListing', 'sourceUrl'] as const) {
    if (typeof out[key] === 'string') {
      const normalized = normalizeUrl(out[key] as string);
      out[key] = normalized || undefined;
    }
  }
  if (typeof out.businessName === 'string') {
    out.businessName = out.businessName.replace(/\s+/g, ' ').trim().slice(0, 120);
  }
  if (typeof out.rating === 'number' && Number.isFinite(out.rating)) {
    out.rating = Math.min(5, Math.max(0, out.rating));
  } else {
    out.rating = undefined;
  }
  return out;
}
