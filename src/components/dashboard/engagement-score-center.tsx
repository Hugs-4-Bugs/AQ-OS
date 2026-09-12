'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  Target,
  TrendingUp,
  Clock,
  Zap,
  Lightbulb,
  Mail,
  MousePointerClick,
  CalendarCheck,
  Download,
  Share2,
  ChevronRight,
} from 'lucide-react';

/* ===== Types ===== */
interface TopLead {
  id: string;
  name: string;
  score: number;
  lastActivity: string;
  interactions: number;
}

interface EngagementCategory {
  label: string;
  value: number;
  color: string;
  icon?: React.ElementType;
}

interface AIRecommendation {
  id: string;
  lead: string;
  suggestion: string;
  priority: 'high' | 'medium' | 'low';
  reason: string;
}

type Period = '7d' | '30d' | '90d';

/* ===== Icon Mapping ===== */
const CATEGORY_ICON_MAP: Record<string, React.ElementType> = {
  'Email Opens': Mail,
  'Link Clicks': MousePointerClick,
  'Replies': CalendarCheck,
  'Meeting Attendance': CalendarCheck,
  'Content Downloads': Download,
  'Social Interactions': Share2,
};

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const TIME_LABELS = ['Morning', 'Afternoon', 'Evening', 'Night'];

const PERIOD_CONFIG: { key: Period; label: string }[] = [
  { key: '7d', label: 'Last 7 Days' },
  { key: '30d', label: 'Last 30 Days' },
  { key: '90d', label: 'Last 90 Days' },
];

interface EngagementData {
  overallScore: number;
  leads: TopLead[];
  categories: EngagementCategory[];
  recommendations: AIRecommendation[];
  heatmap: number[][];
}

