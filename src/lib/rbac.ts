// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Role-Based Access Control System
// Phase 3: Auth + Authorization + Session Security + RBAC
// ═══════════════════════════════════════════════════════════════════

export type UserRole = 'super_admin' | 'owner' | 'admin' | 'member' | 'viewer' | 'support' | 'analytics';

export type Permission =
  | 'leads:read'
  | 'leads:write'
  | 'leads:delete'
  | 'pipeline:read'
  | 'pipeline:write'
  | 'discover:read'
  | 'discover:write'
  | 'outreach:read'
  | 'outreach:write'
  | 'assistant:read'
  | 'insights:read'
  | 'deals:read'
  | 'deals:write'
  | 'competitors:read'
  | 'competitors:write'
  | 'settings:read'
  | 'settings:write'
  | 'billing:read'
  | 'billing:write'
  | 'team:read'
  | 'team:write'
  | 'api:read'
  | 'api:write'
  | 'admin:access'
  // ── Phase 29: Admin RBAC permissions ──
  | 'users.read'
  | 'users.update'
  | 'users.suspend'
  | 'users.restrict'
  | 'users.ban'
  | 'users.reactivate'
  | 'user360.read'
  | 'user360.support'
  | 'billing.refund'
  | 'billing.adjust'
  | 'credits.read'
  | 'credits.adjust'
  | 'workflows.read'
  | 'workflows.control'
  | 'autopilot.read'
  | 'autopilot.control'
  | 'outreach.control'
  | 'ai.usage.read'
  | 'integrations.read'
  | 'integrations.control'
  | 'system.health.read'
  | 'system.logs.read'
  | 'audit.read'
  | 'security.events.read'
  | 'rbac.read'
  | 'rbac.assign';

// Permission matrix: role → set of permissions
const ROLE_PERMISSIONS: Record<UserRole, Set<Permission>> = {
  super_admin: new Set<Permission>([
    'leads:read', 'leads:write', 'leads:delete',
    'pipeline:read', 'pipeline:write',
    'discover:read', 'discover:write',
    'outreach:read', 'outreach:write',
    'assistant:read',
    'insights:read',
    'deals:read', 'deals:write',
    'competitors:read', 'competitors:write',
    'settings:read', 'settings:write',
    'billing:read', 'billing:write',
    'team:read', 'team:write',
    'api:read', 'api:write',
    'admin:access',
    // Phase 29: full admin permissions
    'users.read', 'users.update', 'users.suspend', 'users.restrict', 'users.ban', 'users.reactivate',
    'user360.read', 'user360.support',
    'billing.refund', 'billing.adjust',
    'credits.read', 'credits.adjust',
    'workflows.read', 'workflows.control',
    'autopilot.read', 'autopilot.control',
    'outreach.control',
    'ai.usage.read',
    'integrations.read', 'integrations.control',
    'system.health.read', 'system.logs.read',
    'audit.read',
    'security.events.read',
    'rbac.read', 'rbac.assign',
  ]),
  owner: new Set<Permission>([
    'leads:read', 'leads:write', 'leads:delete',
    'pipeline:read', 'pipeline:write',
    'discover:read', 'discover:write',
    'outreach:read', 'outreach:write',
    'assistant:read',
    'insights:read',
    'deals:read', 'deals:write',
    'competitors:read', 'competitors:write',
    'settings:read', 'settings:write',
    'billing:read', 'billing:write',
    'team:read', 'team:write',
    'api:read', 'api:write',
    'admin:access',
  ]),
  admin: new Set<Permission>([
    'leads:read', 'leads:write', 'leads:delete',
    'pipeline:read', 'pipeline:write',
    'discover:read', 'discover:write',
    'outreach:read', 'outreach:write',
    'assistant:read',
    'insights:read',
    'deals:read', 'deals:write',
    'competitors:read', 'competitors:write',
    'settings:read', 'settings:write',
    'billing:read',
    'team:read',
    'api:read',
    // Phase 29: platform admin permissions (no RBAC assignment, no secret access)
    'admin:access',
    'users.read', 'users.update', 'users.suspend', 'users.restrict', 'users.reactivate',
    'user360.read',
    'billing.adjust',
    'credits.read', 'credits.adjust',
    'workflows.read', 'workflows.control',
    'autopilot.read', 'autopilot.control',
    'outreach.control',
    'ai.usage.read',
    'integrations.read', 'integrations.control',
    'system.health.read', 'system.logs.read',
    'audit.read',
  ]),
  member: new Set<Permission>([
    'leads:read', 'leads:write',
    'pipeline:read',
    'discover:read',
    'outreach:read', 'outreach:write',
    'assistant:read',
    'insights:read',
    'deals:read', 'deals:write',
    'competitors:read',
    'settings:read',
  ]),
  viewer: new Set<Permission>([
    'leads:read',
    'pipeline:read',
    'discover:read',
    'assistant:read',
    'insights:read',
    'deals:read',
    'competitors:read',
    'settings:read',
  ]),
  // ── Phase 29: Admin RBAC roles ──
  support: new Set<Permission>([
    'admin:access',
    'users.read', 'users.update', 'users.suspend', 'users.restrict', 'users.reactivate',
    'user360.read', 'user360.support',
    'credits.read',
    'workflows.read',
    'autopilot.read',
    'outreach:read', 'outreach.control',
    'integrations.read',
    'system.health.read',
    'audit.read',
  ]),
  analytics: new Set<Permission>([
    'admin:access',
    'users.read', 'user360.read',
    'billing:read', 'credits.read',
    'leads:read', 'workflows.read', 'autopilot.read',
    'outreach:read', 'ai.usage.read',
    'system.health.read', 'audit.read',
  ]),
};

