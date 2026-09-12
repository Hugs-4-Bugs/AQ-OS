// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Message Template Service
// Phase 10: Template management across all channels (Gmail, Telegram, WhatsApp)
//
// CRITICAL RULES:
// - NEVER skip org isolation — always filter by userId
// - NEVER skip audit logs for key actions
// - ALWAYS use pagination for list queries (default 20, max 100)
// - ALWAYS validate template variables before saving
// - ALWAYS encrypt sensitive data at rest (variables stored as JSON)
// - For AI template generation, use z-ai-web-dev-sdk
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { executeAICompletion } from '@/lib/ai/ai-provider';
import { deductAICredits, checkAICredits } from '@/lib/ai/credit-enforcement';

// ===== TYPES =====

export type TemplateChannel = 'email' | 'telegram' | 'whatsapp' | 'linkedin' | 'instagram';
export type TemplateCategory = 'outreach' | 'follow_up' | 'introduction' | 'reminder' | 'custom';

export interface TemplateFilters {
  channel?: TemplateChannel;
  category?: TemplateCategory;
  search?: string;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface TemplateUpdateData {
  name?: string;
  channel?: TemplateChannel;
  content?: string;
  category?: TemplateCategory;
  subject?: string;
  variables?: string[];
  isDefault?: boolean;
}

export interface TemplatePreviewResult {
  success: boolean;
  content: string;
  subject?: string;
  unresolvedVariables: string[];
  error?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  contentVariables: string[];
  declaredVariables: string[];
}

export interface AiTemplateResult {
  success: boolean;
  templateId?: string;
  content?: string;
  subject?: string;
  variables?: string[];
  creditsDeducted?: number;
  error?: string;
}

export interface WhatsappSyncResult {
  success: boolean;
  syncedCount?: number;
  newTemplates?: number;
  updatedTemplates?: number;
  error?: string;
}

// ===== CONSTANTS =====

const TEMPLATE_CATEGORIES: TemplateCategory[] = [
  'outreach',
  'follow_up',
  'introduction',
  'reminder',
  'custom',
];

const VARIABLE_PATTERN = /\{\{(\w+)\}\}/g;

const AI_TEMPLATE_CREDIT_COST = 2;

// ===== HELPER: ESCAPE REGEX SPECIAL CHARS =====

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ===== HELPER: PAGINATION =====

function normalizePagination(params?: PaginationParams): { skip: number; take: number; page: number; limit: number } {
  const page = Math.max(1, params?.page ?? 1);
  const limit = Math.min(100, Math.max(1, params?.limit ?? 20));
  const skip = (page - 1) * limit;
  return { skip, take: limit, page, limit };
}

// ===== HELPER: AUDIT LOG =====

async function logTemplateAudit(
  userId: string,
  action: string,
  metadata?: Record<string, unknown>,
  resourceId?: string
): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        userId,
        action,
        details: metadata ? JSON.stringify(metadata) : null,
        resource: 'message_template',
        resourceId: resourceId || null,
      },
    });
  } catch (error) {
    console.error('[MessageTemplate] Failed to log audit event:', error);
  }
}

// ===== 11. EXTRACT VARIABLES =====

/**
 * Extract {{variable}} patterns from content.
 * Returns unique variable names found in the content.
 */
export function extractVariables(content: string): string[] {
  const matches = Array.from(content.matchAll(VARIABLE_PATTERN));
  const variables = new Set<string>();

  for (const match of matches) {
    if (match[1]) {
      variables.add(match[1]);
    }
  }

  return Array.from(variables);
}

// ===== 9. VALIDATE TEMPLATE =====

/**
 * Validate that all variables in content are declared.
 * Returns validation result with errors and warnings.
 */
