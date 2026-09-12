'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { Shield, Phone, Mail, CalendarCheck, AlertTriangle, TrendingUp, ArrowUpRight, ArrowDownRight, Zap } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

/* ===== Data — fetched from API ===== */

/* ===== Loading Skeleton ===== */
function ChurnSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-6 bg-muted rounded w-48" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-32 bg-muted rounded-xl" />
        ))}
      </div>
      <div className="h-64 bg-muted rounded-xl" />
    </div>
  );
}

/* ===== Retention Health Gauge ===== */
function RetentionGauge({ score }: { score: number }) {
  const radius = 70;
  const strokeWidth = 12;
  const cx = 90;
  const cy = 90;
  const arcLength = Math.PI * radius;
  const filledLength = (score / 100) * arcLength;

  const color = score > 85 ? '#10b981' : score >= 70 ? '#f59e0b' : '#ef4444';
  const label = score > 85 ? 'Healthy' : score >= 70 ? 'At Risk' : 'Critical';

  return (
    <div className="flex flex-col items-center">
      <svg width={180} height={110} viewBox="0 0 180 110">
        {/* Background arc */}
        <path
          d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`}
          fill="none"
          stroke="currentColor"
          className="text-muted/30"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        {/* Filled arc */}
        <motion.path
          d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${arcLength}`}
          initial={{ strokeDashoffset: arcLength }}
          animate={{ strokeDashoffset: arcLength - filledLength }}
          transition={{ duration: 1.2, ease: 'easeOut' }}
        />
        {/* Center text */}
        <text x={cx} y={cy - 10} textAnchor="middle" className="fill-foreground" fontSize={28} fontWeight="bold">
          {score}
        </text>
        <text x={cx} y={cy + 10} textAnchor="middle" className="fill-muted-foreground" fontSize={10}>
          / 100
        </text>
      </svg>
      <Badge
        className={cn(
          'text-[10px] font-semibold',
          score > 85 ? 'bg-emerald-500/15 text-emerald-500 border-emerald-500/25' :
          score >= 70 ? 'bg-amber-500/15 text-amber-500 border-amber-500/25' :
          'bg-red-500/15 text-red-500 border-red-500/25'
        )}
        variant="outline"
      >
        {label}
      </Badge>
    </div>
  );
}

/* ===== Risk Level Badge ===== */
function RiskBadge({ level }: { level: 'High' | 'Medium' | 'Low' }) {
  const config = {
    High: { color: 'text-red-500', bg: 'bg-red-500', label: 'High' },
    Medium: { color: 'text-amber-500', bg: 'bg-amber-500', label: 'Medium' },
    Low: { color: 'text-emerald-500', bg: 'bg-emerald-500', label: 'Low' },
  };
  const c = config[level];
  return (
    <Badge variant="outline" className="text-[10px] h-5 px-1.5 gap-1 border-border/50">
      <span className={cn('h-1.5 w-1.5 rounded-full', c.bg)} />
      <span className={c.color}>{c.label}</span>
    </Badge>
  );
}

/* ===== Priority Badge ===== */
function PriorityBadge({ priority }: { priority: 'Critical' | 'High' | 'Medium' | 'Low' }) {
  const config = {
    Critical: 'bg-red-500/15 text-red-400 border-red-500/25',
    High: 'bg-orange-500/15 text-orange-400 border-orange-500/25',
    Medium: 'bg-amber-500/15 text-amber-400 border-amber-500/25',
    Low: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
  };
  return (
    <Badge variant="outline" className={cn('text-[10px] h-5 px-1.5 font-medium border', config[priority])}>
      {priority}
    </Badge>
  );
}