// ── Phase 29: Admin role definitions ──
export type AdminRole = 'super_admin' | 'admin' | 'support' | 'analytics';

export const ADMIN_ROLES: AdminRole[] = ['super_admin', 'admin', 'support', 'analytics'];

export const ADMIN_ROLE_DESCRIPTIONS: Record<AdminRole, string> = {
  super_admin: 'Full platform administrative access including RBAC management',
  admin: 'Operational admin access — user management, billing, system control (no RBAC assignment)',
  support: 'Support/operations — User360, user investigation, account restrictions, operational monitoring',
  analytics: 'Read-only analytics — approved business/system metrics, no mutations',
};

/** Check if a role is a platform admin role (not org-level) */
export function isPlatformAdminRole(role: string): boolean {
  return ADMIN_ROLES.includes(role as AdminRole);
}

/** Prevent self-escalation: a role cannot assign roles higher than its own */
export function canAssignRole(assignerRole: UserRole, targetRole: UserRole): boolean {
  // Only super_admin can assign admin roles
  if (assignerRole !== 'super_admin') return false;
  // super_admin can assign any admin role
  // But cannot assign 'owner' (that's an org-level role, set at signup)
  if (targetRole === 'owner') return false;
  return true;
}

/** Check if a role has a specific permission */
export function hasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.has(permission) || false;
}

/** Check if a role has ALL of the specified permissions */
export function hasAllPermissions(role: UserRole, permissions: Permission[]): boolean {
  const rolePerms = ROLE_PERMISSIONS[role];
  if (!rolePerms) return false;
  return permissions.every(p => rolePerms.has(p));
}

/** Check if a role has ANY of the specified permissions */
export function hasAnyPermission(role: UserRole, permissions: Permission[]): boolean {
  const rolePerms = ROLE_PERMISSIONS[role];
  if (!rolePerms) return false;
  return permissions.some(p => rolePerms.has(p));
}

/** Get all permissions for a role */
export function getRolePermissions(role: UserRole): Permission[] {
  return Array.from(ROLE_PERMISSIONS[role] || []);
}

/** Check if a role is admin-level (super_admin, owner, admin) */
export function isAdminRole(role: UserRole): boolean {
  return ['super_admin', 'owner', 'admin'].includes(role);
}

/** Map of feature tabs to required permissions */
export const TAB_PERMISSIONS: Record<string, Permission> = {
  overview: 'leads:read',
  leads: 'leads:read',
  pipeline: 'pipeline:read',
  discover: 'discover:read',
  outreach: 'outreach:read',
  assistant: 'assistant:read',
  insights: 'insights:read',
  deals: 'deals:read',
  competitors: 'competitors:read',
  settings: 'settings:read',
};

/** Check if a user can access a specific tab */
export function canAccessTab(role: UserRole, tabId: string): boolean {
  const permission = TAB_PERMISSIONS[tabId];
  if (!permission) return true; // Unknown tabs are accessible by default
  return hasPermission(role, permission);
}

/** Get list of accessible tabs for a role */
export function getAccessibleTabs(role: UserRole): string[] {
  return Object.keys(TAB_PERMISSIONS).filter(tab => canAccessTab(role, tab));
}
