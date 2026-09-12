'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
  Legend,
} from 'recharts';
import { DollarSign, ArrowUpRight, ArrowDownRight, Download, Sparkles, TrendingUp, CalendarRange } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

/* Data loaded from API */
const QUARTERLY_DATA = {
  period: 'Q2 2025',
  starting: 2450000,
  newBusiness: 680000,
  expansion: 420000,
  contraction: -180000,
  churn: -310000,
  net: 3060000,
  prevStarting: 2120000,
  prevNewBusiness: 540000,
  prevExpansion: 290000,
  prevContraction: -120000,
  prevChurn: -280000,
};

const COMPOSITION_DATA = [
  { name: 'New Business', value: 680000, fill: '#10b981' },
  { name: 'Expansion', value: 420000, fill: '#06b6d4' },
  { name: 'Renewals', value: 1680000, fill: '#8b5cf6' },
  { name: 'Services', value: 280000, fill: '#f59e0b' },
];

const INSIGHTS = [
  { icon: TrendingUp, text: 'Expansion revenue grew 23% — strongest quarter yet', color: 'text-emerald-500' },
  { icon: ArrowDownRight, text: 'Churn increased 5% — primarily in SMB segment', color: 'text-red-400' },
  { icon: Sparkles, text: 'New business pipeline is 2x larger than last quarter', color: 'text-cyan-500' },
];

/* ===== Waterfall Bar ===== */
interface WaterfallItem {
  name: string;
  value: number;
  start?: number;
  fill: string;
}

function buildWaterfallData(d: typeof QUARTERLY_DATA): WaterfallItem[] {
  let running = d.starting;
  return [
    { name: 'Starting Rev', value: d.starting, fill: '#10b981' },
    { name: 'New Business', value: d.newBusiness, start: running, fill: '#10b981' },
    { name: 'Expansion', value: d.expansion, start: (running += d.newBusiness), fill: '#06b6d4' },
    { name: 'Contraction', value: Math.abs(d.contraction), start: (running += d.expansion), fill: '#ef4444' },
    { name: 'Churn', value: Math.abs(d.churn), start: (running -= Math.abs(d.contraction)), fill: '#dc2626' },
    { name: 'Net Revenue', value: d.net, fill: '#8b5cf6' },
  ];
}

