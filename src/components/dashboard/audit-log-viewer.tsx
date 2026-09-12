'use client';

import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import {
  Shield,
  Search,
  Download,
  Calendar,
  ChevronLeft,
  ChevronRight,
  User,
  Plus,
  Pencil,
  Trash2,
  LogIn,
  FileDown,
  Filter,
  Activity,
  Clock,
  Globe,
  TrendingUp,
  Users,
  Zap,
} from 'lucide-react';

/* ===== Types ===== */
type ActionType = 'create' | 'update' | 'delete' | 'login' | 'export';
type DateRange = 'today' | '7d' | '30d' | 'custom';
type EntityType = 'all' | 'lead' | 'deal' | 'contact' | 'settings';

interface AuditEntry {
  id: string;
  timestamp: string;
  date: string;
  user: string;
  userAvatar: string;
  action: ActionType;
  entityType: string;
  entityName: string;
  description: string;
  ipAddress: string;
}

interface MockUser {
  id: string;
  name: string;
  avatar: string;
  role: string;
}

/* ===== Data (fetched from API) ===== */
const auditUsers: MockUser[] = [];

const AUDIT_ENTRIES: AuditEntry[] = [];

const ACTION_CONFIG: Record<ActionType, { label: string; icon: React.ElementType; color: string; bg: string; border: string }> = {
  create: { label: 'Create', icon: Plus, color: 'text-emerald-500', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30' },
  update: { label: 'Update', icon: Pencil, color: 'text-blue-500', bg: 'bg-blue-500/10', border: 'border-blue-500/30' },
  delete: { label: 'Delete', icon: Trash2, color: 'text-red-500', bg: 'bg-red-500/10', border: 'border-red-500/30' },
  login: { label: 'Login', icon: LogIn, color: 'text-purple-500', bg: 'bg-purple-500/10', border: 'border-purple-500/30' },
  export: { label: 'Export', icon: FileDown, color: 'text-amber-500', bg: 'bg-amber-500/10', border: 'border-amber-500/30' },
};

const DATE_RANGES: { key: DateRange; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: '7d', label: '7 Days' },
  { key: '30d', label: '30 Days' },
  { key: 'custom', label: 'Custom' },
];

const ACTION_FILTERS: { key: ActionType | 'all'; label: string }[] = [
  { key: 'all', label: 'All Actions' },
  { key: 'create', label: 'Create' },
  { key: 'update', label: 'Update' },
  { key: 'delete', label: 'Delete' },
  { key: 'login', label: 'Login' },
  { key: 'export', label: 'Export' },
];

const ENTITY_FILTERS: { key: EntityType; label: string }[] = [
  { key: 'all', label: 'All Entities' },
  { key: 'lead', label: 'Lead' },
  { key: 'deal', label: 'Deal' },
  { key: 'contact', label: 'Contact' },
  { key: 'settings', label: 'Settings' },
];

const AVATAR_COLORS = [
  'from-violet-500 to-purple-600',
  'from-blue-500 to-cyan-600',
  'from-emerald-500 to-teal-600',
  'from-amber-500 to-orange-600',
];

/* ===== Helpers ===== */
function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function groupByDate(entries: AuditEntry[]): Record<string, AuditEntry[]> {
  const grouped: Record<string, AuditEntry[]> = {};
  entries.forEach((entry) => {
    if (!grouped[entry.date]) grouped[entry.date] = [];
    grouped[entry.date].push(entry);
  });
  return grouped;
}

