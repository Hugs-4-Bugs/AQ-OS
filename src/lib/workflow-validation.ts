// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Workflow Definition Validation (Phase 3)
//
// Shared, single-source validation for workflow step configuration.
// Used by:
//   • workflow-service (create/update/activate gates)
//   • workflow-templates (instantiateTemplate gate)
//   • /api/workflows/[id]/execute (Run Now pre-flight, 422 repair errors)
//   • workflow-engine (structural guard so legacy/malformed definitions
//     can never silently execute — they fail honestly instead)
//
// Rules are derived from the ACTUAL action registry in
// src/lib/workflow-actions.ts (required-field checks marked "is required")
// plus the legacy executor's aliases in src/lib/workflow-executor.ts.
// No action types are invented here.
// ═══════════════════════════════════════════════════════════════════

// ===== TYPES =====

export interface StepLike {
  id?: string;
  type?: string;
  name?: string;
  title?: string;
  config?: unknown;
  order?: number;
  nextStepId?: string | null;
}

export interface ValidationIssue {
  stepIndex?: number;
  stepName?: string;
  field?: string;
  message: string;
}

export interface ValidatedStep {
  id: string;
  type: string;
  name: string;
  config: Record<string, unknown>;
  order: number;
  nextStepId?: string;
  actionType: string;
}

export interface DefinitionValidation {
  valid: boolean;
  issues: ValidationIssue[];
  steps: ValidatedStep[];
}

// ===== ACTION CONFIG RULES =====
// required: every listed field must be present and non-empty.
// anyOf: at least ONE field of each group must be present and non-empty
//        (used where the runtime accepts alternative field names).

interface ActionRule {
  label: string;
  required?: string[];
  anyOf?: string[][];
}

export const ACTION_CONFIG_RULES: Record<string, ActionRule> = {
  // ── Messaging ──────────────────────────────────────────────────
  send_email: { label: 'Send Email', required: ['subject', 'body'] },
  create_gmail_draft: { label: 'Create Gmail Draft', required: ['subject', 'body'] },
  send_gmail_draft: { label: 'Send Gmail Draft', required: ['subject', 'body'] },
  send_telegram: { label: 'Send Telegram', required: ['message'] },
  send_whatsapp: { label: 'Send WhatsApp', required: ['message'] },

  // ── AI ─────────────────────────────────────────────────────────
  ai_analysis: { label: 'AI Analysis' },
  ai_outreach: { label: 'AI Outreach' },
  score_lead: { label: 'Score Lead' },

  // ── Lead operations ────────────────────────────────────────────
  move_lead_stage: { label: 'Move Lead Stage', anyOf: [['targetStage', 'stage']] },
  move_to_stage: { label: 'Move Lead Stage', anyOf: [['targetStage', 'stage']] },
  update_tags: { label: 'Update Tags', anyOf: [['tags', 'tag']] },
  add_tag: { label: 'Update Tags', anyOf: [['tags', 'tag']] },
  add_note: { label: 'Record Activity / Add Note', required: ['content'] },

  // ── Utility ────────────────────────────────────────────────────
  create_notification: { label: 'Create Notification', required: ['title', 'message'] },
  wait_delay: { label: 'Wait / Delay', required: ['duration'] },
  conditional_branch: { label: 'Conditional Branch', required: ['field', 'operator'] },
  webhook_call: { label: 'Webhook Call', required: ['url'] },
  export_data: { label: 'Export Data', required: ['dataType'] },
  notify_low_credits: { label: 'Notify Low Credits' },
  notify_trial_ending: { label: 'Notify Trial Ending' },

  // ── Legacy-executor action aliases (nodes-based definitions that
  //    the legacy engine still runs, e.g. via autopilot). Known so
  //    validation does not falsely reject them; no strict fields —
  //    the legacy handlers carry their own defaults. ─────────────
  send_gmail_reply: { label: 'Send Gmail Reply' },
  generate_ai_message: { label: 'Generate AI Message' },
  ai_analyze: { label: 'AI Analysis (legacy)' },
  update_lead_field: { label: 'Update Lead Field' },
  credit_check: { label: 'Credit Check' },
};

export const KNOWN_ACTION_TYPES = Object.keys(ACTION_CONFIG_RULES);

/** Structural node types stored in WorkflowStep.type / node.type. */
export const STRUCTURAL_NODE_TYPES = ['action', 'condition', 'delay', 'ai_action'];

/** Structural node type → action type alias. */
const NODE_TYPE_ALIASES: Record<string, string> = {
  delay: 'wait_delay',
  condition: 'conditional_branch',
};

// ===== FIELD VALUE HELPERS =====

function isFilled(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.length > 0;
  return true; // objects/booleans count as filled
}

/**
 * Safely parse a step config that may be a JSON string (persisted
 * WorkflowStep.config), an object (builder payload / node config), or
 * junk (legacy/malformed rows). Returns null when unparseable.
 */
export function parseStepConfig(config: unknown): Record<string, unknown> | null {
  if (config === undefined || config === null) return {};
  if (typeof config === 'object' && !Array.isArray(config)) {
    return config as Record<string, unknown>;
  }
  if (typeof config === 'string') {
    const trimmed = config.trim();
    if (trimmed.length === 0) return {};
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
      return null; // valid JSON, wrong shape
    } catch {
      return null; // malformed JSON
    }
  }
  return null;
}

/** Resolve the executable action type for a step/node. */
export function resolveActionType(step: StepLike, config: Record<string, unknown>): string {
  const explicit = config.actionType;
  if (typeof explicit === 'string' && explicit.trim().length > 0) {
    return explicit.trim();
  }
  const type = String(step.type || '').trim();
  if (NODE_TYPE_ALIASES[type]) return NODE_TYPE_ALIASES[type];
  return type;
}

