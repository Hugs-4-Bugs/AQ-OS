'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  Megaphone,
  Mail,
  Linkedin,
  FileText,
  MonitorPlay,
  TrendingUp,
  DollarSign,
  Calendar,
  Copy,
  Plus,
  Clock,
  BarChart3,
  Target,
  ArrowUpRight,
  Zap,
  Pause,
  Play,
  ExternalLink,
  Circle,
} from 'lucide-react';

/* ===== Types ===== */
type CampaignStatus = 'Active' | 'Paused' | 'Draft';
type CampaignChannel = 'Email' | 'LinkedIn' | 'Content' | 'Webinar';
type Period = 'month' | 'quarter' | 'year';

interface Campaign {
  id: string;
  name: string;
  channel: CampaignChannel;
  status: CampaignStatus;
  progress: number;
  roi: number;
  budgetSpent: number;
  budgetTotal: number;
  impressions: number;
  clicks: number;
  conversions: number;
  revenue: number;
  color: string;
  icon: React.ElementType;
}

interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  type: 'launch' | 'review' | 'deadline' | 'webinar';
  campaign: string;
}

interface RadarDimension {
  label: string;
  value: number;
  maxValue: number;
}

const PERFORMANCE_METRICS = [
  { label: 'Impressions', key: 'impressions' as const },
  { label: 'Clicks', key: 'clicks' as const },
  { label: 'Conversions', key: 'conversions' as const },
  { label: 'Revenue', key: 'revenue' as const },
];

const PERIOD_CONFIG: { key: Period; label: string }[] = [
  { key: 'month', label: 'This Month' },
  { key: 'quarter', label: 'This Quarter' },
  { key: 'year', label: 'This Year' },
];

