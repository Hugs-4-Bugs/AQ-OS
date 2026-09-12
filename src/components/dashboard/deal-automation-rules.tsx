'use client';

import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Zap,
  ChevronDown,
  ChevronRight,
  Plus,
  ToggleLeft,
  ToggleRight,
  CheckCircle2,
  XCircle,
  Clock,
  Play,
  Pause,
  FileText,
  Workflow,
  ArrowRight,
  Sparkles,
  Timer,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

// ── Types ─────────────────────────────────────────────────────────
type RuleStatus = 'active' | 'paused' | 'draft';

interface ExecutionRun {
  id: string;
  timestamp: string;
  success: boolean;
  duration: string;
}

interface AutomationRule {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  triggerIcon: React.ElementType;
  triggerLabel: string;
  actionDescription: string;
  status: RuleStatus;
  triggeredThisWeek: number;
  conditions: { logic: string; text: string }[];
  actionSteps: string[];
  lastTriggered: string;
  history: ExecutionRun[];
}

// Rules are managed via state below

const TEMPLATES = [
  { name: 'Welcome Sequence', description: 'Auto-send onboarding emails to new leads', icon: FileText },
  { name: 'Win/Loss Analysis', description: 'Auto-analyze closed deals for patterns', icon: Workflow },
  { name: 'Weekly Digest', description: 'Compile and send weekly pipeline summary', icon: FileText },
];

