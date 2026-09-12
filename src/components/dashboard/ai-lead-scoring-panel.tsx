"use client";

import React, { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Brain,
  TrendingUp,
  Target,
  Zap,
  BarChart3,
  AlertCircle,
  CheckCircle2,
  Star,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  RefreshCw,
  ChevronRight,
  Lightbulb,
  Shield,
  Gauge,
  Activity,
  Sparkles,
  Info,
  ThumbsUp,
  ThumbsDown,
  MessageSquare,
  Globe,
  Loader2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";

// ─── API Response Types ──────────────────────────────────────────

interface APIBreakdownItem {
  category: string;
  score: number;
  weight: number;
  weightedScore: number;
  details: string[];
}

interface APISuggestion {
  id: string;
  type: "action" | "warning" | "insight" | "opportunity";
  priority: "high" | "medium" | "low";
  title: string;
  description: string;
  impact: string;
  confidence: number;
  actionable: boolean;
}

interface APILeadScoreData {
  hasData: boolean;
  overallScore: number;
  tier: "cold" | "warm" | "hot" | "premium";
  trend: "up" | "down" | "stable";
  trendChange: number;
  lastAnalyzed: string;
  analysisVersion: string;
  breakdown: APIBreakdownItem[];
  suggestions: APISuggestion[];
  competitorContext: {
    avgScore: number;
    industryBenchmark: number;
    percentile: number;
  };
  scoreDistribution: {
    cold: number;
    warm: number;
    hot: number;
    premium: number;
  };
  topLeads: Array<{
    id: string;
    businessName: string;
    niche: string | null;
    compositeScore: number;
    stage: string;
  }>;
  totalLeads: number;
  leadsWithScores: number;
}

// ─── UI Types ────────────────────────────────────────────────────

interface ScoreBreakdown {
  category: string;
  score: number;
  weight: number;
  weightedScore: number;
  icon: React.ElementType;
  color: string;
  bgColor: string;
  details: string[];
}

interface AISuggestion {
  id: string;
  type: "action" | "warning" | "insight" | "opportunity";
  priority: "high" | "medium" | "low";
  title: string;
  description: string;
  impact: string;
  confidence: number;
  actionable: boolean;
}

interface LeadScoreData {
  overallScore: number;
  tier: "cold" | "warm" | "hot" | "premium";
  breakdown: ScoreBreakdown[];
  suggestions: AISuggestion[];
  lastAnalyzed: string;
  analysisVersion: string;
  trend: "up" | "down" | "stable";
  trendChange: number;
  competitorContext: {
    avgScore: number;
    industryBenchmark: number;
    percentile: number;
  };
  scoreDistribution: {
    cold: number;
    warm: number;
    hot: number;
    premium: number;
  };
  topLeads: APILeadScoreData["topLeads"];
  totalLeads: number;
  leadsWithScores: number;
}

// ─── Category Icon/Color Mapping ────────────────────────────────

const CATEGORY_STYLE_MAP: Record<
  string,
  { icon: React.ElementType; color: string; bgColor: string }
> = {
  "Reply Probability": {
    icon: MessageSquare,
    color: "text-green-400",
    bgColor: "bg-green-500/10",
  },
  "Conversion Potential": {
    icon: Target,
    color: "text-blue-400",
    bgColor: "bg-blue-500/10",
  },
  "Revenue Potential": {
    icon: TrendingUp,
    color: "text-purple-400",
    bgColor: "bg-purple-500/10",
  },
  "Urgency Signals": {
    icon: AlertCircle,
    color: "text-amber-400",
    bgColor: "bg-amber-500/10",
  },
  // Fallback for any category not explicitly mapped
  default: {
    icon: BarChart3,
    color: "text-cyan-400",
    bgColor: "bg-cyan-500/10",
  },
};

// ─── Fetch Function ─────────────────────────────────────────────

async function fetchAIScores(): Promise<APILeadScoreData> {
  const res = await fetch("/api/leads/ai-scores");
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Failed to fetch AI lead scores");
  }
  return res.json();
}