const STATUS_CONFIG: Record<CampaignStatus, { color: string; bg: string; border: string; icon: React.ElementType }> = {
  Active: { color: 'text-emerald-500', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', icon: Play },
  Paused: { color: 'text-amber-500', bg: 'bg-amber-500/10', border: 'border-amber-500/30', icon: Pause },
  Draft: { color: 'text-muted-foreground', bg: 'bg-muted/50', border: 'border-border/50', icon: Circle },
};

const EVENT_TYPE_CONFIG: Record<string, { color: string; bg: string }> = {
  launch: { color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
  review: { color: 'text-blue-500', bg: 'bg-blue-500/10' },
  deadline: { color: 'text-red-500', bg: 'bg-red-500/10' },
  webinar: { color: 'text-violet-500', bg: 'bg-violet-500/10' },
};

/* ===== Demo Data ===== */
const campaigns: Campaign[] = [
  {
    id: 'cmp-001',
    name: 'Q3 Email Blast',
    channel: 'Email',
    status: 'Active',
    progress: 72,
    roi: 3.8,
    budgetSpent: 4200,
    budgetTotal: 6000,
    impressions: 128000,
    clicks: 9400,
    conversions: 412,
    revenue: 22800,
    color: '#8b5cf6',
    icon: Mail,
  },
  {
    id: 'cmp-002',
    name: 'LinkedIn Outreach',
    channel: 'LinkedIn',
    status: 'Active',
    progress: 54,
    roi: 2.6,
    budgetSpent: 3100,
    budgetTotal: 7500,
    impressions: 64000,
    clicks: 5200,
    conversions: 238,
    revenue: 17400,
    color: '#3b82f6',
    icon: Linkedin,
  },
  {
    id: 'cmp-003',
    name: 'SEO Content Sprint',
    channel: 'Content',
    status: 'Paused',
    progress: 38,
    roi: 4.2,
    budgetSpent: 5200,
    budgetTotal: 9000,
    impressions: 210000,
    clicks: 12600,
    conversions: 520,
    revenue: 31200,
    color: '#10b981',
    icon: FileText,
  },
  {
    id: 'cmp-004',
    name: 'Product Webinar',
    channel: 'Webinar',
    status: 'Draft',
    progress: 12,
    roi: 0,
    budgetSpent: 0,
    budgetTotal: 4500,
    impressions: 0,
    clicks: 0,
    conversions: 0,
    revenue: 0,
    color: '#f59e0b',
    icon: MonitorPlay,
  },
];

const radarData: RadarDimension[] = [
  { label: 'Reach', value: 78, maxValue: 100 },
  { label: 'Engagement', value: 64, maxValue: 100 },
  { label: 'Conversion', value: 71, maxValue: 100 },
  { label: 'Retention', value: 52, maxValue: 100 },
  { label: 'Revenue', value: 84, maxValue: 100 },
];

const calendarEvents: CalendarEvent[] = [
  { id: 'evt-001', title: 'Q3 Email Blast Launch', date: 'Mon 12', type: 'launch', campaign: 'Q3 Email Blast' },
  { id: 'evt-002', title: 'Copy Review — LinkedIn Outreach', date: 'Wed 14', type: 'review', campaign: 'LinkedIn Outreach' },
  { id: 'evt-003', title: 'Content Sprint Deadline', date: 'Fri 16', type: 'deadline', campaign: 'SEO Content Sprint' },
  { id: 'evt-004', title: 'Product Webinar Dry Run', date: 'Tue 20', type: 'webinar', campaign: 'Product Webinar' },
  { id: 'evt-005', title: 'Budget Review Call', date: 'Thu 22', type: 'review', campaign: 'All Campaigns' },
];

/* ===== CSS Animations ===== */
const animationStyles = `
@keyframes campFadeIn {
  from { opacity: 0; transform: translateY(16px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes campBarGrow {
  from { width: 0%; }
}
@keyframes campRadarDraw {
  from { opacity: 0; transform: scale(0.5); }
  to { opacity: 1; transform: scale(1); }
}
@keyframes campProgressPulse {
  0%, 100% { opacity: 0.8; }
  50% { opacity: 1; }
}
@keyframes campCardHover {
  from { box-shadow: 0 0 0 0 rgba(139, 92, 246, 0.1); }
  to { box-shadow: 0 0 0 4px rgba(139, 92, 246, 0.05); }
}
@keyframes campSlideRow {
  from { opacity: 0; transform: translateX(-8px); }
  to { opacity: 1; transform: translateX(0); }
}
.camp-animate-in { animation: campFadeIn 0.5s ease-out both; }
.camp-animate-delay-1 { animation: campFadeIn 0.5s ease-out 0.1s both; }
.camp-animate-delay-2 { animation: campFadeIn 0.5s ease-out 0.2s both; }
.camp-animate-delay-3 { animation: campFadeIn 0.5s ease-out 0.3s both; }
.camp-bar-grow { animation: campBarGrow 0.8s ease-out both; }
.camp-radar-draw { animation: campRadarDraw 0.6s ease-out both; }
.camp-progress-pulse { animation: campProgressPulse 2s ease-in-out infinite; }
.camp-slide-row { animation: campSlideRow 0.3s ease-out both; }
`;

/* ===== Radar Chart (SVG-based) ===== */
function RadarChart({ dimensions }: { dimensions: RadarDimension[] }) {
  const size = 200;
  const center = size / 2;
  const maxRadius = 80;
  const sides = dimensions.length;
  const angleStep = (2 * Math.PI) / sides;

  const getPoint = (index: number, value: number) => {
    const angle = angleStep * index - Math.PI / 2;
    const radius = (value / 100) * maxRadius;
    return {
      x: center + radius * Math.cos(angle),
      y: center + radius * Math.sin(angle),
    };
  };

  // Grid rings
  const rings = [20, 40, 60, 80, 100];

  // Data polygon
  const dataPoints = dimensions.map((d, i) => getPoint(i, d.value));
  const dataPath = dataPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z';

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="mx-auto camp-radar-draw"
    >
      {/* Grid rings */}
      {rings.map((ring) => (
        <polygon
          key={ring}
          points={Array.from({ length: sides }, (_, i) => {
            const p = getPoint(i, ring);
            return `${p.x},${p.y}`;
          }).join(' ')}
          fill="none"
          stroke="currentColor"
          strokeWidth="0.5"
          className="text-border/40"
        />
      ))}

      {/* Axis lines */}
      {dimensions.map((_, i) => {
        const p = getPoint(i, 100);
        return (
          <line
            key={i}
            x1={center}
            y1={center}
            x2={p.x}
            y2={p.y}
            stroke="currentColor"
            strokeWidth="0.5"
            className="text-border/30"
          />
        );
      })}

      {/* Data polygon */}
      <polygon
        points={dataPoints.map((p) => `${p.x},${p.y}`).join(' ')}
        fill="rgba(139, 92, 246, 0.15)"
        stroke="#8b5cf6"
        strokeWidth="2"
        className="transition-all duration-700"
      />

      {/* Data points */}
      {dataPoints.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="3.5" fill="#8b5cf6" className="drop-shadow-sm" />
      ))}

      {/* Labels */}
      {dimensions.map((d, i) => {
        const p = getPoint(i, 115);
        const labelX = p.x;
        const labelY = p.y;
        return (
          <text
            key={i}
            x={labelX}
            y={labelY}
            textAnchor="middle"
            dominantBaseline="middle"
            className="fill-muted-foreground"
            fontSize="8"
            fontWeight="500"
          >
            <tspan>{d.label}</tspan>
            <tspan x={labelX} dy="10" className="fill-foreground font-bold" fontSize="9">
              {d.value}
            </tspan>
          </text>
        );
      })}
    </svg>
  );
}