// ── Status Badge ───────────────────────────────────────────────────
const STATUS_BADGE: Record<RuleStatus, { label: string; className: string }> = {
  active: { label: 'Active', className: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/25 border' },
  paused: { label: 'Paused', className: 'bg-amber-500/15 text-amber-500 border-amber-500/25 border' },
  draft: { label: 'Draft', className: 'bg-muted text-muted-foreground border-border/60 border' },
};

// ── Rule Card ──────────────────────────────────────────────────────
function RuleCard({ rule }: { rule: AutomationRule }) {
  const [expanded, setExpanded] = useState(false);
  const [enabled, setEnabled] = useState(rule.enabled);
  const TriggerIcon = rule.triggerIcon;
  const statusCfg = STATUS_BADGE[rule.status];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-border/40 bg-muted/10 overflow-hidden transition-colors hover:bg-muted/20"
    >
      {/* Main Row */}
      <div className="flex items-start gap-3 p-3">
        {/* Toggle */}
        <button
          onClick={() => setEnabled(!enabled)}
          className="mt-0.5 shrink-0 transition-transform active:scale-90"
          aria-label={enabled ? 'Disable rule' : 'Enable rule'}
        >
          {enabled ? (
            <ToggleRight className="h-6 w-6 text-primary" />
          ) : (
            <ToggleLeft className="h-6 w-6 text-muted-foreground" />
          )}
        </button>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <p className="text-sm font-semibold truncate">{rule.name}</p>
            <Badge className={cn('text-[9px] h-4 px-1.5', statusCfg.className)}>{statusCfg.label}</Badge>
          </div>
          <p className="text-xs text-muted-foreground line-clamp-1">{rule.description}</p>

          {/* Trigger & Action */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2">
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <TriggerIcon className="h-3 w-3" />
              <span>{rule.triggerLabel}</span>
            </div>
            <ArrowRight className="h-3 w-3 text-muted-foreground/50" />
            <span className="text-[11px] text-primary/80">{rule.actionDescription}</span>
          </div>

          {/* Stats */}
          <div className="flex items-center gap-3 mt-2">
            <span className="text-[10px] text-muted-foreground">
              Triggered <span className="font-semibold text-foreground">{rule.triggeredThisWeek}×</span> this week
            </span>
          </div>
        </div>

        {/* Expand Chevron */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-0.5 shrink-0 p-1 rounded-md hover:bg-muted/50 transition-colors"
          aria-label={expanded ? 'Collapse details' : 'Expand details'}
        >
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </button>
      </div>

      {/* Expanded Details */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <Separator />
            <div className="p-3 space-y-3">
              {/* Conditions */}
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Conditions</p>
                <div className="space-y-1">
                  {rule.conditions.map((cond, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      {i > 0 && (
                        <Badge variant="outline" className="text-[9px] h-4 px-1 shrink-0 font-mono">
                          {cond.logic}
                        </Badge>
                      )}
                      <span className="text-muted-foreground">{cond.text}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Action Steps */}
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Action Steps</p>
                <div className="space-y-1">
                  {rule.actionSteps.map((step, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs">
                      <span className="shrink-0 w-4 h-4 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[9px] font-bold">
                        {i + 1}
                      </span>
                      <span className="text-muted-foreground">{step}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Last Triggered */}
              <p className="text-[10px] text-muted-foreground">
                Last triggered: <span className="font-medium text-foreground">{rule.lastTriggered}</span>
              </p>

              {/* Execution History */}
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Recent Runs</p>
                <div className="space-y-1">
                  {rule.history.slice(0, 5).map((run) => (
                    <div key={run.id} className="flex items-center justify-between text-xs py-0.5">
                      <div className="flex items-center gap-2">
                        {run.success ? (
                          <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />
                        ) : (
                          <XCircle className="h-3 w-3 text-red-400 shrink-0" />
                        )}
                        <span className="text-muted-foreground">{run.timestamp}</span>
                      </div>
                      <span className="text-[10px] tabular-nums text-muted-foreground">{run.duration}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── Loading Skeleton ───────────────────────────────────────────────
function LoadingSkeleton() {
  return (
    <Card className="glass-card overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-9 w-24" />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[72px] rounded-xl" />
        ))}
      </CardContent>
    </Card>
  );
}

// ── Main Component ─────────────────────────────────────────────────
export default function DealAutomationRules() {
  const [rules, setRules] = useState<AutomationRule[]>([]);

  const totalRules = rules.length;
  const activeRules = rules.filter((r) => r.enabled).length;
  const totalTriggers = rules.reduce((s, r) => s + r.triggeredThisWeek, 0);
  const avgExecTime = totalTriggers > 0 ? '1.4s' : '-';

  const summaryStats = useMemo(
    () => [
      { label: 'Total Rules', value: String(totalRules), icon: Zap, color: 'text-primary' },
      { label: 'Active', value: String(activeRules), icon: Play, color: 'text-emerald-500' },
      { label: 'Triggers / Week', value: String(totalTriggers), icon: ArrowRight, color: 'text-amber-500' },
      { label: 'Avg Execution', value: avgExecTime, icon: Timer, color: 'text-sky-500' },
    ],
    [totalRules, activeRules, totalTriggers, avgExecTime]
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <Card className="glass-card card-glow overflow-hidden">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" />
              <span className="gradient-text">Automation Rules</span>
            </CardTitle>
            <Button
              variant="outline"
              size="sm"
              className="text-xs gap-1.5 h-8 touch-target"
              onClick={() => {}}
            >
              <Plus className="h-3 w-3" />
              New Rule
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-5">
          {/* Summary Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {summaryStats.map((stat, i) => {
              const Icon = stat.icon;
              return (
                <motion.div
                  key={stat.label}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15 + i * 0.06, duration: 0.3 }}
                  className="flex items-center gap-2 p-2.5 rounded-lg bg-muted/20 border border-border/30"
                >
                  <Icon className={cn('h-4 w-4 shrink-0', stat.color)} />
                  <div className="min-w-0">
                    <p className="text-xs font-bold leading-tight">{stat.value}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{stat.label}</p>
                  </div>
                </motion.div>
              );
            })}
          </div>

          {/* Rules List */}
          <div className="space-y-2">
            {rules.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10">
                <Zap className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
                <p className="text-sm text-muted-foreground">No automation rules configured</p>
                <p className="text-xs text-muted-foreground/60 mt-1">Create a rule to automate your workflow</p>
              </div>
            ) : (
              rules.map((rule, i) => (
              <motion.div
                key={rule.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 + i * 0.08, duration: 0.3 }}
              >
                <RuleCard rule={rule} />
              </motion.div>
              ))
            )}
          </div>

          {/* Template Suggestions */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Suggested Templates
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {TEMPLATES.map((tmpl, i) => {
                const Icon = tmpl.icon;
                return (
                  <motion.div
                    key={tmpl.name}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.6 + i * 0.06, duration: 0.3 }}
                    className="flex items-center gap-2.5 p-3 rounded-lg border border-dashed border-border/50 bg-muted/5 opacity-60 cursor-pointer hover:opacity-100 hover:border-primary/30 transition-all"
                    onClick={() => {}}
                  >
                    <div className="rounded-lg p-1.5 bg-muted/50">
                      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-medium truncate">{tmpl.name}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{tmpl.description}</p>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