function WaterfallBar({ data }: { data: WaterfallItem[] }) {
  const barData = data.map((item) => ({
    name: item.name,
    base: item.start ?? 0,
    value: item.value,
    fill: item.fill,
  }));

  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={barData} margin={{ top: 20, right: 20, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 10 }}
            className="fill-muted-foreground"
            interval={0}
            angle={-15}
            textAnchor="end"
            height={50}
          />
          <YAxis
            tick={{ fontSize: 10 }}
            className="fill-muted-foreground"
            tickFormatter={(v: number) => `$${(v / 1000000).toFixed(1)}M`}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'hsl(240 10% 3.9%)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '8px',
              fontSize: '12px',
              color: 'hsl(0 0% 98%)',
            }}
            formatter={(value: number, _name: string, props: { payload: { base: number; value: number } }) => {
              const payload = props.payload;
              if (payload.name === 'Starting Rev' || payload.name === 'Net Revenue') {
                return [`$${(payload.value / 1000000).toFixed(2)}M`, payload.name];
              }
              const signed = payload.value - payload.base >= 0
                ? `+$${(payload.value / 1000).toFixed(0)}K`
                : `-$${((payload.value - payload.base) / 1000).toFixed(0)}K`;
              return [signed, payload.name];
            }}
          />
          {/* Invisible bar for positioning */}
          <Bar dataKey="base" stackId="stack" fill="transparent" />
          <Bar dataKey="value" stackId="stack" radius={[4, 4, 0, 0]} barSize={48}>
            {barData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ===== Revenue Summary Card ===== */
function SummaryCard({
  label,
  value,
  prevValue,
  isNegative = false,
  color = 'text-emerald-500',
}: {
  label: string;
  value: number;
  prevValue: number;
  isNegative?: boolean;
  color?: string;
}) {
  const change = prevValue !== 0 ? Math.round(((value - prevValue) / Math.abs(prevValue)) * 100) : 0;
  const isUp = change >= 0;

  return (
    <Card className="bg-white/5 backdrop-blur-xl border border-white/10 dark:bg-black/20">
      <CardContent className="p-4">
        <p className="text-[11px] text-muted-foreground mb-1">{label}</p>
        <div className="flex items-baseline gap-2">
          <p className={cn('text-lg font-bold tabular-nums', isNegative ? 'text-red-400' : color)}>
            {isNegative ? '-' : ''}${(Math.abs(value) / 1000000).toFixed(2)}M
          </p>
        </div>
        <div className={cn('flex items-center gap-0.5 text-[11px] font-medium mt-1', isUp && !isNegative ? 'text-emerald-500' : isUp && isNegative ? 'text-red-400' : 'text-emerald-500')}>
          {isUp ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
          <span>{Math.abs(change)}% vs prev</span>
        </div>
      </CardContent>
    </Card>
  );
}

/* ===== Revenue Composition Donut ===== */
function CompositionDonut({ data }: { data: { name: string; value: number; fill: string }[] }) {
  return (
    <Card className="bg-white/5 backdrop-blur-xl border border-white/10 dark:bg-black/20">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-amber-500" />
          Revenue Composition
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={75}
                paddingAngle={3}
                dataKey="value"
                strokeWidth={0}
              >
                {data.map((entry, i) => (
                  <Cell key={`donut-${i}`} fill={entry.fill} />
                ))}
              </Pie>
              <Legend
                iconType="circle"
                wrapperStyle={{ fontSize: '11px' }}
                formatter={(value: string) => <span className="text-muted-foreground">{value}</span>}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(240 10% 3.9%)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '8px',
                  fontSize: '12px',
                  color: 'hsl(0 0% 98%)',
                }}
                formatter={(value: number) => [`$${(value / 1000000).toFixed(2)}M`]}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

/* ===== Main Component ===== */
export default function RevenueWaterfall() {
  const [period, setPeriod] = useState('quarter');
  const waterfallData = buildWaterfallData(QUARTERLY_DATA);

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
            <DollarSign className="h-5 w-5 text-emerald-500" />
          </div>
          <div>
            <h2 className="text-lg font-bold">Revenue Breakdown</h2>
            <p className="text-xs text-muted-foreground">{QUARTERLY_DATA.period} waterfall analysis</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-[140px] h-9 text-xs border-border/50">
              <CalendarRange className="h-3.5 w-3.5 mr-1 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="quarter" className="text-xs">This Quarter</SelectItem>
              <SelectItem value="year" className="text-xs">This Year</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" className="h-9 gap-1.5 text-xs">
            <Download className="h-3.5 w-3.5" />
            Export
          </Button>
        </div>
      </div>

      {/* Waterfall Chart */}
      <Card className="bg-white/5 backdrop-blur-xl border border-white/10 dark:bg-black/20">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-emerald-500" />
            Revenue Waterfall
          </CardTitle>
        </CardHeader>
        <CardContent>
          <WaterfallBar data={waterfallData} />
          {/* Flow indicators */}
          <div className="flex items-center justify-center gap-4 mt-2 text-[10px] text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <div className="h-2 w-4 rounded-sm bg-emerald-500" />
              <span>Positive</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-2 w-4 rounded-sm bg-red-500" />
              <span>Negative</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-2 w-4 rounded-sm bg-violet-500" />
              <span>Net Total</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Revenue Summary Cards + Composition Donut */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
          <SummaryCard
            label="Starting Revenue"
            value={QUARTERLY_DATA.starting}
            prevValue={QUARTERLY_DATA.prevStarting}
          />
          <SummaryCard
            label="New Business"
            value={QUARTERLY_DATA.newBusiness}
            prevValue={QUARTERLY_DATA.prevNewBusiness}
            color="text-emerald-500"
          />
          <SummaryCard
            label="Expansion Revenue"
            value={QUARTERLY_DATA.expansion}
            prevValue={QUARTERLY_DATA.prevExpansion}
            color="text-cyan-500"
          />
          <SummaryCard
            label="Churned Revenue"
            value={Math.abs(QUARTERLY_DATA.churn)}
            prevValue={Math.abs(QUARTERLY_DATA.prevChurn)}
            isNegative={true}
            color="text-red-400"
          />
        </div>
        <div className="lg:col-span-1">
          <CompositionDonut data={COMPOSITION_DATA} />
        </div>
      </div>

      {/* Key Insights */}
      <Card className="bg-white/5 backdrop-blur-xl border border-white/10 dark:bg-black/20">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-amber-500" />
            Key Insights
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {INSIGHTS.map((insight, i) => {
              const Icon = insight.icon;
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 + i * 0.1 }}
                  className="flex items-start gap-2.5 p-3 rounded-lg border border-white/5 hover:border-white/10 transition-all"
                >
                  <div className="rounded-lg p-1.5 bg-muted/30 shrink-0 mt-0.5">
                    <Icon className={cn('h-3.5 w-3.5', insight.color)} />
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">{insight.text}</p>
                </motion.div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
