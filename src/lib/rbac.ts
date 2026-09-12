// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Role-Based Access Control System
// Phase 3: Auth + Authorization + Session Security + RBAC
// ═══════════════════════════════════════════════════════════════════

export type UserRole = 'super_admin' | 'owner' | 'admin' | 'member' | 'viewer';

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
  | 'admin:access';

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
};

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
