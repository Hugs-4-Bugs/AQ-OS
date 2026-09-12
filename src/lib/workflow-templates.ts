// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Workflow Templates
// Phase 12: Pre-built templates users can instantiate
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { logWorkflowEvent } from '@/lib/workflow-audit';
import { checkWorkflowLimit } from '@/lib/workflow-credits';

// ===== BUILT-IN TEMPLATE DEFINITIONS =====

interface TemplateDefinition {
  name: string;
  description: string;
  category: string;
  triggerType: string;
  triggerConfig: Record<string, unknown> | null;
  nodes: unknown[];
  edges: unknown[];
  isPremium: boolean;
}

const BUILTIN_TEMPLATES: TemplateDefinition[] = [
  // 1. Lead Nurture
  {
    name: 'Lead Nurture Sequence',
    description: 'Automatically nurture new leads with a timed sequence of emails and WhatsApp messages, then move them to the next stage.',
    category: 'nurture',
    triggerType: 'lead_discovered',
    triggerConfig: null,
    nodes: [
      { id: 'n1', type: 'trigger', title: 'Lead Discovered', config: {} },
      { id: 'n2', type: 'delay', title: 'Wait 1 Day', config: { duration: 1, unit: 'days' } },
      { id: 'n3', type: 'action', title: 'Send Welcome Email', config: { actionType: 'send_email', subject: 'Welcome to our services', body: 'Hi there, we noticed your business and wanted to reach out...' } },
      { id: 'n4', type: 'delay', title: 'Wait 3 Days', config: { duration: 3, unit: 'days' } },
      { id: 'n5', type: 'action', title: 'Send WhatsApp Follow-up', config: { actionType: 'send_whatsapp', message: 'Hi! Just following up on our email. Would love to chat!' } },
      { id: 'n6', type: 'action', title: 'Move to Contacted', config: { actionType: 'move_lead_stage', targetStage: 'contacted' } },
    ],
    edges: [
      { id: 'e1', source: 'n1', target: 'n2' },
      { id: 'e2', source: 'n2', target: 'n3' },
      { id: 'e3', source: 'n3', target: 'n4' },
      { id: 'e4', source: 'n4', target: 'n5' },
      { id: 'e5', source: 'n5', target: 'n6' },
    ],
    isPremium: false,
  },

  // 2. Follow Up
  {
    name: 'Lead Reply Follow-up',
    description: 'When a lead replies, wait 2 hours then generate AI outreach and send a personalized email.',
    category: 'follow_up',
    triggerType: 'lead_reply',
    triggerConfig: { replyType: 'any' },
    nodes: [
      { id: 'n1', type: 'trigger', title: 'Lead Replied', config: { replyType: 'any' } },
      { id: 'n2', type: 'delay', title: 'Wait 2 Hours', config: { duration: 2, unit: 'hours' } },
      { id: 'n3', type: 'ai_action', title: 'Generate AI Outreach', config: { actionType: 'ai_outreach', channel: 'email', style: 'follow-up' } },
      { id: 'n4', type: 'action', title: 'Send Follow-up Email', config: { actionType: 'send_email', subject: 'Re: Your inquiry', body: '{{output.generatedMessage}}' } },
    ],
    edges: [
      { id: 'e1', source: 'n1', target: 'n2' },
      { id: 'e2', source: 'n2', target: 'n3' },
      { id: 'e3', source: 'n3', target: 'n4' },
    ],
    isPremium: false,
  },

  // 3. Low Credit Alert
  {
    name: 'Low Credit Alert',
    description: 'Get notified when your credits are running low, via in-app notification and email.',
    category: 'alert',
    triggerType: 'credits_low',
    triggerConfig: { threshold: 10 },
    nodes: [
      { id: 'n1', type: 'trigger', title: 'Credits Low', config: { threshold: 10 } },
      { id: 'n2', type: 'action', title: 'Create Notification', config: { actionType: 'create_notification', title: 'Low Credits Warning', message: 'You are running low on credits!', type: 'credit_low' } },
      { id: 'n3', type: 'action', title: 'Send Email Alert', config: { actionType: 'notify_low_credits', threshold: 10 } },
    ],
    edges: [
      { id: 'e1', source: 'n1', target: 'n2' },
      { id: 'e2', source: 'n2', target: 'n3' },
    ],
    isPremium: false,
  },

  // 4. Payment Reminder
  {
    name: 'Trial Ending Reminder',
    description: 'Remind users about expiring trials with a timed email and WhatsApp sequence.',
    category: 'alert',
    triggerType: 'trial_ending',
    triggerConfig: { daysThreshold: 3 },
    nodes: [
      { id: 'n1', type: 'trigger', title: 'Trial Ending', config: { daysThreshold: 3 } },
      { id: 'n2', type: 'delay', title: 'Wait 3 Days', config: { duration: 3, unit: 'days' } },
      { id: 'n3', type: 'action', title: 'Send Reminder Email', config: { actionType: 'send_email', subject: 'Your trial is ending soon', body: 'Your free trial ends soon. Upgrade to keep access!' } },
      { id: 'n4', type: 'delay', title: 'Wait 2 Days', config: { duration: 2, unit: 'days' } },
      { id: 'n5', type: 'action', title: 'Send WhatsApp Reminder', config: { actionType: 'send_whatsapp', message: 'Last chance! Your trial ends tomorrow. Upgrade now!' } },
    ],
    edges: [
      { id: 'e1', source: 'n1', target: 'n2' },
      { id: 'e2', source: 'n2', target: 'n3' },
      { id: 'e3', source: 'n3', target: 'n4' },
      { id: 'e4', source: 'n4', target: 'n5' },
    ],
    isPremium: false,
  },

  // 5. Onboarding Flow
  {
    name: 'New Lead Onboarding',
    description: 'Welcome new leads with a WhatsApp message, follow up via email after 1 day, and add an internal note.',
    category: 'onboarding',
    triggerType: 'lead_discovered',
    triggerConfig: null,
    nodes: [
      { id: 'n1', type: 'trigger', title: 'Lead Discovered', config: {} },
      { id: 'n2', type: 'action', title: 'Send WhatsApp Welcome', config: { actionType: 'send_whatsapp', message: 'Welcome! Thanks for your interest. We will be in touch soon!' } },
      { id: 'n3', type: 'delay', title: 'Wait 1 Day', config: { duration: 1, unit: 'days' } },
      { id: 'n4', type: 'action', title: 'Send Onboarding Email', config: { actionType: 'send_email', subject: 'Getting started with us', body: 'Here is everything you need to know to get started...' } },
      { id: 'n5', type: 'action', title: 'Add Internal Note', config: { actionType: 'add_note', content: 'Onboarding sequence initiated. Lead contacted via WhatsApp and email.' } },
    ],
    edges: [
      { id: 'e1', source: 'n1', target: 'n2' },
      { id: 'e2', source: 'n2', target: 'n3' },
      { id: 'e3', source: 'n3', target: 'n4' },
      { id: 'e4', source: 'n4', target: 'n5' },
    ],
    isPremium: false,
  },

  // 6. AI Enrichment
  {
    name: 'AI Lead Enrichment',
    description: 'Analyze new leads with AI, score them, and automatically move high-scoring leads to the next stage.',
    category: 'enrichment',
    triggerType: 'lead_discovered',
    triggerConfig: null,
    nodes: [
      { id: 'n1', type: 'trigger', title: 'Lead Discovered', config: {} },
      { id: 'n2', type: 'ai_action', title: 'AI Analysis', config: { actionType: 'ai_analysis', prompt: 'Analyze this lead for sales conversion potential and provide recommendations.' } },
      { id: 'n3', type: 'ai_action', title: 'Score Lead', config: { actionType: 'score_lead' } },
      { id: 'n4', type: 'condition', title: 'Score > 70?', config: { actionType: 'conditional_branch', field: 'leadScore', operator: '>', value: 70, trueBranch: 'move_stage', falseBranch: 'end' } },
      { id: 'n5', type: 'action', title: 'Move to Contacted', config: { actionType: 'move_lead_stage', targetStage: 'contacted' } },
    ],
    edges: [
      { id: 'e1', source: 'n1', target: 'n2' },
      { id: 'e2', source: 'n2', target: 'n3' },
      { id: 'e3', source: 'n3', target: 'n4' },
      { id: 'e4', source: 'n4', target: 'n5' },
    ],
    isPremium: true,
  },

  // 7. Outreach Sequence
  {
    name: 'Outreach Sequence',
    description: 'Generate AI-powered outreach, send via email, wait, then follow up via WhatsApp if no reply received.',
    category: 'outreach',
    triggerType: 'lead_discovered',
    triggerConfig: null,
    nodes: [
      { id: 'n1', type: 'trigger', title: 'Lead Discovered', config: {} },
      { id: 'n2', type: 'ai_action', title: 'Generate AI Outreach', config: { actionType: 'ai_outreach', channel: 'email', style: 'professional', tone: 'friendly' } },
      { id: 'n3', type: 'action', title: 'Send Outreach Email', config: { actionType: 'send_email', subject: 'Opportunity for {{trigger.businessName}}', body: '{{output.generatedMessage}}' } },
      { id: 'n4', type: 'delay', title: 'Wait 3 Days', config: { duration: 3, unit: 'days' } },
      { id: 'n5', type: 'condition', title: 'No Reply?', config: { actionType: 'conditional_branch', field: 'leadStage', operator: '!=', value: 'replied', trueBranch: 'whatsapp_followup', falseBranch: 'end' } },
      { id: 'n6', type: 'action', title: 'Send WhatsApp Follow-up', config: { actionType: 'send_whatsapp', message: 'Hi! Just wanted to follow up on our email. Would love to connect!' } },
    ],
    edges: [
      { id: 'e1', source: 'n1', target: 'n2' },
      { id: 'e2', source: 'n2', target: 'n3' },
      { id: 'e3', source: 'n3', target: 'n4' },
      { id: 'e4', source: 'n4', target: 'n5' },
      { id: 'e5', source: 'n5', target: 'n6' },
    ],
    isPremium: true,
  },
];

