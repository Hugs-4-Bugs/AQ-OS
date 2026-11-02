'use client';

// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — CRM Needs Attention Panel
//
// Visually prominent operational section surfacing items that need
// admin intervention. Each item is a clickable drill-down link.
// Severity drives color: critical (rose), warning (amber), info (sky).
// ═══════════════════════════════════════════════════════════════════

import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { AlertTriangle, AlertCircle, Info, ChevronRight } from 'lucide-react';
import type { NeedsAttentionItem } from '@/lib/admin/crm/crm-types';

const SEVERITY_STYLES = {
  critical: {
    icon: AlertTriangle,
    badge: 'bg-rose-500/15 text-rose-600 border-rose-500/30 dark:text-rose-400',
    count: 'bg-rose-500 text-white',
  },
  warning: {
    icon: AlertCircle,
    badge: 'bg-amber-500/15 text-amber-600 border-amber-500/30 dark:text-amber-400',
    count: 'bg-amber-500 text-white',
  },
  info: {
    icon: Info,
    badge: 'bg-sky-500/15 text-sky-600 border-sky-500/30 dark:text-sky-400',
    count: 'bg-sky-500 text-white',
  },
} as const;

export function NeedsAttentionPanel({ items }: { items: NeedsAttentionItem[] }) {
  const reduced = useReducedMotion();

  if (items.length === 0) {
    return (
      <Card>
        <div className="flex flex-col items-center gap-2 p-8 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/15">
            <AlertCircle className="h-5 w-5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
          </div>
          <p className="text-sm font-medium">All clear</p>
          <p className="text-xs text-muted-foreground">Nothing needs immediate attention right now.</p>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <div className="p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" aria-hidden="true" />
            <h3 className="text-sm font-semibold">Needs Attention</h3>
          </div>
          <span className="text-[11px] text-muted-foreground">{items.length} item{items.length !== 1 ? 's' : ''}</span>
        </div>
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item, i) => {
            const style = SEVERITY_STYLES[item.severity];
            const Icon = style.icon;
            return (
              <motion.li
                key={item.key}
                initial={reduced ? false : { opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={reduced ? { duration: 0 } : { delay: Math.min(i * 0.05, 0.4), duration: 0.3 }}
              >
                <Link
                  href={item.drilldownHref}
                  className="group flex items-center gap-3 rounded-md border border-border bg-background p-2.5 transition-colors hover:bg-muted"
                  aria-label={`${item.label}: ${item.count} — drill down`}
                >
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${style.badge} border`}>
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{item.label}</span>
                      <span className={`flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold ${style.count}`}>
                        {item.count}
                      </span>
                    </div>
                    <p className="truncate text-[11px] text-muted-foreground">{item.description}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                </Link>
              </motion.li>
            );
          })}
        </ul>
      </div>
    </Card>
  );
}
