'use client';

// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — CRM Animated KPI Card
//
// Premium motion: staggered entrance, number count-up, hover lift,
// trend indicator. Respects prefers-reduced-motion.
// Clicking the card navigates to drilldownHref (if set).
// ═══════════════════════════════════════════════════════════════════

import React, { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion, useSpring, useTransform } from 'framer-motion';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import * as Icons from 'lucide-react';
import type { CrmKpi } from '@/lib/admin/crm/crm-types';
import { fmtValue } from './crm-utils';

function AnimatedNumber({ value, format }: { value: number; format: CrmKpi['valueFormat'] }) {
  const reduced = useReducedMotion();
  const [display, setDisplay] = useState(reduced ? value : 0);
  const spring = useSpring(reduced ? value : 0, { stiffness: 60, damping: 20 });
  const rounded = useTransform(spring, (v) => {
    if (format === 'money') return Math.round(v);
    if (format === 'percent') return Math.round(v);
    return Math.round(v);
  });

  useEffect(() => {
    if (reduced) { setDisplay(value); return; }
    spring.set(value);
    const unsub = rounded.on('change', (v) => setDisplay(v));
    return () => unsub();
  }, [value, spring, rounded, reduced]);

  return <>{fmtValue(display, format)}</>;
}

export function CrmKpiCard({ kpi, index }: { kpi: CrmKpi; index: number }) {
  const reduced = useReducedMotion();
  const IconComp = (Icons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[kpi.icon] || Icons.Circle;

  const trendIcon = kpi.trend === 'up' ? Icons.TrendingUp : kpi.trend === 'down' ? Icons.TrendingDown : Icons.Minus;
  const TrendIcon = trendIcon;
  const trendColor = kpi.trend === 'up' ? 'text-emerald-600 dark:text-emerald-400' : kpi.trend === 'down' ? 'text-rose-600 dark:text-rose-400' : 'text-muted-foreground';

  const card = (
    <motion.div
      initial={reduced ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduced ? { duration: 0 } : { delay: Math.min(index * 0.04, 0.4), duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      whileHover={reduced ? undefined : { y: -2 }}
    >
      <Card className="group h-full transition-shadow hover:shadow-md">
        <div className="flex h-full flex-col p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-muted-foreground">{kpi.label}</span>
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 transition-colors group-hover:bg-primary/15">
              <IconComp className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
            </span>
          </div>
          <div className="mt-1 text-xl font-semibold tracking-tight tabular-nums">
            <AnimatedNumber value={kpi.value} format={kpi.valueFormat} />
          </div>
          <div className="mt-1 flex items-center gap-1.5">
            {kpi.trend && kpi.trend !== 'flat' && (
              <TrendIcon className={`h-3 w-3 ${trendColor}`} aria-hidden="true" />
            )}
            {kpi.sub && (
              <p className={`text-[11px] ${trendColor.replace(/text-\S+/, 'text-muted-foreground')}`}>{kpi.sub}</p>
            )}
          </div>
        </div>
      </Card>
    </motion.div>
  );

  if (kpi.drilldownHref) {
    return (
      <Link href={kpi.drilldownHref} aria-label={`${kpi.label}: drill down`}>
        {card}
      </Link>
    );
  }
  return card;
}

export function CrmKpiGrid({ kpis }: { kpis: CrmKpi[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-7">
      {kpis.map((kpi, i) => (
        <CrmKpiCard key={kpi.key} kpi={kpi} index={i} />
      ))}
    </div>
  );
}
