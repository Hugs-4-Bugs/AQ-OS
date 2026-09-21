// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Workflow Executor
// Heavy module: execution engine, action executor, execution control
// Only imported by routes that need to execute/control workflows
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { publishWorkflowEvent } from '@/lib/realtime-engine';
import { createNotificationOnce } from '@/lib/notification-service';
import {
  type WorkflowNode,
  type WorkflowEdge,
  generateIdempotencyKey,
  generateWebhookPath,
  auditLog,
  syncSteps,
  getWorkflow,
} from '@/lib/workflow-utils';

// ── Execution Engine ──────────────────────────────────────────────

/** Queue a workflow for execution */
export async function executeWorkflow(
  workflowId: string,
  userId: string,
  triggerData?: Record<string, unknown>,
  idempotencyKey?: string
) {
  // Check workflow exists and is active
  const workflow = await db.workflowDefinition.findFirst({
    where: { id: workflowId, status: 'active' },
  });

  if (!workflow) {
    throw new Error('Workflow not found or not active');
  }

  // Check idempotency
  const key = idempotencyKey || generateIdempotencyKey();
  if (idempotencyKey) {
    const existing = await db.workflowExecution.findFirst({
      where: { idempotencyKey: key },
    });
    if (existing) {
      return existing; // Already queued/running
    }
  }

  // Check concurrency limit
  const runningCount = await db.workflowExecution.count({
    where: {
      workflowId,
      status: { in: ['queued', 'running'] },
    },
  });

  if (workflow.maxConcurrency !== null && runningCount >= workflow.maxConcurrency) {
    throw new Error('Workflow concurrency limit reached');
  }

  const nodes: WorkflowNode[] = JSON.parse(workflow.nodes);
  const actionNodes = nodes.filter((n) => n.type !== 'trigger');

  // Create execution record
  const execution = await db.workflowExecution.create({
    data: {
      workflowId,
      userId,
      status: 'queued',
      triggerData: triggerData ? JSON.stringify(triggerData) : null,
      currentStep: 0,
      totalSteps: actionNodes.length,
      maxRetries: workflow.maxRetries ?? undefined,
      idempotencyKey: key,
    },
  });

  await auditLog(userId, 'workflow_executed', workflowId, {
    executionId: execution.id,
    triggerType: workflow.triggerType,
  });

  // Process execution asynchronously (non-blocking)
  processExecution(execution.id).catch((err) => {
    console.error('[WorkflowService] processExecution error:', err);
  });

  return execution;
}