// ===== GET TEMPLATE CATEGORIES =====

export async function getTemplateCategories(): Promise<
  { category: string; count: number; description: string }[]
> {
  const categories = [
    { category: 'nurture', description: 'Nurture leads through timed sequences' },
    { category: 'follow_up', description: 'Follow up on lead interactions' },
    { category: 'alert', description: 'Alerts and notifications' },
    { category: 'onboarding', description: 'New lead onboarding flows' },
    { category: 'enrichment', description: 'AI-powered lead enrichment' },
    { category: 'outreach', description: 'Outreach sequences' },
  ];

  // Check DB templates
  const dbTemplates = await db.workflowTemplate.findMany({
    select: { category: true },
  });

  const dbCategoryCounts: Record<string, number> = {};
  for (const t of dbTemplates) {
    dbCategoryCounts[t.category] = (dbCategoryCounts[t.category] || 0) + 1;
  }

  return categories.map((c) => ({
    ...c,
    count: (dbCategoryCounts[c.category] || 0) + BUILTIN_TEMPLATES.filter(t => t.category === c.category).length,
  }));
}

// ===== LIST TEMPLATES =====

export async function listTemplates(
  category?: string
): Promise<Record<string, unknown>[]> {
  // Get DB templates
  const where: Record<string, unknown> = {};
  if (category) where.category = category;

  const dbTemplates = await db.workflowTemplate.findMany({ where });

  // Combine with built-in templates
  const builtinFiltered = category
    ? BUILTIN_TEMPLATES.filter(t => t.category === category)
    : BUILTIN_TEMPLATES;

  const result: Record<string, unknown>[] = [
    ...builtinFiltered.map((t, i) => ({
      id: `builtin_${i}`,
      name: t.name,
      description: t.description,
      category: t.category,
      triggerType: t.triggerType,
      triggerConfig: t.triggerConfig,
      isPremium: t.isPremium,
      isBuiltin: true,
      nodes: t.nodes,
      edges: t.edges,
    })),
    ...dbTemplates.map(t => ({
      id: t.id,
      name: t.name,
      description: t.description,
      category: t.category,
      triggerType: t.triggerType,
      triggerConfig: t.triggerConfig ? JSON.parse(t.triggerConfig) : null,
      isPremium: t.isPremium,
      isBuiltin: false,
      nodes: JSON.parse(t.nodes || '[]'),
      edges: JSON.parse(t.edges || '[]'),
      usageCount: t.usageCount,
    })),
  ];

  return result;
}