// ─── Map API Data to UI Data ────────────────────────────────────

function mapAPIToUIData(apiData: APILeadScoreData): LeadScoreData {
  const breakdown: ScoreBreakdown[] = apiData.breakdown.map((item) => {
    const style = CATEGORY_STYLE_MAP[item.category] || CATEGORY_STYLE_MAP.default;
    return {
      category: item.category,
      score: item.score,
      weight: item.weight,
      weightedScore: item.weightedScore,
      icon: style.icon,
      color: style.color,
      bgColor: style.bgColor,
      details: item.details,
    };
  });

  return {
    overallScore: apiData.overallScore,
    tier: apiData.tier,
    trend: apiData.trend,
    trendChange: apiData.trendChange,
    lastAnalyzed: apiData.lastAnalyzed,
    analysisVersion: apiData.analysisVersion,
    breakdown,
    suggestions: apiData.suggestions,
    competitorContext: apiData.competitorContext,
    scoreDistribution: apiData.scoreDistribution,
    topLeads: apiData.topLeads,
    totalLeads: apiData.totalLeads,
    leadsWithScores: apiData.leadsWithScores,
  };
}

// ─── Config Objects ─────────────────────────────────────────────

const TIER_CONFIG = {
  cold: {
    label: "Cold",
    color: "text-blue-400",
    bgColor: "bg-blue-500/10",
    borderColor: "border-blue-500/20",
    barColor: "from-blue-500 to-blue-400",
    gradient: "from-blue-600/20 to-blue-400/5",
  },
  warm: {
    label: "Warm",
    color: "text-amber-400",
    bgColor: "bg-amber-500/10",
    borderColor: "border-amber-500/20",
    barColor: "from-amber-500 to-orange-400",
    gradient: "from-amber-600/20 to-amber-400/5",
  },
  hot: {
    label: "Hot",
    color: "text-orange-400",
    bgColor: "bg-orange-500/10",
    borderColor: "border-orange-500/20",
    barColor: "from-orange-500 to-red-400",
    gradient: "from-orange-600/20 to-red-400/5",
  },
  premium: {
    label: "Premium",
    color: "text-purple-400",
    bgColor: "bg-purple-500/10",
    borderColor: "border-purple-500/20",
    barColor: "from-purple-500 to-pink-400",
    gradient: "from-purple-600/20 to-pink-400/5",
  },
};

const SUGGESTION_TYPE_CONFIG = {
  action: {
    icon: Zap,
    color: "text-green-400",
    bgColor: "bg-green-500/10",
    borderColor: "border-green-500/20",
  },
  warning: {
    icon: AlertCircle,
    color: "text-amber-400",
    bgColor: "bg-amber-500/10",
    borderColor: "border-amber-500/20",
  },
  insight: {
    icon: Lightbulb,
    color: "text-blue-400",
    bgColor: "bg-blue-500/10",
    borderColor: "border-blue-500/20",
  },
  opportunity: {
    icon: Star,
    color: "text-purple-400",
    bgColor: "bg-purple-500/10",
    borderColor: "border-purple-500/20",
  },
};

const PRIORITY_CONFIG = {
  high: { label: "High", color: "text-red-400", bgColor: "bg-red-500/10" },
  medium: {
    label: "Medium",
    color: "text-amber-400",
    bgColor: "bg-amber-500/10",
  },
  low: { label: "Low", color: "text-blue-400", bgColor: "bg-blue-500/10" },
};

// ─── Loading Skeleton ───────────────────────────────────────────