const PRIORITY_CONFIG = {
  high: { label: 'High', color: 'text-red-500', bg: 'bg-red-500/10', border: 'border-red-500/30' },
  medium: { label: 'Medium', color: 'text-amber-500', bg: 'bg-amber-500/10', border: 'border-amber-500/30' },
  low: { label: 'Low', color: 'text-emerald-500', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30' },
};

/* ===== CSS Animation Keyframes ===== */
const animationStyles = `
@keyframes engFadeSlideIn {
  from { opacity: 0; transform: translateY(16px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes engScoreCountUp {
  from { stroke-dashoffset: 283; }
}
@keyframes engPulseGlow {
  0%, 100% { filter: drop-shadow(0 0 4px rgba(16, 185, 129, 0.3)); }
  50% { filter: drop-shadow(0 0 12px rgba(16, 185, 129, 0.6)); }
}
@keyframes engDonutRotate {
  from { transform: rotate(-90deg); }
  to { transform: rotate(-90deg); }
}
@keyframes engBarGrow {
  from { width: 0%; }
}
@keyframes engCellFade {
  from { opacity: 0; transform: scale(0.7); }
  to { opacity: 1; transform: scale(1); }
}
.eng-animate-in { animation: engFadeSlideIn 0.5s ease-out both; }
.eng-animate-delay-1 { animation: engFadeSlideIn 0.5s ease-out 0.1s both; }
.eng-animate-delay-2 { animation: engFadeSlideIn 0.5s ease-out 0.2s both; }
.eng-animate-delay-3 { animation: engFadeSlideIn 0.5s ease-out 0.3s both; }
.eng-score-ring { animation: engScoreCountUp 1.2s ease-out both; }
.eng-glow { animation: engPulseGlow 2s ease-in-out infinite; }
.eng-bar-grow { animation: engBarGrow 0.8s ease-out both; }
.eng-cell-anim { animation: engCellFade 0.3s ease-out both; }
`;

/* ===== Engagement Score Gauge ===== */
function EngagementGauge({ score }: { score: number }) {
  const radius = 45;
  const circumference = 2 * Math.PI * radius;
  const progress = (score / 100) * circumference;
  const offset = circumference - progress;

  const getColor = (s: number) => {
    if (s < 40) return { stroke: '#ef4444', text: 'text-red-500', label: 'Low' };
    if (s <= 70) return { stroke: '#f59e0b', text: 'text-amber-500', label: 'Medium' };
    return { stroke: '#10b981', text: 'text-emerald-500', label: 'High' };
  };
  const colorConfig = getColor(score);

  return (
    <div className="relative flex items-center justify-center">
      <svg width="120" height="120" viewBox="0 0 120 120" className="eng-glow">
        {/* Background ring */}
        <circle
          cx="60" cy="60" r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="8"
          className="text-muted/30"
        />
        {/* Progress ring */}
        <circle
          cx="60" cy="60" r={radius}
          fill="none"
          stroke={colorConfig.stroke}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform="rotate(-90 60 60)"
          className="eng-score-ring transition-all duration-1000"
          style={{ strokeDashoffset: offset }}
        />
        {/* Color zones */}
        <circle cx="60" cy="60" r={radius} fill="none" stroke="#ef4444" strokeWidth="2" opacity="0.15" strokeDasharray={`${(40 / 100) * circumference} ${circumference}`} transform="rotate(-90 60 60)" />
        <circle cx="60" cy="60" r={radius} fill="none" stroke="#f59e0b" strokeWidth="2" opacity="0.15" strokeDasharray={`${(30 / 100) * circumference} ${circumference}`} strokeDashoffset={-(40 / 100) * circumference} transform="rotate(-90 60 60)" />
        <circle cx="60" cy="60" r={radius} fill="none" stroke="#10b981" strokeWidth="2" opacity="0.15" strokeDasharray={`${(30 / 100) * circumference} ${circumference}`} strokeDashoffset={-(70 / 100) * circumference} transform="rotate(-90 60 60)" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={cn('text-2xl font-extrabold tabular-nums', colorConfig.text)}>{score}</span>
        <span className="text-[10px] text-muted-foreground font-medium">{colorConfig.label}</span>
      </div>
    </div>
  );
}

/* ===== Engagement Breakdown Donut ===== */
function EngagementDonut({ categories }: { categories: EngagementCategory[] }) {
  const total = categories.reduce((s, c) => s + c.value, 0);
  const radius = 36;
  const circumference = 2 * Math.PI * radius;

  let cumulative = 0;

  return (
    <div className="flex items-center gap-4">
      <svg width="96" height="96" viewBox="0 0 96 96" className="shrink-0">
        {categories.map((cat, i) => {
          const pct = cat.value / total;
          const dash = pct * circumference;
          const gap = circumference - dash;
          const rotation = (cumulative / total) * 360 - 90;
          cumulative += cat.value;
          return (
            <circle
              key={cat.label}
              cx="48" cy="48" r={radius}
              fill="none"
              stroke={cat.color}
              strokeWidth="10"
              strokeDasharray={`${dash} ${gap}`}
              transform={`rotate(${rotation} 48 48)`}
              className="transition-all duration-700"
              style={{ animationDelay: `${i * 0.1}s` }}
              opacity={0.85}
            />
          );
        })}
        <text x="48" y="46" textAnchor="middle" className="fill-foreground text-sm font-bold" fontSize="13">{total}</text>
        <text x="48" y="58" textAnchor="middle" className="fill-muted-foreground" fontSize="8">total</text>
      </svg>
      <div className="space-y-1.5 flex-1 min-w-0">
        {categories.map((cat) => {
          return (
            <div key={cat.label} className="flex items-center gap-2 text-[11px]">
              <div className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
              <span className="text-muted-foreground truncate flex-1">{cat.label}</span>
              <span className="font-semibold tabular-nums">{cat.value}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ===== Activity Heatmap ===== */
function ActivityHeatmap({ data }: { data: number[][] }) {
  const maxVal = Math.max(...data.flat(), 1);

  const getOpacity = (val: number) => {
    if (val === 0) return 0.08;
    return 0.2 + (val / maxVal) * 0.8;
  };

  const getColor = (val: number) => {
    if (val === 0) return 'oklch(0.696 0.17 162.48)';
    return 'oklch(0.696 0.17 162.48)';
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr>
            <th className="text-[10px] text-muted-foreground font-medium text-left pb-1.5 pr-2 w-12">Day</th>
            {TIME_LABELS.map((t) => (
              <th key={t} className="text-[10px] text-muted-foreground font-medium text-center pb-1.5 px-1">{t}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {DAY_LABELS.map((day, rowIdx) => (
            <tr key={day}>
              <td className="text-[10px] text-muted-foreground font-medium pr-2 py-0.5">{day}</td>
              {data[rowIdx].map((val, colIdx) => (
                <td key={colIdx} className="px-1 py-0.5">
                  <div
                    className="eng-cell-anim h-6 w-full min-w-[32px] rounded-md cursor-pointer transition-all duration-200 hover:scale-110 hover:ring-2 hover:ring-primary/30"
                    style={{
                      backgroundColor: getColor(val),
                      opacity: getOpacity(val),
                      animationDelay: `${(rowIdx * 4 + colIdx) * 0.03}s`,
                    }}
                    title={`${day} ${TIME_LABELS[colIdx]}: ${val} interactions`}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ===== Main Component ===== */
export default function EngagementScoreCenter() {
  const [period, setPeriod] = useState<Period>('7d');
  const [mounted, setMounted] = useState(false);
  const [expandedRec, setExpandedRec] = useState<string | null>(null);
  const [data, setData] = useState<EngagementData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/dashboard/engagement-scores?period=${period}`)
      .then((r) => {
        if (!r.ok) throw new Error('Failed to load');
        return r.json();
      })
      .then((res) => {
        if (res.data) {
          // Map icons to categories from API response
          const mappedCategories = (res.data.categories || []).map(
            (cat: EngagementCategory) => ({
              ...cat,
              icon: CATEGORY_ICON_MAP[cat.label] || Mail,
            }),
          );
          setData({ ...res.data, categories: mappedCategories });
        } else {
          setError('No data returned');
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [period]);

  if (loading) {
    return (
      <div className="p-6 animate-pulse space-y-6">
        <div className="h-12 w-72 bg-muted rounded-lg" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="h-48 bg-muted rounded-xl" />
          <div className="h-48 bg-muted rounded-xl" />
          <div className="h-48 bg-muted rounded-xl" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="h-48 bg-muted rounded-xl" />
          <div className="h-48 bg-muted rounded-xl" />
        </div>
      </div>
    );
  }
  if (error) return <div className="p-6 text-destructive">Error: {error}</div>;
  if (!data) return <div className="p-6 text-muted-foreground">No data available yet.</div>;

  const { overallScore, leads: topLeads, categories, recommendations, heatmap } = data;

  const getScoreColor = (score: number) => {
    if (score < 40) return 'bg-red-500';
    if (score <= 70) return 'bg-amber-500';
    return 'bg-emerald-500';
  };

  const getScoreTextColor = (score: number) => {
    if (score < 40) return 'text-red-500';
    if (score <= 70) return 'text-amber-500';
    return 'text-emerald-500';
  };

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: animationStyles }} />
      <div className={cn('space-y-6', mounted ? 'eng-animate-in' : 'opacity-0')}>
        {/* Header */}
        <Card className="glass-card overflow-hidden">
          <CardHeader className="pb-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <div className="rounded-lg p-2 bg-gradient-to-br from-emerald-500 to-teal-600">
                  <Target className="h-4 w-4 text-white" />
                </div>
                Activity & Engagement Score Center
              </CardTitle>
              <div className="flex items-center gap-1 bg-muted/40 rounded-lg p-0.5 border border-border/30">
                {PERIOD_CONFIG.map((p) => (
                  <button
                    key={p.key}
                    onClick={() => setPeriod(p.key)}
                    className={cn(
                      'px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-200 cursor-pointer',
                      period === p.key
                        ? 'bg-background shadow-sm text-foreground border border-border/50'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                    )}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
              <span>
                Overall engagement at <span className="font-semibold text-foreground">{overallScore}/100</span>
                {overallScore >= 70
                  ? ' — performing well'
                  : overallScore >= 40
                    ? ' — needs attention'
                    : ' — critically low'}
              </span>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Engagement Gauge + Top Leads */}
          <div className={cn(mounted ? 'eng-animate-delay-1' : 'opacity-0')}>
            <Card className="glass-card overflow-hidden h-full">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <Zap className="h-4 w-4 text-emerald-500" />
                  Engagement Score
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-center">
                  <EngagementGauge score={overallScore} />
                </div>
                {/* Legend */}
                <div className="flex justify-center gap-4 text-[10px]">
                  <div className="flex items-center gap-1.5"><div className="h-2 w-2 rounded-full bg-red-500" /><span className="text-muted-foreground">Low (&lt;40)</span></div>
                  <div className="flex items-center gap-1.5"><div className="h-2 w-2 rounded-full bg-amber-500" /><span className="text-muted-foreground">Med (40-70)</span></div>
                  <div className="flex items-center gap-1.5"><div className="h-2 w-2 rounded-full bg-emerald-500" /><span className="text-muted-foreground">High (&gt;70)</span></div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Top 5 Leads */}
          <div className={cn(mounted ? 'eng-animate-delay-2' : 'opacity-0')}>
            <Card className="glass-card overflow-hidden h-full">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-violet-500" />
                  Top Leads by Engagement
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {topLeads.map((lead, idx) => (
                  <div
                    key={lead.id}
                    className="group p-2.5 rounded-lg border border-border/30 hover:border-primary/30 hover:bg-primary/5 transition-all duration-200 cursor-pointer"
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[10px] font-bold text-muted-foreground bg-muted/50 rounded-full w-5 h-5 flex items-center justify-center shrink-0">
                          {idx + 1}
                        </span>
                        <span className="text-xs font-semibold truncate">{lead.name}</span>
                      </div>
                      <span className={cn('text-xs font-bold tabular-nums', getScoreTextColor(lead.score))}>
                        {lead.score}
                      </span>
                    </div>
                    {/* Score bar */}
                    <div className="h-1.5 w-full bg-muted/50 rounded-full overflow-hidden mb-1.5">
                      <div
                        className={cn('h-full rounded-full eng-bar-grow', getScoreColor(lead.score))}
                        style={{ width: `${lead.score}%`, animationDelay: `${idx * 0.1}s` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                      <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{lead.lastActivity}</span>
                      <span className="flex items-center gap-1"><Zap className="h-3 w-3" />{lead.interactions} actions</span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Engagement Breakdown Donut */}
          <div className={cn(mounted ? 'eng-animate-delay-3' : 'opacity-0')}>
            <Card className="glass-card overflow-hidden h-full">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <MousePointerClick className="h-4 w-4 text-sky-500" />
                  Engagement Breakdown
                </CardTitle>
              </CardHeader>
              <CardContent>
                <EngagementDonut categories={categories} />
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Activity Heatmap */}
          <Card className="glass-card overflow-hidden">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <CalendarCheck className="h-4 w-4 text-amber-500" />
                Activity Heatmap
              </CardTitle>
              <p className="text-[11px] text-muted-foreground">Engagement intensity by day and time slot</p>
            </CardHeader>
            <CardContent>
              <ActivityHeatmap data={heatmap} />
              {/* Legend */}
              <div className="flex items-center gap-2 mt-3 text-[10px] text-muted-foreground">
                <span>Less</span>
                {[0.08, 0.25, 0.5, 0.75, 1.0].map((opacity, i) => (
                  <div
                    key={i}
                    className="h-3 w-3 rounded-sm"
                    style={{ backgroundColor: 'oklch(0.696 0.17 162.48)', opacity }}
                  />
                ))}
                <span>More</span>
              </div>
            </CardContent>
          </Card>

          {/* AI Recommendations */}
          <Card className="glass-card overflow-hidden">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <Lightbulb className="h-4 w-4 text-amber-500" />
                AI Outreach Recommendations
              </CardTitle>
              <p className="text-[11px] text-muted-foreground">Personalized suggestions based on engagement patterns</p>
            </CardHeader>
            <CardContent className="space-y-3">
              {recommendations.map((rec) => {
                const prio = PRIORITY_CONFIG[rec.priority];
                const isExpanded = expandedRec === rec.id;
                return (
                  <div
                    key={rec.id}
                    className={cn(
                      'rounded-lg border p-3 transition-all duration-300 cursor-pointer',
                      prio.border, prio.bg,
                      isExpanded ? 'shadow-md' : 'hover:shadow-sm'
                    )}
                    onClick={() => setExpandedRec(isExpanded ? null : rec.id)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <ChevronRight
                          className={cn(
                            'h-3.5 w-3.5 shrink-0 transition-transform duration-200',
                            prio.color,
                            isExpanded && 'rotate-90'
                          )}
                        />
                        <span className="text-xs font-semibold truncate">{rec.lead}</span>
                      </div>
                      <Badge variant="outline" className={cn('text-[9px] h-5 shrink-0', prio.color, prio.border)}>
                        {prio.label}
                      </Badge>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1.5 ml-5.5 leading-relaxed">{rec.suggestion}</p>
                    {isExpanded && (
                      <div className="mt-2 ml-5.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                        <Lightbulb className="h-3 w-3" />
                        <span className="italic">{rec.reason}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
