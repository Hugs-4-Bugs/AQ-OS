'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Sparkles,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Globe,
  Cpu,
  Lightbulb,
  TrendingUp,
  Target,
  RefreshCw,
  Coins,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

// ─── Types ────────────────────────────────────────────────

interface LeadAnalysisOutput {
  leadScore: number;
  opportunityScore: number;
  outreachStrategy: string;
  strengths: string[];
  weaknesses: string[];
  websiteAnalysis: {
    quality: string;
    issues: string[];
    recommendations: string[];
  };
  techAnalysis: {
    stack: string[];
    maturity: string;
    gaps: string[];
  };
  recommendations: string[];
  purchaseProbability: number;
  outreachPriority: string;
  estimatedDealSize: string;
  bestApproach: string;
  keyPainPoints: string[];
  aiProvider: string;
  analysisVersion: number;
}

interface AIAnalysisCardProps {
  leadId: string;
  leadName?: string;
  compact?: boolean;
}

// ─── Score Ring Component ─────────────────────────────────

function ScoreRing({ score, size = 80, strokeWidth = 6 }: { score: number; size?: number; strokeWidth?: number }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  const getColor = (s: number) => {
    if (s >= 75) return { stroke: '#10b981', text: 'text-emerald-500', bg: 'bg-emerald-500/10' };
    if (s >= 50) return { stroke: '#f59e0b', text: 'text-amber-500', bg: 'bg-amber-500/10' };
    if (s >= 25) return { stroke: '#f97316', text: 'text-orange-500', bg: 'bg-orange-500/10' };
    return { stroke: '#ef4444', text: 'text-red-500', bg: 'bg-red-500/10' };
  };

  const color = getColor(score);

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-muted/30"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color.stroke}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-1000 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={cn('text-lg font-bold font-mono', color.text)}>{score}</span>
        <span className="text-[8px] text-muted-foreground uppercase tracking-wide">Score</span>
      </div>
    </div>
  );
}

// ─── Skeleton Loader ──────────────────────────────────────

function AnalysisSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Skeleton className="h-20 w-20 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-3 w-16" />
        </div>
      </div>
      <div className="flex gap-2 flex-wrap">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-6 w-20 rounded-full" />
        ))}
      </div>
      <Skeleton className="h-24 w-full rounded-lg" />
      <Skeleton className="h-16 w-full rounded-lg" />
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────