/* ===== Main Component ===== */
export default function AuditLogViewer() {
  const [dateRange, setDateRange] = useState<DateRange>('30d');
  const [actionFilter, setActionFilter] = useState<ActionType | 'all'>('all');
  const [userFilter, setUserFilter] = useState<string>('all');
  const [entityFilter, setEntityFilter] = useState<EntityType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const ITEMS_PER_PAGE = 15;

  const filteredEntries = useMemo(() => {
    return AUDIT_ENTRIES.filter((entry) => {
      if (actionFilter !== 'all' && entry.action !== actionFilter) return false;
      if (userFilter !== 'all' && entry.user !== userFilter) return false;
      if (entityFilter !== 'all' && entry.entityType.toLowerCase() !== entityFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return (
          entry.description.toLowerCase().includes(q) ||
          entry.entityName.toLowerCase().includes(q) ||
          entry.user.toLowerCase().includes(q) ||
          entry.ipAddress.includes(q)
        );
      }
      return true;
    });
  }, [actionFilter, userFilter, entityFilter, searchQuery]);

  const groupedEntries = groupByDate(filteredEntries);
  const dateGroups = Object.keys(groupedEntries);

  const totalPages = Math.max(1, Math.ceil(filteredEntries.length / ITEMS_PER_PAGE));
  const paginatedEntries = filteredEntries.slice(0, currentPage * ITEMS_PER_PAGE);

  const actionStats = useMemo(() => {
    const stats: Record<ActionType, number> = { create: 0, update: 0, delete: 0, login: 0, export: 0 };
    AUDIT_ENTRIES.forEach((e) => stats[e.action]++);
    return stats;
  }, []);

  const todayEntries = AUDIT_ENTRIES.filter((e) => e.date === 'Today').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl shadow-lg p-5"
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="rounded-xl p-2.5 bg-gradient-to-br from-blue-500 to-cyan-600 shadow-lg shadow-blue-500/20">
              <Shield className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Audit Log</h2>
              <p className="text-xs text-muted-foreground">Activity trail & system events</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Date Range Selector */}
            <div className="flex items-center bg-muted/40 rounded-lg border border-border/50 p-0.5">
              {DATE_RANGES.map((range) => (
                <button
                  key={range.key}
                  onClick={() => setDateRange(range.key)}
                  className={cn(
                    'px-2.5 py-1.5 text-[10px] font-medium rounded-md transition-all duration-200 cursor-pointer',
                    dateRange === range.key
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {range.label}
                </button>
              ))}
            </div>
            <Button variant="outline" size="sm" className="text-xs gap-1.5">
              <Download className="h-3.5 w-3.5" />
              Export
            </Button>
          </div>
        </div>
      </motion.div>

      {/* Stats Summary */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.06 }}
        className="grid grid-cols-2 lg:grid-cols-4 gap-4"
      >
        {[
          { label: 'Total Events', value: '1,247', icon: Activity, color: 'from-blue-500/10 to-cyan-500/10', iconColor: 'text-blue-500' },
          { label: 'Most Active User', value: '—', icon: Users, color: 'from-violet-500/10 to-purple-500/10', iconColor: 'text-violet-500' },
          { label: 'Top Action', value: 'Update', icon: Zap, color: 'from-emerald-500/10 to-teal-500/10', iconColor: 'text-emerald-500' },
          { label: 'Events Today', value: todayEntries.toString(), icon: TrendingUp, color: 'from-amber-500/10 to-orange-500/10', iconColor: 'text-amber-500' },
        ].map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl shadow-lg p-4">
              <div className="flex items-center gap-3">
                <div className={cn('rounded-lg p-2 bg-gradient-to-br', stat.color)}>
                  <Icon className={cn('h-4 w-4', stat.iconColor)} />
                </div>
                <div>
                  <p className="text-lg font-bold">{stat.value}</p>
                  <p className="text-[10px] text-muted-foreground">{stat.label}</p>
                </div>
              </div>
            </div>
          );
        })}
      </motion.div>

      {/* Filters & Search */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
        className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl shadow-lg p-4"
      >
        <div className="flex flex-col lg:flex-row gap-3">
          {/* Search */}
          <div className="flex-1 flex items-center gap-2 rounded-xl border border-border/50 bg-muted/30 px-3 py-2 focus-within:border-blue-500/40 focus-within:ring-2 focus-within:ring-blue-500/10 transition-all">
            <Search className="h-4 w-4 text-muted-foreground shrink-0" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
              placeholder="Search logs by description, entity, user, or IP..."
              className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground/60"
            />
          </div>

          {/* Action Type Filter */}
          <div className="flex items-center gap-1 bg-muted/30 rounded-lg border border-border/50 p-0.5 overflow-x-auto">
            {ACTION_FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => { setActionFilter(f.key as ActionType | 'all'); setCurrentPage(1); }}
                className={cn(
                  'px-2 py-1.5 text-[10px] font-medium rounded-md whitespace-nowrap transition-all cursor-pointer',
                  actionFilter === f.key
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Entity Filter */}
          <div className="flex items-center gap-1 bg-muted/30 rounded-lg border border-border/50 p-0.5 overflow-x-auto">
            {ENTITY_FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => { setEntityFilter(f.key); setCurrentPage(1); }}
                className={cn(
                  'px-2 py-1.5 text-[10px] font-medium rounded-md whitespace-nowrap transition-all cursor-pointer',
                  entityFilter === f.key
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* User Filter */}
          <div className="relative">
            <button
              onClick={() => setShowUserDropdown(!showUserDropdown)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border/50 bg-muted/30 text-[10px] font-medium hover:bg-muted/50 transition-all cursor-pointer whitespace-nowrap"
            >
              <User className="h-3 w-3" />
              {userFilter === 'all' ? 'All Users' : userFilter}
            </button>
            {showUserDropdown && (
              <div className="absolute right-0 top-full mt-1 w-40 rounded-lg border border-border/50 bg-background/95 backdrop-blur-xl shadow-lg z-20 py-1">
                <button
                  onClick={() => { setUserFilter('all'); setShowUserDropdown(false); setCurrentPage(1); }}
                  className={cn(
                    'w-full px-3 py-2 text-xs text-left transition-colors cursor-pointer',
                    userFilter === 'all' ? 'bg-blue-500/10 text-blue-500' : 'hover:bg-muted/50'
                  )}
                >
                  All Users
                </button>
                {auditUsers.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => { setUserFilter(u.name); setShowUserDropdown(false); setCurrentPage(1); }}
                    className={cn(
                      'w-full px-3 py-2 text-xs text-left transition-colors cursor-pointer',
                      userFilter === u.name ? 'bg-blue-500/10 text-blue-500' : 'hover:bg-muted/50'
                    )}
                  >
                    {u.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </motion.div>

      {/* Activity Timeline */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.14 }}
        className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl shadow-lg overflow-hidden"
      >
        <div className="max-h-[560px] overflow-y-auto">
          {paginatedEntries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Shield className="h-10 w-10 text-muted-foreground/40 mb-3" />
              <p className="text-sm font-medium text-muted-foreground">No matching entries</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Try adjusting your filters</p>
            </div>
          ) : (
            <div className="divide-y divide-border/30">
              {dateGroups.map((date) => (
                <div key={date}>
                  {/* Date Header */}
                  <div className="sticky top-0 z-10 bg-muted/60 backdrop-blur-sm px-4 py-2 border-b border-border/20">
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                      {date}
                    </span>
                  </div>
                  {groupedEntries[date].map((entry, idx) => {
                    const config = ACTION_CONFIG[entry.action];
                    const ActionIcon = config.icon;
                    return (
                      <motion.div
                        key={entry.id}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.25, delay: idx * 0.03 }}
                        className={cn(
                          'flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/20',
                          idx % 2 === 1 && 'bg-muted/[0.02]'
                        )}
                      >
                        {/* Avatar */}
                        <div className={cn('h-8 w-8 rounded-full bg-gradient-to-br flex items-center justify-center shrink-0 text-[10px] font-bold text-white shadow-sm', getAvatarColor(entry.user))}>
                          {entry.userAvatar}
                        </div>

                        {/* User + Action */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-xs font-semibold">{entry.user}</span>
                            <Badge className={cn('text-[9px] h-4 px-1.5 border font-medium', config.bg, config.color, config.border)}>
                              <ActionIcon className="h-2.5 w-2.5 mr-0.5" />
                              {config.label}
                            </Badge>
                            <span className="text-[10px] text-muted-foreground">·</span>
                            <span className="text-[10px] text-muted-foreground">{entry.entityType}</span>
                          </div>
                          <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                            {entry.description}
                          </p>
                        </div>

                        {/* Timestamp + IP */}
                        <div className="flex flex-col items-end gap-0.5 shrink-0">
                          <div className="flex items-center gap-1 text-[10px] text-muted-foreground/70">
                            <Clock className="h-3 w-3" />
                            <span className="font-mono">{entry.timestamp.split(' ')[1]}</span>
                          </div>
                          <div className="flex items-center gap-1 text-[9px] text-muted-foreground/50">
                            <Globe className="h-2.5 w-2.5" />
                            <span className="font-mono">{entry.ipAddress}</span>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-border/30 bg-muted/20">
          <p className="text-[10px] text-muted-foreground">
            Showing <span className="font-medium text-foreground">{Math.min(1, filteredEntries.length)}-{Math.min(currentPage * ITEMS_PER_PAGE, filteredEntries.length)}</span> of{' '}
            <span className="font-medium text-foreground">1,247</span> entries
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="h-7 px-2 text-[10px]"
            >
              <ChevronLeft className="h-3 w-3" />
              Prev
            </Button>
            <div className="flex items-center gap-0.5 mx-1">
              {Array.from({ length: Math.min(3, totalPages) }, (_, i) => i + 1).map((page) => (
                <button
                  key={page}
                  onClick={() => setCurrentPage(page)}
                  className={cn(
                    'h-7 w-7 rounded-md text-[10px] font-medium transition-all cursor-pointer',
                    currentPage === page
                      ? 'bg-blue-500 text-white shadow-sm'
                      : 'hover:bg-muted/50 text-muted-foreground'
                  )}
                >
                  {page}
                </button>
              ))}
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              className="h-7 px-2 text-[10px]"
            >
              Next
              <ChevronRight className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