// ===== GET TEMPLATE =====

export async function getTemplate(
  templateId: string
): Promise<Record<string, unknown> | null> {
  // Check built-in templates first
  if (templateId.startsWith('builtin_')) {
    const index = parseInt(templateId.replace('builtin_', ''), 10);
    const template = BUILTIN_TEMPLATES[index];
    if (!template) return null;

    return {
      id: templateId,
      name: template.name,
      description: template.description,
      category: template.category,
      triggerType: template.triggerType,
      triggerConfig: template.triggerConfig,
      isPremium: template.isPremium,
      isBuiltin: true,
      nodes: template.nodes,
      edges: template.edges,
    };
  }

  // Check DB templates
  const template = await db.workflowTemplate.findUnique({
    where: { id: templateId },
  });

  if (!template) return null;

  return {
    id: template.id,
    name: template.name,
    description: template.description,
    category: template.category,
    triggerType: template.triggerType,
    triggerConfig: template.triggerConfig ? JSON.parse(template.triggerConfig) : null,
    isPremium: template.isPremium,
    isBuiltin: false,
    nodes: JSON.parse(template.nodes || '[]'),
    edges: JSON.parse(template.edges || '[]'),
    usageCount: template.usageCount,
  };
}

// ===== INSTANTIATE TEMPLATE =====

