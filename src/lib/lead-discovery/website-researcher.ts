// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Deep Website Research Runner (spec §5)
//
// For one lead: fetch the homepage + relevant public sub-pages (Contact,
// About, Services, Products, Locations), respecting robots.txt (existing
// parser, per-host cache), rate limits and size/time budgets; extract
// business contacts (shared contact-extractor); build an evidence-grounded
// report that SEPARATES observed facts from AI interpretation; persist
// everything with per-field source URLs + verification statuses.
//
// Hard limits (safety): ≤4 pages per run, 500 KB/page, 8 s/page, ≥400 ms
// between requests, robots.txt disallowed paths skipped, authentication
// never bypassed.
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { safeFetch } from '@/lib/net/url-guard';
import { shouldRespectRobotsTxt } from '@/lib/anti-bot-service';
import { extractContactsFromHtml, mergeExtractedContacts, type ExtractedContact } from './contact-extractor';
import { deductCredits, checkCreditSufficiency, refundCredits } from '@/lib/credit-service';

const RESEARCH_CREDIT_COST = 5; // same as the existing deep_analysis research cost
const RESEARCH_ACTION = 'deep_analysis';
const MAX_PAGES = 4;
const PAGE_TIMEOUT_MS = 8000;
const PAGE_MAX_BYTES = 500_000;
const INTER_REQUEST_DELAY_MS = 400;
const ROBOTS_TIMEOUT_MS = 4000;

const SUBPAGE_CANDIDATES = ['/contact', '/contact-us', '/about', '/about-us', '/services', '/products'];

interface ResearchPageResult {
  url: string;
  ok: boolean;
  status: number;
  html: string;
  skippedReason?: string;
}

// ── robots.txt per-host cache (module-level, short-lived) ──────────
const robotsCache = new Map<string, { robotsTxt: string; fetchedAt: number }>();
const ROBOTS_CACHE_TTL_MS = 10 * 60 * 1000;

async function getRobotsTxt(origin: string): Promise<string> {
  const cached = robotsCache.get(origin);
  if (cached && Date.now() - cached.fetchedAt < ROBOTS_CACHE_TTL_MS) return cached.robotsTxt;

  let robotsTxt = '';
  try {
    const res = await safeFetch(`${origin}/robots.txt`, { timeoutMs: ROBOTS_TIMEOUT_MS, maxBytes: 64_000 });
    if (res.ok) robotsTxt = res.body;
  } catch {
    // No robots.txt reachable → empty (everything allowed by default).
  }
  robotsCache.set(origin, { robotsTxt, fetchedAt: Date.now() });
  return robotsTxt;
}

async function fetchPageIfAllowed(url: URL): Promise<ResearchPageResult> {
  const robotsTxt = await getRobotsTxt(url.origin);
  if (robotsTxt && shouldRespectRobotsTxt(robotsTxt, url.pathname)) {
    return { url: url.toString(), ok: false, status: 0, html: '', skippedReason: 'robots.txt disallows this path' };
  }
  const res = await safeFetch(url.toString(), { timeoutMs: PAGE_TIMEOUT_MS, maxBytes: PAGE_MAX_BYTES });
  return { url: res.finalUrl, ok: res.ok, status: res.status, html: res.ok ? res.body : '' };
}

function extractDomain(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url.startsWith('http') ? url : `https://${url}`).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

export interface WebsiteResearchContactField {
  field: 'email' | 'phone';
  value: string;
  sources: string[];
  /** verified | found | not_found | conflicting (spec §5 vocabulary) */
  verificationStatus: 'verified' | 'found' | 'not_found' | 'conflicting';
  conflictWith?: string | null;
  freeMail?: boolean;
}

export interface WebsiteResearchResult {
  researchId: string;
  status: 'completed' | 'partial' | 'failed';
  leadWasUpdated: boolean;
  contacts: WebsiteResearchContactField[];
  report: {
    pagesFetched: string[];
    observedFacts: string[];
    limitations: string[];
    aiInterpretation: Record<string, unknown> | null;
  };
  creditsDeducted: number;
}

/**
 * Run deep website research for one lead (owner-scoped) and persist the
 * report + per-field contact verification. Fill-if-empty when writing back
 * to the Lead row — never overwrites better existing data; conflicts are
 * recorded, not resolved silently.
 */
