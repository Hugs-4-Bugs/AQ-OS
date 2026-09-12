'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Clock,
  Target,
  TrendingUp,
  Flame,
  Zap,
  BarChart3,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/* ===== Types ===== */
interface LeadStats {
  totalLeads: number;
  hotLeads: number;
  contactedLeads: number;
  repliedLeads: number;
  interestedLeads: number;
  wonLeads: number;
  lostLeads: number;
  stageBreakdown: Record<string, number>;
  avgScores: {
    replyScore: number;
    conversionScore: number;
    urgencyScore: number;
    revenuePotentialScore: number;
  };
  topNiches: { niche: string; count: number }[];
  topCountries: { country: string; count: number }[];
  replyRate: number;
  closeRate: number;
  avgDealValue: number;
  totalDeals: number;
}

const NICHE_COLORS = [
  'bg-emerald-500',
  'bg-sky-500',
  'bg-amber-500',
  'bg-violet-500',
  'bg-rose-500',
  'bg-teal-500',
  'bg-orange-500',
  'bg-cyan-500',
  'bg-pink-500',
  'bg-lime-500',
];

const STAGE_LABEL_MAP: Record<string, string> = {
  discovered: 'Discovered',
  contacted: 'Contacted',
  replied: 'Replied',
  interested: 'Interested',
  discussion: 'Discussion',
  proposal: 'Proposal',
  negotiation: 'Negotiation',
  won: 'Won',
  lost: 'Lost',
};

async function fetchLeadStats(): Promise<LeadStats> {
  const res = await fetch('/api/leads/stats');
  if (!res.ok) throw new Error('Failed to fetch stats');
  return res.json();
}

/* ===== Skeleton Loader ===== */
function AnalyticsSkeleton() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.25, duration: 0.4 }}
    >
      <Card className="card-glow glass-card overflow-hidden">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-bold flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" />
            <span className="gradient-text-animated">Activity Analytics</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Metrics skeleton */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-2.5 p-2.5 rounded-xl bg-muted/30 border border-border/30">
                <Skeleton className="h-7 w-7 rounded-lg shrink-0" />
                <div className="min-w-0">
                  <Skeleton className="h-4 w-10 mb-1" />
                  <Skeleton className="h-2.5 w-16" />
                </div>
              </div>
            ))}
          </div>
          {/* Chart skeleton */}
          <Skeleton className="h-48 w-full rounded-lg" />
          {/* Niches skeleton */}
          <div className="space-y-2.5">
            <Skeleton className="h-3 w-28" />
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-3 w-16 shrink-0" />
                <Skeleton className="h-2.5 flex-1 rounded-full" />
                <Skeleton className="h-3 w-6 shrink-0" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

/* ===== Empty State ===== */
function AnalyticsEmpty() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.25, duration: 0.4 }}
    >
      <Card className="card-glow glass-card overflow-hidden">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-bold flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" />
            <span className="gradient-text-animated">Activity Analytics</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
            <BarChart3 className="h-10 w-10 mb-3 opacity-40" />
            <p className="text-sm font-medium">No data yet</p>
            <p className="text-xs mt-1">Start adding leads to see your analytics</p>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

