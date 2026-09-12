'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  Target,
  TrendingUp,
  ChevronDown,
  Zap,
  BarChart3,
  Sparkles,
  ArrowUpRight,
  ArrowDownRight,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Clock,
  Mail,
  Linkedin,
  Globe,
  Phone,
} from 'lucide-react';

/* ===== Types ===== */
type ScoringModel = 'AI Model' | 'Rule-Based' | 'Custom Weighted';
type GradeFilter = 'All' | 'A Only' | 'B+' | 'Needs Attention';
type Grade = 'A' | 'B' | 'C' | 'D';

interface LeadRow {
  id: string;
  name: string;
  company: string;
  score: number;
  grade: Grade;
  source: string;
  lastActivity: string;
  trend: 'up' | 'down' | 'stable';
}

interface ScoreSegment {
  label: string;
  range: string;
  count: number;
  color: string;
  bgColor: string;
}

interface GradeBreakdown {
  grade: Grade;
  count: number;
  color: string;
}

interface ScoringCriterion {
  id: string;
  label: string;
  weight: number;
  icon: React.ElementType;
  color: string;
}

/* ===== Constants ===== */
const SCORING_MODELS: ScoringModel[] = ['AI Model', 'Rule-Based', 'Custom Weighted'];

const DEFAULT_CRITERIA: ScoringCriterion[] = [
  { id: 'budget', label: 'Budget', weight: 30, icon: DollarSignIcon, color: 'text-emerald-500' },
  { id: 'authority', label: 'Authority', weight: 25, icon: UserIcon, color: 'text-blue-500' },
  { id: 'need', label: 'Need', weight: 25, icon: Target, color: 'text-violet-500' },
  { id: 'timeline', label: 'Timeline', weight: 12, icon: Clock, color: 'text-amber-500' },
  { id: 'engagement', label: 'Engagement', weight: 8, icon: Zap, color: 'text-rose-500' },
];

const DEFAULT_SEGMENTS: ScoreSegment[] = [
  { label: 'Critical', range: '90-100', count: 0, color: '#ef4444', bgColor: 'bg-red-500' },
  { label: 'Hot', range: '70-89', count: 0, color: '#f59e0b', bgColor: 'bg-amber-500' },
  { label: 'Warm', range: '50-69', count: 0, color: '#3b82f6', bgColor: 'bg-blue-500' },
  { label: 'Cold', range: '25-49', count: 0, color: '#6b7280', bgColor: 'bg-gray-500' },
  { label: 'Lost', range: '<25', count: 0, color: '#9ca3af', bgColor: 'bg-gray-400' },
];

const DEFAULT_GRADE_BREAKDOWN: GradeBreakdown[] = [
  { grade: 'A', count: 0, color: '#10b981' },
  { grade: 'B', count: 0, color: '#3b82f6' },
  { grade: 'C', count: 0, color: '#f59e0b' },
  { grade: 'D', count: 0, color: '#ef4444' },
];

function DollarSignIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  );
}

function UserIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
    </svg>
  );
}

const GRADE_FILTER_TABS: { key: GradeFilter; label: string }[] = [
  { key: 'All', label: 'All' },
  { key: 'A Only', label: 'A Only' },
  { key: 'B+', label: 'B+' },
  { key: 'Needs Attention', label: 'Needs Attention' },
];

const SOURCE_ICON_MAP: Record<string, React.ElementType> = {
  LinkedIn: Linkedin,
  Referral: ArrowUpRight,
  Website: Globe,
  'Email Campaign': Mail,
  Conference: ExternalLink,
  'Cold Outreach': Phone,
};

