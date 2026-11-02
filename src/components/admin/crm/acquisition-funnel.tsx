'use client';

// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — CRM Acquisition Funnel
//
// Interactive horizontal funnel showing lead count per lifecycle stage.
// Each stage is a clickable drill-down to the filtered leads view.
// Conversion % and drop-off are shown per stage.
// Stages with 0 leads render an honest empty sliver (not fake numbers).
// ═══════════════════════════════════════════════════════════════════

import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { ChevronRight } from 'lucide-react';
import type { FunnelStage } from '@/lib/admin/crm/crm-types';
import { fmtInt } from './crm-utils';

// Gradient per stage (discovered → negotiation)
const STAGE_GRADIENTS: Record<string, string> = {
  discovered: 'from-sky-500/80 to-sky-600/80',
  analyzed: 'from-cyan-500/80 to-cyan-600/80',
  contacted: 'from-teal-500/80 to-teal-600/80',
  replied: 'from-emerald-500/80 to-emerald-600/80',
  meeting: 'from-amber-500/80 to-amber-600/80',
  proposal: 'from-orange-500/80 to-orange-600/80',
  negotiation: 'from-violet-500/80 to-violet-600/80',
};

export function AcquisitionFunnel({ stages }: { stages: FunnelStage[] }) {
  const reduced = useReducedMotion();
  const maxCount = Math.max(...stages.map((s) => s.count), 1);

  return (
    <Card>
      <div className="p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Acquisition Funnel</h3>
          <span className="text-[11px] text-muted-foreground">click a stage to drill down</span>
        </div>
        <ul className="space-y-2">
          {stages.map((stage, i) => {
            const widthPercent = Math.max((stage.count / maxCount) * 100, stage.count > 0 ? 4 : 1);
            const gradient = STAGE_GRADIENTS[stage.stage] || 'from-slate-500/80 to-slate-600/80';
            return (
              <motion.li
                key={stage.stage}
                initial={reduced ? false : { opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={reduced ? { duration: 0 } : { delay: Math.min(i * 0.06, 0.5), duration: 0.4 }}
              >
                <Link
                  href={`/admin/crm/leads?stage=${stage.stage}`}
                  className="group block"
                  aria-label={`${stage.label}: ${stage.count} leads — drill down`}
                >
                  <div className="flex items-center gap-3">
                    {/* Label */}
                    <div className="w-24 shrink-0 text-right">
                      <p className="text-xs font-medium">{stage.label}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {stage.stepConversionPercent !== null ? `${stage.stepConversionPercent}% step` : 'start'}
                      </p>
                    </div>
                    {/* Bar */}
                    <div className="relative h-9 flex-1 overflow-hidden rounded-md bg-muted/50">
                      <motion.div
                        className={`absolute inset-y-0 left-0 rounded-md bg-gradient-to-r ${gradient}`}
                        initial={reduced ? { width: `${widthPercent}%` } : { width: 0 }}
                        animate={{ width: `${widthPercent}%` }}
                        transition={reduced ? { duration: 0 } : { delay: Math.min(i * 0.06 + 0.1, 0.6), duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                      />
                      <div className="absolute inset-0 flex items-center justify-between px-2.5">
                        <span className="text-xs font-semibold text-white mix-blend-difference">
                          {fmtInt(stage.count)}
                        </span>
                        <div className="flex items-center gap-2 text-[10px] text-white mix-blend-difference">
                          <span>{stage.conversionPercent}% of total</span>
                          {stage.dropOff !== null && stage.dropOff > 0 && (
                            <span className="opacity-80">−{fmtInt(stage.dropOff)}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    {/* Chevron */}
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                  </div>
                </Link>
              </motion.li>
            );
          })}
        </ul>
      </div>
    </Card>
  );
}
