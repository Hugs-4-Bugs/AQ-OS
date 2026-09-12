// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Template Approval Lifecycle Service
// Phase 10: Messaging Remediation — WhatsApp-style template approval flow
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';

// ─── Types ────────────────────────────────────────────────────────

export type TemplateCategory = 'marketing' | 'utility' | 'authentication';
export type TemplateStatus = 'pending' | 'approved' | 'rejected' | 'active' | 'disabled';

export interface CreateTemplateInput {
  userId: string;
  name: string;
  category: TemplateCategory;
  content: string;
  language?: string;
  variables?: string[];       // e.g., ["company_name", "offer_details"]
  channel?: 'whatsapp' | 'telegram' | 'email';
}

export interface TemplatePerformance {
  templateId: string;
  name: string;
  category: string;
  status: string;
  totalUsage: number;
  deliveryRate: number;
  readRate: number;
  responseRate: number;
}

export interface ApprovalResult {
  success: boolean;
  templateId: string;
  status: TemplateStatus;
  error?: string;
}

// ─── Constants ────────────────────────────────────────────────────

const VALID_CATEGORIES: TemplateCategory[] = ['marketing', 'utility', 'authentication'];

const CATEGORY_CONSTRAINTS: Record<TemplateCategory, {
  maxContentLength: number;
  requiredVariables: string[];
  allowedChannels: string[];
}> = {
  marketing: {
    maxContentLength: 1024,
    requiredVariables: [],
    allowedChannels: ['whatsapp', 'telegram', 'email'],
  },
  utility: {
    maxContentLength: 1024,
    requiredVariables: [],
    allowedChannels: ['whatsapp', 'telegram'],
  },
  authentication: {
    maxContentLength: 512,
    requiredVariables: ['otp_code'],
    allowedChannels: ['whatsapp'],
  },
};

// ─── Core Service Functions ───────────────────────────────────────

/**
 * Create a new message template
 */
export async function createTemplate(input: CreateTemplateInput): Promise<{
  success: boolean;
  templateId?: string;
  error?: string;
}> {
  try {
    // Validate category
    if (!VALID_CATEGORIES.includes(input.category)) {
      return {
        success: false,
        error: `Invalid category. Must be one of: ${VALID_CATEGORIES.join(', ')}`,
      };
    }

    const constraints = CATEGORY_CONSTRAINTS[input.category];

    // Validate content length
    if (input.content.length > constraints.maxContentLength) {
      return {
        success: false,
        error: `Content exceeds maximum length of ${constraints.maxContentLength} characters for ${input.category} templates`,
      };
    }

    // Validate required variables
    if (constraints.requiredVariables.length > 0) {
      const templateVars = input.variables || [];
      for (const reqVar of constraints.requiredVariables) {
        if (!templateVars.includes(reqVar) && !input.content.includes(`{{${reqVar}}}`)) {
          return {
            success: false,
            error: `Template must include variable: {{${reqVar}}} (required for ${input.category} category)`,
          };
        }
      }
    }

    // Validate channel
    const channel = input.channel || 'whatsapp';
    if (!constraints.allowedChannels.includes(channel)) {
      return {
        success: false,
        error: `Channel "${channel}" is not allowed for ${input.category} templates. Allowed: ${constraints.allowedChannels.join(', ')}`,
      };
    }

    // Check for duplicate name for this user
    const existing = await db.messageTemplateApproval.findFirst({
      where: {
        userId: input.userId,
        name: input.name,
        status: { not: 'disabled' },
      },
    });

    if (existing) {
      return {
        success: false,
        error: `Template with name "${input.name}" already exists`,
      };
    }

    // Create the template in draft/pending state
    const template = await db.messageTemplateApproval.create({
      data: {
        userId: input.userId,
        name: input.name,
        category: input.category,
        content: input.content,
        status: 'pending',
        version: 1,
        metadata: JSON.stringify({
          language: input.language || 'en',
          variables: input.variables || extractVariables(input.content),
          channel,
        }),
      },
    });

    return { success: true, templateId: template.id };
  } catch (error) {
    console.error('Template creation failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error creating template',
    };
  }
}

/**
 * Submit a template for approval (WhatsApp Business API requirement)
 */