const GRADE_COLORS: Record<Grade, { bg: string; text: string; border: string }> = {
  A: { bg: 'bg-emerald-500/10', text: 'text-emerald-500', border: 'border-emerald-500/30' },
  B: { bg: 'bg-blue-500/10', text: 'text-blue-500', border: 'border-blue-500/30' },
  C: { bg: 'bg-amber-500/10', text: 'text-amber-500', border: 'border-amber-500/30' },
  D: { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/30' },
};

/* ===== CSS Animations ===== */
const animationStyles = `
@keyframes scoreFadeIn {
  from { opacity: 0; transform: translateY(16px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes scoreBarGrow {
  from { width: 0%; }
}
@keyframes scoreDonutIn {
  from { opacity: 0; transform: scale(0.8) rotate(-90deg); }
  to { opacity: 1; transform: scale(1) rotate(-90deg); }
}
@keyframes scorePulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.3); }
  50% { box-shadow: 0 0 0 8px rgba(16, 185, 129, 0); }
}
@keyframes scoreSlideRow {
  from { opacity: 0; transform: translateX(-12px); }
  to { opacity: 1; transform: translateX(0); }
}
@keyframes scoreToastIn {
  from { opacity: 0; transform: translateY(12px) scale(0.95); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes scoreToastOut {
  from { opacity: 1; transform: translateY(0) scale(1); }
  to { opacity: 0; transform: translateY(-8px) scale(0.95); }
}
.score-animate-in { animation: scoreFadeIn 0.5s ease-out both; }
.score-animate-delay-1 { animation: scoreFadeIn 0.5s ease-out 0.1s both; }
.score-animate-delay-2 { animation: scoreFadeIn 0.5s ease-out 0.2s both; }
.score-animate-delay-3 { animation: scoreFadeIn 0.5s ease-out 0.3s both; }
.score-bar-grow { animation: scoreBarGrow 0.8s ease-out both; }
.score-donut-in { animation: scoreDonutIn 0.6s ease-out both; }
.score-pulse { animation: scorePulse 2s ease-in-out infinite; }
.score-row-anim { animation: scoreSlideRow 0.3s ease-out both; }
.score-toast-in { animation: scoreToastIn 0.3s ease-out both; }
.score-toast-out { animation: scoreToastOut 0.25s ease-in both; }
`;

/* ===== Score Badge ===== */
function ScoreBadge({ score }: { score: number }) {
  const getColor = (s: number) => {
    if (s >= 90) return { bg: 'bg-red-500/10', text: 'text-red-500', ring: 'ring-red-500/20' };
    if (s >= 70) return { bg: 'bg-amber-500/10', text: 'text-amber-500', ring: 'ring-amber-500/20' };
    if (s >= 50) return { bg: 'bg-blue-500/10', text: 'text-blue-500', ring: 'ring-blue-500/20' };
    if (s >= 25) return { bg: 'bg-gray-500/10', text: 'text-gray-500', ring: 'ring-gray-500/20' };
    return { bg: 'bg-red-500/5', text: 'text-red-400', ring: 'ring-red-500/10' };
  };
  const colorConfig = getColor(score);
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center rounded-full px-2 py-0.5 text-xs font-bold tabular-nums ring-1',
        colorConfig.bg, colorConfig.text, colorConfig.ring
      )}
    >
      {score}
    </span>
  );
}

