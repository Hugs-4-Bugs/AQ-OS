'use client';

// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Lead Scoring Breakdown Panel
// Phase 7: Detailed AI scoring visualization with category breakdown
//
// Features:
// - Overall score gauge with color-coded tiers
// - Category scores (Industry Fit, Revenue Potential, Engagement, Digital Presence, Growth Signals)
// - Score factors with +/− indicators
// - Improvement recommendations
// - Score history sparkline
// - Animated progress bars per category
// ═══════════════════════════════════════════════════════════════════

import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Lightbulb,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
  Target,
  Globe,
  DollarSign,
  Mail,
  Smartphone,
  Rocket,
  Info,
  ChevronDown,
  ChevronUp,
  Sparkles,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { cn } from '@/lib/utils';

// ── Types ───────────────────────────────────────────────────────
interface ScoreCategory {
  name: string;
  score: number;
  weight: number;
  icon: React.ElementType;
  color: string;
  bgColor: string;
  factors: ScoreFactor[];
}

interface ScoreFactor {
  name: string;
  impact: 'positive' | 'negative' | 'neutral';
  value: string;
  delta: number;
}

interface ScoreHistory {
  date: string;
  score: number;
}

interface LeadScoreBreakdown {
  leadId: string;
  businessName: string;
  overallScore: number;
  tier: 'cold' | 'warm' | 'hot' | 'premium';
  categories: ScoreCategory[];
  recommendations: string[];
  history: ScoreHistory[];
  lastAnalyzed: string;
  nextReviewDate: string;
}

// ── Category icon map (API can't serialize React components) ────────────
const CATEGORY_ICON_MAP: Record<string, React.ElementType> = {
  'Industry Fit': Target,
  'Revenue Potential': DollarSign,
  'Engagement': Mail,
  'Digital Presence': Globe,
  'Growth Signals': Rocket,
};

const CATEGORY_COLOR_MAP: Record<string, { color: string; bgColor: string }> = {
  'Industry Fit': { color: 'text-blue-500', bgColor: 'bg-blue-500/15' },
  'Revenue Potential': { color: 'text-emerald-500', bgColor: 'bg-emerald-500/15' },
  'Engagement': { color: 'text-purple-500', bgColor: 'bg-purple-500/15' },
  'Digital Presence': { color: 'text-cyan-500', bgColor: 'bg-cyan-500/15' },
  'Growth Signals': { color: 'text-amber-500', bgColor: 'bg-amber-500/15' },
};

// ── Empty breakdown ──────────────────────────────────────────────────────
const EMPTY_BREAKDOWN: LeadScoreBreakdown = {
  leadId: '',
  businessName: '',
  overallScore: 0,
  tier: 'cold',
  categories: [],
  recommendations: [],
  history: [],
  lastAnalyzed: '',
  nextReviewDate: '',
};

// ── Component ────────────────────────────────────────────────────
interface LeadScoringPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadName?: string;
  leadScore?: number;
}