export function validateTemplate(content: string, variables: string[]): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!content || content.trim().length === 0) {
    return {
      valid: false,
      errors: ['Template content cannot be empty'],
      warnings: [],
      contentVariables: [],
      declaredVariables: variables,
    };
  }

  const contentVariables = extractVariables(content);
  const declaredSet = new Set(variables);

  // Check for undeclared variables in content
  const undeclared = contentVariables.filter((v) => !declaredSet.has(v));
  if (undeclared.length > 0) {
    errors.push(
      `Content contains undeclared variables: ${undeclared.map((v) => `{{${v}}}`).join(', ')}. Add them to the variables list.`
    );
  }

  // Check for declared variables not used in content (warning only)
  const unused = variables.filter((v) => !contentVariables.includes(v));
  if (unused.length > 0) {
    warnings.push(
      `Declared variables not used in content: ${unused.map((v) => `{{${v}}}`).join(', ')}. Consider removing them.`
    );
  }

  // Check for empty variable names
  const emptyVars = variables.filter((v) => !v || v.trim().length === 0);
  if (emptyVars.length > 0) {
    errors.push('Variable names cannot be empty');
  }

  // Check for invalid variable name characters
  const invalidVars = variables.filter((v) => !/^\w+$/.test(v));
  if (invalidVars.length > 0) {
    errors.push(
      `Invalid variable names: ${invalidVars.join(', ')}. Variable names must contain only letters, numbers, and underscores.`
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    contentVariables,
    declaredVariables: variables,
  };
}

// ===== 1. CREATE TEMPLATE =====

/**
 * Create a new message template.
 * Validates template variables before saving.
 */
export async function createTemplate(
  userId: string,
  name: string,
  channel: TemplateChannel,
  content: string,
  category?: TemplateCategory,
  subject?: string,
  variables?: string[]
): Promise<{
  success: boolean;
  templateId?: string;
  error?: string;
  validation?: ValidationResult;
}> {
  // Validate inputs
  if (!name || name.trim().length === 0) {
    return { success: false, error: 'Template name is required' };
  }

  if (!content || content.trim().length === 0) {
    return { success: false, error: 'Template content is required' };
  }

  // Extract variables from content if not provided
  const extractedVars = extractVariables(content);
  const finalVariables = variables || extractedVars;

  // Validate template variables
  const validation = validateTemplate(content, finalVariables);
  if (!validation.valid) {
    return {
      success: false,
      error: 'Template validation failed',
      validation,
    };
  }

  // Check for duplicate name within user scope
  const existing = await db.messageTemplate.findFirst({
    where: { userId, name: name.trim() },
  });

  if (existing) {
    return { success: false, error: 'A template with this name already exists' };
  }

  try {
    const template = await db.messageTemplate.create({
      data: {
        userId,
        name: name.trim(),
        channel,
        content,
        category: category || null,
        subject: subject || null,
        variables: JSON.stringify(finalVariables),
        isAiGenerated: false,
        isDefault: false,
        usageCount: 0,
      },
    });

    await logTemplateAudit(userId, 'template_created', {
      templateId: template.id,
      name,
      channel,
      category,
      variableCount: finalVariables.length,
    }, template.id);

    return { success: true, templateId: template.id, validation };
  } catch (error) {
    console.error('[MessageTemplate] Failed to create template:', error);
    return { success: false, error: 'Failed to create template' };
  }
}

// ===== 2. UPDATE TEMPLATE =====

/**
 * Update an existing template.
 * Re-validates variables if content changes.
 */
