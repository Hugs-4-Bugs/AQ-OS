// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Shared Contact Extractor (spec §5)
//
// Extracts BUSINESS contact information from fetched page HTML:
//   • mailto: links (decoded, query-string stripped)
//   • tel: links
//   • email regex scoped to contact-bearing context (links, footer,
//     contact-marked elements, or anywhere when the page is small)
//   • phone regex with keyword context preference
//   • JSON-LD structured data (schema.org ContactPoint / Organization)
//
// Design rules:
//   • Only the business's OWN contact details are returned — third-party
//     noise (social networks, webmail where a domain exists, image
//     filenames, placeholder addresses like example.com/test@) is dropped.
//   • Everything is de-duplicated and lower-cased where appropriate.
//   • Pure functions — no network, no DB — so they are trivially testable
//     and reusable from any pipeline (discovery, enrichment, research).
// ═══════════════════════════════════════════════════════════════════

export interface ExtractedContact {
  emails: string[];
  phones: string[];
  /** Which mechanism produced each value (provenance within the page). */
  emailSources: Record<string, string[]>;
  phoneSources: Record<string, string[]>;
}

// Free-mail domains: NOT evidence of the business's own address when the
// business has its own domain, but still worth returning on domain-less
// small businesses — callers decide via `freeMail` classification.
const FREE_MAIL_DOMAINS = new Set([
  'gmail.com', 'yahoo.com', 'yahoo.co.in', 'yahoo.in', 'hotmail.com', 'outlook.com',
  'live.com', 'aol.com', 'icloud.com', 'protonmail.com', 'rediffmail.com',
  'yandex.com', 'mail.ru', 'gmx.com', 'zoho.com',
]);

const JUNK_EMAIL_PATTERN =
  /\.(png|jpe?g|gif|svg|webp|css|js)$/i; // image/asset false positives
// Placeholder LOCAL parts (before the @) — "test@", "user@", "yourname@"…
const PLACEHOLDER_LOCAL_PATTERN =
  /^(test|test\d*|user|username|yourname|your-email|youremail|example|foo|bar|name)$/i;
// Placeholder / infrastructure DOMAINS (exact match after the @).
const PLACEHOLDER_DOMAINS = new Set([
  'example.com', 'example.org', 'example.net', 'domain.com', 'test.com',
  'email.com', 'sentry.io', 'sentry-next.wixpress.com', 'wixpress.com',
  'wix.com', 'godaddy.com', 'squarespace.com',
]);

const SOCIAL_DOMAINS = new Set([
  'facebook.com', 'instagram.com', 'linkedin.com', 'twitter.com', 'x.com',
  'youtube.com', 'tiktok.com', 'pinterest.com', 'wa.me', 'whatsapp.com',
  't.me', 'telegram.me', 'google.com', 'googlemail.com',
]);

/** Emails that never indicate a business contact — filtered always. */
function isJunkEmail(email: string): boolean {
  if (JUNK_EMAIL_PATTERN.test(email)) return true;
  const at = email.lastIndexOf('@');
  if (at <= 0) return true; // no @ or empty local part
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (!domain) return true;
  if (PLACEHOLDER_DOMAINS.has(domain)) return true;
  if (SOCIAL_DOMAINS.has(domain)) return true;
  if (PLACEHOLDER_LOCAL_PATTERN.test(local)) return true;
  return false;
}

export function isFreeMail(email: string): boolean {
  return FREE_MAIL_DOMAINS.has(email.split('@')[1] ?? '');
}

/** Normalise a phone: strip everything but digits and a leading +. */
export function normalizePhone(raw: string): string {
  const trimmed = raw.trim();
  const plus = trimmed.startsWith('+') || trimmed.startsWith('00');
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return '';
  // Drop absurd digit runs (dates, ids, prices glued together).
  if (digits.length < 7 || digits.length > 15) return '';
  return plus ? `+${digits}` : digits;
}

function addEmail(map: Record<string, string[]>, email: string, source: string) {
  const key = email.toLowerCase();
  if (!map[key]) map[key] = [];
  if (!map[key].includes(source)) map[key].push(source);
}

function addPhone(map: Record<string, string[]>, phone: string, source: string) {
  const key = normalizePhone(phone);
  if (!key) return;
  if (!map[key]) map[key] = [];
  if (!map[key].includes(source)) map[key].push(source);
}

// A "contact-bearing" context: mail/phone links, elements whose class/id/href
// mention contact words, or the footer.
const CONTACT_CONTEXT_SELECTOR = [
  'a[href^="mailto:"]', 'a[href^="tel:"]',
  '[class*="contact" i]', '[id*="contact" i]', '[class*="footer" i]',
  'footer', '[class*="about" i]', '[class*="get-in-touch" i]',
  '[class*="reach" i]', '[class*="help" i]', '[class*="support" i]',
].join(', ');