export async function instantiateTemplate(
  templateId: string,
  userId: string,
  customizations?: {
    name?: string;
    description?: string;
    triggerConfig?: Record<string, unknown>;
    nodeOverrides?: Record<string, Record<string, unknown>>;
  }
): Promise<{ success: boolean; workflowId?: string; error?: string }> {
  try {
    // Check plan limits
    const limitCheck = await checkWorkflowLimit(userId);
    if (!limitCheck.allowed) {
      return {
        success: false,
        error: `Workflow limit reached (${limitCheck.current}/${limitCheck.limit}). Upgrade your plan.`,
      };
    }

    // Get template
    const template = await getTemplate(templateId);
    if (!template) {
      return { success: false, error: 'Template not found' };
    }

    // Apply customizations
    const name = customizations?.name || (template.name as string);
    const description = customizations?.description || (template.description as string);
    const triggerConfig = customizations?.triggerConfig || template.triggerConfig;

    let nodes = template.nodes as unknown[];
    if (customizations?.nodeOverrides) {
      nodes = (nodes as Record<string, unknown>[]).map((node) => {
        const nodeId = node.id as string;
        if (customizations.nodeOverrides![nodeId]) {
          return { ...node, config: { ...(node.config as Record<string, unknown>), ...customizations.nodeOverrides![nodeId] } };
        }
        return node;
      });
    }

    // Create workflow from template
    const workflow = await db.workflowDefinition.create({
      data: {
        userId,
        name,
        description,
        triggerType: template.triggerType as string,
        triggerConfig: triggerConfig ? JSON.stringify(triggerConfig) : null,
        nodes: JSON.stringify(nodes),
        edges: JSON.stringify(template.edges),
        status: 'draft',
        version: 1,
        isTemplate: false,
      },
    });

    // Increment template usage count
    if (!templateId.startsWith('builtin_')) {
      await db.workflowTemplate.update({
        where: { id: templateId },
        data: { usageCount: { increment: 1 } },
      });
    }

    // Audit log
    await logWorkflowEvent(userId, 'workflow_template_instantiated', {
      templateId,
      workflowId: workflow.id,
      templateName: template.name,
    });

    return { success: true, workflowId: workflow.id };
  } catch (error) {
    console.error('[WorkflowTemplates] Failed to instantiate template:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to instantiate template',
    };
  }
}

// ===== SEED TEMPLATES =====

/**
 * Seed built-in templates into the DB if they don't exist yet.
 */
export async function seedTemplates(): Promise<void> {
  try {
    const existingCount = await db.workflowTemplate.count();

    if (existingCount > 0) return; // Already seeded

    for (const template of BUILTIN_TEMPLATES) {
      await db.workflowTemplate.create({
        data: {
          name: template.name,
          description: template.description,
          category: template.category,
          triggerType: template.triggerType,
          triggerConfig: template.triggerConfig ? JSON.stringify(template.triggerConfig) : null,
          nodes: JSON.stringify(template.nodes),
          edges: JSON.stringify(template.edges),
          isPremium: template.isPremium,
        },
      });
    }

    console.log(`[WorkflowTemplates] Seeded ${BUILTIN_TEMPLATES.length} built-in templates`);
  } catch (error) {
    console.error('[WorkflowTemplates] Failed to seed templates:', error);
  }
}