function AILeadScoringSkeleton() {
  return (
    <div className="space-y-5 p-1">
      {/* Score Hero Skeleton */}
      <Card className="bg-gradient-to-br from-muted/30 to-muted/10 border border-border/50 overflow-hidden">
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-5">
              <Skeleton className="h-[100px] w-[100px] rounded-full" />
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-5 w-16 rounded-full" />
                  <Skeleton className="h-4 w-12" />
                </div>
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-48" />
              </div>
            </div>
            <Skeleton className="h-9 w-28" />
          </div>
        </CardContent>
      </Card>

      {/* Context Bar Skeleton */}
      <div className="grid grid-cols-3 gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i} className="bg-muted/30 border-border/50">
            <CardContent className="p-3 text-center space-y-1">
              <Skeleton className="h-3 w-16 mx-auto" />
              <Skeleton className="h-7 w-10 mx-auto" />
              <Skeleton className="h-3 w-10 mx-auto" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Breakdown Skeleton */}
      <Card className="bg-muted/30 border-border/50">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Skeleton className="h-5 w-5" />
              <Skeleton className="h-5 w-32" />
            </div>
            <Skeleton className="h-5 w-28 rounded-full" />
          </div>
        </CardHeader>
        <CardContent className="space-y-1">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 p-3">
              <Skeleton className="h-8 w-8 rounded-lg shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="flex items-center justify-between">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-4 w-10" />
                </div>
                <Skeleton className="h-1.5 w-full rounded-full" />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Suggestions Skeleton */}
      <Card className="bg-muted/30 border-border/50">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Skeleton className="h-5 w-5" />
              <Skeleton className="h-5 w-36" />
              <Skeleton className="h-5 w-6 rounded-full" />
            </div>
            <Skeleton className="h-5 w-20 rounded-full" />
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="p-4 rounded-xl border border-border/30 space-y-2">
              <div className="flex items-center gap-2">
                <Skeleton className="h-8 w-8 rounded-lg" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-3/4" />
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Empty State ────────────────────────────────────────────────

function AILeadScoringEmpty() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="relative mb-4">
        <div className="h-20 w-20 rounded-2xl bg-orange-500/10 flex items-center justify-center">
          <Brain className="h-10 w-10 text-orange-500/50" />
        </div>
        <div className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full bg-orange-500/10 flex items-center justify-center">
          <Sparkles className="h-3 w-3 text-orange-500" />
        </div>
      </div>
      <h3 className="text-lg font-semibold mb-1">No AI Scores Yet</h3>
      <p className="text-sm text-muted-foreground max-w-sm">
        Start by discovering and analyzing leads. AI scores are generated
        automatically as you enrich your lead data with outreach and analysis.
      </p>
    </div>
  );
}

// ─── Error State ────────────────────────────────────────────────

function AILeadScoringError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="relative mb-4">
        <div className="h-20 w-20 rounded-2xl bg-red-500/10 flex items-center justify-center">
          <AlertCircle className="h-10 w-10 text-red-500/50" />
        </div>
      </div>
      <h3 className="text-lg font-semibold mb-1">Failed to Load AI Scores</h3>
      <p className="text-sm text-muted-foreground max-w-sm">
        Something went wrong while fetching your AI lead scoring data. Please
        try again.
      </p>
      <Button
        variant="outline"
        size="sm"
        className="mt-3 gap-2"
        onClick={onRetry}
      >
        <RefreshCw className="h-3.5 w-3.5" />
        Retry
      </Button>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────

