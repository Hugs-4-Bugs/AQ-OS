'use client';

import React, { useState } from 'react';
import { motion, type Variants } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip,
  ResponsiveContainer, LineChart, Line, ReferenceLine, Area, AreaChart, Cell,
} from 'recharts';
import { cn } from '@/lib/utils';
import {
  TrendingUp, DollarSign, Target, ArrowUpRight, ArrowDownRight,
  PieChart as PieIcon, Plus, Calendar, ArrowRight,
} from 'lucide-react';

const periodTabs = ['This Quarter', 'This Year'] as const;
type Period = typeof periodTabs[number];

// Data loaded from API — empty until connected
const overallROI = 0;
const totalInvestment = 0;
const totalRevenue = 0;

const investmentBreakdown: Array<{ category: string; amount: number; pct: number; color: string }> = [];

const revenueAttribution: Array<{ source: string; amount: number; pct: number; trend: number; color: string; bg: string; border: string }> = [];

const roiTrendData: Array<{ month: string; roi: number }> = [];

const cpaData: Array<{ channel: string; cpa: number; fill: string }> = [];

const targetCPA = 0;

const quarterlyComparison: Array<{ metric: string; value: string; change: string; positive: boolean }> = [];

const hasROI = investmentBreakdown.length > 0 || revenueAttribution.length > 0 || roiTrendData.length > 0;

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06 } },
};
const itemVariants: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 24 } },
};

function ROIGauge({ value }: { value: number }) {
  const angle = value > 0 ? Math.min((value / 400) * 180, 180) : 0;
  const gaugeColor = value <= 0 ? '#94a3b8' : value < 100 ? '#ef4444' : value < 200 ? '#f59e0b' : '#10b981';

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-48 h-28 sm:w-56 sm:h-32">
        <svg viewBox="0 0 200 110" className="w-full h-full">
          <defs>
            <linearGradient id="gaugeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#ef4444" />
              <stop offset="35%" stopColor="#f59e0b" />
              <stop offset="60%" stopColor="#10b981" />
              <stop offset="100%" stopColor="#059669" />
            </linearGradient>
          </defs>
          {/* Background arc */}
          <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="rgba(148,163,184,0.15)" strokeWidth="16" strokeLinecap="round" />
          {/* Value arc */}
          <path
            d="M 20 100 A 80 80 0 0 1 180 100"
            fill="none"
            stroke={value > 0 ? "url(#gaugeGrad)" : "rgba(148,163,184,0.2)"}
            strokeWidth="16"
            strokeLinecap="round"
            strokeDasharray={`${(angle / 180) * 251.2} 251.2`}
          />
          {/* Needle */}
          <line
            x1="100" y1="100"
            x2={100 + 65 * Math.cos(((180 - angle) * Math.PI) / 180)}
            y2={100 - 65 * Math.sin(((180 - angle) * Math.PI) / 180)}
            stroke={gaugeColor}
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <circle cx="100" cy="100" r="5" fill={gaugeColor} />
        </svg>
      </div>
      <div className="text-center mt-1">
        <p className="text-3xl sm:text-4xl font-extrabold tabular-nums" style={{ color: gaugeColor }}>{value}%</p>
        <p className="text-xs text-muted-foreground mt-0.5">Overall ROI</p>
      </div>
    </div>
  );
}

function ChartEmptyState({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-52 text-center">
      <div className="h-12 w-12 rounded-full bg-muted/60 flex items-center justify-center mb-2">
        <TrendingUp className="h-5 w-5 text-muted-foreground/50" />
      </div>
      <p className="text-xs font-medium text-muted-foreground">No data</p>
      <p className="text-[10px] text-muted-foreground/70 mt-0.5">{label}</p>
    </div>
  );
}

