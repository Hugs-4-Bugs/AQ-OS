'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  Minus,
  Flame,
  FileText,
  Target,
  ArrowUpRight,
  Globe,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RTooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  Area,
  AreaChart,
} from 'recharts';

/* ===== Data — fetched from API ===== */

/* ===== Loading Skeleton ===== */
function MarketAnalysisSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-6 bg-muted rounded w-48" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="h-64 bg-muted rounded-xl" />
        <div className="h-64 bg-muted rounded-xl" />
      </div>
    </div>
  );
}

/* ===== Direction Icon Helper ===== */
function DirectionIcon({ direction }: { direction: 'up' | 'down' | 'flat' }) {
  if (direction === 'up') return <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />;
  if (direction === 'down') return <TrendingDown className="h-3.5 w-3.5 text-red-500" />;
  return <Minus className="h-3.5 w-3.5 text-amber-500" />;
}

/* ===== Competition Badge ===== */
function CompetitionBadge({ level }: { level: string }) {
  const colors: Record<string, string> = {
    High: 'bg-red-500/15 text-red-500 border-red-500/25',
    Medium: 'bg-amber-500/15 text-amber-500 border-amber-500/25',
    Low: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/25',
  };
  return (
    <Badge variant="outline" className={cn('text-[9px] h-5 px-1.5 border font-medium', colors[level] ?? 'bg-muted text-muted-foreground border-border')}>
      {level}
    </Badge>
  );
}

