// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — POST /api/workflows/ai-generate
// Enhancement: AI Workflow Creation via Prompt (ELITE ONLY).
// Parses a plain-English workflow description into a structured workflow
// (name, trigger, steps, conditions, wait times) using Z-AI, then returns
// it as a preview payload. The client saves it through the standard
// POST /api/workflows endpoint, exactly like manually created workflows.
// Costs 5 credits per generation (deducted before generation).
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { deductCredits } from '@/lib/credit-service';
import ZAI from 'z-ai-web-dev-sdk';

const AI_WORKFLOW_COST = 5;

// Must match the trigger/action/node vocabularies used by the workflow builder + engine
const VALID_TRIGGER_TYPES = [
  'lead_discovered', 'lead_moved', 'lead_reply', 'gmail_connected',
  'email_received', 'telegram_received', 'whatsapp_received',
  'payment_success', 'trial_ending', 'credits_low', 'ai_completed',
  'webhook', 'scheduled', 'manual',
] as const;

const VALID_ACTION_TYPES = [
  'send_email', 'create_gmail_draft', 'send_telegram', 'send_whatsapp',
  'ai_analysis', 'ai_outreach', 'move_lead_stage', 'update_tags',
  'create_notification', 'wait_delay', 'conditional_branch', 'webhook_call',
  'export_data', 'score_lead', 'add_note', 'notify_low_credits', 'notify_trial_ending',
] as const;

const VALID_NODE_TYPES = ['action', 'condition', 'delay', 'ai_action'] as const;

const SYSTEM_PROMPT = `You are a workflow designer for AcquisitionOS, a client-acquisition automation platform.
Convert a plain-English automation request into a structured workflow definition.

Return ONLY a JSON object (no markdown, no explanation) with this exact shape:
{
  "name": "short workflow name (3-6 words)",
  "description": "one-sentence summary of what the workflow does",
  "triggerType": "<one trigger value>",
  "triggerConfig": {},
  "steps": [
    {
      "nodeType": "delay" | "action" | "ai_action" | "condition",
      "actionType": "<one action value>",
      "title": "human readable step name",
      "config": { }
    }
  ]
}

ALLOWED triggerType values:
- "lead_discovered" (a new lead was discovered)
- "lead_moved" (a lead moved stage)
- "lead_reply" (a lead replied)
- "email_received" (an email was received)
- "gmail_connected" (Gmail account connected)
- "telegram_received" / "whatsapp_received" (message received)
- "payment_success" / "trial_ending" / "credits_low" / "ai_completed"
- "webhook" (webhook call)
- "scheduled" (runs on a schedule — put a cron string in triggerConfig.cron)
- "manual" (manual trigger)

ALLOWED actionType values (pick the closest match):
- "wait_delay" (nodeType MUST be "delay"; config: {"duration": <number>, "unit": "minutes"|"hours"|"days"})
- "send_email" (send an email)
- "create_gmail_draft"
- "send_telegram" / "send_whatsapp"
- "ai_analysis" / "ai_outreach" (AI generates analysis or outreach content; nodeType should be "ai_action"; config may include {"prompt": "what the AI should generate"})
- "move_lead_stage" (config: {"stage": "<stage name like replied|contacted|qualified>"})
- "update_tags" (config: {"tags": ["tag1"]})
- "create_notification"
- "conditional_branch" (nodeType MUST be "condition"; config: {"field": "...", "operator": "=="|"!="|">"|"<"|">="|"<="|"contains", "value": "..."})
- "webhook_call", "export_data", "score_lead", "add_note",
- "notify_low_credits", "notify_trial_ending"

RULES:
1. Order steps exactly as described by the user.
2. Every "wait X hours/days/minutes" phrase becomes a delay step with wait_delay.
3. Any "using AI" / "personalized" / "generate" phrase becomes an ai_action step with ai_outreach or ai_analysis.
4. Any "if/when condition" phrase becomes a condition step with conditional_branch.
5. Map stage moves to move_lead_stage with the mentioned stage.
6. Keep 2-8 steps. Use the user's wording for titles.`;

interface GeneratedStep {
  nodeType: string;
  actionType: string;
  title: string;
  config: Record<string, unknown>;
}

