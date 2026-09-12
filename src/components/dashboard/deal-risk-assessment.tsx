'use client';

// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS v3.8.0 — Deal Risk Assessment Panel
// Risk-scored deals table with filtering, sorting, and mitigation tips
// ═══════════════════════════════════════════════════════════════════

import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ShieldAlert,
  ShieldCheck,
  Shield,
  ShieldX,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Filter,
  Lightbulb,
  Clock,
  MessageSquare,
  Users,
  DollarSign,
  AlertTriangle,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

/* ===== Types ===== */
type RiskLevel = 'Low' | 'Medium' | 'High' | 'Critical';

interface DealRisk {
  id: string;
  name: string;
  company: string;
  value: number;
  stage: string;
  riskScore: number; // 0-100
  riskLevel: RiskLevel;
  daysInStage: number;
  lastActivity: string;
  stakeholderEngagement: 'high' | 'medium' | 'low';
  budgetConfirmed: boolean;
  mitigationTip: string;
}

/* ===== Data (fetched from API) ===== */
const dealsData: DealRisk[] = [];

/* ===== Risk Level Config ===== */
const RISK_CONFIG: Record<RiskLevel, { icon: React.ElementType; color: string; bg: string; border: string; badge: string; textColor: string }> = {
  Low: { icon: ShieldCheck, color: 'text-emerald-500', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', badge: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/25', textColor: 'text-emerald-500' },
  Medium: { icon: Shield, color: 'text-amber-500', bg: 'bg-amber-500/10', border: 'border-amber-500/30', badge: 'bg-amber-500/15 text-amber-600 border-amber-500/25', textColor: 'text-amber-500' },
  High: { icon: ShieldAlert, color: 'text-orange-500', bg: 'bg-orange-500/10', border: 'border-orange-500/30', badge: 'bg-orange-500/15 text-orange-600 border-orange-500/25', textColor: 'text-orange-500' },
  Critical: { icon: ShieldX, color: 'text-red-500', bg: 'bg-red-500/10', border: 'border-red-500/30', badge: 'bg-red-500/15 text-red-600 border-red-500/25', textColor: 'text-red-500' },
};

type SortField = 'riskScore' | 'value' | 'daysInStage' | 'company';
type SortDir = 'asc' | 'desc';

/* ===== Risk Badge ===== */
function RiskBadge({ level }: { level: RiskLevel }) {
  const config = RISK_CONFIG[level];
  const Icon = config.icon;
  return (
    <Badge variant="outline" className={cn('text-[9px] h-5 px-1.5 gap-1 border', config.badge)}>
      <Icon className="h-2.5 w-2.5" />
      {level}
    </Badge>
  );
}

/* ===== Risk Score Bar ===== */
function RiskScoreBar({ score }: { score: number }) {
  const color = score >= 70 ? '#ef4444' : score >= 40 ? '#f59e0b' : '#10b981';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden max-w-[60px]">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${score}%` }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className="h-full rounded-full"
          style={{ backgroundColor: color }}
        />
      </div>
      <span className="text-[10px] font-bold tabular-nums" style={{ color }}>{score}</span>
    </div>
  );
}

