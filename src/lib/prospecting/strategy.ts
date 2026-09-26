// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — "How We Can Help" Strategy Engine (STEP 3b)
//
// Answers the core question for every researched lead:
//   "Why and how can we help THIS specific company?"
//
// Sections implemented (deep-research spec):
//   §6  Real business opportunities (website/software/AI/automation/growth)
//   §7  How-We-Can-Help block (primary opportunity + why + solution +
//       impact logic + evidence + confidence) — never generic AI pitch
//   §8  Service mapping to the USER'S configured offers
//   §9  Prioritization: primary / secondary / do-not-pitch
//   §10 Evidence discipline: observed vs inferred vs unknown
//   §11 Decision-maker relevance (why this person, not just a name)
//   §13 Multiple outreach angles, most evidence-supported wins
//   §20 Research Complete ≠ Qualified ≠ Outreach Ready
//   §23 Insufficient public data → honest "Insufficient Research Data"
//
// House rules: AI via executeAICompletion only; "unknown" when evidence
// is missing; NEVER invent company facts or guaranteed business outcomes.
// ═══════════════════════════════════════════════════════════════════

import { parseAIJson, aiJson, type LeadContext } from './pipeline-steps';
import type {
  DecisionMakerGuidance,
  LeadOpportunity,
  OutreachAngleType,
  OutreachAngles,
  OpportunityCategory,
  OpportunityPrioritization,
  PipelineGaps,
  PipelineMatch,
  PipelineResearch,
  PipelineStrategy,
  Qualification,
  ServiceMapping,
} from './types';

const VALID_CATEGORIES: OpportunityCategory[] = [
  'website',
  'software',
  'ai',
  'automation',
  'growth',
];
const VALID_ANGLES: OutreachAngleType[] = [
  'efficiency',
  'productivity',
  'revenue',
  'customer_experience',
  'automation',
  'technology',
];

// ===== Deterministic qualification (never AI-decided) =====

function buildQualification(
  lead: LeadContext,
  research: PipelineResearch,
  gaps: PipelineGaps,
  match: PipelineMatch | null
): Qualification {
  const hasPublicData =
    research.dataSources.websiteFetched || research.dataSources.webSearchUsed;
  // §23 discipline: without a fetched website we rely on web search alone —
  // only good enough when the search evidence produced a usable profile
  // (medium/high confidence). Low confidence + no site = noise, not data.
  const insufficientData =
    !research.dataSources.websiteFetched &&
    (!research.dataSources.webSearchUsed || research.confidence === 'low');

  const disqualifiers: string[] = [];
  if (!lead.email && !lead.phone) {
    disqualifiers.push('No contact channel on record (no email, no phone)');
  }
  if (research.confidence === 'low') {
    disqualifiers.push('Research confidence is low — little public evidence available');
  }
  if (insufficientData) {
    disqualifiers.push('Neither the website nor web search returned usable data');
  }
  if (gaps.gaps.length === 0) {
    disqualifiers.push('No meaningful gaps detected — nothing specific to pitch');
  }

  const hasContact = !!lead.email || !!lead.phone;
  const strongMatch = !!match && !match.skipped && match.matches.length > 0;
  let outreachPotential: Qualification['outreachPotential'] = 'LOW';
  if (hasPublicData && hasContact && gaps.gaps.length > 0) {
    outreachPotential =
      research.confidence !== 'low' && (strongMatch || gaps.gaps.some((g) => g.severity === 'critical'))
        ? 'HIGH'
        : 'MEDIUM';
  }

  return {
    outreachPotential,
    disqualifiers,
    researchComplete: hasPublicData,
    insufficientData,
  };
}

// ===== Deterministic fallback strategy (used when the AI pass fails) =====

