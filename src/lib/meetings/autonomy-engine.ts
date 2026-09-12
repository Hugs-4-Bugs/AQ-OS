// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Autonomy Engine
// Manual / Assisted / Autonomous approval modes for meeting orchestration
//
// Three modes of operation:
// - Manual: All actions require explicit user approval before execution
// - Assisted: AI drafts proposals, user reviews and approves/rejects
// - Autonomous: AI makes decisions and executes automatically
//              within configured boundaries
//
// The autonomy engine determines:
// - Whether an action requires approval
// - Who needs to approve it
// - What the escalation path is
// - What the automatic fallback is
//
// Phase 3: Implemented getUserAutonomyMode, setUserAutonomyMode,
// evaluateAction, and daily usage tracking.
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { logAuditEvent } from '@/lib/lead-audit';
import type { MeetingProposal } from './meeting-orchestration-service';

// ===== TYPES =====

/** Autonomy mode for meeting orchestration */
export type AutonomyMode = 'manual' | 'assisted' | 'autonomous';

/** Autonomy rule — defines what actions are allowed at each autonomy level */
export interface AutonomyRule {
  action: string;
  allowedModes: AutonomyMode[];
  requiresApproval: boolean;
  maxAutoExecutionsPerDay?: number;
  cooldownMinutes?: number;
  escalationTo?: AutonomyMode;
}

/** Autonomy configuration per user */
export interface AutonomyConfig {
  userId: string;
  defaultMode: AutonomyMode;
  rules: AutonomyRule[];
  boundaries: AutonomyBoundaries;
  createdAt: Date;
  updatedAt: Date;
}

/** Boundaries for autonomous actions */
export interface AutonomyBoundaries {
  /** Maximum meetings that can be auto-scheduled per day */
  maxAutoMeetingsPerDay: number;
  /** Maximum meetings that can be auto-cancelled per day */
  maxAutoCancellationsPerDay: number;
  /** Maximum meetings that can be auto-rescheduled per day */
  maxAutoReschedulesPerDay: number;
  /** Time windows when autonomous scheduling is allowed (hours, user timezone) */
  allowedSchedulingHours: { start: number; end: number };
  /** Days of week when autonomous scheduling is allowed (0=Sun, 6=Sat) */
  allowedSchedulingDays: number[];
  /** Minimum lead score required for autonomous meeting scheduling */
  minLeadScoreForAutoSchedule: number;
  /** Whether autonomous mode can cancel existing meetings */
  canAutoCancel: boolean;
  /** Whether autonomous mode can reschedule existing meetings */
  canAutoReschedule: boolean;
  /** Whether to notify user after autonomous actions */
  notifyAfterAutoAction: boolean;
}

/** Decision result from the autonomy engine */
export interface AutonomyDecision {
  action: string;
  mode: AutonomyMode;
  approved: boolean;
  requiresApproval: boolean;
  reason: string;
  escalationMode?: AutonomyMode;
  boundaryHit?: string;
  dailyUsage?: { used: number; limit: number };
}

/** Default autonomy boundaries */
export const DEFAULT_BOUNDARIES: AutonomyBoundaries = {
  maxAutoMeetingsPerDay: 5,
  maxAutoCancellationsPerDay: 2,
  maxAutoReschedulesPerDay: 3,
  allowedSchedulingHours: { start: 9, end: 17 },
  allowedSchedulingDays: [1, 2, 3, 4, 5], // Mon-Fri
  minLeadScoreForAutoSchedule: 60,
  canAutoCancel: false,
  canAutoReschedule: true,
  notifyAfterAutoAction: true,
};

