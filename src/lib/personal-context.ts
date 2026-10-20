// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — User Preference / Personal Business Context
//
// A DISTINCT user-context capability: a persistable self-description the
// user provides about THEMSELVES (what they do, their business/services,
// interests, expertise, goals, target audience, positioning, communication
// context). Consumed by AI features for personalization:
//   - AI workflow generation        (/api/workflows/ai-generate)
//   - Outreach message generation   (src/lib/ai/outreach-generator.ts)
//   - Lead analysis                 (/api/leads/[id]/analyze)
//   - Prospecting pipeline match    (src/lib/prospecting/pipeline-steps.ts)
//   - Discovery context selector    (/api/leads/discover — "business" mode)
//
// IMPORTANT: this is NOT the Business Profile system and NOT UserSettings
// servicesOffered (the Offer Profile). It is a separate, free-form
// self-description stored in UserSettings.personalContext (JSON string).
// Legacy rows (null/absent) are fully supported — all functions are
// null-safe and never throw.
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';

/** Structured personal-context fields (all optional). */
export interface PersonalContext {
  /** What the user does (one-liner, e.g. "I run a B2B SaaS agency"). */
  whatYouDo?: string;
  /** Business / service description. */
  business?: string;
  /** Products & services offered. */
  services?: string;
  /** Interests & focus areas. */
  interests?: string;
  /** Expertise & credentials. */
  expertise?: string;
  /** Acquisition / growth goals. */
  goals?: string;
  /** Ideal target audience / customer profile. */
  targetAudience?: string;
  /** Positioning & differentiators. */
  positioning?: string;
  /** Preferred communication style / context for outreach. */
  communicationContext?: string;
  /** Anything else the AI should know. */
  notes?: string;
}

/** Server-side length caps per field (defence in depth; UI mirrors these). */
export const PERSONAL_CONTEXT_FIELD_LIMITS: Record<keyof PersonalContext, number> = {
  whatYouDo: 300,
  business: 1000,
  services: 1000,
  interests: 500,
  expertise: 500,
  goals: 500,
  targetAudience: 500,
  positioning: 500,
  communicationContext: 500,
  notes: 1000,
};

export const PERSONAL_CONTEXT_FIELDS = Object.keys(
  PERSONAL_CONTEXT_FIELD_LIMITS
) as (keyof PersonalContext)[];

/** Parse a stored personalContext JSON string. Never throws. */
export function parsePersonalContext(raw: unknown): PersonalContext {
  if (!raw || typeof raw !== 'string') return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: PersonalContext = {};
    for (const field of PERSONAL_CONTEXT_FIELDS) {
      const value = (parsed as Record<string, unknown>)[field];
      if (typeof value === 'string' && value.trim()) {
        out[field] = value.trim().slice(0, PERSONAL_CONTEXT_FIELD_LIMITS[field]);
      }
    }
    return out;
  } catch {
    return {};
  }
}

/** Validate + sanitize an incoming personal-context object (route input). */
export function sanitizePersonalContext(input: unknown): {
  context: PersonalContext;
  errors: string[];
} {
  const errors: string[] = [];
  const context: PersonalContext = {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { context, errors: ['Personal context must be an object.'] };
  }
  const record = input as Record<string, unknown>;
  for (const field of PERSONAL_CONTEXT_FIELDS) {
    const value = record[field];
    if (value === undefined || value === null) continue;
    if (typeof value !== 'string') {
      errors.push(`"${field}" must be a string.`);
      continue;
    }
    const trimmed = value.trim();
    if (!trimmed) continue;
    const max = PERSONAL_CONTEXT_FIELD_LIMITS[field];
    if (trimmed.length > max) {
      errors.push(`"${field}" exceeds the maximum of ${max} characters.`);
      continue;
    }
    context[field] = trimmed;
  }
  return { context, errors };
}

/**
 * Build a compact AI-personalization block from a stored personal context.
 * Returns '' when nothing meaningful is stored, so call-sites can append it
 * to prompts unconditionally.
 */
export function buildPersonalContextBlock(context: PersonalContext | null | undefined): string {
  if (!context) return '';
  const labels: Record<keyof PersonalContext, string> = {
    whatYouDo: 'What the user does',
    business: 'User business',
    services: 'Products & services offered',
    interests: 'Interests & focus areas',
    expertise: 'Expertise',
    goals: 'Current goals',
    targetAudience: 'Target audience',
    positioning: 'Positioning & differentiators',
    communicationContext: 'Communication preferences',
    notes: 'Additional context',
  };
  const lines: string[] = [];
  for (const field of PERSONAL_CONTEXT_FIELDS) {
    const value = context[field];
    if (value) lines.push(`- ${labels[field]}: ${value}`);
  }
  if (lines.length === 0) return '';
  return [
    'ABOUT THE USER (self-provided personal/business context — use it to',
    'personalize output for THIS user; never invent facts beyond it):',
    ...lines,
  ].join('\n');
}

/**
 * Load the user's personal context and return it both parsed and as a ready
 * to append AI prompt block. Gracefully returns empty values on any failure
 * so AI flows never break because of personalization data.
 */
export async function loadPersonalContextForAi(
  userId: string
): Promise<{ context: PersonalContext; block: string }> {
  try {
    const settings = await db.userSettings.findUnique({
      where: { userId },
      select: { personalContext: true },
    });
    const context = parsePersonalContext(settings?.personalContext);
    return { context, block: buildPersonalContextBlock(context) };
  } catch {
    return { context: {}, block: '' };
  }
}

/**
 * Convenience wrapper: load the user's personal context and return ONLY the
 * ready-to-append prompt block ('' when nothing is stored or on failure).
 * Lets AI call-sites personalize with a single await.
 */
export async function buildPersonalContextBlockForUser(userId: string): Promise<string> {
  const { block } = await loadPersonalContextForAi(userId);
  return block;
}
