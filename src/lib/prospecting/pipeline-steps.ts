// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — 5-Step Prospecting Pipeline: Step implementations
//
// STEP 1  Company Deep Research   — real website fetch + web search + AI synthesis
// STEP 2  Gap Detection           — deterministic rule gaps (measured) + AI deep pass
// STEP 3  User Offer Profile Match— user's configured offers × detected gaps
// STEP 4  Personalized Pitch      — evidence-based pitch generation
// STEP 5  Smart Email             — gap-specific subject / body / CTA draft
//
// House rules (mirroring company-researcher.ts / competitive-gap-analysis):
//  - AI via executeAICompletion ONLY (direct ZAI is used solely for web_search)
//  - Never trust the browser: all inputs come from server-side fetch + DB
//  - "unknown" when data is missing — NEVER invent company facts
// ═══════════════════════════════════════════════════════════════════

import { executeAICompletion } from '@/lib/ai/ai-provider';
import ZAI from 'z-ai-web-dev-sdk';
import { analyzeWebsite, type WebsiteScore } from '@/lib/lead-discovery/website-scorer';
import {
  fetchSiteBundle,
  buildSiteTextBundle,
  normalizeUrl,
  type FetchedPage,
} from './website-fetch';
import type {
  OfferService,
  OfferMatch,
  PipelineEmail,
  PipelineGap,
  PipelineGaps,
  PipelineMatch,
  PipelinePitch,
  PipelineResearch,
} from './types';

// ===== Shared AI helpers =====

export interface LeadContext {
  id: string;
  businessName: string;
  website?: string | null;
  niche?: string | null;
  city?: string | null;
  country?: string | null;
  email?: string | null;
  phone?: string | null;
  rating?: number | null;
  reviews?: string | null;
  ownerName?: string | null;
  hasWebsite?: boolean;
}

/** Robust AI JSON extraction (same hardened pattern as company-researcher). */
export function parseAIJson<T>(content: string, fallback: T): T {
  let cleaned = content.trim();
  const codeBlockMatch = cleaned.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/);
  if (codeBlockMatch) cleaned = codeBlockMatch[1].trim();
  else if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
  }
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.error('[ProspectPipeline] No JSON object found in AI response');
    return fallback;
  }
  try {
    return JSON.parse(jsonMatch[0]) as T;
  } catch (err) {
    console.error('[ProspectPipeline] JSON.parse failed:', err);
    return fallback;
  }
}

async function aiJson(system: string, user: string, userId: string, action: string, maxTokens = 1600) {
  const result = await executeAICompletion(
    {
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      config: { provider: 'z-ai', temperature: 0.35, maxTokens },
    },
    userId,
    action
  );
  if (!result.success) {
    throw new Error(result.error || 'AI provider failed');
  }
  return result;
}

/** Server-side web search via ZAI functions (only direct-ZAI usage here). */
async function webSearchSnippets(lead: LeadContext): Promise<{ used: boolean; text: string }> {
  try {
    const zai = await ZAI.create();
    const queries = [
      `${lead.businessName} ${lead.city || ''} reviews`.trim(),
      `${lead.businessName} ${lead.niche || 'company'} services team`,
    ];
    const chunks: string[] = [];
    for (const query of queries) {
      try {
        const results = await zai.functions.invoke('web_search', { query, num: 5 });
        if (Array.isArray(results) && results.length > 0) {
          chunks.push(
            results
              .map((r) => {
                const name = typeof r?.name === 'string' ? r.name : '';
                const snippet = typeof r?.snippet === 'string' ? r.snippet : '';
                const link = typeof r?.url === 'string' ? r.url : '';
                return `- ${name} ${snippet} ${link}`.trim();
              })
              .filter((s: string) => s.length > 3)
              .join('\n')
          );
        }
      } catch (qErr) {
        console.error('[ProspectPipeline] web_search query failed:', qErr);
      }
    }
    const text = chunks.join('\n').slice(0, 6000);
    return { used: text.length > 0, text };
  } catch (err) {
    console.error('[ProspectPipeline] web_search unavailable:', err);
    return { used: false, text: '' };
  }
}