/* ===== Format Utility ===== */
function formatNumber(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toString();
}

function formatCurrency(n: number): string {
  if (n >= 1000000) return `$${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}K`;
  return `$${n.toLocaleString()}`;
}

/* ===== Main Component ===== */
export default function CampaignTracker() {
  const [mounted, setMounted] = useState(true);
  const [period, setPeriod] = useState<Period>('month');
  const [selectedCampaign, setSelectedCampaign] = useState<string | null>(null);
  const [hoveredCampaign, setHoveredCampaign] = useState<string | null>(null);

  const totalBudgetSpent = campaigns.reduce((s, c) => s + c.budgetSpent, 0);
  const totalBudget = campaigns.reduce((s, c) => s + c.budgetTotal, 0);
  const totalRevenue = campaigns.reduce((s, c) => s + c.revenue, 0);
  const totalConversions = campaigns.reduce((s, c) => s + c.conversions, 0);
  const totalImpressions = campaigns.reduce((s, c) => s + c.impressions, 0);
  const totalClicks = campaigns.reduce((s, c) => s + c.clicks, 0);
  const activeCampaigns = campaigns.filter((c) => c.status === 'Active').length;

  // Get max value for grouped bar chart normalization
  const getMetricMax = (key: 'impressions' | 'clicks' | 'conversions' | 'revenue') => {
    return Math.max(...campaigns.map((c) => c[key]), 1);
  };

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: animationStyles }} />
      <div className={cn('space-y-6', mounted ? 'camp-animate-in' : 'opacity-0')}>
        {/* Header */}
        <Card className="glass-card overflow-hidden">
          <CardHeader className="pb-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <div className="rounded-lg p-2 bg-gradient-to-br from-violet-500 to-purple-600">
                  <Megaphone className="h-4 w-4 text-white" />
                </div>
                Multi-Channel Campaign Tracker
                <Badge className="bg-violet-500/10 text-violet-500 border-violet-500/25 border text-[9px] h-5">
                  <Zap className="h-2.5 w-2.5 mr-1" />
                  {activeCampaigns} Active
                </Badge>
              </CardTitle>
              <div className="flex items-center gap-2">
                {/* Period Toggle */}
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
                {/* Quick Actions */}
                <Button
                  className="rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 shadow-md hover:shadow-lg transition-all duration-200"
                  size="sm"
                >
                  <Plus className="h-3.5 w-3.5 mr-1.5" />
                  Create
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {/* Summary Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
              {[
                { label: 'Total Revenue', value: formatCurrency(totalRevenue), icon: DollarSign, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
                { label: 'Impressions', value: formatNumber(totalImpressions), icon: BarChart3, color: 'text-blue-500', bg: 'bg-blue-500/10' },
                { label: 'Clicks', value: formatNumber(totalClicks), icon: Target, color: 'text-violet-500', bg: 'bg-violet-500/10' },
                { label: 'Conversions', value: totalConversions.toString(), icon: ArrowUpRight, color: 'text-amber-500', bg: 'bg-amber-500/10' },
                { label: 'CTR', value: `${totalImpressions > 0 ? ((totalClicks / totalImpressions) * 100).toFixed(1) : 0}%`, icon: TrendingUp, color: 'text-sky-500', bg: 'bg-sky-500/10' },
                { label: 'Budget Used', value: `${Math.round((totalBudgetSpent / totalBudget) * 100)}%`, icon: DollarSign, color: 'text-rose-500', bg: 'bg-rose-500/10' },
              ].map((stat) => {
                const Icon = stat.icon;
                return (
                  <div
                    key={stat.label}
                    className="flex items-center gap-2 p-2.5 rounded-lg bg-muted/30 transition-all duration-200 hover:bg-muted/50"
                  >
                    <div className={cn('rounded-md p-1.5 shrink-0', stat.bg)}>
                      <Icon className={cn('h-3.5 w-3.5', stat.color)} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold leading-tight tabular-nums">{stat.value}</p>
                      <p className="text-[9px] text-muted-foreground truncate">{stat.label}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Campaign Cards */}
        <div className={cn('grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4', mounted ? 'camp-animate-delay-1' : 'opacity-0')}>
          {campaigns.map((campaign, idx) => {
            const Icon = campaign.icon;
            const statusConfig = STATUS_CONFIG[campaign.status];
            const StatusIcon = statusConfig.icon;
            const isSelected = selectedCampaign === campaign.id;
            const isHovered = hoveredCampaign === campaign.id;

            return (
              <div
                key={campaign.id}
                className={cn(
                  'p-4 rounded-xl border transition-all duration-300 cursor-pointer',
                  'bg-background/50 backdrop-blur-sm',
                  isSelected
                    ? 'border-violet-500/50 shadow-md ring-1 ring-violet-500/20'
                    : isHovered
                      ? 'border-border/60 hover:border-violet-500/30 shadow-sm'
                      : 'border-border/40 hover:border-border/60'
                )}
                onClick={() => setSelectedCampaign(isSelected ? null : campaign.id)}
                onMouseEnter={() => setHoveredCampaign(campaign.id)}
                onMouseLeave={() => setHoveredCampaign(null)}
                style={{ animationDelay: `${idx * 0.08}s` }}
              >
                {/* Campaign Header */}
                <div className="flex items-center justify-between mb-3">
                  <div className={cn('rounded-lg p-2', { backgroundColor: campaign.color + '15' })}>
                    <Icon className="h-4 w-4" style={{ color: campaign.color }} />
                  </div>
                  <Badge
                    variant="outline"
                    className={cn('text-[8px] h-4 px-1.5', statusConfig.color, statusConfig.bg, statusConfig.border)}
                  >
                    <StatusIcon className="h-2 w-2 mr-0.5" />
                    {campaign.status}
                  </Badge>
                </div>

                {/* Name */}
                <h4 className="text-xs font-semibold mb-3 truncate">{campaign.name}</h4>

                {/* Progress Bar */}
                <div className="space-y-1 mb-3">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-muted-foreground">Progress</span>
                    <span className="font-semibold tabular-nums">{campaign.progress}%</span>
                  </div>
                  <div className="h-1.5 w-full bg-muted/40 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full camp-bar-grow transition-all duration-700"
                      style={{
                        width: `${campaign.progress}%`,
                        backgroundColor: campaign.color,
                        animationDelay: `${idx * 0.1}s`,
                      }}
                    />
                  </div>
                </div>

                {/* Metrics */}
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div className="rounded-md bg-muted/20 px-2 py-1.5">
                    <p className="text-[8px] text-muted-foreground">ROI</p>
                    <p className="text-xs font-bold tabular-nums" style={{ color: campaign.color }}>
                      {campaign.roi}%
                    </p>
                  </div>
                  <div className="rounded-md bg-muted/20 px-2 py-1.5">
                    <p className="text-[8px] text-muted-foreground">Conversions</p>
                    <p className="text-xs font-bold tabular-nums">{campaign.conversions}</p>
                  </div>
                </div>

                {/* Budget */}
                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>
                    {formatCurrency(campaign.budgetSpent)} / {formatCurrency(campaign.budgetTotal)}
                  </span>
                  <span className="font-semibold">{Math.round((campaign.budgetSpent / campaign.budgetTotal) * 100)}%</span>
                </div>
                <div className="h-1 w-full bg-muted/30 rounded-full overflow-hidden mt-1">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-muted-foreground/40 to-muted-foreground/20 camp-bar-grow"
                    style={{
                      width: `${(campaign.budgetSpent / campaign.budgetTotal) * 100}%`,
                      animationDelay: `${idx * 0.1 + 0.2}s`,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Charts Row: Performance Comparison + Radar */}
        <div className={cn('grid grid-cols-1 lg:grid-cols-2 gap-6', mounted ? 'camp-animate-delay-2' : 'opacity-0')}>
          {/* Grouped Bar Chart — Performance Comparison */}
          <Card className="glass-card overflow-hidden">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-blue-500" />
                Campaign Performance Comparison
              </CardTitle>
              <p className="text-[10px] text-muted-foreground">Impressions, Clicks, Conversions, Revenue by campaign</p>
            </CardHeader>
            <CardContent>
              <div className="space-y-5">
                {PERFORMANCE_METRICS.map((metric) => {
                  const maxVal = getMetricMax(metric.key);
                  return (
                    <div key={metric.key} className="space-y-1.5">
                      <div className="flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground mb-2">
                        <span className="w-20">{metric.label}</span>
                        <div className="flex-1 h-px bg-border/30" />
                      </div>
                      <div className="space-y-1.5">
                        {campaigns.filter((c) => c.status !== 'Draft').map((campaign, idx) => {
                          const value = campaign[metric.key];
                          const pct = Math.max((value / maxVal) * 100, 2);
                          const isSelected = selectedCampaign === campaign.id;
                          return (
                            <div
                              key={`${metric.key}-${campaign.id}`}
                              className="flex items-center gap-2 camp-slide-row"
                              style={{ animationDelay: `${idx * 0.05}s` }}
                            >
                              <span className="text-[9px] text-muted-foreground w-20 truncate shrink-0">
                                {campaign.name.split(' ').slice(0, 2).join(' ')}
                              </span>
                              <div className="flex-1 h-4 bg-muted/20 rounded-md overflow-hidden">
                                <div
                                  className={cn(
                                    'h-full rounded-md camp-bar-grow transition-all duration-500',
                                    isSelected ? 'opacity-100' : 'opacity-70'
                                  )}
                                  style={{
                                    width: `${pct}%`,
                                    backgroundColor: campaign.color,
                                    animationDelay: `${idx * 0.08}s`,
                                  }}
                                />
                              </div>
                              <span className="text-[9px] font-semibold tabular-nums w-14 text-right shrink-0">
                                {metric.key === 'revenue' ? formatCurrency(value) : formatNumber(value)}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
              {/* Legend */}
              <div className="flex flex-wrap gap-3 mt-4 pt-3 border-t border-border/30">
                {campaigns.filter((c) => c.status !== 'Draft').map((campaign) => (
                  <div key={campaign.id} className="flex items-center gap-1.5 text-[9px]">
                    <div className="h-2 w-2 rounded-sm" style={{ backgroundColor: campaign.color }} />
                    <span className="text-muted-foreground">{campaign.name.split(' ').slice(0, 2).join(' ')}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Channel Effectiveness Radar */}
          <Card className="glass-card overflow-hidden">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <Target className="h-4 w-4 text-violet-500" />
                Channel Effectiveness Radar
              </CardTitle>
              <p className="text-[10px] text-muted-foreground">5-dimension performance overview across all channels</p>
            </CardHeader>
            <CardContent>
              <RadarChart dimensions={radarData} />
              {/* Dimension Details */}
              <div className="grid grid-cols-5 gap-1 mt-2">
                {radarData.map((d) => (
                  <div key={d.label} className="text-center">
                    <p className="text-[8px] text-muted-foreground">{d.label}</p>
                    <p className="text-xs font-bold tabular-nums">{d.value}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Calendar + Quick Actions */}
        <div className={cn('grid grid-cols-1 lg:grid-cols-3 gap-6', mounted ? 'camp-animate-delay-3' : 'opacity-0')}>
          {/* Upcoming Calendar */}
          <Card className="glass-card overflow-hidden lg:col-span-2">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <Calendar className="h-4 w-4 text-amber-500" />
                Upcoming Campaign Calendar
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {calendarEvents.map((event, idx) => {
                  const typeConfig = EVENT_TYPE_CONFIG[event.type];
                  return (
                    <div
                      key={event.id}
                      className="flex items-center gap-3 p-3 rounded-lg border border-border/30 hover:border-violet-500/20 hover:bg-violet-500/5 transition-all duration-200 camp-slide-row cursor-pointer"
                      style={{ animationDelay: `${idx * 0.06}s` }}
                    >
                      {/* Date Column */}
                      <div className="shrink-0 w-14 text-center">
                        <p className="text-xs font-bold tabular-nums">{event.date.split(' ')[1]}</p>
                        <p className="text-[9px] text-muted-foreground">{event.date.split(' ')[0]}</p>
                      </div>
                      {/* Type Indicator */}
                      <div className={cn('rounded-lg p-1.5 shrink-0', typeConfig.bg)}>
                        <Megaphone className={cn('h-3 w-3', typeConfig.color)} />
                      </div>
                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold truncate">{event.title}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{event.campaign}</p>
                      </div>
                      {/* Action */}
                      <button className="text-[10px] text-violet-500 font-medium hover:text-violet-400 transition-colors shrink-0 cursor-pointer flex items-center gap-1">
                        <ExternalLink className="h-3 w-3" />
                        <span className="hidden sm:inline">View</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Quick Actions Panel */}
          <Card className="glass-card overflow-hidden">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <Zap className="h-4 w-4 text-emerald-500" />
                Quick Actions
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {[
                {
                  label: 'Create Campaign',
                  description: 'Launch a new multi-channel campaign',
                  icon: Plus,
                  color: 'from-violet-500 to-purple-600',
                },
                {
                  label: 'Duplicate Campaign',
                  description: 'Clone an existing campaign setup',
                  icon: Copy,
                  color: 'from-blue-500 to-cyan-600',
                },
                {
                  label: 'Schedule Campaign',
                  description: 'Set launch date & automation rules',
                  icon: Clock,
                  color: 'from-emerald-500 to-teal-600',
                },
              ].map((action, idx) => {
                const Icon = action.icon;
                return (
                  <button
                    key={action.label}
                    className="w-full flex items-center gap-3 p-3 rounded-lg border border-border/30 hover:border-violet-500/30 hover:bg-violet-500/5 transition-all duration-200 cursor-pointer group camp-slide-row"
                    style={{ animationDelay: `${idx * 0.08}s` }}
                  >
                    <div className={cn('rounded-lg p-2 bg-gradient-to-br shrink-0 transition-transform duration-200 group-hover:scale-110', action.color)}>
                      <Icon className="h-4 w-4 text-white" />
                    </div>
                    <div className="text-left min-w-0">
                      <p className="text-xs font-semibold group-hover:text-violet-500 transition-colors">
                        {action.label}
                      </p>
                      <p className="text-[10px] text-muted-foreground truncate">{action.description}</p>
                    </div>
                    <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground/50 group-hover:text-violet-500 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all shrink-0 ml-auto" />
                  </button>
                );
              })}

              {/* Campaign Performance Summary */}
              <div className="mt-4 p-3 rounded-lg bg-gradient-to-br from-violet-500/5 to-purple-500/5 border border-violet-500/20">
                <div className="flex items-center gap-1.5 mb-2">
                  <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
                  <span className="text-[10px] font-semibold text-emerald-500">+24% vs last period</span>
                </div>
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  Overall campaign performance is trending up. Email campaigns lead in ROI (340%) while
                  LinkedIn generates the highest conversion rate (0.7%).
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
