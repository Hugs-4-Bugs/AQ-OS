'use client';

import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Trophy,
  Medal,
  Award,
  TrendingUp,
  Target,
  DollarSign,
  User,
  Crown,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/* ================================================================
   Types & Constants
   ================================================================ */

type Period = 'week' | 'month' | 'quarter';

interface TeamMember {
  id: string;
  name: string;
  role: string;
  initials: string;
  avatarColor: string;
  dealsWon: number;
  revenue: number;
  conversionRate: number;
  quota: number;
  isCurrentUser?: boolean;
}

const PERIOD_LABELS: Record<Period, string> = {
  week: 'This Week',
  month: 'This Month',
  quarter: 'This Quarter',
};

const AVATAR_GRADIENTS = [
  'from-violet-500 to-purple-600',
  'from-emerald-500 to-teal-600',
  'from-amber-500 to-orange-600',
  'from-rose-500 to-pink-600',
  'from-cyan-500 to-sky-600',
  'from-fuchsia-500 to-purple-600',
];

/* ================================================================
   Mock Team Data
   ================================================================ */

// Team data loaded from API — generateMockTeam removed
function getEmptyTeam(): TeamMember[] {
  return [];
}

/* ================================================================
   Rank Badge (Top 3)
   ================================================================ */

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <div className="flex items-center justify-center h-7 w-7 rounded-full bg-gradient-to-br from-amber-400 to-yellow-500 shadow-md shadow-amber-500/20">
        <Crown className="h-3.5 w-3.5 text-white" />
      </div>
    );
  }
  if (rank === 2) {
    return (
      <div className="flex items-center justify-center h-7 w-7 rounded-full bg-gradient-to-br from-slate-300 to-slate-400 shadow-md shadow-slate-400/20">
        <Medal className="h-3.5 w-3.5 text-white" />
      </div>
    );
  }
  if (rank === 3) {
    return (
      <div className="flex items-center justify-center h-7 w-7 rounded-full bg-gradient-to-br from-amber-600 to-amber-700 shadow-md shadow-amber-600/20">
        <Award className="h-3.5 w-3.5 text-white" />
      </div>
    );
  }
  return (
    <div className="flex items-center justify-center h-7 w-7 rounded-full bg-muted text-xs font-bold text-muted-foreground">
      {rank}
    </div>
  );
}

/* ================================================================
   Member Row
   ================================================================ */