// ===== STEP 1 — Company Deep Research =====

function asStringArray(v: unknown, max = 8): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
    .map((s) => s.trim().slice(0, 120))
    .slice(0, max);
}

export async function runStepResearch(
  lead: LeadContext,
  userId: string
): Promise<PipelineResearch> {
  // 1a. Real website scoring (deterministic, cheerio-based)
  const normalizedSite = normalizeUrl(lead.website);
  let websiteScore: WebsiteScore | null = null;
  let homepage: FetchedPage | null = null;
  let subPages: FetchedPage[] = [];
  if (normalizedSite) {
    try {
      websiteScore = await analyzeWebsite(
        normalizedSite,
        lead.businessName,
        lead.niche || 'business'
      );
    } catch (err) {
      console.error('[ProspectPipeline] analyzeWebsite failed:', err);
    }
    try {
      const bundle = await fetchSiteBundle(normalizedSite, 3);
      homepage = bundle.homepage;
      subPages = bundle.subPages;
    } catch (err) {
      console.error('[ProspectPipeline] fetchSiteBundle failed:', err);
    }
  }

  // 1b. Real web search for reviews / social / team signals
  const search = await webSearchSnippets(lead);

  // 1c. AI synthesis over gathered evidence
  const siteText = homepage ? buildSiteTextBundle(homepage, subPages) : '';
  const evidenceParts: string[] = [
    `Company name: ${lead.businessName}`,
    lead.city ? `City: ${lead.city}` : '',
    lead.country ? `Country: ${lead.country}` : '',
    lead.niche ? `Known niche: ${lead.niche}` : '',
    lead.rating ? `Known rating: ${lead.rating}` : '',
    lead.reviews ? `Known review notes: ${lead.reviews.slice(0, 500)}` : '',
    websiteScore
      ? `Website technical analysis (measured): ${JSON.stringify(websiteScore)}`
      : normalizedSite
        ? 'Website technical analysis: fetch/scoring failed — do not assume anything about the site'
        : 'No website on record',
    siteText ? `Website page contents (fetched):\n${siteText}` : '',
    search.used ? `Public web search results:\n${search.text}` : '',
  ];

  const system =
    'You are a meticulous B2B research analyst. You receive MEASURED evidence about a company ' +
    '(fetched website pages, technical website analysis, public web search results). ' +
    'Build a factual company profile. STRICT RULES: ' +
    '(1) Use ONLY the provided evidence — never invent facts, never guess numbers. ' +
    '(2) When evidence is missing use exactly "unknown" for that field (or empty array for lists). ' +
    '(3) For teamSizeEstimate/revenueEstimate give a rough range ONLY if the evidence supports it ' +
    '(e.g. "Small local business (likely under 10 staff)"), otherwise "unknown". ' +
    '(4) Reply with ONLY a valid JSON object, no markdown, no commentary. ' +
    'JSON shape: {"businessType":string,"whatTheySell":string[],"services":string[],' +
    '"targetMarket":string,"teamSizeEstimate":string,"revenueEstimate":string,"techStack":string[],' +
    '"socialPresence":{"platforms":string[],"signals":string},"reviewsSummary":{"averageRating":string,' +
    '"sentiment":string,"highlights":string[]},"confidence":"high"|"medium"|"low","summary":string}. ' +
    'summary = 2-3 plain sentences describing what this company does and who it serves.';

  const user =
    evidenceParts.filter(Boolean).join('\n\n') +
    '\n\nProduce the JSON company profile now.';

  const result = await aiJson(system, user, userId, 'prospect_pipeline_research', 1400);

  const fallback: PipelineResearch = {
    businessType: lead.niche || 'unknown',
    whatTheySell: [],
    services: [],
    targetMarket: 'unknown',
    teamSizeEstimate: 'unknown',
    revenueEstimate: 'unknown',
    techStack: websiteScore?.techStack?.slice(0, 8) || [],
    socialPresence: { platforms: [], signals: 'No data found' },
    reviewsSummary: {
      averageRating: lead.rating ? String(lead.rating) : 'unknown',
      sentiment: 'unknown',
      highlights: [],
    },
    dataSources: {
      websiteFetched: !!homepage?.ok,
      pagesFetched: subPages.filter((p) => p.ok).map((p) => p.url),
      webSearchUsed: search.used,
      websiteScore: websiteScore?.overallScore ?? null,
    },
    confidence: 'low',
    summary: `${lead.businessName} profile built from limited evidence.`,
  };

  const parsed = parseAIJson<Partial<PipelineResearch>>(result.content, fallback);

  const research: PipelineResearch = {
    businessType:
      typeof parsed.businessType === 'string' && parsed.businessType.trim()
        ? parsed.businessType.trim().slice(0, 150)
        : fallback.businessType,
    whatTheySell: asStringArray(parsed.whatTheySell),
    services: asStringArray(parsed.services),
    targetMarket:
      typeof parsed.targetMarket === 'string' && parsed.targetMarket.trim()
        ? parsed.targetMarket.trim().slice(0, 250)
        : 'unknown',
    teamSizeEstimate:
      typeof parsed.teamSizeEstimate === 'string' && parsed.teamSizeEstimate.trim()
        ? parsed.teamSizeEstimate.trim().slice(0, 150)
        : 'unknown',
    revenueEstimate:
      typeof parsed.revenueEstimate === 'string' && parsed.revenueEstimate.trim()
        ? parsed.revenueEstimate.trim().slice(0, 150)
        : 'unknown',
    techStack:
      asStringArray(parsed.techStack).length > 0
        ? asStringArray(parsed.techStack)
        : fallback.techStack,
    socialPresence: {
      platforms: asStringArray(parsed.socialPresence?.platforms, 10),
      signals:
        typeof parsed.socialPresence?.signals === 'string' && parsed.socialPresence.signals.trim()
          ? parsed.socialPresence.signals.trim().slice(0, 400)
          : 'No data found',
    },
    reviewsSummary: {
      averageRating:
        typeof parsed.reviewsSummary?.averageRating === 'string' &&
        parsed.reviewsSummary.averageRating.trim()
          ? parsed.reviewsSummary.averageRating.trim().slice(0, 30)
          : fallback.reviewsSummary.averageRating,
      sentiment:
        typeof parsed.reviewsSummary?.sentiment === 'string' &&
        parsed.reviewsSummary.sentiment.trim()
          ? parsed.reviewsSummary.sentiment.trim().slice(0, 60)
          : 'unknown',
      highlights: asStringArray(parsed.reviewsSummary?.highlights, 5),
    },
    dataSources: fallback.dataSources, // measured server-side, never AI-reported
    confidence:
      parsed.confidence === 'high' || parsed.confidence === 'medium' || parsed.confidence === 'low'
        ? parsed.confidence
        : fallback.dataSources.websiteFetched
          ? 'medium'
          : 'low',
    summary:
      typeof parsed.summary === 'string' && parsed.summary.trim()
        ? parsed.summary.trim().slice(0, 700)
        : fallback.summary,
  };
  return research;
}

