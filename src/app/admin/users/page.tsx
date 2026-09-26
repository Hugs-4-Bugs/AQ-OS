'use client';

// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Admin Dashboard: User Management
//
// Platform-wide user listing with search / filters / pagination, a
// detail inspector (subscription, credits ledger, sessions, logins,
// audit trail) and server-validated admin actions:
//   • Activate / Deactivate (revokes sessions on deactivation)
//   • Adjust credits (ledger entry + required reason)
//   • Revoke sessions
// All mutations go through PATCH /api/admin/users/[id] (super_admin
// enforced server-side); the UI is never the security boundary.
// ═══════════════════════════════════════════════════════════════════

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Search,
  Users as UsersIcon,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Ban,
  CheckCircle2,
  Coins,
  KeyRound,
  Loader2,
  ShieldAlert,
  MailCheck,
  MailX,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────

interface UserRow {
  id: string;
  email: string;
  name: string | null;
  avatar: string | null;
  role: string;
  plan: string;
  credits: number;
  creditsMonthly: number;
  isTrial: boolean;
  trialEndsAt: string | null;
  isActive: boolean;
  emailVerified: boolean;
  authProvider: string;
  company: string | null;
  country: string | null;
  orgId: string | null;
  developerAccessEnabled: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

interface ListData {
  users: UserRow[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
  stats: {
    totalUsers: number;
    activeUsers: number;
    byRole: { role: string; count: number }[];
    byPlan: { plan: string; count: number }[];
  };
}

interface DetailData {
  user: UserRow & {
    rolloverCredits: number;
    phone: string | null;
    deletedAt: string | null;
  };
  subscription: {
    id: string;
    plan: string;
    status: string;
    billingCycle: string;
    currentPeriodStart: string | null;
    currentPeriodEnd: string | null;
    creditsTotal: number;
    creditsUsed: number;
    creditsRemaining: number;
    isTrial: boolean;
    trialEndsAt: string | null;
    cancelAtPeriodEnd: boolean;
  } | null;
  creditsLedger: {
    id: string;
    action: string;
    credits: number;
    balance: number;
    description: string | null;
    createdAt: string;
  }[];
  sessions: {
    id: string;
    deviceInfo: string | null;
    ipAddress: string | null;
    createdAt: string;
    expiresAt: string;
    isRevoked: boolean;
  }[];
  activeSessionCount: number;
  loginHistory: {
    id: string;
    ip: string | null;
    success: boolean;
    failReason: string | null;
    createdAt: string;
    country: string | null;
  }[];
  auditLogs: {
    id: string;
    action: string;
    resource: string | null;
    resourceId: string | null;
    createdAt: string;
  }[];
  resourceCounts: { leads: number; workflows: number; notifications: number; apiKeys: number };
}

// ─── Helpers ──────────────────────────────────────────────────────────

function fmtDateTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function humanize(s: string): string {
  return s.replace(/_/g, ' ');
}

function roleBadgeClass(role: string): string {
  if (role === 'super_admin') return 'bg-rose-500/15 text-rose-600 border-rose-500/30 dark:text-rose-400';
  if (role === 'owner') return 'bg-violet-500/15 text-violet-600 border-violet-500/30 dark:text-violet-400';
  if (role === 'admin') return 'bg-amber-500/15 text-amber-600 border-amber-500/30 dark:text-amber-400';
  return 'bg-muted text-muted-foreground border-border';
}

// ─── Page ─────────────────────────────────────────────────────────────

export default function AdminUsersPage() {
  // List state
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [role, setRole] = useState('all');
  const [plan, setPlan] = useState('all');
  const [status, setStatus] = useState('all');
  const [sortBy, setSortBy] = useState('newest');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ListData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Detail sheet state
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DetailData | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);

  // Adjust credits dialog
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustReason, setAdjustReason] = useState('');

  // Confirm dialog (toggle / revoke)
  const [confirmAction, setConfirmAction] = useState<'toggle' | 'revoke' | null>(null);

  const [myId, setMyId] = useState<string | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Who am I? (to hide destructive self-actions — also blocked server-side)
  useEffect(() => {
    fetch('/api/auth/me', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setMyId(j?.user?.id ?? null))
      .catch(() => setMyId(null));
  }, []);

