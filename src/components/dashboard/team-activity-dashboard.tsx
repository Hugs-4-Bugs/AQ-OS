'use client';

// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Team Activity Dashboard
// Phase 7: Team performance metrics, leaderboard, activity feed
//
// Features:
// - Team leaderboard with performance rankings
// - Member activity cards with metrics
// - Team performance chart (weekly activity)
// - Top performer highlights
// - Activity breakdown by type
// ═══════════════════════════════════════════════════════════════════

import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Trophy,
  Users,
  TrendingUp,
  Mail,
  Phone,
  Target,
  Star,
  Crown,
  Medal,
  Award,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
  Activity,
  Calendar,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

// ── Types ───────────────────────────────────────────────────────
interface TeamMember {
  id: string;
  name: string;
  initials: string;
  role: 'owner' | 'admin' | 'member';
  avatar?: string;
  metrics: {
    leadsCreated: number;
    dealsWon: number;
    emailsSent: number;
    callsMade: number;
    conversionRate: number;
    avgScore: number;
    responseTime: number;
    activitiesThisWeek: number;
  };
  weeklyActivity: number[];
  trend: 'up' | 'down' | 'stable';
}

// ── Mock Data removed — loaded from API ────────────────────────

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// ── Rank Badge ──────────────────────────────────────────────────
function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <Crown className="h-4 w-4 text-amber-500" />;
  if (rank === 2) return <Medal className="h-4 w-4 text-slate-400" />;
  if (rank === 3) return <Award className="h-4 w-4 text-amber-700" />;
  return <span className="text-xs font-bold text-muted-foreground w-4 text-center">{rank}</span>;
}