interface GeneratedWorkflow {
  name: string;
  description: string;
  triggerType: string;
  triggerConfig: Record<string, unknown>;
  steps: GeneratedStep[];
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/** Normalize + repair the AI output into a guaranteed-valid workflow structure. */
function normalizeGenerated(raw: Record<string, unknown>): GeneratedWorkflow {
  const triggerTypeRaw = str(raw.triggerType).toLowerCase();
  const triggerType = (VALID_TRIGGER_TYPES as readonly string[]).includes(triggerTypeRaw)
    ? triggerTypeRaw
    : 'manual';

  const triggerConfig =
    raw.triggerConfig && typeof raw.triggerConfig === 'object'
      ? (raw.triggerConfig as Record<string, unknown>)
      : {};

  const rawSteps = Array.isArray(raw.steps) ? raw.steps : [];
  const steps: GeneratedStep[] = [];

  for (const s of rawSteps.slice(0, 10)) {
    if (!s || typeof s !== 'object') continue;
    const step = s as Record<string, unknown>;

    let nodeType = str(step.nodeType).toLowerCase();
    let actionType = str(step.actionType).toLowerCase();
    const title = str(step.title) || 'Untitled step';
    const config =
      step.config && typeof step.config === 'object'
        ? { ...(step.config as Record<string, unknown>) }
        : {};

    // Repair invalid combinations
    if (!(VALID_ACTION_TYPES as readonly string[]).includes(actionType)) {
      actionType = nodeType === 'delay' ? 'wait_delay' : nodeType === 'condition' ? 'conditional_branch' : 'create_notification';
    }
    if (actionType === 'wait_delay') nodeType = 'delay';
    else if (actionType === 'conditional_branch') nodeType = 'condition';
    else if (actionType === 'ai_analysis' || actionType === 'ai_outreach') nodeType = 'ai_action';
    else if (!(VALID_NODE_TYPES as readonly string[]).includes(nodeType)) nodeType = 'action';

    if (actionType === 'wait_delay') {
      config.actionType = 'wait_delay';
      const duration = Number(config.duration);
      config.duration = Number.isFinite(duration) && duration > 0 ? duration : 1;
      if (!['minutes', 'hours', 'days'].includes(String(config.unit))) config.unit = 'hours';
    } else {
      config.actionType = actionType;
    }

    steps.push({ nodeType, actionType, title, config });
  }

  if (steps.length === 0) {
    steps.push({
      nodeType: 'ai_action',
      actionType: 'ai_analysis',
      title: 'AI Analysis',
      config: { actionType: 'ai_analysis' },
    });
  }

  const name = str(raw.name) || 'AI Generated Workflow';

  return {
    name: name.substring(0, 80),
    description: str(raw.description).substring(0, 300),
    triggerType,
    triggerConfig,
    steps,
  };
}

/** Build the exact payload shape the workflow builder posts to POST /api/workflows. */
function buildWorkflowPayload(gen: GeneratedWorkflow, status: 'draft' | 'active') {
  const nodes = [
    {
      id: 'trigger',
      type: 'trigger',
      title: gen.triggerType.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      config: gen.triggerConfig,
    },
    ...gen.steps.map((s, i) => ({
      id: `node_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`,
      type: s.nodeType,
      title: s.title,
      config: s.config,
    })),
  ];
  const actionNodes = nodes.slice(1);
  const edges = actionNodes.map((n, i) => ({
    id: `e_${i}`,
    source: i === 0 ? 'trigger' : actionNodes[i - 1].id,
    target: n.id,
  }));
  const steps = actionNodes.map((n, i) => ({
    type: n.type,
    name: n.title,
    config: n.config,
    order: i,
  }));

  return {
    name: gen.name,
    description: gen.description,
    triggerType: gen.triggerType,
    triggerConfig: gen.triggerConfig,
    nodes,
    edges,
    steps,
    status,
  };
}

export async function POST(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      // ── 1. Elite-only gate (server-side enforcement) ─────────────
      if (user.plan !== 'elite') {
        return NextResponse.json(
          {
            error: 'Upgrade to Elite to use AI workflow creation',
            code: 'ELITE_REQUIRED',
            requiredPlan: 'elite',
          },
          { status: 403 }
        );
      }

      const body = await request.json() as { description?: string };
      const description = body.description?.trim();

      if (!description) {
        return NextResponse.json({ error: 'description is required' }, { status: 400 });
      }
      if (description.length > 2000) {
        return NextResponse.json({ error: 'description is too long (max 2000 characters)' }, { status: 400 });
      }

      // ── 2. Deduct 5 credits BEFORE generation (error if insufficient) ──
      const creditResult = await deductCredits({
        userId: user.id,
        action: 'workflow_ai_generate',
        cost: AI_WORKFLOW_COST,
        referenceId: `ai_workflow_${Date.now()}`,
      });

      if (!creditResult.success) {
        return NextResponse.json(
          {
            error: creditResult.error || `Insufficient credits. AI workflow generation costs ${AI_WORKFLOW_COST} credits.`,
            code: 'INSUFFICIENT_CREDITS',
            requiredCredits: AI_WORKFLOW_COST,
          },
          { status: 402 }
        );
      }

      // ── 3. Parse the description with Z-AI ───────────────────────
      try {
        const zai = await ZAI.create();
        const response = await zai.chat.completions.create({
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: description },
          ],
          model: 'auto',
        });

        const content = response.choices?.[0]?.message?.content || '{}';
        let cleaned = content.trim();
        if (cleaned.startsWith('```')) {
          cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
        }
        const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
        const raw = JSON.parse(jsonMatch ? jsonMatch[0] : '{}') as Record<string, unknown>;
        const generated = normalizeGenerated(raw);

        if (!generated.steps.length) {
          throw new Error('No steps generated');
        }

        return NextResponse.json({
          success: true,
          generated,
          payload: buildWorkflowPayload(generated, 'draft'),
          creditsDeducted: AI_WORKFLOW_COST,
          newBalance: creditResult.newBalance,
        });
      } catch (aiErr) {
        // Generation failed after deduction → refund so the user is not charged for a failure
        console.error('[WorkflowAiGenerate] AI generation failed:', aiErr);
        try {
          const { refundCredits } = await import('@/lib/credit-service');
          await refundCredits({
            userId: user.id,
            amount: AI_WORKFLOW_COST,
            originalAction: 'workflow_ai_generate',
          });
        } catch (refundErr) {
          console.error('[WorkflowAiGenerate] Refund failed:', refundErr);
        }
        return NextResponse.json(
          { error: 'AI could not generate a workflow from that description. No credits were charged — please try rephrasing.' },
          { status: 502 }
        );
      }
    } catch (error) {
      console.error('[WorkflowAiGenerate] Error:', error);
      const message = error instanceof Error ? error.message : 'Failed to generate workflow';
      return NextResponse.json({ error: message }, { status: 500 });
    }
  });
}