// ===== STEP LOADING (shared by engine + validation) =====

/**
 * Load the executable step list from persisted workflow data using the
 * SAME precedence the execution engine uses: explicit WorkflowStep rows
 * first, then the nodes JSON (trigger node filtered out).
 *
 * Unlike the engine's historical inline parsing, this NEVER silently
 * swallows malformed JSON — unparseable rows surface as issues so the
 * caller can reject/repair instead of executing a broken definition.
 */
export function loadSteps(
  workflowSteps: StepLike[] | undefined | null,
  nodesJson: string | null | undefined
): { steps: ValidatedStep[]; issues: ValidationIssue[] } {
  const issues: ValidationIssue[] = [];
  const steps: ValidatedStep[] = [];

  const rows = Array.isArray(workflowSteps) ? workflowSteps : [];
  if (rows.length > 0) {
    rows.forEach((row, index) => {
      const config = parseStepConfig(row.config);
      if (config === null) {
        issues.push({
          stepIndex: index,
          stepName: row.name || row.title || `Step ${index + 1}`,
          message: `Step "${row.name || row.title || `Step ${index + 1}`}": configuration is malformed (invalid JSON) — repair this step before running.`,
        });
        return;
      }
      steps.push({
        id: String(row.id || `step-${index}`),
        type: String(row.type || 'action'),
        name: String(row.name || row.title || `Step ${index + 1}`),
        config,
        order: typeof row.order === 'number' ? row.order : index,
        nextStepId: row.nextStepId || undefined,
        actionType: resolveActionType(row, config),
      });
    });
    return { steps, issues };
  }

  // Fallback: nodes JSON (definitions saved without WorkflowStep rows —
  // the legacy/autopilot format).
  let nodes: unknown[] = [];
  if (typeof nodesJson === 'string' && nodesJson.trim().length > 0) {
    try {
      const parsed = JSON.parse(nodesJson);
      if (Array.isArray(parsed)) {
        nodes = parsed as Record<string, unknown>[];
      } else {
        issues.push({ message: 'Workflow nodes are malformed (not a list) — repair the workflow before running.' });
      }
    } catch {
      issues.push({ message: 'Workflow nodes are malformed (invalid JSON) — repair the workflow before running.' });
    }
  }

  nodes
    .filter((n) => String((n as Record<string, unknown>).type) !== 'trigger')
    .forEach((raw, i) => {
      const n = raw as Record<string, unknown>;
      const config = parseStepConfig(n.config);
      if (config === null) {
        issues.push({
          stepIndex: i,
          stepName: String(n.title || n.name || `Step ${i + 1}`),
          message: `Step "${String(n.title || n.name || `Step ${i + 1}`)}": configuration is malformed (invalid JSON) — repair this step before running.`,
        });
        return;
      }
      steps.push({
        id: String(n.id || `step-${i}`),
        type: String(n.type || 'action'),
        name: String(n.title || n.name || `Step ${i + 1}`),
        config,
        order: i,
        actionType: resolveActionType(n as StepLike, config),
      });
    });

  return { steps, issues };
}

// ===== VALIDATION =====

/**
 * Strict definition validation — used at save/enable/Run Now time.
 * Checks: at least one executable step; every action type known;
 * every action's required configuration present.
 */
export function validateDefinition(
  workflowSteps: StepLike[] | undefined | null,
  nodesJson: string | null | undefined
): DefinitionValidation {
  const { steps, issues } = loadSteps(workflowSteps, nodesJson);

  if (steps.length === 0 && issues.length === 0) {
    issues.push({
      message: 'Workflow has no steps — add at least one step before enabling or running it.',
    });
  }

  steps.forEach((step, index) => {
    const rule = ACTION_CONFIG_RULES[step.actionType];
    if (!rule) {
      issues.push({
        stepIndex: index,
        stepName: step.name,
        message: `Unsupported action type "${step.actionType}" — remove or replace this step.`,
      });
      return;
    }
    for (const field of rule.required || []) {
      if (!isFilled(step.config[field])) {
        issues.push({
          stepIndex: index,
          stepName: step.name,
          field,
          message: `Step ${index + 1} (${rule.label}): ${field} is required.`,
        });
      }
    }
    for (const group of rule.anyOf || []) {
      if (!group.some((field) => isFilled(step.config[field]))) {
        issues.push({
          stepIndex: index,
          stepName: step.name,
          field: group.join(' or '),
          message: `Step ${index + 1} (${rule.label}): ${group.join(' or ')} is required.`,
        });
      }
    }
  });

  return { valid: issues.length === 0, issues, steps };
}

/**
 * Structural validation for the execution engine (defense in depth for
 * webhook/trigger/scheduled paths that bypass the API gates): the
 * definition must yield at least one executable step and every step
 * config must parse. Action-level required fields are NOT re-checked
 * here — the engine's action handlers keep their runtime fallbacks
 * (e.g. contextual note derivation) for legacy rows.
 */
export function loadStepsForExecution(
  workflowSteps: StepLike[] | undefined | null,
  nodesJson: string | null | undefined
): { ok: true; steps: ValidatedStep[] } | { ok: false; error: string; steps: ValidatedStep[] } {
  const { steps, issues } = loadSteps(workflowSteps, nodesJson);
  if (steps.length === 0 || issues.length > 0) {
    const error = issues.length > 0
      ? `Invalid workflow definition: ${issues.map((i) => i.message).join(' ')}`
      : 'Invalid workflow definition: the workflow has no executable steps.';
    return { ok: false, error, steps };
  }
  return { ok: true, steps };
}

/** Human-readable one-line summary for API error responses. */
export function formatIssues(issues: ValidationIssue[]): string {
  return issues.map((i) => i.message).join(' ');
}