  // Debounce search input
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 400);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [search]);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (debouncedSearch) params.set('search', debouncedSearch);
    if (role !== 'all') params.set('role', role);
    if (plan !== 'all') params.set('plan', plan);
    if (status !== 'all') params.set('status', status);
    params.set('sortBy', sortBy);
    params.set('page', String(page));
    params.set('limit', '20');
    return params.toString();
  }, [debouncedSearch, role, plan, status, sortBy, page]);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users?${query}`, { credentials: 'include' });
      if (!res.ok) throw new Error(res.status === 403 ? 'Admin access required' : 'Failed to load users');
      const json = await res.json();
      setData(json.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  const loadDetail = useCallback(async (userId: string) => {
    setDetailLoading(true);
    setDetail(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load user detail');
      const json = await res.json();
      setDetail(json.data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load user detail');
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const openDetail = useCallback(
    (userId: string) => {
      setDetailId(userId);
      loadDetail(userId);
    },
    [loadDetail]
  );

  // ── Actions ─────────────────────────────────────────────────────
  const patch = useCallback(
    async (userId: string, body: Record<string, unknown>, successMsg: string) => {
      setActionBusy(true);
      try {
        const res = await fetch(`/api/admin/users/${userId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(body),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(json.error || 'Action failed');
        }
        toast.success(successMsg);
        await loadList();
        if (detailId) await loadDetail(detailId);
        return true;
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Action failed');
        return false;
      } finally {
        setActionBusy(false);
      }
    },
    [loadList, loadDetail, detailId]
  );

  const handleToggleActive = useCallback(async () => {
    if (!detail) return;
    const u = detail.user;
    const ok = await patch(
      u.id,
      { action: 'toggle_active' },
      u.isActive ? `${u.email} deactivated — sessions revoked` : `${u.email} activated`
    );
    if (ok) setConfirmAction(null);
  }, [detail, patch]);

  const handleRevokeSessions = useCallback(async () => {
    if (!detail) return;
    const ok = await patch(
      detail.user.id,
      { action: 'revoke_sessions' },
      `All sessions revoked for ${detail.user.email}`
    );
    if (ok) setConfirmAction(null);
  }, [detail, patch]);

  const handleAdjustCredits = useCallback(async () => {
    if (!detail) return;
    const amount = parseInt(adjustAmount, 10);
    if (!Number.isInteger(amount) || amount === 0) {
      toast.error('Enter a non-zero whole number (use a negative number to deduct)');
      return;
    }
    if (!adjustReason.trim()) {
      toast.error('A reason is required for the audit trail');
      return;
    }
    const ok = await patch(
      detail.user.id,
      { action: 'adjust_credits', amount, reason: adjustReason.trim() },
      `Credits adjusted for ${detail.user.email}`
    );
    if (ok) {
      setAdjustOpen(false);
      setAdjustAmount('');
      setAdjustReason('');
    }
  }, [detail, adjustAmount, adjustReason, patch]);

  const resetFilters = useCallback(() => {
    setSearch('');
    setRole('all');
    setPlan('all');
    setStatus('all');
    setSortBy('newest');
    setPage(1);
  }, []);

  const planOptions = useMemo(
    () => data?.stats.byPlan.map((p) => p.plan) ?? [],
    [data]
  );
  const roleOptions = useMemo(
    () => data?.stats.byRole.map((r) => r.role) ?? [],
    [data]
  );

  // ─── Render ───────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Users</h1>
          <p className="text-xs text-muted-foreground">
            {data
              ? `${data.stats.totalUsers} total · ${data.stats.activeUsers} active`
              : 'Platform-wide user management'}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadList} aria-label="Refresh user list">
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[200px] flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search email, name, company…"
                className="pl-8"
                aria-label="Search users"
              />
            </div>
            <Select
              value={role}
              onValueChange={(v) => {
                setRole(v);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[130px]" aria-label="Filter by role">
                <SelectValue placeholder="Role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All roles</SelectItem>
                {roleOptions.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={plan}
              onValueChange={(v) => {
                setPlan(v);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[130px]" aria-label="Filter by plan">
                <SelectValue placeholder="Plan" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All plans</SelectItem>
                {planOptions.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={status}
              onValueChange={(v) => {
                setStatus(v);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[130px]" aria-label="Filter by status">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={sortBy}
              onValueChange={(v) => {
                setSortBy(v);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[150px]" aria-label="Sort users">
                <SelectValue placeholder="Sort" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Newest first</SelectItem>
                <SelectItem value="oldest">Oldest first</SelectItem>
                <SelectItem value="email">Email A–Z</SelectItem>
                <SelectItem value="credits">Most credits</SelectItem>
                <SelectItem value="last-login">Last login</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="ghost" size="sm" onClick={resetFilters}>
              Reset
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="px-0 pb-0">
          {loading ? (
            <div className="space-y-2 p-4" aria-busy="true">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : error ? (
            <div className="flex flex-col items-center gap-3 p-10 text-center">
              <AlertTriangle className="h-8 w-8 text-amber-500" aria-hidden="true" />
              <p className="text-sm font-medium">{error}</p>
              <Button variant="outline" size="sm" onClick={loadList}>
                Retry
              </Button>
            </div>
          ) : !data || data.users.length === 0 ? (
            <div className="flex flex-col items-center gap-2 p-10 text-center">
              <UsersIcon className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
              <p className="text-sm font-medium">No users match these filters</p>
              <Button variant="ghost" size="sm" onClick={resetFilters}>
                Clear filters
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">User</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead className="text-right">Credits</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last login</TableHead>
                  <TableHead className="pr-6 text-right">Joined</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.users.map((u) => (
                  <TableRow
                    key={u.id}
                    className="cursor-pointer"
                    onClick={() => openDetail(u.id)}
                  >
                    <TableCell className="pl-6">
                      <div className="flex items-center gap-2">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold uppercase text-primary">
                          {(u.name || u.email).slice(0, 2)}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-xs font-medium max-w-[220px]">
                            {u.name || '—'}
                          </p>
                          <p className="truncate text-[11px] text-muted-foreground max-w-[220px]">
                            {u.email}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-[11px] ${roleBadgeClass(u.role)}`}>
                        {u.role}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[11px] capitalize">
                        {u.plan}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums">{u.credits}</TableCell>
                    <TableCell>
                      {u.isActive ? (
                        <Badge variant="outline" className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 text-[11px] dark:text-emerald-400">
                          active
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-rose-500/15 text-rose-600 border-rose-500/30 text-[11px] dark:text-rose-400">
                          inactive
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {fmtDateTime(u.lastLoginAt)}
                    </TableCell>
                    <TableCell className="pr-6 text-right text-xs text-muted-foreground">
                      {fmtDate(u.createdAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {/* Pagination */}
          {data && data.users.length > 0 && (
            <div className="flex items-center justify-between gap-2 border-t border-border p-3">
              <span className="text-xs text-muted-foreground">
                {data.pagination.total} total · Page {data.pagination.page} of{' '}
                {data.pagination.totalPages}
              </span>
              <div className="flex gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1 || loading}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  aria-label="Previous page"
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= data.pagination.totalPages || loading}
                  onClick={() => setPage((p) => p + 1)}
                  aria-label="Next page"
                >
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detail sheet */}
      <Sheet
        open={detailId !== null}
        onOpenChange={(open) => {
          if (!open) setDetailId(null);
        }}
      >
        <SheetContent side="right" className="w-full overflow-y-auto p-0 sm:max-w-lg">
          {detailLoading || !detail ? (
            <div className="space-y-3 p-6" aria-busy="true">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-4 w-56" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-40 w-full" />
            </div>
          ) : (
            <>
              <SheetHeader className="p-6 pb-2 text-left">
                <SheetTitle className="flex items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold uppercase text-primary">
                    {(detail.user.name || detail.user.email).slice(0, 2)}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">
                      {detail.user.name || '—'}
                    </span>
                    <span className="block truncate text-xs font-normal text-muted-foreground">
                      {detail.user.email}
                    </span>
                  </span>
                </SheetTitle>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <Badge variant="outline" className={`text-[11px] ${roleBadgeClass(detail.user.role)}`}>
                    {detail.user.role}
                  </Badge>
                  <Badge variant="outline" className="text-[11px] capitalize">
                    {detail.user.plan}
                  </Badge>
                  {detail.user.isActive ? (
                    <Badge variant="outline" className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 text-[11px] dark:text-emerald-400">
                      active
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="bg-rose-500/15 text-rose-600 border-rose-500/30 text-[11px] dark:text-rose-400">
                      inactive
                    </Badge>
                  )}
                  {detail.user.emailVerified ? (
                    <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      <MailCheck className="h-3 w-3" aria-hidden="true" /> verified
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      <MailX className="h-3 w-3" aria-hidden="true" /> unverified
                    </span>
                  )}
                  {detail.user.developerAccessEnabled && (
                    <Badge variant="outline" className="text-[11px]">
                      <KeyRound className="mr-1 h-3 w-3" aria-hidden="true" />
                      developer
                    </Badge>
                  )}
                </div>
              </SheetHeader>

              <div className="space-y-5 px-6 pb-8">
                {/* Actions */}
                <div className="flex flex-wrap gap-2">
                  {detail.user.id !== myId && (
                    <Button
                      variant={detail.user.isActive ? 'destructive' : 'default'}
                      size="sm"
                      disabled={actionBusy}
                      onClick={() => setConfirmAction('toggle')}
                    >
                      {actionBusy ? (
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                      ) : detail.user.isActive ? (
                        <Ban className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                      ) : (
                        <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                      )}
                      {detail.user.isActive ? 'Deactivate' : 'Activate'}
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={actionBusy}
                    onClick={() => {
                      setAdjustAmount('');
                      setAdjustReason('');
                      setAdjustOpen(true);
                    }}
                  >
                    <Coins className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                    Adjust credits
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={actionBusy}
                    onClick={() => setConfirmAction('revoke')}
                  >
                    <ShieldAlert className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                    Revoke sessions
                    {detail.activeSessionCount > 0 && (
                      <span className="ml-1 text-[10px] text-muted-foreground">
                        ({detail.activeSessionCount})
                      </span>
                    )}
                  </Button>
                </div>

                {/* Profile */}
                <section aria-label="Profile">
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Profile
                  </h3>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                    <div>
                      <dt className="text-muted-foreground">Credits</dt>
                      <dd className="font-medium tabular-nums">
                        {detail.user.credits}{' '}
                        <span className="text-[10px] text-muted-foreground">
                          (monthly {detail.user.creditsMonthly}
                          {detail.user.rolloverCredits > 0
                            ? `, rollover ${detail.user.rolloverCredits}`
                            : ''}
                          )
                        </span>
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Company</dt>
                      <dd className="truncate font-medium">{detail.user.company || '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Country</dt>
                      <dd className="font-medium">{detail.user.country || '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Auth provider</dt>
                      <dd className="font-medium">{detail.user.authProvider}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Last login</dt>
                      <dd className="font-medium">{fmtDateTime(detail.user.lastLoginAt)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Joined</dt>
                      <dd className="font-medium">{fmtDate(detail.user.createdAt)}</dd>
                    </div>
                  </dl>
                </section>

                {/* Subscription */}
                <section aria-label="Subscription">
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Subscription
                  </h3>
                  {detail.subscription ? (
                    <div className="rounded-lg border border-border p-3 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-medium capitalize">
                          {detail.subscription.plan} · {detail.subscription.billingCycle}
                        </span>
                        <Badge variant="outline" className="text-[11px]">
                          {detail.subscription.status}
                        </Badge>
                      </div>
                      <p className="mt-1 text-muted-foreground">
                        Period: {fmtDate(detail.subscription.currentPeriodStart)} →{' '}
                        {fmtDate(detail.subscription.currentPeriodEnd)}
                        {detail.subscription.cancelAtPeriodEnd ? ' · cancels at period end' : ''}
                      </p>
                      <p className="mt-0.5 text-muted-foreground">
                        Credits: {detail.subscription.creditsRemaining} remaining of{' '}
                        {detail.subscription.creditsTotal}
                      </p>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">No active subscription.</p>
                  )}
                </section>

                {/* Resources */}
                <section aria-label="Resource counts">
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Resources
                  </h3>
                  <div className="grid grid-cols-4 gap-2 text-center">
                    {(
                      [
                        ['Leads', detail.resourceCounts.leads],
                        ['Workflows', detail.resourceCounts.workflows],
                        ['Notifications', detail.resourceCounts.notifications],
                        ['API keys', detail.resourceCounts.apiKeys],
                      ] as const
                    ).map(([label, value]) => (
                      <div key={label} className="rounded-lg border border-border p-2">
                        <p className="text-sm font-semibold tabular-nums">{value}</p>
                        <p className="text-[10px] text-muted-foreground">{label}</p>
                      </div>
                    ))}
                  </div>
                </section>

                <Separator />

                {/* Credits ledger */}
                <section aria-label="Credits ledger">
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Credits Ledger (latest 20)
                  </h3>
                  {detail.creditsLedger.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No credit transactions.</p>
                  ) : (
                    <ul className="max-h-48 space-y-1.5 overflow-y-auto pr-1">
                      {detail.creditsLedger.map((l) => (
                        <li
                          key={l.id}
                          className="flex items-center justify-between gap-2 rounded-md border border-border px-2.5 py-1.5 text-xs"
                        >
                          <span className="min-w-0">
                            <span className="block truncate font-medium">{humanize(l.action)}</span>
                            <span className="block truncate text-[10px] text-muted-foreground">
                              {l.description || fmtDateTime(l.createdAt)}
                            </span>
                          </span>
                          <span
                            className={`shrink-0 font-semibold tabular-nums ${
                              l.credits >= 0
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-rose-600 dark:text-rose-400'
                            }`}
                          >
                            {l.credits >= 0 ? '+' : ''}
                            {l.credits}
                            <span className="ml-1 text-[10px] font-normal text-muted-foreground">
                              → {l.balance}
                            </span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                {/* Recent logins */}
                <section aria-label="Recent logins">
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Recent Logins
                  </h3>
                  {detail.loginHistory.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No login history.</p>
                  ) : (
                    <ul className="max-h-40 space-y-1 overflow-y-auto pr-1">
                      {detail.loginHistory.map((l) => (
                        <li key={l.id} className="flex items-center justify-between gap-2 text-xs">
                          <span className="truncate text-muted-foreground">
                            {l.ip || 'unknown IP'}
                            {l.country ? ` · ${l.country}` : ''}
                          </span>
                          <span
                            className={`shrink-0 ${
                              l.success
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-rose-600 dark:text-rose-400'
                            }`}
                          >
                            {l.success ? 'success' : 'failed'}
                            {' · '}
                            <span className="text-muted-foreground">
                              {fmtDateTime(l.createdAt)}
                            </span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                {/* Sessions */}
                <section aria-label="Sessions">
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Sessions (latest 5)
                  </h3>
                  {detail.sessions.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No sessions recorded.</p>
                  ) : (
                    <ul className="max-h-40 space-y-1 overflow-y-auto pr-1">
                      {detail.sessions.map((s) => (
                        <li key={s.id} className="flex items-center justify-between gap-2 text-xs">
                          <span className="truncate text-muted-foreground">
                            {s.deviceInfo || 'unknown device'} · {s.ipAddress || '—'}
                          </span>
                          <span className="shrink-0">
                            {s.isRevoked ? (
                              <Badge variant="outline" className="text-[10px]">
                                revoked
                              </Badge>
                            ) : new Date(s.expiresAt) > new Date() ? (
                              <Badge variant="outline" className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 text-[10px] dark:text-emerald-400">
                                active
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px]">
                                expired
                              </Badge>
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                {/* Audit */}
                <section aria-label="Audit trail">
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Audit Trail (latest 15)
                  </h3>
                  {detail.auditLogs.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No audit entries.</p>
                  ) : (
                    <ul className="max-h-40 space-y-1 overflow-y-auto pr-1">
                      {detail.auditLogs.map((a) => (
                        <li key={a.id} className="flex items-center justify-between gap-2 text-xs">
                          <span className="truncate font-medium">{humanize(a.action)}</span>
                          <span className="shrink-0 text-[11px] text-muted-foreground">
                            {fmtDateTime(a.createdAt)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Adjust credits dialog */}
      <Dialog open={adjustOpen} onOpenChange={setAdjustOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Adjust credits</DialogTitle>
            <DialogDescription>
              {detail
                ? `Current balance: ${detail.user.credits}. Use a negative number to deduct. All changes are logged with your admin identity.`
                : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="adjust-amount">Amount</Label>
              <Input
                id="adjust-amount"
                type="number"
                step="1"
                placeholder="e.g. 100 or -50"
                value={adjustAmount}
                onChange={(e) => setAdjustAmount(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="adjust-reason">Reason (required)</Label>
              <Input
                id="adjust-reason"
                placeholder="e.g. Goodwill credit for support ticket #123"
                value={adjustReason}
                onChange={(e) => setAdjustReason(e.target.value)}
                maxLength={200}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setAdjustOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleAdjustCredits} disabled={actionBusy}>
              {actionBusy && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
              Apply adjustment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm dialog */}
      <Dialog
        open={confirmAction !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmAction(null);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {confirmAction === 'toggle'
                ? detail?.user.isActive
                  ? 'Deactivate this account?'
                  : 'Activate this account?'
                : 'Revoke all sessions?'}
            </DialogTitle>
            <DialogDescription>
              {confirmAction === 'toggle'
                ? detail?.user.isActive
                  ? 'The user will be signed out everywhere and cannot sign in until reactivated. Their data is preserved.'
                  : 'The user will be able to sign in again immediately.'
                : 'Every active refresh session for this user will be invalidated. They will need to sign in again on all devices.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setConfirmAction(null)}>
              Cancel
            </Button>
            <Button
              variant={confirmAction === 'toggle' && detail?.user.isActive ? 'destructive' : 'default'}
              size="sm"
              onClick={confirmAction === 'toggle' ? handleToggleActive : handleRevokeSessions}
              disabled={actionBusy}
            >
              {actionBusy && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
              {confirmAction === 'toggle'
                ? detail?.user.isActive
                  ? 'Deactivate'
                  : 'Activate'
                : 'Revoke all'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
