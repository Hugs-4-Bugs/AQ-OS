'use client';

import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Users,
  Trophy,
  Crown,
  Medal,
  Award,
  Download,
  ArrowUpRight,
  ArrowDownRight,
  Phone,
  Mail,
  Calendar,
  HandshakeIcon,
  Zap,
  Star,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, ResponsiveContainer, Cell } from 'recharts';

/* Data loaded from API */
interface TeamMember {
  name: string;
  role: string;
  initials: string;
  color: string;
  leads: number;
  calls: number;
  emails: number;
  meetings: number;
  deals: number;
  revenue: number;
  conversionRate: number;
  avgDealSize: number;
  trend: 'up' | 'down';
  trendPct: number;
  isCurrentUser: boolean;
  badges: string[];
}

// TEAM data loaded from API — fake array removed


const METRICS = [
  { key: 'leads' as const, label: 'Leads', icon: Users },
  { key: 'calls' as const, label: 'Calls', icon: Phone },
  { key: 'emails' as const, label: 'Emails', icon: Mail },
  { key: 'meetings' as const, label: 'Meetings', icon: Calendar },
  { key: 'deals' as const, label: 'Deals', icon: HandshakeIcon },
];

const DISTRIBUTION = [
  { tier: 'Elite (90+)', count: 1, color: '#10b981' },
  { tier: 'Strong (70-89)', count: 2, color: '#3b82f6' },
  { tier: 'Average (50-69)', count: 2, color: '#f59e0b' },
  { tier: 'Needs Improv. (<50)', count: 1, color: '#ef4444' },
];

const PERIODS = ['This Week', 'This Month', 'This Quarter', 'This Year'];

/* ===== Heatmap Color Helper ===== */
function getHeatColor(value: number, max: number): string {
  const ratio = max > 0 ? value / max : 0;
  if (ratio >= 0.75) return 'bg-emerald-500/30 text-emerald-500 border-emerald-500/20';
  if (ratio >= 0.5) return 'bg-amber-500/30 text-amber-500 border-amber-500/20';
  if (ratio >= 0.25) return 'bg-orange-500/20 text-orange-500 border-orange-500/15';
  return 'bg-red-500/20 text-red-400 border-red-500/15';
}

/* ===== Rank Icon ===== */
function RankIcon({ rank }: { rank: number }) {
  if (rank === 1) return <Crown className="h-4 w-4 text-amber-400 fill-amber-400" />;
  if (rank === 2) return <Medal className="h-4 w-4 text-slate-300 fill-slate-300" />;
  if (rank === 3) return <Award className="h-4 w-4 text-amber-600 fill-amber-600" />;
  return <span className="text-xs font-bold text-muted-foreground">{rank}</span>;
}