export async function updateTemplate(
  templateId: string,
  userId: string,
  updates: TemplateUpdateData
): Promise<{
  success: boolean;
  validation?: ValidationResult;
  error?: string;
}> {
  // Verify ownership
  const existing = await db.messageTemplate.findUnique({
    where: { id: templateId },
  });

  if (!existing || existing.userId !== userId) {
    return { success: false, error: 'Template not found or access denied' };
  }

  // If content is being updated, validate variables
  if (updates.content !== undefined) {
    const newContent = updates.content;
    const newVariables = updates.variables || extractVariables(newContent);
    const validation = validateTemplate(newContent, newVariables);

    if (!validation.valid) {
      return {
        success: false,
        error: 'Template validation failed',
        validation,
      };
    }

    // Include the resolved variables in updates
    updates.variables = newVariables;
  } else if (updates.variables !== undefined) {
    // Variables changed but content didn't — validate against existing content
    const validation = validateTemplate(existing.content ?? '', updates.variables);
    if (!validation.valid) {
      return {
        success: false,
        error: 'Template validation failed',
        validation,
      };
    }
  }

  try {
    const updateData: Record<string, unknown> = {};

    if (updates.name !== undefined) updateData.name = updates.name.trim();
    if (updates.channel !== undefined) updateData.channel = updates.channel;
    if (updates.content !== undefined) updateData.content = updates.content;
    if (updates.category !== undefined) updateData.category = updates.category;
    if (updates.subject !== undefined) updateData.subject = updates.subject;
    if (updates.variables !== undefined) updateData.variables = JSON.stringify(updates.variables);
    if (updates.isDefault !== undefined) updateData.isDefault = updates.isDefault;

    await db.messageTemplate.update({
      where: { id: templateId },
      data: updateData,
    });

    await logTemplateAudit(userId, 'template_updated', {
      templateId,
      updatedFields: Object.keys(updates),
    }, templateId);

    return { success: true };
  } catch (error) {
    console.error('[MessageTemplate] Failed to update template:', error);
    return { success: false, error: 'Failed to update template' };
  }
}

// ===== 3. DELETE TEMPLATE =====

/**
 * Delete a template.
 * Validates ownership before deletion.
 */
export async function deleteTemplate(
  templateId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  const existing = await db.messageTemplate.findUnique({
    where: { id: templateId },
  });

  if (!existing || existing.userId !== userId) {
    return { success: false, error: 'Template not found or access denied' };
  }

  if (existing.isDefault) {
    return { success: false, error: 'Cannot delete default templates' };
  }

  try {
    await db.messageTemplate.delete({
      where: { id: templateId },
    });

    await logTemplateAudit(userId, 'template_deleted', {
      templateId,
      name: existing.name,
      channel: existing.channel,
    }, templateId);

    return { success: true };
  } catch (error) {
    console.error('[MessageTemplate] Failed to delete template:', error);
    return { success: false, error: 'Failed to delete template' };
  }
}

// ===== 4. GET TEMPLATES =====

/**
 * List templates with filters and pagination.
 * Org isolation: always filters by userId.
 */