/** The CORE execution engine — processes a single execution */
export async function processExecution(executionId: string): Promise<void> {
  const execution = await db.workflowExecution.findUnique({
    where: { id: executionId },
    include: { workflow: true },
  });

  if (!execution || execution.status === 'cancelled') return;

  const workflow = execution.workflow;
  const nodes: WorkflowNode[] = JSON.parse(workflow.nodes);
  const edges: WorkflowEdge[] = JSON.parse(workflow.edges);
  const actionNodes = nodes.filter((n) => n.type !== 'trigger');

  // Mark as running
  if (execution.status === 'queued') {
    await db.workflowExecution.update({
      where: { id: executionId },
      data: {
        status: 'running',
        startedAt: new Date(),
        totalSteps: actionNodes.length,
      },
    });
  }

  const startTime = Date.now();
  let currentStep = execution.currentStep;
  let lastError: string | null = null;

  // Build a map for edge traversal
  const edgeMap = new Map<string, WorkflowEdge[]>();
  for (const edge of edges) {
    const existing = edgeMap.get(edge.source) || [];
    existing.push(edge);
    edgeMap.set(edge.source, existing);
  }

  // Get trigger data for context
  const triggerData = execution.triggerData ? JSON.parse(execution.triggerData) : {};
  const stepResults: Record<string, unknown> = {};
  const context: Record<string, unknown> = { triggerData, stepResults };

  // Find starting node (first non-trigger node connected from trigger)
  let currentNode: WorkflowNode | null = null;
  const triggerNode = nodes.find((n) => n.type === 'trigger');
  if (triggerNode) {
    const triggerEdges = edgeMap.get(triggerNode.id) || [];
    if (triggerEdges.length > 0) {
      const firstTarget = triggerEdges[0].target;
      currentNode = actionNodes.find((n) => n.id === firstTarget) || actionNodes[0] || null;
    }
  }
  if (!currentNode && actionNodes.length > 0) {
    currentNode = actionNodes[0];
  }

  // Execute steps sequentially
  let stepIndex = currentStep;
  const nodesToProcess = actionNodes.slice(stepIndex);

  for (const step of nodesToProcess) {
    // Check if execution was paused or cancelled
    const currentExec = await db.workflowExecution.findUnique({
      where: { id: executionId },
    });
    if (!currentExec) break;
    if (currentExec.status === 'paused') return;
    if (currentExec.status === 'cancelled') return;

    const stepStartTime = Date.now();
    let attempt = 0;
    const maxRetries = workflow.maxRetries ?? 0;
    let stepSuccess = false;
    let stepOutput: Record<string, unknown> = {};
    let stepError: string | null = null;

    while (attempt <= maxRetries && !stepSuccess) {
      try {
        const result = await executeStepAction(step, context, execution.userId || undefined);
        stepOutput = result;
        stepSuccess = true;
        stepResults[step.id] = result;
      } catch (error) {
        attempt++;
        stepError = error instanceof Error ? error.message : String(error);

        if (attempt <= maxRetries) {
          // Wait before retry (exponential backoff)
          const delayMs = Math.min(1000 * Math.pow(2, attempt - 1), 30000);
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }
    }

    const durationMs = Date.now() - stepStartTime;

    // Create log entry
    await db.workflowLog.create({
      data: {
        executionId,
        stepName: step.title,
        stepType: step.type,
        status: stepSuccess ? 'success' : 'failed',
        input: JSON.stringify(step.config),
        output: stepSuccess ? JSON.stringify(stepOutput) : null,
        error: stepError,
        durationMs,
        retryAttempt: attempt > 0 ? attempt - 1 : 0,
        userId: execution.userId,
      },
    });

    // Update current step
    await db.workflowExecution.update({
      where: { id: executionId },
      data: { currentStep: stepIndex + 1 },
    });

    stepIndex++;

    if (!stepSuccess) {
      // Step failed after all retries
      lastError = stepError;

      // Check if this is a conditional branch — if so, follow failure path
      if (step.type === 'condition' || step.type === 'conditional_branch') {
        // Try to follow the failure/false branch
        const failEdges = (edgeMap.get(step.id) || []).filter(
          (e) => e.sourceHandle === 'false' || e.sourceHandle === 'failure'
        );
        if (failEdges.length > 0) {
          // Continue on the failure branch instead of failing
          continue;
        }
      }

      // Mark execution as failed / dead letter
      const isDeadLetter = attempt > maxRetries;
      await db.workflowExecution.update({
        where: { id: executionId },
        data: {
          status: 'failed',
          error: lastError,
          completedAt: new Date(),
          durationMs: Date.now() - startTime,
          isDeadLetter,
          deadLetterReason: isDeadLetter ? `Step "${step.title}" failed after ${maxRetries} retries: ${lastError}` : null,
        },
      });

      // Update workflow stats
      await updateWorkflowStats(workflow.id, false, Date.now() - startTime);

      // User-facing notification — only for real users (skip the synthetic
      // 'system' owner), safe message (raw error stays in the execution row).
      const failedOwner = execution.userId || 'system';
      if (failedOwner !== 'system') {
        await createNotificationOnce({
          userId: failedOwner,
          type: 'workflow_failed',
          title: 'Workflow execution failed',
          message: `A workflow run stopped at step "${step.title || 'unknown'}" after ${maxRetries} retr${maxRetries === 1 ? 'y' : 'ies'}. You can retry it from the Workflows page.`,
          actionUrl: '/business-ai/workflows',
          metadata: { workflowId: workflow.id, executionId, failedStep: step.title, isDeadLetter },
          dedupeKey: `wfexec:${executionId}:failed`,
        }).catch(() => {
          // Never fail the execution path because of a notification problem
        });
      }

      await publishWorkflowEvent(execution.userId || 'system', 'step_failed', {
        workflowId: workflow.id,
        executionId,
        stepName: step.title,
        error: lastError,
      });

      await auditLog(execution.userId || 'system', 'workflow_failed', workflow.id, {
        executionId,
        stepName: step.title,
        error: lastError,
        isDeadLetter,
      });

      return;
    }

    // For conditional branches, determine the next node via edges
    if (step.type === 'condition' || step.type === 'conditional_branch') {
      const branchResult = stepOutput.branch || 'true';
      const handleKey = branchResult === 'true' ? 'true' : 'false';
      const branchEdges = (edgeMap.get(step.id) || []).filter(
        (e) => e.sourceHandle === handleKey
      );

      if (branchEdges.length > 0) {
        const nextNodeId = branchEdges[0].target;
        const nextIdx = actionNodes.findIndex((n) => n.id === nextNodeId);
        if (nextIdx >= 0) {
          // Skip to that step
          stepIndex = nextIdx;
        }
      }
    }

    // For delay steps, we just record and continue (in real prod this would schedule)
  }

  // All steps completed successfully
  const totalDuration = Date.now() - startTime;

  await db.workflowExecution.update({
    where: { id: executionId },
    data: {
      status: 'completed',
      completedAt: new Date(),
      durationMs: totalDuration,
    },
  });

  // Update workflow stats
  await updateWorkflowStats(workflow.id, true, totalDuration);

  // Update lastRunAt
  await db.workflowDefinition.update({
    where: { id: workflow.id },
    data: { lastRunAt: new Date() },
  });

  await publishWorkflowEvent(execution.userId || 'system', 'execution_completed', {
    workflowId: workflow.id,
    executionId,
    durationMs: totalDuration,
  });

  // User-facing notification — only for real users (skip 'system' owner);
  // deduped per execution so replay/retry cannot double-notify.
  const completedOwner = execution.userId || 'system';
  if (completedOwner !== 'system') {
    await createNotificationOnce({
      userId: completedOwner,
      type: 'workflow_completed',
      title: 'Workflow completed',
      message: `A workflow run finished successfully in ${totalDuration < 1000 ? `${totalDuration}ms` : `${Math.round(totalDuration / 1000)}s`}.`,
      actionUrl: '/business-ai/workflows',
      metadata: { workflowId: workflow.id, executionId, durationMs: totalDuration },
      dedupeKey: `wfexec:${executionId}:completed`,
    }).catch(() => {
      // Never fail the execution path because of a notification problem
    });
  }

  await auditLog(execution.userId || 'system', 'workflow_completed', workflow.id, {
    executionId,
    durationMs: totalDuration,
  });
}

/** Execute a single step action based on its type and config */
async function executeStepAction(
  step: WorkflowNode,
  context: Record<string, unknown>,
  userId?: string
): Promise<Record<string, unknown>> {
  const config = step.config;
  const triggerData = (context.triggerData || {}) as Record<string, unknown>;
  const leadId = (config.leadId as string) || (triggerData.leadId as string) || null;

  // Resolve the effective action type from config if step.type is a category
  const effectiveType = (step.config?.actionType as string) || step.type;

  switch (effectiveType) {
    case 'send_email': {
      if (!leadId) throw new Error('No lead ID for send_email step');
      const lead = await db.lead.findUnique({ where: { id: leadId } });
      if (!lead) throw new Error(`Lead ${leadId} not found`);

      const message = await db.outreachMessage.create({
        data: {
          leadId,
          userId: userId || null,
          channel: 'email',
          direction: 'outbound',
          subject: (config.subject as string) || 'Outreach',
          content: (config.content as string) || `Email to ${lead.businessName}`,
          status: 'queued',
          generatedByAI: false,
          metadata: JSON.stringify({ workflowStepId: step.id }),
        },
      });

      return { messageId: message.id, channel: 'email', leadId };
    }

    case 'send_whatsapp': {
      if (!leadId) throw new Error('No lead ID for send_whatsapp step');
      const message = await db.messageDelivery.create({
        data: {
          userId: userId || 'system',
          leadId,
          channel: 'whatsapp',
          direction: 'outbound',
          status: 'pending',
          content: (config.content as string) || 'WhatsApp message',
          recipientId: (config.recipient as string) || null,
        },
      });

      return { deliveryId: message.id, channel: 'whatsapp', leadId };
    }

    case 'send_telegram': {
      const message = await db.messageDelivery.create({
        data: {
          userId: userId || 'system',
          leadId,
          channel: 'telegram',
          direction: 'outbound',
          status: 'pending',
          content: (config.content as string) || 'Telegram message',
          recipientId: (config.recipient as string) || null,
        },
      });

      // Update with tracking info
      await db.messageDelivery.update({
        where: { id: message.id },
        data: {
          providerMessageId: `tg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          metadata: JSON.stringify({
            workflowStepId: step.id,
            trackingEnabled: true,
            sentVia: 'workflow',
          }),
        },
      });

      return { deliveryId: message.id, channel: 'telegram', trackingEnabled: true };
    }

    case 'send_gmail_reply': {
      if (!leadId) throw new Error('No lead ID for send_gmail_reply step');
      const lead = await db.lead.findUnique({ where: { id: leadId } });
      if (!lead) throw new Error(`Lead ${leadId} not found`);

      // Find the most recent email thread for this lead
      const lastEmail = await db.outreachMessage.findFirst({
        where: { leadId, channel: 'email', direction: 'outbound' },
        orderBy: { createdAt: 'desc' },
      });

      const message = await db.outreachMessage.create({
        data: {
          leadId,
          userId: userId || null,
          channel: 'email',
          direction: 'outbound',
          subject: lastEmail ? `Re: ${lastEmail.subject}` : ((config.subject as string) || 'Reply'),
          content: (config.content as string) || `Reply to ${lead.businessName}`,
          status: 'queued',
          generatedByAI: false,
          metadata: JSON.stringify({
            workflowStepId: step.id,
            type: 'gmail_reply',
            replyToId: lastEmail?.id || null,
          }),
        },
      });

      return { messageId: message.id, channel: 'gmail', leadId, status: 'reply', replyToId: lastEmail?.id };
    }

    case 'move_to_stage': {
      if (!leadId) throw new Error('No lead ID for move_to_stage step');
      const targetStage = (config.targetStage as string) || (config.stage as string);
      if (!targetStage) throw new Error('No target stage specified');

      const lead = await db.lead.findUnique({ where: { id: leadId } });
      if (!lead) throw new Error(`Lead ${leadId} not found`);

      await db.lead.update({
        where: { id: leadId },
        data: { stage: targetStage },
      });

      await db.leadActivity.create({
        data: {
          leadId,
          type: 'stage_change',
          description: `Moved to ${targetStage} via workflow`,
          metadata: JSON.stringify({ fromStage: lead.stage, toStage: targetStage }),
        },
      });

      return { leadId, previousStage: lead.stage, newStage: targetStage };
    }

    case 'add_note': {
      if (!leadId) throw new Error('No lead ID for add_note step');
      const content = (config.content as string) || 'Note added by workflow';

      const note = await db.leadNote.create({
        data: {
          leadId,
          userId: userId || 'system',
          content,
        },
      });

      return { noteId: note.id, leadId };
    }

    case 'add_tag': {
      if (!leadId) throw new Error('No lead ID for add_tag step');
      const tagsToAdd = (config.tags as string[]) || [];
      if (tagsToAdd.length === 0) throw new Error('No tags specified');

      const lead = await db.lead.findUnique({ where: { id: leadId } });
      if (!lead) throw new Error(`Lead ${leadId} not found`);

      const existingTags: string[] = JSON.parse(lead.tags);
      const merged = Array.from(new Set([...existingTags, ...tagsToAdd]));

      await db.lead.update({
        where: { id: leadId },
        data: { tags: JSON.stringify(merged) },
      });

      return { leadId, tags: merged, added: tagsToAdd };
    }

    case 'generate_ai_message': {
      const prompt = (config.prompt as string) || 'Generate a professional outreach message';
      const contextStr = (config.context as string) || '';

      try {
        const ZAI = (await import('z-ai-web-dev-sdk')).default;
        const zai = await ZAI.create();
        const response = await zai.chat.completions.create({
          messages: [
            {
              role: 'system',
              content: 'You are a professional outreach assistant. Generate concise, personalized messages.',
            },
            { role: 'user', content: `${prompt}\n\nContext: ${contextStr}` },
          ],
          thinking: { type: 'disabled' },
        });

        const generatedMessage = response.choices?.[0]?.message?.content || 'Generated message';

        return { generatedMessage, prompt };
      } catch (error) {
        // If AI SDK fails, return a fallback
        console.error('[WorkflowService] AI message generation failed:', error);
        return { generatedMessage: 'AI message generation failed — manual review needed', prompt, error: String(error) };
      }
    }

    case 'conditional_branch':
    case 'condition': {
      const field = (config.field as string) || 'score';
      const operator = (config.operator as string) || '>';
      const value = (config.value as string) || '0';

      // Get the actual value from trigger data or lead
      let actualValue: unknown = triggerData[field];
      if (leadId && actualValue === undefined) {
        const lead = await db.lead.findUnique({ where: { id: leadId } });
        if (lead) {
          actualValue = (lead as Record<string, unknown>)[field];
        }
      }

      let conditionMet = false;
      const numValue = Number(value);
      const numActual = Number(actualValue);

      if (!isNaN(numValue) && !isNaN(numActual)) {
        switch (operator) {
          case '>': conditionMet = numActual > numValue; break;
          case '>=': conditionMet = numActual >= numValue; break;
          case '<': conditionMet = numActual < numValue; break;
          case '<=': conditionMet = numActual <= numValue; break;
          case '==': case '===': conditionMet = numActual === numValue; break;
          case '!=': case '!==': conditionMet = numActual !== numValue; break;
        }
      } else {
        const strActual = String(actualValue || '');
        switch (operator) {
          case '==': case '===': conditionMet = strActual === value; break;
          case '!=': case '!==': conditionMet = strActual !== value; break;
          case 'contains': conditionMet = strActual.includes(value); break;
          case 'not_in': conditionMet = !value.split(',').includes(strActual); break;
          case 'in': conditionMet = value.split(',').includes(strActual); break;
        }
      }

      return { branch: conditionMet ? 'true' : 'false', field, operator, value, actualValue };
    }

    case 'wait_delay':
    case 'delay': {
      const duration = Number(config.duration) || 1;
      const unit = (config.unit as string) || 'minutes';

      // In production, this would schedule continuation. For now, we record the delay.
      // We don't actually block the process — the delay is logged.
      let delayMs = duration * 60 * 1000; // default minutes
      if (unit === 'seconds') delayMs = duration * 1000;
      if (unit === 'hours') delayMs = duration * 60 * 60 * 1000;
      if (unit === 'days') delayMs = duration * 24 * 60 * 60 * 1000;

      return { duration, unit, delayMs, note: 'Delay recorded in workflow log' };
    }

    case 'webhook_call': {
      const url = (config.url as string) || '';
      const method = (config.method as string) || 'POST';
      const body = config.body || triggerData;

      if (!url) throw new Error('No URL specified for webhook call');

      try {
        const response = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        const responseText = await response.text();
        return { statusCode: response.status, response: responseText.slice(0, 1000) };
      } catch (error) {
        throw new Error(`Webhook call failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    case 'send_gmail_draft': {
      if (!leadId) throw new Error('No lead ID for send_gmail_draft step');
      const lead = await db.lead.findUnique({ where: { id: leadId } });
      if (!lead) throw new Error(`Lead ${leadId} not found`);

      const message = await db.outreachMessage.create({
        data: {
          leadId,
          userId: userId || null,
          channel: 'email',
          direction: 'outbound',
          subject: (config.subject as string) || 'Draft',
          content: (config.content as string) || `Draft email to ${lead.businessName}`,
          status: 'draft',
          generatedByAI: false,
          metadata: JSON.stringify({ workflowStepId: step.id, type: 'gmail_draft' }),
        },
      });

      return { messageId: message.id, channel: 'gmail', leadId, status: 'draft' };
    }

    case 'ai_analyze': {
      if (!leadId) throw new Error('No lead ID for ai_analyze step');

      const lead = await db.lead.findUnique({ where: { id: leadId } });
      if (!lead) throw new Error(`Lead ${leadId} not found`);

      try {
        const ZAI = (await import('z-ai-web-dev-sdk')).default;
        const zai = await ZAI.create();
        const response = await zai.chat.completions.create({
          messages: [
            {
              role: 'system',
              content: 'You are a lead analysis AI. Analyze the lead and provide scores (0-100) for: replyScore, conversionScore, urgencyScore, revenuePotentialScore. Return JSON only.',
            },
            {
              role: 'user',
              content: `Analyze this lead: ${JSON.stringify({
                businessName: lead.businessName,
                niche: lead.niche,
                website: lead.website,
                city: lead.city,
                country: lead.country,
                stage: lead.stage,
              })}`,
            },
          ],
          thinking: { type: 'disabled' },
        });

        const content = response.choices?.[0]?.message?.content || '{}';
        let scores: Record<string, number> = {};
        try {
          const parsed = JSON.parse(content);
          scores = parsed;
        } catch {
          // If AI didn't return valid JSON, use defaults
          scores = { replyScore: 50, conversionScore: 50, urgencyScore: 50, revenuePotentialScore: 50 };
        }

        // Update lead scores
        await db.lead.update({
          where: { id: leadId },
          data: {
            replyScore: scores.replyScore || lead.replyScore,
            conversionScore: scores.conversionScore || lead.conversionScore,
            urgencyScore: scores.urgencyScore || lead.urgencyScore,
            revenuePotentialScore: scores.revenuePotentialScore || lead.revenuePotentialScore,
          },
        });

        return { leadId, scores, analysis: content };
      } catch (error) {
        console.error('[WorkflowService] AI analyze failed:', error);
        return { leadId, error: String(error) };
      }
    }

    case 'update_lead_field': {
      if (!leadId) throw new Error('No lead ID for update_lead_field step');
      const field = (config.field as string) || '';
      const value = config.value;

      if (!field) throw new Error('No field specified');

      const allowedFields = [
        'stage', 'emailStatus', 'estimatedQuality', 'estimatedRevenue',
        'websiteQuality', 'bestContactPerson', 'bestChannel', 'bestTiming',
        'outreachStyle', 'niche', 'city', 'country', 'notes',
      ];

      if (!allowedFields.includes(field)) {
        throw new Error(`Field "${field}" is not allowed to be updated via workflow`);
      }

      await db.lead.update({
        where: { id: leadId },
        data: { [field]: value },
      });

      return { leadId, field, value };
    }

    case 'credit_check': {
      if (!userId) throw new Error('No user ID for credit_check step');
      const threshold = Number(config.threshold) || 10;

      const user = await db.user.findUnique({ where: { id: userId } });
      if (!user) throw new Error(`User ${userId} not found`);

      const sufficient = user.credits >= threshold;

      return { credits: user.credits, threshold, sufficient };
    }

    default:
      return { note: `Unknown step type: ${effectiveType}`, config };
  }
}

/** Update workflow stats after execution */
async function updateWorkflowStats(
  workflowId: string,
  success: boolean,
  durationMs: number
): Promise<void> {
  const workflow = await db.workflowDefinition.findUnique({
    where: { id: workflowId },
  });
  if (!workflow) return;

  const runCount = workflow.runCount + 1;
  const successCount = workflow.successCount + (success ? 1 : 0);
  const failureCount = workflow.failureCount + (success ? 0 : 1);
  const avgRuntimeMs = Math.round(
    ((workflow.avgRuntimeMs ?? 0) * workflow.runCount + durationMs) / runCount
  );

  await db.workflowDefinition.update({
    where: { id: workflowId },
    data: {
      runCount,
      successCount,
      failureCount,
      avgRuntimeMs,
    },
  });
}

// ── Execution Control ──────────────────────────────────────────────

/** Pause a running execution */
export async function pauseExecution(executionId: string, userId: string) {
  const execution = await db.workflowExecution.findUnique({
    where: { id: executionId },
  });

  if (!execution) throw new Error('Execution not found');
  if (execution.status !== 'running') throw new Error('Execution is not running');

  await db.workflowExecution.update({
    where: { id: executionId },
    data: { status: 'paused', pausedAt: new Date() },
  });

  await auditLog(userId, 'workflow_paused', execution.workflowId, { executionId });

  return { id: executionId, status: 'paused' };
}

/** Resume a paused execution */
export async function resumeExecution(executionId: string, userId: string) {
  const execution = await db.workflowExecution.findUnique({
    where: { id: executionId },
  });

  if (!execution) throw new Error('Execution not found');
  if (execution.status !== 'paused') throw new Error('Execution is not paused');

  await db.workflowExecution.update({
    where: { id: executionId },
    data: { status: 'running', resumedAt: new Date() },
  });

  await auditLog(userId, 'workflow_resumed', execution.workflowId, { executionId });

  // Continue processing
  processExecution(executionId).catch((err) => {
    console.error('[WorkflowService] Resume processExecution error:', err);
  });

  return { id: executionId, status: 'running' };
}

/** Cancel an execution */
export async function cancelExecution(executionId: string, userId: string) {
  const execution = await db.workflowExecution.findUnique({
    where: { id: executionId },
  });

  if (!execution) throw new Error('Execution not found');
  if (!['queued', 'running', 'paused'].includes(execution.status)) {
    throw new Error('Execution cannot be cancelled in current state');
  }

  await db.workflowExecution.update({
    where: { id: executionId },
    data: { status: 'cancelled', completedAt: new Date() },
  });

  await auditLog(userId, 'workflow_cancelled', execution.workflowId, { executionId });

  return { id: executionId, status: 'cancelled' };
}

// ── Webhook Trigger ──────────────────────────────────────────────

/** Handle webhook trigger */
export async function handleWebhookTrigger(
  webhookPath: string,
  body: Record<string, unknown>
) {
  const workflow = await db.workflowDefinition.findFirst({
    where: { webhookPath, status: 'active' },
  });

  if (!workflow) {
    throw new Error('No active workflow found for this webhook path');
  }

  return executeWorkflow(workflow.id, workflow.userId, body);
}

// ── Retry Execution ──────────────────────────────────────────────

/** Retry a failed execution */
export async function retryExecution(executionId: string, userId: string) {
  const execution = await db.workflowExecution.findUnique({
    where: { id: executionId },
  });

  if (!execution) throw new Error('Execution not found');
  if (!['failed', 'dead_letter'].includes(execution.status)) {
    throw new Error('Execution is not in a retryable state');
  }

  await db.workflowExecution.update({
    where: { id: executionId },
    data: {
      status: 'queued',
      currentStep: 0,
      error: null,
      retryCount: execution.retryCount + 1,
      lastRetryAt: new Date(),
    },
  });

  // Clear old step logs
  await db.workflowLog.deleteMany({ where: { executionId } });

  await auditLog(userId, 'workflow_retried', execution.workflowId, { executionId });

  // Process again
  processExecution(executionId).catch((err) => {
    console.error('[WorkflowService] Retry processExecution error:', err);
  });

  return { id: executionId, status: 'queued' };
}
