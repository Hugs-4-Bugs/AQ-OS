// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Workstream D §11 — Permission Policy
//
// Explicit action categories for dangerous actions. A user controls which
// categories EACH agent may perform (Agent.permissionCategories JSON) and
// may tighten defaults globally (per-user policy column is intentionally
// NOT auto-widened — high-impact categories require explicit opt-in).
//
// Categories (per user spec §11):
//   READ              — lookup lead/profile/email data
//   ANALYZE           — reasoning, scoring, classification
//   DRAFT             — create drafts (messages, emails) — no external send
//   WRITE             — create internal records (activities, notes, CRM writes)
//   SEND              — external communication (email send/reply)
//   DELETE            — delete records
//   MODIFY            — modify existing records (lead updates, stage changes)
//   TRIGGER_WORKFLOW  — start workflow executions
//   ESCALATE_HUMAN    — request human approval / notify human channels
//
// Rules:
//   · Default agent policy grants ONLY READ + ANALYZE + DRAFT (safe set).
//   · SEND / DELETE / MODIFY / TRIGGER_WORKFLOW require explicit grant.
//   · High-impact actions (SEND) can additionally require approval
//     depending on Agent.approvalPolicy + emailPermission settings —
//     checked in agent-authz.ts, NEVER silently escalated.
//   · Category checks fail CLOSED: unknown tool → no category → denied.
// ═══════════════════════════════════════════════════════════════════

export type PermissionCategory =
  | 'READ'
  | 'ANALYZE'
  | 'DRAFT'
  | 'WRITE'
  | 'SEND'
  | 'DELETE'
  | 'MODIFY'
  | 'TRIGGER_WORKFLOW'
  | 'ESCALATE_HUMAN';

export const ALL_PERMISSION_CATEGORIES: PermissionCategory[] = [
  'READ', 'ANALYZE', 'DRAFT', 'WRITE', 'SEND', 'DELETE',
  'MODIFY', 'TRIGGER_WORKFLOW', 'ESCALATE_HUMAN',
];

/** The safe default — granted to new/custom agents without explicit config. */
export const DEFAULT_AGENT_CATEGORIES: PermissionCategory[] = ['READ', 'ANALYZE', 'DRAFT'];

/**
 * Maps a registered tool name to the permission category that governs it.
 * Fail-closed: unmapped tools require an explicit grant of the tool itself
 * via toolPermissions AND return category=null here (authorization layer
 * then denies unless the tool is read-only informational).
 */
export const TOOL_CATEGORY_MAP: Record<string, PermissionCategory> = {
  // lead tools
  'lead.lookup': 'READ',
  'lead.create': 'WRITE',
  'lead.update': 'MODIFY',
  'lead.delete': 'DELETE',
  'lead.search': 'READ',
  // workflow tools
  'workflow.start': 'TRIGGER_WORKFLOW',
  'workflow.status': 'READ',
  'workflow.cancel': 'MODIFY',
  'workflow.list': 'READ',
  // message tools
  'message.draft': 'DRAFT',
  'message.list': 'READ',
  // email tools
  'email.search': 'READ',
  'email.read': 'READ',
  'email.thread': 'READ',
  'email.draft': 'DRAFT',
  'email.send': 'SEND',
  'email.reply': 'SEND',
  // business email tools (route through connected accounts)
  'businessEmail.send': 'SEND',
  'businessEmail.reply': 'SEND',
  // profile tools
  'profile.lookup': 'READ',
  // activity tools
  'activity.log': 'WRITE',
  'activity.list': 'READ',
  // task tools
  'task.create': 'WRITE',
  'task.update': 'MODIFY',
  'task.complete': 'MODIFY',
  // escalation (Workstream D)
  'escalation.requestApproval': 'ESCALATE_HUMAN',
};

/** Category required for a given tool. null = no mapping (fail closed). */
export function categoryForTool(toolName: string): PermissionCategory | null {
  return TOOL_CATEGORY_MAP[toolName] ?? null;
}

/** Parse an agent's permissionCategories JSON safely (fail closed). */
export function parseAgentCategories(raw: string | null | undefined): PermissionCategory[] {
  if (!raw) return DEFAULT_AGENT_CATEGORIES;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_AGENT_CATEGORIES;
    const valid = parsed.filter(
      (c): c is PermissionCategory =>
        typeof c === 'string' && (ALL_PERMISSION_CATEGORIES as string[]).includes(c),
    );
    // de-duplicate, preserve order
    return Array.from(new Set(valid));
  } catch {
    return DEFAULT_AGENT_CATEGORIES;
  }
}

export interface PermissionDecision {
  allowed: boolean;
  category: PermissionCategory | null;
  reason: string;
}

/**
 * Decide whether an agent may perform a tool given its category policy.
 * Fail-closed semantics:
 *   · Unknown tool → denied (no category mapping).
 *   · Category not granted → denied.
 */
export function decideToolPermission(params: {
  toolName: string;
  agentCategories: PermissionCategory[];
}): PermissionDecision {
  const category = categoryForTool(params.toolName);
  if (!category) {
    return {
      allowed: false,
      category: null,
      reason: `Tool "${params.toolName}" has no permission-category mapping — denied (fail closed). Grant an explicit category mapping before use.`,
    };
  }
  if (!params.agentCategories.includes(category)) {
    return {
      allowed: false,
      category,
      reason: `Agent permission policy does not grant "${category}" (required by tool "${params.toolName}"). Granted: [${params.agentCategories.join(', ')}].`,
    };
  }
  return { allowed: true, category, reason: 'granted' };
}

/** Whether a category is high-impact (external or destructive effect). */
export function isHighImpactCategory(category: PermissionCategory): boolean {
  return category === 'SEND' || category === 'DELETE' || category === 'MODIFY';
}

/**
 * Whether a given tool invocation requires human approval BEFORE executing,
 * combining category policy + the agent's approvalPolicy + email permission.
 *
 * Rules (never silently escalated):
 *   · SEND-category tools: approval required unless the agent's
 *     approvalPolicy is 'autonomous' AND the tool-level permission is
 *     explicitly 'autonomous'.
 *   · DELETE-category tools: ALWAYS approval required (destructive).
 *   · Other categories: approval only when approvalPolicy='approval_required'
 *     AND the tool-level permission is 'send_with_approval'.
 */
export function requiresPreApproval(params: {
  toolName: string;
  agentCategories: PermissionCategory[];
  approvalPolicy: string; // 'autonomous' | 'approval_required'
  toolLevelPermission: string | null; // per toolPermissions JSON
}): boolean {
  const category = categoryForTool(params.toolName);
  if (category === 'DELETE') return true; // destructive — always human-gated
  if (category === 'SEND') {
    return !(params.approvalPolicy === 'autonomous' && params.toolLevelPermission === 'autonomous');
  }
  return params.approvalPolicy === 'approval_required' && params.toolLevelPermission === 'send_with_approval';
}