export async function getTemplates(
  userId: string,
  filters?: TemplateFilters,
  pagination?: PaginationParams
): Promise<PaginatedResult<{
  id: string;
  name: string;
  channel: string;
  category: string | null;
  subject: string | null;
  content: string;
  variables: string;
  isAiGenerated: boolean;
  isDefault: boolean;
  usageCount: number;
  lastUsedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}>> {
  const { skip, take, page, limit } = normalizePagination(pagination);

  const where: Record<string, unknown> = { userId };

  if (filters?.channel) {
    where.channel = filters.channel;
  }

  if (filters?.category) {
    where.category = filters.category;
  }

  if (filters?.search) {
    where.OR = [
      { name: { contains: filters.search } },
      { content: { contains: filters.search } },
      { subject: { contains: filters.search } },
    ];
  }

  const [templates, total] = await Promise.all([
    db.messageTemplate.findMany({
      where,
      orderBy: [
        { isDefault: 'desc' },
        { usageCount: 'desc' },
        { updatedAt: 'desc' },
      ],
      skip,
      take,
    }),
    db.messageTemplate.count({ where }),
  ]);

  return {
    data: templates.map(t => ({
      id: t.id,
      name: t.name ?? '',
      channel: t.channel ?? '',
      category: t.category,
      subject: t.subject,
      content: t.content ?? '',
      variables: t.variables ?? '[]',
      isAiGenerated: t.isAiGenerated,
      isDefault: t.isDefault,
      usageCount: t.usageCount,
      lastUsedAt: t.lastUsedAt,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    })),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

// ===== 5. GET TEMPLATE =====

/**
 * Get a single template by ID.
 * Validates ownership before returning.
 */
export async function getTemplate(
  templateId: string,
  userId: string
): Promise<{
  id: string;
  name: string;
  channel: string;
  category: string | null;
  subject: string | null;
  content: string;
  variables: string;
  isAiGenerated: boolean;
  isDefault: boolean;
  usageCount: number;
  lastUsedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
} | null> {
  const template = await db.messageTemplate.findUnique({
    where: { id: templateId },
  });

  if (!template || template.userId !== userId) {
    return null;
  }

  return {
    id: template.id,
    name: template.name ?? '',
    channel: template.channel ?? '',
    category: template.category,
    subject: template.subject,
    content: template.content ?? '',
    variables: template.variables ?? '[]',
    isAiGenerated: template.isAiGenerated,
    isDefault: template.isDefault,
    usageCount: template.usageCount,
    lastUsedAt: template.lastUsedAt,
    createdAt: template.createdAt,
    updatedAt: template.updatedAt,
  };
}

// ===== 6. PREVIEW TEMPLATE =====

/**
 * Replace variables in template content with provided values.
 * Returns the rendered content, subject, and any unresolved variables.
 */
export function previewTemplate(
  templateId: string,
  variables: Record<string, string>
): TemplatePreviewResult {
  // This is a synchronous function — the template content must be fetched first
  // then passed here. But per spec, it takes templateId.
  // Since we need to fetch from DB, let's make this async below.
  return {
    success: false,
    content: '',
    unresolvedVariables: [],
    error: 'Use previewTemplateAsync instead — requires database access',
  };
}

/**
 * Async version: fetch template and replace variables.
 */
export async function previewTemplateAsync(
  templateId: string,
  userId: string,
  variables: Record<string, string>
): Promise<TemplatePreviewResult> {
  const template = await getTemplate(templateId, userId);

  if (!template) {
    return {
      success: false,
      content: '',
      unresolvedVariables: [],
      error: 'Template not found or access denied',
    };
  }

  let renderedContent = template.content;
  const unresolvedVariables: string[] = [];

  // Find all variables in the content
  const contentVars = extractVariables(template.content);

  for (const varName of contentVars) {
    const placeholder = `{{${varName}}}`;
    const value = variables[varName];

    if (value !== undefined && value !== null) {
      const regex = new RegExp(escapeRegExp(placeholder), 'g');
      renderedContent = renderedContent.replace(regex, value);
    } else {
      unresolvedVariables.push(varName);
    }
  }

  // Also preview subject if available
  let renderedSubject: string | undefined;
  if (template.subject) {
    renderedSubject = template.subject;
    const subjectVars = extractVariables(template.subject);

    for (const varName of subjectVars) {
      const placeholder = `{{${varName}}}`;
      const value = variables[varName];

      if (value !== undefined && value !== null) {
        const regex = new RegExp(escapeRegExp(placeholder), 'g');
        renderedSubject = renderedSubject.replace(regex, value);
      } else if (!unresolvedVariables.includes(varName)) {
        unresolvedVariables.push(varName);
      }
    }
  }

  return {
    success: unresolvedVariables.length === 0,
    content: renderedContent,
    subject: renderedSubject,
    unresolvedVariables,
  };
}

// ===== 7. GENERATE AI TEMPLATE =====

/**
 * Use AI (z-ai-web-dev-sdk) to generate a message template.
 * Deducts credits for the AI operation.
 */
export async function generateAiTemplate(
  userId: string,
  channel: TemplateChannel,
  category: TemplateCategory,
  context?: string
): Promise<AiTemplateResult> {
  // Check credit sufficiency
  const creditCheck = await checkAICredits(userId, 'outreach_generation');
  if (!creditCheck.sufficient) {
    return {
      success: false,
      error: `Insufficient credits. Need ${creditCheck.cost}, have ${creditCheck.balance}. Shortfall: ${creditCheck.shortfall}`,
    };
  }

  // Build prompt based on channel and category
  const systemPrompt = buildAiTemplatePrompt(channel, category);
  const userPrompt = context
    ? `Generate a ${category} message template for ${channel}.\n\nContext: ${context}`
    : `Generate a ${category} message template for ${channel}. Make it professional and engaging.`;

  try {
    const result = await executeAICompletion(
      {
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        config: {
          provider: 'z-ai',
          maxTokens: 1024,
          temperature: 0.8,
        },
      },
      userId,
      'template_generation'
    );

    if (!result.success || !result.content) {
      return {
        success: false,
        error: result.error || 'AI generation failed',
      };
    }

    // Parse the AI response to extract template components
    const parsed = parseAiTemplateResponse(result.content, channel);

    // Deduct credits
    const deduction = await deductAICredits(
      userId,
      'outreach_generation',
      undefined,
      `ai-template-${Date.now()}`
    );

    if (!deduction.success) {
      return {
        success: false,
        error: `AI generation succeeded but credit deduction failed: ${deduction.error}`,
      };
    }

    // Create the template
    const templateResult = await createTemplate(
      userId,
      parsed.name || `AI ${category} - ${channel} - ${new Date().toLocaleDateString()}`,
      channel,
      parsed.content,
      category,
      parsed.subject,
      parsed.variables
    );

    if (!templateResult.success) {
      return {
        success: false,
        error: templateResult.error || 'Failed to save AI-generated template',
      };
    }

    // Mark as AI-generated
    await db.messageTemplate.update({
      where: { id: templateResult.templateId },
      data: { isAiGenerated: true },
    });

    await logTemplateAudit(userId, 'template_ai_generated', {
      templateId: templateResult.templateId,
      channel,
      category,
      creditsDeducted: AI_TEMPLATE_CREDIT_COST,
      tokensUsed: result.tokensUsed,
    }, templateResult.templateId);

    return {
      success: true,
      templateId: templateResult.templateId,
      content: parsed.content,
      subject: parsed.subject,
      variables: parsed.variables,
      creditsDeducted: AI_TEMPLATE_CREDIT_COST,
    };
  } catch (error) {
    console.error('[MessageTemplate] AI template generation failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'AI template generation failed',
    };
  }
}

// ===== 10. INCREMENT USAGE =====

/**
 * Increment the template usage count and update lastUsedAt.
 */
export async function incrementUsage(templateId: string): Promise<void> {
  try {
    await db.messageTemplate.update({
      where: { id: templateId },
      data: {
        usageCount: { increment: 1 },
        lastUsedAt: new Date(),
      },
    });
  } catch (error) {
    console.error('[MessageTemplate] Failed to increment usage count:', error);
  }
}

// ===== 10. GET TEMPLATE CATEGORIES =====

/**
 * Return the list of template categories.
 */
export function getTemplateCategories(): TemplateCategory[] {
  return [...TEMPLATE_CATEGORIES];
}

// ===== 12. SYNC WHATSAPP TEMPLATES =====

/**
 * Sync WhatsApp Business templates from Meta API.
 * Foundation implementation — in production would call Meta's Template API.
 */
export async function syncWhatsappTemplates(userId: string): Promise<WhatsappSyncResult> {
  // Check WhatsApp config for this user
  const whatsappConfig = await db.whatsappConfig.findUnique({
    where: { userId },
  });

  if (!whatsappConfig) {
    return { success: false, error: 'WhatsApp not configured for this user' };
  }

  if (!whatsappConfig.metaAccessToken || !whatsappConfig.metaWabaId) {
    return { success: false, error: 'WhatsApp Business API credentials not configured' };
  }

  try {
    // Foundation: In production, this would call:
    // GET https://graph.facebook.com/v18.0/{waba_id}/message_templates
    // with the meta access token
    //
    // For now, we log the sync attempt and update the lastTemplateSyncAt
    console.log(`[MessageTemplate] WhatsApp template sync requested for user ${userId}`);

    // Placeholder: would fetch templates from Meta API
    // const response = await fetch(
    //   `https://graph.facebook.com/v18.0/${whatsappConfig.metaWabaId}/message_templates`,
    //   {
    //     headers: { Authorization: `Bearer ${whatsappConfig.metaAccessToken}` },
    //   }
    // );
    // const data = await response.json();

    // Update last sync timestamp
    await db.whatsappConfig.update({
      where: { userId },
      data: { lastTemplateSyncAt: new Date() },
    });

    await logTemplateAudit(userId, 'whatsapp_template_sync', {
      wabaId: whatsappConfig.metaWabaId,
      syncTimestamp: new Date().toISOString(),
    });

    // Return foundation result
    return {
      success: true,
      syncedCount: 0,
      newTemplates: 0,
      updatedTemplates: 0,
    };
  } catch (error) {
    console.error('[MessageTemplate] WhatsApp template sync failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'WhatsApp template sync failed',
    };
  }
}

// ===== INTERNAL: BUILD AI TEMPLATE PROMPT =====

function buildAiTemplatePrompt(channel: TemplateChannel, category: TemplateCategory): string {
  const channelInstructions: Record<string, string> = {
    email: 'This is an email template. Include a subject line. Keep the body professional with clear paragraphs. Use {{name}}, {{company}}, {{service}} as default variables.',
    telegram: 'This is a Telegram message template. Keep it concise and punchy. Telegram messages should be short with emoji. Use {{name}}, {{company}} as default variables.',
    whatsapp: 'This is a WhatsApp message template. Keep it conversational and brief. WhatsApp messages should feel personal. Use {{name}}, {{company}} as default variables.',
    linkedin: 'This is a LinkedIn message template. Keep it professional but warm. LinkedIn messages should build rapport. Use {{name}}, {{company}}, {{role}} as default variables.',
    instagram: 'This is an Instagram DM template. Keep it casual and engaging. Use {{name}} as default variable.',
  };

  const categoryInstructions: Record<string, string> = {
    outreach: 'This is an initial outreach message. The goal is to start a conversation. Be value-driven, not salesy.',
    follow_up: 'This is a follow-up message. The prospect was previously contacted. Reference the prior outreach gently.',
    introduction: 'This is an introduction message. Introduce yourself/your company clearly. State the value proposition upfront.',
    reminder: 'This is a reminder message. Remind the prospect about a pending action, meeting, or offer. Be polite but clear.',
    custom: 'This is a custom template. Be creative while maintaining professionalism.',
  };

  return `You are a professional sales outreach copywriter. Generate a high-quality message template.

${channelInstructions[channel] || channelInstructions.email}

${categoryInstructions[category] || categoryInstructions.custom}

IMPORTANT FORMATTING:
- Use {{variable_name}} syntax for dynamic variables
- Output format MUST be valid JSON:
{
  "name": "Template Name",
  "subject": "Email subject line (only for email)",
  "content": "Template body with {{variables}}",
  "variables": ["variable1", "variable2"]
}

Generate ONE template only. Make it compelling and professional.`;
}

// ===== INTERNAL: PARSE AI TEMPLATE RESPONSE =====

function parseAiTemplateResponse(
  response: string,
  channel: TemplateChannel
): {
  name: string;
  content: string;
  subject?: string;
  variables: string[];
} {
  // Try to parse as JSON first
  try {
    // Handle markdown code blocks
    let cleanedResponse = response.trim();
    if (cleanedResponse.startsWith('```json')) {
      cleanedResponse = cleanedResponse.slice(7);
    } else if (cleanedResponse.startsWith('```')) {
      cleanedResponse = cleanedResponse.slice(3);
    }
    if (cleanedResponse.endsWith('```')) {
      cleanedResponse = cleanedResponse.slice(0, -3);
    }
    cleanedResponse = cleanedResponse.trim();

    const parsed = JSON.parse(cleanedResponse);

    if (parsed.content && typeof parsed.content === 'string') {
      return {
        name: parsed.name || `AI Generated - ${channel}`,
        content: parsed.content,
        subject: parsed.subject || undefined,
        variables: Array.isArray(parsed.variables) ? parsed.variables : extractVariables(parsed.content),
      };
    }
  } catch {
    // JSON parsing failed — fall through to plain text handling
  }

  // Fallback: treat the entire response as content
  const variables = extractVariables(response);

  return {
    name: `AI Generated - ${channel} - ${new Date().toLocaleDateString()}`,
    content: response,
    subject: channel === 'email' ? 'Following up with {{name}}' : undefined,
    variables,
  };
}