export async function submitForApproval(templateId: string, userId: string): Promise<ApprovalResult> {
  try {
    const template = await db.messageTemplateApproval.findUnique({
      where: { id: templateId },
    });

    if (!template) {
      return { success: false, templateId, status: 'pending', error: 'Template not found' };
    }

    if (template.userId !== userId) {
      return { success: false, templateId, status: 'pending', error: 'Not authorized' };
    }

    if (template.status !== 'pending' && template.status !== 'rejected') {
      return {
        success: false,
        templateId,
        status: template.status as TemplateStatus,
        error: `Template is in "${template.status}" status and cannot be submitted for approval`,
      };
    }

    // In production, this would call the WhatsApp Business API
    // For now, we simulate the submission and auto-approve for development
    const updatedTemplate = await db.messageTemplateApproval.update({
      where: { id: templateId },
      data: {
        status: 'pending',
        submittedAt: new Date(),
        metadata: JSON.stringify({ ...(template.metadata ? JSON.parse(template.metadata) : {}), submittedAt: new Date().toISOString() }),
      },
    });

    return {
      success: true,
      templateId,
      status: updatedTemplate.status as TemplateStatus,
    };
  } catch (error) {
    console.error('Template approval submission failed:', error);
    return {
      success: false,
      templateId,
      status: 'pending',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Handle approval status update (called by webhook or admin)
 */
export async function handleApprovalStatus(
  templateId: string,
  status: 'approved' | 'rejected',
  rejectionReason?: string
): Promise<ApprovalResult> {
  try {
    const template = await db.messageTemplateApproval.findUnique({
      where: { id: templateId },
    });

    if (!template) {
      return { success: false, templateId, status: 'pending', error: 'Template not found' };
    }

    const updateData: Record<string, unknown> = {
      status,
    };

    if (status === 'approved') {
      updateData.approvedAt = new Date();
    }

    if (status === 'rejected' && rejectionReason) {
      updateData.rejectionReason = rejectionReason;
    }

    await db.messageTemplateApproval.update({
      where: { id: templateId },
      data: updateData,
    });

    return {
      success: true,
      templateId,
      status,
    };
  } catch (error) {
    console.error('Approval status update failed:', error);
    return {
      success: false,
      templateId,
      status: 'pending',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Resubmit a rejected template (creates a new version)
 */
export async function resubmitTemplate(
  templateId: string,
  userId: string,
  newContent: string
): Promise<ApprovalResult> {
  try {
    const template = await db.messageTemplateApproval.findUnique({
      where: { id: templateId },
    });

    if (!template) {
      return { success: false, templateId, status: 'pending', error: 'Template not found' };
    }

    if (template.userId !== userId) {
      return { success: false, templateId, status: 'pending', error: 'Not authorized' };
    }

    if (template.status !== 'rejected') {
      return {
        success: false,
        templateId,
        status: template.status as TemplateStatus,
        error: 'Only rejected templates can be resubmitted',
      };
    }

    // Create new version
    const newVersion = template.version + 1;

    await db.messageTemplateApproval.update({
      where: { id: templateId },
      data: {
        content: newContent,
        status: 'pending',
        version: newVersion,
        rejectionReason: null,
        submittedAt: new Date(),
        approvedAt: null,
        metadata: JSON.stringify({
          ...(template.metadata ? JSON.parse(template.metadata) : {}),
          variables: extractVariables(newContent),
          resubmittedAt: new Date().toISOString(),
          previousVersion: template.version,
        }),
      },
    });

    return {
      success: true,
      templateId,
      status: 'pending',
    };
  } catch (error) {
    console.error('Template resubmission failed:', error);
    return {
      success: false,
      templateId,
      status: 'pending',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Get template performance metrics
 */
export async function getTemplatePerformance(templateId: string, userId: string): Promise<TemplatePerformance | null> {
  try {
    const template = await db.messageTemplateApproval.findUnique({
      where: { id: templateId },
    });

    if (!template || template.userId !== userId) return null;

    // Count outreach messages that used this template
    const totalUsage = await db.outreachMessage.count({
      where: {
        userId,
        metadata: { contains: templateId },
        generatedByAI: false,
      },
    });

    // Calculate delivery/read/response rates from outreach messages
    const delivered = await db.outreachMessage.count({
      where: {
        userId,
        metadata: { contains: templateId },
        status: { in: ['delivered', 'opened', 'replied'] },
      },
    });

    const opened = await db.outreachMessage.count({
      where: {
        userId,
        metadata: { contains: templateId },
        status: { in: ['opened', 'replied'] },
      },
    });

    const responded = await db.outreachMessage.count({
      where: {
        userId,
        metadata: { contains: templateId },
        status: 'replied',
      },
    });

    const sent = await db.outreachMessage.count({
      where: {
        userId,
        metadata: { contains: templateId },
        status: { not: 'draft' },
      },
    });

    return {
      templateId,
      name: template.name,
      category: template.category,
      status: template.status,
      totalUsage,
      deliveryRate: sent > 0 ? delivered / sent : 0,
      readRate: delivered > 0 ? opened / delivered : 0,
      responseRate: opened > 0 ? responded / opened : 0,
    };
  } catch (error) {
    console.error('Template performance fetch failed:', error);
    return null;
  }
}

/**
 * List templates by status
 */
export async function listTemplatesByStatus(
  userId: string,
  status?: TemplateStatus,
  category?: TemplateCategory,
  page: number = 1,
  limit: number = 20
): Promise<{
  templates: Array<{
    id: string;
    name: string;
    category: string;
    content: string;
    status: string;
    version: number;
    rejectionReason: string | null;
    submittedAt: Date | null;
    approvedAt: Date | null;
    createdAt: Date;
  }>;
  total: number;
}> {
  const where: Record<string, unknown> = { userId };

  if (status) where.status = status;
  if (category) where.category = category;

  const [templates, total] = await Promise.all([
    db.messageTemplateApproval.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    db.messageTemplateApproval.count({ where }),
  ]);

  return {
    templates: templates.map(t => ({
      id: t.id,
      name: t.name,
      category: t.category,
      content: t.content,
      status: t.status,
      version: t.version,
      rejectionReason: t.rejectionReason,
      submittedAt: t.submittedAt,
      approvedAt: t.approvedAt,
      createdAt: t.createdAt,
    })),
    total,
  };
}

/**
 * Get a single template by ID
 */
export async function getTemplate(templateId: string, userId: string) {
  try {
    const template = await db.messageTemplateApproval.findUnique({
      where: { id: templateId },
    });

    if (!template || template.userId !== userId) return null;

    return {
      ...template,
      metadata: template.metadata ? JSON.parse(template.metadata) : null,
    };
  } catch {
    return null;
  }
}

/**
 * Update template content (only for pending/draft templates)
 */
export async function updateTemplate(
  templateId: string,
  userId: string,
  updates: { name?: string; content?: string; category?: TemplateCategory }
): Promise<{ success: boolean; error?: string }> {
  try {
    const template = await db.messageTemplateApproval.findUnique({
      where: { id: templateId },
    });

    if (!template || template.userId !== userId) {
      return { success: false, error: 'Template not found or not authorized' };
    }

    // Only allow updates on pending templates
    if (template.status !== 'pending') {
      return { success: false, error: 'Can only edit templates in pending status' };
    }

    const updateData: Record<string, unknown> = {};
    if (updates.name) updateData.name = updates.name;
    if (updates.content) {
      updateData.content = updates.content;
      // Update variables in metadata
      const metadata = template.metadata ? JSON.parse(template.metadata) : {};
      metadata.variables = extractVariables(updates.content);
      updateData.metadata = JSON.stringify(metadata);
    }
    if (updates.category) updateData.category = updates.category;

    await db.messageTemplateApproval.update({
      where: { id: templateId },
      data: updateData,
    });

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Update failed',
    };
  }
}

/**
 * Delete a template (soft delete by setting status to disabled)
 */
export async function deleteTemplate(
  templateId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const template = await db.messageTemplateApproval.findUnique({
      where: { id: templateId },
    });

    if (!template || template.userId !== userId) {
      return { success: false, error: 'Template not found or not authorized' };
    }

    await db.messageTemplateApproval.update({
      where: { id: templateId },
      data: { status: 'disabled' },
    });

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Delete failed',
    };
  }
}

// ─── Helper Functions ─────────────────────────────────────────────

/**
 * Extract template variables from content (e.g., {{variable_name}})
 */
function extractVariables(content: string): string[] {
  const matches = content.match(/\{\{(\w+)\}\}/g);
  if (!matches) return [];
  return [...new Set(matches.map(m => m.replace(/\{\{|\}\}/g, '')))];
}