// ===== STEP 2 — Gap Detection =====

/** Deterministic gaps measured from the real WebsiteScore (no AI). */
export function buildRuleGaps(
  websiteScore: WebsiteScore | null,
  lead: LeadContext
): { gaps: PipelineGap[]; strengths: string[] } {
  const gaps: PipelineGap[] = [];
  const strengths: string[] = [];

  if (!websiteScore || !lead.website) {
    gaps.push({
      category: 'digital_presence',
      gap: 'No website at all',
      evidence: 'Lead has no website URL on record and none was found',
      severity: 'critical',
      businessImpact:
        'Invisible to customers searching online; competitors capture these searches instead',
    });
    return { gaps, strengths };
  }

  if (!websiteScore.hasSSL) {
    gaps.push({
      category: 'website_quality',
      gap: 'No SSL certificate (HTTPS)',
      evidence: 'Site was reached over plain HTTP; browsers show "Not secure"',
      severity: 'critical',
      businessImpact: 'Visitors and Google distrust the site; conversions and rankings drop',
    });
  } else {
    strengths.push('Valid HTTPS/SSL certificate');
  }

  if (!websiteScore.isMobile) {
    gaps.push({
      category: 'website_quality',
      gap: 'Website is not mobile-friendly',
      evidence: 'Mobile viewport/meta checks failed on the fetched HTML',
      severity: 'critical',
      businessImpact: 'Majority of local searches happen on mobile; poor experience loses them',
    });
  } else {
    strengths.push('Mobile-responsive website');
  }

  if (websiteScore.loadSpeed === 'slow') {
    gaps.push({
      category: 'website_quality',
      gap: 'Slow website load speed',
      evidence: 'Measured page load exceeded acceptable thresholds',
      severity: 'moderate',
      businessImpact: 'Visitors abandon slow pages before seeing the offer',
    });
  }

  if (websiteScore.designAge === 'outdated') {
    gaps.push({
      category: 'website_quality',
      gap: 'Outdated website design',
      evidence: 'Design signals indicate an old build (legacy patterns detected)',
      severity: 'moderate',
      businessImpact: 'Makes the business look less credible than newer competitors',
    });
  } else if (websiteScore.designAge === 'modern') {
    strengths.push('Modern website design');
  }

  if (websiteScore.seoScore < 60) {
    gaps.push({
      category: 'seo',
      gap: `Weak SEO fundamentals (score ${websiteScore.seoScore}/100)`,
      evidence: `Measured SEO checks: ${websiteScore.seoScore}/100`,
      severity: websiteScore.seoScore < 40 ? 'critical' : 'moderate',
      businessImpact: 'Business ranks below competitors for searches it should win',
    });
  } else if (websiteScore.seoScore >= 70) {
    strengths.push(`Solid SEO basics (${websiteScore.seoScore}/100)`);
  }

  if (!websiteScore.hasOnlineBooking) {
    gaps.push({
      category: 'automation',
      gap: 'No online booking / ordering / enquiry automation',
      evidence: 'No booking, scheduling or order flow detected on the site',
      severity: 'moderate',
      businessImpact: 'Enquiries depend on manual calls/messages; leads leak outside business hours',
    });
  } else {
    strengths.push('Online booking / ordering available');
  }

  if (!websiteScore.hasContactInfo) {
    gaps.push({
      category: 'missing_features',
      gap: 'Contact information hard to find on website',
      evidence: 'No clear contact details found on fetched pages',
      severity: 'moderate',
      businessImpact: 'Interested visitors cannot easily reach the business',
    });
  }

  if (!websiteScore.hasSocialLinks) {
    gaps.push({
      category: 'digital_presence',
      gap: 'No social media links on website',
      evidence: 'No links to social profiles found in the HTML',
      severity: 'minor',
      businessImpact: 'Missed trust-building and re-marketing opportunities',
    });
  }

  return { gaps, strengths };
}

