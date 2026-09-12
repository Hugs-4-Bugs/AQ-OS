'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Legend,
} from 'recharts';
import { Shield, Plus, Filter, Clock, TrendingUp, TrendingDown, AlertTriangle, Zap, Eye } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip as TooltipUI, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

/* ===== Types ===== */
interface Competitor {
  id: string;
  name: string;
  initials: string;
  color: string;
  industry: string;
  marketShare: number;
  dealsWon: number;
  ourDealsWon: number;
  avgDealSize: number;
  growthRate: number;
  strengthScore: number;
  lastUpdate: string;
}

interface IntelItem {
  id: string;
  text: string;
  severity: 'threat' | 'opportunity' | 'neutral';
  time: string;
}

interface CompetitorData {
  competitors: Competitor[];
  intelItems: IntelItem[];
  radarData: { dimension: string; Us: number; [key: string]: number | string }[];
  industries: string[];
}

const INDUSTRIES = ['All Industries', 'AI & ML', 'CRM & Pipeline', 'Outreach', 'Lead Generation'];

/* ===== Severity Badge ===== */
function SeverityBadge({ severity }: { severity: 'threat' | 'opportunity' | 'neutral' }) {
  const config = {
    threat: { color: 'text-red-500 border-red-500/30 bg-red-500/10', label: 'Threat', icon: AlertTriangle },
    opportunity: { color: 'text-emerald-500 border-emerald-500/30 bg-emerald-500/10', label: 'Opportunity', icon: Zap },
    neutral: { color: 'text-slate-400 border-slate-400/30 bg-slate-400/10', label: 'Neutral', icon: Eye },
  };
  const c = config[severity];
  const Icon = c.icon;
  return (
    <Badge variant="outline" className={cn('text-[10px] h-5 px-1.5 gap-0.5 font-medium border', c.color)}>
      <Icon className="h-2.5 w-2.5" />
      {c.label}
    </Badge>
  );
}

/* ===== Strength Score Bar ===== */
function StrengthBar({ score }: { score: number }) {
  const color = score >= 75 ? 'text-emerald-500' : score >= 50 ? 'text-amber-500' : 'text-red-500';
  const barClass = score >= 75 ? '[&>div]:bg-emerald-500' : score >= 50 ? '[&>div]:bg-amber-500' : '[&>div]:bg-red-500';

  return (
    <TooltipProvider>
      <TooltipUI>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-2">
            <Progress value={score} className={cn('h-1.5 flex-1', barClass)} />
            <span className={cn('text-[11px] font-bold tabular-nums', color)}>{score}</span>
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p>Strength Score: {score}/100</p>
        </TooltipContent>
      </TooltipUI>
    </TooltipProvider>
  );
}

/* ===== Loading Skeleton ===== */
function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Skeleton className="h-10 w-10 rounded-lg" />
        <div>
          <Skeleton className="h-5 w-40 mb-1" />
          <Skeleton className="h-3 w-32" />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-48 rounded-xl" />
        ))}
      </div>
    </div>
  );
}

