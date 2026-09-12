'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  Globe,
  TrendingUp,
  DollarSign,
  HandshakeIcon,
  ArrowUpRight,
  ArrowDownRight,
  MapPin,
  Trophy,
  BarChart3,
  Plus,
  CheckCircle2,
  Target,
  Layers,
} from 'lucide-react';

/* ===== Types ===== */
type RegionKey = 'all' | 'na' | 'eu' | 'apac' | 'latam';

interface Territory {
  id: string;
  region: string;
  regionKey: RegionKey;
  revenue: number;
  deals: number;
  conversionRate: number;
  growth: number;
  avgDealSize: number;
}

/* Data loaded from API */
const TERRITORIES: Territory[] = [
  { id: 'ter1', region: 'North America', regionKey: 'na', revenue: 2840000, deals: 47, conversionRate: 32, growth: 18.5, avgDealSize: 60426 },
  { id: 'ter2', region: 'Europe', regionKey: 'eu', revenue: 1920000, deals: 34, conversionRate: 28, growth: 12.3, avgDealSize: 56471 },
  { id: 'ter3', region: 'APAC', regionKey: 'apac', revenue: 1450000, deals: 29, conversionRate: 35, growth: 24.8, avgDealSize: 50000 },
  { id: 'ter4', region: 'LATAM', regionKey: 'latam', revenue: 680000, deals: 18, conversionRate: 22, growth: 31.2, avgDealSize: 37778 },
  { id: 'ter5', region: 'Middle East & Africa', regionKey: 'apac', revenue: 420000, deals: 11, conversionRate: 19, growth: 15.6, avgDealSize: 38182 },
];

const REGION_TABS: { key: RegionKey; label: string }[] = [
  { key: 'all', label: 'All Regions' },
  { key: 'na', label: 'North America' },
  { key: 'eu', label: 'Europe' },
  { key: 'apac', label: 'APAC' },
  { key: 'latam', label: 'LATAM' },
];

const HEATMAP_METRICS = ['Revenue', 'Deals', 'Conversion', 'Growth'];

/* ===== CSS Animations ===== */
const animationStyles = `
@keyframes tmFadeIn { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
@keyframes tmSlideUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
@keyframes tmPulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.03); } }
@keyframes tmToastIn { from { opacity: 0; transform: translateY(8px) scale(0.95); } to { opacity: 1; transform: translateY(0) scale(1); } }
@keyframes tmToastOut { from { opacity: 1; transform: translateY(0) scale(1); } to { opacity: 0; transform: translateY(-8px) scale(0.95); } }
@keyframes tmGlowPulse { 0%, 100% { box-shadow: 0 0 0px rgba(16, 185, 129, 0); } 50% { box-shadow: 0 0 12px rgba(16, 185, 129, 0.15); } }
.tm-fade-in { animation: tmFadeIn 0.5s ease-out both; }
.tm-slide-up { animation: tmSlideUp 0.3s ease-out both; }
.tm-toast-in { animation: tmToastIn 0.3s ease-out both; }
.tm-toast-out { animation: tmToastOut 0.3s ease-in both; }
.tm-glow-pulse { animation: tmGlowPulse 3s ease-in-out infinite; }
`;

/* ===== Helpers ===== */
function formatCurrency(value: number): string {
  if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
  return `$${value}`;
}

function getHeatmapColor(value: number, metric: string): string {
  const ranges: Record<string, [number, number]> = {
    Revenue: [420000, 2840000],
    Deals: [11, 47],
    Conversion: [19, 35],
    Growth: [12.3, 31.2],
  };
  const [min, max] = ranges[metric] ?? [0, 100];
  const normalized = Math.max(0, Math.min(1, (value - min) / (max - min)));
  if (normalized < 0.25) return 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20';
  if (normalized < 0.5) return 'bg-emerald-500/20 text-emerald-600 border-emerald-500/30';
  if (normalized < 0.75) return 'bg-emerald-500/30 text-emerald-700 border-emerald-500/40';
  return 'bg-emerald-500/40 text-emerald-700 border-emerald-500/50 font-bold';
}

function getBarWidth(value: number, metric: string): number {
  const ranges: Record<string, [number, number]> = {
    Revenue: [0, 3000000],
    Deals: [0, 50],
    Conversion: [0, 40],
    Growth: [0, 35],
  };
  const [min, max] = ranges[metric] ?? [0, 100];
  return Math.max(4, Math.min(100, ((value - min) / (max - min)) * 100));
}