export default function ROIInvestmentTracker() {
  const [activePeriod, setActivePeriod] = useState<Period>('This Quarter');

  if (!hasROI) {
    return (
      <motion.div variants={containerVariants} initial="hidden" animate="show" className="space-y-6">
        {/* Header */}
        <Card className="card-glow glass-card overflow-hidden">
          <CardHeader className="pb-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <div className="rounded-lg p-2 bg-gradient-to-br from-emerald-500 to-teal-500">
                  <DollarSign className="h-4 w-4 text-white" />
                </div>
                ROI Tracker
              </CardTitle>
              <div className="flex items-center gap-2">
                <Button size="sm" className="h-8 text-xs gap-1">
                  <Plus className="h-3 w-3" />
                  Add Investment
                </Button>
                <div className="flex items-center gap-1 p-1 rounded-lg bg-muted/50">
                  {periodTabs.map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setActivePeriod(tab)}
                      className={cn(
                        'px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-200',
                        activePeriod === tab
                          ? 'bg-background shadow-sm text-foreground'
                          : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      {tab}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </CardHeader>
        </Card>

        {/* Empty State */}
        <motion.div variants={itemVariants}>
          <Card className="card-glow glass-card overflow-hidden">
            <CardContent className="py-16 px-6 flex flex-col items-center justify-center text-center">
              <div className="h-20 w-20 rounded-full bg-emerald-500/10 flex items-center justify-center mb-5">
                <DollarSign className="h-10 w-10 text-emerald-500/60" />
              </div>
              <h3 className="text-lg font-semibold mb-2">No investment or revenue data available</h3>
              <p className="text-sm text-muted-foreground max-w-md mb-6">
                Connect your billing and analytics to see ROI tracking.
              </p>
              <div className="flex items-center gap-3">
                <Button size="sm" className="h-9 text-xs gap-1.5">
                  <Plus className="h-3.5 w-3.5" />
                  Add Investment
                </Button>
                <Button variant="outline" size="sm" className="h-9 text-xs gap-1.5">
                  Connect Analytics
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>
    );
  }

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="show" className="space-y-6">
      {/* Header */}
      <Card className="card-glow glass-card overflow-hidden">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <div className="rounded-lg p-2 bg-gradient-to-br from-emerald-500 to-teal-500">
                <DollarSign className="h-4 w-4 text-white" />
              </div>
              ROI Tracker
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button size="sm" className="h-8 text-xs gap-1">
                <Plus className="h-3 w-3" />
                Add Investment
              </Button>
              <div className="flex items-center gap-1 p-1 rounded-lg bg-muted/50">
                {periodTabs.map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActivePeriod(tab)}
                    className={cn(
                      'px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-200',
                      activePeriod === tab
                        ? 'bg-background shadow-sm text-foreground'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {tab}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* ROI Gauge + Investment vs Revenue */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <motion.div variants={itemVariants}>
          <Card className="card-glow glass-card overflow-hidden">
            <CardContent className="p-6 flex flex-col items-center justify-center">
              <ROIGauge value={overallROI} />
              <Separator className="my-4" />
              <div className="grid grid-cols-2 gap-4 w-full">
                <div className="text-center p-3 rounded-lg bg-red-500/5 border border-red-500/10">
                  <p className="text-lg font-extrabold text-red-500">${(totalInvestment / 1000).toFixed(0)}K</p>
                  <p className="text-[10px] text-muted-foreground">Total Investment</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/10">
                  <p className="text-lg font-extrabold text-emerald-500">${(totalRevenue / 1000).toFixed(0)}K</p>
                  <p className="text-[10px] text-muted-foreground">Revenue Generated</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Investment Breakdown */}
        <motion.div variants={itemVariants} className="lg:col-span-2">
          <Card className="card-glow glass-card overflow-hidden h-full">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <PieIcon className="h-4 w-4 text-violet-500" />
                Investment Breakdown
              </CardTitle>
            </CardHeader>
            <CardContent>
              {investmentBreakdown.length === 0 ? (
                <ChartEmptyState label="Investment breakdown will appear here" />
              ) : (
                <>
                  <div className="flex h-8 rounded-lg overflow-hidden mb-4">
                    {investmentBreakdown.map((item) => (
                      <div
                        key={item.category}
                        className="cursor-pointer transition-all duration-300 hover:opacity-80 relative group"
                        style={{ width: `${item.pct}%`, backgroundColor: item.color }}
                      >
                        {item.pct > 5 && (
                          <span className="absolute inset-0 flex items-center justify-center text-[8px] font-bold text-white">
                            {item.pct}%
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {investmentBreakdown.map((item) => (
                      <div key={item.category} className="flex items-center gap-2 p-2 rounded-lg bg-muted/20">
                        <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: item.color }} />
                        <div className="min-w-0">
                          <p className="text-[10px] font-semibold truncate">{item.category}</p>
                          <p className="text-[10px] text-muted-foreground">${item.amount.toLocaleString()}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Revenue Attribution */}
      <motion.div variants={itemVariants}>
        {revenueAttribution.length === 0 ? (
          <Card className="card-glow glass-card overflow-hidden">
            <CardContent className="py-12">
              <ChartEmptyState label="Revenue attribution data will appear here" />
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {revenueAttribution.map((src) => (
              <motion.div key={src.source} whileHover={{ scale: 1.02, y: -2 }} transition={{ type: 'spring', stiffness: 400, damping: 20 }}>
                <Card className={cn('glass-card overflow-hidden border', src.border)}>
                  <CardContent className="p-4">
                    <div className={cn('flex items-center gap-0.5 text-xs font-semibold mb-2', src.trend >= 0 ? 'text-emerald-500' : 'text-red-500')}>
                      {src.trend >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                      {src.trend > 0 ? '+' : ''}{src.trend}%
                    </div>
                    <p className="text-xl font-extrabold tabular-nums">${(src.amount / 1000).toFixed(1)}K</p>
                    <p className="text-xs text-muted-foreground">{src.source}</p>
                    <div className="mt-2 w-full bg-muted rounded-full h-1.5 overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-700" style={{
                        width: `${src.pct}%`,
                        backgroundColor: src.color.includes('emerald') ? '#10b981' : src.color.includes('sky') ? '#0ea5e9' : src.color.includes('violet') ? '#8b5cf6' : '#f97316',
                      }} />
                    </div>
                    <p className="text-[9px] text-muted-foreground mt-1">{src.pct}% of total</p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        )}
      </motion.div>

      {/* ROI Trend + CPA */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <motion.div variants={itemVariants}>
          <Card className="card-glow glass-card overflow-hidden">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-emerald-500" />
                ROI Trend (Monthly)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {roiTrendData.length === 0 ? (
                <ChartEmptyState label="ROI trend data will appear here" />
              ) : (
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={roiTrendData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                      <defs>
                        <linearGradient id="roiAreaGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                          <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.1)" />
                      <XAxis dataKey="month" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                      <RTooltip contentStyle={{ background: 'rgba(15,23,42,0.9)', border: '1px solid rgba(148,163,184,0.2)', borderRadius: 8, fontSize: 12 }} />
                      <ReferenceLine y={100} stroke="#ef4444" strokeDasharray="4 4" label={{ value: 'Break Even', fill: '#ef4444', fontSize: 9, position: 'insideTopLeft' }} />
                      <Area type="monotone" dataKey="roi" stroke="#10b981" strokeWidth={2} fill="url(#roiAreaGrad)" dot={{ r: 3, fill: '#10b981' }} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={itemVariants}>
          <Card className="card-glow glass-card overflow-hidden">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <Target className="h-4 w-4 text-orange-500" />
                Cost per Acquisition by Channel
              </CardTitle>
            </CardHeader>
            <CardContent>
              {cpaData.length === 0 ? (
                <ChartEmptyState label="CPA data will appear here" />
              ) : (
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={cpaData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.1)" />
                      <XAxis dataKey="channel" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                      <RTooltip contentStyle={{ background: 'rgba(15,23,42,0.9)', border: '1px solid rgba(148,163,184,0.2)', borderRadius: 8, fontSize: 12 }} />
                      <ReferenceLine y={targetCPA} stroke="#ef4444" strokeDasharray="4 4" label={{ value: `Target $${targetCPA}`, fill: '#ef4444', fontSize: 9, position: 'insideTopRight' }} />
                      <Bar dataKey="cpa" radius={[6, 6, 0, 0]} barSize={32}>
                        {cpaData.map((entry, index) => (
                          <Cell key={index} fill={entry.fill} opacity={entry.cpa <= targetCPA ? 0.85 : 0.5} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Quarterly Comparison */}
      <motion.div variants={itemVariants}>
        <Card className="card-glow glass-card overflow-hidden">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Calendar className="h-4 w-4 text-emerald-500" />
              Quarterly Comparison
            </CardTitle>
          </CardHeader>
          <CardContent>
            {quarterlyComparison.length === 0 ? (
              <ChartEmptyState label="Quarterly comparison data will appear here" />
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {quarterlyComparison.map((q) => (
                  <div key={q.metric} className="p-3 rounded-lg bg-muted/20 border border-border/20 text-center">
                    <p className="text-xs text-muted-foreground mb-1">{q.metric}</p>
                    <p className="text-lg font-bold tabular-nums">{q.value}</p>
                    <p className={cn('text-xs font-semibold', q.positive ? 'text-emerald-500' : 'text-red-500')}>
                      {q.change}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}