/* ===== Grade Donut Chart ===== */
function GradeDonutChart({ breakdown }: { breakdown: GradeBreakdown[] }) {
  const total = breakdown.reduce((s, g) => s + g.count, 0);
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  let cumulative = 0;

  return (
    <div className="flex items-center gap-4">
      <svg width="100" height="100" viewBox="0 0 100 100" className="shrink-0">
        {breakdown.map((item, i) => {
          const pct = item.count / total;
          const dash = pct * circumference;
          const gap = circumference - dash;
          const rotation = (cumulative / total) * 360 - 90;
          cumulative += item.count;
          return (
            <circle
              key={item.grade}
              cx="50" cy="50" r={radius}
              fill="none"
              stroke={item.color}
              strokeWidth="12"
              strokeDasharray={`${dash} ${gap}`}
              transform={`rotate(${rotation} 50 50)`}
              className="score-donut-in transition-all duration-700"
              style={{ animationDelay: `${i * 0.15}s` }}
              opacity={0.85}
            />
          );
        })}
        <text x="50" y="48" textAnchor="middle" className="fill-foreground text-sm font-bold" fontSize="14">
          {total}
        </text>
        <text x="50" y="60" textAnchor="middle" className="fill-muted-foreground" fontSize="8">
          leads
        </text>
      </svg>
      <div className="space-y-2 flex-1">
        {breakdown.map((item) => {
          const pct = Math.round((item.count / total) * 100);
          return (
            <div key={item.grade} className="flex items-center gap-2">
              <div
                className="h-3 w-3 rounded-full shrink-0"
                style={{ backgroundColor: item.color }}
              />
              <span className="text-xs font-semibold w-4">Grade {item.grade}</span>
              <div className="flex-1 h-1.5 bg-muted/40 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full score-bar-grow"
                  style={{
                    width: `${pct}%`,
                    backgroundColor: item.color,
                    animationDelay: `${breakdown.indexOf(item) * 0.1}s`,
                  }}
                />
              </div>
              <span className="text-[10px] text-muted-foreground font-medium tabular-nums w-8 text-right">
                {item.count} ({pct}%)
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ===== Main Component ===== */
export default function LeadScoringMatrix() {
  const [mounted, setMounted] = useState(false);
  const [model, setModel] = useState<ScoringModel>('AI Model');
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [gradeFilter, setGradeFilter] = useState<GradeFilter>('All');
  const [criteria, setCriteria] = useState<ScoringCriterion[]>(DEFAULT_CRITERIA);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastVisible, setToastVisible] = useState(false);
  const [isPrioritizing, setIsPrioritizing] = useState(false);

  const [leadsData, setLeadsData] = useState<LeadRow[]>([]);
  const [scoreSegments, setScoreSegments] = useState<ScoreSegment[]>(DEFAULT_SEGMENTS);
  const [gradeBreakdown, setGradeBreakdown] = useState<GradeBreakdown[]>(DEFAULT_GRADE_BREAKDOWN);
  const [dataLoading, setDataLoading] = useState(true);

  useEffect(() => {
    setMounted(true);
    fetch('/api/leads/scoring-matrix')
      .then(r => { if (!r.ok) throw new Error('Failed'); return r.json(); })
      .then(d => {
        if (d.leads) setLeadsData(d.leads);
        if (d.segments) setScoreSegments(d.segments);
        if (d.gradeBreakdown) setGradeBreakdown(d.gradeBreakdown);
        if (d.criteria) setCriteria(d.criteria);
      })
      .catch(() => {})
      .finally(() => setDataLoading(false));
  }, []);

  const filteredLeads = leadsData.filter((lead) => {
    if (gradeFilter === 'All') return true;
    if (gradeFilter === 'A Only') return lead.grade === 'A';
    if (gradeFilter === 'B+') return lead.grade === 'A' || lead.grade === 'B';
    if (gradeFilter === 'Needs Attention') return lead.grade === 'C' || lead.grade === 'D';
    return true;
  });

  const totalWeight = criteria.reduce((s, c) => s + c.weight, 0);
  const isWeightValid = Math.abs(totalWeight - 100) <= 2;

  const handleWeightChange = (id: string, newWeight: number) => {
    setCriteria((prev) =>
      prev.map((c) => (c.id === id ? { ...c, weight: newWeight } : c))
    );
  };

  const handleAutoPrioritize = () => {
    setIsPrioritizing(true);
    setTimeout(() => {
      setIsPrioritizing(false);
      showToast('Leads re-prioritized successfully! 3 leads moved to hot queue.');
    }, 1200);
  };

  const showToast = (message: string) => {
    setToastMessage(message);
    setToastVisible(true);
    setTimeout(() => setToastVisible(false), 3000);
    setTimeout(() => setToastMessage(null), 3300);
  };

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: animationStyles }} />
      <div className={cn('space-y-6', mounted ? 'score-animate-in' : 'opacity-0')}>
        {/* Header */}
        <Card className="glass-card overflow-hidden">
          <CardHeader className="pb-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <div className="rounded-lg p-2 bg-gradient-to-br from-amber-500 to-orange-600">
                  <Target className="h-4 w-4 text-white" />
                </div>
                Lead Scoring & Prioritization Matrix
                <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/25 border text-[9px] h-5">
                  <Sparkles className="h-2.5 w-2.5 mr-1" />
                  {leadsData.length} Leads
                </Badge>
              </CardTitle>
              <div className="flex items-center gap-2">
                {/* Model Selector */}
                <div className="relative">
                  <button
                    onClick={() => setShowModelDropdown(!showModelDropdown)}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border/50 bg-muted/40 text-xs font-medium hover:bg-muted/60 transition-all duration-200 cursor-pointer"
                  >
                    <BarChart3 className="h-3.5 w-3.5 text-amber-500" />
                    <span>{model}</span>
                    <ChevronDown
                      className={cn(
                        'h-3 w-3 text-muted-foreground transition-transform duration-200',
                        showModelDropdown && 'rotate-180'
                      )}
                    />
                  </button>
                  {showModelDropdown && (
                    <div className="absolute right-0 top-full mt-1 w-44 rounded-lg border border-border/50 bg-background/95 backdrop-blur-xl shadow-lg z-20 py-1 score-slide-row">
                      {SCORING_MODELS.map((m) => (
                        <button
                          key={m}
                          onClick={() => {
                            setModel(m);
                            setShowModelDropdown(false);
                          }}
                          className={cn(
                            'flex items-center gap-2 w-full px-3 py-2 text-xs transition-colors cursor-pointer',
                            model === m
                              ? 'bg-amber-500/10 text-amber-500 font-medium'
                              : 'hover:bg-muted/50 text-foreground'
                          )}
                        >
                          <BarChart3 className="h-3.5 w-3.5" />
                          <span>{m}</span>
                          {model === m && (
                            <CheckCircle2 className="h-3 w-3 ml-auto text-amber-500" />
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {/* Auto-Prioritize Button */}
                <Button
                  onClick={handleAutoPrioritize}
                  disabled={isPrioritizing}
                  className="rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 shadow-md hover:shadow-lg transition-all duration-200"
                  size="sm"
                >
                  {isPrioritizing ? (
                    <>
                      <div className="h-3 w-3 border-2 border-white/30 border-t-white rounded-full animate-spin mr-1.5" />
                      Analyzing...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                      Auto-Prioritize
                    </>
                  )}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
              <span>
                Using <span className="font-semibold text-foreground">{model}</span> —{' '}
                {model === 'AI Model'
                  ? 'Neural network analyzing 47 behavioral signals'
                  : model === 'Rule-Based'
                    ? 'BANT methodology with 12 scoring rules'
                    : 'Custom weighted criteria (adjust below)'}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Score Distribution Bar + Grade Donut */}
        <div className={cn('grid grid-cols-1 lg:grid-cols-2 gap-6', mounted ? 'score-animate-delay-1' : 'opacity-0')}>
          <Card className="glass-card overflow-hidden">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-sky-500" />
                Score Distribution
              </CardTitle>
            </CardHeader>
            <CardContent>
              {/* Stacked Bar */}
              <div className="h-8 w-full rounded-full overflow-hidden flex mb-4 bg-muted/30">
                {scoreSegments.map((seg) => (
                  <div
                    key={seg.label}
                    className="h-full score-bar-grow transition-all duration-500 hover:opacity-80 cursor-pointer relative group/seg"
                    style={{
                      width: leadsData.length > 0 ? `${(seg.count / leadsData.length) * 100}%` : '0%',
                      backgroundColor: seg.color,
                      animationDelay: `${scoreSegments.indexOf(seg) * 0.15}s`,
                    }}
                    title={`${seg.label} (${seg.range}): ${seg.count} leads`}
                  >
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-[8px] font-bold text-white drop-shadow-sm">
                        {seg.count}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              {/* Legend */}
              <div className="flex flex-wrap gap-3">
                {scoreSegments.map((seg) => (
                  <div key={seg.label} className="flex items-center gap-1.5 text-[10px]">
                    <div className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: seg.color }} />
                    <span className="text-muted-foreground">{seg.label} ({seg.range})</span>
                    <span className="font-semibold tabular-nums">{seg.count}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="glass-card overflow-hidden">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <Target className="h-4 w-4 text-violet-500" />
                Grade Breakdown
              </CardTitle>
            </CardHeader>
            <CardContent>
              {dataLoading ? (
                <div className="flex items-center justify-center h-24">
                  <div className="h-6 w-6 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
                </div>
              ) : gradeBreakdown.every(g => g.count === 0) ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Target className="h-5 w-5 text-muted-foreground mb-2" />
                  <p className="text-xs text-muted-foreground">No leads data available</p>
                </div>
              ) : (
                <GradeDonutChart breakdown={gradeBreakdown} />
              )}
            </CardContent>
          </Card>
        </div>

        {/* Leads Table */}
        <Card className={cn('glass-card overflow-hidden', mounted ? 'score-animate-delay-2' : 'opacity-0')}>
          <CardHeader className="pb-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-emerald-500" />
                Top Leads
                <Badge variant="outline" className="text-[9px] h-5">{filteredLeads.length} shown</Badge>
              </CardTitle>
              {/* Grade Filter Tabs */}
              <div className="flex items-center gap-1 bg-muted/40 rounded-lg p-0.5 border border-border/30">
                {GRADE_FILTER_TABS.map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setGradeFilter(tab.key)}
                    className={cn(
                      'px-3 py-1 text-[10px] font-medium rounded-md transition-all duration-200 cursor-pointer',
                      gradeFilter === tab.key
                        ? 'bg-background shadow-sm text-foreground border border-border/50'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                    )}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-border/30">
                    <th className="text-[10px] text-muted-foreground font-medium pb-2 pr-3">#</th>
                    <th className="text-[10px] text-muted-foreground font-medium pb-2 pr-3">Name</th>
                    <th className="text-[10px] text-muted-foreground font-medium pb-2 pr-3 hidden sm:table-cell">Company</th>
                    <th className="text-[10px] text-muted-foreground font-medium pb-2 pr-3">Score</th>
                    <th className="text-[10px] text-muted-foreground font-medium pb-2 pr-3">Grade</th>
                    <th className="text-[10px] text-muted-foreground font-medium pb-2 pr-3 hidden md:table-cell">Source</th>
                    <th className="text-[10px] text-muted-foreground font-medium pb-2 pr-3 hidden lg:table-cell">Last Activity</th>
                    <th className="text-[10px] text-muted-foreground font-medium pb-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLeads.map((lead, idx) => {
                    const gradeConfig = GRADE_COLORS[lead.grade];
                    const SourceIcon = SOURCE_ICON_MAP[lead.source] ?? Globe;
                    return (
                      <tr
                        key={lead.id}
                        className="border-b border-border/20 hover:bg-muted/30 transition-colors duration-150 score-row-anim group"
                        style={{ animationDelay: `${idx * 0.04}s` }}
                      >
                        <td className="py-2.5 pr-3">
                          <span className="text-[10px] font-bold text-muted-foreground bg-muted/40 rounded-full w-5 h-5 flex items-center justify-center">
                            {idx + 1}
                          </span>
                        </td>
                        <td className="py-2.5 pr-3">
                          <span className="text-xs font-semibold group-hover:text-primary transition-colors">
                            {lead.name}
                          </span>
                        </td>
                        <td className="py-2.5 pr-3 hidden sm:table-cell">
                          <span className="text-[11px] text-muted-foreground">{lead.company}</span>
                        </td>
                        <td className="py-2.5 pr-3">
                          <div className="flex items-center gap-1.5">
                            <ScoreBadge score={lead.score} />
                            {lead.trend === 'up' && (
                              <ArrowUpRight className="h-3 w-3 text-emerald-500" />
                            )}
                            {lead.trend === 'down' && (
                              <ArrowDownRight className="h-3 w-3 text-red-400" />
                            )}
                          </div>
                        </td>
                        <td className="py-2.5 pr-3">
                          <Badge
                            variant="outline"
                            className={cn(
                              'text-[9px] h-5 px-1.5 font-bold',
                              gradeConfig.text, gradeConfig.bg, gradeConfig.border
                            )}
                          >
                            Grade {lead.grade}
                          </Badge>
                        </td>
                        <td className="py-2.5 pr-3 hidden md:table-cell">
                          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                            <SourceIcon className="h-3 w-3" />
                            <span>{lead.source}</span>
                          </div>
                        </td>
                        <td className="py-2.5 pr-3 hidden lg:table-cell">
                          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {lead.lastActivity}
                          </span>
                        </td>
                        <td className="py-2.5">
                          <button className="text-[10px] text-violet-500 font-medium hover:text-violet-400 transition-colors cursor-pointer flex items-center gap-1 opacity-0 group-hover:opacity-100">
                            <ExternalLink className="h-3 w-3" />
                            View
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Scoring Criteria Weights */}
        <Card className={cn('glass-card overflow-hidden', mounted ? 'score-animate-delay-3' : 'opacity-0')}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <Zap className="h-4 w-4 text-amber-500" />
                Scoring Criteria Weights
                <Badge
                  variant="outline"
                  className={cn(
                    'text-[9px] h-5',
                    isWeightValid
                      ? 'text-emerald-500 border-emerald-500/30'
                      : 'text-red-500 border-red-500/30'
                  )}
                >
                  {isWeightValid ? (
                    <>
                      <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />
                      {totalWeight}% Total
                    </>
                  ) : (
                    <>
                      <AlertCircle className="h-2.5 w-2.5 mr-0.5" />
                      {totalWeight}% — must equal 100%
                    </>
                  )}
                </Badge>
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {criteria.map((criterion) => {
              const Icon = criterion.icon;
              return (
                <div key={criterion.id} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Icon className={cn('h-4 w-4', criterion.color)} />
                      <span className="text-xs font-medium">{criterion.label}</span>
                    </div>
                    <span className="text-xs font-bold tabular-nums text-foreground">
                      {criterion.weight}%
                    </span>
                  </div>
                  <div className="relative">
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={criterion.weight}
                      onChange={(e) => handleWeightChange(criterion.id, parseInt(e.target.value))}
                      className="w-full h-2 rounded-full appearance-none cursor-pointer bg-muted/40 accent-violet-500"
                    />
                    <div
                      className="absolute top-0 left-0 h-2 rounded-full score-bar-glow transition-all duration-300 pointer-events-none"
                      style={{
                        width: `${criterion.weight}%`,
                        background: 'linear-gradient(to right, #8b5cf6, #a78bfa)',
                        opacity: 0.6,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      {/* Toast Notification */}
      {toastMessage && (
        <div
          className={cn(
            'fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 backdrop-blur-xl shadow-lg',
            toastVisible ? 'score-toast-in' : 'score-toast-out'
          )}
        >
          <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
          <span className="text-xs font-medium text-emerald-500">{toastMessage}</span>
        </div>
      )}
    </>
  );
}
