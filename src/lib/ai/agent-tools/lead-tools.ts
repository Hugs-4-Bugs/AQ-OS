// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Lead Tools (Phase 26 v2 agent tool layer)
//
// Approved AI agent tools for lead lookup / create / update / enrich.
// All tools enforce user-ownership: queries always filter by
// ctx.userId. Inputs are schema-validated. Outputs are sanitized
// (no internal IDs leak unless the caller already owns them).
// ═══════════════════════════════════════════════════════════════════

import { registerTool } from './registry';
import { type ToolContext, type ToolResult } from './types';

// ─── lead.lookup ─────────────────────────────────────────────────────

registerTool({
  name: 'lead.lookup',
  description: 'Look up a lead owned by the authenticated user by ID or email. Returns lead fields (businessName, website, email, phone, city, country, niche, replyScore).',
  category: 'lead',
  readOnly: true,
  idempotent: true,
  requiredFeature: 'lead_discovery',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      leadId: { type: 'string', description: 'Lead ID (CUID). Either leadId or email is required.' },
      email: { type: 'string', description: 'Lead email. Either leadId or email is required.' },
    },
    required: [],
  },
  outputSchema: {
    type: 'object',
    properties: {
      lead: { type: 'object', description: 'Lead record (null if not found).' },
    },
  },
  async execute(input: { leadId?: string; email?: string }, ctx: ToolContext): Promise<ToolResult> {
    const { db } = await import('@/lib/db');
    const where: Record<string, unknown> = { userId: ctx.userId };
    if (input.leadId) where.id = input.leadId;
    else if (input.email) where.email = input.email.toLowerCase().trim();
    else {
      return {
        status: 'validation_error',
        toolInvocationId: '',
        durationMs: 0,
        error: 'Either leadId or email is required',
      };
    }
    const lead = await db.lead.findFirst({
      where,
      select: {
        id: true, businessName: true, website: true, email: true, phone: true,
        city: true, country: true, niche: true, replyScore: true,
        estimatedQuality: true, estimatedRevenue: true, ownerName: true,
        linkedin: true, instagram: true, facebook: true,
      },
    });
    if (!lead) {
      return {
        status: 'not_found',
        toolInvocationId: '',
        durationMs: 0,
        error: 'Lead not found for this user',
      };
    }
    return {
      status: 'success',
      toolInvocationId: '',
      durationMs: 0,
      output: { lead },
    };
  },
});

// ─── lead.create ─────────────────────────────────────────────────────

registerTool({
  name: 'lead.create',
  description: 'Create a new lead owned by the authenticated user. Required: businessName + niche. Optional: website, email, phone, city, country, ownerName. Idempotent (idempotencyKey deduplicates).',
  category: 'lead',
  readOnly: false,
  idempotent: true,
  requiredFeature: 'lead_discovery',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      businessName: { type: 'string', description: 'Required. Business name.' },
      niche: { type: 'string', description: 'Required. Niche / industry category.' },
      website: { type: 'string', description: 'Optional. Website URL.' },
      email: { type: 'string', description: 'Optional. Contact email.' },
      phone: { type: 'string', description: 'Optional. Contact phone.' },
      city: { type: 'string', description: 'Optional. City.' },
      country: { type: 'string', description: 'Optional. Country.' },
      ownerName: { type: 'string', description: 'Optional. Owner / contact name.' },
    },
    required: ['businessName', 'niche'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      leadId: { type: 'string', description: 'New lead ID.' },
      created: { type: 'boolean', description: 'Whether a new record was created (false if from idempotency cache).' },
    },
  },
  async execute(input: {
    businessName: string; niche: string; website?: string; email?: string;
    phone?: string; city?: string; country?: string; ownerName?: string;
  }, ctx: ToolContext): Promise<ToolResult> {
    const { db } = await import('@/lib/db');
    const lead = await db.lead.create({
      data: {
        userId: ctx.userId,
        orgId: ctx.orgId || null,
        businessName: input.businessName.trim(),
        niche: input.niche.trim(),
        website: input.website?.trim() || null,
        email: input.email?.toLowerCase().trim() || null,
        phone: input.phone?.trim() || null,
        city: input.city?.trim() || null,
        country: input.country?.trim() || null,
        ownerName: input.ownerName?.trim() || null,
      },
      select: { id: true },
    });

    // Workstream D — emit 'new_lead' event for autonomous continuation
    // (handleNewLeadEvent → continuePipelineForLead → Discovery agent).
    import('@/lib/ai/agent-event-dispatcher').then(({ notifyLeadCreated }) =>
      notifyLeadCreated(ctx.userId, lead.id, 'agent-tool').catch(() => {})
    ).catch(() => {});

    return {
      status: 'success',
      toolInvocationId: '',
      durationMs: 0,
      output: { leadId: lead.id, created: true },
    };
  },
});

