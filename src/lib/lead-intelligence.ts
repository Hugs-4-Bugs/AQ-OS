// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Per-Lead Personalized Intelligence (Phases 14–17)
//
// ONE composer that builds a STRUCTURED, LEAD-SPECIFIC context from:
//   • the user's Business Profile (precedence-resolved),
//   • the user's My Context (UserSettings.personalContext),
//   • the user's My Offer (UserSettings.servicesOffered),
//   • the lead's ACTUAL business, niche, geography and lead-specific
//     signals (rating, reviews, website, source, notes, analysis).
//
// DESIGN RULES:
//   • Lead-specific: the composed context ALWAYS differs across leads
//     whose business/niche/geography/signals differ — one generic block
//     reused for 1,000 leads is exactly what this module exists to
//     prevent. Every lead's data lands in BOTH the structured object
//     and the prompt block.
//   • Precedence hierarchy (Phase 17, REQUIRED):
//       1. explicitly supplied execution settings  (highest)
//       2. workflow / campaign overrides
//       3. business-profile defaults                (broadest)
//     More specific execution configuration overrides broader defaults.
//   • No destructive mutation: the lead record is READ, never rewritten;
//     profile selection never mutates the saved profile.
//   • Owner-scoped: every profile lookup is scoped to the executing user;
//     foreign profile IDs are ignored (fall back) rather than leaking.
//   • Null-safe: a user with no profile / context / offer still gets a
//     valid (lead-only) intelligence object; nothing throws.
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { parsePersonalContext, type PersonalContext } from '@/lib/personal-context';
import { parseOfferServices } from '@/lib/prospecting/pipeline';

// ===== TYPES =====

/** The subset of BusinessProfile consumed by personalization. */
export interface ResolvedBusinessProfile {
  id: string;
  name: string;
  industry?: string | null;
  description?: string | null;
  productsServices?: string | null;
  offers?: string | null;
  valueProposition?: string | null;
  targetAudience?: string | null;
  targetIndustries?: string | null;
  geographicMarket?: string | null;
  painPoints?: string | null;
  differentiators?: string | null;
  proofPoints?: string | null;
  preferredTone?: string | null;
  preferredLanguage?: string | null;
  cta?: string | null;
  customInstructions?: string | null;
  outreachPreferences?: string | null;
}

/** Where the resolved profile came from (explainability + tests). */
export type ProfileResolutionSource =
  | 'execution-setting' // explicit run-level override (highest)
  | 'workflow' // the workflow's own profileId
  | 'default' // user's explicit default (isDefault) or deterministic fallback
  | 'none'; // no profile exists for this user

export interface ProfileResolution {
  profile: ResolvedBusinessProfile | null;
  source: ProfileResolutionSource;
}

/** One item of the user's My Offer (servicesOffered). */
export interface OfferServiceItem {
  id: string;
  label: string;
  category: string;
  description: string;
}

/** Lead-side facts — READ from the lead, never mutated. */
export interface LeadFacts {
  id: string;
  businessName: string;
  niche?: string | null;
  city?: string | null;
  country?: string | null;
  website?: string | null;
  rating?: number | null;
  reviews?: string | null;
  notes?: string | null;
  source?: string | null;
  stage?: string | null;
}

/** The structured per-lead intelligence consumed by execution. */
export interface LeadIntelligence {
  /** Snapshotted at composition time — historical runs never rewrite. */
  composedAt: string;
  leadId: string;
  lead: {
    businessName: string;
    niche: string | null;
    geography: string | null;
    website: string | null;
    signals: string[];
    stage: string | null;
  };
  businessProfile: {
    id: string;
    name: string;
    source: ProfileResolutionSource;
    industry: string | null;
    description: string | null;
    services: string | null;
    offer: string | null;
    valueProposition: string | null;
    targetCustomer: string | null;
    geographicMarket: string | null;
    painPointsAddressed: string | null;
    differentiators: string | null;
    proofPoints: string | null;
    preferredTone: string | null;
    preferredLanguage: string | null;
    cta: string | null;
    customInstructions: string | null;
    outreachPreferences: string | null;
  } | null;
  myContext: PersonalContext;
  myOffer: OfferServiceItem[];
  /** Effective outreach defaults AFTER precedence resolution. */
  effective: {
    tone: string | null;
    language: string | null;
    cta: string | null;
  };
}

// ===== PROFILE RESOLUTION (precedence: execution > workflow > default) =====

