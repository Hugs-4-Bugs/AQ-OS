'use client';

import React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Sparkles,
  Loader2,
  Coins,
  TrendingUp,
  Target,
  Globe,
  Cpu,
  Shield,
  BarChart3,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

// ─── Types ────────────────────────────────────────────────

interface LeadScores {
  leadQualityScore: number;
  purchaseProbability: number;
  outreachPriority: 'low' | 'medium' | 'high' | 'critical';
  websiteQualityScore: number;
  digitalMaturityScore: number;
  aiConfidenceScore: number;
  explanations?: {
    leadQuality: string;
    purchaseProbability: string;
    outreachPriority: string;
    websiteQuality: string;
    digitalMaturity: string;
  };
  scoringFactors?: {
    positive: string[];
    negative: string[];
    neutral: string[];
  };
}

interface AIScoreCardProps {
  leadId: string;
  scores?: LeadScores | null;
  compact?: boolean;
  onScored?: (scores: LeadScores) => void;
}

// ─── Mini Score Ring ──────────────────────────────────────

function MiniScoreRing({ score, size = 36, strokeWidth = 3 }: { score: number; size?: number; strokeWidth?: number }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  const getColor = (s: number) => {
    if (s >= 75) return '#10b981';
    if (s >= 50) return '#f59e0b';
    if (s >= 25) return '#f97316';
    return '#ef4444';
  };

  return (
    <div className="relative inline-flex items-center justify-center shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="currentColor" strokeWidth={strokeWidth} className="text-muted/30" />
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={getColor(score)} strokeWidth={strokeWidth} strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" className="transition-all duration-700 ease-out" />
      </svg>
      <span className="absolute text-[10px] font-bold font-mono" style={{ color: getColor(score) }}>
        {score}
      </span>
    </div>
  );
}

// ─── Score Dimension Row ──────────────────────────────────