/* ===== Deal Row ===== */
function DealRow({
  deal,
  expanded,
  onToggle,
}: {
  deal: DealRisk;
  expanded: boolean;
  onToggle: () => void;
}) {
  const config = RISK_CONFIG[deal.riskLevel];
  const engagementColor = deal.stakeholderEngagement === 'high'
    ? 'text-emerald-500'
    : deal.stakeholderEngagement === 'medium'
      ? 'text-amber-500'
      : 'text-red-500';

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="group"
    >
      <button
        onClick={onToggle}
        className={cn(
          'w-full flex items-center gap-3 p-3 rounded-lg border transition-all duration-200 text-left',
          'hover:shadow-sm',
          expanded
            ? 'bg-accent/50 border-accent shadow-sm'
            : 'border-transparent hover:bg-accent/30'
        )}
      >
        {/* Company */}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold truncate group-hover:text-primary transition-colors">{deal.company}</p>
          <p className="text-[10px] text-muted-foreground truncate">{deal.name}</p>
        </div>

        {/* Value */}
        <div className="hidden sm:block text-right w-20">
          <p className="text-xs font-bold tabular-nums">${(deal.value / 1000).toFixed(0)}K</p>
        </div>

        {/* Risk Score */}
        <div className="hidden md:block w-20">
          <RiskScoreBar score={deal.riskScore} />
        </div>

        {/* Badges */}
        <div className="flex items-center gap-1.5 shrink-0">
          <RiskBadge level={deal.riskLevel} />
          <div className={cn('flex items-center gap-0.5 text-[10px]', engagementColor)} title="Stakeholder engagement">
            <Users className="h-2.5 w-2.5" />
          </div>
          {!deal.budgetConfirmed && (
            <div className="text-[10px] text-red-400" title="Budget not confirmed">
              <DollarSign className="h-2.5 w-2.5" />
            </div>
          )}
        </div>
      </button>

      {/* Expanded Detail */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="ml-4 pl-4 border-l-2 border-border/50 py-3 pr-3 space-y-2.5">
              {/* Risk Factors */}
              <div className="grid grid-cols-2 gap-2 text-[10px]">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  <span>Days in stage:</span>
                  <span className={cn('font-semibold', deal.daysInStage > 14 ? 'text-red-500' : deal.daysInStage > 7 ? 'text-amber-500' : 'text-foreground')}>
                    {deal.daysInStage}d
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <MessageSquare className="h-3 w-3" />
                  <span>Last activity:</span>
                  <span className="font-semibold text-foreground">{deal.lastActivity}</span>
                </div>
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Users className="h-3 w-3" />
                  <span>Engagement:</span>
                  <span className={cn('font-semibold capitalize', engagementColor)}>{deal.stakeholderEngagement}</span>
                </div>
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <DollarSign className="h-3 w-3" />
                  <span>Budget:</span>
                  <span className={cn('font-semibold', deal.budgetConfirmed ? 'text-emerald-500' : 'text-red-500')}>
                    {deal.budgetConfirmed ? 'Confirmed' : 'Pending'}
                  </span>
                </div>
              </div>

              {/* Mitigation Tip */}
              <div className={cn('flex gap-2 p-2.5 rounded-lg', config.bg)}>
                <Lightbulb className={cn('h-3.5 w-3.5 shrink-0 mt-0.5', config.color)} />
                <p className="text-[11px] leading-relaxed">{deal.mitigationTip}</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ===== Filter Pills ===== */
function FilterPills({
  active,
  onChange,
}: {
  active: RiskLevel | 'All';
  onChange: (v: RiskLevel | 'All') => void;
}) {
  const levels: Array<RiskLevel | 'All'> = ['All', 'Critical', 'High', 'Medium', 'Low'];
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {levels.map((level) => {
        const isActive = active === level;
        const config = level !== 'All' ? RISK_CONFIG[level] : null;
        return (
          <button
            key={level}
            onClick={() => onChange(level)}
            className={cn(
              'text-[10px] font-semibold px-2 py-1 rounded-md transition-all duration-200',
              isActive
                ? level === 'All'
                  ? 'bg-primary/15 text-primary border border-primary/25'
                  : cn(config?.bg, config?.textColor, 'border', config?.border)
                : 'bg-muted/40 text-muted-foreground hover:text-foreground'
            )}
          >
            {level}
          </button>
        );
      })}
    </div>
  );
}

/* ===== Loading Skeleton ===== */
function RiskAssessmentSkeleton() {
  return (
    <Card className="card-glow glass-card overflow-hidden">
      <CardHeader className="pb-3">
        <Skeleton className="h-4 w-48" />
      </CardHeader>
      <CardContent className="space-y-3">
        <Skeleton className="h-8 w-full" />
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-lg" />
        ))}
      </CardContent>
    </Card>
  );
}

/* ===== Empty State ===== */
function EmptyState() {
  return (
    <Card className="card-glow glass-card overflow-hidden">
      <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <ShieldAlert className="h-10 w-10 mb-3 opacity-30" />
        <p className="text-sm font-medium">No deals to assess</p>
        <p className="text-xs mt-1">Risk analysis will appear once deals are in progress.</p>
      </CardContent>
    </Card>
  );
}