export async function runStepGaps(
  lead: LeadContext,
  research: PipelineResearch,
  websiteScore: WebsiteScore | null,
  siteText: string,
  userId: string
): Promise<PipelineGaps> {
  const ruleResult = buildRuleGaps(websiteScore, lead);

  const system =
    'You are a digital-presence auditor for small and mid-size businesses. ' +
    'You are given measured website findings plus a company profile. Identify ADDITIONAL business gaps ' +
    'beyond the measured ones already listed. Categories: website_quality, seo, automation, ' +
    'missing_features, outdated_process, weak_area. STRICT RULES: ' +
    '(1) Every gap must cite concrete evidence from the provided data — no speculation. ' +
    '(2) Do NOT repeat the measured gaps already provided. ' +
    '(3) Return at most 6 additional gaps, the most commercially important ones. ' +
    '(4) Reply with ONLY valid JSON: {"gaps":[{"category":string,"gap":string,"evidence":string,' +
    '"severity":"critical"|"moderate"|"minor","businessImpact":string}]}.';

  const user = [
    `Company: ${lead.businessName}${lead.city ? ` (${lead.city})` : ''}`,
    `Business type: ${research.businessType}`,
    `Services found: ${research.services.join(', ') || 'unknown'}`,
    `Measured gaps already detected (do NOT repeat): ${ruleResult.gaps.map((g) => g.gap).join('; ') || 'none'}`,
    research.summary ? `Profile summary: ${research.summary}` : '',
    siteText ? `Website content sample:\n${siteText.slice(0, 8000)}` : 'No website content available',
  ]
    .filter(Boolean)
    .join('\n\n');

  const validCats = new Set([
    'website_quality',
    'seo',
    'automation',
    'missing_features',
    'outdated_process',
    'weak_area',
    'digital_presence',
  ]);

  let aiGaps: PipelineGap[] = [];
  try {
    const result = await aiJson(system, user, userId, 'prospect_pipeline_gaps', 1200);
    const parsed = parseAIJson<{ gaps?: Partial<PipelineGap>[] }>(result.content, {});
    aiGaps = (Array.isArray(parsed.gaps) ? parsed.gaps : [])
      .slice(0, 6)
      .map((g) => ({
        category:
          typeof g?.category === 'string' && validCats.has(g.category)
            ? (g.category as PipelineGap['category'])
            : 'weak_area' as PipelineGap['category'],
        gap: typeof g?.gap === 'string' ? g.gap.trim().slice(0, 200) : '',
        evidence: typeof g?.evidence === 'string' ? g.evidence.trim().slice(0, 300) : '',
        severity:
          g?.severity === 'critical' || g?.severity === 'minor'
            ? (g.severity as PipelineGap['severity'])
            : ('moderate' as PipelineGap['severity']),
        businessImpact:
          typeof g?.businessImpact === 'string' ? g.businessImpact.trim().slice(0, 300) : '',
      }))
      .filter((g) => g.gap.length > 0);
  } catch (err) {
    console.error('[ProspectPipeline] AI gap pass failed (continuing with rule gaps):', err);
  }

  // Merge + dedupe (case-insensitive containment check)
  const merged: PipelineGap[] = [...ruleResult.gaps];
  for (const aiGap of aiGaps) {
    const lower = aiGap.gap.toLowerCase();
    const duplicate = merged.some((m) => {
      const ml = m.gap.toLowerCase();
      return ml === lower || ml.includes(lower) || lower.includes(ml);
    });
    if (!duplicate) merged.push(aiGap);
  }

  const severityRank = { critical: 0, moderate: 1, minor: 2 } as const;
  merged.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);

  return {
    overallDigitalHealthScore: websiteScore?.overallScore ?? 0,
    gaps: merged,
    strengths: ruleResult.strengths,
  };
}

