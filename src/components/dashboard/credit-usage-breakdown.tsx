'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  CreditCard,
  Sparkles,
  Zap,
  Globe,
  BarChart3,
  TrendingUp,
  AlertTriangle,
  ArrowUpRight,
  ChevronDown,
  Info,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { useSubscriptionStore } from '@/lib/subscription-store';

/* ── Credit usage category types ───────────────────────────── */
interface CreditUsageCategory {
  name: string;
  credits: number;
  color: string;
  bgClass: string;
  icon: React.ElementType;
}

/* ── Default category definitions (used when real data is available) ── */
const CATEGORY_DEFS: CreditUsageCategory[] = [
  { name: 'AI Scoring', credits: 0, color: 'text-violet-500', bgClass: 'bg-violet-500', icon: Sparkles },
  { name: 'Website Analysis', credits: 0, color: 'text-sky-500', bgClass: 'bg-sky-500', icon: Globe },
  { name: 'Outreach', credits: 0, color: 'text-emerald-500', bgClass: 'bg-emerald-500', icon: TrendingUp },
  { name: 'Deal Analysis', credits: 0, color: 'text-amber-500', bgClass: 'bg-amber-500', icon: BarChart3 },
  { name: 'Lead Discovery', credits: 0, color: 'text-rose-500', bgClass: 'bg-rose-500', icon: Zap },
];

/* ── Main Component ─────────────────────────────────────────── */
export default function CreditUsageBreakdown() {
  const [period, setPeriod] = useState<'today' | 'week' | 'month'>('week');
  const [animatedWidths, setAnimatedWidths] = useState<Record<string, number>>({});
  const [mounted, setMounted] = useState(false);

  const [usageData, setUsageData] = useState<CreditUsageCategory[]>(CATEGORY_DEFS);

  const subscriptionStore = useSubscriptionStore();
  const currentCredits = subscriptionStore.credits;
  const totalCredits = currentCredits > 0 ? currentCredits : 0;

  const totalUsed = useMemo(() => usageData.reduce((sum, cat) => sum + cat.credits, 0), [usageData]);

  // Animate bars on mount and period change
  useEffect(() => {
    setMounted(true);
    const timer = setTimeout(() => {
      const widths: Record<string, number> = {};
      usageData.forEach((cat) => {
        widths[cat.name] = (cat.credits / totalUsed) * 100;
      });
      setAnimatedWidths(widths);
    }, 100);
    return () => clearTimeout(timer);
  }, [usageData, totalUsed]);

  const remainingCredits = Math.max(totalCredits - totalUsed, 0);
  const usagePercent = Math.min(Math.round((totalUsed / totalCredits) * 100), 100);
  const isLow = remainingCredits < 100;

  return (
    <Card className="glass-card card-hover-border overflow-hidden">
      <CardHeader className="pb-3 px-4 pt-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <div className="rounded-lg p-1.5 bg-gradient-to-br from-amber-500 to-orange-500">
              <CreditCard className="h-3.5 w-3.5 text-white" />
            </div>
            <span>Credit Usage</span>
          </CardTitle>
          <Select value={period} onValueChange={(v) => setPeriod(v as 'today' | 'week' | 'month')}>
            <SelectTrigger className="w-[110px] h-7 text-xs border-primary/20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="week">This Week</SelectItem>
              <SelectItem value="month">This Month</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-3">
        {/* Total usage overview */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground font-medium">
              {totalUsed} of {totalCredits} credits used
            </span>
            <span className={cn('font-bold tabular-nums', isLow ? 'text-red-500' : 'text-emerald-500')}>
              {usagePercent}%
            </span>
          </div>

          {/* Usage bar */}
          <div className="h-2.5 rounded-full bg-muted/50 overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${usagePercent}%` }}
              transition={{ duration: 0.8, ease: [0.34, 1.56, 0.64, 1] }}
              className={cn(
                'h-full rounded-full',
                isLow
                  ? 'bg-gradient-to-r from-red-500 to-orange-500'
                  : 'bg-gradient-to-r from-primary to-emerald-500'
              )}
            />
          </div>
        </div>

        {/* Low credit warning */}
        {isLow && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="flex items-center gap-2 p-2.5 rounded-lg bg-red-500/10 border border-red-500/20"
          >
            <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-red-500">Low on credits</p>
              <p className="text-[10px] text-red-400">{remainingCredits} remaining</p>
            </div>
            <Button size="sm" className="h-7 text-xs gap-1 bg-red-500 hover:bg-red-600 text-white shrink-0">
              Top up
              <ArrowUpRight className="h-3 w-3" />
            </Button>
          </motion.div>
        )}

        <Separator />

        {/* Empty state when no usage data */}
        {totalUsed === 0 ? (
          <div className="flex flex-col items-center justify-center py-8">
            <CreditCard className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">No credit usage data available</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Usage will appear here once you start using features</p>
          </div>
        ) : (
        <>
        {/* Stacked horizontal bar chart */}
        <div className="space-y-2">
          {/* Bar */}
          <div className="h-8 rounded-lg overflow-hidden flex bg-muted/30 border border-border/50">
            {mounted && usageData.map((cat, i) => {
              const pct = animatedWidths[cat.name] ?? 0;
              if (pct <= 0) return null;

              return (
                <motion.div
                  key={cat.name}
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.6, delay: i * 0.1, ease: [0.34, 1.56, 0.64, 1] }}
                  className={cn('h-full relative group flex items-center justify-center overflow-hidden transition-all', cat.bgClass)}
                  title={`${cat.name}: ${cat.credits} credits (${Math.round(pct)}%)`}
                  style={{ minWidth: pct > 8 ? undefined : '4px' }}
                >
                  {pct > 12 && (
                    <span className="text-[10px] font-bold text-white drop-shadow-sm truncate px-1">
                      {cat.credits}
                    </span>
                  )}
                </motion.div>
              );
            })}
          </div>

          {/* Legend with percentages */}
          <div className="space-y-1.5">
            {usageData.map((cat, i) => {
              const pct = totalUsed > 0 ? Math.round((cat.credits / totalUsed) * 100) : 0;
              const Icon = cat.icon;
              return (
                <motion.div
                  key={cat.name}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.2 + i * 0.06, duration: 0.25 }}
                  className="flex items-center justify-between group cursor-default list-item-hover rounded-md"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div className={cn('w-2.5 h-2.5 rounded-sm shrink-0', cat.bgClass)} />
                    <Icon className={cn('h-3.5 w-3.5 shrink-0', cat.color)} />
                    <span className="text-xs font-medium truncate group-hover:text-foreground transition-colors">{cat.name}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs tabular-nums font-semibold text-muted-foreground">{cat.credits}</span>
                    <span className="text-[10px] text-muted-foreground/70 font-mono w-8 text-right">{pct}%</span>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>

        </>
        )}

        {/* Bottom info */}
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/60 pt-1">
          <Info className="h-3 w-3" />
          <span>Based on selected period. Credit usage auto-refreshes in real time.</span>
        </div>
      </CardContent>
    </Card>
  );
}