export default function AIAnalysisCard({ leadId, leadName, compact }: AIAnalysisCardProps) {
  const queryClient = useQueryClient();
  const [websiteOpen, setWebsiteOpen] = useState(false);
  const [techOpen, setTechOpen] = useState(false);

  // Fetch existing analysis
  const { data: analysisData, isLoading: isLoadingAnalysis } = useQuery({
    queryKey: ['ai-analysis', leadId],
    queryFn: async () => {
      const res = await fetch(`/api/ai/analysis/${leadId}`);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error('Failed to fetch analysis');
      return res.json() as Promise<{
        success: boolean;
        hasAnalysis: boolean;
        analysis: LeadAnalysisOutput;
        scores: Array<{ type: string; score: number; explanation: string; scoredAt: string }>;
      }>;
    },
    enabled: !!leadId,
  });

  // Analyze mutation
  const analyzeMutation = useMutation({
    mutationFn: async (force = false) => {
      const res = await fetch('/api/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId, force }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Analysis failed');
      }
      return res.json() as Promise<{
        success: boolean;
        analysis: LeadAnalysisOutput;
        creditsDeducted: number;
        newBalance: number;
      }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['ai-analysis', leadId] });
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      toast.success('Lead analyzed successfully', {
        description: `${data.creditsDeducted} credits used · Balance: ${data.newBalance}`,
      });
    },
    onError: (error: Error) => {
      toast.error('Analysis failed', { description: error.message });
    },
  });

  const analysis = analysisData?.analysis;
  const isAnalyzing = analyzeMutation.isPending;

  const handleAnalyze = () => {
    analyzeMutation.mutate(!!analysis);
  };

  if (isLoadingAnalysis) {
    return (
      <Card className="border-primary/10">
        <CardContent className="p-4">
          <AnalysisSkeleton />
        </CardContent>
      </Card>
    );
  }

  if (!analysis) {
    return (
      <Card className="border-primary/10">
        <CardContent className="p-4">
          <div className="text-center py-6">
            <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
              <Sparkles className="h-7 w-7 text-primary" />
            </div>
            <h3 className="text-sm font-semibold mb-1">AI Analysis</h3>
            <p className="text-xs text-muted-foreground mb-4 max-w-[260px] mx-auto">
              Get AI-powered insights about this lead&apos;s potential, strengths, weaknesses, and best outreach approach.
            </p>
            <Button
              onClick={handleAnalyze}
              disabled={isAnalyzing}
              className="gap-2"
              size={compact ? 'sm' : 'default'}
            >
              {isAnalyzing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {isAnalyzing ? 'Analyzing...' : 'Analyze Lead'}
            </Button>
            <div className="flex items-center justify-center gap-1 mt-2">
              <Coins className="h-3 w-3 text-amber-500" />
              <span className="text-[10px] text-muted-foreground">Costs 5 credits</span>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-primary/10 overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            AI Analysis
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[9px] gap-1">
              <Coins className="h-2.5 w-2.5 text-amber-500" />
              v{analysis.analysisVersion}
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 text-xs"
              onClick={handleAnalyze}
              disabled={isAnalyzing}
            >
              {isAnalyzing ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="h-3 w-3" />
              )}
              Re-analyze
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Lead Score + Opportunity Score */}
        <div className="flex items-center gap-4">
          <ScoreRing score={analysis.leadScore} size={compact ? 64 : 80} strokeWidth={compact ? 5 : 6} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-muted-foreground">Opportunity Score</span>
              <span className={cn(
                'text-xs font-bold',
                analysis.opportunityScore >= 75 ? 'text-emerald-500' :
                analysis.opportunityScore >= 50 ? 'text-amber-500' : 'text-red-500'
              )}>
                {analysis.opportunityScore}%
              </span>
            </div>
            <Progress
              value={analysis.opportunityScore}
              className="h-2 mb-3"
            />
            <div className="grid grid-cols-2 gap-2">
              <div className="text-center p-1.5 rounded-md bg-muted/50">
                <p className="text-[10px] text-muted-foreground">Purchase Prob.</p>
                <p className="text-sm font-bold font-mono">{analysis.purchaseProbability}%</p>
              </div>
              <div className="text-center p-1.5 rounded-md bg-muted/50">
                <p className="text-[10px] text-muted-foreground">Priority</p>
                <Badge variant="outline" className={cn(
                  'text-[10px] capitalize',
                  analysis.outreachPriority === 'critical' ? 'border-red-500/30 text-red-500' :
                  analysis.outreachPriority === 'high' ? 'border-orange-500/30 text-orange-500' :
                  analysis.outreachPriority === 'medium' ? 'border-amber-500/30 text-amber-500' :
                  'border-slate-500/30 text-slate-500'
                )}>
                  {analysis.outreachPriority}
                </Badge>
              </div>
            </div>
          </div>
        </div>

        {/* Estimated Deal Size */}
        {analysis.estimatedDealSize && (
          <div className="flex items-center gap-2 p-2 rounded-lg bg-primary/5 border border-primary/10">
            <Target className="h-4 w-4 text-primary shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[10px] text-muted-foreground">Estimated Deal Size</p>
              <p className="text-sm font-semibold">{analysis.estimatedDealSize}</p>
            </div>
          </div>
        )}

        {/* Strengths & Weaknesses */}
        <div className="space-y-2">
          {analysis.strengths.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 mb-1.5 uppercase tracking-wide">
                Strengths
              </p>
              <div className="flex flex-wrap gap-1">
                {analysis.strengths.map((s, i) => (
                  <Badge key={i} className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 text-[10px] gap-1">
                    <CheckCircle2 className="h-2.5 w-2.5" />
                    {s}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          {analysis.weaknesses.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-red-600 dark:text-red-400 mb-1.5 uppercase tracking-wide">
                Weaknesses
              </p>
              <div className="flex flex-wrap gap-1">
                {analysis.weaknesses.map((w, i) => (
                  <Badge key={i} className="bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20 text-[10px] gap-1">
                    <XCircle className="h-2.5 w-2.5" />
                    {w}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Key Pain Points */}
        {analysis.keyPainPoints.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">Key Pain Points</p>
            <div className="space-y-1">
              {analysis.keyPainPoints.map((p, i) => (
                <div key={i} className="flex items-start gap-1.5 text-xs">
                  <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0 mt-0.5" />
                  <span>{p}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Best Approach */}
        {analysis.bestApproach && (
          <div className="p-2.5 rounded-lg bg-gradient-to-r from-primary/5 to-transparent border border-primary/10">
            <p className="text-[10px] font-semibold text-primary mb-1 uppercase tracking-wide">Best Approach</p>
            <p className="text-xs leading-relaxed">{analysis.bestApproach}</p>
          </div>
        )}

        {/* Website Analysis (Collapsible) */}
        <Collapsible open={websiteOpen} onOpenChange={setWebsiteOpen}>
          <CollapsibleTrigger className="flex items-center gap-2 w-full text-left hover:bg-muted/50 rounded-md p-1.5 transition-colors">
            <Globe className="h-3.5 w-3.5 text-primary shrink-0" />
            <span className="text-xs font-medium flex-1">Website Analysis</span>
            <Badge variant="outline" className="text-[9px]">{analysis.websiteAnalysis.quality}</Badge>
            {websiteOpen ? <ChevronUp className="h-3 w-3 text-muted-foreground" /> : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
          </CollapsibleTrigger>
          <CollapsibleContent className="pl-5 pt-2 space-y-2">
            {analysis.websiteAnalysis.issues.length > 0 && (
              <div>
                <p className="text-[10px] text-muted-foreground mb-1">Issues Found</p>
                {analysis.websiteAnalysis.issues.map((issue, i) => (
                  <div key={i} className="flex items-start gap-1.5 text-xs mb-1">
                    <XCircle className="h-3 w-3 text-red-400 shrink-0 mt-0.5" />
                    <span>{issue}</span>
                  </div>
                ))}
              </div>
            )}
            {analysis.websiteAnalysis.recommendations.length > 0 && (
              <div>
                <p className="text-[10px] text-muted-foreground mb-1">Recommendations</p>
                {analysis.websiteAnalysis.recommendations.map((rec, i) => (
                  <div key={i} className="flex items-start gap-1.5 text-xs mb-1">
                    <Lightbulb className="h-3 w-3 text-amber-400 shrink-0 mt-0.5" />
                    <span>{rec}</span>
                  </div>
                ))}
              </div>
            )}
          </CollapsibleContent>
        </Collapsible>

        {/* Tech Analysis (Collapsible) */}
        <Collapsible open={techOpen} onOpenChange={setTechOpen}>
          <CollapsibleTrigger className="flex items-center gap-2 w-full text-left hover:bg-muted/50 rounded-md p-1.5 transition-colors">
            <Cpu className="h-3.5 w-3.5 text-primary shrink-0" />
            <span className="text-xs font-medium flex-1">Tech Analysis</span>
            <Badge variant="outline" className="text-[9px] capitalize">{analysis.techAnalysis.maturity}</Badge>
            {techOpen ? <ChevronUp className="h-3 w-3 text-muted-foreground" /> : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
          </CollapsibleTrigger>
          <CollapsibleContent className="pl-5 pt-2 space-y-2">
            {analysis.techAnalysis.stack.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {analysis.techAnalysis.stack.map((tech, i) => (
                  <Badge key={i} variant="secondary" className="text-[9px]">{tech}</Badge>
                ))}
              </div>
            )}
            {analysis.techAnalysis.gaps.length > 0 && (
              <div>
                <p className="text-[10px] text-muted-foreground mb-1">Gaps</p>
                {analysis.techAnalysis.gaps.map((gap, i) => (
                  <div key={i} className="flex items-start gap-1.5 text-xs mb-1">
                    <AlertTriangle className="h-3 w-3 text-orange-400 shrink-0 mt-0.5" />
                    <span>{gap}</span>
                  </div>
                ))}
              </div>
            )}
          </CollapsibleContent>
        </Collapsible>

        <Separator />

        {/* Recommendations */}
        {analysis.recommendations.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold text-muted-foreground mb-2 uppercase tracking-wide flex items-center gap-1">
              <TrendingUp className="h-3 w-3" />
              Key Recommendations
            </p>
            <div className="space-y-1.5">
              {analysis.recommendations.slice(0, compact ? 3 : undefined).map((rec, i) => (
                <div key={i} className="flex items-start gap-2 text-xs p-1.5 rounded-md bg-muted/30">
                  <span className="text-primary font-bold shrink-0">{i + 1}.</span>
                  <span>{rec}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Credit cost indicator for re-analysis */}
        <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-1">
          <span>AI Provider: {analysis.aiProvider}</span>
          <span className="flex items-center gap-1">
            <Coins className="h-2.5 w-2.5 text-amber-500" />
            Re-analyze costs 5 credits
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