function fallbackStrategy(
  lead: LeadContext,
  research: PipelineResearch,
  gaps: PipelineGaps,
  match: PipelineMatch | null
): PipelineStrategy {
  const topGaps = gaps.gaps.slice(0, 3);
  const bestMatch = match && !match.skipped ? match.matches[0] : null;

  const opportunities: LeadOpportunity[] = topGaps.map((g) => {
    const category: OpportunityCategory =
      g.category === 'automation'
        ? 'automation'
        : g.category === 'website_quality' || g.category === 'digital_presence'
          ? 'website'
          : g.category === 'seo' || g.category === 'missing_features'
            ? 'growth'
            : 'software';
    return {
      title: g.gap,
      category,
      observed: [g.evidence].filter(Boolean),
      inferred: [g.businessImpact].filter(Boolean),
      potentialSolution: bestMatch
        ? `Address with ${bestMatch.offerLabel}`
        : 'Address with professional digital services',
      expectedImpact: [g.businessImpact],
      relevantService: bestMatch?.offerLabel || 'none',
      confidence: g.severity === 'critical' ? 'high' : g.severity === 'moderate' ? 'medium' : 'low',
      outreachSuitability: g.severity === 'critical' ? 'high' : 'medium',
    } satisfies LeadOpportunity;
  });

  const serviceMapping: ServiceMapping | null = bestMatch
    ? {
        primaryService: bestMatch.offerLabel,
        secondaryServices: (match && !match.skipped ? match.matches.slice(1, 3) : []).map(
          (m) => m.offerLabel
        ),
        reason: bestMatch.rationale,
        confidence: bestMatch.matchStrength === 'strong' ? 'high' : 'medium',
      }
    : null;

  const primary = opportunities[0];
  const prioritization: OpportunityPrioritization | null = primary
    ? {
        primary: primary.title,
        whyPrimary:
          primary.observed[0] ||
          'Strongest measured evidence and highest business relevance',
        secondary: opportunities.slice(1).map((o) => o.title),
        doNotPitch: [],
      }
    : null;

  const angles: OutreachAngles | null = primary
    ? {
        primaryAngle: 'efficiency',
        whyThisAngle: 'The measured gaps most directly create manual work or lost enquiries.',
        angles: [
          {
            type: 'efficiency',
            statement: `Fixing "${primary.title}" removes friction that currently costs them enquiries and manual effort.`,
          },
        ],
      }
    : null;

  const decisionMaker: DecisionMakerGuidance = {
    name: lead.ownerName || lead.bestContactPersonHint || 'unknown',
    role: lead.ownerName ? 'Owner / founder (from lead record)' : 'unknown',
    whyThisPerson: lead.ownerName
      ? 'Small-business context: the owner typically owns website and tooling decisions.'
      : 'No named contact on record — verify the right person before outreach.',
    relevanceToOpportunity: primary
      ? `Owns the budget and priority for fixing: ${primary.title}`
      : 'Not yet linked to a specific opportunity.',
    recommendedConversation: primary
      ? `Talk about "${primary.title}" with concrete evidence, not a generic pitch.`
      : 'No specific conversation angle yet.',
  };

  const primaryEvidence = primary?.observed.join('; ') || 'measured website findings';
  const impact = primary?.expectedImpact.join('; ') || 'improved online performance';

  return {
    howWeCanHelpSummary: primary
      ? `Based on the company's public website and available business signals, the strongest identified opportunity is: ${primary.title}. The evidence is: ${primaryEvidence}. The relevant service is: ${primary.relevantService}. The likely business benefit is: ${impact}. Confidence: ${primary.confidence}.`
      : `Insufficient evidence to propose a specific opportunity for ${lead.businessName}.`,
    opportunities,
    serviceMapping,
    prioritization,
    decisionMaker,
    angles,
    qualification: buildQualification(lead, research, gaps, match),
    strategyVersion: 2,
  };
}

// ===== STEP 3b — How We Can Help (AI synthesis + deterministic guardrails) =====