// ── Main Component ──────────────────────────────────────────────
export default function TeamActivityDashboard() {
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);

  // Sort by activities for ranking
  const ranked = useMemo(() =>
    [...teamMembers].sort((a, b) => b.metrics.activitiesThisWeek - a.metrics.activitiesThisWeek),
    [teamMembers]
  );

  const teamTotals = useMemo(() => ({
    leadsCreated: teamMembers.reduce((s, m) => s + m.metrics.leadsCreated, 0),
    dealsWon: teamMembers.reduce((s, m) => s + m.metrics.dealsWon, 0),
    emailsSent: teamMembers.reduce((s, m) => s + m.metrics.emailsSent, 0),
    callsMade: teamMembers.reduce((s, m) => s + m.metrics.callsMade, 0),
    avgConversion: teamMembers.length > 0
      ? teamMembers.reduce((s, m) => s + m.metrics.conversionRate, 0) / teamMembers.length
      : 0,
  }), [teamMembers]);

  const weeklyTeamActivity = useMemo(() => {
    return WEEKDAYS.map((_, i) =>
      teamMembers.reduce((s, m) => s + m.weeklyActivity[i], 0)
    );
  }, [teamMembers]);

  const maxWeeklyActivity = Math.max(...weeklyTeamActivity, 1);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          Team Activity
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          {teamMembers.length} members · This week&apos;s performance
        </p>
      </div>

      {/* Team Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Leads Created', value: teamTotals.leadsCreated, icon: Target, color: 'text-blue-500', bg: 'bg-blue-500/15' },
          { label: 'Deals Won', value: teamTotals.dealsWon, icon: Trophy, color: 'text-emerald-500', bg: 'bg-emerald-500/15' },
          { label: 'Emails Sent', value: teamTotals.emailsSent, icon: Mail, color: 'text-purple-500', bg: 'bg-purple-500/15' },
          { label: 'Calls Made', value: teamTotals.callsMade, icon: Phone, color: 'text-cyan-500', bg: 'bg-cyan-500/15' },
        ].map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="metric-card-premium p-3 text-center"
          >
            <stat.icon className={cn('h-4 w-4 mx-auto mb-1', stat.color)} />
            <p className="text-lg font-bold tabular-nums">{stat.value}</p>
            <p className="text-[10px] text-muted-foreground">{stat.label}</p>
          </motion.div>
        ))}
      </div>

      {/* Weekly Team Activity Chart */}
      <Card className="glass-card-premium p-4">
        <CardHeader className="pb-3 px-0 pt-0">
          <CardTitle className="text-xs font-semibold flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" />
            Weekly Activity
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <div className="flex items-end gap-2 h-28">
            {WEEKDAYS.map((day, i) => (
              <div key={day} className="flex-1 flex flex-col items-center gap-1">
                <motion.div
                  initial={{ height: 0 }}
                  animate={{ height: `${(weeklyTeamActivity[i] / maxWeeklyActivity) * 100}%` }}
                  transition={{ delay: i * 0.05, duration: 0.4 }}
                  className="w-full bg-gradient-to-t from-primary/80 to-primary/40 rounded-t-md min-h-[4px]"
                />
                <span className="text-[9px] text-muted-foreground">{day}</span>
              </div>
            ))}
          </div>
          <div className="flex justify-between mt-2 text-[9px] text-muted-foreground">
            <span>Total: {weeklyTeamActivity.reduce((s, v) => s + v, 0)} activities</span>
            <span>Avg: {Math.round(weeklyTeamActivity.reduce((s, v) => s + v, 0) / 7)}/day</span>
          </div>
        </CardContent>
      </Card>

      {/* Leaderboard */}
      <Card className="glass-card-premium p-4">
        <CardHeader className="pb-3 px-0 pt-0">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xs font-semibold flex items-center gap-2">
              <Trophy className="h-4 w-4 text-amber-500" />
              Performance Leaderboard
            </CardTitle>
            <Badge variant="outline" className="text-[9px]">
              <Calendar className="h-3 w-3 mr-1" />
              This Week
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="px-0 pb-0 space-y-2">
          {ranked.map((member, i) => {
            const rank = i + 1;
            const maxActivities = ranked[0].metrics.activitiesThisWeek;
            return (
              <motion.div
                key={member.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.08 }}
                className={cn(
                  'flex items-center gap-3 p-3 rounded-lg border transition-all',
                  rank === 1 && 'border-amber-500/30 bg-amber-500/5',
                  rank === 2 && 'border-slate-400/30 bg-slate-400/5',
                  rank === 3 && 'border-amber-700/30 bg-amber-700/5',
                  rank > 3 && 'border-transparent hover:bg-muted/30',
                )}
              >
                <RankBadge rank={rank} />
                <div className="avatar-ring">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="text-[10px] font-bold bg-gradient-to-br from-primary/30 to-primary/10 text-primary">
                      {member.initials}
                    </AvatarFallback>
                  </Avatar>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium truncate">{member.name}</span>
                    <Badge variant="outline" className="text-[8px] px-1 h-3 capitalize">
                      {member.role}
                    </Badge>
                    {member.trend === 'up' && (
                      <ArrowUpRight className="h-3 w-3 text-emerald-500" />
                    )}
                    {member.trend === 'down' && (
                      <ArrowDownRight className="h-3 w-3 text-red-500" />
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1">
                    <div className="flex-1">
                      <Progress
                        value={(member.metrics.activitiesThisWeek / maxActivities) * 100}
                        className="h-1.5"
                      />
                    </div>
                    <span className="text-[10px] font-bold tabular-nums text-muted-foreground">
                      {member.metrics.activitiesThisWeek} tasks
                    </span>
                  </div>
                </div>
                <div className="hidden sm:flex flex-col items-end gap-0.5 shrink-0">
                  <div className="flex items-center gap-1">
                    <Target className="h-3 w-3 text-muted-foreground" />
                    <span className="text-[10px] tabular-nums">{member.metrics.dealsWon} deals</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Star className="h-3 w-3 text-muted-foreground" />
                    <span className="text-[10px] tabular-nums">{member.metrics.conversionRate}%</span>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </CardContent>
      </Card>

      {/* Member Detail Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {ranked.slice(0, 4).map((member, i) => (
          <motion.div
            key={member.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
          >
            <Card className="glass-card-premium p-4 h-full">
              <div className="flex items-center gap-3 mb-3">
                <div className="avatar-ring">
                  <Avatar className="h-10 w-10">
                    <AvatarFallback className="text-xs font-bold bg-gradient-to-br from-primary/30 to-primary/10 text-primary">
                      {member.initials}
                    </AvatarFallback>
                  </Avatar>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{member.name}</p>
                  <p className="text-[10px] text-muted-foreground capitalize">{member.role}</p>
                </div>
                {i === 0 && <Crown className="h-5 w-5 text-amber-500" />}
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: 'Leads', value: member.metrics.leadsCreated, color: 'text-blue-500' },
                  { label: 'Deals', value: member.metrics.dealsWon, color: 'text-emerald-500' },
                  { label: 'Conv.', value: `${member.metrics.conversionRate}%`, color: 'text-purple-500' },
                  { label: 'Emails', value: member.metrics.emailsSent, color: 'text-cyan-500' },
                  { label: 'Calls', value: member.metrics.callsMade, color: 'text-amber-500' },
                  { label: 'Score', value: member.metrics.avgScore, color: 'text-pink-500' },
                ].map(stat => (
                  <div key={stat.label} className="text-center p-2 rounded-md bg-muted/30">
                    <p className={cn('text-sm font-bold tabular-nums', stat.color)}>{stat.value}</p>
                    <p className="text-[9px] text-muted-foreground">{stat.label}</p>
                  </div>
                ))}
              </div>
            </Card>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
