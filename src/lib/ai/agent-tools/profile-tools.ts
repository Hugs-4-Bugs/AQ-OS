// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Profile / Company Profile Tools (Phase 26 v2)
// ═══════════════════════════════════════════════════════════════════

import { registerTool } from './registry';
import { type ToolContext, type ToolResult } from './types';

// ─── profile.lookup ──────────────────────────────────────────────────

registerTool({
  name: 'profile.lookup',
  description: 'Look up the authenticated user\'s profile (name, email, phone, country, company, avatar). Read-only.',
  category: 'profile',
  readOnly: true,
  idempotent: true,
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {},
    required: [],
  },
  outputSchema: {
    type: 'object',
    properties: {
      profile: { type: 'object', description: 'User profile record.' },
    },
  },
  async execute(_input: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const { db } = await import('@/lib/db');
    const user = await db.user.findUnique({
      where: { id: ctx.userId },
      select: {
        name: true, email: true, phone: true, country: true,
        company: true, avatar: true, bio: true,
        settings: { select: { companyName: true } },
      },
    });
    if (!user) {
      return {
        status: 'not_found',
        toolInvocationId: '',
        durationMs: 0,
        error: 'User not found',
      };
    }
    return {
      status: 'success',
      toolInvocationId: '',
      durationMs: 0,
      output: {
        profile: {
          name: user.name,
          email: user.email,
          phone: user.phone,
          country: user.country,
          company: user.settings?.companyName ?? user.company,
          avatar: user.avatar,
          bio: user.bio,
        },
      },
    };
  },
});

// ─── company.profile.lookup ──────────────────────────────────────────

registerTool({
  name: 'company.profile.lookup',
  description: 'Look up the authenticated user\'s active business profile (used as the sender identity in outreach). Read-only.',
  category: 'profile',
  readOnly: true,
  idempotent: true,
  requiredFeature: 'business_profiles',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      profileId: { type: 'string', description: 'Optional. Specific business profile ID. If omitted, returns the default/first active profile.' },
    },
    required: [],
  },
  outputSchema: {
    type: 'object',
    properties: {
      businessProfile: { type: 'object', description: 'Active business profile (or null).' },
    },
  },
  async execute(input: { profileId?: string }, ctx: ToolContext): Promise<ToolResult> {
    const { db } = await import('@/lib/db');
    const where: Record<string, unknown> = {
      userId: ctx.userId,
      status: 'active',
    };
    if (input.profileId) where.id = input.profileId;
    const profile = await db.businessProfile.findFirst({
      where,
      select: {
        id: true, name: true, description: true, website: true,
        email: true, phone: true, address: true,
        offerSummary: true, isDefault: true,
      },
    });
    if (!profile) {
      return {
        status: 'not_found',
        toolInvocationId: '',
        durationMs: 0,
        error: 'No active business profile found for this user',
      };
    }
    return {
      status: 'success',
      toolInvocationId: '',
      durationMs: 0,
      output: { businessProfile: profile },
    };
  },
});