export default function AILeadScoringPanel() {
  const queryClient = useQueryClient();
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set()
  );
  const [feedbackGiven, setFeedbackGiven] = useState<Record<string, "up" | "down">>({});

  const {
    data: apiData,
    isLoading,
    isError,
    refetch,
  } = useQuery<APILeadScoreData>({
    queryKey: ["ai-lead-scores"],
    queryFn: fetchAIScores,
    staleTime: 60 * 1000, // 1 minute
  });

  // Map API data to UI data
  const scoreData = useMemo(() => {
    if (!apiData) return null;
    return mapAPIToUIData(apiData);
  }, [apiData]);

  const tier = scoreData ? TIER_CONFIG[scoreData.tier] : TIER_CONFIG.cold;

  const totalWeightedScore = useMemo(
    () =>
      scoreData
        ? scoreData.breakdown.reduce((sum, b) => sum + b.weightedScore, 0)
        : 0,
    [scoreData]
  );

  const handleReanalyze = async () => {
    setIsAnalyzing(true);
    try {
      await refetch();
      toast.success("AI analysis refreshed!");
    } catch {
      toast.error("Failed to refresh analysis");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const toggleCategory = (category: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  const handleFeedback = (suggestionId: string, type: "up" | "down") => {
    setFeedbackGiven((prev) => ({ ...prev, [suggestionId]: type }));
    toast.success(
      type === "up"
        ? "Thanks! We'll prioritize similar suggestions."
        : "Thanks! We'll improve this recommendation."
    );
  };

  // ─── Loading State ──────────────────────────────────────────
  if (isLoading) {
    return <AILeadScoringSkeleton />;
  }

  // ─── Error State ────────────────────────────────────────────
  if (isError) {
    return (
      <TooltipProvider>
        <div className="p-1">
          <AILeadScoringError onRetry={() => refetch()} />
        </div>
      </TooltipProvider>
    );
  }

  // ─── Empty State ────────────────────────────────────────────
  if (!scoreData || !apiData?.hasData) {
    return (
      <TooltipProvider>
        <div className="p-1">
          <AILeadScoringEmpty />
        </div>
      </TooltipProvider>
    );
  }

  const TrendIcon =
    scoreData.trend === "up"
      ? ArrowUpRight
      : scoreData.trend === "down"
      ? ArrowDownRight
      : Minus;
  const trendColor =
    scoreData.trend === "up"
      ? "text-green-400"
      : scoreData.trend === "down"
      ? "text-red-400"
      : "text-muted-foreground";

  return (
    <TooltipProvider>
      <div className="space-y-5 p-1">
        {/* Score Hero Card */}
        <Card
          className={`bg-gradient-to-br ${tier.gradient} border ${tier.borderColor} overflow-hidden relative`}
        >
          <div className="absolute inset-0 bg-grid opacity-[0.03]" />
          <CardContent className="p-6 relative">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-5">
                {/* Circular Score */}
                <div className="relative">
                  <svg width="100" height="100" viewBox="0 0 100 100">
                    <circle
                      cx="50"
                      cy="50"
                      r="42"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="6"
                      className="text-muted/30"
                    />
                    <circle
                      cx="50"
                      cy="50"
                      r="42"
                      fill="none"
                      stroke="url(#scoreGradient)"
                      strokeWidth="6"
                      strokeLinecap="round"
                      strokeDasharray={`${(scoreData.overallScore / 100) * 264} 264`}
                      transform="rotate(-90 50 50)"
                      className="transition-all duration-1000 ease-out"
                    />
                    <defs>
                      <linearGradient
                        id="scoreGradient"
                        x1="0%"
                        y1="0%"
                        x2="100%"
                        y2="100%"
                      >
                        <stop offset="0%" stopColor="rgb(249,115,22)" />
                        <stop offset="100%" stopColor="rgb(239,68,68)" />
                      </linearGradient>
                    </defs>
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-3xl font-bold">{scoreData.overallScore}</span>
                    <span className="text-[10px] text-muted-foreground">/ 100</span>
                  </div>
                </div>

                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Badge
                      className={`${tier.bgColor} ${tier.color} ${tier.borderColor} border font-semibold`}
                    >
                      <Sparkles className="h-3 w-3 mr-1" />
                      {tier.label}
                    </Badge>
                    <div
                      className={`flex items-center gap-0.5 text-xs font-medium ${trendColor}`}
                    >
                      <TrendIcon className="h-3.5 w-3.5" />
                      <span>{Math.abs(scoreData.trendChange)}%</span>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    AI-powered analysis
                  </p>
                  <p className="text-xs text-muted-foreground/60 mt-0.5">
                    Analyzed {scoreData.lastAnalyzed} ({scoreData.analysisVersion})
                  </p>
                </div>
              </div>

              <Button
                onClick={handleReanalyze}
                disabled={isAnalyzing}
                variant="outline"
                size="sm"
                className={`gap-2 ${tier.borderColor} hover:${tier.bgColor}`}
              >
                <RefreshCw
                  className={`h-4 w-4 ${isAnalyzing ? "animate-spin" : ""}`}
                />
                {isAnalyzing ? "Analyzing..." : "Re-analyze"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Context Bar */}
        <div className="grid grid-cols-3 gap-3">
          <Card className="bg-muted/30 border-border/50">
            <CardContent className="p-3 text-center">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
                Your Score
              </p>
              <p className="text-xl font-bold text-green-400">
                {scoreData.overallScore}
              </p>
              <p className="text-[10px] text-muted-foreground">points</p>
            </CardContent>
          </Card>
          <Card className="bg-muted/30 border-border/50">
            <CardContent className="p-3 text-center">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
                Industry Avg
              </p>
              <p className="text-xl font-bold text-amber-400">
                {scoreData.competitorContext.industryBenchmark}
              </p>
              <p className="text-[10px] text-muted-foreground">points</p>
            </CardContent>
          </Card>
          <Card className="bg-muted/30 border-border/50">
            <CardContent className="p-3 text-center">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
                Percentile
              </p>
              <p className="text-xl font-bold text-purple-400">
                {scoreData.competitorContext.percentile}
                <span className="text-sm">th</span>
              </p>
              <p className="text-[10px] text-muted-foreground">
                top leads
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Score Breakdown */}
        <Card className="bg-muted/30 border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="h-4.5 w-4.5 text-blue-400" />
              Score Breakdown
              <Badge variant="outline" className="text-[10px] ml-auto">
                Weighted: {totalWeightedScore.toFixed(1)} / 100
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {scoreData.breakdown.map((item) => (
              <div key={item.category}>
                <button
                  onClick={() => toggleCategory(item.category)}
                  className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors text-left"
                >
                  <div
                    className={`h-8 w-8 rounded-lg ${item.bgColor} flex items-center justify-center flex-shrink-0`}
                  >
                    <item.icon className={`h-4 w-4 ${item.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium">
                        {item.category}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          {(item.weight * 100).toFixed(0)}%
                        </span>
                        <span className={`text-sm font-semibold ${item.color}`}>
                          {item.score}
                        </span>
                      </div>
                    </div>
                    <div className="h-1.5 bg-muted/50 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full bg-gradient-to-r ${tier.barColor} transition-all duration-1000 ease-out`}
                        style={{ width: `${item.score}%` }}
                      />
                    </div>
                  </div>
                  <ChevronRight
                    className={`h-4 w-4 text-muted-foreground transition-transform ${
                      expandedCategories.has(item.category) ? "rotate-90" : ""
                    }`}
                  />
                </button>

                {expandedCategories.has(item.category) && (
                  <div className="ml-11 mb-2 space-y-1.5">
                    {item.details.map((detail, idx) => (
                      <div
                        key={idx}
                        className="flex items-start gap-2 text-xs text-muted-foreground"
                      >
                        <CheckCircle2 className="h-3 w-3 mt-0.5 text-green-400/60 flex-shrink-0" />
                        <span>{detail}</span>
                      </div>
                    ))}
                  </div>
                )}
                <Separator className="bg-border/20" />
              </div>
            ))}
          </CardContent>
        </Card>

        {/* AI Suggestions */}
        <Card className="bg-muted/30 border-border/50">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Brain className="h-4.5 w-4.5 text-purple-400" />
                AI Recommendations
                <Badge className="bg-purple-500/10 text-purple-400 border-purple-500/20 text-[10px]">
                  <Sparkles className="h-3 w-3 mr-1" />
                  {scoreData.suggestions.length}
                </Badge>
              </CardTitle>
              <div className="flex items-center gap-2">
                <Badge
                  variant="outline"
                  className="text-[10px] text-green-400 border-green-500/20"
                >
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  {scoreData.suggestions.filter((s) => s.actionable).length}{" "}
                  actionable
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {scoreData.suggestions.length === 0 ? (
              <div className="text-center py-6">
                <Lightbulb className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  No AI recommendations yet. Scores will generate suggestions as
                  your lead data grows.
                </p>
              </div>
            ) : (
              scoreData.suggestions.map((suggestion, idx) => {
                const typeConfig =
                  SUGGESTION_TYPE_CONFIG[suggestion.type];
                const priorityConfig =
                  PRIORITY_CONFIG[suggestion.priority];
                const feedback = feedbackGiven[suggestion.id];

                return (
                  <div
                    key={suggestion.id}
                    className={`p-4 rounded-xl border transition-all duration-200 ${
                      typeConfig.borderColor
                    } hover:bg-muted/20 ${
                      suggestion.priority === "high"
                        ? "ring-1 ring-red-500/10"
                        : ""
                    }`}
                    style={{
                      animationDelay: `${idx * 80}ms`,
                    }}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`h-8 w-8 rounded-lg ${typeConfig.bgColor} flex items-center justify-center flex-shrink-0 mt-0.5`}
                      >
                        <typeConfig.icon
                          className={`h-4 w-4 ${typeConfig.color}`}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="text-sm font-semibold">
                            {suggestion.title}
                          </span>
                          <Badge
                            className={`${priorityConfig.bgColor} ${priorityConfig.color} text-[9px] px-1.5 py-0 border-0`}
                          >
                            {priorityConfig.label}
                          </Badge>
                          {suggestion.confidence >= 90 && (
                            <Tooltip>
                              <TooltipTrigger>
                                <Badge className="bg-green-500/10 text-green-400 text-[9px] px-1.5 py-0 border-0 gap-0.5">
                                  <Shield className="h-2.5 w-2.5" />
                                  High confidence
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>
                                  AI is {suggestion.confidence}% confident in
                                  this recommendation
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          {suggestion.description}
                        </p>
                        <div className="flex items-center gap-3 mt-2">
                          <span
                            className={`text-[10px] font-medium ${typeConfig.color}`}
                          >
                            {suggestion.impact}
                          </span>
                          <span className="text-[10px] text-muted-foreground/50">
                            Confidence: {suggestion.confidence}%
                          </span>
                          {suggestion.actionable && !feedback && (
                            <div className="flex items-center gap-1 ml-auto">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  handleFeedback(suggestion.id, "up")
                                }
                                className="h-6 w-6 p-0 text-muted-foreground hover:text-green-400"
                              >
                                <ThumbsUp className="h-3 w-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  handleFeedback(suggestion.id, "down")
                                }
                                className="h-6 w-6 p-0 text-muted-foreground hover:text-red-400"
                              >
                                <ThumbsDown className="h-3 w-3" />
                              </Button>
                            </div>
                          )}
                          {feedback && (
                            <span className="text-[10px] text-green-400 ml-auto flex items-center gap-1">
                              <CheckCircle2 className="h-3 w-3" />
                              Feedback recorded
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        {/* Model Info Footer */}
        <div className="flex items-center justify-between text-[10px] text-muted-foreground/50 px-1">
          <div className="flex items-center gap-1.5">
            <Info className="h-3 w-3" />
            <span>
              Powered by AcquisitionOS AI Engine {scoreData.analysisVersion}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <Activity className="h-3 w-3" />
              {scoreData.breakdown.length} factors analyzed
            </span>
            <span className="flex items-center gap-1">
              <Gauge className="h-3 w-3" />
              Last: {scoreData.lastAnalyzed}
            </span>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