// ─── lead.update ──────────────────────────────────────────────────────

registerTool({
  name: 'lead.update',
  description: 'Update fields on a lead owned by the authenticated user. Required: leadId + at least one updatable field. NOT idempotent at row level — caller must provide idempotencyKey for retry-safe calls.',
  category: 'lead',
  readOnly: false,
  idempotent: true,
  requiredFeature: 'lead_discovery',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      leadId: { type: 'string', description: 'Required. Lead ID to update.' },
      replyScore: { type: 'number', description: 'Optional. Reply score 0-100.' },
      estimatedQuality: { type: 'string', description: 'Optional. low|medium|high.', enum: ['low', 'medium', 'high'] },
      ownerName: { type: 'string', description: 'Optional. Owner / contact name.' },
      email: { type: 'string', description: 'Optional. Contact email.' },
      phone: { type: 'string', description: 'Optional. Contact phone.' },
    },
    required: ['leadId'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      updated: { type: 'boolean', description: 'Whether the row was updated.' },
    },
  },
  async execute(input: {
    leadId: string; replyScore?: number; estimatedQuality?: string;
    ownerName?: string; email?: string; phone?: string;
  }, ctx: ToolContext): Promise<ToolResult> {
    const { db } = await import('@/lib/db');
    const data: Record<string, unknown> = {};
    if (input.replyScore !== undefined) data.replyScore = input.replyScore;
    if (input.estimatedQuality) data.estimatedQuality = input.estimatedQuality;
    if (input.ownerName !== undefined) data.ownerName = input.ownerName;
    if (input.email !== undefined) data.email = input.email.toLowerCase().trim();
    if (input.phone !== undefined) data.phone = input.phone.trim();
    if (Object.keys(data).length === 0) {
      return {
        status: 'validation_error',
        toolInvocationId: '',
        durationMs: 0,
        error: 'No updatable fields provided',
      };
    }
    // Ownership check: only update rows owned by ctx.userId.
    const updated = await db.lead.updateMany({
      where: { id: input.leadId, userId: ctx.userId },
      data,
    });
    if (updated.count === 0) {
      return {
        status: 'not_found',
        toolInvocationId: '',
        durationMs: 0,
        error: 'Lead not found or not owned by caller',
      };
    }
    return {
      status: 'success',
      toolInvocationId: '',
      durationMs: 0,
      output: { updated: true },
    };
  },
});

// ─── lead.enrich ─────────────────────────────────────────────────────

registerTool({
  name: 'lead.enrich',
  description: 'Enrich a lead with additional fields (linkedin, instagram, facebook, rating, reviews). Required: leadId. Ownership enforced.',
  category: 'lead',
  readOnly: false,
  idempotent: true,
  requiredFeature: 'deep_analysis',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      leadId: { type: 'string', description: 'Required. Lead ID to enrich.' },
      linkedin: { type: 'string', description: 'Optional. LinkedIn URL.' },
      instagram: { type: 'string', description: 'Optional. Instagram handle.' },
      facebook: { type: 'string', description: 'Optional. Facebook URL.' },
      rating: { type: 'number', description: 'Optional. Rating 0-5.' },
      reviews: { type: 'string', description: 'Optional. Reviews summary.' },
    },
    required: ['leadId'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      enriched: { type: 'boolean', description: 'Whether enrichment fields were applied.' },
    },
  },
  async execute(input: {
    leadId: string; linkedin?: string; instagram?: string; facebook?: string;
    rating?: number; reviews?: string;
  }, ctx: ToolContext): Promise<ToolResult> {
    const { db } = await import('@/lib/db');
    const data: Record<string, unknown> = {};
    if (input.linkedin !== undefined) data.linkedin = input.linkedin.trim();
    if (input.instagram !== undefined) data.instagram = input.instagram.trim();
    if (input.facebook !== undefined) data.facebook = input.facebook.trim();
    if (input.rating !== undefined) data.rating = input.rating;
    if (input.reviews !== undefined) data.reviews = input.reviews;
    if (Object.keys(data).length === 0) {
      return {
        status: 'validation_error',
        toolInvocationId: '',
        durationMs: 0,
        error: 'No enrichment fields provided',
      };
    }
    const updated = await db.lead.updateMany({
      where: { id: input.leadId, userId: ctx.userId },
      data,
    });
    if (updated.count === 0) {
      return {
        status: 'not_found',
        toolInvocationId: '',
        durationMs: 0,
        error: 'Lead not found or not owned by caller',
      };
    }
    return {
      status: 'success',
      toolInvocationId: '',
      durationMs: 0,
      output: { enriched: true },
    };
  },
});