/* ===== Sort Button (extracted outside render) ===== */
function SortButton({
  field,
  sortField,
  sortDir,
  onSort,
  children,
}: {
  field: SortField;
  sortField: SortField;
  sortDir: SortDir;
  onSort: (field: SortField) => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={() => onSort(field)}
      className={cn(
        'flex items-center gap-0.5 text-[9px] font-semibold uppercase tracking-wider transition-colors',
        sortField === field ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
      )}
    >
      {children}
      {sortField === field ? (
        sortDir === 'asc' ? <ArrowUp className="h-2.5 w-2.5" /> : <ArrowDown className="h-2.5 w-2.5" />
      ) : (
        <ArrowUpDown className="h-2.5 w-2.5 opacity-40" />
      )}
    </button>
  );
}

/* ===== Main Component ===== */
export default function DealRiskAssessment() {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<RiskLevel | 'All'>('All');
  const [sortField, setSortField] = useState<SortField>('riskScore');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const filteredDeals = useMemo(() => {
    let deals = [...dealsData];
    if (filter !== 'All') {
      deals = deals.filter((d) => d.riskLevel === filter);
    }
    deals.sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      if (sortField === 'company') {
        return a.company.localeCompare(b.company) * dir;
      }
      return (a[sortField] - b[sortField]) * dir;
    });
    return deals;
  }, [filter, sortField, sortDir, dealsData]);

  const criticalCount = dealsData.filter((d) => d.riskLevel === 'Critical').length;
  const highCount = dealsData.filter((d) => d.riskLevel === 'High').length;

  if (!dealsData || dealsData.length === 0) return <EmptyState />;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.2 }}
    >
      <Card className="card-glow glass-card overflow-hidden border border-border/50 bg-card/50 backdrop-blur-sm relative group">
        <div className="absolute inset-0 rounded-xl border border-primary/10 group-hover:border-primary/20 transition-colors duration-500 pointer-events-none" />
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-orange-500/20 to-transparent" />

        <CardHeader className="pb-2 relative">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <div className="rounded-lg p-1.5 bg-orange-500/10">
                  <ShieldAlert className="h-4 w-4 text-orange-500" />
                </div>
                Deal Risk Assessment
              </CardTitle>
              {(criticalCount > 0 || highCount > 0) && (
                <Badge variant="outline" className="text-[9px] h-5 px-1.5 border-red-500/25 bg-red-500/10 text-red-500 gap-1">
                  <AlertTriangle className="h-2.5 w-2.5" />
                  {criticalCount + highCount} at risk
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Filter className="h-3 w-3 text-muted-foreground" />
              <FilterPills active={filter} onChange={setFilter} />
            </div>
          </div>
        </CardHeader>

        <CardContent className="relative">
          {/* Column Headers */}
          <div className="flex items-center gap-3 px-3 pb-2 border-b border-border/40 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
            <SortButton field="company" sortField={sortField} sortDir={sortDir} onSort={handleSort}>Deal</SortButton>
            <div className="hidden sm:block w-20 text-right">
              <SortButton field="value" sortField={sortField} sortDir={sortDir} onSort={handleSort}>Value</SortButton>
            </div>
            <div className="hidden md:block w-20">
              <SortButton field="riskScore" sortField={sortField} sortDir={sortDir} onSort={handleSort}>Risk</SortButton>
            </div>
            <div className="w-24 text-right">Level</div>
          </div>

          {/* Deal Rows */}
          <ScrollArea className="max-h-[380px] custom-scrollbar">
            <div className="space-y-1 pt-1">
              <AnimatePresence>
                {filteredDeals.map((deal) => (
                  <DealRow
                    key={deal.id}
                    deal={deal}
                    expanded={expandedId === deal.id}
                    onToggle={() => setExpandedId(expandedId === deal.id ? null : deal.id)}
                  />
                ))}
              </AnimatePresence>
            </div>
          </ScrollArea>

          {filteredDeals.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Shield className="h-6 w-6 mb-2 opacity-40" />
              <p className="text-xs">No deals match this filter</p>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