const PHONE_CONTEXT_WORDS = /(phone|tel|call|mobile|whatsapp|hotline|contact|reach us|ring)/i;
const EMAIL_CONTEXT_WORDS = /(email|mail us|e-mail|contact|write to|reach)/i;

/** Main entry: extract business contacts from one HTML document. */
export function extractContactsFromHtml(
  html: string,
  opts: { businessDomain?: string | null; sourceLabel?: string } = {},
): ExtractedContact {
  const source = opts.sourceLabel || 'page';
  const emailSources: Record<string, string[]> = {};
  const phoneSources: Record<string, string[]> = {};

  if (!html || typeof html !== 'string') {
    return { emails: [], phones: [], emailSources, phoneSources };
  }

  // ── mailto: / tel: links (highest confidence) ────────────────────
  const mailtoRe = /href\s*=\s*["']mailto:([^"'?#]+)(\?[^"']*)?["']/gi;
  let m: RegExpExecArray | null;
  while ((m = mailtoRe.exec(html)) !== null) {
    const addr = decodeURIComponent(m[1]).trim().toLowerCase();
    if (addr.includes('@') && !isJunkEmail(addr)) addEmail(emailSources, addr, `${source}:mailto`);
  }

  const telRe = /href\s*=\s*["']tel:([^"']+)["']/gi;
  while ((m = telRe.exec(html)) !== null) {
    addPhone(phoneSources, decodeURIComponent(m[1]), `${source}:tel`);
  }

  // ── JSON-LD structured data (schema.org) ─────────────────────────
  const ldJsonRe = /<script[^>]+type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  while ((m = ldJsonRe.exec(html)) !== null) {
    try {
      const data = JSON.parse(m[1].trim());
      const nodes = Array.isArray(data) ? data : [data];
      for (const node of nodes) {
        if (!node || typeof node !== 'object') continue;
        // Organization/LocalBusiness/ContactPoint shapes (also @graph).
        const graph = Array.isArray((node as { '@graph'?: unknown[] })['@graph'])
          ? ((node as { '@graph': unknown[] })['@graph'] as Array<Record<string, unknown>>)
          : [node as Record<string, unknown>];
        for (const g of graph) {
          const emails: unknown[] = [g.email, (g.contactPoint as Record<string, unknown>)?.email].filter(Boolean);
          for (const e of emails) {
            const addr = String(e).trim().toLowerCase().replace(/^mailto:/, '');
            if (addr.includes('@') && !isJunkEmail(addr)) addEmail(emailSources, addr, `${source}:jsonld`);
          }
          const phones: unknown[] = [g.telephone, (g.contactPoint as Record<string, unknown>)?.telephone].filter(Boolean);
          for (const p of phones) addPhone(phoneSources, String(p), `${source}:jsonld`);
        }
      }
    } catch {
      // Malformed JSON-LD — ignore silently.
    }
  }

  // ── Scoped regex extraction (avoid scripts/styles; prefer context) ──
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ');

  const emailRe = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
  // Phone token: a contiguous run of digits/plus/parens/spaces/dots/hyphens
  // bounded by non-digit characters. Digit-count validation happens in
  // normalizePhone (7–15 digits) — this avoids the classic partial-match
  // truncation of grouped regexes (e.g. "+91 98765 43210" → …321).
  const phoneRe = /\+?\(?\d[\d\s().\-]{6,18}\d/g;

  // Context zones: contact-bearing elements' text + the whole body as a
  // lower-priority zone. We approximate zones by slicing around matches of
  // the context selector — cheerio-free so this stays dependency-light.
  const contextZoneRe = /<(footer|address)\b[\s\S]*?<\/\1>/gi;
  let contextZones = '';
  let z: RegExpExecArray | null;
  while ((z = contextZoneRe.exec(cleaned)) !== null) contextZones += ` ${z[0]}`;
  // Elements with contact-ish class/id.
  const classZoneRe = /<(?:div|section|p|span|ul|li)\b[^>]*(?:class|id)\s*=\s*["'][^"']*(?:contact|footer|about|reach)[^"']*["'][^>]*>([\s\S]{0,4000}?)<\/(?:div|section)>/gi;
  while ((z = classZoneRe.exec(cleaned)) !== null) contextZones += ` ${z[0]}`;

  const scanZones: Array<{ text: string; tag: string }> = contextZones
    ? [{ text: contextZones, tag: 'context' }, { text: cleaned, tag: 'body' }]
    : [{ text: cleaned, tag: 'body' }];

  for (const zone of scanZones) {
    // Emails
    let em: RegExpExecArray | null;
    emailRe.lastIndex = 0;
    while ((em = emailRe.exec(zone.text)) !== null) {
      const addr = em[0].toLowerCase().replace(/[.,;:]+$/, '');
      if (isJunkEmail(addr)) continue;
      const src = `${source}:${zone.tag}${zone.tag === 'context' || EMAIL_CONTEXT_WORDS.test(zone.text.slice(Math.max(0, em.index - 80), em.index)) ? '+ctx' : ''}`;
      addEmail(emailSources, addr, src);
    }
    // Phones — keyword-adjacent first: a number within ~80 chars BEFORE a
    // contact word is much more likely to be a real contact number.
    let pm: RegExpExecArray | null;
    phoneRe.lastIndex = 0;
    while ((pm = phoneRe.exec(zone.text)) !== null) {
      const raw = pm[0];
      const normalized = normalizePhone(raw);
      if (!normalized) continue;
      const before = zone.text.slice(Math.max(0, pm.index - 80), pm.index);
      const after = zone.text.slice(pm.index + raw.length, pm.index + raw.length + 30);
      if (PHONE_CONTEXT_WORDS.test(before) || /^(whatsapp|call|tel)/i.test(after) || zone.tag === 'context') {
        addPhone(phoneSources, normalized, `${source}:${zone.tag === 'context' ? 'context' : 'keyword'}`);
      } else {
        // Still record body-scope numbers, but tagged — callers can require
        // keyword/context provenance before marking a phone "found".
        addPhone(phoneSources, normalized, `${source}:body`);
      }
    }
    // Stop scanning the whole body for emails if we already have context hits.
    if (zone.tag === 'context' && Object.keys(emailSources).length > 0 && Object.keys(phoneSources).length > 0) break;
  }

  // Prefer the business's own domain: sort own-domain first, then context
  // provenance, then free-mail.
  const ownDomain = opts.businessDomain?.toLowerCase().replace(/^www\./, '') || null;
  const rankEmail = (e: string): number => {
    const domain = e.split('@')[1] ?? '';
    if (ownDomain && (domain === ownDomain || domain.endsWith(`.${ownDomain}`))) return 0;
    if (!isFreeMail(e)) return 1;
    return 2;
  };
  const emails = Object.keys(emailSources).sort((a, b) => rankEmail(a) - rankEmail(b));

  const rankPhone = (p: string): number => {
    const sources = phoneSources[p]?.join(',') ?? '';
    if (sources.includes('tel') || sources.includes('jsonld')) return 0;
    if (sources.includes('context') || sources.includes('keyword')) return 1;
    return 2;
  };
  const phones = Object.keys(phoneSources).sort((a, b) => rankPhone(a) - rankPhone(b));

  return { emails, phones, emailSources, phoneSources };
}

/**
 * Merge extracted contacts into a lead's existing contact fields WITHOUT
 * overwriting better existing data (spec §6). Returns only the fields that
 * should be written (fill-if-empty) plus a provenance summary.
 */
export function mergeExtractedContacts(
  existing: { email?: string | null; phone?: string | null },
  extracted: ExtractedContact,
  currentDomain: string | null,
): {
  updates: { email?: string; phone?: string };
  provenance: { email?: { value: string; source: string; freeMail: boolean }; phone?: { value: string; source: string } };
  conflict: { email?: boolean; phone?: boolean };
} {
  const updates: { email?: string; phone?: string } = {};
  const provenance: { email?: { value: string; source: string; freeMail: boolean }; phone?: { value: string; source: string } } = {};
  const conflict: { email?: boolean; phone?: boolean } = {};

  const topEmail = extracted.emails[0];
  if (topEmail) {
    provenance.email = {
      value: topEmail,
      source: (extracted.emailSources[topEmail] ?? []).join(','),
      freeMail: isFreeMail(topEmail),
    };
    const existingEmail = (existing.email ?? '').trim().toLowerCase();
    if (!existingEmail) {
      updates.email = topEmail;
    } else if (existingEmail !== topEmail) {
      conflict.email = true; // keep existing; flag the disagreement (spec §5)
    }
  }

  const topPhone = extracted.phones[0];
  if (topPhone) {
    provenance.phone = {
      value: topPhone,
      source: (extracted.phoneSources[topPhone] ?? []).join(','),
    };
    const existingNorm = normalizePhone(existing.phone ?? '');
    if (!existingNorm) {
      updates.phone = topPhone;
    } else if (existingNorm !== topPhone) {
      conflict.phone = true;
    }
  }
  void currentDomain;
  return { updates, provenance, conflict };
}