export async function runStepStrategy(
  lead: LeadContext,
  research: PipelineResearch,
  gaps: PipelineGaps,
  match: PipelineMatch | null,
  userId: string
): Promise<PipelineStrategy> {
  const qualification = buildQualification(lead, research, gaps, match);

  // §23: no public data at all → honest insufficient-data result, no invented opportunities
  if (qualification.insufficientData) {
    return {
      howWeCanHelpSummary:
        'Insufficient Research Data: neither the website nor public web search returned usable information, ' +
        'so no evidence-based opportunity can be proposed. Enrich the lead (website, phone, or niche) and re-run research.',
      opportunities: [],
      serviceMapping: null,
      prioritization: null,
      decisionMaker: {
        name: lead.ownerName || 'unknown',
        role: 'unknown',
        whyThisPerson: 'No public data available to assess the right contact.',
        relevanceToOpportunity: 'No evidence-based opportunity to connect to.',
        recommendedConversation: 'Research the company manually before any outreach.',
      },
      angles: null,
      qualification,
      strategyVersion: 2,
    };
  }

  const offerList =
    match && !match.skipped && match.matches.length > 0
      ? match.matches.map((m) => `- ${m.offerLabel}: ${m.rationale}`).join('\n')
      : 'No specific offer match — map opportunities to general digital services.';

  const system =
    'You are a senior B2B strategist answering: "How can WE help THIS specific company?" ' +
    'You get measured research (fetched pages, website analysis, web search), detected gaps with evidence, ' +
    'and the services the USER sells. STRICT RULES: ' +
    '(1) opportunities: 2-5 items, ranked strongest-first. Each must cite OBSERVED facts (from the provided ' +
    'evidence) and may add INFERRED conclusions — never invent company facts. ' +
    '(2) expectedImpact: logical connections only ("could reduce manual handling", "may improve conversion") — ' +
    'NEVER guaranteed outcomes, no invented percentages. ' +
    '(3) relevantService must be one of the user\'s offered services exactly as written, or "none". ' +
    '(4) prioritization: pick ONE primary opportunity and explain WHY it wins (evidence strength, business ' +
    'relevance, outreach suitability). List what NOT to pitch and why. ' +
    '(5) angles: give up to 3 different outreach angles (efficiency, productivity, revenue, customer_experience, ' +
    'automation, technology), each in ONE sentence grounded in observed evidence; pick primaryAngle = the most ' +
    'evidence-supported one and explain why. ' +
    '(6) decisionMaker: use only the provided contact hints (ownerName / contact person). If unknown, say "unknown" ' +
    'and explain how to verify. Explain why this person is the right contact for the primary opportunity. ' +
    '(7) Reply with ONLY valid JSON: ' +
    '{"opportunities":[{"title":string,"category":"website"|"software"|"ai"|"automation"|"growth",' +
    '"observed":string[],"inferred":string[],"potentialSolution":string,"expectedImpact":string[],' +
    '"relevantService":string,"confidence":"high"|"medium"|"low","outreachSuitability":"high"|"medium"|"low"}],' +
    '"serviceMapping":{"primaryService":string,"secondaryServices":string[],"reason":string,' +
    '"confidence":"high"|"medium"|"low"},' +
    '"prioritization":{"primary":string,"whyPrimary":string,"secondary":string[],"doNotPitch":string[]},' +
    '"angles":{"primaryAngle":"efficiency"|"productivity"|"revenue"|"customer_experience"|"automation"|"technology",' +
    '"whyThisAngle":string,"angles":[{"type":string,"statement":string}]},' +
    '"decisionMaker":{"name":string,"role":string,"whyThisPerson":string,"relevanceToOpportunity":string,' +
    '"recommendedConversation":string}}.';

  const user = [
    `Company: ${lead.businessName}${lead.city ? `, ${lead.city}` : ''}${lead.country ? `, ${lead.country}` : ''}`,
    `Profile: ${research.summary}`,
    research.industry ? `Industry: ${research.industry}${research.subIndustry ? ` / ${research.subIndustry}` : ''}` : '',
    research.businessModel ? `Business model: ${research.businessModel.type} (confidence: ${research.businessModel.confidence})` : '',
    research.companySummary
      ? `What they sell: ${research.companySummary.whatTheySell} | Who they serve: ${research.companySummary.whoTheyServe} | How they make money: ${research.companySummary.howTheyMakeMoney}`
      : '',
    `Observed evidence:\n${(research.evidence || [])
      .map((e) => `- [${e.kind}] ${e.claim} (source: ${e.source})`)
      .join('\n') || '- none recorded'}`,
    `Detected gaps (with evidence):\n${gaps.gaps
      .map((g) => `- [${g.severity}] ${g.gap} — evidence: ${g.evidence} — impact: ${g.businessImpact}`)
      .join('\n')}`,
    `Offer-gap matches:\n${offerList}`,
    `Contact hints: ${lead.ownerName ? `owner/decision maker: ${lead.ownerName}` : 'no owner name'}${lead.bestContactPersonHint ? `, contact person: ${lead.bestContactPersonHint}` : ''}`,
  ]
    .filter(Boolean)
    .join('\n\n');

  try {
    const result = await aiJson(system, user, userId, 'prospect_pipeline_strategy', 2000);
    const parsed = parseAIJson<{
      opportunities?: Partial<LeadOpportunity>[];
      serviceMapping?: Partial<ServiceMapping>;
      prioritization?: Partial<OpportunityPrioritization>;
      angles?: Partial<OutreachAngles>;
      decisionMaker?: Partial<DecisionMakerGuidance>;
    }>(result.content, {});

    // ── Normalize opportunities (evidence discipline enforced) ──
    const offerLabels = new Set(
      match && !match.skipped ? match.matches.map((m) => m.offerLabel) : []
    );
    const strArr = (v: unknown, max = 4): string[] =>
      Array.isArray(v)
        ? v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).map((s) => s.trim().slice(0, 250)).slice(0, max)
        : [];

    const opportunities: LeadOpportunity[] = (Array.isArray(parsed.opportunities) ? parsed.opportunities : [])
      .slice(0, 5)
      .map((o): LeadOpportunity => {
        const title = typeof o?.title === 'string' ? o.title.trim().slice(0, 180) : '';
        const category: OpportunityCategory = VALID_CATEGORIES.includes(o?.category as OpportunityCategory)
          ? (o!.category as OpportunityCategory)
          : 'growth';
        const relevantServiceRaw = typeof o?.relevantService === 'string' ? o.relevantService.trim() : '';
        const confidence: LeadOpportunity['confidence'] =
          o?.confidence === 'high' || o?.confidence === 'medium' ? o.confidence : 'low';
        const suitabilityRaw = o?.outreachSuitability;
        const outreachSuitability: LeadOpportunity['outreachSuitability'] =
          suitabilityRaw === 'high' || suitabilityRaw === 'medium' ? suitabilityRaw : 'low';
        return {
          title,
          category,
          observed: strArr(o?.observed, 4),
          inferred: strArr(o?.inferred, 4),
          potentialSolution: typeof o?.potentialSolution === 'string' ? o.potentialSolution.trim().slice(0, 400) : '',
          expectedImpact: strArr(o?.expectedImpact, 3),
          relevantService: offerLabels.has(relevantServiceRaw) ? relevantServiceRaw : 'none',
          confidence,
          outreachSuitability,
        };
      })
      .filter((o) => o.title.length > 0 && (o.observed.length > 0 || o.inferred.length > 0));

    // An opportunity with ZERO evidence is discarded — no generic AI pitch
    if (opportunities.length === 0) {
      return fallbackStrategy(lead, research, gaps, match);
    }

    // ── Service mapping (must reference the user's real offers) ──
    const sm = parsed.serviceMapping;
    const serviceMapping: ServiceMapping | null =
      sm && typeof sm.primaryService === 'string' && sm.primaryService.trim()
        ? {
            primaryService: offerLabels.has(sm.primaryService.trim()) ? sm.primaryService.trim() : sm.primaryService.trim().slice(0, 120),
            secondaryServices: strArr(sm.secondaryServices, 3).filter((s) => offerLabels.has(s)),
            reason: typeof sm.reason === 'string' ? sm.reason.trim().slice(0, 400) : '',
            confidence: sm.confidence === 'high' || sm.confidence === 'medium' ? sm.confidence : 'low',
          }
        : null;

    // ── Prioritization (primary must exist in opportunities) ──
    const p = parsed.prioritization;
    const prioritization: OpportunityPrioritization | null =
      p && typeof p.primary === 'string' && opportunities.some((o) => o.title === p.primary?.trim())
        ? {
            primary: p.primary.trim(),
            whyPrimary: typeof p.whyPrimary === 'string' ? p.whyPrimary.trim().slice(0, 500) : '',
            secondary: strArr(p.secondary, 4).filter((t) => t !== p.primary?.trim()),
            doNotPitch: strArr(p.doNotPitch, 3),
          }
        : {
            primary: opportunities[0].title,
            whyPrimary: 'Highest evidence strength and outreach suitability among detected opportunities.',
            secondary: opportunities.slice(1, 3).map((o) => o.title),
            doNotPitch: [],
          };

    // ── Angles ──
    const a = parsed.angles;
    const angles: OutreachAngles | null =
      a && (a.primaryAngle as OutreachAngleType) && VALID_ANGLES.includes(a.primaryAngle as OutreachAngleType)
        ? {
            primaryAngle: a.primaryAngle as OutreachAngleType,
            whyThisAngle: typeof a.whyThisAngle === 'string' ? a.whyThisAngle.trim().slice(0, 300) : '',
            angles: (Array.isArray(a.angles) ? a.angles : [])
              .filter((x) => !!x && typeof x === 'object' && typeof (x as { type?: unknown }).type === 'string' && typeof (x as { statement?: unknown }).statement === 'string')
              .map((x) => {
                const rec = x as { type: string; statement: string };
                return {
                  type: VALID_ANGLES.includes(rec.type as OutreachAngleType)
                    ? (rec.type as OutreachAngleType)
                    : ('efficiency' as OutreachAngleType),
                  statement: rec.statement.trim().slice(0, 300),
                };
              })
              .filter((x) => x.statement.length > 0)
              .slice(0, 3),
          }
        : null;

    // ── Decision maker (contact hints only; never invented names) ──
    const d = parsed.decisionMaker;
    const decisionMaker: DecisionMakerGuidance = {
      name:
        d && typeof d.name === 'string' && d.name.trim()
          ? d.name.trim().slice(0, 120)
          : lead.ownerName || 'unknown',
      role: d && typeof d.role === 'string' && d.role.trim() ? d.role.trim().slice(0, 120) : 'unknown',
      whyThisPerson: d && typeof d.whyThisPerson === 'string' ? d.whyThisPerson.trim().slice(0, 400) : '',
      relevanceToOpportunity:
        d && typeof d.relevanceToOpportunity === 'string'
          ? d.relevanceToOpportunity.trim().slice(0, 400)
          : '',
      recommendedConversation:
        d && typeof d.recommendedConversation === 'string'
          ? d.recommendedConversation.trim().slice(0, 400)
          : '',
    };

    // ── Concrete how-we-can-help block (Section 7 format) ──
    const primaryOpp =
      opportunities.find((o) => o.title === prioritization?.primary) || opportunities[0];
    const howWeCanHelpSummary =
      `Based on the company's public website and available business signals, the strongest identified opportunity is: ` +
      `${primaryOpp.title}. The evidence is: ${primaryOpp.observed.join('; ') || primaryOpp.inferred.join('; ') || 'measured website findings'}. ` +
      `The relevant service is: ${primaryOpp.relevantService === 'none' ? 'a tailored digital solution' : primaryOpp.relevantService}. ` +
      `The likely business benefit is: ${primaryOpp.expectedImpact.join('; ') || 'improved online performance'}. ` +
      `Confidence: ${primaryOpp.confidence}.`;

    return {
      howWeCanHelpSummary,
      opportunities,
      serviceMapping,
      prioritization,
      decisionMaker,
      angles,
      qualification,
      strategyVersion: 2,
    };
  } catch (err) {
    console.error('[ProspectPipeline] Strategy AI pass failed, using deterministic fallback:', err);
    return fallbackStrategy(lead, research, gaps, match);
  }
}