// ===== STEP 3 — User Offer Profile Match =====

/** Deterministic keyword-overlap fallback matcher (used only if AI fails). */
function keywordMatchOffers(
  offers: OfferService[],
  gaps: PipelineGap[]
): OfferMatch[] {
  const stop = new Set(['and', 'the', 'for', 'with', 'a', 'an', 'of', 'in', 'to', 'no', 'not']);
  const tokenize = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 2 && !stop.has(t));

  return offers
    .map((offer) => {
      const offerTokens = new Set(tokenize(`${offer.label} ${offer.category} ${offer.description}`));
      const matchedGaps: string[] = [];
      for (const gap of gaps) {
        const gapTokens = tokenize(`${gap.gap} ${gap.category}`);
        const overlap = gapTokens.filter((t) => offerTokens.has(t));
        if (overlap.length >= 2 || (overlap.length === 1 && gap.severity === 'critical')) {
          matchedGaps.push(gap.gap);
        }
      }
      if (matchedGaps.length === 0) return null;
      const strength: OfferMatch['matchStrength'] =
        matchedGaps.length >= 3 ? 'strong' : matchedGaps.length === 2 ? 'partial' : 'weak';
      return {
        offerLabel: offer.label,
        matchedGaps,
        matchStrength: strength,
        rationale: `Matches ${matchedGaps.length} detected gap(s) via service keywords`,
        angle: `Position ${offer.label} as the direct fix for: ${matchedGaps[0]}`,
      } satisfies OfferMatch;
    })
    .filter((m): m is OfferMatch => m !== null)
    .slice(0, 4);
}