function ScoreDimension({ icon: Icon, label, score, color, explanation }: {
  icon: React.ElementType;
  label: string;
  score: number;
  color: string;
  explanation?: string;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <div className={cn('rounded-md p-1.5 shrink-0', `bg-${color}-500/10`)}>
        <Icon className={cn('h-3 w-3', `text-${color}-500`)} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-0.5">
          <span className="text-[10px] font-medium text-muted-foreground">{label}</span>
          <span className="text-[10px] font-bold font-mono">{score}</span>
        </div>
        <Progress value={score} className="h-1" />
        {explanation && (
          <p className="text-[9px] text-muted-foreground mt-0.5 line-clamp-1">{explanation}</p>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────

export default function AIScoreCard({ leadId, scores, compact, onScored }: AIScoreCardProps) {
  const queryClient = useQueryClient();

  const scoreMutation = useMutation({
    mutationFn: async (force = false) => {
      const res = await fetch('/api/ai/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId, force }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Scoring failed');
      }
      return res.json() as Promise<{
        success: boolean;
        scores: LeadScores;
        creditsDeducted: number;
        newBalance: number;
      }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['ai-analysis', leadId] });
      toast.success('Lead scored successfully', {
        description: `${data.creditsDeducted} credits used · Balance: ${data.newBalance}`,
      });
      onScored?.(data.scores);
    },
    onError: (error: Error) => {
      toast.error('Scoring failed', { description: error.message });
    },
  });

  const isScoring = scoreMutation.isPending;

  // No scores yet — show trigger button
  if (!scores) {
    return (
      <Card className="border-primary/10">
        <CardContent className="p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                <BarChart3 className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-xs font-medium">AI Score</p>
                <p className="text-[10px] text-muted-foreground">5-dimension scoring</p>
              </div>
            </div>
            <Button
              size="sm"
              className="gap-1.5 h-7 text-[10px]"
              onClick={() => scoreMutation.mutate(false)}
              disabled={isScoring}
            >
              {isScoring ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Sparkles className="h-3 w-3" />
              )}
              Score Lead
            </Button>
          </div>
          <div className="flex items-center gap-1 mt-1.5">
            <Coins className="h-2.5 w-2.5 text-amber-500" />
            <span className="text-[9px] text-muted-foreground">Costs 3 credits</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Compact view for inline display
  if (compact) {
    return (
      <div className="flex items-center gap-3">
        <MiniScoreRing score={scores.leadQualityScore} />
        <div className="flex-1 grid grid-cols-5 gap-1">
          {[
            { score: scores.leadQualityScore, color: 'emerald' },
            { score: scores.purchaseProbability, color: 'amber' },
            { score: scores.websiteQualityScore, color: 'cyan' },
            { score: scores.digitalMaturityScore, color: 'violet' },
            { score: scores.aiConfidenceScore, color: 'primary' },
          ].map((item, i) => (
            <div key={i} className="text-center">
              <div className="h-1 w-full rounded-full bg-muted overflow-hidden mb-0.5">
                <div
                  className={cn(
                    'h-full rounded-full transition-all duration-700',
                    item.score >= 75 ? 'bg-emerald-500' :
                    item.score >= 50 ? 'bg-amber-500' :
                    item.score >= 25 ? 'bg-orange-500' : 'bg-red-500'
                  )}
                  style={{ width: `${item.score}%` }}
                />
              </div>
              <span className="text-[8px] font-mono text-muted-foreground">{item.score}</span>
            </div>
          ))}
        </div>
        <Badge variant="outline" className={cn(
          'text-[9px] capitalize shrink-0',
          scores.outreachPriority === 'critical' ? 'border-red-500/30 text-red-500' :
          scores.outreachPriority === 'high' ? 'border-orange-500/30 text-orange-500' :
          scores.outreachPriority === 'medium' ? 'border-amber-500/30 text-amber-500' :
          'border-slate-500/30 text-slate-500'
        )}>
          {scores.outreachPriority}
        </Badge>
      </div>
    );
  }

  // Full view
  return (
    <Card className="border-primary/10">
      <CardContent className="p-4 space-y-3">
        {/* Header with overall score */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <MiniScoreRing score={scores.leadQualityScore} size={44} strokeWidth={4} />
            <div>
              <p className="text-sm font-semibold">AI Score</p>
              <p className="text-[10px] text-muted-foreground">Multi-dimensional analysis</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 text-[10px]"
            onClick={() => scoreMutation.mutate(true)}
            disabled={isScoring}
          >
            {isScoring ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
            Re-score
          </Button>
        </div>

        {/* Score Dimensions */}
        <div className="space-y-2.5">
          <ScoreDimension
            icon={Shield}
            label="Lead Quality"
            score={scores.leadQualityScore}
            color="emerald"
            explanation={scores.explanations?.leadQuality}
          />
          <ScoreDimension
            icon={Target}
            label="Purchase Probability"
            score={scores.purchaseProbability}
            color="amber"
            explanation={scores.explanations?.purchaseProbability}
          />
          <ScoreDimension
            icon={TrendingUp}
            label="Outreach Priority"
            score={scores.outreachPriority === 'critical' ? 95 : scores.outreachPriority === 'high' ? 75 : scores.outreachPriority === 'medium' ? 50 : 25}
            color="orange"
            explanation={scores.explanations?.outreachPriority}
          />
          <ScoreDimension
            icon={Globe}
            label="Website Quality"
            score={scores.websiteQualityScore}
            color="cyan"
            explanation={scores.explanations?.websiteQuality}
          />
          <ScoreDimension
            icon={Cpu}
            label="Digital Maturity"
            score={scores.digitalMaturityScore}
            color="violet"
            explanation={scores.explanations?.digitalMaturity}
          />
        </div>

        {/* AI Confidence */}
        <div className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
          <span className="text-[10px] text-muted-foreground">AI Confidence</span>
          <div className="flex items-center gap-1.5">
            <Progress value={scores.aiConfidenceScore} className="h-1.5 w-16" />
            <span className="text-[10px] font-bold font-mono">{scores.aiConfidenceScore}%</span>
          </div>
        </div>

        {/* Scoring Factors */}
        {scores.scoringFactors && (scores.scoringFactors.positive.length > 0 || scores.scoringFactors.negative.length > 0) && (
          <div className="space-y-1.5">
            {scores.scoringFactors.positive.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {scores.scoringFactors.positive.slice(0, 3).map((f, i) => (
                  <Badge key={i} className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 text-[9px]">
                    +{f}
                  </Badge>
                ))}
              </div>
            )}
            {scores.scoringFactors.negative.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {scores.scoringFactors.negative.slice(0, 3).map((f, i) => (
                  <Badge key={i} className="bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20 text-[9px]">
                    -{f}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Credit cost */}
        <div className="flex items-center justify-between text-[9px] text-muted-foreground pt-1">
          <span></span>
          <span className="flex items-center gap-1">
            <Coins className="h-2.5 w-2.5 text-amber-500" />
            Re-score costs 3 credits
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