/* ===== Win/Loss Analysis Chart ===== */
function WinLossChart({ competitors }: { competitors: Competitor[] }) {
  const chartData = competitors.map((c) => ({
    name: c.name,
    'We Won': c.ourDealsWon,
    'They Won': c.dealsWon,
  }));

  return (
    <Card className="bg-white/5 backdrop-blur-xl border border-white/10 dark:bg-black/20">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Shield className="h-4 w-4 text-purple-500" />
          Win/Loss Analysis
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical" margin={{ left: 10, right: 20 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10 }} className="fill-muted-foreground" />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={90} className="fill-muted-foreground" />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(240 10% 3.9%)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '8px',
                  fontSize: '12px',
                  color: 'hsl(0 0% 98%)',
                }}
              />
              <Legend iconType="circle" wrapperStyle={{ fontSize: '11px' }} />
              <Bar dataKey="We Won" fill="#10b981" radius={[0, 4, 4, 0]} barSize={12} />
              <Bar dataKey="They Won" fill="#ef4444" radius={[0, 4, 4, 0]} barSize={12} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        {/* Win rate badges */}
        <div className="flex flex-wrap gap-2 mt-3">
          {competitors.map((c) => {
            const total = c.ourDealsWon + c.dealsWon;
            const rate = total > 0 ? Math.round((c.ourDealsWon / total) * 100) : 0;
            return (
              <Badge key={c.id} variant="outline" className="text-[10px] h-5 px-1.5 gap-1 border-border/50">
                <span className="truncate max-w-[80px]">{c.name}</span>
                <span className={cn('font-bold', rate >= 60 ? 'text-emerald-500' : 'text-red-400')}>{rate}%</span>
              </Badge>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

/* ===== Radar Chart ===== */
function CompetitiveRadar({ radarData }: { radarData: CompetitorData['radarData'] }) {
  if (radarData.length === 0) {
    return (
      <Card className="bg-white/5 backdrop-blur-xl border border-white/10 dark:bg-black/20">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-cyan-500" />
            Competitive Landscape Radar
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <TrendingUp className="h-8 w-8 mb-2 opacity-30" />
            <p className="text-xs">No radar data available</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const competitorKeys = Object.keys(radarData[0]).filter(k => k !== 'dimension' && k !== 'Us');

  return (
    <Card className="bg-white/5 backdrop-blur-xl border border-white/10 dark:bg-black/20">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-cyan-500" />
          Competitive Landscape Radar
        </CardTitle>
        {competitorKeys.length > 0 && (
          <p className="text-[11px] text-muted-foreground">Us vs {competitorKeys[0]} (top competitor)</p>
        )}
      </CardHeader>
      <CardContent>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarData}>
              <PolarGrid className="stroke-border" />
              <PolarAngleAxis dataKey="dimension" tick={{ fontSize: 10 }} className="fill-muted-foreground" />
              <PolarRadiusAxis tick={{ fontSize: 8 }} className="fill-muted-foreground" domain={[0, 100]} />
              <Radar name="Us" dataKey="Us" stroke="#10b981" fill="#10b981" fillOpacity={0.15} strokeWidth={2} />
              {competitorKeys.map((key) => (
                <Radar key={key} name={key} dataKey={key} stroke="#ef4444" fill="#ef4444" fillOpacity={0.1} strokeWidth={2} />
              ))}
              <Legend iconType="circle" wrapperStyle={{ fontSize: '11px' }} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

/* ===== Main Component ===== */
export default function CompetitorIntelligenceDashboard() {
  const [data, setData] = useState<CompetitorData | null>(null);
  const [loading, setLoading] = useState(true);
  const [industry, setIndustry] = useState('All Industries');

  useEffect(() => {
    fetch('/api/competitor')
      .then(r => { if (!r.ok) throw new Error('Failed'); return r.json(); })
      .then(d => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <DashboardSkeleton />;

  const competitors = data?.competitors ?? [];
  const intelItems = data?.intelItems ?? [];
  const radarData = data?.radarData ?? [];
  const industries = data?.industries ?? INDUSTRIES;

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
          <div className="rounded-lg p-2 bg-purple-500/10">
            <Shield className="h-5 w-5 text-purple-500" />
          </div>
          <div>
            <h2 className="text-lg font-bold">Competitor Intelligence</h2>
            <p className="text-xs text-muted-foreground">Track competitors & market positioning</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select value={industry} onValueChange={setIndustry}>
            <SelectTrigger className="w-[160px] h-9 text-xs border-border/50">
              <Filter className="h-3.5 w-3.5 mr-1 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {industries.map((ind) => (
                <SelectItem key={ind} value={ind} className="text-xs">{ind}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" className="h-9 gap-1.5 text-xs">
            <Plus className="h-3.5 w-3.5" />
            Add Competitor
          </Button>
        </div>
      </div>

      {/* Competitor Overview Cards */}
      {competitors.length === 0 ? (
        <Card className="bg-white/5 backdrop-blur-xl border border-white/10 dark:bg-black/20">
          <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Shield className="h-10 w-10 mb-3 opacity-30" />
            <p className="text-sm font-medium">No competitor data</p>
            <p className="text-xs mt-1">Add competitors to start tracking.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {competitors.map((comp, i) => (
            <motion.div
              key={comp.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + i * 0.08, duration: 0.35 }}
            >
              <Card className="bg-white/5 backdrop-blur-xl border border-white/10 dark:bg-black/20 hover:border-white/20 transition-all duration-300 group">
                <CardContent className="p-4">
                  {/* Company header */}
                  <div className="flex items-center gap-3 mb-3">
                    <div
                      className="h-10 w-10 rounded-xl flex items-center justify-center text-white font-bold text-sm shrink-0 shadow-md"
                      style={{ backgroundColor: comp.color }}
                    >
                      {comp.initials}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate group-hover:text-primary transition-colors">{comp.name}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{comp.industry}</p>
                    </div>
                    <Badge variant="outline" className="ml-auto text-[10px] h-5 px-1.5 shrink-0 border-border/50 font-mono">
                      {comp.marketShare}%
                    </Badge>
                  </div>

                  {/* Key Metrics */}
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    <div className="text-center p-1.5 rounded-lg bg-muted/30">
                      <p className="text-[10px] text-muted-foreground">Deals Won</p>
                      <div className="flex items-center justify-center gap-0.5 mt-0.5">
                        <span className="text-xs font-bold text-red-400">{comp.dealsWon}</span>
                        <span className="text-[9px] text-muted-foreground">vs</span>
                        <span className="text-xs font-bold text-emerald-500">{comp.ourDealsWon}</span>
                      </div>
                    </div>
                    <div className="text-center p-1.5 rounded-lg bg-muted/30">
                      <p className="text-[10px] text-muted-foreground">Avg Deal</p>
                      <p className="text-xs font-bold tabular-nums mt-0.5">${(comp.avgDealSize / 1000).toFixed(1)}k</p>
                    </div>
                    <div className="text-center p-1.5 rounded-lg bg-muted/30">
                      <p className="text-[10px] text-muted-foreground">Growth</p>
                      <div className="flex items-center justify-center gap-0.5 mt-0.5">
                        <TrendingUp className="h-2.5 w-2.5 text-emerald-500" />
                        <span className="text-xs font-bold text-emerald-500">{comp.growthRate}%</span>
                      </div>
                    </div>
                  </div>

                  {/* Strength Score */}
                  <div className="space-y-1 mb-2">
                    <p className="text-[10px] text-muted-foreground">Strength Score</p>
                    <StrengthBar score={comp.strengthScore} />
                  </div>

                  {/* Last Update */}
                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <Clock className="h-2.5 w-2.5" />
                    <span>Last intel: {comp.lastUpdate}</span>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <WinLossChart competitors={competitors} />
        <CompetitiveRadar radarData={radarData} />
      </div>

      {/* Recent Competitive Intel */}
      <Card className="bg-white/5 backdrop-blur-xl border border-white/10 dark:bg-black/20">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            Recent Competitive Intel
          </CardTitle>
        </CardHeader>
        <CardContent>
          {intelItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <AlertTriangle className="h-8 w-8 mb-2 opacity-30" />
              <p className="text-xs">No competitive intel available</p>
            </div>
          ) : (
            <div className="space-y-2">
              {intelItems.map((item, i) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3 + i * 0.06 }}
                  className="flex items-start gap-3 p-3 rounded-lg border border-white/5 hover:border-white/10 hover:bg-white/[0.02] transition-all duration-200"
                >
                  <SeverityBadge severity={item.severity} />
                  <p className="flex-1 text-xs text-muted-foreground leading-relaxed">{item.text}</p>
                  <span className="text-[10px] text-muted-foreground/60 whitespace-nowrap shrink-0">{item.time}</span>
                </motion.div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