export async function runStepMatch(
  lead: LeadContext,
  gaps: PipelineGaps,
  offers: OfferService[],
  userId: string
): Promise<PipelineMatch> {
  // No offer profile configured → honest skip (step 4/5 continue generically)
  if (offers.length === 0) {
    return {
      matchScore: 0,
      opportunityStatement: '',
      matches: [],
      skipped: true,
      skipReason:
        'No offer profile configured. Go to Settings → My Offer to list the services you sell, then re-run the pipeline for precise matching.',
    };
  }

  const system =
    'You are a sales-fit analyst. You get: (a) detected gaps at a prospect company and ' +
    '(b) the services the USER sells. Match the user\'s offers to the prospect\'s gaps. ' +
    'STRICT RULES: (1) Only propose matches that genuinely resolve a detected gap. ' +
    '(2) matchScore (0-100) reflects overall fit: 80+ = multiple strong matches, 50-79 = one strong match, ' +
    '20-49 = only weak/partial matches, below 20 = poor fit. ' +
    '(3) opportunityStatement must follow this exact pattern: ' +
    '"<Company> has <top gap> → User offers <best offer> → <one-line why it is a perfect match>". ' +
    '(4) Reply with ONLY valid JSON: {"matchScore":number,"opportunityStatement":string,' +
    '"matches":[{"offerLabel":string,"matchedGaps":string[],"matchStrength":"strong"|"partial"|"weak",' +
    '"rationale":string,"angle":string}]}. Return at most 4 matches, strongest first.';

  const user = [
    `Prospect company: ${lead.businessName}${lead.city ? ` (${lead.city})` : ''}`,
    `Business type: ${gaps.overallDigitalHealthScore ? `digital health ${gaps.overallDigitalHealthScore}/100; ` : ''}`,
    `Detected gaps:\n${gaps.gaps.map((g) => `- [${g.severity}] ${g.gap} — evidence: ${g.evidence}`).join('\n')}`,
    `User's offers:\n${offers.map((o) => `- ${o.label} (${o.category}): ${o.description}`).join('\n')}`,
  ].join('\n\n');

  try {
    const result = await aiJson(system, user, userId, 'prospect_pipeline_match', 1200);
    const parsed = parseAIJson<Partial<PipelineMatch>>(result.content, {});
    const matches: OfferMatch[] = (Array.isArray(parsed.matches) ? parsed.matches : [])
      .slice(0, 4)
      .map((m) => ({
        offerLabel:
          typeof m?.offerLabel === 'string' ? m.offerLabel.trim().slice(0, 120) : '',
        matchedGaps: asStringArray(m?.matchedGaps, 6),
        matchStrength:
          m?.matchStrength === 'strong' || m?.matchStrength === 'weak'
            ? (m.matchStrength as OfferMatch['matchStrength'])
            : ('partial' as OfferMatch['matchStrength']),
        rationale: typeof m?.rationale === 'string' ? m.rationale.trim().slice(0, 300) : '',
        angle: typeof m?.angle === 'string' ? m.angle.trim().slice(0, 300) : '',
      }))
      .filter((m) => m.offerLabel.length > 0);

    if (matches.length === 0) {
      // AI saw no real fit — report honestly rather than inventing one
      return {
        matchScore: typeof parsed.matchScore === 'number' ? Math.max(0, Math.min(100, Math.round(parsed.matchScore))) : 10,
        opportunityStatement:
          typeof parsed.opportunityStatement === 'string' && parsed.opportunityStatement.trim()
            ? parsed.opportunityStatement.trim()
            : `No strong offer-gap match found for ${lead.businessName} with the current offer profile.`,
        matches: [],
        skipped: false,
      };
    }

    return {
      matchScore:
        typeof parsed.matchScore === 'number'
          ? Math.max(0, Math.min(100, Math.round(parsed.matchScore)))
          : 50,
      opportunityStatement:
        typeof parsed.opportunityStatement === 'string' && parsed.opportunityStatement.trim()
          ? parsed.opportunityStatement.trim().slice(0, 400)
          : `${lead.businessName} has "${gaps.gaps[0]?.gap || 'digital gaps'}" → User offers "${matches[0].offerLabel}"`,
      matches,
      skipped: false,
    };
  } catch (err) {
    console.error('[ProspectPipeline] AI match failed, using keyword fallback:', err);
    const matches = keywordMatchOffers(offers, gaps.gaps);
    return {
      matchScore: matches.length >= 2 ? 65 : matches.length === 1 ? 45 : 15,
      opportunityStatement: matches.length
        ? `${lead.businessName} has "${gaps.gaps[0]?.gap || 'digital gaps'}" → User offers "${matches[0].offerLabel}"`
        : '',
      matches,
      skipped: false,
    };
  }
}

