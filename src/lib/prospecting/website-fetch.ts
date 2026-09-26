// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Website content fetching for the prospecting pipeline.
// Real HTTP fetch + cheerio text extraction. Mirrors the proven fetch
// pattern from src/lib/lead-discovery/website-scorer.ts (timeout,
// size cap, bot UA). No fake data: failed fetches are reported, never
// substituted.
// ═══════════════════════════════════════════════════════════════════

const FETCH_TIMEOUT_MS = 8000;
const MAX_HTML_SIZE = 500 * 1024; // 500KB per page
const MAX_TEXT_PER_PAGE = 3500; // chars of visible text kept per page

const BOT_UA =
  'Mozilla/5.0 (compatible; AcquisitionOS-Bot/1.0; +https://acquisitionos.com)';

export interface FetchedPage {
  url: string;
  ok: boolean;
  status?: number;
  title?: string;
  metaDescription?: string;
  text?: string; // visible text sample
  headings?: string[]; // h1/h2 text
  links?: string[]; // social/external links of interest
  error?: string;
}

/** Normalize a possibly bare domain into a fetchable https URL. */
export function normalizeUrl(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== 'string') return null;
  let url = raw.trim();
  if (!url) return null;
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  try {
    const parsed = new URL(url);
    if (!/^https?:$/.test(parsed.protocol)) return null;
    // Guard against internal/loopback targets (SSRF safety)
    const host = parsed.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '0.0.0.0' ||
      host.endsWith('.local') ||
      host.endsWith('.internal') ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host)
    ) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

/** Fetch one page and extract title/meta/headings/visible text/links. */
export async function fetchPageText(url: string): Promise<FetchedPage> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'User-Agent': BOT_UA, Accept: 'text/html,application/xhtml+xml' },
    });
    if (!res.ok) {
      return { url, ok: false, status: res.status, error: `HTTP ${res.status}` };
    }
    const ct = res.headers.get('content-type') || '';
    if (ct && !ct.includes('html') && !ct.includes('text')) {
      return { url, ok: false, status: res.status, error: `Non-HTML content (${ct})` };
    }
    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_HTML_SIZE) {
      // Still usable — just take the first 500KB
    }
    const html = new TextDecoder('utf-8', { fatal: false }).decode(
      buf.slice(0, MAX_HTML_SIZE)
    );

    const cheerio = await import('cheerio');
    const $ = cheerio.load(html);

    // Remove noise before text extraction
    $('script, style, noscript, svg, iframe, nav, footer, header form').remove();

    const title = ($('title').first().text() || '').trim().slice(0, 200) || undefined;
    const metaDescription =
      ($('meta[name="description"]').attr('content') || '').trim().slice(0, 300) ||
      undefined;

    const headings: string[] = [];
    $('h1, h2').each((_, el) => {
      const t = $(el).text().replace(/\s+/g, ' ').trim();
      if (t && t.length > 2 && headings.length < 15) headings.push(t.slice(0, 120));
    });

    const bodyText = $('body')
      .text()
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, MAX_TEXT_PER_PAGE);

    // Collect interesting external links (social profiles, booking, mailto)
    const links: string[] = [];
    $('a[href]').each((_, el) => {
      const href = ($(el).attr('href') || '').trim();
      if (!href) return;
      const lower = href.toLowerCase();
      const interesting =
        lower.includes('facebook.com') ||
        lower.includes('instagram.com') ||
        lower.includes('linkedin.com') ||
        lower.includes('twitter.com') ||
        lower.includes('x.com/') ||
        lower.includes('youtube.com') ||
        lower.includes('wa.me') ||
        lower.includes('api.whatsapp.com') ||
        lower.includes('mailto:') ||
        lower.includes('calendly.com') ||
        lower.includes('booking') ||
        lower.includes('shopify') ||
        lower.includes('razorpay') ||
        lower.includes('stripe');
      if (interesting && links.length < 15) links.push(href.slice(0, 200));
    });

    return { url, ok: true, status: res.status, title, metaDescription, text: bodyText, headings, links };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isTimeout = message.includes('abort') || message.includes('timeout');
    return {
      url,
      ok: false,
      error: isTimeout ? 'Timed out' : `Fetch failed: ${message.slice(0, 120)}`,
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Candidate sub-pages worth visiting for company research. */
export function candidateSubPages(siteUrl: string): string[] {
  try {
    const u = new URL(siteUrl);
    const base = `${u.protocol}//${u.host}`;
    return [
      `${base}/about`,
      `${base}/about-us`,
      `${base}/services`,
      `${base}/contact`,
      `${base}/products`,
    ];
  } catch {
    return [];
  }
}

/**
 * Fetch homepage + up to `maxSubPages` sub-pages (sequentially, bounded).
 * Returns successfully fetched pages plus honest failure records.
 */
export async function fetchSiteBundle(
  siteUrl: string,
  maxSubPages = 3
): Promise<{ homepage: FetchedPage; subPages: FetchedPage[] }> {
  const homepage = await fetchPageText(siteUrl);
  const subPages: FetchedPage[] = [];
  if (homepage.ok) {
    for (const candidate of candidateSubPages(siteUrl).slice(0, maxSubPages + 2)) {
      if (subPages.length >= maxSubPages) break;
      const page = await fetchPageText(candidate);
      if (page.ok) subPages.push(page);
      // 404s and other failures are intentionally skipped — the homepage
      // plus whatever sub-pages exist is enough context.
    }
  }
  return { homepage, subPages };
}

/** Compact text bundle for AI prompts (homepage + sub-pages, size-capped). */
export function buildSiteTextBundle(
  homepage: FetchedPage,
  subPages: FetchedPage[]
): string {
  const parts: string[] = [];
  const push = (label: string, page: FetchedPage) => {
    if (!page.ok || !page.text) return;
    parts.push(
      [
        `--- PAGE: ${label} (${page.url}) ---`,
        page.title ? `Title: ${page.title}` : '',
        page.metaDescription ? `Meta description: ${page.metaDescription}` : '',
        page.headings && page.headings.length ? `Headings: ${page.headings.join(' | ')}` : '',
        page.links && page.links.length ? `Notable links: ${page.links.join(', ')}` : '',
        `Content: ${page.text}`,
        '',
      ]
        .filter(Boolean)
        .join('\n')
    );
  };
  push('HOME', homepage);
  subPages.forEach((p, i) => push(`SUBPAGE_${i + 1}`, p));
  return parts.join('\n').slice(0, 12000);
}