/* ===== SVG Map Block ===== */
function RegionMapBlock({ territories }: { territories: Territory[] }) {
  const maxRevenue = Math.max(...territories.map(t => t.revenue), 1);

  const regionBlocks = [
    { name: 'North America', x: 10, y: 15, w: 35, h: 30, color: '#3b82f6', territories: territories.filter(t => t.regionKey === 'na') },
    { name: 'Europe', x: 48, y: 15, w: 30, h: 28, color: '#a855f7', territories: territories.filter(t => t.regionKey === 'eu') },
    { name: 'APAC', x: 65, y: 50, w: 30, h: 35, color: '#f59e0b', territories: territories.filter(t => t.region.includes('APAC') || t.region.includes('Middle')) },
    { name: 'LATAM', x: 15, y: 55, w: 25, h: 30, color: '#10b981', territories: territories.filter(t => t.regionKey === 'latam') },
  ];

  return (
    <svg viewBox="0 0 100 95" className="w-full h-auto rounded-xl border border-border/30 bg-muted/20 p-1">
      {regionBlocks.map((block) => {
        const revenue = block.territories.reduce((sum, t) => sum + t.revenue, 0);
        const opacity = 0.3 + (revenue / maxRevenue) * 0.7;
        const isActive = block.territories.length > 0;
        return (
          <g key={block.name}>
            <rect
              x={block.x}
              y={block.y}
              width={block.w}
              height={block.h}
              rx={4}
              fill={block.color}
              opacity={opacity}
              className="transition-all duration-500"
            />
            {isActive && (
              <rect
                x={block.x}
                y={block.y}
                width={block.w}
                height={block.h}
                rx={4}
                fill="none"
                stroke={block.color}
                strokeWidth={0.5}
                opacity={0.6}
              />
            )}
            <text
              x={block.x + block.w / 2}
              y={block.y + block.h / 2 - 2}
              textAnchor="middle"
              fill="white"
              fontSize="4"
              fontWeight="bold"
              opacity={0.95}
            >
              {block.name}
            </text>
            <text
              x={block.x + block.w / 2}
              y={block.y + block.h / 2 + 4}
              textAnchor="middle"
              fill="white"
              fontSize="3.2"
              opacity={0.8}
            >
              {formatCurrency(revenue)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/* ===== Main Component ===== */
export default function TerritoryMapDashboard() {
  const [mounted, setMounted] = useState(false);
  const [activeRegion, setActiveRegion] = useState<RegionKey>('all');
  const [toast, setToast] = useState<{ message: string; id: number } | null>(null);
  const [toastExiting, setToastExiting] = useState(false);

  useEffect(() => {
    const timer = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(timer);
  }, []);

  const showToast = (message: string) => {
    setToast({ message, id: Date.now() });
    setToastExiting(false);
    setTimeout(() => setToastExiting(true), 2000);
    setTimeout(() => setToast(null), 2300);
  };

  const filteredTerritories = useMemo(() => {
    if (activeRegion === 'all') return TERRITORIES;
    return TERRITORIES.filter(t => t.regionKey === activeRegion);
  }, [activeRegion]);

  const quickStats = useMemo(() => {
    const totalRevenue = filteredTerritories.reduce((s, t) => s + t.revenue, 0);
    const totalDeals = filteredTerritories.reduce((s, t) => s + t.deals, 0);
    const avgConversion = filteredTerritories.length > 0
      ? (filteredTerritories.reduce((s, t) => s + t.conversionRate, 0) / filteredTerritories.length).toFixed(1)
      : '0';
    const topRegion = [...filteredTerritories].sort((a, b) => b.revenue - a.revenue)[0];
    return { totalRevenue, totalDeals, avgConversion, topRegion: topRegion?.region ?? 'N/A' };
  }, [filteredTerritories]);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: animationStyles }} />
      <div className={cn('space-y-4', mounted ? 'tm-fade-in' : 'opacity-0')}>
        {/* Header */}
        <Card className="glass-card overflow-hidden">
          <CardHeader className="pb-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <div className="rounded-lg p-2 bg-gradient-to-br from-emerald-500 to-teal-600">
                  <Globe className="h-4 w-4 text-white" />
                </div>
                Geography & Territory Map
                <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/25 border text-[9px] h-5">
                  {filteredTerritories.length} territories
                </Badge>
              </CardTitle>
              <Button
                onClick={() => showToast('Territory assigned to your account!')}
                className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white text-xs shadow-md hover:shadow-lg transition-all duration-200"
                size="sm"
              >
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                Assign Territory
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {/* Quick Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              {[
                { label: 'Total Revenue', value: formatCurrency(quickStats.totalRevenue), icon: DollarSign, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
                { label: 'Total Deals', value: quickStats.totalDeals, icon: HandshakeIcon, color: 'text-sky-500', bg: 'bg-sky-500/10' },
                { label: 'Avg Conversion', value: `${quickStats.avgConversion}%`, icon: Target, color: 'text-amber-500', bg: 'bg-amber-500/10' },
                { label: 'Top Region', value: quickStats.topRegion, icon: Trophy, color: 'text-violet-500', bg: 'bg-violet-500/10' },
              ].map((stat) => {
                const Icon = stat.icon;
                return (
                  <div key={stat.label} className="flex items-center gap-2.5 p-2.5 rounded-lg bg-muted/30 border border-border/30">
                    <div className={cn('rounded-md p-1.5 shrink-0', stat.bg)}>
                      <Icon className={cn('h-3.5 w-3.5', stat.color)} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold leading-tight">{stat.value}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{stat.label}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Region Tabs */}
            <div className="flex flex-wrap gap-1.5 mb-4">
              {REGION_TABS.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveRegion(tab.key)}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 cursor-pointer border',
                    activeRegion === tab.key
                      ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30'
                      : 'bg-muted/30 text-muted-foreground border-border/30 hover:bg-muted/50 hover:text-foreground'
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Main Content: Map + Performance Cards */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
              {/* SVG Map */}
              <div className="rounded-xl border border-border/30 bg-muted/10 p-3 tm-slide-up">
                <div className="flex items-center gap-2 mb-3">
                  <MapPin className="h-4 w-4 text-emerald-500" />
                  <span className="text-xs font-semibold">Territory Overview</span>
                </div>
                <RegionMapBlock territories={filteredTerritories} />
                <div className="flex flex-wrap gap-3 mt-3">
                  {[
                    { label: 'North America', color: '#3b82f6' },
                    { label: 'Europe', color: '#a855f7' },
                    { label: 'APAC', color: '#f59e0b' },
                    { label: 'LATAM', color: '#10b981' },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center gap-1.5">
                      <div className="h-2 w-2 rounded-sm" style={{ backgroundColor: item.color }} />
                      <span className="text-[10px] text-muted-foreground">{item.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Performance Cards */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 mb-1">
                  <BarChart3 className="h-4 w-4 text-emerald-500" />
                  <span className="text-xs font-semibold">Territory Performance</span>
                </div>
                <div className="grid grid-cols-1 gap-2 max-h-[280px] overflow-y-auto custom-scrollbar pr-1">
                  {filteredTerritories.map((territory, idx) => {
                    const isTop = idx === 0;
                    const growthUp = territory.growth > 0;
                    return (
                      <div
                        key={territory.id}
                        className={cn(
                          'tm-slide-up rounded-xl border p-3 transition-all duration-200 hover:shadow-sm',
                          isTop ? 'border-emerald-500/30 bg-emerald-500/5 tm-glow-pulse' : 'border-border/30 bg-background/50'
                        )}
                        style={{ animationDelay: `${idx * 0.08}s` }}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <div className={cn('h-2.5 w-2.5 rounded-full', isTop ? 'bg-emerald-500' : 'bg-muted-foreground/40')} />
                            <span className="text-xs font-semibold">{territory.region}</span>
                            {isTop && <Trophy className="h-3 w-3 text-amber-500" />}
                          </div>
                          <div className={cn('flex items-center gap-0.5 text-xs font-bold', growthUp ? 'text-emerald-500' : 'text-red-500')}>
                            {growthUp ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                            {territory.growth > 0 ? '+' : ''}{territory.growth}%
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="text-center p-2 rounded-lg bg-muted/30">
                            <p className="text-[10px] text-muted-foreground mb-0.5">Revenue</p>
                            <p className="text-xs font-bold tabular-nums">{formatCurrency(territory.revenue)}</p>
                          </div>
                          <div className="text-center p-2 rounded-lg bg-muted/30">
                            <p className="text-[10px] text-muted-foreground mb-0.5">Deals</p>
                            <p className="text-xs font-bold tabular-nums">{territory.deals}</p>
                          </div>
                          <div className="text-center p-2 rounded-lg bg-muted/30">
                            <p className="text-[10px] text-muted-foreground mb-0.5">Conversion</p>
                            <p className="text-xs font-bold tabular-nums">{territory.conversionRate}%</p>
                          </div>
                          <div className="text-center p-2 rounded-lg bg-muted/30">
                            <p className="text-[10px] text-muted-foreground mb-0.5">Avg Deal Size</p>
                            <p className="text-xs font-bold tabular-nums">{formatCurrency(territory.avgDealSize)}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Top Performing Territories Table */}
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-3">
                <Trophy className="h-4 w-4 text-amber-500" />
                <span className="text-xs font-semibold">Top Performing Territories</span>
              </div>
              <div className="rounded-xl border border-border/30 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-muted/40 border-b border-border/30">
                        <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Region</th>
                        <th className="text-right px-3 py-2 font-semibold text-muted-foreground">Revenue</th>
                        <th className="text-right px-3 py-2 font-semibold text-muted-foreground">Deals</th>
                        <th className="text-right px-3 py-2 font-semibold text-muted-foreground">Avg Deal Size</th>
                        <th className="text-right px-3 py-2 font-semibold text-muted-foreground">Growth</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...filteredTerritories].sort((a, b) => b.revenue - a.revenue).map((territory, idx) => (
                        <tr key={territory.id} className={cn('border-b border-border/20 transition-colors hover:bg-muted/20', idx === 0 && 'bg-emerald-500/5')}>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-2">
                              <span className="flex h-5 w-5 rounded-full bg-gradient-to-br from-emerald-500/20 to-emerald-500/5 items-center justify-center text-[9px] font-bold text-emerald-600 shrink-0">
                                {idx + 1}
                              </span>
                              <span className="font-medium">{territory.region}</span>
                            </div>
                          </td>
                          <td className="text-right px-3 py-2.5 font-bold tabular-nums">{formatCurrency(territory.revenue)}</td>
                          <td className="text-right px-3 py-2.5 tabular-nums">{territory.deals}</td>
                          <td className="text-right px-3 py-2.5 tabular-nums">{formatCurrency(territory.avgDealSize)}</td>
                          <td className="text-right px-3 py-2.5">
                            <span className={cn('inline-flex items-center gap-0.5 font-bold', territory.growth > 0 ? 'text-emerald-500' : 'text-red-500')}>
                              {territory.growth > 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                              {territory.growth > 0 ? '+' : ''}{territory.growth}%
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Territory Heatmap Grid */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Layers className="h-4 w-4 text-violet-500" />
                <span className="text-xs font-semibold">Territory Heatmap</span>
                <span className="text-[10px] text-muted-foreground ml-auto">5 regions × 4 metrics</span>
              </div>
              <div className="rounded-xl border border-border/30 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-muted/40 border-b border-border/30">
                        <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Region</th>
                        {HEATMAP_METRICS.map((metric) => (
                          <th key={metric} className="text-center px-3 py-2 font-semibold text-muted-foreground">{metric}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTerritories.map((territory) => {
                        const metricValues = [territory.revenue, territory.deals, territory.conversionRate, territory.growth];
                        return (
                          <tr key={territory.id} className="border-b border-border/20">
                            <td className="px-3 py-2 font-medium">{territory.region}</td>
                            {HEATMAP_METRICS.map((metric, mIdx) => {
                              const value = metricValues[mIdx];
                              const displayValue = mIdx === 0 ? formatCurrency(value) : mIdx === 3 ? `${value > 0 ? '+' : ''}${value}%` : mIdx === 2 ? `${value}%` : value;
                              return (
                                <td key={metric} className="px-2 py-1.5">
                                  <div className={cn('rounded-lg px-2 py-1.5 text-center border font-medium tabular-nums transition-all duration-300', getHeatmapColor(value, metric))}>
                                    {displayValue}
                                  </div>
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
              {/* Heatmap Legend */}
              <div className="flex items-center gap-2 mt-2 ml-auto w-fit">
                <span className="text-[9px] text-muted-foreground">Low</span>
                <div className="flex gap-0.5">
                  <div className="h-2.5 w-6 rounded-sm bg-emerald-500/10 border border-emerald-500/20" />
                  <div className="h-2.5 w-6 rounded-sm bg-emerald-500/20 border border-emerald-500/30" />
                  <div className="h-2.5 w-6 rounded-sm bg-emerald-500/30 border border-emerald-500/40" />
                  <div className="h-2.5 w-6 rounded-sm bg-emerald-500/40 border border-emerald-500/50" />
                </div>
                <span className="text-[9px] text-muted-foreground">High</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Toast Notification */}
        {toast && (
          <div className={cn('fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-500 text-xs font-medium shadow-lg backdrop-blur-xl', toastExiting ? 'tm-toast-out' : 'tm-toast-in')}>
            <CheckCircle2 className="h-4 w-4" />
            {toast.message}
          </div>
        )}
      </div>
    </>
  );
}