// ===== STEP 4 — Personalized Pitch =====

export async function runStepPitch(
  lead: LeadContext,
  research: PipelineResearch,
  gaps: PipelineGaps,
  match: PipelineMatch | null,
  userId: string
): Promise<PipelinePitch> {
  const topGaps = gaps.gaps.slice(0, 3);
  const bestMatch = match && !match.skipped ? match.matches[0] : null;

  const system =
    'You are an expert B2B copywriter writing a SHORT personalized pitch from a service provider ' +
    '(the user) to a prospect company. You receive measured research and detected gaps. ' +
    'STRICT RULES: (1) Reference the company BY NAME and city (if known). ' +
    '(2) Cite 1-3 SPECIFIC evidence-based gaps (e.g. "no online booking", "not mobile-friendly", ' +
    '"SEO score 32/100") — never generic claims. ' +
    '(3) The solution must map to the user\'s matched offer when one is provided. ' +
    '(4) Include ONE quantified projected benefit and mark it as an estimate (e.g. "can increase ' +
    'bookings by an estimated 30-40%"). Never present projections as guarantees. ' +
    '(5) Max 120 words, no buzzwords ("revolutionary", "cutting-edge" forbidden), no emoji. ' +
    '(6) Reply with ONLY valid JSON: {"headline":string,"pitch":string,"keyPoints":string[],' +
    '"projectedOutcome":string,"callToAction":string}. headline ≤ 12 words; keyPoints = 2-4 items; ' +
    'callToAction = one short actionable sentence.';

  const user = [
    `Prospect: ${lead.businessName}${lead.city ? `, ${lead.city}` : ''}${lead.country ? `, ${lead.country}` : ''}`,
    `Business type: ${research.businessType} | Target market: ${research.targetMarket}`,
    `Company summary: ${research.summary}`,
    `Top detected gaps (with evidence):\n${topGaps.map((g) => `- [${g.severity}] ${g.gap} — ${g.evidence}`).join('\n')}`,
    bestMatch
      ? `User's best-fit offer: ${bestMatch.offerLabel}. Positioning angle: ${bestMatch.angle}`
      : 'No specific offer match — write the pitch around fixing the top gaps with professional digital services.',
  ]
    .filter(Boolean)
    .join('\n\n');

  const result = await aiJson(system, user, userId, 'prospect_pipeline_pitch', 1000);

  const fallback: PipelinePitch = {
    headline: `${lead.businessName}: ${topGaps[0]?.gap || 'digital presence gaps'}`,
    pitch: `${lead.businessName} currently has ${topGaps.length} measurable digital gap(s), starting with "${topGaps[0]?.gap || 'an outdated online presence'}". ${bestMatch ? `We fix this with ${bestMatch.offerLabel}.` : 'We specialise in fixing exactly these gaps.'}`,
    keyPoints: topGaps.map((g) => `${g.gap} — ${g.evidence}`),
    projectedOutcome: 'Estimated improvement in lead flow within 60-90 days (estimate, results vary)',
    callToAction: 'Worth a 15-minute call this week?',
  };

  const parsed = parseAIJson<Partial<PipelinePitch>>(result.content, fallback);

  return {
    headline:
      typeof parsed.headline === 'string' && parsed.headline.trim()
        ? parsed.headline.trim().slice(0, 150)
        : fallback.headline,
    pitch:
      typeof parsed.pitch === 'string' && parsed.pitch.trim()
        ? parsed.pitch.trim().slice(0, 1200)
        : fallback.pitch,
    keyPoints:
      asStringArray(parsed.keyPoints, 4).length > 0
        ? asStringArray(parsed.keyPoints, 4)
        : fallback.keyPoints,
    projectedOutcome:
      typeof parsed.projectedOutcome === 'string' && parsed.projectedOutcome.trim()
        ? parsed.projectedOutcome.trim().slice(0, 300)
        : fallback.projectedOutcome,
    callToAction:
      typeof parsed.callToAction === 'string' && parsed.callToAction.trim()
        ? parsed.callToAction.trim().slice(0, 200)
        : fallback.callToAction,
  };
}