function MemberRow({ member, rank }: { member: TeamMember; rank: number }) {
  const quotaPct = Math.min(100, Math.round((member.revenue / member.quota) * 100));
  const isTop3 = rank <= 3;

  return (
    <motion.div
      initial={{ opacity: 0, x: -16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{
        duration: 0.35,
        delay: rank * 0.06,
        ease: [0.22, 1, 0.36, 1],
      }}
      className={cn(
        'flex items-center gap-3 p-3 rounded-xl transition-all duration-200 group',
        member.isCurrentUser
          ? 'bg-primary/5 border border-primary/20 shadow-sm shadow-primary/5'
          : 'hover:bg-accent/40'
      )}
    >
      {/* Rank */}
      <RankBadge rank={rank} />

      {/* Avatar */}
      <div className="relative shrink-0">
        <div
          className={cn(
            'flex items-center justify-center h-10 w-10 rounded-full bg-gradient-to-br text-white font-bold text-sm shadow-sm',
            member.avatarColor
          )}
        >
          {member.initials}
        </div>
        {member.isCurrentUser && (
          <div className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[8px] font-bold text-primary-foreground ring-2 ring-background">
            You
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className={cn(
            'text-sm font-semibold truncate',
            isTop3 && 'gradient-text'
          )}>
            {member.name}
          </p>
          {member.isCurrentUser && (
            <Badge className="text-[8px] px-1 py-0 h-3.5 bg-primary/10 text-primary border-primary/20 hidden sm:inline-flex">
              YOU
            </Badge>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground truncate">{member.role}</p>

        {/* Quota progress bar */}
        <div className="mt-1.5 flex items-center gap-2">
          <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden max-w-[140px]">
            <motion.div
              className={cn(
                'h-full rounded-full',
                quotaPct >= 80
                  ? 'bg-gradient-to-r from-emerald-400 to-emerald-500'
                  : quotaPct >= 50
                    ? 'bg-gradient-to-r from-amber-400 to-amber-500'
                    : 'bg-gradient-to-r from-red-400 to-red-500'
              )}
              initial={{ width: 0 }}
              animate={{ width: `${quotaPct}%` }}
              transition={{ duration: 0.8, ease: 'easeOut', delay: 0.3 + rank * 0.05 }}
            />
          </div>
          <span className="text-[9px] text-muted-foreground tabular-nums shrink-0">
            {quotaPct}%
          </span>
        </div>
      </div>

      {/* Metrics */}
      <div className="hidden sm:flex items-center gap-4 shrink-0">
        <div className="text-right">
          <p className="text-xs font-bold tabular-nums">${(member.revenue / 1000).toFixed(1)}k</p>
          <p className="text-[9px] text-muted-foreground">Revenue</p>
        </div>
        <div className="text-right">
          <div className="flex items-center gap-0.5 justify-end">
            <p className="text-xs font-bold tabular-nums">{member.dealsWon}</p>
            {member.dealsWon >= 5 && <TrendingUp className="h-2.5 w-2.5 text-emerald-500" />}
          </div>
          <p className="text-[9px] text-muted-foreground">Deals</p>
        </div>
        <div className="text-right">
          <p className="text-xs font-bold tabular-nums">{member.conversionRate}%</p>
          <p className="text-[9px] text-muted-foreground">Conv.</p>
        </div>
      </div>

      {/* Mobile compact metrics */}
      <div className="flex sm:hidden flex-col items-end gap-0.5 shrink-0">
        <div className="flex items-center gap-1.5">
          <DollarSign className="h-3 w-3 text-muted-foreground" />
          <span className="text-xs font-bold tabular-nums">${(member.revenue / 1000).toFixed(1)}k</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Target className="h-3 w-3 text-muted-foreground" />
          <span className="text-[11px] tabular-nums">{member.dealsWon} deals</span>
        </div>
      </div>
    </motion.div>
  );
}

/* ================================================================
   Loading Skeleton
   ================================================================ */

function LeaderboardSkeleton() {
  return (
    <Card className="glass-card overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Skeleton className="h-5 w-5 rounded" />
            <Skeleton className="h-5 w-40 rounded" />
          </div>
          <Skeleton className="h-7 w-48 rounded-lg" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 p-3">
              <Skeleton className="h-7 w-7 rounded-full" />
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-28 rounded" />
                <Skeleton className="h-2.5 w-20 rounded" />
                <Skeleton className="h-1.5 w-32 rounded-full" />
              </div>
              <Skeleton className="h-8 w-16 rounded" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/* ================================================================
   Empty State
   ================================================================ */

function EmptyLeaderboard() {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
      <User className="h-10 w-10 mb-2 opacity-30" />
      <p className="text-sm font-medium">No team data available</p>
      <p className="text-xs mt-1 opacity-60">Invite team members to see rankings</p>
    </div>
  );
}

/* ================================================================
   Main Component
   ================================================================ */

export default function TeamLeaderboard({ className }: { className?: string }) {
  const [period, setPeriod] = useState<Period>('month');

  const team = useMemo(() => getEmptyTeam(), []);

  const topRevenue = team.length > 0 ? team[0].revenue : 0;
  const totalRevenue = team.reduce((s, m) => s + m.revenue, 0);
  const avgConversion = team.length > 0
    ? Math.round(team.reduce((s, m) => s + m.conversionRate, 0) / team.length)
    : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      <Card className="glass-card-enhanced card-glow overflow-hidden">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <div className="rounded-lg p-1.5 bg-gradient-to-br from-amber-500 to-orange-500">
                <Trophy className="h-4 w-4 text-white" />
              </div>
              <span className="gradient-text">Team Leaderboard</span>
            </CardTitle>

            {/* Period Selector */}
            <div className="flex items-center gap-1 p-1 rounded-lg bg-muted/50 border border-border/40">
              {(Object.entries(PERIOD_LABELS) as [Period, string][]).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setPeriod(key)}
                  className={cn(
                    'relative flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[11px] font-medium transition-all duration-200',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
                    period === key
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground/80'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Summary stats row */}
          <div className="flex items-center gap-4 mt-3 pt-3 border-t border-border/40">
            <div className="flex items-center gap-1.5">
              <DollarSign className="h-3 w-3 text-emerald-500" />
              <span className="text-[11px] text-muted-foreground">Total:</span>
              <span className="text-xs font-bold tabular-nums">${(totalRevenue / 1000).toFixed(0)}k</span>
            </div>
            <div className="flex items-center gap-1.5">
              <TrendingUp className="h-3 w-3 text-amber-500" />
              <span className="text-[11px] text-muted-foreground">Avg Conv:</span>
              <span className="text-xs font-bold tabular-nums">{avgConversion}%</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Crown className="h-3 w-3 text-yellow-500" />
              <span className="text-[11px] text-muted-foreground">Top:</span>
              <span className="text-xs font-bold tabular-nums">${(topRevenue / 1000).toFixed(1)}k</span>
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-0">
          <div className="space-y-1.5">
            <AnimatePresence mode="popLayout">
              {team.map((member, index) => (
                <MemberRow key={member.id} member={member} rank={index + 1} />
              ))}
            </AnimatePresence>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