/* ===== Heat Indicator ===== */
function HeatIndicator({ level }: { level: 'High' | 'Medium' | 'Low' }) {
  const config = {
    High: { color: 'text-red-500', bars: 3 },
    Medium: { color: 'text-amber-500', bars: 2 },
    Low: { color: 'text-sky-500', bars: 1 },
  };
  const c = config[level];
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-end gap-0.5">
            {[1, 2, 3].map((bar) => (
              <div
                key={bar}
                className={cn('w-1 rounded-full transition-colors', bar <= c.bars ? c.color : 'bg-muted/30')}
                style={{ height: `${6 + bar * 3}px` }}
              />
            ))}
          </div>
        </TooltipTrigger>
        <TooltipContent><p>{level} Interest</p></TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/* ===== Opportunity Score Gauge ===== */
function OpportunityGauge({ score }: { score: { total: number; marketSize: number; growthRate: number; competition: number; fitScore: number } }) {
  const circumference = 2 * Math.PI * 54;
  const offset = circumference - (score.total / 100) * circumference;

  return (
    <Card className="bg-white/5 backdrop-blur-xl border border-white/10 dark:bg-black/20">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Target className="h-4 w-4 text-violet-500" />
          Opportunity Score
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center">
          <div className="relative h-32 w-32">
            <svg className="h-full w-full -rotate-90" viewBox="0 0 120 120">
              <circle cx="60" cy="60" r="54" fill="none" stroke="currentColor" className="text-muted/20" strokeWidth={8} />
              <circle
                cx="60"
                cy="60"
                r="54"
                fill="none"
                stroke="url(#gaugeGrad)"
                strokeWidth={8}
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={offset}
                className="transition-all duration-1000"
              />
              <defs>
                <linearGradient id="gaugeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#10b981" />
                  <stop offset="100%" stopColor="#8b5cf6" />
                </linearGradient>
              </defs>
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <p className="text-3xl font-extrabold tabular-nums">{score.total}</p>
              <p className="text-[10px] text-muted-foreground">/ 100</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 mt-4 w-full">
            {[
              { label: 'Market Size', value: score.marketSize },
              { label: 'Growth Rate', value: score.growthRate },
              { label: 'Competition', value: score.competition },
              { label: 'Fit Score', value: score.fitScore },
            ].map((item) => (
              <div key={item.label} className="flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground">{item.label}</span>
                <span className={cn('text-xs font-bold tabular-nums', item.value >= 80 ? 'text-emerald-500' : item.value >= 60 ? 'text-amber-500' : 'text-red-400')}>
                  {item.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ===== Main Component ===== */
export default function MarketAnalysisTrends() {
  const [industry, setIndustry] = useState('All Industries');
  const [marketData, setMarketData] = useState<{
    marketSize: Array<{ segment: string; value: number; label: string; color: string }>;
    industryTrends: Array<{ sector: string; direction: 'up' | 'down' | 'flat'; growth: number; relevance: number }>;
    hotSectors: Array<{ name: string; leads: number; avgDeal: number; competition: string; heat: 'High' | 'Medium' | 'Low' }>;
    marketTrend: Array<{ month: string; pipeline: number; market: number; competitor: number }>;
    opportunityScore: { total: number; marketSize: number; growthRate: number; competition: number; fitScore: number };
    trendingKeywords: Array<{ keyword: string; frequency: number; trend: 'up' | 'down' | null }>;
  } | null>(null);
  const [marketLoading, setMarketLoading] = useState(true);
  const [marketError, setMarketError] = useState<string | null>(null);

  const INDUSTRIES = ['All Industries', 'AI & ML', 'SaaS', 'HealthTech', 'FinTech'];

  useEffect(() => {
    fetch('/api/dashboard/market-analysis')
      .then(r => { if (!r.ok) throw new Error('Failed to load market data'); return r.json(); })
      .then(res => {
        if (res.data) {
          const d = res.data;
          setMarketData({
            marketSize: d.marketSize || [],
            industryTrends: (d.industryTrends || []).map((t: Record<string, unknown>) => ({
              sector: t.sector as string || 'Unknown',
              direction: (t.direction as 'up' | 'down' | 'flat') || 'flat',
              growth: (t.growth as number) || 0,
              relevance: (t.relevance as number) || 0,
            })),
            hotSectors: (d.hotSectors || []).map((s: Record<string, unknown>) => ({
              name: s.name as string || '',
              leads: (s.leads as number) || 0,
              avgDeal: (s.avgDeal as number) || 0,
              competition: s.competition as string || 'Medium',
              heat: (s.heat as 'High' | 'Medium' | 'Low') || 'Medium',
            })),
            marketTrend: (d.marketTrend || []).map((t: Record<string, unknown>) => ({
              month: t.month as string || '',
              pipeline: (t.pipeline as number) || 0,
              market: (t.market as number) || 0,
              competitor: (t.competitor as number) || 0,
            })),
            opportunityScore: d.opportunityScore || { total: 0, marketSize: 0, growthRate: 0, competition: 0, fitScore: 0 },
            trendingKeywords: (d.trendingKeywords || []).map((k: Record<string, unknown>) => ({
              keyword: k.keyword as string || '',
              frequency: (k.frequency as number) || 0,
              trend: (k.trend as 'up' | 'down' | null) || null,
            })),
          });
        }
      })
      .catch(e => setMarketError(e.message))
      .finally(() => setMarketLoading(false));
  }, []);

  if (marketLoading) return <MarketAnalysisSkeleton />;
  if (marketError) return <div className="p-6 text-destructive">Error: {marketError}</div>;
  if (!marketData) return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="rounded-lg p-2 bg-violet-500/10">
            <Globe className="h-5 w-5 text-violet-500" />
          </div>
          <div>
            <h2 className="text-lg font-bold">Market Analysis</h2>
            <p className="text-xs text-muted-foreground">No market data available yet</p>
          </div>
        </div>
      </div>
    </div>
  );

  const { marketSize, industryTrends, hotSectors, marketTrend, opportunityScore, trendingKeywords } = marketData;

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
          <div className="rounded-lg p-2 bg-violet-500/10">
            <Globe className="h-5 w-5 text-violet-500" />
          </div>
          <div>
            <h2 className="text-lg font-bold">Market Analysis</h2>
            <p className="text-xs text-muted-foreground">Intelligence & trend analysis</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
            className="h-9 rounded-lg border border-white/10 bg-white/5 backdrop-blur-sm px-3 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
          >
            {INDUSTRIES.map((ind) => (
              <option key={ind} value={ind}>{ind}</option>
            ))}
          </select>
          <Button size="sm" className="h-9 gap-1.5 text-xs">
            <FileText className="h-3.5 w-3.5" />
            Generate Report
          </Button>
        </div>
      </div>

      {/* Market Size Overview + Opportunity Score */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-white/5 backdrop-blur-xl border border-white/10 dark:bg-black/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-sky-500" />
              Market Size Overview
            </CardTitle>
            <p className="text-[11px] text-muted-foreground">TAM / SAM / SOM breakdown</p>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {marketSize.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-6">No market size data available</p>
              ) : marketSize.map((segment) => (
                <div key={segment.segment} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium">{segment.segment}</span>
                    <span className="text-xs font-bold tabular-nums">{segment.label}</span>
                  </div>
                  <div className="relative h-3 w-full overflow-hidden rounded-full bg-muted">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${(segment.value / (marketSize[0]?.value || 1)) * 100}%` }}
                      transition={{ duration: 0.8, ease: 'easeOut' }}
                      className="absolute inset-y-0 left-0 rounded-full"
                      style={{ backgroundColor: segment.color }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 flex items-center gap-2 p-2.5 rounded-lg bg-emerald-500/5 border border-emerald-500/10">
              <ArrowUpRight className="h-4 w-4 text-emerald-500 shrink-0" />
              <p className="text-xs text-muted-foreground">
                Market share: <span className="font-bold text-emerald-500">3.2%</span> (+0.8% YoY)
              </p>
            </div>
          </CardContent>
        </Card>
        <OpportunityGauge score={opportunityScore} />
      </div>

      {/* Industry Trend Indicators */}
      <Card className="bg-white/5 backdrop-blur-xl border border-white/10 dark:bg-black/20">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-emerald-500" />
            Industry Trend Indicators
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {industryTrends.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-6">No industry trends available</p>
            ) : industryTrends.map((item, i) => (
              <motion.div
                key={item.sector}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 + i * 0.05 }}
                className="flex items-center gap-3 p-3 rounded-lg border border-white/5 hover:border-white/10 transition-all duration-200"
              >
                <DirectionIcon direction={item.direction} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{item.sector}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={cn('text-[10px] font-bold tabular-nums', item.growth > 0 ? 'text-emerald-500' : 'text-red-400')}>
                      {item.growth > 0 ? '+' : ''}{item.growth}%
                    </span>
                    <span className="text-[10px] text-muted-foreground">Relevance: {item.relevance}</span>
                  </div>
                </div>
                <div className="h-8 w-8 rounded-full border-2 flex items-center justify-center text-[10px] font-bold tabular-nums shrink-0"
                  style={{
                    borderColor: item.relevance >= 80 ? '#10b981' : item.relevance >= 60 ? '#f59e0b' : '#ef4444',
                    color: item.relevance >= 80 ? '#10b981' : item.relevance >= 60 ? '#f59e0b' : '#ef4444',
                  }}
                >
                  {item.relevance}
                </div>
              </motion.div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Hot Lead Sectors + Trending Keywords */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-white/5 backdrop-blur-xl border border-white/10 dark:bg-black/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Flame className="h-4 w-4 text-orange-500" />
              Hot Lead Sectors
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {hotSectors.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-6">No hot sector data available</p>
              ) : hotSectors.map((sector, i) => (
                <motion.div
                  key={sector.name}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.15 + i * 0.06 }}
                  className="flex items-center gap-3 p-3 rounded-lg border border-white/5 hover:border-white/10 transition-all"
                >
                  <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-orange-500/20 to-red-500/20 flex items-center justify-center text-xs font-bold shrink-0">
                    #{i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{sector.name}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {sector.leads} leads · Avg ${(sector.avgDeal / 1000).toFixed(0)}k
                    </p>
                  </div>
                  <CompetitionBadge level={sector.competition} />
                  <HeatIndicator level={sector.heat} />
                </motion.div>
              ))}
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white/5 backdrop-blur-xl border border-white/10 dark:bg-black/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-cyan-500" />
              Trending Keywords
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {trendingKeywords.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-6">No trending keywords available</p>
              ) : trendingKeywords.map((kw, i) => (
                <div key={kw.keyword} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium">{kw.keyword}</span>
                    <div className="flex items-center gap-1">
                      {kw.trend === 'up' ? (
                        <ArrowUpRight className="h-3 w-3 text-emerald-500" />
                      ) : kw.trend === 'down' ? (
                        <TrendingDown className="h-3 w-3 text-red-500" />
                      ) : (
                        <Minus className="h-3 w-3 text-amber-500" />
                      )}
                      <span className={cn('text-[11px] font-bold tabular-nums', kw.trend === 'up' ? 'text-emerald-500' : kw.trend === 'down' ? 'text-red-400' : 'text-amber-500')}>
                        {kw.trend === 'up' ? '↑' : kw.trend === 'down' ? '↓' : '→'}{kw.frequency}%
                      </span>
                    </div>
                  </div>
                  <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${kw.frequency}%` }}
                      transition={{ duration: 0.6, delay: 0.2 + i * 0.08 }}
                      className={cn('absolute inset-y-0 left-0 rounded-full', kw.trend === 'up' ? 'bg-emerald-500' : kw.trend === 'down' ? 'bg-red-400' : 'bg-amber-500')}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Market Trend Chart */}
      <Card className="bg-white/5 backdrop-blur-xl border border-white/10 dark:bg-black/20">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-emerald-500" />
            Market Activity Index
          </CardTitle>
          <p className="text-[11px] text-muted-foreground">Your Pipeline vs Market Average vs Top Competitor</p>
        </CardHeader>
        <CardContent>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={marketTrend} margin={{ left: -10, right: 10 }}>
                <defs>
                  <linearGradient id="pipelineGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.2} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} className="fill-muted-foreground" />
                <YAxis tick={{ fontSize: 10 }} className="fill-muted-foreground" />
                <RTooltip
                  contentStyle={{
                    backgroundColor: 'hsl(240 10% 3.9%)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '8px',
                    fontSize: '12px',
                    color: 'hsl(0 0% 98%)',
                  }}
                />
                <Line type="monotone" dataKey="market" stroke="#64748b" strokeWidth={1.5} strokeDasharray="4 4" dot={false} name="Market Average" />
                <Line type="monotone" dataKey="competitor" stroke="#ef4444" strokeWidth={1.5} dot={false} name="Top Competitor" />
                <Line type="monotone" dataKey="pipeline" stroke="#10b981" strokeWidth={2.5} dot={{ r: 3, fill: '#10b981' }} activeDot={{ r: 5 }} name="Your Pipeline" />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="flex gap-4 mt-2">
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <div className="h-0.5 w-4 bg-emerald-500 rounded" />
              Your Pipeline
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <div className="h-0.5 w-4 bg-muted-foreground rounded" style={{ borderTop: '2px dashed #64748b', height: 0 }} />
              Market Average
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <div className="h-0.5 w-4 bg-red-500 rounded" />
              Top Competitor
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