// ===== STEP 5 — Smart Email =====

export async function runStepEmail(
  lead: LeadContext,
  research: PipelineResearch,
  gaps: PipelineGaps,
  pitch: PipelinePitch,
  userId: string
): Promise<PipelineEmail> {
  const topGap = gaps.gaps[0];

  const system =
    'You write cold outreach emails for a service provider. The email must feel personally ' +
    'researched, not templated. STRICT RULES: ' +
    '(1) Subject ≤ 60 characters, names the company or their specific gap (e.g. "Cavalier Hospital - online booking gap"). No clickbait, no ALL CAPS, no emoji. ' +
    '(2) Body ≤ 150 words. First sentence references their actual business. Then address their ' +
    'exact problem using the measured evidence. Then the solution in one or two sentences. ' +
    '(3) End with a CTA relevant to THEIR business (e.g. appointment demo for a clinic, menu ' +
    'ordering for a restaurant). ' +
    '(4) Plain text only: no markdown, no bullet symbols, no placeholders like [Name] — the ' +
    'recipient name is unknown, use "Hi there" or "Hello". No sender name/signature at the end ' +
    '(the system adds it). ' +
    '(5) Reply with ONLY valid JSON: {"subject":string,"body":string,"cta":string,"postscript":string}. ' +
    'postscript is optional ("" if none) — a one-line P.S. is encouraged.';

  const user = [
    `Prospect: ${lead.businessName}${lead.city ? ` in ${lead.city}` : ''}`,
    `Their business: ${research.summary || research.businessType}`,
    `Their #1 gap: ${topGap ? `${topGap.gap} (evidence: ${topGap.evidence}; impact: ${topGap.businessImpact})` : 'unknown'}`,
    `Other gaps: ${gaps.gaps.slice(1, 3).map((g) => g.gap).join('; ') || 'none'}`,
    `Pitch to base the email on:\n${pitch.pitch}`,
    `Desired CTA direction: ${pitch.callToAction}`,
    lead.email ? `Recipient email exists (do NOT include the address in the body).` : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  const result = await aiJson(system, user, userId, 'prospect_pipeline_email', 900);

  const fallback: PipelineEmail = {
    subject: `${lead.businessName}${lead.city ? ` (${lead.city})` : ''}: ${topGap?.gap || 'quick question'}`.slice(0, 60),
    body: `Hello,\n\nI looked at ${lead.businessName}'s online presence and noticed ${topGap ? topGap.gap.toLowerCase() : 'a few gaps'} — ${topGap?.evidence || 'based on a quick audit'}.\n\n${pitch.pitch}\n\n${pitch.callToAction}`,
    cta: pitch.callToAction,
  };

  const parsed = parseAIJson<Partial<PipelineEmail>>(result.content, fallback);

  return {
    subject:
      typeof parsed.subject === 'string' && parsed.subject.trim()
        ? parsed.subject.trim().slice(0, 78)
        : fallback.subject,
    body:
      typeof parsed.body === 'string' && parsed.body.trim()
        ? parsed.body.trim().slice(0, 2200)
        : fallback.body,
    cta:
      typeof parsed.cta === 'string' && parsed.cta.trim()
        ? parsed.cta.trim().slice(0, 250)
        : fallback.cta,
    postscript:
      typeof parsed.postscript === 'string' && parsed.postscript.trim()
        ? parsed.postscript.trim().slice(0, 220)
        : undefined,
  };
}