export default function LeadScoringPanel({ open, onOpenChange, leadName = '', leadScore = 0 }: LeadScoringPanelProps) {
  const [breakdown, setBreakdown] = useState<LeadScoreBreakdown>(EMPTY_BREAKDOWN);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch lead scoring breakdown when dialog opens
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const controller = new AbortController();
    fetch(`/api/dashboard/lead-scoring?leadName=${encodeURIComponent(leadName)}`, { signal: controller.signal })
      .then(r => { if (!r.ok) throw new Error('Failed to load scoring data'); return r.json(); })
      .then(res => {
        if (cancelled) return;
        const d = res.data;
        if (d && !Array.isArray(d)) {
          // Single lead breakdown from API
          const mapped: LeadScoreBreakdown = {
            leadId: d.leadId || '',
            businessName: d.businessName || leadName,
            overallScore: d.overallScore || 0,
            tier: d.tier || 'cold',
            categories: (d.categories || []).map((c: Record<string, unknown>) => ({
              name: c.name || '',
              score: c.score || 0,
              weight: c.weight || 0,
              icon: CATEGORY_ICON_MAP[c.name as string] || Target,
              color: CATEGORY_COLOR_MAP[c.name as string]?.color || 'text-muted-foreground',
              bgColor: CATEGORY_COLOR_MAP[c.name as string]?.bgColor || 'bg-muted/15',
              factors: (c.factors || []).map((f: Record<string, unknown>) => ({
                name: f.name || '',
                impact: (f.impact as 'positive' | 'negative' | 'neutral') || 'neutral',
                value: String(f.value || ''),
                delta: (f.delta as number) || 0,
              })),
            })),
            recommendations: d.recommendations || [],
            history: (d.scores || []).map((s: Record<string, unknown>, i: number) => ({
              date: s.scoredAt ? new Date(s.scoredAt as string).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : `Week ${i + 1}`,
              score: (s.score as number) || 0,
            })).slice(-7),
            lastAnalyzed: d.lastAnalyzed ? new Date(d.lastAnalyzed as string).toLocaleString() : new Date().toLocaleString(),
            nextReviewDate: new Date(Date.now() + 7 * 86400000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          };
          setBreakdown(mapped);
        } else {
          // No specific lead data — show empty state with defaults
          setBreakdown({ ...EMPTY_BREAKDOWN, businessName: leadName });
        }
      })
      .catch(e => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; controller.abort(); };
  }, [open, leadName]);

  const tierConfig = {
    cold: { label: 'Cold', color: 'text-blue-500', bg: 'bg-blue-500/15', border: 'border-blue-500/30' },
    warm: { label: 'Warm', color: 'text-amber-500', bg: 'bg-amber-500/15', border: 'border-amber-500/30' },
    hot: { label: 'Hot', color: 'text-orange-500', bg: 'bg-orange-500/15', border: 'border-orange-500/30' },
    premium: { label: 'Premium', color: 'text-emerald-500', bg: 'bg-emerald-500/15', border: 'border-emerald-500/30' },
  };

  const tier = tierConfig[breakdown.tier];
  const scoreColor = breakdown.overallScore >= 70 ? 'text-emerald-500' : breakdown.overallScore >= 40 ? 'text-amber-500' : 'text-red-500';

  const sparkPoints = useMemo(() => {
    const data = breakdown.history;
    if (data.length < 2) return '';
    const w = 80, h = 28;
    const min = Math.min(...data.map(d => d.score));
    const max = Math.max(...data.map(d => d.score));
    const range = max - min || 1;
    return data.map((d, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = h - ((d.score - min) / range) * h;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
  }, [breakdown.history]);

  const ImpactIcon = ({ impact }: { impact: 'positive' | 'negative' | 'neutral' }) => {
    if (impact === 'positive') return <ArrowUpRight className="h-3 w-3 text-emerald-500" />;
    if (impact === 'negative') return <ArrowDownRight className="h-3 w-3 text-red-500" />;
    return <Minus className="h-3 w-3 text-muted-foreground" />;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-hidden flex flex-col gap-0 p-0">
        {loading ? (
          <div className="flex items-center justify-center py-16 px-6">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
            <Sparkles className="h-10 w-10 text-red-500/25 mb-3" />
            <p className="text-sm text-red-500 font-medium">{error}</p>
          </div>
        ) : breakdown.overallScore === 0 && breakdown.categories.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
            <Sparkles className="h-10 w-10 text-muted-foreground/25 mb-3" />
            <p className="text-sm font-medium text-muted-foreground">No scoring data available</p>
            <p className="text-xs text-muted-foreground/50 mt-1">Lead scoring will appear once analysis is complete.</p>
            <Button variant="ghost" size="sm" className="mt-4 text-xs" onClick={() => onOpenChange(false)}>Close</Button>
          </div>
        ) : (
          <>
          {/* Header */}
          <DialogHeader className="px-6 pt-6 pb-4 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-lg p-2 bg-primary/10">
                <Sparkles className="h-5 w-5 text-primary" />
              </div>
              <div>
                <DialogTitle className="text-base font-semibold">AI Lead Scoring</DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  {leadName} — Last analyzed: {breakdown.lastAnalyzed}
                </DialogDescription>
              </div>
            </div>
            <Badge variant="outline" className={cn('text-xs', tier.bg, tier.color, tier.border)}>
              {tier.label}
            </Badge>
          </div>

          {/* Overall Score */}
          <div className="flex items-center gap-4 mt-4 p-4 rounded-xl bg-muted/30 border border-border/50">
            <div className="text-center">
              <motion.p
                key={breakdown.overallScore}
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className={cn('text-3xl font-bold tabular-nums', scoreColor)}
              >
                {breakdown.overallScore}
              </motion.p>
              <p className="text-[10px] text-muted-foreground">Overall Score</p>
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
                <span>Score History</span>
                <span>Next review: {breakdown.nextReviewDate}</span>
              </div>
              <svg width="100%" height="28" viewBox="0 0 80 28" className="overflow-visible">
                <defs>
                  <linearGradient id="score-spark-grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="currentColor" stopOpacity="0.15" />
                    <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path d={sparkPoints} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className={scoreColor} />
                {sparkPoints && <path d={`${sparkPoints} L80,28 L0,28 Z`} fill="url(#score-spark-grad)" className={scoreColor} />}
              </svg>
            </div>
          </div>
        </DialogHeader>

        <Separator />

        {/* Content */}
        <ScrollArea className="flex-1 px-6">
          <div className="py-4 space-y-4">
            {/* Categories */}
            <Accordion type="multiple" defaultValue={['cat-0', 'cat-1']} className="space-y-2">
              {breakdown.categories.map((cat, i) => {
                const CatIcon = cat.icon;
                return (
                  <AccordionItem key={cat.name} value={`cat-${i}`} className="border rounded-lg px-3 glass-card-premium">
                    <AccordionTrigger className="py-3 hover:no-underline">
                      <div className="flex items-center gap-3 flex-1">
                        <div className={cn('rounded-md p-1.5', cat.bgColor)}>
                          <CatIcon className={cn('h-3.5 w-3.5', cat.color)} />
                        </div>
                        <div className="flex-1 text-left">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium">{cat.name}</span>
                            <span className={cn('text-xs font-bold tabular-nums', cat.color)}>{cat.score}</span>
                          </div>
                          <div className="mt-1.5">
                            <Progress value={cat.score} className="h-1.5" />
                          </div>
                        </div>
                        <Badge variant="outline" className="text-[9px] px-1 h-4 ml-2">
                          {cat.weight}%
                        </Badge>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="pb-2 pt-1 space-y-2">
                        {cat.factors.map((factor, j) => (
                          <motion.div
                            key={factor.name}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: j * 0.05 }}
                            className="flex items-center gap-2 text-xs py-1"
                          >
                            <ImpactIcon impact={factor.impact} />
                            <span className="flex-1 text-muted-foreground">{factor.name}</span>
                            <span className="font-medium">{factor.value}</span>
                            <Badge
                              variant="outline"
                              className={cn(
                                'text-[9px] px-1 h-4 tabular-nums',
                                factor.delta > 0 && 'badge-gradient-success border-emerald-200/50 dark:border-emerald-800/50',
                                factor.delta < 0 && 'badge-gradient-danger border-red-200/50 dark:border-red-800/50',
                                factor.delta === 0 && 'text-muted-foreground',
                              )}
                            >
                              {factor.delta > 0 ? '+' : ''}{factor.delta}
                            </Badge>
                          </motion.div>
                        ))}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>

            {/* Recommendations */}
            <div className="pt-2">
              <h4 className="text-xs font-semibold flex items-center gap-1.5 mb-3">
                <Lightbulb className="h-3.5 w-3.5 text-amber-500" />
                AI Recommendations
              </h4>
              <div className="space-y-2">
                {breakdown.recommendations.map((rec, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.1 }}
                    className="flex items-start gap-2 p-3 rounded-lg bg-primary/5 border border-primary/10"
                  >
                    <div className="w-1 h-1 rounded-full bg-primary mt-1.5 shrink-0" />
                    <p className="text-xs text-muted-foreground leading-relaxed">{rec}</p>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        </ScrollArea>

        {/* Footer */}
        <div className="px-6 py-3 border-t flex justify-between items-center shrink-0">
          <p className="text-[10px] text-muted-foreground">
            Scores update every 7 days automatically
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" className="text-xs" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            <Button size="sm" className="text-xs gap-1.5" onClick={() => {
              onOpenChange(false);
            }}>
              <BarChart3 className="h-3.5 w-3.5" />
              View Full Analysis
            </Button>
          </div>
        </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
