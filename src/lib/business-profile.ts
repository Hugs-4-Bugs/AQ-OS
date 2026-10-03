// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Business Profiles (client API + server-side context
// resolution)
//
// Two halves:
//  1. Client helpers (fetch/create/update/archive) used by the settings UI
//     and profile selectors.
//  2. The server-side resolver (`resolveBusinessContext`) lives in
//     ./business-profile-server (SERVER-ONLY — imports Prisma). It applies
//     the spec resolution order: profile defaults first, campaign overrides
//     win where provided, nothing cross-user or fabricated.
// ═══════════════════════════════════════════════════════════════════

import { apiCall } from './api-error-handler';

// ── Client-side type (serialized JSON shape from the API) ──────────
export interface BusinessProfile {
  id: string;
  label: string;
  companyName: string | null;
  industry: string | null;
  website: string | null;
  description: string | null;
  valueProposition: string | null;
  productsServices: Array<{ name: string; description?: string }>;
  targetAudience: { industries?: string[]; roles?: string[]; icp?: string };
  serviceAreas: string[];
  goals: string | null;
  toneStyle: string | null;
  language: string | null;
  differentiators: string[];
  preferredCta: string | null;
  additionalContext: string | null;
  isDefault: boolean;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export async function fetchBusinessProfiles(): Promise<BusinessProfile[]> {
  const data = await apiCall<{ profiles: BusinessProfile[] }>('/api/business-profiles', undefined, {
    errorMessage: 'Failed to load business profiles',
  });
  return data.profiles;
}

export async function createBusinessProfile(
  input: Partial<Omit<BusinessProfile, 'id' | 'createdAt' | 'updatedAt' | 'archivedAt'>>,
): Promise<BusinessProfile> {
  const data = await apiCall<{ profile: BusinessProfile }>('/api/business-profiles', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  }, { errorMessage: 'Failed to create business profile' });
  return data.profile;
}

export async function updateBusinessProfile(
  id: string,
  input: Partial<Omit<BusinessProfile, 'id' | 'createdAt' | 'updatedAt' | 'archivedAt'>>,
): Promise<BusinessProfile> {
  const data = await apiCall<{ profile: BusinessProfile }>(`/api/business-profiles/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  }, { errorMessage: 'Failed to update business profile' });
  return data.profile;
}

export async function archiveBusinessProfile(id: string): Promise<void> {
  await apiCall(`/api/business-profiles/${id}`, { method: 'DELETE' }, {
    errorMessage: 'Failed to archive business profile',
  });
}

// ── Campaign-specific overrides (spec §3) ──────────────────────────
export interface CampaignOverrides {
  /** What this specific campaign is trying to achieve. */
  objective?: string;
  /** Who to target in THIS campaign (may differ from the profile ICP). */
  audience?: string;
  /** The specific service/product/offer to promote in THIS campaign. */
  offer?: string;
  /** The desired outcome of the interaction with each lead. */
  outcome?: string;
  /** The call to action to use in THIS campaign. */
  cta?: string;
  /** Tone/language/message constraints for THIS campaign. */
  tone?: string;
  language?: string;
  /** Extra free-text instructions for THIS campaign. */
  instructions?: string;
}

// ── Server-side resolved context (what the AI actually receives) ───
export interface ResolvedBusinessContext {
  profileId: string | null;
  label: string;
  companyName: string;
  industry: string;
  website: string;
  description: string;
  valueProposition: string;
  productsServices: Array<{ name: string; description?: string }>;
  targetAudience: string; // human-readable one-liner for prompts
  serviceAreas: string;
  goals: string;
  tone: string;
  language: string;
  differentiators: string[];
  preferredCta: string;
  additionalContext: string;
  /** Human-readable list of what was overridden for this campaign. */
  overriddenFields: string[];
  /** Which parts came from the profile vs the campaign (for UX display). */
  sources: Record<string, 'profile' | 'campaign' | 'none'>;
}

function joinList(items: Array<{ name: string; description?: string }>): string {
  return items
    .map((s) => (s.description ? `${s.name} — ${s.description}` : s.name))
    .join('; ');
}

/**
 * Build the sender-business block injected into AI prompts (outreach,
 * research, discovery enrichment). Honest and evidence-first: empty fields
 * are omitted; the block explicitly tells the model what is unknown.
 */
export function buildBusinessContextBlock(ctx: ResolvedBusinessContext | null): string {
  if (!ctx || (!ctx.companyName && !ctx.description && ctx.productsServices.length === 0)) {
    return '';
  }

  const lines: string[] = [];
  lines.push('=== SENDER BUSINESS CONTEXT (who is reaching out) ===');
  if (ctx.companyName) lines.push(`Business name: ${ctx.companyName}`);
  if (ctx.industry) lines.push(`Industry: ${ctx.industry}`);
  if (ctx.website) lines.push(`Website: ${ctx.website}`);
  if (ctx.description) lines.push(`What they do: ${ctx.description}`);
  if (ctx.valueProposition) lines.push(`Value proposition: ${ctx.valueProposition}`);
  if (ctx.productsServices.length > 0) {
    lines.push(`Products/services offered: ${joinList(ctx.productsServices)}`);
  }
  if (ctx.targetAudience) lines.push(`Target customers: ${ctx.targetAudience}`);
  if (ctx.serviceAreas) lines.push(`Service areas: ${ctx.serviceAreas}`);
  if (ctx.goals) lines.push(`Campaign goal: ${ctx.goals}`);
  if (ctx.preferredCta) lines.push(`Preferred call to action: ${ctx.preferredCta}`);
  if (ctx.differentiators.length > 0) lines.push(`Differentiators/proof: ${ctx.differentiators.join('; ')}`);
  if (ctx.additionalContext) lines.push(`Additional sender instructions: ${ctx.additionalContext}`);
  if (ctx.overriddenFields.length > 0) {
    lines.push(`Campaign-specific overrides applied: ${ctx.overriddenFields.join(', ')}`);
  }
  lines.push(
    'Use ONLY this context to describe the sender. If a detail is not listed here, treat it as unknown — never invent products, results, statistics, or client relationships for the sender.',
  );
  return lines.join('\n');
}