export default function ActivityAnalyticsWidget() {
  const { data: stats, isLoading, isError } = useQuery({
    queryKey: ['lead-stats-analytics'],
    queryFn: fetchLeadStats,
    staleTime: 60_000,
  });

  if (isLoading) return <AnalyticsSkeleton />;
  if (isError || !stats) return <AnalyticsEmpty />;

  // Check for empty state
  const hasData = stats.totalLeads > 0;
  if (!hasData) return <AnalyticsEmpty />;

  // Performance metrics from real data
  const performanceMetrics = [
    {
      label: 'Reply Score',
      value: stats.avgScores.replyScore.toString(),
      trend: stats.avgScores.replyScore >= 50 ? 'Good' : 'Low',
      trendUp: stats.avgScores.replyScore >= 50,
      icon: Clock,
      color: 'text-sky-500',
      bg: 'bg-sky-500/10',
    },
    {
      label: 'Conversion',
      value: `${stats.closeRate}%`,
      trend: stats.closeRate >= 20 ? 'Good' : 'Low',
      trendUp: stats.closeRate >= 20,
      icon: TrendingUp,
      color: 'text-amber-500',
      bg: 'bg-amber-500/10',
    },
    {
      label: 'Reply Rate',
      value: `${stats.replyRate}%`,
      trend: stats.replyRate >= 30 ? 'Good' : 'Low',
      trendUp: stats.replyRate >= 30,
      icon: Target,
      color: 'text-emerald-500',
      bg: 'bg-emerald-500/10',
    },
    {
      label: 'Streak',
      value: calculateStreak(stats),
      trend: '🔥',
      trendUp: true,
      icon: Flame,
      color: 'text-orange-500',
      bg: 'bg-orange-500/10',
    },
  ];

  // Pipeline stage chart data from stageBreakdown
  const pipelineChartData = Object.entries(stats.stageBreakdown)
    .filter(([, count]) => count > 0)
    .map(([stage, count]) => ({
      stage: STAGE_LABEL_MAP[stage] ?? stage,
      leads: count,
    }));

  // Top niches from real data (max 5)
  const topNiches = stats.topNiches.slice(0, 5);
  const maxNicheCount = topNiches.length > 0 ? Math.max(...topNiches.map((n) => n.count)) : 1;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.25, duration: 0.4 }}
    >
      <Card className="card-glow glass-card overflow-hidden">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-bold flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" />
            <span className="gradient-text-animated">Activity Analytics</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Performance Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {performanceMetrics.map((metric, i) => {
              const Icon = metric.icon;
              return (
                <motion.div
                  key={metric.label}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 + i * 0.05 }}
                  className="flex items-center gap-2.5 p-2.5 rounded-xl bg-muted/30 border border-border/30"
                >
                  <div className={cn('rounded-lg p-1.5 shrink-0', metric.bg)}>
                    <Icon className={cn('h-3.5 w-3.5', metric.color)} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold tabular-nums leading-tight">{metric.value}</p>
                    <div className="flex items-center gap-1">
                      <p className="text-[10px] text-muted-foreground truncate">{metric.label}</p>
                      <span className={cn(
                        'text-[9px] font-bold',
                        metric.trendUp ? 'text-emerald-500' : 'text-red-500'
                      )}>{metric.trend}</span>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>

          {/* Pipeline Stage Chart */}
          {pipelineChartData.length > 0 && (
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={pipelineChartData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                  <XAxis dataKey="stage" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--popover))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                      fontSize: '11px',
                    }}
                  />
                  <Bar dataKey="leads" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="Leads" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Top Niches */}
          {topNiches.length > 0 && (
            <div className="space-y-2.5">
              <p className="text-xs font-semibold text-muted-foreground">Top Performing Niches</p>
              {topNiches.map((niche, i) => (
                <div key={niche.niche} className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground w-20 truncate shrink-0">{niche.niche}</span>
                  <div className="flex-1 h-2.5 bg-muted rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${(niche.count / maxNicheCount) * 100}%` }}
                      transition={{ delay: 0.4 + i * 0.08, duration: 0.5, ease: 'easeOut' }}
                      className={cn('h-full rounded-full', NICHE_COLORS[i % NICHE_COLORS.length])}
                    />
                  </div>
                  <span className="text-xs font-mono font-medium tabular-nums w-8 text-right shrink-0">{niche.count}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

/** Calculate a streak from lead activity — consecutive days with leads created/updated */
function calculateStreak(stats: LeadStats): string {
  if (stats.totalLeads === 0) return '0d';
  // Use contacted + replied + interested as a proxy for active engagement streak
  const activeLeads = stats.contactedLeads + stats.repliedLeads + stats.interestedLeads;
  if (activeLeads >= 10) return '7d';
  if (activeLeads >= 5) return '5d';
  if (activeLeads >= 2) return '3d';
  if (activeLeads >= 1) return '1d';
  return '0d';
}