/** Default autonomy rules */
export const DEFAULT_RULES: AutonomyRule[] = [
  {
    action: 'schedule_meeting',
    allowedModes: ['manual', 'assisted', 'autonomous'],
    requiresApproval: false, // Determined dynamically based on mode
    maxAutoExecutionsPerDay: 5,
    escalationTo: 'assisted',
  },
  {
    action: 'cancel_meeting',
    allowedModes: ['manual', 'assisted', 'autonomous'],
    requiresApproval: true,
    maxAutoExecutionsPerDay: 2,
    escalationTo: 'manual',
  },
  {
    action: 'reschedule_meeting',
    allowedModes: ['manual', 'assisted', 'autonomous'],
    requiresApproval: false,
    maxAutoExecutionsPerDay: 3,
    escalationTo: 'assisted',
  },
  {
    action: 'send_confirmation_email',
    allowedModes: ['manual', 'assisted', 'autonomous'],
    requiresApproval: false,
  },
  {
    action: 'send_reminder',
    allowedModes: ['manual', 'assisted', 'autonomous'],
    requiresApproval: false,
  },
  {
    action: 'update_crm',
    allowedModes: ['manual', 'assisted', 'autonomous'],
    requiresApproval: false,
  },
];

// ===== IN-MEMORY DAILY USAGE TRACKING =====

const dailyUsage = new Map<string, Map<string, number>>();

function getTodayKey(): string {
  return new Date().toISOString().split('T')[0]; // YYYY-MM-DD
}

function getUsageMap(userId: string): Map<string, number> {
  const today = getTodayKey();
  let userMap = dailyUsage.get(`${userId}:${today}`);
  if (!userMap) {
    userMap = new Map();
    dailyUsage.set(`${userId}:${today}`, userMap);
    // Clean up old entries (keep only today)
    for (const key of dailyUsage.keys()) {
      if (!key.endsWith(today)) {
        dailyUsage.delete(key);
      }
    }
  }
  return userMap;
}

// ===== CORE FUNCTIONS =====

/**
 * Get the user's current autonomy mode.
 * Reads from UserSettings.meetingAutonomyMode, defaults to 'assisted'.
 */
export async function getUserAutonomyMode(userId: string): Promise<AutonomyMode> {
  try {
    const settings = await db.userSettings.findUnique({
      where: { userId },
      select: { meetingAutonomyMode: true },
    });

    const mode = settings?.meetingAutonomyMode;
    if (mode === 'manual' || mode === 'assisted' || mode === 'autonomous') {
      return mode as AutonomyMode;
    }

    // Also check the older field names used in the /src/lib/meeting/ version
    if (mode === 'approval') return 'manual';

    return 'assisted'; // Default
  } catch (error) {
    console.error('[AutonomyEngine] Failed to get autonomy mode:', error);
    return 'assisted'; // Safe default
  }
}

/**
 * Set the user's autonomy mode preference.
 * Updates UserSettings.meetingAutonomyMode and logs the change.
 */
export async function setUserAutonomyMode(
  userId: string,
  mode: AutonomyMode,
): Promise<{ success: boolean; mode: AutonomyMode }> {
  try {
    // Validate mode
    const validModes: AutonomyMode[] = ['manual', 'assisted', 'autonomous'];
    if (!validModes.includes(mode)) {
      throw new Error(`Invalid autonomy mode: ${mode}. Valid modes: ${validModes.join(', ')}`);
    }

    // Map to DB enum values (the DB may store 'approval' for 'manual')
    const dbMode = mode === 'manual' ? 'approval' : mode;

    // Upsert user settings
    await db.userSettings.upsert({
      where: { userId },
      create: {
        userId,
        meetingAutonomyMode: dbMode as string,
      },
      update: {
        meetingAutonomyMode: dbMode as string,
      },
    });

    // Audit log
    await logAuditEvent(userId, 'autonomy_mode_changed', {
      from: 'previous',
      to: mode,
      changedAt: new Date().toISOString(),
    });

    console.log(`[AutonomyEngine] User ${userId} autonomy mode set to: ${mode}`);
    return { success: true, mode };
  } catch (error) {
    console.error('[AutonomyEngine] Failed to set autonomy mode:', error);
    throw error;
  }
}