export async function runWebsiteResearch(
  leadId: string,
  userId: string,
  opts: {
    businessProfileId?: string | null;
    skipCredits?: boolean;
    /** Client-generated operation identity — makes the ledger key stable
     *  across retries of the SAME logical run (the previous Date.now()
     *  key was unique per call, i.e. never deduped). */
    idempotencyKey?: string | null;
  } = {},
): Promise<WebsiteResearchResult> {
  const lead = await db.lead.findFirst({
    where: { id: leadId, userId, isActive: true },
  });
  if (!lead) {
    throw new Error('Lead not found');
  }
  if (!lead.website) {
    throw new Error('Lead has no website to research');
  }

  // ── Credits (same rules as other AI research; refunded on failure) ──
  let creditsDeducted = 0;
  let deductionId: string | null = null;
  if (!opts.skipCredits) {
    const sufficiency = await checkCreditSufficiency(userId, RESEARCH_CREDIT_COST);
    if (!sufficiency.sufficient) {
      throw new Error(`Insufficient credits. Need ${RESEARCH_CREDIT_COST}, have ${sufficiency.balance}`);
    }
    const deduction = await deductCredits({
      userId,
      action: RESEARCH_ACTION,
      cost: RESEARCH_CREDIT_COST,
      referenceId: `website_research:${leadId}`,
      idempotencyKey: `website_research:${leadId}:${opts.idempotencyKey || Date.now()}`,
    });
    if (!deduction.success) {
      throw new Error(deduction.error || 'Failed to deduct credits');
    }
    creditsDeducted = RESEARCH_CREDIT_COST;
    deductionId = deduction.ledgerEntryId ?? null;
  }

  try {
    // ── Fetch homepage + contact-bearing sub-pages ────────────────
    const homepageUrl = new URL(lead.website.startsWith('http') ? lead.website : `https://${lead.website}`);
    const domain = extractDomain(lead.website);

    const pages: ResearchPageResult[] = [];
    const homepage = await fetchPageIfAllowed(homepageUrl);
    pages.push(homepage);

    if (homepage.ok) {
      // Pick candidate sub-pages that actually exist (link mentions) first;
      // otherwise try the standard list, up to the MAX_PAGES budget.
      const linkedCandidates = SUBPAGE_CANDIDATES.filter((p) =>
        homepage.html.toLowerCase().includes(`href="${p}`) || homepage.html.toLowerCase().includes(`href='${p}`));
      const candidates = (linkedCandidates.length > 0 ? linkedCandidates : SUBPAGE_CANDIDATES)
        .slice(0, MAX_PAGES - 1);

      for (const path of candidates) {
        if (pages.length >= MAX_PAGES) break;
        await new Promise((r) => setTimeout(r, INTER_REQUEST_DELAY_MS));
        try {
          const sub = await fetchPageIfAllowed(new URL(path, homepageUrl));
          pages.push(sub);
        } catch {
          // Sub-page failures are non-fatal.
        }
      }
    }

    const fetchedPages = pages.filter((p) => p.ok);
    const pagesFetchedUrls = fetchedPages.map((p) => p.url);

    // ── Extract contacts from every fetched page ──────────────────
    let extracted: ExtractedContact = { emails: [], phones: [], emailSources: {}, phoneSources: {} };
    for (const page of fetchedPages) {
      const pageContacts = extractContactsFromHtml(page.html, {
        businessDomain: domain,
        sourceLabel: page.url,
      });
      extracted = {
        emails: [...new Set([...extracted.emails, ...pageContacts.emails])],
        phones: [...new Set([...extracted.phones, ...pageContacts.phones])],
        emailSources: { ...pageContacts.emailSources, ...extracted.emailSources },
        phoneSources: { ...pageContacts.phoneSources, ...extracted.phoneSources },
      };
    }

    // ── Per-field verification statuses (spec §5) ─────────────────
    const contacts: WebsiteResearchContactField[] = [];
    const email = extracted.emails[0];
    if (email) {
      const existingEmail = (lead.email ?? '').trim().toLowerCase();
      const conflicting = !!existingEmail && existingEmail !== email;
      contacts.push({
        field: 'email',
        value: email,
        sources: extracted.emailSources[email] ?? [],
        // "found, not independently verified" — on-site presence is evidence,
        // NOT a verified status (no MX/mailbox check performed here).
        verificationStatus: conflicting ? 'conflicting' : 'found',
        conflictWith: conflicting ? existingEmail : null,
        freeMail: extracted.emails.some((e) => e === email && /gmail|yahoo|hotmail|outlook\./.test(e)),
      });
    }
    const phone = extracted.phones[0];
    if (phone) {
      const existingDigits = (lead.phone ?? '').replace(/\D/g, '');
      const conflicting = !!existingDigits && existingDigits !== phone.replace(/\D/g, '');
      contacts.push({
        field: 'phone',
        value: phone,
        sources: extracted.phoneSources[phone] ?? [],
        verificationStatus: conflicting ? 'conflicting' : 'found',
        conflictWith: conflicting ? lead.phone : null,
      });
    }
    if (!email && !phone) {
      contacts.push({
        field: 'email',
        value: '',
        sources: [],
        verificationStatus: 'not_found',
      });
    }

    // ── Observed facts (evidence, not interpretation) ─────────────
    const observedFacts: string[] = [];
    observedFacts.push(`Homepage ${homepage.ok ? `reachable (HTTP ${homepage.status})` : `not reachable (${homepage.status || 'error'})`}`);
    observedFacts.push(`${fetchedPages.length}/${pages.length} candidate pages fetched: ${pagesFetchedUrls.join(', ') || 'none'}`);
    for (const c of contacts) {
      if (c.verificationStatus === 'not_found') {
        observedFacts.push('No business email or phone found in the pages checked');
      } else {
        observedFacts.push(`${c.field}: ${c.value} (${c.verificationStatus}; sources: ${c.sources.join(', ')})`);
      }
    }

    const limitations: string[] = [];
    if (!homepage.ok) limitations.push('Homepage not reachable — report is empty of website evidence');
    for (const p of pages) {
      if (p.skippedReason) limitations.push(`Skipped ${p.url}: ${p.skippedReason}`);
      if (p.ok && p.status !== 200 && p.status !== 0) limitations.push(`Sub-page ${p.url} returned HTTP ${p.status}`);
    }
    limitations.push('Email/phone values are "found on the website", not independently verified (no mailbox/MX check in this run)');

    const status: WebsiteResearchResult['status'] =
      fetchedPages.length === 0 ? 'failed' : fetchedPages.length === 1 && contacts.every((c) => c.verificationStatus === 'not_found') ? 'partial' : 'completed';

    // ── Fill-if-empty write-back to the Lead (never overwrite better data) ──
    let leadWasUpdated = false;
    const { updates, provenance } = mergeExtractedContacts(
      { email: lead.email, phone: lead.phone },
      extracted,
      domain,
    );
    if (Object.keys(updates).length > 0) {
      const noteLines = Object.entries(provenance).map(
        ([field, p]) => `${field}=${p!.value} (source: ${p!.source})`,
      );
      await db.lead.update({
        where: { id: lead.id },
        data: {
          ...updates,
          // Append bounded provenance to the existing notes (same pattern as
          // mergeFillDuplicate in the discovery pipeline).
          notes: [lead.notes?.trim(), `[website research] ${noteLines.join('; ')}`].filter(Boolean).join('\n').slice(-2000),
        },
      });
      leadWasUpdated = true;
    }

    // ── Persist the research record (additive history) ────────────
    const report = {
      observedFacts,
      limitations,
      aiInterpretation: null, // factual crawler run — no AI claims in v1
      businessContextHint: {
        domain,
        pagesAttempted: pages.map((p) => ({ url: p.url, ok: p.ok, status: p.status, skippedReason: p.skippedReason ?? null })),
      },
    };
    const record = await db.websiteResearch.create({
      data: {
        leadId: lead.id,
        userId,
        status,
        reportJson: JSON.stringify(report),
        contactsJson: JSON.stringify(contacts),
        pagesFetched: JSON.stringify(pagesFetchedUrls),
        notes: `Run with ${creditsDeducted} credits${opts.skipCredits ? ' (free run)' : ''}`,
      },
    });

    return {
      researchId: record.id,
      status,
      leadWasUpdated,
      contacts,
      report: {
        pagesFetched: pagesFetchedUrls,
        observedFacts,
        limitations,
        aiInterpretation: null,
      },
      creditsDeducted,
    };
  } catch (err) {
    // Refund on unexpected failure (same discipline as discovery imports).
    if (deductionId && creditsDeducted > 0) {
      await refundCredits({ userId, amount: creditsDeducted, originalAction: RESEARCH_ACTION, referenceId: `website_research:${leadId}` }).catch(() => undefined);
    }
    throw err;
  }
}

/** Latest research record for a lead (owner-scoped). */
export async function getLatestWebsiteResearch(leadId: string, userId: string) {
  return db.websiteResearch.findFirst({
    where: { leadId, userId },
    orderBy: { createdAt: 'desc' },
  });
}