/* ===== Main Component ===== */
export default function ChurnRiskCenter() {
  const [churnData, setChurnData] = useState<{
    retentionScore: number;
    churnTrendData: Array<{ month: string; rate: number }>;
    atRiskAccounts: Array<{
      id: string;
      name: string;
      industry: string;
      value: number;
      riskLevel: 'High' | 'Medium' | 'Low';
      factors: string[];
    }>;
    proactiveActions: Array<{
      id: string;
      text: string;
      priority: 'Critical' | 'High' | 'Medium' | 'Low';
      type: string;
    }>;
    retentionMetrics: Array<{
      label: string;
      value: string | number;
      trend: string | null;
      trendUp: boolean | null;
    }>;
  } | null>(null);
  const [churnLoading, setChurnLoading] = useState(true);
  const [churnError, setChurnError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/dashboard/churn-risk')
      .then(r => { if (!r.ok) throw new Error('Failed to load churn risk data'); return r.json(); })
      .then(res => {
        if (res.data) setChurnData(res.data);
      })
      .catch(e => setChurnError(e.message))
      .finally(() => setChurnLoading(false));
  }, []);

  if (churnLoading) return <ChurnSkeleton />;
  if (churnError) return <div className="p-6 text-destructive">Error: {churnError}</div>;
  if (!churnData) return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="rounded-lg p-2 bg-emerald-500/10">
            <Shield className="h-5 w-5 text-emerald-500" />
          </div>
          <div>
            <h2 className="text-lg font-bold">Retention Center</h2>
            <p className="text-xs text-muted-foreground">No churn data available yet</p>
          </div>
        </div>
      </div>
    </div>
  );

  const { retentionScore, churnTrendData, atRiskAccounts, proactiveActions, retentionMetrics } = churnData;
  const RETENTION_SCORE = retentionScore;
  const CHURN_TREND_DATA = churnTrendData;
  const AT_RISK_ACCOUNTS = atRiskAccounts;
  const PROACTIVE_ACTIONS = proactiveActions;
  const atRiskCount = AT_RISK_ACCOUNTS.filter((a) => a.riskLevel === 'High').length;

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
          <div className="rounded-lg p-2 bg-emerald-500/10">
            <Shield className="h-5 w-5 text-emerald-500" />
          </div>
          <div>
            <h2 className="text-lg font-bold">Retention Center</h2>
            <p className="text-xs text-muted-foreground">Customer health & churn prevention</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge className="text-xs bg-emerald-500/15 text-emerald-500 border-emerald-500/25 font-bold" variant="outline">
            94.2% Retention
          </Badge>
          <Badge className="text-xs bg-red-500/15 text-red-400 border-red-500/25 font-bold" variant="outline">
            {atRiskCount} At Risk
          </Badge>
        </div>
      </div>

      {/* Gauge + Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="sm:col-span-2 bg-white/5 backdrop-blur-xl border border-white/10 dark:bg-black/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Retention Health Gauge</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-center">
            <RetentionGauge score={RETENTION_SCORE} />
          </CardContent>
        </Card>

        {retentionMetrics.map((metric, i) => (
          <motion.div
            key={metric.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 + i * 0.08 }}
          >
            <Card className="bg-white/5 backdrop-blur-xl border border-white/10 dark:bg-black/20 h-full">
              <CardContent className="p-4 flex flex-col justify-center h-full">
                <p className="text-[11px] text-muted-foreground mb-1">{metric.label}</p>
                <p className="text-xl font-bold">{metric.value}</p>
                {metric.trend && metric.trendUp !== null && (
                  <div className={cn('flex items-center gap-0.5 text-[11px] font-medium mt-1', metric.trendUp ? 'text-emerald-500' : 'text-red-500')}>
                    {metric.trendUp ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                    {metric.trend}
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Churn Trend Chart */}
      <Card className="bg-white/5 backdrop-blur-xl border border-white/10 dark:bg-black/20">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-rose-500" />
            Churn Trend (12 months)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={CHURN_TREND_DATA} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                <defs>
                  <linearGradient id="churnGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ef4444" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#ef4444" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} className="fill-muted-foreground" />
                <YAxis tick={{ fontSize: 10 }} className="fill-muted-foreground" tickFormatter={(v: number) => `${v}%`} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(240 10% 3.9%)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '8px',
                    fontSize: '12px',
                    color: 'hsl(0 0% 98%)',
                  }}
                  formatter={(value: number) => [`${value}%`, 'Churn Rate']}
                />
                <ReferenceLine y={5} stroke="#f59e0b" strokeDasharray="6 4" label={{ value: 'Target 5%', fill: '#f59e0b', fontSize: 10 }} />
                <Area type="monotone" dataKey="rate" stroke="#ef4444" fill="url(#churnGradient)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* At-Risk Accounts + Proactive Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* At-Risk Accounts */}
        <Card className="lg:col-span-2 bg-white/5 backdrop-blur-xl border border-white/10 dark:bg-black/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-500" />
              At-Risk Accounts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {AT_RISK_ACCOUNTS.map((account, i) => (
                <motion.div
                  key={account.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3 + i * 0.06 }}
                  className="p-3 rounded-lg border border-white/5 hover:border-white/10 transition-all"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <p className="text-sm font-semibold truncate">{account.name}</p>
                      <RiskBadge level={account.riskLevel} />
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs font-bold tabular-nums">${account.value.toLocaleString()}</span>
                      <Button variant="outline" size="sm" className="h-7 text-[10px] gap-1">
                        Take Action
                        <Zap className="h-2.5 w-2.5" />
                      </Button>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mb-1.5">
                    <span>{account.industry}</span>
                    <span>·</span>
                    <span>Contract value: ${account.value.toLocaleString()}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {account.factors.map((factor, fi) => (
                      <Badge key={fi} variant="secondary" className="text-[9px] h-4 px-1.5 bg-muted/50 text-muted-foreground">
                        {factor}
                      </Badge>
                    ))}
                  </div>
                </motion.div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Proactive Actions Queue */}
        <Card className="bg-white/5 backdrop-blur-xl border border-white/10 dark:bg-black/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Zap className="h-4 w-4 text-amber-500" />
              Suggested Actions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {PROACTIVE_ACTIONS.map((action, i) => {
                const ActionIcon = action.type === 'Schedule Call' ? Phone : Mail;
                return (
                  <motion.div
                    key={action.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.4 + i * 0.08 }}
                    className="p-3 rounded-lg border border-white/5 hover:border-white/10 transition-all group"
                  >
                    <div className="flex items-start gap-2 mb-2">
                      <PriorityBadge priority={action.priority} />
                      <Badge variant="secondary" className="text-[9px] h-4 px-1.5 gap-0.5 shrink-0">
                        <ActionIcon className="h-2.5 w-2.5" />
                        {action.type}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed mb-2">{action.text}</p>
                    <Button size="sm" className="h-7 w-full text-[10px] gap-1.5 bg-primary/10 text-primary hover:bg-primary/20">
                      <CalendarCheck className="h-3 w-3" />
                      Execute Action
                    </Button>
                  </motion.div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </motion.div>
  );
}