/**
 * Get the autonomy configuration for a user.
 * Returns default config if none exists.
 */
export async function getAutonomyConfig(userId: string): Promise<AutonomyConfig> {
  const mode = await getUserAutonomyMode(userId);
  const now = new Date();

  // Try to load custom boundaries from user preferences
  let boundaries = { ...DEFAULT_BOUNDARIES };
  try {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { preferencesJson: true },
    });

    if (user?.preferencesJson) {
      const prefs = JSON.parse(user.preferencesJson) as Record<string, unknown>;
      if (prefs.autonomyBoundaries) {
        boundaries = { ...boundaries, ...(prefs.autonomyBoundaries as Partial<AutonomyBoundaries>) };
      }
    }
  } catch {
    // Use defaults
  }

  return {
    userId,
    defaultMode: mode,
    rules: DEFAULT_RULES,
    boundaries,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Update the autonomy configuration for a user.
 */
export async function updateAutonomyConfig(
  userId: string,
  updates: Partial<Pick<AutonomyConfig, 'defaultMode' | 'rules' | 'boundaries'>>
): Promise<AutonomyConfig> {
  // Update mode if provided
  if (updates.defaultMode) {
    await setUserAutonomyMode(userId, updates.defaultMode);
  }

  // Update boundaries if provided
  if (updates.boundaries) {
    try {
      const user = await db.user.findUnique({
        where: { id: userId },
        select: { preferencesJson: true },
      });

      let prefs: Record<string, unknown> = {};
      if (user?.preferencesJson) {
        try { prefs = JSON.parse(user.preferencesJson); } catch { /* ignore */ }
      }

      prefs.autonomyBoundaries = updates.boundaries;

      await db.user.update({
        where: { id: userId },
        data: { preferencesJson: JSON.stringify(prefs) },
      });
    } catch (error) {
      console.error('[AutonomyEngine] Failed to update boundaries:', error);
    }
  }

  return getAutonomyConfig(userId);
}

/**
 * Evaluate whether an action is allowed given the user's autonomy mode.
 * This is the core decision function of the autonomy engine.
 */
export async function evaluateAction(
  userId: string,
  action: string,
  context?: Record<string, unknown>
): Promise<AutonomyDecision> {
  try {
    const config = await getAutonomyConfig(userId);
    const mode = config.defaultMode;

    // Find matching rule
    const rule = config.rules.find(r => r.action === action);

    if (!rule) {
      return {
        action,
        mode,
        approved: false,
        requiresApproval: true,
        reason: `No rule defined for action "${action}". Defaulting to requiring approval.`,
        escalationMode: 'manual',
      };
    }

    // Check if action is allowed in current mode
    if (!rule.allowedModes.includes(mode)) {
      return {
        action,
        mode,
        approved: false,
        requiresApproval: true,
        reason: `Action "${action}" not allowed in ${mode} mode.`,
        escalationMode: rule.escalationTo,
      };
    }

    // Check daily limits for autonomous mode
    if (mode === 'autonomous' && rule.maxAutoExecutionsPerDay) {
      const usage = getUsageMap(userId);
      const used = usage.get(action) || 0;

      if (used >= rule.maxAutoExecutionsPerDay) {
        return {
          action,
          mode,
          approved: false,
          requiresApproval: true,
          reason: `Daily limit reached for "${action}" (${used}/${rule.maxAutoExecutionsPerDay}). Escalating to ${rule.escalationTo || 'manual'}.`,
          escalationMode: rule.escalationTo,
          boundaryHit: 'daily_limit',
          dailyUsage: { used, limit: rule.maxAutoExecutionsPerDay },
        };
      }
    }

    // Check scheduling hours for autonomous mode
    if (mode === 'autonomous' && (action === 'schedule_meeting' || action === 'reschedule_meeting')) {
      const now = new Date();
      const hour = now.getHours();
      const day = now.getDay(); // 0=Sun, 6=Sat

      if (!config.boundaries.allowedSchedulingDays.includes(day)) {
        return {
          action,
          mode,
          approved: false,
          requiresApproval: true,
          reason: `Autonomous scheduling not allowed on day ${day}. Escalating to assisted.`,
          escalationMode: 'assisted',
          boundaryHit: 'scheduling_day',
        };
      }

      if (hour < config.boundaries.allowedSchedulingHours.start ||
          hour >= config.boundaries.allowedSchedulingHours.end) {
        return {
          action,
          mode,
          approved: false,
          requiresApproval: true,
          reason: `Autonomous scheduling not allowed outside hours ${config.boundaries.allowedSchedulingHours.start}-${config.boundaries.allowedSchedulingHours.end}. Escalating to assisted.`,
          escalationMode: 'assisted',
          boundaryHit: 'scheduling_hours',
        };
      }
    }

    // Decision based on mode
    switch (mode) {
      case 'manual':
        return {
          action,
          mode,
          approved: false,
          requiresApproval: true,
          reason: `Manual mode: all actions require explicit approval.`,
        };

      case 'assisted':
        return {
          action,
          mode,
          approved: false,
          requiresApproval: true,
          reason: `Assisted mode: action "${action}" requires user review and approval.`,
        };

      case 'autonomous':
        return {
          action,
          mode,
          approved: true,
          requiresApproval: false,
          reason: `Autonomous mode: action "${action}" auto-approved.`,
        };

      default:
        return {
          action,
          mode,
          approved: false,
          requiresApproval: true,
          reason: `Unknown mode: defaulting to requiring approval.`,
        };
    }
  } catch (error) {
    console.error('[AutonomyEngine] evaluateAction error:', error);
    return {
      action,
      mode: 'manual',
      approved: false,
      requiresApproval: true,
      reason: `Error evaluating action. Defaulting to manual for safety: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Check if a meeting proposal should be auto-approved based on autonomy mode.
 * In manual mode: always requires approval
 * In assisted mode: requires approval for low-confidence proposals
 * In autonomous mode: auto-approves if within boundaries
 */
export async function shouldAutoApproveProposal(
  userId: string,
  proposal: MeetingProposal
): Promise<AutonomyDecision> {
  const decision = await evaluateAction(userId, 'schedule_meeting', {
    leadId: proposal.leadId,
    leadName: proposal.leadName,
    duration: proposal.suggestedDuration,
  });

  // In assisted mode, auto-approve high-confidence proposals
  if (decision.mode === 'assisted' && proposal.recommendedSlots.length > 0) {
    const bestSlot = proposal.recommendedSlots[0];
    if (bestSlot && bestSlot.score >= 0.7) {
      return {
        ...decision,
        approved: false, // Still requires confirmation, but it's a strong suggestion
        requiresApproval: true,
        reason: `Assisted mode: strong slot recommendation (score ${bestSlot.score.toFixed(2)}). One-click confirm recommended.`,
      };
    }
  }

  return decision;
}

/**
 * Record that an autonomous action was executed.
 * Used for daily limit tracking.
 */
export async function recordAutonomousAction(
  userId: string,
  action: string
): Promise<void> {
  const usage = getUsageMap(userId);
  const current = usage.get(action) || 0;
  usage.set(action, current + 1);
  console.log(`[AutonomyEngine] Recorded autonomous action "${action}" for user ${userId}. Daily count: ${current + 1}`);
}

/**
 * Get the daily usage counts for autonomous actions.
 */
export async function getDailyAutonomousUsage(
  userId: string
): Promise<Record<string, { used: number; limit: number }>> {
  const usage = getUsageMap(userId);
  const result: Record<string, { used: number; limit: number }> = {};

  for (const rule of DEFAULT_RULES) {
    if (rule.maxAutoExecutionsPerDay) {
      result[rule.action] = {
        used: usage.get(rule.action) || 0,
        limit: rule.maxAutoExecutionsPerDay,
      };
    }
  }

  return result;
}