const PROFILE_SELECT = {
  id: true, name: true, industry: true, description: true, productsServices: true,
  offers: true, valueProposition: true, targetAudience: true, targetIndustries: true,
  geographicMarket: true, painPoints: true, differentiators: true, proofPoints: true,
  preferredTone: true, preferredLanguage: true, cta: true, customInstructions: true,
  outreachPreferences: true, status: true, isDefault: true, createdAt: true,
} as const;

/**
 * Resolve the business profile for a run, honoring the REQUIRED hierarchy:
 * explicitly supplied execution settings → workflow/campaign override →
 * the user's deterministic default. Owner-scoped everywhere: a foreign
 * profile id is dropped (falls through to the next tier) instead of read.
 */
export async function resolveBusinessProfileForUser(
  userId: string,
  options: {
    /** Highest precedence: run-level profile selection. */
    explicitProfileId?: string | null;
    /** Workflow's own profileId (WorkflowDefinition.profileId). */
    workflowProfileId?: string | null;
  } = {}
): Promise<ProfileResolution> {
  // Tier 1 — explicit execution setting.
  if (options.explicitProfileId) {
    const p = await db.businessProfile.findFirst({
      where: { id: options.explicitProfileId, userId, status: 'active' },
      select: PROFILE_SELECT,
    });
    if (p) return { profile: p, source: 'execution-setting' };
  }
  // Tier 2 — workflow / campaign override.
  if (options.workflowProfileId) {
    const p = await db.businessProfile.findFirst({
      where: { id: options.workflowProfileId, userId, status: 'active' },
      select: PROFILE_SELECT,
    });
    if (p) return { profile: p, source: 'workflow' };
  }
  // Tier 3 — explicit default flag, else deterministic earliest active.
  const flagged = await db.businessProfile.findFirst({
    where: { userId, status: 'active', isDefault: true },
    select: PROFILE_SELECT,
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
  if (flagged) return { profile: flagged, source: 'default' };
  const earliest = await db.businessProfile.findFirst({
    where: { userId, status: 'active' },
    select: PROFILE_SELECT,
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
  if (earliest) return { profile: earliest, source: 'default' };
  return { profile: null, source: 'none' };
}

// ===== LEAD FACTS =====

/** Read a lead's personalization facts (owner-scoped; never mutates). */
export async function loadLeadFacts(userId: string, leadId: string): Promise<LeadFacts | null> {
  const lead = await db.lead.findFirst({
    where: { id: leadId, userId },
    select: {
      id: true, businessName: true, niche: true, city: true, country: true,
      website: true, rating: true, reviews: true, notes: true, source: true, stage: true,
    },
  });
  return lead ?? null;
}

/** Distill a lead's specific signals (what makes THIS lead different). */
function leadSignals(lead: LeadFacts): string[] {
  const signals: string[] = [];
  if (lead.rating != null && Number.isFinite(Number(lead.rating))) {
    signals.push(`Rating ${Number(lead.rating)}${lead.reviews ? ` (${String(lead.reviews).slice(0, 60)})` : ''}`);
  } else if (lead.reviews) {
    signals.push(`Reviews: ${String(lead.reviews).slice(0, 80)}`);
  }
  if (lead.website) signals.push(`Website: ${String(lead.website).slice(0, 120)}`);
  if (lead.notes) signals.push(`Notes: ${String(lead.notes).slice(0, 200)}`);
  if (lead.source) signals.push(`Found via ${String(lead.source)}`);
  return signals;
}

function leadGeography(lead: LeadFacts): string | null {
  const parts = [lead.city, lead.country].filter((v) => v && String(v).trim());
  return parts.length > 0 ? parts.join(', ') : null;
}

// ===== INTELLIGENCE COMPOSITION =====

export interface BuildLeadIntelligenceOptions {
  /** Highest-precedence profile id (explicit execution settings). */
  explicitProfileId?: string | null;
  /** Workflow's own profileId (already loaded by the caller usually). */
  workflowProfileId?: string | null;
  /** Pre-resolved profile (caller-managed precedence; skips resolution). */
  resolvedProfile?: ProfileResolution;
}

/**
 * Build the structured per-lead intelligence. Every lead gets its OWN
 * composed object — the lead's business, niche, geography and signals are
 * embedded, so two leads with different data can never share a context.
 */
export async function buildLeadIntelligence(
  userId: string,
  lead: LeadFacts,
  options: BuildLeadIntelligenceOptions = {}
): Promise<LeadIntelligence> {
  const resolution: ProfileResolution = options.resolvedProfile
    ?? (await resolveBusinessProfileForUser(userId, {
        explicitProfileId: options.explicitProfileId ?? null,
        workflowProfileId: options.workflowProfileId ?? null,
      }));

  const settings = await db.userSettings.findUnique({
    where: { userId },
    select: { personalContext: true, servicesOffered: true },
  }).catch(() => null);

  const myContext = settings?.personalContext
    ? parsePersonalContext(settings.personalContext)
    : {};
  const myOffer = settings?.servicesOffered
    ? parseOfferServices(settings.servicesOffered)
    : [];

  const p = resolution.profile;
  const intelligence: LeadIntelligence = {
    composedAt: new Date().toISOString(),
    leadId: lead.id,
    lead: {
      businessName: lead.businessName,
      niche: lead.niche ? String(lead.niche) : null,
      geography: leadGeography(lead),
      website: lead.website ? String(lead.website) : null,
      signals: leadSignals(lead),
      stage: lead.stage ? String(lead.stage) : null,
    },
    businessProfile: p
      ? {
          id: p.id,
          name: p.name,
          source: resolution.source,
          industry: p.industry ?? null,
          description: p.description ?? null,
          services: p.productsServices ?? null,
          offer: p.offers ?? null,
          valueProposition: p.valueProposition ?? null,
          targetCustomer: p.targetAudience ?? null,
          geographicMarket: p.geographicMarket ?? null,
          painPointsAddressed: p.painPoints ?? null,
          differentiators: p.differentiators ?? null,
          proofPoints: p.proofPoints ?? null,
          preferredTone: p.preferredTone ?? null,
          preferredLanguage: p.preferredLanguage ?? null,
          cta: p.cta ?? null,
          customInstructions: p.customInstructions ?? null,
          outreachPreferences: p.outreachPreferences ?? null,
        }
      : null,
    myContext,
    myOffer,
    // Effective defaults start from the profile (broadest tier); the
    // workflow / execution tiers are applied by resolveEffectiveSettings.
    effective: {
      tone: p?.preferredTone ?? null,
      language: p?.preferredLanguage ?? null,
      cta: p?.cta ?? null,
    },
  };
  return intelligence;
}

// ===== PRECEDENCE RESOLUTION (Phase 17 REQUIRED hierarchy) =====

/**
 * Apply the REQUIRED precedence: business-profile defaults →
 * workflow/campaign overrides → explicitly supplied execution settings.
 * First defined value wins from the most specific tier down.
 */
export function resolveEffectiveSettings<
  T extends Record<string, unknown>,
  W extends Record<string, unknown>,
  E extends Record<string, unknown>,
>(keys: readonly string[], profileDefaults: T, workflowOverrides?: W | null, executionSettings?: E | null): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of keys) {
    const exec = executionSettings?.[key];
    const wf = workflowOverrides?.[key];
    const prof = profileDefaults?.[key];
    const winner = [exec, wf, prof].find(
      (v) => typeof v === 'string' && v.trim().length > 0
    );
    if (typeof winner === 'string') out[key] = winner.trim();
  }
  return out;
}

/** Keys the outreach path resolves through the hierarchy. */
export const OUTREACH_SETTING_KEYS = ['tone', 'language', 'cta', 'channel', 'style'] as const;

// ===== PROMPT BLOCK =====

function fmt(label: string, value: string | null | undefined, cap = 300): string | null {
  if (!value || !String(value).trim()) return null;
  return `${label}: ${String(value).trim().slice(0, cap)}`;
}

/**
 * Render the per-lead intelligence as the personalization block AI
 * outreach / analysis prompts append. The block is BUILT FROM THE LEAD'S
 * OWN DATA — different leads with different data produce materially
 * different blocks (that is the point).
 */
export function buildLeadIntelligenceBlock(intel: LeadIntelligence): string {
  const lines: string[] = [];
  const L = intel.lead;

  // ── Lead-specific facts (ALWAYS present — this is the per-lead floor) ──
  lines.push('── TARGET LEAD (use these specifics; do not invent others) ──');
  lines.push(`Lead business: ${L.businessName}`);
  if (L.niche) lines.push(`Lead niche: ${L.niche}`);
  if (L.geography) lines.push(`Lead location: ${L.geography}`);
  if (L.website) lines.push(`Lead website: ${L.website.slice(0, 120)}`);
  if (L.stage) lines.push(`Pipeline stage: ${L.stage}`);
  if (L.signals.length > 0) {
    lines.push('Lead-specific signals:');
    for (const s of L.signals) lines.push(`  - ${s}`);
  }

  // ── User's business profile (who is reaching out and why it fits) ──
  const p = intel.businessProfile;
  if (p) {
    lines.push('── YOUR BUSINESS (from the sender\'s saved business profile) ──');
    const pBits = [
      fmt('Profile', p.name, 120),
      fmt('Industry', p.industry, 120),
      fmt('Business description', p.description ?? p.name, 300),
      fmt('Services', p.services, 300),
      fmt('Current offer', p.offer, 200),
      fmt('Value proposition', p.valueProposition, 200),
      fmt('Target customer', p.targetCustomer, 200),
      fmt('Geographic market', p.geographicMarket, 120),
      fmt('Pain points addressed', p.painPointsAddressed, 200),
      fmt('Differentiators', p.differentiators, 200),
      fmt('Proof points', p.proofPoints, 200),
    ].filter((v): v is string => v !== null);
    lines.push(...pBits);
  }

  // ── My Context (the sender's own self-description) ──
  const c = intel.myContext;
  const cBits = [
    fmt('What the sender does', c.whatYouDo, 200),
    fmt('Sender services', c.services, 250),
    fmt('Sender expertise', c.expertise, 150),
    fmt('Sender goals', c.goals, 150),
    fmt('Sender positioning', c.positioning, 150),
    fmt('Sender target audience', c.targetAudience, 150),
  ].filter((v): v is string => v !== null);
  if (cBits.length > 0) {
    lines.push('── ABOUT THE SENDER (My Context) ──');
    lines.push(...cBits);
  }

  // ── My Offer (what the sender is selling to THIS lead) ──
  if (intel.myOffer.length > 0) {
    lines.push('── SENDER\'S OFFER (pick the ONE most relevant to this lead\'s niche/signals) ──');
    for (const svc of intel.myOffer.slice(0, 8)) {
      const bits = [svc.label, svc.category && svc.category !== 'general' ? `(${svc.category})` : '', svc.description]
        .filter((v) => v && String(v).trim());
      if (bits.length > 0) lines.push(`  - ${bits.join(' — ').slice(0, 250)}`);
    }
  }

  // ── Effective settings after precedence (profile < workflow < execution) ──
  if (intel.effective.tone || intel.effective.language || intel.effective.cta) {
    lines.push('── EFFECTIVE OUTREACH SETTINGS ──');
    const sBits = [
      fmt('Tone', intel.effective.tone, 60),
      fmt('Language', intel.effective.language, 60),
      fmt('Call to action', intel.effective.cta, 200),
    ].filter((v): v is string => v !== null);
    lines.push(...sBits);
  }

  // ── Custom instructions (profile-level guidance) ──
  if (p?.customInstructions) {
    lines.push('── PROFILE CUSTOM INSTRUCTIONS (obey these) ──');
    lines.push(String(p.customInstructions).slice(0, 400));
  }
  if (p?.outreachPreferences) {
    lines.push('── OUTREACH PREFERENCES (obey these) ──');
    lines.push(String(p.outreachPreferences).slice(0, 300));
  }

  if (lines.length <= 1) return '';
  return `\n${lines.join('\n')}\n`;
}

// ===== CONVENIENCE (single await for call-sites) =====

/**
 * Load a lead + compose its intelligence in one call. Owner-scoped:
 * a foreign lead id returns null (callers report "lead not found").
 */
export async function composeLeadIntelligence(
  userId: string,
  leadId: string,
  options: BuildLeadIntelligenceOptions = {}
): Promise<LeadIntelligence | null> {
  const lead = await loadLeadFacts(userId, leadId);
  if (!lead) return null;
  return buildLeadIntelligence(userId, lead, options);
}

/**
 * Snapshot helper for discovery / execution records: the IMMUTABLE
 * point-in-time capture of the context a run used (Phase 15 requirement —
 * later profile edits must never rewrite historical snapshots).
 */
export function snapshotProfileForRun(intel: LeadIntelligence): Record<string, unknown> {
  return {
    snapshotAt: intel.composedAt,
    profileId: intel.businessProfile?.id ?? null,
    profileName: intel.businessProfile?.name ?? null,
    profileSource: intel.businessProfile?.source ?? 'none',
    effective: { ...intel.effective },
  };
}