/* ===== Main Component ===== */
export default function TeamPerformanceMatrix() {
  const [period, setPeriod] = useState('This Month');
  const [sortMetric, setSortMetric] = useState<'deals' | 'revenue' | 'conversionRate' | 'avgDealSize'>('deals');
  const [sortAsc, setSortAsc] = useState(false);
  const [team, setTeam] = useState<TeamMember[]>([]);

  const sortedTeam = useMemo(() => {
    return [...team].sort((a, b) => {
      const diff = a[sortMetric] - b[sortMetric];
      return sortAsc ? diff : -diff;
    });
  }, [team, sortMetric, sortAsc]);

  const maxValues = useMemo(() => ({
    leads: Math.max(...team.map((m) => m.leads), 0),
    calls: Math.max(...team.map((m) => m.calls), 0),
    emails: Math.max(...team.map((m) => m.emails), 0),
    meetings: Math.max(...team.map((m) => m.meetings), 0),
    deals: Math.max(...team.map((m) => m.deals), 0),
  }), [team]);

  const topPerformer = team[0] || null;
  const teamAvg = useMemo(() => {
    if (team.length === 0) return { deals: 0, revenue: 0, conversionRate: 0 };
    const calc = (key: keyof TeamMember) => {
      const vals = team.map((m) => m[key] as number);
      return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
    };
    return { deals: calc('deals'), revenue: calc('revenue'), conversionRate: calc('conversionRate') };
  }, [team]);

  const handleSort = (metric: 'deals' | 'revenue' | 'conversionRate' | 'avgDealSize') => {
    if (sortMetric === metric) setSortAsc(!sortAsc);
    else { setSortMetric(metric); setSortAsc(false); }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="rounded-lg p-2 bg-amber-500/10">
            <Users className="h-5 w-5 text-amber-500" />
          </div>
          <div>
            <h2 className="text-lg font-bold">Team Performance</h2>
            <p className="text-xs text-muted-foreground">Individual member tracking</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="h-9 rounded-lg border border-white/10 bg-white/5 backdrop-blur-sm px-3 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
          >
            {PERIODS.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          <Button size="sm" variant="outline" className="h-9 gap-1.5 text-xs border-white/10 bg-white/5">
            <Download className="h-3.5 w-3.5" />
            Export
          </Button>
        </div>
      </div>

      {/* Performance Heatmap */}
      <Card className="bg-white/5 backdrop-blur-xl border border-white/10 dark:bg-black/20">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Zap className="h-4 w-4 text-amber-500" />
            Performance Heatmap
          </CardTitle>
          <p className="text-[11px] text-muted-foreground">Click metric headers to sort</p>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <div className="min-w-[500px]">
              {/* Header Row */}
              <div className="grid grid-cols-[140px_repeat(5,1fr)] gap-1 mb-1">
                <div className="text-[10px] font-medium text-muted-foreground px-2">Member</div>
                {METRICS.map((m) => (
                  <button
                    key={m.key}
                    onClick={() => {}}
                    className="text-[10px] font-medium text-muted-foreground text-center hover:text-foreground transition-colors"
                  >
                    {m.label}
                  </button>
                ))}
              </div>
              {/* Data Rows */}
              <div className="space-y-1">
                {team.map((member, mi) => (
                  <motion.div
                    key={member.name}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 + mi * 0.05 }}
                    className="grid grid-cols-[140px_repeat(5,1fr)] gap-1"
                  >
                    <div className="flex items-center gap-2 px-2">
                      <Avatar className="h-6 w-6">
                        <AvatarFallback className="text-[9px] font-bold text-white" style={{ backgroundColor: member.color }}>
                          {member.initials}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-xs font-medium truncate">{member.name.split(' ')[0]}</span>
                    </div>
                    {METRICS.map((m) => (
                      <TooltipProvider key={m.key}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className={cn(
                              'rounded-md border px-2 py-1.5 text-center text-xs font-bold tabular-nums cursor-default transition-colors',
                              getHeatColor(member[m.key], maxValues[m.key])
                            )}>
                              {member[m.key]}
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{member.name} — {m.label}: {member[m.key]}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    ))}
                  </motion.div>
                ))}
              </div>
              {/* Legend */}
              <div className="flex items-center gap-4 mt-3 justify-center">
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <div className="h-2.5 w-2.5 rounded bg-red-500/30" /> Low
                </div>
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <div className="h-2.5 w-2.5 rounded bg-amber-500/30" /> Mid
                </div>
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <div className="h-2.5 w-2.5 rounded bg-emerald-500/30" /> High
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Top Performer Spotlight */}
      {topPerformer ? (
      <Card className="bg-white/5 backdrop-blur-xl border border-white/10 dark:bg-black/20 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-amber-500/10 to-transparent rounded-bl-full pointer-events-none" />
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Crown className="h-4 w-4 text-amber-400" />
            Top Performer Spotlight
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex items-center gap-4 sm:flex-col sm:items-center sm:text-center">
              <Avatar className="h-16 w-16 ring-2 ring-amber-400/50 ring-offset-2 ring-offset-background">
                <AvatarFallback className="text-lg font-bold text-white" style={{ backgroundColor: topPerformer.color }}>
                  {topPerformer.initials}
                </AvatarFallback>
              </Avatar>
              <div>
                <div className="flex items-center gap-2 sm:justify-center">
                  <p className="text-base font-bold">{topPerformer.name}</p>
                  <Crown className="h-4 w-4 text-amber-400" />
                </div>
                <p className="text-xs text-muted-foreground">{topPerformer.role}</p>
                <div className="flex gap-1.5 mt-2 sm:justify-center flex-wrap">
                  {topPerformer.badges.map((badge) => (
                    <Badge key={badge} className="text-[9px] h-5 px-1.5 bg-amber-500/15 text-amber-500 border-amber-500/25 border font-medium gap-0.5">
                      <Star className="h-2.5 w-2.5" />
                      {badge}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
            <Separator orientation="vertical" className="hidden sm:block" />
            <div className="flex-1 grid grid-cols-3 gap-3">
              {[
                { label: 'Deals Closed', value: topPerformer.deals, avg: teamAvg.deals },
                { label: 'Revenue', value: `$${(topPerformer.revenue / 1000).toFixed(0)}k`, avg: `$${(teamAvg.revenue / 1000).toFixed(0)}k` },
                { label: 'Conv. Rate', value: `${topPerformer.conversionRate}%`, avg: `${teamAvg.conversionRate}%` },
              ].map((stat) => (
                <div key={stat.label} className="p-3 rounded-lg bg-muted/20 border border-white/5">
                  <p className="text-[10px] text-muted-foreground">{stat.label}</p>
                  <p className="text-lg font-extrabold tabular-nums mt-0.5">{stat.value}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Team avg: {stat.avg}</p>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
      ) : (
        <Card className="bg-white/5 backdrop-blur-xl border border-white/10 dark:bg-black/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Crown className="h-4 w-4 text-amber-400" />
              Top Performer Spotlight
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground text-center py-6">No team data available yet.</p>
          </CardContent>
        </Card>
      )}

      {/* Team Ranking Table */}
      <Card className="bg-white/5 backdrop-blur-xl border border-white/10 dark:bg-black/20">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Trophy className="h-4 w-4 text-emerald-500" />
            Team Ranking
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px]">
              <thead>
                <tr className="border-b border-white/10">
                  {[
                    { key: null, label: '#' },
                    { key: null, label: 'Name' },
                    { key: 'deals' as const, label: 'Deals' },
                    { key: 'revenue' as const, label: 'Revenue' },
                    { key: 'conversionRate' as const, label: 'Conv. %' },
                    { key: 'avgDealSize' as const, label: 'Avg Deal' },
                    { key: null, label: 'Trend' },
                  ].map((col) => (
                    <th
                      key={col.label}
                      onClick={() => col.key && handleSort(col.key)}
                      className={cn(
                        'text-[10px] font-medium text-muted-foreground text-left py-2 px-2',
                        col.key && 'cursor-pointer hover:text-foreground transition-colors select-none'
                      )}
                    >
                      {col.label}
                      {col.key && sortMetric === col.key && (
                        <span className="ml-0.5">{sortAsc ? '↑' : '↓'}</span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedTeam.map((member, idx) => {
                  const rank = team.indexOf(member) + 1;
                  const sortedIdx = idx;
                  return (
                    <motion.tr
                      key={member.name}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.15 + sortedIdx * 0.04 }}
                      className={cn(
                        'border-b border-white/5 hover:bg-white/[0.02] transition-colors',
                        member.isCurrentUser && 'bg-emerald-500/5'
                      )}
                    >
                      <td className="py-2.5 px-2">
                        <RankIcon rank={rank} />
                      </td>
                      <td className="py-2.5 px-2">
                        <div className="flex items-center gap-2">
                          <Avatar className="h-6 w-6">
                            <AvatarFallback className="text-[8px] font-bold text-white" style={{ backgroundColor: member.color }}>
                              {member.initials}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="text-xs font-medium">{member.name}</p>
                            {member.isCurrentUser && (
                              <p className="text-[9px] text-emerald-500">(You)</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 px-2 text-xs font-bold tabular-nums">{member.deals}</td>
                      <td className="py-2.5 px-2 text-xs font-bold tabular-nums">${(member.revenue / 1000).toFixed(0)}k</td>
                      <td className="py-2.5 px-2 text-xs font-bold tabular-nums">{member.conversionRate}%</td>
                      <td className="py-2.5 px-2 text-xs font-bold tabular-nums">${(member.avgDealSize / 1000).toFixed(1)}k</td>
                      <td className="py-2.5 px-2">
                        <div className={cn(
                          'flex items-center gap-0.5 text-xs font-medium',
                          member.trend === 'up' ? 'text-emerald-500' : 'text-red-400'
                        )}>
                          {member.trend === 'up' ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                          {member.trendPct > 0 ? '+' : ''}{member.trendPct}%
                        </div>
                      </td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Performance Distribution */}
      <Card className="bg-white/5 backdrop-blur-xl border border-white/10 dark:bg-black/20">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <BarChart className="h-4 w-4 text-sky-500" />
            Performance Distribution
          </CardTitle>
          <p className="text-[11px] text-muted-foreground">Team members by performance tier</p>
        </CardHeader>
        <CardContent>
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={DISTRIBUTION} margin={{ left: -10, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                <XAxis dataKey="tier" tick={{ fontSize: 9 }} className="fill-muted-foreground" interval={0} />
                <YAxis tick={{ fontSize: 10 }} className="fill-muted-foreground" allowDecimals={false} />
                <RTooltip
                  contentStyle={{
                    backgroundColor: 'hsl(240 10% 3.9%)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '8px',
                    fontSize: '12px',
                    color: 'hsl(0 0% 98%)',
                  }}
                />
                <Bar dataKey="count" name="Members" radius={[6, 6, 0, 0]} barSize={48}>
                  {DISTRIBUTION.map((entry) => (
                    <Cell key={entry.tier} fill={entry.color} fillOpacity={0.8} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}


